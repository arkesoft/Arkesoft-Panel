// @arkesoft/api — HTTP seviyesinde tenant çözümü testleri (ROADMAP v0.0.4,
// T-002/ST-7, architect K-A4/K-A5/K-A8, AC4/AC5/AC6/AC7/AC8)
//
// `tenant-resolver.test.ts` (ST-5) AYNI algoritmayı SERVİS seviyesinde
// (`resolver.resolve(headers)`, Nest/HTTP katmanı BAYPAS edilerek) kanıtladı.
// Bu dosya AYNI davranışı UÇTAN UCA — gerçek `Host` başlığı + `TenantGuard` +
// `AppExceptionFilter` zinciri üzerinden, `supertest` ile — kanıtlar
// (DOKUNULACAK DOSYALAR listesinin "ST-7" satırı, mevcut dosyalar DEĞİŞMEDİ).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { DEMO_SEED, TenantRole } from '@arkesoft/db'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'
import { ProbeController } from './helpers/test-probe.controller.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const APP_BASE_DOMAIN = BASE_ENV.APP_BASE_DOMAIN

// ROADMAP v0.0.5, T-006/S6 EKLEMESİ (additive, PO riski 1 emsali): `AuthGuard`
// artık GLOBAL — "resolved → 200" bekleyen senaryolar kimlik DE ister. Bu
// dosyanın odağı (tenant çözümü) AUTH'TAN BAĞIMSIZ olduğu için istek üyelik
// VERİLEN `tenantId` için ÖNCEDEN kimliklendirilir.
async function authenticatedCookieForTenant(
  app: INestApplication<Server>,
  tenantId: string,
): Promise<string> {
  const prismaService = app.get(PrismaService)
  const session = await createAuthenticatedSession(app.getHttpServer())

  await prismaService.withTenant(tenantId, (tx) =>
    tx.tenantMembership.create({
      data: { tenantId, userId: session.userId, role: TenantRole.readonly },
    }),
  )

  return session.cookieHeader
}

function developmentEnv(): ApiEnv {
  return { ...BASE_ENV, NODE_ENV: 'development' }
}

function productionEnv(): ApiEnv {
  return { ...BASE_ENV, NODE_ENV: 'production' }
}

function tenantHost(slug: string): string {
  return `${slug}.${APP_BASE_DOMAIN}`
}

/** HTTP yanıt gövdesi dış veridir (CLAUDE.md §4) — `response.body` `any`'dir. */
const errorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
  requestId: z.string(),
})

const tenantResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  status: z.string(),
  source: z.string(),
})

/** `requestId`'yi sabit bir yer tutucuyla değiştirir — AC8'in bayt bayt karşılaştırması için. */
function maskRequestId(rawText: string, requestId: string): string {
  return rawText.split(requestId).join('<REQUEST_ID>')
}

/**
 * `supertest`'in ham gövde metnini döner. `response.text` JSON yanıtlarda da
 * dolu olmalı (superagent); boşsa (sürüm farkı vb.) `response.body`'nin
 * YENİDEN serileştirilmiş hâline düşer — Express'in `res.json()`'u varsayılan
 * olarak biçimlendirmesiz (`JSON.stringify`, girinti yok) yazdığı için bu iki
 * temsil AYNI anahtar sırasıyla BİREBİR eşleşir.
 */
function rawResponseText(response: { readonly text: string; readonly body: unknown }): string {
  return response.text.length > 0 ? response.text : JSON.stringify(response.body)
}

