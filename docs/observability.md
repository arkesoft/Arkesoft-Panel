# Gözlemlenebilirlik ve hata yönetimi (v0.0.17)

> **Kritik mesaj (kullanıcı onaylı karar, bkz. `.claude/workflow/tasks/T-028.md`,
> PM Değerlendirmesi):** bu sürüm **dikişi kurar, yüzeyi ertelemez değil — yüzeyi
> v0.18.0'a erteler.** "Dikiş" = trace bağlamı, `traceId` korelasyonu, `AppError.logLevel`,
> redaction kapsamı — bugün ağ erişimi olmadan mekanik olarak doğrulanabilen,
> sonraki her sürümün üzerine enstrümante doğmasını sağlayan temel. "Yüzey" = Grafana/Loki
> panoları, örnek dashboard JSON'ları, alarm eşiklerinin **sayısal** değerleri, OTLP exporter,
> üç ek frontend'in (`admin`/`superadmin`/`storefront`) Sentry'si — bunların **hiçbiri bu
> sürümde yok**, üretim dağıtımı (`infra/` yalnızca `docker-compose.yml`, Pulumi/Helm yok)
> henüz bulunmadığı için bugün doğrulanamaz artefakt üretirlerdi.
>
> Bu belge iki şeyi birbirinden ayrı tutar: **ne kuruldu** ve **ne kurulmadı**. İkincisini
> gizlemek, altı ay sonra bu kodu okuyan kişiyi var olmayan bir izleme panosu aramaya
> gönderir — bu yüzden "Bugün çalışmayanlar" bölümü bilerek en uzun bölümdür.

## 1. İki katman

### Katman 1 — korelasyon (koşulsuz, ağsız, bugün AKTİF)

Her HTTP isteği bir `traceId` taşır. Kaynak: `apps/api/src/observability/trace-id.ts`,
tek dışa açık yüzey `getCurrentTraceId()`:

1. OTel **aktif span** bağlamı geçerliyse (`trace.isSpanContextValid`) o kullanılır.
2. Aktif span yoksa (bugünkü hâl — Katman 2 hiçbir `TracerProvider` kurmuyor, bkz. §2),
   16 bayt rastgele hex (`node:crypto`, yeni bağımlılık yok) **yerel üretilir**.

Bu kaynak sırası `RequestContextMiddleware`'de (`apps/api/src/request-context/
request-context.middleware.ts:80`) istek başına **bir kez** çağrılır ve sonucu:

- `logger.child({ requestId, traceId })` ile **ilk** log kaydına girer (`:88`),
- `x-trace-id` yanıt başlığına yazılır — **başarı** yanıtında middleware'in kendisi
  (`:112`), **hata** yanıtında `AppExceptionFilter` (`apps/api/src/errors/
