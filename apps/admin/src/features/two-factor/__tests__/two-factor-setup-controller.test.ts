// @arkesoft/admin — TwoFactorSetupController testleri (ROADMAP v0.0.15,
// T-016/S10, AC11 madde 4 + 5). Saf sınıf — DOM/React GEREKMEZ
// (`vitest.config.ts`'in `environment: 'node'` kararıyla TUTARLI).
import { describe, expect, it, vi } from 'vitest'

import { TwoFactorSetupController } from '../two-factor-setup-controller.js'

const SAMPLE_TOTP_URI =
  'otpauth://totp/Arkesoft:ornek%40magaza.com?secret=ORNEKSAHTE&issuer=Arkesoft'
const SAMPLE_BACKUP_CODES = ['AAAAA-11111', 'BBBBB-22222']

describe('TwoFactorSetupController — AC11 madde 4 (enable BİR KEZ çağrılır)', () => {
  it('ilk şifre gönderiminde `enable` çağrılır, `get-totp-uri` ÇAĞRILMAZ', async () => {
    const enable = vi.fn().mockResolvedValue({
      kind: 'enabled',
      totpURI: SAMPLE_TOTP_URI,
      backupCodes: SAMPLE_BACKUP_CODES,
    })
    const getTotpUri = vi.fn()
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri, verifyTotp: vi.fn(), onVerified: vi.fn() },
      () => 'hata',
      vi.fn(),
    )

    await controller.submitPassword('sifre-123')

    expect(enable).toHaveBeenCalledTimes(1)
    expect(getTotpUri).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({ step: 'totp', totpURI: SAMPLE_TOTP_URI })
  })

  it("adım 3'ten adım 2'ye GERİ dönüp tekrar şifre gönderince `enable` İKİNCİ KEZ ÇAĞRILMAZ — `get-totp-uri` kullanılır", async () => {
    const enable = vi.fn().mockResolvedValue({
      kind: 'enabled',
      totpURI: SAMPLE_TOTP_URI,
      backupCodes: SAMPLE_BACKUP_CODES,
    })
    const getTotpUri = vi.fn().mockResolvedValue({ kind: 'retrieved', totpURI: SAMPLE_TOTP_URI })
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri, verifyTotp: vi.fn(), onVerified: vi.fn() },
      () => 'hata',
      vi.fn(),
    )

    await controller.submitPassword('sifre-123')
    controller.goBackToPasswordStep()
    await controller.submitPassword('sifre-123')

    expect(enable).toHaveBeenCalledTimes(1)
    expect(getTotpUri).toHaveBeenCalledTimes(1)
    // Yedek kodlar İLK çağrıdan hâlâ bellekte — `get-totp-uri` döndürmese bile kaybolmaz.
    expect(controller.getState()).toMatchObject({ step: 'totp', backupCodes: SAMPLE_BACKUP_CODES })
  })

  // wcag FIX turu 4/M-W1 — `TwoFactorSetupWizard`'ın şifre adımı artık
  // `state.errorMessage`'ı `Input.error`'a bağlıyor (`resolveFieldError
  // Message`, bkz. `field-error-message.test.ts`); bu test o ZİNCİRİN
  // controller YARISINI kanıtlar: 401 yanlış şifre `errorMessage`'ı STRING
  // olarak (render edilebilir) üretir, adım `password`'ta KALIR (TOTP
  // adımına GEÇİLMEZ).
  it('şifre onayı 401 (yanlış şifre) ile BAŞARISIZ olursa adım `password`ta kalır, `errorMessage` dolar', async () => {
    const enable = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'INVALID_PASSWORD', requestId: null },
    })
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri: vi.fn(), verifyTotp: vi.fn(), onVerified: vi.fn() },
      () => 'Şifreniz doğrulanamadı. Tekrar deneyin.',
      vi.fn(),
    )

    await controller.submitPassword('yanlis-sifre')

    expect(controller.getState()).toMatchObject({
      step: 'password',
      isSubmitting: false,
      errorMessage: 'Şifreniz doğrulanamadı. Tekrar deneyin.',
    })
  })

  // VACUITY KANITI (AC11): `resolveTotpUriAction`'ın `hasCalledEnable` kontrolü
  // KALDIRILIRSA (yukarıdaki testin SİMÜLASYONU) test KIRMIZI olmalı ve
  // sorunu ADLANDIRMALI. Bu test o bozulmayı DOĞRUDAN, bağımsız bir karar
  // fonksiyonu üzerinden kanıtlar: `resolveTotpUriAction` her ZAMAN 'enable'
  // dönerse (bayrağı YOK SAYSA) ikinci çağrı da 'enable' olurdu — aşağıdaki
  // assertion bunu YAKALAR (bozuk sürümde `enable` 2 kez çağrılır, bu test
  // `toHaveBeenCalledTimes(1)` ile KIRMIZI verir ve "enable 2 kez çağrıldı"
  // sorununu adlandırır).
  it('vacuity: `resolveTotpUriAction` ikinci çağrıda "get-totp-uri" döner (enable DEĞİL)', async () => {
    const enable = vi.fn().mockResolvedValue({
      kind: 'enabled',
      totpURI: SAMPLE_TOTP_URI,
      backupCodes: SAMPLE_BACKUP_CODES,
    })
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri: vi.fn(), verifyTotp: vi.fn(), onVerified: vi.fn() },
      () => 'hata',
      vi.fn(),
    )

    expect(controller.resolveTotpUriAction()).toBe('enable')
    await controller.submitPassword('sifre-123')
    expect(controller.resolveTotpUriAction()).toBe('get-totp-uri')
  })
})

