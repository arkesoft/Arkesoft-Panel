// @arkesoft/api — TrpcController: `/trpc` mount'u (ROADMAP v0.0.6, T-007/S5,
// architect K4)
//
// `@All('trpc/*path')` Nest controller'ı — `express`'in ham ara yazılım
// kaydı (`app.use(...)`) DEĞİL. Üç gerekçe (architect K4, birebir):
//   1. `app.use()` tuzağı: `NestFactory.create()` `init()`'te not-found
//      handler'ı KAYDEDER; sonradan eklenen bir `app.use('/trpc', ...)`
//      yığının SONUNA eklenir → istek not-found'a ÖNCE düşer, `/trpc`
//      GÖRÜNMEZ olabilir.
//   2. K-A1 adaptör-nötrlüğü: `@trpc/server/adapters/fetch` → Web
//      `Request`/`Response`; `express`/`@nestjs/platform-express` BU
//      dosyada HİÇ import EDİLMEZ (v0.0.5 A-G5 ölçümüyle AYNI desen:
//      `toWebHeaders` + `httpAdapter.setHeader/appendHeader/reply`).
//   3. Controller ROTASI olduğu için global `APP_GUARD`'lar (`TenantGuard`,
//      `AuthGuard`, `RateLimitGuard`) `/trpc/*` için KOŞAR — `AuthGuard`'ın
//      `withTenant()` üzerinden yaptığı üyelik kontrolü AYNEN tekrar
//      kullanılır, tRPC katmanında KOPYALANMAZ (V2).
//
// `/trpc/*` ne `TENANT_EXEMPT_PATHS`'te ne `AUTH_EXEMPT_PATHS`'te yer alır —
// bu dosya o iki allowlist'e HİÇBİR satır EKLEMEZ (architect riski 8). Kimse
// `publicProcedure`'ü HTTP'de "erişilebilir" yapmak için bu iki kümeye satır
// eklemeye KALKMASIN — bu BİLİNÇLİ bir tasarım kararıdır, eksik değil. Pipeline:
// `RequestContext → TenantContext → AuthContext middleware → TenantGuard
// (unresolved → 404) → AuthGuard (oturumsuz → 401 · üye değil → 403) →
// RateLimitGuard (/trpc'de anında true) → SameOriginGuard (@UseGuards,
// burada) → TrpcController.handle → createTrpcRequestHandler`.
//
// `allowBatching: false` zaten `createTrpcRequestHandler()` İÇİNDE
// (`@arkesoft/trpc/server`, S3) — burada fail-closed bir yedeğe İHTİYAÇ YOK
// (S1'in spike'ı gerçek seçeneği doğruladı).

import { All, Controller, Inject, Req, Res, UseGuards } from '@nestjs/common'
import type { AbstractHttpAdapter } from '@nestjs/core'
import { HttpAdapterHost } from '@nestjs/core'
import { createTrpcRequestHandler } from '@arkesoft/trpc/server'

import { SameOriginGuard } from '../auth/same-origin.guard.js'
import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import type { HttpRequestLike, HttpResponseLike } from '../http/http-request.types.js'
import { toWebHeaders } from '../http/to-web-headers.js'
import { TenantReadPortAdapter } from './ports/tenant-read.port.adapter.js'
import { createTrpcContext } from './trpc-context.factory.js'
import { TrpcErrorsPortAdapter } from './trpc-errors.port.adapter.js'

/**
 * `@Req()`'in beklediği ek alan — `AuthController`'daki (`auth.controller.ts`,
 * A-G5) AYNI yerel genişletme; `HttpRequestLike`'a EKLENMEZ, yalnızca bu
 * dosyada yerel.
 */
type TrpcHttpRequest = HttpRequestLike & { readonly body: unknown }

/**
 * Express/Nest'ten gelen isteği tRPC'nin fetch adaptörünün beklediği Web
 * `Request`'e çevirir (A-G5 deseni, `buildBetterAuthRequest`'in TRPC
 * karşılığı). v0.0.6'da hiçbir mutation prosedürü YOK — her istek GET'tir ve
 * gövde taşımaz; GÖVDE taşıyan bir istek gelirse (ileriye dönük) AYNI
 * yeniden-serileştirme yardımcısı kullanılır (Express'in global JSON
 * ayrıştırıcısı `req.body`'yi zaten tükettiği için akış TEKRAR OKUNAMAZ).
 */
