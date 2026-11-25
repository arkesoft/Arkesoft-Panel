// @arkesoft/errors — redaction ilkelleri (ROADMAP v0.0.4, T-002/ST-3b, architect K-A2/K-A7;
// ROADMAP v0.0.17, T-028/S3, architect K-A28-5/ L-11/L-12 — SECRET_FIELD_NAMES + redactDeep)
//
// İKİ TÜKETİCİSİ var: apps/api'nin pino yapılandırması (ST-2/ST-4, `RequestLoggingInterceptor`
// ve `createRootLogger`) ve packages/db/src/seed.ts:95 (Kullanıcı Onayı #2 — seed çıktısındaki
// tam e-posta maskelenecek). Ortak pakette durmasının sebebi bu: iki ayrı paket aynı maskeleme
// desenini kopyalamasın, tek yerden bakım edilsin.
//
// ⚠⚠ ROADMAP v0.0.17 (T-028, borç :3957/L-11): `AppError.context` bu sürümden itibaren İLK
// KEZ süreç dışına (Sentry zarfı) taşınıyor — bugünkü "ulaşılamaz" sızıntı sınıfı
// "ulaşılabilir" hâle geliyor. `redactDeep()` bu zarf sınırında kullanılan ÜÇÜNCÜ savunma
// katmanıdır (birincisi: hiçbir kod yolu sırrı loglamaz; ikincisi: pino `redact.paths`).
// `SECRET_FIELD_NAMES` ikisinin de TEK ortak kaynağıdır — `PINO_REDACT_PATHS` bu kümeden
// TÜRETİLİR, elle İKİNCİ bir liste olarak bakımlanmaz (bkz. aşağıdaki "sayıyı kopyalama,
// kaynağa atıf ver" dersi, borç :3942).

/**
 * Bir e-posta adresini log/konsol çıktısı için maskeler.
 * Örn. `ahmet@example.com` → `a***@example.com`.
 *
 * Kenar durumlarda (`@` yok, yerel kısım tek karakter, boş dize, birden çok `@`)
 * HİÇBİR ZAMAN ham e-postayı geri döndürmez — biçim belirsizse tamamen maskeler
 * (`***`).
 */
export function maskEmail(value: string): string {
  if (value.length === 0) {
    return '***'
  }

  const firstAt = value.indexOf('@')
  const lastAt = value.lastIndexOf('@')

  // `@` yok veya birden çok `@` var → biçim belirsiz, ham veriyi sızdırmamak için
  // tamamen maskele.
  if (firstAt === -1 || firstAt !== lastAt) {
    return '***'
  }

  const localPart = value.slice(0, firstAt)
  const domainPart = value.slice(firstAt + 1)

  if (localPart.length === 0 || domainPart.length === 0) {
    return '***'
  }

  const firstChar = localPart.charAt(0)
  return `${firstChar}***@${domainPart}`
}

