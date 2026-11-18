// @arkesoft/versioning — range.ts birim testleri (ROADMAP v0.0.21, T-018/S1)
//
// AC-3 ZORUNLU negatif kanıt: `satisfies('1.0.0', …) === false` VE
// `satisfies('0.0.9', …) === false` — yoksa kriter TOTOLOJİKTİR. R-A6
// ZORUNLU sınır testleri: `^0.1.0` / `^0.0.3` / `~0.1.0` npm UYUMLU 0.x
// özel hâlleri.

import { describe, expect, it } from 'vitest'

import {
  isThemeReleaseCompatibleWithSdk,
  parseRange,
  satisfies,
  satisfiesParsed,
} from '../range.js'
import { parseSemver } from '../semver.js'

describe('parseRange — kapalı gramer', () => {
  it('tek bir operatörlü karşılaştırıcıyı ayrıştırır', () => {
    const range = parseRange('>=1.0.0')
    expect(range).toEqual({
      comparators: [
        { operator: '>=', version: { major: 1, minor: 0, patch: 0, prerelease: undefined } },
      ],
    })
  })

  it('boşlukla ayrılmış VE-birleşimini ayrıştırır', () => {
    const range = parseRange('>=1.0.0 <2.0.0')
    expect(range?.comparators).toHaveLength(2)
  })

  it('operatörsüz çekirdeği "=" olarak normalize eder (kural 1)', () => {
    const range = parseRange('1.2.3')
    expect(range).toEqual({
      comparators: [
        { operator: '=', version: { major: 1, minor: 2, patch: 3, prerelease: undefined } },
      ],
    })
  })

  it('boş dizeyi reddeder', () => {
    expect(parseRange('')).toBeUndefined()
    expect(parseRange('   ')).toBeUndefined()
  })

  it('KAPSAM DIŞI gramer uzantılarını reddeder: ayrık birleşim (||)', () => {
    expect(parseRange('1.0.0 || 2.0.0')).toBeUndefined()
  })

  it('KAPSAM DIŞI gramer uzantılarını reddeder: x/* joker', () => {
    expect(parseRange('1.x')).toBeUndefined()
    expect(parseRange('1.*.0')).toBeUndefined()
  })

  it('KAPSAM DIŞI gramer uzantılarını reddeder: tire aralığı', () => {
    expect(parseRange('1.0.0 - 2.0.0')).toBeUndefined()
  })

  it('geçersiz semver çekirdeği taşıyan bir karşılaştırıcıyı reddeder', () => {
    expect(parseRange('>=1.0.0-01')).toBeUndefined()
    expect(parseRange('not-a-version')).toBeUndefined()
  })
})

describe('satisfies — AC-3 ZORUNLU negatif kanıt', () => {
  it('üst sınırın TAM ÜZERİNDEKİ sürümü reddeder (totoloji DEĞİL)', () => {
    expect(satisfies('1.0.0', '>=0.1.0 <1.0.0')).toBe(false)
  })

  it('alt sınırın ALTINDAKİ sürümü reddeder (totoloji DEĞİL)', () => {
    expect(satisfies('0.0.9', '>=0.1.0 <1.0.0')).toBe(false)
  })

  it('aralık içindeki sürümü kabul eder', () => {
    expect(satisfies('0.5.0', '>=0.1.0 <1.0.0')).toBe(true)
  })
})

describe('satisfies — operatör semantikleri', () => {
  it('= (operatörsüz çekirdek dahil)', () => {
    expect(satisfies('1.2.3', '1.2.3')).toBe(true)
    expect(satisfies('1.2.4', '1.2.3')).toBe(false)
    expect(satisfies('1.2.3', '=1.2.3')).toBe(true)
  })

  it('> / < / >= / <=', () => {
    expect(satisfies('1.2.4', '>1.2.3')).toBe(true)
    expect(satisfies('1.2.3', '>1.2.3')).toBe(false)
    expect(satisfies('1.2.2', '<1.2.3')).toBe(true)
    expect(satisfies('1.2.3', '<1.2.3')).toBe(false)
    expect(satisfies('1.2.3', '>=1.2.3')).toBe(true)
    expect(satisfies('1.2.3', '<=1.2.3')).toBe(true)
  })
})

