// @arkesoft/api — GERÇEK HTTP zincirinde kanıt: `/auth/two-factor/verify-totp`
// `AuthGuard` tarafından KESİLMEZ (ROADMAP v0.0.15, T-016/S5, madde 4)
//
// ⚠⚠ S4'ÜN BAĞLAYICI ÖLÇÜMÜNÜN (`two-factor-plugin-live.test.ts` dosya başı
// yorumu) bu alt görevde KAPATILAN kısmı: S4 `auth.handler()`'ı DOĞRUDAN
// çağırmıştı (o anda `/two-factor/*` allowlist'te YOKTU, Nest'in HTTP
// katmanından geçilemezdi). Bu dosya AYNI akışı GERÇEK Nest HTTP sunucusu +
// `supertest` üzerinden koşturur (`createTestApp()`, `auth-sessions.test.ts`
// ile AYNI desen) — `AuthGuard`'ın küresel (`APP_GUARD`) zincirinden GERÇEKTEN
// geçerek `/auth/two-factor/verify-totp`'un Better Auth'a ULAŞTIĞINI (401
// `UNAUTHENTICATED` DEĞİL, Better Auth'un KENDİ `INVALID_CODE`'u) kanıtlar.
//
// İKİ 401'İN AYRIMI GÖVDEDEKİ `code` İLEDİR, DURUM KODUYLA DEĞİL:
//   - `AuthGuard`'ın kestiği istek → `UnauthenticatedError` → gövde
//     `{ code: 'UNAUTHENTICATED', ... }` (`app-exception.filter.ts`).
//   - Better Auth'a ULAŞAN ama YANLIŞ kodlu istek → Better Auth'un KENDİ
//     yanıtı → gövde `{ code: 'INVALID_CODE', message: ... }`
//     (`two-factor-plugin-live.test.ts`'in ÖLÇTÜĞÜ AYNI gövde).
// Bu dosya HER İKİ dalı da (YANLIŞ kod → INVALID_CODE, DOĞRU kod → 200) test
// eder — yalnızca durum koduna bakan bir assert bu ikisini AYIRT EDEMEZ
// (handoff'un uyarısı, bağlayıcı).
//
// "(ii) mutasyon" hücresi (madde 4) BU dosyaya YAZILMADI — kalıcı bir test
// üretim kodunu kasıtlı KIRAMAZ (bir sonraki çalıştırmada regresyon
// korumasını KAYBEDER). O hücre elle: `auth-exempt-paths.ts`'teki iki satır
// GEÇİCİ olarak silinip BU dosyanın "YANLIŞ kod" testi TEK BAŞINA koşturuldu,
// ham çıktı raporlandı, SONRA `git diff` ile birebir geri alındığı kanıtlandı
// (bkz. handoff raporu "GERÇEK HTTP ZİNCİRİ KANITI" bölümü).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-s5-two-factor-http-password-123'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

const totpUriSchema = z.object({
  method: z.literal('totp'),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})

const betterAuthErrorBodySchema = z.object({ code: z.string(), message: z.string() })

/** `auth-sessions.test.ts`'in AYNI şeması — supertest'in `headers['set-cookie']`'i dış veridir, `any` DEĞİL Zod ile parse edilir. */
const setCookieHeaderSchema = z.array(z.string()).min(1)