// ---------------------------------------------------------------------------
// SECRET_FIELD_NAMES — tek kaynak (ROADMAP v0.0.17, T-028/S3, K-A28-5)
// ---------------------------------------------------------------------------
//
// Kapalı küme — CLAUDE.md §4/§10.7'nin "asla loglanmaz" alanlarının (çerez,
// token, parola, API anahtarı, oturum kimliği, TOTP sırrı, yedek kod, IP)
// ad listesi. Hem `PINO_REDACT_PATHS` (pino'nun yüzeysel `redact.paths`
// mekanizması) HEM `redactDeep()` (derinlemesine, zarf-sınırı savunması) BU
// kümeden beslenir — iki ayrı bakımlanan liste YOK.
//
// Her adın hangi ihtiyaçtan eklendiği tarihçesi aşağıda korunuyor:
//   - `cookie`/`authorization`/`set-cookie` — HTTP başlıkları (architect K-A7).
//   - `password`/`token`/`accessToken`/`refreshToken`/`apiKey`/`secret` —
//     genel kimlik doğrulama sırları (architect K-A7).
//   - `sessionToken`/`verificationToken`/`resetToken`/`passwordHash` —
//     ROADMAP v0.0.5, T-006/S3, architect "LOG DESENİ" — Better Auth'un bu
//     adlarla çalıştığı altı alan.
//   - `totpURI`/`backupCodes` — ROADMAP v0.0.15, T-016/S8, architect K-A3:
//     Better Auth'un `two-factor` eklentisinin `enable`/`get-totp-uri`
//     yanıtlarında KASTEN tele çıkan sırrın KENDİSİ (tele çıkması bilinçli,
//     LOGLANMASI değil).
//   - `ipAddress` — ROADMAP v0.0.15.1, T-017/S6, kullanıcı kararı
//     (2026-11-09, ÜÇ KEZ onaylandı). İKİNCİL savunma — BİRİNCİL savunma
//     hiçbir kod yolunun bu değeri bir log çağrısına GEÇİRMEMESİdir.
//
// ⛔ `'value'` BİLEREK EKLENMEDİ (architect kararı, bağlayıcı) — Better
// Auth'un ham belirteç alanı bu adı taşır ama YAPISAL olarak hiçbir
// `logger.*` çağrısına argüman olarak VERİLMEZ; `'value'` eklemek herhangi
// bir nesnenin meşru `value` alanını da silen fazla geniş bir eşleşme
// olurdu — redaction'a değil YAPIYA güveniyoruz.
// ⛔ `'code'` BİLEREK EKLENMEDİ (architect kararı, bağlayıcı) — `AppError.code`
// bu projenin TÜM hata ayıklama zincirinin dayandığı teşhis alanı
// (`INVALID_CODE`, `ACCOUNT_TEMPORARILY_LOCKED` — bunlar SIR DEĞİL, teşhis).
// `'code'` eklemek `AppError.code`'u HER YERDE redakte eder ve teşhisi öldürür.
//
// ⭐ ROADMAP v0.0.17 (T-028, düzeltme turu 1, `security` BULGU 4) — küme
// CLAUDE.md §4'ün "asla loglanmaz" listesiyle HİZALANDI. Eklenen on bir ad,
// bugün bu depoda HİÇBİR koda bağlı DEĞİL (grep ile doğrulandı — ödeme/TCKN/
// adres alanları henüz doğmadı, `packages/integrations` v0.6.x'te gelecek);
// eklenme gerekçesi İLERİYE DÖNÜK zarf-sınırı savunmasıdır — bir adaptör bu
// alan adlarını `AppError.context`'e koyduğu GÜN savunma zaten hazır olsun,
// "o PR'da hatırlanır mı" şansına bırakılmasın:
//   - `cardNumber`/`pan` — kart numarası (CLAUDE.md §4 "kart verisi").
//   - `cvv`/`cvc` — kartın güvenlik kodu (AYNI madde).
//   - `tckn`/`nationalId` — TCKN (CLAUDE.md §4 "TCKN").
//   - `address` — tam adres (CLAUDE.md §4 "tam adres"); kısmi alanlar
//     (`city`/`district` gibi) BİLEREK kapsam dışı — CLAUDE sadece "tam"
//     adresi yasaklıyor, aşırı geniş eşleşme burada da istenmiyor.
//   - `email` — tam e-posta (CLAUDE.md §4 "tam e-posta"). ⚠ `emailMasked`
//     (yani `maskEmail()`'in ürettiği GÜVENLİ değer) BİLEREK buraya
//     EKLENMEDİ — zaten maskelenmiş veriyi ikinci kez redakte etmek teşhisi
//     gerekçesiz öldürür; bu küme yalnızca HAM `email` alanını hedefler.
//   - `clientSecret` — OAuth istemci sırrı; normalizasyon (aşağıdaki
//     `normalizeFieldName`) `client_secret`/`CLIENT_SECRET` gibi yazımları
//     zaten BU ada indirger, ikinci bir literal EKLENMEDİ.
//   - `jwt`/`otp` — JSON Web Token ve tek kullanımlık şifre; `token`/
//     `totpURI` mevcut girdileri bunları KAPSAMAZ (ayrı alan adları).
// ⚠ `apiKey`/`accessToken`/`refreshToken` için AYRI `api_key`/`access_token`/
// `refresh_token` girdisi EKLENMEDİ — bu üçü normalizasyonla ZATEN aynı ada
// düşer (bkz. `normalizeFieldName`), ikinci literal eklemek `redaction.test.
// ts`'in AC-63 üyelik testini YANLIŞ pozitif şişirirdi.
export const SECRET_FIELD_NAMES: ReadonlySet<string> = new Set([
  'cookie',
  'authorization',
  'set-cookie',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'sessionToken',
  'verificationToken',
  'resetToken',
  'passwordHash',
  'totpURI',
  'backupCodes',
  'ipAddress',
  'cardNumber',
  'pan',
  'cvv',
  'cvc',
  'tckn',
  'nationalId',
  'address',
  'email',
  'clientSecret',
  'jwt',
  'otp',
])

