// @arkesoft/superadmin — kök rota (ROADMAP v0.0.20, T-021/S8,
// `apps/admin/src/routes/__root.tsx`'in BİREBİR deseni)
//
// Yalnızca `<Outlet/>` — sayfanın `<main>`/`<h1>`'i HER ZAMAN alt rotada.
// `QueryClient` context'i burada tanımlanır (`createRootRouteWithContext`) —
// `_app.tsx`/`_auth.giris.tsx`/`iki-adimli-dogrulama.tsx`'in `beforeLoad`'u
// `context.queryClient.query(...)` ile bu AYNI örneği kullanır.
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

export interface RouterContext {
  readonly queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
})
