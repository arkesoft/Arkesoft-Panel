// @arkesoft/versioning — semver.org "Precedence" ZİNCİR testi (qa gate T-018
// tur 1, kendi bulgusu — A-S1-1 teyidi).
//
// ⚠⚠ A-S1-1 (S1'in varsayımı, teyit İSTENEN): "`compareSemverParts`'ın
// ön-sürüm karşılaştırma algoritması brief'te İMZASIYLA verildi ama İÇ
// MANTIĞI verilmedi → semver.org RESMİ precedence kuralı BİREBİR
// uygulandı … `architect`/`qa` TEYİT ETMELİ." `semver.test.ts` bu kuralı
// İKİLİ (pairwise) karşılaştırmalarla test ediyor (sayısal < alfasayısal,
// sayısal-sayısal karşılaştırma, alfasayısal-alfasayısal ASCII sırası,
// uzunluk farkı) — ama semver.org'un KENDİ örnek ZİNCİRİNİ (resmi
// spesifikasyon, "Precedence" bölümü) TEK bir monoton dizi olarak HİÇ
// pinlemiyordu. Bu dosya o boşluğu kapatır: semver.org'un resmi örneği
//
//   1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta <
//   1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0
//
// ARDIŞIK HER ÇİFT için `compareSemverParts` (-1) ve `compareSemver`
// (dizeden, sarmalayıcı üzerinden de) döndürür; TRANSİTİVİTE de (her çift,
// ardışık olmayanlar DAHİL) AYRICA doğrulanır — tek bir yanlış dal
// (ör. sayısal/alfasayısal karışık karşılaştırmada ters işaret) zincirin
// ORTASINDA sessizce geçebilirdi, ardışık-çift testi TEK BAŞINA bunu
// YAKALAYAMAZDI (örn. iki yanlış dal birbirini "götürüp" ardışık çiftleri
// doğru sıralayabilir ama transitiviteyi bozabilirdi — bu yüzden ikisi de
// yazılır).
//
// Sonuç: A-S1-1 TEYİT EDİLDİ — `compareSemverParts` bu ZİNCİRİN TAMAMINDA
// semver.org'un resmi örneğiyle birebir uyumlu.

import { describe, expect, it } from 'vitest'

import { compareSemver, compareSemverParts, parseSemver, type SemverParts } from '../semver.js'

/** semver.org "Precedence" bölümünün resmi örnek zinciri — artan sırada. */
const OFFICIAL_PRECEDENCE_CHAIN: readonly string[] = [
  '1.0.0-alpha',
  '1.0.0-alpha.1',
  '1.0.0-alpha.beta',
  '1.0.0-beta',
  '1.0.0-beta.2',
  '1.0.0-beta.11',
  '1.0.0-rc.1',
  '1.0.0',
]

function partsOf(version: string): SemverParts {
  const parts = parseSemver(version)
  if (parts === undefined) {
    throw new Error(`fixture biçimsiz: ${version}`)
  }
  return parts
}

describe('A-S1-1 teyidi — semver.org resmi precedence ZİNCİRİ (qa gate T-018 tur 1)', () => {
  it('zincirin HER ÜYESİ gerçekten biçimsel bir semver (fikstür sağlığı)', () => {
    for (const version of OFFICIAL_PRECEDENCE_CHAIN) {
      expect(parseSemver(version), `"${version}" ayrıştırılamadı`).not.toBeUndefined()
    }
  })

  it('ARDIŞIK her çift için compareSemverParts(önceki, sonraki) === -1', () => {
    for (let index = 0; index < OFFICIAL_PRECEDENCE_CHAIN.length - 1; index += 1) {
      const lower = OFFICIAL_PRECEDENCE_CHAIN[index]
      const higher = OFFICIAL_PRECEDENCE_CHAIN[index + 1]
      if (lower === undefined || higher === undefined) {
        throw new Error('zincir indeksleme hatası — fikstür bozuk')
      }
      expect(
        compareSemverParts(partsOf(lower), partsOf(higher)),
        `"${lower}" < "${higher}" bekleniyordu`,
      ).toBe(-1)
      // Ters yön de simetrik olarak doğrulanır (toplam sıralamanın
      // antisimetri özelliği).
      expect(
        compareSemverParts(partsOf(higher), partsOf(lower)),
        `"${higher}" > "${lower}" bekleniyordu`,
      ).toBe(1)
    }
  })

  it('TRANSİTİVİTE: ARDIŞIK OLMAYAN her çift de doğru sırada (tek bir yanlış dal zincirin ortasında saklanamaz)', () => {
    for (let i = 0; i < OFFICIAL_PRECEDENCE_CHAIN.length; i += 1) {
      for (let j = i + 1; j < OFFICIAL_PRECEDENCE_CHAIN.length; j += 1) {
        const lower = OFFICIAL_PRECEDENCE_CHAIN[i]
        const higher = OFFICIAL_PRECEDENCE_CHAIN[j]
        if (lower === undefined || higher === undefined) {
          throw new Error('zincir indeksleme hatası — fikstür bozuk')
        }
        expect(
          compareSemverParts(partsOf(lower), partsOf(higher)),
          `[${String(i)},${String(j)}] "${lower}" < "${higher}" bekleniyordu`,
        ).toBe(-1)
      }
    }
  })

  it('aynı zincir compareSemver (dizeden-tipe sarmalayıcı) üzerinden de AYNI sonucu verir', () => {
    for (let index = 0; index < OFFICIAL_PRECEDENCE_CHAIN.length - 1; index += 1) {
      const lower = OFFICIAL_PRECEDENCE_CHAIN[index]
      const higher = OFFICIAL_PRECEDENCE_CHAIN[index + 1]
      if (lower === undefined || higher === undefined) {
        throw new Error('zincir indeksleme hatası — fikstür bozuk')
      }
      expect(compareSemver(lower, higher)).toBe(-1)
    }
  })

  // ⚠ Semver.org spesifikasyonu: build metadata (`+...`) ÖNCELİK
  // karşılaştırmasına HİÇ KATILMAZ ("Build metadata SHOULD be ignored when
  // determining version precedence"). `SemverParts` build metadata'yı
  // TAŞIMADIĞI için (`semver.ts` dosya başı notu) bu bir TASARIM
  // GARANTİSİDİR — ama `compareSemver` SARMALAYICISININ (dizeden okuyan
  // katman) bunu GERÇEKTEN uyguladığı ayrıca ÖLÇÜLMELİ (bu paketin kendi
  // `semver.test.ts`'inde yalnızca `extractMajor('1.2.3+build.5')` ve
  // `parseSemver(...).prerelease === undefined` pinleniyordu — iki farklı
  // build metadata taşıyan AYNI sürümün compareSemver'den 0 döndüğü HİÇ
  // doğrudan test edilmemişti).
  it('build metadata karşılaştırmaya KATILMAZ: aynı çekirdek+prerelease, FARKLI build metadata → 0 (eşit)', () => {
    expect(compareSemver('1.0.0+build.1', '1.0.0+build.999')).toBe(0)
    expect(compareSemver('1.0.0-rc.1+exp.sha.5114f85', '1.0.0-rc.1+20130313144700')).toBe(0)
    expect(compareSemverParts(partsOf('1.0.0-rc.1+aaa'), partsOf('1.0.0-rc.1+zzz'))).toBe(0)
  })
})
