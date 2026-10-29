// @arkesoft/api — istek yolu normalizasyonu (FIX turu 1, madde 11 — solid
// M-1, medium)
//
// `auth-delegated-paths.ts` · `auth-exempt-paths.ts` · `auth-own-paths.ts` ·
// `rate-limit/rate-limit.policy.ts` · `tenancy/tenant-exempt-paths.ts`'in
// SAF, BİREBİR aynı yol normalizasyonunun BİRLEŞTİRİLMİŞ hâli (beş kopya,
// dördü T-006'da doğdu — dosyaların kendi yorumları "BİREBİR AYNI" diyerek
// bunu ZATEN beyan ediyordu). Bu Task `assertNever`'ın üç kopyasını TAM BU
// gerekçeyle (aynı sebeple birlikte değişmesi gereken kod, tek yerde
// durmalı) birleştirmeyi ZORUNLU kılmıştı — aynı standart burada da
// uygulanır.
//
// SAF (framework-bağımsız, `express`/`fastify` import YOK) — `http/`
// altında, NE `tenancy`'ye NE `auth`'a BAĞIMLI: beş çağıranın YARISI
// `tenancy/**`'de, YARISI `auth/**`'de olduğu için modül `tenancy → auth`
// (veya tersi) bağımlılığı DOĞURMAZ (PM R3 korunur).
//
// Sondaki `/` SOYULUR (kök yol `/` HARİÇ) — sorgu dizesi/fragman
// karşılaştırmaya KARIŞMAZ (`new URL(...).pathname` zaten bunları ayıklar).

/**
 * `rawUrl`'in (`req.url`) yol kısmını normalize eder: sorgu dizesi/fragman
 * çıkarılır, sondaki `/` soyulur (kök `/` hariç). İkinci parametre yalnızca
 * `new URL()`'in RELATİF url'i çözmesi için gereken bir TABAN'dır — hiçbir
 * zaman gerçek bir ağ isteğine KARIŞMAZ.
 */
export function normalizeRequestPath(rawUrl: string): string {
  const { pathname } = new URL(rawUrl, 'http://normalize-request-path.invalid')
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}
