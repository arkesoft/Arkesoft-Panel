// @arkesoft/api — T-022/S3: `get-totp-uri`'nin HENÜZ `enable` ÇAĞRILMAMIŞ bir
// kullanıcı için döndüğü hata kodunun SÖZLEŞME testi (ROADMAP v0.0.20.1,
// ADR-0024 Karar 4).
//
// ⚠⚠ PAZARLIK DIŞI: ADR-0024'ün tüm "devam eden kurulumu sürdür" çözümü TEK
// BİR sağlayıcı literaline dayanıyor — sihirbaz ÖNCE `get-totp-uri` çağıracak,
// YALNIZCA yanıt `TOTP_NOT_ENABLED` koduyla düşerse `enable`'a düşecek. Bu
// literal yanlışsa veya bir Better Auth yükseltmesinde değişirse fallback HİÇ
// TETİKLENMEZ ve SIFIRDAN 2FA kurulumu TAMAMEN KIRILIR — mevcut hiçbir test
// bunu görmez (fixture'lar hep `enable`'ı ÖNCE çağırıyor).
//
// Bu dosya YALNIZCA TEST'tir — üretim kodu yazmaz/değiştirmez. Literal burada
// BİLİNÇLİ OLARAK üretim kodundan import EDİLMEZ (`two-factor-rest.ts`'ten
// değil, doğrudan string): aksi hâlde test totolojik olurdu — üretim literali
// değişirse test de aynı anda değişir ve hiçbir şey yakalanmaz.
//
// Emsal harness: `two-factor-acceptance-ac1-setup-flow.test.ts` (sign-up →
// Mailpit verify-email → sign-in → Better Auth `/auth/two-factor/*` uçları).
// Farkı: BU dosyada `enable` HİÇ ÇAĞRILMAZ — amaç tam olarak `enable`
// çağrılmadan `get-totp-uri`'nin ne döndürdüğünü gözlemlemek.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createTestApp } from './helpers/create-test-app.js'
import {
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const PASSWORD = 'arkesoft-totp-uri-contract-password-123'

/**
 * ⚠⚠ ADR-0024 Karar 4'ün pinlediği literal — ÜRETİM KODUNDAN BİLİNÇLİ OLARAK
 * KOPYALANMIŞTIR, import EDİLMEMİŞTİR. Bu test, Better Auth'un `getTOTPURI`
 * davranışını (satır yoksa `BAD_REQUEST` + bu kod) gerçek zincire karşı
 * doğrular; literal değişirse bu satır KIRMIZI verir.
 */
const EXPECTED_TOTP_NOT_ENABLED_CODE = 'TOTP_NOT_ENABLED'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
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

const setCookieHeaderSchema = z.array(z.string()).min(1)
const betterAuthErrorBodySchema = z.object({ code: z.string(), message: z.string() })

describe('get-totp-uri sözleşmesi — enable ÇAĞRILMADAN (ADR-0024 Karar 4, gerçek Better Auth zinciri)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
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

  it('enable HİÇ ÇAĞRILMADAN get-totp-uri → başarısız yanıt, body.code === TOTP_NOT_ENABLED', async () => {
    const email = uniqueEmail('totp-uri-contract')

    await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'TOTP URI Sözleşme Testi', email, password: PASSWORD })

    const delivered = await findLatestMailpitMessageTo(email)
    const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
    await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

    const signInResponse = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: PASSWORD })
    const sessionCookiePair = toCookiePair(
      firstSetCookie(setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])),
    )

    // ⚠⚠ `enable` BURADA HİÇ ÇAĞRILMIYOR — tam olarak bu testin amacı budur.
    const getUriResponse = await request(httpServer())
      .post('/auth/two-factor/get-totp-uri')
      .set('Cookie', sessionCookiePair)
      .send({ password: PASSWORD })

    expect(getUriResponse.status).not.toBe(200)
    expect(betterAuthErrorBodySchema.parse(getUriResponse.body).code).toBe(
      EXPECTED_TOTP_NOT_ENABLED_CODE,
    )
  }, 30_000)
})
