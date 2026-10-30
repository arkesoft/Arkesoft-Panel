// @arkesoft/trpc — sunucu tarafı context sözleşmesi (ROADMAP v0.0.6, T-007/ST-2,
// architect K1/K5, ADR-0009)
//
// `apps/api`'nin context fabrikası (`apps/api/src/trpc/trpc-context.factory.ts`,
// S5) `getRequestContext()`'i
// YALNIZCA OKUYARAK bu şekli doldurur — context EAGER kurulur (`createContext`
// fırlamaz), `requestId` her zaman dolu. `errorFormatter`'ın `ctx` parametresi
// buna rağmen tipçe `TrpcContext | undefined`dir (@trpc/server'ın kendi
// imzası, S1'in ölçtüğü dört bilgiden #3); bu dosyanın EAGER garantisi o
// optionality'yi TİP DÜZEYİNDE ortadan kaldırmaz.

import type { TenantStatusWire } from '../schemas/tenant-summary.schema.js'
import type { TenantReadPort } from '../ports/tenant-read.port.js'
import type { TrpcErrorFactoryPort } from '../ports/trpc-error-factory.port.js'

/**
 * Discriminated union — kimlik doğrulama durumu. `requireAuth` middleware'i
 * (trpc.ts) bu alanı daraltarak `protectedProcedure`/`tenantProcedure`
 * resolver'larına `kind: 'authenticated'` garantisini context override
 * mekanizmasıyla taşır.
 */
export type TrpcAuthState =
  | { readonly kind: 'authenticated'; readonly userId: string; readonly sessionId: string }
  | { readonly kind: 'anonymous' }

/**
 * Discriminated union — kiracı bağlamı durumu. `requireTenant` middleware'i
 * bu alanı daraltır. `status` {@link TenantStatusWire} — `@arkesoft/db`'den
 * İMPORT EDİLMEZ (ADR-0009 madde 5, `tenant-summary.schema.ts`'teki gerekçe).
 */
export type TrpcTenantState =
  | {
      readonly kind: 'resolved'
      readonly tenantId: string
      readonly slug: string
      readonly status: TenantStatusWire
    }
  | { readonly kind: 'absent' }

/**
 * Enjekte edilen logger portu — pino'ya (veya herhangi bir somut kütüphaneye)
 * BAĞIMLI DEĞİL (architect riski 11: aşırı yüklenmiş pino imzalarının
 * atanabilirliğine güvenilmiyor). `apps/api` ince bir adaptör geçirir
 * (`apps/api/src/trpc/trpc-logger.adapter.ts`, S5). CLAUDE.md §4 log formatı
 * (yapılandırılmış JSON, `tenantId` dolu) bu portun ARKASINDA, `apps/api`'de
 * uygulanır.
 */
export interface TrpcLoggerPort {
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

/**
 * Context'ten enjekte edilen tüm port arayüzlerinin toplu sözleşmesi
 * (ADR-0009 madde 2). Resolver'lar `ctx.ports.*` üzerinden tek bir çağrı
 * yapar; portlar `apps/api`'de uygulanır.
 */
export interface TrpcPorts {
  readonly tenantRead: TenantReadPort
}

/**
 * `initTRPC.context<TrpcContext>()`'in sabitlediği tek context şekli
 * (architect "tRPC sözleşmesi" bölümü). Beş alan:
 *   - `requestId`  — EAGER kurulum garantisiyle her zaman dolu (string).
 *   - `logger`     — {@link TrpcLoggerPort}, somut kütüphaneye bağımlı değil.
 *   - `auth`       — {@link TrpcAuthState}, `AuthGuard`'ın ürettiği bağlamın
 *                    OKUNMASI (yeniden yazılmaz, V2 DOĞRULANDI).
 *   - `tenant`     — {@link TrpcTenantState}, `TenantGuard`'ın ürettiği
 *                    bağlamın OKUNMASI (V2 DOĞRULANDI).
 *   - `ports`      — {@link TrpcPorts}, iş mantığına erişimin TEK yolu.
 *   - `errors`     — {@link TrpcErrorFactoryPort}, hata kodu/i18n anahtarı
 *                    sahipliği `apps/api`'de kalır; trpc'de hiçbir hata kodu
 *                    LİTERALİ yok (AC9(a)).
 */
export interface TrpcContext {
  readonly requestId: string
  readonly logger: TrpcLoggerPort
  readonly auth: TrpcAuthState
  readonly tenant: TrpcTenantState
  readonly ports: TrpcPorts
  readonly errors: TrpcErrorFactoryPort
}
