// @arkesoft/api — `qa` gate'inin M-1 PROB TESTİ (ROADMAP v0.0.11, T-013/qa tur 1)
//
// ⚠ NEDEN VAR: `solid` tur 1 M-1 bulgusu (`medium`, sorumlu `qa` + `backend`)
// `queue-happy-path.test.ts`'te ÖLÇÜLMEYEN tek senaryoyu işaret etti:
// "bir deneme BAŞARISIZ olup sonrakinde BAŞARAN iş". O dosyanın
// "aynı iş iki kez koşuyor" testi HER ZAMAN BAŞARILI bir handler kullanıyor,
// yani `Job.error` kolonuna hiç dokunulmadan geçiyor. Oysa
// `packages/trpc/src/schemas/job-summary.schema.ts:93-96` tele şunu BEYAN
// EDİYOR: "`status === 'completed'` ile dolu bir `error` birlikte GÖRÜLEMEZ."
//
// Bu dosya o beyanı ARA DENEME yolunda ölçer: `attempts: 3`, 1. ve 2. deneme
// fırlatıyor, 3. deneme başarıyor → `completed` + `error === null` + handler
// 3 kez çağrıldı + DLQ zarfı YOK. ⚠ Bu yolda beyan GERÇEKTEN TUTUYOR, çünkü
// ara denemeler terminal DEĞİL ve `recordTerminalFailure` hiç çağrılmıyor.
//
// ⚠ İki senaryoya `qa`'nın raporundaki adlarla YOL (1) / YOL (2) deniyor.
// YOL (1)'in testi `qa`'nın bıraktığı hâliyle, BAYT BİREBİR duruyor — adı da
// gövdesi de değiştirilmedi.
//
// ⚠⚠ İKİNCİ YOL ARTIK BU DOSYADA — YOL (2) (T-013 FIX 1, `backend`):
// "TERMİNAL başarısızlıktan SONRA yeniden teslim" yolunda satır `completed`
// olurken `error` BAYAT KALIYORDU (`qa`'nın ölçtüğü gerçek değer:
// `.claude/workflow/reviews/T-013-qa-tur1.md`, bulgu Q-1). Sebep yapısaldı:
// `job-runner.ts` ADIM 3 durum yüklemi taşırken ADIM 5 KOŞULSUZ yazıyor ve
// hata kolonunu TEMİZLEYEMİYORDU (S6 kararı 1: o kolonu NULL'a çekecek değer
// `@arkesoft/db`'den dışa açılmıyor). Düzeltme ADIM 5'e ADIM 3'ün durum
// yüklemini ekledi → terminal satır GERİ ÇEVRİLMEZ. `qa`'nın kırmızı probu bu
// dosyada REGRESYON TESTİ olarak yaşıyor; beklentileri gevşetilmedi,
// DÜZELTMENİN KARARINA göre KESKİNLEŞTİRİLDİ (YOL (2)'nin yorumuna bak).
//
// ⚠ REDIS KULLANILMIYOR: ölçülen şey sarmalayıcının `Job` satırına yazdığı
// durum geçişleridir, kuyruk taşıması değil. `queue-happy-path.test.ts`
// blok (2)'nin BİREBİR deseni — düz bir `ProcessableJob` nesnesi, tip
// zorlaması (`as`) YOK.
//
// ARTIK BIRAKMAMA (DoD): `afterAll` kendi oluşturduğu `Job` satırlarını siler;
// hiçbir kuyruğa yazmadığı için `obliterate` gerekmez.

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { DEMO_SEED, JobStatus } from '@arkesoft/db'
import { AppError } from '@arkesoft/errors'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createRootLogger } from '../logging/root-logger.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createJobProcessor } from '../queue/job-runner.js'
import type {
  DeadLetterEnvelope,
  JobRunnerDependencies,
  ProcessableJob,
} from '../queue/job-runner.js'
import { jobPayloadBaseSchema } from '../queue/job-payload.base.js'
import type { JobHandler } from '../queue/job-definition.js'
import type { JobPayloadBase } from '../queue/job-payload.base.js'
import { createTestApp } from './helpers/create-test-app.js'

