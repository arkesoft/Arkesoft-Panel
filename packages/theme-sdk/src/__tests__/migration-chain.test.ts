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
