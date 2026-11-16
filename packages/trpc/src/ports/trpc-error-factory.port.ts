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

// `platformAdminRequired()`/`twoFactorRequired()` → ROADMAP v0.0.20, T-021/S5,
// ADR-0023 Karar 1/2 — `platformAdminProcedure`'ün (`../authz/
// platform-admin-procedure.ts`) iki adımlı kapısının İKİ hata kodu. İkisi de
// 403 (401 DEĞİL — kimlik ZATEN kurulmuştur, eksik olan YETKİdir) ve İKİSİ
// DE varlık oracle'ı DEĞİLDİR: ikisi de yalnızca ÇAĞIRANIN KENDİSİ hakkındadır
// (`permission-procedure.ts:70-73`'ün AYNI gerekçesi). `twoFactorRequired()`
// için YENİ sınıf YAZILMAZ — `apps/api`'nin MEVCUT `TwoFactorRequiredError`
// sınıfı (`errors/domain/two-factor-required.error.ts`, ROADMAP v0.0.15,
// T-016/S6) yeniden kullanılır; `platformAdminRequired()` için YENİ bir
// `PLATFORM_ADMIN_REQUIRED` sınıfı `apps/api`'de EKLENİR (S7).

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

  /**
   * `platformAdminProcedure`'ün KULLANMADIĞI (po not: port kendi TOTAL
   * sözleşmesiyle kayıt eksikliğini KENDİSİ fırlatır — bkz.
   * `platform-admin-read.port.ts`) ama sözleşmenin TAMLIĞI için BİLDİRİLEN
   * fabrika yöntemi: aktörün `platform_admin` kaydı YOKTUR. Zaman içinde
   * platform yetkisini doğrulayan BAŞKA bir giriş noktası (ör. bir Nest
   * guard) AYNI hatayı üretmek isterse tek doğruluk kaynağı budur.
   */
  platformAdminRequired(): AppError

  /**
   * `platformAdminProcedure`'ün (`../authz/platform-admin-procedure.ts`)
   * ikinci adımı: `platform_admin` kaydı VAR ama aktörün KENDİ
   * `two_factor_enabled` bayrağı `false`. ⚠ YENİ sınıf YAZILMAZ — `apps/api`
   * BUNU MEVCUT `TwoFactorRequiredError`'A eşler (dosya başı yorumu).
   */
  twoFactorRequired(): AppError
}
