// @arkesoft/api — AC10(a): kendini kilitlememe + YALNIZCA ÇAĞIRAN denetlenir
// (ROADMAP v0.0.15, T-016/S11, kabul kriteri testleri)
//
// (a) Zorunluluğu KAPALIDAN AÇIĞA çeviren owner KENDİSİ 2FA kurmuş olmalı,
// aksi hâlde 409 `TWO_FACTOR_SETUP_REQUIRED` (`tenant-security.service.ts`,
// S7). ⚠ YALNIZCA ÇAĞIRAN denetlenir — "kiracının BAŞKA 2FA'sız owner'ı var
// mı" sorgusu BAŞKA KULLANICILARIN güvenlik durumunu SIZDIRIR; böyle bir
// sorgunun OLMADIĞI iki bağımsız yolla kanıtlanır:
//
//   BİRİM (yapısal fail-closed): `TenantSecurityService`'e sahte bir
//   `PrismaService` verilir — `tenant` delegesi YALNIZCA `findFirst`,
//   `user` delegesi YALNIZCA `findUnique` ÇAĞRILABİLİR; BAŞKA herhangi bir
//   metot (`findMany` dahil) çağrılırsa Proxy FIRLAR (`AuthGuard`'ın
//   `tenant.kind === 'exempt'` testindeki `dbCallProbe` deseninin AYNISI).
//
//   DAVRANIŞSAL (gerçek Postgres + gerçek HTTP): AYNI kiracıda İKİNCİ bir
//   owner'ın 2FA'sı AÇIK olsa BİLE, ÇAĞIRAN owner'ın KENDİSİ 2FA'sız olduğu
//   sürece sonuç DEĞİŞMEZ (409) — "kiracıda EN AZ BİR 2FA'lı owner var mı"
//   sorgusu KULLANILMADIĞININ davranışsal kanıtı.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import { trpcErrorDataSchema } from '@arkesoft/trpc'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { TwoFactorSetupRequiredError } from '../errors/domain/two-factor-setup-required.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { TenantSecurityService } from '../tenant/tenant-security.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

function tenantHost(slug: string): string {
  return `${slug}.${BASE_ENV.APP_BASE_DOMAIN}`
}

/**
 * Yalnızca `tenant.findFirst` ve `user.findUnique`'in ÇAĞRILABİLDİĞİ sahte
 * bir `PrismaService` — BAŞKA bir delege/metot çağrılırsa Proxy FIRLAR. Bu,
 * "başka kullanıcı sorgusu YOK" iddiasının YAPISAL (mock'un ÇAĞRILMADIĞINI
 * ummak DEĞİL, ÇAĞRILIRSA PATLAMASINI SAĞLAMAK) kanıtıdır.
 */
function createNoCrossUserQueryPrismaService(options: {
  readonly tenantRow: { readonly requireTwoFactorForOwner: boolean } | null
  readonly userRow: { readonly twoFactorEnabled: boolean } | null
}): {
  readonly prismaService: PrismaService
  readonly tenantFindFirst: ReturnType<typeof vi.fn>
  readonly userFindUnique: ReturnType<typeof vi.fn>
} {
  const tenantFindFirst = vi.fn().mockResolvedValue(options.tenantRow)
  const userFindUnique = vi.fn().mockResolvedValue(options.userRow)

  const tenantDelegate = createAllowlistedDelegate(
    { findFirst: tenantFindFirst },
    (prop) => `TenantSecurityService: db.tenant.${prop} ÇAĞRILMAMALI (yalnızca findFirst beklenir)`,
  )
  const userDelegate = createAllowlistedDelegate(
    { findUnique: userFindUnique },
    (prop) =>
      `TenantSecurityService: db.user.${prop} ÇAĞRILMAMALI — BAŞKA KULLANICI SORGUSU YOK (yalnızca findUnique, yalnızca ÇAĞIRAN)`,
  )
  const db = createAllowlistedDelegate(
    { tenant: tenantDelegate, user: userDelegate },
    (prop) => `TenantSecurityService: db.${prop} ÇAĞRILMAMALI`,
  )

  const prismaService = { db } as unknown as PrismaService
  return { prismaService, tenantFindFirst, userFindUnique }
}

/**
 * Yalnızca `target`'ın SAHİP OLDUĞU anahtarlara erişime izin veren bir Proxy
 * kurar — tanımsız bir anahtara erişim `buildMessage(prop)`'un ürettiği
 * mesajla FIRLAR (`AuthGuard`'ın `tenant.kind === 'exempt'` testindeki
 * `dbCallProbe` deseninin TİPLİ karşılığı). `Reflect.get`'in `any` dönüşü
 * BURADA (tek yerde) `unknown`'a daraltılır — çağıranlar `any` GÖRMEZ.
 */
