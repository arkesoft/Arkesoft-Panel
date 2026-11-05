// @arkesoft/db — canlı Postgres kataloğunun anlık görüntüsü (ROADMAP v0.0.13,
// T-005/S4, architect K-E1/K-E5; v0.0.14.1, T-015/ST-B — iki rol + kolon
// yetkisi kaynakları)
//
// R-C2/ADR-0007: şema linter'ı STATİK metni değil CANLI Postgres kataloğunu
// (`pg_class`, `pg_policies`, `information_schema.columns`, `pg_roles`, …)
// okur — bu dosya o okuma katmanıdır. `catalog-lint.ts` BUNU import eder ama
// kendisi DB'ye DOKUNMAZ (K-E5): "ne var" sorusunu bu dosya yanıtlar, "bu
// doğru mu" sorusunu `catalog-lint.ts`'in SAF fonksiyonu yanıtlar.
//
// Her satır Zod ile parse edilir (CLAUDE.md §4) — `$queryRaw` çalışma
// zamanında tipsiz döner, dönüşe ASLA güvenilmez.
//
// CAST ZORUNLULUĞU (ampirik ölçüldü, A-E ölçümü): Postgres'in `name`/`name[]`
// (`pg_policies.roles`, `pg_attribute.attname`, `pg_tables.tablename` vb.)
// sütunları `@prisma/adapter-pg` üzerinden "Failed to deserialize column of
// type 'Unknown'" hatasıyla PATLAR — `node-postgres`'in varsayılan tip
// kayıt defteri `name`/`_name` OID'lerini TANIMAZ. Bu yüzden HER sorguda
// `name` taşıyan her sütun `::text`/`::text[]` ile açıkça cast edilir; bu
// bir stil tercihi DEĞİL, çalışma zamanı zorunluluğudur. Aynı zorunluluk
// `::regrole` için de geçerli (Kaynak B, `readColumnGrants`) — ST-A0③'ün
// ölçtüğü ampirik sonuç.
//
// Çıktı sütunları SQL'de ÇİFT TIRNAKLI camelCase takma adlarla
// (`AS "tableName"`) döndürülür — Postgres büyük/küçük harfi tırnaklı
// tanımlayıcılarda KORUR; böylece Zod şemaları ek bir `transform` adımı
// gerektirmeden JS/TS adlandırma konvansiyonuyla (camelCase) birebir eşleşir.
//
// Bu modül hem TAM istemciyle (`PrismaDatabase`, sağlıklı-durum okuması) hem
// TRANSACTION istemcisiyle (`TransactionClient`, AC3'ün probu — K-E11: prob
// AYNI `tx` üzerinden okur, `DROP TABLE` kullanmaz) çağrılabilir; ikisi de
// `$queryRaw` taşır.
//
// T-015/ST-B — İKİ ROL + KOLON YETKİSİ (R-PM3/architect KARAR, R-PM8):
//   - `readCatalogSnapshot`'ın imzası `(client, appRoleName)` → `(client,
//     { appRoleName, authRoleName })` olarak DEĞİŞTİ — paket-içi, public API
//     etkisi YOK (bu modül `index.ts`'ten dışa açılmıyor).
//   - `CatalogRoleRow`'a `canCreateDb` eklendi (R-PM8: `NOCREATEDB` iddiasının
//     katalog assert'i bugüne kadar SIFIRDI).
//   - `privileges`'e `roleName` eklendi; artık HEM `appRoleName` HEM
//     `authRoleName` için okunur (dizi sırası BİLEREK app → auth — `roles[]`
//     ile AYNI sıra, aşağıdaki GENİŞLET/TÜKET notuna bakın).
//   - İKİ YENİ KAYNAK: `columnPrivileges` (Kaynak A — `has_table_privilege`
//     + `has_column_privilege`, `public` şemasının TAMAMI, iki rol) ve
//     `columnGrants` (Kaynak B — `pg_attribute.attacl` + `aclexplode`, yalnızca
//     KOLON seviyesi hibeler). `information_schema.column_privileges`
//     KULLANILMADI — bu görünümün tablo seviyesi `GRANT`'leri kolon başına
//     genişletip genişletmediği ölçülemedi (architect KARAR, R-PM3).
//
// FIX turu 1 (security Tur 1 [medium] S-1 bulgusu) — ÜÇÜNCÜ YENİ KAYNAK:
// `tableGrants` (Kaynak C — `pg_class.relacl` + `aclexplode`, yalnızca TABLO
// seviyesi hibeler). Kaynak A (`has_table_privilege`) sadece İKİ ADLANDIRILMIŞ
// rolü sorgular; Kaynak B (`attacl`) yalnızca KOLON seviyesi hibeleri görür —
// ikisi de ÜÇÜNCÜ, adlandırılmış bir role verilen TABLO seviyesi bir hibeyi
// (örn. `GRANT SELECT ON public.account TO bi_reader`) GÖREMEZ (`security`'nin
// M1 mutasyonu bunu ÖLÇTÜ). Kaynak C bu boşluğu kapatır —
// `catalog-lint.ts`'teki `UNEXPECTED_TABLE_LEVEL_GRANTEE`'nin zemini.
//
// AMPİRİK ÖLÇÜLMÜŞ ASİMETRİ (canlı Postgres'te ölçüldü, Kaynak B'den FARKLI):
// `relacl`de tablo SAHİBİ `grantee` olarak GÖRÜNÜR (`attacl`in tersine — orada
// `owner_row_count = 0`); bir `GRANT`/`REVOKE` DDL'i bir tabloyu MATERYALİZE
// ettiği an, sahip rolün KENDİ (sekiz privilege_type'lık) ÖRTÜK yetkisi de
// AÇIK bir ACL satırına döner. Bu, `catalog-lint.ts`'in beklenen-grantee
// kümesine `table.tableOwner`'ı (literal DEĞİL, `snapshot.tables[].tableOwner`'dan)
// EKLEMESİNİN gerekçesidir — bkz. `catalog-lint.ts`'teki `lintTableGrantGrantees`.
//   - K-E5 AYRIMI KORUNUR: bu iki yeni sorgu da `public` şemasının TAMAMINI
//     okur — "hangi tablo sır taşıyor" sorusu BURADA YOKTUR, taksonomi
//     `catalog-lint.ts`'e (ST-C) PARAMETRE olarak geçer, bu dosyaya literal
//     GİRMEZ.
//   - `columnOnly := hasColumn && !hasTable` türetmesi KASITLI OLARAK bu
//     dosyada YAPILMAZ — bu bir YORUM (saf kural katmanının işi), bu dosya
//     yalnızca "ne var" (ham `hasTable*`/`hasColumn*` boolean'ları) sorusunu
//     yanıtlar (K-E5).
//
// GENİŞLET/TÜKET (expand/contract, TS TİPİ İÇİN) — TÜKETİM ADIMI TAMAMLANDI
// (ROADMAP v0.0.14.1, T-015/ST-C): ST-B tek rol alanını `roles[]` ile ÇİFT
// YAZARAK EKLEMİŞTİ (expand); `catalog-lint.ts` artık TEK rolü değil
// `snapshot.roles`'taki HER rolü değerlendiriyor (`lintRoleAttributes`/
// `lintRoleOwnsTable`) — bu yüzden eski tek-rol alanı BURADAN (tüketim/
// contract adımı) KALDIRILDI. Dışa açık TEK rol kaynağı artık `roles[]`'tır.
//
// FIX turu 2 (security Tur 2 [high] S-7 bulgusu) — DÖRDÜNCÜ YENİ KAYNAK:
// `unexpectedRelations` (Kaynak D — `pg_class` + `pg_namespace`, `public`
// şemasındaki `relkind IN ('v','m','f')` — view/materialized view/foreign
// table). ÖLÇÜLEN AÇIK: `readTables()` `pg_tables` görünümünü kullanır ve bu
// görünüm İNŞA GEREĞİ yalnızca `relkind IN ('r','p')`'i gösterir (ADR/ölçüm:
// Postgres kaynağı) — bir `CREATE VIEW public.<ad> AS SELECT … FROM
// public.account` migrator tarafından yazıldığı AN, `ALTER DEFAULT
// PRIVILEGES … ON TABLES` (bölüm 4, `bootstrap-roles.sql`) view/matview'ı DA
// KAPSADIĞI için `arkesoft_app`'e HİÇBİR `GRANT` yazılmadan `arwd` hibe
// olur — ve bu view `snapshot.tables`'TA GÖRÜNMEDİĞİ için NE
// `UNCLASSIFIED_TABLE` (katalog→taksonomi) NE başka bir kural bunu görür;
// view SAHİBİNİN yetkisiyle çalıştığı için kolon bazlı kısıtlamayı da
// BAYPAS eder. `UNEXPECTED_TABLE_LEVEL_GRANTEE`in beklenen kümesi
// `{appRoleName, authRoleName, tableOwner}` OLDUĞU için `arkesoft_app`
// KÜMEDE olduğundan Kaynak C'yi (`readTableGrants`) körlemesine
// genişletmek TEK BAŞINA YETMEZDİ (kural ATEŞLENMEZ) — bu yüzden Kaynak D
// BAĞIMSIZ bir okuyucu/kural olarak eklendi (`UNEXPECTED_RELATION_KIND`,
// `catalog-lint.ts`): taksonomi/grantee SORUSU SORMAZ, `public`te relkind
// `v`/`m`/`f` olan HER nesne (bugün SIFIR — ölçüldü) doğrudan bulgu üretir.
// `readTables()`/`readRowSecurity()`/`readColumns()` BİLEREK dokunulmadı
// (yanlış pozitif riski — RLS/indeks/`tenant_id` kuralları bir view için
// YANLIŞ ateşlenirdi, bkz. `catalog-lint.ts`'teki `lintUnexpectedRelationKinds`
// doc'u).
//
// FIX turu 2 (security Tur 2 [medium] S-9 bulgusu) — Kaynak C
// (`readTableGrants`) GENİŞLETİLDİ: `relkind = 'r'` → `relkind IN ('r', 'p')`
// — ÖLÇÜLEN ASİMETRİ: `pg_tables` (ve dolayısıyla `readTables()`)
// `relkind IN ('r', 'p')`'yi (sıradan TABLO + BÖLÜMLENMİŞ tablonun ebeveyni)
// kapsıyordu, Kaynak C yalnızca `'r'`yi sorguluyordu. Somut senaryo:
// `audit_log` ileride `PARTITION BY RANGE`'e çevrilirse (`relkind='p'`)
// taksonomide VAR olduğu için `UNCLASSIFIED_TABLE` sessiz kalırdı VE Kaynak
// C'nin görmediği bu tablo için adlandırılmış üçüncü bir role verilen tablo
// seviyesi hibe de (`UNEXPECTED_TABLE_LEVEL_GRANTEE`) GÖRÜLMEZDİ — S-1'in
// kapattığı sınıf bölümlenmiş tablolar için yeniden AÇILIRDI.
//
// FIX turu 3 (security Tur 3 [medium] S-15 bulgusu) — Kaynak E (fonksiyonlar)
// GENİŞLETİLDİ: eski `hasPublicExecute` (`has_function_privilege('public',…)`)
// yalnızca "hibe" eksenini (PUBLIC'e EXECUTE verilmiş mi) soruyordu — `REVOKE
// EXECUTE … FROM PUBLIC` + `GRANT EXECUTE … TO arkesoft_app` iki satırı
// `hasPublicExecute`'u `false`'a düşürüp bir `SECURITY DEFINER` fonksiyonu
// tespitten TAMAMEN KAÇIRIYORDU (canlı ölçüldü — `arkesoft_app` sıfır tablo
// yetkisiyle `account.password`'u bu yoldan okuyabiliyordu). İKİ YENİ ALAN
// EKLENDİ: `isSecurityDefiner` (`p.prosecdef` — "varlık" ekseni, grantee
// sorusundan BAĞIMSIZ) ve `functionExecuteGrantees` (`pg_proc.proacl` +
// `aclexplode` — "hibe" ekseninin Kaynak B/C'yle AYNI deseni, adlandırılmış
// bir grantee'yi TEŞHİS mesajında somutlaştırmak için). `readFunctionPrivileges`
// solid'in reçetesiyle `pg_proc`'un TEK okuyucusu KALDI — iki sorgu da AYNI
// fonksiyonun İÇİNDE, dışa açık ikinci bir `pg_proc` okuyucusu EKLENMEDİ;
// `pg_class`/`pg_proc` okuyucuları (Kaynak D/E) de BİRLEŞTİRİLMEDİ (farklı
// nedenlerle değişen, farklı çözümü olan iki eksen — solid'in 3. maddesi).

