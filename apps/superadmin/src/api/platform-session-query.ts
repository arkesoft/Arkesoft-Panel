// @arkesoft/superadmin — `platform.session`'ın TEK TanStack Query tanımı
// (ROADMAP v0.0.20, T-021/S8, `apps/admin/src/api/session-query.ts`'in AYNI
// deseni). Tek anahtar `['platform', 'session']` — bu modülün DIŞINDA başka
// bir yerde elle yazılmaz.
//
// Veri çekme BURADA tanımlanır, RENDER etmez (sunum/veri ayrımı, CLAUDE.md
// §4) — dört durumun (normal/yükleniyor/boş/hata) render edilmesi
// `features/platform-session/platform-session-gate.ts` + route dosyalarının işi.
import type { PlatformSession } from '@arkesoft/trpc'
import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

import { trpcClient } from './trpc-client.js'

/** `platform.session`'ın TEK sorgu anahtarı. */
export const platformSessionQueryKey = ['platform', 'session'] as const

/** `useQuery(platformSessionQueryOptions)` ile tüketilecek hazır seçenekler. */
export const platformSessionQueryOptions = queryOptions({
  queryKey: platformSessionQueryKey,
  queryFn: (): Promise<PlatformSession> => trpcClient.platform.session.query(),
})

/**
 * `platform.session`'ı invalidate eder — 2FA kurulumu tamamlandığında
 * (`TwoFactorSetupWizard`'ın `onVerified` tetikleyicisi) aktif gözlemciler
 * HEMEN yeniden çeker (`apps/admin`'in `invalidateSessionIdentity` ile AYNI
 * desen).
 */
export function invalidatePlatformSession(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: platformSessionQueryKey })
}
