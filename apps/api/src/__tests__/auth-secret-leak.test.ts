// @arkesoft/api — AC8 sır sızıntısı log yakalama testi (ROADMAP v0.0.5,
// T-006/S6, architect "LOG DESENİ" bölümü, A-G7)
//
// `log-correlation.test.ts`'in (T-002/ST-7) bellek `Writable`/NDJSON ayrıştırma
// deseniyle AYNI. Better Auth'un KENDİ logger'ı (S5, `createBetterAuthLogger`)
// AYNI pino köküne bağlı olduğu için bu yakalanan stream kütüphanenin ÇIKTISINI
// DA kapsar (A-G7).
//
// Yokluk kümesi (bağlayıcı, architect): ham parola · `account.password` ·
// `session.token` · `verification.value` · e-postadaki ham token ·
// `Set-Cookie` değeri · `Cookie` başlığı · `Authorization` · `BETTER_AUTH_SECRET` ·
// tam e-posta (yalnızca `a***@example.com` maskeli) · `ipAddress`.
//
// ⚠ AYRI ÖLÇÜM + GERÇEK ASSERT (FIX turu 1, solid H-1 — ÖNCEDEN tautolojik,
// hiçbir koşulda kırılamayan tek bir assert İDİ, bkz. aşağıdaki describe
// bloğunun kendi yorumu): `better-call` `router.mjs:93`'ün `console.error` çağrısı —
// AŞAĞIDAKİ ikinci `describe` bloğu bunu KOŞTURUR ve GERÇEK çıktıyı
// `console.error` spy'ı ile YAKALAR; bu BİZİM pino/redaction'ımızı ATLAR
// (üçüncü parti, `node_modules`, DÜZELTMESİ kapsam dışı) — AMA sızıntının
// KENDİSİ artık bu testte PİNLİ: DATABASE_URL şifresi ham hata metninde
// GÖRÜNÜRSE test KIRMIZI olur.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import type { Server as NetServer, Socket } from 'node:net'
import { Writable } from 'node:stream'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { AuthProbeController } from './helpers/auth-probe.controller.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-s6-secret-leak-password-123'

function uniqueEmail(): string {
  return `s6-secret-leak-${randomUUID().slice(0, 12)}@arkesoft.test`
}

/** `log-correlation.test.ts`'in AYNI yardımcısı — bilerek yerel kopya (o dosya S7'nin). */
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

/**
 * FIX turu 2, madde 1 (security tur2 S-2) — asgari, ELLE yazılmış bir SMTP
 * sunucusu (`node:net`, YENİ bir ana bağımlılık GEREKMEZ): EHLO'yu kabul
 * eder, MAIL FROM'u kabul eder, HER `RCPT TO` komutunu `550` ile REDDEDER —
 * nodemailer'ın "alıcı reddedildi" hata yolunu GERÇEKTEN tetikler (security
 * gate'in probu ile AYNI desen). `secure: false` + STARTTLS reklamı YOK →
 * düz metin akışı.
 */
function startRejectingSmtpServer(): Promise<{
  readonly server: NetServer
  readonly port: number
}> {
  return new Promise((resolve, reject) => {
    const server = createNetServer((socket: Socket) => {
      socket.write('220 arkesoft-test ESMTP\r\n')
      let buffer = ''

      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8')
        let newlineIndex = buffer.indexOf('\r\n')

        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).toUpperCase()
          buffer = buffer.slice(newlineIndex + 2)

          if (line.startsWith('EHLO') || line.startsWith('HELO')) {
            socket.write('250 arkesoft-test\r\n')
          } else if (line.startsWith('MAIL FROM')) {
            socket.write('250 OK\r\n')
          } else if (line.startsWith('RCPT TO')) {
            socket.write('550 5.1.1 Recipient address rejected: User unknown\r\n')
          } else if (line.startsWith('QUIT')) {
            socket.write('221 Bye\r\n')
            socket.end()
          } else {
            socket.write('250 OK\r\n')
          }

          newlineIndex = buffer.indexOf('\r\n')
        }
      })
    })

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('beklenmeyen soket adresi'))
        return
      }
      resolve({ server, port: address.port })
    })
  })
}

