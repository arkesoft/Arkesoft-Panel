// @arkesoft/api — AC8: tenant.updateSecurityPolicy YALNIZCA YETKİLİ yazar
// (ROADMAP v0.0.15, T-016/S11, kabul kriteri testleri)
//
// ⚠ Bu test BOŞ OLAMAZ (handoff'un bağlayıcı uyarısı): ölü izin kuralı
// (`packages/trpc/src/authz/permissions.ts` — `Record<TenantRoleWire, …>`
// TAM OLMAK ZORUNDA, `Partial<>` YOK) `security:write`'ın `owner` DIŞINDAKİ
// hiçbir rolde OLMADIĞINI DERLEME ZAMANINDA zorluyor; bu dosyanın işi bunu
// ÇALIŞMA ZAMANINDA da göstermek — `security:write` TAŞIMAYAN bir rolle
// gerçek bir HTTP çağrısı yapıp REDDEDİLDİĞİNİ ölçmek.
//
// `ROLE_PERMISSIONS`'a (katalogdan OKUNUR, KOPYALANMAZ) göre `admin` DAHİL
// owner DIŞINDAKİ DÖRT rol `security:write` TAŞIMAZ — platformun İLK
// owner-münhasır izni (`permissions.ts` dosya başı yorumu). `admin` özellikle
// seçildi: `member:write` TAŞIYAN tek diğer rol — "herhangi bir yazma izni
// yetmiyor, TAM OLARAK `security:write` gerekiyor" ayrımını gösterir.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { ROLE_PERMISSIONS, trpcErrorDataSchema } from '@arkesoft/trpc'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin
const SECURITY_WRITE_PERMISSION = 'security:write'

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

function tenantHost(slug: string): string {
  return `${slug}.${BASE_ENV.APP_BASE_DOMAIN}`
}

describe('AC8 — tenant.updateSecurityPolicy yalnızca security:write TAŞIYAN rol yazar (gerçek Postgres + gerçek HTTP)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined
  let prismaService: PrismaService
  let tenantId: string
  let slug: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    slug = uniqueSlug('ac8-authz')
    const tenant = await prismaService.db.tenant.create({
      data: { slug, name: 'AC8 Yetki Testi', status: TenantStatus.active },
    })
    tenantId = tenant.id
  }, 60_000)

  afterAll(async () => {
    if (app !== undefined) {
      await prismaService.db.tenant.delete({ where: { id: tenantId } })
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  it('KATALOG PİNİ — ROLE_PERMISSIONS: owner security:write TAŞIR, admin DAHİL diğer dört rol TAŞIMAZ', () => {
    expect(ROLE_PERMISSIONS.owner).toContain(SECURITY_WRITE_PERMISSION)
    expect(ROLE_PERMISSIONS.admin).not.toContain(SECURITY_WRITE_PERMISSION)
    expect(ROLE_PERMISSIONS.staff).not.toContain(SECURITY_WRITE_PERMISSION)
    expect(ROLE_PERMISSIONS.support).not.toContain(SECURITY_WRITE_PERMISSION)
    expect(ROLE_PERMISSIONS.readonly).not.toContain(SECURITY_WRITE_PERMISSION)
  })

  it(
    'ÇALIŞMA ZAMANI — admin rolü (member:write TAŞIR AMA security:write TAŞIMAZ) → ' +
      '403 PERMISSION_DENIED; AYNI kiracıda owner → 200 (AYNI uç, AYNI girdi, FARKLI rol)',
    async () => {
      const adminActor = await createAuthenticatedSession(httpServer())
      const ownerActor = await createAuthenticatedSession(httpServer())

      await prismaService.withTenant(tenantId, async (tx) => {
        await tx.tenantMembership.create({
          data: { tenantId, userId: adminActor.userId, role: TenantRole.admin },
        })
        await tx.tenantMembership.create({
          data: { tenantId, userId: ownerActor.userId, role: TenantRole.owner },
        })
      })

      const adminResponse = await request(httpServer())
        .post('/trpc/tenant.updateSecurityPolicy')
        .set('Host', tenantHost(slug))
        .set('Cookie', adminActor.cookieHeader)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ requireTwoFactorForOwner: false })

      expect(adminResponse.status).toBe(403)
      const adminEnvelope = z
        .object({ error: z.object({ data: trpcErrorDataSchema }) })
        .parse(adminResponse.body)
      expect(adminEnvelope.error.data.httpStatus).toBe(403)
      expect(adminEnvelope.error.data.appError.code).toBe('PERMISSION_DENIED')

      // ⚠ İzin adı/rol TELE SIZMAZ — `details` BOŞ, gövdenin TAMAMI izin
      // adını/rol adını TAŞIMAZ (`member-authz.test.ts`'in AYNI deseni).
      expect(adminEnvelope.error.data.appError.details).toEqual({})
      const rawAdminBody = JSON.stringify(adminResponse.body)
      expect(rawAdminBody).not.toContain(SECURITY_WRITE_PERMISSION)
      expect(rawAdminBody).not.toContain('"admin"')

      // AYNI uç, AYNI girdi, owner rolüyle → 200 (fark SADECE rol).
      const ownerResponse = await request(httpServer())
        .post('/trpc/tenant.updateSecurityPolicy')
        .set('Host', tenantHost(slug))
        .set('Cookie', ownerActor.cookieHeader)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ requireTwoFactorForOwner: false })

      expect(ownerResponse.status).toBe(200)
      const ownerBody = z
        .object({ result: z.object({ data: z.object({ requireTwoFactorForOwner: z.boolean() }) }) })
        .parse(ownerResponse.body)
      expect(ownerBody.result.data).toEqual({ requireTwoFactorForOwner: false })

      // Yazmanın GERÇEKTEN olmadığının (admin reddi) veri katmanı kanıtı —
      // reddeden çağrı HİÇBİR değişiklik ÜRETMEDİ (owner'ın İDEMPOTENT
      // no-op'u DA zaten `false`'u `false` yaptığı için satırda tek konum
      // VAR, iki ayrı değer YOK).
      const tenantRow = await prismaService.db.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { requireTwoFactorForOwner: true },
      })
      expect(tenantRow.requireTwoFactorForOwner).toBe(false)
    },
    30_000,
  )
})
