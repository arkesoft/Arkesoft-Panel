// @arkesoft/admin — dashboard (`/`) rotası (ROADMAP v0.0.7, T-008/S5,
// docs/ux/T-008.md)
//
// GERÇEKTEN boş pano: tek `h1` ("Panel") + dürüst boş durum (`EmptyState`,
// `headingLevel` SABİT h2 — ikinci bir `h1` ÜRETİLMEZ). Veri ÇEKMEZ — oturum
// cache'i `_app.tsx`'in guard'ı tarafından ZATEN dolduruldu (UX "pano kendi
// başına ayrıca veri çekmiyor").
//
// Odak yönetimi (UX "rota geçişi"): mount olduğunda odak bu rotanın kendi
// `h1`'ine taşınır (`tabIndex={-1}` + `ref.current.focus()`).
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, type JSX } from 'react'

import { EmptyState } from '../components/EmptyState.js'
import { MESSAGES } from '../messages/messages.js'

export const Route = createFileRoute('/_app/')({
  component: DashboardPage,
})

function DashboardPage(): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = MESSAGES.meta.dashboardTitle
    headingRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col gap-6 md:max-w-2xl lg:max-w-3xl xl:max-w-3xl">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
      >
        {MESSAGES.dashboard.title}
      </h1>
      <EmptyState heading={MESSAGES.dashboard.empty.heading} body={MESSAGES.dashboard.empty.body} />
    </div>
  )
}
