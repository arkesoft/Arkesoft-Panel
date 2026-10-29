// @arkesoft/db — canlı katalog bulgularını değerlendiren SAF kural motoru
// (ROADMAP v0.0.13, T-005/S4, architect K-E5)
//
// SAFLIK (K-E5/K-C4 deseni, zorunlu): bu dosya DB'ye DOKUNMAZ (bağlantı
// açmaz, ham SQL sorgusu çalıştırmaz) ve test çalıştırma çerçevesini İMPORT
// ETMEZ. Girdisi
// `catalog-snapshot.ts`'in ürettiği, ZATEN Zod ile parse edilmiş
// `CatalogSnapshot` nesnesidir — bu dosya yalnızca "bu doğru mu?" sorusunu
// saf fonksiyonla yanıtlar; "ne var?" sorusunu `catalog-snapshot.ts` yanıtladı.
// Bu ayrım `__tests__/catalog-lint.test.ts`'in DB'siz, saf birim testi olarak
// koşmasını sağlar (fixture'larla 20 kuralın tamamı burada doğrulanır).
//
// TAKSONOMİ PARAMETREDİR, modülden import EDİLMEZ (AC9'un mekanizması):
// çağıran (`createTenantIsolationSuite()`/isolation testleri) `src/tenancy.ts`
// → `TENANT_SCOPED_TABLES`/`PLATFORM_LEVEL_TABLES`'ı okuyup `LintCatalogOptions.
// taxonomy` olarak GEÇİRİR. `TENANT_SCOPED_TABLES`'a ikinci tablo eklendiğinde
// BU DOSYANIN KAYNAK KODU DEĞİŞMEDEN linter onu zorlar (MISSING_TABLE/
// MISSING_TENANT_ID_COLUMN/… katalogda karşılığı yoksa düşer).
//
// GUC ADI LİTERAL YAZILMAZ (R-P3(c), AC4'ün yapısal ön koşulu): tenant
// context'in okuduğu Postgres ayarının adı bu dosyada literal YOKTUR —
// çağıran `tenant-context.ts`'in dışa açtığı sabiti `LintCatalogOptions.
// tenantContextSetting` olarak GEÇİRİR. `POLICY_USING_NOT_CANONICAL`/
// `POLICY_WITH_CHECK_NOT_CANONICAL` kuralları bu DEĞERDEN (sabitten, literal
// GUC adından DEĞİL) `buildCanonicalPolicyExpression()` ile beklenen TAM
// ifadeyi ÜRETİR ve politika ifadesiyle BİREBİR karşılaştırır.
//
// 20 KURAL KODU (FIX turu 2: solid/security Tur 2 [medium] bulgusu üzerine
// İKİ KURAL YENİDEN ADLANDIRILDI — net sıfır değişiklik; AYRICA B3
// (qa/solid Tur 2 [low] BAĞIMSIZ bulgu) üzerine BİR YENİ kural eklendi,
// 19 → 20; aşağıdaki GÜNCELLEME notlarına bakın):
//   taksonomi→katalog (13): MISSING_TABLE, MISSING_TENANT_ID_COLUMN,
//     NULLABLE_TENANT_ID_COLUMN, WRONG_TENANT_ID_TYPE,
//     MISSING_TENANT_ID_LEADING_INDEX, RLS_NOT_ENABLED, RLS_NOT_FORCED,
//     MISSING_TENANT_POLICY, POLICY_MISSING_WITH_CHECK,
//     POLICY_USING_NOT_CANONICAL, POLICY_WITH_CHECK_NOT_CANONICAL,
//     POLICY_RESTRICTED_TO_ROLE, APP_ROLE_MISSING_DML_PRIVILEGE
//   katalog→taksonomi (3): UNCLASSIFIED_TABLE, TENANT_ID_ON_PLATFORM_TABLE,
//     TENANT_ID_WITHOUT_TAXONOMY_ENTRY
//   rol (2): APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS, APP_ROLE_OWNS_TABLE
//   platform/ledger (1, YENİ — B3): APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE
//   fail-closed (1): EMPTY_CATALOG_SNAPSHOT
//
// GÜNCELLEME (FIX turu 2, B3 — qa/solid Tur 2 [low] BAĞIMSIZ bulgu):
// `bootstrap-roles.sql`'in 4. bölümündeki blanket `GRANT .../ALTER DEFAULT
// PRIVILEGES` TÜM gelecekteki tablolara otomatik DML verir — bu mekanizma
// TABLO ADINA göre filtrelenemez, dolayısıyla Prisma'nın KENDİ migration
// defterini (`_prisma_migrations`) de kapsar. `arkesoft_app` (çalışma zamanı,
// en az yetkili rolü) bu deftere INSERT/UPDATE/DELETE yapabiliyordu —
// `security`/`qa` ampirik olarak ÖLÇTÜ. `_prisma_migrations` taksonomide
// (`EXEMPT_TABLES`) olduğu için `lintAppRoleDmlPrivileges`in YETERSİZ
// yetki kontrolünün (ve `lintCatalogToTaxonomy`'nin) HİÇBİRİNİN öznesi
// değildi — "fazla yetki" sorusunu soran HİÇBİR kural yoktu.
// `lintMigrationsLedgerPrivilege` bu boşluğu kapatır: `_prisma_migrations`
// üzerinde `appRoleName`in SELECT DIŞINDA bir DML yetkisi varsa bulgu verir.
//
// GÜNCELLEME (FIX turu 1, [high] — solid VE security BAĞIMSIZ OLARAK buldu):
// eski TEK `POLICY_WRONG_SETTING` kuralı `usingExpression` **VEYA** (`||`)
// `withCheckExpression`'ın GUC'u okumasını yeterli sayıyordu — bir politika
// `USING (doğru GUC) WITH CHECK (true)` yazarsa (çapraz tenant YAZMA açık
// kalır) 19 kuralın TAMAMINDAN temiz geçiyordu. İKİ AYRI kural kodu
// (eski adlarıyla `POLICY_USING_WRONG_SETTING`/`POLICY_WITH_CHECK_WRONG_SETTING`)
// USING ve WITH CHECK'i BAĞIMSIZ değerlendirmeye başladı — AC3'ün "iki vaka
// ayrı isimli kural" deseniyle aynı gerekçe (K-E5). Ayrıca
// `POLICY_RESTRICTED_TO_ROLE` eklendi (architect K-E2.1'in "politikada `TO`
// yan tümcesi YOK" kararını zorlar).
//
// GÜNCELLEME (FIX turu 2, K-E5 REVİZYONU — solid Tur 2 [medium] bulgusu:
// "tur 1 high'ının SINIFI kapanmadı"): FIX turu 1'in `expressionReferencesSetting`
// yardımcısı yalnızca `current_setting('<ayar>'` ALT DİZESİNİ arıyordu — HANGİ
// kolonun karşılaştırıldığını ve ifadenin ŞEKLİNİ hiç iddia etmiyordu. `security`
// 14 varyant ölçtü; 19 kuralın TAMAMINDAN temiz geçen ALTI vaka buldu (yanlış
// kolon, `OR true`, `<>`, `IS NOT NULL`, başka GUC + yorumda doğru GUC) ve
// kalıp-tabanlı bir ara çözümün DE atlatılabileceğini gösterdi
// (`NOT (tenant_id = current_setting(…))` ve `(…) IS NOT TRUE` — kalıp
// MEVCUT, üst seviye `or`/çıplak `true` YOK, ama anlam TERSİNE ÇEVRİLMİŞ).
// **Dördüncü sezgisel yama REDDEDİLDİ** (R-D1'in "mekanizma yanlış, eşik
// değil" dersi — bkz. dosya başı). Çözüm: `buildCanonicalPolicyExpression()`
// GUC adından TEK doğru ifadeyi ÜRETİR (sabit yazılmaz) ve karşılaştırma
// ALT DİZE/kalıp DEĞİL, TAM (byte-birebir) EŞİTLİKTİR —
// `isCanonicalPolicyExpression()`. `expressionReferencesSetting` SİLİNDİ
// (zayıf yardımcıyı bırakmak sonraki geliştiriciyi ona yönlendirirdi). İki
// kural adı da bu nedenle `..._WRONG_SETTING` → `..._NOT_CANONICAL` olarak
// DEĞİŞTİ: artık "yanlış GUC" değil "kanonik olmayan ifade" soruluyor (yanlış
// kolon/şekil de bu kuralın kapsamına girdi). **Bilinçli daraltma (madde 6):**
// tenant tablosu kanonik dışında başka hiçbir politika BİÇİMİ kabul etmez —
// ikinci PERMISSIVE politika, komut bazlı bölünmüş politika veya
// `AS RESTRICTIVE` eki de artık bulgu üretir (kanonik olmayan `usingExpression`/
// `withCheckExpression` taşıdıkları veya `policies.length` arttığı için ek
// politika BAŞKA bir satır olarak değerlendirilip kendi `POLICY_*_NOT_CANONICAL`
// bulgusunu üretir).

