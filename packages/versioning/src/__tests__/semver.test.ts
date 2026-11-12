// @arkesoft/versioning — semver.ts birim testleri (ROADMAP v0.0.21, T-018/S1)

import { describe, expect, it } from 'vitest'

import {
  compareSemver,
  compareSemverParts,
  extractMajor,
  parseSemver,
  SEMVER_FORMAT_PATTERN,
  type SemverParts,
} from '../semver.js'

describe('SEMVER_FORMAT_PATTERN / extractMajor', () => {
  it('geçerli bir semver biçimini kabul eder ve major bileşenini çıkarır', () => {
    expect(SEMVER_FORMAT_PATTERN.test('1.2.3')).toBe(true)
    expect(extractMajor('1.2.3')).toBe(1)
    expect(extractMajor('0.1.0')).toBe(0)
    expect(extractMajor('12.34.56')).toBe(12)
  })

  it('ön-sürüm ve build metadata taşıyan geçerli dizeleri kabul eder', () => {
    expect(extractMajor('1.2.3-rc.1')).toBe(1)
    expect(extractMajor('1.2.3+build.5')).toBe(1)
    expect(extractMajor('1.2.3-rc.1+build.5')).toBe(1)
  })

  it('ÖLÇÜLEN SAPMA SINIFI: "1.0.0-01" baştaki sıfır içeren sayısal ön-sürüm tanımlayıcısını REDDEDER (semver.org uyumu)', () => {
    expect(SEMVER_FORMAT_PATTERN.test('1.0.0-01')).toBe(false)
    expect(extractMajor('1.0.0-01')).toBeUndefined()
  })

  it('biçimsiz dizelerde undefined döner (dizeden tipe geçişin tek sınırı)', () => {
    expect(extractMajor('')).toBeUndefined()
    expect(extractMajor('1.2')).toBeUndefined()
    expect(extractMajor('v1.2.3')).toBeUndefined()
    expect(extractMajor('1.2.3.4')).toBeUndefined()
    expect(extractMajor('not-a-version')).toBeUndefined()
  })
})

describe('parseSemver', () => {
  it('major/minor/patch/prerelease bileşenlerini doğru ayrıştırır', () => {
    const parts = parseSemver('1.2.3')
    expect(parts).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined })
  })

  it("ön-sürümü ayrıştırır, build metadata'yı atar", () => {
    const parts = parseSemver('1.2.3-rc.1+build.5')
    expect(parts).toEqual({ major: 1, minor: 2, patch: 3, prerelease: 'rc.1' })
  })

  it('yalnızca build metadata taşıyan sürümde prerelease undefined kalır', () => {
    const parts = parseSemver('1.2.3+build.5')
    expect(parts).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined })
  })

  it('biçimsiz dizede undefined döner', () => {
    expect(parseSemver('1.2.3-01')).toBeUndefined()
    expect(parseSemver('abc')).toBeUndefined()
  })
})

describe('compareSemverParts (TOPLAM — sınırın ötesinde)', () => {
  const v = (major: number, minor: number, patch: number, prerelease?: string): SemverParts => ({
    major,
    minor,
    patch,
    prerelease,
  })

  it('major/minor/patch farkına göre sıralar', () => {
    expect(compareSemverParts(v(1, 0, 0), v(2, 0, 0))).toBe(-1)
    expect(compareSemverParts(v(2, 0, 0), v(1, 0, 0))).toBe(1)
    expect(compareSemverParts(v(1, 1, 0), v(1, 2, 0))).toBe(-1)
    expect(compareSemverParts(v(1, 2, 1), v(1, 2, 0))).toBe(1)
    expect(compareSemverParts(v(1, 2, 3), v(1, 2, 3))).toBe(0)
  })

  it('ön-sürüm taşımayan sürüm, aynı üçlüde ön-sürüm taşıyandan ÜSTÜNDÜR', () => {
    expect(compareSemverParts(v(1, 0, 0), v(1, 0, 0, 'rc.1'))).toBe(1)
    expect(compareSemverParts(v(1, 0, 0, 'rc.1'), v(1, 0, 0))).toBe(-1)
  })

  it('ön-sürüm tanımlayıcılarını semver.org "Precedence" kurallarıyla karşılaştırır', () => {
    // sayısal < alfasayısal (madde 11.4.2)
    expect(compareSemverParts(v(1, 0, 0, '1'), v(1, 0, 0, 'alpha'))).toBe(-1)
    // sayısal tanımlayıcılar SAYISAL olarak karşılaştırılır (11 > 2, dize olarak "11" < "2")
    expect(compareSemverParts(v(1, 0, 0, 'rc.11'), v(1, 0, 0, 'rc.2'))).toBe(1)
    // alfasayısal tanımlayıcılar ASCII sözlük sırasına göre
    expect(compareSemverParts(v(1, 0, 0, 'alpha'), v(1, 0, 0, 'beta'))).toBe(-1)
    // daha FAZLA tanımlayıcı, önceki tanımlayıcılar eşitse ÜSTÜNDÜR
    expect(compareSemverParts(v(1, 0, 0, 'alpha.1'), v(1, 0, 0, 'alpha'))).toBe(1)
    expect(compareSemverParts(v(1, 0, 0, 'alpha'), v(1, 0, 0, 'alpha.1'))).toBe(-1)
    expect(compareSemverParts(v(1, 0, 0, 'alpha'), v(1, 0, 0, 'alpha'))).toBe(0)
  })
})

describe('compareSemver (sarmalayıcı — dizeden tipe geçiş + toplam karşılaştırma)', () => {
  it('geçerli iki dizeyi karşılaştırır', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1)
  })

  it('herhangi biri biçimsizse undefined döner', () => {
    expect(compareSemver('not-a-version', '1.0.0')).toBeUndefined()
    expect(compareSemver('1.0.0', 'not-a-version')).toBeUndefined()
    expect(compareSemver('1.0.0-01', '1.0.0')).toBeUndefined()
  })
})
