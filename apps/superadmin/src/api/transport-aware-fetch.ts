// @arkesoft/superadmin — transportAwareFetch: tRPC istemcisine geçirilen
// `fetch` ponyfill'i (ROADMAP v0.0.20, T-021/S8, `apps/admin/src/api/
// transport-aware-fetch.ts` ile BİREBİR aynı mekanizma — cross-app import
// yasak olduğu için yerel kopya).
//
// tRPC istemcisi `/trpc` dışına (örn. `SameOriginGuard`/`PlatformAdminIpGuard`
// reddi) düz `AppErrorBody` + HTTP durumu olarak dönen bir taşıma reddini
// `data` alanı taşımayan bir `TRPCClientError`'a çevirir — `normalizePanelError`
// probe 2 o durumda EŞLEŞMEZ. Bu dosya `!response.ok` olan her yanıtın
// gövdesini BİR KEZ okur: `appErrorBodySchema` ayrıştırıyorsa probe 1'in
// tanıdığı şekle (`{body: AppErrorBody}`) sarılıp FIRLATILIR; aksi hâlde
// gövdenin İÇERİĞİ korunarak TAZE bir yanıt nesnesiyle tRPC'ye OLDUĞU GİBİ
// geçilir.
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
 * uyuşmuyor. `exactOptionalPropertyTypes` altında `init`'i OLDUĞU GİBİ
 * geçirmek yerine TAZE bir `RequestInit` KOŞULLU kurulur — her alan
 * yalnızca TANIMLIYSA eklenir.
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
    throw Object.assign(new Error('transport_rejection'), { body: parsedAppError.data })
  }

  return createPassthroughResponse(response.ok, parsedBody)
}
