// @arkesoft/api — INVITATION_RESEND_TOO_SOON (ROADMAP v0.0.14, T-014/S4,
// architect K-A9, R-PM9'un cevabının ikinci ayağı)
//
// AYNI e-posta adresine son davet, bekleme süresi (cooldown) dolmadan TEKRAR
// gönderilmek istendi. `PENDING_INVITATION_LIMIT_REACHED` kiracı BAŞINA
// TOPLAM yüzeyi kapatır; bu hata ADRES BAŞINA tekrarı kapatır — ikisi birlikte
// "bir posta kutusunu davet e-postasıyla doldurmak" senaryosunu oran sınırı
// mekanizmasını açmadan engeller.
//
// ⚠ `isRetryable: true` — DİĞER BEŞ HATADAN FARKLI ve bu bilinçli: reddin
// sebebi GEÇİCİDİR (bekleme süresi dolar) ve çağıran aynı isteği
// DEĞİŞTİRMEDEN tekrarlayabilir. Bayrak bugün yalnızca gelecekteki kuyruk
// davranışını doğru kodlar (`@arkesoft/errors`'ın `isRetryable` sözleşmesi,
// `MailDeliveryFailedError`'ın aynı gerekçesi) — HTTP yanıtı 409'dur, bir
// otomatik yeniden deneme BU SÜRÜMDE yapılmaz.
//
// ⚠ `context` E-POSTA TAŞIMAZ (CLAUDE.md §4): hangi adrese çok erken tekrar
// denendiği loglanmaz. Taşınan tek alan kalan bekleme süresidir (saniye) —
// operatörün bekleme süresi sabitinin mi yoksa saat sapmasının mı sebep
// olduğunu ayırt etmesine yeter.
//
// ⚠ "OPERATÖR BUNU GÖRÜR" İDDİASI T-014 düzeltme turu 1'de GERÇEK OLDU
// (`solid` M-1): o tarihe kadar tRPC yolundan geçen domain hataları HİÇBİR
// YERE yazılmıyordu, yani ne `retryAfterSeconds` ne `isRetryable` operatöre
// ULAŞIYORDU. Kaydı artık `@arkesoft/trpc`'nin `appErrorBoundary`'si yazıyor
// (`trpc.ts` → `logAppError`): 409 bir 4xx olduğu için seviye `warn`,
// `retryAfterSeconds` `context`'in altında ve `isRetryable` kaydın ÜST
// seviyesinde AYRI bir alan olarak görünüyor — yani bu sınıfı kardeşlerinden
// ayıran bayrak artık gözlemlenebilir (sayı BURADA TEKRARLANMIYOR; kardeş
// sayısını kopyalayan bir cümle kaçınılmaz olarak bayatlar).

import { AppError } from '@arkesoft/errors'

export class InvitationResendTooSoonError extends AppError {
  constructor(retryAfterSeconds: number) {
    super({
      code: 'INVITATION_RESEND_TOO_SOON',
      httpStatus: 409,
      userMessageKey: 'errors.member.invitationResendTooSoon',
      context: { retryAfterSeconds },
      isRetryable: true,
    })
  }
}
