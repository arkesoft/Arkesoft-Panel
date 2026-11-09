// @arkesoft/api — AC7 + AC10(b): kiracı güvenlik politikası İKİ KİRACI
// KARŞITLIĞI AYNI TESTTE + "403 alan owner KİLİTLİ DEĞİL" (ROADMAP v0.0.15,
// T-016/S11, kabul kriteri testleri)
//
// AC7 — ⭐ AYNI kullanıcı, İKİ kiracı: biri `requireTwoFactorForOwner` AÇIK,
// biri KAPALI → ilkinde 403 `TWO_FACTOR_REQUIRED`, ikincisinde 200.
// `AuthGuard`'ın zorlama kapısını (`auth.guard.ts`, S6) GERÇEK HTTP + gerçek
// Postgres ile ölçer — `AuthProbeController`'ı (S6'nın test-ONLY yardımcısı,
// `__tests__/helpers/auth-probe.controller.ts`, ÜRETİM KODU DEĞİL) `createTestApp
// ({smokeControllers})` ile TAKAR.
//
// AC10(b) — 403 alan owner KİLİTLİ DEĞİLDİR: altı 2FA ucunun HEPSİ
// `TENANT_EXEMPT_PATHS` üyesi → `AuthGuard`'ın `case 'exempt'` dalı 2FA
// kontrolüne HİÇ GİRMEDEN `true` döner (bkz. `auth-guard-two-factor-
// enforcement.test.ts`'in "ÖLÜMCÜL KİLİT YOK" yapısal kanıtı, BU dosya
// ONU TEKRARLAMAZ — BURADA aynı owner'ın KENDİSİ, 403 ALDIKTAN SONRA,
// kendi 2FA'sını kurabildiğini DAVRANIŞLA kanıtlar). Mekanik assert: altı
// yolun TAMAMI kümede.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import { appErrorBodySchema } from '@arkesoft/errors'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { TENANT_EXEMPT_PATHS } from '../tenancy/tenant-exempt-paths.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { AuthProbeController } from './helpers/auth-probe.controller.js'
import { createTestApp } from './helpers/create-test-app.js'
import { extractQueryParam } from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

