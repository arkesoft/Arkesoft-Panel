// @arkesoft/trpc — istemci factory'si (ROADMAP v0.0.6, T-007/ST-2, architect
// "tRPC sözleşmesi", ADR-0009 madde 8)
//
// `httpLink` kullanılır, `httpBatchLink` ASLA (`rg -n "httpBatchLink"` → 0
// olmalı). BATCHING KAPALI BAĞLAYICI DEĞİŞMEZLİK: bir public prosedürün
// kimlik muafiyeti TAM YOL eşleşmesiyle verilecek (`AUTH_EXEMPT_PATHS`);
// toplu istekte tek HTTP yolu birden fazla prosedür taşır ve bu mekanizma
// SESSİZCE geçersizleşir. Batching'i açmak ADR-0009'u yeniden değerlendirmeyi
// gerektirir — bu dosyada `httpBatchLink` KULLANILMAZ.
//
// `AppRouter`'ın yalnızca TİPİ kullanılır (`import type`) — `verbatimModuleSyntax`
// bunu derlemede SİLER; `dist/index.js` bu yüzden `routers/app.router.js`'i
// (sunucu tarafı, resolver'ları ve portları ÇÖZEN kodu) ÇEKMEZ.

import { createTRPCClient, httpLink } from '@trpc/client'

import type { AppRouter } from '../routers/app.router.js'

/** {@link httpLink}'e geçirilecek seçeneklerin tam tipi — jeneriği elle tekrar yazmaz. */
type HttpLinkOptions = Parameters<typeof httpLink<AppRouter>>[0]

/**
 * `httpLink`'in BEKLEDİĞİ `fetch` ponyfill tipi — tRPC'nin kendi `FetchEsque`
 * tipi PUBLIC export edilmediği için (`@trpc/client` barrel'ında yok) elle
 * YENİDEN YAZILMAZ; `HttpLinkOptions`'tan İNDEKSLİ ERİŞİMLE çıkarılır. Global
 * `fetch`in @types/node tipi (`init.signal: AbortSignal | undefined`) ile
 * tRPC'nin `RequestInitEsque` tipi (`signal: AbortSignal | null`) arasında
 * `exactOptionalPropertyTypes` altında YAPISAL bir uyumsuzluk var — bu yüzden
 * bu alanın tipi `typeof fetch` DEĞİL, doğrudan tRPC'nin KENDİ beklediği
 * şekildir (çağıran, global `fetch`i değil bu şekle uyan bir ponyfill geçirir).
 */
type HttpLinkFetch = NonNullable<HttpLinkOptions['fetch']>

export interface TrpcClientOptions {
  readonly url: string
  readonly fetch?: HttpLinkFetch
  readonly headers?: () => Record<string, string>
}

export type TrpcClient = ReturnType<typeof createTRPCClient<AppRouter>>

/**
 * `exactOptionalPropertyTypes` altında opsiyonel alanlara `undefined` ASLA
 * ATANMAZ — link yapılandırması KOŞULLU kurulur (`apps/api/src/errors/
 * error-mapping.ts:85-89`'daki desenin aynısı: alan tanımsızsa hiç
 * EKLENMEZ, `undefined` değeri EXPLICIT yazılmaz).
 */
function resolveHttpLinkOptions(options: TrpcClientOptions): HttpLinkOptions {
  const withFetch: HttpLinkOptions =
    options.fetch === undefined ? { url: options.url } : { url: options.url, fetch: options.fetch }

  if (options.headers === undefined) {
    return withFetch
  }

  const readHeaders = options.headers
  return { ...withFetch, headers: () => readHeaders() }
}

/** `AppRouter` ile tiplenmiş, toplu olmayan (`httpLink`) tRPC istemcisi üretir. */
export function createTrpcClient(options: TrpcClientOptions): TrpcClient {
  return createTRPCClient<AppRouter>({
    links: [httpLink<AppRouter>(resolveHttpLinkOptions(options))],
  })
}
