// @arkesoft/trpc — initTRPC kurulumu, errorFormatter, procedure builder'ları
// (ROADMAP v0.0.6, T-007/ST-2, architect "tRPC sözleşmesi" + "Hata eşlemesi"
// bölümleri, ADR-0009, ADR-0010; DÖRDÜNCÜ BUILDER — ROADMAP v0.0.8, T-009/S5,
// architect K1, ADR-0012)
//
// Transformer YOK (K5 — tel sözleşmesi yalnızca JSON ilkelleri taşır, `Date`
// yok → `superjson` gibi bir serileştirme bağımlılığı eklenmez).
//
// Merdiven iki eksenin çarpımıdır (architect K1):
//   t = initTRPC.context<TrpcContext>().create({ errorFormatter })
//   base                   = t.procedure.use(appErrorBoundary)
//   publicProcedure        = base                                   // kimlik YOK  · kiracı YOK
//   publicTenantProcedure  = base.use(requireTenant)                 // kimlik YOK  · kiracı ZORUNLU (ADR-0012)
//   protectedProcedure     = base.use(requireAuth)                   // kimlik ZORUNLU · kiracı YOK
//   tenantProcedure        = protectedProcedure.use(requireTenant)   // kimlik ZORUNLU · kiracı ZORUNLU
//
// ⚠ BEŞİNCİ BASAMAK BU DOSYADA DEĞİL (ROADMAP v0.0.14, T-014/S2, ADR-0016):
// `permissionProcedure(permission)` — kimlik ZORUNLU · kiracı ZORUNLU · İZİN
// ZORUNLU — `authz/permission-procedure.ts`'te yaşar ve aşağıdaki
// `tenantProcedure`'ün ÜZERİNE kurulur. Ayrı dosyada olmasının gerekçesi o
// dosyanın başında yazılıdır; merdiven bu yorumla TAMDIR (beşinci basamağın
// varlığı burada SUSTURULMAZ — "beyan ≠ gerçeklik" borcu doğmasın).
//
// BATCHING KAPALI BAĞLAYICI DEĞİŞMEZLİK (architect riski 5, ADR-0009 madde 8):
// bu dosyanın KENDİSİ batching'i kapatmaz (bu `handler/create-trpc-request-
// handler.ts`'nin işi, `allowBatching: false`) — ama burada tanımlanan
// `publicProcedure`/`publicTenantProcedure`'ün HTTP yüzeyinde erişilebilir
// olma mekanizması (TAM YOL eşleşmesiyle `AUTH_EXEMPT_PATHS`'e giriş —
// `publicTenantProcedure` için v0.0.8/ADR-0012'den itibaren, `publicProcedure`
// için hâlâ ≥v0.1.0) BU DEĞİŞMEZLİĞE dayanır: batched bir istekte TEK HTTP
// yolu BİRDEN FAZLA prosedür taşır ve yol-bazlı muafiyet mekanizması
// SESSİZCE geçersizleşir. Batching'i açmak ADR-0009'u yeniden değerlendirmeyi
// gerektirir — bu dosyada veya `handler/`'da hiçbir koşulda
// `httpBatchLink`/`batching: {enabled: true}` kullanılmaz.

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
 * Hata sınırının yazdığı TEK yapılandırılmış kaydın olay adı (ROADMAP v0.0.14,
 * T-014 düzeltme turu 1 — `solid` M-1 + `security` medium #1).
 *
 * ⚠ Bir log olayının adı TEL SÖZLEŞMESİ DEĞİLDİR ve bu sabit `index.ts`/
 * `server.ts`'ten EXPORT EDİLMEZ: public yüzeye bir log olayı adı eklemek onu
 * semver olayına çevirirdi. Tüketiciler (testler, operatör sorguları) adı
 * literal olarak kullanır — platformun yerleşik deseni bu.
 */
const APP_ERROR_LOG_EVENT = 'trpc.error-boundary.app-error'

/** `httpStatus` bu değerin ALTINDAysa kayıt `warn`, DEĞİLSE `error` seviyesindedir. */
const SERVER_ERROR_STATUS_THRESHOLD = 500

/**
 * Hata sınırından geçen bir `AppError` için YAPILANDIRILMIŞ TEK kaydı yazar.
 *
 * ⚠⚠ BU FONKSİYONUN VARLIK SEBEBİ ÖLÇÜLMÜŞ BİR BOŞLUKTUR (`solid` M-1 ve
 * `security` medium #1 BAĞIMSIZ olarak buldu). `PERMISSION_DENIED`'ın
 * `details`'ini BOŞ bırakma kararının yazılı TEK gerekçesi "izin adı ve rol
 * yalnızca `AppError.context`'e girer ve hata SINIRI onu LOGLAR"dı; ikinci
 * yarısı GERÇEKLEŞMİYORDU — dört halkanın hiçbiri loglamıyordu: (1) bu
 * middleware sessizdi, (2) `errorFormatter`'ın `cause` parse-EDİLEBİLİR dalı
 * sessizdi, (3) `handler/create-trpc-request-handler.ts`'in `onError`'ı parse
 * edilebilir `cause`'da ERKEN DÖNÜYORDU, (4) `apps/api`'nin Nest hata filtresi
 * ise `fetchRequestHandler` her hatayı `Response`'a çevirdiği için HİÇ
 * tetiklenmiyordu. Sonuç: yeni yetki yüzeyinde BAŞARI denetim kaydına
 * yazılırken RED tamamen görünmezdi (OWASP A09) ve `AuthGuard`'ın aynı sınıf
 * üyelik reddi `warn` yazarken bu yol sessiz kalıyordu — ÖLÇÜLEBİLİR bir
 * asimetri.
 *
 * ⚠ KAYIT BURADA, `onError`'da DEĞİL: `AppError.context` bu noktadan SONRA
 * KAYBOLUR — `toErrorBody` `context`'i HİÇ OKUMAZ (tel sızdırmazlığının
 * yapısal garantisi), dolayısıyla `onError`'a ulaşan `TRPCError` yalnızca tel
 * gövdesini taşır. Bağlamı loglamanın TEK yeri, gerçek `AppError`'ın elde
 * olduğu bu satırlardır.
 *
 * ⚠ TEK KAYIT GARANTİSİ: bu middleware `base`'e TEK KEZ bağlanır (merdivenin
 * tüm basamakları `base`'den türer) ve batching KAPALI olduğu için bir HTTP
 * isteği TEK prosedür taşır; ayrıca buradan fırlatılan `TRPCError`'ın `cause`'u
 * `trpcErrorDataSchema` ile PARSE EDİLEBİLİR olduğu için `onError` erken döner
 * ve İKİNCİ bir satır YAZMAZ.
 *
 * ⚠ SEVİYE EŞLEMESİ (CLAUDE.md §4): 5xx → `error` ("müdahale gerekir"),
 * diğer her durum → `warn` ("beklenen ama anormal"). Eşiğin ALTINDA kalan
 * bilinmeyen bir durum (teorik olarak <400) da `warn`'a düşer — fail-safe
 * yön, sessizlik DEĞİL.
 *
 * ⚠ ALAN SEÇİMİ (CLAUDE.md §4 "asla loglanmaz" listesi):
 *   · `requestId`/`tenantId`/`userId` BURADA TEKRARLANMAZ — enjekte edilen
 *     logger `apps/api`'nin child logger'ıdır ve üçünü ZATEN bağlamıştır;
 *     ikinci kez geçirilen bir alan NDJSON satırında İKİ KEZ görünür
 *     (`apps/api`'nin üyelik reddi bu dersi yazılı olarak taşıyor).
 *   · `AppError.context` TEK BİR ANAHTARIN ALTINA (`context`) NESTELENİR,
 *     üst seviyeye SPREAD EDİLMEZ. Gerekçe fail-closed: bir hata sınıfının
 *     bağlam anahtarı (ör. `userId`) logger'ın BAĞLADIĞI bir alanı GÖLGELEYEMEZ
 *     ve denetim izi aktörü yanlış atfedemez. Nesteleme ayrıca somut logger'ın
 *     joker redaction yollarının (`*.token` vb.) kapsamına girer — ikinci
 *     savunma hattı.
 *   · ⚠ ALAN ADI İCAT EDİLMEDİ, HİZALANDI (ölçüldü): `apps/api`'nin REST hata
 *     filtresi AYNI bilgiyi ZATEN `{code, isRetryable, context}` biçiminde
 *     yazıyor (`errors/error-mapping.ts`'in `logContext`'i). İlk taslak
 *     `errorContext` adını kullanıyordu; aynı olgu için İKİNCİ bir alan adı,
 *     operatör sorgularını her iki adı da bilmek zorunda bırakırdı. Üç alan
 *     birebir aynı, `httpStatus` ise tRPC yolunun EKİDİR (seviye seçiminin
 *     girdisi — kaydı tek başına okunabilir yapar).
 *   · `AppError.publicDetails`/`httpHeaders` OKUNMAZ; ham mesaj ve yığın izi
 *     BU kayda GİRMEZ (onlar yalnızca sınıflandırılamayan hata dalının işidir).
 */
function logAppError(appError: AppError, ctx: TrpcContext): void {
  const payload = {
    code: appError.code,
    httpStatus: appError.httpStatus,
    isRetryable: appError.isRetryable,
    context: appError.context,
  }

  if (appError.httpStatus >= SERVER_ERROR_STATUS_THRESHOLD) {
    ctx.logger.error(APP_ERROR_LOG_EVENT, payload)
    return
  }

  ctx.logger.warn(APP_ERROR_LOG_EVENT, payload)
}

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
 * **EKLEME (ROADMAP v0.0.14, T-014 düzeltme turu 1 — `solid` M-1 +
 * `security` medium #1):** bu middleware artık tanıdığı her `AppError` için
 * {@link logAppError} ile SINIRDA TEK bir yapılandırılmış kayıt yazar
 * (4xx → `warn`, 5xx → `error`). ⚠ TEL GÖVDESİ DEĞİŞMEDİ: `toTrpcError`'un
 * ürettiği `TRPCError`/`TrpcErrorData` ve dolayısıyla `errorFormatter`'ın
 * çıktısı BİREBİR aynıdır — log yolu ile tel yolu BAĞIMSIZDIR ve bu ekleme
 * yalnızca gözlemlenebilirlik eklemiştir. Gerekçenin tamamı `logAppError`'ın
 * dokümanındadır.
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
    const appError = result.error.cause
    // ROADMAP v0.0.14, düzeltme turu 1: `logAppError` ÖNCE koşar —
    // `toTrpcError` fırlatacağı için sonrasına kod koymak ulaşılamaz olurdu.
    logAppError(appError, ctx)
    throw toTrpcError(appError, ctx)
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
 * Taban prosedür — `ctx.auth`/`ctx.tenant` daraltması YAPMAZ. v0.0.8'de HÂLÂ
 * HTTP yüzeyinde erişilebilir bir yolu YOKTUR (architect riski 8 — bu durum
 * v0.0.6'dan beri DEĞİŞMEDİ): merdiven dördüncü bir builder'la genişledi
 * (ADR-0012) ama `/trpc` yüzeyinin kimlik+üyelik gerektirmeyen TEK dalı artık
 * {@link publicTenantProcedure}'dür — bu builder'ın KENDİSİ değil.
 * Gerçek yayınlama mekanizması (≥v0.1.0, bu builder için) prosedürün TAM
 * yolunu `AUTH_EXEMPT_PATHS`'e tek tek eklemektir — BATCHING KAPALI kaldığı
 * sürece bu yol-bazlı muafiyet güvenlidir (bkz. dosya başı yorumu).
 */
export const publicProcedure = base

/**
 * Anonim AMA kiracıya kapsamlı prosedürler için taban (ROADMAP v0.0.8,
 * T-009/S5, architect K1, ADR-0012). Üç zorunlu değişmez:
 *
 * ① Kimlik doğrulama YOKTUR — `ctx.auth` daraltılmaz, `requireAuth` zincire
 *    HİÇ girmez (vitrin ziyaretçisi anonimdir).
 *
 * ② Kiracı bağlamı ZORUNLUDUR ve İKİ KATMANDA zorlanır: (a) HTTP yolunda
 *    `TenantGuard` kiracısız isteği `/trpc`'ye hiç bırakmadan ÖNCE 404 verir
 *    (ADR-0010 madde 5); (b) bu builder'ın kendisi de mevcut
 *    {@link requireTenant} middleware'ini (DEĞİŞTİRİLMEDEN, `tenantProcedure`
 *    ile PAYLAŞILARAK) uygular — HTTP-dışı bir çağıran `TenantGuard`'ı atlasa
 *    bile `ctx.tenant.kind !== 'resolved'` ise burada durur.
 *
 * ③ Bu builder'ı kullanan HER prosedürün TAM HTTP yolu `AUTH_EXEMPT_PATHS`'e
 *    TEK TEK eklenmek ZORUNDADIR (`apps/api`, ayrı alt görev) VE ADR-0012'nin
 *    dört koşulunu (A: çıktı o host'ta zaten herkese açık olandan fazlasını
 *    taşımaz · B: yanıt salt okunur `query`, hiçbir yetki/eylem yeteneği
 *    taşımaz · C: `ctx.tenant` yalnızca `tenantId` olarak okunup doğrudan
 *    porta geçirilir · D: istek başına DB maliyeti ve enumerasyon oranı
 *    beyan edilir) KARŞILAMAK ZORUNDADIR.
 */
export const publicTenantProcedure = base.use(requireTenant)

/** Kimlik doğrulama zorunlu; `ctx.auth` `'authenticated'` varyantına daralır. */
export const protectedProcedure = base.use(requireAuth)

/** Kimlik + kiracı bağlamı zorunlu; `ctx.tenant` `'resolved'` varyantına daralır. */
export const tenantProcedure = protectedProcedure.use(requireTenant)
