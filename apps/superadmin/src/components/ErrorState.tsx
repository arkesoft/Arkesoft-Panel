// @arkesoft/superadmin — ErrorState (ROADMAP v0.0.20, T-021/S8,
// `apps/admin/src/components/ErrorState.tsx`'in BİREBİR görsel/
// erişilebilirlik sözleşmesi — cross-app import yasak olduğu için yerel
// kopya, `@arkesoft/ui`'ye TERFİ ETTİRİLMEDİ, bkz. docs/ui/T-021 A-PO21-4).
//
// `headingLevel`: kabuksuz bir anda `"h1"`; `<main>` içinde (kabuk
// kurulduktan SONRA arka plan hatası) `"h2"`.
//
// `role="alert"` — beklenmeyen bir durumun dikkat çekmesi gerekiyor.
//
// `supportCodeLine` — `null` ise HİÇ render EDİLMEZ (panel sahip olmadığı
// bir `requestId`'yi uydurmaz).
import type { JSX } from 'react'

import { Button } from '@arkesoft/ui'

export interface ErrorStateProps {
  readonly headingLevel: 'h1' | 'h2'
  readonly title: string
  readonly message: string
  readonly supportCodeLine: string | null
  readonly retryLabel: string
  readonly onRetry: () => void
}

export function ErrorState({
  headingLevel,
  title,
  message,
  supportCodeLine,
  retryLabel,
  onRetry,
}: ErrorStateProps): JSX.Element {
  const Heading = headingLevel

  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <Heading className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)">
        {title}
      </Heading>
      <p className="max-w-md text-(length:--font-size-body) text-(--color-text-secondary)">
        {message}
      </p>
      {supportCodeLine !== null ? (
        <p className="text-(length:--font-size-small) text-(--color-text-secondary)">
          {supportCodeLine}
        </p>
      ) : null}
      <Button type="button" variant="primary" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  )
}
