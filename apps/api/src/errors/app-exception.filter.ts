// @arkesoft/api — global exception filter (ROADMAP v0.0.4, T-002/ST-4, architect K-A1/K-A5)
//
// Yanıtı YAZAN TEK yer. `HttpAdapterHost.httpAdapter.reply()/setHeader()`
// kullanılır — `res.status().json()` YASAK (K-A1 adaptör-nötrlük: fastify'a
// geçişte bu dosya DEĞİŞMEZ, `main.ts` dışında hiçbir kaynak dosya adaptöre
// özgü tip/API görmez).
//
// K-A5 hatırlatması (DÜZELTME, T-022/S2, A-A22-2 — ÖNCEKİ metin BAYATTI):
// `TenantContextMiddleware` (ST-5) normal akışta FIRLATMAZ, ama bu "middleware
// → filter yolu YOK" demek DEĞİL — ÖLÇÜLDÜ: Nest 12'de `RequestMethod.ALL`
// ile bağlanan middleware `RouterProxy.createProxy` tarafından sarmalanır ve
// middleware'den fırlayan HER istisna, controller'larla AYNI şekilde, BU
// filtreye ULAŞIR (canlı HTTP kanıtı: `GET //`, bkz.
// `tenant-context.middleware.ts:4-27`). Bu middleware'in burada fırlatmamasının
// nedeni filtreye erişilemezlik değil, hatayı `TenantGuard`'a taşıyıp DOĞRU,
// TİPLİ bir `AppError`'a çevirme isteğidir.
//
// SAVUNMA KARARI (bilinçli, spesifikasyondan ayrışma gerekçeli): `requestId`
// için `tryGetRequestContext()` kullanılır (context yoksa yenisi üretilir) —
// AYNI gerekçeyle logger için de `tryGetRequestContext()?.logger` okunur,
// `getLogger()` (fail-closed) DEĞİL. Sebep: bu filter, platformun HER hatayı
// yakaladığı son durak; context'in (teorik olarak) yok olduğu o nadir anda
// `getLogger()` fırlatırsa filter'ın kendisi çöker ve istemci hiçbir yanıt
// almaz. `ROOT_LOGGER` ikinci savunma hattı olarak enjekte edilir.
//
// GÜNCELLEME (ROADMAP v0.0.17, T-028/S8, architect K-A28-5/K-A28-6):
//   1. `logLevel` DAĞITIMI — bu dosya artık HER hatayı `logger.error` İLE
//      YAZMAZ: `mapErrorToResponse`'un ürettiği `mapped.logLevel`'a (dört
//      seviye) göre EXHAUSTIVE `switch` + `assertNever` ile doğru
//      `logger.<seviye>()` metodu çağrılır. Bu DAVRANIŞ DEĞİŞİKLİĞİDİR
//      (gerileme DEĞİL, architect'in bağlayıcı kararı): ör. bir 404
//      `TENANT_NOT_FOUND` artık `warn`'a düşer.
//   2. `x-trace-id` HATA YANITI YÜZEYİ (AC-54b) — `x-request-id` İLE AYNI
//      `setHeader()` deseni, adaptör-nötr. Değer `RequestContextMiddleware`'in
//      (S4) ALS'ye YAZDIĞI `traceId` OLDUĞU GİBİ okunur — `getCurrentTraceId()`
//      BURADA YENİDEN ÇAĞRILMAZ (S4'ün bağlayıcı şartı: aksi hâlde Katman 2
//      kapalıyken başarı ve hata yanıtları FARKLI `traceId` taşırdı). Context
//      hiç kurulmamışsa (middleware koşmadıysa, `requestId`'nin AYNI ikinci
//      savunma deseni) yerel üretime düşülür.
//   3. SENTRY CAPTURE — `mapped.logLevel === 'error'` dalının İÇİNDE,
//      YALNIZCA gerçek bir `AppError` örneğiyse (`isAppError(error)`)
//      `captureAppError()` (S5) çağrılır. `HttpException`/sınıflandırılamayan
//      hata `AppError` OLMADIĞI için (`captureAppError`'ın TİP sözleşmesi)
//      bu dalda bile Sentry'ye GİTMEZ — bilinçli kapsam sınırı
//      (`error-mapping.ts`'in dosya başı yorumuna bkz).
//   4. GÜNCELLEME (DÜZELTME TURU 1/3, solid BULGU 3) — `captureAppError`'a
//      bu dosyanın YUKARIDA (:82) ZATEN hesapladığı `traceId` (AYNEN, ALS'den
//      okunan/yerel üretime düşen değer) GEÇİRİLİR. `sentry.ts` artık
//      `getCurrentTraceId()`'yi KENDİSİ YENİDEN ÇAĞIRMAZ (eski hâli öyleydi
//      — aktif span HİÇBİR ZAMAN olmadığı için her çağrı YENİ bir rastgele
//      kimlik üretiyordu, Sentry zarfının `trace_id` tag'i bu yüzden AYNI
//      isteğin log/başlık `traceId`'siyle ASLA eşleşmiyordu). Bu dosya
//      (`app-exception.filter.ts`), `trace-id.ts`'i YENİDEN ÇAĞIRAN ÜÇ
//      bağlayıcı yerden biridir (diğer ikisi: `request-context.middleware.ts`,
//      `queue.service.ts`) — `sentry.ts` artık bu üçlüyü DELMİYOR.

