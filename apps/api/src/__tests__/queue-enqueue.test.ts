// @arkesoft/api — ÜRETİCİ testleri: kayıt deseni + `QueueService.enqueue`
// (ROADMAP v0.0.11, T-013/S5, architect K4)
//
// ⚠ BULLMQ TAKLİT EDİLMİYOR, GERÇEK KUYRUK KULLANILIYOR. Gerekçe: ölçmek
// istediğimiz şeylerin ÜÇÜ de sahte bir kuyrukta ölçülemez —
//   (a) "aynı `Job.id` ile ikinci `enqueue` İKİNCİ bir BullMQ işi üretmiyor"
//       BullMQ'nun `jobId` tekilliğinin bir ÖZELLİĞİdir; sahte kuyrukta
//       kendi varsayımımızı test etmiş olurduk,
//   (b) iş seçeneklerinin (attempts/backoff/retention) BullMQ tarafında
//       GERÇEKTEN ne olarak kaydedildiği,
//   (c) "önce Postgres, sonra BullMQ" sıralaması — yazma anında kuyruğun
//       HÂLÂ BOŞ olduğunu gerçek bir sayımla doğruluyoruz.
//
// Kuyruk testleri AMAÇLANAN Redis'e karşı koşmalı (AC10): `beforeAll`'ın
// İLK satırı `assertQueueCapableRedis` (T-013/S4). Kapı fail-closed —
// yanlış Redis'te bu dosya KIRMIZI verir, sessizce geçmez.
//
// İZOLASYON: sonda (2) kendi PROB kuyruğunu kullanır (`test.enqueue-probe`),
// üretim kuyruğuna (`tenant.provision`) dokunmaz; sonda (3) üretim yolunu
// koşturur ve yarattığı TEK işi + TEK `Job` satırını siler.

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { DEMO_SEED, JobStatus } from '@arkesoft/db'
import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import { JobPayloadInvalidError } from '../errors/domain/job-payload-invalid.error.js'
import { JobTypeNotRegisteredError } from '../errors/domain/job-type-not-registered.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createRedisConnection } from '../redis/create-redis-connection.js'
import type { JobDefinition } from '../queue/job-definition.js'
import { jobPayloadBaseSchema } from '../queue/job-payload.base.js'
import type { JobPayloadBase } from '../queue/job-payload.base.js'
import { JOB_DEFINITIONS, TENANT_PROVISION_JOB } from '../queue/job-registry.js'
import {
  buildDlqQueueName,
  JOB_ATTEMPTS,
  QUEUE_CLOSE_TIMEOUT_MS,
  QUEUE_KEY_PREFIX,
  QUEUE_QUIT_TIMEOUT_MS,
  TENANT_PROVISION_CONCURRENCY,
} from '../queue/queue-constants.js'
import { JOB_ENQUEUED_LOG_EVENT } from '../queue/queue-log-events.js'
import { QueueService } from '../queue/queue.service.js'
import type {
  CreateQueuedJobInput,
  JobQueue,
  JobQueueEntry,
  JobQueueRegistry,
  QueueLogger,
} from '../queue/queue.service.js'
import { JOB_QUEUE_REGISTRY, QUEUE_CONNECTION } from '../queue/queue.tokens.js'
import { assertQueueCapableRedis } from './helpers/assert-queue-capable-redis.js'
import { createTestApp } from './helpers/create-test-app.js'

/** PROB kuyruğu — üretim kuyruk adlarıyla ÇAKIŞMAZ, sonda sonunda silinir. */
const PROBE_JOB_NAME = 'test.enqueue-probe'

/** Kayıt defterinde OLMAYAN bir iş adı (JobTypeNotRegisteredError yolu). */
const UNREGISTERED_JOB_NAME = 'test.unregistered-probe'

const PROBE_TENANT_ID = 'tnt_probe_s5'

/** Sahte yazıcının her zaman döndürdüğü SABİT satır id'si — tekillik sondası. */
const FIXED_JOB_ROW_ID = 'job_fixed_row_id_s5'