import { z } from 'zod'

import type { PrismaDatabase, TransactionClient } from './client.js'

// FIX turu 1 (solid [low] bulgusu): bu tip hiçbir DOSYA DIŞINDAN import
// edilmiyordu (`index.ts` da açmıyor) — `export` KALDIRILDI, dışa açma
// yüzeyi daraltıldı. Aynı gerekçeyle aşağıdaki `CatalogXRow` tipleri de
// artık dosya içi (paket-içi bile değil, MODÜL içi) kalıyor; dışarıdan
// gereken TEK tip `CatalogSnapshot`dır (aşağıda, dışa açık kalır).
/** Bu modülün ihtiyaç duyduğu minimal yüzey — tam istemci de transaction istemcisi de uyar. */
type CatalogQueryClient = PrismaDatabase | TransactionClient

const tableRowSchema = z.object({
  tableName: z.string(),
  tableOwner: z.string(),
})

const columnRowSchema = z.object({
  tableName: z.string(),
  columnName: z.string(),
  dataType: z.string(),
  isNullable: z.boolean(),
})

// FIX turu 1 (solid [medium] bulgusu — CLAUDE.md §4 is/has/can öneki):
// `rowSecurity`/`forceRowSecurity` Postgres kolon adını birebir YANSITMIYOR,
// SQL'de ZATEN `AS "isRowSecurityEnabled"`/`AS "isRowSecurityForced"` ile
// YENİDEN ADLANDIRILIYOR (aşağıdaki `readRowSecurity`) — "kolon adını
// koruyor" savunması tutmuyordu.
const rowSecurityRowSchema = z.object({
  tableName: z.string(),
  isRowSecurityEnabled: z.boolean(),
  isRowSecurityForced: z.boolean(),
})

