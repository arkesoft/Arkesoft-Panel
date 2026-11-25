// @arkesoft/api — Katman 2 bootstrap: NodeSDK (ROADMAP v0.0.17, T-028/S6,
// architect K-A28-1/K-A28-4/K-A28-9, po S0 modellemesi)
//
// ⚠⚠ BU DOSYA `main.ts`/`main.worker.ts`'in İLK IMPORT'U OLMAK ZORUNDADIR —
// `reflect-metadata`'dan BİLE ÖNCE (K-A28-4). Gerekçe: OpenTelemetry'nin
// çekirdek modül yaması (`@opentelemetry/instrumentation`'ın `require-in-
// the-middle` kancası) `express`/`http`/`ioredis` gibi modüller İLK KEZ
// `require()` edilmeden ÖNCE kurulmuş olmalı — aksi hâlde bu modüller
// yamasız yüklenir ve enstrümantasyon o modül örneği için ASLA devreye
// girmez. `reflect-metadata`'nın "İLK satır olmak zorunda" kuralının AMACI
// (Nest'in dekoratör metadata'sı o yan etkiye dayanır) KORUNUR — `AppModule`
// grafiği hâlâ BU dosyanın YAN ETKİSİNDEN SONRA değerlenir, yalnızca bu
// dosya `reflect-metadata`'nın ÖNÜNE geçer (S2(c)'nin ÖLÇÜMÜ: Express'in
// `http.createServer()`'ı KENDİ CommonJS `require('http')` zincirinden
// geldiği için geç `enable()` BİLE span üretti — ama "en erken" burada
// hâlâ en güvenli sıradır, ölçülmemiş bir gevşetme YAPILMAZ).
//
// ⚠⚠ ÜÇ SİNYALİN ÜÇÜ DE AÇIKÇA BOŞ DİZİ/OKUYUCU İLE VERİLİR — "EXPORTER YOK"
// (K-A28-1, bağlayıcı). Üçü de AYNI ÖLÇÜLMÜŞ KÖK NEDENİ paylaşır
// (`sdk-node@0.223.2/build/src/sdk.js`): NodeSDK'nın yapılandırma
// seçeneklerini "verildi mi" diye kontrol eden dallar BOŞ DİZİYİ TRUTHY
// sayar, bu yüzden "verilmedi" env-fallback dalı (OTLP varsayılanına düşüp
// SOKET AÇABİLEN dal) HİÇ ÇALIŞMAZ:
//
//   1. `spanProcessors: []`    — S2'nin (b) ölçümü (architect K-A28-1,
//      ⭐ KORUNMUŞ sayı: `lsof -a -nP -iTCP` → 0 satır, `getActiveResourcesInfo()`
//      → yalnızca `PipeWrap` [stdout/stderr]). `sdk.js:217`
//      (`if (spanProcessors.length > 0)`) bu dizi `[]` olduğunda
//      `TracerProvider` HİÇ KURULMAZ — `else` dalındaki
//      `getSpanProcessorsFromEnv()` (OTLP varsayılanı) ASLA çalışmaz.
//   2. `logRecordProcessors: []` — S2'nin bulduğu R-S2-2'nin (TRACE'TEN
//      BAĞIMSIZ bir ikinci env-fallback yolu, `configureLoggerProviderFromEnv`)
//      KAPATILMASI. `sdk.js` yapıcısı `configuration.logRecordProcessors`
//      TRUTHY'YSE (`[]` DAHİL) `this._loggerProviderConfig`'i AÇIKÇA
//      KURAR; `start()`'taki `if (!this._loggerProviderConfig) { ... env
//      fallback ... }` dalı bu yüzden HİÇ ÇALIŞMAZ — `OTEL_LOGS_EXPORTER`
//      boşken 'otlp'ye düşüp OTLPLogExporter kuran (tembel ama VAR OLAN)
//      yol KAPATILIR.
//   3. `metricReaders: []`     — AYNI desen (`sdk.js` yapıcısı,
//      `getMetricReadersFromEnv()` çağrısını ATLAR): verilmezse bu
//      fonksiyon YAPICIDA (gecikmesiz) çalışır ve `OTEL_METRICS_EXPORTER`
//      boşken 'otlp'ye düşüp bir OTLPMetricExporter KURAR. S2'nin (b)
//      testi bu varsayılan yolu DOLAYLI OLARAK ZATEN ölçtü (`new NodeSDK({
//      spanProcessors: [] })` çağrısı `metricReaders`'ı HİÇ vermedi, yani
//      env-fallback o testte de ÇALIŞMIŞTI ve sonuç HÂLÂ 0 soketti —
//      OTLPMetricExporter da OTLPLogExporter gibi TEMBEL). Bu satır o
//      zımni sonucu AÇIKÇA bir karara çevirir — S2'nin ÖLÇMEDİĞİ bir
//      varsayılana GÜVENMEK YERİNE.
//
// ⚠⚠⚠ DÖRDÜNCÜ AÇIKÇA KAPATILAN KANAL (EMPİRİK BULGU, S6'nın KENDİ testi
// yakaladı — bkz. `createArkesoftInstrumentations()`'ın içindeki ayrıntılı
// yorum): `HttpInstrumentation({ disableIncomingRequestInstrumentation:
// true })`. Yukarıdaki üçü "exporter'a GİTMEYİ" kapatıyordu; bu DÖRDÜNCÜSÜ
// "GELEN `traceparent` başlığının `context.active()`'ı ZEHİRLEMESİNİ"
// kapatıyor — K-A28-1'in bağlayıcı kararının (`trace-id.ts`, S4) gerçek
// çalışma zamanı garantisi BUNA bağlıdır.
//
// ⚠⚠⚠ BEŞİNCİ AÇIKÇA KAPATILAN KANAL — DÜZELTME TURU 1/3, parça 1a
// (security BULGU 2, high) — `textMapPropagator: null`. K-A28-1'in GELEN
// `traceparent` reddi dördüncü kanalın (yukarıdaki `HttpInstrumentation`
// seçeneği) KAPATTIĞI delik İLE AYNI DEĞİL, İKİNCİ bir ağız: `@sentry/node`
// (S5'in `sentry.ts`'i) KENDİ `httpIntegration`'ını (bizim
// `HttpInstrumentation`'IMIZDAN TAMAMEN BAĞIMSIZ, `diagnostics_channel`
// ÜZERİNDEN kurulan, seçenekle KAPATILAMAYAN bir mekanizma) GETİRİR ve bu
// entegrasyonun `httpServerIntegration` parçası (`@sentry/node/.../
// integrations/http/httpServerIntegration.js`) HER gelen istekte KOŞULSUZ
// `api.propagation.extract(api.context.active(), normalizedRequest.headers)`
// çağırır — `disableIncomingRequestInstrumentation: true` BU ÇAĞRIYI
// ETKİLEMEZ (farklı paket, farklı kanca). ÖLÇÜLMÜŞ KÖK NEDEN
// (`@opentelemetry/sdk-node@0.223.2/build/src/sdk.js:164-166` ve
// `start.js`'in `create()`'i): bu alan HİÇ VERİLMEZSE (önceki hâl)
// `this._configuration?.textMapPropagator` `undefined` olur ve kod
// `undefined ?? getPropagatorFromEnv()`'e düşer — `OTEL_PROPAGATORS` env'i
// boşken bu fonksiyon GERÇEK bir `W3CTraceContextPropagator` +
// `W3CBaggagePropagator` çifti döner, `setupPropagator` bunu KÜRESEL olarak
// kaydeder (`propagation.setGlobalPropagator`). Bu KAYITLI gerçek propagator
// KİM çağırırsa çağırsın (bizim enstrümantasyonumuz KAPALI olsa BİLE,
// Sentry'nin KENDİ `httpServerIntegration`'ı dahil) `extract()`'i GERÇEKTEN
// çalıştırır — istemcinin gönderdiği `traceparent`'i AsyncLocalStorage
// context ağacına (NodeSDK `setupContextManager`'ın HER ZAMAN kurduğu
// `AsyncLocalStorageContextManager`, bu alandan BAĞIMSIZ) yazar; bu değer
// `trace-id.ts`'in `getCurrentTraceId()`'si TARAFINDAN "aktif span bağlamı
// GEÇERLİ" sanılıp DÖNDÜRÜLÜR — K-A28-1'in "gelen traceparent KABUL
// EDİLMEZ" kararını Sentry ÜZERİNDEN YENİDEN DELER (saldırgan kimliği
// doğrulanmamış olsa bile kendi seçtiği traceId'yi TÜM log satırlarına,
// `x-trace-id` yanıt başlığına ve kuyruk iş loglarına ENJEKTE edebilir).
// ⇒ `textMapPropagator: null` verildiğinde `sdk.js:165` dalı
// (`this._configuration?.textMapPropagator === null ? null : …`) `null`
// seçer, `setupPropagator(null)` İLK satırda ("null means 'do not
// register'") HİÇBİR ŞEY YAPMADAN döner — küresel propagator KAYITSIZ
// kalır, `@opentelemetry/api`'nin KENDİ varsayılanı olan
// `NoopTextMapPropagator`'a düşer (`extract(context, _carrier) { return
// context; }` — carrier'ı TAMAMEN YOK SAYAR). Sonuç: `extract()`'i KİM
// çağırırsa çağırsın (Sentry dahil) NO-OP; `getCurrentTraceId()` aktif span
// asla görmez, HER ZAMAN yerel üretime düşer. `disableIncomingRequestInstrumentation:
// true` (yukarıdaki dördüncü kanal) HÂLÂ GEREKLİDİR — bu BEŞİNCİ kanalın
// GEREKSİZ KILMADIĞI, AYRI bir ağız (bizim `HttpInstrumentation`'ımızın
// context.active()'a YAZMASINI önler; bu propagator'ın hiç kaydedilmemesi
// ise o context'e YAZILACAK VERİNİN KAYNAĞINI, yani extract()'i, herkes
// için etkisiz kılar) — ikisi BİRLİKTE K-A28-1'in garantisini kapatır.
//
// ⇒ Bu sürümün OTel kurulumu sinyali "ÜRETİR VE DOĞRULAR, DIŞARI GÖNDERMEZ"
// (architect R7) — gerçek bir exporter (ve dolayısıyla GERÇEKTEN KAYDEDİLEN
// span'ler) v0.18.0'ın işi. `trace-id.ts`'in Katman 1 yerel-üretim dalı bu
// yüzden BUGÜN PRATİKTE HER ZAMAN devrede kalır (aktif span bağlamı hiçbir
// zaman GEÇERLİ olmaz, çünkü `TracerProvider` hiç kurulmadı) — bu BİLİNÇLİ
// bir erteme, `docs/observability.md`'ye (S11) AÇIKÇA not düşülür.
//
// ⭐⭐ İDEMPOTENCY — `globalThis` üzerinde BELGELENMİŞ bir `Symbol` altında
// (K-A28-4, bağlayıcı: "modül kimliği varsayımına dayanmaz"). Bu sürümde
// `--import` YOLU YOK (S2(c)'nin ÖLÇÜMÜ: "GEREKMİYOR" ⇒ `preload.ts` ve
// `package.json` DEĞİŞİKLİĞİ ÇIKARILDI, AC-61 3 → 2) — tek etkinleştirme
// yolu bu dosyanın `main.ts`/`main.worker.ts` tarafından İLK IMPORT
// edilmesidir. İdempotency bayrağı yine de TUTULUR: ikinci bir import
// (ör. bir testin bu modülü doğrudan import etmesi) `NodeSDK.start()`'ı
// İKİNCİ KEZ çağırmaz — çift enstrümantasyon kaydı/çift `TracerProvider`
// kurulumu RİSKİNİ yapısal olarak KAPATIR.

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { PrismaInstrumentation } from '@prisma/instrumentation'

