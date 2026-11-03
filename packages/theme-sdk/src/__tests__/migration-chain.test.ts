// @arkesoft/theme-sdk — `validateMigrationChain` topoloji testleri (ROADMAP
// v0.0.9, T-010/S4, AC7 + AC8'in taşıyıcısı)
//
// ⚠ AC8 "ÜÇ AYRI KOD, ÜÇ AYRI TEST" şartı: boşluk (`THEME_MIGRATION_GAP`),
// tekrar (`THEME_MIGRATION_DUPLICATE`), döngü (`THEME_MIGRATION_CYCLE`) için
// AYRI testler yazılmıştır — tek birleşik test po'nun DoD'u tarafından
// YETERSİZ sayılıyor. Her testte `issues.length` TAM OLARAK 1 doğrulanır ki
// bir senaryonun BİR BAŞKA koda sızmadığı (ör. döngü tespitinin aynı anda
// sahte bir boşluk bulgusu üretmediği) ölçülsün.

import { describe, expect, it } from 'vitest'

import { THEME_CONTRACT_MESSAGES } from '../messages.js'
import type { ThemeSettingsMigration } from '../migrations/chain.js'
import { validateMigrationChain } from '../migrations/chain.js'

/** Testlerde `migrate` alanının gövdesi önemsiz — kimlik fonksiyonu yeter (bu dosya `migrate`'i ASLA çağırmaz, S6'nın işi). */
function identityMigration(from: string, to: string): ThemeSettingsMigration {
  return { from, to, migrate: (settings: unknown) => settings }
}

describe('validateMigrationChain — pozitif durum', () => {
  it('tek parça, döngüsüz, hedef majoru karşılayan zincir kabul edilir', () => {
    const migrations = [identityMigration('1.0.0', '1.1.0'), identityMigration('1.1.0', '2.0.0')]

    const result = validateMigrationChain(migrations, '2.0.0')

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }
    expect(result.value).toBe(migrations)
    expect(result.warnings).toEqual([])
  })

  it('migration gerektirmeyen ilk sürüm (major 1) boş zincirle kabul edilir', () => {
    const result = validateMigrationChain([], '1.0.0')

    expect(result.ok).toBe(true)
  })
})

describe('validateMigrationChain — AC8 boşluk (THEME_MIGRATION_GAP)', () => {
  it('1.0.0→1.1.0 ve 1.3.0→2.0.0 arasında 1.1.0→1.3.0 eksikse THEME_MIGRATION_GAP döner', () => {
    const migrations = [identityMigration('1.0.0', '1.1.0'), identityMigration('1.3.0', '2.0.0')]

    const result = validateMigrationChain(migrations, '2.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toEqual([
      {
        code: 'THEME_MIGRATION_GAP',
        path: 'migrations[1].from',
        message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_GAP,
      },
    ])
  })
})

describe('validateMigrationChain — AC8 tekrar (THEME_MIGRATION_DUPLICATE)', () => {
  it('aynı from iki kez tanımlanırsa THEME_MIGRATION_DUPLICATE döner', () => {
    const migrations = [identityMigration('1.0.0', '1.1.0'), identityMigration('1.0.0', '1.2.0')]

    const result = validateMigrationChain(migrations, '1.2.0')

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toEqual([
      {
        code: 'THEME_MIGRATION_DUPLICATE',
        path: 'migrations[1].from',
        message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_DUPLICATE,
      },
    ])
  })
})

describe('validateMigrationChain — AC8 döngü (THEME_MIGRATION_CYCLE)', () => {
  it('from zinciri başa dönerse THEME_MIGRATION_CYCLE döner', () => {
    const migrations = [identityMigration('1.0.0', '1.1.0'), identityMigration('1.1.0', '1.0.0')]

    const result = validateMigrationChain(migrations, '1.1.0')

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toEqual([
      {
        code: 'THEME_MIGRATION_CYCLE',
        path: 'migrations[0].from',
        message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_CYCLE,
      },
    ])
  })
})

describe('validateMigrationChain — AC7 eksik hedef major (THEME_MIGRATION_MISSING)', () => {
  it('version 2.0.0 ama major 2ye ulaşan migration yoksa THEME_MIGRATION_MISSING döner', () => {
    const migrations = [identityMigration('1.0.0', '1.1.0')]

    const result = validateMigrationChain(migrations, '2.0.0')

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toEqual([
      {
        code: 'THEME_MIGRATION_MISSING',
        path: 'migrations',
        message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_MISSING,
      },
    ])
  })

  it('zincir hedef majora ulaşıyorsa THEME_MIGRATION_MISSING ÜRETİLMEZ', () => {
    const migrations = [identityMigration('1.0.0', '1.1.0'), identityMigration('1.1.0', '2.0.0')]

    const result = validateMigrationChain(migrations, '2.0.0')

    expect(result.ok).toBe(true)
  })
})

