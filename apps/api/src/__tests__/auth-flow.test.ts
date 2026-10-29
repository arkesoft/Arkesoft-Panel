// @arkesoft/api — Auth akışı entegrasyon testleri (ROADMAP v0.0.5, T-006/S5,
// architect "tRPC SÖZLEŞMESİ" → HTTP sözleşmesi, AC4/AC5)
//
// Gerçek Postgres + gerçek Mailpit (`pnpm infra:up`). AC4(b) BAĞLAYICI:
// "yalnızca 'token üretildi' assert'i KABUL EDİLMEZ" — belirteç S4'ün
// `findLatestMailpitMessageTo` + `extractQueryParam` yardımcılarıyla
// Mailpit'in HTTP API'sinden GERÇEKTEN TESLİM EDİLMİŞ mesajın GÖVDESİNDEN
// çıkarılır.
//
// AC4(e)/(f) ("korumalı uç 200" / "aynı çerez artık 401") ve AC6/AC10 BU
// DOSYANIN KAPSAMI DIŞINDA — `AuthGuard`/`@CurrentUser()`/oturum uçları
// S6'nın işi (K7 — korumalı uç için üretim kodu bu alt görevde EKLENMEZ).
//
// HTTP yanıt gövdesi/başlığı DIŞ VERİDİR (CLAUDE.md §4) — `response.body`/
// `response.headers['set-cookie']` Zod ile DOĞRULANIR; `as` İLE TİP
// ZORLAMASI YOK (yalnızca Zod doğrulamasından SONRA, zaten tipli değer
// kullanılır).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { createPrismaClient } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createAuthInstance, describeBetterAuthLogCause } from '../auth/auth-instance.js'
import type { MailEnvelope, MailTransport } from '../auth/mail/mail-transport.types.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { AuthProviderFailedError } from '../errors/domain/auth-provider-failed.error.js'
import { MailDeliveryFailedError } from '../errors/domain/mail-delivery-failed.error.js'
import { createRootLogger } from '../logging/root-logger.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

/**
 * `createAuthInstance`'ın bu describe bloğundaki birim testleri yalnızca
 * `auth.options`'ı (DI/HTTP YOK) inceler — GERÇEK (ama `silent` seviyeli,
 * hiçbir satır yazmayan) bir pino örneği, sahte/`as`'lı bir nesne DEĞİL.
 */
function silentLogger(): ReturnType<typeof createRootLogger> {
  return createRootLogger({ level: 'silent' })
}

function uniqueEmail(): string {
  return `s5-${randomUUID().slice(0, 12)}@arkesoft.test`
}

/** `log-correlation.test.ts`'in AYNI yardımcısı — bilerek yerel kopya (FIX turu 1, madde 2). */
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

const SIGN_UP_PASSWORD = 'arkesoft-s5-password-123'

const signUpResponseBodySchema = z.object({ token: z.string().nullable() })

/** Better Auth'un KENDİ ürettiği hata gövdesi (ör. `EMAIL_NOT_VERIFIED`). */
const betterAuthErrorBodySchema = z.object({ code: z.string(), message: z.string() })

/** `set-cookie` başlığı — Node/supertest çoklu değerde dizi üretir. */
const setCookieHeaderSchema = z.array(z.string()).min(1)