describe('AC8 — sır sızıntısı yok (gerçek Postgres + Mailpit, tam akış)', () => {
  let app: INestApplication<Server> | undefined

  afterEach(async () => {
    if (app !== undefined) {
      await app.close()
      app = undefined
    }
  })

  it(
    'kayıt → doğrulama → giriş → korumalı uç → oturum listeleme/sonlandırma akışında ' +
      'ham parola/token/çerez/BETTER_AUTH_SECRET/tam e-posta/ipAddress HİÇBİR log satırında yok',
    async () => {
      const { stream, getFullText } = createMemoryLogStream()
      const testApp = await createTestApp({ stream, smokeControllers: [AuthProbeController] })
      app = testApp.app

      const email = uniqueEmail()
      await deleteAllMailpitMessages()

      await request(app.getHttpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S6 Sır Sızıntısı Testi', email, password: PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const verificationUrl = extractFirstUrl(delivered.Text)
      const verificationToken = extractQueryParam(verificationUrl, 'token')

      await request(app.getHttpServer()).get(
        `/auth/verify-email?token=${encodeURIComponent(verificationToken)}`,
      )

      const signInResponse = await request(app.getHttpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })

      const rawSetCookieHeader = signInResponse.headers['set-cookie']
      const cookies: string[] = Array.isArray(rawSetCookieHeader) ? rawSetCookieHeader : []
      expect(cookies.length).toBeGreaterThan(0)
      const cookieHeader = cookies.join('; ')
      // İmzalı çerezin DEĞER kısmı (`name=değer;` — `;` öncesi) — bu, Better
      // Auth'un `session.token`'dan ÜRETTİĞİ taşıyıcı dizedir.
      const cookieValues = cookies.map((cookie) => cookie.split(';')[0] ?? '')

      await request(app.getHttpServer()).get('/__auth_probe').set('Cookie', cookieHeader)

      await request(app.getHttpServer()).get('/auth/sessions').set('Cookie', cookieHeader)

      // FIX turu 2, madde 2 (security tur2 S-3) — `SameOriginGuard` artık
      // `Cookie` taşıyan GÜVENSİZ (POST) isteklerde `Origin`/`Referer`/
      // `Sec-Fetch-Site` eksikliğini REDDEDİYOR; tarayıcının zaten
      // ekleyeceği `Origin` başlığı buraya da EKLENDİ.
      await request(app.getHttpServer())
        .post('/auth/sessions/revoke-all')
        .set('Cookie', cookieHeader)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)

      const fullLogText = getFullText()

      // --- ham parola --------------------------------------------------------
      expect(fullLogText).not.toContain(PASSWORD)

      // --- doğrulama belirteci (verification.value'nun ham hâli) -------------
      expect(fullLogText).not.toContain(verificationToken)

      // --- Set-Cookie / Cookie başlığı değerleri (session.token taşıyıcısı) --
      for (const cookieValue of cookieValues) {
        if (cookieValue.length > 0) {
          expect(fullLogText).not.toContain(cookieValue)
        }
      }

      // --- Authorization başlığı (hiç gönderilmedi ama anahtar da sızmamalı) -
      expect(fullLogText.toLowerCase()).not.toContain('bearer ')

      // --- BETTER_AUTH_SECRET ham değeri --------------------------------------
      expect(fullLogText).not.toContain(BASE_ENV.BETTER_AUTH_SECRET)

      // --- tam e-posta — yalnızca maskeli biçim kabul -------------------------
      expect(fullLogText).not.toContain(email)

      // --- ipAddress (K6/KVKK — doldurulmuyor, bu yüzden hiç görünmemeli) -----
      expect(fullLogText).not.toContain('ipAddress')
    },
    20_000,
  )

  // FIX turu 2, madde 1 (security tur2 S-2, `high`) — F2'nin düzeltmesinin
  // AÇTIĞI REGRESYONUN kendisi: bir mail TESLİM HATASI (alıcı reddedildi)
  // kullanıcının TAM e-posta adresini pino'ya HAM yazıyordu. Bu vaka AC8'in
  // "tam e-posta yok" assert kümesine EKLENDİ — `describeBetterAuthLogCause`
  // artık allowlist'li (`auth-instance.ts` dosya başı yorumu), bu test
  // GERÇEK bir SMTP reddi ÜRETEREK bunu uçtan uca doğrular.
  it(
    'SMTP sunucusu alıcıyı 550 ile REDDEDER (gerçek teslim hatası) → "Failed to run ' +
      'background task" error satırı causeCode/causeClassName TAŞIR, HİÇBİR log ' +
      'satırında HAM e-posta adresi YOK',
    async () => {
      const { server, port } = await startRejectingSmtpServer()
      const { stream, getFullText } = createMemoryLogStream()
      const email = uniqueEmail()

      const testApp = await createTestApp({
        stream,
        apiEnv: { ...BASE_ENV, SMTP_HOST: '127.0.0.1', SMTP_PORT: port, SMTP_SECURE: false },
      })

      try {
        const response = await request(testApp.app.getHttpServer())
          .post('/auth/sign-up/email')
          .send({ name: 'S2 Teslim Hatası Testi', email, password: PASSWORD })

        // F2'nin ÖLÇÜLMÜŞ sapması (auth-instance.ts dosya başı yorumu) —
        // better-auth'un `runInBackgroundOrAwait`'i bu hatayı HİÇBİR
        // YAPILANDIRMAYLA yukarı fırlatmaz, istek YİNE 2xx döner.
        expect(response.status).toBeGreaterThanOrEqual(200)
        expect(response.status).toBeLessThan(300)
      } finally {
        await testApp.app.close()
        server.close()
      }

      const fullLogText = getFullText()

      // --- ASIL BULGU (S-2) — ham e-posta adresi HİÇBİR satırda YOK ---------
      expect(fullLogText).not.toContain(email)

      // --- test VAKUM DEĞİL — hata GERÇEKTEN loglandı, sessizce geçilmedi ----
      expect(fullLogText).toContain('MAIL_DELIVERY_FAILED')
      expect(fullLogText).toContain('Failed to run background task')
    },
    20_000,
  )
})