import type { CatalogSnapshot } from './catalog-snapshot.js'

/** Linter'ın üretebileceği 20 bulgu kodu (dosya başı listesi, bağlayıcı). */
export type TenantIsolationRule =
  | 'MISSING_TABLE'
  | 'MISSING_TENANT_ID_COLUMN'
  | 'NULLABLE_TENANT_ID_COLUMN'
  | 'WRONG_TENANT_ID_TYPE'
  | 'MISSING_TENANT_ID_LEADING_INDEX'
  | 'RLS_NOT_ENABLED'
  | 'RLS_NOT_FORCED'
  | 'MISSING_TENANT_POLICY'
  | 'POLICY_MISSING_WITH_CHECK'
  | 'POLICY_USING_NOT_CANONICAL'
  | 'POLICY_WITH_CHECK_NOT_CANONICAL'
  | 'POLICY_RESTRICTED_TO_ROLE'
  | 'APP_ROLE_MISSING_DML_PRIVILEGE'
  | 'UNCLASSIFIED_TABLE'
  | 'TENANT_ID_ON_PLATFORM_TABLE'
  | 'TENANT_ID_WITHOUT_TAXONOMY_ENTRY'
  | 'APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS'
  | 'APP_ROLE_OWNS_TABLE'
  | 'APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE'
  | 'EMPTY_CATALOG_SNAPSHOT'

