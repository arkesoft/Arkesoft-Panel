// @arkesoft/superadmin — TwoFactorSetupController testleri (ROADMAP v0.0.20, T-021/S8)
import { describe, expect, it, vi } from 'vitest'

import type { PanelError } from '../../../errors/panel-error.js'
import {
  TwoFactorSetupController,
  type TwoFactorSetupState,
} from '../two-factor-setup-controller.js'

function mapError(error: PanelError): string {
  return error.kind === 'known' ? error.code : 'unknown'
}

/** `@typescript-eslint/require-await` fail-closed: testlerin sahte REST yanıtları `Promise.resolve` ile sarılır, `async` KULLANILMAZ. */
function noop(_state: TwoFactorSetupState): void {
  // Test yardımcı sarmalayıcı — onChange'in kendisi burada gözlenmiyor.
}

describe('TwoFactorSetupController', () => {
  it('"enable" başarılı → step "totp"a geçer, backupCodes YAKALANIR', async () => {
    const onVerified = vi.fn()
    const controller = new TwoFactorSetupController(
      {
        enable: () =>
          Promise.resolve({
            kind: 'enabled',
            totpURI: 'otpauth://totp/x',
            backupCodes: ['a', 'b'],
          }),
        getTotpUri: () => Promise.resolve({ kind: 'retrieved', totpURI: 'otpauth://totp/x' }),
        verifyTotp: () => Promise.resolve({ kind: 'verified' }),
        onVerified,
      },
      mapError,
      noop,
    )

    await controller.submitPassword('sifre123')

    expect(controller.getState()).toEqual({
      step: 'totp',
      totpURI: 'otpauth://totp/x',
      backupCodes: ['a', 'b'],
      isSubmitting: false,
      errorMessage: null,
    })
  })

  it('"enable" hata dönerse step "password"da KALIR ve errorMessage SET edilir', async () => {
    const controller = new TwoFactorSetupController(
      {
        enable: () =>
          Promise.resolve({
            kind: 'error',
            error: { kind: 'known', code: 'INVALID_PASSWORD', requestId: null },
            retryAfterSeconds: null,
          }),
        getTotpUri: () => Promise.resolve({ kind: 'retrieved', totpURI: 'x' }),
        verifyTotp: () => Promise.resolve({ kind: 'verified' }),
        onVerified: vi.fn(),
      },
      mapError,
      noop,
    )

    await controller.submitPassword('yanlis')

    expect(controller.getState()).toEqual({
      step: 'password',
      isSubmitting: false,
      errorMessage: 'INVALID_PASSWORD',
    })
  })

  it('"enable" İKİNCİ KEZ çağrılmaz — geri dönüp tekrar şifre gönderince "get-totp-uri" seçilir', async () => {
    const enable = vi.fn().mockResolvedValue({
      kind: 'enabled',
      totpURI: 'x',
      backupCodes: ['a'],
    })
    const getTotpUri = vi.fn().mockResolvedValue({ kind: 'retrieved', totpURI: 'x' })
    const controller = new TwoFactorSetupController(
      {
        enable,
        getTotpUri,
        verifyTotp: () => Promise.resolve({ kind: 'verified' }),
        onVerified: vi.fn(),
      },
      mapError,
      noop,
    )

    await controller.submitPassword('sifre123')
    controller.goBackToPasswordStep()
    await controller.submitPassword('sifre123')

    expect(enable).toHaveBeenCalledTimes(1)
    expect(getTotpUri).toHaveBeenCalledTimes(1)
  })

  it('"verify-totp" başarılı → onVerified BİR KEZ çağrılır, backupCodes varsa step "backup-codes"', async () => {
    const onVerified = vi.fn()
    const controller = new TwoFactorSetupController(
      {
        enable: () => Promise.resolve({ kind: 'enabled', totpURI: 'x', backupCodes: ['a', 'b'] }),
        getTotpUri: () => Promise.resolve({ kind: 'retrieved', totpURI: 'x' }),
        verifyTotp: () => Promise.resolve({ kind: 'verified' }),
        onVerified,
      },
      mapError,
      noop,
    )

    await controller.submitPassword('sifre123')
    await controller.submitCode('123456')

    expect(onVerified).toHaveBeenCalledTimes(1)
    expect(controller.getState()).toEqual({ step: 'backup-codes', backupCodes: ['a', 'b'] })
  })

  it('"verify-totp" hata dönerse onVerified ÇAĞRILMAZ, step "totp"da kalır', async () => {
    const onVerified = vi.fn()
    const controller = new TwoFactorSetupController(
      {
        enable: () => Promise.resolve({ kind: 'enabled', totpURI: 'x', backupCodes: ['a'] }),
        getTotpUri: () => Promise.resolve({ kind: 'retrieved', totpURI: 'x' }),
        verifyTotp: () =>
          Promise.resolve({
            kind: 'error',
            error: { kind: 'known', code: 'INVALID_CODE', requestId: null },
            retryAfterSeconds: null,
          }),
        onVerified,
      },
      mapError,
      noop,
    )

    await controller.submitPassword('sifre123')
    await controller.submitCode('000000')

    expect(onVerified).not.toHaveBeenCalled()
    const state = controller.getState()
    expect(state.step).toBe('totp')
  })
})