// --- A-G8/K6 — kritik yapılandırma kanıtları, Nest DI'sız saf fabrika -------
describe('createAuthInstance — kritik yapılandırma kanıtları', () => {
  const stubMailTransport: MailTransport = {
    send: (_envelope: MailEnvelope): Promise<void> => Promise.resolve(),
  }

  it('session.cookieCache.enabled === false (A-G8, ZORUNLU — AC6 sahte-yeşil vermesin)', () => {
    const auth = createAuthInstance({
      env: BASE_ENV,
      prismaClient: createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_URL }),
      mailTransport: stubMailTransport,
      logger: silentLogger(),
    })

    expect(auth.options.session?.cookieCache?.enabled).toBe(false)
  })

  it('advanced.ipAddress.disableIpTracking === true (K6/KVKK)', () => {
    const auth = createAuthInstance({
      env: BASE_ENV,
      prismaClient: createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_URL }),
      mailTransport: stubMailTransport,
      logger: silentLogger(),
    })

    expect(auth.options.advanced?.ipAddress?.disableIpTracking).toBe(true)
  })

  it('advanced.useSecureCookies NODE_ENV=production ile true, aksi hâlde false', () => {
    const productionAuth = createAuthInstance({
      env: { ...BASE_ENV, NODE_ENV: 'production' },
      prismaClient: createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_URL }),
      mailTransport: stubMailTransport,
      logger: silentLogger(),
    })
    const developmentAuth = createAuthInstance({
      env: { ...BASE_ENV, NODE_ENV: 'development' },
      prismaClient: createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_URL }),
      mailTransport: stubMailTransport,
      logger: silentLogger(),
    })

    expect(productionAuth.options.advanced?.useSecureCookies).toBe(true)
    expect(developmentAuth.options.advanced?.useSecureCookies).toBe(false)
  })

  it('rateLimit.enabled === false (S8 ile çatışmasın — kendi Redis sınırlayıcısı ayrı)', () => {
    const auth = createAuthInstance({
      env: BASE_ENV,
      prismaClient: createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_URL }),
      mailTransport: stubMailTransport,
      logger: silentLogger(),
    })

    expect(auth.options.rateLimit?.enabled).toBe(false)
  })
})

// FIX turu 2, madde 1 (security tur2 S-2, `high`) — `describeBetterAuthLogCause`
// birim testleri. FIX turu 1'in hâli `cause.cause`'un `.message`'ını OLDUĞU
// GİBİ taşıyordu — nodemailer'ın "alıcı reddedildi" hatasının `.message`'ı
// ALICININ TAM E-POSTA ADRESİNİ içerdiği için bu, AC8'i BOZAN bir sızıntıydı
// (ÖLÇÜLDÜ, security tur2). Fonksiyon artık HİÇBİR serbest metin okumaz —
// yalnızca `causeCode`/`causeClassName`/`providerErrorCode`/
// `providerResponseCode` (bkz. `auth-instance.ts` dosya başı yorumu).
describe('describeBetterAuthLogCause — birim (FIX turu 2, madde 1 — security tur2 S-2)', () => {
  it('AppError + native Error cause → causeCode + causeClassName, HAM .message ASLA DÖNMEZ', () => {
    const result = describeBetterAuthLogCause(
      new MailDeliveryFailedError('auth.emailVerification', new Error('ECONNREFUSED')),
    )
    expect(result).toEqual({
      causeCode: 'MAIL_DELIVERY_FAILED',
      causeClassName: 'Error',
      providerErrorCode: undefined,
      providerResponseCode: undefined,
    })
  })

  it(
    'AppError + nodemailer tarzı YAPILANDIRILMIŞ alıcı reddi hatası (.code/.responseCode) → ' +
      'ALLOWLIST alanları okunur, serbest metin (ALICI ADRESİ dahil) HİÇ OKUNMAZ',
    () => {
      const recipientRejected = Object.assign(
        new Error(
          "Can't send mail - all recipients were rejected: 550 5.1.1 <leak@arkesoft.test>: " +
            'Recipient address rejected: User unknown',
        ),
        { code: 'EENVELOPE', responseCode: 550 },
      )
      const result = describeBetterAuthLogCause(
        new MailDeliveryFailedError('auth.emailVerification', recipientRejected),
      )

      expect(result).toEqual({
        causeCode: 'MAIL_DELIVERY_FAILED',
        causeClassName: 'Error',
        providerErrorCode: 'EENVELOPE',
        providerResponseCode: 550,
      })
      // Mekanik kanıt: ALICININ TAM E-POSTA ADRESİ sonucun HİÇBİR alanında YOK.
      expect(JSON.stringify(result)).not.toContain('leak@arkesoft.test')
    },
  )

  it(
    'AppError + AggregateError cause (nodemailer IPv4+IPv6 ECONNREFUSED deseni) → ' +
      'causeClassName "AggregateError", serbest metin OKUNMAZ (provider alanları YOK)',
    () => {
      const aggregate = new AggregateError(
        [new Error('connect ECONNREFUSED ::1:1'), new Error('connect ECONNREFUSED 127.0.0.1:1')],
        '',
      )
      const result = describeBetterAuthLogCause(
        new MailDeliveryFailedError('auth.emailVerification', aggregate),
      )

      expect(result).toEqual({
        causeCode: 'MAIL_DELIVERY_FAILED',
        causeClassName: 'AggregateError',
        providerErrorCode: undefined,
        providerResponseCode: undefined,
      })
    },
  )

  it('AppError + cause YOK → causeClassName "undefined" (typeof), provider alanları YOK', () => {
    const result = describeBetterAuthLogCause(
      new MailDeliveryFailedError('auth.emailVerification', undefined),
    )
    expect(result).toEqual({
      causeCode: 'MAIL_DELIVERY_FAILED',
      causeClassName: 'undefined',
      providerErrorCode: undefined,
      providerResponseCode: undefined,
    })
  })

  it('AppError DEĞİL, düz Error → causeCode YOK, causeClassName sınıf adı', () => {
    expect(describeBetterAuthLogCause(new Error('ham hata'))).toEqual({
      causeCode: undefined,
      causeClassName: 'Error',
      providerErrorCode: undefined,
      providerResponseCode: undefined,
    })
  })

  it('Error DEĞİL (ör. dize) → causeClassName typeof değeri', () => {
    expect(describeBetterAuthLogCause('bir dize')).toEqual({
      causeCode: undefined,
      causeClassName: 'string',
      providerErrorCode: undefined,
      providerResponseCode: undefined,
    })
  })
})

