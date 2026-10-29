// @arkesoft/api — AUTH_PROVIDER_FAILED (ROADMAP v0.0.5, T-006/S5, architect
// "HATA SINIFLARI" bölümü)
//
// `AuthController`'ın delege yolunda `auth.handler()` BEKLENMEDİK şekilde
// REDDETTİĞİNDE/fırlattığında (ör. veritabanına erişilemiyor) fırlatılır.
// Better Auth'un KENDİ ürettiği, normal akışın bir parçası olan hata
// yanıtları (400/401/403 — ör. `EMAIL_NOT_VERIFIED`, `INVALID_EMAIL_OR_
// PASSWORD`) BU HATAYA GİRMEZ; onlar Better Auth'un ürettiği `Response`
// OLDUĞU GİBİ forward edilir (`AuthController`, "fail-closed delegasyon"
// yalnızca HANGİ YOLUN iletileceğine karar verir, iletilen yoldaki yanıtın
// İÇERİĞİNE karışmaz). Bu sınıf yalnızca sağlayıcının KENDİSİNİN
// beklenmedik şekilde çöktüğü (hata yutulmadı, CLAUDE.md §10.16) durum
// içindir — `isRetryable: true` ileride (v0.0.11) bir kuyruk tüketicisi
// için ÖNCEDEN doğru kodlanmış bayrak.

import { AppError } from '@arkesoft/errors'

export class AuthProviderFailedError extends AppError {
  constructor(cause: unknown) {
    super({
      code: 'AUTH_PROVIDER_FAILED',
      httpStatus: 503,
      userMessageKey: 'errors.auth.providerFailed',
      isRetryable: true,
      cause,
    })
  }
}
