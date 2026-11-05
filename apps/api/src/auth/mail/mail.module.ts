// @arkesoft/api — MailModule (ROADMAP v0.0.14, T-014/S4, po R-PO3)
//
// ⚠⚠ NEDEN YENİ BİR MODÜL — VE NEDEN KİMLİK MODÜLÜNÜN EXPORT YÜZEYİ
// BÜYÜTÜLMEDİ:
//
// `MAIL_TRANSPORT` sağlayıcısı v0.0.5'ten beri kimlik modülünün İÇİNDE
// yaşıyordu ve o modül `exports` listesini BİLİNÇLİ olarak TEK bir token'a
// daraltmıştı (T-006 FIX turu 1 madde 3 + `security` tur 4 sertleştirmesi:
// tam kimlik örneği yüzeyi — `listSessions`/`revokeSession`/... — DIŞA
// AÇILMIYOR). Üye davet akışı o dizinin DIŞINDA yaşıyor ve e-posta gönderecek,
// yani taşıyıcıya DI üzerinden ulaşması gerekiyor.
//
// İki seçenek vardı: (a) kimlik modülünün `exports` dizisine ikinci bir token
// eklemek, (b) taşıyıcıyı KENDİ modülüne çıkarmak. **(b) seçildi** çünkü
// ölçülebilir bir güvenlik farkı var: (b)'de kimlik modülünün dışa açık
// yüzeyi BİR token'da KALIR (`git diff` o satırda BOŞ'tur) ve sertleştirme
// yorumunun iddiası LİTERAL OLARAK doğru kalmaya devam eder. (a) o yüzeyi
// ikiye çıkarır ve "yüzey daraltıldı" beyanı bir sonraki okuyucu için
// bayatlar.
//
// ⚠ KİMLİK ÖRNEĞİ TOKEN'I YENİDEN AÇILMADI ve bu modül onu HİÇ ANMAZ.
//
// ⚠ TEK ÖRNEK KORUNUR: taşıyıcı kaynağı (ve dolayısıyla SMTP bağlantı havuzu)
// yalnızca BURADA kurulur; kimlik modülü bu modülü `imports` eder ve AYNI
// token'ı tüketir. İkinci bir SMTP soketi AÇILMAZ — Nest sağlayıcıları
// tanımlandıkları modülde tekildir ve `exports` yalnızca GÖRÜNÜRLÜK verir.
//
// ⚠ KONUM: dosya `auth/mail/` altında KALDI, taşınmadı. `mail-transport.types.ts`'in
// yazılı yol haritası bu dizinin tamamının v0.9.0'da sipariş bildirimleriyle
// birlikte entegrasyon paketine SAF bir taşıma ile gitmesi — dizini şimdi
// bölmek o taşımayı iki parçaya ayırırdı.

import { Inject, Injectable, Module } from '@nestjs/common'
import type { OnModuleDestroy, Provider } from '@nestjs/common'

import type { ApiEnv } from '../../config/api-env.js'
import { API_ENV } from '../../config/config.tokens.js'
import { MAIL_TRANSPORT } from './mail-transport.types.js'
import type { MailTransport } from './mail-transport.types.js'
import { SmtpMailTransport } from './smtp-mail-transport.js'

/**
 * SMTP taşıyıcısını `ApiEnv`'den kuran ve yaşam döngüsünü yöneten kaynak
 * (v0.0.5'te kimlik modülünde tanımlıydı, BİREBİR taşındı — davranış
 * değişmedi). `OnModuleDestroy` kapanışta soketi serbest bırakır; test
 * teardown'ı sarkan handle bırakmaz.
 */
@Injectable()
class MailTransportResource implements OnModuleDestroy {
  readonly transport: SmtpMailTransport

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.transport = new SmtpMailTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      fromName: env.MAIL_FROM_NAME,
      fromAddress: env.MAIL_FROM_ADDRESS,
    })
  }

  onModuleDestroy(): void {
    this.transport.close()
  }
}

const mailTransportProvider: Provider = {
  provide: MAIL_TRANSPORT,
  useFactory: (resource: MailTransportResource): MailTransport => resource.transport,
  inject: [MailTransportResource],
}

@Module({
  providers: [MailTransportResource, mailTransportProvider],
  // ⚠ YALNIZCA taşıyıcı token'ı dışa açılır — kaynağın KENDİSİ
  // (`MailTransportResource`, somut SMTP sınıfını ve yapılandırmasını taşır)
  // AÇILMAZ. Tüketici `MailTransport` ARAYÜZÜNÜ görür, hangi somut sınıfın
  // bağlı olduğunu BİLMEZ (CLAUDE.md §10 md 12'nin ruhu: sağlayıcı seçimi
  // DI'dadır, çağıranda bir dallanma YOKTUR).
  exports: [MAIL_TRANSPORT],
})
export class MailModule {}
