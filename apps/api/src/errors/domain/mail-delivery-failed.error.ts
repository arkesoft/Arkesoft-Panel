// @arkesoft/api — MAIL_DELIVERY_FAILED (ROADMAP v0.0.5, T-006/S4, architect
// "HATA SINIFLARI" bölümü)
//
// `MailTransport.send()` implementasyonlarının (bugün: `SmtpMailTransport`)
// başarısızlıkta fırlattığı TEK hata. Başarısızlık YUTULMAZ (CLAUDE.md
// §10.16) — çağıran (ileride `AuthModule`) bunu 503'e çevirir. `isRetryable:
// true`: v0.0.11'de BullMQ'ya taşındığında (`mail.send` işi, bağlayıcı devir
// notu) kuyruk bu bayrağa göre exponential backoff + 5 deneme + DLQ kararı
// verir; bugün (kuyruk yok, senkron gönderim) bayrak yalnızca gelecekteki
// davranışı ÖNCEDEN doğru kodlar.
//
// `context: { messageKey }` — HAM e-posta adresi, konu, gövde veya SMTP
// sağlayıcısının ham yanıtı BURADA YOKTUR (CLAUDE.md §9/§10.7). `messageKey`
// bir katalog anahtarıdır (`auth/mail/messages.ts` → `MailMessageKey`), PII
// DEĞİLDİR — hangi e-postanın (doğrulama/sıfırlama) gönderilemediğini
// loglamaya yeter, kime gönderilmeye çalışıldığını SIZDIRMAZ.
//
// `logLevel: 'error'` (ROADMAP v0.0.17, T-028/S8, architect K-A28-5 adayı,
// po A-PO3): e-posta gönderim arızası doğrulama/parola sıfırlama gibi
// kritik kimlik akışlarını BLOKE EDER — tekrarlayan bir arıza SMTP
// yapılandırmasının/sağlayıcının BOZUK olduğuna işaret eder; varsayılan
// `'warn'` operatörü yeterince hızlı uyarmaz.

import { AppError, ERROR_MESSAGE_KEYS } from '@arkesoft/errors'

export class MailDeliveryFailedError extends AppError {
  readonly messageKey: string

  constructor(messageKey: string, cause: unknown) {
    super({
      code: 'MAIL_DELIVERY_FAILED',
      httpStatus: 503,
      userMessageKey: ERROR_MESSAGE_KEYS.MAIL_DELIVERY_FAILED,
      context: { messageKey },
      isRetryable: true,
      cause,
      logLevel: 'error',
    })
    this.messageKey = messageKey
  }
}
