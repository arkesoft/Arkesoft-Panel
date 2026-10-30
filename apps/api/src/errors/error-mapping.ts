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
//
// ROADMAP v0.0.6, T-007/ST-1, architect K3 (ADR-0010 §1/§2): "bu hatanın
// `details`'i nedir" bilgisi artık burada bir `instanceof` zinciriyle
// DURMUYOR — `toErrorBody` `error.publicDetails`'i doğrudan okur
// (`ValidationError`/`DependencyUnavailableError` kendi `override get
// publicDetails()`'ini taşır). Yeni bir `details` taşıyan hata sınıfı bu
// dosyayı DÜZENLEMEZ (AC9(b)'nin "tek doğruluk kaynağı" şartı). Çerçeve
// kaynaklı/bilinmeyen hata gövdeleri de `@arkesoft/errors`'un fabrikalarından
// gelir — literal kopyası burada YOK (AC10, "iki yüzey birebir aynı gövde"
// YAPI ile sağlanır, `packages/trpc` AYNI fonksiyonları çağıracak).

import { HttpException } from '@nestjs/common'
import {
  genericTransportErrorBody,
  isAppError,
  toErrorBody,
  unknownErrorBody,
} from '@arkesoft/errors'
import type { AppError, AppErrorBody } from '@arkesoft/errors'

import { assertNever } from './assert-never.js'

export type ErrorMappingResult = {
  readonly httpStatus: number
  readonly body: AppErrorBody
  /** Yalnızca LOGLANACAK bağlam — tel sözleşmesine (body) hiçbir zaman girmez. */
  readonly logContext: Record<string, unknown>
  /**
   * ADDITIVE (ROADMAP v0.0.5, T-006/S3, architect "HATA SINIFLARI" / AC7).
   * `AppError.httpHeaders`'ın OLDUĞU GİBİ taşındığı yer — `AppExceptionFilter`
   * bunu `httpAdapter.setHeader()` ile yazar. Yalnızca `mapAppError` doldurur;
   * `mapHttpException`/`mapUnknownError` hiçbir zaman bu alanı SET ETMEZ
   * (`exactOptionalPropertyTypes` — alan YOKSA hiç yazılmaz, `undefined`
   * ATANMAZ). **`body`'ye ASLA girmez** (PO riski 8, `error-body.ts`'in
   * `toErrorBody` imzası bu alanı zaten OKUMUYOR).
   */
  readonly httpHeaders?: Readonly<Record<string, string>>
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

function mapAppError(error: AppError, requestId: string): ErrorMappingResult {
  const body = toErrorBody(error, requestId)
  const logContext = { code: error.code, isRetryable: error.isRetryable, context: error.context }

  // `exactOptionalPropertyTypes`: `httpHeaders` alanı YOKSA hiç YAZILMAZ —
  // `undefined` değeri açıkça atanmaz (PO riski 8'in diğer yüzü: alan
  // olmadığında "yok" ile "boş" ayrımı tip seviyesinde de korunur).
  if (error.httpHeaders === undefined) {
    return { httpStatus: error.httpStatus, body, logContext }
  }

  return { httpStatus: error.httpStatus, body, logContext, httpHeaders: error.httpHeaders }
}

/**
 * Nest'in kendi `HttpException`'ları (ör. eşleşmeyen rota için ürettiği
 * dahili 404) platformun `AppError` hiyerarşisinden GELMEZ. Ham mesajı
 * (`error.message`) tel üstüne YAZMAYIZ — sabit, i18n anahtarlı bir gövdeye
 * eşleriz; ham mesaj yalnızca `logContext`'te kalır.
 */
function mapHttpException(error: HttpException, requestId: string): ErrorMappingResult {
  const httpStatus = error.getStatus()
  const body: AppErrorBody = genericTransportErrorBody(requestId)

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
  const body: AppErrorBody = unknownErrorBody(requestId)

  return {
    httpStatus: 500,
    body,
    logContext: {
      rawMessage: error instanceof Error ? (error.stack ?? error.message) : String(error),
    },
  }
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
      return assertNever(classified, 'error-mapping.ts: ClassifiedError.kind')
  }
}
