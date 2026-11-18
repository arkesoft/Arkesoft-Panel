// @arkesoft/db — T-023/S7: AC-15 canlı kanıtı — denetim izi EKLE-SAL
// (append-only) sertleştirmesinin GERİ ALINMASININ GÜRÜLTÜLÜ olduğu (ROADMAP
// v0.0.20.2, architect AC-15, kullanıcı kararı 2026-11-17).
//
// AC-15 (task dosyası, birebir): "Geri alma SQL'i koşturulduğunda
// `arkesoft_app` iki tabloda yeniden dört DML taşır VE katalog linter'ı
// BULGU ÜRETİR (beyan TypeScript'te kaldığı için). Bu İSTENEN davranıştır:
// operatör sertleştirmeyi geri aldığını CI'dan öğrenir." Bu dosya BUNUN canlı
// kanıtıdır.
//
// ⚠⚠ TASARIM KISITI — KENDİ KENDİNİ ÇELİŞKİYE DÜŞÜRMEME
// (`rollback-auth-role.isolation.test.ts:10-23`'ün BİREBİR aynı gerekçesi):
// `sql/rollback-audit-append-only.sql` GERÇEKTEN koşturulduktan SONRA
// `pnpm test:isolation` BEKLENEN BİÇİMDE KIRMIZIDIR — `tenancy.ts`'teki
// `APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` beyanı HÂLÂ iki satırı (`{canUpdate:
// false, canDelete: false, canTruncate: false}`) taşırken katalog bu DDL'den
// SONRA üç fiili GERİ KAZANMIŞ olur — kod kataloğun GERİSİNDE kalır. Bir test
// süiti KENDİ KIRMIZILIĞINI assert EDEMEZ. Çözüm (`rollback-auth-role.
// isolation.test.ts:51-79`'un BİREBİR izlediği sentinel + `ROLLBACK` deseni):
// bu dosya rollback SQL'inin SEMANTİĞİNİ `testMigrationPrisma.$transaction`
// İÇİNDE uygular, bulguyu AYNI transaction İÇİNDE ölçer, SONRA sentinel
// hatayla `ROLLBACK` eder — süit YEŞİL KALIR, veritabanı SERTLEŞTİRİLMİŞ
// durumda kalır (A-N2/ST-A0④'ün ölçtüğü olgu: `GRANT`/`REVOKE` transaction'da
// TAM geri alınıyor). GERÇEK script (`pnpm db:rollback-audit-append-only`)
// BUNUN YERİNE GEÇMEZ — bu alt görevin DIŞINDA, BİR KEZ elle koşturulup ham
// çıktısı rapora yapıştırılmış, sonra `pnpm db:bootstrap` ile yeşile
// döndürülmüştür (handoff raporunun ilgili bölümü).
//
// NEDEN DDL'İN SEMANTİĞİ BURADA TEKRAR İFADE EDİLİR, DOSYADAN ÇALIŞTIRILMAZ
// (`rollback-auth-role.isolation.test.ts:162-170`'in BİREBİR aynı gerekçesi):
// gerçek script (`prisma db execute --file sql/rollback-audit-append-only.sql`)
// AYRI bir alt süreç açar ve KENDİ bağlantısında COMMIT eder — bu testin
// ihtiyacı olan "uygula, katalogu ÖLÇ, SONRA `ROLLBACK` ile İZSİZ geri al"
// deseni yalnızca AYNI `tx` BAĞLANTISINDA DDL çalıştırılırsa mümkündür.
//
// Tablo listesi LİTERAL DEĞİL — `tenancy.ts`'teki `APP_ROLE_TABLE_PRIVILEGE_
// EXPECTATIONS`'tan TÜRETİLİR (K-E5/AC9'un `AUTH_SECRET_BEARING_TABLES`
// türetmesiyle BİREBİR aynı desen, `rollback-auth-role.isolation.test.ts`'in
// FIX turu 2 düzeltmesi) — beyana üçüncü bir tablo eklenirse bu dosya ELLE
// GÜNCELLENMEDEN onu da kapsar.

import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { Prisma } from '#prisma'
import { lintCatalog, type LintCatalogOptions } from '../catalog-lint.js'
import { readCatalogSnapshot, type CatalogSnapshot } from '../catalog-snapshot.js'
import type { TransactionClient } from '../client.js'
import { TENANT_CONTEXT_SETTING } from '../tenant-context.js'
import {
  APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS,
  type AppRoleTablePrivilegeExpectation,
  AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS,
  AUTH_SECRET_BEARING_TABLES,
  PLATFORM_LEVEL_TABLES,
  TENANT_SCOPED_TABLES,
} from '../tenancy.js'
import { getTestAuthPrisma, testAppPrisma, testMigrationPrisma } from './helpers/test-client.js'

