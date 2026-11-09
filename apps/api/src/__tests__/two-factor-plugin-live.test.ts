// @arkesoft/api — 2FA eklenti kaydı: CANLI R-PM1 ölçümü + hesap kilitleme
// (ROADMAP v0.0.15, T-016/S4)
//
// ⚠ YÖNTEM NOTU (raporun "YÖNTEM" bölümüne aktarılır): bu dosyanın yazıldığı
// anda `/two-factor/*` yolları `AUTH_DELEGATED_PATHS`/`AUTH_EXEMPT_PATHS`
// allowlist'inde YOKTUR (S5'in atomik işi, bu alt görev DOKUNMAZ) — bu yüzden
// `AuthController`'ın HTTP katmanı üzerinden (supertest + `createTestApp()`)
// bu uçlara ERİŞİLEMEZ (fail-closed delegasyon, 404). Ölçüm bu yüzden
// `createAuthInstance()`'ın ürettiği GERÇEK `Auth` nesnesinin `auth.handler()`
// fonksiyonunu DOĞRUDAN çağırır — `AuthController.delegate()`'in KENDİSİNİN
// yaptığı TAM AYNI şey (`buildBetterAuthRequest`/`forwardBetterAuthResponse`,
// bkz. `auth.controller.ts`), yalnızca Nest'in HTTP/allowlist katmanı
// ATLANMIŞTIR. Gerçek Postgres (`DATABASE_AUTH_URL`, `arkesoft_auth` rolü —
// T-015'ten beri `DATABASE_URL`/`arkesoft_app` bu tablolarda YETKİSİZ) ve
// yakalayıcı (capturing) bir `MailTransport` kullanılır — `auth-flow.test.ts`'in
// "kritik yapılandırma kanıtları" bloğunun AYNI `stubMailTransport` deseni,
// burada e-posta doğrulama belirtecini OKUMAK için GENİŞLETİLMİŞ.

import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'

import { parseEnv } from '@arkesoft/config/env'
import { createPrismaClient } from '@arkesoft/db'
import type { Auth } from 'better-auth'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createAuthInstance } from '../auth/auth-instance.js'
import { resolveBetterAuthCookieName } from '../auth/rate-limit/two-factor-scope-cookie.js'
import { ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS } from '../auth/two-factor/account-lockout.constants.js'
import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'
import type { MailEnvelope, MailTransport } from '../auth/mail/mail-transport.types.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createRootLogger } from '../logging/root-logger.js'
import { extractFirstUrl, extractQueryParam } from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const SIGN_UP_PASSWORD = 'arkesoft-s4-two-factor-password-123'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

/** `log-correlation.test.ts`/`auth-flow.test.ts`'in AYNI yardımcısı — bilerek yerel kopya. */
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

/** Gönderilen her zarfı bellekte toplar — Mailpit'e GEREK YOK (belirteç doğrudan zarf gövdesinden okunur). */
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

/**
 * `auth.handler()`'ı DOĞRUDAN çağırır — `AuthController.buildBetterAuthRequest`/
 * `forwardBetterAuthResponse`'un (ayrı bir Nest/HTTP sunucusu OLMADAN) AYNI
 * sözleşmesi. `path` `/auth` ÖN EKİNİ TAŞIR (`AUTH_BASE_PATH`).
 */
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

/** `Set-Cookie: name=value; Attr...`'dan istemcinin GERİ GÖNDERECEĞİ `name=value` çiftini çıkarır. */
function toCookiePair(setCookieHeader: string): string {
  const firstSegment = setCookieHeader.split(';')[0]
  if (firstSegment === undefined) {
    throw new Error(`beklenmeyen Set-Cookie biçimi: ${setCookieHeader}`)
  }
  return firstSegment.trim()
}

/** Belirli bir ÖN EKLE (cookie adı) başlayan İLK `Set-Cookie` girdisini bulur. */
function findSetCookie(setCookies: readonly string[], namePrefix: string): string | undefined {
  return setCookies.find(
    (entry) => entry.startsWith(`${namePrefix}=`) || entry.includes(`${namePrefix}=`),
  )
}

