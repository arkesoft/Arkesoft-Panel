// @arkesoft/api — AC11 kapanış testi için çocuk süreç yardımcıları (ROADMAP
// v0.0.4, T-002/ST-7, architect K-A3/K-A8, R-P5)
//
// AC11'in DETERMİNİSTİK ölçümü (K-A8): `?application_name=arkesoft-api-ac11`
// EKLİ bir `DATABASE_URL` ile GERÇEK bir Nest süreci (derlenmiş `dist/main.js`)
// AYRI bir OS sürecinde başlatılır; `shutdown.test.ts` DB'ye giden en az bir
// istek atıp SIGTERM gönderir, exit kodunu VE `pg_stat_activity`'deki satır
// sayısını doğrular.
//
// NEDEN `dist/main.js` (DERLENMİŞ JS), KAYNAK `.ts` DEĞİL: NestJS'in legacy
// dekoratörleri (`experimentalDecorators`) ÇALIŞMA ZAMANI DÖNÜŞÜMÜ gerektirir
// (`__decorate` yardımcı çağrıları). Bu dönüşümü yalnızca `tsc` (derleme) ve
// vitest'in esbuild'i (in-process testler, `createTestApp`) yapar. Node'un
// YERLEŞİK TypeScript tip-soyma modu SADECE tip ANNOTASYONLARINI SİLER,
// dekoratör SÖZDİZİMİNİ DÖNÜŞTÜRMEZ; `tsx`/`ts-node` KULLANILAMAZ (CLAUDE.md
// yasakları + T-001 precedenti). AYRI bir OS süreci için TEK güvenilir yol
// budur — bu yüzden {@link buildApiForShutdownTest} çocuk süreci başlatmadan
// ÖNCE `dist`'i `tsc -p tsconfig.build.json` ile TAZELER (AC12'nin beşli
// kapısında `test`/`build` sırası garanti değildir — bu test KENDİ tazeliğini
// garanti eder).
//
// (ampirik olarak doğrulandı: build + spawn + SIGTERM → `exit 0`,
// `pg_stat_activity` satırı 1→0; bkz. ST-7 üretim log notları.)

import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import { WORKER_READY_LOG_EVENT } from '../../queue/queue-log-events.js'

/** `pg_stat_activity`'de aranacak, bu teste ÖZEL bağlantı adı (K-A8). */
export const SHUTDOWN_CHILD_APPLICATION_NAME = 'arkesoft-api-ac11'

/**
 * Diğer testlerin portuyla ÇAKIŞMAYAN, bu teste özel sabit port. (Diğer
 * testler `supertest` ile doğrudan `http.Server`'a bağlanır, GERÇEKTEN
 * `listen()` ÇAĞIRMAZ — bu test ise GERÇEK bir OS sürecini GERÇEK bir porta
 * bağlar.)
 */
export const SHUTDOWN_CHILD_PORT = 39_111

const API_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const MAIN_JS_PATH = fileURLToPath(new URL('../../../dist/main.js', import.meta.url))

/** `databaseUrl`'e `application_name` sorgu parametresini EKLER/DEĞİŞTİRİR. */
export function withApplicationName(databaseUrl: string, applicationName: string): string {
  const url = new URL(databaseUrl)
  url.searchParams.set('application_name', applicationName)
  return url.toString()
}

/**
 * `dist/main.js`'i TAZELER. Senkron çalışır (test `beforeAll`'u bunu
 * BEKLEMELİ) — derleme birkaç saniye sürebilir, bu KASITLI: testin kendi
 * tazeliğini garanti etmesi, önceden koşmuş `pnpm build`'e güvenmekten daha
 * değerlidir (AC12'nin beşli kapısında sıra garanti değildir).
 */
export function buildApiForShutdownTest(): void {
  execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], {
    cwd: API_ROOT,
    stdio: 'pipe',
  })
}