app-exception.filter.ts`, AC-54b) aynı değeri (ALS'den okuyarak) tekrar yazar.
- `AppExceptionFilter`'ın `captureAppError` çağrısına (Sentry zarfı, bkz. §3) geçer.
- Kuyruğa giden işlerin payload'ına (`jobPayloadBaseSchema.traceId`, opsiyonel Zod
  alanı) `QueueService.enqueue()` tarafından **parse'tan önce, son** birleştirmeyle
  yazılır — çağıranın gönderdiği herhangi bir `traceId` her zaman üzerine yazılır.

Sonuç: aynı isteğin API → log → (varsa) Sentry zarfı → kuyruk işi zincirinde **tek**
`traceId` görünür — Katman 2 kapalıyken bile, çünkü üretici tek bir fonksiyondur ve
tüketiciler onu yalnızca **okur**, yeniden üretmez (aşağıya bkz.).

### Katman 2 — trace hattı (bugün KURULU ama dışa aktarmıyor)

`apps/api/src/observability/instrumentation.ts`, `main.ts`/`main.worker.ts`'in **ilk
import'u**. `NodeSDK` + dört enstrümantasyon (`HttpInstrumentation`,
`IORedisInstrumentation`, `PrismaInstrumentation`, ayrıca BullMQ için `bullmq-otel` —
bu dördü `NodeSDK.instrumentations` dizisine girmez, `QueueBaseOptions.telemetry`
üzerinden ayrıca kurulur) kurulur, ama:

```ts
spanProcessors: [],
logRecordProcessors: [],
metricReaders: [],
```

**Üçü de açıkça boş verilir** — bu, "verilmedi" demek değildir. `@opentelemetry/
sdk-node@0.223.2`'nin kendi kaynağında boş dizi `truthy` sayıldığı için "hiç
verilmedi" dalı (env değişkenine düşüp OTLP soketini **açabilen** dal) hiç
çalışmaz. Sonuç: `TracerProvider`/`LoggerProvider`/`MeterProvider` **hiç
kurulmaz** — `trace.getTracerProvider()` bir `NoopTracerProvider`'a sarılı
`ProxyTracerProvider` döner (`perf` tur 2'nin ölçümü). Bu yüzden Katman 1'in
"aktif span" dalı bugün **pratikte hiç devreye girmez** — her `traceId` yerel
üretimdir. Bu **bilinçli bir erteme**: gerçek bir exporter (ve dolayısıyla
gerçekten kaydedilen span'ler) v0.18.0'ın işi.

## 2. `traceId` kuralı — bağlayıcı, iki ağızda da kapatıldı

**Gelen `traceparent` başlığı hiçbir koşulda kabul edilmez.** Üç ölçülmüş gerekçe
(`observability/trace-id.ts:20-28`):

1. Güvenilir ingress yok (`AUTH_TRUSTED_PROXY_COUNT` varsayılanı `0`,
   `config/api-env.ts`).
2. Kabul etmek her istemciye log korelasyonunu **zehirleme** yetkisi verir —
   istemci kendi seçtiği bir `traceId`'yi dayatabilir.
3. Katman 2 açıldığında W3C `traceparent` sürekliliğini `instrumentation-http`
   kendi standart kurallarıyla zaten sağlar; bu dosyanın tekrar etmesine gerek yok.

Yeniden açma noktası: **v0.18.0** (güvenilir ingress geldiğinde).

Bu kural **iki ayrı ağızdan** fiilen delinebiliyordu, gate turlarında ikisi de
yakalandı ve kapatıldı:

- **Birinci ağız — OTel'in kendi `HttpInstrumentation`'ı** (gate `security` tur 1,
  bulgu G2'nin de kökeni, `solid` tur1'in de değil — asıl keşif `backend`/S6'nın
  **kendi testinin** kırmızı vermesiyle oldu): varsayılan davranış **gelen her
  istekte** `propagation.extract()` çağırıp `context.active()`'ı dolduruyordu —
  `TracerProvider` hiç kurulmamış olsa **bile**, çünkü extraction span kaydından
  tamamen bağımsız bir mekanizma (W3C context propagation). Düzeltme:
  `new HttpInstrumentation({ disableIncomingRequestInstrumentation: true })`
  (`instrumentation.ts:185`) — gelen taraf için yama kaydı tamamen atlanır, çıkan
  (client) taraf enstrümante kalır.
- **İkinci ağız — Sentry'nin KENDİ `httpServerIntegration`'ı** (gate `security`
  tur 1, bulgu G2, `high`): `@sentry/node` kendi HTTP entegrasyonunu
  `diagnostics_channel` üzerinden kurar — bizim `HttpInstrumentation`
  ayarımızdan **tamamen bağımsız** bir kanca. Bu entegrasyon her gelen istekte
  koşulsuz `api.propagation.extract(...)` çağırıyordu. Düzeltme:
  `textMapPropagator: null` (`instrumentation.ts:202`) — `@opentelemetry/sdk-node`
  bu değeri "hiç kaydetme" olarak yorumlar (`undefined` ile **aynı değil**: `undefined`
  env'e düşüp gerçek bir propagator kaydeder, `null` kaydı tamamen atlar); küresel
  propagator kayıtsız kalınca `extract()`'i kim çağırırsa çağırsın (Sentry dahil)
  no-op olur, `@opentelemetry/api`'nin kendi `NoopTextMapPropagator`'ına düşülür.

İkisi birlikte K-A28-1'in garantisini kapatır; biri olmadan diğeri yetmez (farklı
paketler, farklı kancalar).

## 3. `traceId` üretilir, okunmaz — tek üretici, yapısal garanti

`observability/sentry.ts` ÖNCEDEN (`solid` tur 1, bulgu `high-1`) `getCurrentTraceId()`'yi
kendisi **yeniden çağırıyordu**. Sorun: `instrumentation.ts` bir `TracerProvider` hiç
kurmadığı için aktif span asla geçerli olmaz, yani bu yeniden çağrı **her zaman yeni,
rastgele bir 32-hex** üretiyordu — Sentry zarfının `trace_id` tag'i AYNI isteğin
`x-trace-id` yanıt başlığı/log `traceId`'siyle **asla eşleşmiyordu**. Biçimsel olarak
geçerli göründüğü için sessizce yanlış korelasyon vaat ediyordu.

Düzeltme yapısaldır, sözleşmeye değil koda bağlıdır:

```ts
export interface CaptureAppErrorInput {
  readonly error: AppError
  readonly tenantId: string | undefined
  readonly requestId: string
  /** AYNI isteğin x-trace-id başlığı/log traceId'siyle birebir aynı değer —
   *  çağıran hesaplar, bu dosya YENİDEN ÜRETMEZ. */
  readonly traceId: string
}
```

`sentry.ts` artık `trace-id.ts`'i **import etmiyor** (`getCurrentTraceId` eşleşme
sayısı: 0 gerçek kod, 2 yorum) — dosya bir `traceId` **üretemez**, yalnızca çağırandan
(`app-exception.filter.ts`, ALS'ye yazılan değeri okuyan zincirin tek üyesi) alır. Bu,
"yorumla hatırlatma" değil "dosyadan fiilen kaldırma" seviyesinde bir garanti.

## 4. Sentry veri toplama duruşu — `opt-out` dersi (bu sürümün en pahalı dersi)

`@sentry/node`'un varsayılanları **`opt-out`**'tur, `opt-in` **değildir**. Gate turu 1'de
(`security`, `critical`) şu ölçüldü: `dataCollection: { userInfo: false }` tek başına
**yetersizdi** — kalan **on bir** `DataCollection` alanı varsayılana düşüyordu ve
`httpBodies` dört yönü de (`incomingRequest`/`outgoingRequest`/`incomingResponse`/
`outgoingResponse`) açıktı. `requestDataIntegration` gövdeyi **hiçbir filtreden**
geçirmiyor — yalnızca `cookies`/`headers`/`query_string`/`url` filtreleniyor, `body`
zarfa olduğu gibi gidiyordu. Senaryo: bir kiracının müşterisi giriş/kayıt/ödeme
formunu gönderir; o istek sırasında `logLevel: 'error'` taşıyan herhangi bir `AppError`
olursa zarf müşterinin açık metin parolasını, kart numarasını, TCKN'sini, tam
e-postasını üçüncü tarafa (sentry.io) taşırdı — saldırgan gerekmez, tek bir 5xx yeterli.

Düzeltme (`observability/sentry.ts:199-206`) **altı alanı** tek tek kapatır:

```ts
dataCollection: {
  userInfo: false,
  httpBodies: [],
  cookies: false,
  httpHeaders: { request: false, response: false },
  urlQueryParams: false,
  stackFrameVariables: false,
},
tracesSampleRate: 0,
```

`tracesSampleRate: 0` **ayrıca ve açıkça** verilir: bu alan SDK içinde
`options.tracesSampleRate ?? process.env.SENTRY_TRACES_SAMPLE_RATE`'den okunur —
yani "hiç verilmez" değişmezi bir ortam değişkeniyle (`SENTRY_TRACES_SAMPLE_RATE`)
tersine çevrilebilir. `0` açıkça vermek bu env-tersine-çevirme yüzeyini kapatır.

Gate turu 2'de (`security`, `medium`, M3 — `qa` tarafından **kasıtlı kırmızı** bir
regresyon testiyle kapanması zorlandı) **yedinci** bir kanal bulundu:
**`Console` breadcrumb entegrasyonu** (ve ölçüldü — Sentry'nin varsayılan
breadcrumb kaynakları **altı** dosyadan geliyor: `console`, `childProcess`,
`fetch`, `http/add-outgoing-request-breadcrumb`, `http/client-subscriptions`,
`supabase`). Bu kanal altı `dataCollection` alanını, `redactDeep`'i **ve** pino
redaksiyonunu **üçünü de** baypas ediyordu — `console.warn(sır)` çağrısı zarfa
filtresiz giderdi. İki seçenek değerlendirildi:

- **(A)** `integrations: (d) => d.filter((i) => i.name !== 'Console')` — yalnızca
  ölçülen kanalı kapatır, altıda beşini açık bırakır.
- **(B)** `beforeBreadcrumb: () => null` (**seçilen**) — Sentry'nin breadcrumb
  boru hattının tek boğaz noktası (`@sentry/core/.../breadcrumbs.js`:
  `if (finalBreadcrumb === null) return`); hangi entegrasyon üretmiş olursa
  olsun, **tüm altı** kaynak buradan geçer, SDK'nın gelecekte ekleyeceği her yeni
  kaynak da kapalı doğar.

(B) bu sürümün temasının ("SDK varsayılanları opt-out") doğru uygulanmasıdır —
(A) aynı tuzağı yalnızca bir kanal için kapatıp beşini açık bırakırdı.

**Bilerek varsayılanda bırakılan altı alan** (`graphQL`/`genAI`/`mcp`/
`databaseQueryData`/`queues`/`frameContextLines`): bunlardan **beşi** bugün
ölçülmüş olarak eylemsiz — `enableOpenTelemetrySetup: false` + `tracesSampleRate: 0`

- ilgili entegrasyonların hiçbiri projede yok. Ama **`frameContextLines`** için
  bu gerekçe **faktik olarak yanlıştı** (gate turu 2'nin kendi düzeltmesi, bulgu L2):
  `contextLinesIntegration()`'ın `processEvent` kancası Sentry'nin tracing hattından
  **tamamen bağımsızdır** ve istisna yığın çerçevelerine çevredeki **kaynak kod
  satırlarını** gerçekten ekler. Güvenlik etkisi yok (depo public, taşınan satırlar
  statik uygulama kodu, sır/PII değil) ama bilinçli bırakıldı — kapatmak teşhis
  değeri taşıyan zararsız bir alanı gerekçesiz kısıtlamak olurdu.
  `databaseQueryData` için ayrı not: v0.18.0'da gerçek bir span exporter + Sentry
  performans entegrasyonu açılırsa **yeniden değerlendirilmeli** (Prisma sorgu
  parametre değerleri kiracı verisi taşıyabilir).

## 5. Kapanış sırası — yapıdan gelir, yarış içermez

`observability/observability-shutdown.service.ts`, Nest'in `onApplicationShutdown`
kancası:

```
SIGTERM
 → (Nest) HTTP sunucu kapanır
 → (Nest) onModuleDestroy       : Prisma $disconnect · QueueLifecycleService
 → (Nest) onApplicationShutdown : ObservabilityShutdownService
                                    1) otelSdk.shutdown()   (OTel ÖNCE)
                                    2) Sentry.close(2000)   (Sentry SONRA)
 → event loop boşalır → exit 0
