// @arkesoft/api — HANDLER SARMALAYICISI (ROADMAP v0.0.11, T-013/S6,
// architect K5 + K6) — AC4/AC5/AC6'nın ölçtüğü dosya
//
// ⚠⚠ BU DOSYA "TEK YER"DİR (K5): kiracı bağlamının kurulması, `Job` satırının
// durum geçişleri, ilerleme yazımı, hata gövdesi ve DLQ zarfı HER iş türü
// için AYNI koddan geçer. İş türüne özgü hiçbir dallanma YOKTUR — iş türüne
// ait her şey `JobDefinition` verisinden okunur (ad, payload şeması, deneme
// sayısı, handler). İkinci iş türü bu dosyada SIFIR değişiklik demektir.
//
// ⚠ LİTERAL-JETON KURALI (AGENT_BASELINE §5): türe özgü dallanmayı DENETLEYEN
// kontrol `rg "if \(.*type ===" apps/api/src/queue/` — o koşul kalıbı bu
// dizindeki hiçbir dosyada, YORUM İÇİNDE BİLE bitişik yazılamaz; yazılsaydı
// denetim kendi açıklamamızı bulup KALICI YANLIŞ POZİTİF üretirdi. Kalıp bu
// yüzden Türkçe tarif ediliyor.
//
// AKIŞ (architect K5, birebir):
//   1. `payloadSchema.safeParse(job.data)` → başarısız = YENİDEN DENENMEZ
//   2. `ctx` kur (kiracı PARSE EDİLMİŞ payload'dan, `jobId` = `job.id`)
//   3. `withTenantDb` → `queued|running` → `running`, `startedAt` (İDEMPOTENT)
//   4. `await definition.handler(payload, ctx)`
//   5. `withTenantDb` → `queued|running` → `completed`, `progress: 100`,
//      `completedAt` (AC4; durum yüklemi ADIM 3'ün İKİZİ — terminal satır
//      GERİ ÇEVRİLMEZ)
//   6. hata → TAM log + terminal denemede `Job.error` + `status: 'failed'` +
//      DLQ zarfı
//
// ⚠⚠ ADIM BAŞINA TRANSACTION (bağlayıcı): `withTenant` TEK transaction açar
// (`@arkesoft/db` `tenant-context.ts`). Bu yüzden her adım KENDİ
// `withTenantDb` çağrısını yapar; işin TAMAMI tek transaction'a SARILMAZ —
// uzun iş bağlantıyı `idle in transaction` bırakır, kilit tutar ve AC9'un
// "SIGTERM sonrası açık handle yok" disiplinini bozar.
//
// ⚠ NEDEN BULLMQ'NUN `Job` SINIFI DEĞİL, DAR BİR YAPISAL TİP (`ProcessableJob`):
// (a) sarmalayıcı çalışma zamanında bullmq'dan YALNIZCA `UnrecoverableError`'ı
// tüketir — iş yürütme mantığı kütüphane sınıfına bağlı değildir; (b) dar tip
// sayesinde sarmalayıcı DÜZ BİR NESNEYLE birim testi edilebilir, yani
// `as unknown as Job<…>` gibi bir tip zorlamasına İHTİYAÇ YOKTUR (CLAUDE.md §2
// `as`'ı yalnızca Zod doğrulamasından sonra kabul eder). Dar tipin bullmq'nun
// gerçek `Processor` imzasına UYDUĞU, `queue-worker.module.ts`'te `new Worker(
// …, runner.createProcessor(…), …)` çağrısında DERLEME ZAMANINDA kanıtlanır —
// imza bir gün değişirse `pnpm typecheck` KIRILIR.

import { UnrecoverableError } from 'bullmq'
import { JobStatus } from '@arkesoft/db'
import type { Prisma, TenantTransactionClient } from '@arkesoft/db'
import { appErrorBodySchema, isAppError, toErrorBody, unknownErrorBody } from '@arkesoft/errors'
import type { AppErrorBody } from '@arkesoft/errors'
import type { Logger } from 'pino'

