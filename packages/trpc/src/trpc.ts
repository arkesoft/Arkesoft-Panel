// @arkesoft/trpc — initTRPC kurulumu, errorFormatter, procedure builder'ları
// (ROADMAP v0.0.6, T-007/ST-2, architect "tRPC sözleşmesi" + "Hata eşlemesi"
// bölümleri, ADR-0009, ADR-0010)
//
// Transformer YOK (K5 — tel sözleşmesi yalnızca JSON ilkelleri taşır, `Date`
// yok → `superjson` gibi bir serileştirme bağımlılığı eklenmez).
//
//   t = initTRPC.context<TrpcContext>().create({ errorFormatter })
//   base               = t.procedure.use(appErrorBoundary)
//   publicProcedure    = base
//   protectedProcedure = base.use(requireAuth)
//   tenantProcedure    = protectedProcedure.use(requireTenant)
//
// BATCHING KAPALI BAĞLAYICI DEĞİŞMEZLİK (architect riski 5, ADR-0009 madde 8):
// bu dosyanın KENDİSİ batching'i kapatmaz (bu `handler/create-trpc-request-
// handler.ts`'nin işi, `allowBatching: false`) — ama burada tanımlanan
// `publicProcedure`'ün HTTP yüzeyinde erişilebilir olma mekanizması (≥v0.1.0,
// `AUTH_EXEMPT_PATHS`'e TAM YOL eşleşmesiyle giriş) BU DEĞİŞMEZLİĞE dayanır:
// batched bir istekte TEK HTTP yolu BİRDEN FAZLA prosedür taşır ve yol-bazlı
// muafiyet mekanizması SESSİZCE geçersizleşir. Batching'i açmak ADR-0009'u
// yeniden değerlendirmeyi gerektirir — bu dosyada veya `handler/`'da hiçbir
// koşulda `httpBatchLink`/`batching: {enabled: true}` kullanılmaz.

import { initTRPC, TRPCError } from '@trpc/server'
import { genericTransportErrorBody, isAppError, toErrorBody } from '@arkesoft/errors'
import type { AppError } from '@arkesoft/errors'

import type { TrpcContext } from './context/trpc-context.types.js'
import { httpStatusToTrpcCode } from './error-mapping/http-status-to-trpc-code.js'
import { trpcErrorDataSchema } from './schemas/trpc-error-data.schema.js'
import type { TrpcErrorData } from './schemas/trpc-error-data.schema.js'

/** `ctx` oluşturulamadığında (çerçeve kaynaklı hata) kullanılan son çare istek kimliği. */
const FALLBACK_REQUEST_ID = 'unknown'

/**
 * Bir `AppError`'ı doğru `TRPC_ERROR_CODE_KEY`'e sahip bir `TRPCError`'a
 * çevirir ve `cause` alanına `errorFormatter`'ın OKUYACAĞI tel verisini
 * ({@link TrpcErrorData}) yazar. "AppError → TRPCError çevirisi BURADA,
 * formatter'da DEĞİL" (ADR-0010 madde 3.4) — `instanceof` KULLANILMAZ,
 * `isAppError`'ın yapısal yedek yolu (AC9(a)) tercih edilir (çağıran bunu
 * zaten kontrol etmiş olarak çağırır); hata kodu LİTERALİ (ör.
 * `TENANT_NOT_FOUND`) burada HİÇ geçmez, kodlar `error.code`/
 * `error.httpStatus` üzerinden OKUNUR.
 */
function toTrpcError(appError: AppError, ctx: TrpcContext): TRPCError {
  const body = toErrorBody(appError, ctx.requestId)
  const code = httpStatusToTrpcCode(appError.httpStatus, ctx.logger)
  const data: TrpcErrorData = { code, httpStatus: appError.httpStatus, appError: body }
  return new TRPCError({ code, message: body.message, cause: data })
}

