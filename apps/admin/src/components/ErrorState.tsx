// @arkesoft/admin — ErrorState (ROADMAP v0.0.7, T-008/S5, docs/ui/T-008.md
// bileşen eşlemesi)
//
// `headingLevel` KARARI (ui, bağlayıcı — `LoadingState`'in aynısı):
// `_app.tsx`'in KABUKSUZ pending/error durumunda `headingLevel="h1"`;
// dashboard mount olduktan SONRA `<main>` içinde ("pano açıldıktan sonra
// arka plan hatası") `headingLevel="h2"` — `AppShell` yerinde kalır, ikinci
// bir `h1` ÜRETİLMEZ.
//
// `role="alert"` — beklenmeyen bir durumun (oturum doğrulama 500/ağ) dikkat
// çekmesi gerekiyor; UX'in form-gönderim-hatası için istediği assertive
// duyuru niyetiyle AYNI aile (loading'in aria-live="polite"'ından farklı).
//
// `supportCodeLine` — `null` ise HİÇ render EDİLMEZ (panel sahip olmadığı
// bir `requestId`'yi uydurmaz, borç 1445/`formatSupportCodeLine` kısıtı).
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
