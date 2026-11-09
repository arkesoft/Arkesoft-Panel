// @arkesoft/api — kimlik doğrulama GEREKTİRMEYEN uç allowlist'i (ROADMAP
// v0.0.5, T-006/S6, architect "TENANT İZOLASYONU" → "İKİ KÜME AYRI KALIR",
// PM R3)
//
// ⚠ BU KÜME `TENANT_EXEMPT_PATHS` (`tenancy/tenant-exempt-paths.ts`) İLE
// BİRLEŞTİRİLMEZ. "Kiracı gerekmez" ile "kimlik gerekmez" İKİ AYRI güvenlik
// kararıdır: `/auth/sessions*` üçlüsü KİRACIDAN muaftır (o kümede VAR) ama
// KİMLİKTEN muaf DEĞİLDİR (BU kümede YOK) — tek listeyle ifade EDİLEMEZ.
//
// TAM OLARAK on iki eleman, DÖRT grup: iki health ucu + Better Auth'a
// delege edilen yolların KİMLİK GEREKTİRMEYEN alt kümesi (`AUTH_DELEGATED_
// PATHS \ AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`, `auth-delegated-paths.ts`)
// + BİR vitrin yolu (`/trpc/storefront.currentTenant`, ROADMAP v0.0.8,
// T-009/S7, ADR-0012 — dördüncü grup). Bu delege alt kümesi BİLEREK import
// EDİLMEDİ, literal YAZILDI — `TENANT_EXEMPT_PATHS`'in dosya başı yorumunun
// AYNI gerekçesi (PM R3, bağlayıcı): "üretim kodunda tenancy → auth
// bağımlılığı YOKTUR" ilkesinin BU dosyadaki karşılığı "auth modülünün
// KENDİ İÇİNDE iki küme arasında bile" tekrar eden bir import YERİNE
// literal yazarak İNCELEME GÖRÜNÜRLÜĞÜ sağlamaktır (AC9'un asıl özelliği).
//
// GÜNCELLEME (ROADMAP v0.0.15, T-016/S5): v0.0.5'te bu kümenin `/auth/`
// önekli alt kümesi `AUTH_DELEGATED_PATHS`'in TAMAMIYLA birebir örtüşüyordu
// — bu bir TASARIM İLKESİ DEĞİL, O ANDAKİ YEDİ delege yolun TAMAMININ
// (TESADÜFEN) kimlik gerektirmemesinin SONUCUYDU. v0.0.15'in dört yeni
// delege yolu (`enable`/`disable`/`get-totp-uri`/`generate-backup-codes`)
// Better Auth'un KENDİSİNİN `sessionMiddleware`/`sensitiveSessionMiddleware`
// BEKLEDİĞİ yollardır — bu dördü delege AMA MUAF DEĞİLDİR, bu yüzden eski
// birebir-örtüşme artık YANLIŞ bir invariant olurdu. `auth-path-sets.test.ts`'in
// DÖRDÜNCÜ testi (FIX turu 1, madde 8'in SIKILAŞTIRMASI, v0.0.15'te TEKRAR
// SIKILAŞTIRILDI) artık BUNU doğrular: `AUTH_EXEMPT_PATHS`'in `/auth/`
// önekli alt kümesi `AUTH_DELEGATED_PATHS \ AUTH_DELEGATED_IDENTITY_
// REQUIRED_PATHS`'in yol kümesiyle BİREBİR eşittir (kimlik GEREKTİRMEYEN
// delege yollar) — sapma ORADA YAKALANIR.
//
// DÖRDÜNCÜ GRUP — vitrin yolu (ROADMAP v0.0.8, T-009/S5+S7, architect K5/K6,
// ADR-0012): `storefront.currentTenant` (`publicTenantProcedure` — kimlik
// YOK, kiracı ZORUNLU) anonim ziyaretçiye açılır; bu yüzden TAM YOLU
// (`/trpc/storefront.currentTenant`) bu kümeye eklenir. `TENANT_EXEMPT_PATHS`
// BU değişiklikle AYNI ANDA değişMEZ (13'te kalır, `tenant-exempt-paths.ts`
// dosya başı yorumuna bkz.) — "kimlik gerekmez" ile "kiracı gerekmez" İKİ
// AYRI karardır (bu dosyanın ⚠ notu, aşağıda), vitrin ziyaretçisi
// KİMLİKSİZDİR ama KİRACISIZ DEĞİLDİR: kiracı `Host`'tan ÇÖZÜLÜR ve
// `TenantGuard` çözümsüz host'u 404 ile REDDEDER. Kiracı muafiyeti EKLEMEK
// `TenantGuard`'ın 404'ünü KAPATIRDI (ADR-0012'nin bağlayıcı kararı).
//
// FAIL-CLOSED TASARIM: `TENANT_EXEMPT_PATHS`'in dosya başı yorumuyla AYNI
// ilke — varsayılan davranış "kimlik zorunlu", bu küme bir OPT-IN DEĞİL, TAM
// TERSİNE bir OPT-OUT'tur. TAM EŞLEŞME kullanılır — prefix/regex eşleşmesi
// YASAKTIR.
//
// FIX turu 1, madde 11 (solid M-1) — yol normalizasyonu ARTIK ortak
// `http/normalize-request-path.ts`'ten İTHAL EDİLİR.
//
// GÜNCELLEME (ROADMAP v0.0.15, T-016/S5, po'nun ölçümü + BU alt görevin
// KENDİ doğrulaması, ⚠⚠ S4'ÜN BAĞLAYICI ÖLÇÜMÜ): 10 → 12, İKİ yeni eleman —
// `/auth/two-factor/verify-totp` ve `/auth/two-factor/verify-backup-code`.
// Gerekçe (`auth-delegated-paths.ts`'in dosya başı GÜNCELLEME yorumunda
// ÖLÇÜLEN middleware okumasının BİREBİR karşılığı): bu iki uç çağrıldığında
// çağıran henüz TAM kimlik doğrulamasından GEÇMEMİŞTİR — elinde yalnızca
// `better-auth.two_factor` challenge çerezi (`Max-Age=600`) vardır, normal
// oturum çerezi YOKTUR (ilk faktör — parola — doğrulandı ama ikinci faktör
// BEKLENİYOR). `AuthContextMiddleware` bu yol muaf OLMADAN
// `authSessionReader.getSession()` çağırır; bu çağrı challenge çerezini
// NORMAL oturum olarak TANIMAZ ve `null` döner → `context.auth =
// {kind:'unauthenticated'}` → `AuthGuard` isteği 401 `UnauthenticatedError`
// ile KESER, Better Auth'un `verifyTOTP`/`verifyBackupCode` handler'ına HİÇ
// ULAŞILMAZ (bu ikisi Better Auth'un KENDİ middleware'inden de muaftır —
// `auth-delegated-paths.ts` dosya başı yorumu — kimlik kontrolünü TAMAMEN
// `two_factor` çerezinin kendi doğrulamasına BIRAKIRLAR). Muafiyet
// EKLENMEZSE 2FA girişi YAPISAL OLARAK kırılır (AuthController'a hiç
// ulaşamaz) — `__tests__/two-factor-http-chain.test.ts`'in (BU alt görev)
// GERÇEK HTTP zincirinde KANITLADIĞI budur.
//
// Diğer dört yeni delege yol (`enable`/`disable`/`get-totp-uri`/
// `generate-backup-codes`) BU kümeye BİLEREK EKLENMEDİ —
// `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`'in (`auth-delegated-paths.ts`)
// dosya başı yorumu: Better Auth'un KENDİSİ bu dördünde `sessionMiddleware`/
// `sensitiveSessionMiddleware` BEKLER, bu yüzden `AuthGuard`'ın
// `authenticated` dalına ULAŞMASI (gerçek oturum sahibi olmak) GEREKİR —
// muaf tutmak Better Auth'un KENDİ gereksinimiyle ÇELİŞİRDİ.

