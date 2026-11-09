// @arkesoft/api — oran sınırlama POLİTİKASI: SAF modül (ROADMAP v0.0.5,
// T-006/S8, architect "ENV ŞEMASI" → "EŞİKLER ENV'DE DEĞİL", AC7 "eşik
// gevşetilemez")
//
// ⚠ BU DOSYA `process.env`/`ApiEnv` OKUMAZ — mekanik kanıt (DoD §3):
// `grep -nE 'process\.env|ApiEnv' rate-limit.policy.ts` → 0 satır. `5/20/3/10`
// eşikleri burada MODÜL SABİTİ. Pencere SÜRELERİ (saniye) BURADA YOK —
// `rate-limit.guard.ts` `ApiEnv`'den okur ve `RateLimitWindowKind`'e göre
// hangi env değişkenini kullanacağını SEÇER; bu dosya o seçimi YAPMAZ,
// SEÇENEĞİ (etiketi) adlandırır.
//
// S5'in A-G6 düzeltmesi (bağlayıcı, S8 handoff §1): gerçek Better Auth uç
// adı `POST /auth/request-password-reset`'tir, architect'in "HATA
// SINIFLARI"/"K3" metninde yazdığı `forget-password` DEĞİL. Bu yazım
// hatasının bir daha SESSİZCE tekrarlanmaması için dört rotanın anahtarı
// `AUTH_DELEGATED_PATHS`'E KARŞI MODÜL YÜKLENİRKEN doğrulanır (`buildPolicy`)
// — sapma varsa FIRLATILIR; literal kopyalanıp doğrulanmadan BIRAKILMAZ.
//
// GÜNCELLEME (T-016 FIX turu 1, madde 1/F1, `high`) — ALTI `/auth/two-factor/*`
// ucu EKLENDİ (dört → on). Güvenlik tur 1'in ÖLÇTÜĞÜ boşluk: bu altı uç
// `auth-instance.ts`'in `rateLimit: { enabled: false }` KARARINDAN (Better
// Auth'un KENDİ sınırlayıcısı kapalı, S8'in Redis tabanlısıyla ÇATIŞMASIN
// diye) MUAF TUTULMUŞ gibi davranıyordu — AMA bu dosya onları HİÇ TANIMIYORDU,
// yani ikisi ARASINDA da sınırsız kalıyorlardı (fail-open, `rate-limit.guard.ts`
// politika bulunamazsa `true` döner). Üçü (`enable`/`disable`/`get-totp-uri`/
// `generate-backup-codes`) birer PAROLA ORACLE'I — sömürü senaryosu çalıntı
// oturum çerezi + parola tahmin döngüsü (`rate-limit.guard.ts` dosya başı
// yorumu). İKİSİ (`verify-totp`/`verify-backup-code`) ise Better Auth'un
// KENDİ hesap kilidinin (`totp/index.mjs:137-166`, `isSignIn` ile KOŞULLU)
// OTURUM YOLUNDA (2FA kurulum onayı, `isSignIn===false`) HİÇ ÇALIŞMADIĞI
// bir ikinci boşluğu KAPATIR — bkz. `rate-limit.guard.ts`'in
// `extractTwoFactorVerifyAccountScope` yorumu.
//
// EŞİK KOORDİNASYONU (bağlayıcı, `auth-instance.ts` dosya başı yorumu — "iki
// ayrı, koordinesiz eşik AYNI anda çalışmasın"): bu altı rota İÇİN YENİ bir
// eşik/pencere AİLESİ İCAT EDİLMEDİ — risk şekli (parola/kod TAHMİNİ) `login`
// penceresiyle (K3, 15dk) VE `LOGIN_ACCOUNT_LIMIT`/`LOGIN_IP_LIMIT` (5/20) İLE
// AYNI olduğu için AYNI sabitler YENİDEN KULLANILIR — üçüncü, koordinesiz bir
// eşik ailesi (ör. yeni bir `AUTH_TWO_FACTOR_RATE_WINDOW_SECONDS` env'i)
// BİLEREK EKLENMEDİ.

import { AUTH_DELEGATED_PATHS } from '../auth-delegated-paths.js'
// FIX turu 1, madde 11 (solid M-1) — yol normalizasyonu ARTIK ortak
// `http/normalize-request-path.ts`'ten İTHAL EDİLİR.
import { normalizeRequestPath } from '../../http/normalize-request-path.js'

/**
 * Hangi env penceresinin (`rate-limit.guard.ts` → `AUTH_LOGIN_RATE_WINDOW_SECONDS`
 * / `AUTH_RESET_RATE_WINDOW_SECONDS`) kullanılacağını ADLANDIRIR — SEÇİM
 * burada YAPILMAZ, okuyucu (guard) `ApiEnv`'den okur.
 */
