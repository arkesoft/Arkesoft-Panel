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
- `src/index.ts` — tek giriş noktası; tüketiciler iç dosya yoluna girmez.
