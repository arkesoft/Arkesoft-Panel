// @arkesoft/api — span attribute anahtarları: TEK KAYNAK (ROADMAP v0.0.17,
// T-028/S6, architect "tenant_id span attribute" kutu 3 — kısmi kapsam)
//
// ⚠⚠ BU DOSYA `arkesoft.*` ad alanlı span attribute ANAHTARLARININ tek
// tanımlı olduğu yerdir (AC-55). Hiçbir başka dosya bu anahtarları KENDİ
// literal dizesiyle TEKRAR YAZMAZ — `grep -rn "arkesoft.tenant"` bu dosya VE
// onu import eden tüketiciler DIŞINDA eşleşme VERMEMELİDİR.
//
// ⚠⚠ KAPSAM NOTU (bağlayıcı, kısmi kapsam — PM "görünürlük yüzeyi ertelendi"
// kararı + K-A28-1'in R7'si): bu sürümde `apps/api/src/observability/
// instrumentation.ts` ÜÇ sinyali de (trace/log/metric) AÇIKÇA BOŞ
// dizi/okuyucu ile kurar (`spanProcessors: []` vb.) — bu, OTel'in
// `TracerProvider`'ı HİÇ KURULMAMASINA yol açar (ölçülmüş davranış,
// `sdk-node@0.223.2/build/src/sdk.js:217`: `if (spanProcessors.length > 0)`).
// Sonuç: bugün HİÇBİR span bu attribute'u GERÇEKTEN TAŞIMAZ — anahtar
// GELECEKTEKİ tüketiciler (bir exporter eklendiğinde, v0.18.0; veya S7'nin
// kuyruk telemetrisi) için TEK KAYNAK olarak burada durur. Bu BİLİNÇLİ bir
// erteleme, sessiz bir eksiklik DEĞİL — `docs/observability.md` (S11) bunu
// AÇIKÇA yazar.
//
// ⚠ `tenant_plan` BİLEREK YOK (architect Karar 3, bağlayıcı) — `TenantContext`
// iş verisi taşımaz (K-A4) ve plan `Subscription`'da, ek bir DB okuması
// gerektirir; trafik yokken bu maliyeti büyütmek anlamsız. Yeniden açma:
// v0.15.0/v0.17.0.
//
// ⚠ PII YASAĞI (CLAUDE.md §4/§7): `tenant.id` bir ULID/UUID'dir, PII
// DEĞİLDİR (architect A4 varsayımı — CLAUDE.md §7'nin onu ZORUNLU kılması
// dayanağı). Bu dosyaya parola/token/çerez/API anahtarı/kart no/TCKN/tam
// adres/tam e-posta türünde bir anahtar EKLENMEZ.

/**
 * Tenant kimliğini taşıyan span attribute anahtarı. `arkesoft.*` ad alanı,
 * OTel'in "vendor-specific attribute" önerisiyle (ters-DNS benzeri önek)
 * tutarlıdır — resmi OTel semantic conventions'ın bir parçası DEĞİLDİR.
 */
export const ARKESOFT_TENANT_ID_ATTRIBUTE = 'arkesoft.tenant.id'

/**
 * Bu dosyanın tanımladığı TÜM span attribute anahtarlarının kapalı kümesi —
 * `security`/`qa`'nın derinlemesine taraması (AC-55/L-12, S9) bu diziyi
 * GEZEREK her anahtarın değerinin PII taşımadığını doğrular; yeni bir
 * attribute eklemek bu diziye BİR SATIR eklemek demektir (ikinci bir kayıt
 * defteri AÇILMAZ).
 */
export const ARKESOFT_SPAN_ATTRIBUTE_KEYS: readonly string[] = [ARKESOFT_TENANT_ID_ATTRIBUTE]
