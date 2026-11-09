// @arkesoft/admin — Better Auth'un 2FA uçlarına delege REST istemcisi
// (ROADMAP v0.0.15, T-016/S10, docs/ui/T-016-iki-faktorlu-dogrulama.md "Veri
// katmanı notları")
//
// `auth-rest.ts`'teki AYNI desen: `better-auth/client` EKLENMEZ (ADR-0011,
// tek orijin topolojisi), `credentials: 'same-origin'`, hata gövdesi
// `normalizePanelError`'a verilir (Better Auth'un KENDİ gövdesi — probe 4,
// `{code: z.string()}`, zarf c — `normalize-panel-error.ts`'in dosya başı
// yorumuna bkz.).
//
// ⚠⚠ TOTP sırrı/`otpauth://` URI/yedek kodlar bu dosyada ASLA loglanmaz
// (CLAUDE.md §4, `console.log` yasağı) — fonksiyonlar saf veri döner, yan
// etki olarak konsola/loga YAZMAZ.
//
// DÜZELTME TURU 2 (T-016/M-6 — bağlayıcı, `solid` bulgusu): üç gövde
// ARTIK elle `typeof`/`as Record<string, unknown>` guard'ı DEĞİL, Zod
// `safeParse` ile ayrıştırılıyor (CLAUDE.md §2/§4: dış dünyadan gelen HER
// veri Zod ile parse edilir; `as` yalnızca runtime doğrulamasından HEMEN
// SONRA kabul edilir — bu dosyadaki ESKİ `as Record<string, unknown>`
// hiçbir doğrulamadan SONRA değildi, doğrulamanın KENDİSİ idi). Kardeş
// `auth-rest.ts` AYNI Task'ta zaten Zod kullanıyordu — bu değişiklik iki
// dosyayı TUTARLI hâle getirir.
import { z } from 'zod'

import { normalizePanelError } from '../errors/normalize-panel-error.js'
import type { PanelError } from '../errors/panel-error.js'
import {
  AUTH_TWO_FACTOR_DISABLE_PATH,
  AUTH_TWO_FACTOR_ENABLE_PATH,
  AUTH_TWO_FACTOR_GENERATE_BACKUP_CODES_PATH,
  AUTH_TWO_FACTOR_GET_TOTP_URI_PATH,
  AUTH_TWO_FACTOR_VERIFY_BACKUP_CODE_PATH,
  AUTH_TWO_FACTOR_VERIFY_TOTP_PATH,
} from '../app/panel-config.js'
import { parseJsonSafely } from './http/parse-json-safely.js'

/**
 * `Retry-After` başlığını saniye olarak ayrıştırır — yoksa/sayı DEĞİLSE
 * `null` (ux'in şartı: "{dakika} sunucunun Retry-After başlığından
 * hesaplanır, sabit '15' gömülmez" — panel sahip OLMADIĞI bir süreyi
 * UYDURMAZ).
 */
function parseRetryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get('Retry-After')
  if (raw === null) {
    return null
  }
  const parsed = Number.parseInt(raw, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export interface TwoFactorErrorResult {
  readonly kind: 'error'
  readonly error: PanelError
  /** Yalnızca `error.code === 'ACCOUNT_TEMPORARILY_LOCKED'` için anlamlı — aksi hâlde `null`. */
  readonly retryAfterSeconds: number | null
}

async function toErrorResult(response: Response): Promise<TwoFactorErrorResult> {
  const body = await parseJsonSafely(response)
  return {
    kind: 'error',
    error: normalizePanelError(body),
    retryAfterSeconds: parseRetryAfterSeconds(response),
  }
}

export interface EnableTwoFactorSuccess {
  readonly kind: 'enabled'
  readonly totpURI: string
  readonly backupCodes: readonly string[]
}

export type EnableTwoFactorResult = EnableTwoFactorSuccess | TwoFactorErrorResult

const enableTwoFactorBodySchema = z.object({
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})

/** `POST /auth/two-factor/enable` — AC11: bu çağrı yalnızca BİR KEZ yapılmalı (sihirbazın state makinesi, `TwoFactorSetupWizard`/kontrolcüsü, sorumlu). İkinci çağrı sırrı yeniden üretir. */
export async function enableTwoFactor(password: string): Promise<EnableTwoFactorResult> {
  const response = await fetch(AUTH_TWO_FACTOR_ENABLE_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password, method: 'totp' }),
  })

  if (!response.ok) {
    return toErrorResult(response)
  }

  const body = enableTwoFactorBodySchema.safeParse(await parseJsonSafely(response))
  if (!body.success) {
    return { kind: 'error', error: { kind: 'unknown', requestId: null }, retryAfterSeconds: null }
  }
  return { kind: 'enabled', totpURI: body.data.totpURI, backupCodes: body.data.backupCodes }
}

