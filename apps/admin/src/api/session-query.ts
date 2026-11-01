// @arkesoft/admin — session.me'nin TEK TanStack Query tanımı (ROADMAP v0.0.7,
// T-008/S4). Tek anahtar `['session', 'me']` — bu modülün DIŞINDA başka bir
// yerde elle yazılmaz (geçersiz kılma/invalidation tek bu anahtarı hedefler).
//
// Veri çekme BURADA tanımlanır, RENDER etmez (sunum/veri ayrımı, CLAUDE.md
// §4) — `useQuery(sessionMeQueryOptions)` çağrısı (DÜZELTME TURU 1 `solid`
// L2/8e: `sessionMeQueryOptions` bir `queryOptions(...)` NESNESİDİR, fonksiyon
// DEĞİL — bu yorum eski `sessionMeQueryOptions()` çağrı biçimini anıyordu)
// ve dört durumun (normal/yükleniyor/boş/hata) render edilmesi S5'in
// (`routes/**`) işi.
import type { SessionIdentity } from '@arkesoft/trpc'
import { queryOptions } from '@tanstack/react-query'

import { trpcClient } from './trpc-client.js'

/** `session.me`'nin TEK sorgu anahtarı. */
export const sessionMeQueryKey = ['session', 'me'] as const

/** `useQuery(sessionMeQueryOptions)` ile tüketilecek hazır seçenekler. */
export const sessionMeQueryOptions = queryOptions({
  queryKey: sessionMeQueryKey,
  queryFn: (): Promise<SessionIdentity> => trpcClient.session.me.query(),
})