const policyRowSchema = z.object({
  tableName: z.string(),
  policyName: z.string(),
  roles: z.array(z.string()),
  usingExpression: z.string().nullable(),
  withCheckExpression: z.string().nullable(),
})

const indexRowSchema = z.object({
  tableName: z.string(),
  indexName: z.string(),
  columns: z.array(z.string()).min(1),
})

/** T-015/ST-B: `canCreateDb` EKLENDİ (R-PM8 — `NOCREATEDB` iddiasının katalog assert'i). */
const roleRowSchema = z.object({
  roleName: z.string(),
  isSuperuser: z.boolean(),
  canBypassRls: z.boolean(),
  canCreateDb: z.boolean(),
})

/** T-015/ST-B: `roleName` EKLENDİ — artık `appRoleName` VE `authRoleName` için okunur. */
const privilegeRowSchema = z.object({
  roleName: z.string(),
  tableName: z.string(),
  canSelect: z.boolean(),
  canInsert: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
})

/**
 * T-015/ST-B, YENİ — Kaynak A (R-PM3/architect KARAR): bir (rol × tablo ×
 * kolon) üçlüsü için `has_table_privilege`/`has_column_privilege`'in ETKİN
 * yetki sonucu. `columnOnly := hasColumn && !hasTable` türetmesi BİLEREK
 * burada YOK (K-E5 — saf kural katmanının işi, bkz. dosya başı).
 */
const columnPrivilegeRowSchema = z.object({
  roleName: z.string(),
  tableName: z.string(),
  columnName: z.string(),
  hasTableSelect: z.boolean(),
  hasColumnSelect: z.boolean(),
  hasTableInsert: z.boolean(),
  hasColumnInsert: z.boolean(),
  hasTableUpdate: z.boolean(),
  hasColumnUpdate: z.boolean(),
})

/**
 * T-015/ST-B, YENİ — Kaynak B (R-PM3/architect KARAR): `pg_attribute.attacl`
 * + `aclexplode`'un BİLDİRİLMİŞ (declared) kolon seviyesi hibe satırı.
 * ST-A0③'ün ölçtüğü üç olgu (bağlayıcı): (1) `aclexplode` kolon adları
 * birebir `grantor`/`grantee`/`privilege_type`/`is_grantable`; (2) tablo
 * SAHİBİ `grantee` olarak ASLA görünmez (yalnızca `grantor`); (3)
 * `grantee = 0` (PUBLIC) → `::regrole::text` "`-`" (tire) döner, `"PUBLIC"`
 * veya `NULL` DEĞİL.
 */
const columnGrantRowSchema = z.object({
  tableName: z.string(),
  columnName: z.string(),
  grantor: z.string(),
  grantee: z.string(),
  privilegeType: z.string(),
  isGrantable: z.boolean(),
})

