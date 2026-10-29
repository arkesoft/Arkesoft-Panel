// @arkesoft/api — delege uçların KENDİ (Better Auth) origin/CSRF kontrolü —
// HTTP seviyesinde pin (QA tur 3, security tur3 S3-10 — "Sorumlu: qa (test)")
//
// `auth-instance.ts:364-365`: `disableOriginCheck`/`disableCSRFCheck`
// **yalnızca** `env.NODE_ENV === 'test'` iken `true`'dur; üretim/geliştirmede
// HER ZAMAN `false` (etkin). Bu, `/auth/sign-up/email` vb. delege uçların
// `SameOriginGuard`'dan **BAĞIMSIZ, KENDİ** CSRF savunmasıdır (Better Auth'un
// `origin-check.mjs`'i). Mevcut `auth-flow.test.ts:117`'nin pini **yalnızca**
// `auth.options` nesnesinin DEĞERİNİ okur (`disableOriginCheck === false`) —
// bu uçtan uca BİR KONTROLÜN GERÇEKTEN ÇALIŞTIĞINI kanıtlamaz: biri
// `auth-instance.ts`'teki koşulu yanlışlıkla `true`'ya SABİTLERSE (ör.
// `env.NODE_ENV === 'test' || true`) bu statik pin KIRILMAZ. Bu dosya HTTP
// seviyesinde ÖLÇER — `apiEnv: {...BASE_ENV, NODE_ENV: 'development'}` ile
// (security tur3'ün ölçüm yöntemi, `createTestApp`'in `apiEnv` override'ı
// üzerinden — YENİ bir opsiyon alanı EKLENMEDİ).

import { randomUUID } from 'node:crypto'

import { parseEnv } from '@arkesoft/config/env'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-qa-delegated-origin-check-123'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

describe('Delege uçların KENDİ origin/CSRF kontrolü — NODE_ENV=development (QA tur 3, S3-10)', () => {
  it(
    'Cookie VAR + Origin: evil.example.com ile POST /auth/sign-out → 403 INVALID_ORIGIN, ' +
      'oturum HAYATTA kalır (NODE_ENV=test İSE bu kontrol KAPALI olurdu — ÖLÇÜLEN fark)',
    async () => {
      const email = uniqueEmail('qa-delegated-origin')
      await deleteAllMailpitMessages()

      const testApp = await createTestApp({
        apiEnv: { ...BASE_ENV, NODE_ENV: 'development' },
      })

      try {
        await request(testApp.app.getHttpServer())
          .post('/auth/sign-up/email')
          .send({ name: 'QA Delege Origin Testi', email, password: PASSWORD })

        const delivered = await findLatestMailpitMessageTo(email)
        const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
        await request(testApp.app.getHttpServer()).get(
          `/auth/verify-email?token=${encodeURIComponent(token)}`,
        )

        const signInResponse = await request(testApp.app.getHttpServer())
          .post('/auth/sign-in/email')
          .send({ email, password: PASSWORD })

        const rawSetCookie = signInResponse.headers['set-cookie']
        const cookies: string[] = Array.isArray(rawSetCookie) ? rawSetCookie : []
        expect(cookies.length).toBeGreaterThan(0)
        const cookieHeader = cookies.join('; ')

        // ASIL ÖLÇÜM — delege uç, Better Auth'un KENDİ origin kontrolüyle
        // (SameOriginGuard'dan BAĞIMSIZ) çapraz-site isteği REDDEDİYOR.
        const signOutResponse = await request(testApp.app.getHttpServer())
          .post('/auth/sign-out')
          .set('Cookie', cookieHeader)
          .set('Origin', 'https://evil.example.com')

        expect(signOutResponse.status).toBe(403)
        expect(signOutResponse.body).toMatchObject({ code: 'INVALID_ORIGIN' })

        // GERİLEME BEKÇİSİ: oturum GERÇEKTEN hayatta — sign-out ÇALIŞMADI.
        const sessionsResponse = await request(testApp.app.getHttpServer())
          .get('/auth/sessions')
          .set('Cookie', cookieHeader)
        expect(sessionsResponse.status).toBe(200)
      } finally {
        await testApp.app.close()
      }
    },
    20_000,
  )

  it(
    'AYNI senaryo ama güvenilir Origin İLE → 200, sign-out GERÇEKTEN çalışır ' +
      '(pozitif kontrol — negatif testin anlamlı olduğunu kanıtlar)',
    async () => {
      const email = uniqueEmail('qa-delegated-origin-ok')
      await deleteAllMailpitMessages()

      const testApp = await createTestApp({
        apiEnv: { ...BASE_ENV, NODE_ENV: 'development' },
      })

      try {
        await request(testApp.app.getHttpServer())
          .post('/auth/sign-up/email')
          .send({ name: 'QA Delege Origin Testi (OK)', email, password: PASSWORD })

        const delivered = await findLatestMailpitMessageTo(email)
        const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
        await request(testApp.app.getHttpServer()).get(
          `/auth/verify-email?token=${encodeURIComponent(token)}`,
        )

        const signInResponse = await request(testApp.app.getHttpServer())
          .post('/auth/sign-in/email')
          .send({ email, password: PASSWORD })

        const rawSetCookie = signInResponse.headers['set-cookie']
        const cookies: string[] = Array.isArray(rawSetCookie) ? rawSetCookie : []
        const cookieHeader = cookies.join('; ')

        const signOutResponse = await request(testApp.app.getHttpServer())
          .post('/auth/sign-out')
          .set('Cookie', cookieHeader)
          .set('Origin', BASE_ENV.AUTH_BASE_URL)

        expect(signOutResponse.status).toBe(200)
      } finally {
        await testApp.app.close()
      }
    },
    20_000,
  )
})
