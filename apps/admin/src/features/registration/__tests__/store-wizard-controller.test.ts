// @arkesoft/admin — StoreWizardController testleri (ROADMAP v0.1.0,
// T-019/S10). Saf sınıf — DOM/React GEREKMEZ. ⚠⚠ DEBOUNCE sahte
// zamanlayıcıyla (`vi.useFakeTimers()`) ÖLÇÜLÜR: tuş başına BİR İSTEK
// DEĞİL, pencere (debounce) başına BİR istek (brief'in TAMAMLANMA
// TANIMI'nın bağlayıcı şartı).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CreateTenantInput } from '@arkesoft/trpc'

import {
  INITIAL_STORE_WIZARD_STATE,
  SLUG_CHECK_DEBOUNCE_MS,
  StoreWizardController,
  type CheckSlugAvailabilityCallResult,
  type CreateTenantCallResult,
} from '../store-wizard-controller.js'

function noopMapError(): string {
  return 'hata'
}

function noopMapFieldError(key: string): string {
  return `alan-hatasi:${key}`
}

describe('StoreWizardController — goToSlugStep (P3→P4)', () => {
  it("mağaza adından slug ÖNERİSİ türetir ve HEMEN (debounce'suz) bir kontrol başlatır", async () => {
    const checkSlugAvailability = vi.fn().mockResolvedValue({ kind: 'ok', outcome: 'available' })
    const controller = new StoreWizardController(
      { checkSlugAvailability, createTenant: vi.fn() },
      noopMapFieldError,
      noopMapError,
      vi.fn(),
    )

    controller.goToSlugStep('Deniz Takı Atölyesi')
    expect(controller.getState()).toMatchObject({ step: 'slug', slug: 'deniz-taki-atolyesi' })

    await vi.waitFor(() => {
      expect(checkSlugAvailability).toHaveBeenCalledTimes(1)
    })
    expect(checkSlugAvailability).toHaveBeenCalledWith('deniz-taki-atolyesi')
    expect(controller.getState()).toMatchObject({ slugCheckStatus: 'available' })
  })
})

