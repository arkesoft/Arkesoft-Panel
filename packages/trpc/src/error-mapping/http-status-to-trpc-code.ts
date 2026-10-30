// @arkesoft/trpc — durum↔kod kapalı-dünya haritası (ROADMAP v0.0.6, T-007/ST-2,
// architect "Hata eşlemesi" bölümü, ADR-0010 madde 3.5)
//
// `appErrorBoundary` (trpc.ts) bu fonksiyonu `AppError.httpStatus`'u doğru
// `TRPC_ERROR_CODE_KEY`'e çevirmek için kullanır — "AppError → TRPCError
// çevirisi appErrorBoundary'de, formatter'da DEĞİL" (ADR-0010 madde 3.4):
// HTTP durumunu adaptör (`fetchRequestHandler`) seçtiğimiz tRPC KODUNDAN
// türetir; bu yüzden tabloyu KAPALI-DÜNYA ve DOĞRU seçmek AC3'ü (401 kalması)
// doğrudan belirler.
//
// AÇIK TABLO (S1'in çıkardığı 21 anahtarın HTTP karşılıkları, tRPC'nin kendi
// dahili eşlemesiyle TUTARLI — aksi hâlde adaptörün ters çevirdiği HTTP
// durumu AppError'ın gerçek durumundan SAPAR). Bilinmeyen bir `httpStatus`
// → fail-closed `INTERNAL_SERVER_ERROR` + `warn` log (ADR-0008'in
// "deny-list fail-open, allowlist fail-closed" dersinin burada tekrarı).
//
// `PARSE_ERROR` BİLİNÇLİ OLARAK tabloda YOK: bu kod yalnızca tRPC'nin KENDİ
// ürettiği bozuk-JSON-gövdesi durumunda doğar (appErrorBoundary'nin hiç
// GÖRMEDİĞİ bir çerçeve hatası, bkz. architect "Kapsam dışı"); 400 durumunun
// KANONİK karşılığı burada `BAD_REQUEST`dir. Bu asimetri gidiş-dönüş testinin
// (S4) "gidiş-dönüşü olmayan durumlar" listesine açıkça yazılması gereken
// türden bir durumdur.

import type { TRPC_ERROR_CODE_KEY } from '@trpc/server'

import type { TrpcLoggerPort } from '../context/trpc-context.types.js'

const HTTP_STATUS_TO_TRPC_CODE: Readonly<Record<number, TRPC_ERROR_CODE_KEY>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  402: 'PAYMENT_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_SUPPORTED',
  408: 'TIMEOUT',
  409: 'CONFLICT',
  412: 'PRECONDITION_FAILED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_CONTENT',
  428: 'PRECONDITION_REQUIRED',
  429: 'TOO_MANY_REQUESTS',
  499: 'CLIENT_CLOSED_REQUEST',
  500: 'INTERNAL_SERVER_ERROR',
  501: 'NOT_IMPLEMENTED',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
}

/**
 * `httpStatus`'u kapalı-dünya tabloyla `TRPC_ERROR_CODE_KEY`'e çevirir.
 * Tabloda olmayan bir durum FAIL-CLOSED olarak `INTERNAL_SERVER_ERROR`'a
 * düşer ve `logger.warn` ile görünür kılınır (sessiz yanlış eşleme yasak).
 */
export function httpStatusToTrpcCode(
  httpStatus: number,
  logger: TrpcLoggerPort,
): TRPC_ERROR_CODE_KEY {
  const mapped = HTTP_STATUS_TO_TRPC_CODE[httpStatus]

  if (mapped !== undefined) {
    return mapped
  }

  logger.warn('trpc.error-mapping.unmapped-http-status', { httpStatus })
  return 'INTERNAL_SERVER_ERROR'
}
