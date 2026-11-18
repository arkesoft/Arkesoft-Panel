// @arkesoft/api — PlatformAuditEntry (ROADMAP v0.0.20, T-021/S7, ADR-0023
// Karar 3)
//
// `ImpersonationService.runImpersonated()`'ın ZORUNLU BİRİNCİ PARAMETRESİ
// (ADR-0023 §3 pseudokodu, birebir). "Kim, nereden" bağlamı — eylemin
// KENDİSİNİ (`platform_admin_signed_in` / `tenant_impersonation_started`)
// veya o eyleme özgü veriyi (`detail.tenantIds`) TAŞIMAZ; o ayrım
// `ImpersonationService`'in çağıran yöntemine (private `writeAuditRow`)
// aittir.
//
// ⚠⚠ AC-11 (NEGATİF KAPSAM PİNİ, v0.1.0 AC-13 emsali) — bu arayüz
// impersonation'ın GEREKÇE alanını, SÜRE SINIRINI ve UYARI BANDINI
// (v0.15.0'ın sahipliğindeki üç kavram) KASITLI OLARAK TAŞIMAZ (ADR-0023
// Karar 3, architect madde 6 — "ayrı bir platform.impersonate mutation'ı
// yok"). Yokluk `platform-audit-entry-negative-scope.test.ts` ile MEKANİK
// olarak pinlenir — o üç kavramın İNGİLİZCE alan adları (ölçülmüş/bilerek)
// bu dosyada bilerek HİÇ YAZILMAZ (literal-jeton kuralı, AGENT_BASELINE.md
// §5 — denetlenen dosya, denetleyicinin aradığı jetonu KENDİ metninde
// BİTİŞİK taşımaz).

/**
 * `ImpersonationService`'in tüm yazma/okuma yöntemlerinin aktör bağlamı.
 * `actorUserId` `ctx.auth.userId`'den (ALS üzerinden, `platform-request-
 * context.ts`), `ip`/`userAgent` `RequestClientContext`'ten gelir —
 * GİRDİDEN ASLA (platform yetkisi KULLANICI bazlıdır, ADR-0023 Karar 1).
 */
export interface PlatformAuditEntry {
  readonly actorUserId: string
  readonly ip: string | null
  readonly userAgent: string | null
}