describe('TwoFactorSetupController — AC11 madde 5 (verify-totp sonrası tetikleyici)', () => {
  it('kod doğrulama BAŞARILI olunca `onVerified` TAM BİR KEZ çağrılır', async () => {
    const onVerified = vi.fn()
    const enable = vi.fn().mockResolvedValue({
      kind: 'enabled',
      totpURI: SAMPLE_TOTP_URI,
      backupCodes: SAMPLE_BACKUP_CODES,
    })
    const verifyTotp = vi.fn().mockResolvedValue({ kind: 'verified' })
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri: vi.fn(), verifyTotp, onVerified },
      () => 'hata',
      vi.fn(),
    )

    await controller.submitPassword('sifre-123')
    await controller.submitCode('123456')

    expect(onVerified).toHaveBeenCalledTimes(1)
    expect(controller.getState()).toMatchObject({
      step: 'backup-codes',
      backupCodes: SAMPLE_BACKUP_CODES,
    })
  })

  it('kod doğrulama BAŞARISIZ olunca `onVerified` ÇAĞRILMAZ', async () => {
    const onVerified = vi.fn()
    const enable = vi.fn().mockResolvedValue({
      kind: 'enabled',
      totpURI: SAMPLE_TOTP_URI,
      backupCodes: SAMPLE_BACKUP_CODES,
    })
    const verifyTotp = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'INVALID_CODE', requestId: null },
      retryAfterSeconds: null,
    })
    const controller = new TwoFactorSetupController(
      { enable, getTotpUri: vi.fn(), verifyTotp, onVerified },
      () => 'Kod doğrulanamadı.',
      vi.fn(),
    )

    await controller.submitPassword('sifre-123')
    await controller.submitCode('000000')

    expect(onVerified).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({
      step: 'totp',
      errorMessage: 'Kod doğrulanamadı.',
    })
  })

  // VACUITY KANITI: `submitCode`'un içindeki `this.deps.onVerified()` satırı
  // KALDIRILIRSA (bozulma simülasyonu) ilk test (`onVerified` TAM BİR KEZ)
  // KIRMIZI verir ve "onVerified çağrılmadı" sorununu adlandırır — bu dosya
  // o satırı GERÇEKTEN silip (manuel doğrulama adımı, raporda belgelendi)
  // testin kırmızı olduğunu gösterip GERİ ALDI.
})
