// @arkesoft/api — `userId` NDJSON satırında İKİ KEZ GÖRÜNMEME kanıtı
// (ROADMAP v0.0.15, T-016 FIX turu 3, madde ②, security tur3 `low`)
//
// `security`'nin CANLI ölçümü: `/two-factor/enable`/`disable`/
// `generate-backup-codes` için `createTwoFactorEventHook`
// (`auth-instance.ts`) olay logunu `{ userId }` İLE AÇIKÇA yazıyordu — ama
// bu üç yol `AUTH_EXEMPT_PATHS`'TE OLMADIĞI için `AuthContextMiddleware`
// (`auth-context.middleware.ts:100`) `context.logger`'ı `child({userId})`
// İLE ZATEN BAĞLAMIŞTI. Sonuç NDJSON satırında `userId` anahtarının İKİ KEZ
// yazılmasıydı (`{"level":"info",…,"userId":"…","userId":"…","msg":"2FA
// kurulumu başladı"}`) — pino `JSON.stringify` İÇİN tek bir nesneyi
// `Object.assign`/spread İLE BİRLEŞTİRMEZ, iç içe `child()` çağrıları HER
// SEVİYEYİ kendi alanlarıyla birlikte SERİALİZE eder, bu yüzden aynı anahtar
// İKİ KEZ YAZILABİLİR (ÖLÇÜLDÜ) — `JSON.parse` bunu SESSİZCE tek alana
// indirger (son değer kazanır), bu yüzden bu kanıt PARSE EDİLMİŞ nesne
// ÜZERİNDEN DEĞİL, HAM METİN üzerinden YAPILIR (`auth.guard.ts`'in
// `kiracı üyeliği yok` dalındaki AYNI emsal/düzeltme, BU alt görevin FIX'i
// üç olaya GENİŞLETİLDİ).
//
// Bu dosya `createTestApp({ stream })` + `supertest` (`two-factor-http-
// chain.test.ts` ile AYNI GERÇEK HTTP zinciri deseni) kullanır — `two-
// factor-plugin-live.test.ts`'in `auth.handler()` KÖPRÜSÜ (Nest middleware
// zincirini ATLAR) BİLEREK KULLANILMAZ: bu kanıt TAM OLARAK
// `AuthContextMiddleware`'in ÇALIŞTIĞI yolda GEÇERLİDİR.
//
// GÜNCELLEME — bu testin KENDİSİ İKİNCİ bir kaynak ortaya çıkardı: `disable`
// `databaseHooks.session.create.after`/`session.delete.after`'ı (Better
// Auth'un KENDİ `internalAdapter.createSession`/`deleteSession` çağrıları,
// `index.mjs:227/235`) de TETİKLER; bu iki kanca KOŞULSUZ `{userId}`
// yazıyordu + `session.create.after` KOŞULSUZ İKİNCİ bir `child({userId})`
// bağlıyordu — ikisi de "middleware userId BAĞLAMAMIŞTI" varsayımıyla
// yazılmıştı (DOĞRU: giriş/çıkış İÇİN, YANLIŞ: `disable`'ın tetiklediği
// çağrı İÇİN). `auth-instance.ts`'in dosya başı GÜNCELLEME yorumu — AYNI
// `context.auth.kind === 'authenticated'` sinyaliyle DÜZELTİLDİ, bu testin
// `sessionRenewedLine`/`sessionEndedLines` assert'leri bunu KANITLAR.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import { parseEnv } from '@arkesoft/config/env'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
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
const PASSWORD = 'arkesoft-s4-fix3-duplicate-userid-password-123'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

const totpUriSchema = z.object({
  method: z.literal('totp'),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})

const setCookieHeaderSchema = z.array(z.string()).min(1)

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

/** `log-correlation.test.ts`'in AYNI yardımcısı — bilerek yerel kopya. */
function createMemoryLogStream(): { readonly stream: Writable; readonly getLines: () => string[] } {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })
  return {
    stream,
    getLines: () =>
      Buffer.concat(chunks)
        .toString('utf-8')
        .split('\n')
        .filter((line) => line.length > 0),
  }
}

