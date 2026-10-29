// @arkesoft/db — canlı Postgres kataloğunun anlık görüntüsü (ROADMAP v0.0.13,
// T-005/S4, architect K-E1/K-E5)
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
// bir stil tercihi DEĞİL, çalışma zamanı zorunluluğudur.
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

import { z } from 'zod'

import type { PrismaDatabase, TransactionClient } from './client.js'

// FIX turu 1 (solid [low] bulgusu): bu tip hiçbir DOSYA DIŞINDAN import
// edilmiyordu (`index.ts` da açmıyor) — `export` KALDIRILDI, dışa açma
// yüzeyi daraltıldı. Aynı gerekçeyle aşağıdaki yedi `CatalogXRow` tipi de
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

const roleRowSchema = z.object({
  roleName: z.string(),
  isSuperuser: z.boolean(),
  canBypassRls: z.boolean(),
})

const privilegeRowSchema = z.object({
  tableName: z.string(),
  canSelect: z.boolean(),
  canInsert: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
})

type CatalogTableRow = z.infer<typeof tableRowSchema>
type CatalogColumnRow = z.infer<typeof columnRowSchema>
type CatalogRowSecurityRow = z.infer<typeof rowSecurityRowSchema>
type CatalogPolicyRow = z.infer<typeof policyRowSchema>
type CatalogIndexRow = z.infer<typeof indexRowSchema>
type CatalogRoleRow = z.infer<typeof roleRowSchema>
type CatalogPrivilegeRow = z.infer<typeof privilegeRowSchema>

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
  readonly appRole: CatalogRoleRow
  readonly privileges: readonly CatalogPrivilegeRow[]
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
 * Verilen rol adının `pg_roles` kaydını okur. `appRoleName` BAĞLI PARAMETRE
 * olarak geçer (dize birleştirme yok) — `APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS`'in zemini.
 *
 * @throws Rol `pg_roles`'ta bulunamazsa (ortam bozuksa fail-closed; bu,
 *   `catalog-lint.ts`'in 20 kuralından biri DEĞİL — bootstrap'ın hiç
 *   koşmadığı bir ortamda anlamlı bir hatayla erken durmak için).
 */
async function readAppRole(
  client: CatalogQueryClient,
  appRoleName: string,
): Promise<CatalogRoleRow> {
  const rows = await client.$queryRaw`
    SELECT rolname::text AS "roleName", rolsuper AS "isSuperuser", rolbypassrls AS "canBypassRls"
    FROM pg_roles
    WHERE rolname = ${appRoleName}
  `
  const parsed = z.array(roleRowSchema).parse(rows)
  const role = parsed[0]
  if (role === undefined) {
    throw new Error(
      `readCatalogSnapshot(): rol "pg_roles"ta bulunamadı: "${appRoleName}" — bootstrap koşmamış olabilir.`,
    )
  }
  return role
}

/**
 * Her tablo için `appRoleName`'in SELECT/INSERT/UPDATE/DELETE yetkisini
 * `has_table_privilege()` ile sorar (grant görünürlüğü `information_schema.
 * role_table_grants`'in grantor kısıtlarına TABİ DEĞİLDİR — `has_table_privilege`
 * doğrudan etkin yetkiyi sorar). `APP_ROLE_MISSING_DML_PRIVILEGE`'ın zemini.
 */
async function readPrivileges(
  client: CatalogQueryClient,
  appRoleName: string,
): Promise<readonly CatalogPrivilegeRow[]> {
  const rows = await client.$queryRaw`
    SELECT
      tablename::text AS "tableName",
      has_table_privilege(${appRoleName}, format('%I.%I', schemaname, tablename), 'SELECT') AS "canSelect",
      has_table_privilege(${appRoleName}, format('%I.%I', schemaname, tablename), 'INSERT') AS "canInsert",
      has_table_privilege(${appRoleName}, format('%I.%I', schemaname, tablename), 'UPDATE') AS "canUpdate",
      has_table_privilege(${appRoleName}, format('%I.%I', schemaname, tablename), 'DELETE') AS "canDelete"
    FROM pg_tables
    WHERE schemaname = 'public'
  `
  return z.array(privilegeRowSchema).parse(rows)
}

/**
 * `public` şemasının TAM anlık görüntüsünü okur. Yedi ayrı sorgu ÇALIŞTIRIR
 * (tek büyük JOIN DEĞİL) — her biri bağımsız Zod şemasıyla doğrulanır,
 * böylece bir sorgunun şekli bozulursa hata o sorguya işaret eder, diğer
 * altı veriyi de bulanıklaştırmaz.
 *
 * `client` hem tam istemci (`PrismaDatabase`, sağlıklı-durum okuması) hem
 * transaction istemcisi (`TransactionClient`, AC3'ün `$transaction` içindeki
 * probu — K-E11) olabilir.
 */
export async function readCatalogSnapshot(
  client: CatalogQueryClient,
  appRoleName: string,
): Promise<CatalogSnapshot> {
  const tables = await readTables(client)
  const columns = await readColumns(client)
  const rowSecurity = await readRowSecurity(client)
  const policies = await readPolicies(client)
  const indexes = await readIndexes(client)
  const appRole = await readAppRole(client, appRoleName)
  const privileges = await readPrivileges(client, appRoleName)

  return { tables, columns, rowSecurity, policies, indexes, appRole, privileges }
}
