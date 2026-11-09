// @arkesoft/api — AC6 (birinci yarı): denetim kaydı `diff` YAZMA KAPISI
// (ROADMAP v0.0.14, T-014/S5, architect K-A2 · A-DB1)
//
// Bu dosya kapının ÜÇ iddiasını ölçer:
//   1. Sır/PII taşıyan FAZLA anahtarlar kayda GİRMEZ (`z.object`'in soyma
//      davranışı) — eylem sözlüğünün (bugün BEŞ üye) HEPSİ için, eylem
//      listesi ve alan listesi
//      KAYNAKTAN OKUNARAK (tek bir alan adı bile bu dosyada kopyalanmaz).
//   2. EKSİK/bozuk anahtar sessizce geçmez, FIRLATIR (`parse`, `safeParse`
//      DEĞİL) — bozuk bir denetim izi yazmak, izin varlık sebebini ortadan
//      kaldırır.
//   3. `subject` kolonu eylem başına ADIYLA ANILAN alandan okunur (A-DB1) ve
//      `user_agent` kapıda KIRPILIR (sınır çağıranda değil, kapıda yaşar).
//
// ⚠ BU DOSYA HİÇBİR SABİTİ KOPYALAMAZ: eylem sözlüğü, alan adları, `subject`
// eşlemesi ve uzunluk sınırı kaynaktan IMPORT edilir. Kopyalanmış bir beklenti
// sabit değiştiğinde sessizce yanlışlanır (T-013'ün ana dersi).
//
// ⚠ BU DOSYA OTURUM AÇMAZ: denetim kaydı tablosunun `actor_user_id` kolonu
// yabancı anahtar TAŞIMAZ (veri modelinin yazılı kararı — denetim izi
// aktörden uzun yaşar), bu yüzden kapı gerçek bir hesap olmadan ölçülebilir.
// Kiracı ise GERÇEK olmak zorundadır: tabloda FORCE RLS etkin ve satırın
// `tenant_id`'sini doğrulayan şey politikanın `WITH CHECK` yüklemidir.

import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { TenantStatus } from '@arkesoft/db'
import type { TenantTransactionClient } from '@arkesoft/db'
import type { InvitableRoleWire } from '@arkesoft/trpc'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  AUDIT_DIFF_SCHEMA_BY_ACTION,
  AUDIT_SUBJECT_FIELD_BY_ACTION,
  resolveAuditSubject,
} from '../audit/audit-diff.schemas.js'
import type { AuditAction, AuditDiffValue, AuditLogEntry } from '../audit/audit-diff.schemas.js'
import { AUDIT_USER_AGENT_MAX_LENGTH, writeAuditLog } from '../audit/audit-log.writer.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createTestApp } from './helpers/create-test-app.js'

/**
 * Kapıya BİLEREK sokulan sır/PII anahtarları. CLAUDE.md §4'ün "asla
 * loglanmaz/saklanmaz" listesinden seçildi; `tenantId` ise satırın kendi
 * kolonunda yaşadığı için `diff`e kopyalanmaması gereken ikinci doğruluk
 * kaynağıdır.
 */
const FORBIDDEN_DIFF_ENTRIES: Readonly<Record<string, string>> = {
  password: 'ac6-sizmasi-yasak-parola',
  token: 'ac6-sizmasi-yasak-belirtec',
  email: 'ac6-sizmasi-yasak@arkesoft.test',
  tcknNo: '10000000146',
  cardNumber: '4111111111111111',
  tenantId: 'ac6-sizmasi-yasak-kiraci-kimligi',
  ip: '203.0.113.7',
  userAgent: 'ac6-sizmasi-yasak-istemci-tanitici',
}

