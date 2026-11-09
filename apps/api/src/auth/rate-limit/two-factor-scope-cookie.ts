// @arkesoft/api — `verify-totp`/`verify-backup-code` hesap kapsamı çıkarımı
// (ROADMAP v0.0.15, T-016 FIX turu 1, madde 1/F1, `high`)
//
// Bu iki uç `AUTH_EXEMPT_PATHS`'TEDİR (`auth-exempt-paths.ts` dosya başı
// GÜNCELLEME yorumu) — `AuthContextMiddleware` bu yol için `context.auth`'u
// HİÇ DOLDURMAZ (`{kind:'exempt'}` yazıp hemen `next()` çağırır, oturum
// HİÇ SORGULANMAZ). Bu yüzden `rate-limit.guard.ts` `getRequestContext().auth`
// ÜZERİNDEN bir kullanıcı kimliği OKUYAMAZ — HAM `Cookie` başlığını kendisi
// okur.
//
// Better Auth'un `verifyTwoFactor()`'ı (`verify-two-factor.mjs`, ÖLÇÜLDÜ) BU
// uca İKİ FARKLI modda ULAŞILABİLİR olduğunu TANIR:
//
//   1. ÖN-GİRİŞ MODU (`isSignIn===true`, normal `/sign-in/email`'den SONRA):
//      çağıranın elinde YALNIZCA `two_factor` challenge çerezi vardır
//      (`better-auth.two_factor`/`__Secure-better-auth.two_factor`, `Max-Age=600`).
//      Better Auth'un KENDİ hesap kilidi (`assertTwoFactorNotLocked`/
//      `beginAttempt(5)`/`recordTwoFactorFailure`, `totp/index.mjs:137-166`)
//      BU modda ÇALIŞIR (`isSignIn` koşulu DOĞRU) — S4'ün ÖLÇÜMÜ.
//   2. 2FA KURULUM ONAYI MODU (`isSignIn===false`, `enable`'dan SONRA, henüz
//      `verified:true` OLMAMIŞ bir TOTP sırrını onaylarken): çağıranın elinde
//      NORMAL `session_token` çerezi vardır, `two_factor` çerezi YOKTUR.
//      Better Auth'un hesap kilidi BU modda HİÇ ÇALIŞMAZ (`isSignIn` koşulu
//      YANLIŞ — `totp/index.mjs:148-153`, `assertTwoFactorNotLocked`/
//      `beginAttempt` ÇAĞRILMAZ) — bu dosyanın TELAFİ ETTİĞİ boşluk.
//
// `extractTwoFactorVerifyAccountScope` bu YÜZDEN İKİ çerezi de arar ve
// HANGİSİ bulunursa onun HAM (decode/doğrulama YAPILMADAN) değerini döner —
// `RateLimitService.buildScopeKey`'in HER ZAMAN HMAC'lediği "hesap"
// girdisiyle AYNI sözleşme (ham e-posta/userId/çerez değeri anahtarda/logda
// GÖRÜNMEZ). Çerez İÇERİĞİNİN KENDİSİ decode/imza DOĞRULANMAZ — bu guard'ın
// işi DEĞİL, Better Auth'un kendi `verifyTwoFactor()`'ı zaten yapar; burada
// SADECE opak bir "bu istek hangi 2FA bağlamına ait" anahtarı gerekir.
//
// Her iki çerez de YOKSA (anonim/bozuk istek) `undefined` döner — hesap
// kapsamı ATLANIR, IP kapsamı YİNE uygulanır (`extractAccountScopeValue`'nun
// AYNI "e-posta yoksa atla" deseni, `rate-limit.guard.ts`).
//
// GÜNCELLEME (T-016 FIX turu 3, madde ①/S2-1+N-1, `medium`) — ÖNCEKİ sıra
// (ÖNCE challenge, SONRA oturum) `security`'nin ÖLÇTÜĞÜ bir ZEHİRLEME
// deliği AÇIYORDU: `session_token` + `two_factor` İKİSİ de İSTEKTE VARSA
// bu fonksiyon challenge değerini SEÇİYORDU — oysa ÇAĞIRANIN KENDİSİ bu
// değeri DİLEDİĞİ GİBİ üretebilir (saldırgan, oturumu ELE GEÇİRMİŞ olsa
// bile, HER isteğe rastgele bir `two_factor` çerezi EKLEYEBİLİR). Sonuç:
// hesap kapsamlı sayaç HER istekte TAZE bir kovaya düşer, 5/15dk eşiği HİÇ
// TETİKLENMEZ (yalnızca IP kapsamı kalır). `security`'nin "en ucuz doğru
// düzeltme" önerisi UYGULANDI — ÖNCELİK TERS ÇEVRİLDİ: `session_token` VARSA
// (ve boş değilse) HER ZAMAN KAZANIR, `two_factor` ARTIK YALNIZCA
// `session_token` YOKSA değerlendirilir.
//
// BU TERS ÇEVİRME MEŞRU ÖN-GİRİŞ AKIŞINI BOZMAZ — DOĞRULANDI (kaynak
// okuması): `better-auth@1.7.14`
// `dist/plugins/two-factor/index.mjs:279-291` (`/sign-in/email` SONRASI
// `hooks.after`, `data.user.twoFactorEnabled` İSE çalışan dal) kimlik
// doğrulamasının ÜRETTİĞİ oturum çerezini `deleteSessionCookie(ctx, true)`
// İLE YANITTAN SİLER VE `ctx.context.internalAdapter.deleteSession(data.
// session.token)` İLE DB'DEN de SİLER, ANCAK SONRA `two_factor` çerezini
// yazar — yani GERÇEK ön-giriş akışında istemcinin elinde `session_token`
// ASLA bulunmaz, bu kolun önceliği YALNIZCA saldırganın (session'ı ele
// geçirmiş OLMASI GEREKEN) senaryosunda devreye girer. `verifyTwoFactor()`
// (`verify-two-factor.mjs:14`, DOSYA BAŞI yorumunun atıfı) da AYNI önceliği
// (önce `getSessionFromCtx`, oturum VARSA `two_factor` çerezine HİÇ BAKMAZ)
// uygular — bu fonksiyon artık kütüphanenin KENDİ davranışıyla TUTARLI.
//
// ⚠ ÇAPRAZ HESAP KİLİTLEME (DoS) BU YOLDAN MÜMKÜN DEĞİL — kapsam değeri
// (artık `session_token`) kurbanın KENDİ gizli çerezidir; saldırgan onu
// bildiği anda zaten oturuma sahiptir (`high` DEĞİL, bu yüzden `medium`).

