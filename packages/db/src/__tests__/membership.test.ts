// @arkesoft/db — TenantMembership entegrasyon testleri (ROADMAP v0.0.3, T-001/ST-4)
//
// Vaka 2 (AC2(b), salt okuma) ve Vaka 4 (AC2(d)) burada. Vaka 4 kendi geçici
// tenant + kullanıcı çiftini yaratır; tenant'ı silmek `onDelete: Cascade` ile
// üyeliği de temizler (ADR-0003 madde 3 — üyelik tablosunda soft delete yok).

import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'

import {
  DEMO_SEED,
  isUniqueConstraintError,
  TenantRole,
  TenantStatus,
  UserStatus,
} from '../index.js'
import { testPrisma } from './helpers/test-client.js'

describe('membership', () => {
  const createdTenantIds: string[] = []
  const createdUserIds: string[] = []

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await testPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
    }
    if (createdUserIds.length > 0) {
      await testPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    }
  })

  it('Owner, TenantMembership üzerinden bağlı, role = owner', async () => {
    const tenant = await testPrisma.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
      include: { memberships: { include: { user: true } } },
    })

    expect(tenant).not.toBeNull()

    const ownerMembership = tenant?.memberships.find(
      (membership) => membership.user.email === DEMO_SEED.owner.email,
    )

    expect(ownerMembership).toBeDefined()
    expect(ownerMembership?.role).toBe(TenantRole.owner)
  })

  it('(tenantId,userId) ikinci kez eklenemez', async () => {
    const suffix = randomUUID()

    const tenant = await testPrisma.tenant.create({
      data: {
        slug: `t4-membership-tenant-${suffix}`,
        name: 'ST-4 Üyelik Testi',
        status: TenantStatus.active,
      },
    })
    createdTenantIds.push(tenant.id)

    const user = await testPrisma.user.create({
      data: {
        email: `t4-membership-user-${suffix}@arkesoft.test`,
        name: 'ST-4 Üyelik Testi Kullanıcı',
        status: UserStatus.active,
      },
    })
    createdUserIds.push(user.id)

    await testPrisma.tenantMembership.create({
      data: { tenantId: tenant.id, userId: user.id, role: TenantRole.staff },
    })

    let caughtError: unknown
    try {
      await testPrisma.tenantMembership.create({
        data: { tenantId: tenant.id, userId: user.id, role: TenantRole.admin },
      })
    } catch (error) {
      caughtError = error
    }

    expect(isUniqueConstraintError(caughtError)).toBe(true)
  })
})
