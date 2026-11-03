// @arkesoft/api — Redis bağlantı fabrikası, İKİ PROFİL (ROADMAP v0.0.11,
// T-013/S3, architect K1.a)
//
// NEDEN BU DOSYA VAR: v0.0.4'ten beri tek bir `ioredis` örneği vardı ve
// seçenekleri `redis.module.ts`'in provider fabrikasının İÇİNDE satır içi
// duruyordu. v0.0.11 BullMQ'yu getiriyor ve BullMQ **aynı istemciyi
// PAYLAŞAMAZ**:
//
//   1. BullMQ BLOKE EDEN komutlar kullanır (`BZPOPMIN`/`BRPOPLPUSH`) — bunlar
//      bilerek saniyeler boyunca yanıt dönmez. Sağlık profilinin
//      `commandTimeout: 1500` değeri bu komutları SİSTEMATİK olarak "Command
//      timed out" ile düşürürdü.
//   2. BullMQ `maxRetriesPerRequest`'in **`null`** olmasını şart koşar; aksi
//      hâlde bağlantı kesintisinde bekleyen komutlar hata ile düşer ve kuyruk
//      tutarsız kalır.
//
// NEDEN İKİ DOSYA DEĞİL, TEK FABRİKA: `redis.module.ts`'in iki ATLANAMAZ
// değişmezi var — (1) zorunlu `'error'` dinleyicisi, (2) üst SINIRLI
// `retryStrategy`. Bunları ikinci bir dosyada KOPYALAMAK bu reponun
// tekrarlayan kusur sınıfı (kopya kaydı birbirinden ayrı evriliyor). Bu
// yüzden her iki profil de BU fabrikadan geçer; `REDIS_CLIENT` token'ı
// kuyruğa HİÇ verilmez (kuyruk kendi bağlantılarını `'queue'` profiliyle
// kurar).
//
// `'error'` DİNLEYİCİSİ ZORUNLU, ATLANAMAZ: Node'un varsayılan davranışı,
// dinleyicisi OLMAYAN bir `EventEmitter`'da `'error'` olayı fırlatıldığında
// istisnayı YUKARI FIRLATIP SÜRECİ DÜŞÜRMEKTİR. Dinleyici eklenmezse Redis
// kapalıyken TEK bağlantı hatası API/worker sürecini çökertir — "Redis
// kapalıyken API yaşar, `/health/ready` 503 der" kararı (v0.0.4, K-A8)
// sessizce iptal olur. Log seli olmaması için `warn` THROTTLE'lıdır (en az
// `ERROR_LOG_THROTTLE_MS` arayla).
//
// ⚠ R-A4 (SIFIR DAVRANIŞ DEĞİŞİKLİĞİ): `'health'` profilinin dört değeri
// v0.0.4'teki satır içi seçeneklerin BİREBİR aynısıdır. "Tutarlılık için"
// hiçbiri değiştirilmedi; `'queue'` ile ortaklaştırılmak İÇİN de
// gevşetilmedi. `'health'` bilerek `connectionName` TAŞIMAZ — eklemek
// bağlantı kurulumunda fazladan bir `CLIENT SETNAME` komutu üretirdi, yani
// gözlemlenebilir bir davranış değişikliği olurdu.

import { Redis } from 'ioredis'
import type { RedisOptions } from 'ioredis'

import { assertNever } from '../errors/assert-never.js'
import { describeErrorCause } from '../errors/describe-error-cause.js'
import type { ErrorCauseDescription } from '../errors/describe-error-cause.js'

/** Log selini önlemek için `'error'` olayının en az bu kadar ms arayla loglanması. */
const ERROR_LOG_THROTTLE_MS = 10_000

/** Üst sınırlı backoff'un deneme başına artış adımı (ms). */
const RETRY_BACKOFF_STEP_MS = 200

/** Backoff'un ASLA aşmadığı üst sınır (ms) — sınırsız artan bekleme YOK. */
const RETRY_BACKOFF_CEILING_MS = 2000

/** `'health'`: bekleyen komut en fazla bir kez yeniden denenir. */
const HEALTH_MAX_RETRIES_PER_REQUEST = 1

/** `'health'`: tek bir komut bu süreyi aşarsa düşer (hızlı başarısız olma). */
const HEALTH_COMMAND_TIMEOUT_MS = 1500

/** `'health'`: TCP bağlantısı bu süre içinde kurulmazsa düşer. */
const HEALTH_CONNECT_TIMEOUT_MS = 2000

/**
 * `'queue'` bağlantı adının öneki. ⚠ TEK KAYNAK: AC9 ölçümü (T-013/S7)
 * `CLIENT LIST` çıktısında `name=<bu önek>-<pid>` arıyor. Ad şeması
 * değişirse o ölçüm sessizce "0 bağlantı" görür ve test YANLIŞ YEŞİL verir.
 */