/**
 * `globalThis` üzerindeki idempotency/kapanış tutamacı anahtarı. `Symbol.for`
 * (KAYITLI/global sembol kaydı) KASITLI — bu dosyanın modül kimliğine
 * (`import.meta.url`/ESM modül önbelleği) DAYANMADAN aynı tutamaca erişmek
 * için (K-A28-4'ün "modül kimliği varsayımına dayanmaz" şartı).
 */
export const OBSERVABILITY_SDK_GLOBAL_SYMBOL = Symbol.for('arkesoft.observability.nodeSdk')

type ObservabilityGlobal = typeof globalThis & {
  [OBSERVABILITY_SDK_GLOBAL_SYMBOL]?: NodeSDK
}

const globalWithObservabilitySdk = globalThis as ObservabilityGlobal

/**
 * Üç enstrümantasyonun ÜRETİM örneklerini kurar — `bullmq-otel` burada YOK
 * (S7'nin kuyruk telemetri seçeneğidir, `NodeSDK.instrumentations` dizisine
 * GİRMEZ, BullMQ'nun kendi `telemetry` seçeneğinden ayrıca kurulur).
 *
 * ⭐ DIŞA AÇIK (A-PO1'in "S6, S2'nin probe dosyasını GERÇEK modüllere
 * yeniden yönlendirir" şartı): `__tests__/observability-runtime-contract.
 * test.ts` bu TEK fonksiyonu tüketerek "hangi enstrümantasyonları
 * kullanıyoruz" sorusunun İKİNCİ bir kopyasını AÇMAZ — test kendi ölçüm
 * amaçlı `SpanProcessor`/exporter'ını (üretimden BİLEREK FARKLI, çünkü
 * üretim `spanProcessors: []` ile HİÇ KAYIT YAPMAZ — dosya başı yorumu)
 * bu AYNI örneklere TAKAR.
 */