// FIX turu 1, solid H-1 (high) — ÖNCEKİ hâl tautolojik, HER ZAMAN doğru
// (gerçek/sabit) bir değeri kendisiyle karşılaştıran TEK bir assert İLE
// bitiyordu (hiçbir koşulda KIRILAMAZ) ve ÖLÇÜM metinlerini
// `console.info` ile (üç `eslint-disable no-console`) yazdırıyordu. Blok
// ikiye ayrıldı: (1) bu test GERÇEK bir assert taşır — sızıntı VARSA KIRMIZI
// olur; (2) ölçüm metni ajan raporuna taşındı, kalıcı test DOSYASINA DEĞİL.
//
// FIX turu 2, madde 5 (solid tur2 M-1, `qa` tur2 kanıt testiyle DOĞRULANDI) —
// FIX turu 1'in `if/else` dalı İKİ sorun taşıyordu: (1) yalnızca İLK
// `console.error` çağrısının İKİNCİ (sıfır tabanlı: birinci) argümanını
// okuyordu — ikinci (veya sonraki) bir çağrıdaki GERÇEK bir sızıntıyı HİÇ
// GÖRMEDEN PASS verirdi (`qa`'nın `auth-secret-leak-assertion-fragility
// .qa.test.ts`'i bunu bağımsız olarak KANITLADI); (2) `else` dalı
// (çağrı SAYISI sıfır doğrulaması) kendi KOŞULUNUN altında ZORUNLU olarak
// doğruydu — tautolojik. Düzeltme (solid'in önerdiği 3 satır, DALLANMA YOK):
// TÜM çağrıların TÜM argümanları tek metne İNDİRİLİR, KOŞULSUZ assert edilir
// — çağrı hiç yoksa metin boş dizedir ve assert YİNE anlamlıdır (vakum
// değil, sızıntı yok); çağrı/argüman SAYISI/SIRASI ne olursa olsun HERHANGİ
// birinde "wrong" varsa test KIRMIZI olur.
describe('better-call router.mjs:93 console.error — DATABASE_URL şifresi SIZMAMALI (FIX turu 1, solid H-1)', () => {
  it('sağlayıcı seviyesi beklenmedik hata → console.error ÇAĞRILIRSA ham hata metni DATABASE_URL şifresini İÇERMEZ', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const testApp = await createTestApp({
      apiEnv: {
        ...BASE_ENV,
        DATABASE_URL: 'postgresql://arkesoft_app:wrong@127.0.0.1:1/arkesoft?schema=public',
      },
    })

    try {
      await request(testApp.app.getHttpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S6 Ölçüm Kullanıcısı', email: uniqueEmail(), password: PASSWORD })
    } finally {
      await testApp.app.close()
    }

    // GERÇEK, KOŞULSUZ ASSERT (FIX turu 2, madde 5, dosya başı yorumu) —
    // better-call'un KENDİ `console.error`'ı (bizim pino/redaction'ımızı
    // ATLAYAN, üçüncü parti, kapsam dışı bir çağrı yolu) ÇAĞRILMIŞ olabilir
    // VEYA olmayabilir, KAÇ KEZ çağrıldığı ve HANGİ argüman indeksinde
    // sızdırdığı BİLİNMEZ — TÜM çağrıların TÜM argümanları tek metne
    // İNDİRİLİR, DATABASE_URL'in şifresi ("wrong") bu metnin HİÇBİR
    // YERİNDE olmamalıdır. Çağrı hiç olmadıysa `allCallsText` boş dizedir
    // ve assert yine ANLAMLIDIR (vakum değil, sızıntı yok) — `if/else`
    // ve dallanma YOK.
    const allCallsText = consoleErrorSpy.mock.calls
      .flat()
      .map((value) => (value instanceof Error ? (value.stack ?? value.message) : String(value)))
      .join('\n')
    expect(allCallsText).not.toContain('wrong')

    consoleErrorSpy.mockRestore()
  }, 15_000)
})
