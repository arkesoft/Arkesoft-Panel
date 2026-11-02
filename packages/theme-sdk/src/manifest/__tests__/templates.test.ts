// @arkesoft/theme-sdk — `THEME_TEMPLATES_SCHEMA` birim testleri (ROADMAP
// v0.0.9, T-010/S5, AC11 + `THEME_TEMPLATE_DUPLICATE`)

import { describe, expect, it } from 'vitest'

import {
  REQUIRED_THEME_TEMPLATE_TYPES,
  THEME_TEMPLATE_TYPES,
  THEME_TEMPLATES_SCHEMA,
} from '../templates.js'

/** Her türden tek slotsuz bir şablon üretir — testlerde tekrar etmemek için. */
function template(type: string): { type: string; slots: readonly never[] } {
  return { type, slots: [] }
}

describe('THEME_TEMPLATES_SCHEMA — AC11 pozitif: yedi şablonun hepsi temsil edilebilir', () => {
  it('yedi şablon türünün tamamı (home + 404 dahil) kabul edilir', () => {
    const templates = THEME_TEMPLATE_TYPES.map((type) => template(type))

    const result = THEME_TEMPLATES_SCHEMA.safeParse(templates)

    expect(result.success).toBe(true)
  })

  it('yalnızca zorunlu küme (home + 404) de yeterlidir', () => {
    const templates = REQUIRED_THEME_TEMPLATE_TYPES.map((type) => template(type))

    const result = THEME_TEMPLATES_SCHEMA.safeParse(templates)

    expect(result.success).toBe(true)
  })
})

describe('THEME_TEMPLATES_SCHEMA — AC11 eksik zorunlu (THEME_TEMPLATE_MISSING)', () => {
  it('home ve 404 İKİSİ DE eksikse THEME_TEMPLATE_MISSING döner', () => {
    const templates = [template('product'), template('cart')]

    const result = THEME_TEMPLATES_SCHEMA.safeParse(templates)

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('beklenmeyen başarı')
    }
    const issue = result.error.issues.find((candidate) => {
      const customCode: unknown =
        candidate.code === 'custom' ? candidate.params?.['themeContractErrorCode'] : undefined
      return customCode === 'THEME_TEMPLATE_MISSING'
    })
    expect(issue).toBeDefined()
  })

  it('yalnızca 404 eksikse (home var) YİNE THEME_TEMPLATE_MISSING döner', () => {
    const templates = [template('home')]

    const result = THEME_TEMPLATES_SCHEMA.safeParse(templates)

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('beklenmeyen başarı')
    }
    // ⚠ Q2 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti B, `qa`'nın bulgusu)
    // — ÖNCEDEN bu test başlığı "YİNE THEME_TEMPLATE_MISSING döner" diyordu
    // ama yalnızca `success === false` ölçüyordu, KODU ÖLÇMÜYORDU. `qa`'nın
    // mutasyonu (`THEME_TEMPLATE_MISSING_CODE` → `'THEME_TEMPLATE_UNKNOWN'`)
    // komşu testleri KIRDI ama BUNU yeşil bıraktı — artık `code` BİREBİR
    // pinlenir.
    const issue = result.error.issues.find((candidate) => {
      const customCode: unknown =
        candidate.code === 'custom' ? candidate.params?.['themeContractErrorCode'] : undefined
      return customCode === 'THEME_TEMPLATE_MISSING'
    })
    expect(issue).toBeDefined()
    if (issue?.code !== 'custom') {
      throw new Error('beklenmeyen issue biçimi')
    }
    expect(issue.params).toEqual({ themeContractErrorCode: 'THEME_TEMPLATE_MISSING' })
    expect(issue.path).toEqual([])
  })
})

describe('THEME_TEMPLATES_SCHEMA — AC11 bilinmeyen ad (THEME_TEMPLATE_UNKNOWN)', () => {
  it('bilinmeyen bir şablon türü ("storefront-landing") THEME_TEMPLATE_UNKNOWN ile reddedilir', () => {
    const templates = [template('home'), template('404'), template('storefront-landing')]

    const result = THEME_TEMPLATES_SCHEMA.safeParse(templates)

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('beklenmeyen başarı')
    }
    const issue = result.error.issues.find((candidate) => candidate.path.at(-1) === 'type')
    if (issue?.code !== 'custom') {
      throw new Error('beklenmeyen issue biçimi')
    }
    expect(issue.params).toEqual({ themeContractErrorCode: 'THEME_TEMPLATE_UNKNOWN' })
    expect(issue.path).toEqual([2, 'type'])
  })
})

describe('THEME_TEMPLATES_SCHEMA — dizi şeklinin zorunlu sonucu: THEME_TEMPLATE_DUPLICATE', () => {
  it("aynı type iki kez tanımlanırsa THEME_TEMPLATE_DUPLICATE döner, path ikinci occurrence'ı gösterir", () => {
    const templates = [template('home'), template('404'), template('home')]

    const result = THEME_TEMPLATES_SCHEMA.safeParse(templates)

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('beklenmeyen başarı')
    }
    const issue = result.error.issues[0]
    if (issue?.code !== 'custom') {
      throw new Error('beklenmeyen issue biçimi')
    }
    expect(issue.params).toEqual({ themeContractErrorCode: 'THEME_TEMPLATE_DUPLICATE' })
    expect(issue.path).toEqual([2, 'type'])
  })
})
