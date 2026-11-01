// @arkesoft/admin — panelin TEK tRPC istemcisi (ROADMAP v0.0.7, T-008/S4,
// architect K3/K5). YALNIZCA kök alt yoldan (`@arkesoft/trpc`) import edilir
// — paketin SUNUCU alt yolu (resolver/port/handler kodu) tarayıcı grafiğine
// ASLA GİRMEZ (ADR-0009 §6; `eslint.config.mjs`'teki `no-restricted-imports`
// bunu lint zamanında da zorlar).
import { createTrpcClient } from '@arkesoft/trpc'
import type { TrpcClient } from '@arkesoft/trpc'

import { TRPC_URL } from '../app/panel-config.js'
import { transportAwareFetch } from './transport-aware-fetch.js'

/** Panelin tek tRPC istemcisi — taşıma reddini yakalayan `fetch` ponyfill'iyle. */
export const trpcClient: TrpcClient = createTrpcClient({
  url: TRPC_URL,
  fetch: transportAwareFetch,
})
