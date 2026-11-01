// @arkesoft/admin — EmptyState (ROADMAP v0.0.7, T-008/S5, docs/ui/T-008.md
// bileşen eşlemesi)
//
// `headingLevel` HER ZAMAN `h2` (ui'nin kararı, sabit — prop YOK): sayfanın
// tek `h1`'i zaten route'tadır ("Panel"); `EmptyState` ikinci bir `h1`
// ÜRETMEZ. `role="status"` — UX'in "mağaza/kullanıcı kimliği gösterilmeyen
// yerlerde 'yok' durumu sessiz değil, açık" niyetiyle aynı aile: boş durum
// bir placeholder/boşluk değil, okunabilir bir durum.
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
