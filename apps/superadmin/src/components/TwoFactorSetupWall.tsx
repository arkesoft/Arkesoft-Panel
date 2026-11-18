// @arkesoft/superadmin — TwoFactorSetupWall (ROADMAP v0.0.20, T-021/S8,
// docs/ui/T-021-super-admin-iskeleti.md "Üç 403'ün görsel ayrımı" #2)
//
// `TWO_FACTOR_REQUIRED` durumu — platform yöneticisi AMA kişisel 2FA'sı
// kapalı. Bu bir engel DEĞİL, bir SONRAKİ ADIM: `role="status"`, **marka**
// vurgu (`--color-brand-500` sol kenarlık) + `Button variant="primary"` —
// `ErrorState`'in `danger` ailesinden BİLEREK ayrılır (marka rengi "ileri
// git" sinyali verir).
//
// Kendi `h1`'ini taşır, mount'ta odağı alır — kabuğun DIŞINDA render edilir.
import { useEffect, useRef, type JSX } from 'react'

import { Button } from '@arkesoft/ui'

export interface TwoFactorSetupWallProps {
  readonly title: string
  readonly body: string
  readonly startButtonLabel: string
  readonly onStart: () => void
}

export function TwoFactorSetupWall({
  title,
  body,
  startButtonLabel,
  onStart,
}: TwoFactorSetupWallProps): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div
        role="status"
        className="flex w-full max-w-md flex-col gap-4 rounded-(--radius-card) border-l-4 border-(--color-brand-500) bg-(--color-surface) p-6"
      >
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
        >
          {title}
        </h1>
        <p className="text-(length:--font-size-body) text-(--color-text-secondary)">{body}</p>
        <div>
          <Button type="button" variant="primary" onClick={onStart}>
            {startButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
