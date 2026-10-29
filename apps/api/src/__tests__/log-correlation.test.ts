// @arkesoft/api — log korelasyonu ve redaksiyon testleri (ROADMAP v0.0.4,
// T-002/ST-7, architect K-A7, AC9/AC10)
//
// Bellek `Writable`'ı `createTestApp({ stream })` ile enjekte edilir (ST-2'nin
// `vitest.config.ts`/`create-test-app.ts` sözleşmesi), pino'nun ürettiği
// NDJSON satırları ayrıştırılır.
//
// AC10'un İKİ KATMANI birlikte test edilir: (1) gerçek bir HTTP isteğiyle
// `cookie`/`authorization` değerlerinin HİÇBİR log satırında geçmediği (asıl
// garanti — başlıklar loggera hiç verilmiyor); (2) `ROOT_LOGGER`'ın pino
// `redact` yapılandırmasının, biri bu alanları GERÇEKTEN loglasa bile onları
// maskeleyeceği (ikinci savunma katmanı, doğrudan logger çağrısıyla).

import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { Logger } from 'pino'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { DEMO_SEED, TenantRole } from '@arkesoft/db'
import { parseEnv } from '@arkesoft/config/env'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'
import { ProbeController } from './helpers/test-probe.controller.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

// ROADMAP v0.0.5, T-006/S6 EKLEMESİ (additive, PO riski 1 emsali): `AuthGuard`
// artık GLOBAL — `/__smoke` artık kimlik de ister. Bu dosyanın odağı (AC9 log
// korelasyonu) AUTH'TAN BAĞIMSIZ olduğu için istek ÖNCEDEN kimliklendirilir.
async function authenticatedCookieForDemoTenant(app: INestApplication<Server>): Promise<string> {
  const prismaService = app.get(PrismaService)
  const session = await createAuthenticatedSession(app.getHttpServer())

  const demoTenant = await prismaService.db.tenant.findUnique({
    where: { slug: DEMO_SEED.tenant.slug },
  })
  if (demoTenant === null) {
    throw new Error('DEMO_SEED tenant bulunamadı — pnpm db:seed koşmuş mu?')
  }

  await prismaService.withTenant(demoTenant.id, (tx) =>
    tx.tenantMembership.create({
      data: { tenantId: demoTenant.id, userId: session.userId, role: TenantRole.readonly },
    }),
  )

  return session.cookieHeader
}

function tenantHost(slug: string): string {
  return `${slug}.${BASE_ENV.APP_BASE_DOMAIN}`
}

/** Bellekte NDJSON satırlarını biriktiren basit bir `Writable`. */
function createMemoryLogStream(): { readonly stream: Writable; readonly getLines: () => string[] } {
  const chunks: Buffer[] = []

  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })

  return {
    stream,
    getLines: () =>
      Buffer.concat(chunks)
        .toString('utf-8')
        .split('\n')
        .filter((line) => line.length > 0),
  }
}

/** pino'nun ürettiği gevşek bir kayıt şekli — alanlar OLABİLİR (`optional`). */
const logRecordSchema = z.looseObject({
  msg: z.string().optional(),
  requestId: z.string().optional(),
})

function parseLogLines(lines: readonly string[]): Record<string, unknown>[] {
  return lines.map((line) => z.record(z.string(), z.unknown()).parse(JSON.parse(line) as unknown))
}

