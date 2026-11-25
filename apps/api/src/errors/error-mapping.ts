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
  redactDeep,
  toErrorBody,
  unknownErrorBody,
} from '@arkesoft/errors'
import type { AppError, AppErrorBody, AppErrorLogLevel } from '@arkesoft/errors'

import { assertNever } from './assert-never.js'

export type ErrorMappingResult = {
  readonly httpStatus: number
  readonly body: AppErrorBody
  /** Yalnızca LOGLANACAK bağlam — tel sözleşmesine (body) hiçbir zaman girmez. */
  readonly logContext: Record<string, unknown>
  /**
   * ADDITIVE (ROADMAP v0.0.17, T-028/S8, architect K-A28-5). `AppExceptionFilter`'ın
   * hangi `logger.<seviye>()` metodunu çağıracağını VE `captureAppError`'ı
   * (yalnızca `'error'` iken) tetikleyip tetiklemeyeceğini belirler.
   *
   * ⭐ İKİNCİ BİR DEFTER DEĞİL: `AppError` alt sınıfları için değer BİREBİR
   * `error.logLevel`'dan gelir (tek beyan yeri hâlâ sınıfın kendisi,
   * K-A28-5). `HttpException`/bilinmeyen hata ise `AppError` DEĞİLDİR —
   * `logLevel` alanları YOKTUR; bu iki dal için seviye burada, bu İKİ
   * taşıyıcı-katman türüne ÖZGÜ olarak sabitlenir (aşağıya bkz.), bir
   * domain hata SINIFININ seviyesini TEKRAR BEYAN ETMEZ.
   */
  readonly logLevel: AppErrorLogLevel
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
  // ⚠⚠ DÜZELTME (ROADMAP v0.0.17, T-028, düzeltme turu 1, `security`/`solid`
  // BAĞIMSIZ BULGU 6): `error.context` artık {@link redactDeep} ÜZERİNDEN
  // GEÇİRİLİR — `packages/trpc`'nin `trpc.ts`'teki `logAppError`'ı VE
  // `observability/sentry.ts`'in `captureAppError`'ı bu sürümde ZATEN
  // `redactDeep` kullanıyordu, REST hata filtresinin log yolu bu üçüncü
  // savunma katmanının DIŞINDA kalmıştı. Pino'nun yüzeysel `redact.paths`
  // jokeri TEK SEVİYE olduğu için derinlik ≥2'deki bir sır BU satır
  // olmadan maskesiz loglanırdı (tRPC yolunda maskeli, REST yolunda ham —
  // ÖLÇÜLMÜŞ asimetri). `redactDeep` GİRDİYİ MUTASYONA UĞRATMAZ.
  const logContext = {
    code: error.code,
    isRetryable: error.isRetryable,
    context: redactDeep(error.context),
  }
  // Tek beyan yeri `error.logLevel` (K-A28-5/6) — burada KOPYALANMAZ,
  // sınıfın kendisinden OLDUĞU GİBİ okunur.
  const logLevel = error.logLevel

  // `exactOptionalPropertyTypes`: `httpHeaders` alanı YOKSA hiç YAZILMAZ —
  // `undefined` değeri açıkça atanmaz (PO riski 8'in diğer yüzü: alan
  // olmadığında "yok" ile "boş" ayrımı tip seviyesinde de korunur).
  if (error.httpHeaders === undefined) {
    return { httpStatus: error.httpStatus, body, logContext, logLevel }
  }

  return {
    httpStatus: error.httpStatus,
    body,
    logContext,
    logLevel,
    httpHeaders: error.httpHeaders,
  }
}

/**
 * Nest'in kendi `HttpException`'ları (ör. eşleşmeyen rota için ürettiği
 * dahili 404) platformun `AppError` hiyerarşisinden GELMEZ. Ham mesajı
 * (`error.message`) tel üstüne YAZMAYIZ — sabit, i18n anahtarlı bir gövdeye
 * eşleriz; ham mesaj yalnızca `logContext`'te kalır.
 *
 * `logLevel: 'warn'` (K-A28-5 kapsamı): bu dal `AppError` DEĞİLDİR, bir
 * `code → logLevel` eşlemesi beyan EDİLEMEZ — ama CLAUDE.md §4'ün dört
 * seviyesi için bir karar gerekir. Nest'in kendi ürettiği `HttpException`
 * (tipik örnek: eşleşmeyen rota 404'ü) platform için "beklenen ama anormal"
 * bir giriş — tipik bot/yanlış istemci trafiği, operatöre `error` çağrısı
 * ÜRETMEMELİ (aksi hâlde her rastgele yanlış rota Sentry'ye zarf gönderirdi).
 */
function mapHttpException(error: HttpException, requestId: string): ErrorMappingResult {
  const httpStatus = error.getStatus()
  const body: AppErrorBody = genericTransportErrorBody(requestId)

  return {
    httpStatus,
    body,
    logContext: { nestHttpStatus: httpStatus, nestMessage: error.message },
    logLevel: 'warn',
  }
}

/**
 * Hiçbir bilinen türe uymayan (fırlatılan değer `Error` da olmayabilir —
 * `@typescript-eslint/only-throw-error` kaynak kodda bunu engeller ama
 * `unknown` kaynaklardan — ör. üçüncü parti kütüphane — her zaman gelebilir)
 * her şey. 500 + genel kod; ham mesaj YALNIZCA loglanır (CLAUDE.md §17).
 *
 * `logLevel: 'error'` (K-A28-5 kapsamı): sınıflandırılamayan her hata, tanım
 * gereği platformun hata SINIRININ dışında kalan bir kod yolunu işaret eder
 * (bir `AppError` alt sınıfı FIRLATILMAMIŞ) — bu, CLAUDE.md §4'ün "müdahale
 * gerekir" tanımına en uygun durumdur. ⚠ Yine de bu dalda `AppError`
 * OLMADIĞI için `AppExceptionFilter` burada `captureAppError`'ı ÇAĞIRAMAZ
 * (o fonksiyon `AppError` TİPİ ister) — Sentry'ye yalnızca gerçek `AppError`
 * örnekleri (`isAppError(error)`) gider; bu bilinçli bir kapsam sınırı,
 * S5'in `captureAppError` sözleşmesinin (AppError-only) doğal sonucudur.
 */
function mapUnknownError(error: unknown, requestId: string): ErrorMappingResult {
  const body: AppErrorBody = unknownErrorBody(requestId)

  return {
    httpStatus: 500,
    body,
    logContext: {
      rawMessage: error instanceof Error ? (error.stack ?? error.message) : String(error),
    },
    logLevel: 'error',
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
