// @arkesoft/api — TÜKETİCİ mutlu yolu + sarmalayıcı değişmezleri
// (ROADMAP v0.0.11, T-013/S6, architect K5) — AC4
//
// ⚠ BULLMQ TAKLİT EDİLMİYOR; ÜRETİM kuyruğu (`tenant.provision`), ÜRETİM
// handler'ı ve ÜRETİM backoff profili kullanılıyor. Ölçülmek istenen şey
// "iş gerçekten kuyruktan alınıp koşuyor ve `Job` satırı güncelleniyor mu" —
// sahte bir kuyrukta bu kendi varsayımımızı test etmek olurdu.
//
// Kuyruk testleri AMAÇLANAN Redis'e karşı koşmalı (AC10): `beforeAll`'ın İLK
// satırı `assertQueueCapableRedis` (T-013/S4). Kapı fail-closed — yanlış
// Redis'te bu dosya KIRMIZI verir, sessizce geçmez.
//
// ÜÇ BLOK:
//   (1) AC4 — uçtan uca: enqueue → worker → `completed` + `progress: 100` +
//       `startedAt`/`completedAt` dolu; adım logları `tenantId`+`jobId` taşıyor.
//   (2) Sarmalayıcı değişmezleri REDIS'SİZ: `createJobProcessor` düz bir
//       nesneyle (`ProcessableJob`) çağrılıyor — `progress` MONOTONLUĞU
//       (AC4'ün tek savunması, S2: DB CHECK kısıtı YOK), durum geçişinin
//       İDEMPOTENTLİĞİ ve `startedAt`'in KORUNMASI burada ölçülüyor.
//       ⚠ Bu blok tip zorlaması (`as`) KULLANMIYOR: sarmalayıcının girdisi
//       bilerek dar bir YAPISAL tip (`ProcessableJob`).
//   (3) Nest kablolaması: `WorkerModule` GERÇEKTEN ayağa kalkıyor, iş türü
//       başına bir `Worker` kuruyor; tamlık kapısı eksik/kopya handler'ı
//       REDDEDİYOR; `QueueWorkerModule` `AppModule`'de YOK (AC13 yapısal).
//
// ARTIK BIRAKMAMA (DoD): her blok kendi `Job` satırlarını siler ve dokunduğu
// kuyrukları `obliterate` eder. Tüm veritabanını boşaltan Redis komutları BU
// DOSYADA KULLANILMAZ (başka testlerin `platform:auth:*` durumuna dokunmaz).

import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type { INestApplication, INestApplicationContext } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DEMO_SEED, JobStatus } from '@arkesoft/db'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { JobHandlerNotRegisteredError } from '../errors/domain/job-handler-not-registered.error.js'
import { createRootLogger } from '../logging/root-logger.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { PRODUCTION_BACKOFF_PROFILE } from '../queue/backoff.js'
import { createJobProcessor, registerJobRunner } from '../queue/job-runner.js'
import type {
  DeadLetterEnvelope,
  JobRunnerDependencies,
  ProcessableJob,
} from '../queue/job-runner.js'
import { JOB_DEFINITIONS, TENANT_PROVISION_JOB } from '../queue/job-registry.js'
import { jobPayloadBaseSchema } from '../queue/job-payload.base.js'
import type { JobContext, JobHandler } from '../queue/job-definition.js'
import type { JobPayloadBase } from '../queue/job-payload.base.js'
import {
  JOB_COMPLETED_LOG_EVENT,
  JOB_STARTED_LOG_EVENT,
  TENANT_PROVISION_STEP_LOG_EVENT,
} from '../queue/queue-log-events.js'
import { QUEUE_KEY_PREFIX } from '../queue/queue-constants.js'
import { TENANT_PROVISION_STEPS } from '../queue/jobs/tenant-provision/index.js'
import { QueueService } from '../queue/queue.service.js'
import type { JobQueueRegistry } from '../queue/queue.service.js'
import { JOB_QUEUE_REGISTRY, QUEUE_CONNECTION } from '../queue/queue.tokens.js'
import {
  assertEveryJobDefinitionHasRunner,
  createDeadLetterPublisher,
  createJobWorkers,
  QUEUE_WORKERS,
  REGISTERED_JOB_RUNNERS,
} from '../queue/queue-worker.module.js'
import type { JobWorker } from '../queue/queue-worker.module.js'
import { WorkerModule } from '../worker.module.js'
import { assertQueueCapableRedis } from './helpers/assert-queue-capable-redis.js'
import { createTestApp } from './helpers/create-test-app.js'