describe('(1) kayıt deseni — türe özgü dallanma YOK, ikinci iş = bir satır (K4)', () => {
  it('v0.0.11 TEK iş türü taşıyor ve adı `tenant.provision`', () => {
    expect(JOB_DEFINITIONS).toHaveLength(1)
    expect(JOB_DEFINITIONS.map((definition) => definition.name)).toEqual(['tenant.provision'])
  })

  it('eşzamanlılık AÇIK bir modül sabiti (örtük BullMQ varsayılanı DEĞİL) ve değeri 1', () => {
    expect(TENANT_PROVISION_JOB.concurrency).toBe(TENANT_PROVISION_CONCURRENCY)
    expect(TENANT_PROVISION_CONCURRENCY).toBe(1)
  })

  it('deneme sayısı 3 (AC6’nın “3 denemeden sonra DLQ” kriteri)', () => {
    expect(TENANT_PROVISION_JOB.attempts).toBe(JOB_ATTEMPTS)
    expect(JOB_ATTEMPTS).toBe(3)
  })

  it('DLQ adı iş adından TEK fonksiyonla türetiliyor', () => {
    expect(buildDlqQueueName('tenant.provision')).toBe('tenant.provision.dlq')
  })

  it('Redis anahtar öneki `arkesoft:queue` (BullMQ varsayılanı `bull` DEĞİL)', () => {
    expect(QUEUE_KEY_PREFIX).toBe('arkesoft:queue')
  })

  it('payload şeması `tenantId` olmadan REDDEDİYOR, fazla anahtarı DÜŞÜRÜYOR', () => {
    expect(jobPayloadBaseSchema.safeParse({}).success).toBe(false)
    expect(jobPayloadBaseSchema.safeParse({ tenantId: '' }).success).toBe(false)
    expect(jobPayloadBaseSchema.parse({ tenantId: 'tnt_1', sirAnahtar: 'x' })).toEqual({
      tenantId: 'tnt_1',
    })
  })
})

