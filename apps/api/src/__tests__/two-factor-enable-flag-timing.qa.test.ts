// @arkesoft/api — QA ÖLÇÜM: `app_user.two_factor_enabled` bayrağı HANGİ
// adımda `true` olur? (ROADMAP v0.0.20, T-021/S1, architect varsayımı
// A-A21-1'in DOĞRULANMASI)
//
// ⚠ Bu dosya ÜRETİM KODU DEĞİL — tek amacı iki şeyi ÖLÇMEK:
//   ÖLÇÜM 1: `enable` ÖNCESİ / `enable` SONRASI-`verify-totp` ÖNCESİ /
//            `verify-totp` SONRASI üç noktada bayrağın GERÇEK veritabanı
//            değeri (Better Auth'un HTTP yanıt GÖVDESİNDEN değil —
//            `$queryRaw`/Prisma ile DOĞRUDAN okunur, bkz. görev DoD'si).
//   ÖLÇÜM 2: bayrak `true` İKEN `/auth/sign-in/email` tam oturum mu veriyor
//            yoksa bir ara durum (`twoFactorRedirect`) mu dönüyor?
//
// YÖNTEM: `two-factor-plugin-live.test.ts`'in dosya başı yorumunun AYNI
// gerekçesi — bu ölçümün yazıldığı anda `/two-factor/*` ve `/sign-in/*`
// yolları `AUTH_DELEGATED_PATHS`/`AUTH_EXEMPT_PATHS` allowlist'inde olsun ya
// da olmasın, bu dosya `AuthController`'ın HTTP katmanını (Nest app, supertest)
// HİÇ KURMAZ — `createAuthInstance()`'ın ürettiği GERÇEK `Auth` nesnesinin
// `auth.handler()` fonksiyonunu DOĞRUDAN çağırır (`AuthController.delegate()`
// ile AYNI köprü: `buildBetterAuthRequest`/`forwardBetterAuthResponse`).
// Bu, ölçümü Nest/allowlist katmanından İZOLE eder — amaç yalnızca Better
// Auth'un KENDİ davranışını ölçmek, Nest'in yönlendirme kararını değil.
//
// Veritabanı: gerçek Postgres, `DATABASE_AUTH_URL`/`arkesoft_auth` rolü
// (T-015'ten beri `DATABASE_URL`/`arkesoft_app` `app_user` tablosunda
// YETKİSİZ — `two-factor-plugin-live.test.ts`'in AYNI kararı).
// E-posta: gerçek SMTP/Mailpit'e GEREK YOK — yakalayıcı (capturing)
// `MailTransport` ile doğrulama belirteci doğrudan zarf gövdesinden okunur
// (`two-factor-plugin-live.test.ts`'in AYNI deseni).

import { randomUUID } from 'node:crypto'

import { parseEnv } from '@arkesoft/config/env'
import { createPrismaClient } from '@arkesoft/db'
import type { Auth } from 'better-auth'
import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createAuthInstance } from '../auth/auth-instance.js'
import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'
import type { MailEnvelope, MailTransport } from '../auth/mail/mail-transport.types.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createRootLogger } from '../logging/root-logger.js'
import { extractFirstUrl, extractQueryParam } from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const SIGN_UP_PASSWORD = 'arkesoft-t021-s1-flag-timing-password-123'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

function createCapturingMailTransport(): {
  readonly transport: MailTransport
  readonly envelopes: MailEnvelope[]
} {
  const envelopes: MailEnvelope[] = []
  return {
    envelopes,
    transport: {
      send(envelope: MailEnvelope): Promise<void> {
        envelopes.push(envelope)
        return Promise.resolve()
      },
    },
  }
}

type AuthCallResult = {
  readonly status: number
  readonly body: unknown
  readonly setCookies: readonly string[]
}

/** `two-factor-plugin-live.test.ts`'in AYNI köprüsü — `auth.handler()` DOĞRUDAN çağrılır. */
async function callAuth(
  auth: Auth,
  method: 'GET' | 'POST',
  path: string,
  options: { readonly body?: unknown; readonly cookie?: string } = {},
): Promise<AuthCallResult> {
  const url = new URL(path, BASE_ENV.AUTH_BASE_URL)
  const headers = new Headers()
  if (options.cookie !== undefined) {
    headers.set('cookie', options.cookie)
  }

  const request =
    method === 'GET'
      ? new Request(url, { method, headers })
      : (() => {
          headers.set('content-type', 'application/json')
          return new Request(url, { method, headers, body: JSON.stringify(options.body ?? {}) })
        })()

  const response = await auth.handler(request)
  const text = await response.text()
  const body: unknown = text.length > 0 ? JSON.parse(text) : null
  return { status: response.status, body, setCookies: response.headers.getSetCookie() }
}

