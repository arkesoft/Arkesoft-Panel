// @arkesoft/api — ALS eşzamanlılık/sızıntı testi (ROADMAP v0.0.4, T-002/ST-7,
// architect R4 telafisi #6, KRİTİK)
//
// Aynı app örneğinde 20 İÇ İÇE GEÇMİŞ (gerçekten eşzamanlı, `Promise.all`)
// istek, FARKLI host'larla (bazıları çözülen tenant, bazıları bilinmeyen).
// Probe uç (`GET /__smoke`) kendi çözdüğü tenant'ı döner; HER yanıt KENDİ
// host'uyla eşleşmek ZORUNDA. Bu test `AsyncLocalStorage`'ın `enterWith`
// sızıntısını, paylaşılan mutable `RequestContext` nesnesinin ÇAPRAZ istekler
// arasında karışmasını ve child logger karışmasını yakalar.
//
// `Promise.all`'un SONUÇ DİZİSİ, GİRDİ dizisiyle AYNI SIRADADIR (istekler
// eşzamanlı YÜRÜTÜLSE de) — bu yüzden `results[i]` ↔ `entries[i]` eşlemesi
// GÜVENLİDİR; test ettiği şey sunucunun İÇİNDE istekler arası ALS/mutable
// state karışıp karışmadığıdır, sonuç dizisinin sırası DEĞİL.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { DEMO_SEED } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createTestApp } from './helpers/create-test-app.js'
import { ProbeController } from './helpers/test-probe.controller.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

function tenantHost(slug: string): string {
  return `${slug}.${BASE_ENV.APP_BASE_DOMAIN}`
}

type Entry =
  | { readonly kind: 'resolved'; readonly host: string; readonly expectedSlug: string }
  | { readonly kind: 'unresolved'; readonly host: string }

const tenantResponseSchema = z.object({ slug: z.string() })
const errorResponseSchema = z.object({ code: z.string() })

describe('ALS eşzamanlılık/sızıntı testi (R4 telafisi #6)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  const extraSlugs: string[] = []

  beforeAll(async () => {
    const testApp = await createTestApp({ smokeControllers: [ProbeController] })
    app = testApp.app
    prismaService = app.get(PrismaService)

    // 4 ek tenant — kendi fixture'ı, DEMO_SEED'e DOKUNULMAZ (R-P6).
    for (let i = 0; i < 4; i += 1) {
      const slug = `t-conc-${randomUUID().slice(0, 10)}`
      await prismaService.db.tenant.create({
        data: { slug, name: `ST-7 eşzamanlılık #${String(i)}` },
      })
      extraSlugs.push(slug)
    }
  })

  afterAll(async () => {
    for (const slug of extraSlugs) {
      await prismaService.db.tenant.delete({ where: { slug } })
    }
    if (app !== undefined) {
      await app.close()
    }
  })

  it("20 eşzamanlı istek, farklı host'lar — her yanıt kendi host'uyla eşleşir (20/20)", async () => {
    if (app === undefined) {
      throw new Error('app kurulmadı')
    }
    const httpServer = app.getHttpServer()

    const entries: Entry[] = []

    // 8 istek — DEMO_SEED.
    for (let i = 0; i < 8; i += 1) {
      entries.push({
        kind: 'resolved',
        host: tenantHost(DEMO_SEED.tenant.slug),
        expectedSlug: DEMO_SEED.tenant.slug,
      })
    }

    // 8 istek — 4 ek tenant, ikişer kez.
    for (const slug of extraSlugs) {
      entries.push({ kind: 'resolved', host: tenantHost(slug), expectedSlug: slug })
      entries.push({ kind: 'resolved', host: tenantHost(slug), expectedSlug: slug })
    }

    // 4 istek — kesinlikle bilinmeyen host'lar.
    for (let i = 0; i < 4; i += 1) {
      entries.push({
        kind: 'unresolved',
        host: tenantHost(`bilinmeyen-conc-${randomUUID().slice(0, 8)}`),
      })
    }

    expect(entries.length).toBe(20)

    const responses = await Promise.all(
      entries.map((entry) => request(httpServer).get('/__smoke').set('Host', entry.host)),
    )

    expect(responses.length).toBe(20)

    responses.forEach((response, index) => {
      const entry = entries[index]
      if (entry === undefined) {
        throw new Error('beklenmeyen indeks')
      }

      if (entry.kind === 'resolved') {
        const body = tenantResponseSchema.parse(response.body)
        expect(response.status).toBe(200)
        expect(body.slug).toBe(entry.expectedSlug)
      } else {
        const body = errorResponseSchema.parse(response.body)
        expect(response.status).toBe(404)
        expect(body.code).toBe('TENANT_NOT_FOUND')
      }
    })
  })
})
