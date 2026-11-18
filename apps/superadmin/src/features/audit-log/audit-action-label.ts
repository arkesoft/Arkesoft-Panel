// @arkesoft/superadmin — resolveAuditActionLabel (ROADMAP v0.0.20, T-021/S8,
// docs/ui/T-021 — 2 üyelik KAPALI sözlük)
//
// `PlatformAuditActionWire`'ın iki değeri, `@arkesoft/trpc`'nin KAPALI
// kümesinden türetilir — ikinci bir sözlük elle İCAT EDİLMEZ. Metinler
// `messages.ts`'ten gelir, burada SABİT Türkçe literal YOK.
import type { PlatformAuditActionWire } from '@arkesoft/trpc'

export interface AuditActionLabels {
  readonly platform_admin_signed_in: string
  readonly tenant_impersonation_started: string
}

/**
 * Derleme zamanı KAPALI dünya: `PlatformAuditActionWire`'a yeni bir değer
 * eklenip bu dosyada DALLANMAZSA `tsc --noEmit` KIRILIR.
 */
export function resolveAuditActionLabel(
  action: PlatformAuditActionWire,
  labels: AuditActionLabels,
): string {
  switch (action) {
    case 'platform_admin_signed_in':
      return labels.platform_admin_signed_in
    case 'tenant_impersonation_started':
      return labels.tenant_impersonation_started
    default: {
      const exhaustiveCheck: never = action
      throw new Error(
        `resolveAuditActionLabel: beklenmeyen eylem — ${JSON.stringify(exhaustiveCheck)}`,
      )
    }
  }
}