/** Tek bir bulgu. `tableName` tablo bazlı olmayan kurallarda (`EMPTY_CATALOG_SNAPSHOT`, rol kuralları) YOKTUR. */
export type LintFinding = {
  readonly rule: TenantIsolationRule
  readonly tableName?: string
  readonly message: string
}

/**
 * `lintCatalog`'un taksonomi girdisi. `src/tenancy.ts`'teki
 * `TENANT_SCOPED_TABLES`/`PLATFORM_LEVEL_TABLES` dizileriyle YAPISAL OLARAK
 * uyumludur (çağıran onları buraya kopyalar) — bu dosya o modülü import ETMEZ.
 *
 * FIX turu 2 (solid Tur 2 [low] bulgusu, B4): `export` KALDIRILDI — hiçbir
 * dosya bu tipi dışarıdan İTHAL ETMİYOR, çağıranlar yapısal uyumla (structural
 * typing) `LintCatalogOptions.taxonomy` alanına nesne geçiriyor; dışa açık
 * tutmak yanlışlıkla "bunu ithal etmen gerekiyor" izlenimi verirdi.
 */
type TenantIsolationTaxonomy = {
  readonly tenantScopedTables: readonly string[]
  readonly platformLevelTables: readonly string[]
}

/** `lintCatalog`'un tüm girdileri (anlık görüntü hariç). */
export type LintCatalogOptions = {
  readonly taxonomy: TenantIsolationTaxonomy
  /** `tenant-context.ts`'in `TENANT_CONTEXT_SETTING` sabiti — BURADA literal YAZILMAZ. */
  readonly tenantContextSetting: string
  readonly appRoleName: string
}

const EXPECTED_TENANT_ID_TYPE = 'text'

