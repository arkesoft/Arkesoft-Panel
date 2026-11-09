// @arkesoft/api — AC6: allowlist fail-closed, OTP KAPALI (ROADMAP v0.0.15,
// T-016/S11, kabul kriteri testleri)
//
// `auth-delegated-paths.ts`'in dosya başı GÜNCELLEME yorumunda ÖLÇÜLDÜ:
// `/two-factor/send-otp` Better Auth'un `otp2fa` eklentisinde HTTP router'a
// KAYDOLUR (`otpOptions` yapılandırılmasa bile) ama Arkesoft'un `auth-
// instance.ts`'i `otpOptions` GEÇMEZ ve bu yol BİLEREK `AUTH_DELEGATED_
// PATHS`'e EKLENMEDİ — `AuthController.delegate()` bu yüzden
// `isAuthDelegatedPath` kontrolünde HAYIR bulur ve `NotFoundException` (404,
// `HTTP_EXCEPTION` jenerik gövdesi) fırlatır.
//
// ⚠⚠ TEK BAŞINA 404 HİÇBİR ŞEY KANITLAMAZ (handoff'un bağlayıcı uyarısı):
// kiracı/host çözülemediği için de 404 `TENANT_NOT_FOUND` alınabilir — bu
// YANLIŞ POZİTİF olurdu ("uygulama tümden yanlış yönlendirildi" DEĞİL,
// "allowlist fail-closed çalışıyor" ÖLÇÜLMEK istenen şey). Bu yüzden:
//
//   (a) `send-otp` AYNI geçerli oturum + AYNI geçerli kiracı bağlamıyla
//       çağrılır VE gövdenin `code`'u `HTTP_EXCEPTION`'dır — `TENANT_NOT_FOUND`
//       DEĞİL. Bu, 404'ün kiracı/host çözümünden DEĞİL, AuthController'ın
//       KENDİ allowlist kapısından geldiğini kanıtlar.
//   (b) KAPSAM İÇİ KARDEŞ `verify-totp`, TIPATIP AYNI oturum/çerez/host ile,
//       404 ALMAZ — allowlist'in GENİŞ bir yanlış yapılandırma DEĞİL, TAM
//       OLARAK `send-otp`'u dışladığının kanıtı.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import { appErrorBodySchema } from '@arkesoft/errors'
import { TenantRole, TenantStatus } from '@arkesoft/db'
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

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

function tenantHost(slug: string): string {
  return `${slug}.${BASE_ENV.APP_BASE_DOMAIN}`
}

describe('AC6 — /auth/two-factor/send-otp allowlist fail-closed, kapsam içi kardeş ETKİLENMEZ', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined
  let prismaService: PrismaService
  let tenantId: string
  let slug: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    slug = uniqueSlug('ac6-send-otp')
    const tenant = await prismaService.db.tenant.create({
      data: { slug, name: 'AC6 Allowlist Testi', status: TenantStatus.active },
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
    'AYNI geçerli oturum+kiracı bağlamıyla: send-otp → 404 HTTP_EXCEPTION (TENANT_NOT_FOUND DEĞİL) · ' +
      'verify-totp (kapsam içi kardeş) → 404 ALMAZ',
    async () => {
      const member = await createAuthenticatedSession(httpServer())
      await prismaService.withTenant(tenantId, (tx) =>
        tx.tenantMembership.create({
          data: { tenantId, userId: member.userId, role: TenantRole.staff },
        }),
      )

      // (a) `send-otp` — allowlist DIŞI, geçerli oturum+kiracı OLMASINA
      // RAĞMEN 404. `code` `HTTP_EXCEPTION` — `TENANT_NOT_FOUND` DEĞİL, bu
      // yüzden 404'ün KAYNAĞI kiracı çözümü DEĞİL, allowlist'in KENDİSİDİR.
      const sendOtpResponse = await request(httpServer())
        .post('/auth/two-factor/send-otp')
        .set('Host', tenantHost(slug))
        .set('Cookie', member.cookieHeader)
        .set('Origin', TRUSTED_ORIGIN)
        .send({})

      expect(sendOtpResponse.status).toBe(404)
      const sendOtpBody = appErrorBodySchema.parse(sendOtpResponse.body)
      expect(sendOtpBody.code).toBe('HTTP_EXCEPTION')
      expect(sendOtpBody.code).not.toBe('TENANT_NOT_FOUND')

      // (b) KAPSAM İÇİ KARDEŞ — TIPATIP AYNI oturum/host ile `verify-totp`
      // 404 ALMAZ (allowlist'in genel bir yanlış yapılandırma OLMADIĞININ
      // kanıtı — yalnızca `send-otp` dışlandı).
      const verifyTotpResponse = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Host', tenantHost(slug))
        .set('Cookie', member.cookieHeader)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ code: '000000' })

      expect(verifyTotpResponse.status).not.toBe(404)
      const verifyTotpBody = z
        .object({ code: z.string(), message: z.string() })
        .parse(verifyTotpResponse.body)
      expect(verifyTotpBody.code).not.toBe('HTTP_EXCEPTION')
    },
    30_000,
  )
})