/**
 * Eylem başına GEÇERLİ bir `diff` değeri (ROADMAP v0.0.15, T-016/S7 — TEK bir
 * sabit beş şemanın BEŞİNE de uymuyor: `tenant_security_policy_changed`'in
 * `from`/`to` alanları `'staff'`i REDDEDER, `'true'`/`'false'` BEKLER).
 *
 * ⚠ `SUBJECT_PROBE_ENTRY_BY_ACTION`'ın (aşağıda) AYNI deseni: beş eylemin
 * BİREBİR literal birer girişi, `as const satisfies Record<AuditAction,
 * AuditDiffValue>` ile TAMLIK zorlanır — eylem sözlüğüne değer eklemek bu
 * tabloyu da kırar. "Kaynaktan kopyalanmaz" ilkesi ALAN ADLARI için geçerlidir
 * (hiçbiri burada elle yazılmaz, aşağıdaki testler `diffFieldNamesOf`'tan
 * okur); eylem başına GEÇERLİ ÖRNEK DEĞER ise doğası gereği literal olmak
 * zorundadır (bir şemanın ne kabul ettiğini genel bir algoritmayla tahmin
 * etmek — ör. rastgele değer deneme havuzu — kırılgandır ve `any` sızdırır).
 */
const LEGITIMATE_DIFF_VALUE_BY_ACTION = {
  member_invited: { role: 'staff' },
  member_invitation_accepted: {
    role: 'staff',
    invitationId: 'ac6-legit-davet-kimligi',
  },
  member_role_changed: { from: 'staff', to: 'admin' },
  member_removed: { role: 'staff' },
  tenant_security_policy_changed: { from: 'false', to: 'true' },
} as const satisfies Record<AuditAction, AuditDiffValue>

/** Şema şeklinin alan adlarını okur — dış veri değil, kaynak yapıdır; yine de daraltılarak okunur. */
function diffFieldNamesOf(action: AuditAction): readonly string[] {
  return Object.keys(AUDIT_DIFF_SCHEMA_BY_ACTION[action].shape)
}

/** `action` için geçerli bir `diff` girdisi + sır/PII anahtarları. */
function buildSecretLadenDiffInput(action: AuditAction): Readonly<Record<string, string>> {
  return { ...LEGITIMATE_DIFF_VALUE_BY_ACTION[action], ...FORBIDDEN_DIFF_ENTRIES }
}

/**
 * `resolveAuditSubject`'in A-DB1 eşlemesine uyduğunu ölçmek için eylem sözlüğünün HER üyesinin
 * geçerli birer girişi. ⚠ `satisfies Record<AuditAction, AuditLogEntry>` TAM
 * olduğu için eylem sözlüğüne değer eklemek bu tabloyu da kırar; ayrıca
 * birleşimin kendisi `member_invited` dalında `userId` alanını, diğer üç dalda
 * `invitationId` alanını DERLEME ZAMANINDA reddeder (S4 bunu iki yönlü
 * mutasyonla ölçtü) — yani aşağıdaki alan adları bir KOPYA değil, tipin
 * ZORLADIĞI tek seçenektir.
 */
const SUBJECT_PROBE_ENTRY_BY_ACTION = {
  member_invited: {
    tenantId: 'probe',
    action: 'member_invited',
    actorUserId: 'probe-actor',
    invitationId: 'ac6-subject-davet-kimligi',
    ip: null,
    userAgent: null,
    diff: { role: 'staff' },
  },
  member_invitation_accepted: {
    tenantId: 'probe',
    action: 'member_invitation_accepted',
    actorUserId: 'probe-actor',
    userId: 'ac6-subject-kullanici-kimligi',
    ip: null,
    userAgent: null,
    diff: { role: 'staff', invitationId: 'ac6-diff-davet-kimligi' },
  },
  member_role_changed: {
    tenantId: 'probe',
    action: 'member_role_changed',
    actorUserId: 'probe-actor',
    userId: 'ac6-subject-kullanici-kimligi',
    ip: null,
    userAgent: null,
    diff: { from: 'staff', to: 'admin' },
  },
  member_removed: {
    tenantId: 'probe',
    action: 'member_removed',
    actorUserId: 'probe-actor',
    userId: 'ac6-subject-kullanici-kimligi',
    ip: null,
    userAgent: null,
    diff: { role: 'staff' },
  },
  // ROADMAP v0.0.15, T-016/S7 — beşinci eylem. `subject` eşlemesi `tenantId`
  // (A-DB1'in ÜÇÜNCÜ anlamı) — satırın ZATEN VAR OLAN `tenantId` alanı,
  // ayrı bir alan İCAT EDİLMEZ.
  tenant_security_policy_changed: {
    tenantId: 'ac6-subject-kiraci-kimligi',
    action: 'tenant_security_policy_changed',
    actorUserId: 'probe-actor',
    ip: null,
    userAgent: null,
    diff: { from: 'false', to: 'true' },
  },
} as const satisfies Record<AuditAction, AuditLogEntry>

