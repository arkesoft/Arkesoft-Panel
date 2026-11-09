// @arkesoft/api — Better Auth'a delege edilen allowlist (ROADMAP v0.0.5,
// T-006/S5, architect "tRPC SÖZLEŞMESİ" → HTTP sözleşmesi, bölüm A)
//
// ⚠ FAIL-CLOSED DELEGASYON (bağlayıcı, architect): `AuthController`'ın
// `@All('auth/*path')` dinleyicisi BU kümedeki TAM (yöntem + yol)
// eşleşmeleri Better Auth'a iletir; küme DIŞI her şey 404 döner. Better
// Auth'un catch-all'ı etkin eklentilerin TÜM uçlarını açar —
// `/list-sessions` yanıtı ham `token` alanını içerir (AC6 ihlali),
// `/get-session` v0.0.6'nın `session.me` kapsamını önceden tüketir (K7
// ihlali). Better Auth'un `disabledPaths` seçeneğine GÜVENİLMİYOR (sürüme
// bağlı, atlatılırsa sessizce açık kalır) — allowlist BİZİM kodumuzda,
// BİZİM testimizle (`auth-delegation-allowlist.test.ts`) pinli.
//
// A-G6 ÖLÇÜMÜ (gerçek `better-auth@1.7.14` ile — S2'nin ölçtüğü A-G1/A-G2
// `@better-auth/cli`'nin bundled `1.4.21`'iyle yapılmıştı, bu alan şekli
// ÖLÇÜMÜ DEĞİL; A-G6 bu alt görevin KENDİ ölçümü):
//
// `better-auth/dist/api/routes/*.mjs` kaynağı doğrudan okunarak ÇEKİRDEK
// (eklenti YOK) uç listesi çıkarıldı. YEDİ yol çoğunlukla örtüşüyor, TEK
// SAPMA: architect'in yazdığı `POST /auth/forget-password` bu sürümde
// MEVCUT DEĞİL. Gerçek uç adı `POST /request-password-reset`
// (`password.mjs:20`, fonksiyon adı `requestPasswordReset`). "forget-
// password" adı Better Auth'un DAHA ÖNCEKİ bir sürümüne/dokümantasyon
// konvansiyonuna ait görünüyor. **DÜZELTME: additive isim düzeltmesi** —
// allowlist'in SAYISI (yedi) DEĞİŞMEDİ, yalnızca bu TEK elemanın yol
// metni düzeltildi.
//
// Ayrıca `GET /reset-password/:token` adlı SEKİZİNCİ bir çekirdek uç VAR
// (`password.mjs:92`, `requestPasswordResetCallback`) — Better Auth'un
// KENDİ `sendResetPassword`'e verdiği `data.url` alanının hedefi, sunucu
// taraflı bir yönlendirme callback'i. Yol PARAMETRESİ taşıdığı için bu
// kümeyle (tam eşleşme, prefix/regex YOK — AC9) ifade EDİLEMEZ; bilerek
// DIŞARIDA bırakıldı. Bunun pratik sonucu YOKTUR: `auth-instance.ts`
// Better Auth'un ÜRETTİĞİ `data.url`'i KULLANMAZ, kendi URL'ini
// `data.token`'dan kurar (`?token=...` sorgu parametresi) — bu GET
// callback hiçbir zaman bir Arkesoft e-postasından TIKLANMAZ.
//
// `GET /verify-email` için ayrı bir varyant YOK (A-G6'nın "ek GET
// varyantı?" sorusu bu uç için OLUMSUZ ölçüldü — tek uç, tam architect'in
// yazdığı gibi).
//
// İKİ AYRI KARAR (PM R3, bağlayıcı): bu dosya SADECE "Better Auth'a delege
// edilsin mi" kararını taşır — "kimlik doğrulaması gerekir mi" (S6'nın
// `AUTH_EXEMPT_PATHS`'i) AYRI bir karardır, birleştirilmez.
//
// FIX turu 1, madde 11 (solid M-1) — yol normalizasyonu ARTIK ortak
// `http/normalize-request-path.ts`'ten İTHAL EDİLİR (beş kopyadan biriydi).
//
// GÜNCELLEME (ROADMAP v0.0.15, T-016/S5, po'nun ölçümü + BU alt görevin KENDİ
// doğrulaması): 7 → 13, ALTI yeni literal — `better-auth@1.7.14`'ün
// `plugins/two-factor` eklentisi (S4'ün `auth-instance.ts`'te kaydettiği,
// `accountLockout` AÇIK, `otpOptions`/`totpOptions` YAPILANDIRILMADI)
// KAYNAĞI DOĞRUDAN OKUNARAK ölçüldü (`better-auth/dist/plugins/two-factor/
// {index,totp/index,backup-codes/index,otp/index}.mjs`, gerçek kurulu
// sürüm — A-G6'nın AYNI yöntemi):
//
//   - `index.mjs`: `enableTwoFactor` → `POST /two-factor/enable`
//     (`use: [sessionMiddleware]`), `disableTwoFactor` →
//     `POST /two-factor/disable` (`use: [sensitiveSessionMiddleware]`).
//   - `totp/index.mjs`: `getTOTPURI` → `POST /two-factor/get-totp-uri`
//     (`use: [sessionMiddleware]`), `verifyTOTP` →
//     `POST /two-factor/verify-totp` (`use` YOK — HİÇBİR Better Auth
//     middleware'i, çağıran yalnızca `two_factor` challenge çerezini taşır).
//     AYNI dosyadaki `generateTOTP` `createAuthEndpoint.serverOnly(...)`
//     kullanır — `@better-auth/core/api`'nin KENDİ belgesi ("never
//     registered on the HTTP router... better-call's router skips an
//     endpoint when its path is missing or when SERVER_ONLY is set") BUNU
//     DOĞRULAR: bu uç HTTP router'a HİÇ kaydolmaz, bu kümeye giremez (yol
//     bile YOK) — context özetindeki `/totp/generate` notuyla BİREBİR
//     örtüşüyor.
//   - `backup-codes/index.mjs`: `generateBackupCodes` →
//     `POST /two-factor/generate-backup-codes` (`use: [sessionMiddleware]`),
//     `verifyBackupCode` → `POST /two-factor/verify-backup-code` (`use`
//     YOK, `verifyTOTP` ile AYNI gerekçe). AYNI dosyadaki `viewBackupCodes`
//     DA `createAuthEndpoint.serverOnly(...)`'dür — HTTP router'a GİRMEZ.
//   - `otp/index.mjs`: `send2FaOTP` (`/two-factor/send-otp`) ve `verifyOTP`
//     (`/two-factor/verify-otp`) `otp2fa(options?.otpOptions)` KOŞULSUZ
//     çağrıldığı için HTTP router'a KAYDOLUR (`options?.otpOptions`
//     `undefined` olsa BİLE `createAuthEndpoint(...)` çalışır) — ama bu
//     İKİSİ BİLEREK BU KÜMEYE EKLENMEDİ: `auth-instance.ts` `otpOptions`
//     GEÇMEZ, `send2FaOTP` çağrıldığında KENDİ İÇİNDE
//     `OTP_NOT_CONFIGURED` (400) fırlatır — bu metodu Arkesoft'un 2FA
//     akışı HİÇ KULLANMAZ (yalnızca TOTP + yedek kod desteklenir, architect
//     kararı). Eklemek yalnızca kullanılmayan bir yüzeyi (sonu HER ZAMAN
//     400 ile biten) açardı; fail-closed'ın ruhu (gerekmeyen yüzeyi açma)
//     bunu DIŞARIDA bırakmayı gerektirir. Context özetinin "opsiyonel"
//     notu bu ölçümle ÇELİŞMİYOR — BU alt görevin KENDİ sonucu da AYNI: bu
//     iki yol delege EDİLMEZ.
//
// `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS` (aşağıda) bu altı yeni yoldan
// DÖRDÜNÜN (`use: [sessionMiddleware]`/`use: [sensitiveSessionMiddleware]`
// TAŞIYANLARIN) Better Auth'un KENDİSİNİN zaten geçerli bir oturum
// BEKLEDİĞİNİ — bu yüzden `AuthGuard`'ın `authenticated` dalına
// ULAŞMASININ gerektiğini, dolayısıyla BU KÜMENİN `AUTH_EXEMPT_PATHS`'E
// GİRMEMESİ gerektiğini — açık hale getirir. Kalan İKİSİ (`verify-totp`/
// `verify-backup-code`, middleware YOK) bu yüzden `AUTH_DELEGATED_PATHS`'TE
// VAR ama `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`'TE YOK — onlar
// `AUTH_EXEMPT_PATHS`'e (S5'in `auth-exempt-paths.ts` dosyası) EKLENİR.

