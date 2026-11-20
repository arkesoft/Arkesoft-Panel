// @arkesoft/db — "SQL ≡ TS" iki yönlü drift testi: `currency` migration seed'i
// ↔ `@arkesoft/i18n`'in `SUPPORTED_CURRENCIES`'i (ROADMAP v0.0.18, T-027/S6,
// architect VERİ MODELİ — AC-49).
//
// GEREKÇE: `Currency` tablosunun satırları `packages/i18n`'in
// `SUPPORTED_CURRENCIES`'inin İŞLETİMSEL ALT KÜMESİDİR
// (`currency.code ⊆ SUPPORTED_CURRENCIES`) — TEK DOĞRULUK KAYNAĞI
// `packages/i18n`'dedir, `Currency` DEĞİL (bkz. `prisma/schema.prisma` →
// `Currency` model doc'u). `packages/i18n` veritabanına bağımlı OLAMAZ
// (CLAUDE.md §3, `packages/i18n/src/__tests__/purity.test.ts`) → bağımlılık
// yönü TERSTİR: migration SQL'i TypeScript import EDEMEZ, dolayısıyla seed
// satırları ve `SUPPORTED_CURRENCIES` İKİ AYRI yerde yazılı kalmak
// ZORUNDADIR — bu test o iki yeri BİRBİRİNE bağlar. Emsal BİREBİR kurulu:
// `append-only-tables-sql-consistency.test.ts` (TS dizisi ↔ SQL `FOREACH`
// dizisi, fs okumasıyla).
//
// Bu dosya `.isolation.test.ts` DEĞİLDİR — Postgres'e dokunmaz, saf metin
// ayrıştırması + saf karşılaştırma fonksiyonu üzerinde çalışır; normal
// `pnpm --filter @arkesoft/db test` hattında koşar (`vitest.config.ts`'in
// `include: ['src/**/*.test.ts']` deseni).
//
// DÖRT KONTROL (S6 Tamamlanma Tanımı, birebir):
//   1. migration SQL'indeki HER `INSERT INTO "currency"` satırının kodu
//      `SUPPORTED_CURRENCIES`'te VAR (alt küme).
//   2. `minor_unit` değeri BİREBİR EŞİT.
//   3. tohumlanan küme `['TRY']` PİNİNE eşit.
//   4. ⚠⚠ NEGATİF KANIT — saf karşılaştırma fonksiyonuna (`diffCurrencySeed
//      AgainstSupportedCurrencies`) uydurma kod / yanlış `minorUnit`
//      taşıyan FIXTURE verildiğinde drift BİLDİRİR (gerçek katalog/gerçek
//      migration SQL'i mutasyona uğratılmadan).

import { describe, expect, it } from 'vitest'

import { SUPPORTED_CURRENCIES } from '@arkesoft/i18n'

import { readMigrationSet } from './helpers/migration-set.js'

const MIGRATIONS_DIR = new URL('../../prisma/migrations/', import.meta.url)

/** Migration SQL'inden çıkarılan TEK bir tohum satırı. */
type CurrencySeedRow = {
  readonly code: string
  readonly minorUnit: number
}

/**
 * Karşılaştırmanın karşı tarafı — `SUPPORTED_CURRENCIES`'in GERÇEK biçimi
 * (literal anahtarlı nesne) VE sentetik fixture'ların (düz string anahtarlı
 * nesne) İKİSİNİ de kabul eden en geniş ortak şekil. `noUncheckedIndexedAccess`
 * altında indeksleme sonucu her zaman `| undefined` taşır — bu, "kod bu
 * kümede yok" durumunu doğal olarak modelliyor (type guard GEREKMEZ).
 */
type SupportedCurrencyLookup = Readonly<Record<string, { readonly minorUnit: number }>>

type CurrencyDriftFinding =
  | { readonly kind: 'UNKNOWN_CODE'; readonly code: string }
  | {
      readonly kind: 'MINOR_UNIT_MISMATCH'
      readonly code: string
      readonly seededMinorUnit: number
      readonly expectedMinorUnit: number
    }

/**
 * SAF karşılaştırma fonksiyonu (vitest/DB'ye bağımlı değil) — AC-49'un
 * negatif kanıt yüzeyi. `tohumlanmış satır` ⊆ `desteklenen küme` olduğunu VE
 * `minorUnit`in birebir eşit olduğunu doğrular; sapma varsa onu KANITLAR,
 * yutmaz.
 */
function diffCurrencySeedAgainstSupportedCurrencies(
  seedRows: readonly CurrencySeedRow[],
  supported: SupportedCurrencyLookup,
): readonly CurrencyDriftFinding[] {
  const findings: CurrencyDriftFinding[] = []

  for (const row of seedRows) {
    const expected = supported[row.code]
    if (expected === undefined) {
      findings.push({ kind: 'UNKNOWN_CODE', code: row.code })
      continue
    }
    if (expected.minorUnit !== row.minorUnit) {
      findings.push({
        kind: 'MINOR_UNIT_MISMATCH',
        code: row.code,
        seededMinorUnit: row.minorUnit,
        expectedMinorUnit: expected.minorUnit,
      })
    }
  }

  return findings
}

