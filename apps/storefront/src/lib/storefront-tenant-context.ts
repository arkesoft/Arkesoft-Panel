// @arkesoft/storefront — StorefrontTenantContext: `src/middleware.ts`'in
// (K21) tek yetki noktasından `Astro.locals.tenant`'a yazdığı ayrık birleşim
// (ROADMAP v0.0.8, T-009/S6, architect K16)
//
// Boolean bayrak yığını YOK (CLAUDE.md §4) — iki dal, tek etiket (`kind`).
//
// ⚠ `unresolved` dalı SEBEP KODU TAŞIMAZ (bilinçli, bağlayıcı): sebep hiçbir
// yerde tüketilmiyor; taşımak onu kazara tele/HTML'e yazma riski üretir
// (AC8 — 8 host çözümleme sebebinin HEPSİ tek jenerik 404'e düşer).
// `resolveHost`'un `reason` değeri `src/middleware.ts`'ten DIŞARI ÇIKMAZ.
//
// `resolved.origin` BAĞLAMA DAHİL — `src/lib/request-origin.ts`'in (K20) TEK
// türetme noktasının çıktısı; sayfalar/uçlar bunu YENİDEN HESAPLAMAZ.
//
// v0.0.10 NOTU (R9, T-012/S8): `themeId`/`themeVersion` `StorefrontTenant`'a
// BURAYA EKLENDİ — başka hiçbir dosya değişmedi. Tel sözleşmesinin çıplak
// `themeId`/`themeVersion` çifti (`@arkesoft/trpc` `storefrontTenantSchema`)
// burada TAŞINMAZ — middleware (`src/middleware.ts`, İŞ 2/İŞ 3) o çifti
// `src/themes/registry.ts`'in `resolveTheme()`'i ile ZATEN ÇÖZÜMLENMİŞ bir
// `ThemeRegistryKey` + önceden hesaplanmış `styleText`'e indirger; sayfalar
// (`index.astro`) ham `themeId`/`themeVersion` değerini HİÇ GÖRMEZ — yalnızca
// render edilmeye HAZIR bu iki alanı görür (K1'in "DEĞER kiracıya bağlıdır
// → yalnızca middleware'in ulaştığı yanıtta, `private, no-store`. KURAL
// kiracıdan bağımsızdır → derleme çıktısında donar; hangi kanalda
// taşındığı önbellek politikasını ETKİLEMEZ" taşıyıcısı tam burada
// başlar).
import type { ThemeRegistryKey } from '../themes/registry.js'

/**
 * Bir kiracı bağlamının render edilmeye hazır tema bilgisi — middleware'in
 * (ADR-0002 Karar 2) `ThemeResolutionError`'ı ZATEN 503'e eşleyip ele aldığı
 * için bu tip hiçbir hata/`null` dalı TAŞIMAZ: bir sayfa bu alanı gördüğünde
 * çözüm KESİNLEŞMİŞTİR.
 */
export interface StorefrontTenantTheme {
  /** `src/themes/ThemeTemplate.astro`'nun dispatch ettiği, ZATEN doğrulanmış kayıt defteri anahtarı — ikinci bir string birleştirme burada YAPILMAZ. */
  readonly key: ThemeRegistryKey
  /** `src/themes/registry.ts`'in SÜREÇ BAŞINA BİR KEZ hesapladığı CSS metni (K5) — burada YENİDEN HESAPLANMAZ, middleware'den TAŞINIR. */
  readonly styleText: string
}

export interface StorefrontTenant {
  readonly name: string
  readonly theme: StorefrontTenantTheme
}

export type StorefrontTenantContext =
  | { readonly kind: 'resolved'; readonly tenant: StorefrontTenant; readonly origin: string }
  | { readonly kind: 'unresolved' }

/**
 * `kind: 'resolved'` dalını döndürür. `src/middleware.ts`'in K21 adım 3
 * garantisi gereği (`unresolved` durumu middleware'de 404'e çevrilir, ASLA
 * `next()` çağrılmaz) bu fonksiyonu çağıran bir sayfa/endpoint her zaman
 * `resolved` bir bağlam görür — `unresolved` dalı yapısal olarak
 * ULAŞILAMAZ, ama tip düzeyinde üye olduğu için AÇIKÇA ele alınır (exhaustive
 * switch, CLAUDE.md §4). Ulaşılırsa (bir çağıran hatası) SESSİZCE
 * YUTULMAZ — fırlatılır; sayfa/endpoint kendi 404/503'ünü ÜRETMEZ
 * (mekanizma yalnızca `src/middleware.ts`'te, AC15).
 */
export function requireResolvedTenant(
  context: StorefrontTenantContext,
): Extract<StorefrontTenantContext, { readonly kind: 'resolved' }> {
  switch (context.kind) {
    case 'resolved':
      return context
    case 'unresolved':
      throw new Error(
        'storefront: unresolved tenant bağlamıyla bir sayfa/endpoint render edilmeye çalışıldı (middleware.ts K21 adım 3 garantisi ihlal edildi).',
      )
  }
}
