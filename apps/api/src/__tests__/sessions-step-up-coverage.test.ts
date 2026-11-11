// @arkesoft/api — SENSITIVE_OPERATIONS Kapı #3: kataloğu gezen, tablo
// sürümlü, GERÇEK HTTP testi (ROADMAP v0.0.15.1, T-017/S8b, ADR-0019 §Karar 6
// — "korumasız hassas işlem = test kırmızısı" garantisinin ÜÇÜNCÜ ayağı).
//
// S5'in `sensitive-operations.ts`'i İKİ kapıyı modül YÜKLEME zamanında
// kurar: (a) her değer bilinen bir rotaya karşılık geliyor mu, (b) her
// değer oran sınırı kataloğunda KORUNUYOR mu. Bu dosya ÜÇÜNCÜ kapı: her
// değer GERÇEKTEN, bir HTTP isteğiyle, step-up'ı ZORLUYOR mu — yanlış
// parolayla çağrılan HER ALTI uç 400 `INVALID_PASSWORD` dönmeli.
//
// ⭐ "KATALOĞU GEZEN DÖNGÜ ZORUNLU" (elle altı test YAZILMADI):
// `Object.entries(SENSITIVE_OPERATIONS)` döngüsü aşağıdaki `it.each`'i
// SÜRER — katalog yedinci bir girdiyle BÜYÜRSE bu döngü YENİ girdiyi
// OTOMATİK KAPSAR (elle eklenen `it(...)` blokları BÜYÜMEYİ FARK ETMEZDİ).
//
// ⚠⚠ YAZILI SAPMA (S6'nın ÖLÇÜMÜ, bu testin EKSENİNİ belirler): Better
// Auth'un dört 2FA ucu (`enable`/`disable`/`get-totp-uri`/
// `generate-backup-codes`) `allowPasswordless` BİZDE AYARLANMADIĞI
// (`auth-instance.ts`, varsayılan `false`) için `password` alanını KENDİ
// gövde ŞEMASINDA ZORUNLU tutar (`better-auth/dist/plugins/two-factor/
// {index,totp/index,backup-codes/index}.mjs`, KAYNAK OKUNARAK doğrulandı:
// `z.object({ password: passwordSchema })`, `.optional()` DEĞİL). Bu
// SONUÇ: alanı HİÇ GÖNDERMEMEK bu dört ucta bizim `InvalidPasswordError`
// kodumuzu DEĞİL, kütüphanenin KENDİ şema doğrulama hatasını üretir — "eksik"
// ile "yanlış" burada AYNI kod ALTINDA BULUŞMAZ. Bu BİR GEVŞETME DEĞİL,
// ÖLÇÜLMÜŞ bir kütüphane kısıtı — bu yüzden ALTI-UÇLUK döngü TEK-BİÇİMLİ
// "YANLIŞ PAROLA" ekseninde yazılır (aşağıda); "alan YOK" ekseni AYRI bir
// blokta, YALNIZCA bizim İKİ kendi ucumuz için (`session.revoke`/
// `revokeAll` — `SessionsController`'ın gövde şeması `password:
// z.string().optional()`, ADR-0019 §Karar 4/5, `StepUpService.
// assertVerified()` eksik parolayı da AYNI `InvalidPasswordError`'a eşler).
//
// ⚠⚠ İKİNCİ ÖLÇÜLMÜŞ SAPMA (bu alt görevin KENDİ ölçümü, kaynak okunarak
// doğrulandı — `better-auth/dist/plugins/two-factor/{totp/index,backup-
// codes/index}.mjs`): `get-totp-uri` VE `generate-backup-codes` parola
// kontrolünden ÖNCE bir ÖN KOŞUL arar — `getTOTPURI` kullanıcının `twoFactor`
// SATIRININ VAR OLMASINI ister (yoksa `TOTP_NOT_ENABLED`, parola kontrolüne
// HİÇ ULAŞILMAZ), `generateBackupCodes` `user.twoFactorEnabled === true`
// ister (yoksa `TWO_FACTOR_NOT_ENABLED`). TAZE bir hesapta (hiçbir 2FA
// kurulumu yapılmamış) bu iki uca YANLIŞ parolayla atılan istek 400
// `INVALID_PASSWORD` DEĞİL, bu "henüz kurulmadı" kodlarını döner — bu bir
// GÜVENLİK AÇIĞI DEĞİL (önkoşul kontrolü de bir tür reddir, parola oracle'ı
// KAZANILMAZ) ama bu testin "YANLIŞ parola → INVALID_PASSWORD" iddiasını
// bu İKİ UÇ için YANLIŞ kılar. Düzeltme: `prepareAccountForOperation`
// (aşağıda) bu iki operasyon için GERÇEK bir ön kurulum YAPAR (DOĞRU
// parolayla `enable`, `generateBackupCodes` için AYRICA geçerli bir TOTP
// koduyla `verify-totp`) — döngünün KENDİSİ (hangi operasyonun
// çalıştırıldığı) DEĞİŞMEZ, yalnızca her operasyonun KENDİ ön koşulu
// karşılanır.
//
// ORAN SINIRI SAYACI TÜKENMESİ (ele alındı, handoff'un kısıtı): her katalog
// girdisi `rate-limit.policy.ts`'te `accountScopeSource: 'sessionUserId'`,
// hesap sınırı 5/"login" penceresi — AMA Redis anahtarı `routeKey`'i DE
// taşır (`rate-limit.service.ts:122-131`, `buildScopeKey`), yani HER rotanın
// KENDİ bağımsız hesap+IP kovası vardır. Bu dosya HER katalog girdisi için
// TAZE bir hesap açar (`signUpVerifyAndSignIn`) — o hesabın o rotadaki
// deneme sayısı HER ZAMAN 1/5'tir, asla tükenmez. IP kovası (`ipLimit: 20`,
// AYNI rota-başına izolasyon) bu dosyanın TOPLAM altı+iki çağrısıyla asla
// 20'ye yaklaşmaz; `createTestApp()` AYRICA her çağrıda `platform:auth:*`
// sayaçlarını FLUSH eder (dosya başı yorumu, `create-test-app.ts`).
//
// VACUITY (metodoloji notu, raporda DETAYLANDIRILDI): "kataloğun BÜYÜMESİ
// döngüyü KIRAR mı" sorusu BU DOSYADA `SENSITIVE_OPERATIONS`'ın KENDİSİNİ
// (S5'in dosyası, bu alt görevin KAPSAMI DIŞINDA) GEÇİCİ OLARAK
// DEĞİŞTİREREK DEĞİL, bir ÇALIŞMA KOPYASI (bu dosyanın GEÇİCİ bir taslağı,
// koşturulup SONRA atılan ayrı bir dosya) ÜZERİNDE doğrulandı — paylaşılan,
// ÇOK AJANLI çalışma ağacında S5'in dosyasını (başka ajanların da AYNI ANDA
// okuyabileceği) geçici olarak İÇE AKTARILAMAZ hale getirmenin yan etki
// riskini almamak için. Kanıt: Task raporunda.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { SENSITIVE_OPERATIONS } from '../auth/step-up/sensitive-operations.js'
import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-s8b-step-up-coverage-password-123'
const WRONG_PASSWORD = 'arkesoft-s8b-step-up-coverage-WRONG-456'

