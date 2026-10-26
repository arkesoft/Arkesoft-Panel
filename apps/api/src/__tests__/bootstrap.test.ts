// @arkesoft/api — AC1'in ilk yeşili + liveness testi (ROADMAP v0.0.4, T-002/ST-2)
//
// supertest ile HTTP seviyesinde: `GET /health` → 200, gövdedeki `version`
// hem `apps/api/package.json` hem kök `package.json` sürümüne EŞİT (ST-2 DoD).

import type { Server } from 'node:http'
import { readFileSync } from 'node:fs'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createTestApp } from './helpers/create-test-app.js'

const packageVersionSchema = z.object({ version: z.string() })

function readPackageVersion(url: URL): string {
  const raw = readFileSync(url, 'utf-8')
  return packageVersionSchema.parse(JSON.parse(raw) as unknown).version
}

/**
 * HTTP yanıt gövdesi de dış veridir (CLAUDE.md §4) — `supertest`'in
 * `response.body` alanı `any` tipindedir, testte de `any` sızdırılmaz.
 */
const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
  version: z.string(),
  uptimeSeconds: z.number(),
})

describe('GET /health', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  it('200 döner; version apps/api VE kök package.json ile eşittir', async () => {
    const testApp = await createTestApp()
    app = testApp.app

    const response = await request(app.getHttpServer()).get('/health')
    const body = healthResponseSchema.parse(response.body)

    // src/__tests__/bootstrap.test.ts -> src/__tests__ -> src -> apps/api/package.json (2 seviye)
    const apiVersion = readPackageVersion(new URL('../../package.json', import.meta.url))
    // src/__tests__ -> src -> apps/api -> apps -> kök package.json (4 seviye)
    const rootVersion = readPackageVersion(new URL('../../../../package.json', import.meta.url))

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.service).toBe('api')
    expect(apiVersion).toBe(rootVersion)
    expect(body.version).toBe(apiVersion)
    expect(body.version).toBe(rootVersion)
  })
})
