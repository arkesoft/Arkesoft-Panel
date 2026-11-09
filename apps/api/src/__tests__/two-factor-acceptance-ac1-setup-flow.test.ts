// @arkesoft/api — AC1: TOTP kurulum akışı UÇTAN UCA (ROADMAP v0.0.15,
// T-016/S11, kabul kriteri testleri)
//
// Akış: `enable` → `get-totp-uri` → TOTP üret (S4'ün `totp-code-generator.port`'u,
// `auth.api.generateTOTP` DEĞİL — o port `serverOnly`, HTTP router'a hiç
// kaydolmaz, bkz. `totp-code-generator.port.ts` dosya başı yorumu) →
// `verify-totp` → 200 + oturum çerezi.
//
// ASSERT (handoff bağlayıcı): `two_factor` satırı 0→1 VE `app_user.
// twoFactorEnabled` false→true. `two_factor` PLATFORM SEVİYESİ bir tablodur
// (`tenant_id` TAŞIMAZ) ve `arkesoft_app` (DATABASE_URL, PrismaService.db) bu
// tabloda YETKİSİZDİR (T-015) — bu yüzden bu dosya `DATABASE_AUTH_URL`/
// `arkesoft_auth` rolüyle AYRI bir okuma istemcisi kurar
// (`two-factor-plugin-live.test.ts`'in AYNI deseni, dosya başı yorumu).
//
// YAKIN-IŞKA (ADR-0014): (a) pencere DIŞI bir TOTP kodu (±1×30s penceresinin
// ÇOK dışında, `timeOffsetSeconds: 300` — `@better-auth/utils/otp.mjs`'in
// `verifyTOTP` varsayılanı `window=1`, ölçüldü aşağıdaki dosya başı atıfıyla)
// REDDEDİLİR; (b) yanlış 6 hane REDDEDİLİR. İkisi de `code: 'INVALID_CODE'`
// döner — status TEK BAŞINA bu AC'nin "ayırt edilebilir kod" şartını
// KARŞILAMAZ, bu yüzden HER assert `code` alanını OKUR.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import { createPrismaClient } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-ac1-setup-flow-password-123'

const totpUriSchema = z.object({
  method: z.literal('totp'),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})
const betterAuthErrorBodySchema = z.object({ code: z.string(), message: z.string() })

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

const setCookieHeaderSchema = z.array(z.string()).min(1)

