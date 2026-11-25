// @arkesoft/api — RATE_LIMIT_STORE_UNAVAILABLE (ROADMAP v0.0.5, T-006/S8,
// FIX turu 2, security tur2 S-7)
//
// `RateLimitService.checkAndIncrement()`'in ALTINDAKİ Redis (`ioredis`)
// bağlantısı ULAŞILAMAZKEN fırlatılır. ÖNCESİ (ÖLÇÜLDÜ, security tur2):
// ioredis hatası SARILMADAN yukarı çıkıyordu → `AppExceptionFilter`
// `mapUnknownError`'a düşüp 500 `INTERNAL_ERROR` üretiyordu, oysa
// `/health/ready` AYNI arızada DOĞRU şekilde 503 + `{"redis":"down"}`
// veriyordu — iki yol TUTARSIZDI (CLAUDE.md §4 "dış sağlayıcı hataları
// adaptör içinde çevrilir; sağlayıcıya özgü tip adaptör dışına çıkmaz").
//
// 503 + `isRetryable: true` — `DependencyUnavailableError`/
// `TenantResolutionFailedError` İLE AYNI sınıf (geçici bağımlılık arızası).
// **GÜVENLİK YÖNÜ BİLEREK FAIL-CLOSED KORUNUR:** bu hata guard'ın
// `canActivate()`'inden YUKARI fırlar — istek REDDEDİLİR, sayaç
// yazılamadığında `true` dönüp isteği GEÇİRMEK (fail-open) BURADA YAPILMAZ
// (security tur2: "fail-open'a çevirme — o `high` olurdu").
//
// `context` — `describeErrorCause()`'un ürettiği `{causeCode, causeMessage}`
// (`AggregateError`-farkında, bkz. `errors/describe-error-cause.ts`) —
// yalnızca LOGLANIR, `toErrorBody` tele ASLA serileştirmez. Ham ioredis
// nesnesi/bağlantı dizesi BURADA YOK, `cause` olarak zincirlenir.
//
// `logLevel: 'error'` (ROADMAP v0.0.17, T-028/S8, architect K-A28-5 adayı,
// po A-PO3): Redis'in ULAŞILAMAZ olması, fail-closed davranışla TÜM oran
// sınırlı trafiği reddeder — bu bir kullanıcı hatası DEĞİL, platform
// genelinde erişimi kesen bir altyapı arızasıdır; varsayılan `'warn'`
// bu aciliyeti YANSITMAZ.

import { AppError, ERROR_MESSAGE_KEYS } from '@arkesoft/errors'

import { describeErrorCause } from '../describe-error-cause.js'

export class RateLimitStoreUnavailableError extends AppError {
  constructor(cause: unknown) {
    const described = describeErrorCause(cause)
    super({
      code: 'RATE_LIMIT_STORE_UNAVAILABLE',
      httpStatus: 503,
      userMessageKey: ERROR_MESSAGE_KEYS.RATE_LIMIT_STORE_UNAVAILABLE,
      context: { causeCode: described.causeCode, causeMessage: described.causeMessage },
      isRetryable: true,
      cause,
      logLevel: 'error',
    })
  }
}
