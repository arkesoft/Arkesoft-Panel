// @arkesoft/db — `catalog-lint.ts`'in SAF birim testleri (ROADMAP v0.0.13,
// T-005/S4, architect K-E5)
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

import { describe, expect, it } from 'vitest'

import type { CatalogSnapshot } from '../catalog-snapshot.js'
import { lintCatalog, type LintCatalogOptions, type TenantIsolationRule } from '../catalog-lint.js'

const TENANT_CONTEXT_SETTING = 'app.tenant_id'
const APP_ROLE_NAME = 'arkesoft_app'
const MIGRATOR_ROLE_NAME = 'arkesoft_migrator'

const BASE_OPTIONS: LintCatalogOptions = {
  taxonomy: {
    tenantScopedTables: ['tenant_membership'],
    platformLevelTables: ['tenant', 'app_user'],
  },
  tenantContextSetting: TENANT_CONTEXT_SETTING,
  appRoleName: APP_ROLE_NAME,
}

function healthySnapshot(): CatalogSnapshot {
  return {
    tables: [
      { tableName: 'tenant', tableOwner: MIGRATOR_ROLE_NAME },
      { tableName: 'app_user', tableOwner: MIGRATOR_ROLE_NAME },
      { tableName: 'tenant_membership', tableOwner: MIGRATOR_ROLE_NAME },
      { tableName: '_prisma_migrations', tableOwner: MIGRATOR_ROLE_NAME },
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
    appRole: { roleName: APP_ROLE_NAME, isSuperuser: false, canBypassRls: false },
    privileges: [
      { tableName: 'tenant', canSelect: true, canInsert: true, canUpdate: true, canDelete: true },
      { tableName: 'app_user', canSelect: true, canInsert: true, canUpdate: true, canDelete: true },
      {
        tableName: 'tenant_membership',
        canSelect: true,
        canInsert: true,
        canUpdate: true,
        canDelete: true,
      },
      // FIX turu 2 (B3): `_prisma_migrations`'ın SAĞLIKLI hedef durumu artık
      // yalnızca SELECT — bootstrap'ın yeni daraltılmış `REVOKE`si (bkz.
      // `sql/bootstrap-roles.sql` bölüm 6) bu üçünü `false`a yakınsatır.
      {
        tableName: '_prisma_migrations',
        canSelect: true,
        canInsert: false,
        canUpdate: false,
        canDelete: false,
      },
    ],
  }
}

/** Verilen kuralı taşıyan bulguları (varsa tabloya göre süzülmüş) döner. */
function findingsOf(
  findings: readonly { readonly rule: TenantIsolationRule; readonly tableName?: string }[],
  rule: TenantIsolationRule,
): readonly { readonly rule: TenantIsolationRule; readonly tableName?: string }[] {
  return findings.filter((finding) => finding.rule === rule)
}

describe('catalog-lint — sağlıklı durum', () => {
  it('taban anlık görüntü hiçbir bulgu üretmez', () => {
    expect(lintCatalog(healthySnapshot(), BASE_OPTIONS)).toEqual([])
  })
})

describe('catalog-lint — taksonomi→katalog (13 kural, FIX turu 1 güncellendi)', () => {
  it('MISSING_TABLE: taksonomideki tablo katalogda yok', () => {
    const snapshot = healthySnapshot()
    const withoutTable: CatalogSnapshot = {
      ...snapshot,
      tables: snapshot.tables.filter((table) => table.tableName !== 'tenant_membership'),
    }
    const findings = lintCatalog(withoutTable, BASE_OPTIONS)
    expect(findingsOf(findings, 'MISSING_TABLE')).toHaveLength(1)
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
    const findings = lintCatalog(withoutColumn, BASE_OPTIONS)
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
    const findings = lintCatalog(nullable, BASE_OPTIONS)
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
    const findings = lintCatalog(wrongType, BASE_OPTIONS)
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
    const findings = lintCatalog(withoutLeadingIndex, BASE_OPTIONS)
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
    const findings = lintCatalog(disabled, BASE_OPTIONS)
    expect(findingsOf(findings, 'RLS_NOT_ENABLED')).toHaveLength(1)
    expect(findingsOf(findings, 'RLS_NOT_FORCED')).toHaveLength(0)
  })

  it('RLS_NOT_FORCED: ENABLE var FORCE yok (AC3 vaka a) — RLS_NOT_ENABLED İLE AYNI ANDA TETİKLENMEZ', () => {
    const snapshot = healthySnapshot()
    const notForced: CatalogSnapshot = {
      ...snapshot,
      rowSecurity: snapshot.rowSecurity.map((row) => ({ ...row, isRowSecurityForced: false })),
    }
    const findings = lintCatalog(notForced, BASE_OPTIONS)
    expect(findingsOf(findings, 'RLS_NOT_FORCED')).toHaveLength(1)
    expect(findingsOf(findings, 'RLS_NOT_ENABLED')).toHaveLength(0)
  })

  it('MISSING_TENANT_POLICY: politika hiç yok (AC3 vaka b)', () => {
    const snapshot = healthySnapshot()
    const withoutPolicy: CatalogSnapshot = { ...snapshot, policies: [] }
    const findings = lintCatalog(withoutPolicy, BASE_OPTIONS)
    expect(findingsOf(findings, 'MISSING_TENANT_POLICY')).toHaveLength(1)
  })

  it('POLICY_MISSING_WITH_CHECK: politika var ama WITH CHECK yok', () => {
    const snapshot = healthySnapshot()
    const withoutCheck: CatalogSnapshot = {
      ...snapshot,
      policies: snapshot.policies.map((policy) => ({ ...policy, withCheckExpression: null })),
    }
    const findings = lintCatalog(withoutCheck, BASE_OPTIONS)
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
    const findings = lintCatalog(wrongUsing, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_USING_NOT_CANONICAL')).toHaveLength(1)
    expect(findingsOf(findings, 'POLICY_WITH_CHECK_NOT_CANONICAL')).toHaveLength(0)
  })

  // FIX turu 1 — bu test solid/security Tur 1 [high] bulgusunun BİREBİR
  // tekrarıdır: USING doğru GUC'u okur, WITH CHECK `(true)`dur (çapraz
  // tenant YAZMA açık). Eski `||` birleşimi bunu 19 kuralın TAMAMINDAN
  // GEÇİRİYORDU (`[]` dönüyordu) — artık `POLICY_WITH_CHECK_NOT_CANONICAL`
  // ile YAKALANIYOR (FIX turu 2'de yeniden adlandırıldı, eski ad
  // `POLICY_WITH_CHECK_WRONG_SETTING`).
  it('POLICY_WITH_CHECK_NOT_CANONICAL: WITH CHECK (true) — ÇAPRAZ TENANT YAZMA deliği (FIX turu 1)', () => {
    const snapshot = healthySnapshot()
    const withCheckTrue: CatalogSnapshot = {
      ...snapshot,
      policies: snapshot.policies.map((policy) => ({
        ...policy,
        withCheckExpression: '(true)',
      })),
    }
    const findings = lintCatalog(withCheckTrue, BASE_OPTIONS)
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
    const findings = lintCatalog(withoutCheck, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_MISSING_WITH_CHECK')).toHaveLength(1)
    expect(findingsOf(findings, 'POLICY_WITH_CHECK_NOT_CANONICAL')).toHaveLength(0)
  })

  // K-E5 REVİZYONU (FIX turu 2) — solid/security Tur 2 bulgusu: eski alt dize
  // kontrolü (`expressionReferencesSetting`, SİLİNDİ) yalnızca "GUC'u okuyor
  // mu" sorusunu yanıtlıyordu, "tenant_id'yi GUC'a EŞİTLİYOR mu" sorusunu
  // YANITLAMIYORDU. `security` 14 varyant ölçtü; 19 kuralın TAMAMINDAN temiz
  // geçen ALTI vaka (aşağıdaki ilk altı test) + kalıp-tabanlı bir ara çözümün
  // DE atlatılabileceğini gösteren İKİ EK vaka (`NOT (…)`, `(…) IS NOT TRUE`
  // — son iki test, KALICI REGRESYON PİNİ). Artık karşılaştırma TAM (byte-
  // birebir) EŞİTLİK olduğu için SEKİZİNİN DE `POLICY_WITH_CHECK_NOT_CANONICAL`
  // ürettiği burada pinlenir.
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
      const findings = lintCatalog(mutated, BASE_OPTIONS)
      expect(findingsOf(findings, 'POLICY_WITH_CHECK_NOT_CANONICAL')).toHaveLength(1)
    })
  })

  // vaka 2 (K-E5'in altı vakasının İKİNCİSİ) — OKUMA tarafı: aynı kalıp
  // `USING` yüklemine uygulanır. Diğer altısı WITH CHECK'te test edildi,
  // bu TEK başına USING'i kapsar (K-E5 madde: "USING ve WITH CHECK bağımsız
  // değerlendirilir" simetrisini de pinler).
  it('vaka 2: USING (current_setting(GUC) IS NOT NULL) — okuma tarafı, POLICY_USING_NOT_CANONICAL üretir', () => {
    const snapshot = healthySnapshot()
    const mutated: CatalogSnapshot = {
      ...snapshot,
      policies: snapshot.policies.map((policy) => ({
        ...policy,
        usingExpression: `(current_setting('${TENANT_CONTEXT_SETTING}'::text, true) IS NOT NULL)`,
      })),
    }
    const findings = lintCatalog(mutated, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_USING_NOT_CANONICAL')).toHaveLength(1)
    // WITH CHECK taban üzerinden DEĞİŞTİRİLMEDİ — hâlâ kanonik, bu yüzden
    // KENDİ kuralı tetiklenmemeli (USING/WITH CHECK bağımsızlığının kanıtı).
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
    const findings = lintCatalog(duplicated, BASE_OPTIONS)
    // İKİ politika satırı da (ifadeleri kanonikle byte-birebir eşleşse bile)
    // "birden fazla politika" nedeniyle NOT_CANONICAL üretir.
    expect(findingsOf(findings, 'POLICY_USING_NOT_CANONICAL')).toHaveLength(2)
    expect(findingsOf(findings, 'POLICY_WITH_CHECK_NOT_CANONICAL')).toHaveLength(2)
  })

  it('POLICY_RESTRICTED_TO_ROLE: politika TO ile belirli bir role kısıtlanmış (K-E2.1 ihlali)', () => {
    const snapshot = healthySnapshot()
    const restrictedToRole: CatalogSnapshot = {
      ...snapshot,
      policies: snapshot.policies.map((policy) => ({ ...policy, roles: [APP_ROLE_NAME] })),
    }
    const findings = lintCatalog(restrictedToRole, BASE_OPTIONS)
    expect(findingsOf(findings, 'POLICY_RESTRICTED_TO_ROLE')).toHaveLength(1)
  })

  it('APP_ROLE_MISSING_DML_PRIVILEGE: app rolü UPDATE yetkisine sahip değil', () => {
    const snapshot = healthySnapshot()
    const missingPrivilege: CatalogSnapshot = {
      ...snapshot,
      privileges: snapshot.privileges.map((privilege) =>
        privilege.tableName === 'tenant_membership'
          ? { ...privilege, canUpdate: false }
          : privilege,
      ),
    }
    const findings = lintCatalog(missingPrivilege, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_MISSING_DML_PRIVILEGE')).toHaveLength(1)
  })
})

describe('catalog-lint — katalog→taksonomi (3 kural)', () => {
  it('UNCLASSIFIED_TABLE: katalogda olan ama taksonomide olmayan tablo (_prisma_migrations MUAF)', () => {
    const snapshot = healthySnapshot()
    const withExtraTable: CatalogSnapshot = {
      ...snapshot,
      tables: [...snapshot.tables, { tableName: 'orphan_table', tableOwner: MIGRATOR_ROLE_NAME }],
    }
    const findings = lintCatalog(withExtraTable, BASE_OPTIONS)
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
    const findings = lintCatalog(contaminated, BASE_OPTIONS)
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
    const findings = lintCatalog(withUntrackedTenantTable, BASE_OPTIONS)
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

describe('catalog-lint — rol (2 kural)', () => {
  it('APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS: rolbypassrls açık', () => {
    const snapshot = healthySnapshot()
    const bypassing: CatalogSnapshot = {
      ...snapshot,
      appRole: { ...snapshot.appRole, canBypassRls: true },
    }
    const findings = lintCatalog(bypassing, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS')).toHaveLength(1)
  })

  it('APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS: rolsuper açık', () => {
    const snapshot = healthySnapshot()
    const superuser: CatalogSnapshot = {
      ...snapshot,
      appRole: { ...snapshot.appRole, isSuperuser: true },
    }
    const findings = lintCatalog(superuser, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS')).toHaveLength(1)
  })

  it('APP_ROLE_OWNS_TABLE: app rolü bir tablonun sahibi', () => {
    const snapshot = healthySnapshot()
    const ownsTable: CatalogSnapshot = {
      ...snapshot,
      tables: snapshot.tables.map((table) =>
        table.tableName === 'tenant_membership' ? { ...table, tableOwner: APP_ROLE_NAME } : table,
      ),
    }
    const findings = lintCatalog(ownsTable, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_OWNS_TABLE')).toEqual([
      expect.objectContaining({ rule: 'APP_ROLE_OWNS_TABLE', tableName: 'tenant_membership' }),
    ])
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
      const findings = lintCatalog(excessPrivilege, BASE_OPTIONS)
      expect(findingsOf(findings, 'APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE')).toHaveLength(1)
    },
  )

  it('taban anlık görüntü (SELECT dışı hepsi false) hiçbir bulgu üretmez', () => {
    const findings = lintCatalog(healthySnapshot(), BASE_OPTIONS)
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
    const findings = lintCatalog(withoutLedger, BASE_OPTIONS)
    expect(findingsOf(findings, 'APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE')).toHaveLength(0)
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
      appRole: { roleName: APP_ROLE_NAME, isSuperuser: false, canBypassRls: false },
      privileges: [],
    }
    const findings = lintCatalog(empty, BASE_OPTIONS)
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
    const findings = lintCatalog(healthySnapshot(), optionsWithSecondTable)
    expect(findingsOf(findings, 'MISSING_TABLE')).toEqual([
      expect.objectContaining({ rule: 'MISSING_TABLE', tableName: 'future_tenant_table' }),
    ])
  })
})
