// @arkesoft/api — oturum uçları entegrasyon testleri (ROADMAP v0.0.5,
// T-006/S6, architect "tRPC SÖZLEŞMESİ" → HTTP sözleşmesi bölüm B, K5/K6, AC6)
//
// Gerçek Postgres + gerçek Mailpit. AC6 BAĞLAYICI: iki giriş → liste TAM 2,
// HİÇBİR kayıtta ham `token`/hash YOK; birini sonlandır → o çerez 401 diğeri
// 200; tümünü → ikisi 401; BAŞKASININ `sessionId`'si → 404.
//
// FIX turu 2, madde 2 (security tur2 S-3) — `SameOriginGuard` artık `Cookie`
// taşıyan GÜVENSİZ istekler (POST) için `Origin`/`Referer`/`Sec-Fetch-Site`
// ÜÇÜNÜN DE eksikliğini REDDEDİYOR. Bu dosyanın `/auth/sessions/revoke*`
// çağrıları `.set('Origin', ...)` EKLEDİ — tarayıcının zaten yaptığı şey
// (same-origin-guard.test.ts'in önerdiği desen).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-s6-sessions-password-123'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

const signInBodySchema = z.object({ user: z.object({ id: z.string() }) })
const setCookieHeaderSchema = z.array(z.string()).min(1)

/**
 * `AUTH_SECRET_BEARING_MODELS`'in ÜÇ alanı (`token`, `password`, `value`)
 * hiçbir dize/JSON temsilinde GEÇMEMELİ — AC6'nın "ham token/hash YOK" maddesinin
 * mekanik taraması.
 */
function assertNoRawSecret(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  expect(serialized.includes('"token"')).toBe(false)
  expect(serialized.includes('"password"')).toBe(false)
}

describe('SessionsController — AC6 (gerçek Postgres + Mailpit)', () => {
  let app: INestApplication<Server> | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
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

  async function signUpVerifyAndSignIn(
    email: string,
  ): Promise<{ cookieHeader: string; userId: string }> {
    await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'S6 Oturum Testi', email, password: PASSWORD })

    const delivered = await findLatestMailpitMessageTo(email)
    const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
    await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(token)}`)

    const signInResponse = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: PASSWORD })

    const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
    const body = signInBodySchema.parse(signInResponse.body)

    return { cookieHeader: cookies.join('; '), userId: body.user.id }
  }

  it(
    'iki giriş → liste TAM 2 (ham token/hash YOK) · birini sonlandır → o çerez 401 diğeri 200 · ' +
      "tümünü sonlandır → ikisi de 401 · başkasının sessionId'si → 404",
    async () => {
      const email = uniqueEmail('s6-sessions')
      await deleteAllMailpitMessages()

      const first = await signUpVerifyAndSignIn(email)

      // AYNI hesapla İKİNCİ giriş — Better Auth varsayılanı tek oturumla
      // SINIRLAMAZ, bu yüzden yeni bir doğrulama/kayıt GEREKMEZ.
      const secondSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
      const secondCookieHeader = setCookieHeaderSchema
        .parse(secondSignIn.headers['set-cookie'])
        .join('; ')

      const listResponse = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', first.cookieHeader)

      expect(listResponse.status).toBe(200)
      assertNoRawSecret(listResponse.body)

      const sessions = z
        .array(
          z.object({
            id: z.string(),
            createdAt: z.string(),
            updatedAt: z.string(),
            expiresAt: z.string(),
            isCurrent: z.boolean(),
          }),
        )
        .parse(listResponse.body)

      expect(sessions.length).toBe(2)
      expect(sessions.filter((session) => session.isCurrent).length).toBe(1)

      const currentSession = sessions.find((session) => session.isCurrent)
      const otherSession = sessions.find((session) => !session.isCurrent)
      expect(currentSession).toBeDefined()
      expect(otherSession).toBeDefined()
      if (currentSession === undefined || otherSession === undefined) {
        return
      }

      // --- başkasının sessionId'si → 404 (K5) --------------------------------
      const otherUserEmail = uniqueEmail('s6-sessions-other')
      await deleteAllMailpitMessages()
      const otherUser = await signUpVerifyAndSignIn(otherUserEmail)

      const otherUserSessionsResponse = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', otherUser.cookieHeader)
      const otherUserSessions = z
        .array(z.object({ id: z.string() }))
        .parse(otherUserSessionsResponse.body)
      const otherUserSessionId = otherUserSessions[0]?.id
      expect(otherUserSessionId).toBeDefined()

      const crossUserRevokeResponse = await request(httpServer())
        .post('/auth/sessions/revoke')
        .set('Cookie', first.cookieHeader)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .send({ sessionId: otherUserSessionId })
      expect(crossUserRevokeResponse.status).toBe(404)
      const crossUserBody = z.object({ code: z.string() }).parse(crossUserRevokeResponse.body)
      expect(crossUserBody.code).toBe('SESSION_NOT_FOUND')

      // var olmayan bir sessionId İLE AYNI cevap (K5 — ayrım yapılmaz)
      const nonExistentRevokeResponse = await request(httpServer())
        .post('/auth/sessions/revoke')
        .set('Cookie', first.cookieHeader)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .send({ sessionId: `ses_${randomUUID()}` })
      expect(nonExistentRevokeResponse.status).toBe(404)

      // --- birini sonlandır → o çerez 401, diğeri 200 ------------------------
      const revokeResponse = await request(httpServer())
        .post('/auth/sessions/revoke')
        .set('Cookie', first.cookieHeader)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .send({ sessionId: otherSession.id })
      expect(revokeResponse.status).toBe(200)

      // `/__auth_probe` DEĞİL — `/auth/sessions` kullanılır (AUTH_OWN_PATHS,
      // kiracıdan MUAF): bu testin odağı "çerez hâlâ geçerli mi" (kimlik),
      // R2'nin kiracı üyeliği kontrolünü GEREKTİRMEDEN ölçülebilir.
      const probeWithRevokedCookie = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', secondCookieHeader)
      expect(probeWithRevokedCookie.status).toBe(401)

      const probeWithRemainingCookie = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', first.cookieHeader)
      expect(probeWithRemainingCookie.status).toBe(200)

      // --- tümünü sonlandır → ikisi de 401 ------------------------------------
      const revokeAllResponse = await request(httpServer())
        .post('/auth/sessions/revoke-all')
        .set('Cookie', first.cookieHeader)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
      expect(revokeAllResponse.status).toBe(200)

      const probeAfterRevokeAllFirst = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', first.cookieHeader)
      expect(probeAfterRevokeAllFirst.status).toBe(401)
    },
    30_000,
  )

  it('oturum uçları KİMLİK gerektirir — çerezsiz istek 401 (kiracıdan muaf ama kimlikten muaf değil, AUTH_OWN_PATHS)', async () => {
    const listResponse = await request(httpServer()).get('/auth/sessions')
    expect(listResponse.status).toBe(401)

    const revokeResponse = await request(httpServer())
      .post('/auth/sessions/revoke')
      .send({ sessionId: 'ses_whatever' })
    expect(revokeResponse.status).toBe(401)

    const revokeAllResponse = await request(httpServer()).post('/auth/sessions/revoke-all')
    expect(revokeAllResponse.status).toBe(401)
  })
})
