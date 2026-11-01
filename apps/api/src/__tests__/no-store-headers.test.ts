// @arkesoft/api — no-store önbellek başlığı + ETag testleri (ROADMAP v0.0.7,
// T-008/S3, architect K6, AC19, borç 1440+1441+1453)
//
// ESKİ durum (ÖLÇÜLDÜ, `trpc.controller.ts`'in `forwardTrpcWebResponse`'u):
// bu iki başlık yalnızca BAŞARILI `/trpc` yanıtlarına yazılıyordu — guard
// reddi (401/403/404) yanıtları HİÇ TAŞIMIYORDU (0/5). Bu dosya YENİ durumu
// (`NoStoreHeadersMiddleware`, guard'lardan ÖNCE koşan GLOBAL middleware)
// 200 **ve** guard reddi (401/403/404) yanıtlarının HEPSİNDE ölçer — 5/5.
//
// `ETag` — `HttpHardeningInitializer` (`OnApplicationBootstrap`,
// `app.set('etag', false)`) sayesinde HİÇBİR yanıt `etag` TAŞIMAZ.

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

function expectNoStorePolicy(headers: Record<string, string | string[] | undefined>): void {
  expect(headers['cache-control']).toBe('no-store, private')

  const varyValues = (headers['vary'] ?? '')
    .toString()
    .split(',')
    .map((value) => value.trim().toLowerCase())
  expect(varyValues).toContain('cookie')

  expect(headers['etag']).toBeUndefined()
}

describe('no-store önbellek başlığı + ETag — 200 VE guard reddi (401/403/404) HEPSİ (ROADMAP v0.0.7, T-008/S3, AC19)', () => {
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

  it('1/5 — 200 (GET /trpc/session.me, kimlikli): no-store, private + Vary: Cookie, ETag YOK', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const response = await request(httpServer()).get('/trpc/session.me').set('Cookie', cookieHeader)

    expect(response.status).toBe(200)
    expectNoStorePolicy(response.headers)
  })

  it('2/5 — 401 (GET /trpc/session.me, çerezsiz — AuthGuard reddi): no-store, private + Vary: Cookie, ETag YOK', async () => {
    const response = await request(httpServer()).get('/trpc/session.me')

    expect(response.status).toBe(401)
    expectNoStorePolicy(response.headers)
  })

  it('3/5 — 403 (POST /auth/sessions/revoke-all, yabancı Origin — SameOriginGuard reddi): no-store, private + Vary: Cookie, ETag YOK', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const response = await request(httpServer())
      .post('/auth/sessions/revoke-all')
      .set('Cookie', cookieHeader)
      .set('Origin', 'https://evil.example.com')

    expect(response.status).toBe(403)
    expectNoStorePolicy(response.headers)
  })

  it('4/5 — 404 (GET /auth/bilinmeyen-yol — TENANT_EXEMPT_PATHS dışı, TenantGuard reddi): no-store, private + Vary: Cookie, ETag YOK', async () => {
    // ÖLÇÜLDÜ: bu yol `TENANT_EXEMPT_PATHS`'te OLMADIĞI için `TenantGuard`
    // (middleware'in `unresolved` çözümünü 404 `TENANT_NOT_FOUND`'a çevirir)
    // `AuthController`'ın KENDİ 404'ÜNDEN ÖNCE devreye girer — ikisi de
    // guard/filter katmanından geçtiği için middleware'in yazdığı başlıklar
    // AYNI şekilde taşınır, assert'in amacı (guard reddi 404) DEĞİŞMEDİ.
    const response = await request(httpServer()).get('/auth/bilinmeyen-yol')

    expect(response.status).toBe(404)
    expectNoStorePolicy(response.headers)
  })

  it('5/5 — 404 (GET /tamamen-bilinmeyen-rota, Nest eşleşmeyen rota): no-store, private + Vary: Cookie, ETag YOK', async () => {
    const response = await request(httpServer()).get('/tamamen-bilinmeyen-rota')

    expect(response.status).toBe(404)
    expectNoStorePolicy(response.headers)
  })
})