describe('log korelasyonu — AC9', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  it('tenant çözülen istek: x-request-id başlığı ↔ log kaydındaki requestId eşit; tenantId VAR', async () => {
    const { stream, getLines } = createMemoryLogStream()
    const testApp = await createTestApp({ stream, smokeControllers: [ProbeController] })
    app = testApp.app
    const cookieHeader = await authenticatedCookieForDemoTenant(app)

    const response = await request(app.getHttpServer())
      .get('/__smoke')
      .set('Host', tenantHost(DEMO_SEED.tenant.slug))
      .set('Cookie', cookieHeader)

    const headerRequestId = response.headers['x-request-id']
    expect(typeof headerRequestId).toBe('string')

    const records = parseLogLines(getLines())
    // ROADMAP v0.0.5, T-006/S6 NOTU: `authenticatedCookieForDemoTenant` AYNI
    // yakalanan stream'e YAZAN üç ÖN istek (kayıt/doğrulama/giriş) daha
    // koştuğu için `msg` TEK BAŞINA artık BENZERSİZ değil — eşleşme AYRICA
    // `requestId`'nin header'la BİREBİR aynı olmasını da ister (ilk eşleşen
    // "istek tamamlandı" kaydını almak YANLIŞ olurdu).
    const completionRecord = records.find(
      (record) =>
        logRecordSchema.parse(record).msg === 'istek tamamlandı' &&
        record['requestId'] === headerRequestId,
    )

    if (completionRecord === undefined) {
      throw new Error("'istek tamamlandı' log kaydı bulunamadı")
    }

    expect(completionRecord['requestId']).toBe(headerRequestId)
    expect('tenantId' in completionRecord).toBe(true)
  })

  it("/health isteği: log kaydında tenantId alanı HİÇ YOK ('tenantId' in record === false, null KONTROLÜ DEĞİL)", async () => {
    const { stream, getLines } = createMemoryLogStream()
    const testApp = await createTestApp({ stream })
    app = testApp.app

    await request(app.getHttpServer()).get('/health')

    const records = parseLogLines(getLines())
    const completionRecord = records.find(
      (record) => logRecordSchema.parse(record).msg === 'istek tamamlandı',
    )

    if (completionRecord === undefined) {
      throw new Error("'istek tamamlandı' log kaydı bulunamadı")
    }

    expect('tenantId' in completionRecord).toBe(false)
  })

  it('geçersiz x-request-id (biçim dışı) KULLANILMAZ — yeni bir requestId üretilir', async () => {
    const { stream, getLines } = createMemoryLogStream()
    const testApp = await createTestApp({ stream })
    app = testApp.app

    const invalidClientRequestId = 'bad header value !!'

    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', invalidClientRequestId)

    const headerRequestId = response.headers['x-request-id']

    expect(headerRequestId).not.toBe(invalidClientRequestId)
    expect(headerRequestId).toMatch(/^req_/)

    const records = parseLogLines(getLines())
    const completionRecord = records.find(
      (record) => logRecordSchema.parse(record).msg === 'istek tamamlandı',
    )

    if (completionRecord === undefined) {
      throw new Error("'istek tamamlandı' log kaydı bulunamadı")
    }

    expect(completionRecord['requestId']).toBe(headerRequestId)
    expect(completionRecord['requestId']).not.toBe(invalidClientRequestId)
  })

  it('geçerli istemci x-request-id BİREBİR yansıtılır', async () => {
    const { stream, getLines } = createMemoryLogStream()
    const testApp = await createTestApp({ stream })
    app = testApp.app

    const validClientRequestId = 'client-supplied-id-123456'

    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', validClientRequestId)

    expect(response.headers['x-request-id']).toBe(validClientRequestId)

    const records = parseLogLines(getLines())
    const completionRecord = records.find(
      (record) => logRecordSchema.parse(record).msg === 'istek tamamlandı',
    )

    if (completionRecord === undefined) {
      throw new Error("'istek tamamlandı' log kaydı bulunamadı")
    }

    expect(completionRecord['requestId']).toBe(validClientRequestId)
  })
})

describe('log redaksiyonu — AC10 (iki katman birlikte)', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  it('KATMAN 1 — cookie/authorization taşıyan istek sonrası TÜM log metninde bu değerlerin 0 eşleşmesi', async () => {
    const { stream, getLines } = createMemoryLogStream()
    const testApp = await createTestApp({ stream })
    app = testApp.app

    const secretCookieValue = 'oturum-cerezi-degeri-9f1a2b3c'
    const secretAuthValue = 'Bearer gizli-erisim-tokeni-7d8e9f'

    await request(app.getHttpServer())
      .get('/health')
      .set('Cookie', `session=${secretCookieValue}`)
      .set('Authorization', secretAuthValue)

    const fullLogText = getLines().join('\n')

    expect(fullLogText).not.toContain(secretCookieValue)
    expect(fullLogText).not.toContain(secretAuthValue)
    expect(fullLogText).not.toContain('gizli-erisim-tokeni-7d8e9f')
  })

  it('KATMAN 2 — ROOT_LOGGER redact yapılandırması, bu alanlar DOĞRUDAN loglansa bile maskeler', async () => {
    const { stream, getLines } = createMemoryLogStream()
    const testApp = await createTestApp({ stream })
    app = testApp.app

    const logger = app.get<Logger>(ROOT_LOGGER)
    const directSecretCookie = 'dogrudan-test-cerez-degeri-xyz'
    const directSecretAuth = 'dogrudan-test-auth-degeri-xyz'

    logger.info(
      {
        req: {
          headers: {
            cookie: directSecretCookie,
            authorization: directSecretAuth,
          },
        },
      },
      'redaksiyon doğrulama testi (ST-7)',
    )

    const records = parseLogLines(getLines())
    const redactionRecord = records.find(
      (record) => logRecordSchema.parse(record).msg === 'redaksiyon doğrulama testi (ST-7)',
    )

    if (redactionRecord === undefined) {
      throw new Error('redaksiyon doğrulama kaydı bulunamadı')
    }

    const req = z
      .object({ headers: z.object({ cookie: z.string(), authorization: z.string() }) })
      .parse(redactionRecord['req'])

    expect(req.headers.cookie).toBe('[redacted]')
    expect(req.headers.authorization).toBe('[redacted]')

    const fullLogText = getLines().join('\n')
    expect(fullLogText).not.toContain(directSecretCookie)
    expect(fullLogText).not.toContain(directSecretAuth)
  })
})
