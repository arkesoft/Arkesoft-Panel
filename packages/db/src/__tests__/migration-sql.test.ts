// @arkesoft/db — migration kümesi doğrulaması (ROADMAP v0.0.3 T-001/ST-4,
// yeniden yazım: T-004 / T2-1 kapanışı, S1)
//
// TEKNİK BORÇ KAPANIŞI (T2-1, ROADMAP satır 1319): eski `readInitMigrationSql()`
// yalnızca `_init` ile biten TEK dizini okuyordu; ikinci bir migration geldiği
// anda onun `CREATE TABLE` ifadeleri hiç değerlendirilmiyordu ve taksonomiye
// eklenmesi unutulan `tenant_id`'li bir tablo testi SESSİZCE yeşil
// bırakabiliyordu (probe ile kanıtlandı, security gate T-002). Bu dosya artık
// `prisma/migrations/` altındaki `migration.sql` İÇEREN HER dizini okuyan ve
// kümülatif şema yüzeyini taksonomiyle (PLATFORM_LEVEL_TABLES ∪
// TENANT_SCOPED_TABLES) iki yönlü karşılaştıran `./helpers/migration-set.ts`
// üzerine kurulur. Doğrulama mantığının TEK sahibi orası — bu dosya yalnızca
// `expect` ile kanıtlar (K-C4).
//
// İki süit:
//   1. Gerçek repo süiti (6 vaka) — gerçek `prisma/migrations/` + gerçek
//      taksonomi. Biçim sadakatinin ÇAPASI (R-C3): fixture üreteci bu süitten
//      SONRA yazıldı, önce gerçek Prisma emit'ine karşı doğrulandı.
//   2. Prob süiti (bkz. "it(" sayımı — `qa`'nın gerçek koşum çıktısı bağlayıcı,
//      bkz. `.claude/workflow/reviews/`) — `./helpers/migration-set-fixture.ts`'in
//      kurduğu geçici `mkdtemp` ağaçları + kendi taksonomisi (K-C2): gerçek
//      taksonomiye bağlı OLMADIĞI için v0.0.13 taksonomiye tablo eklediğinde
//      kırılmaz.
//
// R-P1 (bağlayıcı, PO) — `it.each` YASAK, fixture YALNIZCA `it()` gövdesinde
// kurulur: `ci.yml` AC12a probu `vitest list` koşuyor ve bu, TOPLAMA fazını
// (modül üst seviyesi + `describe` gövdeleri) çalıştırır; orada bir `mkdtemp`
// ağacı kurulursa ve DB/`.env` olmayan o adımda bir hata fırlarsa AC12a kırılır.
// Aşağıdaki yardımcı fonksiyonlar (`buildPrimaryProbDirectories` vb.) modül
// üst seviyesinde yalnızca TANIMLANIR, mkdtemp'i tetiklemez — çağrıları her
// zaman bir `it()` gövdesinin İÇİNDEDİR.
//
// DÜZELTME TURU 2 (T-004, qa/security/solid tur 2) — eklenen vakalar: altı
// biçim varyantı (A, tek `it()` içinde tablo-sürücülü döngü) + kanonik
// regresyon · ayna bekçisi (tırnaksız ad) · kök symlink'in isDirectory()
// dalını GERÇEKTEN pinlemesi (B) · tek tırnaklı dize literali yanlış
// pozitifleri (C, iki vaka + bir RLS/POLICY kontrolü) · gövde deseninin ifade
// sınırını aşmaması (D1). Ayrıca `it()` başlıklarındaki tur-yerel gate
// kimlikleri (`AC7c-ek (B1)`, `C1:`, `B2:`, `AC7d:`, `A-1/A-2/A-3`, `V3-kök`)
// davranış cümlesine indirildi; kimlikler yalnızca üstteki ATIF yorumunda
// kalıyor (solid gate T-004 tur 2, bulgu D4).

import { describe, expect, it } from 'vitest'

import { PLATFORM_LEVEL_TABLES, TENANT_SCOPED_TABLES } from '../index.js'

import {
  collectMigrationSetViolations,
  readMigrationSet,
  validateMigrationSet,
  type MigrationSetRule,
  type MigrationSetViolation,
  type TenantTaxonomy,
} from './helpers/migration-set.js'
import {
  generateCreateTableStatement,
  generateCreateUniqueIndexStatement,
  generateDropColumnStatement,
  generateSetNotNullStatement,
  generateSingleLineCreateTableStatement,
  joinMigrationStatements,
  withTemporaryMigrationSet,
  type MigrationDirectoryContent,
} from './helpers/migration-set-fixture.js'

const MIGRATIONS_DIR = new URL('../../prisma/migrations/', import.meta.url)

/** Gerçek taksonomi + gerçek migration kümesi üzerinde `rule`'a göre filtrelenmiş ihlaller. */
function collectRealRepoViolations(rule: MigrationSetRule): readonly MigrationSetViolation[] {
  const migrations = readMigrationSet(MIGRATIONS_DIR)
  const taxonomy: TenantTaxonomy = {
    platformLevelTables: PLATFORM_LEVEL_TABLES,
    tenantScopedTables: TENANT_SCOPED_TABLES,
  }
  return collectMigrationSetViolations(migrations, taxonomy).filter(
    (violation) => violation.rule === rule,
  )
}

describe('migration-set — gerçek repo migration kümesi', () => {
  it('readMigrationSet prisma/migrations dizinini okur ve en az bir migration döndürür', () => {
    const migrations = readMigrationSet(MIGRATIONS_DIR)
    expect(migrations.length).toBeGreaterThan(0)
  })

  it('gerçek migration kümesinde hiçbir yıkıcı ifade (DROP / SET NOT NULL) yok', () => {
    expect(collectRealRepoViolations('DESTRUCTIVE_STATEMENT')).toHaveLength(0)
  })

  it('gerçek migration kümesindeki her CREATE TABLE taksonomide sınıflandırılmış', () => {
    expect(collectRealRepoViolations('UNCLASSIFIED_TABLE')).toHaveLength(0)
  })

  it('"tenant_id" taşıyan hiçbir tablo PLATFORM_LEVEL_TABLES\'ta DEĞİL', () => {
    expect(collectRealRepoViolations('TENANT_ID_ON_PLATFORM_TABLE')).toHaveLength(0)
  })

  it('TENANT_SCOPED_TABLES\'daki her tablo "tenant_id" TEXT NOT NULL kolonu taşıyor', () => {
    expect(collectRealRepoViolations('MISSING_TENANT_ID_COLUMN')).toHaveLength(0)
  })

  it("TENANT_SCOPED_TABLES'daki her tablonun tenant_id öncü kolonlu bir UNIQUE INDEX'i var", () => {
    expect(collectRealRepoViolations('MISSING_TENANT_ID_LEADING_UNIQUE_INDEX')).toHaveLength(0)
  })

  it("TENANT_SCOPED_TABLES'daki her tablo migration kümesinde gerçekten yaratılmış", () => {
    expect(collectRealRepoViolations('MISSING_TENANT_SCOPED_TABLE')).toHaveLength(0)
  })

  it('gerçek migration kümesindeki her CREATE TABLE gövdesi ayrıştırılabiliyor (ayna bekçisi dahil)', () => {
    expect(collectRealRepoViolations('UNPARSABLE_CREATE_TABLE')).toHaveLength(0)
  })
})

