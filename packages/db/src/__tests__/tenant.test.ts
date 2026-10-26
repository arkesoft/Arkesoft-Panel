// @arkesoft/db — Tenant entegrasyon testleri (ROADMAP v0.0.3, T-001/ST-4)
//
// Vaka 1 (AC2(a)), Vaka 3 (AC2(c)) ve Vaka 5 (AC7/V1) burada. Yazma testleri
// kendi yarattıkları satırları `afterAll`'da HARD DELETE eder; demo seed
// verisine dokunulmaz. Transaction-rollback deseni kullanılmaz (unique ihlali
// PG transaction'ını abort eder → savepoint gerektirir, gereksiz karmaşıklık).

import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'

import { DEMO_SEED, isUniqueConstraintError, TenantStatus, UserStatus } from '../index.js'
import { testPrisma } from './helpers/test-client.js'

describe('tenant', () => {
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

  it("Seed'lenen tenant slug ile okunur, name/status beklenen", async () => {
    const tenant = await testPrisma.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })

    expect(tenant).not.toBeNull()
    expect(tenant?.name).toBe(DEMO_SEED.tenant.name)
    expect(tenant?.status).toBe(TenantStatus.active)
  })

  it('Aynı slug ile ikinci tenant reddedilir', async () => {
    const slug = `t4-unique-${randomUUID()}`

    const first = await testPrisma.tenant.create({
      data: { slug, name: 'ST-4 Benzersizlik Testi', status: TenantStatus.active },
    })
    createdTenantIds.push(first.id)

    let caughtError: unknown
    try {
      await testPrisma.tenant.create({
        data: { slug, name: 'ST-4 Benzersizlik Testi — Mükerrer', status: TenantStatus.active },
      })
    } catch (error) {
      caughtError = error
    }

    expect(isUniqueConstraintError(caughtError)).toBe(true)
  })

  it('Soft delete sonrası slug serbest kalmaz', async () => {
    const slug = `t4-soft-delete-${randomUUID()}`

    const tenant = await testPrisma.tenant.create({
      data: { slug, name: 'ST-4 Soft Delete Testi', status: TenantStatus.active },
    })
    createdTenantIds.push(tenant.id)

    await testPrisma.tenant.update({
      where: { id: tenant.id },
      data: { deletedAt: new Date() },
    })

    let caughtError: unknown
    try {
      await testPrisma.tenant.create({
        data: {
          slug,
          name: 'ST-4 Soft Delete — Yeniden Kullanım Denemesi',
          status: TenantStatus.active,
        },
      })
    } catch (error) {
      caughtError = error
    }

    expect(isUniqueConstraintError(caughtError)).toBe(true)
  })

  // Gate Tur 1 — L2: eski vaka adı "slug/e-posta" diyordu ama gövde yalnızca
  // `Tenant.slug` yolunu doğruluyordu; `User.email` için tek satır yoktu (PM
  // V1: "aynı mantık User.email için geçerli"). Bu vaka o boşluğu kapatır.
  it('Soft delete sonrası e-posta serbest kalmaz', async () => {
    const email = `t4-soft-delete-${randomUUID()}@arkesoft.test`

    const user = await testPrisma.user.create({
      data: { email, name: 'ST-4 Soft Delete Testi Kullanıcı', status: UserStatus.active },
    })
    createdUserIds.push(user.id)

    await testPrisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date() },
    })

    let caughtError: unknown
    try {
      await testPrisma.user.create({
        data: {
          email,
          name: 'ST-4 Soft Delete — Yeniden Kullanım Denemesi',
          status: UserStatus.active,
        },
      })
    } catch (error) {
      caughtError = error
    }

    expect(isUniqueConstraintError(caughtError)).toBe(true)
  })

  // Gate Tur 1 — L2: AC7'nin üçüncü ayağı (`Tenant.primaryDomain` küresel
  // tekilliği) hiçbir testte doğrulanmıyordu.
  it('Aynı primaryDomain ile ikinci tenant reddedilir', async () => {
    const primaryDomain = `t4-domain-${randomUUID()}.ornek.test`

    const first = await testPrisma.tenant.create({
      data: {
        slug: `t4-domain-${randomUUID()}`,
        name: 'ST-4 primaryDomain Benzersizlik Testi',
        status: TenantStatus.active,
        primaryDomain,
      },
    })
    createdTenantIds.push(first.id)

    let caughtError: unknown
    try {
      await testPrisma.tenant.create({
        data: {
          slug: `t4-domain-${randomUUID()}`,
          name: 'ST-4 primaryDomain Benzersizlik Testi — Mükerrer',
          status: TenantStatus.active,
          primaryDomain,
        },
      })
    } catch (error) {
      caughtError = error
    }

    expect(isUniqueConstraintError(caughtError)).toBe(true)
  })
})
