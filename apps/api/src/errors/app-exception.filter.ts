// @arkesoft/api — global exception filter (ROADMAP v0.0.4, T-002/ST-4, architect K-A1/K-A5)
//
// Yanıtı YAZAN TEK yer. `HttpAdapterHost.httpAdapter.reply()/setHeader()`
// kullanılır — `res.status().json()` YASAK (K-A1 adaptör-nötrlük: fastify'a
// geçişte bu dosya DEĞİŞMEZ, `main.ts` dışında hiçbir kaynak dosya adaptöre
// özgü tip/API görmez).
//
// K-A5 hatırlatması: `TenantContextMiddleware` (ST-5) middleware içinde ASLA
// fırlatmaz — bu yüzden buraya düşen hatalar guard/interceptor/pipe/handler
// katmanından gelir; middleware'in kendisi bu filter'a hiçbir zaman istisna
// göndermez (NestJS mimarisinin kısıtı, middleware → filter yolu yok).
//
// SAVUNMA KARARI (bilinçli, spesifikasyondan ayrışma gerekçeli): `requestId`
// için `tryGetRequestContext()` kullanılır (context yoksa yenisi üretilir) —
// AYNI gerekçeyle logger için de `tryGetRequestContext()?.logger` okunur,
// `getLogger()` (fail-closed) DEĞİL. Sebep: bu filter, platformun HER hatayı
// yakaladığı son durak; context'in (teorik olarak) yok olduğu o nadir anda
// `getLogger()` fırlatırsa filter'ın kendisi çöker ve istemci hiçbir yanıt
// almaz. `ROOT_LOGGER` ikinci savunma hattı olarak enjekte edilir.

import { Catch, Inject, Injectable } from '@nestjs/common'
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import type { Logger } from 'pino'

import type { HttpResponseLike } from '../http/http-request.types.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { tryGetRequestContext } from '../request-context/request-context.accessors.js'
import { generateRequestId } from '../request-context/request-id.js'
import { mapErrorToResponse } from './error-mapping.js'

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
    const mapped = mapErrorToResponse(error, requestId)

    const httpAdapter = this.adapterHost.httpAdapter
    const response = host.switchToHttp().getResponse<HttpResponseLike>()

    // İkinci savunma: `RequestContextMiddleware` başlığı zaten yazmış olabilir
    // (AC9 — hata yanıtları da `x-request-id` taşır); aynı değeri yeniden
    // yazmak zararsızdır, context hiç kurulmadıysa (middleware koşmadıysa)
    // tek yazım burada gerçekleşir.
    httpAdapter.setHeader(response, 'x-request-id', requestId)

    // `context`/`logContext` yalnızca LOGLANIR — `mapped.body`'ye ASLA girmez.
    logger.error({ code: mapped.body.code, ...mapped.logContext }, 'istek hata ile sonuçlandı')

    httpAdapter.reply(response, mapped.body, mapped.httpStatus)
  }
}
