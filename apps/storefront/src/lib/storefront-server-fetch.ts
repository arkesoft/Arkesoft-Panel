// @arkesoft/storefront — storefrontServerFetch: tRPC istemcisine geçirilen
// `fetch` ponyfill'i (ROADMAP v0.0.8, T-009/S4, architect K18, ADR-0011
// "Etkilenen sonraki kararlar — v0.0.8").
//
// NEDEN BU DOSYA VAR: storefront SSR sırasında API'ye SUNUCU TARAFINDA, İÇ AĞ
// ÜZERİNDEN bağlanır — tarayıcı orijini sorunu bu yüzeyde DOĞMAZ (ADR-0011).
// Kiracı host'u istek başına kurulan istemcinin URL YETKİSİNE (authority)
// konur: `createTrpcClient({ url: \`http://${tenantHost}/trpc\`, fetch:
// createStorefrontServerFetch({ host: apiHost, port: apiPort }) })`. Çağıran
// elle bir `Host` başlığı KURMAZ — tek doğruluk kaynağı (host çözümü) bu
// şekilde korunur; `resolveOutgoingHeaders` giden `Host`'u URL yetkisinden
// KESİN olarak türetir.
//
// `node:http` KULLANILIR, global `fetch`/undici DEĞİL: undici'nin WHATWG
// fetch uygulaması `Host`'u YASAKLI başlık sayar ve AÇIKÇA KURULMASINA
// İZİN VERMEZ (kendi hesapladığı değerle SESSİZCE değiştirir) — K18'in
// "giden Host URL yetkisinden kesin kurulur" garantisi bu yüzden undici
// `fetch` üzerine İNŞA EDİLEMEZ (A-M2 ölçümü). `node:http`'nin `request()`'i
// `Host`'u OLDUĞU GİBİ gönderir.
//
// `StorefrontFetch` tipi `@arkesoft/trpc`'nin `TrpcClientOptions['fetch']`
// alanından İNDEKSLİ ERİŞİMLE türetilir — elle YENİDEN YAZILMAZ
// (`create-trpc-client.ts:32`'nin deseni; `apps/admin/src/api/
// transport-aware-fetch.ts:27` emsali BİREBİR). Bu dosyada tip zorlama
// (assertion) ve örtük tip gevşetmesi KULLANILMAZ (A-M2).
//
// DÜZELTME TURU 2 (T-009, architect yerleşim kararı): `res.on('end')` artık
// ÜÇ yola ayrılır — 2xx dokunulmaz; non-2xx + `appErrorBodySchema`'ya UYAN
// gövde panelin `transport-aware-fetch.ts`'iyle BİREBİR aynı şekilde
// (`{body, status}`) FIRLATILIR (taşıma reddi); diğer her non-2xx OLDUĞU
// GİBİ tRPC'ye geçer. Bu, `src/lib/map-api-error.ts`'in okuduğu zarf (a)'nın
// (taşıma reddi) ÜRETİM NOKTASIDIR — iki dosya BİRLİKTE okunmalı.
import { request } from 'node:http'

import { appErrorBodySchema } from '@arkesoft/errors'
import type { AppErrorBody } from '@arkesoft/errors'
import type { TrpcClientOptions } from '@arkesoft/trpc'

/** `createTrpcClient`'ın `fetch` seçeneğinin TAM tipi — elle yeniden yazılmaz. */
type StorefrontFetch = NonNullable<TrpcClientOptions['fetch']>

/** `StorefrontFetch`'in girdi/seçenek parametrelerinin TAM tipleri — elle yeniden yazılmaz. */
type StorefrontFetchInput = Parameters<StorefrontFetch>[0]
type StorefrontFetchInit = Parameters<StorefrontFetch>[1]

/**
 * API sürecinin SUNUCU TARAFI (iç ağ) bağlantı hedefi. İstek URL'inin
 * YETKİSİ (authority — kiracı host'u) DEĞİLDİR; bu iki değer K18'in
 * bağlayıcı ayrımı gereği KASITLI olarak farklı kaynaklardan gelir.
 */
export interface ApiConnectionTarget {
  readonly host: string
  readonly port: number
}

/**
 * API yavaşlarsa SSR'ın kuyruklanmaması için sabit zaman aşımı (K18). Bu
 * zaman aşımının HTTP 503'e eşlenmesi `src/middleware.ts`'in (S6) işidir —
 * bu dosya yalnızca isteği KESER, durum kodu çevirmez.
 */
const API_REQUEST_TIMEOUT_MS = 5000

/** `StorefrontFetch`'in girdisinden (string | URL | Request) hedef URL'i çıkarır. */
function resolveRequestUrl(input: StorefrontFetchInput): URL {
  if (typeof input === 'string') {
    return new URL(input)
  }
  if (input instanceof URL) {
    return input
  }
  // `Request` nesnesi — tRPC'nin KENDİ `httpLink`'i BUGÜN yalnızca string
  // URL geçiriyor (`httpUtils.ts:219`, ölçüldü); `FetchEsque` tipi `Request`'i
  // de KAPSADIĞI için tam tip uyumu burada sağlanır.
  return new URL(input.url)
}

