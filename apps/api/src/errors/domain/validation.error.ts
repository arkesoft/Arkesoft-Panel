// @arkesoft/api — VALIDATION_ERROR (ROADMAP v0.0.4, T-002/ST-4, architect K-A6)
//
// `ZodValidationPipe`'ın fırlattığı tek hata. `fields` ayrı bir TİPLİ alan
// olarak tutulur (yalnızca `AppError.context` içine gömülmez). `fields`
// değerleri HER ZAMAN i18n anahtarıdır (`errors.validation.<issueCode>`),
// Zod'un ham mesaj metni DEĞİL (CLAUDE.md §17 + girdi değeri sızma riski —
// Zod mesajı doğrulanan değeri içerebilir) — bu yüzden PII/sır içermeyen bu
// alan `publicDetails` ile tele yazılmaya UYGUNDUR.
//
// ROADMAP v0.0.6, T-007/ST-1, architect K3 (ADR-0010 §1): `details.fields`
// artık `error-mapping.ts`'teki merkezi bir `instanceof` zincirinden değil,
// bu sınıfın `override get publicDetails()`'inden gelir — "bu hatanın tel
// üstündeki detayı nedir" bilgisi hatanın KENDİSİNDE durur.

import { AppError } from '@arkesoft/errors'

export class ValidationError extends AppError {
  readonly fields: Record<string, string>

  constructor(fields: Record<string, string>) {
    super({
      code: 'VALIDATION_ERROR',
      httpStatus: 400,
      userMessageKey: 'errors.validation.failed',
      context: { fields },
      isRetryable: false,
    })
    this.fields = fields
  }

  override get publicDetails(): Readonly<Record<string, unknown>> {
    return { fields: this.fields }
  }
}
