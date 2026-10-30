// @arkesoft/api — DEPENDENCY_UNAVAILABLE (ROADMAP v0.0.4, T-002/ST-4, architect K-A8)
//
// `GET /health/ready`'nin (ST-6) döneceği hata. `checks` ayrı TİPLİ bir alan
// (`ValidationError.fields` ile aynı desen); bağımlılık adı/durumu PII/sır
// İÇERMEZ, tele yazılmaya UYGUNDUR. `isRetryable: true`: bağımlılık geçici
// olarak erişilemez olabilir, çağıran yeniden deneyebilir.
//
// ROADMAP v0.0.6, T-007/ST-1, architect K3 (ADR-0010 §1): `details.checks`
// artık `error-mapping.ts`'teki merkezi bir `instanceof` zincirinden değil,
// bu sınıfın `override get publicDetails()`'inden gelir.

import { AppError } from '@arkesoft/errors'

/** Tek bir bağımlılık kontrolünün sonucu. */
export type DependencyCheckStatus = 'up' | 'down'

export class DependencyUnavailableError extends AppError {
  readonly checks: Record<string, DependencyCheckStatus>

  constructor(checks: Record<string, DependencyCheckStatus>) {
    super({
      code: 'DEPENDENCY_UNAVAILABLE',
      httpStatus: 503,
      userMessageKey: 'errors.dependency.unavailable',
      context: { checks },
      isRetryable: true,
    })
    this.checks = checks
  }

  override get publicDetails(): Readonly<Record<string, unknown>> {
    return { checks: this.checks }
  }
}
