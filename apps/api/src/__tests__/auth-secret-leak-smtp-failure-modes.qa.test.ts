// @arkesoft/api — AC8 allowlist, EK SMTP arıza modları (QA tur 3, Orkestratör
// madde 2 — "backend SMTP 550 kanıtı verdi, SEN BAŞKA bir hata yolu dene")
//
// `auth-secret-leak.test.ts`'in mevcut SMTP vakası YALNIZCA "550 alıcı
// reddedildi"yi kapsıyor. Bu dosya `describeBetterAuthLogCause`'un
// (`auth-instance.ts`) allowlist'inin DNS çözümleme hatasında VE bağlantı
// zaman aşımında da (ikisi de `.message` okumaktan GEÇER, farklı Error alt
// tipleri) ham veri sızdırmadığını BAĞIMSIZ olarak ölçer. SMTP AUTH (535)
// vakası BİLEREK YOK — `SmtpMailTransportConfig`'in `auth` alanı YOK
// (`smtp-mail-transport.ts` → `createTransport({...})` hiçbir `auth` alanı
// GEÇMİYOR) — bugünkü kodda nodemailer AUTH adımını HİÇ DENEMEZ, 535
// senaryosu YAPISAL OLARAK ÜRETİLEMEZ (statik okuma, `grep -n 'auth:'
// smtp-mail-transport.ts` → 0 eşleşme). Bu durum security tur2 S-2'nin
// "ileri risk, ölçülmedi" notuyla TUTARLI — gerçek bir sağlayıcı
// kimlik bilgisi EKLEDİĞİNDE bu dosyaya ÜÇÜNCÜ bir `it` eklenmesi gerekir.

import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'

import { parseEnv } from '@arkesoft/config/env'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-qa-smtp-failure-modes-123'

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

describe('AC8 allowlist — EK SMTP arıza modları (QA tur 3, madde 2)', () => {
  it(
    'DNS çözümlenemeyen SMTP host (ENOTFOUND) → causeCode/causeClassName TAŞIR, ' +
      'HİÇBİR satırda ham host adı / e-posta YOK',
    async () => {
      const unresolvableHost = 'arkesoft-qa-does-not-exist.invalid'
      const { stream, getFullText } = createMemoryLogStream()
      const email = uniqueEmail('qa-dns-fail')

      const testApp = await createTestApp({
        stream,
        apiEnv: { ...BASE_ENV, SMTP_HOST: unresolvableHost, SMTP_PORT: 25, SMTP_SECURE: false },
      })

      try {
        const response = await request(testApp.app.getHttpServer())
          .post('/auth/sign-up/email')
          .send({ name: 'QA DNS Arızası Testi', email, password: PASSWORD })

        // F2'nin ölçülmüş sapması (auth-instance.ts) — better-auth bu hatayı
        // hiçbir yapılandırmayla yukarı fırlatmaz, istek YİNE 2xx döner.
        expect(response.status).toBeGreaterThanOrEqual(200)
        expect(response.status).toBeLessThan(300)
      } finally {
        await testApp.app.close()
      }

      const fullLogText = getFullText()

      // Test VAKUM DEĞİL — hata GERÇEKTEN loglandı.
      expect(fullLogText).toContain('MAIL_DELIVERY_FAILED')
      expect(fullLogText).toContain('Failed to run background task')

      // ASIL ÖLÇÜM — ham host adı ve ham e-posta HİÇBİR satırda yok.
      expect(fullLogText).not.toContain(unresolvableHost)
      expect(fullLogText).not.toContain(email)
    },
    20_000,
  )

  it(
    'bağlantı ZAMAN AŞIMINA uğrayan SMTP host (TEST-NET, 192.0.2.1) → hata ' +
      'GERÇEKTEN loglanır, HİÇBİR satırda ham host/IP / e-posta YOK',
    async () => {
      // RFC 5737 TEST-NET-1 — her ortamda yönlendirilemez (routable değil),
      // bağlantı GERÇEKTEN asılı kalır, nodemailer/withTimeout 5 sn'de keser.
      const blackHoleHost = '192.0.2.1'
      const { stream, getFullText } = createMemoryLogStream()
      const email = uniqueEmail('qa-timeout-fail')

      const testApp = await createTestApp({
        stream,
        apiEnv: { ...BASE_ENV, SMTP_HOST: blackHoleHost, SMTP_PORT: 25, SMTP_SECURE: false },
      })

      try {
        const response = await request(testApp.app.getHttpServer())
          .post('/auth/sign-up/email')
          .send({ name: 'QA Zaman Aşımı Testi', email, password: PASSWORD })

        expect(response.status).toBeGreaterThanOrEqual(200)
        expect(response.status).toBeLessThan(300)
      } finally {
        await testApp.app.close()
      }

      const fullLogText = getFullText()

      expect(fullLogText).toContain('MAIL_DELIVERY_FAILED')
      expect(fullLogText).toContain('Failed to run background task')

      expect(fullLogText).not.toContain(blackHoleHost)
      expect(fullLogText).not.toContain(email)
    },
    20_000,
  )
})