// --- AC4(a)-(d) — gerçek HTTP + gerçek Postgres + gerçek Mailpit ------------
describe('AuthController — AC4(a)-(d) kayıt → doğrulama → giriş → çıkış', () => {
  let app: INestApplication<Server> | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  /** `app` `beforeAll`'da kurulur — burada fail-closed okunur, `as`/`!` YOK. */
  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  it('kayıt 2xx, token null (requireEmailVerification=true → autoSignIn SKIP)', async () => {
    const email = uniqueEmail()

    const response = await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'S5 Test Kullanıcısı', email, password: SIGN_UP_PASSWORD })

    expect(response.status).toBeGreaterThanOrEqual(200)
    expect(response.status).toBeLessThan(300)
    const body = signUpResponseBodySchema.parse(response.body)
    expect(body.token).toBeNull()
    // AC8'in diğer yüzü: başarılı kayıt yanıtında `Set-Cookie` YOK (henüz
    // doğrulanmamış, K4 "doğrulanmamış hesap oturum çerezi alamaz").
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('AC4(a)-(d): kayıt → Mailpit gövdesinden belirteç çıkarma → doğrulama 2xx → giriş Set-Cookie (HttpOnly+SameSite=Lax) → çıkış 2xx', async () => {
    const email = uniqueEmail()
    await deleteAllMailpitMessages()

    // (a) kayıt
    const signUpResponse = await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'S5 AC4 Kullanıcısı', email, password: SIGN_UP_PASSWORD })
    expect(signUpResponse.status).toBeGreaterThanOrEqual(200)
    expect(signUpResponse.status).toBeLessThan(300)

    // (b) Mailpit'ten GERÇEKTEN teslim edilmiş mesaj — token GÖVDEDEN çıkarılır
    const delivered = await findLatestMailpitMessageTo(email)
    const verificationUrl = extractFirstUrl(delivered.Text)
    const token = extractQueryParam(verificationUrl, 'token')
    expect(token.length).toBeGreaterThan(0)

    // (c) doğrulama 2xx
    const verifyResponse = await request(httpServer()).get(
      `/auth/verify-email?token=${encodeURIComponent(token)}`,
    )
    expect(verifyResponse.status).toBeGreaterThanOrEqual(200)
    expect(verifyResponse.status).toBeLessThan(300)

    // (d) giriş — Set-Cookie HttpOnly + SameSite=Lax (NODE_ENV=development → Secure YOK)
    const signInResponse = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: SIGN_UP_PASSWORD })
    expect(signInResponse.status).toBeGreaterThanOrEqual(200)
    expect(signInResponse.status).toBeLessThan(300)

    const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
    const sessionCookie = cookies.find((cookie) => cookie.includes('session_token'))
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.toLowerCase()).toContain('httponly')
    expect(sessionCookie?.toLowerCase()).toContain('samesite=lax')
    // BASE_ENV `.env`'den `NODE_ENV=development` okur — `Secure` bu ortamda
    // YAZILMAZ (deterministik, `useSecureCookies` kanıtı).
    expect(sessionCookie?.toLowerCase()).not.toContain('secure')

    // (f'nin yalnızca "çıkış 2xx" ayağı — "aynı çerez artık 401" S6'nın işi, K7)
    const signOutResponse = await request(httpServer())
      .post('/auth/sign-out')
      .set('Cookie', cookies.join('; '))
    expect(signOutResponse.status).toBeGreaterThanOrEqual(200)
    expect(signOutResponse.status).toBeLessThan(300)
  }, 20_000)

  it('AC4(d) — NODE_ENV=production ayrı test uygulamasında Set-Cookie Secure TAŞIR', async () => {
    const productionTestApp = await createTestApp({
      apiEnv: { ...BASE_ENV, NODE_ENV: 'production' },
    })

    try {
      const email = uniqueEmail()
      await deleteAllMailpitMessages()

      await request(productionTestApp.app.getHttpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S5 Secure Kullanıcısı', email, password: SIGN_UP_PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')

      await request(productionTestApp.app.getHttpServer()).get(
        `/auth/verify-email?token=${encodeURIComponent(token)}`,
      )

      const signInResponse = await request(productionTestApp.app.getHttpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: SIGN_UP_PASSWORD })

      const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
      const sessionCookie = cookies.find((cookie) => cookie.includes('session_token'))
      expect(sessionCookie).toBeDefined()
      expect(sessionCookie?.toLowerCase()).toContain('secure')
      expect(sessionCookie?.toLowerCase()).toContain('httponly')
      expect(sessionCookie?.toLowerCase()).toContain('samesite=lax')
    } finally {
      await productionTestApp.app.close()
    }
  }, 20_000)
})