const t = initTRPC.context<TrpcContext>().create({
  errorFormatter(opts) {
    const { shape, error, ctx } = opts

    // Fail-closed yapısal okuma (AC9(a) — `instanceof` YOK): `toTrpcError`'un
    // yazdığı `cause` yalnızca Zod şemasıyla DOĞRULANARAK okunur. tRPC bir
    // obje `cause`'u `UnknownCauseError`'a (Error alt sınıfı) SARAR ama
    // ENUMERABLE alanları `Object.assign` ile KORUR — bu yüzden şema hâlâ
    // eşleşir (spike doğrulandı). Doğrulama BAŞARISIZ olursa (çerçeve kaynaklı
    // hata — `appErrorBoundary`'den hiç GEÇMEDİ, ör. bilinmeyen prosedür/bozuk
    // JSON, architect "Kapsam dışı") jenerik gövdeye düşülür.
    const parsedCause = trpcErrorDataSchema.safeParse(error.cause)

    if (parsedCause.success) {
      // `data` TAM OLARAK üç anahtarla (code/httpStatus/appError) zaten
      // `toTrpcError`'da ELDEN kurulmuştu; burada yalnızca TAŞINIR —
      // `shape`/`shape.data` ASLA spread edilmez (ADR-0010 madde 3.1).
      // `shape.message` HİÇ okunmaz (madde 3.2); mesaj her zaman i18n anahtarı.
      return {
        code: shape.code,
        message: parsedCause.data.appError.message,
        data: parsedCause.data,
      }
    }

    // KARAR (T-007 düzeltme turu 1, solid M4(b)): bu dal artık `warn` LOGLAR —
    // `httpStatusToTrpcCode`'un unmapped-status dalıyla (`http-status-to-
    // trpc-code.ts:66`) kurulan ASİMETRİ kapatıldı. Bu dal zaten AYIRT
    // EDİLEBİLİR bir gövde üretiyordu (`appError.code === 'HTTP_EXCEPTION'`,
    // hiçbir domain hatasının kodu bu olamaz) — `warn` ikinci savunma hattı:
    // `data.appError`'ın domain-hatası içeriği bir `@trpc/server` sürümünde
    // bozulursa (M2 — `cause` round-trip'i sessizce dejenere olursa) bu log
    // satırı gözlemlenebilirlik sağlar. `error-formatter.test.ts` bu turda
    // AYNI anda güncellendi (assert SIKILAŞTI: "log yok" → "warn var", bir
    // gevşetme DEĞİL — CLAUDE.md §6).
    //
    // KARAR (T-007 düzeltme turu 2, solid tur2 M6(2)): `context` artık
    // YALNIZCA `{requestId}` DEĞİL — `trpcCode`/`httpStatus` eklendi. Tur 1'in
    // `{requestId}`'i bu dala düşen İKİ ayrı olay sınıfını (rutin,
    // istemci-tetiklemeli çerçeve hatası — bilinmeyen prosedür, `?batch=1`
    // reddi, POST-to-query — vs. M2'nin dejenerasyon senaryosu) AYIRT
    // ETMİYORDU (solid tur2 M6, bulgu (a)). `fallbackData.code`/
    // `fallbackData.httpStatus` zaten BU TAM AMAÇLA hesaplanıyordu (tele
    // yazılan değerin AYNISI); burada TEKRAR hesaplanmaz, aynı değerler
    // LOGA da taşınır — operatör artık `trpcCode` dağılımından rutin
    // (`NOT_FOUND`/404, `BAD_REQUEST`/400, `METHOD_NOT_SUPPORTED`/405) ile
    // anomaliyi (`INTERNAL_SERVER_ERROR`/500) AYIRT edebilir.
    const requestId = ctx?.requestId ?? FALLBACK_REQUEST_ID

    const fallbackData: TrpcErrorData = {
      code: shape.data.code,
      httpStatus: shape.data.httpStatus,
      appError: genericTransportErrorBody(requestId),
    }

    if (ctx !== undefined) {
      ctx.logger.warn('trpc.error-formatter.unparsable-cause', {
        requestId,
        trpcCode: fallbackData.code,
        httpStatus: fallbackData.httpStatus,
      })
    }

    return { code: shape.code, message: fallbackData.appError.message, data: fallbackData }
  },
})

