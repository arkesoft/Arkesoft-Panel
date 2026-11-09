// @arkesoft/api — AC2: sign-in 2FA yönlendirmesi ÜÇ KARŞITLIK AYNI TESTTE
// (ROADMAP v0.0.15, T-016/S11, kabul kriteri testleri)
//
// ⭐ BU DOSYANIN BELİRLEYİCİ İDDİASI (handoff bağlayıcı): "200'e dönmeyen bir
// 401 hiçbir şey kanıtlamaz." Üç karşıtlık TEK testte:
//   (i)   doğru parola + 2FA KAPALI  → 200 + oturum çerezi (KONTROL — ortam
//         sorunu YOK kanıtı: aynı kullanıcı sınıfı, aynı akış, farklı bayrak).
//   (ii)  YANLIŞ parola + 2FA AÇIK   → `twoFactorRedirect` DEĞİL,
//         `INVALID_EMAIL_OR_PASSWORD` (parola kontrolü 2FA dalından ÖNCE).
//   (iii) doğru parola + 2FA AÇIK    → gövdede `twoFactorRedirect === true`
//         VE `Set-Cookie`'de OTURUM çerezi YOK; O ÇEREZ KABIYLA korumalı bir
//         uca (`/auth/sessions`) erişim 401; AMA asıl KANIT `verify-totp`
//         SONRASI AYNI uca erişimin 200 OLMASIDIR — ⭐ belirleyici olan bu.
//
// PİNLENEN OLGU (confound eleme, ÖLÇÜLMÜŞ — handoff bağlayıcı): Better
// Auth'un KENDİ `rateLimit` seçeneği `auth-instance.ts`'te `{ enabled: false }`
// olarak AÇIKÇA kapatılmıştır (platformun KENDİ `RateLimitGuard`'ı ayrı bir
// katmandır) — bu yüzden aşağıdaki 401/200 sonuçları Better Auth'un KENDİ
// oran sınırlayıcısının bir YAN ETKİSİ OLAMAZ. Bu bir yorum DEĞİL, mekanik
// bir grep assert'idir (aşağıda).

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Server } from 'node:http'

import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const PASSWORD = 'arkesoft-ac2-login-redirect-password-123'
const WRONG_PASSWORD = 'arkesoft-ac2-WRONG-password-999'

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

/** Bir Set-Cookie listesinde, belirli bir ÖN EKLE başlayan İLK girdiyi (daraltılmış) bulur. */
function findSetCookieOrThrow(setCookies: readonly string[], namePrefix: string): string {
  const entry = setCookies.find((item) => item.startsWith(`${namePrefix}=`))
  if (entry === undefined) {
    throw new Error(
      `${namePrefix} ön ekli Set-Cookie bulunamadı — gözlenen: ${setCookies.join(' | ')}`,
    )
  }
  return entry
}

/**
 * Bir Set-Cookie listesinde AKTİF (silinmeyen) bir oturum çerezinin
 * (`better-auth.session_token`) VAR OLUP OLMADIĞINI belirler.
 *
 * ⚠ ÖLÇÜLDÜ: 2FA AÇIK + doğru parola sign-in yanıtı `session_token`'ı DA
 * döner — ama SİLME niyetiyle (`Max-Age=0`, boş değer): üç çerez
 * `[session_token (Max-Age=0), session_data (Max-Age=0), two_factor
 * (Max-Age=600)]` (handoff'un bağlayıcı ölçümü, birebir). Bu yüzden
 * `startsWith('better-auth.session_token=')` TEK BAŞINA YANLIŞ POZİTİF
 * üretir — AYRICA `Max-Age=0` İÇERMEDİĞİNİ kontrol etmek GEREKİR (gerçek,
 * yaşayan bir oturum çerezi `Max-Age=604800` taşır, S4'ün ölçümü).
 */
function hasSessionCookie(setCookies: readonly string[]): boolean {
  return setCookies.some(
    (entry) => entry.startsWith('better-auth.session_token=') && !entry.includes('Max-Age=0'),
  )
}

async function signUpAndVerify(httpServer: Server, emailPrefix: string): Promise<string> {
  const email = uniqueEmail(emailPrefix)
  await request(httpServer)
    .post('/auth/sign-up/email')
    .send({ name: 'AC2 Test Kullanıcısı', email, password: PASSWORD })

  const delivered = await findLatestMailpitMessageTo(email)
  const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
  await request(httpServer).get(`/auth/verify-email?token=${encodeURIComponent(token)}`)

  return email
}

