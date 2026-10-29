// @arkesoft/db — canlı katalog linter'ının AC2/AC3 kanıtları (ROADMAP v0.0.13,
// T-005/S4, architect K-E1/K-E11)
//
// Bu dosya `catalog-snapshot.ts` + `catalog-lint.ts`'i GERÇEK Postgres
// bağlantısıyla çalıştırır — `*.isolation.test.ts` deseni (`vitest.isolation.
// config.ts`), `pnpm test` hattında KOŞMAZ (V4).
//
// AC3 PROBU `DROP TABLE` KULLANMAZ (K-E11): her prob tablosu
// `testMigrationPrisma.$transaction` İÇİNDE `CREATE TABLE` ile kurulur, AYNI
// `tx` üzerinden `readCatalogSnapshot`/`lintCatalog`'a okutulur, sonra bir
// SENTINEL hata fırlatılarak ROLLBACK edilir. Transaction geri alındığında
// `CREATE TABLE` de dahil tüm DDL geri alınır — yetim tablo kalmaz (bu
// dosyanın son testi bunu mekanik olarak doğrular).
//
// AMPİRİK ÖLÇÜM: `CREATE POLICY ... USING (...)` DDL'i Postgres'te BAĞLI
// PARAMETRE KABUL ETMEZ (`08P01 bind message supplies N parameters, but
// prepared statement requires 0`) — tıpkı asıl migration'ın (`<ts>_rls_
// tenant_isolation/migration.sql`) GUC adını LİTERAL yazmak ZORUNDA kalmasının
// sebebi. Bu yüzden vaka (a)'nın politika DDL'inde `TENANT_CONTEXT_SETTING`
// BAĞLI PARAMETRE olarak GEÇİRİLEMEZ — bu dosya bir TEST YARDIMCISIDIR
// (`tenant-context.ts`'in dosya başı yorumundaki istisna: "test yardımcıları
// hariç"), `migration-sql.test.ts`'in fixture'larıyla AYNI emsal.

import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { lintCatalog, type LintFinding } from '../catalog-lint.js'
import { readCatalogSnapshot } from '../catalog-snapshot.js'
import type { TransactionClient } from '../client.js'
import { TENANT_CONTEXT_SETTING } from '../tenant-context.js'
import { PLATFORM_LEVEL_TABLES, TENANT_SCOPED_TABLES } from '../tenancy.js'
import { testAppPrisma, testMigrationPrisma } from './helpers/test-client.js'

/** AC3 probunun tablo adlarının ORTAK öneki — DoD'un yetim-tablo kontrolü bunu kullanır. */
const PROBE_TABLE_PREFIX = 'catalog_lint_probe_'

/** `testMigrationPrisma.$transaction`'ı KASITLI olarak ROLLBACK ettirmek için fırlatılan sentinel. */
class ProbeRollbackSentinel extends Error {
  constructor() {
    super("AC3 probu: bu hata YALNIZCA transaction'ı geri almak için fırlatıldı.")
  }
}

/**
 * `testMigrationPrisma.$transaction` içinde `body`'yi çalıştırır, `body`'nin
 * ürettiği değeri YAKALAR ve transaction'ı `ProbeRollbackSentinel` ile
 * ROLLBACK ettirir — `DROP TABLE` YOK (K-E11), yetim tablo kalmaz.
 */
async function runProbeAndRollback<T>(body: (tx: TransactionClient) => Promise<T>): Promise<T> {
  let captured: T | undefined
  await expect(
    testMigrationPrisma.$transaction(async (tx) => {
      captured = await body(tx)
      throw new ProbeRollbackSentinel()
    }),
  ).rejects.toThrow(ProbeRollbackSentinel)
  // FIX turu 1 (solid [low] bulgusu): `captured` `body` başarıyla
  // tamamlandıktan SONRA atanır; sentinel'den ÖNCE atandığı için buraya
  // ulaşıldığında her zaman tanımlı OLMALIDIR — ama bu artık `as T` ile
  // İDDİA edilmiyor, ÇALIŞMA ZAMANINDA doğrulanıyor (CLAUDE.md §4: `as`
  // yalnızca runtime doğrulamasından SONRA kabul edilir).
  if (captured === undefined) {
    throw new Error(
      'runProbeAndRollback(): captured tanımsız — body() sentinel fırlatılmadan önce tamamlanmadı.',
    )
  }
  return captured
}

