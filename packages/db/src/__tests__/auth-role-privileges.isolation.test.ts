// @arkesoft/db — T-015/ST-E: `arkesoft_auth` rolünün CANLI kanıtları (ROADMAP
// v0.0.14.1, ADR-0008 borcu, kullanıcı kararı 2026-11-05).
//
// Bu dosya `catalog-lint-live.isolation.test.ts`'in İKİZİ DEĞİL, AYRI bir
// dosyadır (ST-B'nin dondurduğu o dosyaya BU alt görevde DOKUNULMADI — handoff'un
// açık yasağı). Kapsadığı üç kanıt:
//
//   AC1 — 2×2 matris: `arkesoft_auth`/`arkesoft_app` × üç sır taşıyan tablo /
//         `tenant`. Negatif hücrelerde `count(*)`'a ASLA assert EDİLMEZ (T-013
//         tuzağı — bu üç tabloda RLS yok ama kanıt "hata yok/hata VAR" olmalı,
//         satır sayısı DEĞİL). `42501`'in Prisma yüzeyi ST-A0②/ST-F'nin
//         ölçtüğü gibi `meta.driverAdapterError.cause.originalCode` alanındadır
//         — `.code` ÇAĞRI YOLUNA göre değişir (`P2010`/`P2039`), BURADA HİÇ
//         okunmaz.
//   AC2  — Yön A (taban, bulgu yok) + Yön B (α/β/γ/δ, `runProbeAndRollback`
//         deseniyle — `catalog-lint-live.isolation.test.ts:49-68`'in BİREBİR
//         izlediği desen, K-E11: `DROP TABLE` YOK, `GRANT`/`REVOKE` bir
//         transaction İÇİNDE uygulanıp SENTINEL hatayla geri alınır).
//   AC4  — sağlıklı taban: "0 bulgu" TEK BAŞINA YASAK (boş bir kural seti de
//         "bulgu yok" der) — `snapshot.tables.length > 0` VE
//         `columnPrivileges.length`'in `snapshot.columns`/`snapshot.roles`'tan
//         TÜRETİLDİĞİ (sabit sayı YAZILMAZ) ile birlikte kanıtlanır.
//
// ⚠⚠ OPSİYONEL `authRole` NESNESİ GERÇEKTEN GEÇİRİLİYOR (ST-C'nin bıraktığı
// risk, FIX turu 1/qa QA-1 sonrası TEK nesneye indi): bu dosyadaki TEK
// `lintCatalog` çağrı noktası `lintOptions()` — `authRole`'u HER çağrıda
// taşır. Geçirilmezse ST-C'nin kuralları burada SESSİZCE değerlendirilMEZ
// (TS tipi seviyesinde expand/contract — bkz. `catalog-lint.ts` dosya başı
// notu) ve α/γ/δ testleri YANLIŞLIKLA "bulgu yok" ile geçerdi; bu riski
// α/γ/δ'nin KENDİSİ kapatır (her biri CANLI mutasyonla kuralı GERÇEKTEN
// ateşletir — bulgu üretmezse test KIRMIZI olur, "0 bulgu" yanılgısı mümkün
// değildir).
//
// KALINTI YOK (A-N2/ST-A0④): her mutasyon testi SONRASI tam bir
// `readCatalogSnapshot` tekrar okunur ve `beforeAll`'da kaydedilen TABAN
// anlık görüntüyle (`baselineSnapshot`) DERİN EŞİT olduğu doğrulanır —
// `GRANT`/`REVOKE` transaction'da TAM geri alınıyor (ST-A0④'ün ölçtüğü olgu),
// bu yüzden ek bir ters `REVOKE`/`finally` GEREKMİYOR.

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
class ProbeRollbackSentinel extends Error {
  constructor() {
    super("ST-E probu: bu hata YALNIZCA transaction'ı geri almak için fırlatıldı.")
  }
}

/**
 * `catalog-lint-live.isolation.test.ts:49-68`'in BİREBİR izlediği desen:
 * `body`'yi `testMigrationPrisma.$transaction` İÇİNDE çalıştırır, döndürdüğü
 * değeri YAKALAR ve transaction'ı sentinel'le ROLLBACK ettirir. `DROP TABLE`
 * YOK — `GRANT`/`REVOKE` DDL'i de transaction'a tabi (ST-A0④), `ROLLBACK`
 * sonrası iz bırakmaz.
 */
async function runProbeAndRollback<T>(body: (tx: TransactionClient) => Promise<T>): Promise<T> {
  let captured: T | undefined
  await expect(
    testMigrationPrisma.$transaction(async (tx) => {
      captured = await body(tx)
      throw new ProbeRollbackSentinel()
    }),
  ).rejects.toThrow(ProbeRollbackSentinel)
  if (captured === undefined) {
    throw new Error(
      'runProbeAndRollback(): captured tanımsız — body() sentinel fırlatılmadan önce tamamlanmadı.',
    )
  }
  return captured
}