function createAllowlistedDelegate<T extends object>(
  target: T,
  buildMessage: (prop: string) => string,
): T {
  const handler: ProxyHandler<T> = {
    get(obj, prop): unknown {
      if (prop in obj) {
        const value: unknown = Reflect.get(obj, prop)
        return value
      }
      throw new Error(buildMessage(String(prop)))
    },
  }
  return new Proxy(target, handler)
}

describe('AC10(a) BİRİM — yapısal fail-closed: başka kullanıcı sorgusu YOK (sahte PrismaService, DB YOK)', () => {
  it('politika KAPALIDAN AÇIĞA + çağıran 2FA KAPALI → 409, YALNIZCA tenant.findFirst + user.findUnique(actorUserId) çağrılır', async () => {
    const { prismaService, tenantFindFirst, userFindUnique } = createNoCrossUserQueryPrismaService({
      tenantRow: { requireTwoFactorForOwner: false },
      userRow: { twoFactorEnabled: false },
    })
    const service = new TenantSecurityService(prismaService)

    await expect(
      service.updateSecurityPolicy('tnt_ac10a', 'usr_actor', { requireTwoFactorForOwner: true }),
    ).rejects.toBeInstanceOf(TwoFactorSetupRequiredError)

    expect(tenantFindFirst).toHaveBeenCalledTimes(1)
    expect(tenantFindFirst).toHaveBeenCalledWith({
      where: { id: 'tnt_ac10a', deletedAt: null },
      select: { requireTwoFactorForOwner: true },
    })
    expect(userFindUnique).toHaveBeenCalledTimes(1)
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: 'usr_actor' },
      select: { twoFactorEnabled: true },
    })
  })

  it('VACUITY KANITI — Proxy GERÇEKTEN fail-closed: tanımsız bir delegeye erişim FIRLAR (üretim kodu TETİKLEMESE de mekanizma çalışıyor)', () => {
    const { prismaService } = createNoCrossUserQueryPrismaService({
      tenantRow: { requireTwoFactorForOwner: false },
      userRow: { twoFactorEnabled: false },
    })
    expect(
      () => (prismaService.db as unknown as { user: { findMany: unknown } }).user.findMany,
    ).toThrow(/BAŞKA KULLANICI SORGUSU YOK/)
  })
})

describe('AC10(a) DAVRANIŞSAL — gerçek Postgres + gerçek HTTP: sibling owner 2FA AÇIK olsa da sonuç DEĞİŞMEZ', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined
  let prismaService: PrismaService
  let tenantId: string
  let slug: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    slug = uniqueSlug('ac10a-self-lockout')
    const tenant = await prismaService.db.tenant.create({
      data: { slug, name: 'AC10(a) Kendini Kilitlememe Testi', status: TenantStatus.active },
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

  it(
    'çağıran owner 2FA KAPALI + AYNI kiracıda BAŞKA bir owner 2FA AÇIK → HÂLÂ 409 ' +
      '("kiracıda en az bir 2FA\'lı owner var mı" sorgusu KULLANILMADIĞININ davranışsal kanıtı)',
    async () => {
      const actingOwner = await createAuthenticatedSession(httpServer())
      const otherOwner = await createAuthenticatedSession(httpServer())

      await prismaService.withTenant(tenantId, async (tx) => {
        await tx.tenantMembership.create({
          data: { tenantId, userId: actingOwner.userId, role: TenantRole.owner },
        })
        await tx.tenantMembership.create({
          data: { tenantId, userId: otherOwner.userId, role: TenantRole.owner },
        })
      })
      // Diğer owner'ın 2FA'sı AÇIK (acting owner'ınki KAPALI kalır) — eğer
      // üretim kodu YANLIŞLIKLA "kiracıda herhangi bir 2FA'lı owner var mı"
      // sorgusu yapsaydı, bu durum 200 (izin verildi) üretirdi.
      await prismaService.db.user.update({
        where: { id: otherOwner.userId },
        data: { twoFactorEnabled: true },
      })

      const response = await request(httpServer())
        .post('/trpc/tenant.updateSecurityPolicy')
        .set('Host', tenantHost(slug))
        .set('Cookie', actingOwner.cookieHeader)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ requireTwoFactorForOwner: true })

      expect(response.status).toBe(409)
      const envelope = z
        .object({ error: z.object({ data: trpcErrorDataSchema }) })
        .parse(response.body)
      expect(envelope.error.data.httpStatus).toBe(409)
      expect(envelope.error.data.appError.code).toBe('TWO_FACTOR_SETUP_REQUIRED')

      // Politika GERÇEKTEN DEĞİŞMEDİ (409 bir yan etki ÜRETMEDİ).
      const tenantRow = await prismaService.db.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { requireTwoFactorForOwner: true },
      })
      expect(tenantRow.requireTwoFactorForOwner).toBe(false)
    },
    30_000,
  )
})