export type ShutdownChildHandle = {
  readonly child: ChildProcessWithoutNullStreams
  readonly exited: Promise<{
    readonly code: number | null
    readonly signal: NodeJS.Signals | null
  }>
}

/**
 * `dist/main.js`'i AYRI bir OS sürecinde başlatır. `DATABASE_URL`
 * {@link SHUTDOWN_CHILD_APPLICATION_NAME} ile işaretlenir; `API_PORT`
 * {@link SHUTDOWN_CHILD_PORT}'a sabitlenir. Diğer TÜM ortam değişkenleri
 * ÇAĞIRAN SÜREÇTEN (vitest'in `process.env`'i, `vitest.config.ts`'in
 * `loadEnvFile`'ı ile doldurduğu) devralınır.
 */
export function startShutdownChild(): ShutdownChildHandle {
  const baseDatabaseUrl = process.env['DATABASE_URL']

  if (baseDatabaseUrl === undefined) {
    throw new Error(
      "startShutdownChild: process.env.DATABASE_URL tanımlı değil (vitest.config.ts kök .env'i yüklemeli).",
    )
  }

  const child = spawn('node', [MAIN_JS_PATH], {
    cwd: API_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: withApplicationName(baseDatabaseUrl, SHUTDOWN_CHILD_APPLICATION_NAME),
      API_PORT: String(SHUTDOWN_CHILD_PORT),
    },
    stdio: 'pipe',
  })

  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal })
    })
  })

  return { child, exited }
}

// ---------------------------------------------------------------------------
// T-013/S7 EKLEMESİ — AC9'un WORKER çocuk süreci (ROADMAP v0.0.11, architect
// K1.d). ⚠ YALNIZCA EKLEME: yukarıdaki iki sabit ve üç fonksiyon
// (`withApplicationName`, `buildApiForShutdownTest`, `startShutdownChild`)
// TEK SATIR DEĞİŞMEDİ — v0.0.4'ün AC11'i (`shutdown.test.ts`) onlara bağlı ve
// o dosya bu alt görevde DEĞİŞTİRİLEMEZ.
//
// İKİ SPAWNER'IN YAN YANA SÖZLEŞMESİ:
//
//   | Ne                | API tarafı (AC11)              | Worker tarafı (AC9)                |
//   | ----------------- | ------------------------------ | ---------------------------------- |
//   | giriş noktası     | `dist/main.js`                 | `dist/main.worker.js`              |
//   | application_name  | `arkesoft-api-ac11`            | `arkesoft-worker-ac9` (ÇAKIŞMAZ)   |
//   | HTTP portu        | `API_PORT` override edilir     | YOK — worker `listen()` ÇAĞIRMAZ   |
//   | hazır-olma        | `GET /health` + `/health/ready`| stdout NDJSON log satırı           |
//   | PAYLAŞILAN        | `withApplicationName` · `buildApiForShutdownTest` · `ShutdownChildHandle`/`exited` deseni · `tsc -p tsconfig.build.json` ile `dist` tazeleme |
//
// ⚠ NEDEN HAZIR-OLMA HTTP DEĞİL (K1.e): worker `createApplicationContext()`
// kullanır, HTTP portu AÇMAZ → `waitUntilReady()` (HTTP poll) bu süreçte
// YAPISAL OLARAK kullanılamaz. Hazır sinyali `main.worker.ts`'in stdout'a
// yazdığı NDJSON log satırıdır; beklenen `msg` değeri `WORKER_READY_LOG_EVENT`
// sabitinden IMPORT EDİLİR — metin bu dosyaya SATIR İÇİ YAZILMAZ. Gerekçe
// ölçülmüş kusur sınıfı: iki yerde literal yazılırsa biri değişince diğeri
// SESSİZCE sonsuz beklemeye düşer (zaman aşımı → "flaky test" teşhisi, gerçek
// sebep görünmez).
//
// ⚠ `LOG_LEVEL` ÇOCUK SÜREÇTE SABİTLENİR — yeni bir ortam değişkeni
// EKLENMİYOR, MEVCUT olanı bu ölçüm için determinize ediyoruz (K-A8'in "env
// yüzeyi büyümesin" kısıtı korunur; `.env.example`/`packages/config`
// DEĞİŞMEDİ). Gerekçe: hazır-olma ve kapanış kayıtları `info` seviyesindedir;
// operatörün `.env`'inde `LOG_LEVEL=warn` yazıyorsa satır HİÇ ÜRETİLMEZ ve
// test zaman aşımına düşerdi — testin yeşilliği operatör yapılandırmasına
// bağlı OLMAMALI.

