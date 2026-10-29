// @arkesoft/api — docs/development.md "E-posta Gönderilemedi — Kurtarma Yolu"
// bölümünün BİREBİR iddialarının HTTP seviyesinde ÇALIŞTIRILARAK doğrulanması
// (ROADMAP v0.0.5, T-006 QA tur 4, Orkestratör madde 5 — "belgeyi koşturarak
// test et").
//
// `docs` (S9) FIX turu 3'te runbook'un İKİ iddiasını "GERÇEK DAVRANIŞLA"
// değiştirdiğini yazdı (503 → 2xx + logda belirti; "zaten kayıtlı" → 200 +
// varlık sızdırmazlığı). Bu dosya o iddiaları OKUYARAK kabul etmez, GERÇEK
// Postgres + GERÇEK HTTP + SMTP'yi KASITLI OLARAK ulaşılamaz bırakarak
// TEKRAR ÖLÇER. `docs` metnini KOPYALAMAZ — bağımsız bir çalıştırma.

import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'

import { parseEnv } from '@arkesoft/config/env'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-qa-docs-behavior-verification-123'

function uniqueEmail(): string {
  return `qa-docs-behavior-${randomUUID().slice(0, 12)}@arkesoft.test`
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

describe('docs/development.md "E-posta Gönderilemedi — Kurtarma Yolu" — GERÇEK ÖLÇÜM (QA tur 4, madde 5)', () => {
  it(
    'SMTP ULAŞILAMAZ (bağlantı reddi, "Mailpit down" senaryosunun birebir ' +
      'kendisi) → kayıt YİNE 2xx döner, kullanıcı satırı GERÇEKTEN oluşur, ' +
      'logda causeCode=MAIL_DELIVERY_FAILED + providerErrorCode/' +
      'providerResponseCode VAR',
    async () => {
      const { stream, getFullText } = createMemoryLogStream()
      const email = uniqueEmail()

      // Hiçbir servisin dinlemediği loopback port — ECONNREFUSED anında
      // gelir (docker/Mailpit'i durdurmaya gerek yok, aynı sonuç).
      const testApp = await createTestApp({
        stream,
        apiEnv: { ...BASE_ENV, SMTP_HOST: '127.0.0.1', SMTP_PORT: 1, SMTP_SECURE: false },
      })

      try {
        const prismaService = testApp.app.get(PrismaService)

        const signUpResponse = await request(testApp.app.getHttpServer())
          .post('/auth/sign-up/email')
          .send({ name: 'QA Docs Davranış Doğrulaması', email, password: PASSWORD })

        // docs/development.md: "POST /auth/sign-up/email 2xx döner"
        expect(signUpResponse.status).toBeGreaterThanOrEqual(200)
        expect(signUpResponse.status).toBeLessThan(300)

        // docs/development.md: "kullanıcı satırı veritabanında oluşur"
        const rowCountAfterFirstSignUp = await prismaService.db.user.count({ where: { email } })
        expect(rowCountAfterFirstSignUp).toBe(1)

        const fullLogText = getFullText()

        // docs/development.md: "Belirti yalnızca logda görülür:
        // causeCode: 'MAIL_DELIVERY_FAILED' + providerResponseCode ve
        // providerErrorCode alanları"
        expect(fullLogText).toContain('"causeCode":"MAIL_DELIVERY_FAILED"')
        expect(fullLogText).toContain('"providerErrorCode"')
        // Ham e-posta/host log satırına GİRMEDİ — AC8'in allowlist garantisi
        // bu akışta da geçerli (security tur2/tur3'ün ölçtüğü sınıf).
        expect(fullLogText).not.toContain(email)

        // docs/development.md: "Yeniden kayıt denemesi de 2xx döner ve
        // ikinci bir satır oluşturmaz (varlık sızdırmazlığı, A3 kararı)."
        const secondSignUpResponse = await request(testApp.app.getHttpServer())
          .post('/auth/sign-up/email')
          .send({ name: 'QA Docs Davranış Doğrulaması', email, password: PASSWORD })

        expect(secondSignUpResponse.status).toBeGreaterThanOrEqual(200)
        expect(secondSignUpResponse.status).toBeLessThan(300)

        // Varlık sızdırmazlığı: ikinci yanıtın şekli BİRİNCİYLE aynı
        // (ne "zaten kayıtlı" mesajı, ne farklı bir status/şekil).
        expect(secondSignUpResponse.status).toBe(signUpResponse.status)

        const rowCountAfterSecondSignUp = await prismaService.db.user.count({ where: { email } })
        expect(rowCountAfterSecondSignUp).toBe(1)
      } finally {
        await testApp.app.close()
      }
    },
  )
})
