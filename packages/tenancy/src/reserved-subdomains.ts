// @arkesoft/tenancy — rezerve alt alan adları (ROADMAP v0.0.4, T-002/ST-5, architect K-A4)
//
// TERFİ NOTU (ROADMAP v0.0.8, T-009/S1, architect K9, bağlayıcı): bu dosya
// `apps/api/src/tenancy/reserved-subdomains.ts`'ten BİREBİR TAŞINDI (kopya
// DEĞİL) — gövde değişmedi. Gerekçe: v0.0.8'in storefront'u bu listeyi
// `resolve-host.ts` ile birlikte AYNEN devralmak zorunda; `apps/* → apps/*`
// ithali (CLAUDE.md §3) yasak olduğu için iki uygulamanın da ortak
// bağımlılığı bu paket (`@arkesoft/tenancy`) oldu.
//
// Bu 12 kalem `resolve-host.ts`'in SAF alt alan adı eşlemesinde kullanılır:
// bir tenant'ın `www`/`api`/`admin` gibi bir slug SEÇİP platformun kendi
// yüzeyini (API, admin panel, CDN, superadmin vb.) KAÇIRMASI engellenir —
// aksi hâlde `api.arkesoft.app` gibi bir alt alan adı hem platformun API
// yüzeyi hem de (yanlışlıkla) bir tenant'ın mağazası olabilirdi.
//
// v0.1.0 NOTU (bağlayıcı): tenant OLUŞTURMA akışı (`tenant.provision`) bu
// listeyi REDDETMEK ZORUNDADIR — bir kullanıcı slug olarak bu değerlerden
// birini seçemez. Bu dosya bugün yalnızca ÇÖZÜMLEME tarafında tüketiliyor.
//
// SAF SABİT — Nest/express/Prisma importu yok (`resolve-host.ts` ile birlikte
// bu paketin iki saf dosyasından biri; `packages/tenancy/src/__tests__/
// purity.test.ts` bunu pinler).

/** Platformun kendi yüzeyiyle çakışabilecek, tenant slug'ı olarak YASAK 12 alt alan adı. */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'www',
  'api',
  'admin',
  'app',
  'panel',
  'cdn',
  'static',
  'assets',
  'mail',
  'superadmin',
  'status',
  'docs',
])
