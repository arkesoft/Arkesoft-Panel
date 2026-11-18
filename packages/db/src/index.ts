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

export { TENANT_CONTEXT_SETTING, withTenant, withNewTenant } from './tenant-context.js'
export type { PlatformTenantWriter } from './tenant-context.js'

export { checkDatabaseConnection } from './health.js'

export { isUniqueConstraintError } from './errors.js'

// FIX turu 1 (security Tur 1 [medium] S-2(b) bulgusu, T-015) — ADDITIVE:
// `apps/api`'nin açılışta BİR KEZ çağırması gereken negatif yetenek probu.
// Bu fonksiyonun NE ZAMAN koşacağı ve başarısızlığın açılışı düşürüp
// düşürmeyeceği `apps/api`'nin DI/yaşam döngüsü kararıdır (bkz. `auth-role-
// guard.ts` dosya başı notu) — `packages/db` yalnızca koşturulabilir yardımcıyı sağlar.
export { assertAuthRoleIsRestricted, AuthRoleNotRestrictedError } from './auth-role-guard.js'

export { PLATFORM_LEVEL_TABLES, TENANT_SCOPED_TABLES } from './tenancy.js'

export { DEMO_SEED } from './seed-data.js'

// Model satır tipleri — yalnızca tip, çalışma zamanı karşılığı yok.
// `Job` (ROADMAP v0.0.11, T-013/S2) ADDITIVE eklendi.
// `PlatformRelease`/`Theme`/`ThemeRelease`/`TenantVersionState`/
// `TenantUpdateHistory` (ROADMAP v0.0.21, T-018/S2) ADDITIVE eklendi —
// `Job`/`AuditLog` emsali: problar (S4) ve seed (S5) barrel'dan ithal eder
// (`job.probe.ts:20` deseni), export'lar şemayla AYNI oturumda yazılmak
// ZORUNDA (po, bağlayıcı — aksi hâlde S4 kurulu desenle çalışamaz).
// `Plan`/`Subscription` (ROADMAP v0.1.0, T-019/S1) ADDITIVE eklendi — AYNI
// desen: export'lar şemayla AYNI oturumda yazılmak ZORUNDA (po, bağlayıcı).
// `PlatformAdmin`/`PlatformAuditLog` (ROADMAP v0.0.20, T-021/S3) ADDITIVE
// eklendi — AYNI desen: export'lar şemayla AYNI oturumda yazılmak ZORUNDA
// (S5/S7 barrel'dan ithal edecek, `job.probe.ts:20` deseni).
export type {
  Tenant,
  User,
  TenantMembership,
  Job,
  PlatformRelease,
  Theme,
  ThemeRelease,
  TenantVersionState,
  TenantUpdateHistory,
  Plan,
  Subscription,
  PlatformAdmin,
  PlatformAuditLog,
} from '#prisma'

// Çalışma zamanı karşılaştırması + exhaustive switch için değer + tip.
// `JobStatus` (ROADMAP v0.0.11, T-013/S2): `apps/api` kuyruk kodu durum
// geçişlerini bu enum DEĞERİ üzerinden yazar (literal dize YAZMAZ) ve
// `packages/trpc` tel sözleşmesi kendi yerel birleşimini bu dörtlüye karşı
// pinler — bkz. ADR-0009 md 5 (`@arkesoft/db`'den import ETMEME emsali).
//
// `ReleaseChannel`/`ThemeStatus`/`ThemeReleaseStatus`/`UpdateTrigger`/
// `UpdateStatus` (ROADMAP v0.0.21, T-018/S2) ADDITIVE eklendi — `JobStatus`
// emsali. Bu beş enum'un HİÇBİRİ bu sürümde tele ÇIKMAZ (po'nun dosya
// listesinde `apps/*`/`packages/trpc` YOK) — tele-enum parite pini BU
// sürümde GEREKMEZ (A-T18-6).
//
// `SiteType`/`SubscriptionStatus` (ROADMAP v0.1.0, T-019/S1) ADDITIVE
// eklendi. `SiteType` v0.1.0'da tele ÇIKAR (kayıt sihirbazı girdisi, S3/S9'un
// işi) — bu, yukarıdaki beş enum'un "bu sürümde tele hiç çıkmaz" muafiyetinin
// TERSİDİR. `SubscriptionStatus` BU sürümde tele ÇIKMAZ (tek değer, `active`).
//
// `PlatformAuditAction` (ROADMAP v0.0.20, T-021/S3) ADDITIVE eklendi — BU
// enum tele ÇIKAR (`architect` tRPC tasarımı: `PlatformAuditActionWire`
// parite pini GEREKİR), `SiteType` emsali.
export {
  TenantStatus,
  UserStatus,
  TenantRole,
  JobStatus,
  ReleaseChannel,
  ThemeStatus,
  ThemeReleaseStatus,
  UpdateTrigger,
  UpdateStatus,
  SiteType,
  SubscriptionStatus,
  PlatformAuditAction,
} from '#prisma'

// `Prisma.TenantCreateInput` vb. yardımcı tipler için — yalnızca TİP
// namespace'i dışa açılır, namespace'in çalışma zamanı değeri sızmaz.
export type { Prisma } from '#prisma'

/** Paketin workspace içindeki adı. Sürüm bilgisi package.json'dan okunur. */
export const PACKAGE_NAME = '@arkesoft/db'

/** {@link PACKAGE_NAME} değerinin literal tipi. */
export type PackageName = typeof PACKAGE_NAME
