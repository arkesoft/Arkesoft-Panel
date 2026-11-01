// @arkesoft/admin — transportAwareFetch: tRPC istemcisine geçirilen `fetch`
// ponyfill'i (ROADMAP v0.0.7, T-008/S4, architect K3, borç 1446).
//
// NEDEN BU DOSYA VAR: tRPC istemcisi `/trpc` dışına (örn. `SameOriginGuard`
// reddi) düz `AppErrorBody` + HTTP durumu olarak dönen bir taşıma reddini
// `data` alanı taşımayan bir `TRPCClientError`'a çevirir — `normalizePanelError`
// probe 2 (`{data: trpcErrorDataSchema}`) o durumda EŞLEŞMEZ. Bu dosya
// `!response.ok` olan her yanıtın gövdesini BİR KEZ okur (klonlanmaz —
// `Response.clone()` KULLANILMAZ): `appErrorBodySchema` ayrıştırıyorsa probe
// 1'in tanıdığı şekle (`{body: AppErrorBody}`) sarılıp FIRLATILIR; aksi
// hâlde (ör. ters vekilden gelen bir HTML hata sayfası) gövdenin İÇERİĞİ
// korunarak TAZE bir yanıt nesnesiyle tRPC'ye OLDUĞU GİBİ geçilir (probe 2
// yolu — `httpRequest` kendi `res.json()`'unu bu TAZE nesne üzerinden
// çağırır, akış TEKRAR okunmaz çünkü artık gerçek bir `Response` akışı
// DEĞİLDİR).
//
// A-A6 ÖLÇÜMÜ (gerçek `@trpc/client@11.19.0` ile, ağsız — ponyfill'in
// FIRLATTIĞI hatayla bir `httpLink` + `createTRPCClient` tetiklendi):
// `TRPCClientError.meta` BU senaryoda `undefined` KALIYOR (`httpLink.ts`'in
// `.catch` dalı `meta`'yı YALNIZCA `.then`'in `res.meta`'sından okuyor; fetch
// REDDETTİĞİNDE `.then` hiç ÇALIŞMIYOR) — `meta` ham gövdeyi TAŞIMIYOR.
// Bunun yerine `TRPCClientError.cause` BİZİM fırlattığımız `Error`'ı (ve onun
// `.body`'sini) TAŞIYOR — `normalizePanelError`'ın probe 1'deki "`input.cause`,
// azami 2 derinlik" dalı TAM OLARAK bu gerçek şekli karşılamak için var.
// SONUÇ: ponyfill KALDIRILMADI (gerekli), `.meta`'ya güvenilmedi.
import { appErrorBodySchema } from '@arkesoft/errors'
import type { TrpcClientOptions } from '@arkesoft/trpc'

/** `createTrpcClient`'ın `fetch` seçeneğinin TAM tipi — elle yeniden yazılmaz. */
type TransportAwareFetch = NonNullable<TrpcClientOptions['fetch']>

/** tRPC'nin bize geçirdiği `init` seçeneğinin tam tipi — elle yeniden yazılmaz. */
type TransportAwareFetchInit = Parameters<TransportAwareFetch>[1]

/** `!response.ok` yanıtının gövdesi JSON DEĞİLSE (ör. HTML hata sayfası) döndürülen minimal yanıt şekli. */
interface PassthroughResponse {
  readonly ok: boolean
  json(): Promise<unknown>
}

function createPassthroughResponse(ok: boolean, body: unknown): PassthroughResponse {
  return {
    ok,
    json: () => Promise.resolve(body),
  }
}

/**
 * tRPC'nin `RequestInitEsque.signal`'ı (`AbortSignal | undefined`) global
 * `fetch`'in `RequestInit.signal`'ı (`AbortSignal | null`) ile YAPISAL
 * uyuşmuyor (architect'in `create-trpc-client.ts:22-38`'de ölçtüğü tuzağın
 * AYNISI, burada global `fetch` çağrısında tekrar karşımıza çıkıyor).
 * `exactOptionalPropertyTypes` altında `init`'i OLDUĞU GİBİ geçirmek yerine
 * TAZE bir `RequestInit` KOŞULLU kurulur (`resolveHttpLinkOptions`
 * deseninin aynısı) — her alan yalnızca TANIMLIYSA eklenir, `undefined`
 * AÇIKÇA atanmaz; `signal` tanımlıysa bu noktada TypeScript onu
 * `AbortSignal`'a (non-undefined) DARALTIR, bu da `AbortSignal | null`'a
 * sorunsuz atanır. Tip zorlama veya gevşetilmiş tip YOK — yalnızca daraltma.
 */
function resolveNativeRequestInit(init: TransportAwareFetchInit): RequestInit | undefined {
  if (init === undefined) {
    return undefined
  }

  const resolved: RequestInit = {}

  if (init.method !== undefined) {
    resolved.method = init.method
  }
  if (init.headers !== undefined) {
    resolved.headers = init.headers
  }
  if (init.body !== undefined) {
    resolved.body = init.body
  }
  if (init.signal !== undefined) {
    resolved.signal = init.signal
  }

  return resolved
}

/**
 * tRPC'nin `httpLink`'ine geçirilen `fetch` ponyfill'i. Başarılı yanıtın
 * (`response.ok`) gövdesine HİÇ DOKUNMAZ — yalnızca `!response.ok` dalı
 * gövdeyi okur.
 */
export const transportAwareFetch: TransportAwareFetch = async (input, init) => {
  const response = await fetch(input, resolveNativeRequestInit(init))

  if (response.ok) {
    return response
  }

  let parsedBody: unknown
  try {
    parsedBody = await response.json()
  } catch {
    // Gövde JSON DEĞİL — appErrorBodySchema'ya UYAMAZ; içerik olmadan,
    // olduğu gibi geçilir (fail-closed: normalizePanelError hiçbir probe'da
    // eşleşmeyip `unknown`'a düşer).
    return createPassthroughResponse(response.ok, undefined)
  }

  const parsedAppError = appErrorBodySchema.safeParse(parsedBody)
  if (parsedAppError.success) {
    // Probe 1'in tanıdığı şekil (`{body: AppErrorBody}`) — A-A6 ÖLÇÜMÜNÜN
    // `TRPCClientError.cause`'a taşındığı doğrulanan şekil.
    throw Object.assign(new Error('transport_rejection'), { body: parsedAppError.data })
  }

  // appErrorBodySchema'ya UYMAYAN bir JSON gövdesi (ör. tRPC'nin KENDİ
  // ürettiği hata şekli, `{error: {...}}`) — OLDUĞU GİBİ (içeriği KORUNARAK)
  // geçilir; tRPC'nin kendi `res.json()`'u bu TAZE nesneden okur.
  return createPassthroughResponse(response.ok, parsedBody)
}