/**
 * TEST-NET-2 (RFC 5737) — gerçek bir rotalanabilir blok DEĞİL, LOOPBACK da
 * DEĞİL. Diğer test dosyalarının kullandığı `203.0.113.x` (TEST-NET-3)
 * bloğuyla ÇARPIŞMAZ (ölçüldü — `rg '203\.0\.113\.|198\.51\.100\.'
 * __tests__` bu değerin KULLANILMADIĞINI doğruladı).
 */
const FORWARDED_TEST_IP = '198.51.100.212'

const errorBodySchema = z.object({ code: z.string() })
const signInBodySchema = z.object({ user: z.object({ id: z.string() }) })
const setCookieHeaderSchema = z.array(z.string()).min(1)

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

describe('SENSITIVE_OPERATIONS Kapı #3 — kataloğu gezen gerçek HTTP testi (ROADMAP v0.0.15.1, T-017/S8b)', () => {
  let app: INestApplication<Server> | undefined

  beforeAll(async () => {
    // `AUTH_TRUSTED_PROXY_COUNT: 1` — `session-ip-and-last-seen.test.ts`/
    // `auth-sessions.test.ts`'in (S6/S8a) AYNI deseni: tek-hop'luk
    // `X-Forwarded-For` istemci IP'si sayılır, loopback'e DÜŞÜLMEZ.
    const testApp = await createTestApp({
      apiEnv: { ...BASE_ENV, AUTH_TRUSTED_PROXY_COUNT: 1 },
    })
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

  /**
   * Kayıt → doğrulama → giriş — HER çağrı TAZE bir hesap açar (dosya başı
   * "ORAN SINIRI SAYACI TÜKENMESİ" yorumu: hesap kovası rota-başına İZOLE,
   * taze hesap = her zaman 1/5).
   */
  async function signUpVerifyAndSignIn(
    emailPrefix: string,
  ): Promise<{ readonly cookieHeader: string }> {
    const email = uniqueEmail(emailPrefix)

    await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'S8b Step-Up Kapsamı Testi', email, password: PASSWORD })

    const delivered = await findLatestMailpitMessageTo(email)
    const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
    await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

    const signInResponse = await request(httpServer())
      .post('/auth/sign-in/email')
      .set('X-Forwarded-For', FORWARDED_TEST_IP)
      .send({ email, password: PASSWORD })

    const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
    signInBodySchema.parse(signInResponse.body)

    return { cookieHeader: cookies.join('; ') }
  }

  /**
   * `SENSITIVE_OPERATIONS`'ın bir girdisine karşılık gelen gövdeyi üretir.
   * `session.revoke` TEK özel durum (`sessionId` gerektirir — var olmayan
   * bir kimlik yeterli, çünkü step-up SAHİPLİK doğrulamasından ÖNCE koşar,
   * `sessions.service.ts`'in dosya başı yorumu/`auth-sessions.test.ts`'in
   * "SIRA KANITI"). Katalog yeni bir operasyon adıyla büyürse ve bu
   * fonksiyon güncellenmezse varsayılan `{ password }` gövdesi denenir —
   * döngünün KENDİSİ (aşağıdaki `it.each`) hiçbir koşulda ELLE
   * GÜNCELLENMEZ.
   */
  function buildRequestBody(operation: string, password: string): Record<string, unknown> {
    if (operation === 'session.revoke') {
      return { sessionId: `ses_${randomUUID()}`, password }
    }
    return { password }
  }

  const totpUriSchema = z.object({ totpURI: z.string() })

  /**
   * Dosya başı "İKİNCİ ÖLÇÜLMÜŞ SAPMA" yorumu — `get-totp-uri`/
   * `generate-backup-codes` parola kontrolüne ULAŞMADAN ÖNCE bir 2FA ön
   * koşulu ister. Diğer DÖRT operasyon için NO-OP (taze hesap zaten
   * yeterli, GİRDİ cookieHeader DEĞİŞMEDEN döner) — bu fonksiyon döngünün
   * KENDİSİNİ DEĞİŞTİRMEZ, yalnızca HER operasyonun kendi ön koşulunu
   * GERÇEK isteklerle (DOĞRU parola) kurar.
   *
   * ⚠⚠ ÜÇÜNCÜ ÖLÇÜLMÜŞ SAPMA (kaynak okunarak doğrulandı,
   * `totp/index.mjs:155-168`): `verify-totp`'un "kurulumu TAMAMLA" dalı
   * (`twoFactorEnabled` İLK KEZ `true` olduğunda) ÇAĞIRANIN ESKİ oturumunu
   * SİLER ve YENİ bir oturum/çerez KURAR (`deleteSession` + `setSessionCookie`)
   * — bu NORMAL giriş davranışından FARKLI bir dal (oturum DEĞİŞTİRİLİR,
   * yalnızca bayrak güncellenmez). Bu yüzden `generateBackupCodes` ön
   * koşulu TAMAMLANDIKTAN SONRA ÇAĞIRANA YENİ çerezi DÖNDÜRÜR — eski
   * çerezle devam etmek 400 DEĞİL 401 (oturum artık YOK) üretirdi,
   * TEK-BİÇİMLİLİK iddiasını YANLIŞ ÖLÇERDİ.
   */
  async function prepareAccountForOperation(
    operation: string,
    cookieHeader: string,
  ): Promise<string> {
    if (operation !== 'twoFactor.getTotpUri' && operation !== 'twoFactor.generateBackupCodes') {
      return cookieHeader
    }

    const enableResponse = await request(httpServer())
      .post('/auth/two-factor/enable')
      .set('Cookie', cookieHeader)
      .send({ password: PASSWORD, method: 'totp' })
    const { totpURI } = totpUriSchema.parse(enableResponse.body)
    const base32Secret = extractQueryParam(totpURI, 'secret')

    if (operation === 'twoFactor.getTotpUri') {
      // `getTOTPURI` yalnızca `twoFactor` SATIRININ VARLIĞINI ister
      // (`twoFactorEnabled` bayrağını DEĞİL) — `enable` tek başına yeter,
      // oturum DEĞİŞMEZ.
      return cookieHeader
    }

    // `generateBackupCodes` `user.twoFactorEnabled === true` ister —
    // bayrağı çevirmek için GEÇERLİ bir TOTP koduyla `verify-totp`
    // TAMAMLANIR (`two-factor-acceptance-ac1-setup-flow.test.ts`'in AYNI
    // deseni) — dosya başı "ÜÇÜNCÜ ÖLÇÜLMÜŞ SAPMA" yorumu: YENİ çerez
    // DÖNÜLÜR.
    const validCode = await generateTotpCode({ base32Secret })
    const verifyResponse = await request(httpServer())
      .post('/auth/two-factor/verify-totp')
      .set('Cookie', cookieHeader)
      .send({ code: validCode })
    expect(verifyResponse.status).toBe(200)

    const newCookies = setCookieHeaderSchema.parse(verifyResponse.headers['set-cookie'])
    return newCookies.join('; ')
  }

  // --- Kapı #3 — KATALOĞU GEZEN döngü, TEK-BİÇİMLİ "YANLIŞ PAROLA" ekseni --
  it.each(Object.entries(SENSITIVE_OPERATIONS))(
    '%s (%s) — YANLIŞ parola → 400 INVALID_PASSWORD (korumasız kalsaydı bu satır KIRMIZI olurdu)',
    async (operation, routeKey) => {
      const [method, path] = routeKey.split(' ', 2) as [string, string]
      // Katalog BUGÜN yalnızca POST taşıyor (S5'in `splitRouteKey`'i) — bu
      // assert YARININ bir GET girdisini SESSİZCE yanlış çağırmaz, KIRAR.
      expect(method).toBe('POST')

      const { cookieHeader: initialCookieHeader } = await signUpVerifyAndSignIn(
        `s8b-gate3-${operation.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      )

      const cookieHeader = await prepareAccountForOperation(operation, initialCookieHeader)

      const response = await request(httpServer())
        .post(path)
        .set('Cookie', cookieHeader)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .send(buildRequestBody(operation, WRONG_PASSWORD))

      expect(response.status).toBe(400)
      expect(errorBodySchema.parse(response.body).code).toBe('INVALID_PASSWORD')
    },
    20_000,
  )

  // --- "alan YOK" ekseni — YALNIZCA bizim İKİ kendi ucumuz ------------------
  //
  // Dosya başı "YAZILI SAPMA" yorumu: dört 2FA ucunda `password` ŞEMA
  // DÜZEYİNDE zorunludur, bu yüzden bu eksen ORADA ÇALIŞTIRILMAZ (farklı,
  // kütüphane-kaynaklı bir hata kodu üretirdi — tek-biçimliliği KIRAN,
  // ÖLÇÜLMEMİŞ bir iddia olurdu). `session.revoke`/`session.revokeAll`
  // gövde şeması (`sessions.controller.ts`) `password`'u `z.string()
  // .optional()` TUTAR tam da bu yüzden — `StepUpService.assertVerified()`
  // `undefined`'ı AYNI `InvalidPasswordError`'a eşler (ADR-0019 §Karar 4/5).
  it('session.revoke — password alanı HİÇ GÖNDERİLMEDEN → 400 INVALID_PASSWORD', async () => {
    const { cookieHeader } = await signUpVerifyAndSignIn('s8b-gate3-field-missing-revoke')

    const response = await request(httpServer())
      .post('/auth/sessions/revoke')
      .set('Cookie', cookieHeader)
      .set('Origin', BASE_ENV.AUTH_BASE_URL)
      .send({ sessionId: `ses_${randomUUID()}` })

    expect(response.status).toBe(400)
    expect(errorBodySchema.parse(response.body).code).toBe('INVALID_PASSWORD')
  })

  it('session.revokeAll — password alanı HİÇ GÖNDERİLMEDEN → 400 INVALID_PASSWORD', async () => {
    const { cookieHeader } = await signUpVerifyAndSignIn('s8b-gate3-field-missing-revoke-all')

    const response = await request(httpServer())
      .post('/auth/sessions/revoke-all')
      .set('Cookie', cookieHeader)
      .set('Origin', BASE_ENV.AUTH_BASE_URL)
      .send({})

    expect(response.status).toBe(400)
    expect(errorBodySchema.parse(response.body).code).toBe('INVALID_PASSWORD')
  })
})