function tenantHost(slug: string): string {
  return `${slug}.${BASE_ENV.APP_BASE_DOMAIN}`
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

function toCookiePair(setCookieHeader: string): string {
  const firstSegment = setCookieHeader.split(';')[0]
  if (firstSegment === undefined) {
    throw new Error(`beklenmeyen Set-Cookie biçimi: ${setCookieHeader}`)
  }
  return firstSegment.trim()
}

const totpUriSchema = z.object({
  method: z.literal('totp'),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})

/** AC10(b)'nin mekanik assert'i — altı 2FA ucu. */
const TWO_FACTOR_TENANT_EXEMPT_PATHS = [
  '/auth/two-factor/enable',
  '/auth/two-factor/disable',
  '/auth/two-factor/get-totp-uri',
  '/auth/two-factor/generate-backup-codes',
  '/auth/two-factor/verify-totp',
  '/auth/two-factor/verify-backup-code',
] as const

describe('AC7 — İKİ KİRACI karşıtlığı AYNI testte + AC10(b) — 403 alan owner KİLİTLİ DEĞİL', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined
  let prismaService: PrismaService
  const createdTenantIds: string[] = []

  beforeAll(async () => {
    const testApp = await createTestApp({ smokeControllers: [AuthProbeController] })
    app = testApp.app
    prismaService = app.get(PrismaService)
  }, 60_000)

  afterAll(async () => {
    if (app !== undefined) {
      await Promise.all(
        createdTenantIds.map((id) => prismaService.db.tenant.delete({ where: { id } })),
      )
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  async function createIsolatedTenant(
    namePrefix: string,
    requireTwoFactorForOwner: boolean,
  ): Promise<{ readonly tenantId: string; readonly slug: string }> {
    const slug = uniqueSlug(namePrefix)
    const tenant = await prismaService.db.tenant.create({
      data: {
        slug,
        name: `AC7/AC10b — ${namePrefix}`,
        status: TenantStatus.active,
        requireTwoFactorForOwner,
      },
    })
    createdTenantIds.push(tenant.id)
    return { tenantId: tenant.id, slug }
  }

  it('AC10(b) — mekanik: TENANT_EXEMPT_PATHS altı 2FA ucunun HEPSİNİ taşır', () => {
    for (const path of TWO_FACTOR_TENANT_EXEMPT_PATHS) {
      expect(TENANT_EXEMPT_PATHS.has(path), `${path} TENANT_EXEMPT_PATHS'te OLMALI`).toBe(true)
    }
  })

  it(
    'AC7 — AYNI owner, İKİ kiracı: politika AÇIK → 403 TWO_FACTOR_REQUIRED; politika KAPALI → 200 · ' +
      "AC10(b) — AYNI owner, 403 SONRASI, AYNI kiracıda KENDİ 2FA'sını kurabilir (200)",
    async () => {
      const tenantRequired = await createIsolatedTenant('ac7-required', true)
      const tenantOptional = await createIsolatedTenant('ac7-optional', false)
      const owner = await createAuthenticatedSession(httpServer())

      await prismaService.withTenant(tenantRequired.tenantId, (tx) =>
        tx.tenantMembership.create({
          data: { tenantId: tenantRequired.tenantId, userId: owner.userId, role: TenantRole.owner },
        }),
      )
      await prismaService.withTenant(tenantOptional.tenantId, (tx) =>
        tx.tenantMembership.create({
          data: { tenantId: tenantOptional.tenantId, userId: owner.userId, role: TenantRole.owner },
        }),
      )

      // AC7, karşıtlık (i) — politika AÇIK + 2FA KAPALI → 403.
      const requiredResponse = await request(httpServer())
        .get('/__auth_probe')
        .set('Host', tenantHost(tenantRequired.slug))
        .set('Cookie', owner.cookieHeader)
      expect(requiredResponse.status).toBe(403)
      const requiredBody = appErrorBodySchema.parse(requiredResponse.body)
      expect(requiredBody.code).toBe('TWO_FACTOR_REQUIRED')

      // AC7, karşıtlık (ii) — AYNI kullanıcı, AYNI 2FA durumu, FARKLI kiracı
      // (politika KAPALI) → 200. Politika KİRACIYA aittir, kullanıcıya DEĞİL.
      const optionalResponse = await request(httpServer())
        .get('/__auth_probe')
        .set('Host', tenantHost(tenantOptional.slug))
        .set('Cookie', owner.cookieHeader)
      expect(optionalResponse.status).toBe(200)

      // AC10(b) — 403 alan owner KİLİTLİ DEĞİL: AYNI kiracıda (politika
      // AÇIK, kendisi HÂLÂ 2FA'sız) kendi 2FA'sını kurma akışına erişebilir
      // (altı 2FA ucu `TENANT_EXEMPT_PATHS`'te — `case 'exempt'` dalı 2FA
      // kontrolüne HİÇ GİRMEDEN `true` döner).
      const enableResponse = await request(httpServer())
        .post('/auth/two-factor/enable')
        .set('Host', tenantHost(tenantRequired.slug))
        .set('Cookie', owner.cookieHeader)
        .send({ password: 'arkesoft-test-fixture-password-123', method: 'totp' })
      expect(enableResponse.status).toBe(200)
      const { totpURI } = totpUriSchema.parse(enableResponse.body)
      const base32Secret = extractQueryParam(totpURI, 'secret')
      const confirmCode = await generateTotpCode({ base32Secret })
      const confirmResponse = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Host', tenantHost(tenantRequired.slug))
        .set('Cookie', owner.cookieHeader)
        .send({ code: confirmCode })
      expect(confirmResponse.status).toBe(200)

      // Kurulum TAMAMLANDIKTAN SONRA — AYNI kiracıda, AYNI (artık YENİ oturum
      // çerezi taşıyan) owner artık 403 ALMAZ (politika SAĞLANDI — "satisfied").
      const newSessionSetCookie = z
        .array(z.string())
        .min(1)
        .parse(confirmResponse.headers['set-cookie'])
      const newSessionCookieEntry = newSessionSetCookie.find((entry) =>
        entry.startsWith('better-auth.session_token='),
      )
      if (newSessionCookieEntry === undefined) {
        throw new Error('verify-totp sonrası oturum çerezi bulunamadı')
      }
      const newCookiePair = toCookiePair(newSessionCookieEntry)

      const afterSetupResponse = await request(httpServer())
        .get('/__auth_probe')
        .set('Host', tenantHost(tenantRequired.slug))
        .set('Cookie', newCookiePair)
      expect(afterSetupResponse.status).toBe(200)
    },
    30_000,
  )
})
