// @arkesoft/api — QueueWorkerModule: TÜKETİCİ tarafı (ROADMAP v0.0.11,
// T-013/S6, architect K4 + K5)
//
// NE KURUYOR: `JOB_DEFINITIONS` kayıt defterini GEZEREK iş türü BAŞINA bir
// BullMQ `Worker`. İş türüne özgü dallanma YOKTUR; ikinci iş türü eklemek
// `REGISTERED_JOB_RUNNERS` dizisine BİR SATIR demektir.
//
// ⚠⚠ BU MODÜL `AppModule`'E GİRMEZ (AC13'ün YAPISAL yarısı). `AppModule`
// yalnızca `QueueModule`'ü (ÜRETİCİ) import eder → HTTP süreci bir işi
// ÜRETİR ama TÜKETEMEZ, script'ler değişse bile. Gerekçe: API sürecinde
// `Worker` ayağa kaldırmak bloke eden Redis bağlantıları ve stalled-checker
// zamanlayıcıları açar, yani v0.0.4'ün AC11 garantisini (SIGTERM → exit 0,
// açık handle yok) HTTP tarafında da riske atardı.
// Denetim: `rg "QueueWorkerModule" apps/api/src/app.module.ts` → 0 eşleşme.
//
// ⚠ BAĞLANTI: `Worker`'lara `QueueModule`'ün `QUEUE_CONNECTION`'ı (`'queue'`
// profili) verilir. ÖLÇÜLDÜ (bullmq@6.5.0, `utils/create-backend.js`):
//   - Worker'ın DÜZENLİ bağlantısı `shared: isRedisInstance(connection)` →
//     bizim örneğimiz PAYLAŞIMLI sayılır ve `worker.close()` onu KAPATMAZ
//     (ölçüm: `close()` sonrası `connection.status === 'ready'`).
//   - BLOKE EDEN fetch için BullMQ bizim örneğimizi `duplicate()` eder ve
//     kopyanın adını `${prefix}:${base64(kuyruk adı)}` yapar; o kopyayı
//     `worker.close()` KENDİSİ kapatır (ölçüm: `CLIENT LIST`'te worker
//     açıkken `arkesoft:queue:dGVuYW50LnByb3Zpc2lvbg==`, kapandıktan sonra
//     YOK).
// Böylece kapanış sorumluluğu ikiye ayrılır ve ÇAKIŞMAZ: kopyalar
// `worker.close()`, paylaşılan örnek `QueueLifecycleService` (S5).
//
// ⚠ `worker.close()` BU MODÜLDE BİR YAŞAM DÖNGÜSÜ KANCASINA BAĞLANMADI
// (architect K1.b, bağlayıcı): `main.worker.ts` onu `app.close()`'tan ÖNCE ve
// AÇIKÇA çağırır. Gerekçe: devam eden handler DB'ye yazıyor olabilir; Prisma
// `$disconnect()`'inin ondan SONRA koşmasını Nest'in yıkım SIRASINA
// bırakmıyoruz (A-A2 ölçülemedi → tasarım sıradan BAĞIMSIZ olmak zorunda).

import { Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'
import { Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'

import { JobHandlerNotRegisteredError } from '../errors/domain/job-handler-not-registered.error.js'
import { JobTypeNotRegisteredError } from '../errors/domain/job-type-not-registered.error.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { PRODUCTION_BACKOFF_PROFILE, createBackoffStrategy } from './backoff.js'
import type { BackoffProfile } from './backoff.js'
import type { JobDefinition } from './job-definition.js'
import { registerJobRunner } from './job-runner.js'
import type {
  DeadLetterPublisher,
  JobRunnerDependencies,
  RegisteredJobRunner,
} from './job-runner.js'
import { JOB_DEFINITIONS } from './job-registry.js'
import { TENANT_PROVISION_JOB } from './job-registry.js'
import type { JobPayloadBase } from './job-payload.base.js'
import { tenantProvisionHandler } from './jobs/tenant-provision/index.js'
import { QUEUE_KEY_PREFIX } from './queue-constants.js'
import { QueueModule } from './queue.module.js'
import type { JobQueueRegistry } from './queue.service.js'
import { JOB_QUEUE_REGISTRY, QUEUE_CONNECTION } from './queue.tokens.js'

/**
 * Tek bir `worker.close()` çağrısının bütçesi (ms) — K1.b.
 *
 * ⚠ BAĞLAYICI İLİŞKİ: `WORKER_CLOSE_TIMEOUT_MS <
 * WORKER_SHUTDOWN_WATCHDOG_MS` → watchdog SON ÇAREdir, normal yolda hiç
 * tetiklenmez. Bütçe dolarsa `main.worker.ts` `close(true)` ile ZORLA kapatır
 * (devam eden iş yarıda kalır; K1.c gereği `failed` YAZILMAZ).
 *
 * ⚠ NEDEN `queue-constants.ts`'TE DEĞİL: o dosya ÜRETİCİ tarafının (S5)
 * sabitlerini taşıyor ve bu alt görevin dosya sahipliği dışında; worker
 * kapanış bütçeleri TÜKETİCİ tarafının kararıdır ve tüketici modülüyle
 * birlikte okunur.
 */
export const WORKER_CLOSE_TIMEOUT_MS = 5000

/** Kapanış izleyicisi (watchdog) bütçesi — `main.ts:63-69`'un BİREBİR değeri. */
export const WORKER_SHUTDOWN_WATCHDOG_MS = 10_000

/** `Worker`'ın platformdaki daraltması. Jenerikler AÇIKÇA verilir (bullmq varsayılanı `any`). */
export type JobWorker = Worker<JobPayloadBase, void>

/**
 * Sarmalayıcıların bağımlılık kümesini taşıyan DI token'ı.
 *
 * ⚠ NEDEN `queue.tokens.ts`'TE DEĞİL: o dosya ÜRETİCİ tarafının (S5) ve bu
 * alt görevin dosya sahipliği dışında. Desen AYNI (`Symbol()` → iki token'ın
 * çakışması referans eşitliği yüzünden imkânsız).
 */
export const JOB_RUNNER_DEPENDENCIES = Symbol('JOB_RUNNER_DEPENDENCIES')

/** Süreçteki TÜM `Worker` örnekleri. `main.worker.ts` kapanışta bunları gezer. */
export const QUEUE_WORKERS = Symbol('QUEUE_WORKERS')

/**
 * ⚠⚠ TANIM ↔ HANDLER EŞLEŞMESİNİN TEK YERİ. `registerJobRunner`'ın jeneriği
 * (`P extends JobPayloadBase`) iki tarafı DERLEME ZAMANINDA kilitler: payload
 * şemasıyla uyuşmayan bir handler DERLENMEZ (K5 katman 1'in tüketici
 * karşılığı).
 *
 * İKİNCİ İŞ TÜRÜ = BİR SATIR.
 */
export const REGISTERED_JOB_RUNNERS: readonly RegisteredJobRunner[] = [
  registerJobRunner(TENANT_PROVISION_JOB, tenantProvisionHandler),
]

/**
 * TAMLIK KAPISI: `JOB_DEFINITIONS`'taki her iş türünün worker tarafında bir
 * runner'ı VAR ve o runner kayıt defterindeki tanım NESNESİNİN KENDİSİNİ
 * taşıyor (kopyasını değil).
 *
 * ⚠ NEDEN AÇILIŞTA FIRLATIYOR (sessizce geçmek yerine): handler'ı olmayan bir
 * iş türü kuyruğa GİRER ama hiçbir worker onu ALMAZ → `Job` satırı sonsuza
 * kadar `queued` kalır ve kimse fark etmez. Emsal: `packages/db`'nin prob
 * tamlığı kapısı. Kapı fail-closed: worker AYAĞA KALKMAZ.
 */
export function assertEveryJobDefinitionHasRunner(
  definitions: readonly JobDefinition<JobPayloadBase>[],
  runners: readonly RegisteredJobRunner[],
): void {
  for (const definition of definitions) {
    const runner = runners.find((candidate) => candidate.topology.name === definition.name)

    if (runner === undefined) {
      throw new JobHandlerNotRegisteredError(definition.name, 'missing-handler')
    }

    if (runner.topology !== definition) {
      throw new JobHandlerNotRegisteredError(definition.name, 'topology-mismatch')
    }
  }
}

/**
 * DLQ yazıcısı. Kuyruk kayıt defterinden (`JOB_QUEUE_REGISTRY`) iş adına
 * karşılık gelen DLQ `Queue`'sunu bulur — kuyruk adı ELLE BİRLEŞTİRİLMEZ
 * (`buildDlqQueueName` zaten kayıt defterini kurarken kullanıldı).
 *
 * ⚠ `jobId: envelope.jobId` → aynı iş için İKİNCİ bir DLQ kaydı OLUŞMAZ
 * (BullMQ'nun doğal `jobId` tekilliği; üreticinin kullandığı MEKANİZMANIN
 * AYNISI, uygulama seviyesi bir tekillik anahtarı EKLENMEDİ — R-A11).
 *
 * ⚠ DLQ'nun TÜKETİCİSİ YOK (bilinçli, R-A11): zarflar `wait` listesinde
 * DAYANIKLI olarak bekler, retention seçeneği VERİLMEZ — bir park yerinin
 * kendi kendini silmesi onu park yeri olmaktan çıkarırdı.
 */
export function createDeadLetterPublisher(registry: JobQueueRegistry): DeadLetterPublisher {
  return async (envelope) => {
    const entry = registry.get(envelope.jobName)

    if (entry === undefined) {
      throw new JobTypeNotRegisteredError(envelope.jobName)
    }

    await entry.dlqQueue.add(envelope.jobName, envelope, { jobId: envelope.jobId })
  }
}

export type CreateJobWorkersParams = {
  readonly connection: Redis
  readonly dependencies: JobRunnerDependencies
  readonly runners: readonly RegisteredJobRunner[]
  /**
   * ⚠ Gecikmenin DEĞERİ DI ile enjekte edilir, SAATİ ilerletilmez (K6).
   * Üretimde `PRODUCTION_BACKOFF_PROFILE`; AC6 entegrasyon testi kısa bir
   * profil (`{ baseDelayMs: 25 }`) verir. Bu EŞİK DÜŞÜRMEK DEĞİLDİR: AC6'nın
   * ölçtüğü şey DENEME SAYISI ve TERMİNAL KONUM, üretim gecikmesi AC7'de
   * AYRICA ve bağımsız olarak pinlidir (`backoff.test.ts`).
   */
  readonly backoffProfile: BackoffProfile
}

/**
 * Her runner için bir `Worker` kurar.
 *
 * ⚠ `prefix` ZORUNLU ve üreticiyle AYNI (`QUEUE_KEY_PREFIX`): verilmezse
 * worker BullMQ'nun varsayılan `bull` önekine bakar ve ÜRETİCİNİN KUYRUĞUNU
 * GÖRMEZ — test "iş hiç gelmiyor" der (S5'in işaretlediği en kolay hata).
 *
 * ⚠ `concurrency` kayıt defterinden gelir (`definition.concurrency`), literal
 * sayı YAZILMAZ. `attempts`/`backoff.type`/retention iş SEÇENEKLERİNDE,
 * yani ÜRETİCİ tarafında verildi — burada TEKRAR verilmez.
 */
export function createJobWorkers(params: CreateJobWorkersParams): readonly JobWorker[] {
  const backoffStrategy = createBackoffStrategy(params.backoffProfile)

  return params.runners.map(
    (runner) =>
      // Dar yapısal processor tipinin (`JobProcessor`) bullmq'nun gerçek
      // `Processor` imzasına UYDUĞU tam burada DERLEME ZAMANINDA kanıtlanır.
      new Worker<JobPayloadBase, void>(
        runner.topology.name,
        runner.createProcessor(params.dependencies),
        {
          connection: params.connection,
          prefix: QUEUE_KEY_PREFIX,
          concurrency: runner.topology.concurrency,
          settings: { backoffStrategy },
        },
      ),
  )
}

/**
 * Sarmalayıcıların bağımlılıkları. ⚠ `withTenantDb` BURADA `PrismaService.
 * withTenant`'a bağlanır — handler'ların kendisi `PrismaService`'i GÖREMEZ
 * (K5 katman 3: DI yok; katman 4: `src/queue/jobs/**` için lint yasağı).
 */
const jobRunnerDependenciesProvider: Provider = {
  provide: JOB_RUNNER_DEPENDENCIES,
  useFactory: (
    prisma: PrismaService,
    registry: JobQueueRegistry,
    logger: Logger,
  ): JobRunnerDependencies => ({
    withTenantDb: (tenantId, callback) => prisma.withTenant(tenantId, callback),
    publishToDeadLetterQueue: createDeadLetterPublisher(registry),
    logger,
  }),
  inject: [PrismaService, JOB_QUEUE_REGISTRY, ROOT_LOGGER],
}

const queueWorkersProvider: Provider = {
  provide: QUEUE_WORKERS,
  useFactory: (connection: Redis, dependencies: JobRunnerDependencies): readonly JobWorker[] => {
    // Fail-closed: eksik handler worker'ı AYAĞA KALDIRMAZ.
    assertEveryJobDefinitionHasRunner([...JOB_DEFINITIONS], REGISTERED_JOB_RUNNERS)

    return createJobWorkers({
      connection,
      dependencies,
      runners: REGISTERED_JOB_RUNNERS,
      backoffProfile: PRODUCTION_BACKOFF_PROFILE,
    })
  },
  inject: [QUEUE_CONNECTION, JOB_RUNNER_DEPENDENCIES],
}

@Module({
  imports: [QueueModule],
  providers: [jobRunnerDependenciesProvider, queueWorkersProvider],
  exports: [QUEUE_WORKERS],
})
export class QueueWorkerModule {}