/**
 * ST-A0②/ST-F'nin ölçtüğü SABİT alan: `@prisma/adapter-pg` SQLSTATE'i
 * `meta.driverAdapterError.cause.originalCode`de taşır — `.code` ÇAĞRI
 * YOLUNA göre değişir (`$queryRaw` → `P2010`, ORM → `P2039`), bu yüzden BU
 * DOSYA `.code`'a HİÇ assert ETMEZ. `meta` dış dünyadan gelen (Prisma'nın
 * ürettiği) `Record<string, unknown> | undefined` veridir — CLAUDE.md §4:
 * Zod İLE parse edilir, `as` İLE değil.
 */
const driverAdapterErrorMetaSchema = z.looseObject({
  driverAdapterError: z
    .looseObject({
      cause: z
        .looseObject({
          originalCode: z.string().optional(),
          originalMessage: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
})

/**
 * Verilen promise'in `PrismaClientKnownRequestError` İLE reddedildiğini,
 * SQLSTATE'in `42501` (permission denied) OLDUĞUNU ve hata metninin
 * `tableName`'i TAŞIDIĞINI doğrular. AC1'in negatif hücreleri (b)/(d) bunu
 * kullanır — `count(*)`'a ASLA assert EDİLMEZ (T-013 tuzağı, dosya başı notu).
 */
async function expectPermissionDenied(promise: Promise<unknown>, tableName: string): Promise<void> {
  let caughtError: unknown
  try {
    await promise
  } catch (error) {
    caughtError = error
  }

  // `instanceof` native TS DARALTMASI (narrowing) — `as` İLE tip zorlama YOK.
  if (!(caughtError instanceof Prisma.PrismaClientKnownRequestError)) {
    throw new Error(
      `expectPermissionDenied("${tableName}"): hata PrismaClientKnownRequestError DEĞİL (veya hiç hata fırlatılmadı) — beklenmeyen başarı/tip, blanket-grant şüphesi: ${String(caughtError)}`,
    )
  }

  const meta = driverAdapterErrorMetaSchema.parse(caughtError.meta ?? {})
  expect(meta.driverAdapterError?.cause?.originalCode).toBe('42501')
  expect(caughtError.message).toMatch(new RegExp(`permission denied for table ${tableName}`))
}

describe('arkesoft_auth — canlı kanıtlar (T-015/ST-E: AC1 2×2, AC2 Yön A/B α-β-γ-δ, AC4 sağlıklı taban)', () => {
  let appRoleName: string
  let authRoleName: string
  let baselineSnapshot: CatalogSnapshot

  beforeAll(async () => {
    // `catalog-lint-live.isolation.test.ts:79-97`'nin BİREBİR izlediği desen —
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

    baselineSnapshot = await readCatalogSnapshot(testMigrationPrisma, { appRoleName, authRoleName })
  })

  /**
   * ⚠⚠ MEKANİK KONTROL NOKTASI: bu fonksiyon dosyadaki TEK `lintCatalog`
   * girdi üreticisidir ve `authRole` nesnesini (FIX turu 1, qa Tur 1 [medium]
   * QA-1: eskiden ÜÇ AYRI opsiyonel alan — `authRoleName`,
   * `authSecretBearingTables`, `authRoleTablePrivilegeExpectations` — şimdi
   * TEK İÇ İÇE nesne, "hep ya da hiç" artık TİPTE zorlanıyor) HER çağrıda
   * taşır — geçirilmezse ST-C'nin kuralları bu dosya için SESSİZCE
   * değerlendirilmez (bkz. dosya başı GÜNCELLEME notu).
   */
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
   * Bir mutasyon probundan SONRA kataloğun TABAN duruma (ST-D'nin uyguladığı
   * DDL'in sağlıklı hedef durumu) kalıntısız döndüğünü doğrular (A-N2/ST-A0④).
   * Tüm anlık görüntüyü (yalnızca `columnGrants`/`attacl` değil) DERİN EŞİT
   * karşılaştırır — daha güçlü bir kanıt, aynı maliyetle.
   */
  async function expectNoResidue(): Promise<void> {
    const afterSnapshot = await readCatalogSnapshot(testMigrationPrisma, {
      appRoleName,
      authRoleName,
    })
    expect(afterSnapshot).toEqual(baselineSnapshot)
  }

  describe('AC1 — 2×2 matris (canlı prob, count(*) KULLANILMADI)', () => {
    it('(a) arkesoft_auth → üç sır taşıyan tablo SELECT: hata YOK', async () => {
      const authPrisma = getTestAuthPrisma()

      const accountRows = await authPrisma.$queryRaw`SELECT id FROM public.account LIMIT 1`
      const sessionRows = await authPrisma.$queryRaw`SELECT id FROM public.session LIMIT 1`
      const verificationRows =
        await authPrisma.$queryRaw`SELECT id FROM public.verification LIMIT 1`

      // Sorgu BAŞARIYLA tamamlandı (yukarıdaki üç `await` fırlatmadı) — kanıt
      // "hata yok"tur, satır SAYISI DEĞİL (dosya başı notu/T-013 tuzağı).
      expect(Array.isArray(accountRows)).toBe(true)
      expect(Array.isArray(sessionRows)).toBe(true)
      expect(Array.isArray(verificationRows)).toBe(true)
    })

    it('(b) arkesoft_app → üç sır taşıyan tablo SELECT: 42501 VE mesajda tablo adı', async () => {
      await expectPermissionDenied(
        testAppPrisma.$queryRaw`SELECT id FROM public.account LIMIT 1`,
        'account',
      )
      await expectPermissionDenied(
        testAppPrisma.$queryRaw`SELECT id FROM public.session LIMIT 1`,
        'session',
      )
      await expectPermissionDenied(
        testAppPrisma.$queryRaw`SELECT id FROM public.verification LIMIT 1`,
        'verification',
      )
    })

    it('(c) arkesoft_app → tenant: hata YOK (altyapı/bağlantı blanket-fail ETMİYOR)', async () => {
      const rows = await testAppPrisma.$queryRaw`SELECT id FROM public.tenant LIMIT 1`
      expect(Array.isArray(rows)).toBe(true)
    })

    it('(d) arkesoft_auth → tenant: 42501 (auth hibesi blanket DEĞİL)', async () => {
      await expectPermissionDenied(
        getTestAuthPrisma().$queryRaw`SELECT id FROM public.tenant LIMIT 1`,
        'tenant',
      )
    })
  })

  describe('AC2 — Yön A (taban) + Yön B (α/β/γ/δ, runProbeAndRollback)', () => {
    it('Yön A — taban: üç sır taşıyan tablo + app_user için kolon/tablo yetkisi kuralından bulgu YOK', async () => {
      const snapshot = await readCatalogSnapshot(testMigrationPrisma, { appRoleName, authRoleName })
      const findings = lintCatalog(snapshot, lintOptions())
      expect(findings).toEqual([])
    })

    it('β — kolon var/tablo yok (mevcut sağlıklı durum, runProbeAndRollback İÇİNDE mutasyonsuz): bulgu YOK', async () => {
      const findings = await runProbeAndRollback(async (tx) => {
        const snapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })
        return lintCatalog(snapshot, lintOptions())
      })
      expect(findings).toEqual([])
      await expectNoResidue()
    })

    it('α — tablo seviyesi SELECT eklenir (kolon GRANTi dokunulmadan BIRAKILIR): AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE (anti-vacuity bekçisi)', async () => {
      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`GRANT SELECT ON public.account TO arkesoft_auth`
        const snapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })
        return lintCatalog(snapshot, lintOptions())
      })

      // TAM bulgu kümesi — toEqual, some() YOK: tek bulgu, tablo başına TEK
      // (kolon sayısı kadar TEKRARLANMAZ — AUTH_ROLE_MISSING_COLUMN_PRIVILEGE
      // de İKİNCİ bir bulgu üretmez, çünkü isTableLevel dalı erken `continue` eder).
      expect(findings).toEqual([
        expect.objectContaining({
          rule: 'AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE',
          tableName: 'account',
        }),
      ])
      expect(findings[0]?.message).toContain('account')

      await expectNoResidue()
    })

    it('γ — kolon GRANTi adlandırılmış ÜÇÜNCÜ bir role (arkesoft_app) verilir: UNEXPECTED_COLUMN_LEVEL_GRANTEE', async () => {
      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`GRANT SELECT ("token") ON public.session TO arkesoft_app`
        const snapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })
        return lintCatalog(snapshot, lintOptions())
      })

      expect(findings).toEqual([
        expect.objectContaining({
          rule: 'UNEXPECTED_COLUMN_LEVEL_GRANTEE',
          tableName: 'session',
        }),
      ])
      expect(findings[0]?.message).toContain('session')
      expect(findings[0]?.message).toContain('token')
      expect(findings[0]?.message).toContain('arkesoft_app')

      await expectNoResidue()
    })

    it('δ — üç kolondan YALNIZCA biri (account.password, UPDATE) REVOKE edilir: AUTH_ROLE_MISSING_COLUMN_PRIVILEGE, mesaj TABLO VE KOLON adını taşır', async () => {
      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`REVOKE UPDATE ("password") ON public.account FROM arkesoft_auth`
        const snapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })
        return lintCatalog(snapshot, lintOptions())
      })

      expect(findings).toEqual([
        expect.objectContaining({
          rule: 'AUTH_ROLE_MISSING_COLUMN_PRIVILEGE',
          tableName: 'account',
        }),
      ])
      expect(findings[0]?.message).toContain('account')
      expect(findings[0]?.message).toContain('password')
      // α'nın tablo seviyesi bulgusu BU senaryoda düşmez (tablo seviyesi
      // yetki hiç VERİLMEDİ, yalnızca BİR kolon yetkisi geri alındı).
      expect(
        findings.some(
          (finding) => finding.rule === 'AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE',
        ),
      ).toBe(false)

      await expectNoResidue()
    })

    // FIX turu 1 (security Tur 1 [medium] S-1 bulgusu), YENİ — `security`'nin
    // M1 mutasyonunun BİREBİR CANLI reprodüksiyonu: tablo seviyesinde
    // ADLANDIRILMIŞ bir ÜÇÜNCÜ role (`pg_read_all_data` — ÖNCEDEN TANIMLI bir
    // Postgres rolü, `arkesoft_app`/`arkesoft_auth` DIŞINDA; operatörün
    // gerçek dünyada kullanacağı bir "bi_reader" tipi raporlama rolünün
    // emsali) `SELECT` verilmesi, NE Kaynak A (iki adlandırılmış rolü
    // sorgular) NE Kaynak B (yalnızca KOLON seviyesini görür) tarafından
    // GÖRÜLÜR — ölçüldü: `has_table_privilege('arkesoft_app'/'arkesoft_auth',
    // …)` İKİSİ de `false` kalır. Kaynak C (`tableGrants`) olmadan bu mutasyon
    // SURVIVED olurdu (security'nin ölçtüğü TAM davranış).
    it('ε — tablo seviyesinde adlandırılmış ÜÇÜNCÜ bir role (pg_read_all_data) SELECT verilir: UNEXPECTED_TABLE_LEVEL_GRANTEE (M1 reprodüksiyonu)', async () => {
      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`GRANT SELECT ON public.account TO pg_read_all_data`
        const snapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })

        // Anti-vacuity: bu mutasyon Kaynak A'yı GERÇEKTEN etkilemiyor —
        // `arkesoft_app`/`arkesoft_auth`in `has_table_privilege` sonucu
        // DEĞİŞMEDİ. Bu, M1'in NEDEN Kaynak C'siz SURVIVED olduğunun canlı
        // kanıtıdır.
        const appHasSelect = await tx.$queryRaw<
          { hasAccess: boolean }[]
        >`SELECT has_table_privilege(${appRoleName}, 'public.account', 'SELECT') AS "hasAccess"`
        const authHasSelect = await tx.$queryRaw<
          { hasAccess: boolean }[]
        >`SELECT has_table_privilege(${authRoleName}, 'public.account', 'SELECT') AS "hasAccess"`
        expect(appHasSelect[0]?.hasAccess).toBe(false)
        expect(authHasSelect[0]?.hasAccess).toBe(false)

        return lintCatalog(snapshot, lintOptions())
      })

      expect(findings).toEqual([
        expect.objectContaining({
          rule: 'UNEXPECTED_TABLE_LEVEL_GRANTEE',
          tableName: 'account',
        }),
      ])
      expect(findings[0]?.message).toContain('account')
      expect(findings[0]?.message).toContain('pg_read_all_data')

      await expectNoResidue()
    })
  })

  // FIX turu 2 (security Tur 2 — S-7 [high]/S-9 [medium]/S-8 [medium]
  // bulguları), YENİ. Üçü de `runProbeAndRollback` içinde (K-E11, `DROP
  // TABLE`/`DROP ROLE` YOK) — kalıntı yok (`expectNoResidue`).
  describe('FIX turu 2 — S-7 (view/matview/foreign table), S-9 (bölümlenmiş tablo), S-8 (SECURITY DEFINER fonksiyon)', () => {
    it('ζ — account üzerine bir VIEW yazılır, arkesoft_app HİÇBİR GRANT olmadan ona SELECT edebiliyor (M9 reprodüksiyonu): UNEXPECTED_RELATION_KIND, snapshot.tables YOK', async () => {
      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`CREATE VIEW public.acct_leak_v AS SELECT id, password FROM public.account`

        // M9'un ÇEKİRDEK olgusu: HİÇBİR GRANT yazılmadan arkesoft_app bu
        // view'ı SELECT edebiliyor — `ALTER DEFAULT PRIVILEGES … ON TABLES`
        // (bootstrap bölüm 4) view'ı DA kapsıyor, view SAHİBİNİN (arkesoft_
        // migrator, `account`'ın da sahibi) yetkisiyle çalıştığı için kolon
        // bazlı kısıtlamayı BAYPAS eder.
        const appCanSelect = await tx.$queryRaw<
          { hasAccess: boolean }[]
        >`SELECT has_table_privilege(${appRoleName}, 'public.acct_leak_v', 'SELECT') AS "hasAccess"`
        expect(appCanSelect[0]?.hasAccess).toBe(true)

        const snapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })

        // Anti-vacuity — S-7'nin ÖLÇTÜĞÜ boşluğun TAM KENDİSİ: view
        // `snapshot.tables`'TA YOKTUR (`readTables()` `pg_tables`'ı kullanır,
        // `relkind IN ('r','p')`) — `UNCLASSIFIED_TABLE`/`MISSING_TABLE` bu
        // nesneyi HİÇ GÖREMEZ.
        expect(snapshot.tables.some((table) => table.tableName === 'acct_leak_v')).toBe(false)
        // Kaynak D'nin GERÇEKTEN gördüğünün kanıtı (okuyucu seviyesinde).
        expect(
          snapshot.unexpectedRelations.some(
            (relation) => relation.relationName === 'acct_leak_v' && relation.relationKind === 'v',
          ),
        ).toBe(true)

        return lintCatalog(snapshot, lintOptions())
      })

      // FIX ÖNCESİ (security Tur 2 M9): bu mutasyon `lintCatalog` → `[]`
      // veriyordu (ölçülen SURVIVED). FIX SONRASI: TEK bulgu —
      // `UNEXPECTED_RELATION_KIND` — düşer, `UNCLASSIFIED_TABLE` DÜŞMEZ
      // (view zaten `snapshot.tables`'ta yok, o kural bu nesneyi hiç görmez).
      expect(findings).toEqual([
        expect.objectContaining({ rule: 'UNEXPECTED_RELATION_KIND', tableName: 'acct_leak_v' }),
      ])
      expect(findings[0]?.message).toContain('acct_leak_v')
      expect(findings[0]?.message).toContain('VIEW')

      await expectNoResidue()
    })

    it('ζ yanlış pozitif kontrolü — sağlıklı tabanda UNEXPECTED_RELATION_KIND SIFIR ve mutasyonsuz lintCatalog HÂLÂ []', async () => {
      const snapshot = await readCatalogSnapshot(testMigrationPrisma, { appRoleName, authRoleName })
      // Kaynak D'nin kendisi boş — bugünkü canlı veritabanında `public`te
      // view/matview/foreign table YOK (S-7'nin tasarım seçeneği C'sinin
      // "bugün sayı sıfır" iddiasının CANLI kanıtı).
      expect(snapshot.unexpectedRelations).toEqual([])
      const findings = lintCatalog(snapshot, lintOptions())
      // RLS/indeks/tenant_id kurallarının (lintTenantScopedTable) BU
      // değişiklikten ETKİLENMEDİĞİNİN kanıtı: toplam bulgu HÂLÂ sıfır —
      // Kaynak D/E bağımsız okuyucular olduğu için (:282/:498'e dokunulmadı)
      // üç yanlış pozitif riski (RLS_NOT_ENABLED/MISSING_TENANT_ID_LEADING_
      // INDEX/MISSING_TENANT_ID_COLUMN) GERÇEKLEŞMEDİ.
      expect(findings).toEqual([])
    })

    it('η — BÖLÜMLENMİŞ (PARTITION BY) bir tabloya adlandırılmış ÜÇÜNCÜ bir role GRANT verilir: UNEXPECTED_TABLE_LEVEL_GRANTEE artık YAKALANIYOR (S-9, M18 PARTIAL → CAUGHT)', async () => {
      const partitionedTableName = '__st_e_fix2_partitioned_probe'

      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`CREATE TABLE public.__st_e_fix2_partitioned_probe (
          id text NOT NULL,
          created_at timestamptz NOT NULL
        ) PARTITION BY RANGE (created_at)`
        await tx.$executeRaw`GRANT SELECT ON public.__st_e_fix2_partitioned_probe TO pg_read_all_data`

        // S-9'un ÖLÇTÜĞÜ ASİMETRİ, DOĞRUDAN ölçüldü: `relkind = 'r'`
        // (eski/dar filtre) bu tabloyu GÖRMEZ (relkind='p'), `relkind IN
        // ('r','p')` (S-9'un düzeltmesi) GÖRÜR.
        const onlyR = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT count(*)::bigint AS "count"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = ${partitionedTableName} AND c.relkind = 'r'
        `
        const rOrP = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT count(*)::bigint AS "count"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = ${partitionedTableName} AND c.relkind IN ('r', 'p')
        `
        expect(onlyR[0]?.count).toBe(0n)
        expect(rOrP[0]?.count).toBe(1n)

        const snapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })

        // `pg_tables` (ve dolayısıyla `readTables()`) bölümlenmiş tabloyu
        // ZATEN gösteriyordu (relkind IN ('r','p') yerleşik) — bu S-9'un
        // konusu DEĞİL, Kaynak C'nin (tableGrants) GÖRÜP GÖRMEMESİ konusu.
        expect(snapshot.tables.some((table) => table.tableName === partitionedTableName)).toBe(true)
        expect(
          snapshot.tableGrants.some(
            (grant) =>
              grant.tableName === partitionedTableName && grant.grantee === 'pg_read_all_data',
          ),
        ).toBe(true)

        return lintCatalog(snapshot, lintOptions())
      })

      const unexpectedGranteeFindings = findings.filter(
        (finding) =>
          finding.rule === 'UNEXPECTED_TABLE_LEVEL_GRANTEE' &&
          finding.tableName === partitionedTableName,
      )
      expect(unexpectedGranteeFindings).toHaveLength(1)
      expect(unexpectedGranteeFindings[0]?.message).toContain('pg_read_all_data')

      await expectNoResidue()
    })

    // FIX turu 3 (security Tur 3 [medium] S-15) notu: bu fonksiyon HEM PUBLIC
    // EXECUTE taşır HEM SECURITY DEFINER'dır — bu yüzden FIX 3'ten SONRA iki
    // bulgu BİRDEN düşer (hibe ekseni + varlık ekseni, İKİSİ de BAĞIMSIZ
    // doğru). Bu, FIX 3'ün "iki kod ayrı" iddiasının İKİ KOŞULUN AYNI ANDA
    // DOĞRU olduğu durumda BİRLİKTE düştüğünün kanıtıdır — ayrışmanın asıl
    // kanıtı α/β senaryoları (bkz. aşağıdaki yeni describe bloğu).
    it('θ — public şemasında bir SECURITY DEFINER fonksiyon PUBLIC EXECUTE taşıyor (M14 reprodüksiyonu): UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE + UNEXPECTED_SECURITY_DEFINER_FUNCTION (FIX 3)', async () => {
      const functionName = '__st_e_fix2_leak_fn'

      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`CREATE FUNCTION public.__st_e_fix2_leak_fn()
          RETURNS text LANGUAGE sql SECURITY DEFINER
          AS $$ SELECT password FROM public.account LIMIT 1 $$`

        // M14'ün ÇEKİRDEK olgusu: HİÇBİR GRANT yazılmadan PUBLIC
        // (dolayısıyla arkesoft_app) bu fonksiyonu yürütebiliyor — `proacl`
        // NULL kalıyor, fonksiyonlar için varsayılan EXECUTE PUBLIC'tir
        // (tablo/sekansın TERSİNE — bkz. `bootstrap-roles.sql` bölüm 8'in
        // AMPİRİK ÖLÇÜM notu).
        const publicCanExecute = await tx.$queryRaw<
          { canExecute: boolean }[]
        >`SELECT has_function_privilege('public', 'public.__st_e_fix2_leak_fn()', 'EXECUTE') AS "canExecute"`
        expect(publicCanExecute[0]?.canExecute).toBe(true)
        const appCanExecute = await tx.$queryRaw<
          { canExecute: boolean }[]
        >`SELECT has_function_privilege(${appRoleName}, 'public.__st_e_fix2_leak_fn()', 'EXECUTE') AS "canExecute"`
        expect(appCanExecute[0]?.canExecute).toBe(true)

        const snapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })
        return lintCatalog(snapshot, lintOptions())
      })

      expect(findings).toEqual([
        expect.objectContaining({
          rule: 'UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE',
          tableName: functionName,
        }),
        expect.objectContaining({
          rule: 'UNEXPECTED_SECURITY_DEFINER_FUNCTION',
          tableName: functionName,
        }),
      ])
      expect(findings[0]?.message).toContain(functionName)
      expect(findings[1]?.message).toContain(functionName)

      await expectNoResidue()
    })

    it('θ — yol (a) MEVCUT fonksiyon için ÇALIŞIR: REVOKE EXECUTE ON ALL FUNCTIONS … FROM PUBLIC sonrası arkesoft_app EXECUTE EDEMEZ VE hibe ekseni bulgusu DÜŞMEZ (varlık ekseni, SECURITY DEFINER OLDUĞU İÇİN HÂLÂ düşer — FIX 3)', async () => {
      const functionName = '__st_e_fix2_leak_fn_closed'

      const findings = await runProbeAndRollback(async (tx) => {
        await tx.$executeRaw`CREATE FUNCTION public.__st_e_fix2_leak_fn_closed()
          RETURNS text LANGUAGE sql SECURITY DEFINER
          AS $$ SELECT password FROM public.account LIMIT 1 $$`
        // `sql/bootstrap-roles.sql` bölüm 8'in BİREBİR satırı — MEVCUT bir
        // fonksiyon için (gelecekteki için DEĞİL, bkz. o bölümün AMPİRİK ÖLÇÜM
        // notu) PUBLIC'in EXECUTE'unu GERÇEKTEN alır.
        await tx.$executeRaw`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`

        const appCanExecute = await tx.$queryRaw<
          { canExecute: boolean }[]
        >`SELECT has_function_privilege(${appRoleName}, 'public.__st_e_fix2_leak_fn_closed()', 'EXECUTE') AS "canExecute"`
        expect(appCanExecute[0]?.canExecute).toBe(false)

        const snapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })
        return lintCatalog(snapshot, lintOptions())
      })

      // Yol (a) HİBE eksenini kapattığı İÇİN hibe ekseni kodu
      // (`UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`) artık bu fonksiyon için
      // DÜŞMEZ — "kapatma" ve "tespit" birbirini DOĞRULUYOR.
      expect(
        findings.some(
          (finding) =>
            finding.rule === 'UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE' &&
            finding.tableName === functionName,
        ),
      ).toBe(false)

      // FIX turu 3 (S-15) — BU, S-15'İN ÇEKİRDEK NOKTASIDIR: yol (a) HİBE
      // eksenini kapatır (`appCanExecute=false`, yukarıda ölçüldü), AMA
      // fonksiyon HÂLÂ SECURITY DEFINER'dır — VARLIK ekseni kodu
      // (`UNEXPECTED_SECURITY_DEFINER_FUNCTION`) hibe durumundan BAĞIMSIZ
      // olarak DÜŞER. FIX 3 ÖNCESİ bu fonksiyon için (REVOKE+GRANT'in
      // kaçışında olduğu gibi) tespit SIFIRDI — FIX 3 SONRASI hibe
      // KAPANMIŞ bile olsa SECURITY DEFINER'ın KENDİSİ hâlâ bir bulgudur.
      expect(
        findings.some(
          (finding) =>
            finding.rule === 'UNEXPECTED_SECURITY_DEFINER_FUNCTION' &&
            finding.tableName === functionName,
        ),
      ).toBe(true)

      await expectNoResidue()
    })

    // FIX turu 3 (security Tur 3 [medium] S-15 bulgusu) — S-15'in TAM
    // ÖLÇTÜĞÜ kaçış yolunun CANLI reprodüksiyonu (REVOKE FROM PUBLIC + GRANT
    // TO arkesoft_app). FIX 3 ÖNCESİ bu mutasyon `lintCatalog` → `[]`
    // verirdi (bkz. handoff raporu "① S-15 — KAÇIŞ YOLUNUN REPRODÜKSİYONU").
    describe('ι — S-15: REVOKE EXECUTE … FROM PUBLIC + GRANT EXECUTE … TO arkesoft_app (kaçış yolu)', () => {
      it('arkesoft_app PUBLIC olmadan EXECUTE edebiliyor ve account.password okuyor — UNEXPECTED_SECURITY_DEFINER_FUNCTION DÜŞER, UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE DÜŞMEZ', async () => {
        const functionName = '__st_e_fix3_probe'

        const result = await runProbeAndRollback(async (tx) => {
          await tx.$executeRaw`CREATE FUNCTION public.__st_e_fix3_probe()
            RETURNS text LANGUAGE sql SECURITY DEFINER
            AS $$ SELECT password FROM public.account LIMIT 1 $$`
          await tx.$executeRaw`REVOKE EXECUTE ON FUNCTION public.__st_e_fix3_probe() FROM PUBLIC`
          // `appRoleName` bir TANIMLAYICI (identifier) olarak SQL metnine
          // girer — `$executeRawUnsafe` YASAK (CLAUDE.md §2, K-E12). Resmî
          // güvenli yol: `Prisma.sql` ETİKETLİ ŞABLONU + `Prisma.raw()` —
          // `$executeRawUnsafe`'İN TERSİNE bu İKİSİ `$(execute|query)
          // RawUnsafe` SEÇİCİSİYLE EŞLEŞMEZ (ESLint doğruladı) VE
          // `format('%I', …)`'in BİREBİR aynı amacı (güvenli tanımlayıcı
          // alıntılama) taşır.
          await tx.$executeRaw(
            Prisma.sql`GRANT EXECUTE ON FUNCTION public.${Prisma.raw(functionName)}() TO ${Prisma.raw(
              `"${appRoleName.replace(/"/g, '""')}"`,
            )}`,
          )

          const publicCanExecute = await tx.$queryRaw<
            { canExecute: boolean }[]
          >`SELECT has_function_privilege('public', 'public.__st_e_fix3_probe()', 'EXECUTE') AS "canExecute"`
          expect(publicCanExecute[0]?.canExecute).toBe(false)

          // arkesoft_app'in GERÇEKTEN EXECUTE edebildiğinin kanıtı (ST-E'nin
          // ζ/θ testleriyle BİREBİR aynı desen, `has_function_privilege`).
          const appCanExecute = await tx.$queryRaw<
            { canExecute: boolean }[]
          >`SELECT has_function_privilege(${appRoleName}, 'public.__st_e_fix3_probe()', 'EXECUTE') AS "canExecute"`
          expect(appCanExecute[0]?.canExecute).toBe(true)

          // Fonksiyon GERÇEKTEN account.password okuyabiliyor mu (SECURITY
          // DEFINER semantiği — hangi rol çağırırsa çağırsın SAHİBİN
          // yetkisiyle ÇALIŞIR; `appCanExecute=true` ile BİRLEŞTİRİLDİĞİNDE
          // arkesoft_app'in fiilen çağırdığında ALACAĞI sonuçla BİREBİR
          // AYNIDIR — T-013 tuzağına düşmeden, `count(*)` DEĞİL).
          const probeRows = await tx.$queryRaw<
            { password: string | null }[]
          >`SELECT public.__st_e_fix3_probe() AS "password"`
          expect(probeRows).toHaveLength(1)

          const snapshot = await readCatalogSnapshot(tx, { appRoleName, authRoleName })
          const findings = lintCatalog(snapshot, lintOptions())

          // Kaynak E'nin hibe eksenindeki NAMED GRANTEE kanıtı (`proacl`
          // + `aclexplode`) — mesajın teşhis bölümünün zemini.
          const grantees = snapshot.functionExecuteGrantees.filter(
            (grant) => grant.functionName === functionName,
          )

          return { findings, grantees }
        })

        // KAÇIŞ KAPANDI: hibe ekseni (PUBLIC kapalı) DÜŞMEZ, varlık ekseni
        // (SECURITY DEFINER'ın kendisi) DÜŞER.
        expect(result.findings).toEqual([
          expect.objectContaining({
            rule: 'UNEXPECTED_SECURITY_DEFINER_FUNCTION',
            tableName: functionName,
          }),
        ])
        expect(result.findings[0]?.message).toContain(functionName)
        expect(result.findings[0]?.message).toContain(appRoleName)

        // ⚠⚠ YENİ ÖLÇÜLEN `proacl` SEMANTİĞİ (ölçüm tuzağı #2'nin fonksiyon
        // karşılığı): `pg_proc.proacl`, `pg_attribute.attacl`İN TERSİNE
        // (ST-A0③: tablo sahibi `attacl`de GÖRÜNMEZ), `pg_class.relacl`İLE
        // AYNI davranıyor — bir `GRANT`/`REVOKE` DDL'i `proacl`'ı
        // MATERYALİZE ettiği an, fonksiyon SAHİBİNİN (`arkesoft_migrator`)
        // ÖRTÜK yetkisi de AÇIK bir satıra döner. Bu yüzden grantee kümesi
        // BİREBİR değil `arkesoft_app`İ İÇEREN bir küme olarak doğrulanır —
        // tahminle yazılan bir `.find()` (ilk eşleşen satır) bu YÜZDEN
        // `arkesoft_migrator`ı YAKALARDI (bu test BUNU böyle yazıp
        // ÇÜRÜTTÜ). `lintUnexpectedSecurityDefinerFunctions` bu veriyi
        // yalnızca TEŞHİS MESAJINDA kullanır (ateşlenme KARARI DEĞİL) —
        // bu yüzden asimetri bir yanlış pozitife/negatife YOL AÇMAZ.
        expect(result.grantees.map((grant) => grant.grantee)).toEqual(
          expect.arrayContaining([appRoleName]),
        )
        const appGrant = result.grantees.find((grant) => grant.grantee === appRoleName)
        expect(appGrant?.privilegeType).toBe('EXECUTE')

        await expectNoResidue()
      })
    })
  })

  describe("AC4 — sağlıklı taban: '0 bulgu' TEK BAŞINA YASAK (anti-vacuity, türetilmiş sayılar)", () => {
    it("lintCatalog([]) VE snapshot boş DEĞİL VE columnPrivileges satır sayısı snapshot.columns/roles'tan TÜRETİLİR", async () => {
      const snapshot = await readCatalogSnapshot(testMigrationPrisma, { appRoleName, authRoleName })
      const findings = lintCatalog(snapshot, lintOptions())

      expect(findings).toEqual([])
      // Boş bulgu listesinin "her şey yolunda" mı yoksa "hiçbir şey
      // incelenmedi" mi olduğunu ayırt eden madde: katalog GERÇEKTEN
      // dolu okundu.
      expect(snapshot.tables.length).toBeGreaterThan(0)

      // `columnPrivileges` (Kaynak A) `public` şemasının TAMAMINI, HER
      // `snapshot.roles` üyesi İÇİN okur (K-E5 — taksonomi/tablo kümesi
      // BURAYA GİRMEZ, bkz. `catalog-snapshot.ts` dosya başı notu) — bu
      // yüzden çarpan ve toplam `snapshot.columns`/`snapshot.roles`'tan
      // TÜRETİLİR, SABİT bir sayı YAZILMAZ (ST-A0'ın bağlayıcı kısıtı).
      const distinctRoleCount = new Set(snapshot.roles.map((role) => role.roleName)).size
      expect(distinctRoleCount).toBeGreaterThan(0)
      expect(snapshot.columns.length).toBeGreaterThan(0)
      expect(snapshot.columnPrivileges.length).toBe(snapshot.columns.length * distinctRoleCount)

      // Boş olmadığının İKİNCİ kanıtı: en az bir sır taşıyan tablonun en az
      // bir kolonu `arkesoft_auth` için GERÇEKTEN `columnOnly` (kolon bazlı,
      // tablo bazlı DEĞİL) sinyali taşıyor — rastgele/boş bir dizi bunu
      // GARANTİ edemez.
      const secretTableNames = new Set<string>(AUTH_SECRET_BEARING_TABLES)
      const authColumnOnlySample = snapshot.columnPrivileges.find(
        (privilege) =>
          privilege.roleName === authRoleName &&
          secretTableNames.has(privilege.tableName) &&
          privilege.hasColumnSelect &&
          !privilege.hasTableSelect,
      )
      expect(authColumnOnlySample).toBeDefined()

      // FIX turu 3 (S-15) yanlış pozitif kontrolü: canlı veritabanında
      // `public`te SIFIR fonksiyon var (ölçüldü, Kaynak E) — bu yüzden
      // `UNEXPECTED_SECURITY_DEFINER_FUNCTION` hiç ateşlenmemeli. Boş dizi
      // burada "kural hiç bakmadı" DEMEK DEĞİLDİR: yukarıdaki (ι) testi
      // kuralın GERÇEKTEN bir SECURITY DEFINER fonksiyon karşısında
      // ateşlendiğini canlı olarak kanıtlıyor.
      expect(snapshot.functionPrivileges).toEqual([])
      expect(snapshot.functionExecuteGrantees).toEqual([])
    })
  })
})