/** `Job` satırının terminal duruma geçmesi için beklenen üst sınır (ms). */
const TERMINAL_WAIT_TIMEOUT_MS = 15_000

/** Yoklama aralığı (ms) — kuyruk yerel, kısa aralık yeterli. */
const POLL_INTERVAL_MS = 25

/** Blok (2)'nin prob iş adı — ÜRETİM kuyruk adlarıyla ÇAKIŞMAZ. */
const PROBE_JOB_NAME = 'test.runner-probe'

/** Bellekte NDJSON satırlarını biriktiren `Writable` (`log-correlation.test.ts` emsali). */
function createMemoryLogStream(): { readonly stream: Writable; readonly getLines: () => string[] } {
  const chunks: Buffer[] = []

  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })

  return {
    stream,
    getLines: () =>
      Buffer.concat(chunks)
        .toString('utf-8')
        .split('\n')
        .filter((line) => line.length > 0),
  }
}

const logLineSchema = z.object({
  level: z.string(),
  msg: z.string(),
  tenantId: z.string().optional(),
  jobId: z.string().optional(),
  jobName: z.string().optional(),
  step: z.string().optional(),
  progressPercent: z.number().optional(),
  attemptNumber: z.number().optional(),
})

function parseLogLines(lines: readonly string[]): z.infer<typeof logLineSchema>[] {
  return lines.map((line) => logLineSchema.parse(JSON.parse(line) as unknown))
}

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

