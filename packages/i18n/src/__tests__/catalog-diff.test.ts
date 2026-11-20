// @arkesoft/i18n — catalog-diff.ts testleri (ROADMAP v0.0.18, T-027/S5a,
// AC-45'in NEGATİF KANIT yüzeyi)
//
// ⚠⚠ Bu dosya TAMAMEN SENTETİK fixture kullanır — gerçek defter
// (`@arkesoft/errors`) veya gerçek katalog (`tr-tr-errors.ts`) burada
// MUTASYONA UĞRATILMAZ (po'nun bağlayıcı şartı). Gerçek veriyle drift
// kontrolü `tr-tr-errors.test.ts`'te (yalnızca OKUMA, mutasyon yok) ve
// S8'in `guards.sh` adımında yapılır.

import { describe, expect, it } from 'vitest'

import { diffCatalogAgainstKeys } from '../catalog-diff.js'

describe('diffCatalogAgainstKeys', () => {
  it('defter ve katalog tam örtüşürse ikisi de boş döner', () => {
    const keys = ['a.one', 'a.two']
    const catalog = { 'a.one': 'bir', 'a.two': 'iki' }

    expect(diffCatalogAgainstKeys(keys, catalog)).toEqual({ missing: [], orphan: [] })
  })

  it('defterde olup katalogda karşılığı OLMAYAN anahtarı "missing" olarak yakalar', () => {
    const keys = ['a.one', 'a.two', 'a.three']
    const catalog = { 'a.one': 'bir', 'a.two': 'iki' }

    expect(diffCatalogAgainstKeys(keys, catalog)).toEqual({
      missing: ['a.three'],
      orphan: [],
    })
  })

  it('⚠⚠ katalogda olup defterde HİÇ geçmeyen anahtarı "orphan" olarak yakalar — tek yönlü DEĞİL', () => {
    const keys = ['a.one']
    const catalog = { 'a.one': 'bir', 'a.unused': 'yetim metin' }

    expect(diffCatalogAgainstKeys(keys, catalog)).toEqual({
      missing: [],
      orphan: ['a.unused'],
    })
  })

  it('aynı anda hem missing hem orphan üretebilir', () => {
    const keys = ['a.one', 'a.missing']
    const catalog = { 'a.one': 'bir', 'a.orphan': 'yetim' }

    expect(diffCatalogAgainstKeys(keys, catalog)).toEqual({
      missing: ['a.missing'],
      orphan: ['a.orphan'],
    })
  })

  it('defterdeki tekrarlanan anahtarları tekilleştirir (çift sayım yok)', () => {
    const keys = ['a.one', 'a.one', 'a.two']
    const catalog = { 'a.one': 'bir', 'a.two': 'iki' }

    expect(diffCatalogAgainstKeys(keys, catalog)).toEqual({ missing: [], orphan: [] })
  })

  it('boş defter + boş katalog için ikisi de boş döner', () => {
    expect(diffCatalogAgainstKeys([], {})).toEqual({ missing: [], orphan: [] })
  })

  it('saf fonksiyon — girdileri DEĞİŞTİRMEZ', () => {
    const keys = ['a.one']
    const catalog = { 'a.one': 'bir', 'a.unused': 'yetim' }

    diffCatalogAgainstKeys(keys, catalog)

    expect(keys).toEqual(['a.one'])
    expect(catalog).toEqual({ 'a.one': 'bir', 'a.unused': 'yetim' })
  })
})