import { normalizeRequestPath } from '../http/normalize-request-path.js'

/** Kimlik doğrulaması gerektirmeyen, tam eşleşmeli on iki uç. */
export const AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  '/health',
  '/health/ready',
  '/auth/sign-up/email',
  '/auth/sign-in/email',
  '/auth/sign-out',
  '/auth/verify-email',
  '/auth/send-verification-email',
  '/auth/request-password-reset',
  '/auth/reset-password',
  '/trpc/storefront.currentTenant',
  // ROADMAP v0.0.15, T-016/S5 — dosya başı GÜNCELLEME yorumu: oturumSUZ
  // (yalnızca `two_factor` challenge çerezi) çağrılan iki uç.
  '/auth/two-factor/verify-totp',
  '/auth/two-factor/verify-backup-code',
])

/**
 * Bir istek URL'sinin (`req.url`) {@link AUTH_EXEMPT_PATHS}'teki bir yolla TAM
 * eşleşip eşleşmediğini belirler. `tenant-exempt-paths.ts`'in
 * `isTenantExemptPath` deseniyle BİREBİR AYNI normalizasyon (sondaki `/`
 * soyulur, sorgu dizesi/fragman karışmaz, büyük/küçük harf DUYARLIDIR).
 */
export function isAuthExemptPath(rawUrl: string): boolean {
  return AUTH_EXEMPT_PATHS.has(normalizeRequestPath(rawUrl))
}
