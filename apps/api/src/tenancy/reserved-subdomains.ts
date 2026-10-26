// @arkesoft/api — rezerve alt alan adları (ROADMAP v0.0.4, T-002/ST-5, architect K-A4)
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
// v0.0.8 storefront'un olduğu gibi devralabileceği dosya çifti).

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