```

Kapanış sırası **`process.on('SIGTERM')`'e eklenmez** — bu, hangi dinleyicinin önce
koştuğuna bağlı bir yarış olurdu. Sıra Nest'in kendi yaşam döngüsü yapısından gelir
(`onApplicationShutdown` kancaları `onModuleDestroy`'dan **sonra** koşturulur).
`main.ts`'in watchdog'u (`.unref()`, event loop'u canlı tutmayan `setTimeout`)
değişmedi — ikinci savunma hattı olarak kalır. Worker süreci (`main.worker.ts`)
`enableShutdownHooks()` kullanmaz, ama `app.close()` aynı sırayı koşturur —
aritmetik: `WORKER_CLOSE_TIMEOUT_MS` (5000) + `SENTRY_FLUSH_TIMEOUT_MS` (2000) +
OTel `shutdown()` (soket yok, pratikte anında döner) ≈ en çok ~7000ms <
`WORKER_SHUTDOWN_WATCHDOG_MS` (10 000).

## 6. `redactDeep` — üç tüketici

`AppError.context` bu sürümden itibaren **ilk kez** süreç dışına (Sentry zarfı)
taşınıyor. `redactDeep()` (`packages/errors/src/redaction.ts:298-328`) bu zarf
sınırında kullanılan **üçüncü** savunma katmanı (birincisi: hiçbir kod yolu sırrı
loglamaz; ikincisi: pino `redact.paths`). Üç tüketicisi:

- `apps/api/src/observability/sentry.ts` — Sentry zarfının `appError` bağlamı.
- `packages/trpc/src/trpc.ts` — tRPC hata sınırının log dalı (L-11).
- `apps/api/src/errors/error-mapping.ts` — REST log yolu (düzeltme turu 1'de eklendi;
  önceden bu yol hamdı, tRPC/Sentry yolu redakteli — asimetri kapatıldı).

Gate turu 1'de (`security`, `medium`, G4) `SECRET_FIELD_NAMES`'in CLAUDE.md §4'ün
"asla loglanmaz" listesinin **altında** kaldığı ölçüldü: kart numarası, CVV, TCKN,
tam adres, tam e-posta, OAuth sır varyantları yoktu; eşleşme de tam ve harfe
duyarlıydı (`Authorization`/`API_KEY` kaçıyordu). Düzeltme:

- Küme **16 → 27** ada büyüdü (+11: `cardNumber`/`pan`/`cvv`/`cvc`/`tckn`/
  `nationalId`/`address`/`email`/`clientSecret`/`jwt`/`otp`).
- `redactDeep`'in **arama tarafı** artık `normalizeFieldName` (`toLowerCase` +
  `-`/`_` kaldırma) ile normalize ediyor — `Authorization`/`API_KEY`/`api-key`/
  `apiKey` hepsi aynı sır adına düşüyor. `PINO_REDACT_PATHS`'e normalizasyon
  **uygulanmadı** — pino'nun yol metinleri kendi sözleşmesi gereği harfe duyarlı
  (`fast-redact`); bu asimetri bilinçli ve yorumla gerekçelendirilmiş
  (`redaction.ts:242-253`).
- `WILDCARD_NESTED_FIELD_NAMES` (pino'nun iç içe joker listesi) **bilerek 6'da
  sabit tutuldu** (`redaction.ts:147-165`): yeni 11 addan hiçbirinin bugün bilinen
  bir tek-seviye iç içe biçimi yok (grep ile doğrulandı); `redactDeep` zaten her
  derinlikte tarıyor (pino yalnızca ikincil/yüzeysel hat); bir sağlayıcı adaptörü
  (`packages/integrations`, v0.6.x) gerçek bir iç içe biçim (ör. `{card: {cvv}}`)
  üretirse küme **o zaman** genişletilecek. **Bu karar bağlayıcı yorum olarak
  dosyada duruyor** — spekülatif genişleme yasağının (`'*.value'` emsali) aynı
  sınıfı.
- `value`/`code` dışlamaları ve `emailMasked` (zaten maskelenmiş, güvenli değer)
  korundu — genişleme hem kapsadı hem yanlış pozitif üretmedi (mutasyon
  kanıtıyla doğrulandı).

## 7. Operatör notu — `SENTRY_DSN` opsiyonel

`SENTRY_DSN` (`apiEnvSchema`, `config/api-env.ts:246`) **opsiyonel**. `.env.example`'da
**bilinçli olarak yok** — depo **public**, gerçek bir DSN'in repoya girmesi
`pnpm guards`'ın AC-61 kontrolünün FAIL vermesine yol açar.

Operatör `SENTRY_DSN` **vermezse**: `startSentry()` `Sentry.init`'i hiç çağırmadan
erken döner (DSN kontrolü `Sentry.init`'ten tamamen önce) — sıfır zarf, sıfır
soket. `shutdownSentry()` de bu durumda no-op'tur (AC-57). Bu, **bugünkü
varsayılan durumdur**.

Operatör `SENTRY_DSN` **verirse**: bu sürümün bütün amacı tam burada devreye
girer — Sentry başlar ve §4'teki altı veri toplama kanalı + breadcrumb kanalı
kapalı, trace OTel'in (ama OTel bugün hiçbir şey dışa aktarmıyor, §1), kapanışta
düzenli `flush` + `close`.

## 8. `perf`'in ölçtüğü açılış maliyeti

```
çıplak Node                   62ms medyan  (15 koşum)
instrumentation.ts yüklü     222ms medyan  (15 koşum)
                            ⇒ +160ms / +%258
