// @arkesoft/api — MailTransport arayüzü (ROADMAP v0.0.5, T-006/S4, architect
// "MODÜL YERLEŞİMİ" / CLAUDE.md §8)
//
// Bu dosya KASITLI OLARAK `packages/integrations`'TA DEĞİL. §8'in dokuz
// adımlı adaptör reçetesi KİRACININ yapılandırdığı, `TenantIntegrationConfig`
// üzerinden seçilen sağlayıcılar içindir (ödeme, kargo, SMS, e-fatura).
// Platformun kendi İŞLEMSEL e-postası (e-posta doğrulama, şifre sıfırlama)
// kiracı seçimi DEĞİLDİR — `providerRegistry`'ye GİRMEZ, tenant başına
// değişmez (architect kararı, T-006/S4 handoff'u teyit eder).
//
// YİNE DE §8'İN RUHU UYGULANIYOR (en az iki sağlayıcı düşünülerek tasarım,
// CLAUDE.md §10.12 "çekirdek sağlayıcı adı bilmez"): `MailTransport` arayüzü
// hiçbir yerde `if (provider === 'smtp')` dallanması DOĞURMAYACAK şekilde
// soyutlanmıştır. v0.9.0 (sipariş bildirimleri) bu dosyayı SAF `git mv` ile
// `packages/integrations/src/mail/` ALTINA taşıyabilmeli — arayüz zaten
// sağlayıcıdan bağımsız; taşımada değişmesi gereken yalnızca import
// yollarıdır.
//
// İKİNCİ BİR SAĞLAYICI NASIL EKLENİR/KALDIRILIR (rapor kanıtı): örn. bir
// `HttpApiMailTransport` (Resend/Postmark gibi HTTP tabanlı bir sağlayıcı)
// eklemek/kaldırmak TEK bir yeni/silinen dosyadır (`http-api-mail-transport.ts`)
// — `MailTransport` arayüzü, `MailEnvelope` tipi ve bunu TÜKETEN hiçbir kod
// (ör. ileride `AuthModule`'ün DI provider'ı) DEĞİŞMEZ; yalnızca hangi somut
// sınıfın `MAIL_TRANSPORT` token'ına bağlandığı (DI `useClass`/`useFactory`)
// değişir.

/**
 * Bir e-postanın gönderilmeye hazır, sağlayıcıdan bağımsız hâli.
 *
 * `messageKey` İÇERİK DEĞİL — hangi katalog anahtarının (`messages.ts`)
 * bu zarfı ÜRETTİĞİNİN izidir. Sağlayıcı hata üretirse `MailDeliveryFailedError`
 * bunu `context.messageKey` olarak taşır; ham konu/gövde/e-posta adresi HİÇBİR
 * ZAMAN hata bağlamına (ve dolayısıyla log'a) YAZILMAZ (CLAUDE.md §9/§10.7).
 */
export interface MailEnvelope {
  /** Alıcı e-posta adresi. */
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html: string
  /** Bu zarfı üreten katalog anahtarı (`messages.ts` → `MailMessageKey`). */
  readonly messageKey: string
}

/**
 * Sağlayıcıdan bağımsız e-posta gönderim sözleşmesi. Çekirdek (ör. ileride
 * `AuthModule`) yalnızca bu arayüze bağımlıdır; hangi somut sınıfın
 * (`SmtpMailTransport` veya ileride bir HTTP API taşıması) bağlı olduğunu
 * BİLMEZ — seçim DI üzerinden gelir, `if (provider === ...)` YOKTUR.
 *
 * Başarısızlık `Promise` reddi ile iletilir; implementasyonlar bunu her
 * zaman `MailDeliveryFailedError`'a (ADDITIVE, `isRetryable: true`) çevirir —
 * hiçbir implementasyon hatayı YUTMAZ (CLAUDE.md §10.16).
 */
export interface MailTransport {
  send(envelope: MailEnvelope): Promise<void>
}

/**
 * `MAIL_TRANSPORT` DI token'ı. `config/config.tokens.ts`'teki desenle AYNI
 * (açık `@Inject(TOKEN)`, tip çıkarımına dayanan DI yok). Henüz hiçbir modül
 * (`AuthModule` S5'te doğacak) bunu `provide` ETMİYOR — bu alt görev yalnızca
 * sözleşmeyi ve SMTP implementasyonunu taşır, DI kurulumu SONRAKİ alt görevin
 * işi.
 */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT')

/**
 * `SmtpMailTransport`'un ihtiyaç duyduğu asgari yapılandırma. BİLEREK
 * `ApiEnv`'den (apps/api/src/config/api-env.ts) AYRI bir tip: bu dosya
 * v0.9.0'da `packages/integrations/src/mail/`'e taşınacağı için apps/api'ye
 * özgü env şekline bağımlı OLAMAZ. Değerler `SMTP_*` / `MAIL_FROM_*` env'inden
 * (`packages/config/src/env.ts:91-95`, zaten mevcut) DI provider fabrikasında
 * eşlenir (S5'in işi) — bu dosya `process.env`'e hiç DOKUNMAZ.
 */
export interface SmtpMailTransportConfig {
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly fromName: string
  readonly fromAddress: string
}
