// @arkesoft/api — ÜRETİCİ: `QueueService.enqueue` (ROADMAP v0.0.11,
// T-013/S5, architect K4)
//
// ⚠⚠ SIRALAMA KARARI — ÖNCE POSTGRES, SONRA BULLMQ. Bağlayıcı:
//
//   1. `withTenant` içinde `queued` satırı yaz  →  satır id'si elde edilir
//   2. `queue.add(name, payload, { jobId: <satır id'si> })`
//
// Ters sıranın kusuru: worker, `Job` satırı HENÜZ YOKKEN işi alabilir
// (BullMQ gecikme vermediğimiz işi anında teslim eder) → sarmalayıcı
// `running` yazmaya çalışır, güncelleyecek satır yoktur, iş kaybolur ve
// müşteri `job.get` ile "böyle bir iş yok" cevabı alır. Bu sırayla en kötü
// durum bunun TERSİ ve ÇOK DAHA İYİSİ: satır yazıldı ama `queue.add`
// reddetti → ortada `queued` kalmış, SORGULANABİLİR bir kayıt var (bayat
// `queued`/`running` tespiti v0.15.0 borcu).
//
// ⚠ `jobId` EŞLEMESİ = `Job.id`. İki kazanç: (a) worker tarafında `job.id`
// doğrudan Postgres satırının anahtarıdır (ikinci bir eşleme tablosu YOK);
// (b) BullMQ aynı `jobId` ile ikinci bir iş ÜRETMEZ — bu doğal tekillik
// testle doğrulandı (`queue-enqueue.test.ts`). ⚠ v0.0.11'de bunun ÜSTÜNE
// uygulama seviyesi bir tekillik anahtarı EKLENMEZ (R-A11, v0.2.0 kapsamı).
//
// ⚠ İŞ TÜRÜNE ÖZGÜ DALLANMA YOK: her şey `JobDefinition` verisinden okunur
// (`name`, `payloadSchema`, `attempts`). Bu dosya hiçbir iş türünün adını
// bilmez.

import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '@arkesoft/db'
import type { Queue } from 'bullmq'

import { JobPayloadInvalidError } from '../errors/domain/job-payload-invalid.error.js'
import { JobTypeNotRegisteredError } from '../errors/domain/job-type-not-registered.error.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import type { JobDefinition } from './job-definition.js'
import type { JobPayloadBase } from './job-payload.base.js'
import {
  CUSTOM_BACKOFF_TYPE,
  JOB_REMOVE_ON_COMPLETE,
  JOB_REMOVE_ON_FAIL_COUNT,
} from './queue-constants.js'
import { JOB_ENQUEUED_LOG_EVENT } from './queue-log-events.js'
import { JOB_QUEUE_REGISTRY, QUEUED_JOB_WRITER } from './queue.tokens.js'

/**
 * Platformun kullandığı `Queue` daraltması. Jenerikleri AÇIKÇA veriyoruz:
 * bullmq'nun varsayılanları `any` (`Queue<DataTypeOrJob = any, ...>`) ve
 * `any` repoda yasak (CLAUDE.md §2) — varsayılanlara bırakmak `add()`
 * çağrısının veri tipini sessizce `any`'e düşürürdü.
 *
 * Sonuç tipi `void`: işin sonucu Postgres'teki `Job` satırında durur,
 * BullMQ'nun `returnvalue` alanında DEĞİL (ikinci doğruluk kaynağı yok).
 *
 * Üçüncü jenerik (iş adı tipi) BİLEREK VERİLMEZ — varsayılanı zaten `string`
 * ve açıkça yazmak lint'in `no-unnecessary-type-arguments` kuralını kırar.
 */
export type JobQueue = Queue<JobPayloadBase, void>

/**
 * Bir iş türünün kuyruk çifti. ⚠ DLQ, BullMQ'nun `failed` KÜMESİ DEĞİL,
 * AYRI ve DAYANIKLI bir kuyruk (K4): `failed` kümesi `removeOnFail`
 * retention'ına tabidir ve yeniden sürülebilir bir yapı değildir.
 * v0.0.11'de DLQ'nun TÜKETİCİSİ YOK (bilinçli, R-A11) — park yeri.
 */
export type JobDeadLetterQueue = Queue<Readonly<Record<string, unknown>>, void>

export type JobQueueEntry = {
  readonly queue: JobQueue
  readonly dlqQueue: JobDeadLetterQueue
}

/** İş adı → kuyruk çifti. `JOB_DEFINITIONS` gezilerek kurulur. */
export type JobQueueRegistry = ReadonlyMap<string, JobQueueEntry>

/** `queued` satırının yazılması için gereken TAM girdi. */
export type CreateQueuedJobInput = {
  /** Kiracı kapsamı — `withTenant()` bununla kurulur. */
  readonly tenantId: string
  /** `Job.type` = iş adı (kuyruk adı). */
  readonly type: string
  /** Zod ile PARSE EDİLMİŞ payload; JSONB kolonuna yazılır. */
  readonly payload: Prisma.InputJsonObject
}

/**
 * `QueueService`'in veritabanından ihtiyaç duyduğu TAM yüzey — tek
 * fonksiyon. Adaptörü `queue.module.ts`'te `PrismaService.withTenant()`
 * üzerinden kurulur.
 *
 * ⚠ NEDEN PORT: (a) `QueueService` Prisma'yı HİÇ GÖRMEZ, dolayısıyla kiracı
 * filtresiz bir sorgu YAZAMAZ — tek yazma yolu kiracı kapsamlı adaptördür;
 * (b) birim testi tek fonksiyonluk bir ikizle kurulabiliyor (`Prisma`nın
 * jenerik delege tiplerini taklit etmek gerekmiyor), böylece SIRALAMA
 * (Postgres → BullMQ) ve `jobId` eşlemesi gerçek assert'lerle pinlenebiliyor.
 */