```

**Mutlak eşik yok** — depoda global bir API p95 hedefi tanımlı değil, bu yüzden
sayı **olduğu gibi** raporlanıyor, "kabul edilebilir" denmiyor. Bu bir **açılış**
maliyeti — istek yolu değil, süreç başına bir kez. Ölçüm **load average 81**
altında (10 çekirdekli makinede) alındı; mutlak ms değerleri bu nedenle **düşük
kesinlikli** — gerçek bir performans kararı için sakin bir makinede tekrar
ölçülmeli.

Sıfır ağ soketi + SIGTERM sonrası sıfır açık handle doğrulandı (`lsof -a -nP -p
<pid> -iTCP` → 0 satır; `-a` bayrağı kritik — olmadan sistem genelindeki ilgisiz
TCP'leri de sayar). t=2sn'deki aktif kaynak listesi (`getActiveResourcesInfo()`)
çıplak `http.Server` ile `instrumentation.ts` yüklü hâlde **birebir aynı**
(`["PipeWrap","TCPServerWrap","PipeWrap","Timeout"]`) — OTel'e atfedilebilir
kalıcı handle sıfır.

`redactDeep` maliyeti ayrıca ölçüldü: tipik `context` (4 alan) ~0,45µs, patolojik
(derinlik 6, 50 alan) ~14,5µs — bu yol **yalnızca** `logLevel: 'error'` taşıyan
bir hata fırlatıldığında çalışır, mutlu yolda **sıfır** çağrı.

### `HostDetector` çocuk süreci (düşük öncelik, borç)

Açılışta `@opentelemetry/resources`'ın varsayılan `HostDetector`'ı (darwin'de
`getMachineId`) kısa ömürlü bir çocuk süreç (ör. `ioreg`) + iki ek `Timeout`/
`PipeWrap` handle'ı açıyor. `async_hooks` ile izlendi: ~1-2 saniyede kendiliğinden
kapanıyor, soket açmıyor, kapanışı geciktirmiyor. Düzeltme gerektirmiyor, not
olarak kayıtlı (bkz. Teknik Borç, v0.18.0).

## 9. Bugün çalışmayanlar — dürüst bölüm

- **Span/metrik/log dışa aktarımı yok.** `spanProcessors`/`logRecordProcessors`/
  `metricReaders` üçü de açıkça `[]`. Gerçek bir exporter (OTLP, Grafana/Loki) ve
  dolayısıyla gerçekten kaydedilen trace/metrik/log sinyali **v0.18.0**'ın işi.
- **`trace-attributes.ts`'in canlı tüketicisi yok.** `ARKESOFT_TENANT_ID_ATTRIBUTE`
  (`arkesoft.tenant.id`) tanımlı, ama `TracerProvider` hiç kurulmadığı için
  bugün **hiçbir span bu attribute'u gerçekten taşımıyor** — anahtar gelecekteki
  bir tüketici (bir exporter eklendiğinde) için tek kaynak olarak duruyor. Dosyanın
  kendi yorumu (`:39-45`) "security/qa'nın taraması bu diziyi gezerek doğrular"
  diyor — ölçüldü, **böyle bir tarayıcı test bugün yok**; bu bir tutarsızlık
  olarak teknik borca kaydedildi (bkz. ROADMAP → v0.0.17 kaynaklı borçlar).
- **`guards`'ın 25. adımı CI'da koşmuyor.** AC-61'i zorlayan adım
  `scripts/guards.sh`'in parçası ve **yerel beşli kapıda gerçek**; CI'ın `guards`
  job'u bu script'i çağırmıyor, kendi satır içi adımlarını koşturuyor
  (`.github/**` bu sürümde dokunulamaz kapsam dışı). CI paritesi **v0.18.0**'a
  tarihli borç.
- **ESM `node:http` enstrümante edilmiyor.** `@opentelemetry/instrumentation-http@
0.223.2`, Node v25.8.1'de saf ESM `import ... from 'node:http'`'i **hiçbir**
  preload stratejisiyle (`--import`, modül içi `enable()`) yakalamıyor — kanca
  `require-in-the-middle` (CJS `require()`) temellidir, gerçek ESM `import` farklı
  bir mekanizma (`import-in-the-middle`) ister. Üretim bugün bu yoldan geçmiyor
  (Express/Nest sunucusu CJS `require('http')` zincirinden geliyor, dört izole
  deneyle doğrulandı: CJS sunucu + `--require` → 1 span, CJS + `--import` → 1 span,
  ESM sunucu + `--import` → 0 span, ESM + manuel `enable()` → 0 span) — ama
  ileride bir worker veya health-check saf ESM `node:http` kullanırsa o isteklerin
  span'leri **asla görünmez**. Ölçülmüş, bilinçli olarak giderilmemiş bir boşluk.

## 10. Operatör için özet kontrol listesi

- Sentry'yi devreye almak istiyorsanız yalnızca `SENTRY_DSN`'i tanımlayın; başka
  bir ortam değişkeni (`SENTRY_TRACES_SAMPLE_RATE` dahil — bu sürümün `tracesSampleRate:
0`'ı zaten açıkça kapatıyor) **eklemeyin**, eklerseniz bu sürümün kapattığı
  env-tersine-çevirme yüzeyi yeniden açılabilir.
- Loglarda `traceId` alanını arayın — aynı isteğin tüm log satırlarında (ve varsa
  Sentry zarfının `trace_id` etiketinde) birebir aynı değeri bulmanız gerekir.
  Farklıysa bu bir regresyondur (gate'lerin kapattığı sınıfın yeniden açılması).
- `x-trace-id` yanıt başlığını bir destek talebiyle eşleştirmek için
  kullanabilirsiniz — ama bugün bu değer **müşteriye** değil yalnızca Arkesoft'un
  kendi loglarına/Sentry'sine görünür (v0.16.0'da müşteri görünürlüğü açılırsa
  arama kiracı kapsamlı olmalı — bkz. ROADMAP teknik borç).
