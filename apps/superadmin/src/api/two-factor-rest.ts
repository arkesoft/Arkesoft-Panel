// @arkesoft/superadmin — Better Auth'un 2FA uçlarına delege REST istemcisi
// (ROADMAP v0.0.20, T-021/S8, `apps/admin/src/api/two-factor-rest.ts`'in
// AYNI deseni — cross-app import yasak olduğu için yerel kopya. Yalnızca
// giriş sırasında doğrulama + kurulum sihirbazının ihtiyaç duyduğu DÖRT
// fonksiyon taşınır: `disable`/`generateBackupCodes` bu panelde YOK, bu
// panelin kendi "hesap güvenliği" yönetim ekranı bu sürümün kapsamında
// değil, docs/ui/T-021).
//
// `credentials: 'same-origin'`, hata gövdesi `normalizePanelError`'a
// verilir. TOTP sırrı/`otpauth://` URI/yedek kodlar bu dosyada ASLA
// loglanmaz (CLAUDE.md §4).
import { z } from 'zod'

import { normalizePanelError } from '../errors/normalize-panel-error.js'
import type { PanelError } from '../errors/panel-error.js'
import {
  AUTH_TWO_FACTOR_ENABLE_PATH,
  AUTH_TWO_FACTOR_GET_TOTP_URI_PATH,
  AUTH_TWO_FACTOR_VERIFY_BACKUP_CODE_PATH,
  AUTH_TWO_FACTOR_VERIFY_TOTP_PATH,
} from '../app/superadmin-config.js'
import { parseJsonSafely } from './http/parse-json-safely.js'

/**
 * `Retry-After` başlığını saniye olarak ayrıştırır — yoksa/sayı DEĞİLSE
 * `null` (panel sahip OLMADIĞI bir süreyi UYDURMAZ).
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

/** `POST /auth/two-factor/enable` — bu çağrı yalnızca BİR KEZ yapılmalı (`TwoFactorSetupController` sorumlu). İkinci çağrı sırrı yeniden üretir. */
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

/** `POST /auth/two-factor/get-totp-uri` — kurulum sırasında manuel anahtarın TEKRAR gösterimi için (`enable` DEĞİL). Yedek kod DÖNDÜRMEZ. */
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
 * `POST /auth/two-factor/verify-totp` — HEM kurulum onayı (oturum çerezi
 * ile) HEM giriş sırasında kod doğrulama (`two_factor` challenge çerezi
 * ile) için AYNI uç; ayrım sunucu tarafında yapılır.
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

/** `POST /auth/two-factor/verify-backup-code` — yedek kod ile giriş. */
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
