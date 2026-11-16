// @arkesoft/trpc — PlatformReadPort (ROADMAP v0.0.20, T-021/S5, architect
// "tRPC" bölümü, ADR-0023 Karar 1/3)
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR (S7, `platform/` modülü).
// `platformAdminProcedure` ile kapılanan İKİ okuma ucunun (`platform.tenantList`,
// `platform.auditLog`) TEK veri kaynağıdır. İkisi de TOTAL'dır ve FIRLAMAZ —
// "bulunamadı" durumu YOKTUR, boş dizi geçerli bir sonuçtur
// (`sessionListRead.listOwnSessions`'ın AYNI deseni).
//
// ⚠⚠ `listTenants` ADR-0023 Karar 1'in ("R1 ÇÖZÜLDÜ") UYGULAMA YERİDİR: bu
// portun ADAPTÖRÜ (apps/api, S7) kolonların ÜÇÜNÜ (`slug`/`status`/
// `createdAt`) GUC'suz okur, `planId`/`planName` BAĞINI ise `runImpersonated()`
// ile (kiracı başına AYRI `withTenant()`) okur ve bu TEK okuma operasyonu
// `platform_audit_log`'a BİR satır yazar (`tenant_impersonation_started`,
// `detail.tenantIds` erişilen kümenin TAMAMI). ⚠ Bu YAN ETKİ bu port
// arayüzünde GÖRÜNMEZ — `runImpersonated()`'ın ZORUNLU denetim parametresi
// apps/api'nin `platform/` modülünün iç sözleşmesidir (ADR-0023 Karar 3),
// `packages/trpc` denetim yazma mekanizmasını hiç BİLMEZ.
//
// ⚠ `listAuditEntries` kiracı verisine ERİŞMEZ — `platform_audit_log`
// platform seviyesi bir tablodur (`PLATFORM_LEVEL_TABLES` üyesi, RLS/GUC
// YOK) ve bu okuma impersonation GEREKTİRMEZ, denetim satırı ÜRETMEZ.
//
// ⚠ Girdilerin HİÇBİRİ kiracı kimliği TAŞIMAZ — ikisi de platform seviyesi
// birer listedir, host çözümünden gelen bir `tenantId` KAVRAMI YOKTUR.

import type {
  PlatformAuditEntry,
  PlatformAuditLogInput,
  PlatformTenantListInput,
  PlatformTenantSummary,
} from '../schemas/platform.schema.js'

export interface PlatformReadPort {
  /** `platform.tenantList`'in TEK veri kaynağı — dosya başı yorumunun R1 açıklaması. */
  listTenants(input: PlatformTenantListInput): Promise<readonly PlatformTenantSummary[]>

  /** `platform.auditLog`'un TEK veri kaynağı — impersonation GEREKTİRMEZ. */
  listAuditEntries(input: PlatformAuditLogInput): Promise<readonly PlatformAuditEntry[]>
}