import { normalizeRequestPath } from '../http/normalize-request-path.js'

/** Better Auth'un mount edildiği taban yol. */
export const AUTH_BASE_PATH = '/auth'

/**
 * Better Auth'a OLDUĞU GİBİ iletilen, TAM (yöntem + yol) eşleşmeli on üç uç.
 * Büyütmek bu dosyayı DEĞİŞTİRMEYİ gerektirir (inceleme görünürlüğü, AC9).
 */
export const AUTH_DELEGATED_PATHS: ReadonlySet<string> = new Set([
  'POST /auth/sign-up/email',
  'POST /auth/sign-in/email',
  'POST /auth/sign-out',
  'GET /auth/verify-email',
  'POST /auth/send-verification-email',
  'POST /auth/request-password-reset',
  'POST /auth/reset-password',
  // ROADMAP v0.0.15, T-016/S5 — dosya başı GÜNCELLEME yorumunda ölçülen altı
  // two-factor yolu.
  'POST /auth/two-factor/enable',
  'POST /auth/two-factor/disable',
  'POST /auth/two-factor/get-totp-uri',
  'POST /auth/two-factor/generate-backup-codes',
  'POST /auth/two-factor/verify-totp',
  'POST /auth/two-factor/verify-backup-code',
])

/**
 * {@link AUTH_DELEGATED_PATHS}'in, Better Auth'un KENDİSİNİN (bu dosyanın
 * başındaki GÜNCELLEME yorumunda `use:` okumasıyla ölçülen) ZATEN geçerli
 * bir oturum BEKLEDİĞİ dört alt kümesi — ROADMAP v0.0.15, T-016/S5.
 *
 * Bu küme "kimlik gerekir mi" sorusunu `AUTH_DELEGATED_PATHS`'in İÇİNDE
 * (delege edilsin mi sorusunun yanına) AÇIK hale getirir; TEK üretim
 * tüketicisi `__tests__/auth-path-sets.test.ts`'in partition testidir (AYNI
 * desen — `AUTH_OWN_PATHS`'in dosya başı yorumu) — bu kümenin
 * `AUTH_EXEMPT_PATHS`'TEN (S5'in `auth-exempt-paths.ts`'i) TAMAMEN AYRIK
 * olduğunu VE `AUTH_DELEGATED_PATHS`'in bir alt kümesi olduğunu mekanik
 * olarak sabitler. Büyütmek bu dosyayı DEĞİŞTİRMEYİ gerektirir.
 */
export const AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS: ReadonlySet<string> = new Set([
  'POST /auth/two-factor/enable',
  'POST /auth/two-factor/disable',
  'POST /auth/two-factor/get-totp-uri',
  'POST /auth/two-factor/generate-backup-codes',
])

/**
 * Bir (yöntem, URL) çiftinin {@link AUTH_DELEGATED_PATHS}'teki bir yolla TAM
 * eşleşip eşleşmediğini belirler.
 *
 * - Yöntem büyük/küçük harf DUYARSIZ karşılaştırılır (`get`/`GET` aynı).
 * - Yol `normalizeRequestPath()`'ten gelir (ortak `http/` modülü — sorgu
 *   dizesi/fragman karışmaz, sondaki `/` kök hariç soyulur; beş çağıranın
 *   PAYLAŞTIĞI TEK normalizasyon, FIX turu 1 madde 11).
 * - Yol BÜYÜK/KÜÇÜK HARF DUYARLIDIR: fail-closed (varsayılan 404).
 */
export function isAuthDelegatedPath(method: string, rawUrl: string): boolean {
  const normalizedPathname = normalizeRequestPath(rawUrl)

  return AUTH_DELEGATED_PATHS.has(`${method.toUpperCase()} ${normalizedPathname}`)
}
