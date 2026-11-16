// @arkesoft/trpc — `platform.*` (ROADMAP v0.0.20, T-021/S5, architect "tRPC —
// yeni `platform` router'ı" bölümü, ADR-0023 Karar 1/2/3)
//
// YENİ DOSYA — ÜÇ prosedür, hiçbiri kiracı KAVRAMINI bilmez (platform
// seviyesi bir yüzey, `tenant.router.ts`/`registration.router.ts`'in dosya
// kapsamlı güven seviyesi beyanlarının EMSALİ).
//
// `session`: `protectedProcedure` — `platformAdminProcedure`'ün KAPISI
// DIŞINDA (architect madde 1, ADR-0023 Karar 2). `tenantList`/`auditLog`:
// `platformAdminProcedure` — platform yetkisi VE 2FA ZORUNLU.
//
// ⚠⚠ ÜÇÜNÜN ÜÇÜ DE `protectedProcedure` ZİNCİRİNDEN gelir, `tenantProcedure`
// DEĞİL (ADR-0023 Karar 2): süper admin host'u REZERVE bir alt alan adıdır
// (`reserved-subdomains.ts:35`), `ctx.tenant` HİÇ DARALMAZ. Bu dosyadaki
// resolver'lar `ctx.tenant`'a HİÇ ERİŞMEZ.
//
// Resolver gövdesi TEK İFADE (ADR-0009 madde 4, bağlayıcı) — `if`/ara
// değişken/dallanma SIFIR. Portlar TOTAL'dır (`../ports/platform-admin-read.port.ts`,
// `../ports/platform-read.port.ts`) — "yönetici değil"/"üye değil" BURAYA
// dönüş değeri olarak GELMEZ, port/middleware `AppError` fırlatır.
//
// ⭐⭐ Ayrı bir `platform.impersonate` MUTATION'I YOK (architect madde 6,
// ADR-0023 Karar 3) — impersonation `tenantList`'in `plan` okumasının İÇİNDE,
// apps/api'nin `platform/` modülünün (S7) iç uygulama ayrıntısıdır. AC-11
// bu yüzden YAPISAL olarak sağlanır: gerekçe/süre/uyarı bandı alanı EKLENECEK
// BİR YÜZEY hiç YOKTUR.
//
// HTTP yolları: `/trpc/platform.session`, `/trpc/platform.tenantList`,
// `/trpc/platform.auditLog` — ÜÇÜ DE `protectedProcedure` zincirinden gelir
// (host'tan çözülen bir kiracı ARAMAZ).
// ⚠⚠ DÜZELTME (`docs`, T-021 gate fazı — `solid` tur 1/tur 2 doc↔davranış
// sapması olarak buldu): bu üç yol `TENANT_EXEMPT_PATHS`'E EKLENDİ (24 → 27,
// `apps/api/src/tenancy/tenant-exempt-paths.ts`) — süper admin host'u REZERVE
// olduğu için `TenantGuard` allowlist'e girmeyen her yolu 404 ile reddeder
// (`registration.*` üçlüsünün v0.1.0'daki aynı yapısal kısıtı). `AUTH_EXEMPT_PATHS`
// bu üçünü İÇERMEZ ve 12'de kalır (bu yarı doğruydu); normal kimlik doğrulama
// muhafızından geçerler (`apps/api`, S7).

import { platformAdminProcedure } from '../authz/platform-admin-procedure.js'
import {
  platformAuditLogInputSchema,
  platformAuditLogOutputSchema,
  platformSessionSchema,
  platformTenantListInputSchema,
  platformTenantListOutputSchema,
} from '../schemas/platform.schema.js'
import { protectedProcedure, router } from '../trpc.js'

export const platformRouter = router({
  /**
   * `protectedProcedure` — `platformAdminProcedure`'ün KAPISI DIŞINDA
   * (architect "tRPC" bölümü madde 1, AC-4(a)'nın ön koşulu). Çıktı SIFIR
   * kiracı verisi taşır ve yalnızca ÇAĞIRANIN KENDİSİ hakkındadır — bu
   * yüzden AC-4(b)'nin "veri ucu" tanımına GİRMEZ.
   */
  session: protectedProcedure
    .output(platformSessionSchema)
    .query(({ ctx }) => ctx.ports.platformAdminRead.readPlatformSession(ctx.auth.userId)),

  /**
   * `platformAdminProcedure` — platform yetkisi VE 2FA ZORUNLU. ⚠⚠ `plan`
   * sütununun okunması apps/api'nin `platform/` modülünde (S7) BİR
   * `runImpersonated()` çağrısına, dolayısıyla BİR
   * `tenant_impersonation_started` denetim satırına karşılık gelir
   * (ADR-0023 Karar 3) — bu YAN ETKİ bu resolver'da GÖRÜNMEZ, portun
   * (`PlatformReadPort.listTenants`) iç uygulama ayrıntısıdır.
   */
  tenantList: platformAdminProcedure
    .input(platformTenantListInputSchema)
    .output(platformTenantListOutputSchema)
    .query(({ ctx, input }) =>
      ctx.ports.platformRead.listTenants(input).then((tenants) => ({ tenants: [...tenants] })),
    ),

  /**
   * `platformAdminProcedure` — platform yetkisi VE 2FA ZORUNLU. Kiracı
   * verisine ERİŞMEZ, impersonation GEREKTİRMEZ (platform seviyesi bir
   * tablo okur).
   */
  auditLog: platformAdminProcedure
    .input(platformAuditLogInputSchema)
    .output(platformAuditLogOutputSchema)
    .query(({ ctx, input }) =>
      ctx.ports.platformRead.listAuditEntries(input).then((entries) => ({ entries: [...entries] })),
    ),
})
