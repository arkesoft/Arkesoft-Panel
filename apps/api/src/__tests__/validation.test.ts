// @arkesoft/api — AC14 HTTP seviyesi doğrulama testi (ROADMAP v0.0.4,
// T-002/ST-7, architect K-A6)
//
// `POST /__smoke/validate` (teste özel, bkz. `helpers/test-probe.controller.ts`)
// `ValidatedBody` + Zod şemasını HTTP seviyesinde kanıtlar: geçersiz gövde
// 400 `VALIDATION_ERROR` + `details.fields` İ18N ANAHTARI döner; Zod'un ham
// mesaj metni yanıtta HİÇ geçmez (negatif assert, CLAUDE.md §17).

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { DEMO_SEED } from '@arkesoft/db'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createTestApp } from './helpers/create-test-app.js'
import { ProbeController } from './helpers/test-probe.controller.js'

// `/__smoke/validate` ALLOWLIST'TE DEĞİL (K5, fail-closed) — bu yüzden
// doğrulama pipe'ının ÇALIŞMASI için önce tenant'ın ÇÖZÜLMESİ gerekir; aksi
// hâlde `TenantGuard` handler'a hiç ULAŞMADAN 404 `TENANT_NOT_FOUND` döner
// (AC7'nin AYNI mekanizması). Bu dosyanın odağı AC14 olduğu için tenant
// çözümünü DEMO_SEED'in geçerli host'uyla sabitliyoruz.
const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const RESOLVED_TENANT_HOST = `${DEMO_SEED.tenant.slug}.${BASE_ENV.APP_BASE_DOMAIN}`

/** HTTP yanıt gövdesi dış veridir (CLAUDE.md §4) — `response.body` `any`'dir. */
const validationErrorBodySchema = z.object({
  code: z.literal('VALIDATION_ERROR'),
  message: z.string(),
  details: z.object({ fields: z.record(z.string(), z.string()) }),
  requestId: z.string(),
})

describe('POST /__smoke/validate — AC14', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  it('geçersiz gövde (boş name) → 400 VALIDATION_ERROR, details.fields i18n anahtarı taşır', async () => {
    const testApp = await createTestApp({ smokeControllers: [ProbeController] })
    app = testApp.app

    const response = await request(app.getHttpServer())
      .post('/__smoke/validate')
      .set('Host', RESOLVED_TENANT_HOST)
      .send({ name: '' })

    const body = validationErrorBodySchema.parse(response.body)

    expect(response.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(body.details.fields)).toEqual(['name'])
    expect(body.details.fields['name']).toMatch(/^errors\.validation\./)
  })

  it('geçersiz gövde (alan tamamen eksik) → 400, fields anahtarı "name", değeri errors.validation.* ile başlar', async () => {
    const testApp = await createTestApp({ smokeControllers: [ProbeController] })
    app = testApp.app

    const response = await request(app.getHttpServer())
      .post('/__smoke/validate')
      .set('Host', RESOLVED_TENANT_HOST)
      .send({})

    const body = validationErrorBodySchema.parse(response.body)

    expect(response.status).toBe(400)
    expect(Object.keys(body.details.fields)).toEqual(['name'])
    expect(body.details.fields['name']).toMatch(/^errors\.validation\./)
  })

  it('NEGATİF: Zod ham mesaj metni yanıt gövdesinde HİÇ geçmez', async () => {
    const testApp = await createTestApp({ smokeControllers: [ProbeController] })
    app = testApp.app

    const response = await request(app.getHttpServer())
      .post('/__smoke/validate')
      .set('Host', RESOLVED_TENANT_HOST)
      .send({})

    const rawBody = JSON.stringify(response.body)

    expect(rawBody.toLowerCase()).not.toContain('expected')
    expect(rawBody.toLowerCase()).not.toContain('received')
    expect(rawBody.toLowerCase()).not.toContain('too small')
  })

  it('geçerli gövde → 201, gövde OLDUĞU GİBİ yansıtılır (pozitif kontrol)', async () => {
    const testApp = await createTestApp({ smokeControllers: [ProbeController] })
    app = testApp.app

    const response = await request(app.getHttpServer())
      .post('/__smoke/validate')
      .set('Host', RESOLVED_TENANT_HOST)
      .send({ name: 'Ahmet' })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ name: 'Ahmet' })
  })
})