/** Eylem sözlüğünün KANONİK listesi — `subject` eşleme tablosunun anahtarlarından okunur. */
const AUDIT_ACTIONS: readonly AuditAction[] = Object.keys(AUDIT_SUBJECT_FIELD_BY_ACTION).filter(
  (key): key is AuditAction => key in AUDIT_DIFF_SCHEMA_BY_ACTION,
)

describe('AC6 — `diff` yazma kapısı: sır/PII düşürme ve A-DB1 eşlemesi (şema seviyesi)', () => {
  it('eylem sözlüğü ve `subject` eşleme tablosu AYNI anahtar kümesine sahip (A-DB1 tamlığı)', () => {
    expect(Object.keys(AUDIT_SUBJECT_FIELD_BY_ACTION).sort()).toEqual(
      Object.keys(AUDIT_DIFF_SCHEMA_BY_ACTION).sort(),
    )
    // ⚠ Vacuous DEĞİL: liste BOŞ olsaydı yukarıdaki assert de geçerdi.
    expect(AUDIT_ACTIONS.length).toBeGreaterThanOrEqual(4)
  })

  it('eylem sözlüğünün HEPSİNDE sır/PII anahtarları DÜŞÜRÜLÜR; meşru alanlar AYNEN kalır', () => {
    for (const action of AUDIT_ACTIONS) {
      const input = buildSecretLadenDiffInput(action)
      const expectedFields = diffFieldNamesOf(action)

      // ⚠ Girdi GERÇEKTEN yasaklı anahtarları taşıyor — testin kendisi vacuous
      // değil (boş bir girdiyle "sızmadı" demek hiçbir şey ölçmez).
      for (const forbiddenKey of Object.keys(FORBIDDEN_DIFF_ENTRIES)) {
        expect(Object.keys(input)).toContain(forbiddenKey)
      }
      expect(expectedFields.length).toBeGreaterThan(0)

      const parsed: unknown = AUDIT_DIFF_SCHEMA_BY_ACTION[action].parse(input)
      const parsedRecord = z.record(z.string(), z.unknown()).parse(parsed)

      expect(Object.keys(parsedRecord).sort()).toEqual([...expectedFields].sort())

      const serialized = JSON.stringify(parsedRecord)
      for (const forbiddenValue of Object.values(FORBIDDEN_DIFF_ENTRIES)) {
        expect(serialized).not.toContain(forbiddenValue)
      }
    }
  })

  it('EKSİK alan sessizce geçmez — kapı `parse` ile FIRLATIR (`safeParse` davranışı DEĞİL)', () => {
    for (const action of AUDIT_ACTIONS) {
      const fields = diffFieldNamesOf(action)
      const legitimate: AuditDiffValue = LEGITIMATE_DIFF_VALUE_BY_ACTION[action]

      for (const omitted of fields) {
        const incomplete = Object.fromEntries(
          fields.filter((field) => field !== omitted).map((field) => [field, legitimate[field]]),
        )

        expect(
          () => AUDIT_DIFF_SCHEMA_BY_ACTION[action].parse(incomplete),
          `${action} → '${omitted}' eksikken fırlatmalı`,
        ).toThrow()
      }
    }
  })

  it('rol alanları kapalı sözlüğe karşı doğrulanır — uydurma bir rol değeri kayda GİREMEZ', () => {
    expect(() =>
      AUDIT_DIFF_SCHEMA_BY_ACTION.member_role_changed.parse({ from: 'staff', to: 'auditor' }),
    ).toThrow()
    // Davet kaydı `owner` değerini YAPISAL olarak reddeder (INV-OWNER).
    expect(() => AUDIT_DIFF_SCHEMA_BY_ACTION.member_invited.parse({ role: 'owner' })).toThrow()
  })

  it('`subject` eylem başına ADIYLA ANILAN alandan okunur — eşleme tablosu okunarak doğrulanır (A-DB1)', () => {
    for (const action of AUDIT_ACTIONS) {
      const entry: AuditLogEntry = SUBJECT_PROBE_ENTRY_BY_ACTION[action]
      const entryRecord = z.record(z.string(), z.unknown()).parse(entry)
      const subjectField = AUDIT_SUBJECT_FIELD_BY_ACTION[action]

      // ⚠ Eşleme TABLODAN okunur: tabloyu değiştirmek bu assert'i kırar.
      // Yanlış alanı okumak `undefined` verirdi (her giriş iki alandan
      // YALNIZCA birini taşır — tip zorlaması) → assert vacuous değil.
      expect(resolveAuditSubject(entry)).toBe(entryRecord[subjectField])
      expect(entryRecord[subjectField]).toBeTypeOf('string')
    }
  })
})