describe('(1) AC4 — mutlu yol: üretim kuyruğu + üretim handler’ı', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let queueService: QueueService
  let registry: JobQueueRegistry
  let connection: Redis
  let workers: readonly JobWorker[] = []
  let tenantId: string
  let logStream: ReturnType<typeof createMemoryLogStream>
  const createdJobIds: string[] = []

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    queueService = app.get(QueueService)
    registry = app.get<JobQueueRegistry>(JOB_QUEUE_REGISTRY)
    connection = app.get<Redis>(QUEUE_CONNECTION)

    // ⚠ AC10 KAPISI — İLK ÖLÇÜM. Yanlış Redis'te buradan İLERİ GİDİLMEZ.
    await assertQueueCapableRedis(connection)

    // Temiz başlangıç: önceki koşumların artığı worker'a "gerçek iş" gibi
    // görünür (R-S5-2).
    for (const entry of registry.values()) {
      await entry.queue.obliterate({ force: true })
      await entry.dlqQueue.obliterate({ force: true })
    }

    const tenant = await prismaService.db.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })
    expect(tenant).not.toBeNull()
    tenantId = tenant?.id ?? ''

    logStream = createMemoryLogStream()
    const logger: Logger = createRootLogger({ level: 'debug', stream: logStream.stream })

    const dependencies: JobRunnerDependencies = {
      withTenantDb: (scopedTenantId, callback) =>
        prismaService.withTenant(scopedTenantId, callback),
      publishToDeadLetterQueue: createDeadLetterPublisher(registry),
      logger,
    }

    workers = createJobWorkers({
      connection,
      dependencies,
      // ⚠ ÜRETİM KAYIT DEFTERİ: handler burada YENİDEN EŞLEŞTİRİLMEZ —
      // `REGISTERED_JOB_RUNNERS` üretimde worker'ın kullandığı DİZİNİN
      // KENDİSİ (`queue-worker.module.ts`'teki tek `registerJobRunner`
      // çağrısı). Test kendi eşleşmesini kursaydı üretim eşleşmesi
      // ölçülmemiş kalırdı.
      runners: REGISTERED_JOB_RUNNERS,
      backoffProfile: PRODUCTION_BACKOFF_PROFILE,
    })

    await Promise.all(workers.map((worker) => worker.waitUntilReady()))
  })

  afterAll(async () => {
    for (const worker of workers) {
      await worker.close()
    }

    if (tenantId !== '' && createdJobIds.length > 0) {
      const ids = [...createdJobIds]
      await prismaService.withTenant(tenantId, (tx) =>
        tx.job.deleteMany({ where: { id: { in: ids } } }),
      )
    }

    for (const entry of registry.values()) {
      await entry.queue.obliterate({ force: true })
      await entry.dlqQueue.obliterate({ force: true })
    }

    if (app !== undefined) {
      await app.close()
    }
  })

  it('iş `completed` oluyor; `progress` 100, `startedAt` ve `completedAt` DOLU', async () => {
    const { jobId } = await queueService.enqueue(TENANT_PROVISION_JOB, { tenantId })
    createdJobIds.push(jobId)

    await waitFor(async () => {
      const rows = await prismaService.withTenant(tenantId, (tx) =>
        tx.job.findMany({ where: { id: jobId }, select: { status: true } }),
      )

      return rows[0]?.status === JobStatus.completed
    })

    const rows = await prismaService.withTenant(tenantId, (tx) =>
      tx.job.findMany({ where: { id: jobId } }),
    )
    const row = rows[0]

    expect(row?.status).toBe(JobStatus.completed)
    expect(row?.progress).toBe(100)
    expect(row?.startedAt).not.toBeNull()
    expect(row?.completedAt).not.toBeNull()
    expect(row?.error).toBeNull()
    expect(row?.tenantId).toBe(tenantId)
    expect(row?.type).toBe(TENANT_PROVISION_JOB.name)

    // Zaman sırası: oluşturuldu ≤ başladı ≤ tamamlandı.
    const startedAt = row?.startedAt?.getTime() ?? 0
    const completedAt = row?.completedAt?.getTime() ?? 0
    expect(startedAt).toBeGreaterThanOrEqual(row?.createdAt.getTime() ?? 0)
    expect(completedAt).toBeGreaterThanOrEqual(startedAt)
  })

  it('BullMQ tarafında artık kalmıyor (`removeOnComplete`)', async () => {
    const entry = registry.get(TENANT_PROVISION_JOB.name)

    expect(await entry?.queue.getWaitingCount()).toBe(0)
    expect(await entry?.queue.getCompletedCount()).toBe(0)
    expect(await entry?.queue.getFailedCount()).toBe(0)
    expect(await entry?.dlqQueue.getWaitingCount()).toBe(0)
  })

  it('iskeletin HER adımı loglandı; her kayıtta `tenantId` + `jobId` var (§7 md 13)', () => {
    const records = parseLogLines(logStream.getLines())
    const jobId = createdJobIds[0]

    const stepRecords = records.filter((record) => record.msg === TENANT_PROVISION_STEP_LOG_EVENT)

    expect(stepRecords).toHaveLength(TENANT_PROVISION_STEPS.length)
    expect(stepRecords.map((record) => record.step)).toEqual(
      TENANT_PROVISION_STEPS.map((step) => step.name),
    )
    expect(stepRecords.map((record) => record.progressPercent)).toEqual(
      TENANT_PROVISION_STEPS.map((step) => step.progressPercent),
    )

    for (const record of [
      ...stepRecords,
      ...records.filter((candidate) =>
        [JOB_STARTED_LOG_EVENT, JOB_COMPLETED_LOG_EVENT].includes(candidate.msg),
      ),
    ]) {
      expect(record.tenantId).toBe(tenantId)
      expect(record.jobId).toBe(jobId)
      expect(record.jobName).toBe(TENANT_PROVISION_JOB.name)
    }

    expect(records.filter((record) => record.msg === JOB_COMPLETED_LOG_EVENT)).toHaveLength(1)
  })

  it('iskeletin SON adımı 100 YAZMIYOR — `progress: 100` tamamlama adımının yazımı (AC4)', () => {
    const maxStepProgress = Math.max(...TENANT_PROVISION_STEPS.map((step) => step.progressPercent))

    expect(maxStepProgress).toBeLessThan(100)
  })

  it('üretim handler’ı GERÇEK İŞ YAPMIYOR: kaynak dosyası veritabanına dokunmuyor (R-A11)', () => {
    const handlerSource = readFileSync(
      new URL('../queue/jobs/tenant-provision/handler.ts', import.meta.url),
      'utf-8',
    )
    const codeOnly = handlerSource
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n')

    expect(codeOnly).not.toContain('withTenantDb')
    expect(codeOnly).not.toContain('PrismaService')
  })
})