/**
 * FIX turu 1 (security Tur 1 [medium] S-1 bulgusu), YENİ — Kaynak C:
 * `pg_class.relacl` + `aclexplode`'un BİLDİRİLMİŞ TABLO seviyesi hibe satırı.
 * `columnGrantRowSchema`'nın BİREBİR deseni, `columnName` YOK (tablo seviyesi
 * — kolonla ilişkilendirilmez). Aynı üç ampirik olgu burada da GEÇERLİ
 * (dosya başı notu): `aclexplode` kolon adları birebir, `grantee = 0` →
 * `-` (tire), AMA tablo SAHİBİ `grantee` olarak GÖRÜNÜR (`attacl`in tersi —
 * bağlayıcı asimetri, `catalog-lint.ts`'e taşınır).
 */
const tableGrantRowSchema = z.object({
  tableName: z.string(),
  grantor: z.string(),
  grantee: z.string(),
  privilegeType: z.string(),
  isGrantable: z.boolean(),
})

/**
 * FIX turu 2 (security Tur 2 [high] S-7 bulgusu), YENİ — Kaynak D:
 * `pg_class` + `pg_namespace`'in `public` şemasındaki `relkind IN
 * ('v','m','f')` (view/materialized view/foreign table) satırları.
 * `relationKind` `z.enum` ile daraltılır (yalnızca üç harf BEKLENİR —
 * SQL'in `WHERE relkind IN (...)` filtresiyle BİREBİR); başka bir kind
 * sızarsa (sorgu yanlış yazılmış olurdu) `.parse()` FIRLATIR, sessizce
 * yutmaz. K-E5 KORUNUR: taksonomi/grantee sorusu BURADA YOKTUR — bu dosya
 * yalnızca "ne var" sorusunu yanıtlar, "beklenmiyor mu" sorusunu
 * `catalog-lint.ts`'teki `lintUnexpectedRelationKinds` yanıtlar.
 */
const unexpectedRelationRowSchema = z.object({
  relationName: z.string(),
  relationKind: z.enum(['v', 'm', 'f']),
})

/**
 * FIX turu 2 (security Tur 2 [medium] S-8 bulgusu), YENİ — Kaynak E:
 * `public` şemasındaki HER fonksiyon için `has_function_privilege('public',
 * …, 'EXECUTE')`'in sonucu. Bu tek sorgu `proacl IS NULL` (varsayılan,
 * PUBLIC dahil) VE açıkça `GRANT EXECUTE … TO PUBLIC` yazılmış durumların
 * İKİSİNİ de doğru yakalar — `has_function_privilege` NULL `proacl`'ı
 * ETKİN hesaba katar (ST-A0①'in `has_table_privilege` için ölçtüğü "etkin
 * yetki" deseniyle AYNI). K-E5 korunur: "beklenmiyor mu" sorusu BURADA
 * YOKTUR — `catalog-lint.ts`'teki `lintUnexpectedFunctionExecuteGrantees`
 * yanıtlar.
 *
 * FIX turu 3 (security Tur 3 [medium] S-15 bulgusu) — `isSecurityDefiner`
 * (`p.prosecdef`) EKLENDİ. `security`'nin ÖLÇTÜĞÜ kaçış yolu: `REVOKE
 * EXECUTE … FROM PUBLIC` + `GRANT EXECUTE … TO arkesoft_app` sonrası
 * `hasPublicExecute` ARTIK `false`'tur — bu iki satır bir `SECURITY DEFINER`
 * fonksiyonu tespitten TAMAMEN kaçırır (`arkesoft_app` sıfır tablo
 * yetkisiyle `account.password`'u okuma yolu KAZANIR). `isSecurityDefiner`
 * "varlık" eksenidir (solid'in ayrımı) — grantee/hibe sorusundan BAĞIMSIZ,
 * `prosecdef`in KENDİSİ. "Ne var" BURADA (okuyucu), "beklenmiyor mu" (bu
 * alan KOŞULSUZ bulgu üretir mi) `catalog-lint.ts`'teki
 * `lintUnexpectedSecurityDefinerFunctions`'ta — K-E5 korunur.
 */
const functionPrivilegeRowSchema = z.object({
  functionName: z.string(),
  hasPublicExecute: z.boolean(),
  isSecurityDefiner: z.boolean(),
})

/**
 * FIX turu 3 (security Tur 3 [medium] S-15 bulgusu), YENİ — Kaynak E'nin
 * "hibe" ekseni genişlemesi: `pg_proc.proacl` + `aclexplode`'un bildirilmiş
 * EXECUTE hibe satırı. `columnGrantRowSchema`/`tableGrantRowSchema`'nın
 * BİREBİR deseni (aynı üç ampirik olgu burada da GEÇERLİ sayılır — tablo/
 * kolon ACL'siyle AYNI `aclexplode` mekanizması). `functionName` TEKRAR
 * TAŞIR (bu satırlar `functionPrivileges`'e `functionName` ÜZERİNDEN eşlenir
 * — `readFunctionPrivileges` TEK okuyucu fonksiyon İÇİNDE, pg_proc'un
 * TEK sahibi kalır, solid'in K-E5 reçetesi).
 */
const functionExecuteGranteeRowSchema = z.object({
  functionName: z.string(),
  grantor: z.string(),
  grantee: z.string(),
  privilegeType: z.string(),
  isGrantable: z.boolean(),
})

