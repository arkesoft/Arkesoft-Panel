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
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { DEMO_SEED, TenantRole } from '@arkesoft/db'
import { parseEnv } from '@arkesoft/config/env'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { shutdownSentry, startSentry } from '../observability/sentry.js'
import type { StartSentryOptions } from '../observability/sentry.js'
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

/**
 * `line` (HAM NDJSON metni, `JSON.parse`'TAN ÖNCE) içinde `"key":` deseninin
 * kaç kez geçtiğini sayar.
 *
 * ⚠⚠ Borç `:3929`'un ÖLÇÜM YÖNTEMİ: `JSON.parse` bir JS nesnesinde aynı
 * anahtarı İKİ KEZ TAŞIYAMAZ (spec, son yazan kazanır) — bu yüzden parse
 * SONRASI `Object.keys` ile sayım bu sınıf kusuru HİÇBİR ZAMAN YAKALAYAMAZ.
 * pino'nun `chindings` (child logger bağlaması) + mergingObject birleştirmesi
 * JS nesne birleştirmesi DEĞİL, ÖNCEDEN SERİLEŞTİRİLMİŞ metin parçalarının
 * ÜST ÜSTE YAZILMADAN eklenmesidir — aynı anahtar iki kaynaktan gelirse HAM
 * METİNDE iki kez görünür (ölçüldü, `node -e` ile ayrıca doğrulandı). Sayım
 * bu yüzden RAW satır üzerinde yapılır.
 */
function countRawKeyOccurrences(line: string, key: string): number {
  const pattern = new RegExp(`"${key}":`, 'g')
  return (line.match(pattern) ?? []).length
}