/**
 * HERHANGİ bir resolver/middleware'in fırlattığı hatayı doğru `TRPCError`'a
 * çevirir. "Ortam değişkenine göre dallanma yok" (ADR-0010 madde 3.3) —
 * dev/prod gövdesi burada BİREBİR aynıdır, bu middleware ortam bayrağı
 * OKUMAZ.
 *
 * **KRİTİK DÜZELTME (S4'ün bulgusu, iki bağımsız repro ile ölçüldü):**
 * `@trpc/server@11.19.0`'ın `callRecursive`'i HER middleware seviyesinde
 * kendi hatasını YAKALAR ve `{ok: false, error}` DÖNÜŞ DEĞERİNE çevirir —
 * `next()` bu yüzden ASLA throw/reject ETMEZ. Önceki `try { return await
 * next() } catch {...}` deseni bu yüzden ÖLÜ KODDU: `requireAuth`/
 * `requireTenant`/`TenantReadPort`'un fırlattığı HER `AppError` bu `catch`'e
 * hiç uğramadan tRPC'nin kendi jenerik `INTERNAL_SERVER_ERROR` sarmalayıcısına
 * düşüyordu (AC3/AC9(b)/AC10 kırılıyordu). Doğru desen `next()`'in DÖNÜŞ
 * DEĞERİNİ (`result.ok`) okur:
 *   - `result.ok === true` → DEĞİŞTİRİLMEDEN taşınır.
 *   - `result.ok === false` ve `result.error.cause` bizim `AppError`'ımız
 *     (`isAppError` ile yapısal kontrol, `instanceof` YOK) → {@link toTrpcError}
 *     ile doğru koda/duruma çevrilir (AppError → TRPCError çevirisi HÂLÂ
 *     BURADA, formatter'da DEĞİL — ADR-0010 madde 3.4 korunur).
 *   - `result.error.cause` bizim DEĞİLSE (tRPC'nin kendi iç hatası — ör.
 *     `cause` yok veya bize ait değil) `result.error` OLDUĞU GİBİ yeniden
 *     fırlatılır — TEKRAR SARMALANMAZ, ÇİFTE ÇEVİRİ YAPILMAZ. `result.error`
 *     ZATEN geçerli bir `TRPCError`; `errorFormatter`'ın `cause`-parse-fail
 *     dalı (çerçeve kaynaklı hata yolu, architect "Kapsam dışı") bunu ZATEN
 *     güvenli, sızdırmaz bir jenerik gövdeye çevirir (ham mesaj/yığın izi
 *     gövdeye asla girmez — `shape.message` hiç okunmaz, ADR-0010 madde 3.2).
 *
 * **Doğrulama (ölçülerek, varsayılmadan):** `pnpm --filter @arkesoft/trpc test`
 * ile hem gerçek `appRouter` üzerinden (procedures.test.ts — AC3 + port
 * totalliği, artık GERÇEK istemciyle 401/404 gözleniyor) hem de
 * `appErrorBoundary`'den HİÇ GEÇMEYEN çerçeve hatası yolunda
 * (error-formatter.test.ts — bilinmeyen prosedür) ayrı ayrı koşuldu; 20/20
 * geçiyor.
 */
const appErrorBoundary = t.middleware(async ({ ctx, next }) => {
  const result = await next()

  if (result.ok) {
    return result
  }

  if (isAppError(result.error.cause)) {
    throw toTrpcError(result.error.cause, ctx)
  }

  throw result.error
})

/**
 * `ctx.auth.kind !== 'authenticated'` ise {@link TrpcErrorFactoryPort.unauthenticated}
 * fırlatılır (hata kodu/HTTP durumu `apps/api`'nin sahipliğinde — AC9(a)).
 * Başarılı yolda context override ile `ctx.auth`'u `'authenticated'` varyantına
 * DARALTIR; `protectedProcedure`/`tenantProcedure` resolver'ları bu daraltmayı
 * TİP düzeyinde devralır (`null` kontrolüne gerek kalmaz).
 */
const requireAuth = t.middleware(({ ctx, next }) => {
  if (ctx.auth.kind === 'authenticated') {
    return next({ ctx: { auth: ctx.auth } })
  }

  throw ctx.errors.unauthenticated()
})

/**
 * `ctx.tenant.kind !== 'resolved'` ise {@link TrpcErrorFactoryPort.tenantContextRequired}
 * fırlatılır. HTTP yolunda bu dala ULAŞILMAZ — `TenantGuard` kiracısız isteği
 * `/trpc`'ye hiç bırakmadan ÖNCE 404 verir (K2, ADR-0010 madde 5); bu kod
 * yolu yalnızca HTTP-DIŞI çağıranlar (ör. ileride bir worker) için vardır.
 */
const requireTenant = t.middleware(({ ctx, next }) => {
  if (ctx.tenant.kind === 'resolved') {
    return next({ ctx: { tenant: ctx.tenant } })
  }

  throw ctx.errors.tenantContextRequired()
})

export const router = t.router

const base = t.procedure.use(appErrorBoundary)

/**
 * Taban prosedür — `ctx.auth`/`ctx.tenant` daraltması YAPMAZ. v0.0.6'da
 * HTTP yüzeyinde erişilebilir bir yolu YOKTUR (architect riski 8): `/trpc`
 * yüzeyinin tamamı `apps/api`'nin guard zincirinde kimlik + üyelik ister.
 * Gerçek yayınlama mekanizması (≥v0.1.0) prosedürün TAM yolunu
 * `AUTH_EXEMPT_PATHS`'e tek tek eklemektir — BATCHING KAPALI kaldığı sürece
 * bu yol-bazlı muafiyet güvenlidir (bkz. dosya başı yorumu).
 */
export const publicProcedure = base

/** Kimlik doğrulama zorunlu; `ctx.auth` `'authenticated'` varyantına daralır. */
export const protectedProcedure = base.use(requireAuth)

/** Kimlik + kiracı bağlamı zorunlu; `ctx.tenant` `'resolved'` varyantına daralır. */
export const tenantProcedure = protectedProcedure.use(requireTenant)