// --- AC5'in 403 ayağı --------------------------------------------------------
describe('AC5 — doğrulanmamış hesabın giriş denemesi', () => {
  let app: INestApplication<Server> | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  /** `app` `beforeAll`'da kurulur — burada fail-closed okunur, `as`/`!` YOK. */
  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  it('doğrulanmamış hesap → giriş Set-Cookie VERMEZ + 403 EMAIL_NOT_VERIFIED', async () => {
    const email = uniqueEmail()

    await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'S5 Doğrulanmamış Kullanıcı', email, password: SIGN_UP_PASSWORD })

    const signInResponse = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: SIGN_UP_PASSWORD })

    expect(signInResponse.status).toBe(403)
    expect(signInResponse.headers['set-cookie']).toBeUndefined()
    const body = betterAuthErrorBodySchema.parse(signInResponse.body)
    expect(body.code).toBe('EMAIL_NOT_VERIFIED')
  })
})

// --- FIX turu 1, madde 1 (F3, high) — şifre sıfırlama mevcut oturumları ----
// İPTAL eder. `GET /auth/sessions` (S6'nın ÜRETİM ucu, probe DEĞİL) burada
// korumalı uç olarak kullanılır — `AuthGuard` global olduğu için kimliği
// doğrulanmış HER istek bu kontrolden geçer (K7 ihlali YOK: bu dosya
// `session.me`/`get-session` ÜRETMEZ, zaten var olan bir S6 ucunu okuyucu
// olarak KULLANIR).
describe('F3 — şifre sıfırlama mevcut oturumları ÖLDÜRÜR (revokeSessionsOnPasswordReset)', () => {
  let app: INestApplication<Server> | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
  })

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
    'giriş (çerez C) → request-password-reset → Mailpit belirteci → reset-password 200 → ' +
      'eski parola ile giriş 401 → AYNI çerez C ile GET /auth/sessions 401 (ÖNCESİNDE 200)',
    async () => {
      const email = uniqueEmail()
      const newPassword = 'arkesoft-s6-f3-yeni-parola-456'
      await deleteAllMailpitMessages()

      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S6 F3 Kullanıcısı', email, password: SIGN_UP_PASSWORD })

      const verifyDelivered = await findLatestMailpitMessageTo(email)
      const verifyToken = extractQueryParam(extractFirstUrl(verifyDelivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: SIGN_UP_PASSWORD })
      const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
      const cookieHeader = cookies.join('; ')

      // Sıfırlamadan ÖNCE çerez C GERÇEKTEN geçerli (negatif kontrolün anlamlı
      // olması için — F3'ün ÖLÇTÜĞÜ fark bu baseline'a göredir).
      const sessionsBeforeReset = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', cookieHeader)
      expect(sessionsBeforeReset.status).toBe(200)

      await deleteAllMailpitMessages()
      await request(httpServer()).post('/auth/request-password-reset').send({ email })

      const resetDelivered = await findLatestMailpitMessageTo(email)
      const resetToken = extractQueryParam(extractFirstUrl(resetDelivered.Text), 'token')

      const resetResponse = await request(httpServer())
        .post('/auth/reset-password')
        .send({ newPassword, token: resetToken })
      expect(resetResponse.status).toBeGreaterThanOrEqual(200)
      expect(resetResponse.status).toBeLessThan(300)

      // Parola GERÇEKTEN değişti — eski parolayla giriş artık reddedilir.
      const oldPasswordSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: SIGN_UP_PASSWORD })
      expect(oldPasswordSignIn.status).toBe(401)

      // F3'ün ASIL iddiası: sıfırlamadan ÖNCE kurulmuş çerez C artık GEÇERSİZ.
      const sessionsAfterReset = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', cookieHeader)
      expect(sessionsAfterReset.status).toBe(401)
    },
    20_000,
  )
})