function toCookiePair(setCookieHeader: string): string {
  const firstSegment = setCookieHeader.split(';')[0]
  if (firstSegment === undefined) {
    throw new Error(`beklenmeyen Set-Cookie biçimi: ${setCookieHeader}`)
  }
  return firstSegment.trim()
}

const totpUriSchema = z.object({
  method: z.literal('totp'),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})

function extractBase32SecretFromTotpUri(totpURI: string): string {
  return extractQueryParam(totpURI, 'secret')
}

function buildAuth(): {
  readonly auth: Auth
  readonly mail: { readonly envelopes: MailEnvelope[] }
} {
  const { transport, envelopes } = createCapturingMailTransport()
  const logger = createRootLogger({ level: 'silent' })

  const auth = createAuthInstance({
    env: BASE_ENV,
    // T-015'ten beri `arkesoft_app` (`DATABASE_URL`) `app_user` tablosunda
    // YETKİSİZ — bu ölçüm `DATABASE_AUTH_URL`/`arkesoft_auth` KULLANMAK
    // ZORUNDADIR (`two-factor-plugin-live.test.ts`'in AYNI kararı).
    prismaClient: createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_AUTH_URL }),
    mailTransport: transport,
    logger,
  })

  return { auth, mail: { envelopes } }
}

async function signUpAndVerify(
  auth: Auth,
  mail: { readonly envelopes: MailEnvelope[] },
  emailPrefix: string,
): Promise<{ readonly email: string; readonly userId: string }> {
  const email = uniqueEmail(emailPrefix)

  const signUpResult = await callAuth(auth, 'POST', '/auth/sign-up/email', {
    body: { name: 'T-021/S1 Bayrak Zamanlama Ölçümü', email, password: SIGN_UP_PASSWORD },
  })
  expect(signUpResult.status).toBeGreaterThanOrEqual(200)
  expect(signUpResult.status).toBeLessThan(300)
  const signUpBody = z.object({ user: z.object({ id: z.string() }) }).parse(signUpResult.body)

  const verificationEnvelope = mail.envelopes.find(
    (envelope) => envelope.messageKey === 'auth.emailVerification' && envelope.to === email,
  )
  if (verificationEnvelope === undefined) {
    throw new Error(`${email} için doğrulama zarfı yakalanmadı`)
  }
  const token = extractQueryParam(extractFirstUrl(verificationEnvelope.text), 'token')

  const verifyResult = await callAuth(
    auth,
    'GET',
    `/auth/verify-email?token=${encodeURIComponent(token)}`,
  )
  expect(verifyResult.status).toBeGreaterThanOrEqual(200)
  expect(verifyResult.status).toBeLessThan(300)

  return { email, userId: signUpBody.user.id }
}