/** AC9 worker çocuk sürecinin `pg_stat_activity` adı — AC11'inkiyle ÇAKIŞMAZ. */
export const WORKER_SHUTDOWN_CHILD_APPLICATION_NAME = 'arkesoft-worker-ac9'

/** Hazır/kapanış kayıtlarının seviyesi — çocuk süreçte determinize edilir. */
const WORKER_CHILD_LOG_LEVEL = 'info'

/** NDJSON satırı yoklama aralığı (ms) — `shutdown.test.ts`'in poll deseni. */
const WORKER_LOG_POLL_INTERVAL_MS = 25

/** Bir log olayının beklenmesi için varsayılan üst sınır (ms). */
const WORKER_LOG_WAIT_TIMEOUT_MS = 20_000

const MAIN_WORKER_JS_PATH = fileURLToPath(new URL('../../../dist/main.worker.js', import.meta.url))

/**
 * Worker'ın stdout'una yazdığı NDJSON satırının ÖLÇÜLEN alanları. Çocuk süreç
 * DIŞ DÜNYADIR: satır Zod ile parse edilir, `as` ile tip verilmez (CLAUDE.md
 * §4). Şema `z.object` olduğu için tanımadığı alanları DÜŞÜRÜR — bu kasıtlı:
 * ölçüm yalnızca sözleşmesi olan alanlara dayanır.
 */
const workerLogRecordSchema = z.object({
  level: z.string(),
  msg: z.string(),
  pid: z.number().optional(),
  signal: z.string().optional(),
  queueNames: z.array(z.string()).optional(),
  concurrency: z.array(z.number()).optional(),
  queueCount: z.number().optional(),
  workerCount: z.number().optional(),
  durationMs: z.number().optional(),
})

export type WorkerLogRecord = z.infer<typeof workerLogRecordSchema>

export type WorkerShutdownChildHandle = ShutdownChildHandle & {
  /** `msg` alanı `logEvent`'e eşit İLK kaydı bekler; süre dolarsa tanı mesajıyla fırlatır. */
  readonly waitForLogEvent: (logEvent: string, timeoutMs?: number) => Promise<WorkerLogRecord>
  /** {@link WORKER_READY_LOG_EVENT} kaydını bekler (hazır-olma sinyali). */
  readonly waitUntilWorkerReady: (timeoutMs?: number) => Promise<WorkerLogRecord>
  /** O ana kadar ayrıştırılmış TÜM kayıtlar, geliş SIRASINDA. */
  readonly logRecords: () => readonly WorkerLogRecord[]
  /** NDJSON olarak ayrıştırılamayan stdout satırları — test bunu ASSERT eder. */
  readonly malformedStdoutLines: () => readonly string[]
  /** Çocuğun stderr'i (tanı mesajlarında kullanılır). */
  readonly stderrText: () => string
  /** stdout akışı kapandığında çözülür — son chunk'lar `exit`'ten SONRA gelebilir. */
  readonly stdoutClosed: Promise<void>
}

/**
 * `dist/main.worker.js`'i AYRI bir OS sürecinde başlatır (in-process taklit
 * DEĞİL — `createApplicationContext`, `worker.close()`, Nest yıkım kancaları ve
 * süreç exit kodu yalnızca GERÇEK bir süreçte ölçülebilir).
 *
 * `DATABASE_URL` {@link WORKER_SHUTDOWN_CHILD_APPLICATION_NAME} ile
 * işaretlenir; `LOG_LEVEL` determinize edilir. Diğer TÜM ortam değişkenleri
 * çağıran süreçten devralınır (`startShutdownChild` ile AYNI desen).
 * `API_PORT` BİLEREK VERİLMEZ — worker HTTP portu açmaz (K1.e).
 */