import { Catch, Inject, Injectable } from '@nestjs/common'
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { isAppError } from '@arkesoft/errors'
import type { Logger } from 'pino'

import type { HttpResponseLike } from '../http/http-request.types.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { captureAppError } from '../observability/sentry.js'
import { getCurrentTraceId } from '../observability/trace-id.js'
import { tryGetRequestContext } from '../request-context/request-context.accessors.js'
import type { TenantResolution } from '../request-context/request-context.types.js'
import { generateRequestId } from '../request-context/request-id.js'
import { assertNever } from './assert-never.js'
import { mapErrorToResponse } from './error-mapping.js'
import type { ErrorMappingResult } from './error-mapping.js'

@Injectable()
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(ROOT_LOGGER) private readonly rootLogger: Logger,
  ) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const requestContext = tryGetRequestContext()
    const requestId = requestContext?.requestId ?? generateRequestId()
    const logger = requestContext?.logger ?? this.rootLogger
    // ⚠⚠ AYNI değer başarı yanıtıyla paylaşılır — `RequestContextMiddleware`'in
    // (S4) ALS'ye yazdığı DEĞER OKUNUR, `getCurrentTraceId()` YENİDEN
    // ÇAĞRILMAZ (bağlayıcı, bkz. dosya başı yorumu). Context hiç kurulmamışsa
    // (middleware koşmadıysa) `requestId`'nin AYNI ikinci savunma deseniyle
    // yerel üretime düşülür — bu durumda "başarı yanıtıyla aynı değer" şartı
    // zaten UYGULANAMAZ (hiç başarı yanıtı YOK).
    const traceId = requestContext?.traceId ?? getCurrentTraceId()
    const mapped = mapErrorToResponse(error, requestId)

    const httpAdapter = this.adapterHost.httpAdapter
    const response = host.switchToHttp().getResponse<HttpResponseLike>()

    // İkinci savunma: `RequestContextMiddleware` başlığı zaten yazmış olabilir
    // (AC9 — hata yanıtları da `x-request-id` taşır); aynı değeri yeniden
    // yazmak zararsızdır, context hiç kurulmadıysa (middleware koşmadıysa)
    // tek yazım burada gerçekleşir.
    httpAdapter.setHeader(response, 'x-request-id', requestId)
    // AC-54b: hata yanıtı yüzeyi — `x-request-id` İLE AYNI yazım yolu, AYNI
    // "zararsız yeniden yazım" gerekçesi.
    httpAdapter.setHeader(response, 'x-trace-id', traceId)

    // ADDITIVE (ROADMAP v0.0.5, T-006/S3, architect "HATA SINIFLARI" / AC7):
    // `AppError.httpHeaders`'ın (ör. `Retry-After`) `instanceof` ZİNCİRİ
    // OLMADAN yazıldığı yer — jenerik, adaptör-nötr, aynı `setHeader()` deseni
    // (`x-request-id` ile aynı yazım yolu). `mapped.httpHeaders` yalnızca
    // `AppError` alt sınıfı bu alanı DOLDURDUYSA mevcuttur.
    if (mapped.httpHeaders !== undefined) {
      for (const [name, value] of Object.entries(mapped.httpHeaders)) {
        httpAdapter.setHeader(response, name, value)
      }
    }

    this.logByLevel(mapped, logger, error, requestContext?.tenant, requestId, traceId)

    httpAdapter.reply(response, mapped.body, mapped.httpStatus)
  }

  /**
   * `mapped.logLevel`'a (dört seviye, K-A28-5) göre EXHAUSTIVE dağıtım.
   * `context`/`logContext` yalnızca LOGLANIR — `mapped.body`'ye ASLA girmez.
   * Yeni bir seviye eklenirse `default` dalı `assertNever` ile DERLEME
   * ZAMANINDA kırılır (R4 telafisi deseni, `error-mapping.ts`'in AYNI
   * disiplini).
   */
  private logByLevel(
    mapped: ErrorMappingResult,
    logger: Logger,
    error: unknown,
    tenant: TenantResolution | undefined,
    requestId: string,
    traceId: string,
  ): void {
    const logPayload = { code: mapped.body.code, ...mapped.logContext }

    switch (mapped.logLevel) {
      case 'error':
        logger.error(logPayload, 'istek hata ile sonuçlandı')
        // ⚠⚠ YALNIZCA `logLevel === 'error'` İKEN ve YALNIZCA gerçek bir
        // `AppError` örneğiyse (S5'in `captureAppError` sözleşmesi
        // `AppError` TİPİ ister — `HttpException`/sınıflandırılamayan hata
        // bu dala düşse bile Sentry'ye GİTMEZ, bilinçli kapsam sınırı).
        if (isAppError(error)) {
          const tenantId = tenant?.kind === 'resolved' ? tenant.tenant.id : undefined
          captureAppError({ error, tenantId, requestId, traceId })
        }
        return
      case 'warn':
        logger.warn(logPayload, 'istek hata ile sonuçlandı')
        return
      case 'info':
        logger.info(logPayload, 'istek hata ile sonuçlandı')
        return
      case 'debug':
        logger.debug(logPayload, 'istek hata ile sonuçlandı')
        return
      default:
        assertNever(mapped.logLevel, 'app-exception.filter.ts: AppErrorLogLevel')
    }
  }
}