export function createArkesoftInstrumentations(): readonly [
  HttpInstrumentation,
  IORedisInstrumentation,
  PrismaInstrumentation,
] {
  return [
    // ⚠⚠⚠ KRİTİK GÜVENLİK DÜZELTMESİ — EMPİRİK OLARAK BULUNDU
    // (`log-correlation.test.ts`'in "gelen traceparent KABUL EDİLMEZ"
    // pini KIRMIZIYA düştü, kök neden burada): `HttpInstrumentation`'ın
    // varsayılan davranışı GELEN her istekte `propagation.extract()`
    // çağırır (`instrumentation-http/build/src/http.js:344`) ve çıkan
    // bağlamı `context.active()`'a YAZAR — bu, `trace.getTracerProvider()`
    // HİÇ KURULMAMIŞ olsa (bu dosyanın `spanProcessors: []` kararı) BİLE
    // olur, çünkü extraction SPAN KAYDINDAN TAMAMEN BAĞIMSIZ bir
    // mekanizmadır (W3C context propagation). Sonuç: `trace-id.ts`'in
    // `getCurrentTraceId()`'si (K-A28-1, S4 — BU DOSYAYA DOKUNULAMAZ)
    // "aktif span bağlamı geçerliyse kullan" dalında bu EXTRACTED (yani
    // İSTEMCİNİN GÖNDERDİĞİ `traceparent` başlığından türetilmiş) bağlamı
    // GEÇERLİ sanıp DÖNDÜRÜYORDU — K-A28-1'in bağlayıcı kararını
    // ("Gelen traceparent başlığı KABUL EDİLMEZ") FİİLEN DELEN bir kanal.
    // ⇒ `disableIncomingRequestInstrumentation: true` GELEN istekler için
    // `Server.prototype.emit`'in YAMALANMASINI TAMAMEN ATLAR
    // (`http.js:91-92`, `91: if (!this.getConfig().
    // disableIncomingRequestInstrumentation) { this._wrap(...) }`) —
    // `propagation.extract()` ARTIK HİÇ ÇAĞRILMAZ, yani GELEN hiçbir
    // başlık `context.active()`'ı etkilemez. ÇIKAN (client) istekler
    // İSE enstrümante EDİLMEYE devam eder (A3'ün boşa-çıkmama kanıtı ve
    // K-A28-1'in "W3C sürekliliği" amacı — BİZİM SÜRECİMİZDEN dışarı
    // giden çağrılar için — hâlâ ayakta).
    // ⚠ Bu, `observability-runtime-contract.test.ts`'in (a) ölçümündeki
    // HTTP span sayısını (eski: 2 — hem client hem server span) DEĞİŞTİRİR
    // (yeni: yalnızca client span'i) — bu bir GEVŞETME DEĞİL, ÖLÇÜLMÜŞ bir
    // güvenlik düzeltmesinin DOĞAL sonucu; o dosyanın dosya başı yorumu ve
    // `KARARLAR`da AÇIKÇA raporlanır.
    new HttpInstrumentation({ disableIncomingRequestInstrumentation: true }),
    new IORedisInstrumentation(),
    new PrismaInstrumentation(),
  ]
}

