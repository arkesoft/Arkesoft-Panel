// @arkesoft/admin — kayıt akışının veri katmanı: `registration.*` tRPC
// çağrıları + Better Auth'un delege REST uçları (ROADMAP v0.1.0, T-019/S10,
// architect K3/K5, docs/ui/T-019-kayit-ve-kiraci-olusturma.md)
//
// Veri çekme/yazma BURADA tanımlanır, RENDER ETMEZ (sunum/veri ayrımı,
// CLAUDE.md §4/§9) — dört durumun render edilmesi `features/registration/**`
// VE `routes/**`'in işi.
//
// ⚠ Bu alt görevin "DOKUNACAĞIN DOSYALAR" listesi TEK yeni `api/**` dosyası
// olarak BU dosyayı veriyor — `auth-rest.ts`'in BİREBİR kardeşi olacak iki
// yeni Better Auth REST çağrısı (`signUpWithEmail`/`resendVerificationEmail`)
// normalde `auth-rest.ts`'e giderdi (o dosya `signInWithEmail`/`signOut`
// taşıyor) ama o dosya listede YOK — ikisi BİLEREK burada, `auth-rest.ts`'in
// AYNI deseniyle (düz `fetch`, `credentials: 'same-origin'`,
// `parseJsonSafely` + `normalizePanelError`).
//
// `/auth/sign-up/email` ve `/auth/send-verification-email` — Better Auth'un
// `AUTH_DELEGATED_PATHS`/`AUTH_EXEMPT_PATHS`'inde (apps/api, ÖLÇÜLDÜ) ZATEN
// kayıtlı, kimlik GEREKTİRMEZ. Yol literalleri `panel-config.ts`'teki
// `AUTH_SIGN_IN_EMAIL_PATH` deseninin AYNISI ama O DOSYA bu alt görevin
// dosya listesinde YOK (dokunulmadı) — bu yüzden iki yol burada YEREL
// sabit olarak tutuluyor (RİSKLER'e taşındı: ileride `panel-config.ts`'e
// terfi edebilir, `AUTH_SIGN_IN_EMAIL_PATH`'in yanına).
import { queryOptions } from '@tanstack/react-query'
import type {
  CreateTenantInput,
  CreateTenantResult,
  OnboardingChecklist,
  SlugAvailabilityOutcome,
} from '@arkesoft/trpc'

import { normalizePanelError } from '../errors/normalize-panel-error.js'
import type { PanelError } from '../errors/panel-error.js'
import { parseJsonSafely } from './http/parse-json-safely.js'
import { trpcClient } from './trpc-client.js'

// ---------------------------------------------------------------------------
// `registration.*` tRPC çağrıları
// ---------------------------------------------------------------------------

export type CheckSlugAvailabilityCallResult =
  | { readonly kind: 'ok'; readonly outcome: SlugAvailabilityOutcome }
  | { readonly kind: 'error'; readonly error: PanelError }

/** `registration.checkSlugAvailability` — `trpcClient`'in KENDİSİ FIRLATIRSA (ağ/bilinmeyen) `normalizePanelError` fail-closed `kind:'unknown'`'a düşer. */
export async function checkSlugAvailability(
  slug: string,
): Promise<CheckSlugAvailabilityCallResult> {
  try {
    const output = await trpcClient.registration.checkSlugAvailability.query({ slug })
    return { kind: 'ok', outcome: output.outcome }
  } catch (caughtError) {
    return { kind: 'error', error: normalizePanelError(caughtError) }
  }
}

export type CreateTenantCallResult =
  | { readonly kind: 'ok'; readonly result: CreateTenantResult }
  | { readonly kind: 'error'; readonly error: PanelError }

/** `registration.createTenant` — AYNI fail-closed desen. */
export async function createTenant(input: CreateTenantInput): Promise<CreateTenantCallResult> {
  try {
    const result = await trpcClient.registration.createTenant.mutate(input)
    return { kind: 'ok', result }
  } catch (caughtError) {
    return { kind: 'error', error: normalizePanelError(caughtError) }
  }
}

