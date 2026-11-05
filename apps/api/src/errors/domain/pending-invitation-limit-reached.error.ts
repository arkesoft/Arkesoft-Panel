// @arkesoft/api — PENDING_INVITATION_LIMIT_REACHED (ROADMAP v0.0.14, T-014/S4,
// architect K-A9, R-PM9'un cevabının birinci ayağı)
//
// Kiracı başına BEKLEYEN davet sayısının üst sınırı aşıldı.
//
// ⚠ BU BİR ORAN SINIRI DEĞİL, BİR İŞ KURALIDIR ve ayrım bilinçlidir
// (architect K-A9): oran sınırlama mekanizması (`rate-limit.policy.ts`) bu
// sürümde hiçbir tRPC prosedürünü kapsamıyor ve kapsaması v0.1.0'a vadeli.
// Davet ucu e-posta GÖNDEREN bir yazma ucudur, yani kötüye kullanım yüzeyi
// taşır; yüzey oran sınırı mekanizmasını AÇMADAN üç iş kuralıyla kapatıldı:
// üst sınır (bu hata) + yeniden gönderme bekleme süresi
// (`INVITATION_RESEND_TOO_SOON`) + belirteç TTL'i.
//
// `409`: istek geçerli, aktör yetkili; reddin sebebi kiracının MEVCUT durumu.
// Operatör bekleyen davetleri temizleyince (veya süreleri dolunca) aynı istek
// başarılı olur — ama bu "yeniden dene" demek değildir, bir DURUM
// değişikliğidir → `isRetryable: false`.
//
// `context` yalnızca iki SAYI taşır (PII yok): kaç bekleyen davet görüldü ve
// üst sınır neydi. Operatör sınırın mı yoksa sayımın mı anormal olduğunu
// bu iki değerden ayırt eder.
//
// ⚠ "OPERATÖR AYIRT EDER" İDDİASI T-014 düzeltme turu 1'de GERÇEK OLDU
// (`solid` M-1): o tarihe kadar tRPC yolundan geçen domain hataları HİÇBİR
// YERE yazılmıyordu, yani iki sayı da hiç kimseye ULAŞMIYORDU. Kaydı artık
// `@arkesoft/trpc`'nin `appErrorBoundary`'si yazıyor (`trpc.ts` →
// `logAppError`): 409 bir 4xx olduğu için seviye `warn` ve iki sayı kaydın
// `context` alanının altında görünüyor.

import { AppError } from '@arkesoft/errors'

export class PendingInvitationLimitReachedError extends AppError {
  constructor(pendingCount: number, limit: number) {
    super({
      code: 'PENDING_INVITATION_LIMIT_REACHED',
      httpStatus: 409,
      userMessageKey: 'errors.member.pendingInvitationLimitReached',
      context: { pendingCount, limit },
      isRetryable: false,
    })
  }
}