// --- Prob süiti — K-C1/K-C2: gerçek okuyucu + mkdtemp ağacı, KENDİ taksonomisi ---

/**
 * K-C9 (kanıtın çekirdeği) — birincil prob fixture'ı:
 *  - `..._fixture_init`    : geçerli temel (tenant/app_user/tenant_membership)
 *  - `..._fixture_second`  : zararsız ek (doğru sınıflandırılmış yeni tablo)
 *  - `..._fixture_third`   : İHLAL — "invoice" tablosu "tenant_id" TEXT NOT
 *                            NULL taşır, prob taksonomisinde YOK
 *  - `..._fixture_lock_only`: migration.sql İÇERMEZ — V3'ün İKİ yarısından
 *                            yalnızca `existsSync(migration.sql)` yarısının
 *                            kanıtı (dizinin KENDİSİ var, içinde migration.sql
 *                            yok). `isDirectory()` yarısı (kök seviyesinde
 *                            dizin OLMAYAN girdi) burada KURULMAZ — ayrı
 *                            "kök seviyesindeki migration_lock.toml migration
 *                            dizini sayılmaz" describe bloğunda `rootFiles`/
 *                            `rootSymlinks` ile kanıtlanır (solid gate T-004
 *                            tur 1 bulgu C5 + tur 2 bulgu low).
 *
 * Gerekçe (K-C9): eski uygulama bu kümede `_init`'i BULUR, okur, ihlali
 * GÖREMEZ — gerçek sahte-yeşil. `_init` olmasaydı eski kod "dizin bulunamadı"
 * diye YANLIŞ SEBEPLE fırlardı ve AC3'ün ters probu anlamsızlaşırdı.
 */
function buildPrimaryProbDirectories(): ReadonlyMap<string, MigrationDirectoryContent> {
  return new Map<string, MigrationDirectoryContent>([
    [
      '19700101000000_fixture_init',
      {
        migrationSql: joinMigrationStatements([
          generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
          generateCreateTableStatement('app_user', ['"id" TEXT NOT NULL'], 'id'),
          generateCreateTableStatement(
            'tenant_membership',
            ['"id" TEXT NOT NULL', '"tenant_id" TEXT NOT NULL'],
            'id',
          ),
          generateCreateUniqueIndexStatement(
            'tenant_membership_tenant_id_user_id_key',
            'tenant_membership',
            ['tenant_id', 'user_id'],
          ),
        ]),
        hasMigrationLock: true,
      },
    ],
    [
      '19700101000001_fixture_second',
      {
        migrationSql: joinMigrationStatements([
          generateCreateTableStatement('plan', ['"id" TEXT NOT NULL'], 'id'),
        ]),
      },
    ],
    [
      '19700101000002_fixture_third',
      {
        migrationSql: joinMigrationStatements([
          generateCreateTableStatement(
            'invoice',
            ['"id" TEXT NOT NULL', '"tenant_id" TEXT NOT NULL'],
            'id',
          ),
          generateCreateUniqueIndexStatement('invoice_tenant_id_number_key', 'invoice', [
            'tenant_id',
            'number',
          ]),
        ]),
      },
    ],
    ['19700101000003_fixture_lock_only', { hasMigrationLock: true }],
  ])
}

/** Birincil fixture'ın prob taksonomisi — gerçek `tenancy.ts`'ten BAĞIMSIZ (K-C2). */
const PRIMARY_PROB_TAXONOMY: TenantTaxonomy = {
  platformLevelTables: ['tenant', 'app_user', 'plan'],
  tenantScopedTables: ['tenant_membership'],
}

describe('migration-set — prob süiti (K-C9 birincil fixture)', () => {
  it('AC1: migration.sql içeren her dizin okunur, yalnızca lock taşıyan dizin dışlanır', () => {
    withTemporaryMigrationSet(buildPrimaryProbDirectories(), (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      expect(migrations.map((migration) => migration.directoryName)).toEqual([
        '19700101000000_fixture_init',
        '19700101000001_fixture_second',
        '19700101000002_fixture_third',
      ])
    })
  })

  it("AC2 — ASIL PROB: taksonomide olmayan tenant_id'li tablo hata fırlatır", () => {
    withTemporaryMigrationSet(buildPrimaryProbDirectories(), (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      expect(() => {
        validateMigrationSet(migrations, PRIMARY_PROB_TAXONOMY)
      }).toThrow()
    })
  })

  it('AC8: hata mesajı suçlu migration dizininin adını taşır', () => {
    withTemporaryMigrationSet(buildPrimaryProbDirectories(), (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      expect(() => {
        validateMigrationSet(migrations, PRIMARY_PROB_TAXONOMY)
      }).toThrow(/19700101000002_fixture_third/)
    })
  })

  it('AC4 — tautoloji değil: aynı fixture, taksonomiye "invoice" eklenince hata çıkmaz', () => {
    withTemporaryMigrationSet(buildPrimaryProbDirectories(), (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const extendedTaxonomy: TenantTaxonomy = {
        platformLevelTables: PRIMARY_PROB_TAXONOMY.platformLevelTables,
        tenantScopedTables: [...PRIMARY_PROB_TAXONOMY.tenantScopedTables, 'invoice'],
      }
      expect(() => {
        validateMigrationSet(migrations, extendedTaxonomy)
      }).not.toThrow()
    })
  })

  it('AC6 — sahte yeşil kapısı: hiç migration bulunmayan kümede doğrulama fırlatır', () => {
    withTemporaryMigrationSet(new Map(), (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      expect(migrations).toHaveLength(0)
      expect(() => {
        validateMigrationSet(migrations, PRIMARY_PROB_TAXONOMY)
      }).toThrow()
    })
  })
})

describe('migration-set — prob süiti (AC5: "_init" sonekine bağımlılık yok)', () => {
  it('AC5: hiçbir dizin adı "_init" ile bitmese de doğrulama tüm dizinleri okur', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '20991231235959_zzz_base',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
          ]),
        },
      ],
      [
        '20991231236000_zzz_extra',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement(
              'ledger',
              ['"id" TEXT NOT NULL', '"tenant_id" TEXT NOT NULL'],
              'id',
            ),
          ]),
        },
      ],
    ])

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      expect(migrations.every((migration) => !migration.directoryName.endsWith('_init'))).toBe(true)

      const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }
      expect(() => {
        validateMigrationSet(migrations, taxonomy)
      }).toThrow(/20991231236000_zzz_extra/)
    })
  })
})