function buildTrpcWebRequest(req: TrpcHttpRequest, baseUrl: string): Request {
  const url = new URL(req.url, baseUrl)
  const method = req.method.toUpperCase()
  const headers = toWebHeaders(req.headers)

  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers })
  }

  headers.set('content-type', 'application/json')
  return new Request(url, { method, headers, body: JSON.stringify(req.body ?? {}) })
}

/**
 * tRPC'nin ürettiği Web `Response`'u adaptör-nötr `HttpAdapterHost` üzerinden
 * yazar — `forwardBetterAuthResponse`'un (A-G5) AYNI deseni (çoklu
 * `Set-Cookie` dahil, bugün tRPC bu başlığı yazmaz ama yardımcı jenerik
 * kalır).
 *
 * GÜVENLİK DÜZELTMESİ (security tur 1, medium bulgu — GUARD ATLATMA): bu
 * döngü tRPC'nin KENDİ ürettiği başlıkları (`vary: trpc-accept, accept` dahil)
 * olduğu gibi yazar ve hiçbir yerde `Cache-Control` üretmez. Kimlik Cookie ile
 * taşındığı için (Authorization DEĞİL), `Cache-Control`sız + `ETag`'li bir
 * `200 GET` RFC 9111 §4.2.2 gereği paylaşımlı bir önbellek (CDN/ters vekil/
 * ingress) tarafından sezgisel olarak saklanabilir — saklanan yanıt daha
 * sonra kimliksiz/başka kullanıcılı bir isteğe servis edilirse `TenantGuard`+
 * `AuthGuard` zinciri TAMAMEN ATLANIR (CLAUDE.md §7 madde 9). Bu yüzden döngü
 * BİTTİKTEN SONRA iki başlık EKLENİR:
 *   - `Cache-Control: no-store, private` → `setHeader` (yeni başlık, EZME
 *     riski yok) — hem paylaşımlı hem özel önbelleği devre dışı bırakır ve
 *     `ETag`'in saklama kararında kullanılmasını da etkisizleştirir.
 *   - `Vary: Cookie` → BİLEREK `appendHeader` (NOT `setHeader`) — tRPC'nin
 *     yukarıdaki döngüde yazdığı `trpc-accept, accept` değeri EZİLMEZ, Express
 *     `res.append()` virgülle BİRİKTİRİR.
 * Kapsam kararı (Task'ın "kapsam senin" notu): yalnızca `/trpc` kapatılıyor —
 * `apps/api/src/trpc/**` dışına çıkan ortak bir interceptor bu alt görevin
 * dosya listesinde DEĞİL. `/auth/*` için AYNI sınıf AÇIK kalıyor (security
 * tur 1'in ÖLÇTÜĞÜ, `/auth/sessions` de `cache-control` taşımıyor — v0.0.4/
 * v0.0.5 borcu, bu alt görev onu BÜYÜTMÜYOR) — RİSKLER'de bildirildi.
 */
async function forwardTrpcWebResponse(
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

  httpAdapter.setHeader(res, 'cache-control', 'no-store, private')
  httpAdapter.appendHeader(res, 'vary', 'Cookie')

  const rawBody = await response.text()
  httpAdapter.reply(res, rawBody.length > 0 ? rawBody : null, response.status)
}

/** Durumsuz — modül yüklenirken BİR KEZ kurulur (`@arkesoft/trpc/server`, S3). */
const handleTrpcRequest = createTrpcRequestHandler()

@Controller()
export class TrpcController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(TenantReadPortAdapter) private readonly tenantRead: TenantReadPortAdapter,
    @Inject(TrpcErrorsPortAdapter) private readonly errorsPort: TrpcErrorsPortAdapter,
  ) {}

  @UseGuards(SameOriginGuard)
  @All('trpc/*path')
  async handle(@Req() req: TrpcHttpRequest, @Res() res: HttpResponseLike): Promise<void> {
    const request = buildTrpcWebRequest(req, this.env.AUTH_BASE_URL)
    const context = createTrpcContext({ tenantRead: this.tenantRead }, this.errorsPort)

    const response = await handleTrpcRequest({ req: request, context })
    await forwardTrpcWebResponse(response, res, this.adapterHost.httpAdapter)
  }
}