/** Üretim `NodeSDK` örneğini kurar. */
function createObservabilitySdk(): NodeSDK {
  return new NodeSDK({
    instrumentations: [...createArkesoftInstrumentations()],
    // ⚠⚠ Üçü de AÇIKÇA boş — dosya başı yorumuna bkz. (EXPORTER YOK).
    spanProcessors: [],
    logRecordProcessors: [],
    metricReaders: [],
    // ⚠⚠⚠ DÜZELTME TURU 1/3 (security BULGU 2) — BEŞİNCİ açıkça kapatılan
    // kanal, dosya başı yorumuna bkz. `null` ("do not register") ≠ `undefined`
    // ("varsayılanı kaydet, env'e düş") — bu AYRIM bilinçlidir.
    textMapPropagator: null,
  })
}

if (globalWithObservabilitySdk[OBSERVABILITY_SDK_GLOBAL_SYMBOL] === undefined) {
  const sdk = createObservabilitySdk()
  sdk.start()
  globalWithObservabilitySdk[OBSERVABILITY_SDK_GLOBAL_SYMBOL] = sdk
}

/**
 * Kapanışta çağrılır (`ObservabilityShutdownService.onApplicationShutdown`,
 * K-A28-3'ün sırasında `shutdownSentry()`'DEN ÖNCE). SDK hiç kurulmadıysa
 * (teorik olarak imkânsız — bu modül import edildiği anda yukarıdaki blok
 * koşar — ama savunma amaçlı) HİÇBİR ŞEY YAPMAZ.
 */
export async function shutdownObservability(): Promise<void> {
  const sdk = globalWithObservabilitySdk[OBSERVABILITY_SDK_GLOBAL_SYMBOL]

  if (sdk === undefined) {
    return
  }

  await sdk.shutdown()
}