export type QueuedJobWriter = {
  /** Kiracı kapsamlı transaction içinde satırı yazar; `Job.id` döner. */
  readonly createQueuedJob: (input: CreateQueuedJobInput) => Promise<string>
}

/** `enqueue` sonucu. Çağıran bu id ile `job.get`'i sorgular (T-013/S8). */
export type EnqueueJobResult = {
  readonly jobId: string
}

/**
 * Kuyruk servislerinin logger'dan ihtiyaç duyduğu TAM yüzey. ⚠ `Pick<Logger,
 * 'info' | 'warn'>` DEĞİL — T-013/S3 ölçtü: pino'nun AŞIRI YÜKLENMİŞ `LogFn`
 * imzası yüzünden düz bir test ikizi `TS2322` veriyor. Dar port hem pino'yu
 * (`ROOT_LOGGER` doğrudan geçer) hem testi memnun ediyor.
 *
 * Gövde HER ZAMAN ilk parametre: `tenantId` alanının (CLAUDE.md §7 md 13)
 * yapılandırılmış JSON'da bulunmasını imza seviyesinde zorunlu kılar. Log
 * HER ZAMAN enjekte edilen logger'dan geçer — Node'un küresel konsol
 * nesnesine doğrudan yazılmaz (jeton bitişik yazılmadı: o yasağı denetleyen
 * grep kendi yorumunu bulmasın, AGENT_BASELINE §5).
 */
export type QueueLogger = {
  readonly info: (bindings: Record<string, unknown>, message: string) => void
  readonly warn: (bindings: Record<string, unknown>, message: string) => void
}

@Injectable()
export class QueueService {
  constructor(
    @Inject(JOB_QUEUE_REGISTRY) private readonly registry: JobQueueRegistry,
    @Inject(QUEUED_JOB_WRITER) private readonly writer: QueuedJobWriter,
    @Inject(ROOT_LOGGER) private readonly logger: QueueLogger,
  ) {}

  /**
   * Bir işi kuyruğa alır: doğrula → `queued` satırını yaz → BullMQ'ya ekle.
   *
   * `payload` BİLEREK `unknown`: dış dünyadan gelen hiçbir veriye parse
   * edilmeden tip verilmez (CLAUDE.md §4). Parse edilmiş payload hem
   * JSONB'ye hem BullMQ'ya giden TEK değerdir — iki taraf farklı şeyler
   * görmez.
   *
   * @throws {JobTypeNotRegisteredError} tanımın kuyruk karşılığı yoksa
   * @throws {JobPayloadInvalidError} payload şemayı karşılamıyorsa (iş
   *   KUYRUĞA GİRMEZ, `Job` satırı da YAZILMAZ — AC5)
   */
  async enqueue<P extends JobPayloadBase>(
    definition: JobDefinition<P>,
    payload: unknown,
  ): Promise<EnqueueJobResult> {
    const entry = this.registry.get(definition.name)

    if (entry === undefined) {
      throw new JobTypeNotRegisteredError(definition.name)
    }

    const parseResult = definition.payloadSchema.safeParse(payload)

    if (!parseResult.success) {
      // Yalnızca ALAN YOLLARI — Zod'un ham mesajı ve doğrulanan DEĞER
      // taşınmaz (bkz. `job-payload-invalid.error.ts` dosya başı yorumu).
      throw new JobPayloadInvalidError(
        definition.name,
        parseResult.error.issues.map((issue) => issue.path.join('.')),
      )
    }

    const parsedPayload = parseResult.data
    // `as`: RUNTIME DOĞRULAMASINDAN (Zod `safeParse`) HEMEN SONRA — CLAUDE.md
    // §2'nin tip zorlamaya izin verdiği TEK durum. Zod'un ürettiği düz nesne
    // JSON serileşebilir; Prisma'nın `InputJsonObject`'i yapısal olarak bir
    // JSON nesnesidir ama `readonly` alanlı somut tiplerle yapısal eşleşme
    // kurmaz (indeks imzası yok).
    const payloadForStorage = parsedPayload as Prisma.InputJsonObject

    // ADIM 1 — ÖNCE POSTGRES (sıralama kararı: dosya başı yorumu).
    const jobId = await this.writer.createQueuedJob({
      tenantId: parsedPayload.tenantId,
      type: definition.name,
      payload: payloadForStorage,
    })

    // ADIM 2 — SONRA BULLMQ. `jobId` = `Job.id`.
    await entry.queue.add(definition.name, parsedPayload, {
      jobId,
      attempts: definition.attempts,
      // Özel strateji: gecikmeyi `createBackoffStrategy()` üretir
      // (`backoff.ts`), worker `settings.backoffStrategy` ile bağlar.
      // `delay` BİLEREK VERİLMEZ — özel stratejide kullanılmaz ve vermek
      // "gecikme burada tanımlı" izlenimi yaratırdı.
      backoff: { type: CUSTOM_BACKOFF_TYPE },
      removeOnComplete: JOB_REMOVE_ON_COMPLETE,
      removeOnFail: { count: JOB_REMOVE_ON_FAIL_COUNT },
    })

    this.logger.info(
      { tenantId: parsedPayload.tenantId, jobId, jobName: definition.name },
      JOB_ENQUEUED_LOG_EVENT,
    )

    return { jobId }
  }
}