describe('satisfies — ^ ve ~ npm UYUMLU 0.x özel hâlleri (R-A6, ZORUNLU sınır testleri)', () => {
  it('^0.1.0 ⇒ >=0.1.0 <0.2.0', () => {
    expect(satisfies('0.1.0', '^0.1.0')).toBe(true)
    expect(satisfies('0.1.9', '^0.1.0')).toBe(true)
    expect(satisfies('0.0.9', '^0.1.0')).toBe(false)
    expect(satisfies('0.2.0', '^0.1.0')).toBe(false)
  })

  it('^0.0.3 ⇒ >=0.0.3 <0.0.4', () => {
    expect(satisfies('0.0.3', '^0.0.3')).toBe(true)
    expect(satisfies('0.0.2', '^0.0.3')).toBe(false)
    expect(satisfies('0.0.4', '^0.0.3')).toBe(false)
  })

  it('~0.1.0 ⇒ >=0.1.0 <0.2.0', () => {
    expect(satisfies('0.1.0', '~0.1.0')).toBe(true)
    expect(satisfies('0.1.9', '~0.1.0')).toBe(true)
    expect(satisfies('0.0.9', '~0.1.0')).toBe(false)
    expect(satisfies('0.2.0', '~0.1.0')).toBe(false)
  })

  it('^1.2.3 ⇒ >=1.2.3 <2.0.0 (major > 0 genel hâli)', () => {
    expect(satisfies('1.2.3', '^1.2.3')).toBe(true)
    expect(satisfies('1.9.9', '^1.2.3')).toBe(true)
    expect(satisfies('2.0.0', '^1.2.3')).toBe(false)
    expect(satisfies('1.2.2', '^1.2.3')).toBe(false)
  })
})

describe('satisfies — asgari ön-sürüm kuralı (kural 3)', () => {
  it('ön-sürüm taşıyan sürüm, eşleşen ön-sürümlü karşılaştırıcı YOKSA aralığı KARŞILAMAZ', () => {
    expect(satisfies('1.0.0-rc.1', '>=1.0.0')).toBe(false)
  })

  it('İSTİSNA: karşılaştırıcı AYNI major.minor.patch üçlüsünde kendi ön-sürümünü taşıyorsa karşılar', () => {
    expect(satisfies('1.0.0-rc.1', '>=1.0.0-rc.0')).toBe(true)
    expect(satisfies('1.0.0-rc.0', '>=1.0.0-rc.0')).toBe(true)
  })

  it('üçlü eşleşmiyorsa istisna tetiklenmez, hâlâ reddedilir', () => {
    expect(satisfies('2.0.0-rc.1', '>=1.0.0-rc.0 <2.0.0')).toBe(false)
  })

  it('ön-sürüm taşımayan sürümler için kural hiç tetiklenmez', () => {
    expect(satisfies('1.0.0', '>=1.0.0')).toBe(true)
  })
})

describe('satisfies — FAIL-CLOSED', () => {
  it('biçimsiz sürüm için false döner ("geçersiz" ile "karşılamıyor" aynı sonuca düşer)', () => {
    expect(satisfies('not-a-version', '>=1.0.0')).toBe(false)
  })

  it('biçimsiz aralık için false döner', () => {
    expect(satisfies('1.0.0', '1.0.0 || 2.0.0')).toBe(false)
    expect(satisfies('1.0.0', '')).toBe(false)
  })
})

describe('satisfiesParsed — TOPLAM (sınırın ötesinde, önceden ayrıştırılmış girdi)', () => {
  it('ayrıştırılmış sürüm ve aralık üzerinde doğrudan çalışır', () => {
    const version = parseSemver('1.5.0')
    const range = parseRange('>=1.0.0 <2.0.0')
    if (version === undefined || range === undefined) {
      throw new Error('test fixture ayrıştırılamadı')
    }
    expect(satisfiesParsed(version, range)).toBe(true)
  })
})

describe('isThemeReleaseCompatibleWithSdk', () => {
  it('sdkVersion, sdkRange içindeyse uyumludur', () => {
    expect(
      isThemeReleaseCompatibleWithSdk({ sdkRange: '>=0.1.0 <1.0.0', sdkVersion: '0.1.1' }),
    ).toBe(true)
  })

  it('sdkVersion, sdkRange dışındaysa uyumsuzdur', () => {
    expect(
      isThemeReleaseCompatibleWithSdk({ sdkRange: '>=0.1.0 <1.0.0', sdkVersion: '1.0.0' }),
    ).toBe(false)
  })

  it('biçimsiz girdi için fail-closed false döner', () => {
    expect(
      isThemeReleaseCompatibleWithSdk({ sdkRange: '>=0.1.0 <1.0.0', sdkVersion: 'not-a-version' }),
    ).toBe(false)
  })
})
