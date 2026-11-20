// @arkesoft/db — şema tarafı float-para yasağı (ROADMAP v0.0.18, T-027/S6,
// architect "MEKANİK KAPILAR" — AC-48).
//
// GEREKÇE: CLAUDE.md §2/§10 "Para birimi float ile tutulmayacak… Tamsayı
// kuruş" kuralının ESLint ayağı (`packages/config/eslint/base.js`, AC-47)
// `.ts`/`.tsx` AST'si üzerinde çalışır — `.prisma` dosyasını ve ham migration
// SQL'ini GÖRMEZ. Bu dosya o kör noktayı kapatır: `schema.prisma` (Prisma
// alan bildirimleri) VE `prisma/migrations/**/*.sql` (ham DDL kolon
// tanımları) üzerinde, para-adı deseniyle eşleşen HİÇBİR alan/kolonun
// `Float`/`Decimal`/`double precision`/`real`/`numeric` OLMADIĞINI doğrular.
//
// ⚠⚠ Postgres GEREKTİRMEZ — bu dosya `.isolation.test.ts` DEĞİLDİR, saf metin
// taraması üzerinde çalışır; normal `pnpm --filter @arkesoft/db test`
// hattında koşar. Migration kümesi okunurken mevcut ayrıştırıcı
// (`./helpers/migration-set.ts` → `readMigrationSet`) YENİDEN KULLANILIR —
// yeni bir dosya okuma mekanizması İCAT EDİLMEZ.
//
// ⚠ Bugün gerçek ihlal SIFIR (ölçüldü: `schema.prisma`/migration SQL'inde
// `Float`/`Decimal`/`double precision`/`real`/`numeric` jetonu HİÇ GEÇMİYOR)
// ⇒ "yakalama" iddiası ancak ≥3 POZİTİF + ≥3 NEGATİF sentetik FIXTURE ile
// kanıtlanabilir (gerçek dosyalar mutasyona uğratılmaz — AC-49'un negatif
// kanıt desenininin BİREBİR aynısı).
//
// ⚠⚠ Bu, AC-47'nin (ESLint, `packages/config/eslint/base.js`) `MONEY_NAME_
// SOURCE`'undan BAĞIMSIZ, AYRI bir isim deseni taşır — o sabit bir ESLint
// yapılandırma dosyasının (`.js`, test script'i OLMAYAN bir paketin) iç
// değişkenidir, `packages/db`'nin import edebileceği bir modül YÜZEYİ
// DEĞİLDİR (iki paket arasında kırılgan bir CJS/ESM köprüsü kurmak orantısız
// olurdu). İki desen AYNI kelime kümesini (para olgusu) hedefler ama kasıtlı
// olarak İKİ AYRI sabit olarak yaşar — `TENANT_ISOLATION_RULES`'a
// (`catalog-lint.ts:238-287`) kural EKLENMEZ (o kapalı küme tenant
// izolasyonu içindir, float-para oraya semantik olarak ait değil).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { readMigrationSet } from './helpers/migration-set.js'

const SCHEMA_PATH = fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url))
const MIGRATIONS_DIR = new URL('../../prisma/migrations/', import.meta.url)

/** Para birimi SAKLAYAN bir alan/kolonun adında BEKLENEN jetonlar (harf duyarsız). */
const MONEY_FIELD_NAME_PATTERN =
  /(amount|price|balance|cost|fee|total|subtotal|tax|discount|refund|payout|revenue)/i

/** Veritabanı seviyesinde ONDALIKLI (float benzeri) kabul edilen tipler. */
const FLOAT_LIKE_PRISMA_TYPE_PATTERN = /^(Float|Decimal)$/
const FLOAT_LIKE_SQL_TYPE_PATTERN =
  /DOUBLE\s+PRECISION|REAL|NUMERIC(?:\([^)]*\))?|DECIMAL(?:\([^)]*\))?/i

type FloatMoneyFinding = {
  readonly source: 'prisma' | 'sql'
  readonly name: string
  readonly declaredType: string
}

/**
 * `schema.prisma` METNİNİ SATIR SATIR tarar — bir Prisma ALAN bildirimi
 * (`ad Type` biçimi, baştaki boşluk/yorum ayıklanmış) `Float`/`Decimal`
 * taşıyorsa VE adı para-adı desenine uyuyorsa bir bulgu üretir. Yorum
 * satırları (`//`, `///`) ve boş satırlar ATLANIR — bu dosyanın KENDİSİ de
 * "priceCents (…v0.17.0…)" gibi doc yorumları taşıyor (`schema.prisma:783`
 * civarı, M8 ölçümü), yorum metni asla bir bulgu üretmemeli.
 */
function scanPrismaSchemaForFloatMoney(schemaSource: string): readonly FloatMoneyFinding[] {
  const findings: FloatMoneyFinding[] = []

  for (const rawLine of schemaSource.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('//')) {
      continue
    }

    const fieldMatch = /^(\w+)\s+(Float|Decimal)(?:\?|\[\])?\b/.exec(line)
    if (fieldMatch === null) {
      continue
    }

    const fieldName = fieldMatch[1]
    const declaredType = fieldMatch[2]
    if (fieldName === undefined || declaredType === undefined) {
      continue
    }

    if (
      MONEY_FIELD_NAME_PATTERN.test(fieldName) &&
      FLOAT_LIKE_PRISMA_TYPE_PATTERN.test(declaredType)
    ) {
      findings.push({ source: 'prisma', name: fieldName, declaredType })
    }
  }

  return findings
}

