// @arkesoft/api — DLQ, yeniden deneme ve `isRetryable` tüketimi
// (ROADMAP v0.0.11, T-013/S6, architect K4 + K6) — AC6
//
// ⚠ ÜRETİM KUYRUĞU ve ÜRETİM DLQ'SU (`tenant.provision` /
// `tenant.provision.dlq`) kullanılıyor; tek YERİNE KOYULAN parça HANDLER'dır
// — üretim handler'ı bir İSKELET (R-A11) ve TASARIM GEREĞİ başarısız olmaz,
// yani başarısızlık yolunu başka türlü ölçmek İMKÂNSIZ. Kuyruk adları, DLQ
// adı, iş seçenekleri (`attempts`/`backoff`/retention), sarmalayıcı ve DLQ
// zarfı HEPSİ ÜRETİM KODUDUR.
//
// ⚠ BACKOFF PROFİLİ `{ baseDelayMs: 25 }` — YALNIZCA `Worker`'a verilir
// (K6/S5 sözleşmesi: iş seçeneğindeki `backoff: { type: 'custom' }` ÜRETİCİ
// tarafında zaten verildi). Bu EŞİK DÜŞÜRMEK DEĞİLDİR (CLAUDE.md §10 md 6):
// bu testin ölçtüğü şey DENEME SAYISI ve TERMİNAL KONUM; üretim gecikmesi
// (`[5000, 10000]`) AC7'de AYRICA ve bağımsız olarak pinli (`backoff.test.ts`).
//
// ⚠ ÖLÇÜLMÜŞ BULLMQ SEMANTİĞİ (T-013/S6, gerçek Redis): processor İÇİNDE
// `attemptsMade` 0 TABANLI (`0,1,2`); BullMQ onu processor döndükten SONRA
// artırır, terminal işte `3` olur. Bu dosya hem SARMALAYICININ ürettiği
// 1 tabanlı `attemptsMade`'i (DLQ zarfı) hem BullMQ'nun kendi sayacını
// assert eder → iki bağımsız kaynak.

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { DEMO_SEED, JobStatus } from '@arkesoft/db'
import { AppError } from '@arkesoft/errors'
import type { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createRootLogger } from '../logging/root-logger.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { registerJobRunner } from '../queue/job-runner.js'
import type { JobRunnerDependencies } from '../queue/job-runner.js'
import type { JobHandler } from '../queue/job-definition.js'
import type { JobPayloadBase } from '../queue/job-payload.base.js'
import { TENANT_PROVISION_JOB } from '../queue/job-registry.js'
import { QueueService } from '../queue/queue.service.js'
import type { JobQueueRegistry } from '../queue/queue.service.js'
import { JOB_QUEUE_REGISTRY, QUEUE_CONNECTION } from '../queue/queue.tokens.js'
import { createDeadLetterPublisher, createJobWorkers } from '../queue/queue-worker.module.js'
import type { JobWorker } from '../queue/queue-worker.module.js'
import { assertQueueCapableRedis } from './helpers/assert-queue-capable-redis.js'
import { createTestApp } from './helpers/create-test-app.js'

/** AC6 testinin worker'ına verilen KISA profil (yalnızca gecikme DEĞERİ). */
const TEST_BACKOFF_PROFILE = { baseDelayMs: 25 }

const TERMINAL_WAIT_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 25

/** "4. deneme yok" iddiasının ölçüm penceresi (ms) — backoff'un 4 katı. */
const NO_FOURTH_ATTEMPT_WINDOW_MS = 400

/** Zarfın PII taşımadığını ölçmek için `context`'e konan SENTETİK değer. */
const SYNTHETIC_CONTEXT_SECRET = 'sentetik-sir-asla-tele-yazilmamali'

/** Yeniden DENENEBİLİR domain hatası (kuyruk `isRetryable: true` görür). */
class ProbeRetryableError extends AppError {
  constructor() {
    super({
      code: 'PROBE_RETRYABLE',
      httpStatus: 503,
      userMessageKey: 'errors.probe.retryable',
      // ⚠ `context` YALNIZCA LOGA gider; `toErrorBody` onu OKUMAZ
      // (`error-body.ts:13-15`). Bu testin asıl ölçümü bu.
      context: { sirAnahtar: SYNTHETIC_CONTEXT_SECRET },
      isRetryable: true,
    })
  }
}

