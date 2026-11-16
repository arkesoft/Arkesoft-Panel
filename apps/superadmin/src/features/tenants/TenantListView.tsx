// @arkesoft/superadmin — TenantListView (ROADMAP v0.0.20, T-021/S8,
// docs/ui/T-021-super-admin-iskeleti.md "Ekran 4 — Kiracı listesi")
//
// Veri çeken KONTEYNER (CLAUDE.md §9) — `platform.tenantList`'i çeker, dört
// durumu (normal/yükleniyor/boş/hata) render eder. `DataTable`'ın T-008'den
// beri İLK gerçek tüketicisi.
//
// ⚠⚠ DUAL-MARKUP (bilinçli, `DataTable`'ın kendi sunum-kabuğu sınırı
// nedeniyle): `DataTable` (`hidden md:block`, ≥768px) ↔ native `<ul>/<li>`
// kart görünümü (`md:hidden`, <768px) AYNI veriyi render eder — `hidden`
// (gerçek `display:none`) kullanılır, `visibility:hidden` KULLANILMAZ;
// aksi hâlde ekran okuyucuya içerik İKİ KEZ duyurulur (wcag'ın elle
// denetleyeceği madde).
import { useQuery } from '@tanstack/react-query'
import type { JSX } from 'react'

import { cn, DataTable, Skeleton } from '@arkesoft/ui'

import { tenantListQueryOptions } from '../../api/tenant-list-query.js'
import { EmptyState } from '../../components/EmptyState.js'
import { ErrorState } from '../../components/ErrorState.js'
import { formatPlatformDate } from '../../lib/format-platform-date.js'
import { MESSAGES } from '../../messages/messages.js'
import { resolveTenantStatusDotClassName, resolveTenantStatusLabel } from './tenant-status-label.js'

const STATUS_LABELS = {
  pending: MESSAGES.platform.tenantList.statusPending,
  provisioning: MESSAGES.platform.tenantList.statusProvisioning,
  active: MESSAGES.platform.tenantList.statusActive,
  suspended: MESSAGES.platform.tenantList.statusSuspended,
}

export function TenantListView(): JSX.Element {
  const tenantsQuery = useQuery(tenantListQueryOptions)

  if (tenantsQuery.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (tenantsQuery.isError) {
    return (
      <ErrorState
        headingLevel="h2"
        title={MESSAGES.errors.genericTitle}
        message={MESSAGES.platform.tenantList.loadError}
        supportCodeLine={null}
        retryLabel={MESSAGES.errors.retryButton}
        onRetry={() => {
          void tenantsQuery.refetch()
        }}
      />
    )
  }

  const tenants = tenantsQuery.data.tenants
  const emptyState = <EmptyState heading={MESSAGES.platform.tenantList.emptyTitle} body="" />

  return (
    <>
      <div className="hidden md:block">
        <DataTable
          caption={MESSAGES.platform.tenantList.caption}
          columns={[
            { key: 'name', header: MESSAGES.platform.tenantList.columnName },
            { key: 'slug', header: MESSAGES.platform.tenantList.columnSlug },
            { key: 'plan', header: MESSAGES.platform.tenantList.columnPlan },
            { key: 'status', header: MESSAGES.platform.tenantList.columnStatus },
            { key: 'createdAt', header: MESSAGES.platform.tenantList.columnCreatedAt },
          ]}
          rows={tenants.map((tenant) => ({
            name: tenant.name,
            slug: <span className="font-mono">{tenant.slug}</span>,
            plan: tenant.planName ?? MESSAGES.platform.tenantList.planUnknown,
            status: (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-block size-2 rounded-full',
                    resolveTenantStatusDotClassName(tenant.status),
                  )}
                />
                {resolveTenantStatusLabel(tenant.status, STATUS_LABELS)}
              </span>
            ),
            createdAt: formatPlatformDate(tenant.createdAt),
          }))}
          emptyState={emptyState}
        />
      </div>

      {tenants.length === 0 ? (
        <div className="md:hidden">{emptyState}</div>
      ) : (
        <ul className="flex flex-col gap-3 md:hidden">
          {tenants.map((tenant) => (
            <li
              key={tenant.id}
              className="flex flex-col gap-1 rounded-(--radius-card) border border-(--color-border-subtle) bg-(--color-surface) p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-(--font-weight-semibold) text-(length:--font-size-body) text-(--color-text-primary)">
                  {tenant.name}
                </span>
                <span className="inline-flex items-center gap-2 text-(length:--font-size-small) text-(--color-text-secondary)">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-block size-2 rounded-full',
                      resolveTenantStatusDotClassName(tenant.status),
                    )}
                  />
                  {resolveTenantStatusLabel(tenant.status, STATUS_LABELS)}
                </span>
              </div>
              <span className="font-mono text-(length:--font-size-small) text-(--color-text-secondary)">
                {tenant.slug}
              </span>
              <span className="text-(length:--font-size-small) text-(--color-text-secondary)">
                {tenant.planName ?? MESSAGES.platform.tenantList.planUnknown}
              </span>
              <span className="text-(length:--font-size-small) text-(--color-text-secondary)">
                {formatPlatformDate(tenant.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
