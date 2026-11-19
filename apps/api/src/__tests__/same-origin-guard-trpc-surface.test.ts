// @arkesoft/api — SameOriginGuard /trpc yüzeyinin GERÇEK HTTP pini (ROADMAP
// v0.0.21.1, T-025/S4, R6/AC-32)
//
// `SameOriginGuard` İKİ yerde kayıtlı — `SessionsController`'ın
// `/auth/sessions*` üçlüsü (`sessions.controller.ts:70`, `same-origin-
// guard.test.ts`'in "gerçek HTTP" describe'ı tarafından PİNLİ) VE
// `TrpcController`'ın `@All('trpc/*path')` yakalayıcısı (`trpc.controller.
// ts:205`). ⚠⚠ İKİNCİ kayıt noktası bugüne kadar HİÇ guard testi görmedi
// (S4 görev tanımı, P2/R6) — bu dosya o boşluğu kapatır.
//
// ⚠ `A1` VARSAYIMI (S4 görev tanımının istediği, raporda tekrarlanır): vaka
// 2'nin ucu (`GET /trpc/session.me` + çerez) test uygulamasında 403 DIŞI bir
// durum dönmeli. Emsal: `no-store-headers.test.ts`'in "1/6" vakası AYNI
// çağrıyı yapar (`GET /trpc/session.me` + kimlikli çerez) ve 200 bekler
// (`no-store-headers.test.ts:101-108`) — bu dosya AYNI ucu seçti, uydurma
// DEĞİL. İddia DURUM KODU üzerinedir (`toBe(403)`/`not.toBe(403)`), iş yükü
// (`response.body`) üzerine DEĞİL — `session.me`'nin başarı gövdesi bu
// dosyanın kapsamı DIŞINDA.

import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

// `same-origin-guard.test.ts`'in AYNI deseni (dosya başı yorumu, A-A8) —
// literal bir port değerine SABİTLEMEK yerine `ApiEnv.AUTH_BASE_URL`'DEN
// türetilir, operatörün `.env` port geçişlerine KALICI OLARAK bağışık kalır.
const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_BASE_URL = BASE_ENV.AUTH_BASE_URL

describe('SameOriginGuard — /trpc yüzeyi GERÇEK HTTP pini (R6/AC-32, trpc.controller.ts:205)', () => {
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

  it('1/5 — GET /trpc/session.me + çerez + GÜVENİLMEYEN Referer → 403 CROSS_SITE_REQUEST_REJECTED', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const response = await request(httpServer())
      .get('/trpc/session.me')
      .set('Cookie', cookieHeader)
      .set('Referer', 'https://evil.example.com/form')

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ code: 'CROSS_SITE_REQUEST_REJECTED' })
  })

  it(
    '2/5 — AYNISI GÜVENİLİR Referer ile → 403 DEĞİL (pozitif kontrol — negatif pinin ' +
      'boşluğa düşmesini engeller)',
    async () => {
      const { cookieHeader } = await createAuthenticatedSession(httpServer())

      const response = await request(httpServer())
        .get('/trpc/session.me')
        .set('Cookie', cookieHeader)
        .set('Referer', `${TRUSTED_BASE_URL}/panel`)

      expect(response.status).not.toBe(403)
    },
  )

  it(
    '3/5 — GET /trpc/session.me + çerez, BAŞLIKSIZ (Origin/Referer/Sec-Fetch-Site YOK) → ' +
      '403 DEĞİL (üçüncü dal, GÜVENLİ metot muafiyeti yerinde)',
    async () => {
      const { cookieHeader } = await createAuthenticatedSession(httpServer())

      const response = await request(httpServer())
        .get('/trpc/session.me')
        .set('Cookie', cookieHeader)

      expect(response.status).not.toBe(403)
    },
  )

  // ⚠ UÇ SEÇİMİ (`member.invite` DEĞİL): `member.invite` tenant ÇÖZÜMÜ
  // GEREKTİRİR (TENANT_EXEMPT_PATHS'te YOK) — ÖLÇÜLDÜ, ilk denemede
  // `TenantGuard` (global, SameOriginGuard'dan ÖNCE koşar) 404
  // `TENANT_NOT_FOUND` döndürdü, SameOriginGuard'a HİÇ sıra gelmedi.
  // `/trpc/registration.createTenant` TENANT_EXEMPT_PATHS'te (grup 8,
  // `tenant-exempt-paths.ts:223`) — `registration.test.ts`'in AYNI deseni
  // (Cookie + Origin ile POST edilen, kimlikli ama tenant'sız uç).
  it(
    '4/5 — POST /trpc/registration.createTenant + çerez + GÜVENİLMEYEN Referer → 403 ' +
      '(AC-32 asgari regresyon 1)',
    async () => {
      const { cookieHeader } = await createAuthenticatedSession(httpServer())

      const response = await request(httpServer())
        .post('/trpc/registration.createTenant')
        .set('Cookie', cookieHeader)
        .set('Referer', 'https://evil.example.com/form')
        .send({ name: 'S4 Guard Testi', slug: 'guard-trpc-surface-case4', siteType: 'corporate' })

      expect(response.status).toBe(403)
      expect(response.body).toMatchObject({ code: 'CROSS_SITE_REQUEST_REJECTED' })
    },
  )

  it('5/5 — Sec-Fetch-Site: cross-site ile GET /trpc/session.me → 403 (AC-32 asgari regresyon 2)', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const response = await request(httpServer())
      .get('/trpc/session.me')
      .set('Cookie', cookieHeader)
      .set('Sec-Fetch-Site', 'cross-site')

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ code: 'CROSS_SITE_REQUEST_REJECTED' })
  })
})
