// @arkesoft/api — tek hata zarfına eşleme (ROADMAP v0.0.4, T-002/ST-4, architect K4)
//
// `AppExceptionFilter`'ın (`@Catch()` → yakalanan değer tipi `unknown`) olası
// ÜÇ hata TÜRÜNÜ tek tel sözleşmesine (`AppErrorBody`) çevirir:
//   1. `@arkesoft/errors`'un `AppError` alt sınıfları (platformun kendi hataları)
//   2. NestJS'in kendi `HttpException`'ları (ör. yönlendirme bulunamadı 404'ü)
//   3. Bilinmeyen (sınıflandırılamayan) her şey
//
// EXHAUSTIVE eşleme + `assertNever`: yeni bir hata TÜRÜ eklenirse (bugün yok,
// ama disiplin budur) derleme zamanında `default` dalı yakalar.
//
// SIZDIRMAZLIK (CLAUDE.md §17 + A-V25): ham `HttpException`/bilinmeyen hata
// mesajı `body.message`'A ASLA YAZILMAZ — yalnızca `logContext` üzerinden
// loglanır (`AppExceptionFilter` bunu `getLogger()`/`context.logger` ile yazar).

import { HttpException } from '@nestjs/common'
import { isAppError, toErrorBody } from '@arkesoft/errors'
import type { AppError, AppErrorBody } from '@arkesoft/errors'

import { DependencyUnavailableError } from './domain/dependency-unavailable.error.js'
import { ValidationError } from './domain/validation.error.js'

export type ErrorMappingResult = {
  readonly httpStatus: number
  readonly body: AppErrorBody
  /** Yalnızca LOGLANACAK bağlam — tel sözleşmesine (body) hiçbir zaman girmez. */
  readonly logContext: Record<string, unknown>
}

type ClassifiedError =
  | { readonly kind: 'app-error'; readonly error: AppError }
  | { readonly kind: 'http-exception'; readonly error: HttpException }
  | { readonly kind: 'unknown'; readonly error: unknown }

function classifyError(error: unknown): ClassifiedError {
  if (isAppError(error)) {
    return { kind: 'app-error', error }
  }

  if (error instanceof HttpException) {
    return { kind: 'http-exception', error }
  }

  return { kind: 'unknown', error }
}

/**
 * Bazı `AppError` alt sınıfları tel sözleşmesine ÖZEL bir `details` şekli
 * taşır (`ValidationError.fields`, `DependencyUnavailableError.checks`).
 * Diğerleri (ör. `TenantNotFoundError`) `toErrorBody`'nin varsayılanını
 * (`{}`) kullanır — AC8 sızdırmazlığı budur: hangi sebepten çözülemediği
 * tel üstüne ASLA yazılmaz.
 */
function resolveAppErrorDetails(error: AppError): Record<string, unknown> | undefined {
  if (error instanceof ValidationError) {
    return { fields: error.fields }
  }

  if (error instanceof DependencyUnavailableError) {
    return { checks: error.checks }
  }

  return undefined
}

function mapAppError(error: AppError, requestId: string): ErrorMappingResult {
  const details = resolveAppErrorDetails(error)
  const body = toErrorBody(error, requestId, details)

  return {
    httpStatus: error.httpStatus,
    body,
    logContext: { code: error.code, isRetryable: error.isRetryable, context: error.context },
  }
}

/**
 * Nest'in kendi `HttpException`'ları (ör. eşleşmeyen rota için ürettiği
 * dahili 404) platformun `AppError` hiyerarşisinden GELMEZ. Ham mesajı
 * (`error.message`) tel üstüne YAZMAYIZ — sabit, i18n anahtarlı bir gövdeye
 * eşleriz; ham mesaj yalnızca `logContext`'te kalır.
 */
function mapHttpException(error: HttpException, requestId: string): ErrorMappingResult {
  const httpStatus = error.getStatus()

  const body: AppErrorBody = {
    code: 'HTTP_EXCEPTION',
    message: 'errors.http.generic',
    details: {},
    requestId,
  }

  return {
    httpStatus,
    body,
    logContext: { nestHttpStatus: httpStatus, nestMessage: error.message },
  }
}

/**
 * Hiçbir bilinen türe uymayan (fırlatılan değer `Error` da olmayabilir —
 * `@typescript-eslint/only-throw-error` kaynak kodda bunu engeller ama
 * `unknown` kaynaklardan — ör. üçüncü parti kütüphane — her zaman gelebilir)
 * her şey. 500 + genel kod; ham mesaj YALNIZCA loglanır (CLAUDE.md §17).
 */
function mapUnknownError(error: unknown, requestId: string): ErrorMappingResult {
  const body: AppErrorBody = {
    code: 'INTERNAL_ERROR',
    message: 'errors.internal.unknown',
    details: {},
    requestId,
  }

  return {
    httpStatus: 500,
    body,
    logContext: {
      rawMessage: error instanceof Error ? (error.stack ?? error.message) : String(error),
    },
  }
}

function assertNever(value: never): never {
  throw new Error(`error-mapping.ts: beklenmeyen sınıflandırma — ${JSON.stringify(value)}`)
}

/** `AppExceptionFilter`'ın yakaladığı HER hatayı tek tel sözleşmesine çevirir. */
export function mapErrorToResponse(error: unknown, requestId: string): ErrorMappingResult {
  const classified = classifyError(error)

  switch (classified.kind) {
    case 'app-error':
      return mapAppError(classified.error, requestId)
    case 'http-exception':
      return mapHttpException(classified.error, requestId)
    case 'unknown':
      return mapUnknownError(classified.error, requestId)
    default:
      return assertNever(classified)
  }
}