export function startWorkerShutdownChild(): WorkerShutdownChildHandle {
  const baseDatabaseUrl = process.env['DATABASE_URL']

  if (baseDatabaseUrl === undefined) {
    throw new Error(
      "startWorkerShutdownChild: process.env.DATABASE_URL tanımlı değil (vitest.config.ts kök .env'i yüklemeli).",
    )
  }

  const child = spawn('node', [MAIN_WORKER_JS_PATH], {
    cwd: API_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: withApplicationName(baseDatabaseUrl, WORKER_SHUTDOWN_CHILD_APPLICATION_NAME),
      LOG_LEVEL: WORKER_CHILD_LOG_LEVEL,
    },
    stdio: 'pipe',
  })

  const records: WorkerLogRecord[] = []
  const malformedLines: string[] = []
  const stderrChunks: Buffer[] = []
  let pendingStdout = ''

  const consumeLine = (line: string): void => {
    if (line.length === 0) {
      return
    }

    let parsedJson: unknown

    try {
      parsedJson = JSON.parse(line)
    } catch {
      // Hata YUTULMUYOR (CLAUDE.md §10 md 16): satır `malformedStdoutLines()`
      // üzerinden testin ASSERT ettiği listeye geçer — worker'ın stdout'u
      // yapılandırılmış JSON olmak zorunda, ayrıştırılamayan satır KIRMIZI
      // verir.
      malformedLines.push(line)
      return
    }

    const result = workerLogRecordSchema.safeParse(parsedJson)

    if (!result.success) {
      malformedLines.push(line)
      return
    }

    records.push(result.data)
  }

  child.stdout.on('data', (chunk: Buffer) => {
    pendingStdout += chunk.toString('utf-8')
    const lines = pendingStdout.split('\n')
    // Son parça TAMAMLANMAMIŞ olabilir — bir sonraki chunk'a devredilir.
    pendingStdout = lines.pop() ?? ''

    for (const line of lines) {
      consumeLine(line)
    }
  })

  child.stderr.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk)
  })

  const stdoutClosed = new Promise<void>((resolve) => {
    child.stdout.on('end', () => {
      // Akış sonundaki satır sonu OLMAYAN kalıntı da ölçüme girer.
      consumeLine(pendingStdout)
      pendingStdout = ''
      resolve()
    })
  })

  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal })
    })
  })

  const stderrText = (): string => Buffer.concat(stderrChunks).toString('utf-8')

  const waitForLogEvent = async (
    logEvent: string,
    timeoutMs: number = WORKER_LOG_WAIT_TIMEOUT_MS,
  ): Promise<WorkerLogRecord> => {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const record = records.find((candidate) => candidate.msg === logEvent)

      if (record !== undefined) {
        return record
      }

      await delay(WORKER_LOG_POLL_INTERVAL_MS)
    }

    throw new Error(
      [
        `startWorkerShutdownChild: '${logEvent}' log olayı ${String(timeoutMs)}ms içinde gelmedi.`,
        `görülen msg değerleri: ${records.map((record) => record.msg).join(' | ')}`,
        `ayrıştırılamayan satırlar: ${malformedLines.join(' | ')}`,
        `stderr: ${stderrText()}`,
      ].join('\n'),
    )
  }

  return {
    child,
    exited,
    stdoutClosed,
    waitForLogEvent,
    waitUntilWorkerReady: (timeoutMs?: number) =>
      waitForLogEvent(WORKER_READY_LOG_EVENT, timeoutMs),
    logRecords: () => [...records],
    malformedStdoutLines: () => [...malformedLines],
    stderrText,
  }
}