/** Yeniden DENENMEZ domain hatası (`UnrecoverableError`'a sarılmalı). */
class ProbeUnrecoverableError extends AppError {
  constructor() {
    super({
      code: 'PROBE_UNRECOVERABLE',
      httpStatus: 400,
      userMessageKey: 'errors.probe.unrecoverable',
      context: { sirAnahtar: SYNTHETIC_CONTEXT_SECRET },
      isRetryable: false,
    })
  }
}

const envelopeSchema = z.object({
  jobId: z.string().min(1),
  jobName: z.string().min(1),
  tenantId: z.string().min(1),
  attemptsMade: z.number(),
  failedAt: z.string().min(1),
  payload: z.object({ tenantId: z.string().min(1) }),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
    requestId: z.string(),
  }),
})

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = TERMINAL_WAIT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await predicate()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(`koşul ${String(timeoutMs)}ms içinde sağlanmadı`)
}

describe('AC6 — 3 deneme, DLQ, `isRetryable` tüketimi (gerçek Redis + Postgres)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let queueService: QueueService
  let registry: JobQueueRegistry
  let connection: Redis
  let dependencies: JobRunnerDependencies
  let tenantId: string
  const createdJobIds: string[] = []

  /** Her senaryo KENDİ worker'ını kurar (handler farklı). */
  let activeWorkers: readonly JobWorker[] = []

  async function startWorkerWith(handler: JobHandler<JobPayloadBase>): Promise<void> {
    activeWorkers = createJobWorkers({
      connection,
      dependencies,
      runners: [registerJobRunner(TENANT_PROVISION_JOB, handler)],
      backoffProfile: TEST_BACKOFF_PROFILE,
    })

    await Promise.all(activeWorkers.map((worker) => worker.waitUntilReady()))
  }

  async function stopWorkers(): Promise<void> {
    for (const worker of activeWorkers) {
      await worker.close()
    }
    activeWorkers = []
  }

  async function obliterateProductionQueues(): Promise<void> {
    for (const entry of registry.values()) {
      await entry.queue.obliterate({ force: true })
      await entry.dlqQueue.obliterate({ force: true })
    }
  }

  async function readRow(jobId: string): Promise<
    | {
        status: JobStatus
        error: unknown
        progress: number
      }
    | undefined
  > {
    const rows = await prismaService.withTenant(tenantId, (tx) =>
      tx.job.findMany({
        where: { id: jobId },
        select: { status: true, error: true, progress: true },
      }),
    )

    return rows[0]
  }

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    queueService = app.get(QueueService)
    registry = app.get<JobQueueRegistry>(JOB_QUEUE_REGISTRY)
    connection = app.get<Redis>(QUEUE_CONNECTION)

    // ⚠ AC10 KAPISI — İLK ÖLÇÜM.
    await assertQueueCapableRedis(connection)
    await obliterateProductionQueues()

    const tenant = await prismaService.db.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })
    expect(tenant).not.toBeNull()
    tenantId = tenant?.id ?? ''

    dependencies = {
      withTenantDb: (scopedTenantId, callback) =>
        prismaService.withTenant(scopedTenantId, callback),
      publishToDeadLetterQueue: createDeadLetterPublisher(registry),
      logger: createRootLogger({ level: 'silent' }),
    }
  })

  afterAll(async () => {
    await stopWorkers()

    if (tenantId !== '' && createdJobIds.length > 0) {
      const ids = [...createdJobIds]
      await prismaService.withTenant(tenantId, (tx) =>
        tx.job.deleteMany({ where: { id: { in: ids } } }),
      )
    }

    await obliterateProductionQueues()

    if (app !== undefined) {
      await app.close()
    }
  })

  it('yeniden DENENEBİLİR hata: 3 deneme → DLQ’da 1 kayıt, `failed`, 4. deneme YOK', async () => {
    let handlerCalls = 0
    await startWorkerWith(async () => {
      handlerCalls += 1
      await Promise.resolve()
      throw new ProbeRetryableError()
    })

    const { jobId } = await queueService.enqueue(TENANT_PROVISION_JOB, { tenantId })
    createdJobIds.push(jobId)

    const entry = registry.get(TENANT_PROVISION_JOB.name)

    await waitFor(async () => (await entry?.dlqQueue.getWaitingCount()) === 1)

    // (a) Handler TAM 3 kez çağrıldı; bekleyip tekrar ölçüyoruz → 4. deneme yok.
    expect(handlerCalls).toBe(3)
    await new Promise((resolve) => setTimeout(resolve, NO_FOURTH_ATTEMPT_WINDOW_MS))
    expect(handlerCalls).toBe(3)
    expect(await entry?.queue.getDelayedCount()).toBe(0)
    expect(await entry?.queue.getWaitingCount()).toBe(0)
    expect(await entry?.queue.getActiveCount()).toBe(0)

    // (b) BullMQ'nun KENDİ sayacı: terminal işte 3.
    const bullJob = await entry?.queue.getJob(jobId)
    expect(bullJob?.attemptsMade).toBe(3)
    expect(await entry?.queue.getFailedCount()).toBe(1)

    // (c) `Job` satırı: `failed` + `error` DOLU.
    const row = await readRow(jobId)
    expect(row?.status).toBe(JobStatus.failed)
    expect(row?.error).not.toBeNull()

    // (d) ⚠ `Job.error` TAM OLARAK `toErrorBody()`'nin dört alanı — `context`
    // ve yığın izi YOK (S2'nin R-S2-3 uyarısının ölçümü).
    const errorBody = z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.string(), z.unknown()),
        requestId: z.string(),
      })
      .parse(row?.error)

    expect(Object.keys(errorBody).sort()).toEqual(['code', 'details', 'message', 'requestId'])
    expect(errorBody.code).toBe('PROBE_RETRYABLE')
    expect(errorBody.message).toBe('errors.probe.retryable')
    expect(errorBody.details).toEqual({})
    expect(errorBody.requestId).toBe(jobId)
    expect(JSON.stringify(row?.error)).not.toContain(SYNTHETIC_CONTEXT_SECRET)
    expect(JSON.stringify(row?.error)).not.toContain('stack')

    // (e) DLQ ZARFI: kiracıyı TAŞIYOR, `attemptsMade` 3, hata gövdesi redakte.
    const dlqJobs = await entry?.dlqQueue.getJobs(['waiting'])
    expect(dlqJobs).toHaveLength(1)

    const envelope = envelopeSchema.parse(dlqJobs?.[0]?.data)

    expect(Object.keys(envelope).sort()).toEqual([
      'attemptsMade',
      'error',
      'failedAt',
      'jobId',
      'jobName',
      'payload',
      'tenantId',
    ])
    expect(envelope.jobId).toBe(jobId)
    expect(envelope.jobName).toBe(TENANT_PROVISION_JOB.name)
    expect(envelope.tenantId).toBe(tenantId)
    expect(envelope.payload.tenantId).toBe(tenantId)
    expect(envelope.attemptsMade).toBe(3)
    expect(envelope.error.code).toBe('PROBE_RETRYABLE')
    expect(JSON.stringify(envelope)).not.toContain(SYNTHETIC_CONTEXT_SECRET)

    // (f) DLQ kaydının BullMQ `jobId`'si = `Job.id` → ikinci bir kayıt
    // oluşamaz (doğal tekillik).
    expect(dlqJobs?.[0]?.id).toBe(jobId)

    await stopWorkers()
    await obliterateProductionQueues()
  })

  it('`isRetryable: false` taşıyan `AppError` HİÇ yeniden denenmiyor (attemptsMade === 1)', async () => {
    let handlerCalls = 0
    await startWorkerWith(async () => {
      handlerCalls += 1
      await Promise.resolve()
      throw new ProbeUnrecoverableError()
    })

    const { jobId } = await queueService.enqueue(TENANT_PROVISION_JOB, { tenantId })
    createdJobIds.push(jobId)

    const entry = registry.get(TENANT_PROVISION_JOB.name)

    await waitFor(async () => (await entry?.dlqQueue.getWaitingCount()) === 1)

    await new Promise((resolve) => setTimeout(resolve, NO_FOURTH_ATTEMPT_WINDOW_MS))

    expect(handlerCalls).toBe(1)
    expect(await entry?.queue.getDelayedCount()).toBe(0)

    const bullJob = await entry?.queue.getJob(jobId)
    expect(bullJob?.attemptsMade).toBe(1)
    // ⚠ `failedReason` YALNIZCA kararlı hata KODUNU taşıyor (ham mesaj değil).
    expect(bullJob?.failedReason).toBe('PROBE_UNRECOVERABLE')

    const row = await readRow(jobId)
    expect(row?.status).toBe(JobStatus.failed)

    const dlqJobs = await entry?.dlqQueue.getJobs(['waiting'])
    const envelope = envelopeSchema.parse(dlqJobs?.[0]?.data)
    expect(envelope.attemptsMade).toBe(1)
    expect(envelope.error.code).toBe('PROBE_UNRECOVERABLE')

    await stopWorkers()
    await obliterateProductionQueues()
  })

  it('`AppError` OLMAYAN hata: gövde jenerik (`INTERNAL_ERROR`), ham mesaj YOK', async () => {
    const rawMessage = 'ham-hata-mesaji-asla-dbye-yazilmamali'
    let handlerCalls = 0

    await startWorkerWith(async () => {
      handlerCalls += 1
      await Promise.resolve()
      throw new Error(rawMessage)
    })

    const { jobId } = await queueService.enqueue(TENANT_PROVISION_JOB, { tenantId })
    createdJobIds.push(jobId)

    const entry = registry.get(TENANT_PROVISION_JOB.name)
    await waitFor(async () => (await entry?.dlqQueue.getWaitingCount()) === 1)

    expect(handlerCalls).toBe(3)

    const row = await readRow(jobId)
    expect(row?.status).toBe(JobStatus.failed)
    expect(JSON.stringify(row?.error)).not.toContain(rawMessage)

    const errorBody = z.object({ code: z.string(), message: z.string() }).parse(row?.error)
    expect(errorBody.code).toBe('INTERNAL_ERROR')
    expect(errorBody.message).toBe('errors.internal.unknown')

    await stopWorkers()
    await obliterateProductionQueues()
  })

  it('kuyruktan okunan payload ŞEMAYI karşılamazsa iş HİÇ yeniden denenmiyor', async () => {
    let handlerCalls = 0
    await startWorkerWith(async () => {
      handlerCalls += 1
      await Promise.resolve()
    })

    const entry = registry.get(TENANT_PROVISION_JOB.name)

    // ⚠ ÜRETİCİ ATLANIYOR (bilerek): `QueueService.enqueue` böyle bir
    // payload'ı ZATEN reddediyor (AC5). Buradaki soru "Redis'e başka bir
    // yoldan girmiş bozuk payload ne olur" — worker'ın TEKRAR parse etmesinin
    // gerekçesi tam bu.
    const probeJobId = 'job_s6_bozuk_payload'
    await entry?.queue.add(
      TENANT_PROVISION_JOB.name,
      // Boş `tenantId` taban şemanın `min(1)` kuralını da kırar → kiracı
      // KURTARILAMAZ, dolayısıyla DB/DLQ muhasebesi YAPILMAZ.
      { tenantId: '' },
      { jobId: probeJobId, attempts: 3, backoff: { type: 'custom' } },
    )

    await waitFor(async () => (await entry?.queue.getFailedCount()) === 1)
    await new Promise((resolve) => setTimeout(resolve, NO_FOURTH_ATTEMPT_WINDOW_MS))

    expect(handlerCalls).toBe(0)

    const bullJob = await entry?.queue.getJob(probeJobId)
    expect(bullJob?.attemptsMade).toBe(1)
    expect(bullJob?.failedReason).toBe('JOB_PAYLOAD_INVALID')
    expect(await entry?.dlqQueue.getWaitingCount()).toBe(0)

    await stopWorkers()
    await obliterateProductionQueues()
  })
})
