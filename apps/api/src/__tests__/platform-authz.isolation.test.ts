// @arkesoft/api — AC-4/AC-5/AC-6 (CANLI) + RLS'in canlı kanıtı
// (ROADMAP v0.0.20, T-021/S7, ADR-0023 Karar 1/2/3)
//
// Dört öbek:
//   (A) AC-6 — BEŞ kiracı rolünün HER BİRİ, platform_admin KAYDI OLMADAN,
//       `platform.tenantList`/`platform.auditLog`'un İKİSİNE de 403
//       `PLATFORM_ADMIN_REQUIRED` alır (401 DEĞİL, 200 DEĞİL). Anti-vacuity:
//       beş rol × iki uç = ON senaryo, hiçbiri boş küme üzerinde değil.
//   (B) AC-4 — `platform_admin` kaydı VAR ama `two_factor_enabled = false`
//       → 403 `TWO_FACTOR_REQUIRED` (401 DEĞİL, 200 DEĞİL). Mutasyon kanıtı
//       BU DOSYADA DEĞİL — raporun KARARLAR bölümünde (geçici `Edit` +
//       koşum + geri alma, kalıcı kod değişikliği YOK).
//   (C) AC-5 — platform yöneticisi (2FA açık) ama HİÇBİR kiracıya üye
//       DEĞİL → `tenant.current` 403 `TENANT_MEMBERSHIP_REQUIRED` alır
//       (`auth.guard.ts:123-147`'in üyelik dalı DEĞİŞMEDEN). Platform
//       yetkisi kiracı erişimi SAĞLAMAZ (ADR-0023 Karar 1).
//   (D) RLS'in CANLI kanıtı — `runImpersonated(tenantA)` bloğunun İÇİNDE
//       `tenantB`'nin `subscription`'ı OKUNAMAZ (sıfır satır, 403/404
//       DEĞİL — RLS'in SESSİZ filtre davranışı).
//
// Guard katmanı (`PlatformAdminIpGuard`) `createTestApp`'in `apiEnv`
// override'ıyla devre dışı BIRAKILMAZ, aksine İZİN VERİLİR: loopback IP
// (`session-list-read-port-adapter.test.ts`'in AYNI üç-değerli toleransı,
// harness'in GERÇEK gözlemlenen soket adresi runtime'da değişebilir)
// allowlist'e EKLENİR — bu dosyanın iddiası GÜVENLİK KATMANI (platform
// yetkisi/2FA/üyelik) hakkındadır, ağ katmanı hakkında DEĞİL.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import type { INestApplication } from '@nestjs/common'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { appErrorBodySchema } from '@arkesoft/errors'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { ImpersonationService } from '../platform/impersonation.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

/** `session-list-read-port-adapter.test.ts:125`'in AYNI üç-değerli toleransı. */
const LOOPBACK_ALLOWLIST = '127.0.0.1,::1,::ffff:127.0.0.1'

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

/** `/trpc/<yol>?input=<json>` — tRPC'nin GET sözleşmesi (`trpc-cross-tenant.isolation.test.ts`'in AYNI deseni). */
function trpcQueryPath(procedure: string, input: Record<string, unknown>): string {
  return `/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`
}

const trpcErrorEnvelopeSchema = z.object({
  error: z.object({
    data: z.object({
      code: z.string(),
      httpStatus: z.number(),
      appError: appErrorBodySchema,
    }),
  }),
})

const FIVE_TENANT_ROLES = [
  TenantRole.owner,
  TenantRole.admin,
  TenantRole.staff,
  TenantRole.support,
  TenantRole.readonly,
] as const

