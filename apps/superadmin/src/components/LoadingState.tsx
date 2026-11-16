// @arkesoft/superadmin — LoadingState (ROADMAP v0.0.20, T-021/S8,
// `apps/admin/src/components/LoadingState.tsx`'in BİREBİR görsel/
// erişilebilirlik sözleşmesi — cross-app import yasak olduğu için yerel
// kopya, `@arkesoft/ui`'ye TERFİ ETTİRİLMEDİ, bkz. docs/ui/T-021 A-PO21-4).
//
// `headingLevel`: kabuksuz bir anın (henüz hiçbir route'un `h1`'i mount
// olmamış) TEK başlığı ise `"h1"`; `<main>` içinde kullanılırsa `"h2"`.
//
// `aria-live="polite"` — geçiş durumu, kesintisiz duyuru (`role="alert"`
// DEĞİL, bu `ErrorState`'in işi).
import type { JSX } from 'react'

export interface LoadingStateProps {
  readonly headingLevel: 'h1' | 'h2'
  readonly title: string
}

export function LoadingState({ headingLevel, title }: LoadingStateProps): JSX.Element {
  const Heading = headingLevel

  return (
    <div
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <Heading className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)">
        {title}
      </Heading>
      <span
        aria-hidden="true"
        className="inline-block size-6 animate-spin rounded-full border-2 border-current border-t-transparent text-(--color-text-secondary) motion-reduce:animate-none"
      />
    </div>
  )
}
