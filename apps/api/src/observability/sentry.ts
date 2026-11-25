// @arkesoft/api — Sentry hata zarfı (ROADMAP v0.0.17, T-028/S5, architect K-A28-2)
//
// ⚠⚠ YAPISAL IMPORT SINIRLAMASI (po, bağlayıcı): `@sentry/node` YALNIZCA bu
// dosyadan import edilir. `apps/api/eslint.config.mjs` diğer TÜM dosyalarda bu
// importu yasaklar (K-A1'in adaptör-nötrlük deseninin — `main.ts` — BİREBİR
// ikizi). Sentry için sağlayıcı ARAYÜZÜ açılmıyor (CLAUDE.md §8'in "en az iki
// sağlayıcı" kuralı gerçek bir ikinci aday olduğunda uygulanır; burada sıfır
// tüketici, sıfır ikinci aday) — yerine bu YAPISAL sınırlama.
//
// Bu dosyanın dışa açtığı TEK yüzey üç fonksiyon: `startSentry()` (S6'nın
// bootstrap'ı çağırır) · `captureAppError()` (S8'in `app-exception.filter.ts`'i
// `logLevel === 'error'` iken çağırır) · `shutdownSentry()` (S6'nın
// `ObservabilityShutdownService`'i, Nest `onApplicationShutdown` kancasında
// çağırır — K-A28-3 kapanış sırası).
//
// ---------------------------------------------------------------------------
// ⚠⚠ ÖLÇÜLMÜŞ DÜZELTME — K-A28-2'nin literal kod bloğu PİNLENEN SDK sürümüyle
// (`@sentry/node@11.12.0`, S1'in seçimi) ÇALIŞMAZ; architect'in kararı v8'in
// (muhtemelen v8-v10 arası) API yüzeyine dayanıyor, pinlenen v11'de İKİ alan
// adı DEĞİŞTİ:
//
//   1. `skipOpenTelemetrySetup` — bu ad `@sentry/node@11.12.0`'da HİÇ YOK
//      (ölçüldü: `grep -rn skipOpenTelemetrySetup node_modules/.pnpm/@sentry+
//      node@11.12.0` → 0 eşleşme, `@sentry+core@11.12.0` için de 0). Gerçek
//      alan `enableOpenTelemetrySetup` (TERS POLARİTE) —
//      `node_modules/.pnpm/@sentry+node@11.12.0/.../types.d.ts`:
//      "When `false` (THE DEFAULT for most SDKs), no tracer provider is set
//      up. ... When `true`, the SDK registers its own SentryTracerProvider".
//      ⇒ K-A28-2'nin İSTEĞİ ("Sentry kendi tracer provider'ını KURMASIN,
//      NodeSDK ile ÇAKIŞMASIN") bu sürümde `enableOpenTelemetrySetup: false`
//      ile karşılanır — AÇIKÇA verilir (varsayılanla AYNI değer olsa da,
//      `spanProcessors: []`'in "açıkça verilir" felsefesiyle AYNI gerekçe:
//      üst akış varsayılanı değişirse bu satır sessizce davranış
//      değiştirmez).
//   2. `sendDefaultPii` — bu ad da HİÇ YOK (0 eşleşme, aynı iki paket).
//      v11'in modern eşdeğeri `dataCollection.userInfo` —
//      `node_modules/.pnpm/@sentry+core@11.12.0/.../types/datacollection.d.ts`:
//      "userInfo — Automatically populate `user.*` fields from
//      instrumentation sources. @default true". `requestDataIntegration`'ın
//      KENDİ kaynağı (`@sentry/core/build/esm/integrations/requestdata.js`)
//      `include.ip`'yi TAM OLARAK `dataCollection.userInfo`'dan türetir
//      (`ip: options.include?.ip ?? dataCollection.userInfo`) — bu, eski
//      `sendDefaultPii`'nin IP/kullanıcı alanı davranışının BİREBİR yapısal
//      karşılığı. ⇒ `dataCollection: { userInfo: false }`.
//
// Bu İKİ değişim DOĞRULANMIŞ ÇALIŞMA ZAMANI KANITIYLA yapıldı (bu alt görevin
// handoff'unda ham ölçüm — sahte taşıyıcıyla yakalanan GERÇEK zarf — raporlanır);
// aşağıdaki `__tests__/sentry-invariants.test.ts` hem BU DOĞRU alan adlarının
// VARLIĞINI hem YANLIŞ (var olmayan) adların YOKLUĞUNU mekanik olarak pinler.
// `Sentry.setUser` (var, bilinçli OLARAK çağrılmaz) K-A28-2'nin yazdığı gibi
// kaldı — SDK sürüm farkından ETKİLENMEDİ.
// ---------------------------------------------------------------------------
//
// ⚠⚠⚠ DÜZELTME TURU 1/3, parça 1a (security BULGU 1, critical) — YUKARIDAKİ
// `dataCollection: { userInfo: false }` TEK BAŞINA YETERSİZDİ. Kök neden
// (`@sentry+core@11.12.0/.../resolveDataCollectionOptions.js`): `DataCollection`
// alanlarının HER BİRİ `dc.<alan> ?? DEFAULTS.<alan>` ile çözülür ve
// `DEFAULTS` SIRASIYLA `httpBodies: [... dört yön ...]`, `cookies: true`,
// `httpHeaders: { request: true, response: true }`, `urlQueryParams: true`,
// `stackFrameVariables: true` taşır — yani SDK varsayılanı `opt-out`'tur,
// `opt-in` DEĞİL. `requestDataIntegration`'ın KENDİSİ (`@sentry/core/.../
// integrations/requestdata.js` → `addNormalizedRequestDataToEvent`) yalnızca
// `cookies`/`headers`/`query_string`/`url` alanlarını filtreler — `body`/HTTP
// gövdesi bu filtreden GEÇMEZ, zarfa OLDUĞU GİBİ gider. Senaryo: bir
// kiracının MÜŞTERİSİ giriş/kayıt/ödeme formunu gönderir; o istek sırasında
// `logLevel: 'error'` taşıyan HERHANGİ bir `AppError` ya da yakalanmamış bir
// istisna olursa (`app-exception.filter.ts` → `captureAppError`) zarf HAM
// İSTEK GÖVDESİNİ (parola, kart no, TCKN, tam e-posta) üçüncü tarafa (sentry.io)
// taşırdı — saldırgan GEREKMEZ, tek bir 5xx yeterli (CLAUDE.md §2/§4/§10.7 +
// KVKK/PCI ihlali). ⇒ ALTI alanın HER BİRİ AÇIKÇA `false`/`[]`'e çekilir —
// `__tests__/sentry-invariants.test.ts` artık altısını TEK TEK pinler.
//
// ⚠⚠ `tracesSampleRate: 0` NEDEN AYRICA, AÇIKÇA verilir (önceki metin bunu
// "bilinçli olarak verilmez" diyordu — o yorum YANLIŞ hâle geliyordu):
// `@sentry/node@11.12.0/.../sdk/index.js:170` bu alanı `options.tracesSampleRate
// ?? process.env.SENTRY_TRACES_SAMPLE_RATE`den OKUR — yani "hiç verilmez"
// değişmezi bir ortam değişkeniyle (operatörün `.env`'ine `SENTRY_TRACES_
// SAMPLE_RATE` eklemesiyle) TERSİNE ÇEVRİLEBİLİR. Span açılırsa (tracing
// etkinleşirse) gövde AYRICA `HTTP_REQUEST_BODY_DATA` span attribute'una
// FİLTRESİZ yazılır — yukarıdaki `dataCollection` düzeltmesini span yolundan
// BAYPAS eden ikinci bir kanal. `0` AÇIKÇA vermek bu ortam-tersine-çevirme
// yüzeyini kapatır (env fallback'in hiç DEVREYE GİRMEMESİ, çünkü alan zaten
// dolu).
//
// ⚠ KALAN `DataCollection` alanları (`graphQL`/`genAI`/`mcp`/
// `databaseQueryData`/`queues`/`frameContextLines`) BİLİNÇLİ OLARAK
// VARSAYILANDA BIRAKILDI — gerekçe BEŞİ İÇİN DOĞRULANDI, BİRİ İÇİN
// (`frameContextLines`) DÜZELTİLDİ (düzeltme turu 2/3, `security` tur 2
// BULGU L2 — önceki metin "bu altı alanın hiçbiri BUGÜN hiçbir
// span/attribute'a ULAŞMIYOR" diyordu, bu `frameContextLines` İÇİN
// FAKTİK OLARAK YANLIŞTI):
//
//   (a) `graphQL`/`genAI`/`mcp`/`databaseQueryData`/`queues` — BEŞİ de
//       yalnızca Sentry'nin KENDİ performans/span entegrasyonları
//       AKTİFKEN bir şey toplar (`dataCollection.*` span attribute'larını
//       SÜSLER, kendisi bir entegrasyon AÇMAZ — dosya başı `DataCollection`
//       tipinin kendi dokümantasyonu). Bu dosyada: `enableOpenTelemetrySetup:
//       false` — Sentry kendi `SentryTracerProvider`'ını/`SentryPropagator`'ını
//       HİÇ KURMUYOR (`@sentry/node/.../sdk/initOtel.js`: `initOpenTelemetry`
//       hiç çağrılmıyor); `tracesSampleRate: 0` (yukarıda) — performans
//       izleme KAPALI; GraphQL/AI/MCP entegrasyonları zaten projede YOK,
//       Prisma için de Sentry'nin KENDİ bir entegrasyonu YOK (ölçüldü:
//       `getBaseDefaultIntegrations()`'ta `prisma`/`graphql`/`genai`/`mcp`
//       eşleşmesi SIFIR). ⇒ bu beş alanın hiçbiri BUGÜN HİÇBİR
//       span/attribute'a ulaşmıyor — kapatmak (ekstra `false`/`0` satırları)
//       ÖLÇÜLMEMİŞ bir yüzeyi "kapatıyormuş" gibi göstermek olurdu. ⚠ TEK
//       DİKKAT NOTU: `databaseQueryData`, Prisma SORGU METNİNİN kendisini
//       DEĞİL (o zaten `db.query.text` üzerinden "her zaman toplanır"
//       kategorisinde, bu beş alanın DIŞINDA) bağlı parametre
//       DEĞERLERİNİ/sonuç verisini kapsar — bu alan v0.18.0'da gerçek bir
//       span exporter + Sentry performans entegrasyonu açılırsa YENİDEN
//       DEĞERLENDİRİLMELİDİR (tenant verisi taşıyabilir); bugün hiçbir span
//       Sentry'ye ULAŞMADIĞI için eylemsiz.
//
//   (b) `frameContextLines` — ⚠⚠ AKTİF, span'dan BAĞIMSIZ (`security` tur 2
//       ölçtü). `contextLinesIntegration()`'ın KENDİ kaynağı
//       (`@sentry/node/.../integrations/contextlines.js` → `processEvent`)
//       `client.getDataCollectionOptions().frameContextLines`'ı OKUR ve
//       istisna yığın çerçevelerine ÇEVREDEKİ KAYNAK SATIRLARINI (dosyadan
//       okunarak) EKLER — bu, Sentry'nin tracing/span hattından TAMAMEN
//       BAĞIMSIZ bir `processEvent` kancasıdır (`enableOpenTelemetrySetup:
//       false`/`tracesSampleRate: 0` bu yolu KAPATMAZ). ⇒ zarf GERÇEKTEN
//       kaynak satırları taşır. ⚠ GÜVENLİK ETKİSİ YOK: depo PUBLIC, taşınan
//       satırlar STATİK UYGULAMA KODU (tenant verisi/sır İÇERMEZ — sır/PII
//       çalışma zamanı DEĞERİ, kaynak dosyası METNİ değil). Bilinçli olarak
//       varsayılanda bırakılır; `false`/`0` ile kapatmak teşhis değeri
//       taşıyan (hata fırlatan satırın bağlamı) zararsız bir alanı
//       gerekçesiz kısıtlamak olurdu.
// ---------------------------------------------------------------------------