/**
 * Prisma'nın kendi migration defteri — taksonomiden (K-E2) BİLEREK MUAF,
 * ayrıca (FIX turu 2, B3) `lintMigrationsLedgerPrivilege`in TEK öznesi.
 */
const MIGRATIONS_LEDGER_TABLE = '_prisma_migrations'
const EXEMPT_TABLES: ReadonlySet<string> = new Set([MIGRATIONS_LEDGER_TABLE])

/**
 * RLS politika yüklemlerinin (`USING`/`WITH CHECK`) karşılaştırıldığı tenant
 * kolonu. Modül sabiti (K-E5 madde 1) — `LintCatalogOptions`'tan GEÇİRİLMEZ,
 * çünkü taksonomideki HER tenant tablosu aynı kolon adını (`tenant_id`)
 * kullanır (K1, ROADMAP).
 */
const TENANT_ID_COLUMN = 'tenant_id'

/**
 * K-E5 REVİZYONU (FIX turu 2): bir RLS politika yükleminin TEK kabul edilen
 * biçimini `settingName`'den ÜRETİR — sabit yazılmaz (K-E5 madde 2). Burada
 * literal bir GUC adı YOKTUR (R-P3(c)/AC4) — `settingName` çağırandan
 * (`LintCatalogOptions.tenantContextSetting`) gelir.
 *
 * Çıktı, canlı Postgres'in `pg_policies.qual`/`with_check` için ÜRETTİĞİ
 * deparse biçimiyle AYNIDIR (A-F1 ölçümü — `tenant_membership` üzerinde
 * ampirik doğrulandı, bkz. handoff raporu).
 */
function buildCanonicalPolicyExpression(settingName: string): string {
  return `(${TENANT_ID_COLUMN} = current_setting('${settingName}'::text, true))`
}

/**
 * K-E5 REVİZYONU (FIX turu 2, solid Tur 2 [medium] bulgusunu KAPATIR — "tur
 * 1 high'ının SINIFI kapanmadı"): verilen ifadenin `buildCanonicalPolicyExpression()`'ın
 * ürettiği dizeyle TAM (byte-birebir) eşleştiğini doğrular. Alt dize, kalıp,
 * boşluk/harf normalizasyonu veya "şunu da kabul et" istisnası YOK (K-E5
 * madde 3) — bu, eski `expressionReferencesSetting`'in (yalnızca
 * `current_setting('<ayar>'` alt dizesini arayan, hangi kolonun
 * karşılaştırıldığını hiç iddia etmeyen) BİLEREK SİLİNMİŞ yerine geçer.
 * `security`'nin ölçtüğü altı atlatma (yanlış kolon, `OR true`, `<>`,
 * `IS NOT NULL`, başka GUC + yorumda doğru GUC) VE kalıp-tabanlı bir ara
 * çözümün de atlatılabileceğini gösteren iki ek vaka (`NOT (…)`,
 * `(…) IS NOT TRUE`) bu TAM EŞİTLİK karşılaştırmasıyla hepsi KAPANIR —
 * `__tests__/catalog-lint.test.ts`'te sekizi de fixture olarak pinlenir.
 *
 * `expression === null` → `false`: eksik/NULL ifade kanonik SAYILMAZ, ama bu
 * durum zaten `POLICY_MISSING_WITH_CHECK` tarafından (WITH CHECK için) ayrı
 * bir soru olarak ele alınır — çağıran bu ayrımı `hasWithCheck` ile korur.
 */
function isCanonicalPolicyExpression(expression: string | null, settingName: string): boolean {
  return expression !== null && expression === buildCanonicalPolicyExpression(settingName)
}

/**
 * `POLICY_USING_NOT_CANONICAL`/`POLICY_WITH_CHECK_NOT_CANONICAL` bulgu
 * mesajını üretir. K-E5 madde 5 (BAĞLAYICI): BEKLENEN ve GERÇEK ifadeyi
 * birebir taşır, Postgres sürüm sapması hipotezini AÇIKÇA yazar (sapmayı
 * ayrı bir kural koduyla sınıflandırmak YASAK — ayrım mekanik olarak
 * yapılamaz). Tenant id/satır verisi TAŞIMAZ — yalnızca şema seviyesi
 * (tablo/politika adı + SQL ifadesi metni).
 */
