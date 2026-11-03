// @arkesoft/api — WORKER süreci giriş noktası (ROADMAP v0.0.11, T-013/S6,
// architect K1.b + K1.e)
//
// ⚠⚠ DOSYA ADI SABİT: `apps/api/package.json`'ın `dev:worker`/`start:worker`
// script'leri `dist/main.worker.js`'i hedefliyor ve `manifest.test.ts` (S1)
// bunu ASSERT ediyor (`rootDir: src` → `outDir: dist`). Dosyayı yeniden
// adlandırmak o testi kırar.
//
// ⚠ HTTP PORTU AÇILMAZ (K1.e): `NestFactory.createApplicationContext()`
// kullanılır, `create()` + `listen()` KULLANILMAZ. Üç gerekçe: iki süreç aynı
// `API_PORT`'u bağlayamaz · en küçük yüzey = en az handle (AC9) · guard/
// middleware zinciri worker'da anlamsız.
// ⚠ LİTERAL-JETON KURALI (AGENT_BASELINE §5 — bu turda DÖRDÜNCÜ kez
// tetiklendi, ÖLÇÜLDÜ): bu dosyada "HTTP uygulaması kuran fabrika çağrısı"
// yasağını denetleyen grep, denetim komutunun METNİNİ buraya bitişik yazdığım
// ilk yazımda KENDİ YORUMUMU buldu (1 eşleşme → kalıcı yanlış pozitif).
// Komut bu yüzden Türkçe tarif ediliyor: "NestFactory'nin uygulama (bağlam
// DEĞİL) kuran fabrikası" bu dosyada hiç geçmez; geçen tek çağrı
// `createApplicationContext`'tir ve o ad grep'in sözcük sınırı koşulunu
// karşılamaz.
//
// ⚠ `enableShutdownHooks()` KULLANILMAZ (K1.b, bağlayıcı): kapanış SIRASI
// ELLE kurulur, çünkü `worker.close()` `app.close()`'tan ÖNCE ve AÇIKÇA
// koşmak zorunda — devam eden handler DB'ye yazıyor olabilir ve Prisma'nın
// `$disconnect()`'inin ondan sonra koşmasını Nest'in `@Global()` yıkım
// SIRASINA bırakmıyoruz (A-A2 ölçülemedi → tasarım sıradan BAĞIMSIZ olmak
// zorunda).
//
// KAPANIŞ ZİNCİRİ:
//   1. watchdog = setTimeout(exit 1, WORKER_SHUTDOWN_WATCHDOG_MS).unref()
//   2. her worker: withTimeout(worker.close(), WORKER_CLOSE_TIMEOUT_MS)
//        → bütçe dolarsa worker.close(true) (ZORLA; devam eden iş bırakılır,
//          K1.c gereği `failed` YAZILMAZ — başarısız olduğunu BİLMİYORUZ)
//   3. await app.close()  → QueueLifecycleService (Queue + DLQ + `'queue'`
//      bağlantısı) ve PrismaService (`$disconnect`) kancaları
//
// ⚠ HAZIR-OLMA SİNYALİ NDJSON STDOUT (K1.d): worker port açmadığı için AC9
// testi (T-013/S7) HTTP ile bekleyemez; fixture `child.stdout`'u satır satır
// ayrıştırıp `WORKER_READY_LOG_EVENT` sabitini taşıyan `msg`'i bekler. Sabit
// `queue/queue-log-events.ts`'te TEK KAYNAK ve her iki taraf onu IMPORT eder
// → metin değişirse test SESSİZCE beklemeye düşmez.
//
// `import 'reflect-metadata'` İLK satır OLMAK ZORUNDA (`main.ts` ile aynı
// gerekçe: Nest'in legacy dekoratör metadata'sı bu yan etkiye dayanır).

import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'
import type { INestApplicationContext } from '@nestjs/common'
import type { Logger } from 'pino'

import { withTimeout } from './health/with-timeout.js'
import { ArkesoftNestLogger } from './logging/arkesoft-nest-logger.js'
import { ROOT_LOGGER } from './logging/logging.tokens.js'
import { createRootLogger } from './logging/root-logger.js'
import {
  QUEUE_WORKERS,
  WORKER_CLOSE_TIMEOUT_MS,
  WORKER_SHUTDOWN_WATCHDOG_MS,
} from './queue/queue-worker.module.js'
import type { JobWorker } from './queue/queue-worker.module.js'
import {
  WORKER_FORCE_CLOSED_LOG_EVENT,
  WORKER_READY_LOG_EVENT,
  WORKER_SHUTDOWN_COMPLETED_LOG_EVENT,
  WORKER_SHUTDOWN_STARTED_LOG_EVENT,
} from './queue/queue-log-events.js'
import { WorkerModule } from './worker.module.js'

