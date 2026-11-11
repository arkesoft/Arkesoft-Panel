// @arkesoft/admin — `session.list`'in TEK TanStack Query tanımı (ROADMAP
// v0.0.15.1, T-017/S11). `session-query.ts`'teki (TEKİL, `session.me`)
// AYNI deseni — dosya adı BİR HARF uzaklıkta ama FARKLI bir sorgu (po'nun
// uyarısı, bkz. `sessions-rest.ts`'in dosya başı yorumu).
//
// Veri çekme BURADA tanımlanır, RENDER etmez (sunum/veri ayrımı, CLAUDE.md
// §4/§9) — dört durumun (normal/yükleniyor/boş/hata) render edilmesi
// `ActiveSessionsCard.tsx`'in işi.
//
// `session.me`'den BAĞIMSIZ anahtar (`['session', 'list']`, `['session',
// 'me']` DEĞİL) — ux'in "izolasyon" şartı: bu kart 2FA kartından BAĞIMSIZ
// kendi `useQuery`'sini tutar, birbirinin hatasını/yükleniyor durumunu
// ETKİLEMEZ.
import type { ActiveSessionWire } from '@arkesoft/trpc'
import { queryOptions } from '@tanstack/react-query'

import { trpcClient } from './trpc-client.js'

/** `session.list`'in TEK sorgu anahtarı. */
export const activeSessionsQueryKey = ['session', 'list'] as const

/** `useQuery(activeSessionsQueryOptions)` ile tüketilecek hazır seçenekler. */
export const activeSessionsQueryOptions = queryOptions({
  queryKey: activeSessionsQueryKey,
  queryFn: (): Promise<readonly ActiveSessionWire[]> => trpcClient.session.list.query(),
})