export type RateLimitWindowKind = 'login' | 'reset'

/**
 * Hesap kapsamının HANGİ İSTEK YÜZEYİNDEN türetildiğini ADLANDIRIR — SEÇİM
 * burada YAPILMAZ, okuyucu (`rate-limit.guard.ts`) bu etikete göre dört
 * ayrı çıkarım yolundan birini ÇALIŞTIRIR (T-016 FIX turu 1, madde 1/F1):
 *
 *   - `'emailBody'` — gövdenin `email` alanı (K3'ün ORİJİNAL dört rotası).
 *     Oturum/çerez GEREKMEZ, kimlik HENÜZ YOK.
 *   - `'sessionUserId'` — `AuthContextMiddleware`'in ZATEN çözdüğü
 *     `RequestContext.auth` (`kind==='authenticated'` İSE `userId`). Bu DÖRT
 *     uç (`enable`/`disable`/`get-totp-uri`/`generate-backup-codes`)
 *     `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`'TE (Better Auth'un KENDİSİ
 *     `sessionMiddleware`/`sensitiveSessionMiddleware` BEKLER) — bu yüzden
 *     `AUTH_EXEMPT_PATHS`'TE DEĞİLDİR ve `AuthContextMiddleware` normal
 *     akışında `context.auth`'u ZATEN DOLDURUR; guard bunu YENİDEN
 *     ÇÖZMEZ, OKUR (ikinci bir oturum sorgusu YOK).
 *   - `'twoFactorChallengeOrSession'` — `verify-totp`/`verify-backup-code`.
 *     Bu İKİSİ `AUTH_EXEMPT_PATHS`'TEDİR (`AuthContextMiddleware`
 *     `context.auth`'u HİÇ doldurmaz, bkz. o dosyanın "exempt" dalı) — guard
 *     HAM çerez başlığını okur: ÖNCE Better Auth'un `two_factor` challenge
 *     çerezi (ön-giriş modu, `isSignIn===true`), YOKSA normal
 *     `session_token` çerezi (2FA KURULUM ONAYI modu, `isSignIn===false` —
 *     Better Auth'un KENDİ hesap kilidinin BU modda HİÇ çalışmadığı boşluk).
 *     İKİSİ DE HAM, OPAK dize olarak `RateLimitService.buildScopeKey`'e
 *     geçer (HMAC'lenir, decode/doğrulama YAPILMAZ) — `rate-limit.guard.ts`'in
 *     `extractTwoFactorVerifyAccountScope` fonksiyonuna bkz.
 */
export type RateLimitAccountScopeSource =
  'emailBody' | 'sessionUserId' | 'twoFactorChallengeOrSession'

export type RateLimitPolicy = {
  readonly routeKey: string
  readonly windowKind: RateLimitWindowKind
  readonly accountLimit: number
  readonly ipLimit: number
  /** K3 — "başarılı giriş hesap sayacını SIFIRLAR" (yalnızca giriş ucunda `true`). */
  readonly resetAccountOnSuccess: boolean
  /** T-016 FIX turu 1, madde 1/F1 — hesap kapsamının çıkarım yolu (yukarıdaki tip yorumuna bkz). */
  readonly accountScopeSource: RateLimitAccountScopeSource
}

// --- K3 eşikleri — MODÜL SABİTİ, env'den OKUNMAZ, GEVŞETİLEMEZ (AC7) -------

/** Giriş: hesap başına 5 başarısız / 15 dk. */
const LOGIN_ACCOUNT_LIMIT = 5
/**
 * Giriş: IP başına 20 deneme / 15 dk. K3'ün metni "20 BAŞARISIZ" diyor; FIX
 * turu 1 (solid M-6) bunu ÖLÇTÜ — gerçek davranış "20 DENEME"dir (başarılı
 * girişler de sayılır, SIFIRLANMAZ). BİLİNÇLİ: `rate-limit.guard.ts` dosya
 * başı yorumu — hesap sayacının tersine, IP sayacını başarıda sıfırlamak
 * paylaşılan IP'de bir saldırganın KENDİ hesabıyla ara sıra giriş yaparak
 * sınırı sıfırlamasına (kurbana karşı sınırsız deneme) izin verirdi.
 */
const LOGIN_IP_LIMIT = 20
/** Şifre sıfırlama VE onaylı genişletme (kayıt, doğrulama e-postası): e-posta başına 3/saat. */
const EMAIL_ACCOUNT_LIMIT = 3
/** Şifre sıfırlama VE onaylı genişletme: IP başına 10/saat. */
const EMAIL_IP_LIMIT = 10

