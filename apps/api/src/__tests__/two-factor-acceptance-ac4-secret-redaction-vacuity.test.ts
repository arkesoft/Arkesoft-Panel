// @arkesoft/api — AC4: sır TELE ÇIKMAZ, LOGA YAZILMAZ — TAM T-015 SINIFI,
// DÖRT ADIM (ROADMAP v0.0.15, T-016/S11, kabul kriteri testleri)
//
// ⚠⚠ Bu AC'nin bağlayıcı uyarısı: Better Auth'un eklentisi `returned: false`
// işaretler (`@better-auth` kaynağının kendi davranışı, S4'ün ölçümü) AMA
// kütüphanenin KENDİ filtrelemesine GÜVENİLMEZ — platformun KENDİ `pino`
// `redact` yapılandırması (`root-logger.ts` → `PINO_REDACT_PATHS`,
// `@arkesoft/errors`) tek güvenilir hat. DÖRT ADIM, SIRASI BAĞLAYICI:
//
//   1. Yakalamanın BOŞ OLMADIĞINI kanıtla — bilinen bir mesaj yaz, yakalandığını gör.
//   2. KASTEN bir SENTINEL sır enjekte et, GERÇEK (redact AÇIK) üretim
//      logger'ıyla — redakte edildiğini doğrula (tarama GERÇEKTEN çalışıyor).
//   3. GERÇEK 2FA akışını (`createTestApp`, gerçek Postgres + HTTP) KOŞTUR —
//      hiçbir log satırında/yanıt gövdesinde (tasarım gereği sırrı taşıyan
//      `enable`/`get-totp-uri` DIŞINDAKİ uçlarda) GERÇEK sır YOK.
//   4. VACUITY KANITI — AYNI sentinel'i, redact YAPILANDIRMASI OLMAYAN bir
//      KONTROL logger'ına (yalnızca BU test dosyasının yerel bir `pino()`
//      örneği, üretim kodu DEĞİŞTİRİLMEDİ) yaz: sentinel BU SEFER ÇIPLAK
//      görünür olmalı — adım 2'nin "gizlendi" sonucunun TESADÜF OLMADIĞININ,
//      GERÇEKTEN redaksiyonun İŞİ YAPTIĞININ kanıtı.
//
// ⚠ Adım 1-2 OLMADAN adım 3 BOŞ KANITTIR (handoff'un bağlayıcı uyarısı) — bu
// yüzden sıra DEĞİŞTİRİLMEZ, adımlar TEK bir testte ARDIŞIK yürütülür.

import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import type { Server } from 'node:http'

import { PINO_REDACT_PATHS } from '@arkesoft/errors'
import { pino } from 'pino'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Logger } from 'pino'
import { z } from 'zod'

import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const PASSWORD = 'arkesoft-ac4-secret-redaction-password-123'
const SENTINEL = 'X-AC4-SENTINEL-71cd93-SAHTE-DEGER'

const totpUriSchema = z.object({
  method: z.literal('totp'),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})
const setCookieHeaderSchema = z.array(z.string()).min(1)

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

function extractBase32SecretFromTotpUri(totpURI: string): string {
  return extractQueryParam(totpURI, 'secret')
}

function toCookiePair(setCookieHeader: string): string {
  const firstSegment = setCookieHeader.split(';')[0]
  if (firstSegment === undefined) {
    throw new Error(`beklenmeyen Set-Cookie biçimi: ${setCookieHeader}`)
  }
  return firstSegment.trim()
}

/** `noUncheckedIndexedAccess` altında ilk Set-Cookie girdisini `as`/`!` KULLANMADAN daraltır. */
function firstSetCookie(setCookies: readonly string[]): string {
  const value = setCookies[0]
  if (value === undefined) {
    throw new Error('Set-Cookie listesi boş')
  }
  return value
}

function createMemoryLogStream(): {
  readonly stream: Writable
  readonly getFullText: () => string
} {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })
  return { stream, getFullText: () => Buffer.concat(chunks).toString('utf-8') }
}

/** Adım 4 — redact YAPILANDIRMASI OLMAYAN, SAF bir kontrol logger'ı (yalnızca BU test dosyasında, üretim kodu DEĞİŞMEDİ). */
function createUnredactedControlLogger(stream: Writable): Logger {
  return pino({}, stream)
}

