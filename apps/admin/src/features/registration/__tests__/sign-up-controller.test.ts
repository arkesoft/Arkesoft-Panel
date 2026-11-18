// @arkesoft/admin — SignUpController testleri (ROADMAP v0.1.0, T-019/S10).
// Saf sınıf — DOM/React GEREKMEZ (`vitest.config.ts`'in `environment:
// 'node'` kararıyla TUTARLI, `two-factor-setup-controller.test.ts` deseni).
import { describe, expect, it, vi } from 'vitest'

import { INITIAL_SIGN_UP_STATE, SignUpController } from '../sign-up-controller.js'

describe('SignUpController — submitSignUp', () => {
  it('normal/yükleniyor/hata: gönderim BAŞLARKEN isSubmitting true olur, BAŞARILI olunca "emailPending" adımına geçer', async () => {
    const signUp = vi.fn().mockResolvedValue({ kind: 'signed-up' })
    const onChange = vi.fn()
    const controller = new SignUpController(
      { signUp, resendVerificationEmail: vi.fn() },
      () => 'hata',
      onChange,
    )

    expect(controller.getState()).toEqual(INITIAL_SIGN_UP_STATE)

    await controller.submitSignUp('kullanici@ornek.com', 'sifre-123')

    expect(signUp).toHaveBeenCalledWith({ email: 'kullanici@ornek.com', password: 'sifre-123' })
    expect(controller.getState()).toEqual({
      step: 'emailPending',
      email: 'kullanici@ornek.com',
      isResending: false,
      resendErrorMessage: null,
    })
    // Ara durum (isSubmitting: true) GERÇEKTEN yayınlandı mı — gönderiliyor durumu render edilebilir.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'form', isSubmitting: true }),
    )
  })

  it('hata: sunucu hatası döndürürse adım "form"da kalır, errorMessage dolar', async () => {
    const signUp = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'RATE_LIMIT_EXCEEDED', requestId: null, fields: null },
    })
    const controller = new SignUpController(
      { signUp, resendVerificationEmail: vi.fn() },
      () => 'Çok fazla deneme yapıldı.',
      vi.fn(),
    )

    await controller.submitSignUp('kullanici@ornek.com', 'sifre-123')

    expect(controller.getState()).toEqual({
      step: 'form',
      isSubmitting: false,
      errorMessage: 'Çok fazla deneme yapıldı.',
    })
  })

  it('adım "form" DEĞİLKEN ikinci bir submitSignUp çağrısı YOK SAYILIR (çift gönderim savunması)', async () => {
    const signUp = vi.fn().mockResolvedValue({ kind: 'signed-up' })
    const controller = new SignUpController(
      { signUp, resendVerificationEmail: vi.fn() },
      () => 'hata',
      vi.fn(),
    )

    await controller.submitSignUp('a@b.com', 'sifre')
    await controller.submitSignUp('baska@b.com', 'sifre')

    expect(signUp).toHaveBeenCalledTimes(1)
  })
})

describe('SignUpController — resendVerificationEmail', () => {
  it('yükleniyor/normal: "emailPending" adımındayken BAŞARILI olursa hata temizlenir', async () => {
    const signUp = vi.fn().mockResolvedValue({ kind: 'signed-up' })
    const resendVerificationEmail = vi.fn().mockResolvedValue({ kind: 'sent' })
    const controller = new SignUpController(
      { signUp, resendVerificationEmail },
      () => 'hata',
      vi.fn(),
    )
    await controller.submitSignUp('kullanici@ornek.com', 'sifre-123')

    await controller.resendVerificationEmail()

    expect(resendVerificationEmail).toHaveBeenCalledWith('kullanici@ornek.com')
    expect(controller.getState()).toEqual({
      step: 'emailPending',
      email: 'kullanici@ornek.com',
      isResending: false,
      resendErrorMessage: null,
    })
  })

  it('hata: yeniden gönderme başarısız olursa resendErrorMessage dolar, ana ekran/adım DEĞİŞMEZ', async () => {
    const signUp = vi.fn().mockResolvedValue({ kind: 'signed-up' })
    const resendVerificationEmail = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'MAIL_DELIVERY_FAILED', requestId: null, fields: null },
    })
    const controller = new SignUpController(
      { signUp, resendVerificationEmail },
      () => 'E-posta gönderilemedi.',
      vi.fn(),
    )
    await controller.submitSignUp('kullanici@ornek.com', 'sifre-123')

    await controller.resendVerificationEmail()

    expect(controller.getState()).toEqual({
      step: 'emailPending',
      email: 'kullanici@ornek.com',
      isResending: false,
      resendErrorMessage: 'E-posta gönderilemedi.',
    })
  })

  it('adım "emailPending" DEĞİLKEN çağrılırsa YOK SAYILIR', async () => {
    const resendVerificationEmail = vi.fn()
    const controller = new SignUpController(
      { signUp: vi.fn(), resendVerificationEmail },
      () => 'hata',
      vi.fn(),
    )

    await controller.resendVerificationEmail()

    expect(resendVerificationEmail).not.toHaveBeenCalled()
  })
})
