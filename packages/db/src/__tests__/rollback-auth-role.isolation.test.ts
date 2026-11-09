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
// DÜZELTME (FIX turu 2, solid M-5 dördüncü ayağı): sır taşıyan tablo adları
// (`account`/`session`/`verification`/`two_factor`) ARTIK literal DEĞİL —
// `applyRollbackAuthRoleDdl` bunları `AUTH_SECRET_BEARING_TABLES`'tan
// (tenancy.ts) TÜRETİR (bkz. o fonksiyonun doc'u). Yalnızca `app_user`
// (`AUTH_SECRET_BEARING_TABLES`'ın üyesi DEĞİL, üretim SQL'inde de AYRI bir
// DO bloğu) BURADA LİTERAL kalır — K-E5'in "literal yazılmaz" kısıtı ÜRETİM
// KODUNA (`catalog-lint.ts`/`catalog-snapshot.ts`/`tenancy.ts`) aittir, TEST
// dosyalarına UYGULANMAZ (ST-E'nin `GRANT SELECT ("token") ON public.session
// …` emsali) — tek bir sabit ad için bu yine geçerli.

import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { Prisma } from '#prisma'
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
   * transaction İÇİNDE uygular: sır taşıyan HER tabloda `arkesoft_auth`'un
   * TÜM (kolon + tablo) yetkisini alır ve `arkesoft_app`'in v0.0.14'teki TAM
   * DML'ini geri verir; `app_user`'da `arkesoft_auth`'un tablo bazlı SELECT/
   * INSERT/UPDATE'ini alır. `REVOKE ALL` tek komutunun hem tablo HEM kolon
   * seviyesi hibeyi temizlediği bu alt görevde AMPİRİK olarak ölçüldü (bkz.
   * `sql/rollback-auth-role.sql` dosya başı notu).
   *
   * NEDEN bu fonksiyon üretim betiğini DOSYADAN ÇALIŞTIRMIYOR (taklidin var
   * olma sebebi): gerçek script `pnpm db:rollback-auth-role` →
   * `prisma db execute --file sql/rollback-auth-role.sql` ÇAĞRISI AYRI bir alt
   * SÜREÇ açar ve kendi bağlantısında COMMIT eder — bu testin ihtiyacı olan
   * "uygula, katalogu ÖLÇ, SONRA `ROLLBACK` ile İZSİZ geri al" deseni
   * (`runProbeAndRollback`, A-N2/ST-A0④) yalnızca AYNI `tx` BAĞLANTISINDA DDL
   * çalıştırılırsa mümkündür. Bu yüzden DDL'in SEMANTİĞİ (REVOKE ALL + GRANT
   * dörtlüsü) burada `tx.$executeRaw` ile TEKRAR İFADE EDİLMEK ZORUNDADIR —
   * sebep ORTADAN KALKMADI, bu yüzden fonksiyonun KENDİSİ kaldırılmadı.
   *
   * DÜZELTME (ROADMAP v0.0.15, T-016/S3b — kök neden, FIX turu 2 solid M-5
   * dördüncü ayağı): daha ÖNCE bu fonksiyon dört tablo adını (`account`,
   * `session`, `verification`, `two_factor`) LİTERAL olarak taşıyordu —
   * `sql/rollback-auth-role.sql`'in S2'de `two_factor` EKLENEREK güncellenen
   * dış döngü dizisinin EL İLE TUTULAN BEŞİNCİ bir kopyasıydı. S2 üretim
   * SQL'ini güncelledi ama bu kopyayı GÜNCELLEMEDİ — `expectedFindings`
   * (AUTH_SECRET_BEARING_TABLES'tan TÜRETİLİR) bu DDL'den BAĞIMSIZ doğru
   * hesaplanıyordu, bu yüzden `two_factor` için DDL uygulanmayınca 11 bulgu
   * (1 APP_ROLE_RETAINS + 9 kolon + 1 tablo) hiç ÜRETİLMEDİ ve
   * `findings.length` 34'te kaldı (beklenen 45) — `test:isolation` kırmızıya
   * döndü, teşhis bir alt görev sürdü.
   *
   * ÇÖZÜM (YOL A — türetme, YOL B'ye [SQL'e karşı eşitlik assert'i] TERCİH
   * EDİLDİ): tablo listesi artık `AUTH_SECRET_BEARING_TABLES`'tan (tenancy.ts
   * — `auth-secret-tables-sql-consistency.test.ts`'in [FIX turu 1] ZATEN
   * `sql/rollback-auth-role.sql`'in FOREACH dizisine karşı mekanik olarak
   * eşitlediği TEK KAYNAK) TÜRETİLİYOR — BEŞİNCİ bir elle yazılmış liste
   * YOK, dördüncü ayna ORTADAN KALKTI. (B) tercih edilmedi: SQL metnine karşı
   * bir eşitlik assert'i eklemek aynayı yine TUTAR (yalnızca sessiz sapmayı
   * engeller), (A) aynayı YOK EDER — iki tablo adı artık ÜÇ yerde değil İKİ
   * yerde yazılı: `tenancy.ts` (kaynak) ve `sql/*.sql` (metin, consistency
   * testiyle kaynağa bağlı). `app_user` bu döngünün DIŞINDA kalır — o
   * `AUTH_SECRET_BEARING_TABLES`'ın üyesi DEĞİLDİR (tenancy.ts:198,
   * `columnLevel: false` ile AYRI tutulur) ve üretim SQL'inde de AYRI bir DO
   * bloğudur (§2) — buradaki tek satırlık literal bir "dizi aynası" değil,
   * tek bir sabit tablo adıdır.
   *
   * Tanımlayıcı (identifier) olarak SQL metnine giren `tableName` için
   * `$executeRawUnsafe` YASAK (CLAUDE.md §2, K-E12) — `Prisma.sql` etiketli
   * şablonu + `Prisma.raw()` kullanılır (`auth-role-privileges.isolation.
   * test.ts`'in [ST-E] BİREBİR izlediği emsal).
   */
  async function applyRollbackAuthRoleDdl(tx: TransactionClient): Promise<void> {
    for (const tableName of AUTH_SECRET_BEARING_TABLES) {
      await tx.$executeRaw(
        Prisma.sql`REVOKE ALL ON public.${Prisma.raw(tableName)} FROM arkesoft_auth`,
      )
      await tx.$executeRaw(
        Prisma.sql`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${Prisma.raw(
          tableName,
        )} TO arkesoft_app`,
      )
    }
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
