// @arkesoft/trpc — sunucu tarafı export yüzeyi (`./server` alt yolu)
// (ROADMAP v0.0.6, T-007/ST-2, architect "tRPC sözleşmesi", ADR-0009 madde 6)
//
// Bu dosya SUNUCU tarafı modül grafiğini taşır (`appRouter`, context/port
// tipleri, procedure oluşturucuları). Tarayıcı tüketicisi (admin/süper admin
// paneli, v0.0.7/v0.0.8) `@arkesoft/trpc` (`.`) alt yolundan import eder —
// ORADAN BU DOSYAYA giden hiçbir RUNTIME import YOKTUR; `AppRouter` kökten
// TYPE-ONLY re-export edilir (`verbatimModuleSyntax` çalışma zamanı import'unu
// SİLER). `dist/index.js`'in `dist/server.js`'i ÇEKMEDİĞİ `rg` ile doğrulanır.

export { appRouter } from './routers/app.router.js'

export { createTrpcRequestHandler } from './handler/create-trpc-request-handler.js'
export type {
  TrpcHandlerOptions,
  TrpcRequestHandler,
} from './handler/create-trpc-request-handler.js'

export type {
  TrpcAuthState,
  TrpcContext,
  TrpcLoggerPort,
  TrpcPorts,
  TrpcTenantState,
} from './context/trpc-context.types.js'

export type { JobReadPort } from './ports/job-read.port.js'
export type { MemberWritePort } from './ports/member-write.port.js'
export type { MembershipReadPort } from './ports/membership-read.port.js'
// ROADMAP v0.0.15, T-016 FIX turu 2/M-4 — ⚠ bu satır alt görevin ORİJİNAL
// dosya sahipliği glob'unda ADLANDIRILMAMIŞ bir dosyaya (`server.ts` kök
// seviyede, `{schemas,ports,routers,context}/**`'in DIŞINDA) dokunuyor;
// zincirin DERLENEBİLMESİ için ZORUNLU (`apps/api`'nin adaptörü
// `@arkesoft/trpc/server`'dan `SessionSecurityReadPort` tipini İTHAL ETMEK
// ZORUNDA — her diğer port burada AYNI yoldan export edilir, bkz.
// `TenantReadPort`/`TenantSecurityWritePort` satırları). Tek satır, mevcut
// desenin BİREBİR tekrarı — yeni bir ihracat yüzeyi İCAT EDİLMEDİ. Raporun
// KARARLAR bölümünde AÇIKÇA işaretlendi.
export type { SessionSecurityReadPort } from './ports/session-security-read.port.js'
// ROADMAP v0.0.15.1, T-017/S4 — her port AYNI yoldan export edilir (yukarıdaki
// `SessionSecurityReadPort` satırının BİREBİR tekrarı). `apps/api`'nin
// adaptörü (S9) bu tipi `@arkesoft/trpc/server`'dan ithal edecek.
export type { SessionListReadPort } from './ports/session-list-read.port.js'
export type { TenantReadPort } from './ports/tenant-read.port.js'
export type { TenantSecurityWritePort } from './ports/tenant-security-write.port.js'
export type { StorefrontTenantReadPort } from './ports/storefront-tenant-read.port.js'
export type { TrpcErrorFactoryPort } from './ports/trpc-error-factory.port.js'

export {
  protectedProcedure,
  publicProcedure,
  publicTenantProcedure,
  router,
  tenantProcedure,
} from './trpc.js'

// Merdivenin BEŞİNCİ basamağı (ROADMAP v0.0.14, T-014/S2) — SUNUCU tarafı
// yüzeyinde, `./trpc.js`'in dördünün yanında. ⚠ Bu satır `index.ts`'e
// TAŞINAMAZ: `permissionProcedure` zinciri `./trpc.js`'i (sunucu tarafı modül
// grafiği) çeker ve tarayıcı girişinin yazılı sözleşmesini kırardı.
export { permissionProcedure } from './authz/permission-procedure.js'
export type { PermissionGatedProcedureBuilder } from './authz/permission-procedure.js'