import type { ApiEnv } from '../../config/api-env.js'

/** Better Auth'un KENDİ üretim kararı — `advanced.cookiePrefix` AYARLANMADI (auth-instance.ts), varsayılan budur. */
const BETTER_AUTH_COOKIE_PREFIX = 'better-auth'
/** `@better-auth/cookies`'in `SECURE_COOKIE_PREFIX`'i — ÖLÇÜLDÜ (`dist/cookies/cookie-utils.mjs`). */
const SECURE_COOKIE_PREFIX = '__Secure-'

/**
 * `useSecureCookies`'İN BİREBİR AYNI girdisi (`auth-instance.ts`:
 * `useSecureCookies: env.NODE_ENV === 'production'`) — iki karar AYNI
 * değişkenden TUTARLI türetilmeli (F4'ün dosya başı yorumunun AYNI dersi).
 */
function resolveSecureCookiePrefix(env: Pick<ApiEnv, 'NODE_ENV'>): string {
  return env.NODE_ENV === 'production' ? SECURE_COOKIE_PREFIX : ''
}

/**
 * `export` — FIX turu 3, madde ①/(b) (solid N-1'in "ayna bağlı değil"
 * bulgusu). Bu türetmenin Better Auth'un KENDİ üretim kararıyla (`auth-
 * instance.ts`'in `useSecureCookies`/çerez adı) GERÇEKTEN eşleştiğini kanıtlamanın
 * tek güvenilir yolu, CANLI bir `Auth` örneğinin ÜRETTİĞİ `Set-Cookie`
 * adını bu fonksiyonun türettiği adla KARŞILAŞTIRMAKTIR (iki modülün AYNI
 * sabit değerleri elle TEKRARLAMASI değil) — `two-factor-plugin-live.test.ts`
 * "çerez adı aynası" bloğu bunu yapar. `auth-instance.ts`'in çerez adı
 * türetmesini tek bir paylaşılan modüle ÇIKARMAK (seçenek (i)) bu alt
 * görevde BİLEREK YAPILMADI — `auth-instance.ts` Better Auth'a `advanced.
 * useSecureCookies` olarak bir BOOLEAN verir, çerez ADINI KENDİSİ hiç
 * HESAPLAMAZ (kütüphane hesaplar); ortak bir "ad türetici" modülü bu yüzden
 * `auth-instance.ts`'te GERÇEKTEN TÜKETİLEN bir şey olmaz, yalnızca İKİNCİ
 * bir TEKRAR OLURDU. Canlı karşılaştırma bunun yerine iki tarafın GERÇEKTEN
 * aynı sonuca ulaştığını ÖLÇER; varsayım sessizce sapsa (`cookiePrefix`
 * ayarlanırsa/`useSecureCookies` değişirse) test KIRMIZI olur.
 */
