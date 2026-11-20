// @arkesoft/i18n — interpolate.ts (formatMessage) testleri (ROADMAP v0.0.18,
// T-027/S5a)
//
// ⚠ Dürüst kayıt: 35 anahtarın HİÇBİRİ bu sürümde değişken taşımıyor ⇒ bu
// fonksiyonun bugün ÜRETİM tüketicisi YOK — testlerin tamamı SENTETİK
// fixture (bkz. interpolate.ts dosya başı yorumu).

import { describe, expect, it } from 'vitest'

import { formatMessage } from '../interpolate.js'

describe('formatMessage', () => {
  it('tek değişkeni doğru şekilde ara-değerler', () => {
    expect(formatMessage('Merhaba {name}.', { name: 'Ayşe' })).toBe('Merhaba Ayşe.')
  })

  it('birden çok değişkeni ara-değerler', () => {
    expect(formatMessage('{greeting}, {name}!', { greeting: 'Merhaba', name: 'Ayşe' })).toBe(
      'Merhaba, Ayşe!',
    )
  })

  it('değişkensiz şablonu değişmeden döner', () => {
    expect(formatMessage('Sabit metin.', {})).toBe('Sabit metin.')
  })

  it('⚠ EKSİK değişken FIRLATIR (sessizce boş bırakmaz)', () => {
    expect(() => formatMessage('Merhaba {name}.', {})).toThrow()
  })

  it('⚠⚠ FAZLA (şablonda kullanılmayan) değişken FIRLATIR — iki yönlü fail-closed', () => {
    expect(() => formatMessage('Sabit metin.', { unused: 'x' })).toThrow()
  })

  it('bir değişken eksik, biri fazlaysa da FIRLATIR (eksik önce denetlenir)', () => {
    expect(() => formatMessage('{present}', { unused: 'x' })).toThrow()
  })

  it('aynı değişken birden çok yerde geçerse tek eksik/fazla sayılır, hepsi değiştirilir', () => {
    expect(formatMessage('{name} - {name}', { name: 'A' })).toBe('A - A')
  })
})