describe('(2) enqueue — SIRALAMA, jobId eşlemesi, iş seçenekleri (gerçek BullMQ)', () => {
  let connection: Redis
  let probeQueue: JobQueue
  let service: QueueService
  /** Yazıcı çağrıldığı ANDA kuyrukta bekleyen iş sayısı — sıralama kanıtı. */
  let waitingCountAtWriteTime: number | undefined
  let writerCalls: CreateQueuedJobInput[]
  let nextRowId: string
  let infoLogs: { readonly bindings: Record<string, unknown>; readonly message: string }[]

  const probeDefinition: JobDefinition<JobPayloadBase> = {
    name: PROBE_JOB_NAME,
    payloadSchema: jobPayloadBaseSchema,
    concurrency: TENANT_PROVISION_CONCURRENCY,
    attempts: JOB_ATTEMPTS,
  }

  const unregisteredDefinition: JobDefinition<JobPayloadBase> = {
    ...probeDefinition,
    name: UNREGISTERED_JOB_NAME,
  }

  beforeAll(async () => {
    const env = parseEnv(apiEnvSchema)
    connection = createRedisConnection({
      url: env.REDIS_URL,
      profile: 'queue',
      logger: { warn: vi.fn() },
    })

    // ⚠ AC10 KAPISI — İLK ÖLÇÜM. Yanlış Redis'te buradan İLERİ GİDİLMEZ.
    await assertQueueCapableRedis(connection)

    probeQueue = new Queue(PROBE_JOB_NAME, { connection, prefix: QUEUE_KEY_PREFIX })
  })

  afterAll(async () => {
    await probeQueue.obliterate({ force: true })
    await probeQueue.close()
    await connection.quit()
  })

  beforeEach(async () => {
    await probeQueue.obliterate({ force: true })

    waitingCountAtWriteTime = undefined
    writerCalls = []
    nextRowId = FIXED_JOB_ROW_ID
    infoLogs = []

    const logger: QueueLogger = {
      info: (bindings, message) => {
        infoLogs.push({ bindings, message })
      },
      warn: vi.fn(),
    }

    const registry: JobQueueRegistry = new Map<string, JobQueueEntry>([
      // PROB kuyruğu kendi DLQ'suna ihtiyaç duymuyor (üretici DLQ'ya
      // YAZMAZ — o T-013/S6'nın işi); aynı örnek iki alana veriliyor ki
      // tip sözleşmesi bozulmasın.
      [PROBE_JOB_NAME, { queue: probeQueue, dlqQueue: probeQueue }],
    ])

    service = new QueueService(
      registry,
      {
        createQueuedJob: async (input) => {
          writerCalls.push(input)
          // ⚠ SIRALAMA KANITI: satır yazıldığı anda BullMQ'da henüz iş
          // OLMAMALI. Ters sıra (önce BullMQ) bu sayımı 1 yapar.
          waitingCountAtWriteTime = await probeQueue.getWaitingCount()
          return nextRowId
        },
      },
      logger,
    )
  })

  it('ÖNCE Postgres satırı, SONRA BullMQ işi (sıralama kararı)', async () => {
    const result = await service.enqueue(probeDefinition, { tenantId: PROBE_TENANT_ID })

    expect(waitingCountAtWriteTime).toBe(0)
    expect(await probeQueue.getWaitingCount()).toBe(1)
    expect(result.jobId).toBe(FIXED_JOB_ROW_ID)
    expect(writerCalls).toEqual([
      { tenantId: PROBE_TENANT_ID, type: PROBE_JOB_NAME, payload: { tenantId: PROBE_TENANT_ID } },
    ])
  })

  it('BullMQ `jobId` = `Job.id`; veri ve seçenekler BullMQ tarafında birebir kayıtlı', async () => {
    const result = await service.enqueue(probeDefinition, { tenantId: PROBE_TENANT_ID })

    const job = await probeQueue.getJob(result.jobId)

    expect(job).toBeDefined()
    expect(job?.id).toBe(FIXED_JOB_ROW_ID)
    expect(job?.name).toBe(PROBE_JOB_NAME)
    expect(job?.data).toEqual({ tenantId: PROBE_TENANT_ID })
    expect(job?.opts.attempts).toBe(3)
    expect(job?.opts.backoff).toEqual({ type: 'custom' })
    expect(job?.opts.removeOnComplete).toBe(true)
    expect(job?.opts.removeOnFail).toEqual({ count: 100 })
  })

  it('AYNI `Job.id` ile ikinci enqueue İKİNCİ bir BullMQ işi ÜRETMİYOR', async () => {
    const first = await service.enqueue(probeDefinition, { tenantId: PROBE_TENANT_ID })
    const second = await service.enqueue(probeDefinition, { tenantId: PROBE_TENANT_ID })

    expect(first.jobId).toBe(second.jobId)
    expect(await probeQueue.getWaitingCount()).toBe(1)
    // Yazıcı İKİ KEZ çağrıldı (satır yazma sorumluluğu çağıranın), ama BullMQ
    // tarafında TEK iş var — tekillik `jobId` üzerinden.
    expect(writerCalls).toHaveLength(2)
  })

  it('`tenantId` eksik payload REDDEDİLİYOR: satır YAZILMIYOR, iş KUYRUĞA GİRMİYOR (AC5)', async () => {
    await expect(service.enqueue(probeDefinition, {})).rejects.toThrow(JobPayloadInvalidError)

    expect(writerCalls).toEqual([])
    expect(await probeQueue.getWaitingCount()).toBe(0)
  })

  it('boş `tenantId` de REDDEDİLİYOR (min(1))', async () => {
    await expect(service.enqueue(probeDefinition, { tenantId: '' })).rejects.toThrow(
      JobPayloadInvalidError,
    )

    expect(writerCalls).toEqual([])
    expect(await probeQueue.getWaitingCount()).toBe(0)
  })

  it('hata gövdesi ALAN YOLUNU taşıyor, DEĞERİ taşımıyor (PII/sır sızmıyor)', async () => {
    const error = await service
      .enqueue(probeDefinition, { tenantId: '' })
      .then(() => undefined)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(JobPayloadInvalidError)
    if (!(error instanceof JobPayloadInvalidError)) {
      return
    }

    expect(error.code).toBe('JOB_PAYLOAD_INVALID')
    expect(error.isRetryable).toBe(false)
    expect(error.context).toEqual({ jobName: PROBE_JOB_NAME, invalidFieldPaths: ['tenantId'] })
  })

  it('kayıt defterinde OLMAYAN iş tanımı SESSİZCE GEÇMİYOR', async () => {
    await expect(
      service.enqueue(unregisteredDefinition, { tenantId: PROBE_TENANT_ID }),
    ).rejects.toThrow(JobTypeNotRegisteredError)

    expect(writerCalls).toEqual([])
    expect(await probeQueue.getWaitingCount()).toBe(0)
  })

  it('log yapılandırılmış ve `tenantId` DOLU (CLAUDE.md §7 md 13)', async () => {
    const result = await service.enqueue(probeDefinition, { tenantId: PROBE_TENANT_ID })

    expect(infoLogs).toHaveLength(1)
    expect(infoLogs[0]?.message).toBe(JOB_ENQUEUED_LOG_EVENT)
    expect(infoLogs[0]?.bindings).toEqual({
      tenantId: PROBE_TENANT_ID,
      jobId: result.jobId,
      jobName: PROBE_JOB_NAME,
    })
  })

  it('fazla payload anahtarı ne JSONB’ye ne BullMQ’ya yazılıyor (strip)', async () => {
    const result = await service.enqueue(probeDefinition, {
      tenantId: PROBE_TENANT_ID,
      apiKey: 'sentetik-sir',
    })

    const job = await probeQueue.getJob(result.jobId)

    expect(job?.data).toEqual({ tenantId: PROBE_TENANT_ID })
    expect(writerCalls[0]?.payload).toEqual({ tenantId: PROBE_TENANT_ID })
  })
})

