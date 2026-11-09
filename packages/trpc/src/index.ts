// @arkesoft/trpc — tRPC router tipleri, Zod şemaları ve istemci factory’si
// (`.` export alt yolu — ROADMAP v0.0.6, T-007/ST-2, architect "tRPC
// sözleşmesi", ADR-0009 madde 6)
//
// TARAYICI tüketicisi (admin/süper admin paneli) BU dosyadan import eder.
// `AppRouter` TYPE-ONLY re-export edilir (`verbatimModuleSyntax` çalışma
// zamanı import'unu SİLER) — `dist/index.js` bu yüzden `dist/server.js`'i
// (sunucu tarafı resolver/port/handler kodu) ÇEKMEZ (`rg` kanıtı: AC gereği).
//
// ⚠⚠ O `rg` KANITININ DOĞRU BİÇİMİ (ROADMAP v0.0.14, T-014/S2'nin ölçtüğü
// tuzak, AGENT_BASELINE.md §5'in markdown kardeşi): yukarıdaki satırlar
// yasaklanan dosya adını METİN olarak içeriyor ve derleyici yorumları
// `dist/index.js`'e AYNEN kopyalıyor → çıplak bir ad araması KALICI YANLIŞ
// POZİTİF verir. Kapı bu yüzden yalnızca IMPORT/EXPORT İFADELERİNİ taramak
// zorundadır (`^(import|export) ... from` deseni) — "dosyada bu ad geçiyor
// mu" DEĞİL, "bu dosya oradan bir şey ÇEKİYOR mu" sorusu sorulur.
//
// ⚠ BU DOSYADAN EXPORT EDİLMEYENLER ve GEREKÇELERİ (ROADMAP v0.0.14, po
// R-PO7): `permissionProcedure` (zinciri sunucu tarafı builder modülünü
// çeker) · izin KULLANIM KAYDI (modül değerlendirme yan etkisi taşır, iç
// denetim aracıdır) · prosedür yüzeyinin KAPALI DÜNYA BEYAN TABLOSU (`authz/`
// içindeki sabit — bir iç denetim aracıdır, public API yüzeyi değil; adının
// bu dosyadan export edilmediğini denetleyen grep yanlış pozitif vermesin
// diye jeton burada BİLEREK yazılmadı, AGENT_BASELINE.md §5). İzin KATALOĞU
// ise burada YERİNDEDİR: saf veridir, I/O taşımaz ve public API yüzeyinin
// parçasıdır.

export { tenantStatusSchema, tenantSummarySchema } from './schemas/tenant-summary.schema.js'
export type { TenantStatusWire, TenantSummary } from './schemas/tenant-summary.schema.js'

export {
  tenantSecurityPolicySchema,
  tenantSecurityPolicyUpdateInputSchema,
} from './schemas/tenant-security.schema.js'
export type {
  TenantSecurityPolicy,
  TenantSecurityPolicyUpdateInput,
} from './schemas/tenant-security.schema.js'

export { storefrontTenantSchema } from './schemas/storefront-tenant.schema.js'
export type { StorefrontTenant } from './schemas/storefront-tenant.schema.js'

export {
  JOB_LIST_DEFAULT_LIMIT,
  JOB_LIST_MAX_LIMIT,
  jobErrorSummarySchema,
  jobGetInputSchema,
  jobListInputSchema,
  jobListPageSchema,
  jobStatusSchema,
  jobSummarySchema,
} from './schemas/job-summary.schema.js'
export type {
  JobErrorSummary,
  JobGetInput,
  JobListPage,
  JobListQuery,
  JobStatusWire,
  JobSummary,
} from './schemas/job-summary.schema.js'

export { sessionIdentitySchema } from './schemas/session-identity.schema.js'
export type { SessionIdentity } from './schemas/session-identity.schema.js'

export {
  invitableRoleSchema,
  memberAcceptInvitationInputSchema,
  memberInvitationAcceptedSchema,
  memberInvitationSchema,
  memberInviteInputSchema,
  memberRemoveInputSchema,
  memberRemovedSchema,
  memberRoleSchema,
  memberUpdateRoleInputSchema,
  tenantRoleSchema,
} from './schemas/member.schema.js'
export type {
  InvitableRoleWire,
  MemberAcceptInvitationInput,
  MemberInvitation,
  MemberInvitationAccepted,
  MemberInviteInput,
  MemberRemoveInput,
  MemberRemoved,
  MemberRole,
  MemberUpdateRoleInput,
  TenantRoleWire,
} from './schemas/member.schema.js'

export { PERMISSIONS, ROLE_PERMISSIONS } from './authz/permissions.js'
export type { Permission } from './authz/permissions.js'

export { trpcErrorDataSchema } from './schemas/trpc-error-data.schema.js'
export type { TrpcErrorData } from './schemas/trpc-error-data.schema.js'

// `AppRouter` TYPE-ONLY — bu satır hiçbir çalışma zamanı import'u ÜRETMEZ.
export type { AppRouter } from './routers/app.router.js'

export { createTrpcClient } from './client/create-trpc-client.js'
export type { TrpcClient, TrpcClientOptions } from './client/create-trpc-client.js'

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import type { AppRouter } from './routers/app.router.js'

/** `AppRouter`'ın TÜM prosedürlerinin girdi tipleri (tip-düzeyi, çalışma zamanı karşılığı yok). */
export type RouterInputs = inferRouterInputs<AppRouter>

/** `AppRouter`'ın TÜM prosedürlerinin çıktı tipleri (tip-düzeyi, çalışma zamanı karşılığı yok). */
export type RouterOutputs = inferRouterOutputs<AppRouter>

/** Paketin workspace içindeki adı. Sürüm bilgisi package.json'dan okunur. */
export const PACKAGE_NAME = '@arkesoft/trpc'

/** {@link PACKAGE_NAME} değerinin literal tipi. */
export type PackageName = typeof PACKAGE_NAME
