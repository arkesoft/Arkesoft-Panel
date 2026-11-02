// @arkesoft/api — kimlik doğrulama GEREKTİRMEYEN uç allowlist'i (ROADMAP
// v0.0.5, T-006/S6, architect "TENANT İZOLASYONU" → "İKİ KÜME AYRI KALIR",
// PM R3)
//
// ⚠ BU KÜME `TENANT_EXEMPT_PATHS` (`tenancy/tenant-exempt-paths.ts`) İLE
// BİRLEŞTİRİLMEZ. "Kiracı gerekmez" ile "kimlik gerekmez" İKİ AYRI güvenlik
// kararıdır: `/auth/sessions*` üçlüsü KİRACIDAN muaftır (o kümede VAR) ama
// KİMLİKTEN muaf DEĞİLDİR (BU kümede YOK) — tek listeyle ifade EDİLEMEZ.
//
// TAM OLARAK on eleman, DÖRT grup: iki health ucu + Better Auth'a delege
// edilen yedi yol (`AUTH_DELEGATED_PATHS`, `auth-delegated-paths.ts`) + BİR
// vitrin yolu (`/trpc/storefront.currentTenant`, ROADMAP v0.0.8, T-009/S7,
// ADR-0012 — dördüncü grup). Yedi delege yolu BİLEREK import EDİLMEDİ,
// literal YAZILDI — `TENANT_EXEMPT_PATHS`'in dosya başı yorumunun AYNI
// gerekçesi (PM R3, bağlayıcı): "üretim kodunda tenancy → auth bağımlılığı
// YOKTUR" ilkesinin BU dosyadaki karşılığı "auth modülünün KENDİ İÇİNDE iki
// küme arasında bile" tekrar eden bir import YERİNE literal yazarak İNCELEME
// GÖRÜNÜRLÜĞÜ sağlamaktır (AC9'un asıl özelliği) — `auth-path-sets.test.ts`'in
// DÖRDÜNCÜ testi (FIX turu 1, madde 8 — solid M-3 düzeltmesi; ÖNCEKİ yorum
// burada ÜÇÜNCÜ testin bunu yaptığını İDDİA EDİYORDU, bu YANLIŞTI — ÜÇÜNCÜ
// test yalnızca alt küme kontrolleri yapar) tam bu YEDİ literalin
// `AUTH_DELEGATED_PATHS`'teki (yöntem, yol) çiftleriyle birebir örtüştüğünü
// MEKANİK olarak doğrular; sapma ORADA YAKALANIR — dördüncü grubun TEK
// elemanı bu mekanik testin KAPSAMI DIŞINDADIR (delege yol DEĞİL), bu yüzden
// `auth-path-sets.test.ts`'in dördüncü testi YEDİ delege literalin
// `AUTH_EXEMPT_PATHS`'in ALT KÜMESİ olduğunu VE toplamın on olduğunu
// doğrulayacak şekilde SIKILAŞTIRILDI (gevşetme DEĞİL).
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

import { normalizeRequestPath } from '../http/normalize-request-path.js'

/** Kimlik doğrulaması gerektirmeyen, tam eşleşmeli on uç. */
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
