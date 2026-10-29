// @arkesoft/db — Prisma şeması, migration'lar, seed ve RLS politikaları
//
// Tek dışa açılan yüzey. Prisma'nın resmi istemci paketini veya üretilen
// istemcinin iç subpath'ini (`#prisma`) hiçbir tüketici doğrudan import etmez
// (AC4) — bu dosyanın dışına sızan her şey kasıtlı olarak buradan geçer.
//
// Dışa açılmayan (bilinçli): üretilen `PrismaClient` yapıcısı, `pg.Pool`/
// `@prisma/adapter-pg` örnekleri, Prisma hata sınıfları, `Prisma`
// namespace'inin DEĞER tarafı, `src/generated/**` / `#prisma` iç subpath'i.
//
// GÜNCELLEME (ROADMAP v0.0.5, T-006/S2, MADDE 2 — R-1 KARARI): `AUTH_SECRET_BEARING_MODELS`/
// `AuthModelName`/`AppPrismaDatabase`/`TenantTransactionClient`/`AuthPrismaDatabase`
// ADDITIVE dışa açıldı. `apps/api/eslint.config.mjs`'in `prismaClientSurfaceRestriction`
// kuralı `PrismaDatabase`/`AuthPrismaDatabase`/`AUTH_SECRET_BEARING_MODELS`
// jetonlarının importunu `src/{prisma,auth,__tests__}/**` DIŞINDA yasaklar —
// bu paket o kuralın hedefi değildir, yalnızca jetonların KAYNAĞIDIR.

export { createPrismaClient, AUTH_SECRET_BEARING_MODELS } from './client.js'
export type {
  CreatePrismaClientOptions,
  PrismaDatabase,
  TransactionClient,
  AuthModelName,
  AppPrismaDatabase,
  TenantTransactionClient,
  AuthPrismaDatabase,
} from './client.js'

export { TENANT_CONTEXT_SETTING, withTenant } from './tenant-context.js'

export { checkDatabaseConnection } from './health.js'

export { isUniqueConstraintError } from './errors.js'

export { PLATFORM_LEVEL_TABLES, TENANT_SCOPED_TABLES } from './tenancy.js'

export { DEMO_SEED } from './seed-data.js'

// Model satır tipleri — yalnızca tip, çalışma zamanı karşılığı yok.
export type { Tenant, User, TenantMembership } from '#prisma'

// Çalışma zamanı karşılaştırması + exhaustive switch için değer + tip.
export { TenantStatus, UserStatus, TenantRole } from '#prisma'

// `Prisma.TenantCreateInput` vb. yardımcı tipler için — yalnızca TİP
// namespace'i dışa açılır, namespace'in çalışma zamanı değeri sızmaz.
export type { Prisma } from '#prisma'

/** Paketin workspace içindeki adı. Sürüm bilgisi package.json'dan okunur. */
export const PACKAGE_NAME = '@arkesoft/db'

/** {@link PACKAGE_NAME} değerinin literal tipi. */
export type PackageName = typeof PACKAGE_NAME