// pino'nun yüzeysel `redact.paths`'inde İÇ İÇE (nested) biçimde de joker
// (`*.ad`) olarak taşınması gereken alt küme — architect'in bugüne dek ELLE
// seçtiği altı ad. `SECRET_FIELD_NAMES`'in BİR ALT kümesidir; `'*.value'`
// gibi aşırı geniş jokerler (yukarıdaki `'value'` dışlamasıyla AYNI gerekçe)
// BİLİNÇLİ OLARAK burada da genişletilmez.
//
// ⭐ KARAR (T-028, düzeltme turu 1, `security` BULGU 4 — "karar senin, gerekçe
// zorunlu"): bu sürümde `SECRET_FIELD_NAMES`'e eklenen on bir ad (kart/TCKN/
// adres/e-posta/OAuth varyantları) BURAYA EKLENMEDİ. Üç gerekçe:
//   (a) Her mevcut girdi (`password`/`token`/`sessionToken`/`passwordHash`/
//       `secret`/`ipAddress`) GÖZLENMİŞ bir tek-seviye iç içe biçimi modeller
//       (Better Auth'un `{twoFactor: {secret}}`'i, `{client: {ipAddress}}`'i —
//       `redaction.test.ts`'in sentinel probları bunu KANITLAR). Yeni on bir
//       adın HİÇBİRİNİN bugün bu depoda bilinen bir iç içe biçimi YOK (grep
//       ile doğrulandı — ödeme/TCKN/adres alanları henüz doğmadı); kanıtsız
//       joker eklemek `'*.value'` yasağıyla AYNI sınıf hataya (spekülatif
//       aşırı genişleme) girerdi.
//   (b) `redactDeep()` (aşağıda) ZATEN her derinlikte tarar — pino'nun
//       yüzeysel jokeri burada BİRİNCİL savunma DEĞİL, `AppError.context`
//       Sentry zarfına taşınmadan önceki İKİNCİL/pino-seviyesi hattır. Yeni
//       adların derinlemesine korunması `redactDeep` ile ZATEN TAMDIR.
//   (c) Bir sağlayıcı adaptörü (`packages/integrations`, v0.6.x) bu adlardan
//       birini GERÇEKTEN tek-seviye iç içe bir pino log çağrısına taşırsa, bu
//       küme O ZAMAN ve o GÖZLENEN biçimle genişletilir (architect kararı
//       bağlayıcı kalır) — bugün spekülatif joker eklenmez.
const WILDCARD_NESTED_FIELD_NAMES: ReadonlySet<string> = new Set([
  'password',
  'token',
  'sessionToken',
  'passwordHash',
  'secret',
  'ipAddress',
])

// HTTP başlığı özel yapısı (`req.headers.*`/`res.headers.*`) — istek VE yanıt
// bağlamının İKİSİNDE de redakte edilmesi gereken üç ad. Bu, genel ad
// listesinden AYRI bir YAPISAL türetimdir (başlık nesnesinin kendi iç içe
// konumu), `SECRET_FIELD_NAMES`'in geri kalanındaki düz/joker türetimle
// karıştırılmaz.
const HTTP_HEADER_FIELD_NAMES: readonly string[] = ['cookie', 'authorization', 'set-cookie']

const VALID_DOT_PATH_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * `prefix.ad` (geçerli bir JS tanımlayıcısıysa nokta gösterimi) veya
 * `prefix["ad"]` (örn. `set-cookie` gibi tire içeren adlar için köşeli
 * parantez — pino/fast-redact ikisini de kabul eder) üretir.
 */
