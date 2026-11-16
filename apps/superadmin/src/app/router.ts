// @arkesoft/superadmin — panelin TEK router örneği (ROADMAP v0.0.20,
// T-021/S8, `apps/admin/src/app/router.ts`'in BİREBİR deseni)
//
// `defaultPendingMs` AÇIKÇA düşük verilir — TanStack Router'ın ~1000ms
// varsayılanı kısa gecikmelerde "yükleniyor" durumunu HİÇ göstermez.
//
// `defaultPendingComponent`/`defaultErrorComponent` BİLEREK tanımlanmadı —
// her korumalı/yarı-korumalı rota (`_app.tsx`, `_auth.giris.tsx`,
// `iki-adimli-dogrulama.tsx`) kendi `pendingComponent`/`errorComponent`'ini
// (veya senkron içerik dallanmasını) taşır.
import { createRouter } from '@tanstack/react-router'

import { queryClient } from './query-client.js'
import { routeTree } from '../routeTree.gen.js'
import type { RouterContext } from '../routes/__root.js'

export const router = createRouter({
  routeTree,
  context: { queryClient } satisfies RouterContext,
  defaultPendingMs: 50,
  defaultPendingMinMs: 0,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