/** `testMigrationPrisma.$transaction`'ı KASITLI ROLLBACK ettirmek için fırlatılan sentinel (K-E11). */
class RollbackAuditAppendOnlyProbeSentinel extends Error {
  constructor() {
    super("S7 probu: bu hata YALNIZCA transaction'ı geri almak için fırlatıldı.")
  }
}

/**
 * `rollback-auth-role.isolation.test.ts:66-80`'in BİREBİR izlediği desen:
 * `body`'yi `testMigrationPrisma.$transaction` İÇİNDE çalıştırır, döndürdüğü
 * değeri YAKALAR ve transaction'ı sentinel'le `ROLLBACK` ettirir. `GRANT`
 * DDL'i de transaction'a tabi, `ROLLBACK` sonrası iz BIRAKMAZ.
 */
async function runProbeAndRollback<T>(body: (tx: TransactionClient) => Promise<T>): Promise<T> {
  let captured: T | undefined
  await expect(
    testMigrationPrisma.$transaction(async (tx) => {
      captured = await body(tx)
      throw new RollbackAuditAppendOnlyProbeSentinel()
    }),
  ).rejects.toThrow(RollbackAuditAppendOnlyProbeSentinel)
  if (captured === undefined) {
    throw new Error(
      'runProbeAndRollback(): captured tanımsız — body() sentinel fırlatılmadan önce tamamlanmadı.',
    )
  }
  return captured
}