export interface GetTotpUriSuccess {
  readonly kind: 'retrieved'
  readonly totpURI: string
}

export type GetTotpUriResult = GetTotpUriSuccess | TwoFactorErrorResult

const getTotpUriBodySchema = z.object({ totpURI: z.string() })

/** `POST /auth/two-factor/get-totp-uri` — AC11: kurulum sırasında manuel anahtarın TEKRAR gösterimi için (`enable` DEĞİL). Yedek kod DÖNDÜRMEZ. */
export async function getTotpUri(password: string): Promise<GetTotpUriResult> {
  const response = await fetch(AUTH_TWO_FACTOR_GET_TOTP_URI_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (!response.ok) {
    return toErrorResult(response)
  }

  const body = getTotpUriBodySchema.safeParse(await parseJsonSafely(response))
  if (!body.success) {
    return { kind: 'error', error: { kind: 'unknown', requestId: null }, retryAfterSeconds: null }
  }
  return { kind: 'retrieved', totpURI: body.data.totpURI }
}

export interface VerifyTwoFactorSuccess {
  readonly kind: 'verified'
}

export type VerifyTwoFactorResult = VerifyTwoFactorSuccess | TwoFactorErrorResult

/**
 * `POST /auth/two-factor/verify-totp` — HEM kurulum onayı (oturum çerezi ile)
 * HEM giriş sırasında kod doğrulama (`two_factor` challenge çerezi ile) için
 * AYNI uç; ayrım sunucu tarafında (hangi çerez mevcut) yapılır, bu fonksiyon
 * ikisi için de kullanılır (docs/ui "Giriş sırasında kod girme" P5 + kurulum
 * P3).
 *
 * AC11 — başarı DALI bu fonksiyonun İÇİNDE `session.me` invalidation
 * YAPMAZ: veri çekme/mutasyon yan etkisi çağırana (container bileşen) aittir
 * (sunum/veri ayrımı, CLAUDE.md §9) — bu dosya `packages/trpc`'ye bağımlı
 * DEĞİL ve olmamalı.
 */
export async function verifyTotp(code: string): Promise<VerifyTwoFactorResult> {
  const response = await fetch(AUTH_TWO_FACTOR_VERIFY_TOTP_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  if (!response.ok) {
    return toErrorResult(response)
  }
  return { kind: 'verified' }
}

/** `POST /auth/two-factor/verify-backup-code` — P6 (yedek kod ile giriş). */
export async function verifyBackupCode(code: string): Promise<VerifyTwoFactorResult> {
  const response = await fetch(AUTH_TWO_FACTOR_VERIFY_BACKUP_CODE_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  if (!response.ok) {
    return toErrorResult(response)
  }
  return { kind: 'verified' }
}

export interface DisableTwoFactorSuccess {
  readonly kind: 'disabled'
}

export type DisableTwoFactorResult = DisableTwoFactorSuccess | TwoFactorErrorResult

/** `POST /auth/two-factor/disable` — step-up (`sensitiveSessionMiddleware`, şifre zorunlu). Başarı YENİ oturum kurar, eskisini siler (AC11 — invalidation çağırana aittir). */
export async function disableTwoFactor(password: string): Promise<DisableTwoFactorResult> {
  const response = await fetch(AUTH_TWO_FACTOR_DISABLE_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (!response.ok) {
    return toErrorResult(response)
  }
  return { kind: 'disabled' }
}

export interface GenerateBackupCodesSuccess {
  readonly kind: 'generated'
  readonly backupCodes: readonly string[]
}

export type GenerateBackupCodesResult = GenerateBackupCodesSuccess | TwoFactorErrorResult

const generateBackupCodesBodySchema = z.object({ backupCodes: z.array(z.string()) })

/** `POST /auth/two-factor/generate-backup-codes` — P7 (yedek kodları yenile). Eski set geçersiz kabul edilir (DOĞRULANAMADI — ux'in kendi notu). */
export async function generateBackupCodes(password: string): Promise<GenerateBackupCodesResult> {
  const response = await fetch(AUTH_TWO_FACTOR_GENERATE_BACKUP_CODES_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (!response.ok) {
    return toErrorResult(response)
  }

  const body = generateBackupCodesBodySchema.safeParse(await parseJsonSafely(response))
  if (!body.success) {
    return { kind: 'error', error: { kind: 'unknown', requestId: null }, retryAfterSeconds: null }
  }
  return { kind: 'generated', backupCodes: body.data.backupCodes }
}
