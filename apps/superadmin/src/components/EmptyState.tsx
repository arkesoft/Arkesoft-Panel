// @arkesoft/superadmin — EmptyState (ROADMAP v0.0.20, T-021/S8,
// `apps/admin/src/components/EmptyState.tsx`'in BİREBİR görsel/
// erişilebilirlik sözleşmesi — cross-app import yasak olduğu için yerel
// kopya, `@arkesoft/ui`'ye TERFİ ETTİRİLMEDİ, bkz. docs/ui/T-021 A-PO21-4).
//
// `headingLevel` HER ZAMAN `h2` (prop YOK): sayfanın tek `h1`'i zaten
// route'tadır. `role="status"` — boş durum bir placeholder/boşluk değil,
// okunabilir bir durum.
import type { JSX } from 'react'

export interface EmptyStateProps {
  readonly heading: string
  readonly body: string
}

export function EmptyState({ heading, body }: EmptyStateProps): JSX.Element {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-(--radius-card) border border-(--color-border-subtle) bg-(--color-surface-muted) p-6"
    >
      <h2 className="text-(length:--font-size-body) font-(--font-weight-semibold) text-(--color-text-primary)">
        {heading}
      </h2>
      <p className="max-w-2xl text-(length:--font-size-body) text-(--color-text-secondary)">
        {body}
      </p>
    </div>
  )
}
