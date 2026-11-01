// @arkesoft/api — NoStoreHeadersMiddleware (ROADMAP v0.0.7, T-008/S3,
// architect K6, borç 1440+1441+1453)
//
// Tek satır gövde, DI'sız, FIRLATMAZ (`RequestContextMiddleware`/
// `TenantContextMiddleware` ile AYNI "middleware asla fırlatmaz" disiplini —
// burada zaten fırlatacak hiçbir dal YOK). `app.module.ts`'in `configure()`
// zincirinin BAŞINA eklenir: guard'lardan (hatta `RequestContextMiddleware`'
// den) ÖNCE koşar ki yazdığı başlıklar HER yanıtta (guard reddi dahil)
// bulunsun.

import { Injectable } from '@nestjs/common'
import type { NestMiddleware } from '@nestjs/common'

import type { HttpRequestLike, HttpResponseLike } from './http-request.types.js'
import { applyNoStoreHeaders } from './no-store-response-headers.js'

@Injectable()
export class NoStoreHeadersMiddleware implements NestMiddleware<HttpRequestLike, HttpResponseLike> {
  use(_req: HttpRequestLike, res: HttpResponseLike, next: () => void): void {
    applyNoStoreHeaders(res)
    next()
  }
}