describe('AC1 — TOTP kurulum akışı uçtan uca (gerçek Postgres + gerçek HTTP + gerçek Mailpit)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined
  let prismaService: PrismaService
  /** `arkesoft_auth` rolüyle kurulan AYRI okuma istemcisi — `two_factor` tablosu İÇİN ZORUNLU (T-015). */
  let authRolePrisma: ReturnType<typeof createPrismaClient>

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    authRolePrisma = createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_AUTH_URL })
  }, 60_000)

  afterAll(async () => {
    await authRolePrisma.$disconnect()
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
    'enable → get-totp-uri → TOTP doğrula → 200 + çerez; two_factor satırı 0→1, ' +
      'twoFactorEnabled false→true; pencere-dışı VE yanlış kod INVALID_CODE (ayırt edilebilir code)',
    async () => {
      const email = uniqueEmail('ac1-setup')

      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'AC1 Kurulum Testi', email, password: PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
      const signInUser = z.object({ user: z.object({ id: z.string() }) }).parse(signInResponse.body)
      const userId = signInUser.user.id
      const sessionCookiePair = toCookiePair(
        firstSetCookie(setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])),
      )

      // ÖN DURUM (RAPORA GİRER) — `enable`'DAN ÖNCE: satır YOK, bayrak false.
      const beforeTwoFactorCount = await authRolePrisma.twoFactor.count({ where: { userId } })
      const beforeUser = await prismaService.db.user.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true },
      })
      expect(beforeTwoFactorCount).toBe(0)
      expect(beforeUser?.twoFactorEnabled).toBe(false)

      // `enable` — Better Auth KAYNAĞI (`plugins/two-factor/index.mjs`, bu
      // dosyanın hazırlığı sırasında OKUNDU): `two_factor` satırı BURADA
      // oluşur (`verified: false`), `twoFactorEnabled` HENÜZ DEĞİŞMEZ.
      const enableResponse = await request(httpServer())
        .post('/auth/two-factor/enable')
        .set('Cookie', sessionCookiePair)
        .send({ password: PASSWORD, method: 'totp' })
      expect(enableResponse.status).toBe(200)
      const { totpURI, backupCodes } = totpUriSchema.parse(enableResponse.body)
      expect(backupCodes.length).toBeGreaterThan(0)
      const base32Secret = extractBase32SecretFromTotpUri(totpURI)

      // ARA DURUM — satır VAR ama bayrak HÂLÂ false (enable, confirm DEĞİL).
      const afterEnableCount = await authRolePrisma.twoFactor.count({ where: { userId } })
      const afterEnableUser = await prismaService.db.user.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true },
      })
      expect(afterEnableCount).toBe(1)
      expect(afterEnableUser?.twoFactorEnabled).toBe(false)

      // `get-totp-uri` — AYNI secret'i BAĞIMSIZ bir uçtan teyit eder (parola GEREKTİRİR).
      const getUriResponse = await request(httpServer())
        .post('/auth/two-factor/get-totp-uri')
        .set('Cookie', sessionCookiePair)
        .send({ password: PASSWORD })
      expect(getUriResponse.status).toBe(200)
      const { totpURI: confirmedURI } = z.object({ totpURI: z.string() }).parse(getUriResponse.body)
      expect(extractBase32SecretFromTotpUri(confirmedURI)).toBe(base32Secret)

      // YAKIN-IŞKA (a) — pencere DIŞI kod (300 sn ≈ 10 periyot ötede,
      // `window=1`'in ±30s'lik toleransının ÇOK dışında) REDDEDİLİR.
      const outOfWindowCode = await generateTotpCode({ base32Secret, timeOffsetSeconds: 300 })
      const outOfWindowResult = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', sessionCookiePair)
        .send({ code: outOfWindowCode })
      expect(outOfWindowResult.status).toBe(401)
      expect(betterAuthErrorBodySchema.parse(outOfWindowResult.body).code).toBe('INVALID_CODE')

      // YAKIN-IŞKA (b) — yanlış 6 hane REDDEDİLİR, AYNI `code`.
      const wrongCodeResult = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', sessionCookiePair)
        .send({ code: '000000' })
      expect(wrongCodeResult.status).toBe(401)
      expect(betterAuthErrorBodySchema.parse(wrongCodeResult.body).code).toBe('INVALID_CODE')

      // Yakın-ışkalar SONRASI durum HÂLÂ değişmedi — iki reddin İKİSİ de
      // hiçbir yan etki üretmedi (satır sayısı/bayrak aynı).
      expect(await authRolePrisma.twoFactor.count({ where: { userId } })).toBe(1)
      expect(
        (
          await prismaService.db.user.findUnique({
            where: { id: userId },
            select: { twoFactorEnabled: true },
          })
        )?.twoFactorEnabled,
      ).toBe(false)

      // DOĞRU kod — 200 + oturum çerezi.
      const correctCode = await generateTotpCode({ base32Secret })
      const correctResult = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', sessionCookiePair)
        .send({ code: correctCode })
      expect(correctResult.status).toBe(200)
      const correctSetCookie = setCookieHeaderSchema.parse(correctResult.headers['set-cookie'])
      expect(correctSetCookie.length).toBeGreaterThan(0)

      // SON DURUM (RAPORA GİRER) — satır HÂLÂ 1 (0→1, İKİNCİ satır YOK),
      // bayrak false→true.
      expect(await authRolePrisma.twoFactor.count({ where: { userId } })).toBe(1)
      const afterConfirmUser = await prismaService.db.user.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true },
      })
      expect(afterConfirmUser?.twoFactorEnabled).toBe(true)
    },
    30_000,
  )
})
