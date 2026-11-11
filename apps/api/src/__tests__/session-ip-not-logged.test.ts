// @arkesoft/api — AC9: `ipAddress` HİÇBİR log satırında YOK (ROADMAP
// v0.0.15.1, T-017/S8b, ADR-0019 — kullanıcı kararı 2026-11-09: IP TAM
// saklanır, SAHİBİNE tam gösterilir, ASLA loglanmaz).
//
// İKİ SAVUNMA, AYRI doğrulanır (S6'nın notu — `auth-secret-leak.test.ts`'in
// AC8 deseniyle AYNI disiplin, `two-factor-acceptance-ac4-secret-redaction-
// vacuity.test.ts`'in DÖRT-ADIM yapısından ESİNLENİR — FIX turu 1'den
// İTİBAREN BİRİNCİL savunma AC4'ün ADIM 1 probe desenini de GERÇEKTEN
// TAŞIR, solid gate'in M-1 bulgusu: iki negatif assert'ten ÖNCE bilinen
// bir probe mesajının yakalandığı pozitif olarak pinlenir, `LOG_LEVEL`
// ortamdan `error`/`silent` gelirse akış BOŞ kalır ve bu pin KIRMIZI
// verir — negatif assert'ler artık vacuously yeşil OLAMAZ):
//
//   BİRİNCİL — hiçbir kod yolu `ipAddress`'i bir logger çağrısına GEÇİRMİYOR
//   (`request-context.types.ts`'in `RequestClientContext` yorumu: denetim
//   kaydı yazma kapısı VE `auth-instance.ts`'in `session.create.before`
//   kancası, İKİSİ de logger'ı HİÇ import etmez). Bu dosyanın İLK `describe`
//   bloğu BUNU gerçek bir giriş→liste→sonlandırma akışıyla, ÖNÜNE pozitif
//   bir probe pini koyarak doğrular.
//
//   İKİNCİL — `PINO_REDACT_PATHS` (`packages/errors/src/redaction.ts`)
//   `'ipAddress'`/`'*.ipAddress'` yollarını TAŞIR; bu dosyanın İKİNCİ
//   `describe` bloğu, GERÇEK üretim `ROOT_LOGGER` örneğine KASTEN
//   `{ ipAddress: ... }` yazarak bu yapılandırmanın GERÇEKTEN redakte
//   ETTİĞİNİ doğrular.
//
// ⚠⚠ İKİ SAVUNMA AYNI ŞEY DEĞİL (handoff'un bağlayıcı uyarısı,
// `auth-instance.ts`'in `*.secret` dersiyle AYNI sınır): `PINO_REDACT_PATHS`
// YOL TABANLIDIR, SERBEST METNİ YAKALAMAZ. İKİNCİ `describe` bloğunun İKİNCİ
// testi bunu AÇIKÇA gösterir — AYNI IP değeri, bir log çağrısının MESAJ
// (serbest metin) kısmına yazılırsa redaksiyon ONU YAKALAMAZ; bu KASITLI bir
// karşıt-örnek, "redaksiyon testi geçti" ile "sızıntı yok" iddialarının
// BİRBİRİNE İNDİRİLEMEYECEĞİNİN kanıtıdır.
//
// ⚠⚠ ÜÇÜNCÜ TUZAK (architect'in ölçümü): `utils/ip.mjs:217` test ortamında
// `127.0.0.1` döner. Bu dosya `AUTH_TRUSTED_PROXY_COUNT: 1` + GERÇEK bir
// `X-Forwarded-For` başlığıyla (`session-ip-and-last-seen.test.ts`/
// `auth-sessions.test.ts`'in AYNI deseni) istemci IP'sini AÇIKÇA bir
// başlıktan SÜRER — sabit `127.0.0.1` beklentisi YASAK (loopback geri
// düşüşü sahte yeşil üretirdi: IP'nin KENDİSİ zaten boş/sabit bir değer
// olsaydı "log'da yok" iddiası anlamsızlaşırdı).
//
// VACUITY (metodoloji notu, raporda DETAYLANDIRILDI): "akış GERÇEKTEN bir
// sızıntıyı yakalar mı" sorusu, bu dosyanın KENDİ `ROOT_LOGGER` örneğine
// akış SIRASINDA KASTEN bir serbest-metin IP satırı yazan GEÇİCİ bir satırla
// (koşturulup SONRA kaldırılan) doğrulandı — üretim kodu (`auth-instance.ts`,
// `sessions.service.ts` vb.) HİÇBİR ADIMDA değiştirilmedi; mutasyon TAMAMEN
// bu test dosyasının kendi taslağında yaşadı. Kanıt: Task raporunda.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import { parseEnv } from '@arkesoft/config/env'
import { PINO_REDACT_PATHS } from '@arkesoft/errors'
import type { INestApplication } from '@nestjs/common'
import type { Logger } from 'pino'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-s8b-ip-not-logged-password-123'