const totpUriSchema = z.object({
  method: z.literal('totp'),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})

/** `otpauth://totp/...?secret=BASE32...`'den Base32 anahtarı çıkarır. */
function extractBase32SecretFromTotpUri(totpURI: string): string {
  return extractQueryParam(totpURI, 'secret')
}

/** Her test bu fabrikadan kendi `Auth` örneğini kurar — paylaşılan durum YOK, sızıntı riski YOK. */
function buildAuth(overrides: { readonly logStream?: Writable } = {}): {
  readonly auth: Auth
  readonly mail: { readonly envelopes: MailEnvelope[] }
} {
  const { transport, envelopes } = createCapturingMailTransport()
  const logger =
    overrides.logStream === undefined
      ? createRootLogger({ level: 'silent' })
      : createRootLogger({ level: BASE_ENV.LOG_LEVEL, stream: overrides.logStream })

  const auth = createAuthInstance({
    env: BASE_ENV,
    // T-015'ten beri `arkesoft_app` (`DATABASE_URL`) bu tablolarda YETKİSİZ —
    // gerçek sorgu çalıştıran bu test `DATABASE_AUTH_URL`/`arkesoft_auth`
    // KULLANMAK ZORUNDADIR (auth.module.ts'in AYNI kararı).
    prismaClient: createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_AUTH_URL }),
    mailTransport: transport,
    logger,
  })

  return { auth, mail: { envelopes } }
}

/** Kayıt → e-posta doğrulama belirteci (yakalanan zarftan) → doğrulama. */
async function signUpAndVerify(
  auth: Auth,
  mail: { readonly envelopes: MailEnvelope[] },
  emailPrefix: string,
): Promise<string> {
  const email = uniqueEmail(emailPrefix)

  const signUpResult = await callAuth(auth, 'POST', '/auth/sign-up/email', {
    body: { name: 'S4 2FA Test Kullanıcısı', email, password: SIGN_UP_PASSWORD },
  })
  expect(signUpResult.status).toBeGreaterThanOrEqual(200)
  expect(signUpResult.status).toBeLessThan(300)

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

  return email
}