type CatalogTableRow = z.infer<typeof tableRowSchema>
type CatalogColumnRow = z.infer<typeof columnRowSchema>
type CatalogRowSecurityRow = z.infer<typeof rowSecurityRowSchema>
type CatalogPolicyRow = z.infer<typeof policyRowSchema>
type CatalogIndexRow = z.infer<typeof indexRowSchema>
type CatalogRoleRow = z.infer<typeof roleRowSchema>
type CatalogPrivilegeRow = z.infer<typeof privilegeRowSchema>
type CatalogColumnPrivilegeRow = z.infer<typeof columnPrivilegeRowSchema>
type CatalogColumnGrantRow = z.infer<typeof columnGrantRowSchema>
type CatalogTableGrantRow = z.infer<typeof tableGrantRowSchema>
type CatalogUnexpectedRelationRow = z.infer<typeof unexpectedRelationRowSchema>
type CatalogFunctionPrivilegeRow = z.infer<typeof functionPrivilegeRowSchema>
type CatalogFunctionExecuteGranteeRow = z.infer<typeof functionExecuteGranteeRowSchema>

/**
 * `public` şemasının canlı anlık görüntüsü. `catalog-lint.ts`'in GİRDİSİ.
 * Tamamı Zod ile doğrulanmış, `unknown`'dan daraltılmış veridir.
 */
export type CatalogSnapshot = {
  readonly tables: readonly CatalogTableRow[]
  readonly columns: readonly CatalogColumnRow[]
  readonly rowSecurity: readonly CatalogRowSecurityRow[]
  readonly policies: readonly CatalogPolicyRow[]
  readonly indexes: readonly CatalogIndexRow[]
  /** T-015/ST-B, YENİ — `appRoleName` VE `authRoleName`, bu sırayla. */
  readonly roles: readonly CatalogRoleRow[]
  readonly privileges: readonly CatalogPrivilegeRow[]
  /** T-015/ST-B, YENİ — Kaynak A. */
  readonly columnPrivileges: readonly CatalogColumnPrivilegeRow[]
  /** T-015/ST-B, YENİ — Kaynak B. */
  readonly columnGrants: readonly CatalogColumnGrantRow[]
  /** FIX turu 1 (security Tur 1 [medium] S-1), YENİ — Kaynak C. */
  readonly tableGrants: readonly CatalogTableGrantRow[]
  /** FIX turu 2 (security Tur 2 [high] S-7), YENİ — Kaynak D. */
  readonly unexpectedRelations: readonly CatalogUnexpectedRelationRow[]
  /** FIX turu 2 (security Tur 2 [medium] S-8), YENİ — Kaynak E. */
  readonly functionPrivileges: readonly CatalogFunctionPrivilegeRow[]
  /** FIX turu 3 (security Tur 3 [medium] S-15), YENİ — Kaynak E'nin hibe ekseni (`proacl`). */
  readonly functionExecuteGrantees: readonly CatalogFunctionExecuteGranteeRow[]
}

/** `readCatalogSnapshot`'ın girdisi — T-015/ST-B: dize parametre → options nesnesi. */
export type ReadCatalogSnapshotOptions = {
  readonly appRoleName: string
  readonly authRoleName: string
}

/**
 * `public` şemasındaki tabloları ve sahiplerini okur. `UNCLASSIFIED_TABLE`/
 * `APP_ROLE_OWNS_TABLE` kurallarının zemini.
 */
async function readTables(client: CatalogQueryClient): Promise<readonly CatalogTableRow[]> {
  const rows = await client.$queryRaw`
    SELECT tablename::text AS "tableName", tableowner::text AS "tableOwner"
    FROM pg_tables
    WHERE schemaname = 'public'
  `
  return z.array(tableRowSchema).parse(rows)
}

/**
 * `public` şemasındaki TÜM kolonları okur (yalnızca `tenant_id` değil) —
 * `TENANT_ID_WITHOUT_TAXONOMY_ENTRY`/`TENANT_ID_ON_PLATFORM_TABLE` kuralları
 * her tablonun tüm kolon kümesini görmek zorunda (R-C2'nin kapandığı yer).
 */
async function readColumns(client: CatalogQueryClient): Promise<readonly CatalogColumnRow[]> {
  const rows = await client.$queryRaw`
    SELECT
      table_name::text AS "tableName",
      column_name::text AS "columnName",
      data_type::text AS "dataType",
      (is_nullable = 'YES') AS "isNullable"
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `
  return z.array(columnRowSchema).parse(rows)
}

/** `pg_class.relrowsecurity`/`relforcerowsecurity` — `RLS_NOT_ENABLED`/`RLS_NOT_FORCED`'ın zemini. */
async function readRowSecurity(
  client: CatalogQueryClient,
): Promise<readonly CatalogRowSecurityRow[]> {
  const rows = await client.$queryRaw`
    SELECT
      c.relname::text AS "tableName",
      c.relrowsecurity AS "isRowSecurityEnabled",
      c.relforcerowsecurity AS "isRowSecurityForced"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `
  return z.array(rowSecurityRowSchema).parse(rows)
}

/**
 * `pg_policies` — insan-okunur `qual`/`with_check` metnini zaten çözülmüş
 * döner (ham `pg_policy.polqual`'in `nodeToString` dökümü DEĞİL).
 * `MISSING_TENANT_POLICY`/`POLICY_MISSING_WITH_CHECK`/`POLICY_USING_NOT_CANONICAL`/
 * `POLICY_WITH_CHECK_NOT_CANONICAL`/`POLICY_RESTRICTED_TO_ROLE`'ün zemini
 * (FIX turu 2, K-E5 revizyonu — eski adlar `POLICY_USING_WRONG_SETTING`/
 * `POLICY_WITH_CHECK_WRONG_SETTING`).
 */
async function readPolicies(client: CatalogQueryClient): Promise<readonly CatalogPolicyRow[]> {
  const rows = await client.$queryRaw`
    SELECT
      tablename::text AS "tableName",
      policyname::text AS "policyName",
      roles::text[] AS "roles",
      qual::text AS "usingExpression",
      with_check::text AS "withCheckExpression"
    FROM pg_policies
    WHERE schemaname = 'public'
  `
  return z.array(policyRowSchema).parse(rows)
}