describe('(2) sarmalayıcı değişmezleri — REDIS’SİZ, düz `ProcessableJob` ile', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let tenantId: string
  let dependencies: JobRunnerDependencies
  let publishedEnvelopes: DeadLetterEnvelope[]
  const createdJobIds: string[] = []

  /** `JOB_DEFINITIONS`'a GİRMEYEN prob tanımı (üretim topolojisine dokunmaz). */
  const probeDefinition = {
    name: PROBE_JOB_NAME,
    payloadSchema: jobPayloadBaseSchema,
    concurrency: 1,
    attempts: 3,
  }

  async function createQueuedRow(): Promise<string> {
    const row = await prismaService.withTenant(tenantId, (tx) =>
      tx.job.create({
        data: { tenantId, type: PROBE_JOB_NAME, payload: { tenantId } },
        select: { id: true },
      }),
    )
    createdJobIds.push(row.id)

    return row.id
  }

  function buildJob(jobId: string, attemptsMade = 0): ProcessableJob {
    return { id: jobId, data: { tenantId }, attemptsMade, opts: { attempts: 3 } }
  }

  async function readRow(
    jobId: string,
  ): Promise<{ status: JobStatus; progress: number; startedAt: Date | null } | undefined> {
    const rows = await prismaService.withTenant(tenantId, (tx) =>
      tx.job.findMany({
        where: { id: jobId },
        select: { status: true, progress: true, startedAt: true },
      }),
    )

    return rows[0]
  }

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    const tenant = await prismaService.db.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })
    expect(tenant).not.toBeNull()
    tenantId = tenant?.id ?? ''

    publishedEnvelopes = []
    dependencies = {
      withTenantDb: (scopedTenantId, callback) =>
        prismaService.withTenant(scopedTenantId, callback),
      publishToDeadLetterQueue: async (envelope) => {
        publishedEnvelopes.push(envelope)
        await Promise.resolve()
      },
      logger: createRootLogger({ level: 'silent' }),
    }
  })

  afterAll(async () => {
    if (tenantId !== '' && createdJobIds.length > 0) {
      const ids = [...createdJobIds]
      await prismaService.withTenant(tenantId, (tx) =>
        tx.job.deleteMany({ where: { id: { in: ids } } }),
      )
    }

    if (app !== undefined) {
      await app.close()
    }
  })

  it('`reportProgress` MONOTON: geri gitmek 0 satır günceller, 100’e KIRPILIR (AC4)', async () => {
    const jobId = await createQueuedRow()
    const observed: number[] = []

    const handler: JobHandler<JobPayloadBase> = async (_payload, ctx: JobContext) => {
      for (const percent of [50, 10, 70, 1000, -5]) {
        await ctx.reportProgress(percent)

        const rows = await ctx.withTenantDb((tx) =>
          tx.job.findMany({ where: { id: ctx.jobId }, select: { progress: true } }),
        )
        observed.push(rows[0]?.progress ?? -1)
      }
    }

    const processor = createJobProcessor({ ...probeDefinition, handler }, dependencies)
    await processor(buildJob(jobId))

    expect(observed).toEqual([50, 50, 70, 100, 100])
    expect(publishedEnvelopes).toEqual([])
  })

  it('handler ÇALIŞIRKEN durum `running`; `startedAt` ilk denemede yazılıyor', async () => {
    const jobId = await createQueuedRow()
    const observedStatuses: JobStatus[] = []

    const handler: JobHandler<JobPayloadBase> = async (_payload, ctx: JobContext) => {
      const rows = await ctx.withTenantDb((tx) =>
        tx.job.findMany({ where: { id: ctx.jobId }, select: { status: true, startedAt: true } }),
      )
      observedStatuses.push(rows[0]?.status ?? JobStatus.queued)
      expect(rows[0]?.startedAt).not.toBeNull()
    }

    const processor = createJobProcessor({ ...probeDefinition, handler }, dependencies)
    await processor(buildJob(jobId))

    expect(observedStatuses).toEqual([JobStatus.running])
    expect((await readRow(jobId))?.status).toBe(JobStatus.completed)
  })

  it('durum geçişi İDEMPOTENT: aynı iş İKİ KEZ koşuyor, `startedAt` KORUNUYOR (K1.c)', async () => {
    const jobId = await createQueuedRow()
    const handler: JobHandler<JobPayloadBase> = async () => {
      await Promise.resolve()
    }
    const processor = createJobProcessor({ ...probeDefinition, handler }, dependencies)

    await processor(buildJob(jobId))
    const afterFirst = await readRow(jobId)

    // İkinci koşum (stalled yeniden teslim emsali): `updateMany` + koşullu
    // `where` sayesinde FIRLATMIYOR.
    await processor(buildJob(jobId, 1))
    const afterSecond = await readRow(jobId)

    expect(afterFirst?.status).toBe(JobStatus.completed)
    expect(afterSecond?.status).toBe(JobStatus.completed)
    expect(afterSecond?.startedAt?.getTime()).toBe(afterFirst?.startedAt?.getTime())
  })

  it('TERMİNAL olmayan satır `completed`/`failed` iken `running`’e GERİ ÇEVRİLMİYOR', async () => {
    const jobId = await createQueuedRow()

    await prismaService.withTenant(tenantId, (tx) =>
      tx.job.updateMany({ where: { id: jobId }, data: { status: JobStatus.failed } }),
    )

    const observedStatuses: JobStatus[] = []
    const handler: JobHandler<JobPayloadBase> = async (_payload, ctx: JobContext) => {
      const rows = await ctx.withTenantDb((tx) =>
        tx.job.findMany({ where: { id: ctx.jobId }, select: { status: true } }),
      )
      observedStatuses.push(rows[0]?.status ?? JobStatus.queued)
    }

    const processor = createJobProcessor({ ...probeDefinition, handler }, dependencies)
    await processor(buildJob(jobId))

    // Handler koşarken satır HÂLÂ `failed`: durum yüklemi onu `running`'e
    // çevirmedi (varsayım değil, ölçüm).
    expect(observedStatuses).toEqual([JobStatus.failed])
  })

  it('kimliği OLMAYAN iş ÇALIŞTIRILMIYOR ve YENİDEN DENENMİYOR', async () => {
    let handlerCalls = 0
    const handler: JobHandler<JobPayloadBase> = async () => {
      handlerCalls += 1
      await Promise.resolve()
    }
    const processor = createJobProcessor({ ...probeDefinition, handler }, dependencies)

    await expect(
      processor({ id: undefined, data: { tenantId }, attemptsMade: 0, opts: { attempts: 3 } }),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' })

    expect(handlerCalls).toBe(0)
  })
})

