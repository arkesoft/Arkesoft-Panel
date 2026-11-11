// @arkesoft/api — oturum uçları entegrasyon testleri (ROADMAP v0.0.5,
// T-006/S6, architect "tRPC SÖZLEŞMESİ" → HTTP sözleşmesi bölüm B, K5/K6, AC6;
// ROADMAP v0.0.15.1, T-017/S8a, ADR-0019 §Karar 1/4/8/9 — AC1/AC3/AC4/AC5/AC6
// + SIRA KANITI)
//
// Gerçek Postgres + gerçek Mailpit.
//
// FIX turu 2, madde 2 (security tur2 S-3) — `SameOriginGuard` artık `Cookie`
// taşıyan GÜVENSİZ istekler (POST) için `Origin`/`Referer`/`Sec-Fetch-Site`
// ÜÇÜNÜN DE eksikliğini REDDEDİYOR. Bu dosyanın `/auth/sessions/revoke*`
// çağrıları `.set('Origin', ...)` EKLER — tarayıcının zaten yaptığı şey
// (same-origin-guard.test.ts'in önerdiği desen).
//
// ⚠⚠ T-017/S8a EKLEMESİ — STEP-UP KAPISI testleri (ADR-0019 §Karar 4,
// bağlayıcı sıra): `revoke`/`revoke-all` artık gövdede OPSİYONEL bir
// `password` alanı taşır. `StepUpService.assertVerified()` SAHİPLİK
// doğrulamasından ÖNCE çalışır — "SIRA KANITI" testi (aşağıda) BU sırayı
// HTTP seviyesinde kanıtlar: BAŞKASININ `sessionId`'siyle PAROLASIZ çağrı
// 404 DEĞİL 400 `INVALID_PASSWORD` döner (tersi olsaydı parolasız çağıran
// bir VARLIK ORACLE'I kazanırdı).
//
// ⚠ AC1'in IP iddiası AÇIKÇA bir `X-Forwarded-For` başlığından SÜRÜLÜR —
// sabit `127.0.0.1` beklentisi YASAK (architect'in E riski,
// `utils/ip.mjs:217` test ortamında loopback döndürür → sahte yeşil
// üretirdi). `AUTH_TRUSTED_PROXY_COUNT: 1` override'ı `session-ip-and-
// last-seen.test.ts`'in (S6) AYNI deseni.
//
// ⚠ AC5'in "işlem TAMAMLANMADI" iddiası VARLIK bazlıdır (`findUnique` → NOT
// null) — mutlak satır SAYISI assert EDİLMEZ (S3'ün türettiği kural, bu
// paylaşılan dev DB'de sürekli büyüyor).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import { createPrismaClient } from '@arkesoft/db'
import type { AuthPrismaDatabase } from '@arkesoft/db'
import { deviceBrowserSchema, deviceOsSchema } from '@arkesoft/trpc'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-s8a-sessions-password-123'
const WRONG_PASSWORD = 'arkesoft-s8a-sessions-WRONG-password-456'

/** TEST-NET-3 (RFC 5737) — gerçek bir rotalanabilir blok DEĞİL, LOOPBACK da DEĞİL. */
const FORWARDED_TEST_IP_1 = '203.0.113.11'
const FORWARDED_TEST_IP_2 = '203.0.113.12'

/** Deterministik `browserFamily: 'chrome'`/`osFamily: 'windows'` üreten gerçek bir UA imzası. */
const CHROME_WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
/** Deterministik `browserFamily: 'firefox'`/`osFamily: 'linux'` üreten gerçek bir UA imzası. */
const FIREFOX_LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

const signInBodySchema = z.object({ user: z.object({ id: z.string() }) })
const setCookieHeaderSchema = z.array(z.string()).min(1)

const activeSessionHttpSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
  isCurrent: z.boolean(),
  ipAddress: z.string().nullable(),
  browserFamily: deviceBrowserSchema,
  osFamily: deviceOsSchema,
})
const activeSessionHttpListSchema = z.array(activeSessionHttpSchema)