/** HAM NDJSON satırında bir alt dizenin KAÇ KEZ geçtiğini sayar — `JSON.parse` DEĞİL. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

describe(
  'FIX turu 3, madde ② (security tur3, `low`) — GERÇEK HTTP zincirinde `userId` NDJSON ' +
    'satırında TAM OLARAK BİR KEZ (enable/disable İKİSİ de kimlik GEREKTİRİR, ' +
    'AuthContextMiddleware ZATEN bağlar)',
  () => {
    let app: INestApplication<Server> | undefined

    afterAll(async () => {
      if (app !== undefined) {
        await app.close()
        app = undefined
      }
    })

    function httpServer(): Server {
      if (app === undefined) {
        throw new Error('test uygulaması henüz kurulmadı')
      }
      return app.getHttpServer()
    }

    it(
      'ASIL KANIT — "2FA kurulumu başladı" VE "2FA devre dışı bırakıldı" HAM NDJSON satırlarında ' +
        '`"userId"` alt dizesi TAM OLARAK BİR defa geçer (iki defa DEĞİL)',
      async () => {
        const { stream, getLines } = createMemoryLogStream()
        const testApp = await createTestApp({ stream })
        app = testApp.app

        const email = uniqueEmail('fix3-dup-userid')
        await deleteAllMailpitMessages()

        await request(httpServer())
          .post('/auth/sign-up/email')
          .send({ name: 'FIX turu 3 Madde 2 Testi', email, password: PASSWORD })

        const delivered = await findLatestMailpitMessageTo(email)
        const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
        await request(httpServer()).get(
          `/auth/verify-email?token=${encodeURIComponent(verifyToken)}`,
        )

        const signInResponse = await request(httpServer())
          .post('/auth/sign-in/email')
          .send({ email, password: PASSWORD })
        const sessionCookiePair = toCookiePair(
          setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])[0] ?? '',
        )

        const enableResponse = await request(httpServer())
          .post('/auth/two-factor/enable')
          .set('Origin', BASE_ENV.AUTH_BASE_URL)
          .set('Cookie', sessionCookiePair)
          .send({ password: PASSWORD, method: 'totp' })
        expect(enableResponse.status).toBe(200)
        const { totpURI } = totpUriSchema.parse(enableResponse.body)
        const base32Secret = extractBase32SecretFromTotpUri(totpURI)

        const confirmCode = await generateTotpCode({ base32Secret })
        const confirmResponse = await request(httpServer())
          .post('/auth/two-factor/verify-totp')
          .set('Origin', BASE_ENV.AUTH_BASE_URL)
          .set('Cookie', sessionCookiePair)
          .send({ code: confirmCode })
        expect(confirmResponse.status).toBe(200)

        // `verify-totp`'un "confirm" dalı ESKİ oturumu SİLİP YENİ bir oturum
        // kurar — `disable` BU YENİ çerezle çağrılmalı
        // (`two-factor-plugin-live.test.ts`'in AYNI ölçümü).
        const confirmSetCookies = setCookieHeaderSchema.parse(confirmResponse.headers['set-cookie'])
        const confirmedSessionCookieEntry = confirmSetCookies.find((entry) =>
          entry.includes('session_token='),
        )
        if (confirmedSessionCookieEntry === undefined) {
          throw new Error('verify-totp onayından YENİ oturum çerezi alınamadı')
        }
        const confirmedSessionCookiePair = toCookiePair(confirmedSessionCookieEntry)

        const disableResponse = await request(httpServer())
          .post('/auth/two-factor/disable')
          .set('Origin', BASE_ENV.AUTH_BASE_URL)
          .set('Cookie', confirmedSessionCookiePair)
          .send({ password: PASSWORD })
        expect(disableResponse.status).toBe(200)

        const rawLines = getLines()
        const setupStartedLine = rawLines.find((line) => line.includes('"2FA kurulumu başladı"'))
        const disabledLine = rawLines.find((line) => line.includes('"2FA devre dışı bırakıldı"'))
        // `disable` KENDİSİ `session.create.after` VE `session.delete.after`'ı
        // TETİKLER (ÖLÇÜLDÜ — dosya başı yorumu) — İKİSİ de BU testin
        // kapsamına girer, bağımsız olarak İKİ KEZ bu durumdan GEÇEBİLİRDİ.
        const sessionRenewedLine = rawLines.find((line) =>
          line.includes('"2FA değişikliği sonrası oturum yenilendi"'),
        )
        const sessionEndedLines = rawLines.filter((line) => line.includes('"oturum sonlandırıldı"'))

        if (setupStartedLine === undefined) {
          throw new Error('"2FA kurulumu başladı" log satırı bulunamadı')
        }
        if (disabledLine === undefined) {
          throw new Error('"2FA devre dışı bırakıldı" log satırı bulunamadı')
        }
        if (sessionRenewedLine === undefined) {
          throw new Error('"2FA değişikliği sonrası oturum yenilendi" log satırı bulunamadı')
        }
        if (sessionEndedLines.length === 0) {
          throw new Error('"oturum sonlandırıldı" log satırı bulunamadı')
        }

        // RAPORA GİRER (madde ②, ZORUNLU kanıt) — HAM satır, `JSON.parse`
        // DEĞİL (parse edilseydi yineleme sessizce kaybolurdu).
        expect(countOccurrences(setupStartedLine, '"userId"')).toBe(1)
        expect(countOccurrences(disabledLine, '"userId"')).toBe(1)
        expect(countOccurrences(sessionRenewedLine, '"userId"')).toBe(1)
        for (const line of sessionEndedLines) {
          expect(countOccurrences(line, '"userId"')).toBe(1)
        }

        // `userId` ALANI YOK DEĞİL — TEK BİR KEZ VAR, "sessizce kaybolmadı"
        // kanıtı (ADR-0014 boş assert disiplini).
        expect(setupStartedLine).toContain('"userId"')
        expect(disabledLine).toContain('"userId"')
        expect(sessionRenewedLine).toContain('"userId"')
      },
      20_000,
    )
  },
)
