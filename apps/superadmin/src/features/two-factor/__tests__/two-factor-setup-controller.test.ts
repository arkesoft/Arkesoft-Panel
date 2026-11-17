// @arkesoft/superadmin — TwoFactorSetupController testleri (ROADMAP v0.0.20.1,
// T-022/S4, ADR-0024). Sözleşme DEĞİŞTİ (R-A5, bkz. `two-factor-setup-
// controller.ts`'in `resolveTotpUriAction` yorumu): `submitPassword` artık
// HER ZAMAN `get-totp-uri` ile BAŞLAR, `enable`'a düşüş YALNIZCA sunucu
// `TOTP_NOT_ENABLED` koduyla cevap verirse gerçekleşir. Bu dosyanın T-021
// sürümündeki testleri (ESKİ sözleşme — "ilk çağrı enable'dır") bu yüzden
// GEÇERSİZ hâle geldi ve yeniden yazıldı; bu bir "testi kriterine uydurma"
// DEĞİL — davranış sözleşmesinin BİLİNÇLİ değişiminin testlere yansımasıdır.
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

describe('TwoFactorSetupController — ADR-0024 Karar 2/3 (get-totp-uri ÖNCE)', () => {
  it('get-totp-uri BAŞARILI → step "totp"a geçer, backupCodes NULL, enable ÇAĞRILMAZ', async () => {
    const enable = vi.fn()
    const getTotpUri = vi.fn().mockResolvedValue({ kind: 'retrieved', totpURI: 'otpauth://totp/x' })
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri, verifyTotp: vi.fn(), onVerified: vi.fn() },
      mapError,
      noop,
    )

    await controller.submitPassword('sifre123')

    expect(enable).not.toHaveBeenCalled()
    expect(controller.getState()).toEqual({
      step: 'totp',
      totpURI: 'otpauth://totp/x',
      backupCodes: null,
      isSubmitting: false,
      errorMessage: null,
    })
  })

  it('YENİ VAKA 1 — get-totp-uri "TOTP_NOT_ENABLED" ile düşerse enable ÇAĞRILIR', async () => {
    const enable = vi.fn().mockResolvedValue({
      kind: 'enabled',
      totpURI: 'otpauth://totp/x',
      backupCodes: ['a', 'b'],
    })
    const getTotpUri = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'TOTP_NOT_ENABLED', requestId: null },
      retryAfterSeconds: null,
    })
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri, verifyTotp: vi.fn(), onVerified: vi.fn() },
      mapError,
      noop,
    )

    await controller.submitPassword('sifre123')

    expect(getTotpUri).toHaveBeenCalledTimes(1)
    expect(enable).toHaveBeenCalledTimes(1)
    expect(controller.getState()).toEqual({
      step: 'totp',
      totpURI: 'otpauth://totp/x',
      backupCodes: ['a', 'b'],
      isSubmitting: false,
      errorMessage: null,
    })
  })

  it('YENİ VAKA 2 — "INVALID_PASSWORD" enable\'a DÜŞÜRMEZ (enable SIFIR çağrı)', async () => {
    const enable = vi.fn()
    const getTotpUri = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'INVALID_PASSWORD', requestId: null },
      retryAfterSeconds: null,
    })
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri, verifyTotp: vi.fn(), onVerified: vi.fn() },
      mapError,
      noop,
    )

    await controller.submitPassword('yanlis')

    expect(enable).not.toHaveBeenCalled()
    expect(controller.getState()).toEqual({
      step: 'password',
      isSubmitting: false,
      errorMessage: 'INVALID_PASSWORD',
    })
  })

  it('"enable" hata dönerse (gerçekten taze kurulumda) step "password"da KALIR', async () => {
    const enable = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'ACCOUNT_TEMPORARILY_LOCKED', requestId: null },
      retryAfterSeconds: 60,
    })
    const getTotpUri = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'TOTP_NOT_ENABLED', requestId: null },
      retryAfterSeconds: null,
    })
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri, verifyTotp: vi.fn(), onVerified: vi.fn() },
      mapError,
      noop,
    )

    await controller.submitPassword('sifre123')

    expect(controller.getState()).toEqual({
      step: 'password',
      isSubmitting: false,
      errorMessage: 'ACCOUNT_TEMPORARILY_LOCKED',
    })
  })

  it('YENİ VAKA 3 — RELOAD EMÜLASYONU: YENİ controller örneği + get-totp-uri BAŞARILI ⇒ enable SIFIR çağrı, totpURI AYNI', async () => {
    const ORIGINAL_TOTP_URI =
      'otpauth://totp/Arkesoft:ornek%40arkesoft.app?secret=AYNISIR&issuer=Arkesoft'

    // Birinci "sayfa yüklemesi" — gerçekten taze kurulum, enable çağrılır.
    const firstEnable = vi.fn().mockResolvedValue({
      kind: 'enabled',
      totpURI: ORIGINAL_TOTP_URI,
      backupCodes: ['a', 'b'],
    })
    const firstGetTotpUri = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'TOTP_NOT_ENABLED', requestId: null },
      retryAfterSeconds: null,
    })
    const firstController = new TwoFactorSetupController(
      {
        enable: firstEnable,
        getTotpUri: firstGetTotpUri,
        verifyTotp: vi.fn(),
        onVerified: vi.fn(),
      },
      mapError,
      noop,
    )
    await firstController.submitPassword('sifre123')
    expect(firstController.getState()).toMatchObject({ step: 'totp', totpURI: ORIGINAL_TOTP_URI })

    // ⭐⭐ RELOAD — kullanıcı kod girmeden sayfayı yeniler: TAMAMEN YENİ bir
    // controller örneği (mount ömrüne bağlı HİÇBİR durum taşınmıyor).
    // Sunucu artık TOTP'u etkin görüyor ⇒ `get-totp-uri` BAŞARILI döner ve
    // AYNI sırdan üretilmiş AYNI URI'yi verir (ADR-0024 Karar 2'nin ölçümü).
    const reloadEnable = vi.fn()
    const reloadGetTotpUri = vi
      .fn()
      .mockResolvedValue({ kind: 'retrieved', totpURI: ORIGINAL_TOTP_URI })
    const reloadController = new TwoFactorSetupController(
      {
        enable: reloadEnable,
        getTotpUri: reloadGetTotpUri,
        verifyTotp: vi.fn(),
        onVerified: vi.fn(),
      },
      mapError,
      noop,
    )

    await reloadController.submitPassword('sifre123')

    expect(reloadEnable).not.toHaveBeenCalled()
    expect(reloadController.getState()).toEqual({
      step: 'totp',
      totpURI: ORIGINAL_TOTP_URI,
      backupCodes: null,
      isSubmitting: false,
      errorMessage: null,
    })
  })

  it('YENİ VAKA 4 (T-022/S4-FIX) — AYNI mount: enable İLE kod alındı → "Vazgeç" → şifre TEKRAR gönderilip get-totp-uri BU KEZ başarılı olunca backupCodes KAYBOLMAZ', async () => {
    // Birinci gönderim — gerçekten taze kurulum, enable çağrılır ve yedek
    // kodları döner.
    const enable = vi.fn().mockResolvedValue({
      kind: 'enabled',
      totpURI: 'otpauth://totp/x',
      backupCodes: ['a', 'b'],
    })
    const getTotpUri = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'error',
        error: { kind: 'known', code: 'TOTP_NOT_ENABLED', requestId: null },
        retryAfterSeconds: null,
      })
      // İkinci çağrı — "Vazgeç" sonrası AYNI mount içinde şifre tekrar
      // gönderilince sunucu artık TOTP'u etkin görür ⇒ get-totp-uri
      // BAŞARILI döner (ADR-0024 Karar 2'nin ölçtüğü gerçek davranış).
      .mockResolvedValueOnce({ kind: 'retrieved', totpURI: 'otpauth://totp/x' })
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri, verifyTotp: vi.fn(), onVerified: vi.fn() },
      mapError,
      noop,
    )

    await controller.submitPassword('sifre123')
    expect(controller.getState()).toMatchObject({ step: 'totp', backupCodes: ['a', 'b'] })

    controller.goBackToPasswordStep()
    await controller.submitPassword('sifre123')

    expect(enable).toHaveBeenCalledTimes(1)
    expect(controller.getState()).toEqual({
      step: 'totp',
      totpURI: 'otpauth://totp/x',
      backupCodes: ['a', 'b'],
      isSubmitting: false,
      errorMessage: null,
    })
  })

  it('resolveTotpUriAction: TEK koşul TOTP_NOT_ENABLED — başka bilinen/bilinmeyen hatalar "show-error" döner', () => {
    const controller = new TwoFactorSetupController(
      { enable: vi.fn(), getTotpUri: vi.fn(), verifyTotp: vi.fn(), onVerified: vi.fn() },
      mapError,
      noop,
    )

    expect(
      controller.resolveTotpUriAction({ kind: 'known', code: 'TOTP_NOT_ENABLED', requestId: null }),
    ).toBe('enable')
    expect(
      controller.resolveTotpUriAction({ kind: 'known', code: 'INVALID_PASSWORD', requestId: null }),
    ).toBe('show-error')
    expect(controller.resolveTotpUriAction({ kind: 'unknown', requestId: null })).toBe('show-error')
  })

  it('"verify-totp" başarılı → onVerified BİR KEZ çağrılır, backupCodes varsa step "backup-codes"', async () => {
    const onVerified = vi.fn()
    const controller = new TwoFactorSetupController(
      {
        enable: () => Promise.resolve({ kind: 'enabled', totpURI: 'x', backupCodes: ['a', 'b'] }),
        getTotpUri: () =>
          Promise.resolve({
            kind: 'error',
            error: { kind: 'known', code: 'TOTP_NOT_ENABLED', requestId: null },
            retryAfterSeconds: null,
          }),
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

  it('"verify-totp" başarılı ama backupCodes NULL ise (sürdürülen kurulum) step "completed"a geçer', async () => {
    const onVerified = vi.fn()
    const controller = new TwoFactorSetupController(
      {
        enable: vi.fn(),
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
    expect(controller.getState()).toEqual({ step: 'completed' })
  })

  it('"verify-totp" hata dönerse onVerified ÇAĞRILMAZ, step "totp"da kalır', async () => {
    const onVerified = vi.fn()
    const controller = new TwoFactorSetupController(
      {
        enable: () => Promise.resolve({ kind: 'enabled', totpURI: 'x', backupCodes: ['a'] }),
        getTotpUri: () =>
          Promise.resolve({
            kind: 'error',
            error: { kind: 'known', code: 'TOTP_NOT_ENABLED', requestId: null },
            retryAfterSeconds: null,
          }),
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

  it('goBackToPasswordStep — "totp" dışında NO-OP, "totp"dan "password"a döner', async () => {
    const controller = new TwoFactorSetupController(
      {
        enable: vi.fn(),
        getTotpUri: () => Promise.resolve({ kind: 'retrieved', totpURI: 'x' }),
        verifyTotp: vi.fn(),
        onVerified: vi.fn(),
      },
      mapError,
      noop,
    )

    controller.goBackToPasswordStep()
    expect(controller.getState()).toMatchObject({ step: 'password' })

    await controller.submitPassword('sifre123')
    controller.goBackToPasswordStep()
    expect(controller.getState()).toEqual({
      step: 'password',
      isSubmitting: false,
      errorMessage: null,
    })
  })
})
