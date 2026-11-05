// @arkesoft/db — `catalog-lint.ts`'in SAF birim testleri (ROADMAP v0.0.13,
// T-005/S4, architect K-E5; ROADMAP v0.0.14.1, T-015/ST-C genişletmesi)
//
// Bu dosya `*.isolation.test.ts` DEĞİLDİR — DB'ye dokunmaz, normal
// `pnpm --filter @arkesoft/db test` hattında koşar (`vitest.config.ts`'in
// `include: ['src/**/*.test.ts']` deseni bunu yakalar). `lintCatalog` SAF
// olduğu için her kural burada FIXTURE'LARLA, bağlantı kurmadan doğrulanır.
//
// Taban (healthy) anlık görüntü `tenant_membership`'in BUGÜNKÜ canlı
// durumunu (RLS+FORCE+politika+öncü indeks+yetkiler) birebir modeller; her
// test taban üzerinden TEK bir sapma uygular ve o sapmanın BEKLENEN kuralı
// (ve YALNIZCA o kuralı, ilgisiz tabloda) ürettiğini doğrular.
//
// T-015/ST-C GENİŞLETMESİ: taban artık ÜÇ sır taşıyan tabloyu (`account`/
// `session`/`verification`, ST-D'nin DDL'inin HEDEF DURUMU — kolon bazlı
// SELECT/INSERT/UPDATE + tablo bazlı DELETE) ve `app_user`'ı (tablo bazlı
// SELECT/INSERT/UPDATE, DELETE YOK) de modeller. `lintCatalog`'un çıktısı
// her assert'te TAM karşılaştırılır (`toEqual`, `some()` YOK — K-E5/AC9).

import { afterAll, describe, expect, it } from 'vitest'

import type { CatalogSnapshot } from '../catalog-snapshot.js'
import {
  lintCatalog,
  TENANT_ISOLATION_RULES,
  type LintCatalogOptions,
  type LintFinding,
  type TenantIsolationRule,
} from '../catalog-lint.js'

const TENANT_CONTEXT_SETTING = 'app.tenant_id'
const APP_ROLE_NAME = 'arkesoft_app'
const MIGRATOR_ROLE_NAME = 'arkesoft_migrator'
// T-015/ST-B: `CatalogSnapshot.roles[]`'un ikinci üyesi.
const AUTH_ROLE_NAME = 'arkesoft_auth'
// Beklenen tek grantee kümesinin DIŞINDA, γ senaryosu için "adlandırılmış
// üçüncü rol" — gerçek bir rol değil, saf fixture verisi.
const THIRD_PARTY_ROLE_NAME = 'some_other_role'

const SECRET_TABLE_NAMES = ['account', 'session', 'verification'] as const

// FIX turu 1 (qa Tur 1 [medium] QA-1 bulgusu) — üç ayrı opsiyonel alan TEK
// `authRole` nesnesine indi; tip burada `NonNullable<LintCatalogOptions['authRole']>`
// üzerinden türetilir (literal yeniden tanım YOK).
type AuthRoleLintInput = NonNullable<LintCatalogOptions['authRole']>

const AUTH_ROLE_TABLE_EXPECTATIONS: AuthRoleLintInput['tablePrivilegeExpectations'] = [
  { tableName: 'account', columnLevel: true, expectsTableDelete: true },
  { tableName: 'session', columnLevel: true, expectsTableDelete: true },
  { tableName: 'verification', columnLevel: true, expectsTableDelete: true },
  { tableName: 'app_user', columnLevel: false, expectsTableDelete: false },
]

const BASE_OPTIONS: LintCatalogOptions = {
  taxonomy: {
    tenantScopedTables: ['tenant_membership'],
    platformLevelTables: ['tenant', 'app_user', 'session', 'account', 'verification'],
  },
  tenantContextSetting: TENANT_CONTEXT_SETTING,
  appRoleName: APP_ROLE_NAME,
  authRole: {
    roleName: AUTH_ROLE_NAME,
    secretBearingTables: SECRET_TABLE_NAMES,
    tablePrivilegeExpectations: AUTH_ROLE_TABLE_EXPECTATIONS,
  },
}

/** Her sır taşıyan tablonun kolonları — δ senaryosu için `account` ÜÇ kolon taşır. */
const SECRET_TABLE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  account: ['id', 'email', 'password'],
  session: ['id', 'token'],
  verification: ['id', 'value'],
}