describe('migration-set — prob süiti (AC7: iki-yönlülük ve ilişkili ihlal vakaları)', () => {
  it("AC7a: taksonomide olup hiçbir migration'da yaratılmamış tablo hata üretir", () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000000_fixture_only_tenant',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = {
      platformLevelTables: ['tenant'],
      tenantScopedTables: ['tenant_membership'],
    }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'MISSING_TENANT_SCOPED_TABLE')).toBe(
        true,
      )
    })
  })

  it('AC7b: "tenant_id" taşıyıp PLATFORM_LEVEL_TABLES\'ta olan tablo hata üretir', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000001_fixture_platform_tenant_id',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement(
              'tenant',
              ['"id" TEXT NOT NULL', '"tenant_id" TEXT NOT NULL'],
              'id',
            ),
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'TENANT_ID_ON_PLATFORM_TABLE')).toBe(
        true,
      )
    })
  })

  it('AC7c: "DROP " veya "SET NOT NULL" içeren migration hata üretir', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000002_fixture_base',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
          ]),
        },
      ],
      [
        '19800101000003_fixture_destructive',
        {
          migrationSql: joinMigrationStatements([
            generateDropColumnStatement('tenant', 'legacy_field'),
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })

  // B1 (solid gate T-004 tur 1, bulgu medium): AC7c'nin adı "DROP veya SET NOT
  // NULL" diyor ama yukarıdaki fixture yalnızca DROP COLUMN üretiyordu — kuralın
  // "SET NOT NULL" dalı hiçbir vakada koşmuyordu. Bu, R-C1/K-C8'in v0.0.13'te
  // muafiyet kuracağı dalın tam kendisi. Ayrı bir `it()` eklendi (test adını
  // daraltmak yerine).
  it('"SET NOT NULL" içeren migration da DESTRUCTIVE_STATEMENT üretir (DROP\'tan ayrı dal, solid gate T-004 tur 1 bulgu B1)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000004_fixture_set_not_null_base',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
          ]),
        },
      ],
      [
        '19800101000005_fixture_set_not_null',
        {
          migrationSql: joinMigrationStatements([
            generateSetNotNullStatement('tenant', 'legacy_required_field'),
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })

  // DAVRANIŞ GÜNCELLEMESİ (DÜZELTME TURU 5, security gate T-004 tur 5 bulgu
  // high — kullanıcı kararı): tur 1'in C1 düzeltmesi (harf/boşluk duyarsız
  // tarama) GERİ ALINDI — yıkıcı ifade taraması artık yeniden HEAD semantiğinde
  // (büyük/küçük harf DUYARLI, basit `includes`). Bu iki vaka önceden tur 1'in
  // düzeltmesini (`drop column` küçük harf, `SET  NOT NULL` çift boşluk)
  // yakalandığını pinliyordu; şimdi TAM TERSİNİ pinliyor — bu BİLİNÇLİ, HEAD'in
  // zaten taşıdığı bir fail-open (kritik değil, `tenant_id`/taksonomi/bileşik
  // indeks bekçilerini etkilemiyor), ROADMAP borcu (`architect`, v0.0.13,
  // durum-tutan tek geçişli tarayıcıyla birlikte normalize edilecek).
  it('küçük harfli "drop column" DESTRUCTIVE_STATEMENT ÜRETMEZ (HEAD semantiğine dönüş, security gate T-004 tur 5, bilinçli kabul edilmiş boşluk)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000006_fixture_lowercase_drop',
        { migrationSql: '-- AlterTable\nalter table "tenant" drop column "legacy_field";\n' },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(false)
    })
  })

  it('çift boşluklu "SET  NOT NULL" DESTRUCTIVE_STATEMENT ÜRETMEZ (HEAD semantiğine dönüş, security gate T-004 tur 5, bilinçli kabul edilmiş boşluk)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000007_fixture_double_space_set_not_null',
        {
          migrationSql:
            '-- AlterTable\nALTER TABLE "tenant" ALTER COLUMN "legacy_field" SET  NOT NULL;\n',
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(false)
    })
  })

  // B2 (solid gate T-004 tur 1, bulgu medium): `stripLineComments` K-C7'nin
  // TEK mekanizması ama hiçbir vaka onu doğrulamıyordu — fonksiyon kaldırılsa
  // veya bozulsa süit yeşil kalırdı. Yorum satırında "DROP COLUMN" geçen ama
  // gerçek ifadesi CREATE TABLE olan bir migration ihlal ÜRETMEMELİ.
  it('yorum satırında "DROP COLUMN" geçen ama ifadesi CREATE TABLE olan migration ihlal üretmez (solid gate T-004 tur 1 bulgu B2)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000008_fixture_comment_false_positive',
        {
          migrationSql: joinMigrationStatements([
            `-- DROP COLUMN "legacy_field" (tarihi not, kodda uygulanmıyor)\n${generateCreateTableStatement(
              'tenant',
              ['"id" TEXT NOT NULL'],
              'id',
            )}`,
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      expect(() => {
        validateMigrationSet(migrations, taxonomy)
      }).not.toThrow()
    })
  })

  // C8 (solid gate T-004 tur 1, bulgu low) — KASITLI davranışı pinleyen vaka:
  // tek kolonlu "tenant_id" UNIQUE INDEX, CLAUDE.md §7'nin bileşik indeks
  // şartını karşılamadığı için MISSING_TENANT_ID_LEADING_UNIQUE_INDEX üretir.
  it('tek kolonlu "tenant_id" UNIQUE INDEX bileşik şartı karşılamaz (kasıtlı, CLAUDE.md §7, solid gate T-004 tur 1 bulgu C8)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000009_fixture_single_column_unique_index',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement(
              'tenant_setting',
              ['"id" TEXT NOT NULL', '"tenant_id" TEXT NOT NULL'],
              'id',
            ),
            generateCreateUniqueIndexStatement('tenant_setting_tenant_id_key', 'tenant_setting', [
              'tenant_id',
            ]),
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = {
      platformLevelTables: [],
      tenantScopedTables: ['tenant_setting'],
    }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(
        violations.some((violation) => violation.rule === 'MISSING_TENANT_ID_LEADING_UNIQUE_INDEX'),
      ).toBe(true)
    })
  })
})

// --- Security gate T-004 tur 1, bulgu 1 (high) — ad çıkarımı vs gövde ayrıştırması ---
//
// Kanıt: tek satırlık bir `CREATE TABLE "..." (...);` ifadesi gevşek AD
// deseniyle YİNE DE görülür (UNCLASSIFIED_TABLE hâlâ fırlar), ama KATI gövde
// deseniyle AYRIŞTIRILAMAZ — sınıflandırılmış bir tablo için bu artık
// SESSİZCE GEÇİLMEZ, UNPARSABLE_CREATE_TABLE üretir.
describe('migration-set — prob süiti (CREATE TABLE ad deseni vs gövde ayrıştırması: gevşek desenin gördüğü ama katı desenin ayrıştıramadığı tablo)', () => {
  it('taksonomide OLMAYAN, tek satırlık CREATE TABLE UNCLASSIFIED_TABLE üretir (ad deseni görür, security gate T-004 tur 1 bulgu 1)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000010_fixture_single_line_unclassified',
        {
          migrationSql: generateSingleLineCreateTableStatement('invoice', [
            '"id" TEXT NOT NULL',
            '"tenant_id" TEXT NOT NULL',
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: [], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      expect(() => {
        validateMigrationSet(migrations, taxonomy)
      }).toThrow(/UNCLASSIFIED_TABLE/)
    })
  })

  it('taksonomide OLAN, tek satırlık CREATE TABLE gövdesi ayrıştırılamaz → UNPARSABLE_CREATE_TABLE üretir (sessiz geçmez, security gate T-004 tur 1 bulgu 1)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000011_fixture_single_line_unparsable',
        {
          migrationSql: generateSingleLineCreateTableStatement('tenant', [
            '"id" TEXT NOT NULL',
            '"tenant_id" TEXT NOT NULL',
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      expect(() => {
        validateMigrationSet(migrations, taxonomy)
      }).toThrow(/UNPARSABLE_CREATE_TABLE/)
    })
  })

  it('(regresyon yok) kanonik çok satırlı CREATE TABLE hâlâ sorunsuz ayrıştırılır', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000012_fixture_canonical_regression',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations).toHaveLength(0)
    })
  })
})