function buildPolicy(
  routeKey: string,
  windowKind: RateLimitWindowKind,
  accountLimit: number,
  ipLimit: number,
  resetAccountOnSuccess: boolean,
  accountScopeSource: RateLimitAccountScopeSource,
): readonly [string, RateLimitPolicy] {
  if (!AUTH_DELEGATED_PATHS.has(routeKey)) {
    // Mekanik kanıt: architect'in "forget-password" yazım hatasının bir daha
    // SESSİZCE tekrarlanamayacağının GARANTİSİ — modül bu satırda YÜKLENEMEZ.
    throw new Error(
      `rate-limit.policy.ts: "${routeKey}" AUTH_DELEGATED_PATHS içinde yok (yazım hatası olabilir)`,
    )
  }

  return [
    routeKey,
    { routeKey, windowKind, accountLimit, ipLimit, resetAccountOnSuccess, accountScopeSource },
  ]
}

const RATE_LIMITED_ROUTES: ReadonlyMap<string, RateLimitPolicy> = new Map([
  buildPolicy(
    'POST /auth/sign-in/email',
    'login',
    LOGIN_ACCOUNT_LIMIT,
    LOGIN_IP_LIMIT,
    true,
    'emailBody',
  ),
  buildPolicy(
    'POST /auth/request-password-reset',
    'reset',
    EMAIL_ACCOUNT_LIMIT,
    EMAIL_IP_LIMIT,
    false,
    'emailBody',
  ),
  // Kullanıcı onaylı KAPSAM GENİŞLETMESİ (2026-10-29, architect riski 7):
  // ikisi de e-posta GÖNDERİYOR → mail bombing + SMTP itibar kaybı riski.
  // Şifre sıfırlamanın AYNI eşikleri (3/saat hesap, 10/saat IP) kullanılır.
  buildPolicy(
    'POST /auth/sign-up/email',
    'reset',
    EMAIL_ACCOUNT_LIMIT,
    EMAIL_IP_LIMIT,
    false,
    'emailBody',
  ),
  buildPolicy(
    'POST /auth/send-verification-email',
    'reset',
    EMAIL_ACCOUNT_LIMIT,
    EMAIL_IP_LIMIT,
    false,
    'emailBody',
  ),
  // T-016 FIX turu 1, madde 1/F1 (`high`) — altı yeni rota, dosya başı
  // GÜNCELLEME yorumu. DÖRDÜ (`enable`/`disable`/`get-totp-uri`/
  // `generate-backup-codes`) parola oracle'ı — `sessionUserId` kapsamı.
  buildPolicy(
    'POST /auth/two-factor/enable',
    'login',
    LOGIN_ACCOUNT_LIMIT,
    LOGIN_IP_LIMIT,
    false,
    'sessionUserId',
  ),
  buildPolicy(
    'POST /auth/two-factor/disable',
    'login',
    LOGIN_ACCOUNT_LIMIT,
    LOGIN_IP_LIMIT,
    false,
    'sessionUserId',
  ),
  buildPolicy(
    'POST /auth/two-factor/get-totp-uri',
    'login',
    LOGIN_ACCOUNT_LIMIT,
    LOGIN_IP_LIMIT,
    false,
    'sessionUserId',
  ),
  buildPolicy(
    'POST /auth/two-factor/generate-backup-codes',
    'login',
    LOGIN_ACCOUNT_LIMIT,
    LOGIN_IP_LIMIT,
    false,
    'sessionUserId',
  ),
  // İKİSİ — kod/yedek kod TAHMİNİ, `twoFactorChallengeOrSession` kapsamı
  // (oturum yolundaki kilit boşluğunun TELAFİSİ, dosya başı yorumu).
  buildPolicy(
    'POST /auth/two-factor/verify-totp',
    'login',
    LOGIN_ACCOUNT_LIMIT,
    LOGIN_IP_LIMIT,
    false,
    'twoFactorChallengeOrSession',
  ),
  buildPolicy(
    'POST /auth/two-factor/verify-backup-code',
    'login',
    LOGIN_ACCOUNT_LIMIT,
    LOGIN_IP_LIMIT,
    false,
    'twoFactorChallengeOrSession',
  ),
])

/**
 * İsteğin oran sınırlı ON rotadan birine ait olup olmadığını belirler (T-016
 * FIX turu 1, madde 1/F1 — dört → on, dosya başı GÜNCELLEME yorumu).
 * Normalizasyon `auth-delegated-paths.ts`'in `isAuthDelegatedPath`'iyle
 * BİREBİR aynı (sondaki `/` soyulur, sorgu dizesi/fragman karışmaz,
 * büyük/küçük harf DUYARLI, metot büyük/küçük harf DUYARSIZ).
 */
export function resolveRateLimitPolicy(
  method: string,
  rawUrl: string,
): RateLimitPolicy | undefined {
  const normalizedPathname = normalizeRequestPath(rawUrl)

  return RATE_LIMITED_ROUTES.get(`${method.toUpperCase()} ${normalizedPathname}`)
}
