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

export type { TenantReadPort } from './ports/tenant-read.port.js'
export type { TrpcErrorFactoryPort } from './ports/trpc-error-factory.port.js'

export { protectedProcedure, publicProcedure, router, tenantProcedure } from './trpc.js'
