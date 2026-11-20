// @arkesoft/i18n — message-resolver.ts (createMessageResolver) testleri
// (ROADMAP v0.0.18, T-027/S5a, AC-44)
//
// ⚠⚠ AC-44 — Locale'de JENERİK kanıtı: `L = 'tr-TR' | 'xx-XX'`. `'xx-XX'`
// SENTETİK bir locale'dir, `bundle`'da KARŞILIĞI YOK — bu TASARLANMIŞ:
// `en-US` İÇERİĞİ olmadan formatın çok-dilli KALDIĞINI (geri düşme
// merdiveninin HERHANGİ bir locale için çalıştığını) kanıtlamak için gerçek
// bir ikinci dil İÇERİĞİ yazmaya gerek YOK — tek gereken, bundle'da eksik
// bir locale talep etmek.

import { describe, expect, it } from 'vitest'

import type { CatalogBundle } from '../catalog-types.js'
import { createMessageResolver } from '../message-resolver.js'
import { TR_TR_ERROR_MESSAGES } from '../tr-tr-errors.js'

type SyntheticLocale = 'tr-TR' | 'xx-XX'

const bundle: CatalogBundle<SyntheticLocale> = {
  'tr-TR': TR_TR_ERROR_MESSAGES,
}

// ⚠ `L` İKİ parametreden (bundle + defaultLocale) birden çıkarsanır; literal
// `'tr-TR'` argümanı tek başına TS'in `L`'i DAR literal'e indirmesine yol
// açar (bundle'ın `CatalogBundle<SyntheticLocale>` tipini EZER). Tip
// argümanı AÇIKÇA verilir — bu, "L jenerik" iddiasının KENDİSİNİN kanıtı:
// çağıran `SyntheticLocale`'i (`'tr-TR' | 'xx-XX'`) seçebiliyor.
describe('createMessageResolver', () => {
  it('varsayılan locale (tr-TR) doğrudan katalogdan okunur', () => {
    const resolveFor = createMessageResolver<SyntheticLocale>(bundle, 'tr-TR')
    const resolver = resolveFor('tr-TR')

    expect(resolver.resolveMessage('errors.tenant.notFound')).toBe('İstenen mağaza bulunamadı.')
  })

  it('⚠⚠ sentetik xx-XX istenirse ve bundle da YOKSA varsayılana GERİ DÜŞER', () => {
    const resolveFor = createMessageResolver<SyntheticLocale>(bundle, 'tr-TR')
    const resolver = resolveFor('xx-XX')

    expect(resolver.resolveMessage('errors.tenant.notFound')).toBe('İstenen mağaza bulunamadı.')
  })

  it('açık dünya — kapalı kümede OLMAYAN anahtar için null döner (SESSİZ boş dize DEĞİL)', () => {
    const resolveFor = createMessageResolver<SyntheticLocale>(bundle, 'tr-TR')
    const resolver = resolveFor('tr-TR')

    expect(resolver.resolveMessage('errors.uydurma.anahtar')).toBeNull()
  })

  it('xx-XX + kapalı kümede olmayan anahtar da null döner (iki katmanlı geri düşme SESSİZ boş dize ÜRETMEZ)', () => {
    const resolveFor = createMessageResolver<SyntheticLocale>(bundle, 'tr-TR')
    const resolver = resolveFor('xx-XX')

    expect(resolver.resolveMessage('errors.uydurma.anahtar')).toBeNull()
  })

  it('boş dize (ham sunucu metni) de kapalı kümenin üyesi DEĞİLDİR, null döner', () => {
    const resolveFor = createMessageResolver<SyntheticLocale>(bundle, 'tr-TR')
    const resolver = resolveFor('tr-TR')

    expect(resolver.resolveMessage('')).toBeNull()
  })

  it('t() TOTAL — tipli çağıran için BAŞARISIZ OLAMAZ, xx-XX istese de varsayılana düşer', () => {
    const resolveFor = createMessageResolver<SyntheticLocale>(bundle, 'tr-TR')
    const resolver = resolveFor('xx-XX')

    expect(resolver.t('errors.tenant.notFound')).toBe('İstenen mağaza bulunamadı.')
  })

  it('requested locale karşılığı VARSA t() onu tercih eder (varsayılana değil, kendi içeriğine düşer)', () => {
    const overrideBundle: CatalogBundle<SyntheticLocale> = {
      'tr-TR': TR_TR_ERROR_MESSAGES,
      'xx-XX': {
        ...TR_TR_ERROR_MESSAGES,
        'errors.tenant.notFound': 'xx-XX override',
      },
    }
    const resolveFor = createMessageResolver<SyntheticLocale>(overrideBundle, 'tr-TR')
    const resolver = resolveFor('xx-XX')

    expect(resolver.t('errors.tenant.notFound')).toBe('xx-XX override')
  })

  it('⚠ varsayılan locale bundle içinde YOKSA kurulum anında (sessiz değil) FIRLAR', () => {
    const emptyBundle: CatalogBundle<SyntheticLocale> = {}

    expect(() => createMessageResolver<SyntheticLocale>(emptyBundle, 'tr-TR')).toThrow()
  })
})
