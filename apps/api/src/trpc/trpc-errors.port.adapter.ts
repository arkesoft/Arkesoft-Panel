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

// GÜNCELLEME (ROADMAP v0.0.20, T-021/S7, ADR-0023 Karar 1/2): `platformAdminRequired`/
// `twoFactorRequired` ADDITIVE eklendi — `platformAdminProcedure`'ün
// (`@arkesoft/trpc`) iki adımlı kapısının sözleşme-tamlığı için BİLDİRİLEN
// iki fabrika. ⚠ `platformAdminRequired()` bu portun ÇAĞRI YERİ YOKTUR
// (po not — `PlatformAdminReadPort.requirePlatformAdmin` TOTAL'dır ve
// `PlatformAdminRequiredError`'ı KENDİSİ fırlatır, `membershipRead.
// requireRole`'ün AYNI deseni); yöntem yalnızca sözleşmenin TAMLIĞI için
// burada uygulanır. `twoFactorRequired()` İÇİN YENİ sınıf YAZILMAZ —
// MEVCUT `TwoFactorRequiredError` sıfır argümanla yeniden kullanılır (o
// sınıfın dosya başı GÜNCELLEME yorumu).

import { Injectable } from '@nestjs/common'
import type { AppError } from '@arkesoft/errors'
import type { Permission, TenantRoleWire } from '@arkesoft/trpc'
import type { TrpcErrorFactoryPort } from '@arkesoft/trpc/server'

import { PermissionDeniedError } from '../errors/domain/permission-denied.error.js'
import { PlatformAdminRequiredError } from '../errors/domain/platform-admin-required.error.js'
import { TenantContextRequiredError } from '../errors/domain/tenant-context-required.error.js'
import { TwoFactorRequiredError } from '../errors/domain/two-factor-required.error.js'
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

  /**
   * ⚠ BU YÖNTEMİN ÜRETİMDE ÇAĞRI YERİ YOKTUR — `PlatformAdminReadPort.
   * requirePlatformAdmin` (TOTAL) `PlatformAdminRequiredError`'ı KENDİSİ
   * fırlatır; sözleşmenin TAMLIĞI için burada uygulanır (po not,
   * `platform-admin-read.port.ts` dosya başı yorumu).
   */
  platformAdminRequired(): AppError {
    return new PlatformAdminRequiredError()
  }

  /**
   * `platformAdminProcedure`'ün ikinci adımı: `platform_admin` kaydı VAR
   * ama aktörün KENDİ 2FA'sı KAPALI. YENİ sınıf YOK — MEVCUT
   * `TwoFactorRequiredError` sıfır argümanla çağrılır; iki parametresi
   * OPSİYONEL yapıldı (sınıfın dosya başı GÜNCELLEME yorumu).
   */
  twoFactorRequired(): AppError {
    return new TwoFactorRequiredError()
  }
}
