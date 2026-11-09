// @arkesoft/api — ACCOUNT_TEMPORARILY_LOCKED (ROADMAP v0.0.15, T-016/S4)
//
// ⚠⚠ `AuthProviderFailedError`'ın (`auth-provider-failed.error.ts`) dosya başı
// yorumuyla AYNI YAPISAL GERÇEK: Better Auth'un `two-factor` eklentisi
// (ÖLÇÜLDÜ, `plugins/two-factor/verify-two-factor.mjs:130-133`) hesap
// kilitlenmesini KENDİ İÇİNDE `APIError.from("TOO_MANY_REQUESTS",
// TWO_FACTOR_ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED)` ile fırlatır — bu,
// normal akışın bir PARÇASIDIR (ör. `EMAIL_NOT_VERIFIED`/`INVALID_EMAIL_OR_
// PASSWORD` gibi) ve `AuthController`'ın delege yolu bu yanıtı OLDUĞU GİBİ
// forward eder (`forwardBetterAuthResponse`), BU SINIFA ASLA DÖNÜŞTÜRMEZ —
// "fail-closed delegasyon yalnızca HANGİ YOLUN iletileceğine karar verir,
// iletilen yoldaki yanıtın İÇERİĞİNE karışmaz" ilkesi `auth-provider-
// failed.error.ts`'te yazılı ve burada da GEÇERLİDİR.
//
// Bu sınıf architect'in "HATA SINIFLARI" sözleşmesinin BAĞLAYICI bir
// parçasıdır (CLAUDE.md §4: her domain hatası `AppError` hiyerarşisinden
// türer, `code`/`httpStatus`/`userMessageKey`/`context` taşır) ve koda
// GELECEKTE ikinci bir çağıran eklenirse (ör. v0.0.15.1'in oturum/step-up
// katmanı, ya da bu kilitlenmeyi tRPC/`packages/trpc` sözleşmesine taşıyan
// bir adaptör) TEK doğruluk kaynağı olarak BURADA durur — `code`/`httpStatus`
// Better Auth'un KENDİ ürettiği `429`/`ACCOUNT_TEMPORARILY_LOCKED` ile
// BİREBİR AYNI (R-PM1'in canlı ölçümü, Task raporu) seçildi; iki ayrı kaynak
// AYNI olayı FARKLI kodlarla anlatmasın.
//
// `context`/`httpHeaders`: `RateLimitExceededError`'ın (`rate-limit-
// exceeded.error.ts`) AYNI deseni — `retryAfterSeconds` PII TAŞIMAZ (ne
// e-posta ne kullanıcı kimliği), yalnızca kalan kilit süresini saniye olarak
// taşır.

import { AppError } from '@arkesoft/errors'

export class AccountTemporarilyLockedError extends AppError {
  constructor(retryAfterSeconds: number) {
    super({
      code: 'ACCOUNT_TEMPORARILY_LOCKED',
      httpStatus: 429,
      userMessageKey: 'errors.auth.accountTemporarilyLocked',
      context: { retryAfterSeconds },
      isRetryable: false,
      httpHeaders: { 'Retry-After': String(retryAfterSeconds) },
    })
  }
}
