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
// Birim testi (`tenant-exempt-paths.test.ts`) kümenin TAM OLARAK bu iki
// elemandan oluştuğunu assert eder — listeyi büyütmek bu testi DEĞİŞTİRMEYİ,
// yani kod inceleme görünürlüğünü ZORUNLU kılar (R4 telafisi #2).

/** Tenant çözümü gerektirmeyen, tam eşleşmeli iki uç. */
export const TENANT_EXEMPT_PATHS: ReadonlySet<string> = new Set(['/health', '/health/ready'])

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
  const { pathname } = new URL(rawUrl, 'http://exempt-path-check.invalid')
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

  return TENANT_EXEMPT_PATHS.has(normalizedPathname)
}
