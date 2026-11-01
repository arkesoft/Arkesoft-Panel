// @arkesoft/admin — Better Auth'un delege REST uçlarına düz `fetch` istemcisi
// (ROADMAP v0.0.7, T-008/S4, architect K3/K5). `better-auth/client` EKLENMEZ
// — panel tek orijin topolojisinde servis edildiği için (ADR-0011) Better
// Auth'un kendi istemci SDK'sının orijin/çerez varsayımlarına ihtiyaç yok;
// `credentials: 'same-origin'` (`include` DEĞİL — çapraz orijin çerezi YOK).
//
// `signInWithEmail()` AYRIMLI BİRLEŞİM döner. "Tek üyeli" olan BAŞARI
// DALIDIR (`{kind:'signed-in'}`, v0.0.15 2FA `{kind:'two-factor-required'}`
// EKLEYECEK) — yönlendirme kararı (dashboard'a mı, 2FA ekranına mı) ÇAĞIRANDA
// verilir, "sign-in → doğrudan dashboard" bu fonksiyonun YAPISINA GÖMÜLMEZ.
// Hata dalında yanıt gövdesi `normalizePanelError`'a verilir — bu uçtaki
// hata şekli Better Auth'un KENDİ gövdesidir (probe 4, zarf c).
import { normalizePanelError } from '../errors/normalize-panel-error.js'
import type { PanelError } from '../errors/panel-error.js'
import { AUTH_SIGN_IN_EMAIL_PATH, AUTH_SIGN_OUT_PATH } from '../app/panel-config.js'

export interface SignInWithEmailInput {
  readonly email: string
  readonly password: string
}

/**
 * Bugün tek başarı üyesi (`signed-in`); v0.0.15 2FA `two-factor-required`
 * ekleyecek. Hata dalı `normalizePanelError`'ın ürettiği {@link PanelError}'ı
 * taşır — çağıran (S5, giriş formu) `resolveErrorMessage(error.code)` ile
 * Türkçe metne çevirir.
 */
export type SignInResult =
  { readonly kind: 'signed-in' } | { readonly kind: 'error'; readonly error: PanelError }

export type SignOutResult =
  { readonly kind: 'signed-out' } | { readonly kind: 'error'; readonly error: PanelError }

/** Yanıt gövdesini JSON olarak ayrıştırır; JSON DEĞİLSE (ör. HTML) `null` döner — fırlatmaz. */
async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/** `POST /auth/sign-in/email` — düz `fetch`, tek orijin (`credentials: 'same-origin'`). */
export async function signInWithEmail(input: SignInWithEmailInput): Promise<SignInResult> {
  const response = await fetch(AUTH_SIGN_IN_EMAIL_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (response.ok) {
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