function healthySnapshot(): CatalogSnapshot {
  const secretTableColumns = Object.entries(SECRET_TABLE_COLUMNS).flatMap(([tableName, columns]) =>
    columns.map((columnName) => ({ tableName, columnName })),
  )

  return {
    tables: [
      { tableName: 'tenant', tableOwner: MIGRATOR_ROLE_NAME },
      { tableName: 'app_user', tableOwner: MIGRATOR_ROLE_NAME },
      { tableName: 'tenant_membership', tableOwner: MIGRATOR_ROLE_NAME },
      { tableName: '_prisma_migrations', tableOwner: MIGRATOR_ROLE_NAME },
      { tableName: 'account', tableOwner: MIGRATOR_ROLE_NAME },
      { tableName: 'session', tableOwner: MIGRATOR_ROLE_NAME },
      { tableName: 'verification', tableOwner: MIGRATOR_ROLE_NAME },
    ],
    columns: [
      { tableName: 'tenant', columnName: 'id', dataType: 'text', isNullable: false },
      { tableName: 'app_user', columnName: 'id', dataType: 'text', isNullable: false },
      { tableName: 'tenant_membership', columnName: 'id', dataType: 'text', isNullable: false },
      {
        tableName: 'tenant_membership',
        columnName: 'tenant_id',
        dataType: 'text',
        isNullable: false,
      },
      {
        tableName: 'tenant_membership',
        columnName: 'user_id',
        dataType: 'text',
        isNullable: false,
      },
      ...secretTableColumns.map((column) => ({
        ...column,
        dataType: 'text',
        isNullable: false,
      })),
    ],
    rowSecurity: [
      {
        tableName: 'tenant_membership',
        isRowSecurityEnabled: true,
        isRowSecurityForced: true,
      },
    ],
    policies: [
      {
        tableName: 'tenant_membership',
        policyName: 'tenant_membership_tenant_isolation',
        roles: ['public'],
        usingExpression: `(tenant_id = current_setting('${TENANT_CONTEXT_SETTING}'::text, true))`,
        withCheckExpression: `(tenant_id = current_setting('${TENANT_CONTEXT_SETTING}'::text, true))`,
      },
    ],
    indexes: [
      {
        tableName: 'tenant_membership',
        indexName: 'tenant_membership_tenant_id_user_id_key',
        columns: ['tenant_id', 'user_id'],
      },
      {
        tableName: 'tenant_membership',
        indexName: 'tenant_membership_user_id_idx',
        columns: ['user_id'],
      },
    ],
    roles: [
      { roleName: APP_ROLE_NAME, isSuperuser: false, canBypassRls: false, canCreateDb: false },
      { roleName: AUTH_ROLE_NAME, isSuperuser: false, canBypassRls: false, canCreateDb: false },
    ],
    privileges: [
      {
        roleName: APP_ROLE_NAME,
        tableName: 'tenant',
        canSelect: true,
        canInsert: true,
        canUpdate: true,
        canDelete: true,
      },
      {
        roleName: APP_ROLE_NAME,
        tableName: 'app_user',
        canSelect: true,
        canInsert: true,
        canUpdate: true,
        canDelete: true,
      },
      {
        roleName: APP_ROLE_NAME,
        tableName: 'tenant_membership',
        canSelect: true,
        canInsert: true,
        canUpdate: true,
        canDelete: true,
      },
      // FIX turu 2 (B3): `_prisma_migrations`'ın SAĞLIKLI hedef durumu artık
      // yalnızca SELECT — bootstrap'ın daraltılmış `REVOKE`si (bkz.
      // `sql/bootstrap-roles.sql` bölüm 6) bu üçünü `false`a yakınsatır.
      {
        roleName: APP_ROLE_NAME,
        tableName: '_prisma_migrations',
        canSelect: true,
        canInsert: false,
        canUpdate: false,
        canDelete: false,
      },
      // T-015/ST-C/ST-D'nin HEDEF DURUMU: `arkesoft_app` üç sır taşıyan
      // tabloda HİÇBİR yetkiye sahip DEĞİL (tablo bazlı REVOKE uygulandı).
      ...SECRET_TABLE_NAMES.map((tableName) => ({
        roleName: APP_ROLE_NAME,
        tableName,
        canSelect: false,
        canInsert: false,
        canUpdate: false,
        canDelete: false,
      })),
      // `arkesoft_auth`: üç sır taşıyan tabloda TABLO bazlı SELECT/INSERT/
      // UPDATE YOK (kolon bazlı veriliyor, aşağıdaki `columnPrivileges`), TABLO
      // bazlı DELETE VAR.
      ...SECRET_TABLE_NAMES.map((tableName) => ({
        roleName: AUTH_ROLE_NAME,
        tableName,
        canSelect: false,
        canInsert: false,
        canUpdate: false,
        canDelete: true,
      })),
      // `arkesoft_auth`: `app_user` üzerinde TABLO bazlı SELECT/INSERT/UPDATE
      // VAR, DELETE YOK (A-N1 — en az yetki).
      {
        roleName: AUTH_ROLE_NAME,
        tableName: 'app_user',
        canSelect: true,
        canInsert: true,
        canUpdate: true,
        canDelete: false,
      },
    ],
    // T-015/ST-C, Kaynak A: her sır taşıyan tablonun HER kolonu için
    // `arkesoft_auth`ın sağlıklı (columnOnly) durumu — tablo bazlı YOK, kolon
    // bazlı SELECT/INSERT/UPDATE VAR (ST-A0①'in ampirik ölçtüğü ayırt
    // edilebilir sinyal).
    columnPrivileges: secretTableColumns.map((column) => ({
      roleName: AUTH_ROLE_NAME,
      ...column,
      hasTableSelect: false,
      hasColumnSelect: true,
      hasTableInsert: false,
      hasColumnInsert: true,
      hasTableUpdate: false,
      hasColumnUpdate: true,
    })),
    // T-015/ST-C, Kaynak B: her sır taşıyan tablonun HER kolonu için tek
    // alıcı `arkesoft_auth` (beklenen küme — ST-A0③: tablo sahibi `grantee`
    // olarak ASLA görünmez, bu yüzden beklenen kümeye EKLENMEDİ).
    columnGrants: secretTableColumns.map((column) => ({
      ...column,
      grantor: MIGRATOR_ROLE_NAME,
      grantee: AUTH_ROLE_NAME,
      privilegeType: 'SELECT',
      isGrantable: false,
    })),
    // FIX turu 1 (security Tur 1 [medium] S-1), Kaynak C — canlı Postgres'te
    // ÖLÇÜLMÜŞ şekil (bkz. handoff raporu): her sır taşıyan tabloda
    // `arkesoft_auth` TABLO bazlı DELETE taşır; `app_user`de HEM
    // `arkesoft_app` (tam DML) HEM `arkesoft_auth` (DELETE HARİÇ) TABLO
    // seviyesi hibe taşır. Tablo SAHİBİNİN (`arkesoft_migrator`) `relacl`de
    // `grantee` olarak GÖRÜNMESİ (attacl'in TERSİ — dosya başı notu) BİLEREK
    // fixture'a EKLENMEDİ: `lintTableGrantGrantees` sahibi `table.tableOwner`
    // ALANINDAN okur (bu fixture'da `MIGRATOR_ROLE_NAME`), `tableGrants`
    // satırı OLMASA bile beklenen kümenin bir üyesidir — eksik satır sağlıklı
    // taban için yanlış pozitif ÜRETMEZ.
    tableGrants: [
      ...SECRET_TABLE_NAMES.map((tableName) => ({
        tableName,
        grantor: MIGRATOR_ROLE_NAME,
        grantee: AUTH_ROLE_NAME,
        privilegeType: 'DELETE',
        isGrantable: false,
      })),
      ...(['SELECT', 'INSERT', 'UPDATE'] as const).map((privilegeType) => ({
        tableName: 'app_user',
        grantor: MIGRATOR_ROLE_NAME,
        grantee: AUTH_ROLE_NAME,
        privilegeType,
        isGrantable: false,
      })),
      ...(['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const).map((privilegeType) => ({
        tableName: 'app_user',
        grantor: MIGRATOR_ROLE_NAME,
        grantee: APP_ROLE_NAME,
        privilegeType,
        isGrantable: false,
      })),
    ],
    // FIX turu 2 (security Tur 2 [high] S-7), Kaynak D — sağlıklı tabanda
    // `public`te view/matview/foreign table YOK (bugün canlı veritabanında
    // ÖLÇÜLEN olgu: SIFIR). Boş dizi burada "kural hiç bakmadı" DEMEK
    // DEĞİLDİR — `UNEXPECTED_RELATION_KIND: Kaynak D'de satır varsa ateşlenir`
    // testi (aşağıda) kuralın GERÇEKTEN değerlendirildiğini kanıtlar.
    unexpectedRelations: [],
    // FIX turu 2 (security Tur 2 [medium] S-8), Kaynak E — sağlıklı tabanda
    // `public`te fonksiyon YOK (bugün canlı veritabanında ÖLÇÜLEN olgu:
    // SIFIR). Boş dizi burada da "kural hiç bakmadı" DEMEK DEĞİLDİR —
    // aşağıdaki `UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE` fixture'ı kuralın
    // GERÇEKTEN değerlendirildiğini kanıtlar.
    functionPrivileges: [],
    // FIX turu 3 (security Tur 3 [medium] S-15), Kaynak E'nin hibe ekseni —
    // sağlıklı tabanda fonksiyon YOK, dolayısıyla hibe satırı da YOK.
    functionExecuteGrantees: [],
  }
}

/** `TENANT_ISOLATION_RULES`'ın HER üyesinin en az bir fixture'da üretildiğini mekanik olarak kaydeder (R-PM7). */
const observedRules = new Set<TenantIsolationRule>()

/** `lintCatalog`'u çağırır VE üretilen kuralları `observedRules`'a kaydeder — bu dosyadaki TEK çağrı noktası. */
function lint(snapshot: CatalogSnapshot, options: LintCatalogOptions): readonly LintFinding[] {
  const findings = lintCatalog(snapshot, options)
  for (const finding of findings) {
    observedRules.add(finding.rule)
  }
  return findings
}

/** Verilen kuralı taşıyan bulguları döner. */
function findingsOf(
  findings: readonly LintFinding[],
  rule: TenantIsolationRule,
): readonly LintFinding[] {
  return findings.filter((finding) => finding.rule === rule)
}

describe('catalog-lint — sağlıklı durum', () => {
  it('taban anlık görüntü hiçbir bulgu üretmez', () => {
    expect(lint(healthySnapshot(), BASE_OPTIONS)).toEqual([])
  })
})