// --- FIX turu 1, madde 2 (F2, high) — e-posta gönderim hatası ARTIK pino'da
// GÖRÜNÜR (önceden tek satırlık, içeriği TAMAMEN boş bir `error` kaydıydı).
// FIX turu 2, madde 1 (security tur2 S-2, `high`) — alan kümesi DEĞİŞTİ:
// `causeMessage` (serbest metin) KALDIRILDI, yerine `causeClassName`
// (sınıf adı, SERBEST METİN DEĞİL) geldi (bkz. `auth-instance.ts` dosya başı
// yorumu). `auth-secret-leak.test.ts`'in YENİ AC8 vakası bu kanalın ham
// e-posta SIZDIRMADIĞINI gerçek bir SMTP reddiyle doğruluyor; bu test ise
// alan KÜMESİNİN kendisini (ECONNREFUSED/`AggregateError` senaryosu) pinler.
describe('F2 — ulaşılamayan SMTP ile kayıt: pino error kaydı YAPILANDIRILMIŞ cause taşır', () => {
  it(
    'SMTP_PORT=1 (ECONNREFUSED) → istek YİNE 2xx döner (ÖLÇÜLMÜŞ SAPMA — better-auth@1.7.14 ' +
      "runInBackgroundOrAwait her ZAMAN yutar, handler tanımlı olsa da) AMA pino'daki error " +
      'kaydı causeCode=MAIL_DELIVERY_FAILED + causeClassName TAŞIR, causeMessage ARTIK YOK',
    async () => {
      const { stream, getFullText } = createMemoryLogStream()
      const testApp = await createTestApp({
        stream,
        apiEnv: { ...BASE_ENV, SMTP_PORT: 1 },
      })

      try {
        const email = uniqueEmail()

        const response = await request(testApp.app.getHttpServer())
          .post('/auth/sign-up/email')
          .send({ name: 'S6 F2 Kullanıcısı', email, password: SIGN_UP_PASSWORD })

        // ÖLÇÜLMÜŞ SAPMA (dosya başı yorumu, `auth-instance.ts` ile AYNI
        // ölçüm) — better-auth@1.7.14'in `runInBackgroundOrAwait`'i bu hatayı
        // YAPISAL OLARAK yutar, isteğin KENDİSİ 503 DEĞİL, 2xx döner.
        expect(response.status).toBeGreaterThanOrEqual(200)
        expect(response.status).toBeLessThan(300)

        const errorLogLine = getFullText()
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .map((line): Record<string, unknown> => JSON.parse(line) as Record<string, unknown>)
          .find((entry) => entry['causeCode'] === 'MAIL_DELIVERY_FAILED')

        expect(errorLogLine).toBeDefined()
        // `createRootLogger`'ın `formatters.level` düzeni seviyeyi DİZE
        // olarak yazar (sayısal pino kodu DEĞİL) — `root-logger.ts:47`.
        expect(errorLogLine?.['level']).toBe('error')
        const causeClassName = errorLogLine?.['causeClassName']
        expect(typeof causeClassName).toBe('string')
        expect((causeClassName as string).length).toBeGreaterThan(0)
        // FIX turu 2, madde 1 — serbest metin alanı ARTIK HİÇ YOK.
        expect(errorLogLine?.['causeMessage']).toBeUndefined()
      } finally {
        await testApp.app.close()
      }
    },
    15_000,
  )
})

