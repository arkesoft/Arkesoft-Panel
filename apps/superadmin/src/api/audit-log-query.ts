// @arkesoft/superadmin — `platform.auditLog`'un TEK TanStack Query tanımı
// (ROADMAP v0.0.20, T-021/S8). Tek anahtar `['platform', 'auditLog']`.
//
// Veri çekme BURADA tanımlanır, RENDER etmez — dört durumun render edilmesi
// `features/audit-log/AuditLogView.tsx`'in işi.
import type { PlatformAuditLogOutput } from '@arkesoft/trpc'
import { queryOptions } from '@tanstack/react-query'

import { trpcClient } from './trpc-client.js'

export const auditLogQueryKey = ['platform', 'auditLog'] as const

export const auditLogQueryOptions = queryOptions({
  queryKey: auditLogQueryKey,
  queryFn: (): Promise<PlatformAuditLogOutput> => trpcClient.platform.auditLog.query({}),
})
