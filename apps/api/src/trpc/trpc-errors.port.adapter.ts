// @arkesoft/api — TrpcErrorFactoryPort adaptörü (ROADMAP v0.0.6, T-007/S5,
// architect "tRPC sözleşmesi" bölümü)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/trpc-error-factory.port.ts`),
// burada UYGULANIR. Hata SINIFI/kodu/HTTP durumu/i18n anahtarı sahipliği
// `apps/api`'de kalır — AC9(a): `packages/trpc` içinde hiçbir hata kodu
// LİTERALİ yok, `requireAuth`/`requireTenant` middleware'leri (`trpc.ts`)
// bu portu çağırıp dönen `AppError`'ı fırlatır.

import { Injectable } from '@nestjs/common'
import type { AppError } from '@arkesoft/errors'
import type { TrpcErrorFactoryPort } from '@arkesoft/trpc/server'

import { TenantContextRequiredError } from '../errors/domain/tenant-context-required.error.js'
import { UnauthenticatedError } from '../errors/domain/unauthenticated.error.js'

@Injectable()
export class TrpcErrorsPortAdapter implements TrpcErrorFactoryPort {
  /** `TrpcAuthState.kind !== 'authenticated'` durumunda `requireAuth` bunu çağırır. */
  unauthenticated(): AppError {
    return new UnauthenticatedError()
  }

  /** `TrpcTenantState.kind !== 'resolved'` durumunda `requireTenant` bunu çağırır. */
  tenantContextRequired(): AppError {
    return new TenantContextRequiredError()
  }
}
