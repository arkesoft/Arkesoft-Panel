// @arkesoft/api — RequestLoggingInterceptor (ROADMAP v0.0.4, T-002/ST-4, architect K-A7)
//
// Loglanan alanlar: `method`, `controller.handler` (HAM URL/query DEĞİL —
// yüksek kardinalite + query string'de token riski), `statusCode`, `durationMs`,
// `requestId`, `tenantId?`. `req.route.path` KULLANILMAZ — express'e özgüdür
// (K-A1 adaptör-nötrlük); bunun yerine `ExecutionContext.getClass()/getHandler()`
// kullanılır (Nest'in KENDİ, adaptörden bağımsız API'si).
//
// Durum kodu `'finish'` OLAYINDA okunur: Nest'in interceptor zinciri (`next.handle()`)
// gerçek HTTP yazımından (adaptörün response controller'ı `httpAdapter.reply()`
// çağırdığı an) ÖNCE tamamlanır — `tap()`'in `next` geri çağrısında `response.statusCode`
// henüz adaptöre göre nihai DEĞİLDİR. `'finish'`, hem express hem fastify'ın
// altındaki `http.ServerResponse`'un (adaptör-nötr) yanıt tamamen GÖNDERİLDİĞİNDE
// yaydığı olaydır — bu yüzden güvenilir okuma noktası budur.

import { Inject, Injectable } from '@nestjs/common'
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common'
import type { Logger } from 'pino'
import type { Observable } from 'rxjs'

import type { HttpRequestLike, HttpResponseWithLifecycle } from '../http/http-request.types.js'
import { tryGetRequestContext } from '../request-context/request-context.accessors.js'
import { ROOT_LOGGER } from './logging.tokens.js'

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(@Inject(ROOT_LOGGER) private readonly rootLogger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp()
    const request = httpContext.getRequest<HttpRequestLike>()
    const response = httpContext.getResponse<HttpResponseWithLifecycle>()
    const startedAt = Date.now()
    const method = request.method
    const handler = `${context.getClass().name}.${context.getHandler().name}`

    response.on('finish', () => {
      this.logCompletion(method, handler, response.statusCode, Date.now() - startedAt)
    })

    return next.handle()
  }

  private logCompletion(
    method: string,
    handler: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const requestContext = tryGetRequestContext()
    const logger = requestContext?.logger ?? this.rootLogger
    const tenant = requestContext?.tenant

    const tenantFields = tenant?.kind === 'resolved' ? { tenantId: tenant.tenant.id } : {}

    logger.info(
      {
        method,
        handler,
        statusCode,
        durationMs,
        // `logger` normalde zaten `requestId` (ve tenant çözülmüşse `tenantId`)
        // bağlamalı bir child'dır (`RequestContextMiddleware` kurar). Alanı
        // burada AYRICA açıkça yazıyoruz — context hiç kurulmamışsa (fallback:
        // `rootLogger`) bile AC9'un "her kayıtta requestId" garantisi bozulmaz.
        requestId: requestContext?.requestId,
        ...tenantFields,
      },
      'istek tamamlandı',
    )
  }
}