describe('catalog-lint — taksonomi→katalog (FIX turu 1 güncellendi)', () => {
  it('MISSING_TABLE: taksonomideki tenant-scoped tablo katalogda yok', () => {
    const snapshot = healthySnapshot()
    const withoutTable: CatalogSnapshot = {
      ...snapshot,
      tables: snapshot.tables.filter((table) => table.tableName !== 'tenant_membership'),
    }
    const findings = lint(withoutTable, BASE_OPTIONS)
    expect(findingsOf(findings, 'MISSING_TABLE')).toEqual([
      expect.objectContaining({ rule: 'MISSING_TABLE', tableName: 'tenant_membership' }),
    ])
  })

  it('MISSING_TENANT_ID_COLUMN: tablo var ama tenant_id kolonu yok', () => {
    const snapshot = healthySnapshot()
    const withoutColumn: CatalogSnapshot = {
      ...snapshot,
      columns: snapshot.columns.filter(
        (column) =>
          !(column.tableName === 'tenant_membership' && column.columnName === 'tenant_id'),
      ),
    }
    const findings = lint(withoutColumn, BASE_OPTIONS)
    expect(findingsOf(findings, 'MISSING_TENANT_ID_COLUMN')).toHaveLength(1)
  })

  it('NULLABLE_TENANT_ID_COLUMN: tenant_id NULL kabul ediyor', () => {
    const snapshot = healthySnapshot()
    const nullable: CatalogSnapshot = {
      ...snapshot,
      columns: snapshot.columns.map((column) =>
        column.tableName === 'tenant_membership' && column.columnName === 'tenant_id'
          ? { ...column, isNullable: true }
          : column,
      ),
    }
    const findings = lint(nullable, BASE_OPTIONS)
    expect(findingsOf(findings, 'NULLABLE_TENANT_ID_COLUMN')).toHaveLength(1)
  })

  it('WRONG_TENANT_ID_TYPE: tenant_id text değil', () => {
    const snapshot = healthySnapshot()
    const wrongType: CatalogSnapshot = {
      ...snapshot,
      columns: snapshot.columns.map((column) =>
        column.tableName === 'tenant_membership' && column.columnName === 'tenant_id'
          ? { ...column, dataType: 'uuid' }
          : column,
      ),
    }
    const findings = lint(wrongType, BASE_OPTIONS)
    expect(findingsOf(findings, 'WRONG_TENANT_ID_TYPE')).toHaveLength(1)
  })

  it('MISSING_TENANT_ID_LEADING_INDEX: hiçbir indeksin öncü kolonu tenant_id değil', () => {
    const snapshot = healthySnapshot()
    const withoutLeadingIndex: CatalogSnapshot = {
      ...snapshot,
      indexes: snapshot.indexes.map((index) =>
        index.tableName === 'tenant_membership' ? { ...index, columns: ['user_id'] } : index,
      ),
    }
    const findings = lint(withoutLeadingIndex, BASE_OPTIONS)
    expect(findingsOf(findings, 'MISSING_TENANT_ID_LEADING_INDEX')).toHaveLength(1)
  })

  it('RLS_NOT_ENABLED: relrowsecurity false', () => {
    const snapshot = healthySnapshot()
    const disabled: CatalogSnapshot = {
      ...snapshot,
      rowSecurity: snapshot.rowSecurity.map((row) => ({
        ...row,
        isRowSecurityEnabled: false,
        isRowSecurityForced: false,
      })),
    }
    const findings = lint(disabled, BASE_OPTIONS)
    expect(findingsOf(findings, 'RLS_NOT_ENABLED')).toHaveLength(1)
    expect(findingsOf(findings, 'RLS_NOT_FORCED')).toHaveLength(0)
  })

  it('RLS_NOT_FORCED: ENABLE var FORCE yok (AC3 vaka a) — RLS_NOT_ENABLED İLE AYNI ANDA TETİKLENMEZ', () => {
    const snapshot = healthySnapshot()
    const notForced: CatalogSnapshot = {
      ...snapshot,
      rowSecurity: snapshot.rowSecurity.map((row) => ({ ...row, isRowSecurityForced: false })),
    }
    const findings = lint(notForced, BASE_OPTIONS)
    expect(findingsOf(findings, 'RLS_NOT_FORCED')).toHaveLength(1)
    expect(findingsOf(findings, 'RLS_NOT_ENABLED')).toHaveLength(0)
  })

  it('MISSING_TENANT_POLICY: politika hiç yok (AC3 vaka b)', () => {
    const snapshot = healthySnapshot()
    const withoutPolicy: CatalogSnapshot = { ...snapshot, policies: [] }
    const findings = lint(withoutPolicy, BASE_OPTIONS)
    expect(findingsOf(findings, 'MISSING_TENANT_POLICY')).toHaveLength(1)
  })

  it('POLICY_MISSING_WITH_CHECK: politika var ama WITH CHECK yok', () => {
    const snapshot = healthySnapshot()
    const withoutCheck: CatalogSnapshot = {
      ...snapshot,
      policies: snapshot.policies.map((policy) => ({ ...policy, withCheckExpression: null })),
    }
    const findings = lint(withoutCheck, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_MISSING_WITH_CHECK')).toHaveLength(1)
  })

  it('POLICY_USING_NOT_CANONICAL: USING başka bir GUC okuyor (WITH CHECK doğru)', () => {
    const snapshot = healthySnapshot()
    const wrongUsing: CatalogSnapshot = {
      ...snapshot,
      policies: snapshot.policies.map((policy) => ({
        ...policy,
        usingExpression: "(tenant_id = current_setting('app.other_setting'::text, true))",
      })),
    }
    const findings = lint(wrongUsing, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_USING_NOT_CANONICAL')).toHaveLength(1)
    expect(findingsOf(findings, 'POLICY_WITH_CHECK_NOT_CANONICAL')).toHaveLength(0)
  })

  // FIX turu 1 — bu test solid/security Tur 1 [high] bulgusunun BİREBİR
  // tekrarıdır: USING doğru GUC'u okur, WITH CHECK `(true)`dur (çapraz
  // tenant YAZMA açık). Eski `||` birleşimi bunu TÜM kuralların
  // TAMAMINDAN GEÇİRİYORDU (`[]` dönüyordu) — artık
  // `POLICY_WITH_CHECK_NOT_CANONICAL` ile YAKALANIYOR.
  it('POLICY_WITH_CHECK_NOT_CANONICAL: WITH CHECK (true) — ÇAPRAZ TENANT YAZMA deliği (FIX turu 1)', () => {
    const snapshot = healthySnapshot()
    const withCheckTrue: CatalogSnapshot = {
      ...snapshot,
      policies: snapshot.policies.map((policy) => ({
        ...policy,
        withCheckExpression: '(true)',
      })),
    }
    const findings = lint(withCheckTrue, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_WITH_CHECK_NOT_CANONICAL')).toHaveLength(1)
    expect(findingsOf(findings, 'POLICY_USING_NOT_CANONICAL')).toHaveLength(0)
    expect(findingsOf(findings, 'POLICY_MISSING_WITH_CHECK')).toHaveLength(0)
  })

  it('POLICY_WITH_CHECK_NOT_CANONICAL WITH CHECK eksikken İKİNCİ KEZ düşmez (POLICY_MISSING_WITH_CHECK yeterli)', () => {
    const snapshot = healthySnapshot()
    const withoutCheck: CatalogSnapshot = {
      ...snapshot,
      policies: snapshot.policies.map((policy) => ({ ...policy, withCheckExpression: null })),
    }
    const findings = lint(withoutCheck, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_MISSING_WITH_CHECK')).toHaveLength(1)
    expect(findingsOf(findings, 'POLICY_WITH_CHECK_NOT_CANONICAL')).toHaveLength(0)
  })

  // K-E5 REVİZYONU (FIX turu 2) — solid/security Tur 2 bulgusu: eski alt dize
  // kontrolü (`expressionReferencesSetting`, SİLİNDİ) yalnızca "GUC'u okuyor
  // mu" sorusunu yanıtlıyordu, "tenant_id'yi GUC'a EŞİTLİYOR mu" sorusunu
  // YANITLAMIYORDU. ALTI vaka (aşağıdaki ilk altı test) + kalıp-tabanlı bir
  // ara çözümün DE atlatılabileceğini gösteren İKİ EK vaka (`NOT (…)`,
  // `(…) IS NOT TRUE` — son iki test, KALICI REGRESYON PİNİ).
  describe.each([
    {
      label:
        'vaka 1: WITH CHECK (current_setting(GUC) IS NOT NULL) — ayarlanmış mı sorusu, EŞİTLİK değil',
      expression: `(current_setting('${TENANT_CONTEXT_SETTING}'::text, true) IS NOT NULL)`,
    },
    {
      label:
        'vaka 3: WITH CHECK (tenant_id <> current_setting(GUC)) — EŞİTSİZLİK, çapraz tenant yazmaya izin verir',
      expression: `(tenant_id <> current_setting('${TENANT_CONTEXT_SETTING}'::text, true))`,
    },
    {
      label:
        'vaka 4: WITH CHECK (true OR tenant_id = current_setting(GUC)) — üst seviye OR, kanonik yüklem anlamsızlaşır',
      expression: `(true OR (tenant_id = current_setting('${TENANT_CONTEXT_SETTING}'::text, true)))`,
    },
    {
      label:
        'vaka 5: WITH CHECK (user_id = current_setting(GUC)) — YANLIŞ KOLON, kopyala-yapıştır hatası',
      expression: `(user_id = current_setting('${TENANT_CONTEXT_SETTING}'::text, true))`,
    },
    {
      label: 'vaka 6: WITH CHECK (BAŞKA GUC) /* yorumda doğru GUC */ — yüklem yanlış ayarı okur',
      expression: `(tenant_id = current_setting('app.other_setting'::text, true)) -- app.tenant_id`,
    },
    {
      label:
        'reddedilen kalıp önerisinin atlatması 1/2: WITH CHECK (NOT (tenant_id = current_setting(GUC))) — anlam TERSİNE ÇEVRİLMİŞ, kalıcı regresyon pini',
      expression: `(NOT (tenant_id = current_setting('${TENANT_CONTEXT_SETTING}'::text, true)))`,
    },
    {
      label:
        'reddedilen kalıp önerisinin atlatması 2/2: WITH CHECK ((tenant_id = current_setting(GUC)) IS NOT TRUE) — anlam TERSİNE ÇEVRİLMİŞ, kalıcı regresyon pini',
      expression: `((tenant_id = current_setting('${TENANT_CONTEXT_SETTING}'::text, true)) IS NOT TRUE)`,
    },
  ])('$label', ({ expression }) => {
    it('POLICY_WITH_CHECK_NOT_CANONICAL üretir (sağlıklı taban TEMİZ kalır)', () => {
      const snapshot = healthySnapshot()
      const mutated: CatalogSnapshot = {
        ...snapshot,
        policies: snapshot.policies.map((policy) => ({
          ...policy,
          withCheckExpression: expression,
        })),
      }
      const findings = lint(mutated, BASE_OPTIONS)
      expect(findingsOf(findings, 'POLICY_WITH_CHECK_NOT_CANONICAL')).toHaveLength(1)
    })
  })

  // vaka 2 (K-E5'in altı vakasının İKİNCİSİ) — OKUMA tarafı: aynı kalıp
  // `USING` yüklemine uygulanır.
  it('vaka 2: USING (current_setting(GUC) IS NOT NULL) — okuma tarafı, POLICY_USING_NOT_CANONICAL üretir', () => {
    const snapshot = healthySnapshot()
    const mutated: CatalogSnapshot = {
      ...snapshot,
      policies: snapshot.policies.map((policy) => ({
        ...policy,
        usingExpression: `(current_setting('${TENANT_CONTEXT_SETTING}'::text, true) IS NOT NULL)`,
      })),
    }
    const findings = lint(mutated, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_USING_NOT_CANONICAL')).toHaveLength(1)
    expect(findingsOf(findings, 'POLICY_WITH_CHECK_NOT_CANONICAL')).toHaveLength(0)
  })

  it('K-E5 madde 6: ikinci (byte-birebir kanonik) PERMISSIVE politika BİLE "tam olarak bir politika" kısıtını ihlal eder', () => {
    const snapshot = healthySnapshot()
    const basePolicy = snapshot.policies[0]
    if (basePolicy === undefined) {
      throw new Error('healthySnapshot() boş "policies" döndürdü — fixture bozuk.')
    }
    const duplicated: CatalogSnapshot = {
      ...snapshot,
      policies: [
        ...snapshot.policies,
        { ...basePolicy, policyName: 'tenant_membership_tenant_isolation_duplicate' },
      ],
    }
    const findings = lint(duplicated, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_USING_NOT_CANONICAL')).toHaveLength(2)
    expect(findingsOf(findings, 'POLICY_WITH_CHECK_NOT_CANONICAL')).toHaveLength(2)
  })

  it('POLICY_RESTRICTED_TO_ROLE: politika TO ile belirli bir role kısıtlanmış (K-E2.1 ihlali)', () => {
    const snapshot = healthySnapshot()
    const restrictedToRole: CatalogSnapshot = {
      ...snapshot,
      policies: snapshot.policies.map((policy) => ({ ...policy, roles: [APP_ROLE_NAME] })),
    }
    const findings = lint(restrictedToRole, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_RESTRICTED_TO_ROLE')).toHaveLength(1)
  })

  it('APP_ROLE_MISSING_DML_PRIVILEGE: app rolü UPDATE yetkisine sahip değil', () => {
    const snapshot = healthySnapshot()
    const missingPrivilege: CatalogSnapshot = {
      ...snapshot,
      privileges: snapshot.privileges.map((privilege) =>
        privilege.roleName === APP_ROLE_NAME && privilege.tableName === 'tenant_membership'
          ? { ...privilege, canUpdate: false }
          : privilege,
      ),
    }
    const findings = lint(missingPrivilege, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_MISSING_DML_PRIVILEGE')).toHaveLength(1)
  })

  it('APP_ROLE_MISSING_DML_PRIVILEGE: kolon seviyesi hibe taşıyan (columnGrants dolu) bir tabloda TETİKLENMEZ — ST-D sonrası regresyon koruması', () => {
    // T-015/ST-C'nin "tadil" kararının pozitif kanıtı: `account` sağlıklı
    // tabanda `arkesoft_app` için SIFIR yetki taşıyor AMA `columnGrants`
    // dolu olduğu için bu eski kural (yeni kurallar DEĞİL) onu artık
    // DEĞERLENDİRMEZ — aksi hâlde ST-D'nin DDL'i uygulandığı AN bu eski
    // kural `account`/`session`/`verification` için YANLIŞ POZİTİF üretirdi.
    const findings = lint(healthySnapshot(), BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_MISSING_DML_PRIVILEGE')).toHaveLength(0)
  })

  it('APP_ROLE_MISSING_DML_PRIVILEGE: columnGrants BOŞKEN (ST-D öncesi taban) eski davranış KORUNUR', () => {
    const snapshot = healthySnapshot()
    const secretTableNames = new Set<string>(SECRET_TABLE_NAMES)
    const preStD: CatalogSnapshot = {
      ...snapshot,
      // ST-D öncesi: kolon hibesi yok, `arkesoft_app` hâlâ tam DML taşıyor
      // (blanket grant henüz REVOKE edilmemiş) — ST-B'nin ölçtüğü taban.
      columnGrants: [],
      privileges: snapshot.privileges.map((privilege) =>
        privilege.roleName === APP_ROLE_NAME && secretTableNames.has(privilege.tableName)
          ? { ...privilege, canSelect: true, canInsert: true, canUpdate: true, canDelete: true }
          : privilege,
      ),
    }
    const findings = lint(preStD, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_MISSING_DML_PRIVILEGE')).toHaveLength(0)
  })
})

describe('catalog-lint — platform tabloları da MISSING_TABLE öznesi (T-015/ST-C, architect bulgusu)', () => {
  it('"session" taksonomide platformLevelTables altında listelenmiş ama katalogdan TAMAMEN kaybolmuş — artık SESSİZ KALMAZ', () => {
    const snapshot = healthySnapshot()
    const withoutSessionTable: CatalogSnapshot = {
      ...snapshot,
      tables: snapshot.tables.filter((table) => table.tableName !== 'session'),
      columns: snapshot.columns.filter((column) => column.tableName !== 'session'),
      privileges: snapshot.privileges.filter((privilege) => privilege.tableName !== 'session'),
      columnPrivileges: snapshot.columnPrivileges.filter(
        (privilege) => privilege.tableName !== 'session',
      ),
      columnGrants: snapshot.columnGrants.filter((grant) => grant.tableName !== 'session'),
      tableGrants: snapshot.tableGrants.filter((grant) => grant.tableName !== 'session'),
    }
    const findings = lint(withoutSessionTable, BASE_OPTIONS)
    expect(findingsOf(findings, 'MISSING_TABLE')).toEqual([
      expect.objectContaining({ rule: 'MISSING_TABLE', tableName: 'session' }),
    ])
  })
})

describe('catalog-lint — katalog→taksonomi (3 kural)', () => {
  it('UNCLASSIFIED_TABLE: katalogda olan ama taksonomide olmayan tablo (_prisma_migrations MUAF)', () => {
    const snapshot = healthySnapshot()
    const withExtraTable: CatalogSnapshot = {
      ...snapshot,
      tables: [...snapshot.tables, { tableName: 'orphan_table', tableOwner: MIGRATOR_ROLE_NAME }],
    }
    const findings = lint(withExtraTable, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNCLASSIFIED_TABLE')).toEqual([
      expect.objectContaining({ rule: 'UNCLASSIFIED_TABLE', tableName: 'orphan_table' }),
    ])
  })

  it('TENANT_ID_ON_PLATFORM_TABLE: platform tablosu tenant_id taşıyor', () => {
    const snapshot = healthySnapshot()
    const contaminated: CatalogSnapshot = {
      ...snapshot,
      columns: [
        ...snapshot.columns,
        { tableName: 'tenant', columnName: 'tenant_id', dataType: 'text', isNullable: false },
      ],
    }
    const findings = lint(contaminated, BASE_OPTIONS)
    expect(findingsOf(findings, 'TENANT_ID_ON_PLATFORM_TABLE')).toEqual([
      expect.objectContaining({ rule: 'TENANT_ID_ON_PLATFORM_TABLE', tableName: 'tenant' }),
    ])
  })

  it('TENANT_ID_WITHOUT_TAXONOMY_ENTRY: sınıflandırılmamış tabloda tenant_id var (R-C2)', () => {
    const snapshot = healthySnapshot()
    const withUntrackedTenantTable: CatalogSnapshot = {
      ...snapshot,
      tables: [
        ...snapshot.tables,
        { tableName: 'shadow_tenant_table', tableOwner: MIGRATOR_ROLE_NAME },
      ],
      columns: [
        ...snapshot.columns,
        {
          tableName: 'shadow_tenant_table',
          columnName: 'tenant_id',
          dataType: 'text',
          isNullable: false,
        },
      ],
    }
    const findings = lint(withUntrackedTenantTable, BASE_OPTIONS)
    expect(findingsOf(findings, 'TENANT_ID_WITHOUT_TAXONOMY_ENTRY')).toEqual([
      expect.objectContaining({
        rule: 'TENANT_ID_WITHOUT_TAXONOMY_ENTRY',
        tableName: 'shadow_tenant_table',
      }),
    ])
    // Aynı tablo taksonomide YOK olduğu için ayrıca UNCLASSIFIED_TABLE de düşer — bu İKİSİ BİRLİKTE beklenir.
    expect(findingsOf(findings, 'UNCLASSIFIED_TABLE')).toEqual([
      expect.objectContaining({ rule: 'UNCLASSIFIED_TABLE', tableName: 'shadow_tenant_table' }),
    ])
  })
})

describe('catalog-lint — rol nitelikleri (T-015/ST-C: özne İKİ çalışma zamanı rolüne genişledi)', () => {
  it('APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS: arkesoft_app rolbypassrls açık', () => {
    const snapshot = healthySnapshot()
    const bypassing: CatalogSnapshot = {
      ...snapshot,
      roles: snapshot.roles.map((role) =>
        role.roleName === APP_ROLE_NAME ? { ...role, canBypassRls: true } : role,
      ),
    }
    const findings = lint(bypassing, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS')).toEqual([
      expect.objectContaining({ rule: 'APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS' }),
    ])
  })

  it('APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS: arkesoft_app rolsuper açık', () => {
    const snapshot = healthySnapshot()
    const superuser: CatalogSnapshot = {
      ...snapshot,
      roles: snapshot.roles.map((role) =>
        role.roleName === APP_ROLE_NAME ? { ...role, isSuperuser: true } : role,
      ),
    }
    const findings = lint(superuser, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS')).toHaveLength(1)
  })

  it('APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS: ÖZNE GENİŞLEMESİNİN KANITI — arkesoft_auth rolbypassrls açık olunca DA düşer', () => {
    const snapshot = healthySnapshot()
    const authBypassing: CatalogSnapshot = {
      ...snapshot,
      roles: snapshot.roles.map((role) =>
        role.roleName === AUTH_ROLE_NAME ? { ...role, canBypassRls: true } : role,
      ),
    }
    const findings = lint(authBypassing, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS')).toHaveLength(1)
  })

  it('APP_ROLE_OWNS_TABLE: arkesoft_app bir tablonun sahibi', () => {
    const snapshot = healthySnapshot()
    const ownsTable: CatalogSnapshot = {
      ...snapshot,
      tables: snapshot.tables.map((table) =>
        table.tableName === 'tenant_membership' ? { ...table, tableOwner: APP_ROLE_NAME } : table,
      ),
    }
    const findings = lint(ownsTable, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_OWNS_TABLE')).toEqual([
      expect.objectContaining({ rule: 'APP_ROLE_OWNS_TABLE', tableName: 'tenant_membership' }),
    ])
  })

  it('APP_ROLE_OWNS_TABLE: ÖZNE GENİŞLEMESİNİN KANITI — arkesoft_auth bir tablonun sahibi olunca DA düşer', () => {
    const snapshot = healthySnapshot()
    const authOwnsTable: CatalogSnapshot = {
      ...snapshot,
      tables: snapshot.tables.map((table) =>
        table.tableName === 'account' ? { ...table, tableOwner: AUTH_ROLE_NAME } : table,
      ),
    }
    const findings = lint(authOwnsTable, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_OWNS_TABLE')).toEqual([
      expect.objectContaining({ rule: 'APP_ROLE_OWNS_TABLE', tableName: 'account' }),
    ])
  })

  it.each([APP_ROLE_NAME, AUTH_ROLE_NAME])(
    'ROLE_HAS_EXCESS_ATTRIBUTE: "%s" rolü CREATEDB taşıyorsa düşer (öznesi iki çalışma zamanı rolü, migrator DEĞİL)',
    (roleName) => {
      const snapshot = healthySnapshot()
      const withCreateDb: CatalogSnapshot = {
        ...snapshot,
        roles: snapshot.roles.map((role) =>
          role.roleName === roleName ? { ...role, canCreateDb: true } : role,
        ),
      }
      const findings = lint(withCreateDb, BASE_OPTIONS)
      expect(findingsOf(findings, 'ROLE_HAS_EXCESS_ATTRIBUTE')).toEqual([
        expect.objectContaining({ rule: 'ROLE_HAS_EXCESS_ATTRIBUTE' }),
      ])
    },
  )

  it('ROLE_HAS_EXCESS_ATTRIBUTE: taban anlık görüntü (ikisi de canCreateDb=false) hiçbir bulgu üretmez', () => {
    const findings = lint(healthySnapshot(), BASE_OPTIONS)
    expect(findingsOf(findings, 'ROLE_HAS_EXCESS_ATTRIBUTE')).toHaveLength(0)
  })
})

// FIX turu 2, B3 (qa/solid Tur 2 [low] BAĞIMSIZ bulgu) — `bootstrap-roles.sql`
// bölüm 4'ün blanket GRANT/ALTER DEFAULT PRIVILEGES'i `_prisma_migrations`'ı
// da kapsıyordu; "fazla yetki" sorusunu soran HİÇBİR kural yoktu. Üç negatif
// fixture (INSERT/UPDATE/DELETE'in HER biri ayrı ayrı) + taban temiz kalır.
describe('catalog-lint — platform/ledger (1 kural, YENİ — B3)', () => {
  it.each([
    ['canInsert', { canInsert: true }],
    ['canUpdate', { canUpdate: true }],
    ['canDelete', { canDelete: true }],
  ] as const)(
    'APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE: "_prisma_migrations" üzerinde %s=true',
    (_label, override) => {
      const snapshot = healthySnapshot()
      const excessPrivilege: CatalogSnapshot = {
        ...snapshot,
        privileges: snapshot.privileges.map((privilege) =>
          privilege.tableName === '_prisma_migrations' ? { ...privilege, ...override } : privilege,
        ),
      }
      const findings = lint(excessPrivilege, BASE_OPTIONS)
      expect(findingsOf(findings, 'APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE')).toHaveLength(1)
    },
  )

  it('taban anlık görüntü (SELECT dışı hepsi false) hiçbir bulgu üretmez', () => {
    const findings = lint(healthySnapshot(), BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE')).toHaveLength(0)
  })

  it('"_prisma_migrations" katalogda hiç yoksa (örn. bootstrap-only anlık görüntü) sessizce atlanır', () => {
    const snapshot = healthySnapshot()
    const withoutLedger: CatalogSnapshot = {
      ...snapshot,
      privileges: snapshot.privileges.filter(
        (privilege) => privilege.tableName !== '_prisma_migrations',
      ),
    }
    const findings = lint(withoutLedger, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE')).toHaveLength(0)
  })
})

// T-015/ST-C — YEDİ YENİ KURAL (ADR-0008 borcu). α/β/γ/δ etiketleri
// architect'in "Dört yakın-miss senaryosu" tablosunu birebir izler.
describe('catalog-lint — auth rolü / sır taşıyan tablo yetkisi (T-015/ST-C, YENİ)', () => {
  it('APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE: arkesoft_app sır taşıyan tabloda HÂLÂ bir yetkiye sahip', () => {
    const snapshot = healthySnapshot()
    const retained: CatalogSnapshot = {
      ...snapshot,
      privileges: snapshot.privileges.map((privilege) =>
        privilege.roleName === APP_ROLE_NAME && privilege.tableName === 'account'
          ? { ...privilege, canSelect: true }
          : privilege,
      ),
    }
    const findings = lint(retained, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE')).toEqual([
      expect.objectContaining({
        rule: 'APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE',
        tableName: 'account',
      }),
    ])
  })

  it('α — AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE: arkesoft_auth TABLO bazlı SELECT taşıyor (anti-vacuity bekçisi, naif kuralın sessiz kaldığı tam nokta)', () => {
    const snapshot = healthySnapshot()
    const tableLevel: CatalogSnapshot = {
      ...snapshot,
      columnPrivileges: snapshot.columnPrivileges.map((privilege) =>
        privilege.tableName === 'account' && privilege.columnName === 'password'
          ? { ...privilege, hasTableSelect: true }
          : privilege,
      ),
    }
    const findings = lint(tableLevel, BASE_OPTIONS)
    // Tablo başına TEK bulgu — kolon sayısı kadar TEKRARLANMAZ.
    expect(findingsOf(findings, 'AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE')).toEqual([
      expect.objectContaining({
        rule: 'AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE',
        tableName: 'account',
      }),
    ])
    // Tablo seviyesi bulgu düştüğü için AYNI kolon için AUTH_ROLE_MISSING_
    // COLUMN_PRIVILEGE İKİNCİ KEZ düşmez (K-E5 madde 4 — "eksik" ile "yanlış
    // seviyede" AYRI sorular, aynı anda İKİSİ de sorulmaz).
    expect(findingsOf(findings, 'AUTH_ROLE_MISSING_COLUMN_PRIVILEGE')).toHaveLength(0)
  })

  it('β — sağlıklı durum: kolon var/tablo yok (columnOnly=true) hiçbir bulgu üretmez', () => {
    // healthySnapshot()'ın KENDİSİ β'yı tüm sır taşıyan kolonlar için modeller
    // — bu test onu AÇIKÇA isimlendirip izole eder (DoD'un "β için ayrı
    // fixture" gereksinimi).
    const findings = lint(healthySnapshot(), BASE_OPTIONS)
    expect(findingsOf(findings, 'AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE')).toHaveLength(0)
    expect(findingsOf(findings, 'AUTH_ROLE_MISSING_COLUMN_PRIVILEGE')).toHaveLength(0)
  })

  it('δ — AUTH_ROLE_MISSING_COLUMN_PRIVILEGE: üç kolondan yalnızca biri (account.email) hibesiz, mesaj tablo VE kolon adını taşır', () => {
    const snapshot = healthySnapshot()
    const partialColumnGrant: CatalogSnapshot = {
      ...snapshot,
      columnPrivileges: snapshot.columnPrivileges.map((privilege) =>
        privilege.tableName === 'account' && privilege.columnName === 'email'
          ? {
              ...privilege,
              hasColumnSelect: false,
              hasColumnInsert: false,
              hasColumnUpdate: false,
            }
          : privilege,
      ),
    }
    const findings = lint(partialColumnGrant, BASE_OPTIONS)
    const missingColumnFindings = findingsOf(findings, 'AUTH_ROLE_MISSING_COLUMN_PRIVILEGE')
    expect(missingColumnFindings).toEqual([
      expect.objectContaining({
        rule: 'AUTH_ROLE_MISSING_COLUMN_PRIVILEGE',
        tableName: 'account',
      }),
    ])
    expect(missingColumnFindings[0]?.message).toContain('account')
    expect(missingColumnFindings[0]?.message).toContain('email')
    // Diğer iki kolon (id, password) hâlâ sağlıklı — AYRI bir bulgu üretmez.
    expect(findingsOf(findings, 'AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE')).toHaveLength(0)
  })

  it('γ — UNEXPECTED_COLUMN_LEVEL_GRANTEE: kolon hibesi adlandırılmış ÜÇÜNCÜ bir role verilmiş', () => {
    const snapshot = healthySnapshot()
    const thirdPartyGrant: CatalogSnapshot = {
      ...snapshot,
      columnGrants: snapshot.columnGrants.map((grant) =>
        grant.tableName === 'session' && grant.columnName === 'token'
          ? { ...grant, grantee: THIRD_PARTY_ROLE_NAME }
          : grant,
      ),
    }
    const findings = lint(thirdPartyGrant, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNEXPECTED_COLUMN_LEVEL_GRANTEE')).toEqual([
      expect.objectContaining({
        rule: 'UNEXPECTED_COLUMN_LEVEL_GRANTEE',
        tableName: 'session',
      }),
    ])
  })

  it('γ (PUBLIC varyantı): "-" (tire, PUBLIC hibesi) de beklenmeyen alıcı sayılır', () => {
    const snapshot = healthySnapshot()
    const publicGrant: CatalogSnapshot = {
      ...snapshot,
      columnGrants: snapshot.columnGrants.map((grant) =>
        grant.tableName === 'verification' && grant.columnName === 'value'
          ? { ...grant, grantee: '-' }
          : grant,
      ),
    }
    const findings = lint(publicGrant, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNEXPECTED_COLUMN_LEVEL_GRANTEE')).toEqual([
      expect.objectContaining({
        rule: 'UNEXPECTED_COLUMN_LEVEL_GRANTEE',
        tableName: 'verification',
      }),
    ])
  })

  // FIX turu 1 (security Tur 1 [medium] S-1 bulgusu), YENİ — Kaynak C
  // (`tableGrants`, `pg_class.relacl`). M1'in BİREBİR reprodüksiyonu: tablo
  // seviyesinde adlandırılmış bir ÜÇÜNCÜ role (örn. "bi_reader" tipi bir
  // raporlama rolü — burada THIRD_PARTY_ROLE_NAME) `SELECT` verilmesi, HİÇBİR
  // appRoleName/authRoleName tabanlı kural tarafından GÖRÜLMEZ (Kaynak A iki
  // adlandırılmış rolü sorgular, Kaynak B yalnızca KOLON seviyesini görür).
  it('UNEXPECTED_TABLE_LEVEL_GRANTEE: tablo seviyesinde adlandırılmış ÜÇÜNCÜ bir role hibe verilmiş (M1 reprodüksiyonu)', () => {
    const snapshot = healthySnapshot()
    const thirdPartyTableGrant: CatalogSnapshot = {
      ...snapshot,
      tableGrants: [
        ...snapshot.tableGrants,
        {
          tableName: 'account',
          grantor: MIGRATOR_ROLE_NAME,
          grantee: THIRD_PARTY_ROLE_NAME,
          privilegeType: 'SELECT',
          isGrantable: false,
        },
      ],
    }
    const findings = lint(thirdPartyTableGrant, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNEXPECTED_TABLE_LEVEL_GRANTEE')).toEqual([
      expect.objectContaining({
        rule: 'UNEXPECTED_TABLE_LEVEL_GRANTEE',
        tableName: 'account',
      }),
    ])
  })

  // YANLIŞ POZİTİF KONTROLÜ (R-PO6'nın AYNI deseni, S-1'in bağlayıcı kısıtı):
  // `relacl`de tablo SAHİBİ `grantee` olarak GÖRÜNÜR (ST-A0③'ün `attacl`
  // ölçümünün TERSİ, dosya başı notu) — beklenen küme `table.tableOwner`ı
  // İÇERMEZSE bu kural sağlıklı tabanda KALICI yanlış pozitif verirdi.
  it('UNEXPECTED_TABLE_LEVEL_GRANTEE: tablo SAHİBİNE (arkesoft_migrator) verilen hibe YANLIŞ POZİTİF ÜRETMEZ', () => {
    const snapshot = healthySnapshot()
    const ownerTableGrant: CatalogSnapshot = {
      ...snapshot,
      tableGrants: [
        ...snapshot.tableGrants,
        {
          tableName: 'account',
          grantor: MIGRATOR_ROLE_NAME,
          grantee: MIGRATOR_ROLE_NAME,
          privilegeType: 'SELECT',
          isGrantable: false,
        },
      ],
    }
    const findings = lint(ownerTableGrant, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNEXPECTED_TABLE_LEVEL_GRANTEE')).toHaveLength(0)
  })

  // S-4 (solid Tur 1 [low] bulgusu) — `isGrantable` iki kaynakta da (Kaynak B
  // KOLON, Kaynak C TABLO) artık OKUNUYOR: `WITH GRANT OPTION` DOĞRU alıcıya
  // verilmiş olsa bile kendisi bir bulgu üretir.
  it('UNEXPECTED_COLUMN_LEVEL_GRANTEE: arkesoft_auth için WITH GRANT OPTION (isGrantable=true) — alıcı DOĞRU ama GRANT OPTION beklenmiyor (S-4)', () => {
    const snapshot = healthySnapshot()
    const grantOptionColumn: CatalogSnapshot = {
      ...snapshot,
      columnGrants: snapshot.columnGrants.map((grant) =>
        grant.tableName === 'account' && grant.columnName === 'password'
          ? { ...grant, isGrantable: true }
          : grant,
      ),
    }
    const findings = lint(grantOptionColumn, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNEXPECTED_COLUMN_LEVEL_GRANTEE')).toEqual([
      expect.objectContaining({ rule: 'UNEXPECTED_COLUMN_LEVEL_GRANTEE', tableName: 'account' }),
    ])
  })

  it('UNEXPECTED_TABLE_LEVEL_GRANTEE: arkesoft_auth için WITH GRANT OPTION (isGrantable=true) — alıcı DOĞRU ama GRANT OPTION beklenmiyor (S-4)', () => {
    const snapshot = healthySnapshot()
    const grantOptionTable: CatalogSnapshot = {
      ...snapshot,
      tableGrants: snapshot.tableGrants.map((grant) =>
        grant.tableName === 'account' && grant.grantee === AUTH_ROLE_NAME
          ? { ...grant, isGrantable: true }
          : grant,
      ),
    }
    const findings = lint(grantOptionTable, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNEXPECTED_TABLE_LEVEL_GRANTEE')).toEqual([
      expect.objectContaining({ rule: 'UNEXPECTED_TABLE_LEVEL_GRANTEE', tableName: 'account' }),
    ])
  })

  // FIX turu 2 (security Tur 2 [high] S-7 bulgusu), YENİ — Kaynak D
  // (`unexpectedRelations`, `pg_class.relkind IN ('v','m','f')`). `account`
  // üzerine yazılan sıradan bir view'in M9'un BİREBİR reprodüksiyonu: hiçbir
  // `GRANT` yazılmadan `ALTER DEFAULT PRIVILEGES … ON TABLES` onu
  // `arkesoft_app`'e hibeler, view `snapshot.tables`'TA YOKTUR (`readTables()`
  // `pg_tables`'ı kullanır, `relkind IN ('r','p')`), bu yüzden
  // `UNCLASSIFIED_TABLE` bunu HİÇ görmez — `UNEXPECTED_RELATION_KIND` bu
  // boşluğu KENDİ bağımsız kaynağıyla kapatır.
  it('UNEXPECTED_RELATION_KIND: public şemasında bir VIEW (M9 reprodüksiyonu, snapshot.tables YOK)', () => {
    const snapshot = healthySnapshot()
    const leakingView: CatalogSnapshot = {
      ...snapshot,
      unexpectedRelations: [{ relationName: 'acct_leak_v', relationKind: 'v' }],
    }
    // Anti-vacuity: view `tables` dizisinde YOK — `UNCLASSIFIED_TABLE`/
    // `MISSING_TABLE` onu GÖRMEZ, bu KENDİSİ S-7'nin ölçtüğü boşluktur.
    expect(leakingView.tables.some((table) => table.tableName === 'acct_leak_v')).toBe(false)
    const findings = lint(leakingView, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNEXPECTED_RELATION_KIND')).toEqual([
      expect.objectContaining({ rule: 'UNEXPECTED_RELATION_KIND', tableName: 'acct_leak_v' }),
    ])
    expect(findingsOf(findings, 'UNEXPECTED_RELATION_KIND')[0]?.message).toContain('VIEW')
    expect(findingsOf(findings, 'UNCLASSIFIED_TABLE')).toEqual([])
  })

  // `authRole` kapısının DIŞINDA değerlendirildiğinin kanıtı — `authRole`
  // GEÇİRİLMEDİĞİNDE (dondurulmuş eski çağrı noktası emsali) bile kural
  // ATEŞLENİR.
  it('UNEXPECTED_RELATION_KIND: authRole GEÇİRİLMESE bile (dondurulmuş çağrı noktası emsali) ateşlenir', () => {
    const snapshot = healthySnapshot()
    const leakingMatview: CatalogSnapshot = {
      ...snapshot,
      unexpectedRelations: [{ relationName: 'session_leak_mv', relationKind: 'm' }],
    }
    const optionsWithoutAuthRole: LintCatalogOptions = {
      taxonomy: BASE_OPTIONS.taxonomy,
      tenantContextSetting: BASE_OPTIONS.tenantContextSetting,
      appRoleName: BASE_OPTIONS.appRoleName,
    }
    const findings = lint(leakingMatview, optionsWithoutAuthRole)
    expect(findingsOf(findings, 'UNEXPECTED_RELATION_KIND')).toEqual([
      expect.objectContaining({ rule: 'UNEXPECTED_RELATION_KIND', tableName: 'session_leak_mv' }),
    ])
    expect(findingsOf(findings, 'UNEXPECTED_RELATION_KIND')[0]?.message).toContain(
      'MATERIALIZED VIEW',
    )
  })

  // FIX turu 2 (security Tur 2 [medium] S-8 bulgusu), YENİ — Kaynak E
  // (`functionPrivileges`). M14'ün REPRODÜKSİYONU: `SECURITY DEFINER` bir
  // fonksiyon `proacl=NULL` ile (hiçbir GRANT yazılmadan) PUBLIC'e EXECUTE
  // vermiş durumda.
  it('UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE: PUBLIC bir fonksiyonu yürütebiliyor (M14 reprodüksiyonu)', () => {
    const snapshot = healthySnapshot()
    const leakingFunction: CatalogSnapshot = {
      ...snapshot,
      functionPrivileges: [
        { functionName: 'leak_pw', hasPublicExecute: true, isSecurityDefiner: false },
      ],
    }
    const findings = lint(leakingFunction, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE')).toEqual([
      expect.objectContaining({
        rule: 'UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE',
        tableName: 'leak_pw',
      }),
    ])
    // İKİ YÖNLÜ AYIRT EDİLEBİLİRLİK (FIX turu 3, S-15): `prosecdef=false` +
    // PUBLIC hibesi VAR → YALNIZCA hibe ekseni (eski kod) düşer, YENİ varlık
    // ekseni kodu DÜŞMEZ.
    expect(findingsOf(findings, 'UNEXPECTED_SECURITY_DEFINER_FUNCTION')).toEqual([])
  })

  it('UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE: hasPublicExecute=false YANLIŞ POZİTİF ÜRETMEZ', () => {
    const snapshot = healthySnapshot()
    const safeFunction: CatalogSnapshot = {
      ...snapshot,
      functionPrivileges: [
        { functionName: 'safe_fn', hasPublicExecute: false, isSecurityDefiner: false },
      ],
    }
    const findings = lint(safeFunction, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE')).toEqual([])
  })

  // FIX turu 3 (security Tur 3 [medium] S-15 bulgusu), YENİ — Kaynak E'nin
  // "varlık" ekseni. S-15'in TAM ÖLÇTÜĞÜ kaçışın fixture-seviyesi kanıtı:
  // `REVOKE EXECUTE … FROM PUBLIC` sonrası `hasPublicExecute=false`DIR, AMA
  // `isSecurityDefiner=true` KOŞULSUZ bulgu üretir — hibe ekseni KAPALI
  // olsa bile.
  it('UNEXPECTED_SECURITY_DEFINER_FUNCTION: prosecdef=true + PUBLIC hibesi YOK (S-15 kaçış yolunun fixture kanıtı)', () => {
    const snapshot = healthySnapshot()
    const closedButDefinerFunction: CatalogSnapshot = {
      ...snapshot,
      functionPrivileges: [
        { functionName: '__fix3_probe', hasPublicExecute: false, isSecurityDefiner: true },
      ],
      functionExecuteGrantees: [
        {
          functionName: '__fix3_probe',
          grantor: MIGRATOR_ROLE_NAME,
          grantee: APP_ROLE_NAME,
          privilegeType: 'EXECUTE',
          isGrantable: false,
        },
      ],
    }
    const findings = lint(closedButDefinerFunction, BASE_OPTIONS)
    // İKİ YÖNLÜ AYIRT EDİLEBİLİRLİK: `hasPublicExecute=false` olduğu için
    // hibe ekseni (eski kod) DÜŞMEZ, YALNIZCA yeni varlık ekseni kodu düşer.
    expect(findingsOf(findings, 'UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE')).toEqual([])
    expect(findingsOf(findings, 'UNEXPECTED_SECURITY_DEFINER_FUNCTION')).toEqual([
      expect.objectContaining({
        rule: 'UNEXPECTED_SECURITY_DEFINER_FUNCTION',
        tableName: '__fix3_probe',
      }),
    ])
    const [finding] = findingsOf(findings, 'UNEXPECTED_SECURITY_DEFINER_FUNCTION')
    expect(finding?.message).toContain('__fix3_probe')
    expect(finding?.message).toContain(APP_ROLE_NAME)
  })

  it('UNEXPECTED_SECURITY_DEFINER_FUNCTION: isSecurityDefiner=false YANLIŞ POZİTİF ÜRETMEZ', () => {
    const snapshot = healthySnapshot()
    const invokerFunction: CatalogSnapshot = {
      ...snapshot,
      functionPrivileges: [
        { functionName: 'ordinary_fn', hasPublicExecute: false, isSecurityDefiner: false },
      ],
    }
    const findings = lint(invokerFunction, BASE_OPTIONS)
    expect(findingsOf(findings, 'UNEXPECTED_SECURITY_DEFINER_FUNCTION')).toEqual([])
  })

  it('UNEXPECTED_SECURITY_DEFINER_FUNCTION: authRole GEÇİRİLMESE bile (dondurulmuş çağrı noktası emsali) ateşlenir', () => {
    const snapshot = healthySnapshot()
    const definerFunction: CatalogSnapshot = {
      ...snapshot,
      functionPrivileges: [
        {
          functionName: 'definer_without_auth_gate',
          hasPublicExecute: false,
          isSecurityDefiner: true,
        },
      ],
    }
    const optionsWithoutAuthRole: LintCatalogOptions = {
      taxonomy: BASE_OPTIONS.taxonomy,
      tenantContextSetting: BASE_OPTIONS.tenantContextSetting,
      appRoleName: BASE_OPTIONS.appRoleName,
    }
    const findings = lint(definerFunction, optionsWithoutAuthRole)
    expect(findingsOf(findings, 'UNEXPECTED_SECURITY_DEFINER_FUNCTION')).toEqual([
      expect.objectContaining({
        rule: 'UNEXPECTED_SECURITY_DEFINER_FUNCTION',
        tableName: 'definer_without_auth_gate',
      }),
    ])
  })

  it('AUTH_ROLE_MISSING_TABLE_PRIVILEGE: arkesoft_auth app_user üzerinde TABLO bazlı SELECT taşımıyor', () => {
    const snapshot = healthySnapshot()
    const missingAppUserSelect: CatalogSnapshot = {
      ...snapshot,
      privileges: snapshot.privileges.map((privilege) =>
        privilege.roleName === AUTH_ROLE_NAME && privilege.tableName === 'app_user'
          ? { ...privilege, canSelect: false }
          : privilege,
      ),
    }
    const findings = lint(missingAppUserSelect, BASE_OPTIONS)
    expect(findingsOf(findings, 'AUTH_ROLE_MISSING_TABLE_PRIVILEGE')).toEqual([
      expect.objectContaining({ rule: 'AUTH_ROLE_MISSING_TABLE_PRIVILEGE', tableName: 'app_user' }),
    ])
  })

  it('AUTH_ROLE_MISSING_TABLE_PRIVILEGE: arkesoft_auth sır taşıyan tabloda beklenen TABLO bazlı DELETE yetkisine sahip değil', () => {
    const snapshot = healthySnapshot()
    const missingDelete: CatalogSnapshot = {
      ...snapshot,
      privileges: snapshot.privileges.map((privilege) =>
        privilege.roleName === AUTH_ROLE_NAME && privilege.tableName === 'verification'
          ? { ...privilege, canDelete: false }
          : privilege,
      ),
    }
    const findings = lint(missingDelete, BASE_OPTIONS)
    expect(findingsOf(findings, 'AUTH_ROLE_MISSING_TABLE_PRIVILEGE')).toEqual([
      expect.objectContaining({
        rule: 'AUTH_ROLE_MISSING_TABLE_PRIVILEGE',
        tableName: 'verification',
      }),
    ])
  })

  it('AUTH_ROLE_EXCESS_TABLE_PRIVILEGE: arkesoft_auth app_user üzerinde beklenmeyen DELETE yetkisine sahip (A-N1 ihlali)', () => {
    const snapshot = healthySnapshot()
    const excessDelete: CatalogSnapshot = {
      ...snapshot,
      privileges: snapshot.privileges.map((privilege) =>
        privilege.roleName === AUTH_ROLE_NAME && privilege.tableName === 'app_user'
          ? { ...privilege, canDelete: true }
          : privilege,
      ),
    }
    const findings = lint(excessDelete, BASE_OPTIONS)
    expect(findingsOf(findings, 'AUTH_ROLE_EXCESS_TABLE_PRIVILEGE')).toEqual([
      expect.objectContaining({ rule: 'AUTH_ROLE_EXCESS_TABLE_PRIVILEGE', tableName: 'app_user' }),
    ])
  })

  it('AUTH_ROLE_EXCESS_TABLE_PRIVILEGE: arkesoft_auth beklenti tablosunda OLMAYAN bir tabloda ("tenant") yetki taşıyor', () => {
    const snapshot = healthySnapshot()
    const unexpectedTablePrivilege: CatalogSnapshot = {
      ...snapshot,
      privileges: [
        ...snapshot.privileges,
        {
          roleName: AUTH_ROLE_NAME,
          tableName: 'tenant',
          canSelect: true,
          canInsert: false,
          canUpdate: false,
          canDelete: false,
        },
      ],
    }
    const findings = lint(unexpectedTablePrivilege, BASE_OPTIONS)
    expect(findingsOf(findings, 'AUTH_ROLE_EXCESS_TABLE_PRIVILEGE')).toEqual([
      expect.objectContaining({ rule: 'AUTH_ROLE_EXCESS_TABLE_PRIVILEGE', tableName: 'tenant' }),
    ])
  })
})

describe('catalog-lint — fail-closed (1 kural)', () => {
  it('EMPTY_CATALOG_SNAPSHOT: tables boşsa TEK bulgu döner, başka hiçbir kural değerlendirilmez', () => {
    const empty: CatalogSnapshot = {
      tables: [],
      columns: [],
      rowSecurity: [],
      policies: [],
      indexes: [],
      roles: [
        { roleName: APP_ROLE_NAME, isSuperuser: false, canBypassRls: false, canCreateDb: false },
        { roleName: AUTH_ROLE_NAME, isSuperuser: false, canBypassRls: false, canCreateDb: false },
      ],
      privileges: [],
      columnPrivileges: [],
      columnGrants: [],
      tableGrants: [],
      unexpectedRelations: [],
      functionPrivileges: [],
      functionExecuteGrantees: [],
    }
    const findings = lint(empty, BASE_OPTIONS)
    expect(findings).toEqual([expect.objectContaining({ rule: 'EMPTY_CATALOG_SNAPSHOT' })])
  })
})

describe('catalog-lint — AC9 parametriklik kanıtı (taksonomi değişince kod değişmeden kırmızı)', () => {
  it('taksonomiye katalogda karşılığı olmayan ikinci bir tablo eklenince MISSING_TABLE düşer', () => {
    const optionsWithSecondTable: LintCatalogOptions = {
      ...BASE_OPTIONS,
      taxonomy: {
        ...BASE_OPTIONS.taxonomy,
        tenantScopedTables: [...BASE_OPTIONS.taxonomy.tenantScopedTables, 'future_tenant_table'],
      },
    }
    const findings = lint(healthySnapshot(), optionsWithSecondTable)
    expect(findingsOf(findings, 'MISSING_TABLE')).toEqual([
      expect.objectContaining({ rule: 'MISSING_TABLE', tableName: 'future_tenant_table' }),
    ])
  })
})

// R-PM7'nin yapısal çözümünün MEKANİK doğrulaması: `TENANT_ISOLATION_RULES`
// TEK doğruluk kaynağıdır — bu testin yeşil kalması, dizideki HER kodun bu
// dosyadaki fixture'lardan EN AZ biri tarafından GERÇEKTEN üretildiğini
// (ölü/asla tetiklenmeyen bir kod kalmadığını) VE dizinin eksiksiz
// olduğunu (fixture'ların ürettiği hiçbir kod dizide YOK) kanıtlar. Bu
// `describe` dosyanın EN SONUNDADIR — yukarıdaki TÜM testler `lint()`
// sarmalayıcısı üzerinden `observedRules`'ı doldurmuş olmalı
// (`vitest.config.ts`'in `sequence.concurrent:false` + `fileParallelism:
// false` ayarı testlerin TANIM SIRASIYLA koştuğunu garanti eder).
describe('catalog-lint — TENANT_ISOLATION_RULES tek doğruluk kaynağı (R-PM7)', () => {
  afterAll(() => {
    // Boyut: dizinin eleman sayısı ile üretilen BENZERSİZ kural sayısı BİREBİR
    // eşleşmeli (ne eksik ne ölü kod).
    expect(observedRules.size).toBe(TENANT_ISOLATION_RULES.length)
    expect([...observedRules].sort()).toEqual([...TENANT_ISOLATION_RULES].sort())
  })

  it('bu dosyadaki fixture testleri koşana kadar bekler (gerçek doğrulama afterAll içinde)', () => {
    expect(observedRules.size).toBeGreaterThan(0)
  })
})