describe('R-PM1 — CANLI ölçüm: 2FA AÇIK/KAPALI sign-in + verify-totp başarı/hata (dört hücre)', () => {
  const { auth, mail } = buildAuth()

  it('hücre (b) KONTROL — 2FA KAPALI kullanıcı: sign-in normal 200 + TEK Set-Cookie (oturum)', async () => {
    const email = await signUpAndVerify(auth, mail, 's4-control')

    const result = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })

    // RAPORA GİRER (R-PM1, hücre b) — tam gövde + durum kodu.
    expect(result.status).toBe(200)
    expect(result.setCookies.length).toBeGreaterThan(0)
  }, 20_000)

  it('hücre (a) — 2FA AÇIK kullanıcı: sign-in 401 DEĞİL, twoFactorRedirect gövdesi + iki Set-Cookie (oturum SİLME + 2fa çerezi)', async () => {
    const email = await signUpAndVerify(auth, mail, 's4-twofactor')

    // Önce normal (henüz 2FA'sız) giriş — oturum çerezi alınır.
    const firstSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })
    const sessionCookieForEnable = firstSignIn.setCookies[0]
    if (sessionCookieForEnable === undefined) {
      throw new Error('ilk girişten Set-Cookie alınamadı')
    }

    // 2FA kur (enable) — mimari karar: "QR teslimi: URI + manuel anahtar".
    const enableResult = await callAuth(auth, 'POST', '/auth/two-factor/enable', {
      body: { password: SIGN_UP_PASSWORD, method: 'totp' },
      cookie: toCookiePair(sessionCookieForEnable),
    })
    expect(enableResult.status).toBe(200)
    const enableBody = totpUriSchema.parse(enableResult.body)
    const base32Secret = extractBase32SecretFromTotpUri(enableBody.totpURI)

    // Onayla (verify-totp, oturum AÇIKKEN) — bu çağrı "etkinleştirildi" olayını üretir.
    const confirmCode = await generateTotpCode({ base32Secret })
    const confirmResult = await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: confirmCode },
      cookie: toCookiePair(sessionCookieForEnable),
    })
    expect(confirmResult.status).toBe(200)

    // ASIL ÖLÇÜM (hücre a) — ARTIK 2FA kurulu bir hesapla YENİ bir sign-in.
    const result = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })

    // RAPORA GİRER (R-PM1, hücre a) — architect'in bağlayıcı bulgusunu
    // CANLI olarak doğrular: 401 DEĞİL, 200 + `twoFactorRedirect:true`.
    expect(result.status).toBe(200)
    const body = z
      .object({ twoFactorRedirect: z.literal(true), twoFactorMethods: z.array(z.string()) })
      .parse(result.body)
    expect(body.twoFactorMethods).toContain('totp')
    expect(result.setCookies.length).toBeGreaterThanOrEqual(1)
  }, 20_000)

  it('hücre (c)/(d) — verify-totp DOĞRU kod 200+Set-Cookie, YANLIŞ kod 401 INVALID_CODE', async () => {
    const email = await signUpAndVerify(auth, mail, 's4-verify')

    const firstSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })
    const sessionCookie = firstSignIn.setCookies[0]
    if (sessionCookie === undefined) {
      throw new Error('ilk girişten Set-Cookie alınamadı')
    }

    const enableResult = await callAuth(auth, 'POST', '/auth/two-factor/enable', {
      body: { password: SIGN_UP_PASSWORD, method: 'totp' },
      cookie: toCookiePair(sessionCookie),
    })
    const { totpURI } = totpUriSchema.parse(enableResult.body)
    const base32Secret = extractBase32SecretFromTotpUri(totpURI)

    const confirmCode = await generateTotpCode({ base32Secret })
    await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: confirmCode },
      cookie: toCookiePair(sessionCookie),
    })

    // Yeni bir 2FA zorlu sınaması (challenge) için TEKRAR sign-in.
    const challengeSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })
    const twoFactorCookieEntry = findSetCookie(challengeSignIn.setCookies, 'two_factor')
    if (twoFactorCookieEntry === undefined) {
      throw new Error(
        `two_factor çerezi bulunamadı — gözlenen Set-Cookie adları: ${challengeSignIn.setCookies.join(' | ')}`,
      )
    }
    const twoFactorCookie = toCookiePair(twoFactorCookieEntry)

    // hücre (d) — YANLIŞ kod.
    const wrongResult = await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: '000000' },
      cookie: twoFactorCookie,
    })
    expect(wrongResult.status).toBe(401)
    const wrongBody = z.object({ code: z.string(), message: z.string() }).parse(wrongResult.body)
    expect(wrongBody.code).toBe('INVALID_CODE')

    // hücre (c) — DOĞRU kod (AYNI challenge çerezi — henüz tüketilmedi).
    const correctCode = await generateTotpCode({ base32Secret })
    const correctResult = await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: correctCode },
      cookie: twoFactorCookie,
    })
    expect(correctResult.status).toBe(200)
    expect(correctResult.setCookies.length).toBeGreaterThan(0)
    const correctBody = z
      .object({ token: z.string(), user: z.object({ id: z.string() }) })
      .parse(correctResult.body)
    expect(correctBody.user.id.length).toBeGreaterThan(0)
  }, 20_000)
})

