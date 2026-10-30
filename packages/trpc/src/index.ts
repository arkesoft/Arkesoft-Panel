// @arkesoft/trpc — tRPC router tipleri, Zod şemaları ve istemci factory’si
// (`.` export alt yolu — ROADMAP v0.0.6, T-007/ST-2, architect "tRPC
// sözleşmesi", ADR-0009 madde 6)
//
// TARAYICI tüketicisi (admin/süper admin paneli) BU dosyadan import eder.
// `AppRouter` TYPE-ONLY re-export edilir (`verbatimModuleSyntax` çalışma
// zamanı import'unu SİLER) — `dist/index.js` bu yüzden `dist/server.js`'i
// (sunucu tarafı resolver/port/handler kodu) ÇEKMEZ (`rg` kanıtı: AC gereği).

export { tenantStatusSchema, tenantSummarySchema } from './schemas/tenant-summary.schema.js'
export type { TenantStatusWire, TenantSummary } from './schemas/tenant-summary.schema.js'

export { sessionIdentitySchema } from './schemas/session-identity.schema.js'
export type { SessionIdentity } from './schemas/session-identity.schema.js'

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
