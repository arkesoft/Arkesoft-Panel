// @arkesoft/api — SmtpMailTransport (ROADMAP v0.0.5, T-006/S4, architect
// "SMTP taşıması" bölümü, Kullanıcı Onayı 2026-10-29: `nodemailer`)
//
// `nodemailer`'ın TEK import noktası — kanıt (DoD):
// `grep -rln "nodemailer" apps/api/src` → bu dosya, tek satır. `MailTransport`
// arayüzünün ARKASINDA kalır; çekirdek (ileride `AuthModule`) `nodemailer`'ı
// hiçbir zaman İTHAL ETMEZ, sağlayıcıya özgü tip (`Transporter`, `SentMessageInfo`
// vb.) bu dosyanın DIŞINA SIZMAZ (CLAUDE.md §8/§10.12).
//
// ARKA PLAN İŞİ (architect, v0.0.11'e devir notu): kuyruk YOK, gönderim
// SENKRONDUR — bilinçli. Dayanıklılık burada, kuyrukta değil kurulur:
//   (1) 5 saniyelik SERT zaman aşımı, `health/with-timeout.ts` YENİDEN
//       KULLANILIR (yeni bir zaman aşımı yardımcısı YAZILMAZ — o dosya
//       sarkan zamanlayıcı bırakmamak için zaten yazıldı, `finally`'de
//       `clearTimeout` çağırır).
//   (2) `nodemailer`'ın KENDİ ağ zaman aşımları (`connectionTimeout`/
//       `greetingTimeout`/`socketTimeout`) AYNI bütçeye sabitlenir — aksi
//       hâlde `withTimeout` dış yarışı 5 sn'de kaybetse bile nodemailer'ın
//       alttaki TCP soketi kendi (varsayılan ÇOK daha uzun) zaman aşımına
//       kadar açık kalabilir ve test/süreç kapanışında "sarkan handle"
//       üretebilir (DoD #4).
//   (3) Başarısızlık YUTULMAZ (CLAUDE.md §10.16): `MailDeliveryFailedError`
//       (`isRetryable: true`) olarak YUKARI iletilir — `null` dönmek veya
//       sessizce devam etmek YOK.

import { createTransport } from 'nodemailer'
import type { Transporter } from 'nodemailer'

import { withTimeout } from '../../health/with-timeout.js'
import { MailDeliveryFailedError } from '../../errors/domain/mail-delivery-failed.error.js'
import type {
  MailEnvelope,
  MailTransport,
  SmtpMailTransportConfig,
} from './mail-transport.types.js'

/**
 * SMTP gönderiminin sert zaman aşımı bütçesi (architect, bağlayıcı: "5
 * saniye"). `nodemailer`'ın kendi ağ zaman aşımlarıyla AYNI değer — ikisi
 * birbirinden bağımsız iki koruma katmanı değil, TEK bir bütçenin iki
 * uygulanışıdır (yukarıdaki dosya başı notu madde 2).
 */
const SMTP_SEND_TIMEOUT_MS = 5000

export class SmtpMailTransport implements MailTransport {
  private readonly transporter: Transporter
  private readonly fromHeader: string

  constructor(config: SmtpMailTransportConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      // Üçü de SMTP_SEND_TIMEOUT_MS ile hizalı — bkz. dosya başı notu madde 2.
      connectionTimeout: SMTP_SEND_TIMEOUT_MS,
      greetingTimeout: SMTP_SEND_TIMEOUT_MS,
      socketTimeout: SMTP_SEND_TIMEOUT_MS,
    })
    this.fromHeader = `"${config.fromName}" <${config.fromAddress}>`
  }

  async send(envelope: MailEnvelope): Promise<void> {
    try {
      await withTimeout(
        this.transporter.sendMail({
          from: this.fromHeader,
          to: envelope.to,
          subject: envelope.subject,
          text: envelope.text,
          html: envelope.html,
        }),
        SMTP_SEND_TIMEOUT_MS,
      )
    } catch (error) {
      // Ham SMTP/ağ hatası (sağlayıcıya özgü tip) BURADA biter — yukarı
      // SADECE `MailDeliveryFailedError` çıkar (CLAUDE.md §8 adaptör
      // disiplini). `error` yalnızca `cause` olarak taşınır, HİÇBİR ZAMAN
      // loglanacak `context`'e YAZILMAZ (context: { messageKey } yeterlidir —
      // bkz. mail-delivery-failed.error.ts).
      throw new MailDeliveryFailedError(envelope.messageKey, error)
    }
  }

  /**
   * Taşıyıcının alttaki kaynaklarını (varsa açık soket/havuz) serbest bırakır.
   * `MailTransport` arayüzünün PARÇASI DEĞİL — bu, SMTP'ye özgü bir yaşam
   * döngüsü ayrıntısıdır (ör. test teardown'ı, ileride `OnModuleDestroy`).
   * İkinci bir sağlayıcının (ör. HTTP API tabanlı) `close()`'u hiç OLMAYABİLİR
   * — arayüz bunu dayatmaz, bu yüzden `MailTransport`'a EKLENMEDİ.
   */
  close(): void {
    this.transporter.close()
  }
}
