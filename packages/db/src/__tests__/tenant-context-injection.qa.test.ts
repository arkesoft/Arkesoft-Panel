// @arkesoft/db — QA gate testi (T-005, AC4'ün ÇALIŞMA ZAMANI yarısı)
//
// AC4 metni birebir: "`withTenant()`'a `x'; DROP TABLE "tenant_membership";
// --` → 0 satır, tablo hâlâ var, sözdizimi hatası yok." T-005'in mevcut
// testleri (`tenant-membership.isolation.test.ts`, `membership.test.ts`)
// AC4'ün MEKANİK (statik grep) yarısını dolaylı olarak destekler ama
// `withTenant()`'a GERÇEKTEN kötücül bir `tenantId` geçen hiçbir test yok —
// bu dosya o boşluğu kapatır (QA'nın üretim kodunu DEĞİŞTİRMEME, eksik testi
// KENDİ yazma yetkisiyle, bkz. T-005 QA handoff'u madde 2).
//
// `set_config($1, $2, true)` ÇAĞRISI tagged template üzerinden BAĞLI
// PARAMETRE ile gider (`tenant-context.ts`) — bu test o güvencenin GERÇEKTEN
// tuttuğunu, yalnızca kod okuyarak değil, ÇALIŞTIRARAK kanıtlar.

import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { TenantRole, TenantStatus, UserStatus, withTenant } from '../index.js'
import { testAppPrisma } from './helpers/test-client.js'

describe('AC4 — withTenant() enjeksiyon direnci (ÇALIŞMA ZAMANI kanıtı)', () => {
  const createdTenantIds: string[] = []
  const createdUserIds: string[] = []

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await testAppPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
    }
    if (createdUserIds.length > 0) {
      await testAppPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    }
  })

  it(
    "kötücül tenantId ('x'; DROP TABLE \"tenant_membership\"; --') " +
      '→ sözdizimi hatası YOK, 0 satır, tablo HÂLÂ VAR',
    async () => {
      const maliciousTenantId = `x'; DROP TABLE "tenant_membership"; --`

      // 1) `withTenant` KENDİSİ bu tenantId ile ÇÖKMEMELİ (sözdizimi hatası yok).
      const rows = await withTenant(testAppPrisma, maliciousTenantId, (tx) =>
        tx.tenantMembership.findMany(),
      )

      // 2) Hiçbir satırla eşleşmez (ne var olan ne de enjekte edilmiş bir
      // koşulla) — `app.tenant_id` tam olarak bu dizgeye eşittir, hiçbir
      // "tenant_id" kolonu bu değere sahip DEĞİLDİR.
      expect(rows).toEqual([])

      // 3) Tablo HÂLÂ VAR — `DROP TABLE` asla SQL olarak YORUMLANMADI, salt
      // metin (bağlı parametre) olarak GUC'a yazıldı.
      const stillExists = z.array(z.object({ tableName: z.string() })).parse(
        await testAppPrisma.$queryRaw`
            SELECT tablename AS "tableName" FROM pg_tables
            WHERE schemaname = 'public' AND tablename = 'tenant_membership'
          `,
      )
      expect(stillExists).toEqual([{ tableName: 'tenant_membership' }])
    },
  )

  it(
    'kötücül tenantId, GERÇEK bir tenant/üyelik için 0 satır döner ' +
      "(enjeksiyon başka tenant'ın verisini AÇMIYOR)",
    async () => {
      const suffix = randomUUID()
      const tenant = await testAppPrisma.tenant.create({
        data: {
          slug: `ac4-injection-tenant-${suffix}`,
          name: 'AC4 Enjeksiyon Testi',
          status: TenantStatus.active,
        },
      })
      createdTenantIds.push(tenant.id)

      const user = await testAppPrisma.user.create({
        data: {
          email: `ac4-injection-user-${suffix}@arkesoft.test`,
          name: 'AC4 Enjeksiyon Testi Kullanıcı',
          status: UserStatus.active,
        },
      })
      createdUserIds.push(user.id)

      await withTenant(testAppPrisma, tenant.id, (tx) =>
        tx.tenantMembership.create({
          data: { tenantId: tenant.id, userId: user.id, role: TenantRole.staff },
        }),
      )

      // Gerçek bir satır varken dahi, kötücül tenantId ile açılan context o
      // satırı GÖRMEZ — "OR 1=1" tarzı bir enjeksiyonun RLS politikasını
      // atlatmadığının kanıtı.
      const maliciousTenantId = `' OR '1'='1`
      const rows = await withTenant(testAppPrisma, maliciousTenantId, (tx) =>
        tx.tenantMembership.findMany(),
      )
      expect(rows).toEqual([])
    },
  )
})