import * as Sentry from '@sentry/node'
import type { NodeOptions } from '@sentry/node'

import { redactDeep } from '@arkesoft/errors'
import type { AppError } from '@arkesoft/errors'

import { resolvePlatformVersion } from '../config/platform-version.js'

/**
 * Sentry'nin kapanışta zarfları boşaltma (flush) zaman aşımı — K-A28-3'ün
 * worker kapanış bütçesiyle (`WORKER_CLOSE_TIMEOUT_MS=5000` <
 * `WORKER_SHUTDOWN_WATCHDOG_MS=10_000`) uyumlu, S6'nın kullandığı sabit.
 */
export const SENTRY_FLUSH_TIMEOUT_MS = 2000

/**
 * ⭐ TEST-ONLY seam — sahte taşıyıcı enjeksiyonu (AC-62). Üretim çağrısı (S6)
 * bu alanı HİÇ VERMEZ, varsayılan (gerçek HTTP) taşıyıcı kullanılır. Testler
 * gerçek bir DSN'e İHTİYAÇ DUYMADAN zarfı yakalamak için kukla bir DSN + bu
 * alanı birlikte verir — gerçek DSN/token REPOYA GİRMEZ (AC-61).
 */
export interface StartSentryOptions {
  /**
   * `ApiEnv.SENTRY_DSN` — Zod ile ZATEN doğrulanmış (`apiEnvSchema`), ham
   * `process.env` DEĞİL (CLAUDE.md §4 — dış veri parse edilmeden tip almaz;
   * bu dosya `process.env`'i KENDİSİ OKUMAZ, çağıran S6 `ApiEnv`'den geçirir).
   */
  readonly dsn: string | undefined
  readonly transport?: NodeOptions['transport']
}

