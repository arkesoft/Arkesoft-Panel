// @arkesoft/theme-sdk — `formatThemeContractPath` birim testleri (ROADMAP
// v0.0.9, T-010/S2, AC3'ün taşıyıcısı)

import { describe, expect, it } from 'vitest'

import { formatThemeContractPath } from '../paths.js'

describe('formatThemeContractPath', () => {
  it('karışık string/sayı segmentlerini brief örneğiyle birebir biçimlendirir', () => {
    expect(formatThemeContractPath(['templates', 2, 'slots', 0, 'id'])).toBe(
      'templates[2].slots[0].id',
    )
  })

  it('boş yol için boş dize döner (kök)', () => {
    expect(formatThemeContractPath([])).toBe('')
  })

  it('sayı ile başlayan yolda baştaki nokta eklenmez', () => {
    expect(formatThemeContractPath([0, 'id'])).toBe('[0].id')
  })

  it('tek string segment için baştaki nokta eklenmez', () => {
    expect(formatThemeContractPath(['id'])).toBe('id')
  })

  it('tek sayı segment için yalnızca köşeli parantez döner', () => {
    expect(formatThemeContractPath([0])).toBe('[0]')
  })

  it('ardışık iki sayı segmentini birleştirir', () => {
    expect(formatThemeContractPath([0, 1])).toBe('[0][1]')
  })

  it('ardışık iki string segmentini noktayla ayırır', () => {
    expect(formatThemeContractPath(['settings', 'primaryColor'])).toBe('settings.primaryColor')
  })
})
