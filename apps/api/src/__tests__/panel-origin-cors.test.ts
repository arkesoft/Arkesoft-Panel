// @arkesoft/api — panel orijin/CORS testleri (ROADMAP v0.0.7, T-008/S3,
// architect K1, ADR-0011)
//
// Tek orijin topolojisi (ADR-0011) — CORS AÇILMIYOR. `same-origin.guard.ts`/
// `auth-instance.ts` BU DOSYADA DEĞİŞTİRİLMEDİ, yalnızca GERÇEK davranış HTTP
// seviyesinde ÖLÇÜLÜR.
//
// Dört vaka (architect K1, bağlayıcı):
//   1. `GET /trpc/session.me` + Origin: panel (güvenilir) → 200
//   2. `GET /trpc/session.me` + Origin: yabancı → 403 CROSS_SITE_REQUEST_REJECTED
//   3. `POST /auth/sessions/revoke-all` + Origin: panel → 200
//   4. `POST /auth/sessions/revoke-all` + Origin: yabancı → 403
// HEPSİNDE geçerli çerez ZORUNLU — çerezsiz istek `SameOriginGuard`'a HİÇ
// ULAŞMAZ (global `AuthGuard` ÖNCE koşar → 401, bu dosyanın ÖLÇTÜĞÜ 403
// değil). `POST` için DELEGE OLMAYAN bir yol seçildi (`revoke-all`,
// `SessionsController`) — delege yolların (`/auth/sign-in/email` vb.) KENDİ
// origin/CSRF kontrolü `auth-delegated-origin-check.qa.test.ts`'in işi,
// burada TEKRARLANMAZ.
//
// Dört vakanın HEPSİNDE `access-control-allow-*` başlıklarının YOKLUĞU
// assert edilir — "Allow-Origin asla `*`" / "keyfi Origin yansıtılmıyor"
// iddiası BAŞLIK HİÇ ÜRETİLMİYOR ile sağlanır (CORS hiç açılmadığı için bu,
// değer kontrolünden daha güçlü bir garanti).
//
// `OPTIONS /trpc/session.me` → 405: `/trpc/*path` `@All()` ile TÜM metotları
// yakalar (CORS preflight handler'ı YOK), tRPC'nin KENDİSİ `OPTIONS`'u
// `query` prosedürü için desteklemiyor (`METHOD_NOT_SUPPORTED`,
// `createTrpcRequestHandler()` → `AppExceptionFilter` → 405) — ÖLÇÜLDÜ.

import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

/** tRPC GET sorgusunun BAŞARI zarfı — `session.me`'nin dönüş şekli (dış veri, Zod'dan geçmeden tip VERİLMEZ). */
const trpcQuerySuccessBodySchema = z.object({
  result: z.object({ data: z.object({ userId: z.string(), sessionId: z.string() }) }),
})

/** Gerçek `.env`'den okunur — `createTestApp()` override VERMEDİĞİ için
 * `SameOriginGuard`'ın gördüğü güvenilir orijin de AYNI kaynaktan gelir. */
const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin
const FOREIGN_ORIGIN = 'https://evil.example.com'

/** Dört vakanın HEPSİNDE assert edilen CORS başlığı YOKLUĞU listesi. */
const CORS_HEADER_NAMES = [
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
] as const

function expectNoCorsHeaders(headers: Record<string, string | string[] | undefined>): void {
  for (const name of CORS_HEADER_NAMES) {
    expect(headers[name]).toBeUndefined()
  }
}

describe('panel orijin/CORS — tek orijin topolojisi, CORS açılmıyor (ROADMAP v0.0.7, T-008/S3, ADR-0011)', () => {
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

  it('1) GET /trpc/session.me + Origin: panel (güvenilir) → 200, gövde {userId, sessionId}', async () => {
    const { cookieHeader, userId } = await createAuthenticatedSession(httpServer())

    const response = await request(httpServer())
      .get('/trpc/session.me')
      .set('Cookie', cookieHeader)
      .set('Origin', TRUSTED_ORIGIN)

    expect(response.status).toBe(200)
    const body = trpcQuerySuccessBodySchema.parse(response.body)
    expect(body.result.data.userId).toBe(userId)
    expect(body.result.data.sessionId.length).toBeGreaterThan(0)

    expectNoCorsHeaders(response.headers)
  })

  it('2) GET /trpc/session.me + Origin: yabancı → 403 CROSS_SITE_REQUEST_REJECTED', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const response = await request(httpServer())
      .get('/trpc/session.me')
      .set('Cookie', cookieHeader)
      .set('Origin', FOREIGN_ORIGIN)

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ code: 'CROSS_SITE_REQUEST_REJECTED' })

    expectNoCorsHeaders(response.headers)
  })

  it('3) POST /auth/sessions/revoke-all + Origin: panel (güvenilir) → 200', async () => {
    const { cookieHeader, password } = await createAuthenticatedSession(httpServer())

    // ROADMAP v0.0.15.1, T-017/S8a EKLEMESİ — `revoke-all` artık ZORUNLU
    // step-up taşıyor (ADR-0019 §Karar 4); bu testin ASIL iddiası (CORS
    // başlığı YOK, güvenilir Origin → guard GEÇER) `password` EKLENMEDEN
    // doğrulanamaz hâle geldi (parolasız her çağrı 400 `INVALID_PASSWORD`
    // döner — guard'a ULAŞTIĞININ KANITI, ama 200 bekleyen bu test için
    // YETERSİZ).
    const response = await request(httpServer())
      .post('/auth/sessions/revoke-all')
      .set('Cookie', cookieHeader)
      .set('Origin', TRUSTED_ORIGIN)
      .send({ password })

    expect(response.status).toBe(200)

    expectNoCorsHeaders(response.headers)
  })

  it('4) POST /auth/sessions/revoke-all + Origin: yabancı → 403 CROSS_SITE_REQUEST_REJECTED, oturum HAYATTA kalır', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const response = await request(httpServer())
      .post('/auth/sessions/revoke-all')
      .set('Cookie', cookieHeader)
      .set('Origin', FOREIGN_ORIGIN)

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ code: 'CROSS_SITE_REQUEST_REJECTED' })

    expectNoCorsHeaders(response.headers)

    // PoC'un ASIL iddiası: mutasyon GERÇEKTEN gerçekleşmedi — AYNI çerez
    // HÂLÂ geçerli (same-origin-guard.test.ts'in AYNI deseni).
    const sessionsResponse = await request(httpServer())
      .get('/auth/sessions')
      .set('Cookie', cookieHeader)
    expect(sessionsResponse.status).toBe(200)
  })

  it('OPTIONS /trpc/session.me → 405 (CORS preflight handler YOK, tRPC OPTIONS desteklemiyor)', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const response = await request(httpServer())
      .options('/trpc/session.me')
      .set('Cookie', cookieHeader)
      .set('Origin', TRUSTED_ORIGIN)

    expect(response.status).toBe(405)
    expectNoCorsHeaders(response.headers)
  })
})