// Nest henüz ayağa kalkmamışken veya çökmüşken kullanılacak asgari logger
// (`main.ts` ile BİREBİR aynı desen). CLAUDE.md §4'ün küresel konsol nesnesi
// yasağı bu süreç kapanış yolunda da geçerli — pino her zaman kullanılır.
const crashLogger = createRootLogger({ level: 'error' })

function toLoggableError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}

/**
 * Kapanışın YALNIZCA BİR KEZ koşmasını sağlar: SIGTERM'in ardından SIGINT
 * gelirse (veya aynı sinyal iki kez) ikinci zincir `worker.close()`'u yarıda
 * kalmış bir kapanışın üstüne çağırırdı.
 */
let shutdownPromise: Promise<void> | undefined

async function closeWorker(worker: JobWorker, logger: Logger): Promise<void> {
  try {
    await withTimeout(worker.close(), WORKER_CLOSE_TIMEOUT_MS)
  } catch (error: unknown) {
    // Hata YUTULMAZ: loglanır ve SERT yol uygulanır (`redis.service.ts`'in
    // aynı durumdaki `warn` deseni). Zorla kapanış da başarısız olabilir —
    // o zaman watchdog son çare olarak süreci bitirir.
    logger.warn(
      { queueName: worker.name, error: toLoggableError(error) },
      WORKER_FORCE_CLOSED_LOG_EVENT,
    )

    await worker.close(true)
  }
}

async function shutdown(
  app: INestApplicationContext,
  workers: readonly JobWorker[],
  logger: Logger,
  signal: string,
): Promise<void> {
  // ADIM 1 — watchdog. `.unref()` ile normal kapanışı ASLA geciktirmez
  // (event loop'u canlı tutmaz); SADECE kapanış asılı kalırsa tetiklenir.
  // `WORKER_CLOSE_TIMEOUT_MS < WORKER_SHUTDOWN_WATCHDOG_MS` olduğu için
  // normal yolda hiç çalışmaz.
  const watchdog = setTimeout(() => {
    crashLogger.error(
      { signal },
      'Worker kapanışı zaman aşımına uğradı, süreç zorla sonlandırılıyor',
    )
    process.exit(1)
  }, WORKER_SHUTDOWN_WATCHDOG_MS)
  watchdog.unref()

  const startedAt = Date.now()
  logger.info({ signal, workerCount: workers.length }, WORKER_SHUTDOWN_STARTED_LOG_EVENT)

  // ADIM 2 — `worker.close()` AÇIKÇA ve `app.close()`'tan ÖNCE.
  for (const worker of workers) {
    await closeWorker(worker, logger)
  }

  // ADIM 3 — Nest yıkım kancaları: `QueueLifecycleService` (Queue + DLQ +
  // `'queue'` bağlantısı) ve `PrismaService.$disconnect()`.
  await app.close()

  logger.info({ signal, durationMs: Date.now() - startedAt }, WORKER_SHUTDOWN_COMPLETED_LOG_EVENT)
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true })

  app.useLogger(app.get(ArkesoftNestLogger))

  const logger = app.get<Logger>(ROOT_LOGGER)
  const workers = app.get<readonly JobWorker[]>(QUEUE_WORKERS)

  // Bloke eden fetch bağlantısı kurulmadan "hazır" demek, AC9 testinin
  // SIGTERM'i bağlantılar açılmadan göndermesine yol açardı (ölçüm yanlış
  // yeşile düşerdi).
  await Promise.all(workers.map((worker) => worker.waitUntilReady()))

  const registerShutdownSignal = (signal: 'SIGTERM' | 'SIGINT'): void => {
    process.on(signal, () => {
      shutdownPromise ??= shutdown(app, workers, logger, signal)
      void shutdownPromise
    })
  }

  registerShutdownSignal('SIGTERM')
  registerShutdownSignal('SIGINT')

  // ⚠ TEST SÖZLEŞMESİ (K1.d): bu satır AC9 fixture'ının beklediği sinyaldir.
  // Gövdede kiracı alanı YOKTUR — süreç seviyesi bir olaydır, bir kiracıya
  // ait değildir (`QUEUE_CLOSED_LOG_EVENT` emsali, S5).
  logger.info(
    {
      queueNames: workers.map((worker) => worker.name),
      concurrency: workers.map((worker) => worker.opts.concurrency),
      pid: process.pid,
    },
    WORKER_READY_LOG_EVENT,
  )
}

// Beklenmeyen hatalar sessizce kaybolmaz (CLAUDE.md §4/§10): süreç loglayıp
// çöker; orkestrasyon/süpervizör katmanı yeniden başlatır (`main.ts` ile
// BİREBİR aynı desen).
process.on('unhandledRejection', (reason: unknown) => {
  crashLogger.error({ error: toLoggableError(reason) }, 'unhandledRejection — süreç kapanıyor')
  process.exit(1)
})

process.on('uncaughtException', (error: unknown) => {
  crashLogger.error({ error: toLoggableError(error) }, 'uncaughtException — süreç kapanıyor')
  process.exit(1)
})

void bootstrap()