/** `registration.onboardingChecklist`'in TEK sorgu anahtarı — `slug` kapsamlı (her slug KENDİ cache girdisi). */
export function onboardingChecklistQueryKey(
  slug: string,
): readonly ['registration', 'onboardingChecklist', string] {
  return ['registration', 'onboardingChecklist', slug] as const
}

function buildOnboardingChecklistQueryOptions(slug: string) {
  return queryOptions({
    queryKey: onboardingChecklistQueryKey(slug),
    queryFn: (): Promise<OnboardingChecklist> =>
      trpcClient.registration.onboardingChecklist.query({ slug }),
  })
}

/** `@typescript-eslint/explicit-module-boundary-types` için dışa açılan isim — `queryOptions`'ın karmaşık jenerik dönüş tipini ELLE tekrar yazmaz. */
export type OnboardingChecklistQueryOptions = ReturnType<
  typeof buildOnboardingChecklistQueryOptions
>

/** `useQuery(onboardingChecklistQueryOptions(slug))` ile tüketilecek hazır seçenekler (`session-query.ts`'in AYNI deseni). */
export function onboardingChecklistQueryOptions(slug: string): OnboardingChecklistQueryOptions {
  return buildOnboardingChecklistQueryOptions(slug)
}

// ---------------------------------------------------------------------------
// Better Auth REST uçları (`auth-rest.ts`'in AYNI deseni — dosya başı yorumu)
// ---------------------------------------------------------------------------

const AUTH_SIGN_UP_EMAIL_PATH = '/auth/sign-up/email'
const AUTH_SEND_VERIFICATION_EMAIL_PATH = '/auth/send-verification-email'

/**
 * Better Auth'un `sign-up/email` gövdesi `name: z.string()` (ZORUNLU, kaynak
 * kodu OKUNARAK ölçüldü: `better-auth@1.7.14`'ün `sign-up.mjs:16`) ister —
 * ux/ui'nin P1 formu bir "ad" alanı TAŞIMIYOR (ux'in kendi tasarımı: e-posta/
 * şifre/şifre-tekrar, ÜÇ alan). Bu BİR UI PLANINDAN SAPMA DEĞİL (plan bir ad
 * alanı istemedi) ama server'ın İSTEDİĞİ bir alan için ÖLÇÜLMÜŞ bir boşluk —
 * e-postanın `@` ÖNCESİ kısmı `name` olarak gönderilir (kullanıcıya hiçbir
 * yerde GÖSTERİLMEZ/SORULMAZ; `User.name` bugün panelin hiçbir ekranında
 * OKUNMUYOR). RİSKLER'e taşındı.
 */
function deriveFallbackNameFromEmail(email: string): string {
  const localPart = email.split('@')[0]
  return localPart !== undefined && localPart.length > 0 ? localPart : email
}

export type SignUpWithEmailCallResult =
  { readonly kind: 'signed-up' } | { readonly kind: 'error'; readonly error: PanelError }

export interface SignUpWithEmailInput {
  readonly email: string
  readonly password: string
}

/** `POST /auth/sign-up/email` — düz `fetch`, tek orijin (`auth-rest.ts`'in AYNI kurulumu). */
export async function signUpWithEmail(
  input: SignUpWithEmailInput,
): Promise<SignUpWithEmailCallResult> {
  const response = await fetch(AUTH_SIGN_UP_EMAIL_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: deriveFallbackNameFromEmail(input.email),
      email: input.email,
      password: input.password,
    }),
  })

  if (response.ok) {
    return { kind: 'signed-up' }
  }

  const body = await parseJsonSafely(response)
  return { kind: 'error', error: normalizePanelError(body) }
}

export type ResendVerificationEmailCallResult =
  { readonly kind: 'sent' } | { readonly kind: 'error'; readonly error: PanelError }

/** `POST /auth/send-verification-email` — düz `fetch`, tek orijin. */
export async function resendVerificationEmail(
  email: string,
): Promise<ResendVerificationEmailCallResult> {
  const response = await fetch(AUTH_SEND_VERIFICATION_EMAIL_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })

  if (response.ok) {
    return { kind: 'sent' }
  }

  const body = await parseJsonSafely(response)
  return { kind: 'error', error: normalizePanelError(body) }
}