/**
 * Her indeksin kolonlarını POZİSYON SIRASIYLA döner (`unnest(... WITH
 * ORDINALITY)`) — `MISSING_TENANT_ID_LEADING_INDEX`'in "öncü kolon" iddiası
 * sıraya bağımlı, `array_agg` sırasız gelirse yanlış pozitif/negatif üretir.
 */
async function readIndexes(client: CatalogQueryClient): Promise<readonly CatalogIndexRow[]> {
  const rows = await client.$queryRaw`
    SELECT
      t.relname::text AS "tableName",
      i.relname::text AS "indexName",
      array_agg(a.attname::text ORDER BY k.ord) AS "columns"
    FROM pg_index ix
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN LATERAL unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE ns.nspname = 'public'
    GROUP BY t.relname, i.relname
  `
  return z.array(indexRowSchema).parse(rows)
}

/**
 * Verilen rol adının `pg_roles` kaydını okur. `roleName` BAĞLI PARAMETRE
 * olarak geçer (dize birleştirme yok). T-015/ST-B: eskiden `readAppRole`
 * olarak tek rolü okuyordu — ARTIK genel: `readCatalogSnapshot` bunu HEM
 * `appRoleName` HEM `authRoleName` için çağırır (`APP_ROLE_IS_SUPERUSER_OR_
 * BYPASSRLS`'in — ST-C'nin tadilinden sonra iki rol için de — zemini).
 *
 * @throws Rol `pg_roles`'ta bulunamazsa (ortam bozuksa fail-closed; bu,
 *   `catalog-lint.ts`'in kurallarından biri DEĞİL — bootstrap'ın hiç
 *   koşmadığı bir ortamda anlamlı bir hatayla erken durmak için).
 */
async function readRole(client: CatalogQueryClient, roleName: string): Promise<CatalogRoleRow> {
  const rows = await client.$queryRaw`
    SELECT
      rolname::text AS "roleName",
      rolsuper AS "isSuperuser",
      rolbypassrls AS "canBypassRls",
      rolcreatedb AS "canCreateDb"
    FROM pg_roles
    WHERE rolname = ${roleName}
  `
  const parsed = z.array(roleRowSchema).parse(rows)
  const role = parsed[0]
  if (role === undefined) {
    throw new Error(
      `readCatalogSnapshot(): rol "pg_roles"ta bulunamadı: "${roleName}" — bootstrap koşmamış olabilir.`,
    )
  }
  return role
}

/**
 * Her tablo için verilen `roleName`'in SELECT/INSERT/UPDATE/DELETE yetkisini
 * `has_table_privilege()` ile sorar (grant görünürlüğü `information_schema.
 * role_table_grants`'in grantor kısıtlarına TABİ DEĞİLDİR — `has_table_privilege`
 * doğrudan etkin yetkiyi sorar). `APP_ROLE_MISSING_DML_PRIVILEGE`'ın zemini.
 * T-015/ST-B: çıktıya `roleName` eklendi — `readCatalogSnapshot` bunu HEM
 * `appRoleName` HEM `authRoleName` için çağırıp sonuçları BİRLEŞTİRİR.
 */
async function readPrivileges(
  client: CatalogQueryClient,
  roleName: string,
): Promise<readonly CatalogPrivilegeRow[]> {
  const rows = await client.$queryRaw`
    SELECT
      ${roleName}::text AS "roleName",
      tablename::text AS "tableName",
      has_table_privilege(${roleName}, format('%I.%I', schemaname, tablename), 'SELECT') AS "canSelect",
      has_table_privilege(${roleName}, format('%I.%I', schemaname, tablename), 'INSERT') AS "canInsert",
      has_table_privilege(${roleName}, format('%I.%I', schemaname, tablename), 'UPDATE') AS "canUpdate",
      has_table_privilege(${roleName}, format('%I.%I', schemaname, tablename), 'DELETE') AS "canDelete"
    FROM pg_tables
    WHERE schemaname = 'public'
  `
  return z.array(privilegeRowSchema).parse(rows)
}

/**
 * T-015/ST-B, YENİ — Kaynak A (R-PM3/architect KARAR): verilen `roleName`'in
 * `public` şemasının TÜM (tablo × kolon) çiftleri için ETKİN
 * SELECT/INSERT/UPDATE yetkisini `has_table_privilege` VE `has_column_
 * privilege` ile okur. K-E5: taksonomi (hangi tablo sır taşıyor) BURAYA
 * GEÇMEZ — `public` şemasının TAMAMI okunur, sınıflandırma saf kural
 * katmanının (ST-C) işidir.
 *
 * `columnOnly := hasColumn && !hasTable` türetmesi BİLEREK burada YOK —
 * tablo yetkisi varken `has_column_privilege`'in de `true` dönmesi
 * (ST-A0① ampirik ölçümü) bu fonksiyonun ham çıktısıdır, YORUMU değil.
 */
async function readColumnPrivilegesForRole(
  client: CatalogQueryClient,
  roleName: string,
): Promise<readonly CatalogColumnPrivilegeRow[]> {
  const rows = await client.$queryRaw`
    SELECT
      ${roleName}::text AS "roleName",
      table_name::text AS "tableName",
      column_name::text AS "columnName",
      has_table_privilege(${roleName}, format('%I.%I', 'public', table_name), 'SELECT') AS "hasTableSelect",
      has_column_privilege(${roleName}, format('%I.%I', 'public', table_name), column_name, 'SELECT') AS "hasColumnSelect",
      has_table_privilege(${roleName}, format('%I.%I', 'public', table_name), 'INSERT') AS "hasTableInsert",
      has_column_privilege(${roleName}, format('%I.%I', 'public', table_name), column_name, 'INSERT') AS "hasColumnInsert",
      has_table_privilege(${roleName}, format('%I.%I', 'public', table_name), 'UPDATE') AS "hasTableUpdate",
      has_column_privilege(${roleName}, format('%I.%I', 'public', table_name), column_name, 'UPDATE') AS "hasColumnUpdate"
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `
  return z.array(columnPrivilegeRowSchema).parse(rows)
}

