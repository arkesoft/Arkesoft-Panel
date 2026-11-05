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
// GÜNCELLEME (ROADMAP v0.0.7, T-008/S3, architect K2, ADR-0011): bu yorum
// EVVELCE "`/trpc/*` ne `TENANT_EXEMPT_PATHS`'te ne `AUTH_EXEMPT_PATHS`'te
// yer alır" diyordu — bu artık KİRACI yarısı için YANLIŞ. Doğrusu: AYRI
// AYRI iki karar. `TENANT_EXEMPT_PATHS`'e v0.0.7'de **TEK** satır eklendi:
// `/trpc/session.me` (gerekçe `tenant-exempt-paths.ts` dosya başı yorumu,
// grup (4)) — `/trpc/*`'nin GERİ KALANI hâlâ kiracı bağlamından muaf DEĞİL.
//
// GÜNCELLEME (ROADMAP v0.0.8, T-009/S7, ADR-0012): `AUTH_EXEMPT_PATHS`'e
// v0.0.8'de **TEK** satır eklendi: `/trpc/storefront.currentTenant`
// (`publicTenantProcedure` — kimlik YOK, kiracı ZORUNLU; gerekçe
// `auth-exempt-paths.ts` dosya başı yorumu, dördüncü grup, ADR-0012'nin dört
// koşulu). `TENANT_EXEMPT_PATHS` BU satırla DEĞİŞMEDİ — vitrin
// ziyaretçisi KİMLİKSİZDİR ama KİRACISIZ DEĞİLDİR, kiracı `Host`'tan
// çözülmek ZORUNDADIR. Kimse `publicProcedure`'ü (kiracı da gerektirmeyen
// taban builder, `@arkesoft/trpc/server`'ın `trpc.ts`'i) HTTP'de
// "erişilebilir" yapmak için bu iki kümeye GEREKÇESİZ satır eklemeye
// KALKMASIN — her ekleme ADR-0012 gibi AYRI ve AÇIK bir karar gerektirir, bu
// BİLİNÇLİ bir tasarım sınırıdır, eksik değil. Pipeline:
// `RequestContext → TenantContext → AuthContext middleware → TenantGuard
// (unresolved → 404) → AuthGuard (oturumsuz → 401 · üye değil → 403) →
// RateLimitGuard (/trpc'de anında true) → SameOriginGuard (@UseGuards,
// burada) → TrpcController.handle → createTrpcRequestHandler`.
//
// GÜNCELLEME (ROADMAP v0.0.14, T-014/S4, ADR-0016 madde 6): `TENANT_EXEMPT_PATHS`'e
// bu sürümde **TEK** satır eklendi — `/trpc/member.acceptInvitation`. ⚠ Yukarıdaki
// v0.0.8 paragrafı artık kümenin BÜYÜKLÜĞÜNÜ KOPYALAMIYOR: kanonik liste ve
// kardinalite `tenancy/tenant-exempt-paths.ts`'te yaşıyor ve bu dosyada bir
// sayı tekrarlamak kaçınılmaz olarak bayatlıyordu (ölçüldü — o paragraf
// v0.0.14'e kadar "13'te kalır" diyordu). ⚠ `AUTH_EXEMPT_PATHS` BU satırla
// DEĞİŞMEDİ (`git status` → o dosya temiz); büyüklüğü BURADA TEKRARLANMIYOR,
// kanonik kaynağı `auth/auth-exempt-paths.ts` ve kardinalite assertion'ı
// `__tests__/auth-exempt-paths.test.ts`'tir. (⚠ ÖLÇÜLDÜ: bu dosyanın v0.0.8
// paragrafı o kümeyi "9'da kalır" diye yazıyor ama küme v0.0.8'in KENDİ
// eklemesiyle ONA ulaşmıştı — kopyalanan sayı bayatlamanın ders kitabı
// örneği. v0.0.14 o hatayı TEKRARLAMIYOR.) Kabul eden kişi KİMLİKSİZ
// DEĞİLDİR — oturumu
// ZORUNLUDUR (`protectedProcedure`), yalnızca KİRACI bağlamından muaftır,
// çünkü tanım gereği henüz üye değildir ve kiracı bağlamını bir YETENEK
// belirtecinden türetir. Muafiyetin dört koşulu o dosyanın başındadır.
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
import { JobReadPortAdapter } from './ports/job-read.port.adapter.js'
import { MemberWritePortAdapter } from './ports/member-write.port.adapter.js'
import { MembershipReadPortAdapter } from './ports/membership-read.port.adapter.js'
import { StorefrontTenantReadPortAdapter } from './ports/storefront-tenant-read.port.adapter.js'
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
 * GÜNCELLEME (ROADMAP v0.0.7, T-008/S3, architect K6, borç 1440+1441+1453):
 * önbellek politikası (`Cache-Control`/`Vary: Cookie`) yazımı ARTIK BURADA
 * DEĞİL — `NoStoreHeadersMiddleware` (guard'lardan ÖNCE koşan GLOBAL
 * middleware, politika tek kaynağı `http/` dizinindeki yanıt başlığı politika
 * modülü) HER yanıta (guard reddi dahil) bu başlıkları ZATEN yazmış durumda (security
 * tur 1'in medium bulgusunun — GUARD ATLATMA, CLAUDE.md §7 madde 9 — kalıcı
 * çözümü; ESKİ çözüm yalnızca BAŞARILI `/trpc` yanıtlarını kapatıyordu, guard
 * reddini KAPATMIYORDU — 0/5). Bu döngü EZİLMEYİ önler: `cache-control` HİÇ
 * yazılmaz (politika platformun) ve `vary` `setHeader` YERİNE `appendHeader`
 * kullanır — tRPC'nin KENDİ ürettiği `vary: trpc-accept, accept` değeri
 * middleware'in yazdığı `Cookie`'yi EZMESİN (Express `res.append()` virgülle
 * BİRİKTİRİR, `res.set()` DEĞİŞTİRİR). `set-cookie` DEĞİŞMEDİ.
 */