describe('StoreWizardController — setSlug (debounce, sahte zamanlayıcı)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('PENCERE başına BİR istek — tuş başına BİR istek DEĞİL (hızlı art arda 5 tuş vuruşu → yalnızca 1 çağrı)', async () => {
    const checkSlugAvailability = vi.fn().mockResolvedValue({ kind: 'ok', outcome: 'available' })
    const controller = new StoreWizardController(
      { checkSlugAvailability, createTenant: vi.fn() },
      noopMapFieldError,
      noopMapError,
      vi.fn(),
    )
    controller.goToSlugStep('Mağaza')
    await vi.advanceTimersByTimeAsync(0) // ilk otomatik kontrolü (debounce'suz, mikro görev) tüket
    checkSlugAvailability.mockClear()

    controller.setSlug('m')
    controller.setSlug('ma')
    controller.setSlug('mag')
    controller.setSlug('maga')
    controller.setSlug('magaza-2')

    // Pencere HENÜZ dolmadı — istek ATILMAMIŞ olmalı (ux "kullanıcı yazarken istek atılmaz").
    expect(checkSlugAvailability).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SLUG_CHECK_DEBOUNCE_MS)

    expect(checkSlugAvailability).toHaveBeenCalledTimes(1)
    expect(checkSlugAvailability).toHaveBeenCalledWith('magaza-2')
  })

  it('her tuş vuruşu önceki zamanlayıcıyı İPTAL eder (yarım kalan bir pencere ASLA istek üretmez)', async () => {
    const checkSlugAvailability = vi.fn().mockResolvedValue({ kind: 'ok', outcome: 'available' })
    const controller = new StoreWizardController(
      { checkSlugAvailability, createTenant: vi.fn() },
      noopMapFieldError,
      noopMapError,
      vi.fn(),
    )
    controller.goToSlugStep('Mağaza')
    await vi.advanceTimersByTimeAsync(0)
    checkSlugAvailability.mockClear()

    controller.setSlug('ilk-deger')
    await vi.advanceTimersByTimeAsync(SLUG_CHECK_DEBOUNCE_MS - 50)
    controller.setSlug('son-deger')
    await vi.advanceTimersByTimeAsync(SLUG_CHECK_DEBOUNCE_MS - 50)

    // İKİ pencere de TAMAMLANMADI (her biri sınırın altında) — HİÇ istek yok.
    expect(checkSlugAvailability).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(50)

    expect(checkSlugAvailability).toHaveBeenCalledTimes(1)
    expect(checkSlugAvailability).toHaveBeenCalledWith('son-deger')
  })

  it('her tuş vuruşu canlı durumu HEMEN "checking"e çevirir (ÖNCEKİ outcome GÖRÜNMEZ kalmaz)', () => {
    const controller = new StoreWizardController(
      { checkSlugAvailability: vi.fn(), createTenant: vi.fn() },
      noopMapFieldError,
      noopMapError,
      vi.fn(),
    )
    controller.goToSlugStep('Mağaza')

    controller.setSlug('yeni-deger')

    expect(controller.getState()).toMatchObject({ slugCheckStatus: 'checking' })
  })

  it('eski (stale) bir yanıt geç gelirse YENİ durumu EZMEZ (yarış koruması)', async () => {
    let resolveFirst: ((value: { kind: 'ok'; outcome: 'taken' }) => void) | undefined
    const checkSlugAvailability = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce({ kind: 'ok', outcome: 'available' })
    const controller = new StoreWizardController(
      { checkSlugAvailability, createTenant: vi.fn() },
      noopMapFieldError,
      noopMapError,
      vi.fn(),
    )
    controller.goToSlugStep('Mağaza') // ilk (debounce'suz) kontrol — henüz BEKLEMEDE

    controller.setSlug('ikinci-deger')
    await vi.advanceTimersByTimeAsync(SLUG_CHECK_DEBOUNCE_MS) // ikinci kontrol TAMAMLANIR, 'available'

    expect(controller.getState()).toMatchObject({ slugCheckStatus: 'available' })

    // Şimdi ESKİ (ilk) istek GEÇ gelir — YENİ 'available' durumunu EZMEMELİ.
    resolveFirst?.({ kind: 'ok', outcome: 'taken' })
    await Promise.resolve()

    expect(controller.getState()).toMatchObject({ slugCheckStatus: 'available' })
  })
})

