// @arkesoft/i18n — katalog farkı (ROADMAP v0.0.18, T-027/S5a, AC-45'in
// NEGATİF KANIT yüzeyi)
//
// ⚠⚠ SAF FONKSİYON — I/O YOK, IMPORT YOK (bu dosyada TEK bir import satırı
// bile yok, bilinçli: bağımlılık sıfır, test edilebilirlik maksimum).
//
// `qa`'nın AC-45 negatif kanıtı bu fonksiyona SENTETİK fixture vererek
// alınır — GERÇEK katalog (`tr-tr-errors.ts`) veya GERÇEK defter
// (`@arkesoft/errors`) burada MUTASYONA UĞRATILMAZ (po'nun bağlayıcı şartı,
// T-027.md "`qa` için"). S8 (guards.sh'nin 24. adımı) bu AYNI saf
// fonksiyonu GERÇEK veriyle çağırarak çalışma zamanı drift testini kurar.
//
// Yetim anahtar (katalogda OLUP defterde OLMAYAN) da `missing` kadar
// kırılır — tek yönlü DEĞİL: `missing` defterin istediği ama kataloğun
// VERMEDİĞİ anahtarlar, `orphan` kataloğun taşıdığı ama defterin hiç
// İSTEMEDİĞİ anahtarlardır.

/** `diffCatalogAgainstKeys`'in sonucu — ikisi de BOŞSA katalog defterle tam örtüşür. */
export interface CatalogDiffResult {
  /** Defterde (anahtar listesinde) olup katalogda karşılığı OLMAYAN anahtarlar. */
  readonly missing: readonly string[]
  /** Katalogda olup defterde (anahtar listesinde) HİÇ geçmeyen anahtarlar. */
  readonly orphan: readonly string[]
}

/**
 * `keys` (kapalı anahtar kümesi, ör. `errorMessageKeySchema.options`) ile
 * `catalog`'un (locale → metin eşlemesi) anahtar kümesini karşılaştırır.
 * Girdileri DEĞİŞTİRMEZ (saf) — `keys`'teki tekrarlar tekilleştirilir.
 */
export function diffCatalogAgainstKeys(
  keys: readonly string[],
  catalog: Readonly<Record<string, string>>,
): CatalogDiffResult {
  const uniqueKeys = [...new Set(keys)]
  const catalogKeys = Object.keys(catalog)

  const keySet = new Set(uniqueKeys)
  const catalogKeySet = new Set(catalogKeys)

  const missing = uniqueKeys.filter((key) => !catalogKeySet.has(key))
  const orphan = catalogKeys.filter((key) => !keySet.has(key))

  return { missing, orphan }
}