/** `readColumnPrivilegesForRole`'u verilen rol adlarının HER biri için çağırıp birleştirir. */
async function readColumnPrivileges(
  client: CatalogQueryClient,
  roleNames: readonly string[],
): Promise<readonly CatalogColumnPrivilegeRow[]> {
  const rows: CatalogColumnPrivilegeRow[] = []
  for (const roleName of roleNames) {
    rows.push(...(await readColumnPrivilegesForRole(client, roleName)))
  }
  return rows
}

/**
 * T-015/ST-B, YENİ — Kaynak B (R-PM3/architect KARAR): `pg_attribute.attacl`
 * + `aclexplode`, `public` şemasının TAMAMI (K-E5 — taksonomi literal
 * GİRMEZ). Yalnızca KOLON seviyesi hibeleri taşır (tablo seviyesi
 * `pg_class.relacl`'de yaşar — bu sorgunun KONUSU DEĞİL).
 *
 * ST-A0③'ün ölçtüğü üç olgu (bağlayıcı, dosya başı notuna bakın): tablo
 * sahibi `grantee` olarak GÖRÜNMEZ, `aclexplode` kolon adları birebir
 * `grantor`/`grantee`/`privilege_type`/`is_grantable`, PUBLIC → `-`.
 * `aclexplode(a.attacl)` TEK kez `CROSS JOIN LATERAL` ile çağrılır — SELECT
 * listesinde AYNI küme-döndüren ifadeyi birden fazla kez çağırmak yerine
 * (her çağrı BAĞIMSIZ değerlendirilebilir) tek bir lateral satır kümesi
 * üretilir ve alanları o kümeden okunur.
 */
async function readColumnGrants(
  client: CatalogQueryClient,
): Promise<readonly CatalogColumnGrantRow[]> {
  const rows = await client.$queryRaw`
    SELECT
      c.relname::text AS "tableName",
      a.attname::text AS "columnName",
      grant_info.grantor::regrole::text AS "grantor",
      grant_info.grantee::regrole::text AS "grantee",
      grant_info.privilege_type::text AS "privilegeType",
      grant_info.is_grantable AS "isGrantable"
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) AS grant_info
    WHERE n.nspname = 'public'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attacl IS NOT NULL
  `
  return z.array(columnGrantRowSchema).parse(rows)
}

/**
 * FIX turu 1 (security Tur 1 [medium] S-1 bulgusu), YENİ — Kaynak C:
 * `pg_class.relacl` + `aclexplode`, `public` şemasının TAMAMI (K-E5 —
 * taksonomi literal GİRMEZ, `readColumnGrants` ile AYNI desen). Yalnızca
 * TABLO seviyesi hibeleri taşır (kolon seviyesi hibe `pg_attribute.attacl`de
 * yaşar — Kaynak B'nin konusu, BU sorgunun DEĞİL).
 *
 * `c.relacl IS NOT NULL` koruması defansif — `aclexplode(NULL)` canlı
 * Postgres'te ölçüldü: hata FIRLATMAZ, sıfır satır döner (lateral join NULL
 * girdiyle boş küme üretir); filtre bu sorguyu `relacl` henüz
 * MATERYALİZE edilmemiş (hiç `GRANT`/`REVOKE` uygulanmamış, yalnızca
 * varsayılan sahip yetkisi geçerli) bir tablo için gereksiz LATERAL'den
 * muaf tutar.
 */
async function readTableGrants(
  client: CatalogQueryClient,
): Promise<readonly CatalogTableGrantRow[]> {
  const rows = await client.$queryRaw`
    SELECT
      c.relname::text AS "tableName",
      grant_info.grantor::regrole::text AS "grantor",
      grant_info.grantee::regrole::text AS "grantee",
      grant_info.privilege_type::text AS "privilegeType",
      grant_info.is_grantable AS "isGrantable"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) AS grant_info
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relacl IS NOT NULL
  `
  return z.array(tableGrantRowSchema).parse(rows)
}

/**
 * FIX turu 2 (security Tur 2 [high] S-7 bulgusu), YENİ — Kaynak D:
 * `public` şemasındaki `relkind IN ('v','m','f')` (view/materialized
 * view/foreign table) nesnelerinin TAMAMI — dosya başı notu. Bu sorgu
 * BİLEREK `readTables()`/`readRowSecurity()`/`readColumns()`'tan AYRIDIR:
 * onları genişletmek RLS/indeks/`tenant_id` kurallarının bir view için
 * YANLIŞ ateşlenmesine (view'da bunların HİÇBİRİ yapısal olarak YOKTUR)
 * yol açardı. Taksonomi/grantee sorusu BURADA YOKTUR (K-E5) — "bu nesne
 * beklenmiyor mu" sorusunu `catalog-lint.ts`'teki
 * `lintUnexpectedRelationKinds` saf fonksiyonu yanıtlar.
 */
async function readUnexpectedRelations(
  client: CatalogQueryClient,
): Promise<readonly CatalogUnexpectedRelationRow[]> {
  const rows = await client.$queryRaw`
    SELECT
      c.relname::text AS "relationName",
      c.relkind::text AS "relationKind"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm', 'f')
  `
  return z.array(unexpectedRelationRowSchema).parse(rows)
}