describe('(3) Nest kablolaması — WorkerModule ayağa kalkıyor, AppModule’e GİRMİYOR', () => {
  let context: INestApplicationContext | undefined
  let workers: readonly JobWorker[] = []

  beforeAll(async () => {
    context = await NestFactory.createApplicationContext(WorkerModule, { logger: false })
    workers = context.get<readonly JobWorker[]>(QUEUE_WORKERS)
  })

  afterAll(async () => {
    for (const worker of workers) {
      await worker.close()
    }

    if (context !== undefined) {
      await context.close()
    }
  })

  it('iş türü BAŞINA bir `Worker`; ad, önek ve eşzamanlılık kayıt defterinden', () => {
    expect(workers).toHaveLength(JOB_DEFINITIONS.length)

    const worker = workers[0]

    expect(worker?.name).toBe(TENANT_PROVISION_JOB.name)
    expect(worker?.opts.prefix).toBe(QUEUE_KEY_PREFIX)
    expect(worker?.opts.concurrency).toBe(TENANT_PROVISION_JOB.concurrency)
    // Backoff stratejisi worker AYARLARINDA (iş seçeneğinde `type: 'custom'`
    // üretici tarafında verildi — ikisi EŞLENİK).
    expect(typeof worker?.opts.settings?.backoffStrategy).toBe('function')
  })

  it('tamlık kapısı: handler’ı OLMAYAN iş türü worker’ı ayağa kaldırmıyor', () => {
    expect(() => {
      assertEveryJobDefinitionHasRunner([...JOB_DEFINITIONS], [])
    }).toThrow(JobHandlerNotRegisteredError)
  })

  it('tamlık kapısı: topolojinin KOPYASIYLA kurulmuş runner REDDEDİLİYOR', () => {
    const copiedTopology = { ...TENANT_PROVISION_JOB }

    expect(() => {
      assertEveryJobDefinitionHasRunner(
        [...JOB_DEFINITIONS],
        [{ topology: copiedTopology, createProcessor: () => () => Promise.resolve() }],
      )
    }).toThrow(JobHandlerNotRegisteredError)
  })

  it('üretim kayıt defteri tamlık kapısından GEÇİYOR', () => {
    expect(() => {
      assertEveryJobDefinitionHasRunner(
        [...JOB_DEFINITIONS],
        [
          registerJobRunner(TENANT_PROVISION_JOB, async () => {
            await Promise.resolve()
          }),
        ],
      )
    }).not.toThrow()
  })

  it('AC13 yapısal: `AppModule` worker modülünü import ETMİYOR', () => {
    const appModuleSource = readFileSync(new URL('../app.module.ts', import.meta.url), 'utf-8')
    const codeOnly = appModuleSource
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n')

    expect(codeOnly).not.toContain('QueueWorkerModule')
    expect(codeOnly).not.toContain('WorkerModule')
  })

  it('AC13 yapısal: `main.worker.ts` HTTP uygulaması kurmuyor', () => {
    const workerEntrySource = readFileSync(new URL('../main.worker.ts', import.meta.url), 'utf-8')
    const codeOnly = workerEntrySource
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n')

    expect(codeOnly).toContain('NestFactory.createApplicationContext')
    expect(codeOnly).not.toContain('NestFactory.create(')
    expect(codeOnly).not.toContain('listen(')
    expect(codeOnly).not.toContain('enableShutdownHooks')
  })
})
