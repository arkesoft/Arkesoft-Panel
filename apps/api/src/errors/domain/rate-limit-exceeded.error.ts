// @arkesoft/api — RATE_LIMIT_EXCEEDED (ROADMAP v0.0.5, T-006/S8, architect
// "HATA SINIFLARI" bölümü, AC7)
//
// `RateLimitGuard`'ın (`auth/rate-limit/rate-limit.guard.ts`) fırlattığı TEK
// hata. `httpHeaders: { 'Retry-After': ... }` — S3'ün ADDITIVE
// `AppErrorOptions.httpHeaders` alanı üzerinden, `instanceof` ZİNCİRİ
// OLMADAN tele taşınır (`error-mapping.ts`/`app-exception.filter.ts`
// OLDUĞU GİBİ aktarır, DOKUNULMADI — PO riski 8).
//
// `context: {scope, retryAfterSeconds}` — YALNIZCA loglanır (`toErrorBody`
// asla serileştirmez). `scope` ham e-posta/IP TAŞIMAZ, yalnızca
// `'account' | 'ip'` etiketi — architect'in varlık-sızdırmazlık kısıtının
// gerçek garantisi burada DEĞİL, `RateLimitGuard`'ın sayaç artırma SIRASINDA
// (DB'ye hiç bakmadan) sağladığı davranışsal eşdeğerlikte: var olan/var
// olmayan e-posta için status + gövde şekli + `Retry-After` AYIRT EDİLEMEZ.

import { AppError } from '@arkesoft/errors'

export type RateLimitScope = 'account' | 'ip'

export class RateLimitExceededError extends AppError {
  constructor(scope: RateLimitScope, retryAfterSeconds: number) {
    super({
      code: 'RATE_LIMIT_EXCEEDED',
      httpStatus: 429,
      userMessageKey: 'errors.auth.rateLimitExceeded',
      context: { scope, retryAfterSeconds },
      isRetryable: false,
      httpHeaders: { 'Retry-After': String(retryAfterSeconds) },
    })
  }
}