import { describeErrorCause } from '../errors/describe-error-cause.js'
import { JobIdentifierMissingError } from '../errors/domain/job-identifier-missing.error.js'
import { JobPayloadInvalidError } from '../errors/domain/job-payload-invalid.error.js'
import type {
  JobContext,
  JobDefinition,
  JobHandler,
  RunnableJobDefinition,
} from './job-definition.js'
import { jobPayloadBaseSchema } from './job-payload.base.js'
import type { JobPayloadBase } from './job-payload.base.js'
import {
  JOB_ATTEMPT_FAILED_LOG_EVENT,
  JOB_COMPLETED_LOG_EVENT,
  JOB_DEAD_LETTERED_LOG_EVENT,
  JOB_IDENTIFIER_MISSING_LOG_EVENT,
  JOB_PAYLOAD_REJECTED_LOG_EVENT,
  JOB_STARTED_LOG_EVENT,
  JOB_TERMINAL_BOOKKEEPING_FAILED_LOG_EVENT,
} from './queue-log-events.js'

/** `Job.progress`'in üst sınırı; tamamlanan iş bu değere SABİTLENİR (AC4). */
export const JOB_PROGRESS_COMPLETE = 100

/** `Job.progress`'in alt sınırı (kolonun varsayılanı da bu). */
export const JOB_PROGRESS_MIN = 0

/**
 * `UnrecoverableError`'a verilen yedek mesaj — `AppError` OLMAYAN bir hata
 * yeniden denenmez olarak sarıldığında kullanılır. ⚠ Ham hata mesajı BURAYA
 * YAZILMAZ: BullMQ bu dizeyi `failedReason` olarak Redis'e kaydeder ve o
 * kayıt kiracıya kapsamlı DEĞİLDİR.
 */
export const UNRECOVERABLE_FALLBACK_REASON = 'JOB_UNRECOVERABLE'

/**
 * Sarmalayıcının bir BullMQ işinden okuduğu TAM yüzey (dosya başı yorumu).
 * `data` BİLEREK `unknown`: Redis'ten geri okunan payload DIŞ VERİDİR ve
 * parse edilmeden tip almaz (CLAUDE.md §4).
 */
export type ProcessableJob = {
  /** ⚠ BullMQ'da OPSİYONEL; bizim üreticimiz her zaman verir (= `Job.id`). */
  readonly id?: string | undefined
  readonly data: unknown
  /**
   * ⚠ ÖLÇÜLDÜ (T-013/S6, gerçek Redis + bullmq@6.5.0): processor İÇİNDE bu
   * sayaç 0 TABANLIDIR (denemeler sırasıyla `0`, `1`, `2`) — BullMQ onu
   * `moveToFailed`/`moveToCompleted` İÇİNDE, yani processor DÖNDÜKTEN SONRA
   * artırır. 1 tabanlı deneme numarası için `resolveAttemptNumber()`.
   */
  readonly attemptsMade: number
  readonly opts: {
    /** Üreticinin verdiği toplam deneme sayısı (`JobDefinition.attempts`). */
    readonly attempts?: number | undefined
  }
}

/** `PrismaService.withTenant` imzasının port hâli (DI'sız, test edilebilir). */
export type TenantScopedDbRunner = <T>(
  tenantId: string,
  callback: (tx: TenantTransactionClient) => Promise<T>,
) => Promise<T>

/**
 * DLQ zarfı — ölü harf kuyruğuna yazılan TEK veri şekli (architect K4:
 * `{ payload, jobId, attemptsMade, failedAt, error }`, üzerine `jobName` ve
 * ⚠ ÜST SEVİYE `tenantId` eklendi).
 *
 * ⚠ `tenantId` HEM üst seviyede HEM `payload` içinde: kuyruk anahtar alanı
 * kiracıya göre BÖLÜNMEDİĞİ için (ADR-0015 Karar 1) zarfın kiracısını okumak
 * payload'ın şeklini BİLMEYİ gerektirmemeli — CLAUDE.md §7 md 7 DLQ'da da
 * geçerlidir ve bunu zarfın BİRİNCİ SINIF alanı yapıyoruz.
 *
 * ⚠ `payload` YALNIZCA PARSE EDİLMİŞ veriden gelir; ham (doğrulanmamış)
 * `job.data` zarfa ASLA yazılmaz — şemanın tanımadığı anahtarlar (bir gün
 * yanlışlıkla gönderilmiş bir sır dahil) böylece zarfa sızamaz. Payload
 * şemayı karşılamadığında zarf yalnızca kurtarılabilen `tenantId`'yi taşır.
 *
 * ⚠ `error` = `toErrorBody()`/`unknownErrorBody()` çıktısı: `AppError.context`
 * ve `httpHeaders` o gövdeye YAPISAL olarak girmez (`error-body.ts:13-22`),
 * yığın izi ve ham mesaj da hiç okunmaz.
 */
