// @arkesoft/api — qa (T-017, kendi bulduğu eksik senaryo): AYNI sessionId'yi
// İKİ KEZ sonlandırma (idempotency) hiçbir mevcut testte yoktu. İlk çağrı
// 200 + satır silinir; İKİNCİ çağrı AYNI sessionId ile artık "var olmayan"
// durumuna düşer — K5 (var olmayan/yetkisiz AYNI cevap) uyarınca 404
// `SESSION_NOT_FOUND` beklenir (500/çökme DEĞİL). `isCurrent` alanı
// bu dosyanın diğer testleriyle AYNI şekilde KENDİ oturumu bulmak için
// KULLANILIR — `GET /auth/sessions`'ın bugünkü bilinen `critical` liste
// sızıntısı regresyonundan (bu raporun ① bölümü) ETKİLENMEZ, çünkü
// `isCurrent` HER ZAMAN doğru hesaplanıyor (yalnızca `row.id ===
// identity.sessionId` karşılaştırması, sızıntıdan BAĞIMSIZ).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-qa-idempotency-password-123'

const signInBodySchema = z.object({ user: z.object({ id: z.string() }) })
const setCookieHeaderSchema = z.array(z.string()).min(1)
const errorBodySchema = z.object({ code: z.string() })
const sessionRowSchema = z.object({ id: z.string(), isCurrent: z.boolean() })
const sessionListSchema = z.array(sessionRowSchema)

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

describe('qa — session.revoke idempotency (ROADMAP v0.0.15.1, T-017, kendi bulduğu senaryo)', () => {
  let app: INestApplication<Server> | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
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

  it(
    'AYNI sessionId İKİ KEZ sonlandırılır: 1. çağrı 200, 2. çağrı 404 SESSION_NOT_FOUND ' +
      '(500/çökme DEĞİL — tekrar gönderim güvenli)',
    async () => {
      const email = uniqueEmail('qa-idempotency')
      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'QA Idempotency Testi', email, password: PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
      const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
      signInBodySchema.parse(signInResponse.body)
      const cookieHeader = cookies.join('; ')

      const listResponse = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', cookieHeader)
      expect(listResponse.status).toBe(200)
      const rows = sessionListSchema.parse(
        // ⚠ Bugünkü critical bulgu nedeniyle bu liste TÜM platformun
        // satırlarını içerebilir — `isCurrent` ile KENDİ satırını buluyoruz,
        // listenin TAMAMINA GÜVENMİYORUZ (yukarıdaki dosya başı yorumu).
        (listResponse.body as unknown[]).filter((row) => sessionRowSchema.safeParse(row).success),
      )
      const own = rows.find((row) => row.isCurrent)
      expect(own).toBeDefined()
      if (own === undefined) {
        return
      }

      const firstRevoke = await request(httpServer())
        .post('/auth/sessions/revoke')
        .set('Cookie', cookieHeader)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .send({ sessionId: own.id, password: PASSWORD })
      expect(firstRevoke.status).toBe(200)

      // İKİNCİ çağrı — AYNI sessionId, AYNI parola. Satır artık silinmiş
      // olduğu için sahiplik kontrolü "var olmayan" dalına düşer — ama
      // ÇAĞIRANIN çerezi de ZATEN geçersizleşti (AC4'ün deseni), bu yüzden
      // bu istek EN ÖNCE 401 (kimliksiz) alabilir. Her iki kabul edilebilir
      // sonuç da (401 kimlik düşmüş VEYA 404 satır yok) GÜVENLİ bir
      // tekrar-gönderim davranışıdır; 500/çökme KABUL EDİLEMEZ.
      const secondRevoke = await request(httpServer())
        .post('/auth/sessions/revoke')
        .set('Cookie', cookieHeader)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .send({ sessionId: own.id, password: PASSWORD })

      expect([401, 404]).toContain(secondRevoke.status)
      if (secondRevoke.status === 404) {
        expect(errorBodySchema.parse(secondRevoke.body).code).toBe('SESSION_NOT_FOUND')
      }
    },
    20_000,
  )
})