describe('StoreWizardController — submit (createTenant)', () => {
  async function buildControllerAtSiteTypeStep(deps: {
    checkSlugAvailability?: (slug: string) => Promise<CheckSlugAvailabilityCallResult>
    createTenant: (input: CreateTenantInput) => Promise<CreateTenantCallResult>
  }) {
    const checkSlugAvailability =
      deps.checkSlugAvailability ?? vi.fn().mockResolvedValue({ kind: 'ok', outcome: 'available' })
    const controller = new StoreWizardController(
      { checkSlugAvailability, createTenant: deps.createTenant },
      noopMapFieldError,
      noopMapError,
      vi.fn(),
    )
    controller.goToSlugStep('Deniz Takı Atölyesi')
    await vi.waitFor(() => {
      expect(controller.getState()).toMatchObject({ slugCheckStatus: 'available' })
    })
    controller.goToSiteTypeStep()
    controller.selectSiteType('ecommerce')
    return controller
  }

  it('site tipi seçilmeden submit edilirse siteTypeErrorMessage dolar, createTenant ÇAĞRILMAZ', async () => {
    const createTenant = vi.fn()
    const checkSlugAvailability = vi.fn().mockResolvedValue({ kind: 'ok', outcome: 'available' })
    const controller = new StoreWizardController(
      { checkSlugAvailability, createTenant },
      noopMapFieldError,
      noopMapError,
      vi.fn(),
    )
    controller.goToSlugStep('Deniz Takı Atölyesi')
    await vi.waitFor(() => {
      expect(controller.getState()).toMatchObject({ slugCheckStatus: 'available' })
    })
    controller.goToSiteTypeStep()

    const outcome = await controller.submit('Bir site tipi seç.')

    expect(outcome).toEqual({ kind: 'none' })
    expect(createTenant).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({ siteTypeErrorMessage: 'Bir site tipi seç.' })
  })

  it('başarılı olursa "created" döner, slug çağıranın `createTenant` sonucundan gelir', async () => {
    const createTenant = vi.fn().mockResolvedValue({
      kind: 'ok',
      result: { slug: 'deniz-taki-atolyesi', status: 'pending' },
    })
    const controller = await buildControllerAtSiteTypeStep({ createTenant })

    const outcome = await controller.submit('Bir site tipi seç.')

    expect(createTenant).toHaveBeenCalledWith({
      name: 'Deniz Takı Atölyesi',
      slug: 'deniz-taki-atolyesi',
      siteType: 'ecommerce',
    })
    expect(outcome).toEqual({ kind: 'created', slug: 'deniz-taki-atolyesi' })
  })

  it('UNAUTHENTICATED (401) için "unauthenticated" döner', async () => {
    const createTenant = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'UNAUTHENTICATED', requestId: null, fields: null },
    })
    const controller = await buildControllerAtSiteTypeStep({ createTenant })

    const outcome = await controller.submit('Bir site tipi seç.')

    expect(outcome).toEqual({ kind: 'unauthenticated' })
  })

  it('slug yarış kaybı (VALIDATION_ERROR + fields.slug) adımı "slug"a GERİ döndürür, Input.error dolar, canlı durum GERİ türetilir', async () => {
    const createTenant = vi.fn().mockResolvedValue({
      kind: 'error',
      error: {
        kind: 'known',
        code: 'VALIDATION_ERROR',
        requestId: null,
        fields: { slug: 'errors.slug.taken' },
      },
    })
    const controller = await buildControllerAtSiteTypeStep({ createTenant })

    const outcome = await controller.submit('Bir site tipi seç.')

    expect(outcome).toEqual({ kind: 'none' })
    expect(controller.getState()).toMatchObject({
      step: 'slug',
      slugCheckStatus: 'taken',
      slugFieldErrorMessage: 'alan-hatasi:errors.slug.taken',
    })
  })

  it('429/ağ/diğer hata AYNI adımda kalır, submitErrorMessage dolar (girdi KAYBOLMAZ)', async () => {
    const createTenant = vi.fn().mockResolvedValue({
      kind: 'error',
      error: { kind: 'known', code: 'RATE_LIMIT_EXCEEDED', requestId: null, fields: null },
    })
    const controller = await buildControllerAtSiteTypeStep({ createTenant })

    const outcome = await controller.submit('Bir site tipi seç.')

    expect(outcome).toEqual({ kind: 'none' })
    expect(controller.getState()).toMatchObject({
      step: 'siteType',
      siteType: 'ecommerce',
      isSubmitting: false,
      submitErrorMessage: 'hata',
    })
  })
})

describe('StoreWizardController — geri/ileri gezinme girdiyi korur', () => {
  it('goBackToStoreNameStep sonrası storeName KORUNUR', () => {
    const controller = new StoreWizardController(
      {
        checkSlugAvailability: vi.fn().mockResolvedValue({ kind: 'ok', outcome: 'available' }),
        createTenant: vi.fn(),
      },
      noopMapFieldError,
      noopMapError,
      vi.fn(),
    )
    controller.goToSlugStep('Deniz Takı Atölyesi')
    controller.goBackToStoreNameStep()

    expect(controller.getState()).toEqual({
      ...INITIAL_STORE_WIZARD_STATE,
      step: 'storeName',
      storeName: 'Deniz Takı Atölyesi',
    })
  })
})
