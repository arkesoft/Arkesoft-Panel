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
//
// ROADMAP v0.0.8, T-009/S8, architect K7 — AC18 **5/5 → 6/6**: altıncı vaka
// yeni ANONİM `/trpc/storefront.currentTenant` yolunun 200 yanıtı. K7
// BAĞLAYICI: bu yolun yanıtı `public` ama ÖNBELLEKLENEBİLİR değil (tek
// tüketici storefront'un sunucu fetch'i, tarayıcıya HİÇ gitmiyor; repoda
// ingress/CDN yok) ve asıl gerekçe — prosedürün GİRDİSİ olmadığı için hedef
// URI her kiracı için BİREBİR aynı (`/trpc/storefront.currentTenant`, sorgu
// dizesi yok); RFC 9111'de birincil önbellek anahtarı hedef URI'dir, yanıtı
// ayıran tek şey `Host` BAŞLIĞI — bu yanıtı `public` yapmak URI'ye göre
// anahtarlayan HERHANGİ bir aracıda DOĞRUDAN çapraz kiracı sızıntısıdır.
// `no-store` kalmanın maliyeti ~sıfır (CWV bütçesi v0.20.0). Bu yüzden
// `no-store-response-headers.ts`'in fail-closed cümlesi ("ilk gerçekten
// public önbelleklenebilir yanıt doğduğunda rota kapsamlı istisna
// eklenecek") BURADA TETİKLENMEZ — istisna listesi AÇILMAZ, kod DEĞİŞMEZ
// (dosya başı yorumuna üç maddelik gerekçe EKLENDİ, cümle GEVŞETİLMEDİ).
//
// YEDİNCİ VAKA (opsiyonel, architect tarafından `security`'ye ÖNERİLMİŞTİ —
// `backend` ölçüm maliyeti ~sıfır olduğu için EKLEDİ, raporda işaretli):
// aynı yolun ÇÖZÜMSÜZ host (bilinmeyen slug) 404 yanıtı da aynı politikayı
// taşır — `TenantGuard`'ın normal 404 reddi, 4/5 ve 5/5 vakalarıyla AYNI
// güvenlik sınıfı.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { TenantStatus } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

function expectNoStorePolicy(headers: Record<string, string | string[] | undefined>): void {
  expect(headers['cache-control']).toBe('no-store, private')

  const varyValues = (headers['vary'] ?? '')
    .toString()
    .split(',')
    .map((value) => value.trim().toLowerCase())
  expect(varyValues).toContain('cookie')

  expect(headers['etag']).toBeUndefined()
}

describe('no-store önbellek başlığı + ETag — 200 VE guard reddi (401/403/404) HEPSİ (ROADMAP v0.0.7, T-008/S3, AC19; ROADMAP v0.0.8, T-009/S8, AC18 6/6)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let storefrontTenantSlug: string
  let storefrontTenantId: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    // 6/6 vakasının çözülebilir bir kiracıya ihtiyacı var — bu dosyanın
    // önceki beş vakası (1/5-5/5) kiracı GEREKTİRMİYORDU, bu yüzden S8
    // ÖNCESİ burada bir tenant fixture'ı YOKTU.
    storefrontTenantSlug = uniqueSlug('ac18-storefront')
    const tenant = await prismaService.db.tenant.create({
      data: {
        slug: storefrontTenantSlug,
        name: 'AC18 Vitrin Kiracısı',
        status: TenantStatus.active,
      },
    })
    storefrontTenantId = tenant.id
  })

  afterAll(async () => {
    if (app !== undefined) {
      await prismaService.db.tenant.delete({ where: { id: storefrontTenantId } })
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  it('1/6 — 200 (GET /trpc/session.me, kimlikli): no-store, private + Vary: Cookie, ETag YOK', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const response = await request(httpServer()).get('/trpc/session.me').set('Cookie', cookieHeader)

    expect(response.status).toBe(200)
    expectNoStorePolicy(response.headers)
  })

  it('2/6 — 401 (GET /trpc/session.me, çerezsiz — AuthGuard reddi): no-store, private + Vary: Cookie, ETag YOK', async () => {
    const response = await request(httpServer()).get('/trpc/session.me')

    expect(response.status).toBe(401)
    expectNoStorePolicy(response.headers)
  })

  it('3/6 — 403 (POST /auth/sessions/revoke-all, yabancı Origin — SameOriginGuard reddi): no-store, private + Vary: Cookie, ETag YOK', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const response = await request(httpServer())
      .post('/auth/sessions/revoke-all')
      .set('Cookie', cookieHeader)
      .set('Origin', 'https://evil.example.com')

    expect(response.status).toBe(403)
    expectNoStorePolicy(response.headers)
  })

  it('4/6 — 404 (GET /auth/bilinmeyen-yol — TENANT_EXEMPT_PATHS dışı, TenantGuard reddi): no-store, private + Vary: Cookie, ETag YOK', async () => {
    // ÖLÇÜLDÜ: bu yol `TENANT_EXEMPT_PATHS`'te OLMADIĞI için `TenantGuard`
    // (middleware'in `unresolved` çözümünü 404 `TENANT_NOT_FOUND`'a çevirir)
    // `AuthController`'ın KENDİ 404'ÜNDEN ÖNCE devreye girer — ikisi de
    // guard/filter katmanından geçtiği için middleware'in yazdığı başlıklar
    // AYNI şekilde taşınır, assert'in amacı (guard reddi 404) DEĞİŞMEDİ.
    const response = await request(httpServer()).get('/auth/bilinmeyen-yol')

    expect(response.status).toBe(404)
    expectNoStorePolicy(response.headers)
  })

  it('5/6 — 404 (GET /tamamen-bilinmeyen-rota, Nest eşleşmeyen rota): no-store, private + Vary: Cookie, ETag YOK', async () => {
    const response = await request(httpServer()).get('/tamamen-bilinmeyen-rota')

    expect(response.status).toBe(404)
    expectNoStorePolicy(response.headers)
  })

  it('6/6 — 200 (GET /trpc/storefront.currentTenant, OTURUMSUZ — anonim vitrin yolu): no-store, private + Vary: Cookie, ETag YOK (K7, AC18)', async () => {
    const response = await request(httpServer())
      .get('/trpc/storefront.currentTenant')
      .set('x-arkesoft-tenant', storefrontTenantSlug)

    expect(response.status).toBe(200)
    expectNoStorePolicy(response.headers)
  })

  // YEDİNCİ VAKA (opsiyonel, architect K7'nin `security`'ye önerdiği — bu
  // turda `backend` EKLEDİ, ölçüm maliyeti ~sıfır): aynı yolun ÇÖZÜMSÜZ host
  // 404'ü de AYNI politikayı taşır. Resmi 6/6 sayımına DAHİL DEĞİL —
  // `describe` başlığı ve AC18 ölçümü 6 vaka ile sınırlı kalır.
  it('EK (opsiyonel) — 404 (GET /trpc/storefront.currentTenant, çözümsüz host): no-store, private + Vary: Cookie, ETag YOK', async () => {
    const response = await request(httpServer())
      .get('/trpc/storefront.currentTenant')
      .set('x-arkesoft-tenant', uniqueSlug('ac18-storefront-unresolved'))

    expect(response.status).toBe(404)
    expectNoStorePolicy(response.headers)
  })
})
