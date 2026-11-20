// @arkesoft/i18n — `divideWithRounding` birim testleri (ROADMAP v0.0.18,
// T-027/S5b, AC-43(c))
//
// ⚠⚠ AC-43(c)'nin DÖRT satırı da BigInt seviyesinde test edilir — ikinci
// satır (`15/2`) ATLANAMAZ: yalnızca ayrışan vakalar test edilirse
// `half-even`, ".5'te hep aşağı" ile AYIRT EDİLEMEZ ve yanlış bir
// implementasyon yeşil geçer.

import { describe, expect, it } from 'vitest'

import { divideWithRounding } from '../rounding.js'

describe('divideWithRounding', () => {
  describe('AC-43(c) — dört yarım-nokta satırı', () => {
    it('5/2 (tam sonuç 2.5): half-up → 3, half-even → 2', () => {
      expect(divideWithRounding(5n, 2n, 'half-up')).toBe(3n)
      expect(divideWithRounding(5n, 2n, 'half-even')).toBe(2n)
    })

    it('⚠⚠ ATLANAMAZ — 15/2 (tam sonuç 7.5): half-up → 8, half-even → 8 (aynı)', () => {
      expect(divideWithRounding(15n, 2n, 'half-up')).toBe(8n)
      expect(divideWithRounding(15n, 2n, 'half-even')).toBe(8n)
    })

    it('25/10 (tam sonuç 2.5): half-up → 3, half-even → 2', () => {
      expect(divideWithRounding(25n, 10n, 'half-up')).toBe(3n)
      expect(divideWithRounding(25n, 10n, 'half-even')).toBe(2n)
    })

    it('negatif satır — -5/2 (tam sonuç -2.5): half-up → -3 (sıfırdan uzağa), half-even → -2', () => {
      expect(divideWithRounding(-5n, 2n, 'half-up')).toBe(-3n)
      expect(divideWithRounding(-5n, 2n, 'half-even')).toBe(-2n)
    })
  })

  describe('yarım nokta olmayan vakalar — ikisi de aynı sonuca yuvarlar', () => {
    it('8/3 = 2.667 (yarım nokta DEĞİL) → her iki modda 3 (yukarı)', () => {
      expect(divideWithRounding(8n, 3n, 'half-up')).toBe(3n)
      expect(divideWithRounding(8n, 3n, 'half-even')).toBe(3n)
    })

    it('7/3 = 2.333 → her iki modda 2 (aşağı)', () => {
      expect(divideWithRounding(7n, 3n, 'half-up')).toBe(2n)
      expect(divideWithRounding(7n, 3n, 'half-even')).toBe(2n)
    })
  })

  it('negatif payda ile de doğru işaret üretir (işaret numerator ⊕ denominator)', () => {
    expect(divideWithRounding(5n, -2n, 'half-up')).toBe(-3n)
    expect(divideWithRounding(-5n, -2n, 'half-up')).toBe(3n)
  })

  it('payda sıfırsa fırlatır', () => {
    expect(() => divideWithRounding(5n, 0n, 'half-up')).toThrow(/payda.*sıfır olamaz/)
  })

  it('tam bölünen değerler yuvarlama gerektirmez', () => {
    expect(divideWithRounding(10n, 2n, 'half-up')).toBe(5n)
    expect(divideWithRounding(10n, 2n, 'half-even')).toBe(5n)
    expect(divideWithRounding(-10n, 2n, 'half-up')).toBe(-5n)
  })
})
