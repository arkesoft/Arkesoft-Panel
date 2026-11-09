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
//
// ⚠⚠ DÜZELTME (ROADMAP v0.0.15, T-016/S10, AC11 madde 3 — BAĞLAYICI):
// ESKİDEN `response.ok` olan HER yanıt `'signed-in'` SAYILIYORDU. Canlı
// ölçüm (docs/ux/T-016, S4): 2FA AÇIK bir hesapta `sign-in/email` **200**
// döner VE gövdede `{twoFactorRedirect:true, twoFactorMethods:[...]}`
// taşır — 401 BEKLEYEN bir kontrol YANLIŞTI, kullanıcı 2FA'sız doğrudan
// panele düşüyordu. Artık HTTP durumu `ok` OLSA BİLE gövde Zod ile
// ayrıştırılıp `twoFactorRedirect` alanına göre dallanıyor.
import { z } from 'zod'

import { normalizePanelError } from '../errors/normalize-panel-error.js'
import type { PanelError } from '../errors/panel-error.js'
import { AUTH_SIGN_IN_EMAIL_PATH, AUTH_SIGN_OUT_PATH } from '../app/panel-config.js'
import { parseJsonSafely } from './http/parse-json-safely.js'

/** Ölçülen 2FA-redirect gövdesi (docs/ux/T-016 "Canlı HTTP ölçümü"). */
const twoFactorRedirectBodySchema = z.object({ twoFactorRedirect: z.literal(true) })

/**
 * Ölçülen 2FA-KAPALI başarı gövdesi — `user.twoFactorEnabled` alanı sunucunun
 * HAM echo'sudur. DÜZELTME TURU 2 (T-016/M-4): bu alanın eski tüketicisi
 * (`two-factor-status-store.ts`'in sekme-başına `sessionStorage` deposu)
 * SİLİNDİ — tek doğruluk kaynağı artık `session.me` (`twoFactorEnabled:
 * boolean`, zorunlu). Alan burada KALIYOR (sunucudan gelen gerçek veri,
 * döküm/uydurma değil) ama bugün `_auth.sign-in.tsx` TARAFINDAN
 * OKUNMUYOR — `auth-rest.ts` saf bir ayrıştırıcı olarak kalır (sunum/veri
 * ayrımı), bir tüketici doğarsa (ör. "giriş anında 2FA durumunu
 * optimistic göster") hazır bekler.
 */
const signedInUserTwoFactorSchema = z.object({
  user: z.object({ twoFactorEnabled: z.boolean() }),
})

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
  | { readonly kind: 'signed-in'; readonly twoFactorEnabled: boolean | null }
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

    const signedInUser = signedInUserTwoFactorSchema.safeParse(body)
    return {
      kind: 'signed-in',
      twoFactorEnabled: signedInUser.success ? signedInUser.data.user.twoFactorEnabled : null,
    }
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