/**
 * Sentry'yi başlatır — ⚠⚠ DSN tanımsız/boşsa HİÇBİR ŞEY YAPMAZ (AC-57'nin
 * NO-OP şartı): `Sentry.init` HİÇ ÇAĞRILMAZ, ağa çıkılmaz, soket açılmaz,
 * zarf üretilmez. Bu erken dönüş `transport` verilmiş olsa da OLMASA da
 * aynıdır — DSN kontrolü `Sentry.init`'ten TAMAMEN ÖNCE.
 */
export function startSentry(options: StartSentryOptions): void {
  const { dsn, transport } = options

  if (dsn === undefined || dsn.length === 0) {
    return
  }

  // ⚠ `exactOptionalPropertyTypes: true` — `transport` alanı `undefined`'ı
  // AÇIKÇA bir değer olarak KABUL ETMEZ (`NodeOptions['transport']` birleşimi
  // `| undefined` TAŞIMIYOR). Üretim çağrısı (S6) bu alanı HİÇ VERMEDİĞİNDE
  // (`options.transport === undefined`) anahtarın KENDİSİ hiç eklenmez —
  // "verilmemiş" ile "`undefined` değeriyle verilmiş" ayrımı budur.
  Sentry.init({
    dsn,
    ...(transport === undefined ? {} : { transport }),
    // K-A28-2'nin isteği — Sentry kendi tracer provider'ını KURMAZ, NodeSDK
    // ile ÇAKIŞMAZ. Alan adı yukarıdaki dosya başı yorumuna bkz. (ÖLÇÜLMÜŞ
    // DÜZELTME — bu SDK sürümünde `skipOpenTelemetrySetup` YOK).
    enableOpenTelemetrySetup: false,
    // K-A28-2'nin isteği — varsayılan PII (ör. istemci IP adresi) otomatik
    // toplanmaz/gönderilmez. Alan adı yukarıdaki dosya başı yorumuna bkz.
    // (ÖLÇÜLMÜŞ DÜZELTME — bu SDK sürümünde `sendDefaultPii` YOK).
    //
    // ⚠⚠⚠ DÜZELTME TURU 1/3 (security BULGU 1, critical) — `userInfo: false`
    // TEK BAŞINA diğer ON BİR `DataCollection` alanını varsayılana (⚠⚠
    // düzeltme turu 2/3, `security` tur 2 BULGU L1 — bu satır ÖNCEDEN
    // "(opt-out DEĞİL, opt-in)" diyordu, POLARİTE TERSTİ: dosya başı
    // yorumunun :60-61 satırı "SDK varsayılanı opt-out'tur, opt-in DEĞİL"
    // der — aşağıdaki ifade ŞİMDİ bununla AYNI polaritede)
    // opt-in DEĞİL, opt-out) düşürüyordu. ALTI alan AÇIKÇA kapatılır —
    // yukarıdaki dosya başı yorumunun ÖLÇÜLMÜŞ gerekçesi.
    dataCollection: {
      userInfo: false,
      httpBodies: [],
      cookies: false,
      httpHeaders: { request: false, response: false },
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    // ⚠⚠ `tracesSampleRate: 0` AÇIKÇA verilir — Sentry burada YALNIZCA hata
    // zarfı, trace OTel'in (K-A28-2); AÇIKÇA `0` vermek `SENTRY_TRACES_
    // SAMPLE_RATE` ortam değişkeninin bu değeri TERSİNE ÇEVİRMESİNİ (env
    // fallback hiç devreye girmez) engeller — yukarıdaki dosya başı yorumu.
    tracesSampleRate: 0,
    release: resolvePlatformVersion(),
    // ⚠⚠⚠ DÜZELTME TURU 2/3 (security tur 2 BULGU M3, medium — `qa` tur 2
    // KASITLI KIRMIZI pin: `__tests__/sentry-console-breadcrumb-leak.test.ts`)
    // — yukarıdaki `dataCollection` ALTI alanı ve `redactDeep`/pino
    // redaksiyonu YALNIZCA `captureAppError`'ın KENDİ zarfını (olay +
    // bağlam) kapsar; Sentry'nin VARSAYILAN breadcrumb kanalları bu ÜÇ
    // savunma katmanının HİÇBİRİNDEN GEÇMEDEN zarfa gider. Ölçüm
    // (`@sentry/node@11.12.0/.../sdk/index.js:30-58`, `getBaseDefaultIntegrations()`):
    // varsayılan küme `consoleIntegration()` (ÖLÇÜLEN sızıntı — `console.*`
    // çağrısının TÜM argümanlarını filtresiz breadcrumb'a yazar,
    // `@sentry/core/.../integrations/console.js`) + `httpIntegration()` +
    // `nativeNodeFetchIntegration()` + `childProcessIntegration()` +
    // `workerThreadsIntegration()` taşır — HEPSİ breadcrumb üretir.
    //
    // ⇒ (B) seçildi: `beforeBreadcrumb: () => null` — (A)'nın
    // (`integrations: (d) => d.filter((i) => i.name !== 'Console')`)
    // yalnızca ÖLÇÜLEN kanalı kapatması riskine karşı. Gerekçe (ÖLÇÜLDÜ,
    // `@sentry/core/.../breadcrumbs.js` → `addBreadcrumb()`):
    // `beforeBreadcrumb`, HER breadcrumb kaynağının (hangi entegrasyon
    // üretmiş olursa olsun) AKTIĞI TEK, ortak çağrı noktasıdır — `const
    // { beforeBreadcrumb = null } = client.getOptions(); const
    // finalBreadcrumb = beforeBreadcrumb ? beforeBreadcrumb(...) : …; if
    // (finalBreadcrumb === null) return;` — yani `http`/`fetch`/
    // `childProcess`/`workerThreads` kanalları da AYNI anda kapanır, ayrıca
    // SDK'nın GELECEKTE ekleyeceği her yeni breadcrumb kaynağı da KAPALI
    // DOĞAR (bu sürümün dersi: "SDK varsayılanları opt-out" — (A) bu dersi
    // yalnızca bir kanal için uygulardı). Bu sürüm zaten trace TOPLAMIYOR
    // (`tracesSampleRate: 0`) ⇒ teşhis pino logları + `traceId` korelasyonu
    // üzerinden yürüyor; breadcrumb'ın teşhis değeri bu duruşta YOK.
    beforeBreadcrumb: () => null,
  })
}

/**
 * `captureAppError`'a verilen girdi — tag kümesi KAPALI (aşağıya bkz.).
 *
 * ⚠⚠⚠ DÜZELTME TURU 1/3 (solid BULGU 3, high) — `traceId` ZORUNLU bir alan
 * olarak EKLENDİ. ÖNCESİNDE bu dosya `getCurrentTraceId()`'yi KENDİSİ
 * YENİDEN ÇAĞIRIYORDU (:155 eski hâli) — ama `instrumentation.ts` bir
 * `TracerProvider` HİÇ KURMUYOR (⇒ aktif span ASLA yok) ve `trace-id.ts`'in
 * KENDİ docstring'i bu durumda "HER ÇAĞRI kendi yerel kimliğini üretir"
 * diyor — yani bu dosyanın yeniden çağırdığı `getCurrentTraceId()`, AYNI
 * isteğin `x-trace-id` başlığı/log `traceId`'siyle PAYLAŞILAN değeri DEĞİL,
 * TAMAMEN YENİ, rastgele bir 32-hex üretiyordu. Sonuç: Sentry zarfının
 * `trace_id` tag'i hiçbir zaman gerçek istek izine EŞLEŞMİYORDU — biçimsel
 * olarak geçerli göründüğü için SESSİZCE yanlış korelasyon vaat ediyordu.
 * ⇒ `traceId` artık ÇAĞIRANDAN (yalnızca `app-exception.filter.ts`,
 * `RequestContextMiddleware`'in ALS'ye yazdığı DEĞERİ okuyan bağlayıcı
 * zincirin TEK üyesi) GEÇİRİLİR — bu dosya `trace-id.ts`'i artık import
 * ETMEZ, YALNIZCA alır (yapısal garanti: bu dosya bir traceId ÜRETEMEZ).
 */
export interface CaptureAppErrorInput {
  readonly error: AppError
  /** Tenant bağlamı olmayan hatalarda (ör. public/platform uçları) `undefined`. */
  readonly tenantId: string | undefined
  readonly requestId: string
  /** AYNI isteğin `x-trace-id` başlığı/log `traceId`'siyle BİREBİR aynı değer — çağıran hesaplar, bu dosya YENİDEN ÜRETMEZ. */
  readonly traceId: string
}

/**
 * Bir `AppError`'ı Sentry'ye yakalar. Sentry hiç başlatılmadıysa (DSN
 * tanımsız/boş → `startSentry` erken döndü) `Sentry.isInitialized()` `false`
 * olur ve bu fonksiyon HİÇBİR ŞEY YAPMAZ — sıfır zarf.
 *
 * ⚠⚠ Tag kümesi KAPALI (architect K-A28-2, bağlayıcı): `tenant_id` ·
 * `request_id` · `trace_id` — BAŞKA TAG YOK. `Sentry.setUser` ASLA
 * çağrılmaz (PII).
 *
 * `error.context` (CLAUDE.md §4'ün "yalnızca loglanır" alanı) bu sürümden
 * itibaren İLK KEZ süreç dışına (bu zarf) çıkıyor (architect borcu :3957,
 * L-11) — `redactDeep` (ÜÇÜNCÜ savunma katmanı, `@arkesoft/errors`) burada
 * ZORUNLU: zarf sınırında sır/PII (parola, token, çerez, API anahtarı, kart
 * no/CVV, TCKN, tam adres, tam e-posta) SIFIR olmalı (AC-59).
 */
export function captureAppError(input: CaptureAppErrorInput): void {
  if (!Sentry.isInitialized()) {
    return
  }

  const { error, tenantId, requestId, traceId } = input

  Sentry.withScope((scope) => {
    scope.setTag('tenant_id', tenantId ?? 'none')
    scope.setTag('request_id', requestId)
    scope.setTag('trace_id', traceId)

    const redactedErrorContext: Record<string, unknown> = {
      code: error.code,
      httpStatus: error.httpStatus,
      context: redactDeep(error.context),
    }
    scope.setContext('appError', redactedErrorContext)

    Sentry.captureException(error)
  })
}

/**
 * Sentry'nin bekleyen zarflarını `SENTRY_FLUSH_TIMEOUT_MS` içinde boşaltıp
 * istemciyi kapatır — K-A28-3'ün Nest `onApplicationShutdown` kancası
 * (`ObservabilityShutdownService`, S6) bunu `otelSdk.shutdown()`'DAN SONRA
 * çağırır. Sentry hiç başlatılmadıysa HİÇBİR ŞEY YAPMAZ.
 */
export async function shutdownSentry(): Promise<void> {
  if (!Sentry.isInitialized()) {
    return
  }

  await Sentry.close(SENTRY_FLUSH_TIMEOUT_MS)
}
