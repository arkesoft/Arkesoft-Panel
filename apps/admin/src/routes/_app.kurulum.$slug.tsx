// @arkesoft/admin — `/kurulum/{slug}` rotası (ROADMAP v0.1.0, T-019/S10,
// docs/ux/T-019-kayit-ve-kiraci-olusturma.md Ekran 8, docs/ui/T-019 P7)
//
// Korumalı (`_app` guard'ı içinde). ⚠ Repodaki İLK dinamik parametre
// segmentli rota (`$slug`) — TanStack Router'ın dosya adı kuralı
// (`$paramName`) burada İLK kez kullanılıyor (docs/ui KARAR 1, madde 3).
//
// Bu dosya kendi `h1`'ini taşır (`OnboardingChecklistCard` `CardHeader`/
// `CardTitle` KULLANMAZ — ikinci bir başlık metni TEKRAR etmesin, docs/ui
// P7 notu). Bundle bütçesi: `DELIBERATELY_LAZY_ROUTE_SRCS` (KARAR 1).
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, type JSX } from 'react'

import { OnboardingChecklistCard } from '../features/registration/OnboardingChecklistCard.js'
import { MESSAGES } from '../messages/messages.js'

export const Route = createFileRoute('/_app/kurulum/$slug')({
  component: OnboardingChecklistPage,
})

function OnboardingChecklistPage(): JSX.Element {
  const { slug } = Route.useParams()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = MESSAGES.meta.onboardingChecklistTitle
    headingRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col gap-6 md:max-w-2xl lg:max-w-3xl xl:max-w-3xl">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
      >
        {MESSAGES.dashboard.onboarding.checklistTitle}
      </h1>
      <OnboardingChecklistCard slug={slug} />
    </div>
  )
}