// --- solid gate T-004 tur 1, bulgu C5 — V3'ün isDirectory() yarısı ---
//
// qa gate T-004 tur 2 (mutasyon testiyle) kanıtladı: aşağıdaki ilk vaka
// `isDirectory()` filtresini KOŞTURUR ama PİNLEMEZ — filtre tamamen kaldırılsa
// bile vaka yeşil kalır, çünkü kök seviyesindeki `migration_lock.toml` normal
// bir DOSYA olduğu için `existsSync(join(root, 'migration_lock.toml',
// 'migration.sql'))` zaten `false` döner (iki kontrol bu girdi sınıfı için
// REDUNDANT). İKİNCİ vaka (symlink) solid gate T-004 tur 2'nin önerdiği
// GERÇEK ayırt edici girdiyi kurar: `migration.sql` içeren bir dizine işaret
// eden kök sembolik bağı, `Dirent.isDirectory()` için `false` ama
// `existsSync` için `true` döner — `isDirectory()` filtresi kaldırılırsa BU
// vaka kırmızıya döner (bkz. bu Task'ın T-004 düzeltme turu 2 raporu: filtre
// geçici kaldırılıp test koşturuldu, ardından geri alındı).
describe('migration-set — prob süiti (kök seviyesindeki migration_lock.toml migration dizini sayılmaz)', () => {
  it('kök seviyesindeki migration_lock.toml (normal dosya) migration sayılmaz', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000013_fixture_root_lock_sibling',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
          ]),
        },
      ],
    ])
    const rootFiles = new Map<string, string>([
      ['migration_lock.toml', 'provider = "postgresql"\n'],
    ])

    withTemporaryMigrationSet(
      directories,
      (migrationsDir) => {
        const migrations = readMigrationSet(migrationsDir)
        expect(migrations.map((migration) => migration.directoryName)).toEqual([
          '19800101000013_fixture_root_lock_sibling',
        ])
      },
      rootFiles,
    )
  })

  // qa gate T-004 tur 2, bulgu medium + solid gate T-004 tur 2, bulgu low:
  // `isDirectory()` dalının GERÇEK pin'i — hedef, kendi `migration.sql`
  // dosyasını taşıyan gerçek bir alt dizin; kökte ona işaret eden bir
  // sembolik bağ kurulur. `Dirent.isDirectory()` symlink girdisi için `false`
  // döner ama `existsSync` bağlantıyı İZLEYİP `true` döndüğü için, bu girdi
  // YALNIZCA `isDirectory()` filtresi varken dışlanır.
  //
  // Windows'ta dizin sembolik bağı oluşturmak ek ayrıcalık isteyebilir; CI
  // `ubuntu-latest` üzerinde koşuyor (T-004.md V-C5) ve geliştirici
  // makineleri macOS/Linux — bu yüzden `win32` için koşullu atlama kabul
  // edilebilir (AGENT_BASELINE talimatı), skip'in kendisi `it.each` DEĞİL.
  it.skipIf(process.platform === 'win32')(
    "migration.sql içeren bir dizine işaret eden kök sembolik bağ migration sayılmaz (isDirectory() dalının gerçek pin'i)",
    () => {
      const directories = new Map<string, MigrationDirectoryContent>([
        [
          '19800101000014_fixture_symlink_target',
          {
            migrationSql: joinMigrationStatements([
              generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
            ]),
          },
        ],
      ])
      const rootSymlinks = new Map<string, string>([
        ['19800101000015_fixture_symlink_alias', '19800101000014_fixture_symlink_target'],
      ])

      withTemporaryMigrationSet(
        directories,
        (migrationsDir) => {
          const migrations = readMigrationSet(migrationsDir)
          expect(migrations.map((migration) => migration.directoryName)).toEqual([
            '19800101000014_fixture_symlink_target',
          ])
        },
        undefined,
        rootSymlinks,
      )
    },
  )
})

// --- security gate T-004 tur 2, bulgu 1 (medium) — ad/gövde desenlerinin
// harf, boşluk, "IF NOT EXISTS" ve şema öneki biçimlerine karşı duyarsızlığı ---
//
// qa/security tur 2'nin ORTAK bulgusu: FIX 1 (tur 1) yıkıcı taramayı büyük
// harfe normalize etti ama iki `CREATE TABLE` desenini (ad, gövde) ETMEDİ.
// Aşağıdaki altı biçim — küçük harf, karışık harf, çift boşluk,
// `IF NOT EXISTS`, şema öneki, satır sonu — hiçbiri eski desenle
// eşleşmiyordu; hepsi tek bir tablo-sürücülü `it()` içinde (R-P1: `it.each`
// DEĞİL, toplama anında tetiklenmeyen bir döngü) doğrulanıyor.
describe('migration-set — prob süiti (CREATE TABLE ad deseni harf/boşluk/biçim duyarsızlığı)', () => {
  it('altı biçim varyantının her biri UNCLASSIFIED_TABLE üretir (taksonomide olmayan tablo sessizce geçmez)', () => {
    const formatVariants: readonly { readonly label: string; readonly sql: string }[] = [
      { label: 'küçük harf', sql: 'create table "invoice" ("id" text not null);' },
      { label: 'karışık harf (Create Table)', sql: 'Create Table "invoice" ("id" text not null);' },
      { label: 'çift boşluk', sql: 'CREATE  TABLE "invoice" ("id" TEXT NOT NULL);' },
      {
        label: 'IF NOT EXISTS',
        sql: 'CREATE TABLE IF NOT EXISTS "invoice" ("id" TEXT NOT NULL);',
      },
      { label: 'şema öneki', sql: 'CREATE TABLE public."invoice" ("id" TEXT NOT NULL);' },
      {
        label: 'satır sonu (CREATE\\nTABLE)',
        sql: 'CREATE\nTABLE "invoice" ("id" TEXT NOT NULL);',
      },
    ]

    for (const variant of formatVariants) {
      const directories = new Map<string, MigrationDirectoryContent>([
        ['19800101000019_fixture_format_variant', { migrationSql: variant.sql }],
      ])
      const taxonomy: TenantTaxonomy = { platformLevelTables: [], tenantScopedTables: [] }

      withTemporaryMigrationSet(directories, (migrationsDir) => {
        const migrations = readMigrationSet(migrationsDir)
        const violations = collectMigrationSetViolations(migrations, taxonomy)
        expect(
          violations.some((violation) => violation.rule === 'UNCLASSIFIED_TABLE'),
          `biçim "${variant.label}" UNCLASSIFIED_TABLE üretmedi`,
        ).toBe(true)
      })
    }
  })

  it('kanonik biçim hâlâ temiz kalır (regresyon yok)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000020_fixture_format_canonical_regression',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations).toHaveLength(0)
    })
  })

  // solid gate T-004 tur 2 önerisi: "ayna bekçisi" — ad deseninin TANIMADIĞI
  // bir CREATE TABLE biçimi (tırnaksız ad, bu turda hâlâ ayrıştırılmıyor,
  // v0.0.13 borcu) sessizce geçmesin.
  it('tırnaksız tablo adı taşıyan CREATE TABLE sessizce geçmez, UNPARSABLE_CREATE_TABLE üretir (ayna bekçisi)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000021_fixture_unquoted_table_name',
        { migrationSql: 'CREATE TABLE invoice ("id" TEXT NOT NULL);' },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: [], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'UNPARSABLE_CREATE_TABLE')).toBe(
        true,
      )
    })
  })
})