/** `getLines()`'ın döndürdüğü HAM satırlar arasından `msg` eşleşenin HAM metnini + ayrıştırılmış kaydını döner. */
function findRawAndParsedByMsg(
  lines: readonly string[],
  msg: string,
): { readonly raw: string; readonly record: Record<string, unknown> } {
  for (const raw of lines) {
    const record = z.record(z.string(), z.unknown()).parse(JSON.parse(raw) as unknown)
    if (logRecordSchema.parse(record).msg === msg) {
      return { raw, record }
    }
  }
  throw new Error(`'${msg}' log kaydı bulunamadı`)
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

// ROADMAP v0.0.17, T-028/S4 (architect K-A28-1) — Katman 1 korelasyon dikişi:
// `traceId` log alanı (AC-52) + başarı yanıtında `x-trace-id` başlığı (AC-54a).
describe('traceId korelasyonu — AC-52 / AC-54a', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  it('her log kaydında traceId VAR; requestId HAM NDJSON satırında TAM BİR KEZ (borç `:3929` kapandı)', async () => {
    const { stream, getLines } = createMemoryLogStream()
    const testApp = await createTestApp({ stream })
    app = testApp.app

    await request(app.getHttpServer()).get('/health')

    const { raw, record } = findRawAndParsedByMsg(getLines(), 'istek tamamlandı')

    expect('traceId' in record).toBe(true)
    const recordedTraceId = z.string().min(1).parse(record['traceId'])
    expect(recordedTraceId.length).toBeGreaterThan(0)

    // ⚠⚠ Borç `:3929`'un bizzat ölçtüğü sınıf: alan child logger
    // bağlamasından (chindings) AYRICA bir mergingObject alanı OLARAK
    // geçirilirse HAM metinde İKİ KEZ görünür. `interceptor` artık bu alanı
    // AYRICA geçirmiyor (yalnızca child bağlamasından gelir) — bu test o
    // davranışın MUTASYONLA tersine çevrilebilir olduğunu da kanıtlar: alan
    // interceptor'da yeniden açılırsa (`requestId: requestContext?.requestId`)
    // bu assert KIRMIZIYA döner.
    expect(countRawKeyOccurrences(raw, 'requestId')).toBe(1)
    expect(countRawKeyOccurrences(raw, 'traceId')).toBe(1)
  })

  it('AC-54a — BAŞARI yanıtında `x-trace-id` başlığı VAR ve log kaydındaki `traceId` ile BİREBİR eşit', async () => {
    const { stream, getLines } = createMemoryLogStream()
    const testApp = await createTestApp({ stream })
    app = testApp.app

    const response = await request(app.getHttpServer()).get('/health')

    const headerTraceId = z.string().min(1).parse(response.headers['x-trace-id'])

    const { record } = findRawAndParsedByMsg(getLines(), 'istek tamamlandı')
    expect(record['traceId']).toBe(headerTraceId)
  })

  it('⚠⚠ gelen `traceparent` başlığı KABUL EDİLMEZ — çağıranın değeri traceId ÜZERİNE YAZILIR (K-A28-1, bağlayıcı)', async () => {
    const { stream, getLines } = createMemoryLogStream()
    const testApp = await createTestApp({ stream })
    app = testApp.app

    // W3C `traceparent` biçimi: `{version}-{trace-id}-{parent-id}-{flags}`.
    // Saldırgan/istemci kendi seçtiği bir trace-id'yi DAYATMAYA ÇALIŞIYOR.
    const forgedTraceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const forgedTraceparent = `00-${forgedTraceId}-bbbbbbbbbbbbbbbb-01`

    const response = await request(app.getHttpServer())
      .get('/health')
      .set('traceparent', forgedTraceparent)

    const headerTraceId = z.string().min(1).parse(response.headers['x-trace-id'])

    expect(headerTraceId).not.toBe(forgedTraceId)
    expect(headerTraceId).not.toContain(forgedTraceId)

    const { record } = findRawAndParsedByMsg(getLines(), 'istek tamamlandı')
    expect(record['traceId']).toBe(headerTraceId)
    expect(record['traceId']).not.toBe(forgedTraceId)
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

// ---------------------------------------------------------------------------
// DÜZELTME TURU 1/3 (security BULGU 2, high) — K-A28-1'in GELEN `traceparent`
// reddinin İKİNCİ ağzı: Sentry'nin KENDİ `httpIntegration`'ı (bizim
// `HttpInstrumentation`'ımızdan BAĞIMSIZ, `disableIncomingRequestInstrumentation:
// true` İLE KAPATILAMAYAN) her gelen istekte KOŞULSUZ `api.propagation.
// extract(api.context.active(), headers)` çağırır (`@sentry/node/.../
// integrations/http/httpServerIntegration.js`). Üstteki "gelen traceparent
// KABUL EDİLMEZ" testi (yukarıda, satır ~293) BU İKİNCİ AĞZI ÖLÇMEZ —
// `SENTRY_DSN` bu test sürecinde TANIMSIZ olduğu için `startSentry()` NO-OP'tur
// (ObservabilityModule'ün `onModuleInit`'i), Sentry'nin `httpIntegration`'ı
// HİÇ KURULMAZ — pin "YEŞİL" kalır ama BULGU 2'NİN AÇIĞA ÇIKTIĞI YAPILANDIRMADA
// HİÇ KOŞMAZ (⭐⭐ bu turun pin kör noktası). ⇒ BU describe Sentry'yi SAHTE
// taşıyıcıyla GERÇEKTEN BAŞLATIR (`startSentry`, S5'in test-only seam'i —
// ağa ÇIKILMAZ) ve K-A28-1 pinini AYNI forged-`traceparent` senaryosuyla
// TEKRARLAR — bu kez Sentry AKTİFKEN.
//
// ⚠⚠ `../observability/instrumentation.js` BU TEST için DİNAMİK olarak import
// EDİLİR (modülün İLK import'u GERÇEK `NodeSDK.start()`'ı tetikler — diğer
// TÜM testler bu dosyanın TEPESİNDE statik bir import OLMADIĞI için
// ETKİLENMEZ, yalnızca BU describe'dan SONRA koşacak kod etkilenir; bu
// describe dosyanın EN SONUNDA, geriye dönük bir etkisi YOK). Düzeltme
// (`instrumentation.ts`: `textMapPropagator: null`) ⇒ küresel propagator HİÇ
// KURULMAZ ⇒ Sentry'nin `extract()` çağrısı NO-OP ⇒ forged `traceparent`
// HİÇBİR ETKİ YAPMAZ (`security`'nin ölçtüğü "LOCAL_GENERATED" davranışı).
// ---------------------------------------------------------------------------

describe('traceId korelasyonu — K-A28-1 ikinci ağız (Sentry httpIntegration) — AC-52/AC-54a BAĞLAYICI', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  afterAll(async () => {
    await shutdownSentry()
  })

  it('Sentry GERÇEKTEN BAŞLATILMIŞKEN (sahte taşıyıcı) gelen `traceparent` YİNE KABUL EDİLMEZ — x-trace-id forge edilen değere EŞİT DEĞİL', async () => {
    // Gerçek `NodeSDK.start()`'ı tetikler (bu dosyanın TEK, dosyanın SONUNDAKİ
    // dinamik import'u — dosya başı yorumuna bkz).
    await import('../observability/instrumentation.js')

    const fakeTransportFactory: NonNullable<StartSentryOptions['transport']> = () => ({
      send: () => Promise.resolve({}),
      flush: () => Promise.resolve(true),
    })
    startSentry({
      dsn: 'https://fakepublickey@o0.ingest.sentry.invalid/0',
      transport: fakeTransportFactory,
    })

    const { stream, getLines } = createMemoryLogStream()
    const testApp = await createTestApp({ stream })
    app = testApp.app

    // W3C `traceparent` biçimi — üstteki K-A28-1 testiyle AYNI desen, FARKLI
    // bir sentinel (32 hex 'c', bu testin KENDİ kimliği, karışıklık olmasın).
    const forgedTraceId = 'c'.repeat(32)
    const forgedTraceparent = `00-${forgedTraceId}-eeeeeeeeeeeeeeee-01`

    const response = await request(app.getHttpServer())
      .get('/health')
      .set('traceparent', forgedTraceparent)

    const headerTraceId = z.string().min(1).parse(response.headers['x-trace-id'])

    expect(headerTraceId).not.toBe(forgedTraceId)
    expect(headerTraceId).not.toContain(forgedTraceId)

    const { record } = findRawAndParsedByMsg(getLines(), 'istek tamamlandı')
    expect(record['traceId']).toBe(headerTraceId)
    expect(record['traceId']).not.toBe(forgedTraceId)
  })
})
