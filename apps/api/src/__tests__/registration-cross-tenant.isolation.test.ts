// @arkesoft/api — `registration.*` ÇAPRAZ KİRACI İZOLASYONU (ROADMAP v0.1.0,
// T-019/S9b, architect ADR-0021, `member-cross-tenant.isolation.test.ts`
// emsali)
//
// ⚠⚠ ÜRETİM KODU BU DOSYADA YAZILMADI — `RegistrationService` S9a'nın işi.
//
// NEDEN `createTenantIsolationSuite()` İÇİNE KONULMADI — `member-cross-
// tenant.isolation.test.ts`'in BİREBİR gerekçesi: o süit `packages/db`'de
// yaşar ve kiracı TABLOLARI üzerinde parametriktir; bu dosya HTTP-dışı
// servis katmanı + port sözleşmesinin TAMAMINI (ADR-0021 §2 koşul A-E)
// ölçer, tek bir tablo yüklemini DEĞİL.
//
// ⚠⚠ ORAN SINIRI BÜTÇESİ (R-PO1): bu dosya TOPLAM **2** `sign-up` çağırır
// (aktör A + aktör B, `beforeAll`) — `≤8` bütçesinin İÇİNDE, ayrıca İKİ farklı
// gerçek kiracının `createTenant()` AKIŞIYLA (fixture insert'i DEĞİL)
// üretilmesini sağlar, bu yüzden izolasyon iddiası sahte veriye değil GERÇEK
// kayıt akışına dayanır.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { toErrorBody } from '@arkesoft/errors'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TenantNotFoundError } from '../errors/domain/tenant-not-found.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { RegistrationService } from '../registration/registration.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import type { AuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 10)}`
}

