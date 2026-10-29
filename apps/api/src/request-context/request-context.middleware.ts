// @arkesoft/api — RequestContextMiddleware (ROADMAP v0.0.4, T-002/ST-4, architect K-A5)
//
// ALS SÖZLEŞMESİNİN "ÇÖZEN" tarafı — zorlayan taraf `TenantGuard`'dır (ST-5,
// `APP_GUARD`). Bu middleware **ASLA FIRLATMAZ**: NestJS'te middleware içinde
// fırlatılan hata global exception filter'a ULAŞMAZ (platformun kendi hata
// yoluna düşer, AC4'ün istediği birebir JSON yerine 500 HTML üretir) — bu
// yüzden burada atılabilecek TEK adım (`als.run`) hiçbir zaman reddetmeyen bir
// akıştır; tenant çözümü (`unresolved`/`failed` olabilir) ayrı bir middleware'in
// (ST-5 `TenantContextMiddleware`) işi, burada yalnızca `pending` ile başlatılır.
//
// SIRA (K-A5, bağlayıcı): `app.module.ts`'te `RequestContextMiddleware` HER
// ZAMAN `TenantContextMiddleware`'DEN ÖNCE koşar — ALS depo nesnesi burada
// kurulur, sonraki middleware onu MUTE EDER (yalnızca `tenant` ve `logger`
// alanlarını).

import { Inject, Injectable } from '@nestjs/common'
import type { NestMiddleware } from '@nestjs/common'
import type { Logger } from 'pino'

import type { HttpRequestLike, HttpResponseLike } from '../http/http-request.types.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { requestContextStorage } from './request-context.storage.js'
import type { RequestContext } from './request-context.types.js'
import { resolveIncomingRequestId } from './request-id.js'

@Injectable()
export class RequestContextMiddleware implements NestMiddleware<HttpRequestLike, HttpResponseLike> {
  constructor(@Inject(ROOT_LOGGER) private readonly rootLogger: Logger) {}

  use(req: HttpRequestLike, res: HttpResponseLike, next: () => void): void {
    const requestId = resolveIncomingRequestId(req.headers['x-request-id'])

    const store: RequestContext = {
      requestId,
      receivedAt: Date.now(),
      // İLK değer: yalnızca `requestId` bağlamalı child logger. Tenant
      // çözülünce `TenantContextMiddleware` (ST-5) bu alanı `tenantId`
      // bağlamalı bir child ile DEĞİŞTİRİR (tek yazıcı, K-A7).
      logger: this.rootLogger.child({ requestId }),
      tenant: { kind: 'pending' },
      // ROADMAP v0.0.5, T-006/S6 EKLEMESİ (additive): `tenant` İLE AYNI
      // desen — `AuthContextMiddleware` (`TenantContextMiddleware`'den
      // SONRA) bu alanı DEĞİŞTİRİR, TEK yazıcı.
      auth: { kind: 'pending' },
    }

    // AC9: yanıt başlığı handler'dan ÖNCE yazılır — hata yanıtları dahil HER
    // yanıt bu başlığı taşır (`AppExceptionFilter` ikinci savunma olarak
    // yeniden yazsa da aynı değeri yazdığı için zararsızdır).
    res.setHeader('x-request-id', requestId)

    requestContextStorage.run(store, next)
  }
}