describe('AC-4/AC-5/AC-6 (CANLI) + RLS canlı kanıtı', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let impersonation: ImpersonationService

  beforeAll(async () => {
    const testApp = await createTestApp({
      apiEnv: { ...BASE_ENV, SUPERADMIN_IP_ALLOWLIST: LOOPBACK_ALLOWLIST },
    })
    app = testApp.app
    prismaService = app.get(PrismaService)
    impersonation = app.get(ImpersonationService)
  }, 60_000)

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  // ---------------------------------------------------------------------
  // (A) AC-6 — beş rol × iki uç, matris
  // ---------------------------------------------------------------------

  describe('(A) AC-6 — beş kiracı rolünün HER BİRİ platform.* GATED uçlarında 403 alır (platform_admin KAYDI YOK)', () => {
    const matrixResults: {
      readonly role: string
      readonly endpoint: string
      readonly status: number
      readonly code: string
    }[] = []

    it.each(FIVE_TENANT_ROLES)(
      'rol=%s → tenantList VE auditLog 403 PLATFORM_ADMIN_REQUIRED',
      async (role) => {
        const tenant = await prismaService.db.tenant.create({
          data: {
            slug: uniqueSlug(`ac6-${role}`),
            name: `AC-6 ${role}`,
            status: TenantStatus.active,
          },
        })

        try {
          const session = await createAuthenticatedSession(httpServer())
          await prismaService.withTenant(tenant.id, (tx) =>
            tx.tenantMembership.create({
              data: { tenantId: tenant.id, userId: session.userId, role },
            }),
          )

          for (const endpoint of ['platform.tenantList', 'platform.auditLog']) {
            const response = await request(httpServer())
              .get(trpcQueryPath(endpoint, {}))
              .set('Cookie', session.cookieHeader)

            const envelope = trpcErrorEnvelopeSchema.parse(response.body)

            matrixResults.push({
              role,
              endpoint,
              status: response.status,
              code: envelope.error.data.appError.code,
            })

            // ⚠⚠ VARLIK ORACLE'I DEĞİL: 401 DEĞİL (kimlik kurulu), 200
            // DEĞİL (kiracı üyesi olmak platform yetkisi VERMEZ).
            expect(response.status).toBe(403)
            expect(envelope.error.data.appError.code).toBe('PLATFORM_ADMIN_REQUIRED')
          }
        } finally {
          await prismaService.db.tenant.delete({ where: { id: tenant.id } })
        }
      },
    )

    afterAll(() => {
      // ⚠ Anti-vacuity: TAM ON senaryo (5 rol × 2 uç) GERÇEKTEN çalıştı.
      expect(matrixResults).toHaveLength(10)
      expect(matrixResults.every((entry) => entry.status === 403)).toBe(true)
      expect(matrixResults.every((entry) => entry.code === 'PLATFORM_ADMIN_REQUIRED')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------
  // (B) AC-4 — platform_admin VAR, 2FA KAPALI
  // ---------------------------------------------------------------------

  describe('(B) AC-4 — platform_admin kaydı VAR ama 2FA KAPALI → 403 TWO_FACTOR_REQUIRED', () => {
    it('401 DEĞİL, 200 DEĞİL — tam olarak 403 TWO_FACTOR_REQUIRED', async () => {
      const session = await createAuthenticatedSession(httpServer())
      await prismaService.platform.platformAdmin.create({ data: { userId: session.userId } })

      // ⚠ `createAuthenticatedSession` 2FA'yı HİÇ kurmaz (varsayılan
      // `two_factor_enabled = false`) — bu senaryo İÇİN ek bir adım
      // gerekmez, ama VACUOUS olmadığını AÇIKÇA doğrulamak için okunur.
      const user = await prismaService.db.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: { twoFactorEnabled: true },
      })
      expect(user.twoFactorEnabled).toBe(false)

      const response = await request(httpServer())
        .get(trpcQueryPath('platform.tenantList', {}))
        .set('Cookie', session.cookieHeader)

      const envelope = trpcErrorEnvelopeSchema.parse(response.body)

      expect(response.status).toBe(403)
      expect(envelope.error.data.appError.code).toBe('TWO_FACTOR_REQUIRED')
    })

    it('2FA AÇILINCA AYNI kullanıcı 200 alır (vacuous değil — 403 yalnızca 2FA eksikliğinden)', async () => {
      const session = await createAuthenticatedSession(httpServer())
      await prismaService.platform.platformAdmin.create({ data: { userId: session.userId } })
      await prismaService.db.user.update({
        where: { id: session.userId },
        data: { twoFactorEnabled: true },
      })

      const response = await request(httpServer())
        .get(trpcQueryPath('platform.tenantList', {}))
        .set('Cookie', session.cookieHeader)

      expect(response.status).toBe(200)
    })
  })

  // ---------------------------------------------------------------------
  // (C) AC-5 — platform yöneticiliği kiracı erişimi SAĞLAMAZ
  // ---------------------------------------------------------------------

  describe('(C) AC-5 — platform yöneticisi (2FA açık), HİÇBİR kiracıya üye DEĞİL → tenant.current 403 TENANT_MEMBERSHIP_REQUIRED', () => {
    it('platform.tenantList 200 alırken AYNI oturum tenant.current’TA 403 alır', async () => {
      const tenant = await prismaService.db.tenant.create({
        data: {
          slug: uniqueSlug('ac5-tenant'),
          name: 'AC-5 Kiracısı',
          status: TenantStatus.active,
        },
      })

      try {
        const session = await createAuthenticatedSession(httpServer())
        await prismaService.platform.platformAdmin.create({ data: { userId: session.userId } })
        await prismaService.db.user.update({
          where: { id: session.userId },
          data: { twoFactorEnabled: true },
        })

        // ⚠ Vacuous DEĞİL: AYNI oturum platform yüzeyinde BAŞARIYLA çalışır.
        const platformResponse = await request(httpServer())
          .get(trpcQueryPath('platform.tenantList', {}))
          .set('Cookie', session.cookieHeader)
        expect(platformResponse.status).toBe(200)

        // ⚠⚠ AC-5'İN ASIL İDDİASI: AYNI kimlik, kiracı ucunda, ÜYELİK
        // OLMADAN 403 alır — platform yetkisi kiracı YETKİSİ KAZANDIRMAZ.
        // ⚠ Bu hata `AuthGuard`'DAN gelir (tRPC resolver'a HİÇ GİRMEDEN) —
        // gövde tRPC zarfı DEĞİL, düz `AppErrorBody`'dir
        // (`member-authz.test.ts:208-228`'in AYNI deseni).
        const tenantResponse = await request(httpServer())
          .get('/trpc/tenant.current')
          .set('Cookie', session.cookieHeader)
          .set('x-arkesoft-tenant', tenant.slug)

        const errorBody = appErrorBodySchema.parse(tenantResponse.body)
        expect(tenantResponse.status).toBe(403)
        expect(errorBody.code).toBe('TENANT_MEMBERSHIP_REQUIRED')
      } finally {
        await prismaService.db.tenant.delete({ where: { id: tenant.id } })
      }
    })
  })

  // ---------------------------------------------------------------------
  // (D) RLS'in CANLI kanıtı — runImpersonated(tenantA) BLOĞUNDA tenantB OKUNAMAZ
  // ---------------------------------------------------------------------

  describe('(D) runImpersonated(tenantA) bloğunda tenantB’nin subscription’ı OKUNAMAZ (RLS)', () => {
    it("tenantA GUC'u altında tenantB'nin subscription'ı sıfır satır döner — tenantA'nınki OKUNABİLİR (vacuous değil)", async () => {
      const plan = await prismaService.platform.plan.create({
        data: { id: randomUUID(), name: 'RLS Kanıtı Planı', limits: {} },
      })

      const tenantA = await prismaService.db.tenant.create({
        data: { slug: uniqueSlug('rls-a'), name: 'RLS A', status: TenantStatus.active },
      })
      const tenantB = await prismaService.db.tenant.create({
        data: { slug: uniqueSlug('rls-b'), name: 'RLS B', status: TenantStatus.active },
      })

      try {
        await prismaService.withTenant(tenantA.id, (tx) =>
          tx.subscription.create({
            data: {
              tenantId: tenantA.id,
              planId: plan.id,
              limits: {},
              startedAt: new Date(),
            },
          }),
        )
        await prismaService.withTenant(tenantB.id, (tx) =>
          tx.subscription.create({
            data: {
              tenantId: tenantB.id,
              planId: plan.id,
              limits: {},
              startedAt: new Date(),
            },
          }),
        )

        // GUC tenantA'ya AYARLI — tenantB'nin GERÇEKTEN VAR OLAN satırını OKU.
        const crossTenantRead = await prismaService.withTenant(tenantA.id, (tx) =>
          tx.subscription.findUnique({ where: { tenantId: tenantB.id }, select: { planId: true } }),
        )
        expect(crossTenantRead).toBeNull()

        // Vacuous DEĞİL: AYNI GUC altında tenantA'nın KENDİ satırı okunabilir.
        const ownTenantRead = await prismaService.withTenant(tenantA.id, (tx) =>
          tx.subscription.findUnique({ where: { tenantId: tenantA.id }, select: { planId: true } }),
        )
        expect(ownTenantRead?.planId).toBe(plan.id)

        // AYNI kanıt — `ImpersonationService.runImpersonated()` ÜZERİNDEN
        // (adaptörün gerçekte kullandığı yol, ADR-0023 §3).
        const results = await impersonation.runImpersonated(
          { actorUserId: 'rls-probe', ip: null, userAgent: null },
          [tenantA.id],
          (tx) =>
            tx.subscription.findUnique({
              where: { tenantId: tenantB.id },
              select: { planId: true },
            }),
        )
        expect(results.get(tenantA.id)).toBeNull()
      } finally {
        await prismaService.withTenant(tenantA.id, (tx) =>
          tx.subscription.deleteMany({ where: { tenantId: tenantA.id } }),
        )
        await prismaService.withTenant(tenantB.id, (tx) =>
          tx.subscription.deleteMany({ where: { tenantId: tenantB.id } }),
        )
        await prismaService.db.tenant.delete({ where: { id: tenantA.id } })
        await prismaService.db.tenant.delete({ where: { id: tenantB.id } })
        await prismaService.platform.plan.delete({ where: { id: plan.id } })
      }
    })
  })
})
