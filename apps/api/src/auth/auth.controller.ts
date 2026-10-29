// @arkesoft/api — AuthController: fail-closed delegasyon (ROADMAP v0.0.5,
// T-006/S5, architect "tRPC SÖZLEŞMESİ" → HTTP sözleşmesi, bölüm A)
//
// `@All('auth/*path')` TÜM `/auth/*` isteklerini dinler ama YALNIZCA
// `AUTH_DELEGATED_PATHS`'teki TAM yolları Better Auth'a iletir — küme DIŞI
// her şey 404 (`NotFoundException`, `AppExceptionFilter` → genel i18n
// gövdesi, ham Nest mesajı SIZMAZ). Gerekçe `auth-delegated-paths.ts` dosya
// başı yorumunda.
//
// A-G5 ÖLÇÜMÜ (gerçek `better-auth@1.7.14`, Node 24):
// `apps/api/src/main.ts`'in `NestFactory.create()`'i `bodyParser: false`
// GEÇMİYOR → Nest varsayılan olarak `express.json()`/`express.urlencoded()`'ı
// GLOBAL middleware olarak kaydediyor (`@nestjs/platform-express/adapters/
// express-adapter.js:registerParserMiddleware`, `app.init()` sırasında
// `use()` ile TÜM rotalardan ÖNCE). Bu, Better Auth'un `auth.handler()`'a
// vermek istediğimiz ham gövde akışını (`ReadableStream`) ZATEN TÜKETİR —
// `req.body` bu noktada halihazırda ayrıştırılmış bir JS nesnesidir, akış
// TEKRAR OKUNAMAZ. **Yedek yol (K-A1 fallback) GEREKMEDİ**: ayrıştırılmış
// `req.body`'yi `JSON.stringify()` ile GERİ serileştirip yeni bir Web
// `Request` kurmak `auth.handler()` tarafından SORUNSUZ işleniyor (ÖLÇÜLDÜ —
// `auth-flow.test.ts`, gerçek Postgres + Mailpit). `Response.headers.
// getSetCookie()` (Node 24/undici) çoklu `Set-Cookie`'yi AYRI AYRI döndürüyor
// — `httpAdapter.appendHeader()` ile (Express `res.append()`, BİRİKTİRİR,
// `setHeader`/`res.set()` DEĞİL — o DEĞİŞTİRİR) doğru şekilde yazılıyor.
// `main.ts`'e K-A1 dışında DOKUNULMADI (`git diff` kanıtı raporda).
//
// K-A1 adaptör-nötrlüğü BURADA DA korunur: yanıt `HttpAdapterHost.httpAdapter`
// üzerinden yazılır (`AppExceptionFilter`'ın deseniyle AYNI) — `express`/
// `@nestjs/platform-express` BU dosyada HİÇ import EDİLMEZ.

import { All, Controller, Inject, NotFoundException, Req, Res } from '@nestjs/common'
import type { AbstractHttpAdapter } from '@nestjs/core'
import { HttpAdapterHost } from '@nestjs/core'
import type { Auth } from 'better-auth'

import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import { AuthProviderFailedError } from '../errors/domain/auth-provider-failed.error.js'
import type { HttpRequestLike, HttpResponseLike } from '../http/http-request.types.js'
import { toWebHeaders } from '../http/to-web-headers.js'
import { isAuthDelegatedPath } from './auth-delegated-paths.js'
import { AUTH_INSTANCE } from './auth.tokens.js'

/**
 * `@Req()`'in beklediği ek alan — `HttpRequestLike`'a (başka bir alt görevin
 * paylaşılan dosyası, bu alt görevde DOKUNULMADI) EKLENMEDİ, yalnızca BU
 * dosyada yerel bir genişletme. `body` Express'in global gövde ayrıştırıcısı
 * (yukarıdaki dosya başı yorumu, A-G5) tarafından DOLDURULUR.
 */
type AuthDelegationRequest = HttpRequestLike & { readonly body: unknown }

/**
 * Express/Nest'ten gelen isteği Better Auth'un `auth.handler()`'ının
 * beklediği Web `Request`'e çevirir (bkz. dosya başı yorumu, A-G5).
 */
function buildBetterAuthRequest(req: AuthDelegationRequest, baseUrl: string): Request {
  const url = new URL(req.url, baseUrl)
  const method = req.method.toUpperCase()
  const headers = toWebHeaders(req.headers)

  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers })
  }

  // `req.body` Express'in global JSON ayrıştırıcısından ZATEN geçti — ham
  // gövde akışı tüketildi, bu yüzden GERİ serileştiriyoruz (A-G5).
  headers.set('content-type', 'application/json')
  return new Request(url, { method, headers, body: JSON.stringify(req.body ?? {}) })
}

/**
 * Better Auth'un ürettiği Web `Response`'u adaptör-nötr `HttpAdapterHost`
 * üzerinden yazar — durum kodu, başlıklar (çoklu `Set-Cookie` dahil, A-G5) ve
 * gövde OLDUĞU GİBİ forward edilir; içerik Better Auth'un KENDİ ürettiği
 * başarı/hata şeklidir (ör. `EMAIL_NOT_VERIFIED` 403) — `AuthController`
 * bu içeriğe karışmaz.
 */
async function forwardBetterAuthResponse(
  response: Response,
  res: HttpResponseLike,
  httpAdapter: AbstractHttpAdapter,
): Promise<void> {
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() === 'set-cookie') {
      continue
    }
    httpAdapter.setHeader(res, name, value)
  }

  for (const cookie of response.headers.getSetCookie()) {
    httpAdapter.appendHeader(res, 'set-cookie', cookie)
  }

  const rawBody = await response.text()
  httpAdapter.reply(res, rawBody.length > 0 ? rawBody : null, response.status)
}

@Controller()
export class AuthController {
  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: Auth,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  @All('auth/*path')
  async delegate(@Req() req: AuthDelegationRequest, @Res() res: HttpResponseLike): Promise<void> {
    if (!isAuthDelegatedPath(req.method, req.url)) {
      // Küme dışı her şey 404 — var olmayan ile yetkisiz ayrımı yapılmaz
      // (CLAUDE.md §7), ham Nest mesajı `AppExceptionFilter` tarafından
      // genel i18n gövdesine eşlenir.
      throw new NotFoundException()
    }

    const request = buildBetterAuthRequest(req, this.env.AUTH_BASE_URL)

    let response: Response
    try {
      response = await this.auth.handler(request)
    } catch (cause) {
      // Hata YUTULMAZ (CLAUDE.md §10.16) — Better Auth'un KENDİ normal hata
      // yanıtları (400/401/403) BURAYA DÜŞMEZ (Promise reddetmez, bir
      // `Response` döner); bu yalnızca GERÇEKTEN beklenmedik bir sağlayıcı
      // çöküşü içindir.
      throw new AuthProviderFailedError(cause)
    }

    await forwardBetterAuthResponse(response, res, this.adapterHost.httpAdapter)
  }
}
