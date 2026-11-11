// @arkesoft/admin — `/hesap/guvenlik` rotası (ROADMAP v0.0.15, T-016/S10,
// docs/ux/T-016-iki-faktorlu-dogrulama.md Ekran 1, docs/ui/T-016 P1;
// ROADMAP v0.0.15.1, T-017/S11 — "Aktif oturumlar" kartı EKLENDİ)
//
// Herhangi bir üye kendi hesap ayarlarına girdiğinde (2FA kişisel bir ayar,
// owner'a özel DEĞİL). Tek `h1` — `TwoFactorStatusCard`/`ActiveSessionsCard`
// KENDİ başlıklarını `CardTitle` (bir `<p>`, T-008'in kararı) ile taşır,
// ikinci bir `h1` ÜRETMEZ. Veri ÇEKMEZ — iki kart (konteyner) BAĞIMSIZ
// çeker (docs/ux/T-017 "izolasyon" şartı — biri diğerini etkilemez).
// Ayrı bir rota AÇILMAZ (docs/ui/T-017: "hesap güvenliği tek yüzey").
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, type JSX } from 'react'

import { ActiveSessionsCard } from '../features/sessions/ActiveSessionsCard.js'
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
      <ActiveSessionsCard />
    </div>
  )
}