const QUEUE_CONNECTION_NAME_PREFIX = 'arkesoft-worker'

/**
 * Bağlantı profili.
 *
 * - `'health'` — HIZLI BAŞARISIZ OLUR: kısa komut/bağlantı zaman aşımı,
 *   sınırlı istek yeniden denemesi. `/health/ready` ve oran sınırlayıcı
 *   sayaçları gibi istek yolu üzerindeki kısa komutlar için.
 * - `'queue'` — BLOKE EDEN KOMUTLARA DAYANIR: komut zaman aşımı YOK,
 *   `maxRetriesPerRequest: null`, hazır-olma kontrolü kapalı. BullMQ
 *   `Queue`/`Worker` örnekleri için.
 */
export type RedisConnectionProfile = 'health' | 'queue'

/**
 * Üst SINIRLI (en fazla `RETRY_BACKOFF_CEILING_MS`) backoff — sınırsız artan
 * bekleme YOK. `ioredis`'in `retryStrategy`'si: dönen sayı bir sonraki
 * denemeden önce beklenecek ms; `null`/`undefined` dönerse istemci yeniden
 * denemeyi durdurur (bilerek kullanılmıyor — Redis kapalıyken sonsuz deneme,
 * bağlantı geri geldiğinde otomatik iyileşme ister, K-A8).
 *
 * ⚠ HER İKİ PROFİL de bunu kullanır. `ioredis`'in KENDİ varsayılanı
 * `min(2^(n-1) * 50, 5000) + jitter` — yani 5 sn'ye kadar çıkar ve jitter
 * taşır; kuyruk bağlantısını kütüphane varsayılanına devretmek K1.a'nın
 * kapattığı tam boşluktur.
 */
export function redisRetryStrategy(attempt: number): number {
  return Math.min(attempt * RETRY_BACKOFF_STEP_MS, RETRY_BACKOFF_CEILING_MS)
}

/**
 * `'queue'` profilinin `connectionName` değeri. PID İÇERİR: aynı Redis'e
 * bağlı birden çok worker süreci `CLIENT LIST` çıktısında ayırt edilebilsin
 * (AC9 ölçümü belirli bir çocuk sürecin bağlantılarını sayıyor).
 */
export function buildQueueConnectionName(pid: number): string {
  return `${QUEUE_CONNECTION_NAME_PREFIX}-${String(pid)}`
}

/** Üst sınırlı backoff'un imzası — `ioredis`'in `RetryStrategy`'sinden DAHA DAR. */
type BoundedRetryStrategy = (attempt: number) => number

/** `'health'` profilinin ÜRETTİĞİ seçeneklerin TAM listesi. */
type HealthConnectionOptions = {
  readonly maxRetriesPerRequest: number
  readonly commandTimeout: number
  readonly connectTimeout: number
  readonly retryStrategy: BoundedRetryStrategy
}

/** `'queue'` profilinin ÜRETTİĞİ seçeneklerin TAM listesi. */
type QueueConnectionOptions = {
  readonly maxRetriesPerRequest: null
  readonly enableReadyCheck: false
  readonly connectionName: string
  readonly retryStrategy: BoundedRetryStrategy
}

/**
 * ⚠ DÖNÜŞ TİPİ BİLEREK `RedisOptions` DEĞİL, iki profilin TAM şeklinin
 * birleşimi. İki gerekçe:
 *
 *   1. `RedisOptions`'ın her alanı optional; dönüş tipi o olsaydı bir anahtar
 *      yazım hatası (`comandTimeout`) veya EKSİK bir anahtar derleme zamanında
 *      yakalanmazdı — bu reponun tekrarlayan kusur sınıfı tam olarak bu.
 *      Dar birleşim, fazla/eksik anahtarı `pnpm typecheck`'te kırmızı yapar.
 *   2. `exactOptionalPropertyTypes: true` altında `RedisOptions` `new Redis()`
 *      kurucusuna DOĞRUDAN geçirilemiyor (ÖLÇÜLDÜ, TS2769: `replyMapping?:
 *      ReplyMappingMode | undefined` ↛ `replyMapping?: ReplyMappingMode`).
 *
 * Anahtar adlarının GERÇEKTEN `ioredis` alanları olduğu `satisfies
 * RedisOptions` ile ayrıca kanıtlanır (aşağıda, her iki dalda).
 */
export type RedisProfileOptions = HealthConnectionOptions | QueueConnectionOptions