describe('registration.* — ÇAPRAZ KİRACI izolasyonu (gerçek Postgres, gerçek createTenant akışı)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let registrationService: RegistrationService

  /** A: kendi mağazasını kuran aktör. */
  let actorA: AuthenticatedSession
  let tenantASlug: string
  let tenantAId: string

  /** B: aktör A'nın HİÇ ÜYE OLMADIĞI, kendi mağazasını kuran AYRI bir aktör. */
  let actorB: AuthenticatedSession
  let tenantBSlug: string
  let tenantBId: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    registrationService = app.get(RegistrationService)

    // ⚠⚠ BÜTÇE — bu dosyanın TOPLAM İKİ `sign-up` çağrısı.
    actorA = await createAuthenticatedSession(app.getHttpServer())
    actorB = await createAuthenticatedSession(app.getHttpServer())

    tenantASlug = uniqueSlug('mx-reg-a')
    tenantBSlug = uniqueSlug('mx-reg-b')

    const createdA = await registrationService.createTenant(actorA.userId, {
      name: 'Çapraz Kayıt Kiracısı A',
      slug: tenantASlug,
      siteType: 'ecommerce',
    })
    const createdB = await registrationService.createTenant(actorB.userId, {
      name: 'Çapraz Kayıt Kiracısı B',
      slug: tenantBSlug,
      siteType: 'corporate',
    })
    expect(createdA.status).toBe(TenantStatus.pending)
    expect(createdB.status).toBe(TenantStatus.pending)

    tenantAId = (await prismaService.db.tenant.findUniqueOrThrow({ where: { slug: tenantASlug } }))
      .id
    tenantBId = (await prismaService.db.tenant.findUniqueOrThrow({ where: { slug: tenantBSlug } }))
      .id
  }, 120_000)

  afterAll(async () => {
    if (app !== undefined) {
      await prismaService.db.tenant.delete({ where: { id: tenantAId } })
      await prismaService.db.tenant.delete({ where: { id: tenantBId } })
      await app.close()
    }
  }, 60_000)

  it(
    'A, B’nin slug’ıyla onboardingChecklist çağırırsa 404 TENANT_NOT_FOUND alır — ' +
      "gövde, var-olmayan bir slug'ınkiyle BİREBİR AYNI (varlık sızdırmaz)",
    async () => {
      async function captureRejection(slug: string): Promise<TenantNotFoundError> {
        let caught: unknown
        try {
          await registrationService.onboardingChecklist(actorA.userId, slug)
          throw new Error(`beklenen TenantNotFoundError fırlatılmadı (slug: ${slug})`)
        } catch (error) {
          caught = error
        }
        if (!(caught instanceof TenantNotFoundError)) {
          throw new Error(`beklenen TenantNotFoundError değil (slug: ${slug}): ${String(caught)}`)
        }
        return caught
      }

      const foreignRejection = await captureRejection(tenantBSlug)
      const absentRejection = await captureRejection(uniqueSlug('mx-reg-absent'))

      expect(foreignRejection.code).toBe('TENANT_NOT_FOUND')
      expect(foreignRejection.httpStatus).toBe(404)

      // ⚠ Yabancı (B'nin GERÇEKTEN var olan) kiracısı ile var OLMAYAN bir
      // kiracının gövdesi BİREBİR AYNI — ayırt etmek B'nin varlığını sızdırır.
      expect(toErrorBody(foreignRejection, 'mx-probe')).toEqual(
        toErrorBody(absentRejection, 'mx-probe'),
      )
    },
    60_000,
  )

  it('VACUOUS DEĞİL: A, KENDİ slug’ıyla onboardingChecklist çağırınca BAŞARILI sonuç alır', async () => {
    const checklist = await registrationService.onboardingChecklist(actorA.userId, tenantASlug)

    expect(checklist.steps.map((step) => step.key)).toEqual([
      'account',
      'store_identity',
      'site_type',
      'subscription',
      'provisioning',
    ])
    expect(
      checklist.steps.every(
        (step) =>
          (step.key !== 'provisioning' && step.status === 'done') || step.key === 'provisioning',
      ),
    ).toBe(true)
  }, 30_000)

  it(
    "B'nin subscription'ı A bağlamında OKUNAMAZ — A bağlamındaki sorgu B'nin satırını HİÇ GÖRMEZ " +
      '(RLS FORCE + withTenant, gerçek createTenant akışının ürettiği satırlar üzerinde)',
    async () => {
      const subscriptionsInAContext = await prismaService.withTenant(tenantAId, (tx) =>
        tx.subscription.findMany(),
      )
      const subscriptionsInBContext = await prismaService.withTenant(tenantBId, (tx) =>
        tx.subscription.findMany(),
      )

      expect(subscriptionsInAContext).toHaveLength(1)
      expect(subscriptionsInBContext).toHaveLength(1)

      expect(subscriptionsInAContext.every((row) => row.tenantId === tenantAId)).toBe(true)
      expect(subscriptionsInBContext.every((row) => row.tenantId === tenantBId)).toBe(true)

      // ⚠ Çapraz kontrol: A bağlamında okunan satırların KİMLİĞİ B'nin
      // satırının kimliğiyle ÇAKIŞMAZ.
      const subscriptionIdsInA = new Set(subscriptionsInAContext.map((row) => row.id))
      for (const bRow of subscriptionsInBContext) {
        expect(subscriptionIdsInA.has(bRow.id)).toBe(false)
      }
    },
    60_000,
  )

  it(
    "F7 ÇAPRAZ KONTROLÜ: A'nın owner üyeliği TENANT A'YA bağlı, B'nin membership'inde A YOK " +
      '(iki ayrı aktör, iki ayrı kiracı — çift üyelik YOK)',
    async () => {
      const membershipA = await prismaService.withTenant(tenantAId, (tx) =>
        tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId: tenantAId, userId: actorA.userId } },
        }),
      )
      const membershipBForA = await prismaService.withTenant(tenantBId, (tx) =>
        tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId: tenantBId, userId: actorA.userId } },
        }),
      )

      expect(membershipA?.role).toBe(TenantRole.owner)
      expect(membershipBForA).toBeNull()
    },
    30_000,
  )
})
