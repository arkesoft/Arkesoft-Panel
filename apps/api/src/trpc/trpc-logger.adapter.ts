// @arkesoft/api — TrpcLoggerPort ince adaptörü (ROADMAP v0.0.6, T-007/S5,
// architect riski 11 + "Modül yerleşimi" bölümü)
//
// `packages/trpc`'nin `TrpcLoggerPort`'u somut bir logger kütüphanesine
// BAĞIMLI DEĞİL (architect riski 11: aşırı yüklenmiş pino imzalarının
// atanabilirliğine GÜVENİLMİYOR) — bu yüzden ham pino `Logger`'ı doğrudan
// context'e GEÇİRMİYORUZ. Bu dosyanın tek sorumluluğu: ALS'ten
// (`getRequestContext().logger`) OKUNAN pino örneğini üç metotlu
// (`info`/`warn`/`error`) porta çeviren İNCE bir sarmalayıcı kurmak.
//
// ALS `RequestContext.logger` alanına HİÇBİR ŞEY YAZMAZ — bu dosya yalnızca
// OKUR ve sarar; `request-context.types.ts`'in "en fazla üç yazıcı"
// sözleşmesi (`RequestContextMiddleware`/`TenantContextMiddleware`/
// `AuthContextMiddleware`) BU dosyayla GENİŞLEMEZ.

import type { Logger } from 'pino'
import type { TrpcLoggerPort } from '@arkesoft/trpc/server'

/** Verilen pino `Logger`'ı {@link TrpcLoggerPort}'a saran ince adaptör. */
export function createTrpcLoggerAdapter(logger: Logger): TrpcLoggerPort {
  return {
    info(message, context) {
      if (context === undefined) {
        logger.info(message)
      } else {
        logger.info(context, message)
      }
    },
    warn(message, context) {
      if (context === undefined) {
        logger.warn(message)
      } else {
        logger.warn(context, message)
      }
    },
    error(message, context) {
      if (context === undefined) {
        logger.error(message)
      } else {
        logger.error(context, message)
      }
    },
  }
}