describe('T-021/S1 ÖLÇÜM — app_user.two_factor_enabled HANGİ adımda true olur + sign-in challenge zorunluluğu', () => {
  // `createPrismaClient`'ın AYRI bir okuma istemcisi — HTTP katmanına
  // BAĞIMLI DEĞİL, veritabanından DOĞRUDAN okur (DoD madde "Better Auth'un
  // dönüş gövdesinden DEĞİL").
  const authRolePrisma = createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_AUTH_URL })

  afterAll(async () => {
    await authRolePrisma.$disconnect()
  })

  async function readTwoFactorEnabledFlag(userId: string): Promise<boolean> {
    const row = await authRolePrisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    })
    if (row === null) {
      throw new Error(`app_user satırı bulunamadı: ${userId}`)
    }
    return row.twoFactorEnabled
  }

  it('ÖLÇÜM 1 — üç nokta: enable ÖNCESİ / enable SONRASI-verify ÖNCESİ / verify-totp SONRASI', async () => {
    const { auth, mail } = buildAuth()
    const { email, userId } = await signUpAndVerify(auth, mail, 't021s1-timing')

    // NOKTA 1 — enable ÇAĞRILMADAN ÖNCE.
    const flagBeforeEnable = await readTwoFactorEnabledFlag(userId)
    expect(flagBeforeEnable).toBe(false)

    const firstSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })
    const sessionCookieEntry = firstSignIn.setCookies[0]
    if (sessionCookieEntry === undefined) {
      throw new Error('ilk girişten Set-Cookie alınamadı')
    }
    const sessionCookiePair = toCookiePair(sessionCookieEntry)

    const enableResult = await callAuth(auth, 'POST', '/auth/two-factor/enable', {
      body: { password: SIGN_UP_PASSWORD, method: 'totp' },
      cookie: sessionCookiePair,
    })
    expect(enableResult.status).toBe(200)
    const enableBody = totpUriSchema.parse(enableResult.body)
    const base32Secret = extractBase32SecretFromTotpUri(enableBody.totpURI)

    // NOKTA 2 — `enable` SONRASI, `verify-totp` ÇAĞRILMADAN ÖNCE.
    // VERİTABANINDAN okunur — `enableResult.body`'nin KENDİSİ bayrağı
    // TAŞIMIYOR (yalnızca `method`/`totpURI`/`backupCodes` döner), bu
    // yüzden "gövde bir beyan değil" ölçümü BURADA zaten doğrulanıyor:
    // gövde flag hakkında HİÇBİR ŞEY söylemiyor, veritabanı tek kaynak.
    const flagAfterEnableBeforeVerify = await readTwoFactorEnabledFlag(userId)

    const confirmCode = await generateTotpCode({ base32Secret })
    const confirmResult = await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: confirmCode },
      cookie: sessionCookiePair,
    })
    expect(confirmResult.status).toBe(200)

    // NOKTA 3 — `verify-totp` SONRASI.
    const flagAfterVerify = await readTwoFactorEnabledFlag(userId)

    // ====== RAPORA GİRER (ÖLÇÜM 1, ham üç nokta) ======
    expect(flagBeforeEnable).toBe(false)
    expect(flagAfterEnableBeforeVerify).toBe(false)
    expect(flagAfterVerify).toBe(true)
  }, 30_000)

  it('ÖLÇÜM 2 — bayrak true İKEN sign-in: tam oturum mu, yoksa twoFactorRedirect ara durumu mu?', async () => {
    const { auth, mail } = buildAuth()
    const { email, userId } = await signUpAndVerify(auth, mail, 't021s1-challenge')

    const firstSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })
    const sessionCookieEntry = firstSignIn.setCookies[0]
    if (sessionCookieEntry === undefined) {
      throw new Error('ilk girişten Set-Cookie alınamadı')
    }
    const sessionCookiePair = toCookiePair(sessionCookieEntry)

    const enableResult = await callAuth(auth, 'POST', '/auth/two-factor/enable', {
      body: { password: SIGN_UP_PASSWORD, method: 'totp' },
      cookie: sessionCookiePair,
    })
    const { totpURI } = totpUriSchema.parse(enableResult.body)
    const base32Secret = extractBase32SecretFromTotpUri(totpURI)

    const confirmCode = await generateTotpCode({ base32Secret })
    await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: confirmCode },
      cookie: sessionCookiePair,
    })

    // VERİTABANI TEYİDİ — bu testin ön koşulu ("bayrak true İKEN") gövdeye
    // değil, veritabanına göre doğrulanır.
    const flagNowTrue = await readTwoFactorEnabledFlag(userId)
    expect(flagNowTrue).toBe(true)

    // ASIL ÖLÇÜM — bayrak true İKEN YENİ bir sign-in.
    const secondSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })

    // ====== RAPORA GİRER (ÖLÇÜM 2, ham gövde + durum kodu) ======
    // Gözlenen: 401 DEĞİL, 200 + `twoFactorRedirect:true` — TAM OTURUM
    // DEĞİL, bir ARA DURUM. `user`/`session` alanı YOK (tam oturum
    // gövdesinin şekli değil).
    expect(secondSignIn.status).toBe(200)
    const body = z
      .object({ twoFactorRedirect: z.literal(true), twoFactorMethods: z.array(z.string()) })
      .parse(secondSignIn.body)
    expect(body.twoFactorMethods).toContain('totp')

    // Tam oturumun ürettiği `user`/`token` alanları bu gövdede YOK —
    // ara durumun "tam oturum değil" olduğunun ikinci kanıtı.
    const bodyAsRecord = secondSignIn.body as Record<string, unknown>
    expect(Object.hasOwn(bodyAsRecord, 'user')).toBe(false)
    expect(Object.hasOwn(bodyAsRecord, 'token')).toBe(false)

    // Ara durum, oturum ÇEREZİNİ siler ve bir 2FA zorlu sınama (challenge)
    // çerezi kurar — `two_factor` ADINI TAŞIYAN bir Set-Cookie VAR.
    const twoFactorCookie = secondSignIn.setCookies.find((entry) => entry.includes('two_factor='))
    expect(twoFactorCookie).toBeDefined()

    // `userId` bu testte doğrudan assert edilmiyor ama değişkenin
    // KULLANILDIĞINI (lint, no-unused) ve ölçümün doğru kullanıcıya ait
    // olduğunu teyit eder.
    expect(userId.length).toBeGreaterThan(0)
  }, 30_000)
})