export type DeadLetterEnvelope = {
  readonly jobId: string
  readonly jobName: string
  readonly tenantId: string
  /** ⚠ 1 TABANLI terminal deneme numarası (AC6: 3). `failedAt`'teki hâli. */
  readonly attemptsMade: number
  readonly failedAt: string
  readonly payload: JobPayloadBase
  readonly error: AppErrorBody
}

/** DLQ'ya yazan port. Adaptörü `queue-worker.module.ts`'te kayıt defterinden kurulur. */
export type DeadLetterPublisher = (envelope: DeadLetterEnvelope) => Promise<void>

/** Sarmalayıcının dışarıdan aldığı TAM bağımlılık kümesi. */
export type JobRunnerDependencies = {
  /**
   * ⚠ `tenantId` PARAMETRESİ SARMALAYICININ ELİNDE, HANDLER'IN DEĞİL (K5
   * katman 2): handler'a verilen `JobContext.withTenantDb` kiracı parametresi
   * KABUL ETMEZ — "handler başka kiracıyı yazamaz, çünkü yazacak YER YOK".
   */
  readonly withTenantDb: TenantScopedDbRunner
  readonly publishToDeadLetterQueue: DeadLetterPublisher
  /** Kök logger; `logger.child({ tenantId, jobId, jobName })` ile bind edilir. */
  readonly logger: Logger
}

/**
 * 1 TABANLI deneme numarası. ⚠ ÖLÇÜLMÜŞ EŞLEME (bullmq@6.5.0, gerçek Redis):
 * processor içinde `attemptsMade` `0 | 1 | 2`; BullMQ'nun kendi yeniden deneme
 * yüklemi de `attemptsMade + 1 < opts.attempts` (`classes/job.js`) — bu
 * fonksiyon o yüklemle AYNI tabanı kullanır, yani "terminal" kararımız
 * BullMQ'nun fiili davranışıyla kilitlidir.
 */
export function resolveAttemptNumber(attemptsMade: number): number {
  return Math.max(0, Math.trunc(attemptsMade)) + 1
}

/**
 * Bu deneme SON deneme mi? `attempts` BullMQ'nun gördüğü değerdir
 * (`job.opts.attempts`), tanımın değeri yalnızca YEDEKtir — ikisi bir gün
 * ayrışırsa (eski bir iş yeni bir yapılandırmayla karşılaşırsa) terminal
 * kararı BullMQ'nun GERÇEKTE yapacağı şeyle aynı kalır.
 */
export function isFinalAttempt(attemptNumber: number, attempts: number): boolean {
  return attemptNumber >= attempts
}

/** `Job.progress` kolonuna yazılabilir tamsayıya indirger (0–100). */
export function clampProgressPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return JOB_PROGRESS_MIN
  }

  return Math.min(JOB_PROGRESS_COMPLETE, Math.max(JOB_PROGRESS_MIN, Math.trunc(percent)))
}

/**
 * Hatayı tel sözleşmesine çevirir. `AppError` ise `toErrorBody` (dört alan,
 * `context` DIŞARIDA), değilse `unknownErrorBody` (ham mesaj/yığın izi HİÇ
 * OKUNMAZ). `requestId` alanına `jobId` yazılır — iş kayıtlarının korelasyon
 * kimliği odur.
 */
function buildErrorBody(error: unknown, jobId: string): AppErrorBody {
  return isAppError(error) ? toErrorBody(error, jobId) : unknownErrorBody(jobId)
}

