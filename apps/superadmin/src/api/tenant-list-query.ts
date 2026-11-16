// @arkesoft/superadmin — `platform.tenantList`'in TEK TanStack Query tanımı
// (ROADMAP v0.0.20, T-021/S8). Tek anahtar `['platform', 'tenantList']`.
//
// Veri çekme BURADA tanımlanır, RENDER etmez — dört durumun render edilmesi
// `features/tenants/TenantListView.tsx`'in işi.
import type { PlatformTenantListOutput } from '@arkesoft/trpc'
import { queryOptions } from '@tanstack/react-query'

import { trpcClient } from './trpc-client.js'

export const tenantListQueryKey = ['platform', 'tenantList'] as const

export const tenantListQueryOptions = queryOptions({
  queryKey: tenantListQueryKey,
  queryFn: (): Promise<PlatformTenantListOutput> => trpcClient.platform.tenantList.query({}),
})
