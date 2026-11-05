// @arkesoft/api — MemberModule (ROADMAP v0.0.14, T-014/S4)
//
// Üyelik yazma iş mantığının DI evi. HİÇBİR global enhancer
// (`APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER`) KAYDETMEZ — mevcut muhafız
// sırası DEĞİŞMEZ ve `member.*` uçları taşıma katmanının (tRPC controller'ı)
// zaten geçtiği zincirin arkasında kalır.
//
// ⚠ NEDEN AYRI MODÜL (taşıma modülünün `providers`'ına eklenmek yerine): iş
// mantığı bir SUNUM/TAŞIMA detayı değildir (CLAUDE.md §3 sorumluluk
// sınırları). Servis bugün yalnızca tRPC port adaptörü tarafından tüketiliyor
// ama HTTP-dışı bir çağıran (ileride bir kuyruk işi) için de uygun — taşıma
// modülünün içinde doğsaydı o tüketici taşıma modülünü import etmek zorunda
// kalırdı.
//
// ⚠ `MailModule` import edilir (po R-PO3): davet akışı e-posta gönderir ve
// taşıyıcı sağlayıcısı kimlik modülünün DIŞA AÇMADIĞI bir token'dı. Çözüm
// taşıyıcıyı KENDİ modülüne çıkarmaktı; kimlik modülünün export yüzeyi BİR
// token'da KALDI (bkz. `auth/mail/mail.module.ts` dosya başı yorumu).
// ⚠ `AuthModule` BU MODÜLDE İMPORT EDİLMEZ ve tam kimlik örneği token'ı
// HİÇ ANILMAZ.
//
// `PrismaService` `@Global()` olan `PrismaModule`'den, `API_ENV` ise
// `@Global()` olan yapılandırma modülünden gelir — ikisi de burada
// listelenmez.

import { Module } from '@nestjs/common'

import { MailModule } from '../auth/mail/mail.module.js'
import { MemberService } from './member.service.js'

@Module({
  imports: [MailModule],
  providers: [MemberService],
  exports: [MemberService],
})
export class MemberModule {}
