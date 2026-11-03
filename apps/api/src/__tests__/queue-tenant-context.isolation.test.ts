// @arkesoft/api — AC5 / CLAUDE.md §7 md 7: WORKER KİRACI BAĞLAMI
// (ROADMAP v0.0.11, T-013/S6, architect K5) — ÇAPRAZ ERİŞİM TESTİ
//
// ⚠ DOSYA ADI `*.isolation.test.ts` OLMAK ZORUNDA: `vitest.isolation.config.ts`
// yalnızca bu deseni toplar ve `vitest.config.ts` onu DIŞLAR (V4 çakışması) →
// test `pnpm --filter @arkesoft/api test:isolation` içinde koşar, `pnpm test`
// içinde İKİ KEZ koşmaz.
//
// NEDEN `createTenantIsolationSuite()` İÇİNE KONULMADI: o süit kiracı
// TABLOLARI üzerinde parametriktir ve `job` TABLOSU için YEDİ senaryosu
// `packages/db`'de ZATEN koşuyor (T-013/S2, `job.probe.ts`). Burada ölçülen
// şey TABLO DEĞİL, KOD YOLU: "worker'ın handler'ına verilen bağlam başka bir
// kiracıya erişebilir mi?" Bu, PM'in R3 riskinin (*"tablo kusursuz RLS'li ama
// worker handler'ı `withTenant` dışında koşuyor"*) TEK savunmasıdır.
//
// ÜÇ ÖLÇÜM:
//   (1) ÜRETİCİ KAPISI: `tenantId`'si eksik payload `enqueue` aşamasında Zod
//       ile reddediliyor; BullMQ'ya HİÇ iş eklenmiyor (kuyruk DERİNLİĞİ
//       ölçülüyor) ve `Job` satırı yazılmıyor.
//   (2) ÇAPRAZ OKUMA: kiracı A payload'ıyla koşan handler, kiracı B'nin
//       GERÇEKTEN VAR OLAN `Job` satırını GÖREMİYOR (0 satır) — "var olmayan"
//       ile "yetkisiz" AYNI sonucu veriyor (varlık oracle'ı kapalı).
//   (3) ÇAPRAZ YAZMA: aynı handler kiracı B'nin satırını GÜNCELLEYEMİYOR
//       (`updateMany` 0 satır) ve B'nin satırı SONRADAN DA değişmemiş olarak
//       ölçülüyor (yazma gerçekten OLMADI, yalnızca sayaç 0 dönmedi).
//
// ⚠ DÖRDÜNCÜ ÖLÇÜM EKLENDİ (T-013 FIX 1, blok (6)): yukarıdaki üçü HANDLER'ın
// yazımlarını ölçüyor; SARMALAYICININ KENDİ durum yazımları (`running` ve
// `completed` geçişleri) hiçbir yerde çapraz erişime karşı ölçülmemişti. FIX 1
// tam o `completed` yazımının `where` yüklemini değiştirdiği için kapsamı
// burada pinleniyor: payload'ı kiracı A'yı beyan eden SAHTE bir iş, kiracı
// B'ye ait bir `id` ile koşturulduğunda B'nin satırını `completed` YAPAMAZ.
//
// ⚠ Kiracı A ve B GERÇEK satırlar (FK `job.tenant_id → tenant.id` sahte
// kimlik kabul etmez); ikisi de testin sonunda silinir.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type { INestApplication } from '@nestjs/common'
import { JobStatus, TenantStatus } from '@arkesoft/db'
import type { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { JobPayloadInvalidError } from '../errors/domain/job-payload-invalid.error.js'
import { createRootLogger } from '../logging/root-logger.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { PRODUCTION_BACKOFF_PROFILE } from '../queue/backoff.js'
import { createJobProcessor, registerJobRunner } from '../queue/job-runner.js'
import type { JobRunnerDependencies } from '../queue/job-runner.js'
import type { JobContext, JobHandler } from '../queue/job-definition.js'
import type { JobPayloadBase } from '../queue/job-payload.base.js'
import { TENANT_PROVISION_JOB } from '../queue/job-registry.js'
import { QueueService } from '../queue/queue.service.js'
import type { JobQueueRegistry } from '../queue/queue.service.js'
import { JOB_QUEUE_REGISTRY, QUEUE_CONNECTION } from '../queue/queue.tokens.js'
import { createDeadLetterPublisher, createJobWorkers } from '../queue/queue-worker.module.js'
import type { JobWorker } from '../queue/queue-worker.module.js'
import { assertQueueCapableRedis } from './helpers/assert-queue-capable-redis.js'
import { createTestApp } from './helpers/create-test-app.js'

const TERMINAL_WAIT_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 25

/** Kiracı B'nin satırına yazılmaya ÇALIŞILAN ilerleme değeri. */
const FOREIGN_WRITE_ATTEMPT_PROGRESS = 99

type CrossTenantObservation = {
  readonly contextTenantId: string
  readonly foreignRowCount: number
  readonly foreignUpdateCount: number
  readonly ownRowCount: number
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

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

const logLineSchema = z.object({ msg: z.string(), tenantId: z.string().optional() })

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

describe('AC5 — worker kiracı bağlamı (§7 md 7): çapraz okuma VE yazma', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let queueService: QueueService
  let registry: JobQueueRegistry
  let connection: Redis
  let workers: readonly JobWorker[] = []
  let logStream: ReturnType<typeof createMemoryLogStream>
  /** Blok (6) sarmalayıcıyı DOĞRUDAN kuruyor → bağımlılıklar blok kapsamında. */
  let dependencies: JobRunnerDependencies

  let tenantAId = ''
  let tenantBId = ''
  let tenantBJobId = ''
  let tenantAJobId = ''

  const observations: CrossTenantObservation[] = []

  /**
   * PROB handler: ÜRETİM sarmalayıcısından (`createJobProcessor`) geçer, ama
   * gövdesi kasıtlı olarak BAŞKA KİRACIYA erişmeye ÇALIŞIR. Üretim
   * handler'ı bir iskelet olduğu için (R-A11) bu denemeyi yapan bir kod
   * yolu başka türlü ölçülemez.
   *
   * ⚠ `ctx.withTenantDb` kiracı parametresi KABUL ETMEZ (K5 katman 2) —
   * handler "başka kiracı adına" bir sorgu AÇAMAZ; yapabileceği en fazla
   * şey KENDİ bağlamında YABANCI BİR `id` denemektir. Testin ölçtüğü tam
   * olarak bu: RLS onu 0 satıra indiriyor mu?
   */
  const crossTenantProbeHandler: JobHandler<JobPayloadBase> = async (_payload, ctx: JobContext) => {
    await ctx.withTenantDb(async (tx) => {
      const foreignRows = await tx.job.findMany({ where: { id: tenantBJobId } })
      const foreignUpdate = await tx.job.updateMany({
        where: { id: tenantBJobId },
        data: { progress: FOREIGN_WRITE_ATTEMPT_PROGRESS },
      })
      const ownRows = await tx.job.findMany({ where: { id: ctx.jobId } })

      observations.push({
        contextTenantId: ctx.tenantId,
        foreignRowCount: foreignRows.length,
        foreignUpdateCount: foreignUpdate.count,
        ownRowCount: ownRows.length,
      })
    })
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

    for (const entry of registry.values()) {
      await entry.queue.obliterate({ force: true })
      await entry.dlqQueue.obliterate({ force: true })
    }

    const tenantA = await prismaService.db.tenant.create({
      data: { slug: uniqueSlug('ac5-kiraci-a'), name: 'AC5 Kiracı A', status: TenantStatus.active },
    })
    const tenantB = await prismaService.db.tenant.create({
      data: { slug: uniqueSlug('ac5-kiraci-b'), name: 'AC5 Kiracı B', status: TenantStatus.active },
    })
    tenantAId = tenantA.id
    tenantBId = tenantB.id

    // Kiracı B'nin GERÇEKTEN VAR OLAN iş kaydı — handler onu görmeye ve
    // güncellemeye çalışacak.
    const tenantBJob = await prismaService.withTenant(tenantBId, (tx) =>
      tx.job.create({
        data: {
          tenantId: tenantBId,
          type: TENANT_PROVISION_JOB.name,
          payload: { tenantId: tenantBId },
        },
        select: { id: true },
      }),
    )
    tenantBJobId = tenantBJob.id

    logStream = createMemoryLogStream()

    dependencies = {
      withTenantDb: (scopedTenantId, callback) =>
        prismaService.withTenant(scopedTenantId, callback),
      publishToDeadLetterQueue: createDeadLetterPublisher(registry),
      logger: createRootLogger({ level: 'debug', stream: logStream.stream }),
    }

    workers = createJobWorkers({
      connection,
      dependencies,
      runners: [registerJobRunner(TENANT_PROVISION_JOB, crossTenantProbeHandler)],
      backoffProfile: PRODUCTION_BACKOFF_PROFILE,
    })

    await Promise.all(workers.map((worker) => worker.waitUntilReady()))
  })

  afterAll(async () => {
    for (const worker of workers) {
      await worker.close()
    }

    for (const entry of registry.values()) {
      await entry.queue.obliterate({ force: true })
      await entry.dlqQueue.obliterate({ force: true })
    }

    // `Tenant` silinmesi `job` satırlarını da düşürür (FK `ON DELETE CASCADE`).
    if (tenantAId !== '') {
      await prismaService.db.tenant.delete({ where: { id: tenantAId } })
    }
    if (tenantBId !== '') {
      await prismaService.db.tenant.delete({ where: { id: tenantBId } })
    }

    if (app !== undefined) {
      await app.close()
    }
  })

  it('(1) `tenantId` EKSİK payload `enqueue` aşamasında REDDEDİLİYOR — kuyruğa HİÇ girmiyor', async () => {
    const entry = registry.get(TENANT_PROVISION_JOB.name)

    const depthBefore = (await entry?.queue.getWaitingCount()) ?? Number.NaN

    await expect(queueService.enqueue(TENANT_PROVISION_JOB, {})).rejects.toThrow(
      JobPayloadInvalidError,
    )
    await expect(queueService.enqueue(TENANT_PROVISION_JOB, { tenantId: '' })).rejects.toThrow(
      JobPayloadInvalidError,
    )

    // Kuyruk DERİNLİĞİ: hiçbir durumda iş eklenmedi (worker açık olduğu için
    // `waiting` + `active` + `delayed` toplamı ölçülüyor).
    expect(depthBefore).toBe(0)
    expect(await entry?.queue.getWaitingCount()).toBe(0)
    expect(await entry?.queue.getActiveCount()).toBe(0)
    expect(await entry?.queue.getDelayedCount()).toBe(0)

    // `Job` satırı da yazılmadı: bu iki kiracının toplam satır sayısı
    // değişmemiş olmalı (A: 0, B: 1).
    const tenantARows = await prismaService.withTenant(tenantAId, (tx) => tx.job.findMany({}))
    const tenantBRows = await prismaService.withTenant(tenantBId, (tx) => tx.job.findMany({}))

    expect(tenantARows).toHaveLength(0)
    expect(tenantBRows).toHaveLength(1)
  })

  it('(2)+(3) kiracı A’nın handler’ı kiracı B’yi NE OKUYABİLİYOR NE YAZABİLİYOR', async () => {
    const { jobId } = await queueService.enqueue(TENANT_PROVISION_JOB, { tenantId: tenantAId })
    tenantAJobId = jobId

    await waitFor(async () => {
      const rows = await prismaService.withTenant(tenantAId, (tx) =>
        tx.job.findMany({ where: { id: jobId }, select: { status: true } }),
      )

      return rows[0]?.status === JobStatus.completed
    })

    expect(observations).toHaveLength(1)

    const observation = observations[0]

    expect(observation?.contextTenantId).toBe(tenantAId)
    // ⚠ Kiracı B'nin satırı GERÇEKTEN VAR; handler onu 0 satır olarak görüyor
    // → "var olmayan" ile "yetkisiz" AYNI cevabı veriyor.
    expect(observation?.foreignRowCount).toBe(0)
    expect(observation?.foreignUpdateCount).toBe(0)
    expect(observation?.ownRowCount).toBe(1)
  })

  it('(3b) kiracı B’nin satırı GERÇEKTEN değişmedi (sayaç 0 dönmesi yeterli kanıt değil)', async () => {
    const rows = await prismaService.withTenant(tenantBId, (tx) =>
      tx.job.findMany({ where: { id: tenantBJobId } }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.progress).toBe(0)
    expect(rows[0]?.progress).not.toBe(FOREIGN_WRITE_ATTEMPT_PROGRESS)
    expect(rows[0]?.status).toBe(JobStatus.queued)
    expect(rows[0]?.startedAt).toBeNull()
  })

  it('(4) kendi satırı kiracı A bağlamında güncellendi; B bağlamından GÖRÜNMÜYOR', async () => {
    const ownRows = await prismaService.withTenant(tenantAId, (tx) =>
      tx.job.findMany({ where: { id: tenantAJobId } }),
    )
    const foreignView = await prismaService.withTenant(tenantBId, (tx) =>
      tx.job.findMany({ where: { id: tenantAJobId } }),
    )

    expect(ownRows).toHaveLength(1)
    expect(ownRows[0]?.status).toBe(JobStatus.completed)
    expect(ownRows[0]?.progress).toBe(100)
    expect(foreignView).toEqual([])
  })

  it('(5) log kayıtları YALNIZCA kiracı A’yı taşıyor (§7 md 13 + sızdırmazlık)', () => {
    const records = logStream
      .getLines()
      .map((line) => logLineSchema.parse(JSON.parse(line) as unknown))
      .filter((record) => record.tenantId !== undefined)

    expect(records.length).toBeGreaterThan(0)

    for (const record of records) {
      expect(record.tenantId).toBe(tenantAId)
    }

    expect(records.some((record) => record.tenantId === tenantBId)).toBe(false)
  })

  // ⚠⚠ BLOK (6) — T-013 FIX 1'in çapraz YAZMA ölçümü. Blok (2)/(3) handler'ın
  // yazımını ölçüyor; burada ölçülen şey SARMALAYICININ KENDİ yazımlarıdır
  // (`running` ve `completed` geçişleri). FIX 1 `completed` yazımının `where`
  // yüklemini sıkılaştırdı; bu test o yazımın KİRACI KAPSAMINI pinler — yüklem
  // bir gün ham bir istemciye veya kiracısız bir yola taşınırsa KIRMIZI olur.
  //
  // ⚠ EN SONA konuldu: blok (3b) kiracı B'nin satırının DEĞİŞMEDİĞİNİ ölçüyor;
  // bu test ondan önce koşarsa (hipotetik bir sızıntıda) onun ölçümünü
  // kirletirdi.
  it('(6) sarmalayıcının KENDİ durum yazımları kiracıya kapsamlı: A payload’ı B’nin işini `completed` YAPAMIYOR', async () => {
    let handlerCalls = 0
    const processor = createJobProcessor(
      {
        ...TENANT_PROVISION_JOB,
        handler: async () => {
          handlerCalls += 1
          await Promise.resolve()
        },
      },
      dependencies,
    )

    // SAHTE İŞ: payload kiracı A'yı BEYAN ediyor, `id` ise kiracı B'nin
    // satırı. Sarmalayıcı bağlamı PAYLOAD'DAN kurar (K5) → `running`,
    // `completed` ve ilerleme yazımlarının HEPSİ A'nın kapsamında açılır.
    await processor({
      id: tenantBJobId,
      data: { tenantId: tenantAId },
      attemptsMade: 0,
      opts: { attempts: TENANT_PROVISION_JOB.attempts },
    })

    // Handler KOŞTU (ölçüm vacuous değil: yol gerçekten ADIM 5'e kadar gitti).
    expect(handlerCalls).toBe(1)

    const tenantBRows = await prismaService.withTenant(tenantBId, (tx) =>
      tx.job.findMany({ where: { id: tenantBJobId } }),
    )

    expect(tenantBRows).toHaveLength(1)
    expect(tenantBRows[0]?.status).toBe(JobStatus.queued)
    expect(tenantBRows[0]?.progress).toBe(0)
    expect(tenantBRows[0]?.startedAt).toBeNull()
    expect(tenantBRows[0]?.completedAt).toBeNull()

    // Kiracı A bağlamında da o `id` ile bir satır DOĞMADI (geçiş yazımları
    // `updateMany`, upsert DEĞİL).
    const tenantAView = await prismaService.withTenant(tenantAId, (tx) =>
      tx.job.findMany({ where: { id: tenantBJobId } }),
    )

    expect(tenantAView).toEqual([])
  })
})