function buildNotCanonicalMessage(
  tableName: string,
  policyName: string,
  clause: 'USING' | 'WITH CHECK',
  expected: string,
  actual: string | null,
  isSinglePolicy: boolean,
): string {
  const actualText = actual ?? 'NULL'
  const multiplicityNote = isSinglePolicy
    ? ''
    : ' Not (K-E5 madde 6): bu tabloda birden fazla politika satırı var — "tam olarak bir ' +
      'politika" kısıtına göre ifade kendi başına kanonikle eşleşse bile bulgu üretildi.'
  return (
    `"${tableName}.${policyName}" ${clause} ifadesi beklenen kanonik biçimle BİREBİR eşleşmiyor. ` +
    `Beklenen: ${expected} — Gerçek: ${actualText}. ` +
    'Not: bu kontrol TAM dize eşitliği yapar; bir Postgres sürüm sapması (deparse biçiminin ' +
    'değişmesi, örn. cast söz dizimi) bu bulguyu da üretebilir — o durumda şablonu güncelleyin, ' +
    'karşılaştırmayı GEVŞETMEYİN.' +
    multiplicityNote
  )
}

/** `policy.roles`'ın `TO` yan tümcesi YAZILMAMIŞ (yalnızca PUBLIC) anlamına geldiğini doğrular. */
function isPublicPolicy(roles: readonly string[]): boolean {
  return roles.length === 1 && roles[0] === 'public'
}

