// @arkesoft/trpc — errorFormatter'ın döndürdüğü `data` alanının tel şeması
// (ROADMAP v0.0.6, T-007/ST-2, architect "HATA EŞLEMESİ", ADR-0010 madde 3)
//
// ADR-0010 madde 3.1 (BAĞLAYICI): tRPC'nin ürettiği `shape`/`shape.data` ASLA
// SPREAD EDİLMEZ — bu şemanın tanımladığı `data` nesnesi TAM OLARAK üç anahtar
// taşır: `code` (tRPC'nin kendi sözlüğü, `TRPC_ERROR_CODE_KEY`), `httpStatus`
// (adaptörün hesapladığı/`appErrorBoundary`'nin türettiği HTTP durumu) ve
// `appError` (platformun TEK tel gövdesi — `@arkesoft/errors`'un
// `appErrorBodySchema`'sı, HTTP yolundakiyle BİREBİR AYNI, AC10).
//
// Bu şema İKİ yerde kullanılır:
//   1. `errorFormatter`'ın `TShape['data']` tipini sabitlemek için (trpc.ts).
//   2. `appErrorBoundary`'nin bir `TRPCError`'a eklediği `cause` nesnesini
//      `errorFormatter`'da FAIL-CLOSED biçimde okumak için (`instanceof`
//      KULLANILMAZ — `isAppError`'ın yapısal yedek yolunun AYNI deseni,
//      AC9(a)).
//
// `data.appError.code` platformun KARARLI kodu; `data.code` tRPC sözlüğü.
// İstemci DAİMA `data.appError.code`'a dallanır (ADR-0010 madde 3.6).

import { z } from 'zod'
import { appErrorBodySchema } from '@arkesoft/errors'

export const trpcErrorDataSchema = z.object({
  code: z.string(),
  httpStatus: z.number(),
  appError: appErrorBodySchema,
})

/** {@link trpcErrorDataSchema}'nın çıkarılan tip karşılığı. */
export type TrpcErrorData = z.infer<typeof trpcErrorDataSchema>