describe('AC6 — yazma kapısının veri katmanı davranışı (gerçek Postgres, FORCE RLS)', () => {
  let app: INestApplication | undefined
  let prismaService: PrismaService
  let tenantId: string
  let foreignTenantId: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    const tenant = await prismaService.db.tenant.create({
      data: {
        slug: `ac6-${randomUUID().slice(0, 12)}`,
        name: 'AC6 Yazma Kapısı Kiracısı',
        status: TenantStatus.active,
      },
    })
    tenantId = tenant.id

    const foreignTenant = await prismaService.db.tenant.create({
      data: {
        slug: `ac6-foreign-${randomUUID().slice(0, 10)}`,
        name: 'AC6 Yabancı Kiracı',
        status: TenantStatus.active,
      },
    })
    foreignTenantId = foreignTenant.id
  }, 60_000)

  afterAll(async () => {
    if (app !== undefined) {
      await prismaService.db.tenant.delete({ where: { id: tenantId } })
      await prismaService.db.tenant.delete({ where: { id: foreignTenantId } })
      await app.close()
    }
  })

  it(
    'sır/PII taşıyan `diff` veri katmanına DÜŞÜRÜLMÜŞ hâlde iner; `user_agent` kapıda sınıra KIRPILIR; ' +
      '`ip` AYNEN saklanır',
    async () => {
      const marker = `ac6-${randomUUID().slice(0, 8)}`
      // ⚠ Fazla anahtarlar AÇIKÇA TİPLENMİŞ bir değişken üzerinden geçirilir:
      // taze bir nesne LİTERALİ olsaydı TypeScript'in fazla özellik kontrolü
      // onu derlemezdi. Bu bilinçli: üretim çağıranları kapalı literaller
      // yazıyor, kapının çalışma zamanı soyması ise ancak bu yolla ölçülebilir.
      const secretLadenDiff: {
        readonly role: InvitableRoleWire
        readonly password: string
        readonly email: string
      } = {
        role: 'staff',
        password: `${marker}-parola`,
        email: `${marker}@arkesoft.test`,
      }

      const longUserAgent = `${marker}-${'u'.repeat(AUDIT_USER_AGENT_MAX_LENGTH + 64)}`
      const clientIp = '198.51.100.23'

      await prismaService.withTenant(tenantId, (tx: TenantTransactionClient) =>
        writeAuditLog(tx, {
          tenantId,
          action: 'member_invited',
          actorUserId: `${marker}-actor`,
          invitationId: `${marker}-invitation`,
          ip: clientIp,
          userAgent: longUserAgent,
          diff: secretLadenDiff,
        }),
      )

      const row = await prismaService.withTenant(tenantId, (tx) =>
        tx.auditLog.findFirstOrThrow({
          where: { actorUserId: `${marker}-actor` },
          select: { subject: true, diff: true, ip: true, userAgent: true, tenantId: true },
        }),
      )

      expect(row.tenantId).toBe(tenantId)
      expect(row.subject).toBe(`${marker}-invitation`)
      expect(row.diff).toEqual({ role: 'staff' })
      expect(row.ip).toBe(clientIp)

      // Sınır KOPYALANMAZ, import edilir.
      expect(row.userAgent).toHaveLength(AUDIT_USER_AGENT_MAX_LENGTH)
      expect(row.userAgent).toBe(longUserAgent.slice(0, AUDIT_USER_AGENT_MAX_LENGTH))

      // Satırın TAMAMI taranır — sır/PII hiçbir kolonda yok.
      const serializedRow = JSON.stringify(row)
      expect(serializedRow).not.toContain(secretLadenDiff.password)
      expect(serializedRow).not.toContain(secretLadenDiff.email)
    },
  )

  it('kısa `user_agent` KIRPILMAZ ve `null` istemci alanları `null` olarak iner — kırpma assert’i vacuous değil', async () => {
    const marker = `ac6-short-${randomUUID().slice(0, 8)}`
    const shortUserAgent = `${marker}-kisa-tanitici`

    await prismaService.withTenant(tenantId, (tx) =>
      writeAuditLog(tx, {
        tenantId,
        action: 'member_removed',
        actorUserId: `${marker}-actor`,
        userId: `${marker}-target`,
        ip: null,
        userAgent: shortUserAgent,
        diff: { role: 'admin' },
      }),
    )

    const row = await prismaService.withTenant(tenantId, (tx) =>
      tx.auditLog.findFirstOrThrow({
        where: { actorUserId: `${marker}-actor` },
        select: { subject: true, ip: true, userAgent: true, diff: true },
      }),
    )

    expect(row.userAgent).toBe(shortUserAgent)
    expect(row.userAgent?.length).toBeLessThan(AUDIT_USER_AGENT_MAX_LENGTH)
    expect(row.ip).toBeNull()
    expect(row.subject).toBe(`${marker}-target`)
    expect(row.diff).toEqual({ role: 'admin' })
  })

  it('YABANCI bir kiracı kimliğiyle yazmak SESSİZCE geçmez — politikanın `WITH CHECK` yarısı reddeder', async () => {
    const marker = `ac6-foreign-${randomUUID().slice(0, 8)}`

    await expect(
      prismaService.withTenant(tenantId, (tx) =>
        writeAuditLog(tx, {
          // ⚠ Kiracı kimliği transaction'ın bağlamıyla EŞLEŞMİYOR. Kapı bunu
          // KENDİ başına doğrulamaz ve doğrulamasına GEREK YOKTUR — tabloda
          // FORCE RLS etkin ve INSERT politikanın `WITH CHECK` yüklemine
          // takılır. Yazma kapısının dosya başı yorumu tam bunu iddia ediyor.
          tenantId: foreignTenantId,
          action: 'member_removed',
          actorUserId: `${marker}-actor`,
          userId: `${marker}-target`,
          ip: null,
          userAgent: null,
          diff: { role: 'staff' },
        }),
      ),
      // ⚠ KALIPSIZ `toThrow()` VACUOUS OLURDU: Prisma'nın girdi doğrulaması da
      // fırlatabilirdi ve test "RLS çalışıyor" sanırdı. Reddin GERÇEKTEN
      // politikadan geldiği, veritabanının kendi mesajıyla ölçülür (ölçüldü:
      // Postgres `42501` → `new row violates row-level security policy`).
    ).rejects.toThrow(/row-level security policy/)

    // Ne kendi kiracısında ne yabancı kiracıda satır OLUŞMADI.
    const leakedHere = await prismaService.withTenant(tenantId, (tx) =>
      tx.auditLog.count({ where: { actorUserId: `${marker}-actor` } }),
    )
    const leakedThere = await prismaService.withTenant(foreignTenantId, (tx) =>
      tx.auditLog.count({ where: { actorUserId: `${marker}-actor` } }),
    )
    expect(leakedHere).toBe(0)
    expect(leakedThere).toBe(0)
  })
})