function toPinoPath(prefix: string, name: string): string {
  return VALID_DOT_PATH_SEGMENT.test(name) ? `${prefix}.${name}` : `${prefix}["${name}"]`
}

/**
 * pino `redact.paths` için ortak liste. CLAUDE.md §4 "asla loglanmaz" maddesinin
 * (çerez, token, parola, API anahtarı) pino seviyesindeki karşılığı — AC10'un
 * İKİNCİ savunma katmanı (birincisi: başlıkların loggera hiç verilmemesi, bkz.
 * architect K-A7 — `RequestLoggingInterceptor` ham başlıkları hiç okumaz).
 *
 * ⭐ ROADMAP v0.0.17 (T-028/S3, architect K-A28-5, AC-63): bu liste artık
 * `SECRET_FIELD_NAMES`'ten TÜRETİLİR — elle yazılan ikinci bir doğruluk
 * kaynağı DEĞİLDİR. Türetim üç parçadan oluşur:
 *   1. Her ad kök seviyede düz yol olarak (`'password'`, `'cookie'`, …).
 *   2. `WILDCARD_NESTED_FIELD_NAMES`'teki altı ad için `'*.ad'` joker yolu.
 *   3. `HTTP_HEADER_FIELD_NAMES`'teki üç ad için `req.headers.*`/`res.headers.*`
 *      yapısal yolları.
 * Bu üçü birleştiğinde (T-016/T-017'de elle bakımlanan) 28 girdiyle BİREBİR
 * aynı kümeyi üretir — `__tests__/redaction.test.ts`'in AC-63 pini bunu
 * `.length` karşılaştırmasıyla (sabit sayı YAZMADAN) doğrular.
 */
export const PINO_REDACT_PATHS: readonly string[] = [
  ...SECRET_FIELD_NAMES,
  ...[...WILDCARD_NESTED_FIELD_NAMES].map((name) => toPinoPath('*', name)),
  ...HTTP_HEADER_FIELD_NAMES.flatMap((name) => [
    toPinoPath('req.headers', name),
    toPinoPath('res.headers', name),
  ]),
]

// ---------------------------------------------------------------------------
// redactDeep — derinlemesine redaksiyon (ROADMAP v0.0.17, T-028/S3, borç :3957/L-11)
// ---------------------------------------------------------------------------

/** Sır olduğu tespit edilen bir alanın yerine yazılan sabit değer. */
const REDACTED_PLACEHOLDER = '[redacted]'

/** Derinlik sınırına çarpıldığında geri kalan alt ağacın yerine yazılan değer. */
const DEPTH_LIMIT_PLACEHOLDER = '[redaction-depth-limit]'

/** Devirli (circular) referansa rastlandığında yazılan değer. */
const CIRCULAR_PLACEHOLDER = '[circular]'

/**
 * `redactDeep()`'in varsayılan maksimum özyineleme derinliği. `AppError.context`
 * pratikte birkaç seviyeden fazla iç içe geçmez (sorgu parametreleri, kimlik
 * alanları); bu sınır sonsuz özyineleme/aşırı büyük nesne taramasına karşı
 * fail-closed bir taban çizer — aşılırsa fırlatmaz, kalan alt ağacı
 * `DEPTH_LIMIT_PLACEHOLDER` ile keser.
 */
const DEFAULT_MAX_DEPTH = 6

/**
 * `redactDeep`'in anahtar KARŞILAŞTIRMASI için normalizasyon — `toLowerCase()`
 * + `-`/`_` kaldırma. SADECE bu fonksiyonun ARAMA tarafında kullanılır
 * (ROADMAP v0.0.17, T-028, düzeltme turu 1, `security` BULGU 4, kısıt 4):
 * `PINO_REDACT_PATHS`'in yol metinleri pino'nun KENDİ sözleşmesi gereği HARFE
 * DUYARLIDIR (`fast-redact`), normalizasyon BURAYA UYGULANAMAZ —
 * `Authorization`/`API_KEY` gibi yazım varyantları pino seviyesinde hâlâ
 * KAÇAR (bilinen, belgelenmiş sınır; birincil savunma `RequestLoggingInterceptor`'ın
 * başlıkları hiç OKUMAMASIdır, K-A7). `redactDeep` ise `AppError.context`'i
 * tarar — bu veri bir HTTP başlığı DEĞİLDİR, anahtar adı tamamen bu projenin
 * domain kodunun SEÇTİĞİ bir sabittir; normalize etmek burada güvenlidir ve
 * `Authorization`/`api_key`/`apiKey`/`api-key` yazım farklarının HEPSİNİ aynı
 * sır adına indirger.
 */