// --- solid/security gate T-004 tur 2, bulgu low/D1 — gövde deseninin ifade
// sınırını aşmaması ---
describe('migration-set — prob süiti (CREATE TABLE gövde deseni ifade sınırında durur)', () => {
  it('tek satırlık tablo onu izleyen kanonik tabloyu yutmaz, ihlal doğru tabloya atfedilir', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000022_fixture_body_boundary_no_swallow',
        {
          migrationSql: [
            generateSingleLineCreateTableStatement('invoice_short', [
              '"id" TEXT NOT NULL',
              '"tenant_id" TEXT NOT NULL',
            ]),
            generateCreateTableStatement('ledger_entry', ['"id" TEXT NOT NULL'], 'id'),
          ].join('\n'),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = {
      platformLevelTables: ['ledger_entry'],
      tenantScopedTables: ['invoice_short'],
    }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(
        violations.some(
          (violation) =>
            violation.tableName === 'invoice_short' && violation.rule === 'UNPARSABLE_CREATE_TABLE',
        ),
      ).toBe(true)
      expect(violations.some((violation) => violation.tableName === 'ledger_entry')).toBe(false)
    })
  })
})

// --- security gate T-004 tur 2, bulgu 3 (low) — yıkıcı tarama C1
// düzeltmesinin açtığı yanlış pozitif (tek tırnaklı dize literalleri) ---
describe('migration-set — prob süiti (DESTRUCTIVE_STATEMENT tek tırnaklı dize literallerini yanlış pozitif saymaz)', () => {
  it('INSERT değeri olarak "Drop Shipping" DESTRUCTIVE_STATEMENT üretmez', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000016_fixture_insert_literal_drop_shipping',
        {
          migrationSql:
            '-- CreateSeedData\nINSERT INTO "plan" ("id", "name") VALUES (\'pln_1\', \'Drop Shipping\');\n',
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['plan'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(false)
    })
  })

  it('sütun varsayılanındaki tek tırnaklı "set not null" dizesi DESTRUCTIVE_STATEMENT üretmez', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000017_fixture_default_literal_set_not_null',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement(
              'tenant',
              ['"id" TEXT NOT NULL', `"status" TEXT NOT NULL DEFAULT 'set not null'`],
              'id',
            ),
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(false)
    })
  })

  it('ENABLE ROW LEVEL SECURITY / CREATE POLICY ifadeleri DESTRUCTIVE_STATEMENT üretmez (v0.0.13 öngörüsü)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000018_fixture_rls_policy_clean',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
            'ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;',
            `CREATE POLICY "tenant_isolation" ON "tenant" USING (current_setting('app.tenant_id') IS NOT NULL);`,
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(false)
    })
  })
})

// --- DÜZELTME TURU 5 (security gate T-004 tur 5, bulgu high — kullanıcı
// kararı) — tur 3/4'ün maskeleme makinesi TAMAMEN KALDIRILDI. Aşağıdaki dört
// vaka (C1/C2/C3/C5) tur 3'te maskeleme fail-open'ını kanıtlıyordu; şimdi
// maskeleme hiç yapılmadığı için aralarındaki gerçek `DROP COLUMN` DOĞRUDAN
// (hiçbir aracı mekanizmadan geçmeden) bulunuyor. Vakalar KORUNDU — artık
// REGRESYON BEKÇİSİ: maskeleme bir daha "düzeltme" diye eklenirse bu dört
// vaka kırmızıya döner. `UNPARSABLE_SQL` beklentileri kaldırıldı (kural
// kendisi kaldırıldığı için).
describe('migration-set — prob süiti (DÜZELTME TURU 5: maskeleme kaldırıldı — gerçek DROP COLUMN apostrof arasında bile doğrudan bulunur)', () => {
  it('C1: çift tırnaklı tanımlayıcı içindeki apostrof + sonraki literal — gerçek DROP COLUMN doğrudan yakalanır', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000023_fixture_c1_quoted_identifier_apostrophe',
        {
          migrationSql:
            `ALTER TABLE "o'brien" DROP COLUMN "x";\n` +
            `INSERT INTO "plan" ("name") VALUES ('Pro');\n`,
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['plan'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })

  it('C2: $$...$$ fonksiyon gövdesindeki Türkçe blok yorumdaki apostrof + sonraki literal — gerçek DROP COLUMN doğrudan yakalanır', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000024_fixture_c2_dollar_quoted_body_comment',
        {
          migrationSql:
            'CREATE OR REPLACE FUNCTION f() RETURNS void AS $$\n' +
            'BEGIN\n' +
            "  /* tenant'in kimligi burada kontrol edilir */\n" +
            '  NULL;\n' +
            'END;\n' +
            '$$ LANGUAGE plpgsql;\n' +
            'ALTER TABLE "app_user" DROP COLUMN "legacy_note";\n' +
            'INSERT INTO "setting" ("key","value") VALUES (\'locale\',\'tr-TR\');\n',
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = {
      platformLevelTables: ['app_user', 'setting'],
      tenantScopedTables: [],
    }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })

  it('C3: stripLineComments zincirinin bir literali kesmesi + sonraki literal — gerçek DROP COLUMN doğrudan yakalanır', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000025_fixture_c3_comment_strip_cuts_literal',
        {
          migrationSql:
            `INSERT INTO "plan" ("n") VALUES ('Pro -- en iyi');\n` +
            `ALTER TABLE "app_user" DROP COLUMN "legacy_note";\n` +
            `INSERT INTO "setting" ("k") VALUES ('locale');\n`,
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = {
      platformLevelTables: ['plan', 'app_user', 'setting'],
      tenantScopedTables: [],
    }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })

  it('C5: kapanmayan (dangling) literal + sonraki literal — gerçek DROP COLUMN doğrudan yakalanır', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000026_fixture_c5_unclosed_literal',
        {
          migrationSql:
            `INSERT INTO "plan" ("n") VALUES ('x);\n` +
            `ALTER TABLE "app_user" DROP COLUMN "legacy_note";\n` +
            `INSERT INTO "setting" ("k") VALUES ('locale');\n`,
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = {
      platformLevelTables: ['plan', 'app_user', 'setting'],
      tenantScopedTables: [],
    }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })

  // Ters yön — "Drop Shipping" (karışık harf) `includes('DROP ')` (büyük
  // harf) ile eşleşmediği için hâlâ temiz. Bu, HEAD'in zaten taşıdığı
  // davranış, DEĞİŞMEDİ.
  it('(regresyon yok) karışık harfli "Drop Shipping" hâlâ temiz', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000027_fixture_regression_drop_shipping',
        {
          migrationSql:
            '-- CreateSeedData\nINSERT INTO "plan" ("id", "name") VALUES (\'pln_1\', \'Drop Shipping\');\n',
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['plan'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations).toHaveLength(0)
    })
  })

  it('(regresyon yok) gerçek DROP COLUMN (tırnaksız) hâlâ doğrudan yakalanır', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000028_fixture_regression_plain_drop',
        { migrationSql: generateDropColumnStatement('tenant', 'legacy_field') },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['tenant'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })

  // YENİ VAKA (security gate T-004 tur 5 Tamamlanma Tanımı §2): BÜYÜK harfle
  // yazılmış bir dize literali içindeki "DROP " artık yeniden
  // `DESTRUCTIVE_STATEMENT` ÜRETİR — HEAD'in zaten taşıdığı, BİLİNEN ve
  // KASITLI kabul edilmiş yanlış pozitif (fail-closed, fail-open DEĞİL). Bu
  // vaka bunu PİNLER ki gelecekte "düzeltme" diye maskeleme geri gelmesin.
  it("(kasıtlı, pinlenmiş) BÜYÜK harfli 'DROP SHIPPING' dize literali içinde olsa da DESTRUCTIVE_STATEMENT üretir", () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000040_fixture_uppercase_drop_shipping_literal',
        {
          migrationSql:
            '-- CreateSeedData\nINSERT INTO "plan" ("id", "name") VALUES (\'pln_1\', \'DROP SHIPPING\');\n',
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['plan'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })

  // F-B3 (security gate T-004 tur 5 raporu, birebir) — gerçekçi v0.0.13 RLS
  // migration senaryosu: geliştirici meşru bir `CREATE POLICY ... USING
  // (current_setting('app.tenant_id', TRUE))` yazar, iki Türkçe blok yorum
  // koyar, araya gerçek bir `DROP COLUMN` girer. Tur 4'ün maskeleme
  // makinesinde bu SESSİZCE kaybolurdu (`[]`); maskeleme kaldırıldığı için
  // artık DOĞRUDAN bulunur.
  it('F-B3: RLS POLICY + iki Türkçe blok yorum arasındaki gerçek DROP COLUMN doğrudan yakalanır (gerçekçi v0.0.13 senaryosu)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000041_fixture_f_b3_rls_policy_realistic',
        {
          migrationSql:
            `CREATE POLICY "p" ON "invoice" USING ("tenant_id" = current_setting('app.tenant_id', TRUE));\n` +
            `/* tenant'in eski kolonu */\n` +
            `ALTER TABLE "app_user" DROP COLUMN "legacy_note";\n` +
            `/* musteri'nin talebi */\n`,
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: [], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })
})

