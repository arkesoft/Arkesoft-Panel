// @arkesoft/api — Delegasyon allowlist fail-closed testleri (ROADMAP v0.0.5,
// T-006/S5, architect "⚠ FAIL-CLOSED DELEGASYON")
//
// `@All('auth/*path')` TÜM `/auth/*` isteklerini dinler ama YALNIZCA
// `AUTH_DELEGATED_PATHS`'teki TAM yolları Better Auth'a iletir. DoD kanıtı
// (bağlayıcı): `/auth/list-sessions` 404 · `/auth/get-session` 404 ·
// `/auth/<rastgele>` 404.
//
// Bu dosya hem BİRİM seviyesinde (`isAuthDelegatedPath`, saf fonksiyon) hem
// HTTP seviyesinde (gerçek uygulama, `createTestApp()`) kanıt taşır.

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { DEMO_SEED, TenantRole } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { AUTH_DELEGATED_PATHS, isAuthDelegatedPath } from '../auth/auth-delegated-paths.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
/**
 * ÇÖZÜLMÜŞ bir kiracı host'u (`validation.test.ts`'in deseni) — `/auth/*`'in
 * ÇOĞU `TENANT_EXEMPT_PATHS`'te OLMADIĞI için (yalnızca yedi delege yol + üç
 * kendi oturum ucumuz muaf), çözümsüz bir host'ta `TenantGuard` 404'ü
 * `AuthController`'dan ÖNCE üretir (AYNI status kodu, AMA FARKLI gerekçe/
 * gövde — `errors.tenant.notFound`). Bu dosyanın KENDİ fail-closed
 * mekanizmasını (allowlist dışı yol → `errors.http.generic`) İZOLE
 * göstermek için istekler ÇÖZÜLMÜŞ bir host'a gönderilir.
 */
const RESOLVED_TENANT_HOST = `${DEMO_SEED.tenant.slug}.${BASE_ENV.APP_BASE_DOMAIN}`

describe('AUTH_DELEGATED_PATHS — birim', () => {
  it('TAM OLARAK yedi eleman taşır (architect "yedi TAM yol")', () => {
    expect(AUTH_DELEGATED_PATHS.size).toBe(7)
  })

  it('küme TAM OLARAK beklenen yedi (yöntem, yol) çiftidir', () => {
    expect(new Set(AUTH_DELEGATED_PATHS)).toEqual(
      new Set([
        'POST /auth/sign-up/email',
        'POST /auth/sign-in/email',
        'POST /auth/sign-out',
        'GET /auth/verify-email',
        'POST /auth/send-verification-email',
        'POST /auth/request-password-reset',
        'POST /auth/reset-password',
      ]),
    )
  })

  it.each([
    ['POST', '/auth/sign-up/email'],
    ['POST', '/auth/sign-in/email'],
    ['POST', '/auth/sign-out'],
    ['GET', '/auth/verify-email'],
    ['POST', '/auth/send-verification-email'],
    ['POST', '/auth/request-password-reset'],
    ['POST', '/auth/reset-password'],
  ])('%s %s → delege edilir (true)', (method, path) => {
    expect(isAuthDelegatedPath(method, path)).toBe(true)
  })

  it.each([
    ['GET', '/auth/list-sessions'],
    ['GET', '/auth/get-session'],
    ['POST', '/auth/forget-password'],
    ['GET', '/auth/sign-up/email'],
    ['POST', '/auth/verify-email'],
    ['GET', '/auth/rastgele-yol-xyz'],
  ])('%s %s → delege EDİLMEZ (false, fail-closed)', (method, path) => {
    expect(isAuthDelegatedPath(method, path)).toBe(false)
  })

  it('yöntem büyük/küçük harf DUYARSIZ, yol DUYARLIDIR (fail-closed)', () => {
    expect(isAuthDelegatedPath('post', '/auth/sign-out')).toBe(true)
    expect(isAuthDelegatedPath('POST', '/AUTH/sign-out')).toBe(false)
  })

  it('sorgu dizesi karşılaştırmaya karışmaz', () => {
    expect(isAuthDelegatedPath('GET', '/auth/verify-email?token=abc')).toBe(true)
  })
})

describe('AuthController — DoD kanıtı: gerçek HTTP 404', () => {
  let app: INestApplication<Server> | undefined
  let cookieHeader: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app

    // ROADMAP v0.0.5, T-006/S6 EKLEMESİ (additive, PO riski 1 emsali):
    // `AuthGuard` artık GLOBAL — `AuthController`'ın `@All('auth/*path')`
    // joker rotası da (delege allowlist dışı yollar DAHİL) global guard
    // zincirinden GEÇER; kimliksiz bir istek `AuthController.delegate()`'in
    // KENDİ 404 kararına hiç ULAŞMADAN 401 alır (AuthGuard ÖNCE çalışır).
    // Bu dosyanın konusu AuthController'ın KENDİ allowlist mantığı (404)
    // olduğu için istek ÖNCEDEN kimliklendirilir + DEMO_SEED'e üye yapılır.
    const prismaService = app.get(PrismaService)
    const demoTenant = await prismaService.db.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })
    if (demoTenant === null) {
      throw new Error('DEMO_SEED tenant bulunamadı — pnpm db:seed koşmuş mu?')
    }
    const session = await createAuthenticatedSession(app.getHttpServer())
    await prismaService.withTenant(demoTenant.id, (tx) =>
      tx.tenantMembership.create({
        data: { tenantId: demoTenant.id, userId: session.userId, role: TenantRole.readonly },
      }),
    )
    cookieHeader = session.cookieHeader
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  /** `app` `beforeAll`'da kurulur — burada fail-closed okunur, `as`/`!` YOK. */
  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  it('/auth/list-sessions → 404 (ham token sızıntısı riski, AC6)', async () => {
    const response = await request(httpServer())
      .get('/auth/list-sessions')
      .set('Host', RESOLVED_TENANT_HOST)
      .set('Cookie', cookieHeader)
    expect(response.status).toBe(404)
  })

  it('/auth/get-session → 404 (v0.0.6 session.me kapsamını önceden TÜKETMEZ, K7)', async () => {
    const response = await request(httpServer())
      .get('/auth/get-session')
      .set('Host', RESOLVED_TENANT_HOST)
      .set('Cookie', cookieHeader)
    expect(response.status).toBe(404)
  })

  it('/auth/<rastgele> → 404', async () => {
    const response = await request(httpServer())
      .get('/auth/bu-yol-hic-var-olmadi')
      .set('Host', RESOLVED_TENANT_HOST)
      .set('Cookie', cookieHeader)
    expect(response.status).toBe(404)
  })

  it('404 gövdesi ham Nest mesajını SIZDIRMAZ (genel i18n anahtarı, AuthController kendi fail-closed kararı)', async () => {
    const response = await request(httpServer())
      .get('/auth/list-sessions')
      .set('Host', RESOLVED_TENANT_HOST)
      .set('Cookie', cookieHeader)
    const body = z.object({ message: z.string() }).parse(response.body)
    expect(body.message).toBe('errors.http.generic')
  })
})
