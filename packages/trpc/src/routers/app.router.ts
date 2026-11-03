// @arkesoft/trpc — kök router (ROADMAP v0.0.6, T-007/ST-2, architect K1)
//
// `AppRouter` tipi BURADA doğar (`typeof appRouter`) — ADR-0009 madde 1:
// router ve resolver'lar `packages/trpc` içinde yaşar, bu yüzden
// `createTrpcClient()` bu tipi `apps/api`'ye bağımlı olmadan tüketebilir
// (AC2+AC5+AC8 birlikte, ADR-0009 "AC2+AC5+AC8 birlikte nasıl sağlanıyor").

// GÜNCELLEME (ROADMAP v0.0.11, T-013/S8): `job` namespace'i EKLENDİ — mevcut
// üç satırın HİÇBİRİ silinmedi/değişmedi. Public API için bu bir EKLEMEdir
// (ROADMAP Sürüm Politikası §2: "MINOR = yalnızca ekleme").

import { router } from '../trpc.js'
import { jobRouter } from './job.router.js'
import { sessionRouter } from './session.router.js'
import { storefrontRouter } from './storefront.router.js'
import { tenantRouter } from './tenant.router.js'

export const appRouter = router({
  session: sessionRouter,
  tenant: tenantRouter,
  storefront: storefrontRouter,
  job: jobRouter,
})

/** İstemci factory'sinin (`client/create-trpc-client.ts`) tiplediği kök router tipi. */
export type AppRouter = typeof appRouter
