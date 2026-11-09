// @arkesoft/admin — TwoFactorManageController testleri (ROADMAP v0.0.15,
// T-016 FIX turu 2/M-3). Saf sınıf — DOM/React GEREKMEZ (`vitest.config.ts`
// `environment: 'node'` kararıyla TUTARLI; `two-factor-setup-controller.
// test.ts`'in AYNI deseni).
import { describe, expect, it, vi } from 'vitest'

import { TwoFactorManageController } from '../two-factor-manage-controller.js'

describe('TwoFactorManageController — devre dışı bırakma akışı', () => {
  it('diyalog "disable" İÇİN AÇIKKEN BAŞARILI `disable` sonrası `onDisabled` TAM BİR KEZ çağrılır ve diyalog kapanır', async () => {
    const onDisabled = vi.fn()
    const onRegenerated = vi.fn()
    const disable = vi.fn().mockResolvedValue({ kind: 'disabled' })
    const controller = new TwoFactorManageController(
      { disable, generateBackupCodes: vi.fn(), onDisabled, onRegenerated },
      () => 'hata',
      vi.fn(),
    )

    controller.openDialog('disable')
    controller.setPassword('sifre-123')
    await controller.confirmDisable()

    expect(disable).toHaveBeenCalledWith('sifre-123')
    expect(onDisabled).toHaveBeenCalledTimes(1)
    expect(onRegenerated).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({ dialogKind: 'none', isMutating: false })
  })

  it('`disable` BAŞARISIZ olunca `onDisabled` ÇAĞRILMAZ, diyalog AÇIK kalır, hata mesajı YAZILIR', async () => {
    const onDisabled = vi.fn()
    const disable = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'INVALID_PASSWORD', requestId: null },
      retryAfterSeconds: null,
    })
    const controller = new TwoFactorManageController(
      { disable, generateBackupCodes: vi.fn(), onDisabled, onRegenerated: vi.fn() },
      () => 'Şifre yanlış.',
      vi.fn(),
    )

    controller.openDialog('disable')
    controller.setPassword('yanlis')
    await controller.confirmDisable()

    expect(onDisabled).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({
      dialogKind: 'disable',
      isMutating: false,
      mutationError: 'Şifre yanlış.',
    })
  })

  it('diyalog AÇIK DEĞİLKEN `confirmDisable` no-op — `disable` ÇAĞRILMAZ', async () => {
    const disable = vi.fn()
    const controller = new TwoFactorManageController(
      { disable, generateBackupCodes: vi.fn(), onDisabled: vi.fn(), onRegenerated: vi.fn() },
      () => 'hata',
      vi.fn(),
    )

    await controller.confirmDisable()

    expect(disable).not.toHaveBeenCalled()
  })

  // VACUITY KANITI (`solid` M-3'ün somut senaryosu — "üçlüden biri
  // kaldırılsa hiçbir test kırmızı olmaz") — bu dosyaya GÖMÜLÜ bir test
  // DEĞİL: `confirmDisable`'ın İÇİNDEKİ `this.deps.onDisabled()` satırı
  // GERÇEKTEN silinip "diyalog 'disable' İÇİN AÇIKKEN..." testi KIRMIZI
  // verdiği (beklenen `onDisabled` 1 kez, alınan 0 kez) ELLE doğrulandı,
  // SONRA satır geri kondu — ham çıktı handoff raporunda.
})

describe('TwoFactorManageController — yedek kod yeniden oluşturma akışı', () => {
  it('diyalog "regenerate" İÇİN AÇIKKEN BAŞARILI `generateBackupCodes` sonrası `onRegenerated` YENİ kodlarla TAM BİR KEZ çağrılır', async () => {
    const onRegenerated = vi.fn()
    const onDisabled = vi.fn()
    const generateBackupCodes = vi
      .fn()
      .mockResolvedValue({ kind: 'generated', backupCodes: ['AAAA-1111', 'BBBB-2222'] })
    const controller = new TwoFactorManageController(
      { disable: vi.fn(), generateBackupCodes, onDisabled, onRegenerated },
      () => 'hata',
      vi.fn(),
    )

    controller.openDialog('regenerate')
    controller.setPassword('sifre-123')
    await controller.confirmRegenerate()

    expect(generateBackupCodes).toHaveBeenCalledWith('sifre-123')
    expect(onRegenerated).toHaveBeenCalledTimes(1)
    expect(onRegenerated).toHaveBeenCalledWith(['AAAA-1111', 'BBBB-2222'])
    expect(onDisabled).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({ dialogKind: 'none' })
  })

  it('`generateBackupCodes` BAŞARISIZ olunca `onRegenerated` ÇAĞRILMAZ, diyalog AÇIK kalır', async () => {
    const onRegenerated = vi.fn()
    const generateBackupCodes = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'INVALID_PASSWORD', requestId: null },
      retryAfterSeconds: null,
    })
    const controller = new TwoFactorManageController(
      { disable: vi.fn(), generateBackupCodes, onDisabled: vi.fn(), onRegenerated },
      () => 'Şifre yanlış.',
      vi.fn(),
    )

    controller.openDialog('regenerate')
    await controller.confirmRegenerate()

    expect(onRegenerated).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({
      dialogKind: 'regenerate',
      mutationError: 'Şifre yanlış.',
    })
  })
})

describe('TwoFactorManageController — diyalog yaşam döngüsü', () => {
  it('`openDialog` şifre/hatayı SIFIRLAR', () => {
    const controller = new TwoFactorManageController(
      {
        disable: vi.fn(),
        generateBackupCodes: vi.fn(),
        onDisabled: vi.fn(),
        onRegenerated: vi.fn(),
      },
      () => 'hata',
      vi.fn(),
    )

    controller.openDialog('disable')
    controller.setPassword('kalinti')
    controller.closeDialog()
    controller.openDialog('regenerate')

    expect(controller.getState()).toEqual({
      dialogKind: 'regenerate',
      password: '',
      isMutating: false,
      mutationError: null,
    })
  })
})
