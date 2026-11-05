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

// `permissionDenied()` → `apps/api`'nin YENİ hata sınıfı (`PERMISSION_DENIED`,
// 403, `errors.authz.permissionDenied`; ROADMAP v0.0.14, T-014/S2, architect
// K-A6). Gövde ŞEKLİ mevcut üyelik hatasıyla BİREBİR aynıdır — tele yeni bir
// hata şekli İCAT EDİLMEZ.

import type { AppError } from '@arkesoft/errors'

import type { Permission } from '../authz/permissions.js'
import type { TenantRoleWire } from '../schemas/member.schema.js'

export interface TrpcErrorFactoryPort {
  /** `TrpcAuthState.kind !== 'authenticated'` durumunda `requireAuth` bunu fırlatır. */
  unauthenticated(): AppError
  /** `TrpcTenantState.kind !== 'resolved'` durumunda `requireTenant` bunu fırlatır. */
  tenantContextRequired(): AppError
  /**
   * Aktörün rolü istenen izni taşımıyorsa `permissionProcedure`
   * (`../authz/permission-procedure.ts`) bunu fırlatır.
   *
   * ⚠ İKİ PARAMETRE YALNIZCA `AppError.context`'E (loga) GİRER, TELE GİRMEZ
   * (architect K-A6): hangi iznin eksik olduğunu ve aktörün hangi rolde
   * olduğunu istemciye söylemek yetki modelinin iç yapısını dışa açar.
   * `AppError.context`'in tel sözleşmesine serileşmediği `@arkesoft/errors`
   * tarafından YAPISAL olarak garanti edilir (`toErrorBody` o alanı hiç
   * okumaz) — bu yüzden burada bir maskeleme/ayıklama adımı GEREKMEZ.
   *
   * ⚠ Durum 403'tür, 404 DEĞİL: aktör bu kiracının ÜYESİDİR (üyelik portu
   * doğruladı) → başka bir kiracının varlığı hakkında hiçbir bilgi sızmaz,
   * CLAUDE.md §7 madde 12'nin varlık oracle'ı yasağıyla çarpışma YOKTUR.
   */
  permissionDenied(permission: Permission, role: TenantRoleWire): AppError
}
