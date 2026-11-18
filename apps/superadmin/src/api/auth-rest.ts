// @arkesoft/superadmin — Better Auth'un delege REST uçlarına düz `fetch`
// istemcisi (ROADMAP v0.0.20, T-021/S8, `apps/admin/src/api/auth-rest.ts`'in
// AYNI deseni — cross-app import yasak olduğu için yerel kopya).
// `better-auth/client` EKLENMEZ — panel tek orijin topolojisinde servis
// edildiği için (ADR-0011/ADR-0023 §4) Better Auth'un kendi istemci
// SDK'sının orijin/çerez varsayımlarına ihtiyaç yok; `credentials:
// 'same-origin'` (`include` DEĞİL — çapraz orijin çerezi YOK).
//
// `signInWithEmail()` AYRIMLI BİRLEŞİM döner — 2FA AÇIK bir hesapta
// `sign-in/email` **200** döner VE gövdede `{twoFactorRedirect:true,
// twoFactorMethods:[...]}` taşır (`apps/admin`'in ölçtüğü aynı davranış,
// T-016/S10).
import { z } from 'zod'

import { normalizePanelError } from '../errors/normalize-panel-error.js'
import type { PanelError } from '../errors/panel-error.js'
import { AUTH_SIGN_IN_EMAIL_PATH, AUTH_SIGN_OUT_PATH } from '../app/superadmin-config.js'
import { parseJsonSafely } from './http/parse-json-safely.js'

/** Ölçülen 2FA-redirect gövdesi (`apps/admin`'in T-016 ölçümüyle AYNI). */
const twoFactorRedirectBodySchema = z.object({ twoFactorRedirect: z.literal(true) })

export interface SignInWithEmailInput {
  readonly email: string
  readonly password: string
}

export type SignInResult =
  | { readonly kind: 'signed-in' }
  | { readonly kind: 'two-factor-required' }
  | { readonly kind: 'error'; readonly error: PanelError }

export type SignOutResult =
  { readonly kind: 'signed-out' } | { readonly kind: 'error'; readonly error: PanelError }

/** `POST /auth/sign-in/email` — düz `fetch`, tek orijin (`credentials: 'same-origin'`). */
export async function signInWithEmail(input: SignInWithEmailInput): Promise<SignInResult> {
  const response = await fetch(AUTH_SIGN_IN_EMAIL_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (response.ok) {
    const body = await parseJsonSafely(response)

    const twoFactorRedirect = twoFactorRedirectBodySchema.safeParse(body)
    if (twoFactorRedirect.success) {
      return { kind: 'two-factor-required' }
    }

    return { kind: 'signed-in' }
  }

  const body = await parseJsonSafely(response)
  return { kind: 'error', error: normalizePanelError(body) }
}

/** `POST /auth/sign-out` — düz `fetch`, tek orijin (`credentials: 'same-origin'`). */
export async function signOut(): Promise<SignOutResult> {
  const response = await fetch(AUTH_SIGN_OUT_PATH, {
    method: 'POST',
    credentials: 'same-origin',
  })

  if (response.ok) {
    return { kind: 'signed-out' }
  }

  const body = await parseJsonSafely(response)
  return { kind: 'error', error: normalizePanelError(body) }
}
