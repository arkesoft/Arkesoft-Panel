// @arkesoft/theme-sdk — `../semver-format.ts` birim testleri (ROADMAP v0.0.9,
// T-010 düzeltme turu 1/3 · parti B, B4 bulgusu)
//
// ⚠ ZORUNLU KANIT (B4) — `"1.0.0-01"` artık `manifest.ts`'in `version`/
// `sdkRange` biçim kontrolü İLE `migrations/chain.ts`'in `extractMajor()`'ı
// ARASINDA TEK, TUTARLI bir sonuç üretir (ikisi de REDDEDİYOR — resmi
// semver.org spesifikasyonu sayısal prerelease tanımlayıcılarında BAŞTAKİ
// SIFIRI yasaklar). Önceki tur bu girdi için BİR tüketicide kabul, BİR
// tüketicide red üretiyordu (manifest.ts'in o anki yerel, daha gevşek
// deseni). Bu dosya üç şeyi pinler: (1) paylaşılan desen "1.0.0-01"'i
// reddeder (2) `extractMajor("1.0.0-01")` `undefined` döner (3) normal
// semver'ler (prerelease'siz VEYA geçerli prerelease'li) hâlâ kabul edilir
// (gerileme yok).

import { describe, expect, it } from 'vitest'

import { extractMajor, SEMVER_FORMAT_PATTERN } from '../semver-format.js'

describe('SEMVER_FORMAT_PATTERN — B4: prerelease baştaki sıfır REDDEDİLİR', () => {
  it('"1.0.0-01" biçim deseninden GEÇMEZ (resmi semver.org: sayısal tanımlayıcıda baştaki sıfır yasak)', () => {
    expect(SEMVER_FORMAT_PATTERN.test('1.0.0-01')).toBe(false)
  })

  it('"1.0.0-alpha.01" da REDDEDİLİR (ikinci prerelease tanımlayıcısı da sayısal + baştaki sıfır)', () => {
    expect(SEMVER_FORMAT_PATTERN.test('1.0.0-alpha.01')).toBe(false)
  })

  it("gerileme yok — prerelease'siz bir semver kabul edilir", () => {
    expect(SEMVER_FORMAT_PATTERN.test('1.2.3')).toBe(true)
  })

  it('gerileme yok — geçerli (baştaki sıfırsız) bir prerelease kabul edilir', () => {
    expect(SEMVER_FORMAT_PATTERN.test('1.0.0-alpha.1')).toBe(true)
  })
})

describe('extractMajor — B4: "1.0.0-01" undefined döner (gevşek desenin ESKİ KABULÜ artık YOK)', () => {
  it('"1.0.0-01" için extractMajor undefined döner', () => {
    expect(extractMajor('1.0.0-01')).toBeUndefined()
  })

  it('geçerli bir semver için major doğru çıkarılır (gerileme yok)', () => {
    expect(extractMajor('2.5.1')).toBe(2)
  })
})