// --- FIX turu 1, madde 6 (F4, medium) ---------------------------------------
// `disableOriginCheck`/`disableCSRFCheck` artık `env.NODE_ENV`'den AÇIKÇA
// türetiliyor. `BASE_ENV.NODE_ENV` vitest altında HER ZAMAN `'test'`
// olduğundan (dosya başı yorumu, `auth-instance.ts`), bu testin KENDİSİ
// `apiEnv.NODE_ENV: 'development'` override'ı İLE (BASE_ENV'in ÜZERİNE
// yazar) kontrolün ÜRETİM/GELİŞTİRME ortamında GERÇEKTEN enforce edildiğini
// kanıtlar — `BASE_ENV`'in KENDİSİYLE bu test YAZILAMAZDI (`'test'` kalır,
// kontrol KAPALI olurdu).
describe('F4 — callbackURL açık yönlendirmesi, NODE_ENV test DIŞINDAYKEN 403', () => {
  it('GET /auth/verify-email?callbackURL=https://evil... → 403 (disableOriginCheck artık test DIŞI ortamda false)', async () => {
    const testApp = await createTestApp({
      apiEnv: { ...BASE_ENV, NODE_ENV: 'development' },
    })

    try {
      const response = await request(testApp.app.getHttpServer()).get(
        '/auth/verify-email?token=irrelevant&callbackURL=https%3A%2F%2Fevil.example.com',
      )

      expect(response.status).toBe(403)
      // Açık yönlendirme GERÇEKLEŞMEDİ — `Location` başlığı evil domain'e
      // İŞARET ETMİYOR (ya hiç yok ya da başka bir şeye işaret ediyor).
      const location: unknown = response.headers['location']
      if (typeof location === 'string') {
        expect(location).not.toContain('evil.example.com')
      }
    } finally {
      await testApp.app.close()
    }
  }, 15_000)
})