/**
 * FIX turu 2 (security Tur 2 [medium] S-8 bulgusu), YENİ — Kaynak E: dosya
 * başı notu. `has_function_privilege('public', p.oid, 'EXECUTE')` kullanır
 * (fonksiyon adı yerine `oid` — isim ÇAKIŞABİLİR/overload edilebilir,
 * `%I`/dize birleştirme GEREKMEZ).
 *
 * AMPİRİK ÖLÇÜM (bkz. `sql/bootstrap-roles.sql` bölüm 8'in BAĞLAYICI notu):
 * `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
 * PUBLIC'ten ÖNCE hiç `GRANT` yazılmamış bir (rol, şema, 'f') üçlüsünde
 * HİÇBİR KATALOG SATIRI üretmiyor (canlı Postgres 17.11'de BEŞ bağımsız
 * denemeyle ölçüldü) — yani `public`e eklenecek bir SONRAKİ fonksiyonun
 * varsayılanını veritabanı seviyesinde fail-closed yapmak bu sürümde
 * YAPISAL OLARAK mümkün DEĞİL. Bu yüzden bu okuyucu TESPİT (b) rolünü
 * üstlenir — kapatma (a) yalnızca MEVCUT fonksiyonlar için uygulanabildi
 * (bootstrap bölüm 8).
 */
/**
 * FIX turu 3 (security Tur 3 [medium] S-15 bulgusu) — dönüş tipi
 * `CatalogFunctionPrivilegeRow[]`'dan BİR NESNEYE genişledi: `{
 * functionPrivileges, functionExecuteGrantees }`. `readFunctionPrivileges`
 * HÂLÂ `pg_proc`'un TEK okuyucusu (solid'in reçetesi, K-E5) — iki AYRI
 * SORGU çalıştırır (dosya başı stil notu: "tek büyük JOIN DEĞİL, her biri
 * bağımsız Zod şemasıyla"), ama ikisi de BU fonksiyonun İÇİNDE kalır; dosya
 * dışına açık, `pg_proc`'u sorgulayan İKİNCİ bir fonksiyon YOKTUR.
 */
async function readFunctionPrivileges(client: CatalogQueryClient): Promise<{
  functionPrivileges: readonly CatalogFunctionPrivilegeRow[]
  functionExecuteGrantees: readonly CatalogFunctionExecuteGranteeRow[]
}> {
  const privilegeRows = await client.$queryRaw`
    SELECT
      p.proname::text AS "functionName",
      has_function_privilege('public', p.oid, 'EXECUTE') AS "hasPublicExecute",
      p.prosecdef AS "isSecurityDefiner"
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  `
  const granteeRows = await client.$queryRaw`
    SELECT
      p.proname::text AS "functionName",
      grant_info.grantor::regrole::text AS "grantor",
      grant_info.grantee::regrole::text AS "grantee",
      grant_info.privilege_type::text AS "privilegeType",
      grant_info.is_grantable AS "isGrantable"
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) AS grant_info
    WHERE n.nspname = 'public' AND p.proacl IS NOT NULL
  `
  return {
    functionPrivileges: z.array(functionPrivilegeRowSchema).parse(privilegeRows),
    functionExecuteGrantees: z.array(functionExecuteGranteeRowSchema).parse(granteeRows),
  }
}

/**
 * `public` şemasının TAM anlık görüntüsünü okur. Birden çok ayrı sorgu
 * ÇALIŞTIRIR (tek büyük JOIN DEĞİL) — her biri bağımsız Zod şemasıyla
 * doğrulanır, böylece bir sorgunun şekli bozulursa hata o sorguya işaret
 * eder, diğer verileri de bulanıklaştırmaz.
 *
 * T-015/ST-B: imza `(client, appRoleName)` → `(client, { appRoleName,
 * authRoleName })` olarak DEĞİŞTİ (paket-içi). Rol/yetki/kolon-yetkisi
 * sorguları artık HEM `appRoleName` HEM `authRoleName` için çalıştırılır —
 * `privileges`'te dizi sırası BİLEREK app → auth (dosya başı "GENİŞLET/
 * TÜKET" notu: `catalog-lint.ts`'in ST-C'ye kadar DEĞİŞMEYEN `.find(tableName)`
 * araması böylece app rolünün satırını BULMAYA devam eder).
 *
 * `client` hem tam istemci (`PrismaDatabase`, sağlıklı-durum okuması) hem
 * transaction istemcisi (`TransactionClient`, AC3'ün `$transaction` içindeki
 * probu — K-E11) olabilir.
 */
export async function readCatalogSnapshot(
  client: CatalogQueryClient,
  options: ReadCatalogSnapshotOptions,
): Promise<CatalogSnapshot> {
  const { appRoleName, authRoleName } = options

  const tables = await readTables(client)
  const columns = await readColumns(client)
  const rowSecurity = await readRowSecurity(client)
  const policies = await readPolicies(client)
  const indexes = await readIndexes(client)

  // Sıra BİLEREK app → auth (bkz. dosya başı "GENİŞLET/TÜKET" notu) — ara
  // değişken YOK, tek kaynak `roles[]`.
  const roles = [await readRole(client, appRoleName), await readRole(client, authRoleName)]

  // Sıra BİLEREK app → auth (bkz. dosya başı "GENİŞLET/TÜKET" notu).
  const appPrivileges = await readPrivileges(client, appRoleName)
  const authPrivileges = await readPrivileges(client, authRoleName)
  const privileges = [...appPrivileges, ...authPrivileges]

  const columnPrivileges = await readColumnPrivileges(client, [appRoleName, authRoleName])
  const columnGrants = await readColumnGrants(client)
  const tableGrants = await readTableGrants(client)
  const unexpectedRelations = await readUnexpectedRelations(client)
  const { functionPrivileges, functionExecuteGrantees } = await readFunctionPrivileges(client)

  return {
    tables,
    columns,
    rowSecurity,
    policies,
    indexes,
    roles,
    privileges,
    columnPrivileges,
    columnGrants,
    tableGrants,
    unexpectedRelations,
    functionPrivileges,
    functionExecuteGrantees,
  }
}