/**
 * Giden başlıkları kurar. `init.headers`'ın ÜÇ olası şekli (`Headers`,
 * `[string,string][]`, düz nesne) tek düz nesneye indirgenir; ardından
 * `host` alanı URL YETKİSİNDEN KESİN olarak EZİLİR — K18'in bağlayıcı
 * mekanizması, çağıranın (varsa) kurduğu bir `host` başlığına GÜVENMEZ.
 */
function resolveOutgoingHeaders(
  requestUrl: URL,
  init: StorefrontFetchInit,
): Record<string, string> {
  const headers: Record<string, string> = {}
  const incoming = init?.headers

  if (incoming !== undefined) {
    if (incoming instanceof Headers) {
      for (const [key, value] of incoming.entries()) {
        headers[key] = value
      }
    } else if (Array.isArray(incoming)) {
      for (const [key, value] of incoming) {
        headers[key] = value
      }
    } else {
      for (const [key, value] of Object.entries(incoming)) {
        headers[key] = value
      }
    }
  }

  headers['host'] = requestUrl.host

  return headers
}

/** `init.method` yoksa tRPC'nin query prosedürleri için beklediği `GET`'e düşer. */
function resolveOutgoingMethod(init: StorefrontFetchInit): string {
  return init?.method ?? 'GET'
}

/**
 * `init.body`'yi node:http'ye yazılabilir bir `string`'e indirger. tRPC'nin
 * KENDİ `getBody`'si (`httpUtils.ts:135-141`) YALNIZCA `string | undefined`
 * ÜRETİR — bu fonksiyonun `string`/`undefined` DIŞI dalı pratikte hiç
 * ÇALIŞMAZ; tip güvenliği için var, fail-closed (sessizce veri kaybetmek
 * yerine FIRLATIR).
 */
function resolveOutgoingBody(init: StorefrontFetchInit): string | undefined {
  const body = init?.body

  if (body === undefined || body === null) {
    return undefined
  }
  if (typeof body === 'string') {
    return body
  }

  throw new Error('storefront_server_fetch_unsupported_body_type')
}

/**
 * Çağıranın (varsa) sinyaliyle sabit zaman aşımı sinyalini BİRLEŞTİRİR —
 * ikisinden önce tetiklenen isteği keser. Yalnızca zaman aşımı varsa tek
 * sinyal döner (gereksiz `AbortSignal.any` sarmalaması yapılmaz).
 */
function resolveAbortSignal(init: StorefrontFetchInit): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(API_REQUEST_TIMEOUT_MS)
  const callerSignal = init?.signal ?? undefined

  return callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal])
}

/**
 * `rawBody`'den `ResponseEsque`'in (tRPC'nin beklediği minimal yanıt şekli)
 * yapısal karşılığını üretir. `json()` TEK doğruluk kaynağı olarak
 * `rawBody`'den okur — çağıranı sınıflandırmak için gövde daha önce AYRICA
 * ayrıştırılmış olsa bile (düzeltme turu 2, yol 3) o ayrıştırılmış değer
 * BURAYA geçirilmez.
 *
 * `json()`'un `JSON.parse`'ın SENKRON fırlattığı hatayı (bozuk JSON) REDDEDİLMİŞ
 * bir Promise'e çevirmesi GEREKİR — `ResponseEsque` sözleşmesi `json()`'un HER
 * ZAMAN bir Promise döndürmesini ister, senkron fırlatma bu sözleşmeyi ihlal
 * ederdi (düzeltme turu 2). `try`/`catch` ile `Promise.reject` KULLANILIR —
 * `async` İŞARETLENMEZ: `JSON.parse`'ın dönüşü `unknown`'a AÇIKÇA tipleniyor
 * (`packages/db/src/bootstrap-roles.ts:88`'in `const manifest: unknown =
 * JSON.parse(...)` deseni BİREBİR), `any` dışarı SIZMAZ.
 */
function createServerFetchResponse(
  statusCode: number,
  rawBody: Buffer,
): { ok: boolean; json(): Promise<unknown> } {
  return {
    ok: statusCode >= 200 && statusCode < 300,
    json: () => {
      if (rawBody.length === 0) {
        return Promise.resolve(undefined)
      }
      try {
        const parsedJson: unknown = JSON.parse(rawBody.toString('utf8'))
        return Promise.resolve(parsedJson)
      } catch (error) {
        // `catch`'in bağladığı `error` `unknown`'dur (`useUnknownInCatchVariables`)
        // — `@typescript-eslint/prefer-promise-reject-errors` reddedilen
        // değerin bir `Error` OLMASINI ister; `JSON.parse`'ın fırlattığı
        // `SyntaxError` zaten bir `Error` ama tip olarak daraltılmamış,
        // fail-closed narrowing ile (`instanceof` sonrası `as` YOK).
        return Promise.reject(error instanceof Error ? error : new Error(String(error)))
      }
    },
  }
}

