// @arkesoft/admin — kök rota (ROADMAP v0.0.7, T-008/S5, architect "Rota
// ağacı ve oturum durumu")
//
// Yalnızca `<Outlet/>` — sayfanın `<main>`/`<h1>`'i HER ZAMAN alt rotada
// (docs/ux/T-008.md "Sabit sayfa iskeleti, değişken içerik"). `QueryClient`
// context'i burada tanımlanır (`createRootRouteWithContext`) — `_app.tsx`'in
// `beforeLoad`'u `context.queryClient.query(...)` ile bu AYNI örneği
// kullanır (ayrı bir context YOK, architect bağlayıcı; DÜZELTME TURU 1
// `solid` L2/8e — bu yorum eski `ensureQueryData` ÇAĞRISINI anıyordu).
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

export interface RouterContext {
  readonly queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
})