/** `otpauth://totp/...?secret=BASE32...`'den Base32 anahtarı çıkarır. */
function extractBase32SecretFromTotpUri(totpURI: string): string {
  return extractQueryParam(totpURI, 'secret')
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

describe('GERÇEK HTTP zinciri — /auth/two-factor/verify-totp AuthGuard tarafından KESİLMEZ', () => {
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
    'exempt EKLENMİŞ hâliyle (cell i): kayıt → doğrula → giriş → 2FA kur+onayla → ' +
      'YENİ challenge → YANLIŞ kod HTTP üzerinden 401 INVALID_CODE (UNAUTHENTICATED DEĞİL) · ' +
      'DOĞRU kod 200',
    async () => {
      const email = uniqueEmail('s5-http-chain')
      await deleteAllMailpitMessages()

      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S5 HTTP Zinciri Testi', email, password: PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

      const firstSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
      const sessionCookieHeader = setCookieHeaderSchema.parse(firstSignIn.headers['set-cookie'])
      const firstSessionCookieValue = sessionCookieHeader[0]
      if (firstSessionCookieValue === undefined) {
        throw new Error('ilk girişten Set-Cookie alınamadı')
      }
      const sessionCookiePair = toCookiePair(firstSessionCookieValue)

      // 2FA kur — `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS` üyesi, oturum ZORUNLU.
      const enableResponse = await request(httpServer())
        .post('/auth/two-factor/enable')
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .set('Cookie', sessionCookiePair)
        .send({ password: PASSWORD, method: 'totp' })
      expect(enableResponse.status).toBe(200)
      const { totpURI } = totpUriSchema.parse(enableResponse.body)
      const base32Secret = extractBase32SecretFromTotpUri(totpURI)

      // Onayla (oturum AÇIKKEN) — `verify-totp` AYRICA exempt, ama burada
      // zaten normal oturum çerezi mevcut (iki farklı yoldan erişilebilirlik,
      // aynı uç).
      const confirmCode = await generateTotpCode({ base32Secret })
      const confirmResponse = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .set('Cookie', sessionCookiePair)
        .send({ code: confirmCode })
      expect(confirmResponse.status).toBe(200)

      // YENİ bir challenge için YENİ bir sign-in — bu noktadan sonra çağıranın
      // elinde NORMAL oturum çerezi YOK, yalnızca `two_factor` challenge
      // çerezi var (handoff'un ⚠⚠ bağlayıcı ölçümü).
      const challengeSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
      const challengeCookieHeader = setCookieHeaderSchema.parse(
        challengeSignIn.headers['set-cookie'],
      )
      const twoFactorCookieEntry = findSetCookie(challengeCookieHeader, 'two_factor')
      if (twoFactorCookieEntry === undefined) {
        throw new Error(
          `two_factor çerezi bulunamadı — gözlenen Set-Cookie adları: ${challengeCookieHeader.join(' | ')}`,
        )
      }
      const twoFactorCookiePair = toCookiePair(twoFactorCookieEntry)

      // ASIL KANIT (madde 4-i) — yalnızca `two_factor` challenge çerezi
      // taşıyarak, normal oturum OLMADAN, GERÇEK HTTP sunucusu üzerinden
      // `/auth/two-factor/verify-totp`'u YANLIŞ kodla çağır. `AuthGuard`
      // kesiyor olsaydı 401 `UNAUTHENTICATED` dönerdi (`UnauthenticatedError`,
      // Better Auth'a HİÇ ulaşılmaz) — RAPORA GİREN ham sonuç BUNUN YERİNE
      // Better Auth'un KENDİ `INVALID_CODE`'udur.
      const wrongCodeResponse = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .set('Cookie', twoFactorCookiePair)
        .send({ code: '000000' })

      expect(wrongCodeResponse.status).toBe(401)
      const wrongBody = betterAuthErrorBodySchema.parse(wrongCodeResponse.body)
      // ⚠ İKİ 401'İ AYIRAN TEK ALAN — durum kodu HER İKİ dalda da 401'dir.
      expect(wrongBody.code).toBe('INVALID_CODE')
      expect(wrongBody.code).not.toBe('UNAUTHENTICATED')

      // DOĞRU kod (AYNI challenge çerezi, henüz tüketilmedi) — 200 + oturum.
      const correctCode = await generateTotpCode({ base32Secret })
      const correctResponse = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .set('Cookie', twoFactorCookiePair)
        .send({ code: correctCode })

      expect(correctResponse.status).toBe(200)
      const correctSetCookie = setCookieHeaderSchema.parse(correctResponse.headers['set-cookie'])
      expect(correctSetCookie.length).toBeGreaterThan(0)
    },
    20_000,
  )

  it(
    'HİÇBİR çerez taşımayan çağrı DA Better Auth’a ULAŞIR — exempt YAZIM OLARAK ' +
      '`AuthContextMiddleware.use()`’un KENDİSİNİ (getSession() HİÇ ÇAĞRILMAZ) atlıyor, ' +
      'bu yüzden gövde UNAUTHENTICATED DEĞİL, Better Auth’un KENDİ ' +
      'INVALID_TWO_FACTOR_COOKIE’sidir (ÖLÇÜLEN DÜZELTME — aşağıdaki yorum)',
    async () => {
      const response = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .send({ code: '000000' })

      // ÖLÇÜLEN DÜZELTME (bu test İLK yazıldığında `UNAUTHENTICATED`
      // bekleniyordu — YANLIŞ varsayım, kaynağa BAKMADAN yazılmıştı):
      // `AuthContextMiddleware.use()` (`auth-context.middleware.ts`)
      // `isAuthExemptPath(req.url)` DOĞRUYSA `context.auth = {kind:'exempt'}`
      // yazıp HEMEN `next()` çağırır — `authSessionReader.getSession()`
      // bu dalda HİÇ ÇAĞRILMAZ (çerez olsun/olmasın FARK ETMEZ). `AuthGuard`
      // `exempt` dalında KOŞULSUZ `true` döner. İstek bu yüzden HER ZAMAN
      // Better Auth'a ULAŞIR; Better Auth'un KENDİ `verifyTwoFactor()`'ı
      // (`verify-two-factor.mjs`) `two_factor` çerezini ARAR, YOKSA KENDİ
      // `INVALID_TWO_FACTOR_COOKIE`'sini (401) fırlatır — `AuthGuard`'ın
      // `UnauthenticatedError`'ı (`UNAUTHENTICATED`) DEĞİL. Bu, exempt
      // eklemenin iddia edilen etkisinin GERÇEKTEN gerçekleştiğinin üçüncü
      // kanıtıdır: `UNAUTHENTICATED` kodu bu uç için YAPISAL OLARAK
      // ÜRETİLEMEZ artık (`AuthGuard`'a hiç uğramıyor).
      expect(response.status).toBe(401)
      const body = betterAuthErrorBodySchema.parse(response.body)
      expect(body.code).toBe('INVALID_TWO_FACTOR_COOKIE')
      expect(body.code).not.toBe('UNAUTHENTICATED')
    },
  )
})