/**
 * `QueueLifecycleService.onModuleDestroy()`'un en kötü durum bütçesini
 * AYNALAR (`queue-lifecycle.service.ts`): kayıt defterindeki HER iş türü
 * için iki `queue.close()` (`QUEUE_CLOSE_TIMEOUT_MS`) + bir
 * `connection.quit()`/`disconnect()` (`QUEUE_QUIT_TIMEOUT_MS`) + güvenlik
 * payı. Rastgele bir sayı DEĞİL — aşağıdaki `waitForQueueConnectionEnd`'in
 * ÜST SINIRI, "asla dönmeyen bir kapanış" ile "henüz dönmemiş normal
 * kapanış"ı ayırt etmek için var.
 */
const CONNECTION_END_WAIT_BUDGET_MS =
  JOB_DEFINITIONS.length * 2 * QUEUE_CLOSE_TIMEOUT_MS + QUEUE_QUIT_TIMEOUT_MS + 2_000

/**
 * `connection.status`'ün `'end'`e geçtiğini DURUMU YOKLAYARAK değil, bu
 * geçişin KENDİ sinyalini (`ioredis`'in `'end'` olayı) dinleyerek doğrular.
 *
 * ⚠ NEDEN DURUM YOKLAMASI (`expect(status).toBe('end')` doğrudan okuma)
 * KIRILGAN: `ioredis`'te `status` alanı `Redis.js#setStatus` içinde
 * SENKRON güncellenir, ama bu güncellemeyi TETİKLEYEN native socket
 * `'close'` olayı `connection.quit()`'in döndürdüğü promise'in
 * çözülmesinden SONRA, AYRI bir event-loop turunda ateşlenir
 * (`event_handler.js#closeHandler`). `QueueLifecycleService.onModuleDestroy`
 * (`app.close()` zinciri) `connection.quit()`'i BEKLER ama bu, socket'in
 * GERÇEKTEN kapandığı anlamına gelmez — `status` o anda hâlâ `'ready'`
 * olabilir. Yük altında (CI'da 62 worker) bu ARA, senkron bir okumanın
 * yakalayabileceği kadar büyüyor (bu dosyanın önceki CI kırmızısı).
 *
 * Bu fonksiyon dinleyiciyi KAPATMADAN ÖNCE kurar (çağıran sırası bunu
 * garanti eder — bkz. çağrı yeri) ve `'end'` olayını bekler; zaman aşımı
 * mesajı YALNIZCA "timeout" demez, kapanışın FİİLEN olmadığını adlandırır
 * (mutasyon kanıtının okunabilir olması için).
 */
