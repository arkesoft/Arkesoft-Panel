// @arkesoft/admin — `/hesap/guvenlik` rotası (ROADMAP v0.0.15, T-016/S10,
// docs/ux/T-016-iki-faktorlu-dogrulama.md Ekran 1, docs/ui/T-016 P1)
//
// Herhangi bir üye kendi hesap ayarlarına girdiğinde (2FA kişisel bir ayar,
// owner'a özel DEĞİL). Tek `h1` — `TwoFactorStatusCard` KENDİ başlığını
// `CardTitle` (bir `<p>`, T-008'in kararı) ile taşır, ikinci bir `h1`
// ÜRETMEZ. Veri ÇEKMEZ — `TwoFactorStatusCard` (konteyner) çeker.
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, type JSX } from 'react'

import { TwoFactorStatusCard } from '../features/two-factor/TwoFactorStatusCard.js'
import { MESSAGES } from '../messages/messages.js'

export const Route = createFileRoute('/_app/hesap/guvenlik')({
  component: AccountSecurityPage,
})

function AccountSecurityPage(): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${MESSAGES.accountSecurity.title} · Arkesoft Panel`
    headingRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col gap-6 md:max-w-2xl lg:max-w-3xl xl:max-w-3xl">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
      >
        {MESSAGES.accountSecurity.title}
      </h1>
      <TwoFactorStatusCard />
    </div>
  )
}
