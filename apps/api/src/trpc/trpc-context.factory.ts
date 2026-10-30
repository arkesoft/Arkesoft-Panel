// @arkesoft/api — tRPC context fabrikası (ROADMAP v0.0.6, T-007/S5, architect
// "Modül yerleşimi" bölümü, V2 DOĞRULANDI)
//
// `getRequestContext()`'i (`request-context/request-context.accessors.ts`)
// YALNIZCA OKUR — tenant bağlamı `TenantContextMiddleware`'den, auth bağlamı
// `AuthContextMiddleware`/`AuthGuard`'tan YENİDEN YAZILMADAN alınır (V2).
//
// Context EAGER kurulur — bu fonksiyon `createTrpcRequestHandler`'a hazır bir
// `TrpcContext` nesnesi olarak VERİLİR, tRPC'nin kendi `createContext`'i
// hesaplama YAPMAZ (`handler/create-trpc-request-handler.ts`, S3). Bu yüzden
// `requestId` HER ZAMAN doludur.
//
// İki EXHAUSTIVE switch + MEVCUT `assertNever` (`errors/assert-never.ts`) —
// DÖRDÜNCÜ bir kopya YAZILMAZ:
//   - `auth`: `authenticated` → map; `exempt`/`unauthenticated` → `anonymous`;
//     `pending`/`failed` → FIRLAT (guard zinciri — `AuthGuard` — bu ikisini
//     ZATEN tüketti; buraya ulaşmak REGRESYONDUR, "default allow" dalı YOK).
//   - `tenant`: `resolved` → map; `exempt`/`unresolved`/`failed` → `absent`;
//     `pending` → FIRLAT (aynı gerekçe, `TenantGuard` tüketti).
//
// Her iki fırlatma da MEVCUT `RequestContextUnavailableError`'ı kullanır —
// `getTenantContext()`'in (`request-context.accessors.ts`) "tenant 'resolved'
// DEĞİLKEN çağrıldı" durumuyla AYNI PROGRAMLAMA HATASI sınıfı; dördüncü bir
// hata sınıfı İCAT EDİLMEZ.
//
// `logger`: ince adaptör (`trpc-logger.adapter.ts`) — ham pino `Logger`
// context'e GEÇİRİLMEZ (architect riski 11). ALS `logger` ALANINA YAZILMAZ,
// yalnızca OKUNUP sarılır ("en fazla üç yazıcı" sözleşmesi korunur).

import type { TrpcAuthState, TrpcContext, TrpcPorts, TrpcTenantState } from '@arkesoft/trpc/server'
import type { TrpcErrorFactoryPort } from '@arkesoft/trpc/server'

import type { AuthResolution } from '../auth/auth-resolution.types.js'
import { assertNever } from '../errors/assert-never.js'
import { RequestContextUnavailableError } from '../errors/domain/request-context-unavailable.error.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'
import type { TenantResolution } from '../request-context/request-context.types.js'
import { createTrpcLoggerAdapter } from './trpc-logger.adapter.js'

/** `RequestContext.auth`'u (ALS, OKUNUR) {@link TrpcAuthState}'e eşler. */
function toTrpcAuthState(resolution: AuthResolution): TrpcAuthState {
  switch (resolution.kind) {
    case 'authenticated':
      return {
        kind: 'authenticated',
        userId: resolution.userId,
        sessionId: resolution.sessionId,
      }
    case 'exempt':
    case 'unauthenticated':
      return { kind: 'anonymous' }
    case 'pending':
    case 'failed':
      // `AuthGuard` bu iki durumu ZATEN tüketti (500/`AuthProviderFailedError`
      // olarak) — bu fonksiyona bu `kind`'le ulaşmak bir REGRESYONDUR.
      throw new RequestContextUnavailableError({ authResolutionKind: resolution.kind })
    default:
      return assertNever(resolution, 'trpc-context.factory.ts: AuthResolution.kind')
  }
}

/** `RequestContext.tenant`'ı (ALS, OKUNUR) {@link TrpcTenantState}'e eşler. */
function toTrpcTenantState(resolution: TenantResolution): TrpcTenantState {
  switch (resolution.kind) {
    case 'resolved':
      return {
        kind: 'resolved',
        tenantId: resolution.tenant.id,
        slug: resolution.tenant.slug,
        status: resolution.tenant.status,
      }
    case 'exempt':
    case 'unresolved':
    case 'failed':
      return { kind: 'absent' }
    case 'pending':
      // `TenantGuard` bu durumu ZATEN tüketti (500) — bu fonksiyona bu
      // `kind`'le ulaşmak bir REGRESYONDUR.
      throw new RequestContextUnavailableError({ tenantResolutionKind: resolution.kind })
    default:
      return assertNever(resolution, 'trpc-context.factory.ts: TenantResolution.kind')
  }
}

/**
 * EAGER kurulmuş {@link TrpcContext}'i üretir — `apps/api/src/trpc/
 * trpc.controller.ts` bunu her istekte bir kez çağırıp `createTrpcRequestHandler`'a
 * geçer. `ports`/`errors` çağıran tarafından (DI üzerinden enjekte edilen
 * adaptörler) sağlanır; bu fabrika onları ÜRETMEZ, yalnızca TAŞIR.
 */
export function createTrpcContext(ports: TrpcPorts, errors: TrpcErrorFactoryPort): TrpcContext {
  const requestContext = getRequestContext()

  return {
    requestId: requestContext.requestId,
    logger: createTrpcLoggerAdapter(requestContext.logger),
    auth: toTrpcAuthState(requestContext.auth),
    tenant: toTrpcTenantState(requestContext.tenant),
    ports,
    errors,
  }
}