async function waitForQueueConnectionEnd(connection: Redis, timeoutMs: number): Promise<void> {
  if (connection.status === 'end') {
    return
  }

  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `kuyruk bağlantısı kapanmadı: ${String(timeoutMs)}ms içinde 'end' olayı gelmedi (son status: ${connection.status})`,
          ),
        )
      }, timeoutMs)

      connection.once('end', () => {
        resolve()
      })
    })
  } finally {
    clearTimeout(timer)
  }
}

describe('(3) üretim yolu — `Job` satırı KİRACI KAPSAMLI yazılıyor + kapanış sözleşmesi', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let queueService: QueueService
  let registry: JobQueueRegistry
  let queueConnection: Redis
  let tenantId: string
  let createdJobId: string | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    queueService = app.get(QueueService)
    registry = app.get<JobQueueRegistry>(JOB_QUEUE_REGISTRY)
    queueConnection = app.get<Redis>(QUEUE_CONNECTION)

    await assertQueueCapableRedis(queueConnection)

    const tenant = await prismaService.db.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })

    expect(tenant).not.toBeNull()
    tenantId = tenant?.id ?? ''
  })

  afterAll(async () => {
    if (createdJobId !== undefined && tenantId !== '') {
      const jobId = createdJobId
      await prismaService.withTenant(tenantId, (tx) => tx.job.deleteMany({ where: { id: jobId } }))
    }

    if (app !== undefined) {
      await app.close()
    }
  })

  it('kayıt defteri iş türü başına bir kuyruk + bir DLQ kuyruğu kurdu', () => {
    expect(registry.size).toBe(JOB_DEFINITIONS.length)

    const entry = registry.get(TENANT_PROVISION_JOB.name)

    expect(entry?.queue.name).toBe('tenant.provision')
    expect(entry?.dlqQueue.name).toBe('tenant.provision.dlq')
  })

  it('enqueue `queued` satırı yazıyor ve BullMQ işinin id’si satır id’siyle AYNI', async () => {
    const result = await queueService.enqueue(TENANT_PROVISION_JOB, { tenantId })
    createdJobId = result.jobId

    const rows = await prismaService.withTenant(tenantId, (tx) =>
      tx.job.findMany({ where: { id: result.jobId } }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.tenantId).toBe(tenantId)
    expect(rows[0]?.type).toBe('tenant.provision')
    expect(rows[0]?.status).toBe(JobStatus.queued)
    expect(rows[0]?.progress).toBe(0)
    expect(rows[0]?.payload).toEqual({ tenantId })
    expect(rows[0]?.startedAt).toBeNull()
    expect(rows[0]?.completedAt).toBeNull()

    const entry = registry.get(TENANT_PROVISION_JOB.name)
    const bullJob = await entry?.queue.getJob(result.jobId)

    expect(bullJob?.id).toBe(result.jobId)
    expect(bullJob?.data).toEqual({ tenantId })

    // Üretim kuyruğunu temiz bırak (worker bu sürümde bu süreçte koşmuyor).
    await bullJob?.remove()
    expect(await entry?.queue.getJob(result.jobId)).toBeUndefined()
  })

  it('ÇAPRAZ ERİŞİM — başka kiracının bağlamından satır GÖRÜNMÜYOR (RLS, §7 md 11)', async () => {
    expect(createdJobId).toBeDefined()
    const jobId = createdJobId ?? ''

    // `withTenant` yalnızca `app.tenant_id` ayarını kurar; satır gerçekten
    // VAR ama yabancı kiracı bağlamında RLS onu 0 satıra indirir. "Var
    // olmayan" ile "yetkisiz" AYNI sonucu verir (varlık oracle'ı kapalı).
    const foreignRows = await prismaService.withTenant('tnt_yabanci_s5', (tx) =>
      tx.job.findMany({ where: { id: jobId } }),
    )

    expect(foreignRows).toEqual([])

    // Kendi kiracısında HÂLÂ görünüyor — yukarıdaki boş sonuç "satır silindi"
    // değil, "başka kiracı göremiyor" demek.
    const ownRows = await prismaService.withTenant(tenantId, (tx) =>
      tx.job.findMany({ where: { id: jobId } }),
    )

    expect(ownRows).toHaveLength(1)
  })

  it(
    'SON TEST — kuyruk artığı bırakılmıyor + QueueLifecycleService KENDİ bağlantısını kapatıyor',
    async () => {
      expect(queueConnection.status).not.toBe('end')

      // ⚠ ARTIK BIRAKMAMA (Orkestratör ölçtü, DoD maddesi): bu sonda ÜRETİM
      // kuyruklarını kullanıyor ve paylaşılan Redis'te `meta`/`id`/`events`/
      // `marker` metadata anahtarları bırakırdı. Her koşum kendi artığını
      // KENDİSİ siler — yoksa anahtarlar birikir ve bir sonraki alt görev
      // (S6/S7) "askıda iş var mı?" sorusunu yanlış cevaplar.
      // `obliterate` DESENE KAPSAMLI: yalnızca bu iki kuyruğun anahtarlarını
      // siler; `platform:auth:*` gibi başka testlerin durumuna DOKUNMAZ
      // (bütün veritabanını boşaltan komutlar BU SONDADA KULLANILMAZ).
      for (const entry of registry.values()) {
        await entry.queue.obliterate({ force: true })
        await entry.dlqQueue.obliterate({ force: true })
      }

      const closingApp = app
      app = undefined

      // ⚠ Dinleyici `app.close()`'DAN ÖNCE kuruluyor (fonksiyon çağrısı
      // SENKRON olarak `connection.once('end', …)`'i kaydeder) — kapanış
      // `await`'ten önce tetiklenirse olay KAÇMAZ.
      const connectionEnded = waitForQueueConnectionEnd(
        queueConnection,
        CONNECTION_END_WAIT_BUDGET_MS,
      )

      await closingApp?.close()

      // `RedisService.quit()` yalnızca `REDIS_CLIENT`'ı kapatır; bu bağlantı
      // `'queue'` profilinin AYRI örneğidir ve kapanışı `QueueLifecycleService`
      // yapar (T-013/S3'ün bağlayıcı notu, AC9'un ön koşulu). `status`'u
      // DOĞRUDAN YOKLAMIYORUZ — kapanışın KENDİ sinyalini (`'end'` olayı)
      // bekliyoruz (gerekçe: `waitForQueueConnectionEnd`'in başındaki yorum).
      await connectionEnded

      expect(queueConnection.status).toBe('end')
    },
    // ⚠ Vitest'in VARSAYILAN test zaman aşımı (5000ms)'den BİLEREK BÜYÜK:
    // `CONNECTION_END_WAIT_BUDGET_MS` (kapanış zincirinin KENDİ bütçesi,
    // 7000ms) içeride dolup KENDİ ("bağlantı kapanmadı…") hatasını fırlatsın
    // — vitest'in jenerik "Test timed out" mesajı bunu MASKELEMESİN
    // (mutasyon kanıtının okunabilir kalması için, T-015 düzeltme notu).
    CONNECTION_END_WAIT_BUDGET_MS + 3_000,
  )
})
