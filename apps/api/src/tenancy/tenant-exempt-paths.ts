// @arkesoft/api — tenant gerektirmeyen uç allowlist'i (ROADMAP v0.0.4,
// T-002/ST-5, architect K5/K-A4)
//
// FAIL-CLOSED TASARIM: varsayılan davranış "tenant zorunlu" — bu küme bir
// OPT-IN listesi DEĞİL, tam tersine bir OPT-OUT'tur. v0.0.5'ten sonra eklenen
// bir uç bu kümeye eklenmediği sürece tenant'sız AÇILAMAZ (AC7). Bu yüzden
// küme KASITLI OLARAK küçük tutulur ve TAM EŞLEŞME kullanılır — prefix/regex
// eşleşmesi burada YASAKTIR (bir gün `/health-check-bypass` gibi bir uç
// prefix'le yanlışlıkla muaf olabilir).
//
// Sabit TEK dosyada tanımlanır (K-A4, bağlayıcı): `TenantContextMiddleware`
// (ST-5) bu kümeyi OKUYARAK tenant çözümünü atlayıp `{ kind: 'exempt' }`
// yazan TEK aktif tüketicidir — `TenantGuard` (ST-5) ise bu kümeyi AYRICA
// SORGULAMAZ, middleware'in ürettiği `TenantResolution.kind === 'exempt'`
// sonucuna GÜVENİR (bkz. `tenant.guard.ts` dosya başı yorumu — tek kaynaktan
// okunan tek karar, iki yerde tekrarlanan path-eşleştirme mantığı YOK).
//
// Birim testi (`tenant-exempt-paths.test.ts`) kümenin TAM OLARAK bu on iki
// elemandan oluştuğunu assert eder — listeyi büyütmek bu testi DEĞİŞTİRMEYİ,
// yani kod inceleme görünürlüğünü ZORUNLU kılar (R4 telafisi #2).
//
// GÜNCELLEME (ROADMAP v0.0.5, T-006/S5, architect "TENANT İZOLASYONU" bölümü,
// PM riski 6 — BEKLENEN): 2 → 12. Gerekçe: panel giriş yüzeyi platform host'u
// `panel.arkesoft.{APP_BASE_DOMAIN}`'dir; `panel` `reserved-subdomains.ts:22`'de
// REZERVE → `resolveHost` onu `reserved_subdomain` ile ÇÖZÜMSÜZ bırakır.
// Muafiyet OLMADAN hiçbir auth ucuna erişilemez (panel host'unda kiracı asla
// çözülemez — bu BEKLENEN, panel kiracı değildir).
//
// Eklenen 10 eleman, üç grup:
//   (1) 7 Better Auth delege yolu (`AUTH_DELEGATED_PATHS`, `auth-delegated-
//       paths.ts`'in TAM AYNI yedi literal'i — BİLEREK import EDİLMEDİ, PM
//       R3/architect bağlayıcı: "üretim kodunda tenancy → auth bağımlılığı
//       YOKTUR, listeler literal yazılır" — inceleme görünürlüğü AC9'un asıl
//       özelliği). A-G6 ölçümü yedinci yolu `/auth/forget-password`'den
//       GERÇEK sürümdeki `/auth/request-password-reset`'e DÜZELTTİ (bkz.
//       `auth-delegated-paths.ts` dosya başı yorumu).
//   (2) 3 kendi oturum ucumuz (`/auth/sessions`, `/auth/sessions/revoke`,
//       `/auth/sessions/revoke-all` — S6 YAZACAK, tenant'tan muaf ama
//       KİMLİKTEN muaf DEĞİL; `AUTH_EXEMPT_PATHS`'e (S6) GİRMEZLER).
//
// İKİ KÜME AYRI KALIR (PM R3, bağlayıcı): bu küme ("kiracı gerekmez") ile
// S6'nın `AUTH_EXEMPT_PATHS`'i ("kimlik gerekmez") İKİ AYRI güvenlik kararı —
// birleştirilmez. `/auth/sessions*` üçlüsü KİRACIDAN muaf (bu kümede) ama
// KİMLİKTEN muaf DEĞİL (`AUTH_EXEMPT_PATHS`'te YOK).
//
// FIX turu 1, madde 11 (solid M-1, bağlayıcı) — yol normalizasyonu ARTIK
// ortak `http/normalize-request-path.ts`'ten İTHAL EDİLİR (BEŞ kopyadan
// biriydi, bu dosya ORİJİNAL — dördü BUNDAN kopyalanmıştı). Ortak modül NE
// `tenancy`'ye NE `auth`'a bağımlı — PM R3'ün "tenancy → auth bağımlılığı
// YOKTUR" ilkesi KORUNUR (`http/` iki modülden de bağımsız bir KATMAN).

import { normalizeRequestPath } from '../http/normalize-request-path.js'

/** Tenant çözümü gerektirmeyen, tam eşleşmeli on iki uç. */
export const TENANT_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  '/health',
  '/health/ready',
  '/auth/sign-up/email',
  '/auth/sign-in/email',
  '/auth/sign-out',
  '/auth/verify-email',
  '/auth/send-verification-email',
  '/auth/request-password-reset',
  '/auth/reset-password',
  '/auth/sessions',
  '/auth/sessions/revoke',
  '/auth/sessions/revoke-all',
])

/**
 * Bir istek URL'sinin (`req.url`) {@link TENANT_EXEMPT_PATHS}'teki bir yolla
 * TAM eşleşip eşleşmediğini belirler.
 *
 * - Yol `new URL(rawUrl, 'http://exempt-path-check.invalid').pathname`'den
 *   alınır — sorgu dizesi/fragman bu karşılaştırmaya KARIŞMAZ.
 * - Sondaki `/` SOYULUR (`/health/` da `/health` ile eşleşir) — kök yol `/`
 *   hariç (onu soymak boş dizeye düşürür).
 * - BÜYÜK/KÜÇÜK HARF DUYARLIDIR: `/HEALTH` muaf DEĞİLDİR → tenant ister →
 *   fail-closed (K5'in "varsayılan tenant zorunlu" kararının doğal sonucu).
 */
export function isTenantExemptPath(rawUrl: string): boolean {
  return TENANT_EXEMPT_PATHS.has(normalizeRequestPath(rawUrl))
}
