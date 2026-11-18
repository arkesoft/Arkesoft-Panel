# @arkesoft/tenancy

Host başlığından tenant **seçicisinin** (slug/özel alan adı) **saf** çözümleme
kuralları. `ROADMAP.md` v0.0.8, T-009/S1'de `apps/api`'den terfi etti —
kopyalanmadı, taşındı: `apps/* → apps/*` ithali (CLAUDE.md §3) yasak olduğu
için `apps/api` ve `apps/storefront`'un ortak bağımlılığı bu paket oldu.

## Sorumluluk sınırı

| Yapar                                                                                                                                                                                               | Yapmaz                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host→kiracı **seçici** çözümlemesinin **saf** kuralları: hostname normalizasyonu (`normalizeHostname`), taban alan adı eşlemesi, slug biçimi doğrulaması, rezerve etiketler (`RESERVED_SUBDOMAINS`) | I/O · veritabanı erişimi · HTTP/çatı bağımlılığı (`@nestjs/*`, `express`) · **`TenantContext` ÜRETİMİ** (tek üretici `apps/api`'nin `TenantResolverService`'i) · yetkilendirme · kiracı verisine erişim |

Bu paket bir `TenantContext` değeri **üretmez** — yalnızca bir host adının
`subdomain` / `custom-domain` / `unresolved` dallarından hangisine düştüğünü
söyler. O sonucu bir Prisma sorgusuna çevirip gerçek bir tenant kaydına
bağlamak `apps/api`'deki `TenantResolverService`'in (tek üretici,
`src/tenancy/tenant-resolver.service.ts`) işidir.

## Neden bağımlılıksız

`dependencies` alanı **bilerek boş** — bu paket hiçbir şeyi parse etmiyor,
yalnızca dize işliyor (`new URL(...)`, `Set.has(...)`, regex). `zod` bile
gereksiz (`packages/errors`'ın tek bağımlılığı `zod`'dur; bu paket ondan daha
katı). `packages/tenancy/src/__tests__/purity.test.ts` bu iddiayı pinler:
`@nestjs`, `express`, `@arkesoft/db`, `@prisma` dizgilerinin hiçbiri `src/`
kod satırlarında geçemez.

## Dosyalar

- `src/resolve-host.ts` — `resolveHost` + `normalizeHostname`. Algoritmanın
  satır satır gerekçesi dosya başı yorumunda.
- `src/reserved-subdomains.ts` — `RESERVED_SUBDOMAINS` (12 kalem).
- `src/slug.ts` — **tenant slug grameri, tek kaynak** (ROADMAP v0.1.0, T-019).
  `TENANT_SLUG_PATTERN` buraya `resolve-host.ts`'ten **taşındı** (kopyalanmadı);
  `resolve-host.ts` artık bu dosyadan import eder — iki regex literali aynı
  anda var olamaz. Üç dışa açılan değer:
  - `normalizeTenantSlug()` — sihirbazın mağaza adından slug **önermesi**
    içindir, asla fırlatmaz, her girdi için bir dize döner.
  - `validateTenantSlug()` — sunucunun kullanıcının **gönderdiği** slug'ı
    doğrulaması içindir; sessizce normalize **etmez**, kanonik değilse
    reddeder (normalizasyon ≠ doğrulama, bağlayıcı ayrım).
  - `TENANT_SLUG_PATTERN` — RFC 1123 alt alan adı etiketiyle uyumlu regex.

  ⚠ **Bu dosya kabul oracle'ı DEĞİLDİR.** `validateTenantSlug()`'ın `valid`
  dönmesi, slug'ın host çözümlemesinde çözülebileceğinin garantisi değildir
  (`MAX_HOST_HEADER_LENGTH` host'un tamamına uygulanır, slug'a değil). Asıl
  kabul oracle'ı `resolveHost()`'un kendisidir; kayıt akışını tüketen taraf
  (`apps/api`) son doğrulama adımında `resolveHost(`${slug}.${baseDomain}`)`
  ile ikinci bir kontrol yapmak zorundadır.

- `src/index.ts` — tek giriş noktası; tüketiciler iç dosya yoluna girmez.
  v0.1.0'da üç → altı dışa açılan değer (yukarıdaki üçü eklendi).
