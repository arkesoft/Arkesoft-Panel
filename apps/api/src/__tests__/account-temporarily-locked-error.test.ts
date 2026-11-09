// @arkesoft/api — AccountTemporarilyLockedError birim testi (ROADMAP v0.0.15,
// T-016/S4)
//
// `AuthProviderFailedError — birim` testinin (`auth-flow.test.ts`) AYNI
// deseni: bu sınıf Better Auth'un KENDİ ürettiği 429 yanıtının dönüştüğü yer
// DEĞİLDİR (dosya başı yorumu, `account-temporarily-locked.error.ts`) —
// architect'in "HATA SINIFLARI" sözleşmesinin bağlayıcı bir parçası olarak
// SINIFIN KENDİSİNİN doğru alanları taşıdığını doğrular.

import { describe, expect, it } from 'vitest'

import { AccountTemporarilyLockedError } from '../errors/domain/account-temporarily-locked.error.js'
import { ACCOUNT_LOCKOUT_DURATION_SECONDS } from '../auth/two-factor/account-lockout.constants.js'

describe('AccountTemporarilyLockedError — birim', () => {
  it('code/httpStatus/userMessageKey/isRetryable/httpHeaders TAM beklenen değerleri taşır', () => {
    const error = new AccountTemporarilyLockedError(ACCOUNT_LOCKOUT_DURATION_SECONDS)

    expect(error.code).toBe('ACCOUNT_TEMPORARILY_LOCKED')
    expect(error.httpStatus).toBe(429)
    expect(error.userMessageKey).toBe('errors.auth.accountTemporarilyLocked')
    expect(error.isRetryable).toBe(false)
    expect(error.httpHeaders).toEqual({ 'Retry-After': '900' })
  })

  it('context PII/sır TAŞIMAZ — yalnızca retryAfterSeconds (sayı)', () => {
    const error = new AccountTemporarilyLockedError(42)

    expect(error.context).toEqual({ retryAfterSeconds: 42 })
    // Mekanik kanıt: context'in JSON'u ne e-posta ne kullanıcı kimliği/TCKN
    // deseni taşır.
    expect(JSON.stringify(error.context)).toBe('{"retryAfterSeconds":42}')
  })

  it('AppError hiyerarşisinden türer (instanceof zinciri)', async () => {
    const { AppError } = await import('@arkesoft/errors')
    const error = new AccountTemporarilyLockedError(900)
    expect(error).toBeInstanceOf(AppError)
  })
})
