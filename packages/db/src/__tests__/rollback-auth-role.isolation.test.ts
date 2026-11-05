// @arkesoft/db — T-015/ST-G: kademe 4 (`arkesoft_auth` yetki DELTASININ geri
// alınması) canlı kanıtları — AC4'ün ROLLBACK YARISI (ROADMAP v0.0.14.1,
// architect KARAR A1, kullanıcı kararı 2026-11-05).
//
// Bu dosya `auth-role-privileges.isolation.test.ts`'in (ST-E) İKİZİ DEĞİL,
// AYRI bir dosyadır — o dosyaya BU alt görevde DOKUNULMADI (handoff'un açık
// yasağı). "Sağlıklı taban" yarısı ST-E'de; BURADA yalnızca kademe 4'ün
// ROLLBACK kanıtı var.
//
// ⚠⚠ TASARIM KISITI — KENDİ KENDİNİ ÇELİŞKİYE DÜŞÜRMEME (A1-c): kademe 4
// koşturulduktan SONRA `pnpm test:isolation` BEKLENEN BİÇİMDE KIRMIZIDIR —
// kod (katalog linter'ının kuralları) o anda kataloğun İLERİSİNDEDİR. Bir
// test süiti KENDİ KIRMIZILIĞINI assert EDEMEZ. Çözüm (ST-E'nin kanıtlanmış
// deseni, BİREBİR izlenir): bu dosya kademe 4'ün DDL'ini (`sql/rollback-
// auth-role.sql`'in BİREBİR semantiği — `REVOKE ALL ... FROM arkesoft_auth` +
// üç sır taşıyan tabloda `arkesoft_app`'e DML `GRANT`ı) verilen
// `testMigrationPrisma.$transaction` İÇİNDE uygular, bulguları VE derin
// eşitliği assert eder, SONRA sentinel hatayla `ROLLBACK` eder — süit YEŞİL
// KALIR (A-N2/ST-A0④'ün ölçtüğü olgu: `GRANT`/`REVOKE` transaction'da TAM
// geri alınıyor). GERÇEK script (`pnpm db:rollback-auth-role`) BUNUN
// YERİNE GEÇMEZ — ayrıca BİR KEZ elle koşturulur, ham çıktısı rapora
// yapıştırılır, sonra `pnpm db:bootstrap` ile yeşile döndürülür (bu dosyanın
// kapsamı DIŞINDA, ST-G'nin raporunda).
//
// Tablo adları (`account`/`session`/`verification`/`app_user`) BURADA
// LİTERAL — K-E5'in "literal yazılmaz" kısıtı ÜRETİM KODUNA (`catalog-
// lint.ts`/`catalog-snapshot.ts`/`tenancy.ts`) aittir, TEST dosyalarına
// UYGULANMAZ (ST-E'nin `GRANT SELECT ("token") ON public.session …` emsali).

import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { lintCatalog, type LintCatalogOptions } from '../catalog-lint.js'
import { readCatalogSnapshot, type CatalogSnapshot } from '../catalog-snapshot.js'
import type { TransactionClient } from '../client.js'
import { TENANT_CONTEXT_SETTING } from '../tenant-context.js'
import {
  AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS,
  AUTH_SECRET_BEARING_TABLES,
  PLATFORM_LEVEL_TABLES,
  TENANT_SCOPED_TABLES,
} from '../tenancy.js'
import { getTestAuthPrisma, testAppPrisma, testMigrationPrisma } from './helpers/test-client.js'

/** `testMigrationPrisma.$transaction`'ı KASITLI ROLLBACK ettirmek için fırlatılan sentinel (K-E11). */
class RollbackAuthRoleProbeSentinel extends Error {
  constructor() {
    super("ST-G probu: bu hata YALNIZCA transaction'ı geri almak için fırlatıldı.")
  }
}

/**
 * `auth-role-privileges.isolation.test.ts:70-84`'ün (ST-E) BİREBİR izlediği
 * desen: `body`'yi `testMigrationPrisma.$transaction` İÇİNDE çalıştırır,
 * döndürdüğü değeri YAKALAR ve transaction'ı sentinel'le `ROLLBACK` ettirir.
 * `DROP TABLE` YOK — `GRANT`/`REVOKE` DDL'i de transaction'a tabi, `ROLLBACK`
 * sonrası iz BIRAKMAZ.
 */
