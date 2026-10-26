// @arkesoft/db — migration.sql statik doğrulaması (ROADMAP v0.0.3, T-001/ST-4)
//
// Vaka 6 (AC5). `TENANT_SCOPED_TABLES`'ı import ederek MEKANİK doğrulama yapar;
// tablo adını sabit yazmaz. Migration dizini adı timestamp taşıdığı için
// (`<ts>_init`) sabit yazılmaz — `_init` sonekiyle dinamik bulunur.

import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { PLATFORM_LEVEL_TABLES, TENANT_SCOPED_TABLES } from '../index.js'

/** Prisma'nın migration geçmişi tablosu — taksonomi dışında, platform ne tenant seviyesi SAYILMAZ. */
const PRISMA_INTERNAL_TABLE = '_prisma_migrations'

const MIGRATIONS_DIR = new URL('../../prisma/migrations/', import.meta.url)

function readInitMigrationSql(): string {
  const entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  const initMigrationDir = entries.find(
    (entry) => entry.isDirectory() && entry.name.endsWith('_init'),
  )

  if (initMigrationDir === undefined) {
    throw new Error('prisma/migrations altında "_init" ile biten migration dizini bulunamadı.')
  }

  const sqlPath = new URL(`${initMigrationDir.name}/migration.sql`, MIGRATIONS_DIR)
  return readFileSync(sqlPath, 'utf8')
}

/** `CREATE TABLE "<tableName>" (...);` bloğunun iç metnini döndürür. */
function extractCreateTableBody(sql: string, tableName: string): string {
  const pattern = new RegExp(`CREATE TABLE "${tableName}" \\(([\\s\\S]*?)\\n\\);`, 'm')
  const match = pattern.exec(sql)

  if (match === null) {
    throw new Error(`migration.sql içinde "${tableName}" için CREATE TABLE bloğu bulunamadı.`)
  }

  return match[1] ?? ''
}

/** `migration.sql`'deki her `CREATE TABLE "<ad>"` ifadesinden tablo adını çıkarır. */
function extractCreatedTableNames(sql: string): readonly string[] {
  const pattern = /CREATE TABLE "([^"]+)"/g
  return [...sql.matchAll(pattern)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined)
}

describe('migration-sql', () => {
  it('tenant_id TEXT NOT NULL + yıkıcı ifade yok', () => {
    const sql = readInitMigrationSql()

    // İlk migration'da henüz dönüştürülecek geçmiş veri yok; buna karşın
    // expand/contract kuralı bu sürümde kilitleniyor (ROADMAP v0.0.3 Migration
    // stratejisi) — gelecekteki her migration için yıkıcı ifadeler yasak.
    // (`DROP COLUMN` ayrıca kontrol EDİLMEZ — `not.toContain('DROP ')` onu zaten
    // kapsıyor, ayrı assertion ölü/tautolojikti; Gate Tur 1 solid bulgusu.)
    expect(sql).not.toContain('DROP ')
    expect(sql).not.toContain('SET NOT NULL')

    for (const tableName of TENANT_SCOPED_TABLES) {
      const body = extractCreateTableBody(sql, tableName)
      expect(body).toContain('"tenant_id" TEXT NOT NULL')
    }
  })

  // Gate Tur 1 — S4: RLS hazırlık garantisi TEK YÖNLÜ idi (yalnızca
  // `TENANT_SCOPED_TABLES`'ın `tenant_id` taşıdığı doğrulanıyordu); şemada
  // `tenant_id` taşıyıp taksonomide UNUTULAN bir tabloyu yakalayan ters kontrol
  // yoktu. v0.0.13'ün şema linter'ı bu iki diziyi **allowlist** olarak
  // tüketeceği için böyle bir kayma "her şey yolunda" denip RLS'siz yayına
  // çıkabilirdi. Aşağıdaki iki assert bunu MEKANİK olarak kapatır.
  it('her CREATE TABLE taksonomide (PLATFORM_LEVEL_TABLES ∪ TENANT_SCOPED_TABLES) yer alır', () => {
    const sql = readInitMigrationSql()
    const createdTables = extractCreatedTableNames(sql)
    const knownTables = new Set<string>([...PLATFORM_LEVEL_TABLES, ...TENANT_SCOPED_TABLES])

    for (const tableName of createdTables) {
      if (tableName === PRISMA_INTERNAL_TABLE) {
        continue
      }
      expect(knownTables.has(tableName)).toBe(true)
    }
  })

  it('"tenant_id" geçen hiçbir tablo PLATFORM_LEVEL_TABLES\'ta DEĞİL', () => {
    const sql = readInitMigrationSql()
    const platformTables = new Set<string>(PLATFORM_LEVEL_TABLES)

    for (const tableName of extractCreatedTableNames(sql)) {
      if (tableName === PRISMA_INTERNAL_TABLE || !platformTables.has(tableName)) {
        continue
      }
      const body = extractCreateTableBody(sql, tableName)
      expect(body).not.toContain('"tenant_id"')
    }
  })

  // Gate Tur 1 — solid: `not.toContain('DROP COLUMN')` `not.toContain('DROP ')`
  // tarafından kapsandığı için ölü assertion'dı; yerine indeks değişmezini
  // (tenant_id'nin en az bir bileşik benzersizlik indeksinin ÖNCÜ kolonu olduğu)
  // mekanik doğrulayan bir assertion kondu.
  it("TENANT_SCOPED_TABLES'daki her tablonun tenant_id öncü kolonlu bir UNIQUE INDEX'i var", () => {
    const sql = readInitMigrationSql()

    for (const tableName of TENANT_SCOPED_TABLES) {
      const pattern = new RegExp(`CREATE UNIQUE INDEX "[^"]+" ON "${tableName}"\\("tenant_id",`)
      expect(sql).toMatch(pattern)
    }
  })
})
