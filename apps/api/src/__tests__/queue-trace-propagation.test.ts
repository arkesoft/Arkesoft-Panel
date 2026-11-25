// @arkesoft/api — AC-53: traceId'nin ÜÇ HALKA boyunca (HTTP → DB → kuyruk)
// LOG KAYITLARINDA TEK kimlikte kalması (ROADMAP v0.0.17, T-028/S7,
// architect K-A28-1 KUYRUK YAYILIMI + Orkestratör'ün AC-53 inceltmesi)
//
// ⚠⚠ ÖLÇÜM EKSENİ LOG KAYITLARININ `traceId` ALANI — span sayısı DEĞİL
// (gerekçe: S6 `HttpInstrumentation`'ın GELEN istek enstrümantasyonunu
// güvenlik nedeniyle kapattı, `disableIncomingRequestInstrumentation: true`;
// bu yüzden gelen HTTP isteği sunucu span'i ÜRETMİYOR — `traceId` hâlâ S4'ün
// Katman 1 dikişinden, `getCurrentTraceId()`'in yerel üretiminden gelir).
//
// ⚠⚠ GERÇEK HTTP SUNUCUSU KURULMUYOR (S4'ün middleware'leri bu alt görevin
// DOKUNAMAYACAĞI dosyalar — `request-context/*`): "HTTP halkası", bir
// isteğin başında `RequestContextMiddleware`'in YAPTIĞI ŞEYİN AYNISI
// (`requestContextStorage.run()` ile ALS'ye `traceId` taşıyan bir
// `RequestContext` yazmak, `getCurrentTraceId()`'in Katman 1 yerel üretimiyle)
// doğrudan taklit edilerek üretilir — middleware'in KENDİSİ (S4, test edildi,
// `log-correlation.test.ts`) TEKRAR test edilmiyor; ölçülen MY deliverable'ın
// (`queue.service.ts`/`job-runner.ts`) o bağlamı DOĞRU OKUYUP KORUDUĞU.
//
// ÜÇ HALKA — HER BİRİ GERÇEK, TAKLİT EDİLMEYEN bir log kaydı üretir:
//   (1) HTTP  — ALS bağlamı kurulduktan HEMEN SONRA, o bağlamın bağlı
//       logger'ıyla üretilen bir log (middleware'in İLK logu neyi
//       taşıyacaksa AYNI mekanizma: `logger.child({ requestId, traceId })`).
//   (2) DB    — `QueueService.enqueue`'un GERÇEK bir Postgres `queued`
//       satırı yazdıktan SONRA ürettiği `JOB_ENQUEUED_LOG_EVENT`.
//   (3) KUYRUK — GERÇEK BullMQ `Worker`'ın (REGISTERED_JOB_RUNNERS, üretim
//       kayıt defteri) işi Redis'ten GERİ OKUYUP tamamladığı `JOB_COMPLETED_
//       LOG_EVENT` — `traceId` burada ALS'den DEĞİL, Redis'ten geri okunan
//       JSONB payload'dan gelir (üretici→tüketici kanalı budur).

import { Writable } from 'node:stream'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { DEMO_SEED, JobStatus } from '@arkesoft/db'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createRootLogger } from '../logging/root-logger.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { getCurrentTraceId } from '../observability/trace-id.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { PRODUCTION_BACKOFF_PROFILE } from '../queue/backoff.js'
import { TENANT_PROVISION_JOB } from '../queue/job-registry.js'
import { JOB_COMPLETED_LOG_EVENT, JOB_ENQUEUED_LOG_EVENT } from '../queue/queue-log-events.js'
import { QueueService } from '../queue/queue.service.js'
import type { JobQueueRegistry } from '../queue/queue.service.js'
import { JOB_QUEUE_REGISTRY, QUEUE_CONNECTION } from '../queue/queue.tokens.js'
import {
  createDeadLetterPublisher,
  createJobWorkers,
  REGISTERED_JOB_RUNNERS,
} from '../queue/queue-worker.module.js'
import type { JobWorker } from '../queue/queue-worker.module.js'
import { requestContextStorage } from '../request-context/request-context.storage.js'
import type { RequestContext } from '../request-context/request-context.types.js'
import { assertQueueCapableRedis } from './helpers/assert-queue-capable-redis.js'
import { createTestApp } from './helpers/create-test-app.js'

