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

import { normalizeRequestPath } from '../http/normalize-request-path.js'

/** Better Auth'un mount edildiği taban yol. */
export const AUTH_BASE_PATH = '/auth'

/**
 * Better Auth'a OLDUĞU GİBİ iletilen, TAM (yöntem + yol) eşleşmeli yedi uç.
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