/**
 * TEST-NET-2 (RFC 5737) — gerçek bir rotalanabilir blok DEĞİL, LOOPBACK da
 * DEĞİL; `sessions-step-up-coverage.test.ts`'in (bu dosyanın kardeşi)
 * kullandığı `.212`'den FARKLI — iki dosya PARALEL koşarken AYNI IP
 * kovasını PAYLAŞMASIN.
 */
const FORWARDED_TEST_IP = '198.51.100.213'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
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

const signInBodySchema = z.object({ user: z.object({ id: z.string() }) })
const setCookieHeaderSchema = z.array(z.string()).min(1)
const activeSessionListSchema = z.array(z.object({ id: z.string(), isCurrent: z.boolean() }))

describe('AC9 — BİRİNCİL savunma: giriş → liste → sonlandırma akışında ipAddress HİÇBİR log satırında yok', () => {
  let app: INestApplication<Server> | undefined
  let getFullText: () => string

  beforeAll(async () => {
    const { stream, getFullText: read } = createMemoryLogStream()
    getFullText = read
    // `AUTH_TRUSTED_PROXY_COUNT: 1` — dosya başı "ÜÇÜNCÜ TUZAK" yorumu.
    const testApp = await createTestApp({
      stream,
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

  it(
    'tam akış (X-Forwarded-For ile giriş → liste → sonlandırma) — log metninde NE "ipAddress" ' +
      'DİZGİSİ NE DE GERÇEK IP DEĞERİ geçiyor (POZİTİF PİN + İKİ NEGATİF ASSERT, AC9)',
    async () => {
      // --- POZİTİF PİN (M-1 düzeltmesi, solid gate turu 1) --------------
      // AC4'ün ADIM 1 deseninden (`two-factor-acceptance-ac4-secret-
      // redaction-vacuity.test.ts:132-135`) ALINAN probe — SABİT bir log
      // metnine ("istek tamamlandı" gibi) pinlemek YERİNE tercih edildi:
      // sabit metin NestJS'in kendi erişim logu biçimi değişirse SESSİZCE
      // kırılmadan ÖLÜR (metin kaybolur, assert hâlâ geçer); bu probe ise
      // BU TESTİN KENDİ `ROOT_LOGGER` örneğine YAZDIĞI bilinen bir rastgele
      // dizge olduğu için akış dışı hiçbir metin değişikliğinden
      // ETKİLENMEZ. Aşağıdaki iki negatif assert'ten ÖNCE koşar —
      // `fullLogText`'in BOŞ OLMADIĞINI, akışın GERÇEKTEN yakaladığını
      // kanıtlar (solid'in M-1 bulgusu: `LOG_LEVEL=error|silent` bir
      // koşumda negatif assert'ler vacuously yeşil olurdu).
      const rootLogger = app?.get<Logger>(ROOT_LOGGER)
      if (rootLogger === undefined) {
        throw new Error('ROOT_LOGGER provider çözülemedi')
      }
      const positivePinProbe = `s8b-ac9-positive-pin-${randomUUID().slice(0, 8)}`
      rootLogger.info({ probe: 'ac9-positive-pin' }, positivePinProbe)

      const email = uniqueEmail('s8b-ac9-ip')

      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S8b AC9 IP Testi', email, password: PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .set('X-Forwarded-For', FORWARDED_TEST_IP)
        .send({ email, password: PASSWORD })

      const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
      signInBodySchema.parse(signInResponse.body)
      const cookieHeader = cookies.join('; ')

      const listResponse = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', cookieHeader)
      expect(listResponse.status).toBe(200)
      const sessions = activeSessionListSchema.parse(listResponse.body)
      const currentSession = sessions.find((session) => session.isCurrent)
      expect(currentSession).toBeDefined()
      if (currentSession === undefined) {
        return
      }

      const revokeResponse = await request(httpServer())
        .post('/auth/sessions/revoke')
        .set('Cookie', cookieHeader)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .send({ sessionId: currentSession.id, password: PASSWORD })
      expect(revokeResponse.status).toBe(200)

      const fullLogText = getFullText()

      // --- POZİTİF PİN — akış BOŞ DEĞİL, yukarıdaki probe GERÇEKTEN
      // yakalandı (M-1 düzeltmesi). Bu assert'in ÖNCE koşması, aşağıdaki
      // iki negatif assert'in vacuously (hiçbir şey ölçmeden) yeşil
      // olmadığını garantiler.
      expect(fullLogText).toContain(positivePinProbe)

      // --- ASSERT #1 — "ipAddress" DİZGİSİNİN KENDİSİ hiçbir satırda yok ---
      // (BİRİNCİL savunma: hiçbir kod yolu bu alanı logger'a GEÇİRMİYOR —
      // geçirseydi pino'nun redact'i DEĞERİ maskeler ama ANAHTAR ADI YİNE
      // görünürdü, dosya başı yorumu.)
      expect(fullLogText).not.toContain('ipAddress')

      // --- ASSERT #2 — GERÇEK IP DEĞERİNİN KENDİSİ hiçbir satırda yok -----
      // (⚠⚠ #1 OLMADAN BU ASSERT TEK BAŞINA YETERSİZ OLURDU — ad maskelenmiş
      // bir alanın DEĞERİ serbest metinde BAŞKA bir yoldan sızabilirdi; bu
      // yüzden İKİSİ BİRLİKTE zorunlu, dosya başı yorumu.)
      expect(fullLogText).not.toContain(FORWARDED_TEST_IP)
    },
    20_000,
  )
})

describe('AC9 — İKİNCİL savunma (AYRI doğrulama): PINO_REDACT_PATHS ipAddress/*.ipAddress yollarını GERÇEKTEN redakte eder', () => {
  let app: INestApplication<Server> | undefined
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

  it('katalog — PINO_REDACT_PATHS "ipAddress" VE "*.ipAddress" yollarını TAŞIR', () => {
    expect(PINO_REDACT_PATHS).toContain('ipAddress')
    expect(PINO_REDACT_PATHS).toContain('*.ipAddress')
  })

  it(
    'GERÇEK üretim ROOT_LOGGER örneğine { ipAddress } YAPISAL alanla yazılırsa DEĞER redakte edilir ' +
      '(pozitif kanıt — tarama GERÇEKTEN çalışıyor)',
    () => {
      const rootLogger = app?.get<Logger>(ROOT_LOGGER)
      if (rootLogger === undefined) {
        throw new Error('ROOT_LOGGER provider çözülemedi')
      }

      const probeMessage = `s8b-ac9-redaction-probe-${randomUUID().slice(0, 8)}`
      rootLogger.info({ ipAddress: FORWARDED_TEST_IP }, probeMessage)

      const text = getFullText()
      expect(text).toContain(probeMessage)
      expect(text).toContain('[redacted]')
      expect(text).not.toContain(FORWARDED_TEST_IP)
    },
  )

  it(
    '⚠⚠ AYNI IP, SERBEST METİN (mesaj alanı) içine yazılırsa redakte EDİLMEZ — yol tabanlı ' +
      'redaksiyonun sınırı, "redaksiyon testi geçti" ≠ "sızıntı yok" (dosya başı uyarısı, KASITLI karşıt-örnek)',
    () => {
      const rootLogger = app?.get<Logger>(ROOT_LOGGER)
      if (rootLogger === undefined) {
        throw new Error('ROOT_LOGGER provider çözülemedi')
      }

      rootLogger.warn(`serbest metin karşıt-örneği, IP: ${FORWARDED_TEST_IP}`)

      const text = getFullText()
      // KASITLI — bu assert'in "doğru" sonucu IP'NİN GÖRÜNMESİDİR; bu test
      // bir güvenlik AÇIĞI iddia ETMİYOR, yol tabanlı redaksiyonun serbest
      // metni KAPSAMADIĞINI (dolayısıyla BİRİNCİL savunmanın — hiçbir kod
      // yolunun bu alanı HİÇ GEÇİRMEMESİNİN — neden ZORUNLU olduğunu) GERÇEK
      // pino davranışıyla kanıtlıyor.
      expect(text).toContain(FORWARDED_TEST_IP)
    },
  )
})