async function runProbeAndRollback<T>(body: (tx: TransactionClient) => Promise<T>): Promise<T> {
  let captured: T | undefined
  await expect(
    testMigrationPrisma.$transaction(async (tx) => {
      captured = await body(tx)
      throw new RollbackAuthRoleProbeSentinel()
    }),
  ).rejects.toThrow(RollbackAuthRoleProbeSentinel)
  if (captured === undefined) {
    throw new Error(
      'runProbeAndRollback(): captured tanımsız — body() sentinel fırlatılmadan önce tamamlanmadı.',
    )
  }
  return captured
}

describe('kademe 4 geri alma — AC4 rollback yarısı (T-015/ST-G, DDL transaction içinde uygulanıp geri alınır)', () => {
  let appRoleName: string
  let authRoleName: string
  let baselineSnapshot: CatalogSnapshot

  beforeAll(async () => {
    // `catalog-lint-live.isolation.test.ts`/ST-E'nin BİREBİR izlediği desen —
    // rol adları `current_user`den TÜRETİLİR, literal YAZILMAZ.
    const appRows = z
      .array(z.object({ roleName: z.string() }))
      .parse(await testAppPrisma.$queryRaw`SELECT current_user::text AS "roleName"`)
    const appRole = appRows[0]
    if (appRole === undefined) {
      throw new Error('current_user sorgusu boş döndü (arkesoft_app) — beklenmeyen ortam.')
    }
    appRoleName = appRole.roleName

    const authRows = z
      .array(z.object({ roleName: z.string() }))
      .parse(await getTestAuthPrisma().$queryRaw`SELECT current_user::text AS "roleName"`)
    const authRole = authRows[0]
    if (authRole === undefined) {
      throw new Error('current_user sorgusu boş döndü (arkesoft_auth) — beklenmeyen ortam.')
    }
    authRoleName = authRole.roleName

    // `S_healthy` — kademe 4'ten ÖNCEKİ (bugünkü, v0.0.14.1'in sağlıklı
    // hedef durumu) taban anlık görüntü.
    baselineSnapshot = await readCatalogSnapshot(testMigrationPrisma, { appRoleName, authRoleName })
  })

  // FIX turu 1 (qa Tur 1 [medium] QA-1) — `authRoleName`/`authSecretBearingTables`/
  // `authRoleTablePrivilegeExpectations` TEK `authRole` nesnesine indi.
  function lintOptions(): LintCatalogOptions {
    return {
      taxonomy: {
        tenantScopedTables: TENANT_SCOPED_TABLES,
        platformLevelTables: PLATFORM_LEVEL_TABLES,
      },
      tenantContextSetting: TENANT_CONTEXT_SETTING,
      appRoleName,
      authRole: {
        roleName: authRoleName,
        secretBearingTables: AUTH_SECRET_BEARING_TABLES,
        tablePrivilegeExpectations: AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS,
      },
    }
  }

  /**
   * Transaction `ROLLBACK` edildikten SONRA kataloğun `baselineSnapshot`'a
   * (`S_healthy`) KALINTISIZ döndüğünü doğrular (A-N2/ST-A0④ — `GRANT`/
   * `REVOKE` transaction'da TAM geri alınıyor).
   */
  async function expectNoResidue(): Promise<void> {
    const afterSnapshot = await readCatalogSnapshot(testMigrationPrisma, {
      appRoleName,
      authRoleName,
    })
    expect(afterSnapshot).toEqual(baselineSnapshot)
  }

  /**
   * `sql/rollback-auth-role.sql`'in (kademe 4) BİREBİR semantiğini verilen
   * transaction İÇİNDE uygular: üç sır taşıyan tabloda `arkesoft_auth`'un
   * TÜM (kolon + tablo) yetkisini alır ve `arkesoft_app`'in v0.0.14'teki TAM
   * DML'ini geri verir; `app_user`'da `arkesoft_auth`'un tablo bazlı
   * SELECT/INSERT/UPDATE'ini alır. `REVOKE ALL` tek komutunun hem tablo HEM
   * kolon seviyesi hibeyi temizlediği bu alt görevde AMPİRİK olarak
   * ölçüldü (bkz. `sql/rollback-auth-role.sql` dosya başı notu).
   */
  async function applyRollbackAuthRoleDdl(tx: TransactionClient): Promise<void> {
    await tx.$executeRaw`REVOKE ALL ON public.account FROM arkesoft_auth`
    await tx.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON public.account TO arkesoft_app`
    await tx.$executeRaw`REVOKE ALL ON public.session FROM arkesoft_auth`
    await tx.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON public.session TO arkesoft_app`
    await tx.$executeRaw`REVOKE ALL ON public.verification FROM arkesoft_auth`
    await tx.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON public.verification TO arkesoft_app`
    await tx.$executeRaw`REVOKE ALL ON public.app_user FROM arkesoft_auth`
  }

  it(
    'kademe 4 DDL sonrası: lintCatalog TAM VE BİREBİR beklenen kümeye eşit, ' +
      'S_rolledback v0.0.14 şekliyle derin eşit, S_healthy ≠ S_rolledback, ROLLBACK sonrası kalıntı YOK',
    async () => {
      const { findings, snapshot } = await runProbeAndRollback(async (tx) => {
        await applyRollbackAuthRoleDdl(tx)
        const rolledBackSnapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })
        return {
          findings: lintCatalog(rolledBackSnapshot, lintOptions()),
          snapshot: rolledBackSnapshot,
        }
      })

      // ─────────────────────────────────────────────────────────────────
      // AC4 madde 1 — lintCatalog(S_rolledback) TAM ve BİREBİR beklenen
      // kümeye eşit. Beklenen küme ST-C'nin ara durum ölçümüyle AYNI SINIF
      // (ST-D'nin DDL'inden ÖNCEki canlı ölçüm, bu dosyanın raporunda tekrar
      // edilir): APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE (üç tablo) +
      // AUTH_ROLE_MISSING_COLUMN_PRIVILEGE (üç tablonun HER kolonu — sayı
      // `baselineSnapshot.columns`'tan TÜRETİLİR, SABİT yazılmaz) +
      // AUTH_ROLE_MISSING_TABLE_PRIVILEGE (üç tablo DELETE + app_user
      // SELECT/INSERT/UPDATE = dört bulgu).
      // ─────────────────────────────────────────────────────────────────
      const secretTableColumns = baselineSnapshot.columns.filter((column) =>
        (AUTH_SECRET_BEARING_TABLES as readonly string[]).includes(column.tableName),
      )

      // `expect.objectContaining()`'in dönüş tipi `any` — `.map()` içinde
      // DÖNÜLDÜĞÜNDE `@typescript-eslint/no-unsafe-return` tetiklenir. Her
      // çağrı `Record<string, unknown>`'a (Zod DEĞİL — bu bir test matcher
      // nesnesi, dış dünyadan gelen veri değil) açıkça cast edilir; bu CLAUDE.md
      // §4'ün "runtime doğrulamasından hemen sonra `as`" kısıtını İHLAL ETMEZ
      // (burada runtime doğrulaması söz konusu DEĞİL, vitest'in KENDİ matcher
      // API'si tipsiz).
      function findingMatcher(partial: Record<string, unknown>): Record<string, unknown> {
        return expect.objectContaining(partial) as Record<string, unknown>
      }

      const expectedAppRetainsFindings = AUTH_SECRET_BEARING_TABLES.map((tableName) =>
        findingMatcher({
          rule: 'APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE',
          tableName,
        }),
      )
      const expectedMissingColumnFindings = secretTableColumns.map((column) =>
        findingMatcher({
          rule: 'AUTH_ROLE_MISSING_COLUMN_PRIVILEGE',
          tableName: column.tableName,
        }),
      )
      const expectedMissingTableFindings = [
        ...AUTH_SECRET_BEARING_TABLES.map((tableName) =>
          findingMatcher({
            rule: 'AUTH_ROLE_MISSING_TABLE_PRIVILEGE',
            tableName,
          }),
        ),
        findingMatcher({
          rule: 'AUTH_ROLE_MISSING_TABLE_PRIVILEGE',
          tableName: 'app_user',
        }),
      ]

      const expectedFindings = [
        ...expectedAppRetainsFindings,
        ...expectedMissingColumnFindings,
        ...expectedMissingTableFindings,
      ]

      // Sıra SQL tarafından GARANTİ EDİLMEZ (`information_schema.columns`
      // sorgusu `ORDER BY` TAŞIMAZ — `catalog-snapshot.ts`) — bu yüzden TAM
      // eşitlik `arrayContaining` + UZUNLUK karşılaştırmasıyla kurulur. Bu
      // `.some()`DEN FARKLIDIR: `.some()` fazladan/beklenmeyen bir bulguyu
      // SESSİZCE kabul ederdi; `arrayContaining` + `length` birlikte HEM
      // "beklenenlerin HEPSİ var" HEM "beklenmeyen HİÇBİR ŞEY yok" sorusunu
      // yanıtlar — TAM VE BİREBİR eşleşme.
      expect(findings.length).toBe(expectedFindings.length)
      expect(findings).toEqual(expect.arrayContaining(expectedFindings))

      // İKİNCİ, bağımsız kanıt: bu üç kural DIŞINDA HİÇBİR kural ateşlenmedi
      // (beklenmeyen bir regresyonun sessizce karışmadığının kanıtı).
      const unexpectedRuleFindings = findings.filter(
        (finding) =>
          finding.rule !== 'APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE' &&
          finding.rule !== 'AUTH_ROLE_MISSING_COLUMN_PRIVILEGE' &&
          finding.rule !== 'AUTH_ROLE_MISSING_TABLE_PRIVILEGE',
      )
      expect(unexpectedRuleFindings).toEqual([])

      // ─────────────────────────────────────────────────────────────────
      // AC4 madde 2 — S_rolledback'in privileges/columnPrivileges/
      // columnGrants satırları beklenen v0.0.14 ŞEKLİYLE derin eşit: app
      // üç tabloda TAM DML'e sahip, auth hiçbirine, columnGrants BOŞ.
      // ─────────────────────────────────────────────────────────────────
      for (const tableName of AUTH_SECRET_BEARING_TABLES) {
        const appPrivilege = snapshot.privileges.find(
          (privilege) => privilege.roleName === appRoleName && privilege.tableName === tableName,
        )
        expect(appPrivilege).toEqual(
          expect.objectContaining({
            canSelect: true,
            canInsert: true,
            canUpdate: true,
            canDelete: true,
          }),
        )

        const authPrivilege = snapshot.privileges.find(
          (privilege) => privilege.roleName === authRoleName && privilege.tableName === tableName,
        )
        expect(authPrivilege).toEqual(
          expect.objectContaining({
            canSelect: false,
            canInsert: false,
            canUpdate: false,
            canDelete: false,
          }),
        )
      }

      const authAppUserPrivilege = snapshot.privileges.find(
        (privilege) => privilege.roleName === authRoleName && privilege.tableName === 'app_user',
      )
      expect(authAppUserPrivilege).toEqual(
        expect.objectContaining({ canSelect: false, canInsert: false, canUpdate: false }),
      )

      const authColumnPrivilegesOnSecretTables = snapshot.columnPrivileges.filter(
        (privilege) =>
          privilege.roleName === authRoleName &&
          (AUTH_SECRET_BEARING_TABLES as readonly string[]).includes(privilege.tableName),
      )
      expect(authColumnPrivilegesOnSecretTables.length).toBe(secretTableColumns.length)
      for (const privilege of authColumnPrivilegesOnSecretTables) {
        expect(privilege.hasTableSelect).toBe(false)
        expect(privilege.hasColumnSelect).toBe(false)
        expect(privilege.hasTableInsert).toBe(false)
        expect(privilege.hasColumnInsert).toBe(false)
        expect(privilege.hasTableUpdate).toBe(false)
        expect(privilege.hasColumnUpdate).toBe(false)
      }

      expect(snapshot.columnGrants).toEqual([])

      // ─────────────────────────────────────────────────────────────────
      // AC4 madde 3 — BOŞ OLMADIĞININ KANITI: S_healthy ≠ S_rolledback
      // AÇIKÇA assert edilir (`baselineSnapshot` kademe 4'ten ÖNCEki
      // `S_healthy`, `snapshot` transaction İÇİNDEki `S_rolledback`).
      // ─────────────────────────────────────────────────────────────────
      expect(snapshot).not.toEqual(baselineSnapshot)

      // ─────────────────────────────────────────────────────────────────
      // AC4 madde 4 — transaction ROLLBACK edildikten SONRA yeni bir
      // `S_healthy` okuması, `baselineSnapshot` ile TEKRAR derin eşit
      // (kalıntı YOK).
      // ─────────────────────────────────────────────────────────────────
      await expectNoResidue()
    },
  )
})