// --- security gate T-004 tur 5 raporu, Tamamlanma Tanımı §1 — ÜÇ sınıfın
// HER BİRİNDEN en az bir temsilci vaka (dedike, isimle etiketlenmiş). Yukarıdaki
// vektörler (C1-C5, E1-E6, F-B3) bu üç sınıfı zaten dolaylı kapsıyor; aşağıdaki
// üçü DOĞRUDAN, minimal ve sınıf adıyla etiketlenmiş biçimde pinler.
describe('migration-set — prob süiti (security tur5 Tamamlanma Tanımı §1: üç sınıfın minimal temsilcisi)', () => {
  it('sınıf (i): aynı ifadede iki apostrof, ";" hiç aşılmıyor — gerçek DROP COLUMN doğrudan yakalanır', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000042_fixture_class_i_same_statement_two_apostrophes',
        { migrationSql: `ALTER TABLE "o'brien" ALTER COLUMN "d'arcy" DROP COLUMN "x";\n` },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: [], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })

  it('sınıf (ii): terminatör ";" blok yorumları arasındaki eşleşmenin DIŞINDA kalıyor — gerçek DROP TABLE doğrudan yakalanır', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000043_fixture_class_ii_comment_outside_match',
        { migrationSql: `/* a'b */\nDROP TABLE "x";\n/* c'd */\n` },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: [], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })

  it('sınıf (iii): yıkıcı ifade dosyanın SON ifadesi, ";" hiç taşımıyor — gerçek DROP COLUMN doğrudan yakalanır', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000044_fixture_class_iii_last_statement_no_semicolon',
        {
          migrationSql:
            `/* tenant'in */\n` +
            `ALTER TABLE "app_user" DROP COLUMN "legacy_note"\n` +
            `/* musteri'nin */`,
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: [], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT')).toBe(true)
    })
  })
})

