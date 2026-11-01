// @arkesoft/admin — panelin TEK router örneği (ROADMAP v0.0.7, T-008/S5,
// architect "Rota ağacı ve oturum durumu")
//
// AC9(a) TUZAĞI (bağlayıcı, architect): TanStack Router'ın `defaultPendingMs`
// varsayılanı ~1000 ms — kısa gecikmelerde "yükleniyor" durumu HİÇ görünmez
// ve e2e testi flaky olur. AÇIKÇA düşük bir değer (0-100 ms aralığı) verilir;
// e2e'nin `page.route()` gecikmesi bunun BELİRGİN üstünde olacak.
//
// `defaultPendingComponent`/`defaultErrorComponent` BİLEREK tanımlanmadı —
// `_app.tsx` kendi `pendingComponent`/`errorComponent`'ini taşıyor (guard'ın
// kabuksuz LoadingState/ErrorState'i, headingLevel="h1"); `_auth.sign-in.tsx`
// ve `_app.index.tsx` kendi içeriklerini senkron render eder (ayrı bir
// router-seviyesi varsayılana ihtiyaç yok).
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
