// @arkesoft/superadmin — `/denetim-kaydi` rotası (ROADMAP v0.0.20, T-021/S8,
// docs/ux/T-021-super-admin-iskeleti.md Ekran 5, docs/ui/T-021 Ekran 5
// bileşen eşlemesi)
//
// İnce route dosyası — veri çeken konteyner `AuditLogView`'ı render eder.
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, type JSX } from 'react'

import { AuditLogView } from '../features/audit-log/AuditLogView.js'
import { MESSAGES } from '../messages/messages.js'

export const Route = createFileRoute('/_app/denetim-kaydi')({
  component: AuditLogPage,
})

function AuditLogPage(): JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = MESSAGES.meta.auditLogTitle
    headingRef.current?.focus()
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
      >
        {MESSAGES.platform.auditLog.title}
      </h1>
      <AuditLogView />
    </div>
  )
}