describe('catalog-lint — canlı katalog (AC2/AC3)', () => {
  let appRoleName: string

  beforeAll(async () => {
    const rows = z
      .array(z.object({ roleName: z.string() }))
      .parse(await testAppPrisma.$queryRaw`SELECT current_user::text AS "roleName"`)
    const role = rows[0]
    if (role === undefined) {
      throw new Error('current_user sorgusu boş döndü — beklenmeyen ortam.')
    }
    appRoleName = role.roleName
  })

  it('sağlıklı durum: canlı şema taksonomiyle tutarlı — hiçbir bulgu YOK', async () => {
    const snapshot = await readCatalogSnapshot(testMigrationPrisma, appRoleName)
    const findings = lintCatalog(snapshot, {
      taxonomy: {
        tenantScopedTables: TENANT_SCOPED_TABLES,
        platformLevelTables: PLATFORM_LEVEL_TABLES,
      },
      tenantContextSetting: TENANT_CONTEXT_SETTING,
      appRoleName,
    })
    expect(findings).toEqual([])
  })

  describe('AC3 probu — dört vaka (CREATE + aynı tx + sentinel ROLLBACK; (d) FIX turu 2/K-E5 revizyonu)', () => {
    it('vaka (a): ENABLE var, FORCE yok → RLS_NOT_FORCED (ve RLS_NOT_ENABLED DEĞİL)', async () => {
      const tableName = `${PROBE_TABLE_PREFIX}force`

      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`CREATE TABLE catalog_lint_probe_force (id text PRIMARY KEY, tenant_id text NOT NULL)`
        await tx.$executeRaw`ALTER TABLE catalog_lint_probe_force ENABLE ROW LEVEL SECURITY`
        // Dosya başı AMPİRİK ÖLÇÜM notu: `CREATE POLICY` bağlı parametre
        // kabul etmez — `TENANT_CONTEXT_SETTING` burada BİLEREK literal.
        await tx.$executeRaw`
          CREATE POLICY catalog_lint_probe_force_policy ON catalog_lint_probe_force
            USING (tenant_id = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
        `

        const snapshot = await readCatalogSnapshot(tx, appRoleName)
        return lintCatalog(snapshot, {
          taxonomy: {
            tenantScopedTables: [...TENANT_SCOPED_TABLES, tableName],
            platformLevelTables: PLATFORM_LEVEL_TABLES,
          },
          tenantContextSetting: TENANT_CONTEXT_SETTING,
          appRoleName,
        })
      })

      expect(
        findings.some(
          (finding: LintFinding) =>
            finding.rule === 'RLS_NOT_FORCED' && finding.tableName === tableName,
        ),
      ).toBe(true)
      expect(
        findings.some(
          (finding: LintFinding) =>
            finding.rule === 'RLS_NOT_ENABLED' && finding.tableName === tableName,
        ),
      ).toBe(false)
    })

    it('vaka (b): politika hiç yok → MISSING_TENANT_POLICY', async () => {
      const tableName = `${PROBE_TABLE_PREFIX}policy`

      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`CREATE TABLE catalog_lint_probe_policy (id text PRIMARY KEY, tenant_id text NOT NULL)`
        await tx.$executeRaw`ALTER TABLE catalog_lint_probe_policy ENABLE ROW LEVEL SECURITY`
        await tx.$executeRaw`ALTER TABLE catalog_lint_probe_policy FORCE ROW LEVEL SECURITY`
        // KASITLI OLARAK politika YOK.

        const snapshot = await readCatalogSnapshot(tx, appRoleName)
        return lintCatalog(snapshot, {
          taxonomy: {
            tenantScopedTables: [...TENANT_SCOPED_TABLES, tableName],
            platformLevelTables: PLATFORM_LEVEL_TABLES,
          },
          tenantContextSetting: TENANT_CONTEXT_SETTING,
          appRoleName,
        })
      })

      expect(
        findings.some(
          (finding: LintFinding) =>
            finding.rule === 'MISSING_TENANT_POLICY' && finding.tableName === tableName,
        ),
      ).toBe(true)
    })

    it('vaka (c): tenant_id var, taksonomide yok → TENANT_ID_WITHOUT_TAXONOMY_ENTRY (R-C2)', async () => {
      const tableName = `${PROBE_TABLE_PREFIX}taxonomy`

      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`CREATE TABLE catalog_lint_probe_taxonomy (id text PRIMARY KEY, tenant_id text NOT NULL)`
        // KASITLI OLARAK taksonomiye EKLENMİYOR (aşağıdaki taxonomy'de yok).

        const snapshot = await readCatalogSnapshot(tx, appRoleName)
        return lintCatalog(snapshot, {
          taxonomy: {
            tenantScopedTables: TENANT_SCOPED_TABLES,
            platformLevelTables: PLATFORM_LEVEL_TABLES,
          },
          tenantContextSetting: TENANT_CONTEXT_SETTING,
          appRoleName,
        })
      })

      expect(
        findings.some(
          (finding: LintFinding) =>
            finding.rule === 'TENANT_ID_WITHOUT_TAXONOMY_ENTRY' && finding.tableName === tableName,
        ),
      ).toBe(true)
    })

    // K-E5 REVİZYONU (FIX turu 2) — VAKA (d), YÜK TAŞIYAN YARI: canlı Postgres'in
    // ÜRETTİĞİ (bu dosyanın yazmadığı) deparse metninin `catalog-lint.ts`'in
    // ÜRETTİĞİ şablonla GERÇEKTEN byte-birebir eştiğini kanıtlar — fixture
    // tabanlı birim testi (`catalog-lint.test.ts`) TEK BAŞINA YETERLİ DEĞİL
    // (fixture'ı da BİZ yazıyoruz, totoloji). Normal stilde KANONİK `USING` +
    // BOZUK `WITH CHECK (true)` kurulur ve İKİ ŞEY iddia edilir: (1)
    // `POLICY_WITH_CHECK_NOT_CANONICAL` VAR, (2) `POLICY_USING_NOT_CANONICAL`
    // o tablo için YOK — ikincisi, koşan Postgres'in `USING` için ürettiği
    // deparse biçiminin `buildCanonicalPolicyExpression()`'ın ürettiği
    // şablonla GERÇEKTEN eşleştiğini kanıtlayan satırdır (eşleşmeseydi (2)
    // de düşerdi).
    it('vaka (d): USING kanonik (normal stil) + WITH CHECK (true) → POLICY_WITH_CHECK_NOT_CANONICAL VAR, POLICY_USING_NOT_CANONICAL YOK', async () => {
      const tableName = `${PROBE_TABLE_PREFIX}canonical_mismatch`

      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`CREATE TABLE catalog_lint_probe_canonical_mismatch (id text PRIMARY KEY, tenant_id text NOT NULL)`
        await tx.$executeRaw`ALTER TABLE catalog_lint_probe_canonical_mismatch ENABLE ROW LEVEL SECURITY`
        await tx.$executeRaw`ALTER TABLE catalog_lint_probe_canonical_mismatch FORCE ROW LEVEL SECURITY`
        // Dosya başı AMPİRİK ÖLÇÜM notu (vaka (a)'nın emsali — `CREATE POLICY`
        // DDL'i bağlı parametre kabul etmez): `TENANT_CONTEXT_SETTING` burada
        // BİLEREK literal. USING NORMAL STİLDE (asıl migration'ın DDL'iyle
        // birebir aynı biçimde) yazılır — bu testin yük taşıyan iddiası
        // Postgres'in BUNU nasıl deparse ettiğine dayanır, test yardımcısının
        // yazdığı metne DEĞİL.
        await tx.$executeRaw`
          CREATE POLICY catalog_lint_probe_canonical_mismatch_policy ON catalog_lint_probe_canonical_mismatch
            USING (tenant_id = current_setting('app.tenant_id', true))
            WITH CHECK (true)
        `

        const snapshot = await readCatalogSnapshot(tx, appRoleName)
        return lintCatalog(snapshot, {
          taxonomy: {
            tenantScopedTables: [...TENANT_SCOPED_TABLES, tableName],
            platformLevelTables: PLATFORM_LEVEL_TABLES,
          },
          tenantContextSetting: TENANT_CONTEXT_SETTING,
          appRoleName,
        })
      })

      expect(
        findings.some(
          (finding: LintFinding) =>
            finding.rule === 'POLICY_WITH_CHECK_NOT_CANONICAL' && finding.tableName === tableName,
        ),
      ).toBe(true)
      expect(
        findings.some(
          (finding: LintFinding) =>
            finding.rule === 'POLICY_USING_NOT_CANONICAL' && finding.tableName === tableName,
        ),
      ).toBe(false)
    })
  })

  describe('AC3 — yetim tablo kontrolü (K-E11: DROP TABLE kullanılmadı, ROLLBACK ile temizlendi)', () => {
    it("dört probdan SONRA prob önekiyle başlayan hiçbir tablo pg_tables'ta kalmaz", async () => {
      const rows = z.array(z.object({ orphanCount: z.bigint() })).parse(
        await testMigrationPrisma.$queryRaw`
            SELECT count(*) AS "orphanCount"
            FROM pg_tables
            WHERE schemaname = 'public' AND tablename LIKE ${`${PROBE_TABLE_PREFIX}%`}
          `,
      )
      expect(rows[0]?.orphanCount).toBe(0n)
    })
  })

  // `afterAll` BİLİNÇLİ OLARAK YOK — AC3 probları kendi ROLLBACK'leriyle
  // hiçbir iz bırakmaz (yukarıdaki yetim tablo testi bunu kanıtlıyor);
  // `testMigrationPrisma`/`testAppPrisma` paket-seviyesi singleton'lardır
  // (bkz. `helpers/test-client.ts`), bu dosyadan kapatılmaz.
})