/**
 * Hata gövdesini JSONB'ye yazılabilir hâle getirir.
 *
 * ⚠ `appErrorBodySchema.parse` BURADA BİR YAZMA KAPISIDIR, tekrar doğrulama
 * değil: `z.object` tanınmayan anahtarları DÜŞÜRDÜĞÜ için gövdeye bir gün
 * eklenen fazladan bir alan (PII taşıyabilecek) bu kolona SIZAMAZ. S2'nin
 * şema yorumunun verdiği söz ("`Job.error` = `toErrorBody()`'nin birebir
 * çıktısı") böylece MEKANİK olur.
 *
 * `as`: RUNTIME DOĞRULAMASINDAN (Zod `parse`) HEMEN SONRA — CLAUDE.md §2'nin
 * tip zorlamaya izin verdiği TEK durum (S5 emsali, `queue.service.ts:164`).
 */
function toJsonErrorBody(body: AppErrorBody): Prisma.InputJsonObject {
  return appErrorBodySchema.parse(body) as Prisma.InputJsonObject
}

/**
 * Hatayı BullMQ'nun "bir daha denemeyeceksin" sözleşmesine sarar. `cause`
 * KORUNUR (hata zinciri kopmaz). Mesaj olarak YALNIZCA kararlı hata kodu
 * yazılır — BullMQ bu dizeyi Redis'e `failedReason` olarak kaydeder.
 */
function toUnrecoverable(error: unknown): UnrecoverableError {
  const unrecoverable = new UnrecoverableError(
    isAppError(error) ? error.code : UNRECOVERABLE_FALLBACK_REASON,
  )
  unrecoverable.cause = error

  return unrecoverable
}

/**
 * Payload şemayı karşılamasa bile kurtarılabilen kiracı kimliği (yalnızca
 * TEŞHİS ve terminal muhasebe için). Taban şema `{ tenantId }` taşır; o da
 * başarısız olursa kiracı GERÇEKTEN bilinmiyordur.
 */
function readTenantIdForDiagnostics(data: unknown): string | undefined {
  const parsed = jobPayloadBaseSchema.safeParse(data)

  return parsed.success ? parsed.data.tenantId : undefined
}

/**
 * İş türünün worker tarafında KOŞTURULABİLİR hâli. ⚠ Jenerik `P` BURADA
 * SİLİNİR: dışa açılan yüzey (`topology` + `createProcessor`) payload tipini
 * taşımaz, böylece farklı payload şekilleri TEK bir kayıt defteri dizisinde
 * yaşayabilir. `P`'nin `JobPayloadBase`'i genişlettiği (K5 katman 1) kısıt
 * `registerJobRunner`'ın imzasında KORUNUR.
 */
export type RegisteredJobRunner = {
  /**
   * ⚠ KAYIT DEFTERİNDEKİ TANIM NESNESİNİN KENDİSİ (kopyası değil) — worker
   * `attempts`/`concurrency`'yi elle yazamaz; `queue-worker.module.ts`'in
   * tamlık kapısı bunu nesne KİMLİĞİYLE (`===`) doğrular.
   */
  readonly topology: JobTopology
  readonly createProcessor: (dependencies: JobRunnerDependencies) => JobProcessor
}

/**
 * Worker'ın topolojiden ihtiyaç duyduğu TAM yüzey. `payloadSchema`
 * BİLEREK YOK: `Pick<>` ile daraltmak jenerik `P`'yi bu tipten düşürür (bkz.
 * `RegisteredJobRunner`), payload'ın parse edilmesi ise sarmalayıcının
 * KAPANIŞINDA (closure) kalır — yani şema yine TEK kaynaktan okunur.
 */
export type JobTopology = Pick<JobDefinition<JobPayloadBase>, 'name' | 'concurrency' | 'attempts'>

/** Sarmalayıcının ürettiği işleyici (bullmq `Processor`'ına yapısal olarak uyar). */
export type JobProcessor = (job: ProcessableJob) => Promise<void>

/**
 * Bir iş tanımını handler'ıyla eşler. ⚠ EŞLEŞTİRMENİN TEK YERİ bu çağrıdır
 * ve `P` HER İKİ tarafta aynı olmak ZORUNDADIR — payload şemasıyla
 * uyuşmayan bir handler DERLENMEZ (K5 katman 1'in tüketici tarafındaki
 * karşılığı).
 */
