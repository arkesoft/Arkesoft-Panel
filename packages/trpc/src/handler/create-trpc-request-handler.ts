// @arkesoft/trpc — fetch adaptörü istek işleyicisi (ROADMAP v0.0.6, T-007/ST-2,
// architect K4, ADR-0009 madde 8)
//
// `apps/api`'nin `TrpcController`'ı (S5) bu factory'yi çağırır. Context
// EAGER kurulur (architect "Modül yerleşimi" bölümü) — `createContext` burada
// HESAPLAMA YAPMAZ, zaten kurulmuş {@link TrpcContext}'i olduğu gibi döner;
// `requestId` bu yüzden HER ZAMAN doludur (errorFormatter'daki `ctx?.` erişimi
// yalnızca çerçevenin KENDİ tip imzası için gerekli, bu EAGER garantiyi
// ORTADAN KALDIRMAZ, bkz. S1'in ölçtüğü dört bilgi #3).
//
// `allowBatching: false` BAĞLAYICI DEĞİŞMEZLİK (ADR-0009 madde 8, architect
// riski 5): bir public prosedürün kimlik muafiyeti TAM YOL eşleşmesiyle
// verilecek (`AUTH_EXEMPT_PATHS`); toplu istekte tek HTTP yolu birden fazla
// prosedür taşır ve bu mekanizma SESSİZCE geçersizleşir. Deprecated eş değeri
// `batching?: {enabled}` (v12'de kalkacak) KULLANILMAZ — S1'in spike'ta
// doğruladığı gerçek seçenek adı budur.

import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import type { TRPCError } from '@trpc/server'

import { appRouter } from '../routers/app.router.js'
import type { TrpcContext } from '../context/trpc-context.types.js'
import { trpcErrorDataSchema } from '../schemas/trpc-error-data.schema.js'

export interface TrpcHandlerOptions {
  readonly req: Request
  /** EAGER kurulmuş context — bu fonksiyon context'i HESAPLAMAZ, TAŞIR. */
  readonly context: TrpcContext
}

export type TrpcRequestHandler = (options: TrpcHandlerOptions) => Promise<Response>

/**
 * `fetchRequestHandler`'a verilen `onError` kancası (solid tur2 M6(1)).
 *
 * **KARAR — ne loglanır, ne loglanmaz, neden:**
 * `error.cause` {@link trpcErrorDataSchema} ile PARSE EDİLİYORSA bu hata
 * ZATEN `toTrpcError`/`errorFormatter`'ın tanıdığı, sınıflandırılmış bir
 * `AppError`'dır (`trpc.ts`'in `appErrorBoundary`'si tarafından BİLEREK
 * çevrildi) — beklenen bir iş akışı sonucudur (CLAUDE.md §4 "beklenen
 * durumlar için hata fırlat"), CLAUDE.md §4'ün log seviyesi tanımına göre
 * `error` ("müdahale gerekir") DEĞİL; bu dal burada ATLANIR (zaten
 * `error-formatter.test.ts`'in `cause-parse-fail` dalı AYRI bir `warn` ile
 * görünür).
 *
 * `error.cause` PARSE EDİLEMİYORSA (çerçeve kaynaklı rutin hata — bilinmeyen
 * prosedür, `?batch=1` reddi — VEYA `trpc.ts:150` civarının yeniden
 * fırlattığı bir NON-AppError programlama hatası, ör. port adaptöründe
 * beklenmeyen bir `TypeError`) bu, solid tur2 M6(b)'nin bulduğu boşluktur:
 * ADR-0010 madde 3.2 ("ham mesaj ve yığın izi yalnızca yapılandırılmış loga
 * gider") bugüne kadar HİÇBİR kod tarafından uygulanmıyordu. Burada
 * `ctx.logger.error` ile HAM mesaj + yığın izi loglanır — allowlist YERİNE
 * (v0.0.5'in `causeMessage` dersinin aksine) ham değer tercih edildi, çünkü
 * buradaki `cause` bir SAĞLAYICI yanıtı DEĞİL (müşteri verisi taşıma riski
 * taşımaz), kaynak kodun kendi `Error.message`/`stack`'idir — v0.0.5'teki
 * sızıntı `AppError.context`'in sağlayıcıdan gelen ham içeriği TAŞIMASIYDI;
 * burada hiçbir istek girdisi (`input`/`req` gövdesi) OKUNMUYOR, yalnızca
 * `error`/`error.cause`'un KENDİ mesaj/yığın izi. Bu log asla tele çıkmaz —
 * `errorFormatter` aynı anda `genericTransportErrorBody` ile jenerik bir
 * gövde üretir (trpc.ts, cause-parse-fail dalı); `onError` ve
 * `errorFormatter` BAĞIMSIZ çalışır, biri loglar biri tel gövdesini kurar.
 *
 * `ctx: TrpcContext | undefined` tipini `@trpc/server`'ın KENDİ imzası
 * dayatır (S1'in ölçtüğü dört bilgiden #3, `trpc.ts`'teki `FALLBACK_REQUEST_ID`
 * yorumuyla AYNI desen) — context EAGER kurulduğundan HTTP yolunda pratikte
 * her zaman doludur, ama tip düzeyinde `undefined` olabilir; `ctx === undefined`
 * ise enjekte edilmiş bir logger YOKTUR, bu dal SESSİZCE atlanır (`as`/`any`
 * KULLANILMAZ — daraltma `===` ile yapılır).
 */
function handleTrpcError({ error, ctx }: { error: TRPCError; ctx: TrpcContext | undefined }): void {
  if (ctx === undefined) {
    return
  }

  if (trpcErrorDataSchema.safeParse(error.cause).success) {
    return
  }

  ctx.logger.error('trpc.request-handler.unclassified-error', {
    requestId: ctx.requestId,
    trpcCode: error.code,
    message: error.cause?.message ?? error.message,
    stack: error.cause?.stack ?? error.stack,
  })
}

/** `/trpc` fetch adaptörü istek işleyicisini üretir. */
export function createTrpcRequestHandler(): TrpcRequestHandler {
  return ({ req, context }) =>
    fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router: appRouter,
      allowBatching: false,
      createContext: () => context,
      onError: handleTrpcError,
    })
}
