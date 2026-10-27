// @arkesoft/api — adaptör-nötr HTTP tipleri (ROADMAP v0.0.4, T-002/ST-4, architect K-A1)
//
// express ∩ fastify'ın YAPISAL kesişimi. `express`/`@nestjs/platform-express`/
// `@types/express`'ten BİLEREK import YOK — `apps/api/eslint.config.mjs`'in
// `no-restricted-imports` bloğu bunu zaten zorluyor (K-A1 "adaptör kenarda
// tutulur": fastify'a geçiş tek paket + `main.ts`, bu dosya DEĞİŞMEZ).
//
// Yanıt tarafında yalnızca YAZMA yüzeyi (`setHeader`) ve okuma/yaşam döngüsü
// yüzeyi (`statusCode`, `finish` olayı) tanımlanır — durum kodu/gövde yazımı
// TEK YERDE kalır: `AppExceptionFilter`, `HttpAdapterHost.httpAdapter.reply()`
// üzerinden (bkz. `errors/app-exception.filter.ts`). Bu dosyadaki tipler o
// kuralı İHLAL ETMEZ; yalnızca başlık yazımı ve tamamlanma gözlemi içindir.

/**
 * Node'un `http.IncomingHttpHeaders`'ıyla yapısal olarak uyumlu — express ve
 * fastify'ın ikisi de altyapıda bu şekli üretir.
 */
export type HttpRequestHeaders = Record<string, string | string[] | undefined>

/** İstek okuma yüzeyi: başlık/metot/URL. */
export interface HttpRequestLike {
  readonly headers: HttpRequestHeaders
  readonly method: string
  readonly url: string
}

/**
 * Yanıt YAZMA yüzeyi. `RequestContextMiddleware`'in `x-request-id` başlığını
 * handler'dan ÖNCE yazması (AC9) ve `AppExceptionFilter`'ın ikinci savunma
 * yazımı için yeterli — durum kodu/gövde yazımı bu tipin sorumluluğunda DEĞİL.
 */
export interface HttpResponseLike {
  setHeader(name: string, value: string): unknown
}

/**
 * `RequestLoggingInterceptor`'ın istek tamamlanma gözlemi için yanıt yüzeyi.
 * `statusCode` OKUMA ve `'finish'` olayı — Nest'in interceptor zinciri,
 * gerçek HTTP yazımından (adaptörün kendi response controller'ı) ÖNCE
 * tamamlanır; bu yüzden durum kodu güvenilir biçimde yalnızca yanıt
 * gönderildikten SONRA (`'finish'`) okunabilir. Hem express hem fastify'ın
 * altındaki `http.ServerResponse` bu yüzeyi taşır — adaptör-nötr.
 */
export interface HttpResponseWithLifecycle extends HttpResponseLike {
  readonly statusCode: number
  on(event: 'finish', listener: () => void): unknown
}
