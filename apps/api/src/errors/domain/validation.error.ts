// @arkesoft/api — VALIDATION_ERROR (ROADMAP v0.0.4, T-002/ST-4, architect K-A6)
//
// `ZodValidationPipe`'ın fırlattığı tek hata. `fields` ayrı bir TİPLİ alan
// olarak tutulur (yalnızca `AppError.context` içine gömülmez) — `error-mapping.ts`
// bu alanı OKUYARAK `details.fields`'i üretir; `context`'i okumaz (A-V25,
// context tel sözleşmesine ASLA serileşmez). `fields` değerleri HER ZAMAN
// i18n anahtarıdır (`errors.validation.<issueCode>`), Zod'un ham mesaj metni
// DEĞİL (CLAUDE.md §17 + girdi değeri sızma riski — Zod mesajı doğrulanan
// değeri içerebilir).

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
}