function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, '')
}

/**
 * `SECRET_FIELD_NAMES`'in normalize edilmiş karşılığı — modül yüklendiğinde
 * BİR KEZ hesaplanır (her `redactDeep` çağrısında YENİDEN HESAPLANMAZ). Boyut
 * `SECRET_FIELD_NAMES` ile BİREBİR aynıdır — normalizasyon bugün hiçbir iki
 * adı aynı normalize biçime İNDİRGEMİYOR (`'value'`/`'code'` dışlamaları da
 * bu normalize kümenin DIŞINDA kalır, yanlış pozitif ÜRETMEZ).
 */
const NORMALIZED_SECRET_FIELD_NAMES: ReadonlySet<string> = new Set(
  [...SECRET_FIELD_NAMES].map((name) => normalizeFieldName(name)),
)

/**
 * Bir değeri (tipik olarak `AppError.context`) derinlemesine gezip
 * `SECRET_FIELD_NAMES`'teki bir anahtarla eşleşen her alanı
 * `REDACTED_PLACEHOLDER` ile değiştirerek YENİ bir değer döner — girdi
 * MUTASYONA UĞRAMAZ.
 *
 * Bu, bu sürümden itibaren `AppError.context`'in İLK KEZ süreç dışına
 * (Sentry zarfı) taşınmasının getirdiği ÜÇÜNCÜ savunma katmanıdır (birincisi:
 * hiçbir kod yolu sırrı loglamaz; ikincisi: pino `redact.paths`). Tüketicisi
 * `apps/api/src/observability/sentry.ts` (S5'in işi) — bu paket onu YALNIZCA
 * SAF bir fonksiyon olarak sağlar, Sentry'ye BAĞIMLI DEĞİLDİR.
 *
 * - **Derinlik sınırlı:** `maxDepth`'i (varsayılan {@link DEFAULT_MAX_DEPTH})
 *   aşan bir alt ağaç fırlatmadan `DEPTH_LIMIT_PLACEHOLDER` ile kesilir.
 * - **Devirli nesne korumalı:** aynı nesne referansına özyineleme sırasında
 *   İKİNCİ kez rastlanırsa (`WeakSet` ile izlenir) `CIRCULAR_PLACEHOLDER`
 *   yazılır, yığın taşması/sonsuz döngü OLUŞMAZ.
 * - **Anahtar eşleşmesi HARFE/YAZIMA DUYARSIZDIR** (ROADMAP v0.0.17, T-028,
 *   düzeltme turu 1, `security` BULGU 4): `{@link normalizeFieldName}` ile
 *   hem `SECRET_FIELD_NAMES` hem gezilen her anahtar normalize edilip
 *   karşılaştırılır — `Authorization`, `API_KEY`, `api-key`, `apiKey`
 *   HEPSİ aynı sır adına düşer. `'value'`/`'code'` dışlamaları KORUNUR (bu
 *   iki ad normalize kümenin dışındadır, davranış DEĞİŞMEZ).
 * - Diziler elaman bazında gezilir (anahtar eşleşmesi yalnızca nesne
 *   alanlarında anlamlıdır).
 * - Birincil tipler (`string`/`number`/`boolean`/`null`/`undefined`) olduğu
 *   gibi döner.
 */
export function redactDeep(
  value: unknown,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  depth = 0,
  seen: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (depth >= maxDepth) {
    return DEPTH_LIMIT_PLACEHOLDER
  }

  if (seen.has(value)) {
    return CIRCULAR_PLACEHOLDER
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, maxDepth, depth + 1, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    result[key] = NORMALIZED_SECRET_FIELD_NAMES.has(normalizeFieldName(key))
      ? REDACTED_PLACEHOLDER
      : redactDeep(nestedValue, maxDepth, depth + 1, seen)
  }
  return result
}
