// @arkesoft/storefront — applyStorefrontCachePolicy (ROADMAP v0.0.8,
// T-009/S6, architect K19)
//
// v0.0.7'nin 0/5 DERSİ (UYARI 3, bağlayıcı): önbellek başlıkları yalnızca
// BAŞARILI yanıtlara yazılırsa, guard reddi yanıtları (404/503 dahil) payı
// 0/5 alır — `security` bunu bulgu olarak yazmıştı. Düzeltme: bu fonksiyon
// `src/middleware.ts`'te, `await next()`'ten SONRA, KOŞULSUZ, HER dönüş
// yolunda (başarı, 404, 503 dahil) çağrılır.
//
// İSTİSNA LİSTESİ YOK. `Vary` YAZILMAZ: `no-store` depolamayı TAMAMEN
// yasaklar; `Vary` bir depolama kararı ima eder ve bu bağlamda YANILTICI
// olurdu. `/_astro/*` İSTİSNASI AÇILMAZ — gerekçe: v0.0.10+ kiracı başına
// tema CSS'i getirecek → istisna o anda ÇAPRAZ KİRACI SIZINTISINA dönüşür.
//
// ⚠ ZORUNLU GÖZDEN GEÇİRME ŞARTI: bu politika (a) CDN/edge geldiğinde
// (v0.18.0/v0.20.0) ve (b) HTML'e ilk kişiselleştirilmiş öğe (sepet, oturum,
// müşteri grubu fiyatı) girdiğinde (v0.1.x) YENİDEN DEĞERLENDİRİLMEK
// ZORUNDADIR. İlk `public` politika ile `Vary` tasarımı AYNI değişiklikte
// verilir, sonradan ASLA.

/** Repoda `no-store` literalinin TEK yazıldığı yer (AC17, mekanik pin). */
export const STOREFRONT_CACHE_CONTROL = 'private, no-store'

/**
 * Verilen `Headers` nesnesine KOŞULSUZ `cache-control` başlığını yazar.
 * Çağıran, hangi yanıt sınıfında olduğuna (200/404/503/robots/sitemap)
 * BAKMADAN her dönüş yolunda bunu çağırmak ZORUNDADIR — bu fonksiyonun
 * kendisi hiçbir dallanma İÇERMEZ (istisna listesi yok, CLAUDE.md §4'ün
 * "boolean bayrak yığını kurma" ilkesiyle tutarlı: tek koşulsuz atama).
 */
export function applyStorefrontCachePolicy(headers: Headers): void {
  headers.set('cache-control', STOREFRONT_CACHE_CONTROL)
}
