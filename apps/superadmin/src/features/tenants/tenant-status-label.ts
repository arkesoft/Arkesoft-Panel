// @arkesoft/superadmin — resolveTenantStatusLabel (ROADMAP v0.0.20,
// T-021/S8, docs/ui/T-021 "Dosya türü disiplini" — 4 üyelik KAPALI sözlük,
// `apps/admin/src/features/registration/checklist-step-label.ts`'in AYNI
// deseni: `satisfies Record<...>`)
//
// WCAG 1.4.1 (`docs/ux/T-021` madde 6): durum HER ZAMAN görünür METİNLE
// gösterilir — renkli nokta yalnızca metnin yanında DEKORATİF destek, tek
// başına bilgi TAŞIMAZ. Metinler `messages.ts`'ten gelir, burada SABİT
// Türkçe literal YOK (çağıran taraf mesaj kataloğunu bu fonksiyona geçirir).
import type { TenantStatusWire } from '@arkesoft/trpc'

export interface TenantStatusLabels {
  readonly pending: string
  readonly provisioning: string
  readonly active: string
  readonly suspended: string
}

/**
 * Derleme zamanı KAPALI dünya: `TenantStatus`'a (dört üyeli) yeni bir değer
 * eklenip bu dosyada DALLANMAZSA `tsc --noEmit` KIRILIR — `messages.ts`'in
 * `satisfies Record<PanelErrorCode, string>` deseninin aynısı burada
 * `exhaustive switch` ile uygulanır (kayıt yerine fonksiyon imzası farklı
 * olduğu için `satisfies` değil, `assertNever` kullanılır).
 */
export function resolveTenantStatusLabel(
  status: TenantStatusWire,
  labels: TenantStatusLabels,
): string {
  switch (status) {
    case 'pending':
      return labels.pending
    case 'provisioning':
      return labels.provisioning
    case 'active':
      return labels.active
    case 'suspended':
      return labels.suspended
    default: {
      // `TenantStatusWire`'ın dört üyesi EXHAUSTIVE — beşinci bir değer
      // eklenirse bu satır `tsc --noEmit`'i KIRAR (CLAUDE.md §4).
      const exhaustiveCheck: never = status
      throw new Error(
        `resolveTenantStatusLabel: beklenmeyen durum — ${JSON.stringify(exhaustiveCheck)}`,
      )
    }
  }
}

/**
 * Durum rozetinin DEKORATİF noktası için Tailwind sınıfı — docs/ui/T-021
 * "Tasarım token'ları" tablosundaki pinli çiftler: `active` → success,
 * `suspended` → danger, `pending`/`provisioning` → nötr (token setinde
 * "warning" tonu İCAT EDİLMEDİ). Tek başına bilgi TAŞIMAZ (WCAG 1.4.1) —
 * her zaman {@link resolveTenantStatusLabel}'in görünür metniyle BİRLİKTE
 * render edilir.
 */
export function resolveTenantStatusDotClassName(status: TenantStatusWire): string {
  switch (status) {
    case 'active':
      return 'bg-(--color-success-600)'
    case 'suspended':
      return 'bg-(--color-danger-600)'
    case 'pending':
    case 'provisioning':
      return 'bg-(--color-text-secondary)'
    default: {
      const exhaustiveCheck: never = status
      throw new Error(
        `resolveTenantStatusDotClassName: beklenmeyen durum — ${JSON.stringify(exhaustiveCheck)}`,
      )
    }
  }
}
