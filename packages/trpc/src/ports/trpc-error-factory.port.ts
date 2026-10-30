// @arkesoft/trpc — TrpcErrorFactoryPort (ROADMAP v0.0.6, T-007/ST-2, architect
// "tRPC sözleşmesi" bölümü)
//
// Hata SINIFI `packages/trpc`'de TANIMLANMAZ (AC9(a) — domain hatası alt
// sınıf adı/hata kodu literali 0 eşleşme). `requireAuth`/`requireTenant`
// middleware'leri (trpc.ts) kimlik/kiracı bağlamı eksikse bu portu çağırıp
// dönen `AppError`'ı fırlatır; kodu, HTTP durumunu ve i18n anahtarını seçme
// kararı `apps/api`'de kalır (`apps/api/src/trpc/trpc-errors.port.adapter.ts`,
// S5).
//
// `tenantContextRequired()` → `apps/api`'nin YENİ hata sınıfı
// (`TenantContextRequiredError`, `TENANT_CONTEXT_REQUIRED`, 401) — yalnızca
// HTTP-DIŞI çağıranlara görünür; HTTP yolunda `TenantGuard` zaten ÖNCE 404
// verir (K2 ile çelişmez, architect "tRPC sözleşmesi" bölümü).

import type { AppError } from '@arkesoft/errors'

export interface TrpcErrorFactoryPort {
  /** `TrpcAuthState.kind !== 'authenticated'` durumunda `requireAuth` bunu fırlatır. */
  unauthenticated(): AppError
  /** `TrpcTenantState.kind !== 'resolved'` durumunda `requireTenant` bunu fırlatır. */
  tenantContextRequired(): AppError
}