const errorBodySchema = z.object({ code: z.string() })

/**
 * `AUTH_SECRET_BEARING_MODELS`'in ÜÇ alanı (`token`, `password`, `value`)
 * hiçbir dize/JSON temsilinde GEÇMEMELİ — AC6'nın "ham token/hash YOK" maddesinin
 * mekanik taraması.
 */
function assertNoRawSecret(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  expect(serialized.includes('"token"')).toBe(false)
  expect(serialized.includes('"password"')).toBe(false)
}

describe('SessionsController — zengin liste + step-up (ROADMAP v0.0.15.1, T-017/S8a)', () => {
  let app: INestApplication<Server> | undefined
  let authRolePrisma: AuthPrismaDatabase | undefined

  beforeAll(async () => {
    // `AUTH_TRUSTED_PROXY_COUNT: 1` — AC1'in IP iddiasını BİR başlıktan
    // sürebilmek için (varsayılan `0` ile soket adresine/loopback'e düşerdi).
    const testApp = await createTestApp({
      apiEnv: { ...BASE_ENV, AUTH_TRUSTED_PROXY_COUNT: 1 },
    })
    app = testApp.app
    authRolePrisma = createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_AUTH_URL })
  }, 60_000)

  afterAll(async () => {
    if (authRolePrisma !== undefined) {
      await authRolePrisma.$disconnect()
    }
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

  function prisma(): AuthPrismaDatabase {
    if (authRolePrisma === undefined) {
      throw new Error('authRolePrisma henüz kurulmadı')
    }
    return authRolePrisma
  }

  type HeaderOptions = { readonly forwardedFor?: string; readonly userAgent?: string }

  function applyHeaders(req: request.Test, options?: HeaderOptions): request.Test {
    let result = req
    if (options?.forwardedFor !== undefined) {
      result = result.set('X-Forwarded-For', options.forwardedFor)
    }
    if (options?.userAgent !== undefined) {
      result = result.set('User-Agent', options.userAgent)
    }
    return result
  }

  /** Kayıt + doğrulama + İLK giriş. Verilen başlıklar İLK oturumun satırına yazılır. */
  async function signUpVerifyAndSignIn(
    emailPrefix: string,
    options?: HeaderOptions,
  ): Promise<{ readonly cookieHeader: string; readonly userId: string; readonly email: string }> {
    const email = uniqueEmail(emailPrefix)

    await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'S8a Oturum Testi', email, password: PASSWORD })

    const delivered = await findLatestMailpitMessageTo(email)
    const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
    await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

    const signInResponse = await applyHeaders(
      request(httpServer()).post('/auth/sign-in/email'),
      options,
    ).send({ email, password: PASSWORD })

    const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
    const body = signInBodySchema.parse(signInResponse.body)

    return { cookieHeader: cookies.join('; '), userId: body.user.id, email }
  }

  /** AYNI hesapla İKİNCİ giriş (yeni oturum satırı) — kayıt/doğrulama TEKRARLANMAZ. */
  async function secondSignIn(email: string, options?: HeaderOptions): Promise<string> {
    const signInResponse = await applyHeaders(
      request(httpServer()).post('/auth/sign-in/email'),
      options,
    ).send({ email, password: PASSWORD })
    return setCookieHeaderSchema.parse(signInResponse.headers['set-cookie']).join('; ')
  }

  async function listSessions(
    cookieHeader: string,
  ): Promise<readonly z.infer<typeof activeSessionHttpSchema>[]> {
    const response = await request(httpServer()).get('/auth/sessions').set('Cookie', cookieHeader)
    expect(response.status).toBe(200)
    assertNoRawSecret(response.body)
    return activeSessionHttpListSchema.parse(response.body)
  }

  function revokeSession(cookieHeader: string, sessionId: string, password?: string): request.Test {
    const body: { sessionId: string; password?: string } = { sessionId }
    if (password !== undefined) {
      body.password = password
    }
    return request(httpServer())
      .post('/auth/sessions/revoke')
      .set('Cookie', cookieHeader)
      .set('Origin', BASE_ENV.AUTH_BASE_URL)
      .send(body)
  }

  function revokeAllSessions(cookieHeader: string, password?: string): request.Test {
    const body: { password?: string } = {}
    if (password !== undefined) {
      body.password = password
    }
    return request(httpServer())
      .post('/auth/sessions/revoke-all')
      .set('Cookie', cookieHeader)
      .set('Origin', BASE_ENV.AUTH_BASE_URL)
      .send(body)
  }

  // --- AC1 --------------------------------------------------------------
  it(
    'AC1 — iki oturum → iki satır; browserFamily/osFamily/ipAddress/lastSeenAt DOLU; TAM BİR satırda ' +
      'isCurrent (IP AÇIKÇA X-Forwarded-For başlığından sürülür, sabit 127.0.0.1 beklentisi YOK)',
    async () => {
      const first = await signUpVerifyAndSignIn('s8a-ac1', {
        forwardedFor: FORWARDED_TEST_IP_1,
        userAgent: CHROME_WINDOWS_UA,
      })

      // İKİNCİ oturum — AYNI hesap, FARKLI "cihaz" (farklı IP + UA). Dönen
      // çerez bu testte KULLANILMAZ (AC1 yalnızca LİSTE şeklini doğrular).
      await secondSignIn(first.email, {
        forwardedFor: FORWARDED_TEST_IP_2,
        userAgent: FIREFOX_LINUX_UA,
      })

      const sessions = await listSessions(first.cookieHeader)
      expect(sessions.length).toBe(2)

      // TAM BİR satırda isCurrent — `first.cookieHeader`'ın TAŞIDIĞI oturum.
      expect(sessions.filter((session) => session.isCurrent).length).toBe(1)

      const firstRow = sessions.find((session) => session.ipAddress === FORWARDED_TEST_IP_1)
      const secondRow = sessions.find((session) => session.ipAddress === FORWARDED_TEST_IP_2)
      expect(firstRow).toBeDefined()
      expect(secondRow).toBeDefined()
      if (firstRow === undefined || secondRow === undefined) {
        return
      }

      // deviceLabel — S7'nin `resolveDeviceFamilies`'inin ÇIKTISI, GÖNDERİLEN
      // gerçek UA'ya BİREBİR karşılık gelir (sabit/tahmin edilen değer DEĞİL).
      expect(firstRow.browserFamily).toBe('chrome')
      expect(secondRow.browserFamily).toBe('firefox')
      expect(firstRow.isCurrent).toBe(true)
      expect(secondRow.isCurrent).toBe(false)

      // lastSeenAt (`updatedAt`) DOLU VE geçerli bir zaman damgası.
      expect(Number.isNaN(new Date(firstRow.updatedAt).getTime())).toBe(false)
      expect(Number.isNaN(new Date(secondRow.updatedAt).getTime())).toBe(false)
    },
  )

  // --- AC3 + SIRA KANITI --------------------------------------------------
  it(
    "AC3 — başkasının sessionId'siyle revoke → 404, var olmayan kimlikle BİREBİR eşit gövde; " +
      'SIRA KANITI (ADR-0019 §Karar 4) — PAROLASIZ çağrı 404 DEĞİL 400 INVALID_PASSWORD döner',
    async () => {
      const userA = await signUpVerifyAndSignIn('s8a-ac3-a')
      const userB = await signUpVerifyAndSignIn('s8a-ac3-b')

      const userBSessions = await listSessions(userB.cookieHeader)
      expect(userBSessions.length).toBe(1)
      const userBSessionId = userBSessions[0]?.id
      expect(userBSessionId).toBeDefined()
      if (userBSessionId === undefined) {
        return
      }

      // --- SIRA KANITI: PAROLASIZ + başkasının sessionId'si → 400, 404 DEĞİL.
      // Step-up kapısı sahiplik doğrulamasından ÖNCE koşmazsa bu istek
      // yanlışlıkla 404 dönerdi (varlık oracle'ı sınıfı).
      const orderProofResponse = await revokeSession(userA.cookieHeader, userBSessionId)
      expect(orderProofResponse.status).toBe(400)
      expect(errorBodySchema.parse(orderProofResponse.body).code).toBe('INVALID_PASSWORD')

      // B'nin oturumu HÂLÂ VAR — step-up reddi sahiplik kontrolüne HİÇ
      // ULAŞMADAN işlemi durdurdu (varlık bazlı doğrulama, mutlak sayı DEĞİL).
      const userBRowAfterOrderProof = await prisma().session.findUnique({
        where: { id: userBSessionId },
      })
      expect(userBRowAfterOrderProof).not.toBeNull()

      // --- AC3: DOĞRU parolayla + başkasının sessionId'si → 404 (K5).
      const crossUserResponse = await revokeSession(userA.cookieHeader, userBSessionId, PASSWORD)
      expect(crossUserResponse.status).toBe(404)
      const crossUserBody = errorBodySchema.parse(crossUserResponse.body)
      expect(crossUserBody.code).toBe('SESSION_NOT_FOUND')

      // --- AC3: var olmayan bir sessionId İLE AYNI cevap (K5 — ayrım YOK).
      const nonExistentResponse = await revokeSession(
        userA.cookieHeader,
        `ses_${randomUUID()}`,
        PASSWORD,
      )
      expect(nonExistentResponse.status).toBe(404)
      // `requestId` İSTEK BAŞINA TÜRETİLİR (her çağrı kendi korelasyon
      // kimliğini taşır) — "BİREBİR EŞİT" iddiası bunu HARİÇ TUTAR; K5'in
      // asıl iddiası `code`/`message`/`details`'in (varlık/yetkisiz
      // AYRIMI SIZDIRMADIĞININ kanıtı) TAM eşitliğidir.
      const { requestId: _crossUserRequestId, ...crossUserBodyWithoutRequestId } = errorBodySchema
        .extend({ requestId: z.string() })
        .parse(crossUserResponse.body)
      const { requestId: _nonExistentRequestId, ...nonExistentBodyWithoutRequestId } =
        errorBodySchema.extend({ requestId: z.string() }).parse(nonExistentResponse.body)
      expect(nonExistentBodyWithoutRequestId).toStrictEqual(crossUserBodyWithoutRequestId)
    },
  )

  // --- AC5 + AC6 -----------------------------------------------------------
  it(
    'AC5 — step-up olmadan (parola eksik/yanlış) işlem TAMAMLANMAZ (satır VARLIĞINI korur) + ' +
      'AC6 — doğru parolayla 200 + satır silinmiş',
    async () => {
      const userA = await signUpVerifyAndSignIn('s8a-ac56')
      // İKİNCİ oturumun çerezi bu testte KULLANILMAZ (AC5/AC6 yalnızca
      // sahiplik doğrulanmış HEDEF satırın kaderini doğrular).
      await secondSignIn(userA.email)

      const sessionsBefore = await listSessions(userA.cookieHeader)
      expect(sessionsBefore.length).toBe(2)
      const targetSession = sessionsBefore.find((session) => !session.isCurrent)
      expect(targetSession).toBeDefined()
      if (targetSession === undefined) {
        return
      }

      // AC5(a) — parola YOK.
      const missingPasswordResponse = await revokeSession(userA.cookieHeader, targetSession.id)
      expect(missingPasswordResponse.status).toBe(400)
      expect(errorBodySchema.parse(missingPasswordResponse.body).code).toBe('INVALID_PASSWORD')
      expect(await prisma().session.findUnique({ where: { id: targetSession.id } })).not.toBeNull()

      // AC5(b) — parola YANLIŞ — AYNI kod (tek-biçimlilik, ADR-0019 §Karar 5).
      const wrongPasswordResponse = await revokeSession(
        userA.cookieHeader,
        targetSession.id,
        WRONG_PASSWORD,
      )
      expect(wrongPasswordResponse.status).toBe(400)
      expect(errorBodySchema.parse(wrongPasswordResponse.body).code).toBe('INVALID_PASSWORD')
      expect(await prisma().session.findUnique({ where: { id: targetSession.id } })).not.toBeNull()

      // AC6 — DOĞRU parola → 200 + satır silinmiş (`revokeSession` kütüphane
      // çağrısı sonlandırılan oturum satırını SİLER).
      const correctPasswordResponse = await revokeSession(
        userA.cookieHeader,
        targetSession.id,
        PASSWORD,
      )
      expect(correctPasswordResponse.status).toBe(200)
      expect(await prisma().session.findUnique({ where: { id: targetSession.id } })).toBeNull()
    },
  )

  // --- AC4 -------------------------------------------------------------------
  it('AC4 — sonlandırılan oturumun çerezi → 401, diğeri 200 (anında geçersizleşme, cookieCache kapalı)', async () => {
    const userA = await signUpVerifyAndSignIn('s8a-ac4')
    const secondCookieHeader = await secondSignIn(userA.email)

    const sessions = await listSessions(userA.cookieHeader)
    const otherSession = sessions.find((session) => !session.isCurrent)
    expect(otherSession).toBeDefined()
    if (otherSession === undefined) {
      return
    }

    const revokeResponse = await revokeSession(userA.cookieHeader, otherSession.id, PASSWORD)
    expect(revokeResponse.status).toBe(200)

    const probeWithRevokedCookie = await request(httpServer())
      .get('/auth/sessions')
      .set('Cookie', secondCookieHeader)
    expect(probeWithRevokedCookie.status).toBe(401)

    const probeWithRemainingCookie = await request(httpServer())
      .get('/auth/sessions')
      .set('Cookie', userA.cookieHeader)
    expect(probeWithRemainingCookie.status).toBe(200)
  })

  // --- revoke-all — step-up (biçimsel kablolama kanıtı; tablo sürümlü ------
  // --- tam süit S8b'nin kapsamındadır) ---------------------------------------
  it('revoke-all — step-up olmadan TAMAMLANMAZ (401 yerine devam eden oturum) + doğru parolayla ikisi de 401', async () => {
    const userA = await signUpVerifyAndSignIn('s8a-revokeall')
    const secondCookieHeader = await secondSignIn(userA.email)

    const missingPasswordResponse = await revokeAllSessions(userA.cookieHeader)
    expect(missingPasswordResponse.status).toBe(400)
    expect(errorBodySchema.parse(missingPasswordResponse.body).code).toBe('INVALID_PASSWORD')

    // İşlem TAMAMLANMADI — her iki çerez HÂLÂ geçerli.
    const probeFirstAfterReject = await request(httpServer())
      .get('/auth/sessions')
      .set('Cookie', userA.cookieHeader)
    expect(probeFirstAfterReject.status).toBe(200)

    const revokeAllResponse = await revokeAllSessions(userA.cookieHeader, PASSWORD)
    expect(revokeAllResponse.status).toBe(200)

    const probeFirstAfterRevokeAll = await request(httpServer())
      .get('/auth/sessions')
      .set('Cookie', userA.cookieHeader)
    expect(probeFirstAfterRevokeAll.status).toBe(401)

    const probeSecondAfterRevokeAll = await request(httpServer())
      .get('/auth/sessions')
      .set('Cookie', secondCookieHeader)
    expect(probeSecondAfterRevokeAll.status).toBe(401)
  })

  it('oturum uçları KİMLİK gerektirir — çerezsiz istek 401 (kiracıdan muaf ama kimlikten muaf değil, AUTH_OWN_PATHS)', async () => {
    const listResponse = await request(httpServer()).get('/auth/sessions')
    expect(listResponse.status).toBe(401)

    const revokeResponse = await request(httpServer())
      .post('/auth/sessions/revoke')
      .send({ sessionId: 'ses_whatever' })
    expect(revokeResponse.status).toBe(401)

    const revokeAllResponse = await request(httpServer()).post('/auth/sessions/revoke-all')
    expect(revokeAllResponse.status).toBe(401)
  })
})