function lintTenantScopedTable(
  tableName: string,
  snapshot: CatalogSnapshot,
  tenantContextSetting: string,
): LintFinding[] {
  const findings: LintFinding[] = []

  const table = snapshot.tables.find((candidate) => candidate.tableName === tableName)
  if (table === undefined) {
    findings.push({
      rule: 'MISSING_TABLE',
      tableName,
      message: `Taksonomide "tenantScopedTables" altında listelenen tablo katalogda yok: "${tableName}".`,
    })
    return findings
  }

  const column = snapshot.columns.find(
    (candidate) => candidate.tableName === tableName && candidate.columnName === 'tenant_id',
  )
  if (column === undefined) {
    findings.push({
      rule: 'MISSING_TENANT_ID_COLUMN',
      tableName,
      message: `"${tableName}" tablosunda "tenant_id" kolonu yok.`,
    })
  } else {
    if (column.isNullable) {
      findings.push({
        rule: 'NULLABLE_TENANT_ID_COLUMN',
        tableName,
        message: `"${tableName}.tenant_id" NULL kabul ediyor (NOT NULL olmalı).`,
      })
    }
    if (column.dataType !== EXPECTED_TENANT_ID_TYPE) {
      findings.push({
        rule: 'WRONG_TENANT_ID_TYPE',
        tableName,
        message: `"${tableName}.tenant_id" tipi "${column.dataType}", beklenen "${EXPECTED_TENANT_ID_TYPE}".`,
      })
    }
  }

  const hasLeadingIndex = snapshot.indexes.some(
    (index) => index.tableName === tableName && index.columns[0] === 'tenant_id',
  )
  if (!hasLeadingIndex) {
    findings.push({
      rule: 'MISSING_TENANT_ID_LEADING_INDEX',
      tableName,
      message: `"${tableName}" üzerinde "tenant_id" öncü kolonlu bir indeks yok.`,
    })
  }

  const rowSecurity = snapshot.rowSecurity.find((candidate) => candidate.tableName === tableName)
  if (!rowSecurity?.isRowSecurityEnabled) {
    findings.push({
      rule: 'RLS_NOT_ENABLED',
      tableName,
      message: `"${tableName}" üzerinde satır seviyesi güvenlik (RLS) etkin değil.`,
    })
  } else if (!rowSecurity.isRowSecurityForced) {
    findings.push({
      rule: 'RLS_NOT_FORCED',
      tableName,
      message: `"${tableName}" üzerinde RLS etkin ama FORCE edilmemiş — tablo sahibi rolü politikayı atlar.`,
    })
  }

  const policies = snapshot.policies.filter((candidate) => candidate.tableName === tableName)
  if (policies.length === 0) {
    findings.push({
      rule: 'MISSING_TENANT_POLICY',
      tableName,
      message: `"${tableName}" için tenant izolasyon politikası yok.`,
    })
  } else {
    // K-E5 REVİZYONU (FIX turu 2, madde 6 — bilinçli daraltma): tenant
    // tablosu TAM OLARAK BİR politika taşımalı ve o politika kanonik
    // olmalıdır. `isSinglePolicy === false` ise İKİNCİ (ve sonraki) PERMISSIVE
    // politika, komut bazlı bölünmüş politika (`FOR SELECT`/`FOR INSERT`) veya
    // `AS RESTRICTIVE` eki — HER satır, kendi ifadesi kanonikle byte-birebir
    // eşleşse BİLE — `POLICY_USING_NOT_CANONICAL`/`POLICY_WITH_CHECK_NOT_CANONICAL`
    // üretir. Yeni kural KODU EKLENMEDİ; toplam 20 — mevcut iki kod bu
    // çoğulluğu da kapsar.
    const isSinglePolicy = policies.length === 1
    const expectedExpression = buildCanonicalPolicyExpression(tenantContextSetting)

    for (const policy of policies) {
      const hasWithCheck =
        policy.withCheckExpression !== null && policy.withCheckExpression.trim().length > 0

      if (!hasWithCheck) {
        findings.push({
          rule: 'POLICY_MISSING_WITH_CHECK',
          tableName,
          message: `"${tableName}.${policy.policyName}" WITH CHECK ifadesi taşımıyor.`,
        })
      }

      // K-E5 REVİZYONU (FIX turu 2, solid Tur 2 [medium] bulgusunu KAPATIR):
      // USING ve WITH CHECK AYRI AYRI, TAM EŞİTLİKLE değerlendirilir — eski
      // alt dize kontrolü (`expressionReferencesSetting`, SİLİNDİ) `USING
      // ("owner_id" = current_setting(doğru GUC))` (yanlış KOLON) ve
      // `WITH CHECK (… OR true)` (üst seviye OR) gibi vakaları 19 kuralın
      // TAMAMINDAN temiz geçiriyordu — bkz. dosya başı GÜNCELLEME notu.
      const isUsingCanonical = isCanonicalPolicyExpression(
        policy.usingExpression,
        tenantContextSetting,
      )
      if (!isSinglePolicy || !isUsingCanonical) {
        findings.push({
          rule: 'POLICY_USING_NOT_CANONICAL',
          tableName,
          message: buildNotCanonicalMessage(
            tableName,
            policy.policyName,
            'USING',
            expectedExpression,
            policy.usingExpression,
            isSinglePolicy,
          ),
        })
      }

      // `hasWithCheck` ile KORUMALI: WITH CHECK zaten eksikse (yukarıda
      // POLICY_MISSING_WITH_CHECK düştü) burada İKİNCİ, gürültülü bir bulgu
      // üretmek yanlış — "eksik" ile "kanonik değil" AYRI sorular (K-E5
      // madde 4, BAĞLAYICI).
      if (hasWithCheck) {
        const isWithCheckCanonical = isCanonicalPolicyExpression(
          policy.withCheckExpression,
          tenantContextSetting,
        )
        if (!isSinglePolicy || !isWithCheckCanonical) {
          findings.push({
            rule: 'POLICY_WITH_CHECK_NOT_CANONICAL',
            tableName,
            message: buildNotCanonicalMessage(
              tableName,
              policy.policyName,
              'WITH CHECK',
              expectedExpression,
              policy.withCheckExpression,
              isSinglePolicy,
            ),
          })
        }
      }

      // FIX turu 1 ([medium], solid bulgu): `policies.roles` artık TÜKETİLİYOR
      // — architect K-E2.1'in bağlayıcı kararı: politikada `TO` yan tümcesi
      // OLMAMALI (yalnızca PUBLIC). `TO arkesoft_app` yazılırsa sahip rol
      // (`arkesoft_migrator`, FORCE RLS'e tabi) için uygulanabilir politika
      // kalmaz → varsayılan ret → `db:seed` kırılır (migration.sql:10-13).
      if (!isPublicPolicy(policy.roles)) {
        findings.push({
          rule: 'POLICY_RESTRICTED_TO_ROLE',
          tableName,
          message: `"${tableName}.${policy.policyName}" belirli role kısıtlanmış (${policy.roles.join(', ')}) — K-E2.1 "TO yok" kararına aykırı.`,
        })
      }
    }
  }

  return findings
}