/**
 * Profilin `ioredis` seçeneklerini üretir. SAF fonksiyon (I/O yok) —
 * değerlerin birim testinde birebir pinlenebilmesi için bağlantı kurma
 * işinden ayrılmıştır.
 *
 * ⚠ `'queue'` profili `commandTimeout`'u BİLEREK HİÇ TANIMLAMAZ (`undefined`
 * ATAMAZ da — `exactOptionalPropertyTypes` altında ikisi aynı şey değil).
 * Böylece `ioredis`'in varsayılanı (yok) geçerli olur ve bloke eden komutlar
 * yaşar.
 */
export function buildRedisConnectionOptions(profile: RedisConnectionProfile): RedisProfileOptions {
  switch (profile) {
    case 'health':
      return {
        maxRetriesPerRequest: HEALTH_MAX_RETRIES_PER_REQUEST,
        commandTimeout: HEALTH_COMMAND_TIMEOUT_MS,
        connectTimeout: HEALTH_CONNECT_TIMEOUT_MS,
        retryStrategy: redisRetryStrategy,
      } satisfies RedisOptions
    case 'queue':
      return {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        connectionName: buildQueueConnectionName(process.pid),
        retryStrategy: redisRetryStrategy,
      } satisfies RedisOptions
    default:
      return assertNever(profile, 'create-redis-connection.ts: RedisConnectionProfile')
  }
}

/**
 * Fabrikanın logger'dan ihtiyaç duyduğu TAM yüzey — tek bir `warn(gövde,
 * mesaj)` çağrısı. `pino`'nun `Logger`'ı bu şekle UYAR, yani `ROOT_LOGGER`
 * doğrudan geçirilebilir (`redis.module.ts`); ama test ikizinin `pino`'nun
 * AŞIRI YÜKLENMİŞ `LogFn` imzasını taklit etmesi GEREKMEZ (ÖLÇÜLDÜ:
 * `Pick<Logger, 'warn'>` altında düz bir `vi.fn()` TS2322 veriyordu).
 * `console.*` KULLANILMAZ — log her zaman enjekte edilen logger'dan geçer.
 */
export type RedisConnectionLogger = {
  readonly warn: (bindings: ErrorCauseDescription, message: string) => void
}

export type CreateRedisConnectionParams = {
  /** `ApiEnv.REDIS_URL` — şema doğrulaması `packages/config`'te yapılmıştır. */
  readonly url: string
  readonly profile: RedisConnectionProfile
  readonly logger: RedisConnectionLogger
}

/**
 * Profiline göre yapılandırılmış, zorunlu `'error'` dinleyicisi BAĞLI bir
 * `ioredis` istemcisi döner. AÇILIŞ Redis'E BAĞLI DEĞİLDİR: `ioredis`
 * bağlantıyı arka planda dener, çağıran onu BEKLEMEZ — Redis kapalıysa süreç
 * yine ayağa kalkar.
 *
 * ⚠ Bu fonksiyon `'error'` dinleyicisinin TEK kaydedildiği yerdir
 * (`apps/api/src/redis/` içinde ikinci bir kayıt YOK — kanıt: S3 raporundaki
 * grep çıktısı).
 */
export function createRedisConnection(params: CreateRedisConnectionParams): Redis {
  const client = new Redis(params.url, buildRedisConnectionOptions(params.profile))

  let lastLoggedAt = 0

  // ZORUNLU dinleyici (bkz. dosya başı yorumu) — throttle'lı `warn`.
  // Sağlayıcıya özgü dallanma YOK; bu fabrika yalnızca bağlantı YÖNETİMİYLE
  // ilgilenir.
  client.on('error', (error: Error) => {
    const now = Date.now()
    if (now - lastLoggedAt < ERROR_LOG_THROTTLE_MS) {
      return
    }
    lastLoggedAt = now
    // FIX turu 2 (T-006, solid tur2 M-2 + security tur2 S-8 — ÖLÇÜLDÜ, bu
    // modülün CANLI `.env` yapılandırmasını (`redis://localhost:6379`, çift
    // yığın IPv4+IPv6) tam etkileyen kusur): naif `error.message`
    // happy-eyeballs `AggregateError`'da HER ZAMAN boş dize döner — operatör
    // `errorMessage: ""` görürdü. Ortak `describeErrorCause()` `.errors[0]`'a
    // iner.
    // ⚠ R-A4: log GÖVDESİ ve MESAJI v0.0.4'tekiyle BİREBİR aynı kalır —
    // `redisProfile` gibi "yararlı" bir alan EKLENMEDİ; eklemek `'health'`
    // yolunun gözlemlenebilir çıktısını değiştirirdi. Worker'ın logları
    // `service` binding'iyle ayrılıyor (`main.worker.ts`, S6).
    params.logger.warn(describeErrorCause(error), 'redis bağlantı hatası')
  })

  return client
}
