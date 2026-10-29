// @arkesoft/api — MailTransport / SMTP / mesaj katalogu testleri (ROADMAP
// v0.0.5, T-006/S4)
//
// AC4(b) BAĞLAYICI: "yalnızca 'token üretildi' assert'i KABUL EDİLMEZ" —
// bu dosyadaki gönderim testleri GERÇEK Mailpit'e (infra:up) gönderir ve
// `helpers/mailpit-client.ts` üzerinden Zod ile ayrıştırılmış gerçek HTTP
// yanıtını okur.

import { createServer } from 'node:net'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseMailMessageKey, renderMailMessage } from '../auth/mail/messages.js'
import { SmtpMailTransport } from '../auth/mail/smtp-mail-transport.js'
import { MailDeliveryFailedError } from '../errors/domain/mail-delivery-failed.error.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

/** `infra/docker-compose.yml`'in Mailpit SMTP portu (`:1025`). */
const MAILPIT_SMTP_PORT = 1025

function createTestTransport(port: number): SmtpMailTransport {
  return new SmtpMailTransport({
    host: '127.0.0.1',
    port,
    secure: false,
    fromName: 'Arkesoft Test',
    fromAddress: 'no-reply@arkesoft.test',
  })
}

describe('SmtpMailTransport — gerçek Mailpit teslimi', () => {
  let transport: SmtpMailTransport

  beforeEach(async () => {
    transport = createTestTransport(MAILPIT_SMTP_PORT)
    await deleteAllMailpitMessages()
  })

  afterEach(() => {
    transport.close()
  })

  it("e-postayı gerçekten Mailpit'e teslim eder; Türkçe karakterler (ş/ğ/İ/ı) bozulmadan okunur ve gövdeden belirteç çıkarılır", async () => {
    const recipient = 'alici@arkesoft.test'
    const verificationUrl = 'http://panel.arkesoft.localhost:3000/auth/verify-email?token=abc123XYZ'
    const content = renderMailMessage('auth.emailVerification', { url: verificationUrl })

    // Kataloğun ÜRETTİĞİ gerçek konu metni dört Türkçe karakerin TAMAMINI
    // içeriyor mu — bu test içerik değişirse Mailpit'e gitmeden ERKEN kırılır.
    expect(content.subject).toContain('İ')
    expect(content.subject).toContain('ş')
    expect(content.subject).toContain('ğ')
    expect(content.subject).toContain('ı')

    await transport.send({
      to: recipient,
      subject: content.subject,
      text: content.text,
      html: content.html,
      messageKey: 'auth.emailVerification',
    })

    const delivered = await findLatestMailpitMessageTo(recipient)

    // "token üretildi" assert'i YETMEZ (AC4(b)) — gerçekten TESLİM EDİLMİŞ
    // mesajın konusu, Mailpit'in HTTP API'sinden okunduğunda BOZULMAMIŞ.
    expect(delivered.Subject).toBe(content.subject)
    expect(delivered.Text).toContain(verificationUrl)

    const extractedUrl = extractFirstUrl(delivered.Text)
    const token = extractQueryParam(extractedUrl, 'token')
    expect(token).toBe('abc123XYZ')
  }, 15000)
})

describe('SmtpMailTransport — 5 sn zaman aşımı (architect, bağlayıcı)', () => {
  it('karşılama mesajı göndermeyen bir SMTP sunucusuna bağlanınca 5 sn içinde MailDeliveryFailedError ile başarısız olur, sarkan kaynak bırakmaz', async () => {
    // Kasıtlı: hiçbir zaman "220 ..." karşılama mesajı YAZMAZ — bağlantı
    // kurulur ama SMTP el sıkışması hiç başlamaz, transport sonsuza kadar
    // ASILI kalmaya ÇALIŞIR; `withTimeout` bunu 5 sn'de kesmek ZORUNDA.
    const hangingServer = createServer(() => {
      // kasıtlı boş: hiçbir veri yazılmaz, soket açık kalır.
    })

    await new Promise<void>((resolve) => {
      hangingServer.listen(0, '127.0.0.1', resolve)
    })

    const address = hangingServer.address()
    if (address === null || typeof address === 'string') {
      hangingServer.close()
      throw new Error('test TCP sunucusu port alamadı')
    }

    const transport = createTestTransport(address.port)
    const startedAt = Date.now()
    let caughtError: unknown

    try {
      await transport.send({
        to: 'hedef@arkesoft.test',
        subject: 'zaman aşımı testi',
        text: 'gövde',
        html: '<p>gövde</p>',
        messageKey: 'auth.emailVerification',
      })
    } catch (error) {
      caughtError = error
    } finally {
      transport.close()
      await new Promise<void>((resolve) => {
        hangingServer.close(() => {
          resolve()
        })
      })
    }

    const elapsedMs = Date.now() - startedAt
    // Sert bütçe 5000ms + makul tolerans — sonsuz asılma OLMADIĞININ kanıtı.
    expect(elapsedMs).toBeLessThan(6000)

    if (!(caughtError instanceof MailDeliveryFailedError)) {
      throw new Error(`beklenmeyen hata tipi: ${String(caughtError)}`)
    }

    // HATA SINIFLARI tablosu (architect): MAIL_DELIVERY_FAILED, 503,
    // isRetryable true, context YALNIZCA { messageKey } — ham e-posta/
    // konu/gövde/belirteç TAŞIMIYOR.
    expect(caughtError.code).toBe('MAIL_DELIVERY_FAILED')
    expect(caughtError.httpStatus).toBe(503)
    expect(caughtError.isRetryable).toBe(true)
    expect(caughtError.context).toEqual({ messageKey: 'auth.emailVerification' })
  }, 8000)
})

describe('renderMailMessage — eksik anahtar / değişken (AC11)', () => {
  // FIX turu 1, madde 9 (solid M-4) — `renderMailMessage`'ın imzası ARTIK
  // `MailMessageKey`'e DARALTILDI (`string` DEĞİL); "katalogda yok" DURUMU
  // artık `renderMailMessage`'ın KENDİSİNDE değil, dış kaynaklı anahtarları
  // DARALTAN `parseMailMessageKey`'de ÖLÇÜLÜR — AYNI runtime garantisi
  // (AC11: sessizce boş içerik DÖNMEZ), yalnızca SORUMLULUK doğru yerde.
  it('katalogda OLMAYAN bir anahtar için parseMailMessageKey throw eder — sessizce boş içerik DÖNMEZ', () => {
    expect(() => parseMailMessageKey('auth.doesNotExist')).toThrow(
      /bilinmeyen e-posta mesaj anahtarı/,
    )
  })

  it('var olan bir anahtar ama eksik değişken için throw eder', () => {
    expect(() => renderMailMessage('auth.emailVerification', {})).toThrow(
      /eksik e-posta mesaj değişkeni/,
    )
  })

  it('her iki katalog anahtarı da Türkçe, sabit yazılı OLMAYAN (anahtar bazlı) içerik üretir', () => {
    const verification = renderMailMessage('auth.emailVerification', { url: 'http://x.test/a' })
    const reset = renderMailMessage('auth.passwordReset', { url: 'http://x.test/b' })

    expect(verification.subject.length).toBeGreaterThan(0)
    expect(reset.subject.length).toBeGreaterThan(0)
    expect(verification.subject).not.toBe(reset.subject)
  })
})
