// @arkesoft/api — TrpcErrorFactoryPort adaptörü (ROADMAP v0.0.6, T-007/S5,
// architect "tRPC sözleşmesi" bölümü)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/trpc-error-factory.port.ts`),
// burada UYGULANIR. Hata SINIFI/kodu/HTTP durumu/i18n anahtarı sahipliği
// `apps/api`'de kalır — AC9(a): `packages/trpc` içinde hiçbir hata kodu
// LİTERALİ yok, `requireAuth`/`requireTenant` middleware'leri (`trpc.ts`)
// bu portu çağırıp dönen `AppError`'ı fırlatır.

// GÜNCELLEME (ROADMAP v0.0.14, T-014/S4, architect K-A6): `permissionDenied`
// ADDITIVE eklendi — `permissionProcedure`'ün izin kapısı bunu çağırır.
// Hata SINIFI/kodu/HTTP durumu/i18n anahtarı sahipliği YİNE burada: sözleşme
// paketi iki parametreyi geçirir, 403'ü ve `errors.*` anahtarını SEÇMEZ.

import { Injectable } from '@nestjs/common'
import type { AppError } from '@arkesoft/errors'
import type { Permission, TenantRoleWire } from '@arkesoft/trpc'
import type { TrpcErrorFactoryPort } from '@arkesoft/trpc/server'

import { PermissionDeniedError } from '../errors/domain/permission-denied.error.js'
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

  /**
   * Aktörün rolü istenen izni taşımıyorsa izin kapısı bunu çağırır.
   *
   * ⚠ İki parametre YALNIZCA `AppError.context`'e (loga) girer, TELE GİRMEZ:
   * hata sınıfı `publicDetails`'i OVERRIDE ETMEZ → gövdenin `details` alanı
   * `{}` kalır. Bu, yetki modelinin iç yapısının yanıt gövdesinden
   * öğrenilmesine karşı TEK savunmadır.
   */
  permissionDenied(permission: Permission, role: TenantRoleWire): AppError {
    return new PermissionDeniedError(permission, role)
  }
}