describe('AC2 — sign-in 2FA yönlendirmesi: üç karşıtlık AYNI testte (gerçek Postgres + gerçek HTTP)', () => {
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

  it("PİN — auth-instance.ts GERÇEKTEN Better Auth rateLimit'ini kapatıyor (confound mekanik olarak elenir)", () => {
    const sourcePath = fileURLToPath(new URL('../auth/auth-instance.ts', import.meta.url))
    const source = readFileSync(sourcePath, 'utf-8')
    expect(source).toContain('rateLimit: { enabled: false }')
  })

  it(
    'ÜÇ KARŞITLIK: (i) 2FA KAPALI kontrol 200+çerez · (ii) yanlış parola+2FA AÇIK → ' +
      'INVALID_EMAIL_OR_PASSWORD (twoFactorRedirect DEĞİL) · (iii) doğru parola+2FA AÇIK → ' +
      'twoFactorRedirect+oturum çerezi YOK, O kabukla korumalı uç 401, verify-totp SONRASI AYNI uç 200',
    async () => {
      // --- (i) KONTROL: 2FA KAPALI, doğru parola → 200 + oturum çerezi ---
      const controlEmail = await signUpAndVerify(httpServer(), 'ac2-control')
      const controlSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email: controlEmail, password: PASSWORD })

      expect(controlSignIn.status).toBe(200)
      const controlSetCookie = setCookieHeaderSchema.parse(controlSignIn.headers['set-cookie'])
      expect(hasSessionCookie(controlSetCookie)).toBe(true)

      // --- Ortak kurulum: 2FA AÇIK bir kullanıcı ---
      const email = await signUpAndVerify(httpServer(), 'ac2-twofactor')
      const firstSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
      const firstSessionCookie = toCookiePair(
        firstSetCookie(setCookieHeaderSchema.parse(firstSignIn.headers['set-cookie'])),
      )

      const enableResponse = await request(httpServer())
        .post('/auth/two-factor/enable')
        .set('Cookie', firstSessionCookie)
        .send({ password: PASSWORD, method: 'totp' })
      expect(enableResponse.status).toBe(200)
      const { totpURI } = totpUriSchema.parse(enableResponse.body)
      const base32Secret = extractBase32SecretFromTotpUri(totpURI)
      const confirmCode = await generateTotpCode({ base32Secret })
      const confirmResult = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', firstSessionCookie)
        .send({ code: confirmCode })
      expect(confirmResult.status).toBe(200)

      // --- (ii) YANLIŞ parola + 2FA AÇIK → INVALID_EMAIL_OR_PASSWORD ---
      const wrongPasswordSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: WRONG_PASSWORD })

      expect(wrongPasswordSignIn.status).toBe(401)
      const wrongPasswordBody = z
        .object({ code: z.string(), message: z.string() })
        .parse(wrongPasswordSignIn.body)
      expect(wrongPasswordBody.code).toBe('INVALID_EMAIL_OR_PASSWORD')
      // ⚠ Gövdenin TAMAMI `twoFactorRedirect`'ten ARINDIRILMIŞ — parola
      // kontrolü 2FA dalından ÖNCE koşuyor, kullanıcının 2FA'sının AÇIK
      // olduğu bilgisi YANLIŞ parolayla SIZDIRILMIYOR.
      expect(JSON.stringify(wrongPasswordSignIn.body)).not.toContain('twoFactorRedirect')

      // --- (iii) DOĞRU parola + 2FA AÇIK → twoFactorRedirect, OTURUM çerezi YOK ---
      const challengeSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })

      expect(challengeSignIn.status).toBe(200)
      const challengeBody = z
        .object({ twoFactorRedirect: z.literal(true), twoFactorMethods: z.array(z.string()) })
        .parse(challengeSignIn.body)
      expect(challengeBody.twoFactorMethods).toContain('totp')
      const challengeSetCookie = setCookieHeaderSchema.parse(challengeSignIn.headers['set-cookie'])
      expect(hasSessionCookie(challengeSetCookie)).toBe(false)

      const twoFactorCookieEntry = findSetCookieOrThrow(
        challengeSetCookie,
        'better-auth.two_factor',
      )
      const twoFactorCookiePair = toCookiePair(twoFactorCookieEntry)

      // O kabukla (yalnızca challenge çerezi) korumalı bir uca erişim 401.
      const beforeVerifyProtected = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', twoFactorCookiePair)
      expect(beforeVerifyProtected.status).toBe(401)

      // ⭐ BELİRLEYİCİ KANIT: verify-totp SONRASI AYNI korumalı uç 200.
      const correctCode = await generateTotpCode({ base32Secret })
      const verifyResult = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', twoFactorCookiePair)
        .send({ code: correctCode })
      expect(verifyResult.status).toBe(200)
      const verifySetCookie = setCookieHeaderSchema.parse(verifyResult.headers['set-cookie'])
      expect(hasSessionCookie(verifySetCookie)).toBe(true)
      const newSessionCookiePair = toCookiePair(
        findSetCookieOrThrow(verifySetCookie, 'better-auth.session_token'),
      )

      const afterVerifyProtected = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', newSessionCookiePair)
      expect(afterVerifyProtected.status).toBe(200)
      const sessionsBody = z.array(z.object({ id: z.string() })).parse(afterVerifyProtected.body)
      expect(Array.isArray(sessionsBody)).toBe(true)
    },
    30_000,
  )
})