// --- DÜZELTME TURU 5 (security gate T-004 tur 5, bulgu high — kullanıcı
// kararı) — turu 4'ün yapısal değişmezi (`;` kontrolü) de maskeleme
// makinesiyle BİRLİKTE kaldırıldı. Yedi vektör (E1, E2, E2b, E3, E4, E4b, E6
// — security tur4 raporu) KORUNDU: artık maskeleme hiç yapılmadığı için
// aralarındaki gerçek `DROP COLUMN`/`SET NOT NULL` DOĞRUDAN bulunuyor —
// REGRESYON BEKÇİSİ (R-P1: `it.each` YASAK, tek tablo-sürücülü `it()`).
describe('migration-set — prob süiti (DÜZELTME TURU 5: maskeleme kaldırıldı — yedi vektörün hepsinde gerçek DROP/SET NOT NULL doğrudan bulunur)', () => {
  it('yedi bağımsız yolun her biri DESTRUCTIVE_STATEMENT üretir (maskeleme kaldırıldığı için aradaki yıkıcı ifade doğrudan bulunur)', () => {
    const vectors: readonly { readonly label: string; readonly sql: string }[] = [
      {
        // E1: iki tanımlayıcı apostrofu (çift tırnaklı ad içindeki apostrof) —
        // aradaki gerçek DROP COLUMN maskenin iki ucu arasında kalır.
        label: 'E1: iki çift-tırnaklı tanımlayıcı apostrofu + aradaki DROP COLUMN',
        sql:
          `ALTER TABLE "o'brien" DROP COLUMN "x";\n` +
          `ALTER TABLE "d'arcy" ADD COLUMN "y" TEXT;\n`,
      },
      {
        // E2: iki blok yorumdaki apostrof (stripLineComments bunları temizlemez
        // — yalnızca "--" işler) + aradaki gerçek DROP TABLE.
        label: 'E2: iki blok yorumdaki apostrof + aradaki DROP TABLE',
        sql: `/* a'b */\nDROP TABLE "x";\n/* c'd */\n`,
      },
      {
        // E2b: güvenlik tur4 raporunun somut v0.0.13 RLS senaryosu — iki Türkçe
        // blok yorum arasında gerçek bir DROP COLUMN.
        label: 'E2b: iki Türkçe blok yorumu arasında gerçek DROP COLUMN (v0.0.13 RLS senaryosu)',
        sql:
          `/* Her tenant yalnizca kendi kaydini gorur; politika tenant'in oturum\n` +
          `   degiskenini kullanir. */\n` +
          `ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;\n` +
          `CREATE POLICY "invoice_tenant_isolation" ON "invoice"\n` +
          `  USING ("tenant_id" = current_setting('app.tenant_id', TRUE));\n` +
          `\n` +
          `ALTER TABLE "app_user" DROP COLUMN "legacy_note";\n` +
          `\n` +
          `/* Not: musteri'nin talebi uzerine eski kolon kaldirildi. */\n`,
      },
      {
        // E3: stripLineComments'in İKİ literali kesmesi (her satır kendi
        // başına tek sayıda tırnak bırakır, ama toplam ÇİFT) + aradaki DROP
        // COLUMN.
        label: 'E3: stripLineComments iki literali kesiyor + aradaki DROP COLUMN',
        sql:
          `INSERT INTO "plan" ("n") VALUES ('Pro -- en iyi');\n` +
          `ALTER TABLE "app_user" DROP COLUMN "legacy_note";\n` +
          `INSERT INTO "setting" ("k") VALUES ('Lite -- ucuz');\n`,
      },
      {
        // E4: $$...$$ dolar-tırnak gövdesi içindeki apostrof (iki kez) +
        // aradaki gerçek DROP COLUMN.
        label: 'E4: $$...$$ gövdesi içindeki apostrof (iki kez) + aradaki DROP COLUMN',
        sql: `$$ a'b $$\nALTER TABLE "app_user" DROP COLUMN "legacy_note";\n$$ c'd $$\n`,
      },
      {
        // E4b: iki plpgsql fonksiyon gövdesinde apostrof (blok yorum içinde) +
        // aradaki gerçek DROP COLUMN.
        label: 'E4b: iki plpgsql gövdesinde apostrof + aradaki DROP COLUMN',
        sql:
          `CREATE OR REPLACE FUNCTION f() RETURNS void AS $$\n` +
          `BEGIN\n` +
          `  /* kullanici'nin oturumu kontrol edilir */\n` +
          `  NULL;\n` +
          `END;\n` +
          `$$ LANGUAGE plpgsql;\n` +
          `\n` +
          `ALTER TABLE "app_user" DROP COLUMN "legacy_note";\n` +
          `\n` +
          `CREATE OR REPLACE FUNCTION g() RETURNS void AS $$\n` +
          `BEGIN\n` +
          `  /* musterinin degil musteri'nin talebi */\n` +
          `  NULL;\n` +
          `END;\n` +
          `$$ LANGUAGE plpgsql;\n`,
      },
      {
        // E6: E1 ile aynı yol ama SET NOT NULL dalı için (DROP yerine).
        label: 'E6: iki çift-tırnaklı tanımlayıcı apostrofu + aradaki SET NOT NULL',
        sql:
          `ALTER TABLE "o'brien" ALTER COLUMN "x" SET NOT NULL;\n` +
          `ALTER TABLE "d'arcy" ADD COLUMN "y" TEXT;\n`,
      },
    ]

    const taxonomy: TenantTaxonomy = { platformLevelTables: [], tenantScopedTables: [] }

    for (const vector of vectors) {
      const directories = new Map<string, MigrationDirectoryContent>([
        ['19800101000038_fixture_turn4_vector', { migrationSql: vector.sql }],
      ])

      withTemporaryMigrationSet(directories, (migrationsDir) => {
        const migrations = readMigrationSet(migrationsDir)
        const violations = collectMigrationSetViolations(migrations, taxonomy)
        expect(
          violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT'),
          `${vector.label} — DESTRUCTIVE_STATEMENT üretmedi`,
        ).toBe(true)
      })
    }
  })

  // Ters doğrulama — tur 3'ün dört yolu (C1/C2/C3/C5; kanonik versiyonları
  // yukarıdaki "DÜZELTME TURU 5" describe'ında zaten koşuyor, burada AYNI SQL
  // ayrı bir fixture dizin adıyla tekrar sınanıyor) maskeleme kaldırıldıktan
  // SONRA da hâlâ yakalanıyor mu — dördü de DOĞRUDAN (aracı mekanizma
  // olmadan) bulunmalı.
  it("(regresyon yok) tur 3'ün dört yolu (C1/C2/C3/C5) maskeleme kaldırıldıktan sonra da DESTRUCTIVE_STATEMENT üretiyor", () => {
    const tur3Vectors: readonly { readonly label: string; readonly sql: string }[] = [
      {
        label: 'C1',
        sql: `ALTER TABLE "o'brien" DROP COLUMN "x";\nINSERT INTO "plan" ("name") VALUES ('Pro');\n`,
      },
      {
        label: 'C2',
        sql:
          'CREATE OR REPLACE FUNCTION f() RETURNS void AS $$\n' +
          'BEGIN\n' +
          "  /* tenant'in kimligi burada kontrol edilir */\n" +
          '  NULL;\n' +
          'END;\n' +
          '$$ LANGUAGE plpgsql;\n' +
          'ALTER TABLE "app_user" DROP COLUMN "legacy_note";\n' +
          'INSERT INTO "setting" ("key","value") VALUES (\'locale\',\'tr-TR\');\n',
      },
      {
        label: 'C3',
        sql:
          `INSERT INTO "plan" ("n") VALUES ('Pro -- en iyi');\n` +
          `ALTER TABLE "app_user" DROP COLUMN "legacy_note";\n` +
          `INSERT INTO "setting" ("k") VALUES ('locale');\n`,
      },
      {
        label: 'C5',
        sql:
          `INSERT INTO "plan" ("n") VALUES ('x);\n` +
          `ALTER TABLE "app_user" DROP COLUMN "legacy_note";\n` +
          `INSERT INTO "setting" ("k") VALUES ('locale');\n`,
      },
    ]
    const taxonomy: TenantTaxonomy = {
      platformLevelTables: ['plan', 'app_user', 'setting'],
      tenantScopedTables: [],
    }

    for (const vector of tur3Vectors) {
      const directories = new Map<string, MigrationDirectoryContent>([
        ['19800101000039_fixture_turn3_regression', { migrationSql: vector.sql }],
      ])

      withTemporaryMigrationSet(directories, (migrationsDir) => {
        const migrations = readMigrationSet(migrationsDir)
        const violations = collectMigrationSetViolations(migrations, taxonomy)
        expect(
          violations.some((violation) => violation.rule === 'DESTRUCTIVE_STATEMENT'),
          `${vector.label} — DESTRUCTIVE_STATEMENT üretmedi (regresyon)`,
        ).toBe(true)
      })
    }
  })
})