describe('accountLockout — GERÇEK sayaçla 429/ACCOUNT_TEMPORARILY_LOCKED (sabitten türetilmiş)', () => {
  it(`${String(ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS)} yanlış denemeden SONRA 11. deneme 429 döner (10. deneme HÂLÂ 401)`, async () => {
    const { auth, mail } = buildAuth()
    const email = await signUpAndVerify(auth, mail, 's4-lockout')

    const firstSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })
    const sessionCookieEntry = firstSignIn.setCookies[0]
    if (sessionCookieEntry === undefined) {
      throw new Error('ilk girişten Set-Cookie alınamadı')
    }
    const enableResult = await callAuth(auth, 'POST', '/auth/two-factor/enable', {
      body: { password: SIGN_UP_PASSWORD, method: 'totp' },
      cookie: toCookiePair(sessionCookieEntry),
    })
    const { totpURI } = totpUriSchema.parse(enableResult.body)
    const base32Secret = extractBase32SecretFromTotpUri(totpURI)
    const confirmCode = await generateTotpCode({ base32Secret })
    await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: confirmCode },
      cookie: toCookiePair(sessionCookieEntry),
    })

    // Better Auth'un KENDİ per-challenge sınırı (`beginAttempt(5)`,
    // `verify-two-factor.mjs:70-98`, bu alt görevin KODU DEĞİL — ÖLÇÜLDÜ,
    // kaynak okuması) HER challenge çerezinde EN FAZLA 5 yanlış deneme
    // kabul eder; 6.'sı `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` (400) ile
    // o challenge'ı GEÇERSİZ kılar. Hesap seviyesindeki
    // `ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS` deneme SAYISINA ulaşmak için bu
    // yüzden BİRDEN FAZLA challenge (yeniden sign-in) gerekir — sabitten
    // TÜRETİLEN döngü, literal `10` YAZILMAZ.
    const perChallengeAttemptLimit = 5
    let remainingAttempts = ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS
    let lastResult: AuthCallResult | undefined

    while (remainingAttempts > 0) {
      const challengeSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
        body: { email, password: SIGN_UP_PASSWORD },
      })
      const twoFactorCookieEntry = findSetCookie(challengeSignIn.setCookies, 'two_factor')
      if (twoFactorCookieEntry === undefined) {
        throw new Error('kilitlenme döngüsünde two_factor çerezi bulunamadı')
      }
      const twoFactorCookie = toCookiePair(twoFactorCookieEntry)

      const attemptsThisChallenge = Math.min(perChallengeAttemptLimit, remainingAttempts)
      for (let i = 0; i < attemptsThisChallenge; i += 1) {
        lastResult = await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
          body: { code: '000000' },
          cookie: twoFactorCookie,
        })
        remainingAttempts -= 1
      }
    }

    // Tam `ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS`. deneme HÂLÂ 401 (kilit bu
    // denemeyi henüz KAPSAMIYOR — `recordTwoFactorFailure` sayaç EŞİĞE
    // ULAŞTIĞINDA `lockedUntil`'i YAZAR ama BU ÇAĞRININ KENDİ yanıtı hâlâ
    // `invalid("INVALID_CODE")`dur, kaynak okumasıyla ÖLÇÜLDÜ).
    if (lastResult === undefined) {
      throw new Error('hiç deneme yapılmadı')
    }
    expect(lastResult.status).toBe(401)

    // 11. (eşik SONRASI İLK) deneme — YENİ bir challenge, doğru/yanlış kod
    // FARK ETMEZ: `assertTwoFactorNotLocked` kod kontrolünden ÖNCE çalışır.
    const lockedChallengeSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })
    const lockedTwoFactorCookieEntry = findSetCookie(lockedChallengeSignIn.setCookies, 'two_factor')
    if (lockedTwoFactorCookieEntry === undefined) {
      throw new Error('kilitlenme SONRASI two_factor çerezi bulunamadı')
    }
    const lockedCode = await generateTotpCode({ base32Secret })
    const lockedResult = await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: lockedCode },
      cookie: toCookiePair(lockedTwoFactorCookieEntry),
    })

    // RAPORA GİRER (DoD madde 3) — GERÇEK 429 + ACCOUNT_TEMPORARILY_LOCKED.
    expect(lockedResult.status).toBe(429)
    const lockedBody = z.object({ code: z.string(), message: z.string() }).parse(lockedResult.body)
    expect(lockedBody.code).toBe('ACCOUNT_TEMPORARILY_LOCKED')
  }, 30_000)
})