async function forwardTrpcWebResponse(
  response: Response,
  res: HttpResponseLike,
  httpAdapter: AbstractHttpAdapter,
): Promise<void> {
  for (const [name, value] of response.headers) {
    const lowerName = name.toLowerCase()
    if (lowerName === 'set-cookie' || lowerName === 'cache-control') {
      continue
    }
    if (lowerName === 'vary') {
      httpAdapter.appendHeader(res, name, value)
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

/** Durumsuz — modül yüklenirken BİR KEZ kurulur (`@arkesoft/trpc/server`, S3). */
const handleTrpcRequest = createTrpcRequestHandler()

@Controller()
export class TrpcController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(TenantReadPortAdapter) private readonly tenantRead: TenantReadPortAdapter,
    @Inject(StorefrontTenantReadPortAdapter)
    private readonly storefrontTenantRead: StorefrontTenantReadPortAdapter,
    @Inject(JobReadPortAdapter) private readonly jobRead: JobReadPortAdapter,
    @Inject(MembershipReadPortAdapter)
    private readonly membershipRead: MembershipReadPortAdapter,
    @Inject(MemberWritePortAdapter) private readonly memberWrite: MemberWritePortAdapter,
    @Inject(TrpcErrorsPortAdapter) private readonly errorsPort: TrpcErrorsPortAdapter,
  ) {}

  @UseGuards(SameOriginGuard)
  @All('trpc/*path')
  async handle(@Req() req: TrpcHttpRequest, @Res() res: HttpResponseLike): Promise<void> {
    const request = buildTrpcWebRequest(req, this.env.AUTH_BASE_URL)
    // ⚠ `TrpcPorts` burada ELLE kurulur (üretimdeki TEK yer). `jobRead`
    // v0.0.11'den, `membershipRead` ve `memberWrite` ise v0.0.14'ten
    // itibaren ZORUNLU üyedir — herhangi biri atlanırsa typecheck kırılır
    // (`context/trpc-context.types.ts`'in gerekçesi, po R-P2/R-PM5).
    // ⚠ Üyeleri OPSİYONEL yaparak typecheck hatasını susturmak o dosyanın
    // YAZILI yasağıdır; doğru çözüm portu DOLDURMAKTIR — bu satırlar o
    // çözümün ta kendisi.
    const context = createTrpcContext(
      {
        tenantRead: this.tenantRead,
        storefrontTenantRead: this.storefrontTenantRead,
        jobRead: this.jobRead,
        membershipRead: this.membershipRead,
        memberWrite: this.memberWrite,
      },
      this.errorsPort,
    )

    const response = await handleTrpcRequest({ req: request, context })
    await forwardTrpcWebResponse(response, res, this.adapterHost.httpAdapter)
  }
}