function lintAppRoleDmlPrivileges(
  classifiedTables: readonly string[],
  snapshot: CatalogSnapshot,
  appRoleName: string,
): LintFinding[] {
  const findings: LintFinding[] = []

  for (const tableName of classifiedTables) {
    const privilege = snapshot.privileges.find((candidate) => candidate.tableName === tableName)
    if (privilege === undefined) {
      // Tablo katalogda hiç yoksa bu zaten MISSING_TABLE/UNCLASSIFIED_TABLE
      // tarafından yakalanır — burada ikinci bir bulgu üretmek gürültü olur.
      continue
    }
    if (
      !privilege.canSelect ||
      !privilege.canInsert ||
      !privilege.canUpdate ||
      !privilege.canDelete
    ) {
      findings.push({
        rule: 'APP_ROLE_MISSING_DML_PRIVILEGE',
        tableName,
        message: `"${appRoleName}" rolü "${tableName}" üzerinde SELECT/INSERT/UPDATE/DELETE yetkilerinin tamamına sahip değil.`,
      })
    }
  }

  return findings
}

function lintCatalogToTaxonomy(
  snapshot: CatalogSnapshot,
  taxonomy: TenantIsolationTaxonomy,
): LintFinding[] {
  const findings: LintFinding[] = []

  for (const table of snapshot.tables) {
    const { tableName } = table
    if (EXEMPT_TABLES.has(tableName)) {
      continue
    }

    const isTenantScoped = taxonomy.tenantScopedTables.includes(tableName)
    const isPlatformLevel = taxonomy.platformLevelTables.includes(tableName)

    if (!isTenantScoped && !isPlatformLevel) {
      findings.push({
        rule: 'UNCLASSIFIED_TABLE',
        tableName,
        message: `"${tableName}" taksonomide sınıflandırılmamış (ne "tenantScopedTables" ne "platformLevelTables").`,
      })
    }

    const hasTenantIdColumn = snapshot.columns.some(
      (column) => column.tableName === tableName && column.columnName === 'tenant_id',
    )

    if (isPlatformLevel && hasTenantIdColumn) {
      findings.push({
        rule: 'TENANT_ID_ON_PLATFORM_TABLE',
        tableName,
        message: `"${tableName}" platform seviyesi olarak sınıflandırılmış ama "tenant_id" kolonu taşıyor.`,
      })
    }

    if (hasTenantIdColumn && !isTenantScoped) {
      findings.push({
        rule: 'TENANT_ID_WITHOUT_TAXONOMY_ENTRY',
        tableName,
        message: `"${tableName}" "tenant_id" kolonu taşıyor ama taksonominin "tenantScopedTables" listesinde yok (kolon nasıl geldiğinden bağımsız — R-C2).`,
      })
    }
  }

  return findings
}

/**
 * `_prisma_migrations` (Prisma'nın kendi migration defteri) üzerinde
 * `appRoleName`in SELECT DIŞINDA bir DML yetkisi (INSERT/UPDATE/DELETE)
 * TAŞIMADIĞINI doğrular (FIX turu 2, B3 — qa/solid Tur 2 [low] BAĞIMSIZ
 * bulgu). `bootstrap-roles.sql`'in blanket `GRANT`/`ALTER DEFAULT
 * PRIVILEGES`'i (K-E2 §4) tablo adına göre FİLTRELENEMEDİĞİ için bu deftere
 * de otomatik DML veriyordu; `_prisma_migrations` taksonomide MUAF
 * (`EXEMPT_TABLES`) olduğu için `lintAppRoleDmlPrivileges` (YETERSİZ yetki
 * sorusu) ve `lintCatalogToTaxonomy` (sınıflandırma sorusu) bu tabloyu HİÇ
 * GÖRMÜYORDU — "fazla yetki" sorusunu soran HİÇBİR kural yoktu.
 *
 * Tablo katalogda henüz yoksa (örn. `migrate deploy` öncesi bootstrap-only
 * bir anlık görüntü) sessizce atlanır — bu durum zaten `EMPTY_CATALOG_SNAPSHOT`
 * veya ayrı bir yaşam döngüsü sorunudur, bu kuralın öznesi DEĞİLDİR.
 */