describe('2FA olay logu — Pino, sır İÇERMEZ (ROADMAP v0.0.15, T-016/S4)', () => {
  it('kurulum başladı logu ÜRETİLİR + etkinleştirildi logu userId taşır; totpURI/backupCodes/kod HİÇBİR satırda YOK', async () => {
    const { stream, getFullText } = createMemoryLogStream()
    const { auth, mail } = buildAuth({ logStream: stream })
    const email = await signUpAndVerify(auth, mail, 's4-log')

    const signIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })
    const sessionCookieEntry = signIn.setCookies[0]
    if (sessionCookieEntry === undefined) {
      throw new Error('girişten Set-Cookie alınamadı')
    }
    const enableResult = await callAuth(auth, 'POST', '/auth/two-factor/enable', {
      body: { password: SIGN_UP_PASSWORD, method: 'totp' },
      cookie: toCookiePair(sessionCookieEntry),
    })
    const { totpURI, backupCodes } = totpUriSchema.parse(enableResult.body)
    const base32Secret = extractBase32SecretFromTotpUri(totpURI)
    const confirmCode = await generateTotpCode({ base32Secret })
    await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: confirmCode },
      cookie: toCookiePair(sessionCookieEntry),
    })

    const fullLogText = getFullText()
    const lines = fullLogText
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line): Record<string, unknown> => JSON.parse(line) as Record<string, unknown>)

    const setupStarted = lines.find((line) => line['msg'] === '2FA kurulumu başladı')
    const enabled = lines.find((line) => line['msg'] === '2FA etkinleştirildi')

    expect(setupStarted).toBeDefined()
    expect(enabled).toBeDefined()

    // FIX turu 3, madde ② (security tur3, `low`) — `setupStarted` ("2FA
    // kurulumu başladı") ARTIK `userId`'yi BURADAN (`callAuth`'un AUTH
    // nesnesini DOĞRUDAN çağırdığı bu dosya başı yorumunun belirttiği
    // `auth.handler()` KÖPRÜSÜ) TAŞIMAZ — bu alt görevin KALDIRDIĞI alan
    // TAM OLARAK BUYDU (`auth-instance.ts`'in `createTwoFactorEventHook`'u,
    // dosya başı GÜNCELLEME yorumu): gerçek HTTP akışında bu alan
    // `AuthContextMiddleware`'in `child({userId})` BAĞLAMASINDAN gelir, ama
    // BU test Nest'in middleware zincirini HİÇ ÇALIŞTIRMAZ (dosya başı
    // YÖNTEM NOTU) — bu yüzden `userId`'nin TAM OLARAK BİR KEZ göründüğü
    // CANLI kanıt `two-factor-event-log-duplicate-userid.test.ts`'TEDİR
    // (GERÇEK `createTestApp()` + supertest, middleware zinciri DAHİL).
    // `enabled` ("2FA etkinleştirildi") BU değişiklikten BAĞIMSIZDIR —
    // `verify-totp` dalı `AUTH_EXEMPT_PATHS`'TE olduğu için middleware ZATEN
    // `userId` BAĞLAMAZ, bu yüzden o dal HÂLÂ kendi `{ userId }`'ini açıkça
    // geçirir (dosya başı GÜNCELLEME yorumunun "ona DOKUNMA" maddesi).
    expect(typeof enabled?.['userId']).toBe('string')
    expect((enabled?.['userId'] as string).length).toBeGreaterThan(0)

    // Sır/kod ASLA loglanmaz — mekanik tarama.
    expect(fullLogText).not.toContain(totpURI)
    expect(fullLogText).not.toContain(base32Secret)
    expect(fullLogText).not.toContain(confirmCode)
    for (const code of backupCodes) {
      expect(fullLogText).not.toContain(code)
    }
  }, 20_000)

  it('yanlış kod → "2FA doğrulaması başarısız" uyarı logu, GİRİLEN KOD hiçbir satırda YOK', async () => {
    const { stream, getFullText } = createMemoryLogStream()
    const { auth, mail } = buildAuth({ logStream: stream })
    const email = await signUpAndVerify(auth, mail, 's4-log-fail')

    const signIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })
    const sessionCookieEntry = signIn.setCookies[0]
    if (sessionCookieEntry === undefined) {
      throw new Error('girişten Set-Cookie alınamadı')
    }
    const enableResult = await callAuth(auth, 'POST', '/auth/two-factor/enable', {
      body: { password: SIGN_UP_PASSWORD, method: 'totp' },
      cookie: toCookiePair(sessionCookieEntry),
    })
    const { totpURI } = totpUriSchema.parse(enableResult.body)
    const base32Secret = extractBase32SecretFromTotpUri(totpURI)
    await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: await generateTotpCode({ base32Secret }) },
      cookie: toCookiePair(sessionCookieEntry),
    })

    const challengeSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
      body: { email, password: SIGN_UP_PASSWORD },
    })
    const twoFactorCookieEntry = findSetCookie(challengeSignIn.setCookies, 'two_factor')
    if (twoFactorCookieEntry === undefined) {
      throw new Error('two_factor çerezi bulunamadı')
    }

    await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
      body: { code: '999999' },
      cookie: toCookiePair(twoFactorCookieEntry),
    })

    const fullLogText = getFullText()
    expect(fullLogText).toContain('2FA doğrulaması başarısız')
    expect(fullLogText).not.toContain('999999')
  }, 20_000)

  // FIX turu 1, madde 2/F2 (`medium`) — `disable`/`generate-backup-codes`
  // İÇİN SIFIR olay logu VARDI; üstüne `databaseHooks.session.create.after`
  // `disable`'ın ÜRETTİĞİ oturumu KOŞULSUZ "giriş başarılı" diye etiketliyordu
  // (`auth-instance.ts`'in dosya başı GÜNCELLEME yorumu).
  it(
    'disable (DOĞRU parola) → "2FA devre dışı bırakıldı" info logu ÜRETİR; ' +
      'ÜRETTİĞİ oturum "giriş başarılı" DEĞİL "2FA değişikliği sonrası oturum yenilendi" ' +
      'olarak etiketlenir (TEK "giriş başarılı" — asıl sign-in\'den)',
    async () => {
      const { stream, getFullText } = createMemoryLogStream()
      const { auth, mail } = buildAuth({ logStream: stream })
      const email = await signUpAndVerify(auth, mail, 's4-log-disable')

      const signIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
        body: { email, password: SIGN_UP_PASSWORD },
      })
      const sessionCookieEntry = signIn.setCookies[0]
      if (sessionCookieEntry === undefined) {
        throw new Error('girişten Set-Cookie alınamadı')
      }
      const sessionCookiePair = toCookiePair(sessionCookieEntry)

      const enableResult = await callAuth(auth, 'POST', '/auth/two-factor/enable', {
        body: { password: SIGN_UP_PASSWORD, method: 'totp' },
        cookie: sessionCookiePair,
      })
      const { totpURI } = totpUriSchema.parse(enableResult.body)
      const base32Secret = extractBase32SecretFromTotpUri(totpURI)
      const confirmResult = await callAuth(auth, 'POST', '/auth/two-factor/verify-totp', {
        body: { code: await generateTotpCode({ base32Secret }) },
        cookie: sessionCookiePair,
      })

      // `verify-totp`'un "confirm" dalı ESKİ oturumu SİLİP YENİ bir oturum
      // kurar (`totp/index.mjs`, `two-factor-acceptance-ac3-backup-code-
      // single-use.test.ts`'in AYNI ÖLÇÜMÜ) — `disable` BU YENİ çerezle
      // çağrılmalı, ESKİ `sessionCookiePair` artık GEÇERSİZ.
      const confirmedSessionCookieEntry = confirmResult.setCookies.find(
        (entry) =>
          entry.startsWith('better-auth.session_token=') || entry.includes('session_token='),
      )
      if (confirmedSessionCookieEntry === undefined) {
        throw new Error('verify-totp onayından YENİ oturum çerezi alınamadı')
      }
      const confirmedSessionCookiePair = toCookiePair(confirmedSessionCookieEntry)

      const disableResult = await callAuth(auth, 'POST', '/auth/two-factor/disable', {
        body: { password: SIGN_UP_PASSWORD },
        cookie: confirmedSessionCookiePair,
      })
      expect(disableResult.status).toBe(200)

      const fullLogText = getFullText()
      const lines = fullLogText
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line): Record<string, unknown> => JSON.parse(line) as Record<string, unknown>)

      // FIX turu 3, madde ② — `disable` dalı ARTIK `userId`'yi burada
      // TAŞIMAZ (dosya başı GÜNCELLEME yorumunun AYNI gerekçesi: bu test
      // Nest middleware zincirini ÇALIŞTIRMAZ). Bu olayın GERÇEKTEN
      // ÜRETİLDİĞİ (`msg` eşleşmesi) hâlâ doğrulanır.
      const disabledEvent = lines.find((line) => line['msg'] === '2FA devre dışı bırakıldı')
      expect(disabledEvent).toBeDefined()

      // İKİ relabel BEKLENİR — `verify-totp`'un "kurulum onayı" dalı (ZATEN
      // oturum varken, `isNonLoginSessionCreation`'ın İKİNCİ sinyali) VE
      // `disable`'ın kendisi. ÖLÇÜLMÜŞ, UYDURULMUŞ DEĞİL — ilk yazımda `1`
      // bekleniyordu, ÇALIŞTIRILIP `2` olduğu GÖRÜLDÜ, bu yorum DÜZELTİLDİ.
      const relabeledEvents = lines.filter(
        (line) => line['msg'] === '2FA değişikliği sonrası oturum yenilendi',
      )
      expect(relabeledEvents.length).toBe(2)

      // ASIL KANIT — "giriş başarılı" TAM OLARAK BİR KEZ görünür (asıl
      // sign-in'den); `verify-totp` onayının VE `disable`'ın ÜRETTİĞİ İKİ
      // SONRAKİ oturum bu etikete KARIŞMAZ. Düzeltmeden ÖNCE bu sayı 3
      // olurdu (ÖLÇÜLDÜ, mutasyon probu raporda).
      const loginEvents = lines.filter((line) => line['msg'] === 'giriş başarılı')
      expect(loginEvents.length).toBe(1)

      // Parola HİÇBİR satırda YOK.
      expect(fullLogText).not.toContain(SIGN_UP_PASSWORD)
    },
    20_000,
  )
})