/**
 * `INSERT INTO "currency" ("code", "minor_unit") VALUES ('XXX', N)` biçimindeki
 * (tırnak/boşluk/harf varyasyonlarına duyarsız) satırları migration SQL
 * metninden çıkarır. `append-only-tables-sql-consistency.test.ts`'in
 * `FOREACH` dizisi ayrıştırmasıyla AYNI sınıf: SQL metni TypeScript import
 * EDEMEZ, bu yüzden desen eşleştirmesi KAÇINILMAZDIR.
 */
function extractCurrencySeedRows(migrationSqlFiles: readonly string[]): readonly CurrencySeedRow[] {
  const pattern =
    /INSERT\s+INTO\s+"?currency"?\s*\(\s*"?code"?\s*,\s*"?minor_unit"?\s*\)\s*VALUES\s*\(\s*'([A-Z]{3})'\s*,\s*(\d+)\s*\)/gi
  const rows: CurrencySeedRow[] = []

  for (const sql of migrationSqlFiles) {
    for (const match of sql.matchAll(pattern)) {
      const code = match[1]
      const minorUnitRaw = match[2]
      if (code === undefined || minorUnitRaw === undefined) {
        continue
      }
      rows.push({ code, minorUnit: Number.parseInt(minorUnitRaw, 10) })
    }
  }

  return rows
}

describe('currency-i18n-consistency — gerçek migration kümesi ↔ @arkesoft/i18n (AC-49)', () => {
  it("migration SQL'inde en az bir `currency` tohum satırı var", () => {
    const migrations = readMigrationSet(MIGRATIONS_DIR)
    const seedRows = extractCurrencySeedRows(migrations.map((migration) => migration.sql))
    expect(seedRows.length).toBeGreaterThan(0)
  })

  it("[1+2] tohumlanan HER kod SUPPORTED_CURRENCIES'te var VE minor_unit birebir eşit", () => {
    const migrations = readMigrationSet(MIGRATIONS_DIR)
    const seedRows = extractCurrencySeedRows(migrations.map((migration) => migration.sql))

    const findings = diffCurrencySeedAgainstSupportedCurrencies(seedRows, SUPPORTED_CURRENCIES)

    expect(findings).toEqual([])
  })

  it("[3] tohumlanan küme TAM OLARAK ['TRY'] pinine eşit", () => {
    const migrations = readMigrationSet(MIGRATIONS_DIR)
    const seedRows = extractCurrencySeedRows(migrations.map((migration) => migration.sql))

    expect(seedRows.map((row) => row.code)).toEqual(['TRY'])
  })
})

describe('currency-i18n-consistency — saf karşılaştırma fonksiyonu, NEGATİF KANIT (AC-49)', () => {
  it('[NEGATİF 1] uydurma kod → UNKNOWN_CODE bildirir', () => {
    const findings = diffCurrencySeedAgainstSupportedCurrencies([{ code: 'XYZ', minorUnit: 2 }], {
      TRY: { minorUnit: 2 },
    })

    expect(findings).toEqual([{ kind: 'UNKNOWN_CODE', code: 'XYZ' }])
  })

  it('[NEGATİF 2] yanlış minorUnit → MINOR_UNIT_MISMATCH bildirir', () => {
    const findings = diffCurrencySeedAgainstSupportedCurrencies([{ code: 'TRY', minorUnit: 3 }], {
      TRY: { minorUnit: 2 },
    })

    expect(findings).toEqual([
      { kind: 'MINOR_UNIT_MISMATCH', code: 'TRY', seededMinorUnit: 3, expectedMinorUnit: 2 },
    ])
  })

  it('[KONTROL] tutarlı girdi → BOŞ dizi (fonksiyon fazla bulgu üretmiyor)', () => {
    const findings = diffCurrencySeedAgainstSupportedCurrencies([{ code: 'TRY', minorUnit: 2 }], {
      TRY: { minorUnit: 2 },
    })

    expect(findings).toEqual([])
  })

  it('[NEGATİF 3] birden fazla satırda İKİ farklı drift türü BİRLİKTE bildirilir', () => {
    const findings = diffCurrencySeedAgainstSupportedCurrencies(
      [
        { code: 'TRY', minorUnit: 2 },
        { code: 'USD', minorUnit: 2 },
        { code: 'TRY', minorUnit: 0 },
      ],
      { TRY: { minorUnit: 2 } },
    )

    expect(findings).toEqual([
      { kind: 'UNKNOWN_CODE', code: 'USD' },
      { kind: 'MINOR_UNIT_MISMATCH', code: 'TRY', seededMinorUnit: 0, expectedMinorUnit: 2 },
    ])
  })
})
