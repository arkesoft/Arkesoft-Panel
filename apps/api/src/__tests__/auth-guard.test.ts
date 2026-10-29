// @arkesoft/api — AuthGuard testleri (ROADMAP v0.0.5, T-006/S6, architect
// R2/riski 13, AC4(e)/(f), AC5)
//
// İKİ SEVİYE: (1) BİRİM — `AuthGuard.canActivate()` doğrudan, ALS deposu elle
// kurularak çağrılır (`tenant-guard.test.ts`/`error-mapping.test.ts`'in AYNI
// deseni — `runWith*` yardımcıları). (2) HTTP — gerçek Postgres + Mailpit,
// `AuthProbeController` (K7, teste özel) üzerinden.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { ExecutionContext, INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { DEMO_SEED, TenantRole, UserStatus } from '@arkesoft/db'
import { pino } from 'pino'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { AuthGuard } from '../auth/auth.guard.js'
import { isEligibleUser } from '../auth/user-eligibility.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { EmailNotVerifiedError } from '../errors/domain/email-not-verified.error.js'
import { SessionNotFoundError } from '../errors/domain/session-not-found.error.js'
import { TenantMembershipRequiredError } from '../errors/domain/tenant-membership-required.error.js'
import { UnauthenticatedError } from '../errors/domain/unauthenticated.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { requestContextStorage } from '../request-context/request-context.storage.js'
import type { RequestContext } from '../request-context/request-context.types.js'
import { AuthProbeController } from './helpers/auth-probe.controller.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

function tenantHost(slug: string): string {
  return `${slug}.${BASE_ENV.APP_BASE_DOMAIN}`
}

const REQUEST_ID = 'req_test0000000000000000000002'
const SIGN_UP_PASSWORD = 'arkesoft-s6-guard-password-123'

function uniqueEmail(): string {
  return `s6-guard-${randomUUID().slice(0, 12)}@arkesoft.test`
}

/**
 * ALS deposunu elle kurar ve `callback`'i o bağlam İÇİNDE çalıştırır —
 * `tenant-guard.test.ts`/`error-mapping.test.ts`'in AYNI deseni, ASENKRON
 * `callback` DESTEKLER (`AsyncLocalStorage.run()` dönüşü AYNEN taşır) —
 * `AuthGuard.canActivate()` `async` olduğu için (R2'nin `withTenant()`
 * çağrısı) senkron `toThrow()` DEĞİL, `rejects`/`resolves` kullanılır.
 */
function runWithStore<T>(
  store: Omit<RequestContext, 'requestId' | 'receivedAt'>,
  callback: () => T,
): T {
  const fullStore: RequestContext = { requestId: REQUEST_ID, receivedAt: Date.now(), ...store }
  return requestContextStorage.run(fullStore, callback)
}

// `AuthGuard`'ın tek constructor bağımlılığı `PrismaService`'tir, ama bu
// bloktaki HİÇBİR senaryo (`pending`/`unauthenticated`/`exempt`/
// `unresolved`/`failed` dalları) bir Prisma çağrısına ULAŞMAZ — framework
// arayüzünü mock'lamanın standart test deseni (`tenant-guard.test.ts`'in
// `as unknown as ExecutionContext` deseniyle AYNI, üretim kodunda DEĞİL).
function buildGuardWithoutDb(): AuthGuard {
  return new AuthGuard({} as unknown as PrismaService)
}

const FAKE_EXECUTION_CONTEXT = {} as unknown as ExecutionContext
const FAKE_IDENTITY = { userId: 'usr_test', sessionId: 'ses_test' } as const

