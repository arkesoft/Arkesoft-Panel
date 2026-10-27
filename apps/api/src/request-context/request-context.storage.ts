// @arkesoft/api — ALS sözleşmesi: depo (ROADMAP v0.0.4, T-002/ST-4, architect K-A5)
//
// MODÜL SEVİYESİ TEK örnek — Nest provider DEĞİL. Böylece `apps/api/src/tenancy/
// resolve-host.ts` gibi SAF fonksiyonlar (ST-5) ve `src/validation/zod-validation.pipe.ts`
// gibi Nest DI'siz kurulan pipe'lar DI konteynerine ihtiyaç duymadan depoyu okuyabilir.
// Modül seviyesinde `const` olduğu için Node'un modül önbelleği (require/import cache)
// tek örnek garantisini sağlar — birden fazla `new AsyncLocalStorage()` çağrısı YOK.

import { AsyncLocalStorage } from 'node:async_hooks'

import type { RequestContext } from './request-context.types.js'

export const requestContextStorage = new AsyncLocalStorage<RequestContext>()
