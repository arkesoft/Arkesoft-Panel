// @arkesoft/i18n — `Money` birim testleri (ROADMAP v0.0.18, T-027/S5b, AC-43)

import { describe, expect, it } from 'vitest'

import { CurrencyMismatchError, FractionalMinorUnitError } from '../money-errors.js'
import { Money } from '../money.js'

describe('Money.of / Money.zero', () => {
  it('tam sayı amountMinor ile örnek üretir', () => {
    const money = Money.of(1500, 'TRY')
    expect(money.amountMinor).toBe(1500)
    expect(money.currency).toBe('TRY')
  })

  it('AC-43(a) — tam sayı OLMAYAN amountMinor FractionalMinorUnitError fırlatır', () => {
    expect(() => Money.of(19.99, 'TRY')).toThrow(FractionalMinorUnitError)

    let caught: unknown
    try {
      Money.of(19.99, 'TRY')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(FractionalMinorUnitError)
    expect(caught instanceof FractionalMinorUnitError && caught.code).toBe('FRACTIONAL_MINOR_UNIT')
    expect(caught instanceof FractionalMinorUnitError && caught.httpStatus).toBe(500)
  })

  it('zero() her zaman 0 kuruş döner', () => {
    expect(Money.zero('TRY').amountMinor).toBe(0)
  })
})

describe('Money.add / Money.subtract', () => {
  it('aynı para biriminde doğru toplar/çıkarır', () => {
    const a = Money.of(1000, 'TRY')
    const b = Money.of(250, 'TRY')
    expect(a.add(b).amountMinor).toBe(1250)
    expect(a.subtract(b).amountMinor).toBe(750)
  })

  it('AC-43(b) — para birimi uyuşmazlığında add CurrencyMismatchError fırlatır', () => {
    const tryMoney = Money.of(100, 'TRY')
    const usd = Money.of(100, 'USD' as never)
    expect(() => tryMoney.add(usd)).toThrow(CurrencyMismatchError)
  })

  it('AC-43(b) — para birimi uyuşmazlığında subtract CurrencyMismatchError fırlatır', () => {
    const tryMoney = Money.of(100, 'TRY')
    const usd = Money.of(100, 'USD' as never)
    expect(() => tryMoney.subtract(usd)).toThrow(CurrencyMismatchError)
  })
})

describe('Money.multiplyBy', () => {
  it('tam sayı çarpanla doğru çarpar', () => {
    expect(Money.of(150, 'TRY').multiplyBy(3).amountMinor).toBe(450)
    expect(Money.of(150, 'TRY').multiplyBy(0).amountMinor).toBe(0)
  })

  it('ondalık çarpan verilirse fırlatır (yuvarlama multiplyBy içinde hiç DEVREYE girmez)', () => {
    expect(() => Money.of(150, 'TRY').multiplyBy(1.5)).toThrow(/tam sayı çarpan bekleniyor/)
  })
})

describe('Money — güvenli tamsayı aralığı (gate turu bir düzeltmesi, Number.isSafeInteger)', () => {
  it('of: güvenli aralık SINIRINDAKİ değerler fırlatmaz (üst sınırı aşırı sıkmıyoruz)', () => {
    expect(Money.of(Number.MAX_SAFE_INTEGER, 'TRY').amountMinor).toBe(Number.MAX_SAFE_INTEGER)
    expect(Money.of(Number.MIN_SAFE_INTEGER, 'TRY').amountMinor).toBe(Number.MIN_SAFE_INTEGER)
  })

  it('of: güvenli aralığı aşan tam sayı (Number.isInteger true, Number.isSafeInteger false) fırlatır', () => {
    const unsafeButInteger = Number.MAX_SAFE_INTEGER + 2
    expect(() => Money.of(unsafeButInteger, 'TRY')).toThrow(/güvenli tamsayı aralığını aşıyor/)
  })

  it('add: toplam güvenli aralığı AŞARSA fırlatır (önceki asimetri — multiplyByRatio ile simetrik)', () => {
    const atLimit = Money.of(Number.MAX_SAFE_INTEGER, 'TRY')
    expect(() => atLimit.add(Money.of(2, 'TRY'))).toThrow(/güvenli tamsayı aralığını aşıyor/)
  })

  it('subtract: negatif yönde güvenli aralığı AŞARSA fırlatır', () => {
    const atLimit = Money.of(-Number.MAX_SAFE_INTEGER, 'TRY')
    expect(() => atLimit.subtract(Money.of(2, 'TRY'))).toThrow(/güvenli tamsayı aralığını aşıyor/)
  })

  it('multiplyBy: SESSİZCE yanlış (kuruş kaybı olan) bir sonuç DÖNMEZ — fırlatır', () => {
    // 999999999999999 * 11 BigInt ile tam değeri 10999999999999989 verir; IEEE-754
    // `number` aritmetiği bunu 10999999999999988'e yuvarlar — kesirsiz ama 1 kuruş YANLIŞ.
    const money = Money.of(999999999999999, 'TRY')
    expect(() => money.multiplyBy(11)).toThrow(/güvenli tamsayı aralığını aşıyor/)
  })

  it('multiplyBy: güvenli aralık içindeki çarpım hâlâ doğru sonuç döner (gevşetme yok)', () => {
    expect(Money.of(150, 'TRY').multiplyBy(3).amountMinor).toBe(450)
  })
})

describe('Money.multiplyByRatio — AC-43(c) dört satır', () => {
  it('of(5).multiplyByRatio({1,2}) → half-up 3, half-even 2', () => {
    expect(
      Money.of(5, 'TRY').multiplyByRatio({ numerator: 1, denominator: 2 }, 'half-up').amountMinor,
    ).toBe(3)
    expect(
      Money.of(5, 'TRY').multiplyByRatio({ numerator: 1, denominator: 2 }, 'half-even').amountMinor,
    ).toBe(2)
  })

  it('⚠⚠ ATLANAMAZ — of(15).multiplyByRatio({1,2}) → half-up 8, half-even 8 (aynı)', () => {
    expect(
      Money.of(15, 'TRY').multiplyByRatio({ numerator: 1, denominator: 2 }, 'half-up').amountMinor,
    ).toBe(8)
    expect(
      Money.of(15, 'TRY').multiplyByRatio({ numerator: 1, denominator: 2 }, 'half-even')
        .amountMinor,
    ).toBe(8)
  })

  it('of(25).multiplyByRatio({1,10}) → half-up 3, half-even 2', () => {
    expect(
      Money.of(25, 'TRY').multiplyByRatio({ numerator: 1, denominator: 10 }, 'half-up').amountMinor,
    ).toBe(3)
    expect(
      Money.of(25, 'TRY').multiplyByRatio({ numerator: 1, denominator: 10 }, 'half-even')
        .amountMinor,
    ).toBe(2)
  })

  it('negatif satır — of(-5).multiplyByRatio({1,2}) → half-up -3, half-even -2', () => {
    expect(
      Money.of(-5, 'TRY').multiplyByRatio({ numerator: 1, denominator: 2 }, 'half-up').amountMinor,
    ).toBe(-3)
    expect(
      Money.of(-5, 'TRY').multiplyByRatio({ numerator: 1, denominator: 2 }, 'half-even')
        .amountMinor,
    ).toBe(-2)
  })

  it('tam bölünen oranlarda yuvarlama gerekmez', () => {
    expect(
      Money.of(1000, 'TRY').multiplyByRatio({ numerator: 18, denominator: 100 }, 'half-up')
        .amountMinor,
    ).toBe(180)
  })

  it('ondalık (tam sayı olmayan) Ratio.numerator/denominator fırlatır', () => {
    expect(() =>
      Money.of(100, 'TRY').multiplyByRatio({ numerator: 1.5, denominator: 2 }, 'half-up'),
    ).toThrow(/Ratio\.numerator tam sayı olmalı/)
    expect(() =>
      Money.of(100, 'TRY').multiplyByRatio({ numerator: 1, denominator: 2.5 }, 'half-up'),
    ).toThrow(/Ratio\.denominator tam sayı olmalı/)
  })

  it('Ratio.denominator sıfırsa fırlatır', () => {
    expect(() =>
      Money.of(100, 'TRY').multiplyByRatio({ numerator: 1, denominator: 0 }, 'half-up'),
    ).toThrow(/denominator sıfır olamaz/)
  })

  it('yuvarlanmış sonuç güvenli tamsayı aralığını aşarsa fırlatır', () => {
    const hugeAmount = Number.MAX_SAFE_INTEGER
    expect(() =>
      Money.of(hugeAmount, 'TRY').multiplyByRatio({ numerator: 2, denominator: 1 }, 'half-up'),
    ).toThrow(/güvenli tamsayı aralığını aşıyor/)
  })
})

describe('Money.compare / Money.equals', () => {
  it('aynı para biriminde doğru karşılaştırır', () => {
    expect(Money.of(100, 'TRY').compare(Money.of(200, 'TRY'))).toBe(-1)
    expect(Money.of(200, 'TRY').compare(Money.of(100, 'TRY'))).toBe(1)
    expect(Money.of(100, 'TRY').compare(Money.of(100, 'TRY'))).toBe(0)
  })

  it('equals doğru eşitlik döner', () => {
    expect(Money.of(100, 'TRY').equals(Money.of(100, 'TRY'))).toBe(true)
    expect(Money.of(100, 'TRY').equals(Money.of(200, 'TRY'))).toBe(false)
  })

  it('AC-43(b) — compare para birimi uyuşmazlığında fırlatır (false/belirsiz sıra DÖNMEZ)', () => {
    const tryMoney = Money.of(100, 'TRY')
    const usd = Money.of(100, 'USD' as never)
    expect(() => tryMoney.compare(usd)).toThrow(CurrencyMismatchError)
  })

  it('AC-43(b) — equals para birimi uyuşmazlığında fırlatır (false DÖNMEZ)', () => {
    const tryMoney = Money.of(100, 'TRY')
    const usd = Money.of(100, 'USD' as never)
    expect(() => tryMoney.equals(usd)).toThrow(CurrencyMismatchError)
  })
})

describe('Money.toJSON', () => {
  it('amountMinor ve currency alanlarını taşır', () => {
    expect(Money.of(1234, 'TRY').toJSON()).toEqual({ amountMinor: 1234, currency: 'TRY' })
    expect(JSON.stringify(Money.of(1234, 'TRY'))).toBe('{"amountMinor":1234,"currency":"TRY"}')
  })
})