/**
 * Ham SQL metnindeki tırnaklı kolon tanımlarını tarar — `"ad" <TİP>`
 * biçiminde, tip `DOUBLE PRECISION`/`REAL`/`NUMERIC(…)`/`DECIMAL(…)` İSE VE
 * ad para-adı desenine uyuyorsa bir bulgu üretir.
 */
function scanSqlForFloatMoney(sql: string): readonly FloatMoneyFinding[] {
  const findings: FloatMoneyFinding[] = []
  const columnPattern = new RegExp(
    `"([A-Za-z0-9_]+)"\\s+(${FLOAT_LIKE_SQL_TYPE_PATTERN.source})`,
    'gi',
  )

  for (const match of sql.matchAll(columnPattern)) {
    const columnName = match[1]
    const declaredType = match[2]
    if (columnName === undefined || declaredType === undefined) {
      continue
    }
    if (MONEY_FIELD_NAME_PATTERN.test(columnName)) {
      findings.push({ source: 'sql', name: columnName, declaredType })
    }
  }

  return findings
}

describe('float-money-ban — gerçek schema.prisma + gerçek migration kümesi (AC-48)', () => {
  it('schema.prisma içinde para-adı taşıyan hiçbir alan Float/Decimal değil', () => {
    const schemaSource = readFileSync(SCHEMA_PATH, 'utf8')
    expect(scanPrismaSchemaForFloatMoney(schemaSource)).toEqual([])
  })

  it('migration kümesinde para-adı taşıyan hiçbir kolon float benzeri tipte değil', () => {
    const migrations = readMigrationSet(MIGRATIONS_DIR)
    expect(migrations.length).toBeGreaterThan(0)

    const findings = migrations.flatMap((migration) => scanSqlForFloatMoney(migration.sql))
    expect(findings).toEqual([])
  })
})

describe('float-money-ban — saf tarayıcılar, POZİTİF fixture (AC-48 ≥3 pozitif)', () => {
  it('[POZİTİF 1] Prisma alanı `Float` + para adı → yakalanır', () => {
    const fixture = 'model Invoice {\n  totalAmount Float\n}\n'
    expect(scanPrismaSchemaForFloatMoney(fixture)).toEqual([
      { source: 'prisma', name: 'totalAmount', declaredType: 'Float' },
    ])
  })

  it('[POZİTİF 2] Prisma alanı `Decimal` + para adı → yakalanır', () => {
    const fixture = 'model Invoice {\n  shippingCost Decimal @db.Decimal(10, 2)\n}\n'
    expect(scanPrismaSchemaForFloatMoney(fixture)).toEqual([
      { source: 'prisma', name: 'shippingCost', declaredType: 'Decimal' },
    ])
  })

  it('[POZİTİF 3] SQL kolonu `DOUBLE PRECISION` + para adı → yakalanır', () => {
    const fixture = '"account_balance" DOUBLE PRECISION NOT NULL,'
    expect(scanSqlForFloatMoney(fixture)).toEqual([
      { source: 'sql', name: 'account_balance', declaredType: 'DOUBLE PRECISION' },
    ])
  })

  it('[POZİTİF 4] SQL kolonu `NUMERIC(10,2)` + para adı → yakalanır', () => {
    const fixture = '"refund_total" NUMERIC(10,2) NOT NULL,'
    expect(scanSqlForFloatMoney(fixture)).toEqual([
      { source: 'sql', name: 'refund_total', declaredType: 'NUMERIC(10,2)' },
    ])
  })
})

describe('float-money-ban — saf tarayıcılar, NEGATİF fixture (AC-48 ≥3 negatif)', () => {
  it('[NEGATİF 1] Prisma alanı para-adı taşır ama `Int` (kuruş) → yakalanmaz', () => {
    const fixture = 'model Invoice {\n  totalAmountCents Int\n}\n'
    expect(scanPrismaSchemaForFloatMoney(fixture)).toEqual([])
  })

  it('[NEGATİF 2] Prisma alanı `Float` ama adı para-adı DEĞİL → yakalanmaz', () => {
    const fixture = 'model Report {\n  conversionRatio Float\n}\n'
    expect(scanPrismaSchemaForFloatMoney(fixture)).toEqual([])
  })

  it('[NEGATİF 3] SQL kolonu para-adı taşır ama `INTEGER` (kuruş) → yakalanmaz', () => {
    const fixture = '"price_amount_cents" INTEGER NOT NULL,'
    expect(scanSqlForFloatMoney(fixture)).toEqual([])
  })

  it('[NEGATİF 4] SQL kolonu `DOUBLE PRECISION` ama adı para-adı DEĞİL → yakalanmaz', () => {
    const fixture = '"latitude" DOUBLE PRECISION,'
    expect(scanSqlForFloatMoney(fixture)).toEqual([])
  })

  it('[NEGATİF 5] Prisma yorum satırındaki "priceCents"/"Decimal" sözcükleri → yakalanmaz', () => {
    const fixture = '// priceCents (v0.17.0) Decimal @db.Decimal(10,2) henüz yok\n'
    expect(scanPrismaSchemaForFloatMoney(fixture)).toEqual([])
  })
})