// --- DÜZELTME TURU 5 (security gate T-004 tur 5, bulgu high — kullanıcı
// kararı): maskeleme makinesi KALDIRILDIĞI için ayna bekçisi yeniden
// `stripLineComments` çıktısı (maskelenmemiş `sql`) üzerinde sayıyor. Turu
// 3'ün kapattığı aşağıdaki yanlış pozitif (dize literali içindeki sahte
// "CREATE TABLE" jetonu) BİLEREK YENİDEN AÇILDI — kabul edilebilir, çünkü
// FAIL-CLOSED (gürültülü kırmızı, insan incelemesi gerektiren sahte
// `UNPARSABLE_CREATE_TABLE`), FAIL-OPEN DEĞİL. ROADMAP borcu olarak
// kaydedildi (`architect`, v0.0.13, durum-tutan tek geçişli tarayıcıyla
// birlikte).
describe('migration-set — prob süiti (ayna bekçisi dize literali içindeki sahte CREATE TABLE jetonunu YENİDEN sayar — DÜZELTME TURU 5)', () => {
  it('(kasıtlı, pinlenmiş) dize literali içindeki sahte "CREATE TABLE" metni maskeleme kaldırıldığı için yeniden UNPARSABLE_CREATE_TABLE üretir', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000029_fixture_guard_string_literal_false_positive',
        {
          migrationSql:
            '-- CreateSeedData\nINSERT INTO "audit_log" ("statement") VALUES (\'CREATE TABLE foo (id text)\');\n',
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['audit_log'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'UNPARSABLE_CREATE_TABLE')).toBe(
        true,
      )
    })
  })

  it('(regresyon yok) tırnaksız gerçek tablo adı hâlâ UNPARSABLE_CREATE_TABLE üretir', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000030_fixture_guard_regression_unquoted_name',
        { migrationSql: 'CREATE TABLE invoice ("id" TEXT NOT NULL);' },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: [], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'UNPARSABLE_CREATE_TABLE')).toBe(
        true,
      )
    })
  })
})

// --- DÜZELTME TURU 3 — security gate T-004 tur 3, bulgu low/C2: gövde
// çapasının `[^;]*?` yasağı kanonik ama noktalı virgül taşıyan gövdeleri
// (DEFAULT/CHECK) yanlış pozitif ayrıştırılamaz sayıyordu ---
//
// DAVRANIŞ GÜNCELLEMESİ (DÜZELTME TURU 5, security gate T-004 tur 5 bulgu
// high — kullanıcı kararı): turu 4'ün yapısal değişmezi ("maskelenen her
// eşleşme ';' içermemeli") maskeleme makinesiyle BİRLİKTE KALDIRILDI — bu iki
// vaka artık `UNPARSABLE_SQL` ÜRETMEZ (o kural yok), turu 3'ün ORİJİNAL
// beklentisine (tamamen TEMİZ: gövde çapasının negatif ileri-bakışı sayesinde
// `;` içeren meşru bir literal DOĞRU ayrıştırılır) GERİ DÖNÜLDÜ.
describe('migration-set — prob süiti (CREATE TABLE gövdesinde noktalı virgül UNPARSABLE_CREATE_TABLE yanlış pozitifi üretmez — temiz ayrıştırılır)', () => {
  it("DEFAULT değerindeki noktalı virgül (DEFAULT 'a;b') hiçbir ihlal üretmez (temiz ayrıştırılır)", () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000031_fixture_default_value_semicolon',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement(
              'note_table',
              ['"id" TEXT NOT NULL', `"note" TEXT NOT NULL DEFAULT 'a;b'`],
              'id',
            ),
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: ['note_table'], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations).toHaveLength(0)
    })
  })

  it('CHECK kısıtındaki noktalı virgül (CHECK ("id" <> \';\')) hiçbir ihlal üretmez (temiz ayrıştırılır)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000032_fixture_check_constraint_semicolon',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement(
              'note_table_two',
              ['"id" TEXT NOT NULL', `CONSTRAINT "c" CHECK ("id" <> ';')`],
              'id',
            ),
          ]),
        },
      ],
    ])
    const taxonomy: TenantTaxonomy = {
      platformLevelTables: ['note_table_two'],
      tenantScopedTables: [],
    }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations).toHaveLength(0)
    })
  })
})

// --- DÜZELTME TURU 3 — security gate T-004 tur 3, bulgu low/C3 (seçim):
// CREATE_TABLE_TOKEN_PATTERN artık UNLOGGED/TEMP/GLOBAL/LOCAL değiştiricilerini
// tanıyor — bu biçimler artık TAM fail-open değil, bekçi tarafından
// UNPARSABLE_CREATE_TABLE ile işaretleniyor (fail-closed) ---
describe('migration-set — prob süiti (CREATE UNLOGGED TABLE artık bekçiden kaçmıyor)', () => {
  it('CREATE UNLOGGED TABLE UNPARSABLE_CREATE_TABLE üretir (önceden hem ad hem bekçiden kaçıyordu)', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000033_fixture_unlogged_table',
        { migrationSql: 'CREATE UNLOGGED TABLE "invoice" ("id" TEXT NOT NULL);' },
      ],
    ])
    const taxonomy: TenantTaxonomy = { platformLevelTables: [], tenantScopedTables: [] }

    withTemporaryMigrationSet(directories, (migrationsDir) => {
      const migrations = readMigrationSet(migrationsDir)
      const violations = collectMigrationSetViolations(migrations, taxonomy)
      expect(violations.some((violation) => violation.rule === 'UNPARSABLE_CREATE_TABLE')).toBe(
        true,
      )
    })
  })
})

// --- DÜZELTME TURU 3 — solid gate T-004 tur 3, bulgu low (rootSymlinks hedef
// doğrulaması): hedef "directories" içinde migration.sql taşıyan bir dizin
// olarak bulunamazsa fixture KULLANIM HATASI olarak fırlar ---
describe('migration-set — prob süiti (rootSymlinks hedefi doğrulanır)', () => {
  it("yanlış yazılmış (var olmayan) rootSymlinks hedefi fixture'ı fırlatır", () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      [
        '19800101000034_fixture_symlink_target_valid',
        {
          migrationSql: joinMigrationStatements([
            generateCreateTableStatement('tenant', ['"id" TEXT NOT NULL'], 'id'),
          ]),
        },
      ],
    ])
    const rootSymlinks = new Map<string, string>([
      ['19800101000035_fixture_symlink_alias', '19800101000034_fixture_symlink_target_mispelled'],
    ])

    expect(() => {
      withTemporaryMigrationSet(directories, () => undefined, undefined, rootSymlinks)
    }).toThrow(/rootSymlinks hedefi/)
  })

  it('hedefi migration.sql taşımayan (yalnızca lock içeren) bir dizine işaret eden rootSymlinks de fırlatır', () => {
    const directories = new Map<string, MigrationDirectoryContent>([
      ['19800101000036_fixture_symlink_target_lock_only', { hasMigrationLock: true }],
    ])
    const rootSymlinks = new Map<string, string>([
      [
        '19800101000037_fixture_symlink_alias_lock_only',
        '19800101000036_fixture_symlink_target_lock_only',
      ],
    ])

    expect(() => {
      withTemporaryMigrationSet(directories, () => undefined, undefined, rootSymlinks)
    }).toThrow(/rootSymlinks hedefi/)
  })
})