export function resolveBetterAuthCookieName(
  baseName: string,
  env: Pick<ApiEnv, 'NODE_ENV'>,
): string {
  return `${resolveSecureCookiePrefix(env)}${BETTER_AUTH_COOKIE_PREFIX}.${baseName}`
}

/**
 * `Cookie` başlığını (`"a=1; b=2"`) `name → value` haritasına çevirir. Dış
 * veri (HTTP başlığı) — ama Zod GEREKMEZ (CLAUDE.md §4'ün Zod zorunluluğu
 * GÖVDE/env/webhook/JSONB içindir; bu bir metin AYRIŞTIRMASIdır, şema
 * doğrulaması DEĞİL — `client-ip.ts`'in `X-Forwarded-For` ayrıştırmasıyla
 * AYNI ilke).
 */
function parseCookieHeader(header: string): ReadonlyMap<string, string> {
  const pairs = new Map<string, string>()
  for (const segment of header.split(';')) {
    const trimmed = segment.trim()
    if (trimmed.length === 0) {
      continue
    }
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const name = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (name.length > 0) {
      pairs.set(name, value)
    }
  }
  return pairs
}

/**
 * `req.headers['cookie']` dizi OLABİLİR (adaptör-nötr tip, `HttpRequestHeaders`)
 * — tek dizeye birleştirilir. `Array.isArray` `readonly string[]`'i tip
 * düzeyinde narrowLAMAZ (TS'in bilinen sınırı) — bu yüzden PARAMETRE tipi
 * BİLEREK `readonly` DEĞİL (çağıranlar `HttpRequestHeaders`'ın ÜRETTİĞİ
 * mutable `string[]`'i OLDUĞU GİBİ geçirir).
 */
function normalizeCookieHeaderValue(raw: string | string[] | undefined): string | undefined {
  if (raw === undefined) {
    return undefined
  }
  return Array.isArray(raw) ? raw.join('; ') : raw
}

/**
 * `verify-totp`/`verify-backup-code` İÇİN hesap kapsamı değerini çıkarır.
 *
 * FIX turu 3, madde ①/(a) — ÖNCELİK TERS ÇEVRİLDİ: `session_token` VARSA
 * (boş değilse) HER ZAMAN KAZANIR, `two_factor` çerezi ARTIK YALNIZCA
 * `session_token` YOKSA değerlendirilir (dosya başı GÜNCELLEME yorumu —
 * gerekçe VE kaynak doğrulaması orada). `undefined` → hesap kapsamı ATLANIR.
 */
export function extractTwoFactorVerifyAccountScope(
  cookieHeaderRaw: string | string[] | undefined,
  env: Pick<ApiEnv, 'NODE_ENV'>,
): string | undefined {
  const cookieHeader = normalizeCookieHeaderValue(cookieHeaderRaw)
  if (cookieHeader === undefined) {
    return undefined
  }

  const cookies = parseCookieHeader(cookieHeader)

  const sessionCookieName = resolveBetterAuthCookieName('session_token', env)
  const sessionValue = cookies.get(sessionCookieName)
  if (sessionValue !== undefined && sessionValue.length > 0) {
    return sessionValue
  }

  const challengeCookieName = resolveBetterAuthCookieName('two_factor', env)
  const challengeValue = cookies.get(challengeCookieName)
  if (challengeValue !== undefined && challengeValue.length > 0) {
    return challengeValue
  }

  return undefined
}