describe('validateMigrationChain — biçim denetimi (semver karşılaştırması DEĞİL)', () => {
  it('from alanı semver biçiminde değilse THEME_MANIFEST_INVALID döner, karşılaştırma yapılmaz', () => {
    const migrations = [identityMigration('not-a-semver', '1.1.0')]

    const result = validateMigrationChain(migrations, '1.1.0')

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toEqual([
      {
        code: 'THEME_MANIFEST_INVALID',
        path: 'migrations[0].from',
        message: THEME_CONTRACT_MESSAGES.THEME_MANIFEST_INVALID,
      },
    ])
  })

  // ⚠ F6 ZORUNLU KANIT (T-010 düzeltme turu 2/3, qa'nın bulgusu) — `../semver-
  // format.test.ts` `extractMajor('1.0.0-01')`'i YALNIZCA `../semver-format.js`'i
  // DOĞRUDAN ithal ederek test ediyordu; bu dosyanın TÜKETTİĞİ YOL
  // (`validateMigrationChain` → `extractMajor`) AYNI özel değerle HİÇBİR
  // YERDE test EDİLMEMİŞTİ (B4'ün sapma kapanışının gerçek iddiası —
  // "ikisi de REDDEDİYOR" — bu paylaşılan modülün İKİ TÜKETİCİSİNDEN
  // yalnızca biri doğrulanıyordu).
  it('B4/F6: "1.0.0-01" (prerelease baştaki sıfır) `from` alanında THEME_MANIFEST_INVALID döner — extractMajor() YOLU da pinlenir', () => {
    const migrations = [identityMigration('1.0.0-01', '1.1.0')]

    const result = validateMigrationChain(migrations, '1.1.0')

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toEqual([
      {
        code: 'THEME_MANIFEST_INVALID',
        path: 'migrations[0].from',
        message: THEME_CONTRACT_MESSAGES.THEME_MANIFEST_INVALID,
      },
    ])
  })
})

// ⚠ K3 PİN TESTLERİ (ROADMAP A3/`:1745`, T-012/architect K3, T-012/S3) —
// `chain.ts`'in `themeMajor > 1` eşiği BU TASK'TA DEĞİŞTİRİLMEDİ (diff boş,
// handoff'ta `git diff` ile kanıtlanır). Bu iki test BUGÜNKÜ davranışı
// BELGELİ kılar: `0.x` aralığında (major 1'e ulaşmamış, yani "major 1'den
// KÜÇÜK" değil — burada `themeMajor === 0` durumu) `THEME_MIGRATION_MISSING`
// kontrolü HİÇ ÇALIŞMAZ (`themeMajor > 1` koşulu `0`/`1` için `false`'tur).
// ⚠ Bu, architect'in üç gerekçesiyle (ADR-0002 Karar 7) BİLİNEN BİR BOŞLUKTUR,
// HATA DEĞİLDİR: yükümlülüğün kaynağı sürüm aritmetiği değil ayar şeması
// kırılmasıdır, `0.x`'te kurulu taban yoktur (A-P1), çapraz sürüm kontrolü
// `ThemeRelease`'i gerektirir (henüz yok). Vadesi — bu boşluğun
// `ThemeRelease` ile MAKİNELEŞTİRİLECEĞİ sürüm — **v0.0.21**'dir
// (ADR-0002 Karar 7, architect K3).
describe('validateMigrationChain — K3: `0.x` migration eşiği (BİLİNEN boşluk, vade v0.0.21 — chain.ts DEĞİŞMEDİ)', () => {
  it('K3/1: version "0.2.0" + migrations: [] → ok: true (THEME_MIGRATION_MISSING ÜRETİLMEZ, çünkü themeMajor=0 ≤ 1 — bilinen boşluk, hata DEĞİL)', () => {
    const result = validateMigrationChain([], '0.2.0')

    expect(result.ok).toBe(true)
  })

  it('K3/2: version "0.2.0" + [{from:"0.1.0",to:"0.2.0"}] → ok: true (gönüllü 0.x zinciri REDDEDİLMİYOR — taşıyıcı mekanizma 0.x\'te ÇALIŞIYOR)', () => {
    const migrations = [identityMigration('0.1.0', '0.2.0')]

    const result = validateMigrationChain(migrations, '0.2.0')

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }
    expect(result.value).toBe(migrations)
  })
})