export function registerJobRunner<P extends JobPayloadBase>(
  definition: JobDefinition<P>,
  handler: JobHandler<P>,
): RegisteredJobRunner {
  const runnable: RunnableJobDefinition<P> = { ...definition, handler }

  return {
    topology: definition,
    createProcessor: (dependencies) => createJobProcessor(runnable, dependencies),
  }
}

/**
 * Handler sarmalayıcısını üretir (dosya başı akışı). Dönen fonksiyon BullMQ
 * `Worker`'ına processor olarak verilir.
 */
export function createJobProcessor<P extends JobPayloadBase>(
  definition: RunnableJobDefinition<P>,
  dependencies: JobRunnerDependencies,
): JobProcessor {
  const { logger: rootLogger, withTenantDb, publishToDeadLetterQueue } = dependencies
  const jobName = definition.name

  /**
   * Terminal muhasebe: `Job.error` + `status: 'failed'` + DLQ zarfı.
   *
   * ⚠ `Job.error` YALNIZCA TERMİNAL denemede yazılır (architect K5 adım 6'nın
   * "her başarısızlıkta yaz" okumasından BİLİNÇLİ SAPMA, gerekçe ÖLÇÜLDÜ):
   * `@arkesoft/db` `Prisma`'yı YALNIZCA TİP olarak dışa açıyor (`index.ts:52`)
   * → `Prisma.DbNull` DEĞER olarak YOK → nullable bir JSONB kolonunu tekrar
   * NULL'a çekmek bu paketten İMKÂNSIZ. Ara denemede yazılan hata, işin
   * SONRAKİ denemede BAŞARMASI hâlinde satırda BAYAT olarak kalırdı
   * (`completed` + dolu `error` = çelişkili iki doğruluk kaynağı, `job.get`
   * onu kullanıcıya gösterirdi). Ara denemelerin hatası TAM hâliyle LOGA
   * gider (`JOB_ATTEMPT_FAILED_LOG_EVENT`); kolona yalnızca işin TERMİNAL
   * sonucu yazılır. `packages/db`'ye dokunmak bu alt görevin kapsamı dışıdır.
   *
   * ⚠ HATA YUTULMAZ ama ORİJİNAL HATAYI DA MASKELEMEZ: muhasebe adımları
   * başarısız olursa `error` seviyesinde loglanır ve çağıran orijinal iş
   * hatasını BullMQ'ya iletmeye devam eder — muhasebe hatasını fırlatmak
   * yeniden deneme/terminal kararını YANLIŞ hataya göre verdirirdi.
   */
  async function recordTerminalFailure(params: {
    readonly jobId: string
    readonly tenantId: string
    readonly payload: JobPayloadBase
    readonly attemptNumber: number
    readonly error: unknown
    readonly logger: Logger
  }): Promise<void> {
    const errorBody = buildErrorBody(params.error, params.jobId)

    try {
      await withTenantDb(params.tenantId, (tx) =>
        tx.job.updateMany({
          where: { id: params.jobId },
          data: { status: JobStatus.failed, error: toJsonErrorBody(errorBody) },
        }),
      )
    } catch (bookkeepingError: unknown) {
      params.logger.error(
        { ...describeErrorCause(bookkeepingError), stage: 'job-row' },
        JOB_TERMINAL_BOOKKEEPING_FAILED_LOG_EVENT,
      )
    }

    try {
      await publishToDeadLetterQueue({
        jobId: params.jobId,
        jobName,
        tenantId: params.tenantId,
        attemptsMade: params.attemptNumber,
        failedAt: new Date().toISOString(),
        payload: params.payload,
        error: errorBody,
      })

      params.logger.warn(
        { attemptsMade: params.attemptNumber, errorCode: errorBody.code },
        JOB_DEAD_LETTERED_LOG_EVENT,
      )
    } catch (publishError: unknown) {
      params.logger.error(
        { ...describeErrorCause(publishError), stage: 'dead-letter-queue' },
        JOB_TERMINAL_BOOKKEEPING_FAILED_LOG_EVENT,
      )
    }
  }

  return async (job: ProcessableJob): Promise<void> => {
    const jobId = job.id

    if (jobId === undefined) {
      // Kiracı bilinmiyor olabilir; alan yine de GÖVDEDE durur (§7 md 13) —
      // "yok" ile "yazmayı unuttuk" ayırt edilebilsin.
      rootLogger.error(
        { tenantId: readTenantIdForDiagnostics(job.data) ?? null, jobId: null, jobName },
        JOB_IDENTIFIER_MISSING_LOG_EVENT,
      )

      throw toUnrecoverable(new JobIdentifierMissingError(jobName))
    }

    const attemptNumber = resolveAttemptNumber(job.attemptsMade)
    const finalAttempt = isFinalAttempt(attemptNumber, job.opts.attempts ?? definition.attempts)

    // ADIM 1 — payload DIŞ VERİDİR, kuyruktan okunurken TEKRAR parse edilir
    // (üretici de parse etti; araya Redis giriyor).
    const parseResult = definition.payloadSchema.safeParse(job.data)

    if (!parseResult.success) {
      const payloadError = new JobPayloadInvalidError(
        jobName,
        // Yalnızca ALAN YOLLARI — Zod'un ham mesajı DOĞRULANAN DEĞERİ
        // içerebilir (S5 emsali).
        parseResult.error.issues.map((issue) => issue.path.join('.')),
      )
      const diagnosticTenantId = readTenantIdForDiagnostics(job.data)
      const payloadLogger = rootLogger.child({
        tenantId: diagnosticTenantId ?? null,
        jobId,
        jobName,
      })

      payloadLogger.error(
        { attemptNumber, ...describeErrorCause(payloadError) },
        JOB_PAYLOAD_REJECTED_LOG_EVENT,
      )

      if (diagnosticTenantId !== undefined) {
        // Kiracı kurtarılabildi → iş kaydı sorgulanabilir kalsın (AC6 ile
        // AYNI terminal muhasebe). Zarfın payload'ı yalnızca kurtarılan
        // kiracıyı taşır; ham `job.data` zarfa GİRMEZ.
        await recordTerminalFailure({
          jobId,
          tenantId: diagnosticTenantId,
          payload: { tenantId: diagnosticTenantId },
          attemptNumber,
          error: payloadError,
          logger: payloadLogger,
        })
      }

      throw toUnrecoverable(payloadError)
    }

    const payload = parseResult.data
    const { tenantId } = payload

    // ADIM 2 — bağlam. `logger.child` ile `tenantId`/`jobId` bind edilir:
    // handler bu alanları eklemeyi UNUTAMAZ (CLAUDE.md §7 md 13).
    const logger = rootLogger.child({ tenantId, jobId, jobName })

    const context: JobContext = {
      jobId,
      tenantId,
      logger,
      withTenantDb: (callback) => withTenantDb(tenantId, callback),
      reportProgress: async (percent) => {
        const target = clampProgressPercent(percent)

        // ⚠ MONOTONLUK (AC4, R4): `progress: { lt: target }` yüklemi
        // sayesinde GERİ GİTMEK MEKANİK OLARAK İMKÂNSIZ — `job.progress`
        // için bir DB CHECK kısıtı YOK (S2'nin notu), bu yüzden AC4'ün tek
        // savunması BU YÜKLEMDİR. Daha küçük bir değer 0 satır günceller.
        await withTenantDb(tenantId, (tx) =>
          tx.job.updateMany({
            where: { id: jobId, progress: { lt: target } },
            data: { progress: target },
          }),
        )
      },
    }

    logger.info(
      { attemptNumber, attempts: job.opts.attempts ?? definition.attempts },
      JOB_STARTED_LOG_EVENT,
    )

    // ADIM 3 — `running` geçişi İDEMPOTENT (`updateMany` + koşullu `where`,
    // `update` + `throw` DEĞİL): K1.c gereği aynı iş iki kez `running`
    // yazabilir (zorla kapanışta kilit düşer, stalled-checker yeniden
    // teslim eder). `completed`/`failed` bir satır GERİ ÇEVRİLMEZ — durum
    // yüklemi bunu engeller. `startedAt` YALNIZCA ilk kez yazılır: ilk
    // denemenin başlangıç zamanı olgusal bir kayıttır, yeniden denemede
    // ÜZERİNE YAZILMAZ.
    await withTenantDb(tenantId, async (tx) => {
      await tx.job.updateMany({
        where: { id: jobId, status: { in: [JobStatus.queued, JobStatus.running] } },
        data: { status: JobStatus.running },
      })
      await tx.job.updateMany({
        where: { id: jobId, startedAt: null },
        data: { startedAt: new Date() },
      })
    })

    try {
      // ADIM 4 — işin gerçek gövdesi.
      await definition.handler(payload, context)
    } catch (error: unknown) {
      // ADIM 6 — ⚠ `isRetryable` TÜKETİMİ (K6, `app-error.ts:16`'nın önceden
      // yazılmış taahhüdü): TEK jenerik kural, hata SINIFINA değil
      // BAYRAĞINA bakar — `instanceof` zinciri YOK.
      const unrecoverable = isAppError(error) && !error.isRetryable
      const terminal = unrecoverable || finalAttempt

      // TAM hata yalnızca LOGA gider (`Job.error`'a redakte gövde yazılır).
      logger.error(
        { attemptNumber, terminal, unrecoverable, ...describeErrorCause(error) },
        JOB_ATTEMPT_FAILED_LOG_EVENT,
      )

      if (terminal) {
        await recordTerminalFailure({ jobId, tenantId, payload, attemptNumber, error, logger })
      }

      // ⚠ Yeniden denenebilir hata OLDUĞU GİBİ iletilir (BullMQ `failedReason`
      // + yığın izini kaydeder, operatörün teşhis yüzeyi); yeniden
      // DENENMEZ olan `UnrecoverableError`'a sarılır → BullMQ hiç yeniden
      // denemez (AC6'nın ikinci yarısı).
      throw unrecoverable ? toUnrecoverable(error) : error
    }

    // ADIM 5 — AC4. `progress` burada SABİT 100 (monotonluk yüklemi
    // gerekmez: 100 üst sınırdır).
    //
    // ⚠⚠ DURUM YÜKLEMİ ADIM 3'ÜN BİREBİR İKİZİDİR (T-013 FIX 1; `qa` Q-1 /
    // `solid` M-1 aynı kusuru bağımsız olarak ölçtü). Düzeltilen şey
    // ASİMETRİYDİ: ADIM 3 `queued|running` yüklemi taşıyıp terminal bir satırı
    // bilerek GERİ ÇEVİRMEZKEN, bu adım `where: { id: jobId }` ile KOŞULSUZ
    // `completed` yazıyordu. Sonucu ÖLÇÜLDÜ: terminal muhasebesi yapılmış
    // (`failed` + dolu hata kolonu) bir satır — K1.c'nin ÖNGÖRDÜĞÜ stalled
    // yeniden teslimde — `completed`'e dönüyor, hata kolonu ise BAYAT kalıyordu
    // (o kolon NULL'a çekilemiyor; `recordTerminalFailure`'ın gerekçe bloğu).
    // `job.get` o çelişkiyi kullanıcıya TAŞIYORDU.
    //
    // ⚠ YETKİSİZ GEÇİŞTE SATIR NE OLUR: terminal kaldığı gibi kalır
    // (`failed` + hata + `completedAt: null`). Bu "daha az yanlış" olandır:
    // (a) iki doğruluk kaynağı üretmez — kayıtlı terminal sonuç tek kalır;
    // (b) terminal muhasebesi kullanıcıya/operatöre ZATEN bildirildi (DLQ
    // zarfı yazıldı), yani geç gelen başarıyı sessizce `completed` yazmak o
    // bildirimi de yalanlardı; (c) `startedAt`'in "olgusal kayıt ÜZERİNE
    // YAZILMAZ" kuralıyla aynı yöndedir. Geç gelen başarı YUTULMAZ: aşağıdaki
    // kayıt `completedRowCount: 0` ile geçişin REDDEDİLDİĞİNİ söyler ve
    // handler'ın başarısı BullMQ tarafında yine `completed` olur.
    const completion = await withTenantDb(tenantId, (tx) =>
      tx.job.updateMany({
        where: { id: jobId, status: { in: [JobStatus.queued, JobStatus.running] } },
        data: {
          status: JobStatus.completed,
          progress: JOB_PROGRESS_COMPLETE,
          completedAt: new Date(),
        },
      }),
    )

    logger.info({ attemptNumber, completedRowCount: completion.count }, JOB_COMPLETED_LOG_EVENT)
  }
}
