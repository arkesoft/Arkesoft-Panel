// @arkesoft/superadmin — AuditLogView (ROADMAP v0.0.20, T-021/S8,
// docs/ui/T-021-super-admin-iskeleti.md "Ekran 5 — Platform denetim kaydı")
//
// Veri çeken KONTEYNER (CLAUDE.md §9) — `platform.auditLog`'u çeker.
// ⭐ Orkestratör kararı: `DataTable` KULLANILMIYOR, native `<ul>`/`<li>` —
// `subject` alanı eyleme göre anlam değiştirdiği için sabit sütun başlığı
// listeden ZAYIF (docs/ux/T-021 madde 7, T-017 emsali). Boş durum N/A
// (UX'in şartı: yapısal olarak sıfır satır beklenmez; gerçekleşirse bu bir
// hata, ayrı bir uyarı render EDİLMEZ).
import { useQuery } from '@tanstack/react-query'
import type { JSX } from 'react'

import { Skeleton } from '@arkesoft/ui'

import { auditLogQueryOptions } from '../../api/audit-log-query.js'
import { ErrorState } from '../../components/ErrorState.js'
import { formatPlatformDate } from '../../lib/format-platform-date.js'
import { MESSAGES } from '../../messages/messages.js'
import { resolveAuditActionLabel } from './audit-action-label.js'

const ACTION_LABELS = {
  platform_admin_signed_in: MESSAGES.platform.auditLog.actionLogin,
  tenant_impersonation_started: MESSAGES.platform.auditLog.actionTenantAccess,
}

export function AuditLogView(): JSX.Element {
  const auditLogQuery = useQuery(auditLogQueryOptions)

  if (auditLogQuery.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (auditLogQuery.isError) {
    return (
      <ErrorState
        headingLevel="h2"
        title={MESSAGES.errors.genericTitle}
        message={MESSAGES.platform.auditLog.loadError}
        supportCodeLine={null}
        retryLabel={MESSAGES.errors.retryButton}
        onRetry={() => {
          void auditLogQuery.refetch()
        }}
      />
    )
  }

  const entries = auditLogQuery.data.entries

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-col gap-1 rounded-(--radius-card) border border-(--color-border-subtle) bg-(--color-surface) p-4"
        >
          <span className="font-mono text-(length:--font-size-small) text-(--color-text-secondary)">
            {entry.actorUserId}
          </span>
          <span className="text-(length:--font-size-body) text-(--color-text-primary)">
            {resolveAuditActionLabel(entry.action, ACTION_LABELS)}
            {' — '}
            {entry.subject}
          </span>
          <span className="text-(length:--font-size-small) text-(--color-text-secondary)">
            {formatPlatformDate(entry.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  )
}
