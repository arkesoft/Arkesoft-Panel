// @arkesoft/i18n — `formatMoney` birim testleri (ROADMAP v0.0.18, T-027/S5b,
// AC-50'nin yarısı)

import { describe, expect, it } from 'vitest'

import { formatMoney } from '../format-money.js'
import { Money } from '../money.js'

describe('formatMoney', () => {
  it('TRY tutarını varsayılan (tr-TR) locale ile biçimler', () => {
    expect(formatMoney(Money.of(150_000, 'TRY'))).toBe('₺1.500,00')
  })

  it('negatif tutarı doğru biçimler', () => {
    expect(formatMoney(Money.of(-150_000, 'TRY'))).toBe('-₺1.500,00')
  })

  it('sıfır tutarı doğru biçimler', () => {
    expect(formatMoney(Money.zero('TRY'))).toBe('₺0,00')
  })

  it('TRY minorUnit (2) kadar ondalık basamak taşır — tek kuruş bile kaybolmaz', () => {
    expect(formatMoney(Money.of(5, 'TRY'))).toBe('₺0,05')
  })

  it('locale AÇIKÇA geçilebilir (biçimlendirici locale parametresinde JENERİKTİR)', () => {
    expect(formatMoney(Money.of(150_000, 'TRY'), { locale: 'tr-TR' })).toBe('₺1.500,00')
  })
})
