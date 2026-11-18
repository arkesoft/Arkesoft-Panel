// @arkesoft/db — denetim izi EKLE-SAL (append-only) sertleştirmesinin CANLI
// kanıtı (ROADMAP v0.0.20.2, T-023/S6, architect K5/AC-13/AC-17, kullanıcı
// kararı 2026-11-17).
//
// CANLI VERİTABANI GEREKTİRİR — `*.isolation.test.ts` deseni
// (`vitest.isolation.config.ts`), `pnpm test` hattında KOŞMAZ.
//
// ⚠⚠ ANTİ-VAKUM (architect, bağlayıcı): TEK sorgu İKİ HEDEF (`audit_log`,
// `platform_audit_log`) + BİR KONTROL tablosu (`tenant_membership`) için
// `has_table_privilege` okur. "0 satır" GEÇMEZ — `toHaveLength(3)` bunu
// mekanik olarak kapatır. Kontrol tablosunun DÖRDÜ de `true` dönmesi probun
// KENDİSİNİN boşa çıkmadığının kanıtıdır (eğer prob yanlış yazılmışsa ve
// HER satır `false` dönseydi, denetim tablolarının `false` olması "doğru
// davranış" değil "sorgu bozuk" anlamına gelebilirdi — kontrol tablosu bu
// ihtimali kapatır).
//
// `has_table_privilege` SORGUSU `arkesoft_migrator` (testMigrationPrisma)
// BAĞLANTISIYLA çalıştırılır — `catalog-lint-live.isolation.test.ts`'in
// AYNI deseni (katalog introspection'ı, tenant VERİSİNE dokunmaz).
// `has_table_privilege(rolename, ...)` PostgreSQL'de BAĞLANAN rolden
// BAĞIMSIZ, hedef ROLÜN (`arkesoft_app`) ACL'ini okur — bu yüzden
// `arkesoft_app` olarak BAĞLANMAYA gerek YOKTUR.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { testMigrationPrisma } from './helpers/test-client.js'

const APP_ROLE_NAME = 'arkesoft_app'

const privilegeProbeRowSchema = z.object({
  tableName: z.string(),
  canSelect: z.boolean(),
  canInsert: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
  canTruncate: z.boolean(),
})

type PrivilegeProbeRow = z.infer<typeof privilegeProbeRowSchema>

describe('audit_log / platform_audit_log — EKLE-SAL (append-only) canlı kanıtı (AC-13/AC-17)', () => {
  it('arkesoft_app: iki denetim tablosunda UPDATE/DELETE/TRUNCATE YOK, kontrol tablosunda (tenant_membership) DÖRDÜ DE VAR', async () => {
    const rawRows = await testMigrationPrisma.$queryRaw`
      SELECT
        "tableName",
        has_table_privilege(${APP_ROLE_NAME}, 'public.' || "tableName", 'SELECT')   AS "canSelect",
        has_table_privilege(${APP_ROLE_NAME}, 'public.' || "tableName", 'INSERT')   AS "canInsert",
        has_table_privilege(${APP_ROLE_NAME}, 'public.' || "tableName", 'UPDATE')   AS "canUpdate",
        has_table_privilege(${APP_ROLE_NAME}, 'public.' || "tableName", 'DELETE')   AS "canDelete",
        has_table_privilege(${APP_ROLE_NAME}, 'public.' || "tableName", 'TRUNCATE') AS "canTruncate"
      FROM (VALUES ('audit_log'), ('platform_audit_log'), ('tenant_membership')) v("tableName")
    `

    const rows: readonly PrivilegeProbeRow[] = z.array(privilegeProbeRowSchema).parse(rawRows)

    // ⚠⚠ ANTİ-VAKUM — "0 satır" GEÇEMEZ.
    expect(rows).toHaveLength(3)

    const rowByTable = new Map(rows.map((row) => [row.tableName, row] as const))

    const auditLogRow = rowByTable.get('audit_log')
    expect(auditLogRow).toEqual({
      tableName: 'audit_log',
      canSelect: true,
      canInsert: true,
      canUpdate: false,
      canDelete: false,
      canTruncate: false,
    })

    const platformAuditLogRow = rowByTable.get('platform_audit_log')
    expect(platformAuditLogRow).toEqual({
      tableName: 'platform_audit_log',
      canSelect: true,
      canInsert: true,
      canUpdate: false,
      canDelete: false,
      canTruncate: false,
    })

    // KONTROL TABLOSU (`tenant_membership`) — dört DML'in DÖRDÜ DE `true`:
    // probun kendisinin "her şeyi false döndüren bozuk bir sorgu" OLMADIĞININ
    // kanıtı. `tenant_membership` `REVOKE`'un hedefi DEĞİL, bu yüzden
    // bölüm 4'ün blanket GRANT'i hâlâ geçerli olmalı.
    const controlRow = rowByTable.get('tenant_membership')
    expect(controlRow).toEqual({
      tableName: 'tenant_membership',
      canSelect: true,
      canInsert: true,
      canUpdate: true,
      canDelete: true,
      canTruncate: false,
    })
  })
})