function lintMigrationsLedgerPrivilege(
  snapshot: CatalogSnapshot,
  appRoleName: string,
): LintFinding[] {
  const privilege = snapshot.privileges.find(
    (candidate) => candidate.tableName === MIGRATIONS_LEDGER_TABLE,
  )
  if (privilege === undefined) {
    return []
  }

  if (privilege.canInsert || privilege.canUpdate || privilege.canDelete) {
    return [
      {
        rule: 'APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE',
        tableName: MIGRATIONS_LEDGER_TABLE,
        message:
          `"${appRoleName}" rolü "${MIGRATIONS_LEDGER_TABLE}" (Prisma migration defteri) ` +
          `üzerinde INSERT/UPDATE/DELETE yetkisine sahip (canInsert=${String(privilege.canInsert)}, ` +
          `canUpdate=${String(privilege.canUpdate)}, canDelete=${String(privilege.canDelete)}) — ` +
          'en az yetki ihlali, yalnızca SELECT beklenir.',
      },
    ]
  }

  return []
}

function lintAppRole(snapshot: CatalogSnapshot, appRoleName: string): LintFinding[] {
  const findings: LintFinding[] = []

  if (snapshot.appRole.isSuperuser || snapshot.appRole.canBypassRls) {
    findings.push({
      rule: 'APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS',
      message: `"${appRoleName}" rolü süper kullanıcı veya BYPASSRLS taşıyor — RLS'i tamamen atlar.`,
    })
  }

  for (const table of snapshot.tables) {
    if (table.tableOwner === appRoleName) {
      findings.push({
        rule: 'APP_ROLE_OWNS_TABLE',
        tableName: table.tableName,
        message: `"${appRoleName}" "${table.tableName}" tablosunun sahibi — FORCE RLS sahibi de kapsasa bile çalışma zamanı rolü tablo SAHİBİ OLMAMALI.`,
      })
    }
  }

  return findings
}

/**
 * Canlı katalog anlık görüntüsünü taksonomiye karşı doğrular ve bulgu
 * listesini döner. Boş dizi = "canlı şema taksonomiyle tutarlı" (sağlıklı
 * durum). SAF fonksiyon — DB'ye dokunmaz, yan etkisi yoktur.
 */
export function lintCatalog(
  snapshot: CatalogSnapshot,
  options: LintCatalogOptions,
): readonly LintFinding[] {
  if (snapshot.tables.length === 0) {
    return [
      {
        rule: 'EMPTY_CATALOG_SNAPSHOT',
        message:
          'Katalog anlık görüntüsü boş (hiç tablo okunamadı) — bağlantı/şema hedefi şüpheli, fail-closed: sağlıklı kabul edilmiyor.',
      },
    ]
  }

  const findings: LintFinding[] = []

  for (const tableName of options.taxonomy.tenantScopedTables) {
    findings.push(...lintTenantScopedTable(tableName, snapshot, options.tenantContextSetting))
  }

  const classifiedTables = [
    ...options.taxonomy.tenantScopedTables,
    ...options.taxonomy.platformLevelTables,
  ]
  findings.push(...lintAppRoleDmlPrivileges(classifiedTables, snapshot, options.appRoleName))

  findings.push(...lintCatalogToTaxonomy(snapshot, options.taxonomy))

  findings.push(...lintAppRole(snapshot, options.appRoleName))

  findings.push(...lintMigrationsLedgerPrivilege(snapshot, options.appRoleName))

  return findings
}