/** Bu dosyanın prob iş adı — ÜRETİM kuyruk/iş adlarıyla ÇAKIŞMAZ. */
const PROBE_JOB_NAME = 'test.qa-error-invariant-probe'

/** Üretim tanımıyla aynı deneme sayısı (`TENANT_PROVISION_JOB.attempts`). */
const PROBE_ATTEMPTS = 3

/** Yeniden DENENEBİLİR prob hatası (`queue-dlq.test.ts` emsali). */
class QaRetryableError extends AppError {
  constructor() {
    super({
      code: 'QA_PROBE_RETRYABLE',
      httpStatus: 503,
      userMessageKey: 'errors.probe.retryable',
      isRetryable: true,
    })
  }
}

type ObservedRow = {
  readonly status: JobStatus
  readonly progress: number
  readonly error: unknown
  readonly completedAt: Date | null
}

describe('M-1 — `completed` + dolu `error` tel değişmezi (prob)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let tenantId = ''
  let dependencies: JobRunnerDependencies
  let publishedEnvelopes: DeadLetterEnvelope[] = []
  const createdJobIds: string[] = []

  const probeDefinition = {
    name: PROBE_JOB_NAME,
    payloadSchema: jobPayloadBaseSchema,
    concurrency: 1,
    attempts: PROBE_ATTEMPTS,
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

  function buildJob(jobId: string, attemptsMade: number): ProcessableJob {
    return { id: jobId, data: { tenantId }, attemptsMade, opts: { attempts: PROBE_ATTEMPTS } }
  }

  async function readRow(jobId: string): Promise<ObservedRow | undefined> {
    const rows = await prismaService.withTenant(tenantId, (tx) =>
      tx.job.findMany({
        where: { id: jobId },
        select: { status: true, progress: true, error: true, completedAt: true },
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

  it('1. ve 2. deneme BAŞARISIZ, 3. deneme BAŞARILI → `completed` + `error === null`', async () => {
    const jobId = await createQueuedRow()
    let handlerCalls = 0

    const handler: JobHandler<JobPayloadBase> = async () => {
      handlerCalls += 1
      await Promise.resolve()

      if (handlerCalls < PROBE_ATTEMPTS) {
        throw new QaRetryableError()
      }
    }

    const processor = createJobProcessor({ ...probeDefinition, handler }, dependencies)

    // BullMQ'nun yeniden deneme döngüsünün SARMALAYICI tarafındaki karşılığı:
    // processor aynı `jobId` için 0 TABANLI `attemptsMade` ile tekrar çağrılır
    // (ÖLÇÜLMÜŞ semantik, S6 — `ProcessableJob.attemptsMade` yorumu).
    await expect(processor(buildJob(jobId, 0))).rejects.toMatchObject({
      code: 'QA_PROBE_RETRYABLE',
    })
    const afterFirst = await readRow(jobId)

    await expect(processor(buildJob(jobId, 1))).rejects.toMatchObject({
      code: 'QA_PROBE_RETRYABLE',
    })
    const afterSecond = await readRow(jobId)

    await processor(buildJob(jobId, 2))
    const afterThird = await readRow(jobId)

    expect(handlerCalls).toBe(PROBE_ATTEMPTS)

    // ARA denemeler terminal DEĞİL → `Job.error` HİÇ yazılmadı, DLQ zarfı YOK.
    // ⚠ Satır denemeler arasında `running` KALIYOR (`queued`'a geri DÖNMÜYOR) —
    // ölçüm, varsayım değil.
    expect(afterFirst?.status).toBe(JobStatus.running)
    expect(afterFirst?.error).toBeNull()
    expect(afterSecond?.status).toBe(JobStatus.running)
    expect(afterSecond?.error).toBeNull()
    expect(publishedEnvelopes).toEqual([])

    // Tel beyanı (job-summary.schema.ts:93-96) bu yolda GERÇEKTEN tutuyor.
    expect(afterThird?.status).toBe(JobStatus.completed)
    expect(afterThird?.progress).toBe(100)
    expect(afterThird?.completedAt).not.toBeNull()
    expect(afterThird?.error).toBeNull()
  })

  // ⚠⚠ YOL (2) — `qa`'nın KIRMIZI probu, REGRESYON TESTİ olarak
  // (T-013 FIX 1 / Q-1 · M-1). Kaynağı `qa`'nın raporundaki testtir; kurgu
  // (handler, `attemptsMade`, okuma noktaları) BİREBİR korundu.
  //
  // ⚠ İKİ BEKLENTİ DEĞİŞTİ ve İKİSİ DE KESKİNLEŞTİRME, GEVŞETME DEĞİL:
  //   (a) `qa`'nın `expect(status).toBe(completed)` satırı KUSURUN KENDİSİNİ
  //       pinliyordu ("ADIM 5 koşulsuz yazdı"). Düzeltmeden sonra doğru
  //       beklenti "terminal satır GERİ ÇEVRİLMEDİ" → `failed` KALIR, ve
  //       ADIM 5'in yazımı BİR BÜTÜN olarak atlanır (`progress` ve
  //       `completedAt` de yazılmaz). Üçü birlikte assert ediliyor.
  //   (b) Tel değişmezi (`job-summary.schema.ts`) artık DOĞRUDAN, durumdan
  //       türetilmeden assert ediliyor: "`completed` İLE dolu hata kolonu
  //       BİRLİKTE görülemez". Bu assert, ADIM 5'in yüklemi bir gün
  //       kaldırılırsa KIRMIZI olur (mutasyonla ölçüldü) — yani değişmezin
  //       bekçisi, kusurun fotoğrafı değil.
  it('TERMİNAL başarısızlıktan sonra yeniden teslim → satır terminal KALIR, `completed` ile dolu hata BİRLİKTE görülemez', async () => {
    const jobId = await createQueuedRow()
    let handlerCalls = 0

    const handler: JobHandler<JobPayloadBase> = async () => {
      handlerCalls += 1
      await Promise.resolve()

      // İlk (TERMİNAL) denemede başarısız; yeniden teslimde başarılı.
      if (handlerCalls === 1) {
        throw new QaRetryableError()
      }
    }

    const processor = createJobProcessor({ ...probeDefinition, handler }, dependencies)

    // `attemptsMade: 2` → 1 tabanlı deneme 3 = SON deneme → terminal muhasebe.
    await expect(processor(buildJob(jobId, 2))).rejects.toMatchObject({
      code: 'QA_PROBE_RETRYABLE',
    })

    const afterTerminal = await readRow(jobId)
    expect(afterTerminal?.status).toBe(JobStatus.failed)
    expect(afterTerminal?.error).not.toBeNull()
    expect(publishedEnvelopes).toHaveLength(1)

    // K1.c: zorla kapanış/stalled yeniden teslim aynı `jobId`'yi TEKRAR
    // koşturabilir ve bu kez handler BAŞARIR.
    await processor(buildJob(jobId, 2))

    const afterRedelivery = await readRow(jobId)
    expect(handlerCalls).toBe(2)

    // (a) ⚠ TEL DEĞİŞMEZİNİN KENDİSİ (`job-summary.schema.ts`): tamamlanmış
    // bir durum ile dolu bir hata kolonu BİRLİKTE GÖRÜLEMEZ. Durumdan
    // türetilmeden, iki alanın ÇİFTİ üzerinden assert ediliyor. ⚠ Bu assert
    // İLK sırada: ADIM 5'in durum yüklemi kaldırılırsa dosyanın İLK kırmızısı
    // doğrudan DEĞİŞMEZ olur, türevi değil.
    expect({
      isCompleted: afterRedelivery?.status === JobStatus.completed,
      hasError: afterRedelivery?.error !== null,
    }).not.toEqual({ isCompleted: true, hasError: true })

    // (b) YETKİSİZ GEÇİŞ YAPILMADI: ADIM 5'in üç yazımı da atlandı.
    expect(afterRedelivery?.status).toBe(JobStatus.failed)
    expect(afterRedelivery?.progress).toBe(0)
    expect(afterRedelivery?.completedAt).toBeNull()

    // Terminal sonuç KORUNDU (geç gelen başarı onu silmedi).
    expect(afterRedelivery?.error).not.toBeNull()
    expect(publishedEnvelopes).toHaveLength(1)
  })
})
