// @arkesoft/api — @CurrentUser() parametre dekoratörü (ROADMAP v0.0.5,
// T-006/S6, architect madde 4 HTTP eşdeğeri)
//
// `getTenantContext()`'in (`request-context.accessors.ts`, ST-5) AYNI
// fail-closed deseni — ALS'deki `auth` alanını okur, `kind !== 'authenticated'`
// ise FIRLATIR (`undefined`/uydurma bir kimlikle SESSİZCE devam ETMEZ).
// Normal akışta BU DAL hiçbir zaman tetiklenmez: `AuthGuard` zaten
// `authenticated` OLMAYAN her isteği handler'a ULAŞTIRMADAN önce engeller
// (401/403/500) — bu yüzden burası SAVUNMA katmanıdır (R4 telafisi deseniyle
// AYNI ruh), birincil zorlayıcı DEĞİL.

import { createParamDecorator } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'

import type { CurrentUserIdentity } from './auth-resolution.types.js'
import { UnauthenticatedError } from '../errors/domain/unauthenticated.error.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'

function resolveCurrentUser(): CurrentUserIdentity {
  const { auth } = getRequestContext()

  if (auth.kind !== 'authenticated') {
    throw new UnauthenticatedError()
  }

  return { userId: auth.userId, sessionId: auth.sessionId }
}

/** ALS'deki çözülmüş kimliği (`{userId, sessionId}`) handler parametresine enjekte eder. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, _context: ExecutionContext): CurrentUserIdentity => resolveCurrentUser(),
)