/** `getCurrentTraceId()`'in biçimi — `job-payload.base.ts`'in regex'iyle AYNI. */
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/

/** "HTTP halkası"nın test-özel log mesajı — başka hiçbir üretim yolunda üretilmez. */
const HTTP_RING_LOG_EVENT = 'AC-53 prob: istek bağlamı kuruldu'

/** `Job` satırının terminal duruma geçmesi için üst sınır (ms). */
const TERMINAL_WAIT_TIMEOUT_MS = 15_000

/** Yoklama aralığı (ms). */
const POLL_INTERVAL_MS = 25

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

/** pino'nun ürettiği gevşek kayıt şekli — alanlar OLABİLİR (`optional`). */
const logLineSchema = z.object({
  msg: z.string(),
  traceId: z.string().optional(),
  jobId: z.string().optional(),
})

function parseLogLines(lines: readonly string[]): z.infer<typeof logLineSchema>[] {
  return lines.map((line) => logLineSchema.parse(JSON.parse(line) as unknown))
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + TERMINAL_WAIT_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (await predicate()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(`koşul ${String(TERMINAL_WAIT_TIMEOUT_MS)}ms içinde sağlanmadı`)
}

describe('AC-53 — HTTP → DB → kuyruk zincirinde TEK `traceId` (log kayıtları üzerinden)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let queueService: QueueService
  let registry: JobQueueRegistry
  let connection: Redis
  let workers: readonly JobWorker[] = []
  let tenantId: string
  let logStream: ReturnType<typeof createMemoryLogStream>
  let createdJobId: string | undefined

  beforeAll(async () => {
    logStream = createMemoryLogStream()
    const testApp = await createTestApp({ stream: logStream.stream })
    app = testApp.app
    prismaService = app.get(PrismaService)
    queueService = app.get(QueueService)
    registry = app.get<JobQueueRegistry>(JOB_QUEUE_REGISTRY)
    connection = app.get<Redis>(QUEUE_CONNECTION)

    // ⚠ AC10 KAPISI — İLK ÖLÇÜM. Yanlış Redis'te buradan İLERİ GİDİLMEZ.
    await assertQueueCapableRedis(connection)

    // Temiz başlangıç: önceki koşumların artığı worker'a "gerçek iş" gibi görünür.
    for (const entry of registry.values()) {
      await entry.queue.obliterate({ force: true })
      await entry.dlqQueue.obliterate({ force: true })
    }

    const tenant = await prismaService.db.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })
    expect(tenant).not.toBeNull()
    tenantId = tenant?.id ?? ''

    // ⭐ GERÇEK üretim kayıt defteri (`REGISTERED_JOB_RUNNERS`) — worker'ın
    // kendi eşleşmesi TEKRAR kurulmuyor (queue-happy-path.test.ts emsali).
    workers = createJobWorkers({
      connection,
      dependencies: {
        withTenantDb: (scopedTenantId, callback) =>
          prismaService.withTenant(scopedTenantId, callback),
        publishToDeadLetterQueue: createDeadLetterPublisher(registry),
        // ⭐ AYNI bellek stream'ine yazan BAĞIMSIZ bir logger — Nest DI
        // grafiğinin dışında kurulduğu için `ROOT_LOGGER` provider'ını
        // TEKRAR ÇÖZMEZ, ama AYNI hedefe (`logStream.stream`) yazdığı için
        // NDJSON kaydı TEK bir akışta toplanır.
        logger: createRootLogger({ level: 'debug', stream: logStream.stream }),
      },
      runners: REGISTERED_JOB_RUNNERS,
      backoffProfile: PRODUCTION_BACKOFF_PROFILE,
    })

    await Promise.all(workers.map((worker) => worker.waitUntilReady()))
  })

  afterAll(async () => {
    for (const worker of workers) {
      await worker.close()
    }

    if (tenantId !== '' && createdJobId !== undefined) {
      const jobId = createdJobId
      await prismaService.withTenant(tenantId, (tx) => tx.job.deleteMany({ where: { id: jobId } }))
    }

    for (const entry of registry.values()) {
      await entry.queue.obliterate({ force: true })
      await entry.dlqQueue.obliterate({ force: true })
    }

    if (app !== undefined) {
      await app.close()
    }
  })

  it('üç halka (HTTP/DB/kuyruk) AYNI `traceId`yi taşıyan log kayıtları üretir', async () => {
    // ⭐ Katman 1'in yerel üretimi (`observability/trace-id.ts`) — bu test
    // dosyasında aktif bir OTel span YOK, bu yüzden tek bir rastgele kimlik
    // üretilir ve `RequestContextMiddleware`'in yaptığı gibi ALS'ye SABİTLENİR.
    const rootLogger: Logger = app?.get(ROOT_LOGGER) ?? createRootLogger({ level: 'debug' })
    const traceId = getCurrentTraceId()
    const requestId = `req_ac53_${traceId.slice(0, 8)}`

    const fakeRequestContext: RequestContext = {
      requestId,
      receivedAt: Date.now(),
      logger: rootLogger.child({ requestId, traceId }),
      tenant: { kind: 'pending' },
      auth: { kind: 'pending' },
      client: { ip: null, userAgent: null },
      traceId,
    }

    await requestContextStorage.run(fakeRequestContext, async () => {
      // HALKA 1 — HTTP: isteğin başında kurulan ALS bağlamının KENDİ logu.
      fakeRequestContext.logger.info({}, HTTP_RING_LOG_EVENT)

      // HALKA 2 — DB: `enqueue` Postgres'e `queued` satırını YAZAR, SONRA
      // `JOB_ENQUEUED_LOG_EVENT`'i üretir. `tryGetRequestContext()?.traceId`
      // BURADAKİ `fakeRequestContext.traceId`'yi okur (queue.service.ts).
      const result = await queueService.enqueue(TENANT_PROVISION_JOB, { tenantId })
      createdJobId = result.jobId
    })

    expect(createdJobId).toBeDefined()
    const jobId = createdJobId ?? ''

    // HALKA 3 — KUYRUK: GERÇEK worker Redis'ten işi alır, handler'ı
    // koşturur, `completed` yazar. `traceId` ALS'DEN DEĞİL, Redis'ten GERİ
    // OKUNAN JSONB payload'dan gelir (üretici → tüketici kanalı).
    await waitFor(async () => {
      const rows = await prismaService.withTenant(tenantId, (tx) =>
        tx.job.findMany({ where: { id: jobId }, select: { status: true } }),
      )

      return rows[0]?.status === JobStatus.completed
    })

    const records = parseLogLines(logStream.getLines())

    const httpRing = records.filter((record) => record.msg === HTTP_RING_LOG_EVENT)
    const dbRing = records.filter(
      (record) => record.msg === JOB_ENQUEUED_LOG_EVENT && record.jobId === jobId,
    )
    const queueRing = records.filter(
      (record) => record.msg === JOB_COMPLETED_LOG_EVENT && record.jobId === jobId,
    )

    // ⚠⚠ BOŞA-ÇIKMAMA (1/2): HER halka TAM OLARAK bir kez üretildi — set'in
    // boş OLMADIĞINI VE halka sayısının BEKLENEN sayıya (üç) eşit olduğunu
    // kanıtlar; filtre YANLIŞLIKLA sıfır kayıt eşleştirseydi aşağıdaki
    // `Set` kontrolü SESSİZCE geçerdi (boş küme de tekil sayılır).
    expect(httpRing).toHaveLength(1)
    expect(dbRing).toHaveLength(1)
    expect(queueRing).toHaveLength(1)

    const ringTraceIds = [httpRing[0]?.traceId, dbRing[0]?.traceId, queueRing[0]?.traceId]

    // ⚠⚠ BOŞA-ÇIKMAMA (2/2): her biri GERÇEKTEN `traceId` biçiminde — hepsi
    // `undefined` olsaydı aşağıdaki `Set` kontrolü (3 → 1 öğeli küme) YİNE
    // sessizce geçerdi; bu satır o sahte-yeşili ELER.
    for (const candidate of ringTraceIds) {
      expect(candidate).toMatch(TRACE_ID_PATTERN)
    }

    const uniqueTraceIds = new Set(ringTraceIds)

    expect(uniqueTraceIds.size).toBeGreaterThan(0)
    expect(uniqueTraceIds.size).toBe(1)
    expect(uniqueTraceIds).toEqual(new Set([traceId]))
  })
})