describe(
  'FIX turu 3, madde ①/(b) (solid N-1, `medium`) — çerez adı AYNASI: ' +
    "`two-factor-scope-cookie.ts`'in `resolveBetterAuthCookieName()`'İ ile GERÇEK Better Auth " +
    'örneğinin yazdığı `Set-Cookie` adı AYNI kaynağa (bu test) bağlı — biri sessizce SAPARSA ' +
    '(ör. `advanced.cookiePrefix` ayarlanır/`useSecureCookies` değişir) bu test KIRMIZI olur',
  () => {
    it("sign-in'in oturum çerezi VE 2FA challenge çerezinin GERÇEK adı, türetilen adla BİREBİR eşleşir", async () => {
      const { auth, mail } = buildAuth()
      const email = await signUpAndVerify(auth, mail, 's4-cookie-mirror')

      const firstSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
        body: { email, password: SIGN_UP_PASSWORD },
      })
      const sessionCookieEntry = firstSignIn.setCookies[0]
      if (sessionCookieEntry === undefined) {
        throw new Error('ilk girişten Set-Cookie alınamadı')
      }
      const sessionCookiePair = toCookiePair(sessionCookieEntry)
      const sessionCookieName = sessionCookiePair.slice(0, sessionCookiePair.indexOf('='))

      // RAPORA GİRER (kanıt 4) — CANLI Better Auth'un yazdığı ad ≡ türetilen ad.
      expect(sessionCookieName).toBe(resolveBetterAuthCookieName('session_token', BASE_ENV))

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

      const challengeSignIn = await callAuth(auth, 'POST', '/auth/sign-in/email', {
        body: { email, password: SIGN_UP_PASSWORD },
      })
      const twoFactorCookieEntry = findSetCookie(challengeSignIn.setCookies, 'two_factor')
      if (twoFactorCookieEntry === undefined) {
        throw new Error('two_factor çerezi bulunamadı')
      }
      const twoFactorCookiePair = toCookiePair(twoFactorCookieEntry)
      const twoFactorCookieName = twoFactorCookiePair.slice(0, twoFactorCookiePair.indexOf('='))

      // RAPORA GİRER (kanıt 4).
      expect(twoFactorCookieName).toBe(resolveBetterAuthCookieName('two_factor', BASE_ENV))
    }, 20_000)
  },
)