describe('denetim izi EKLE-SAL geri alması — AC-15 (geri alma GÜRÜLTÜLÜ, T-023/S7)', () => {
  let appRoleName: string
  let authRoleName: string
  let baselineSnapshot: CatalogSnapshot

  beforeAll(async () => {
    // `auth-role-privileges.isolation.test.ts:140-158`'in BİREBİR izlediği
    // desen — rol adları `current_user`den TÜRETİLİR, literal YAZILMAZ.
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

    // `S_healthy` — S6'nın uyguladığı §9 DDL'inden SONRAki (bugünkü,
    // v0.0.20.2'nin sertleştirilmiş hedef durumu) taban anlık görüntü.
    baselineSnapshot = await readCatalogSnapshot(testMigrationPrisma, { appRoleName, authRoleName })
  })

  /**
   * `auth-role-privileges.isolation.test.ts:172-195`'in BİREBİR izlediği
   * desen: dosyadaki TEK `lintCatalog` girdi üreticisi, hem `authRole` hem
   * `appRoleTablePrivilegeExpectations`'ı HER çağrıda GERÇEK (boş olmayan)
   * değerleriyle taşır — bu dosyanın konusu BEYANIN DEĞİŞMEDEN KALDIĞI bir
   * geri alma, bu yüzden beyan burada da S6'nın bıraktığı GERÇEK haliyle
   * kullanılır.
   */
  function lintOptions(): LintCatalogOptions {
    return {
      taxonomy: {
        tenantScopedTables: TENANT_SCOPED_TABLES,
        platformLevelTables: PLATFORM_LEVEL_TABLES,
      },
      tenantContextSetting: TENANT_CONTEXT_SETTING,
      appRoleName,
      appRoleTablePrivilegeExpectations: APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS,
      authRole: {
        roleName: authRoleName,
        secretBearingTables: AUTH_SECRET_BEARING_TABLES,
        tablePrivilegeExpectations: AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS,
      },
    }
  }

  /**
   * Transaction `ROLLBACK` edildikten SONRA kataloğun `baselineSnapshot`'a
   * (`S_healthy`) KALINTISIZ döndüğünü doğrular (A-N2/ST-A0④ — `GRANT`
   * transaction'da TAM geri alınıyor).
   */
  async function expectNoResidue(): Promise<void> {
    const afterSnapshot = await readCatalogSnapshot(testMigrationPrisma, {
      appRoleName,
      authRoleName,
    })
    expect(afterSnapshot).toEqual(baselineSnapshot)
  }

  /**
   * `sql/rollback-audit-append-only.sql`'in BİREBİR semantiğini verilen
   * transaction İÇİNDE uygular: beyandaki (`APP_ROLE_TABLE_PRIVILEGE_
   * EXPECTATIONS`) HER tabloda `arkesoft_app`'e `UPDATE, DELETE` geri verir.
   * ⚠⚠ FIX turu 1 (H1/F1 düzeltmesi): `TRUNCATE` ARTIK GERİ VERİLMEZ —
   * sertleştirme ÖNCESİ `arkesoft_app` TRUNCATE hiç TAŞIMIYORDU (bölüm 4'ün
   * blanket GRANT'i dört fiille sınırlı), bu yüzden bu rollback §9'un
   * `REVOKE UPDATE, DELETE, TRUNCATE`sinin TAM TERSİ DEĞİL — yalnızca GERÇEK
   * ÖNCEKİ durumu (`UPDATE, DELETE`) geri veren KISMİ tersi. `IF EXISTS`
   * koruması BİLEREK YOK (`rollback-auth-role.isolation.test.ts`'in
   * `applyRollbackAuthRoleDdl`'ının AYNI kararı) — bu test ortamında iki
   * tablo da HER ZAMAN VAR, koruma yalnızca taze/bootstrap-öncesi bir
   * veritabanı için gerekli (gerçek SQL dosyasının kapsamı).
   *
   * Tanımlayıcı olarak SQL metnine giren `tableName` için `$executeRawUnsafe`
   * YASAK (CLAUDE.md §2, K-E12) — `Prisma.sql` + `Prisma.raw()` kullanılır
   * (`rollback-auth-role.isolation.test.ts`'in BİREBİR izlediği emsal).
   */
  async function applyRollbackAuditAppendOnlyDdl(tx: TransactionClient): Promise<void> {
    for (const expectation of APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS) {
      await tx.$executeRaw(
        Prisma.sql`GRANT UPDATE, DELETE ON public.${Prisma.raw(
          expectation.tableName,
        )} TO arkesoft_app`,
      )
    }
  }

  it("taban (S6 sonrası, DDL'den ÖNCE): lintCatalog bulgu YOK — sertleştirme BUGÜN sağlıklı", () => {
    const findings = lintCatalog(baselineSnapshot, lintOptions())
    expect(findings).toEqual([])
  })

  it(
    "rollback SQL'inin semantiği transaction içinde uygulanınca: arkesoft_app iki tabloda " +
      "UPDATE/DELETE'i YENİDEN kazanır (TRUNCATE KAZANMAZ — H1/F1 düzeltmesi) VE lintCatalog " +
      "TAM ve BİREBİR dört APP_ROLE_UNEXPECTED_PRIVILEGE bulgusu üretir (beyan TypeScript'te " +
      'DEĞİŞMEDİĞİ için), S_healthy ≠ S_rolledback, ROLLBACK sonrası kalıntı YOK',
    async () => {
      const { findings, snapshot } = await runProbeAndRollback(async (tx) => {
        await applyRollbackAuditAppendOnlyDdl(tx)
        const rolledBackSnapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })
        return {
          findings: lintCatalog(rolledBackSnapshot, lintOptions()),
          snapshot: rolledBackSnapshot,
        }
      })

      // `expect.objectContaining()`'in dönüş tipi `any` — `rollback-auth-role.
      // isolation.test.ts:245-254`'ün BİREBİR aynı gerekçesiyle burada da
      // `Record<string, unknown>`'a açıkça cast edilir (runtime doğrulaması
      // söz konusu DEĞİL, vitest'in KENDİ matcher API'si tipsiz — CLAUDE.md
      // §4'ün "runtime doğrulamasından hemen sonra `as`" kısıtını İHLAL ETMEZ).
      function findingMatcher(partial: Record<string, unknown>): Record<string, unknown> {
        return expect.objectContaining(partial) as Record<string, unknown>
      }

      // ─────────────────────────────────────────────────────────────────
      // AC-15 madde 1 — lintCatalog(S_rolledback) TAM ve BİREBİR beklenen
      // kümeye eşit (`toEqual` — "en az"/.some() DEĞİL, emsal
      // `rollback-auth-role.isolation.test.ts:294-295`). Beklenen sıra
      // DETERMİNİSTİKTİR: `lintAppRoleTablePrivilegeExpectations`
      // (`catalog-lint.ts`) `expectations`i (beyan sırası: audit_log →
      // platform_audit_log) ve HER girdi için fiil sırasını (canSelect →
      // canInsert → canUpdate → canDelete → canTruncate) TAKİP EDER — SQL
      // satır sırasına (garantisiz) BAĞLI DEĞİL, bu yüzden `arrayContaining`
      // + uzunluk yerine DOĞRUDAN sıralı `toEqual` kullanılabilir.
      // Beklenen fiil kümesi (`restoredFalseVerbs`) rollback DDL'in geri
      // verdiği TAM OLARAK iki fiille (`UPDATE`/`DELETE`) BİREBİR örtüşür —
      // ⚠⚠ FIX turu 1 (H1/F1 düzeltmesi): `TRUNCATE` buradan ÇIKARILDI çünkü
      // düzeltilmiş rollback DDL'i TRUNCATE'i hiç GERİ VERMİYOR (sertleştirme
      // öncesi `arkesoft_app` TRUNCATE hiç taşımıyordu — geri almanın
      // "başlangıç durumunun ÜSTÜNE çıkması" yanlışı burada KAPANDI).
      // Beyanın bu iki fiil için GERÇEKTEN `false` taşıdığı (DDL
      // UYGULANMADAN ÖNCEki sağlıklı durumun ön koşulu) elle filtrelemek
      // YERİNE tek bir runtime assert'le TEYİT edilir — beyan ileride
      // değişirse (örn. bir fiil `true`'ya çekilirse) bu assert KIRILIR,
      // aşağıdaki beklenen küme SESSİZCE küçülmez (eski `.filter(...===false)`
      // deseni derleme zamanı literal tipler yüzünden "her zaman doğru"
      // sayılıp ESLint'in `no-unnecessary-condition`'ını tetikliyordu —
      // runtime assert'e geçiş bu statik tuzağı da ortadan kaldırır).
      // ─────────────────────────────────────────────────────────────────
      const restoredFalseVerbs = ['canUpdate', 'canDelete'] as const satisfies readonly (keyof Omit<
        AppRoleTablePrivilegeExpectation,
        'tableName'
      >)[]

      for (const expectation of APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS) {
        for (const verb of restoredFalseVerbs) {
          expect(expectation[verb]).toBe(false)
        }
      }

      const expectedFindings = APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS.flatMap((expectation) =>
        restoredFalseVerbs.map(() =>
          findingMatcher({
            rule: 'APP_ROLE_UNEXPECTED_PRIVILEGE',
            tableName: expectation.tableName,
          }),
        ),
      )

      expect(findings).toEqual(expectedFindings)

      // İKİNCİ, bağımsız kanıt: bu kural DIŞINDA HİÇBİR kural ateşlenmedi
      // (eski `APP_ROLE_MISSING_DML_PRIVILEGE`'ın YENİDEN SİLAHLANMADIĞININ
      // kanıtı — `lintAppRoleDmlPrivileges`'in `continue`u beyanda yer alan
      // bu iki tabloyu HÂLÂ atlar, çünkü beyan BU dosyada TypeScript'te
      // DEĞİŞMEDİ; architect'in AC-12(c) için kurduğu TAMAMLAYICILIĞIN
      // ters istikametteki kanıtı).
      const unexpectedRuleFindings = findings.filter(
        (finding) => finding.rule !== 'APP_ROLE_UNEXPECTED_PRIVILEGE',
      )
      expect(unexpectedRuleFindings).toEqual([])

      // ─────────────────────────────────────────────────────────────────
      // AC-15 madde 2 — S_rolledback'te `arkesoft_app` her iki tabloda da
      // TAM DML'e sahip (SELECT/INSERT/UPDATE/DELETE) AMA TRUNCATE'E SAHİP
      // DEĞİL (rollback'in canlı yan etkisinin doğrudan kanıtı, bulgu
      // kümesinden BAĞIMSIZ bir ölçüm). ⚠⚠ FIX turu 1 (H1/F1 düzeltmesi):
      // `canTruncate: true` BEKLENTİSİ BİR HATAYI KUTSUYORDU — düzeltilmiş
      // rollback DDL'i TRUNCATE'i hiç geri vermediği için `canTruncate`
      // §9'un REVOKE'undan beri KALICI OLARAK `false` kalır.
      // ─────────────────────────────────────────────────────────────────
      for (const expectation of APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS) {
        const privilege = snapshot.privileges.find(
          (candidate) =>
            candidate.roleName === appRoleName && candidate.tableName === expectation.tableName,
        )
        expect(privilege).toEqual(
          expect.objectContaining({
            canSelect: true,
            canInsert: true,
            canUpdate: true,
            canDelete: true,
            canTruncate: false,
          }),
        )
      }

      // ─────────────────────────────────────────────────────────────────
      // AC-15 madde 3 — BOŞ OLMADIĞININ KANITI: S_healthy ≠ S_rolledback
      // AÇIKÇA assert edilir.
      // ─────────────────────────────────────────────────────────────────
      expect(snapshot).not.toEqual(baselineSnapshot)

      // ─────────────────────────────────────────────────────────────────
      // AC-15 madde 4 — transaction ROLLBACK edildikten SONRA yeni bir
      // `S_healthy` okuması, `baselineSnapshot` ile TEKRAR derin eşit
      // (kalıntı YOK — veritabanı SERTLEŞTİRİLMİŞ durumda kalır).
      // ─────────────────────────────────────────────────────────────────
      await expectNoResidue()
    },
  )
})
