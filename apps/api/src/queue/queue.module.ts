// @arkesoft/api — QueueModule: ÜRETİCİ tarafı (ROADMAP v0.0.11, T-013/S5,
// architect K4)
//
// NE KURUYOR: `JOB_DEFINITIONS` kayıt defterini GEZEREK iş türü BAŞINA bir
// `Queue` + bir DLQ `Queue`. İkinci iş türü eklemek bu dosyada SIFIR
// değişiklik demek — topoloji veriden türetiliyor (CLAUDE.md §10 md 12).
//
// NEDEN KUYRUK BAŞINA İŞ TÜRÜ (tek çoklanmış kuyruk DEĞİL, K4): BullMQ'da
// eşzamanlılık `Worker` başınadır → tek çoklanmış kuyrukta AĞIR iş türü
// HAFİF olanı aç bırakır. Ayrı kuyruk, ayrı `Worker`, ayrı eşzamanlılık.
//
// ⚠ TÜKETİCİ BU MODÜLDE YOK. `Worker` örnekleri, handler sarmalayıcısı ve
// `main.worker.ts` AYRI bir modülün (T-013/S6) işidir; `app.module.ts`'e
// YALNIZCA bu modül eklenir. Gerekçe: HTTP süreci iş İŞLEMEZ, yalnızca
// ÜRETİR — API sürecinde `Worker` ayağa kaldırmak bloke eden Redis
// bağlantıları ve stalled-checker zamanlayıcıları açar, yani v0.0.4'ün AC11
// garantisini (SIGTERM → exit 0, açık handle yok) HTTP tarafında da riske
// atardı.
//
// ⚠ BAĞLANTI: `REDIS_CLIENT` (`'health'` profili) kuyruğa HİÇ VERİLMEZ —
// gerekçe `create-redis-connection.ts` dosya başında (bloke eden komutlar
// `commandTimeout: 1500` ile yaşayamaz; `maxRetriesPerRequest` `null`
// olmak zorunda). Bağlantının KAPANIŞI da bu modülün sorumluluğu
// (`QueueLifecycleService`) — `RedisService` onu kapatmaz.
//
// ⚠ `BackendFactory` VERİLMEZ: bullmq v6 pluggable backend getirdi ama
// `Queue<…, B extends IQueueBackend = RedisQueueBackend>` → Redis
// VARSAYILAN (T-013/S1 tip tanımından ölçtü). Postgres backend'i opt-in
// `backendFactory` ile gelir; bizim anahtar şemamız ve AC10 kapısı Redis'e
// bağlı.

import { Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'
import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'

import { API_ENV } from '../config/config.tokens.js'
import type { ApiEnv } from '../config/api-env.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createRedisConnection } from '../redis/create-redis-connection.js'
import type { RedisConnectionLogger } from '../redis/create-redis-connection.js'
import { JOB_DEFINITIONS } from './job-registry.js'
import { buildDlqQueueName, QUEUE_KEY_PREFIX } from './queue-constants.js'
import { QueueLifecycleService } from './queue-lifecycle.service.js'
import { QueueService } from './queue.service.js'
import type {
  JobDeadLetterQueue,
  JobQueue,
  JobQueueEntry,
  JobQueueRegistry,
  QueuedJobWriter,
} from './queue.service.js'
import { JOB_QUEUE_REGISTRY, QUEUE_CONNECTION, QUEUED_JOB_WRITER } from './queue.tokens.js'

/**
 * Kuyruğun `'queue'` profilli KENDİ `ioredis` örneği. ADLANDIRILMIŞ ve DIŞA
 * AÇIK (`createHealthRedisConnection` emsali): profilin `'queue'` OLDUĞU
 * Nest konteyneri ayağa kaldırılmadan pinlenebilsin — profil sessizce
 * `'health'`e kayarsa BullMQ'nun bloke eden komutları 1,5 sn'de düşer ve
 * kuyruk SESSİZCE çalışmaz.
 */
export function createQueueRedisConnection(
  env: Pick<ApiEnv, 'REDIS_URL'>,
  logger: RedisConnectionLogger,
): Redis {
  return createRedisConnection({ url: env.REDIS_URL, profile: 'queue', logger })
}

/**
 * Kayıt defterini kuyruk topolojisine çevirir. ⚠ TEK YER: üretici bu
 * fonksiyonu kullanır; tüketici (T-013/S6) aynı kayıt defterini gezerek
 * `Worker`'larını kurar. Kuyruk adlarının iki yerde ayrı türetilmesi bu
 * reponun tekrarlayan kusur sınıfıdır.
 */
export function buildJobQueueRegistry(connection: Redis): JobQueueRegistry {
  const registry = new Map<string, JobQueueEntry>()

  // ⚠ `prefix`: TÜM kuyruklar AYNI öneki paylaşır (`QUEUE_KEY_PREFIX`) —
  // BullMQ varsayılanı `bull` kullanılmaz, paylaşılan anahtar alanında
  // platformun kuyruk verisi ayrılır. Kiracıya göre BÖLÜNMEZ (bkz.
  // `queue-constants.ts`, ADR-0015 Karar 1).
  const queueOptions = { connection, prefix: QUEUE_KEY_PREFIX }

  for (const definition of JOB_DEFINITIONS) {
    const workQueue: JobQueue = new Queue(definition.name, queueOptions)
    // DLQ'nun veri tipi iş payload'ı DEĞİL, bir ZARFtır (T-013/S6 tasarlar);
    // üretici zarfın içeriğine BAKMAZ, yalnızca kuyruğu kurar ve kapatır.
    const deadLetterQueue: JobDeadLetterQueue = new Queue(
      buildDlqQueueName(definition.name),
      queueOptions,
    )

    registry.set(definition.name, { queue: workQueue, dlqQueue: deadLetterQueue })
  }

  return registry
}

const queueConnectionProvider: Provider = {
  provide: QUEUE_CONNECTION,
  useFactory: (env: ApiEnv, logger: Logger): Redis => createQueueRedisConnection(env, logger),
  inject: [API_ENV, ROOT_LOGGER],
}

const jobQueueRegistryProvider: Provider = {
  provide: JOB_QUEUE_REGISTRY,
  useFactory: (connection: Redis): JobQueueRegistry => buildJobQueueRegistry(connection),
  inject: [QUEUE_CONNECTION],
}

/**
 * `QueuedJobWriter` adaptörü. ⚠ `Job` satırı YALNIZCA
 * `PrismaService.withTenant()` içinde yazılır (CLAUDE.md §7 md 5) — ham
 * `prisma.db.job` çağrısı DERLENMEZ bile: `AppPrismaDatabase` `job`
 * delegesini TAŞIMAZ, `job` yalnızca `TenantTransactionClient`'ta vardır
 * (T-013/S2, K5 katman 2). Bu yapısal kapıya "eklenerek" değil UYARAK
 * ilerliyoruz.
 *
 * `select: { id: true }` — satırın geri kalanı (payload dahil) okunmaz;
 * çağıranın ihtiyacı yalnızca id.
 */
const queuedJobWriterProvider: Provider = {
  provide: QUEUED_JOB_WRITER,
  useFactory: (prisma: PrismaService): QueuedJobWriter => ({
    createQueuedJob: (input) =>
      prisma.withTenant(input.tenantId, async (tx) => {
        const row = await tx.job.create({
          data: {
            tenantId: input.tenantId,
            type: input.type,
            payload: input.payload,
          },
          select: { id: true },
        })

        return row.id
      }),
  }),
  inject: [PrismaService],
}

@Module({
  providers: [
    queueConnectionProvider,
    jobQueueRegistryProvider,
    queuedJobWriterProvider,
    QueueService,
    QueueLifecycleService,
  ],
  exports: [QueueService, JOB_QUEUE_REGISTRY, QUEUE_CONNECTION],
})
export class QueueModule {}
