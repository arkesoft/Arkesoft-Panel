// @arkesoft/db — `createTenantIsolationSuite()`'in TEK çağrı/kayıt noktası
// (ROADMAP v0.0.13, T-005/S4, architect K-E10; ROADMAP v0.0.11, T-013/S2'de
// ikinci prob eklendi)
//
// ⚠ DOSYA ADI TARİHSELDİR (`tenant-membership.…`): v0.0.3'te taksonomide tek
// tablo vardı. v0.0.11'den itibaren bu dosya `TENANT_SCOPED_TABLES`'ın TAMAMINI
// kaydeder (`tenant_membership` + `job`) — yani adından DAHA GENİŞ bir
// sorumluluk taşır. Yeniden adlandırma BİLİNÇLİ OLARAK yapılmadı (T-013/S2
// kapsamı dışı, üç dosyada atıf var); yeni bir kiracı tablosu eklendiğinde
// probu BURAYA kaydedilir.
//
// ⚠ NEDEN TEK ÇAĞRI NOKTASI (po R-P1, BAĞLAYICI): prob tamlığı kapısı
// (`tenant-isolation-suite.ts`) ÇAĞRI BAŞINA kendi taksonomisini kendi
// problarıyla karşılaştırır. Tablo başına ayrı bir test dosyası açmak İKİ
// dosyayı da kırar (her biri diğerinin probunu "eksik" sayar) ve taksonomiyi
// çağrı başına elle daraltmak kapının TÜM amacını yok eder (§10 md 6).
// BAĞLAYICI KISIT: tek çağrı · TAM `TENANT_SCOPED_TABLES` · her tablo için bir
// prob. Tabloya özel bilgi ayrı yardımcı dosyalarda yaşayabilir
// (`helpers/job.probe.ts`), KAYIT burada kalır.
//
// Bu dosya `*.isolation.test.ts` deseniyle eşleşir — `vitest.isolation.config.ts`
// tarafından toplanır, `vitest.config.ts`'in `exclude`'u tarafından
// NORMAL `pnpm test` hattından ÇIKARILIR (V4, aynı test iki kez koşmaz).
//
// TABLO'YA ÖZEL BİLGİ (model adı, `(tenantId,userId)` benzersizlik kısıtı
// yüzünden gereken `User` bağımlılığı) BURADA yaşar — jenerik süit
// (`tenant-isolation-suite.ts`) bunları BİLMEZ. `TenantMembership`'in
// `userId` FK'si bir `User` satırı gerektirir; `User` platform seviyesi
// (RLS yok) olduğu için `tx.user.create(...)` context'siz de çalışır, ama
// `withTenant`'ın açtığı AYNI transaction içinde çağrılır (tek transaction,
// K-E7) — bağımsız bir transaction AÇILMAZ.

import { randomUUID } from 'node:crypto'

import { TenantRole, UserStatus, withTenant } from '../index.js'
import type { PrismaDatabase, TransactionClient } from '../index.js'
import { TENANT_SCOPED_TABLES } from '../tenancy.js'
import { jobProbe } from './helpers/job.probe.js'
import { testAppPrisma } from './helpers/test-client.js'
import {
  createTenantIsolationSuite,
  type TenantScopedProbe,
} from './helpers/tenant-isolation-suite.js'

/** Context içinde (`tx`), verilen tenant için bir `User` + `TenantMembership` çifti kurar. */
async function createMembershipRow(tx: TransactionClient, tenantId: string): Promise<string> {
  const user = await tx.user.create({
    data: {
      email: `probe-${randomUUID()}@arkesoft.test`,
      name: 'İzolasyon Probu Kullanıcısı',
      status: UserStatus.active,
    },
  })
  const membership = await tx.tenantMembership.create({
    data: { tenantId, userId: user.id, role: TenantRole.staff },
  })
  return membership.id
}

const tenantMembershipProbe: TenantScopedProbe = {
  tableName: 'tenant_membership',

  insertRow: (tx, tenantId) => createMembershipRow(tx, tenantId),

  findRowById: async (tx, rowId) => {
    const row = await tx.tenantMembership.findUnique({ where: { id: rowId }, select: { id: true } })
    return row
  },

  insertRowWithForeignTenant: async (tx, foreignTenantId) => {
    await createMembershipRow(tx, foreignTenantId)
  },

  updateRowById: async (tx, rowId) => {
    await tx.tenantMembership.update({ where: { id: rowId }, data: { role: TenantRole.admin } })
  },

  deleteRowById: async (tx, rowId) => {
    await tx.tenantMembership.delete({ where: { id: rowId } })
  },

  countAllRowsWithoutContext: async (client: PrismaDatabase) => client.tenantMembership.count(),

  cleanupTenant: async (client: PrismaDatabase, tenantId: string) => {
    // Üyelik satırları RLS'e tabi — context'siz bir `findMany` 0 satır
    // döner. Bağımlı `User` satırlarını toplamak için KISA ÖMÜRLÜ bir
    // `withTenant` çağrısıyla OKUNUR (yan etkisi yok, salt okuma).
    const userIds = await withTenant(client, tenantId, async (tx) => {
      const rows = await tx.tenantMembership.findMany({
        where: { tenantId },
        select: { userId: true },
      })
      return rows.map((row) => row.userId)
    })

    // `tenant.delete` ON DELETE CASCADE ile üyelik satırlarını temizler
    // (ADR-0003 madde 3 — üyelik hard delete, cascade RLS'e TABİ DEĞİLDİR;
    // `membership.test.ts`'in mevcut `afterAll` deseniyle AYNI ampirik gözlem).
    await client.tenant.delete({ where: { id: tenantId } })

    if (userIds.length > 0) {
      await client.user.deleteMany({ where: { id: { in: userIds } } })
    }
  },
}

// ⚠ `taxonomy` TAM `TENANT_SCOPED_TABLES`'tır (elle daraltma YASAK) ve `probes`
// o dizinin HER üyesi için bir giriş taşır — ikisi arasındaki eşleşmeyi prob
// tamlığı kapısı mekanik olarak doğrular.
createTenantIsolationSuite({
  client: testAppPrisma,
  taxonomy: { tenantScopedTables: TENANT_SCOPED_TABLES },
  probes: [tenantMembershipProbe, jobProbe],
})
