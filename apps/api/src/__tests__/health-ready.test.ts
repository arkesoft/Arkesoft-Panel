// @arkesoft/api — GET /health/ready testleri (ROADMAP v0.0.4, T-002/ST-6,
// architect K-A8, AC3)
//
// (a) canlı altyapıyla (docker compose, `pnpm infra:up`) 200 + ikisi de 'up'.
// (b) `healthChecks` override'ı ile Redis kontrolü HATA fırlatınca 503 +
//     `details.checks === { database: 'up', redis: 'down' }`.
// (c) `healthChecks` override'ı ile Redis kontrolüne HİÇ DÖNMEYEN bir promise
//     verilince 503 ve ÖLÇÜLEN süre ≤3000ms (AC3'ün asıl iddiası — eşik
//     DÜŞÜRÜLMEZ).

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { HealthCheck } from '../health/health-check.types.js'
import { createTestApp } from './helpers/create-test-app.js'

const readyResponseSchema = z.object({
  status: z.literal('ok'),
  checks: z.record(z.string(), z.enum(['up', 'down'])),
})

/**
 * HTTP yanıt gövdesi dış veridir (CLAUDE.md §4) — `supertest`'in
 * `response.body` alanı `any` tipindedir, testte de `any` sızdırılmaz.
 */
const errorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
  requestId: z.string(),
})

function okCheck(name: 'database' | 'redis'): HealthCheck {
  return {
    name,
    check: () => Promise.resolve(),
  }
}

function failingCheck(name: 'database' | 'redis'): HealthCheck {
  return {
    name,
    check: () => Promise.reject(new Error(`${name} kontrolü testte bilerek başarısız`)),
  }
}

function hangingCheck(name: 'database' | 'redis'): HealthCheck {
  return {
    name,
    check: () =>
      new Promise<void>(() => {
        // kasıtlı: hiçbir zaman resolve/reject etmez — withTimeout'un
        // zaman aşımını zorlamak için.
      }),
  }
}

describe('GET /health/ready', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  it('canlı altyapıyla 200 döner; database ve redis ikisi de up', async () => {
    const testApp = await createTestApp()
    app = testApp.app

    const response = await request(app.getHttpServer()).get('/health/ready')
    const body = readyResponseSchema.parse(response.body)

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.checks).toEqual({ database: 'up', redis: 'up' })
  })

  it('redis kontrolü hata fırlatınca 503 + details.checks = {database: up, redis: down}', async () => {
    const testApp = await createTestApp({
      healthChecks: [okCheck('database'), failingCheck('redis')],
    })
    app = testApp.app

    const response = await request(app.getHttpServer()).get('/health/ready')
    const body = errorBodySchema.parse(response.body)

    expect(response.status).toBe(503)
    expect(body.code).toBe('DEPENDENCY_UNAVAILABLE')
    expect(body.details).toEqual({ checks: { database: 'up', redis: 'down' } })
  })

  it('redis kontrolüne hiç dönmeyen promise verilince 503 döner ve süre ≤3000ms', async () => {
    const testApp = await createTestApp({
      healthChecks: [okCheck('database'), hangingCheck('redis')],
    })
    app = testApp.app

    const startedAt = Date.now()
    const response = await request(app.getHttpServer()).get('/health/ready')
    const durationMs = Date.now() - startedAt

    const body = errorBodySchema.parse(response.body)

    expect(response.status).toBe(503)
    expect(body.code).toBe('DEPENDENCY_UNAVAILABLE')
    expect(body.details).toEqual({ checks: { database: 'up', redis: 'down' } })
    // AC3'ün asıl iddiası: eşik 3000ms'den DÜŞÜRÜLMEZ, YÜKSELTİLMEZ.
    expect(durationMs).toBeLessThanOrEqual(3000)
  })
})