describe('AC4 — sır tele çıkmaz, loga yazılmaz (DÖRT ADIM, sırası bağlayıcı)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined
  let getFullText: () => string

  beforeAll(async () => {
    const { stream, getFullText: read } = createMemoryLogStream()
    getFullText = read
    const testApp = await createTestApp({ stream })
    app = testApp.app
  }, 60_000)

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

  it(
    'ADIM 1-4 ARDIŞIK: yakalama boş değil → sentinel redakte edilir (GERÇEK logger) → ' +
      'gerçek 2FA akışının HİÇBİR sırrı logda yok → AYNI sentinel redact OLMADAN ÇIPLAK görünür (vacuity)',
    async () => {
      const rootLogger = app?.get<Logger>(ROOT_LOGGER)
      if (rootLogger === undefined) {
        throw new Error('ROOT_LOGGER provider çözülemedi')
      }

      // ADIM 1 — yakalama BOŞ DEĞİL: bilinen bir mesaj yaz, görünür olduğunu gör.
      const knownProbeMessage = `ac4-step1-probe-${randomUUID().slice(0, 8)}`
      rootLogger.info({ probe: 'step1' }, knownProbeMessage)
      expect(getFullText()).toContain(knownProbeMessage)

      // ADIM 2 — KASTEN enjekte edilen SENTINEL, GERÇEK (redact AÇIK) üretim
      // logger'ıyla GİZLENİR (tarama GERÇEKTEN çalışıyor — pozitif kanıt).
      rootLogger.info({ secret: SENTINEL }, 'ac4-step2-sentinel-probe')
      const afterStep2 = getFullText()
      expect(afterStep2).toContain('ac4-step2-sentinel-probe')
      expect(afterStep2).not.toContain(SENTINEL)
      expect(afterStep2).toContain('[redacted]')

      // ADIM 3 — GERÇEK 2FA akışı (gerçek Postgres + gerçek HTTP + gerçek Mailpit).
      const email = uniqueEmail('ac4-real-flow')
      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'AC4 Gerçek Akış Testi', email, password: PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
      const sessionCookiePair = toCookiePair(
        firstSetCookie(setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])),
      )

      const enableResponse = await request(httpServer())
        .post('/auth/two-factor/enable')
        .set('Cookie', sessionCookiePair)
        .send({ password: PASSWORD, method: 'totp' })
      const { totpURI, backupCodes } = totpUriSchema.parse(enableResponse.body)
      const base32Secret = extractBase32SecretFromTotpUri(totpURI)

      const wrongCode = '000000'
      const wrongResult = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', sessionCookiePair)
        .send({ code: wrongCode })
      expect(wrongResult.status).toBe(401)

      const correctCode = await generateTotpCode({ base32Secret })
      const correctResult = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', sessionCookiePair)
        .send({ code: correctCode })
      expect(correctResult.status).toBe(200)

      const fullLogTextAfterRealFlow = getFullText()
      // GERÇEK sırların HİÇBİRİ log metninde YOK — mekanik substring taraması
      // (alan bazlı redaksiyona GÜVENİLMEZ, S4'ün AYNI tarama deseni).
      expect(fullLogTextAfterRealFlow).not.toContain(totpURI)
      expect(fullLogTextAfterRealFlow).not.toContain(base32Secret)
      expect(fullLogTextAfterRealFlow).not.toContain(PASSWORD)
      expect(fullLogTextAfterRealFlow).not.toContain(correctCode)
      for (const code of backupCodes) {
        expect(fullLogTextAfterRealFlow).not.toContain(code)
      }
      // Gövde seviyesi sızdırmazlık: 401 hata gövdesi GÖNDERİLEN kodu
      // YANKILAMAZ (TELE ÇIKMAZ) — yalnızca sabit bir `code`/`message` taşır.
      expect(JSON.stringify(wrongResult.body)).not.toContain(wrongCode)

      // ADIM 4 — VACUITY KANITI: AYNI sentinel, redact YAPILANDIRMASI OLMAYAN
      // bir KONTROL logger'ına yazılınca ÇIPLAK görünür. Üretim kodu
      // (`root-logger.ts`) DEĞİŞMEDİ — bu TAMAMEN BU test dosyasının yerel,
      // AYRI bir pino örneğidir.
      const { stream: controlStream, getFullText: controlGetFullText } = createMemoryLogStream()
      const controlLogger = createUnredactedControlLogger(controlStream)
      controlLogger.info({ secret: SENTINEL }, 'ac4-step4-vacuity-control')
      await new Promise<void>((resolve) => controlStream.end(resolve))
      const controlText = controlGetFullText()
      expect(controlText).toContain('ac4-step4-vacuity-control')
      // ⭐ ADIM 2'NİN TAM TERSİ — redact YOKSA sentinel ÇIPLAK görünür. Bu,
      // adım 2'nin "gizlendi" sonucunun TESADÜF OLMADIĞININ kanıtıdır (aynı
      // sentinel, aynı alan adı, YALNIZCA redact yapılandırması farklı).
      expect(controlText).toContain(SENTINEL)
      expect(PINO_REDACT_PATHS).toContain('secret')
    },
    30_000,
  )
})