describe('AuthGuard — birim (architect riski 13, "default allow" dalı YOK)', () => {
  it('auth.kind === "pending" → ham Error (500) — AuthContextMiddleware bu rota için koşmadı', async () => {
    const guard = buildGuardWithoutDb()

    await expect(
      runWithStore(
        {
          logger: pino({ level: 'silent' }),
          tenant: { kind: 'exempt' },
          auth: { kind: 'pending' },
        },
        () => guard.canActivate(FAKE_EXECUTION_CONTEXT),
      ),
    ).rejects.toThrow(/AuthContextMiddleware bu rota için koşmadı/)
  })

  it('auth.kind === "authenticated" AMA tenant.kind === "pending" → ham Error (500, sıra ihlali)', async () => {
    const guard = buildGuardWithoutDb()

    await expect(
      runWithStore(
        {
          logger: pino({ level: 'silent' }),
          tenant: { kind: 'pending' },
          auth: { kind: 'authenticated', ...FAKE_IDENTITY },
        },
        () => guard.canActivate(FAKE_EXECUTION_CONTEXT),
      ),
    ).rejects.toThrow(/sıra ihlali/)
  })

  it('auth.kind === "unauthenticated" → UnauthenticatedError fırlatır', async () => {
    const guard = buildGuardWithoutDb()

    await expect(
      runWithStore(
        {
          logger: pino({ level: 'silent' }),
          tenant: { kind: 'exempt' },
          auth: { kind: 'unauthenticated' },
        },
        () => guard.canActivate(FAKE_EXECUTION_CONTEXT),
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedError)
  })

  it('auth.kind === "exempt" → true (kimlik gerekmez)', async () => {
    const guard = buildGuardWithoutDb()

    await expect(
      runWithStore(
        {
          logger: pino({ level: 'silent' }),
          tenant: { kind: 'unresolved', reason: 'no_row' },
          auth: { kind: 'exempt' },
        },
        () => guard.canActivate(FAKE_EXECUTION_CONTEXT),
      ),
    ).resolves.toBe(true)
  })

  it('auth "authenticated" + tenant "exempt" → true (üyelik kontrolü GEREKMEZ, ör. AUTH_OWN_PATHS)', async () => {
    const guard = buildGuardWithoutDb()

    await expect(
      runWithStore(
        {
          logger: pino({ level: 'silent' }),
          tenant: { kind: 'exempt' },
          auth: { kind: 'authenticated', ...FAKE_IDENTITY },
        },
        () => guard.canActivate(FAKE_EXECUTION_CONTEXT),
      ),
    ).resolves.toBe(true)
  })

  it.each([
    ['unresolved', { kind: 'unresolved' as const, reason: 'no_row' as const }],
    ['failed', { kind: 'failed' as const, cause: new Error('boom') }],
  ])(
    'auth "authenticated" + tenant "%s" → true (TenantGuard KENDİ hatasını üretecek, tekrar edilmez)',
    async (_label, tenant) => {
      const guard = buildGuardWithoutDb()

      await expect(
        runWithStore(
          {
            logger: pino({ level: 'silent' }),
            tenant,
            auth: { kind: 'authenticated', ...FAKE_IDENTITY },
          },
          () => guard.canActivate(FAKE_EXECUTION_CONTEXT),
        ),
      ).resolves.toBe(true)
    },
  )
})

describe('Hata sınıfları — birim (architect "HATA SINIFLARI" bölümü)', () => {
  it('UnauthenticatedError: UNAUTHENTICATED/401', () => {
    const error = new UnauthenticatedError()
    expect(error.code).toBe('UNAUTHENTICATED')
    expect(error.httpStatus).toBe(401)
    expect(error.isRetryable).toBe(false)
  })

  it('TenantMembershipRequiredError: TENANT_MEMBERSHIP_REQUIRED/403, context {userId, tenantId}', () => {
    const error = new TenantMembershipRequiredError('usr_1', 'tnt_1')
    expect(error.code).toBe('TENANT_MEMBERSHIP_REQUIRED')
    expect(error.httpStatus).toBe(403)
    expect(error.context).toEqual({ userId: 'usr_1', tenantId: 'tnt_1' })
  })

  it('SessionNotFoundError: SESSION_NOT_FOUND/404, context {}', () => {
    const error = new SessionNotFoundError()
    expect(error.code).toBe('SESSION_NOT_FOUND')
    expect(error.httpStatus).toBe(404)
    expect(error.context).toEqual({})
  })

  it('EmailNotVerifiedError: EMAIL_NOT_VERIFIED/403, context {userId} (scaffold — bkz. dosya başı yorumu)', () => {
    const error = new EmailNotVerifiedError('usr_1')
    expect(error.code).toBe('EMAIL_NOT_VERIFIED')
    expect(error.httpStatus).toBe(403)
    expect(error.context).toEqual({ userId: 'usr_1' })
  })
})

describe('AuthGuard — HTTP (AC4(e)/(f), AC5 — gerçek Postgres + Mailpit)', () => {
  let app: INestApplication<Server> | undefined

  beforeAll(async () => {
    const testApp = await createTestApp({ smokeControllers: [AuthProbeController] })
    app = testApp.app
  })

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

  it("AC5: çerezsiz istek → 401 UNAUTHENTICATED (tenant ÇÖZÜLMÜŞ olsa bile — auth.kind switch tenant'tan ÖNCE kontrol edilir)", async () => {
    const response = await request(httpServer())
      .get('/__auth_probe')
      .set('Host', tenantHost(DEMO_SEED.tenant.slug))

    expect(response.status).toBe(401)
    const body = z.object({ code: z.string() }).parse(response.body)
    expect(body.code).toBe('UNAUTHENTICATED')
  })

  it('AC4(e)/(f): geçerli çerez + kiracı üyeliği → 200 + @CurrentUser() kimliği; sign-out SONRASI aynı çerez → 401', async () => {
    const email = uniqueEmail()
    await deleteAllMailpitMessages()

    await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'S6 Guard Kullanıcısı', email, password: SIGN_UP_PASSWORD })

    const delivered = await findLatestMailpitMessageTo(email)
    const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
    await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(token)}`)

    const signInResponse = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: SIGN_UP_PASSWORD })

    const cookies = z.array(z.string()).min(1).parse(signInResponse.headers['set-cookie'])
    const cookieHeader = cookies.join('; ')
    const userId = z.object({ user: z.object({ id: z.string() }) }).parse(signInResponse.body)
      .user.id

    // R2 — DEMO_SEED'e üyelik OLMADAN /__auth_probe (tenant ÇÖZÜLMÜŞ host'ta)
    // 403 TENANT_MEMBERSHIP_REQUIRED verirdi; bu testin konusu AC4(e)/(f)
    // olduğu için üyelik KURULUR.
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    const prismaService = app.get(PrismaService)
    const demoTenant = await prismaService.db.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })
    if (demoTenant === null) {
      throw new Error('DEMO_SEED tenant bulunamadı — pnpm db:seed koşmuş mu?')
    }
    await prismaService.withTenant(demoTenant.id, (tx) =>
      tx.tenantMembership.create({
        data: { tenantId: demoTenant.id, userId, role: TenantRole.readonly },
      }),
    )

    const probeResponse = await request(httpServer())
      .get('/__auth_probe')
      .set('Host', tenantHost(DEMO_SEED.tenant.slug))
      .set('Cookie', cookieHeader)

    expect(probeResponse.status).toBe(200)
    const identity = z
      .object({ userId: z.string(), sessionId: z.string() })
      .parse(probeResponse.body)
    expect(identity.userId).toBe(userId)
    expect(identity.sessionId.length).toBeGreaterThan(0)

    await request(httpServer()).post('/auth/sign-out').set('Cookie', cookieHeader)

    const afterSignOutResponse = await request(httpServer())
      .get('/__auth_probe')
      .set('Host', tenantHost(DEMO_SEED.tenant.slug))
      .set('Cookie', cookieHeader)

    expect(afterSignOutResponse.status).toBe(401)
  }, 20_000)

  // --- user-eligibility (architect "Açık uç", DoD madde 7) ------------------
  // Better Auth'un KENDİ oturum/giriş akışı `status`/`deletedAt`'i BİLMEZ —
  // bu kontrol ATLANIRSA soft-delete edilmiş/`suspended` bir kullanıcının
  // ÖNCEDEN kurulmuş GEÇERLİ oturumu korumalı uçlara erişmeyi SÜRDÜRÜR. Bu
  // testler `/auth/sessions` (AUTH_OWN_PATHS, kiracıdan MUAF) kullanır —
  // eligibility kontrolü tenant'tan BAĞIMSIZDIR.
  it.each([
    [
      'suspended',
      async (userId: string, prismaService: PrismaService): Promise<void> => {
        await prismaService.db.user.update({
          where: { id: userId },
          data: { status: UserStatus.suspended },
        })
      },
    ],
    [
      'soft-delete',
      async (userId: string, prismaService: PrismaService): Promise<void> => {
        await prismaService.db.user.update({
          where: { id: userId },
          data: { deletedAt: new Date() },
        })
      },
    ],
  ] as const)(
    '%s kullanıcı: ÖNCEDEN kurulmuş GEÇERLİ oturum → 401 UNAUTHENTICATED (hesap durumu SIZDIRILMAZ, aynı gövde)',
    async (_label, makeIneligible) => {
      const email = uniqueEmail()
      await deleteAllMailpitMessages()

      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S6 Eligibility Kullanıcısı', email, password: SIGN_UP_PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(token)}`)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: SIGN_UP_PASSWORD })

      const cookies = z.array(z.string()).min(1).parse(signInResponse.headers['set-cookie'])
      const cookieHeader = cookies.join('; ')
      const userId = z.object({ user: z.object({ id: z.string() }) }).parse(signInResponse.body)
        .user.id

      // Sanity — kısıtlama ÖNCESİ oturum geçerli (401 İLE karıştırılmasın).
      const beforeResponse = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', cookieHeader)
      expect(beforeResponse.status).toBe(200)

      if (app === undefined) {
        throw new Error('test uygulaması henüz kurulmadı')
      }
      await makeIneligible(userId, app.get(PrismaService))

      const afterResponse = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', cookieHeader)

      expect(afterResponse.status).toBe(401)
      const body = z.object({ code: z.string() }).parse(afterResponse.body)
      // Hesap durumu (suspended/soft-delete) AYRIMI YAPILMAZ — ikisi de AYNI
      // kod/gövdeyi üretir (K5'in ruhu).
      expect(body.code).toBe('UNAUTHENTICATED')
    },
    20_000,
  )
})

describe('isEligibleUser — birim (architect "VERİ MODELİ" → "Açık uç")', () => {
  it('status=active ve deletedAt=null → uygun', () => {
    expect(isEligibleUser({ status: UserStatus.active, deletedAt: null })).toBe(true)
  })

  it('status=suspended → UYGUN DEĞİL', () => {
    expect(isEligibleUser({ status: UserStatus.suspended, deletedAt: null })).toBe(false)
  })

  it('deletedAt dolu (soft-delete) → UYGUN DEĞİL', () => {
    expect(isEligibleUser({ status: UserStatus.active, deletedAt: new Date() })).toBe(false)
  })

  it('status=suspended VE deletedAt dolu → UYGUN DEĞİL (ikisi birden)', () => {
    expect(isEligibleUser({ status: UserStatus.suspended, deletedAt: new Date() })).toBe(false)
  })
})