describe('tenant çözümü — HTTP seviyesi (AC4/AC5/AC6/AC7/AC8)', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  it('AC5: demo-magaza.<base> → tenant çözülür, slug DEMO_SEED ile eşit, source=subdomain', async () => {
    const testApp = await createTestApp({ smokeControllers: [ProbeController] })
    app = testApp.app
    const prismaService = app.get(PrismaService)
    const demoTenant = await prismaService.db.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })
    if (demoTenant === null) {
      throw new Error('DEMO_SEED tenant bulunamadı — pnpm db:seed koşmuş mu?')
    }
    const cookieHeader = await authenticatedCookieForTenant(app, demoTenant.id)

    const response = await request(app.getHttpServer())
      .get('/__smoke')
      .set('Host', tenantHost(DEMO_SEED.tenant.slug))
      .set('Cookie', cookieHeader)

    const body = tenantResponseSchema.parse(response.body)

    expect(response.status).toBe(200)
    expect(body.slug).toBe(DEMO_SEED.tenant.slug)
    expect(body.source).toBe('subdomain')
  })

  it('AC4: bilinmeyen host → 404, gövde TAM OLARAK {code, details, message, requestId}, details {}', async () => {
    const testApp = await createTestApp({ smokeControllers: [ProbeController] })
    app = testApp.app

    const response = await request(app.getHttpServer())
      .get('/__smoke')
      .set('Host', tenantHost(`bilinmeyen-${randomUUID().slice(0, 8)}`))

    const body = errorBodySchema.parse(response.body)

    expect(response.status).toBe(404)
    expect(Object.keys(response.body as Record<string, unknown>).sort()).toEqual([
      'code',
      'details',
      'message',
      'requestId',
    ])
    expect(body.code).toBe('TENANT_NOT_FOUND')
    expect(body.details).toEqual({})
  })

  it('AC7: sıfır yapılandırmalı uç (/__smoke/unconfigured) + bilinmeyen host → 404 TENANT_NOT_FOUND', async () => {
    const testApp = await createTestApp({ smokeControllers: [ProbeController] })
    app = testApp.app

    const response = await request(app.getHttpServer())
      .get('/__smoke/unconfigured')
      .set('Host', tenantHost(`bilinmeyen-${randomUUID().slice(0, 8)}`))

    const body = errorBodySchema.parse(response.body)

    expect(response.status).toBe(404)
    expect(body.code).toBe('TENANT_NOT_FOUND')
  })

  describe('AC6 — x-arkesoft-tenant yalnızca NODE_ENV !== production iken kabul edilir (iki ayrı test)', () => {
    it('production + bilinmeyen host + x-arkesoft-tenant → 404 (başlık YOK SAYILIR)', async () => {
      const testApp = await createTestApp({
        apiEnv: productionEnv(),
        smokeControllers: [ProbeController],
      })
      app = testApp.app

      const response = await request(app.getHttpServer())
        .get('/__smoke')
        .set('Host', tenantHost(`bilinmeyen-${randomUUID().slice(0, 8)}`))
        .set('x-arkesoft-tenant', DEMO_SEED.tenant.slug)

      const body = errorBodySchema.parse(response.body)

      expect(response.status).toBe(404)
      expect(body.code).toBe('TENANT_NOT_FOUND')
    })

    it("development + AYNI istek → tenant ÇÖZÜLÜR (dev-header host'u BAYPAS eder)", async () => {
      const testApp = await createTestApp({
        apiEnv: developmentEnv(),
        smokeControllers: [ProbeController],
      })
      app = testApp.app
      const prismaService = app.get(PrismaService)
      const demoTenant = await prismaService.db.tenant.findUnique({
        where: { slug: DEMO_SEED.tenant.slug },
      })
      if (demoTenant === null) {
        throw new Error('DEMO_SEED tenant bulunamadı — pnpm db:seed koşmuş mu?')
      }
      const cookieHeader = await authenticatedCookieForTenant(app, demoTenant.id)

      const response = await request(app.getHttpServer())
        .get('/__smoke')
        .set('Host', tenantHost(`bilinmeyen-${randomUUID().slice(0, 8)}`))
        .set('x-arkesoft-tenant', DEMO_SEED.tenant.slug)
        .set('Cookie', cookieHeader)

      const body = tenantResponseSchema.parse(response.body)

      expect(response.status).toBe(200)
      expect(body.slug).toBe(DEMO_SEED.tenant.slug)
      expect(body.source).toBe('dev-header')
    })
  })

  it("AC8 sızdırmazlık: bilinmeyen host ile soft-delete edilmiş tenant host'u AYNI durumu ve (requestId hariç) BAYT BAYT aynı gövdeyi döner", async () => {
    const testApp = await createTestApp({ smokeControllers: [ProbeController] })
    app = testApp.app
    const prismaService = app.get(PrismaService)

    const softDeletedSlug = `t-${randomUUID().slice(0, 12)}`

    await prismaService.db.tenant.create({
      data: {
        slug: softDeletedSlug,
        name: 'ST-7 AC8 soft-delete fixture',
        deletedAt: new Date(),
      },
    })

    try {
      const softDeletedResponse = await request(app.getHttpServer())
        .get('/__smoke')
        .set('Host', tenantHost(softDeletedSlug))

      const unknownResponse = await request(app.getHttpServer())
        .get('/__smoke')
        .set('Host', tenantHost(`bilinmeyen-ac8-${randomUUID().slice(0, 8)}`))

      const softDeletedBody = errorBodySchema.parse(softDeletedResponse.body)
      const unknownBody = errorBodySchema.parse(unknownResponse.body)

      expect(softDeletedResponse.status).toBe(unknownResponse.status)
      expect(softDeletedResponse.status).toBe(404)

      const maskedSoftDeletedText = maskRequestId(
        rawResponseText(softDeletedResponse),
        softDeletedBody.requestId,
      )
      const maskedUnknownText = maskRequestId(
        rawResponseText(unknownResponse),
        unknownBody.requestId,
      )

      // Bayt bayt (dize) eşitliği — `requestId` dışında HİÇBİR fark yok.
      expect(maskedSoftDeletedText).toBe(maskedUnknownText)
    } finally {
      await prismaService.db.tenant.delete({ where: { slug: softDeletedSlug } })
    }
  })

  it("özel alan adı (primaryDomain) dalı → tenant çözülür, source=custom-domain (R-P6, kendi fixture'ı)", async () => {
    const testApp = await createTestApp({ smokeControllers: [ProbeController] })
    app = testApp.app
    const prismaService = app.get(PrismaService)

    const slug = `t-${randomUUID().slice(0, 12)}`
    const primaryDomain = `${slug}.ozel-musteri-alani-st7.test`

    const createdTenant = await prismaService.db.tenant.create({
      data: { slug, name: 'ST-7 primaryDomain fixture', primaryDomain },
    })

    try {
      const cookieHeader = await authenticatedCookieForTenant(app, createdTenant.id)
      const response = await request(app.getHttpServer())
        .get('/__smoke')
        .set('Host', primaryDomain)
        .set('Cookie', cookieHeader)

      const body = tenantResponseSchema.parse(response.body)

      expect(response.status).toBe(200)
      expect(body.slug).toBe(slug)
      expect(body.source).toBe('custom-domain')
    } finally {
      await prismaService.db.tenant.delete({ where: { slug } })
    }
  })
})