describe('AuthController — sağlayıcı seviyesi hata ÖLÇÜMÜ (ulaşılamayan veritabanı)', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  // ÖLÇÜLDÜ (gerçek `better-auth@1.7.14`, `node probe-tmp.mjs` ile doğrulandı —
  // bkz. Task raporu): `auth.handler()` bu senaryoda REDDETMEZ — Better Auth
  // DB hatasını (`PrismaClientKnownRequestError`) KENDİ İÇİNDE yakalar ve
  // BOŞ gövdeli, `status: 500` bir `Response` ile ÇÖZÜLÜR (better-call'un
  // dispatch seviyesi genel hata yakalayıcısı). Bu yüzden `AuthController`'ın
  // `try/catch`'i (→ `AuthProviderFailedError`, 503) BU SENARYODA DEVREYE
  // GİRMEZ — "hata yutulmaz" ilkesi ihlal EDİLMİYOR, çünkü hatayı Better
  // Auth'un KENDİSİ zaten görünür bir `Response`'a çevirmiş durumda (log'a
  // da KENDİ logger'ı üzerinden yazdı, ÜSTTEKİ "PrismaClientKnownRequestError"
  // satırı pino'ya bağlı `createBetterAuthLogger` üzerinden GEÇMEDİ — Better
  // Auth bu satırı `ctx.context.logger.error(message, e)` ile İKİ ARGÜMANLI
  // çağırıyor, bizim köprümüz yalnızca `message`'ı alıyor, bu yüzden ham hata
  // nesnesi (`e`) PINO'YA HİÇ ULAŞMADI — AC8 sızıntısı YOK, konsola da
  // YAZILMADI, bu satır Better Auth'un KENDİ `console`'a YAZDIĞI bir satır
  // DEĞİL, test raporunun stderr'inde göründü çünkü `isDevelopment()` true).
  // `AuthProviderFailedError`'ın GERÇEK tetikleyicisi (`auth.handler()`'ın
  // KENDİSİNİN reddetmesi) bu sürümde HTTP üzerinden ÜRETİLEMEDİ — sınıf ve
  // `try/catch` architect'in "HATA SINIFLARI" tablosunun BAĞLAYICI kararı
  // olarak KORUNUYOR (gerçekten beklenmedik bir çöküş için savunma katmanı).
  it('sağlayıcı hatası Better Auth tarafından İÇERİDE yakalanır → 500, forward edilir (AuthProviderFailedError DEVREYE GİRMEZ)', async () => {
    const testApp = await createTestApp({
      apiEnv: {
        ...BASE_ENV,
        DATABASE_URL: 'postgresql://arkesoft_app:wrong@127.0.0.1:1/arkesoft?schema=public',
      },
    })
    app = testApp.app

    const response = await request(app.getHttpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'S5 Kullanıcı', email: uniqueEmail(), password: SIGN_UP_PASSWORD })

    expect(response.status).toBe(500)
    // Better Auth'un KENDİ ürettiği boş gövde — bizim `AppErrorBody` tel
    // sözleşmemiz (`code`/`message`/`details`/`requestId`) BURADA YOK; bu
    // `AuthController`'ın OLDUĞU GİBİ forward ettiğinin kanıtı.
    expect(response.body).toEqual({})
  }, 15_000)
})

describe('AuthProviderFailedError — birim', () => {
  it('AUTH_PROVIDER_FAILED/503/isRetryable=true taşır (architect "HATA SINIFLARI")', () => {
    const error = new AuthProviderFailedError(new Error('beklenmedik sağlayıcı çöküşü'))

    expect(error.code).toBe('AUTH_PROVIDER_FAILED')
    expect(error.httpStatus).toBe(503)
    expect(error.isRetryable).toBe(true)
    expect(error.userMessageKey).toBe('errors.auth.providerFailed')
  })
})