/**
 * Gövdeyi `JSON.parse` eder ve {@link appErrorBodySchema}'ya uyup
 * uymadığına bakar — bozuk JSON/şemaya uymayan gövde için `undefined`
 * döner, FIRLATMAZ (çağıran, yol 2/yol 3 ayrımını bu dönüş değeriyle yapar).
 */
function parseAppErrorBody(rawBody: Buffer): AppErrorBody | undefined {
  if (rawBody.length === 0) {
    return undefined
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return undefined
  }

  const parsedAppError = appErrorBodySchema.safeParse(parsedJson)
  return parsedAppError.success ? parsedAppError.data : undefined
}

/**
 * `target`'a (API'nin iç ağ adresi) bağlanan, kiracı host'unu `Host`
 * başlığında KESİN taşıyan bir `fetch` ponyfill'i üretir. `url`'in
 * YETKİSİ (`resolveRequestUrl(input).host`) giden `Host`'u belirler;
 * `target` yalnızca BAĞLANTININ (TCP soketinin) gittiği yerdir.
 */
export function createStorefrontServerFetch(target: ApiConnectionTarget): StorefrontFetch {
  // `async` olarak işaretli: `resolveOutgoingBody`'nin SENKRON fırlattığı
  // hata (desteklenmeyen gövde tipi dalı) bu sayede OTOMATİK olarak
  // REDDEDİLMİŞ bir Promise'e çevrilir — çağıran her zaman bir Promise alır,
  // asla senkron bir fırlatmayla karşılaşmaz (`FetchEsque` sözleşmesi).
  return async function storefrontServerFetch(input, init) {
    const requestUrl = resolveRequestUrl(input)
    const headers = resolveOutgoingHeaders(requestUrl, init)
    const method = resolveOutgoingMethod(init)
    const body = resolveOutgoingBody(init)
    const signal = resolveAbortSignal(init)

    return new Promise((resolve, reject) => {
      const req = request(
        {
          host: target.host,
          port: target.port,
          path: requestUrl.pathname + requestUrl.search,
          method,
          headers,
          signal,
        },
        (res) => {
          const chunks: Buffer[] = []

          res.on('data', (chunk: Buffer) => {
            chunks.push(chunk)
          })
          res.on('end', () => {
            const statusCode = res.statusCode ?? 502
            const rawBody = Buffer.concat(chunks)

            // Yol 1 — 2xx: bugünkü davranış, BAŞARI GÖVDESİNE HİÇ DOKUNULMAZ
            // (`transport-aware-fetch.ts`'in "`response.ok` gövdesine hiç
            // dokunmaz" emsali).
            if (statusCode >= 200 && statusCode < 300) {
              resolve(createServerFetchResponse(statusCode, rawBody))
              return
            }

            // Yol 2 — non-2xx + gövde `appErrorBodySchema`'ya UYUYOR: taşıma
            // reddi olarak FIRLAT (`reject`). Mesaj literali ve `body` anahtarı
            // panelin `transport-aware-fetch.ts`'iyle BİREBİR aynı; eklenen TEK
            // alan `status` (A-A6'nın storefront yolu için `mapApiError`'ın
            // zarf (a) probe'unun okuduğu alan). Fırlatılan nesne `body` ve
            // `status` DIŞINDA HİÇBİR ŞEY taşımaz — ham gövde dizesi,
            // başlıklar, URL YOK.
            //
            // ÇİFT AYRIŞTIRMA (bilinçli, düzeltme turu 2 spesifikasyonu):
            // `parseAppErrorBody` burada gövdeyi BİR KEZ ayrıştırıyor
            // (sınıflandırma için); yol 3'e düşülürse `createServerFetchResponse`
            // İKİNCİ kez `rawBody`'den ayrıştırır (`json()` içinde). Ayrıştırılmış
            // değeri `createServerFetchResponse`'a geçirmek `json()` ile
            // `rawBody`'yi İKİ doğruluk kaynağına BÖLERDİ — bu yüzden çift
            // ayrıştırma KASITLI, yalnızca hata yolunda (performans maliyeti
            // ihmal edilebilir: tek seferlik hata gövdesi, hot path DEĞİL).
            const parsedAppError = parseAppErrorBody(rawBody)
            if (parsedAppError !== undefined) {
              reject(
                Object.assign(new Error('transport_rejection'), {
                  body: parsedAppError,
                  status: statusCode,
                }),
              )
              return
            }

            // Yol 3 — diğer her non-2xx (JSON değil / `appErrorBodySchema`'ya
            // UYMUYOR — ör. tRPC'nin kendi JSON-RPC hata zarfı, ters vekilin
            // HTML'i, boş gövde): OLDUĞU GİBİ tRPC'ye geçer,
            // `TRPCClientError.data` normal oluşur.
            resolve(createServerFetchResponse(statusCode, rawBody))
          })
          res.on('error', reject)
        },
      )

      req.on('error', reject)

      if (body !== undefined) {
        req.write(body)
      }
      req.end()
    })
  }
}
