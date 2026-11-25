# T-028 — `security` gate raporu (tur 1)

Tarih: 2026-11-24 · Sürüm: ROADMAP **v0.0.17** (platform `0.12.0 → 0.13.0`) ·
Dal: `feat/v0.0.21-surum-kayit-modeli` · Faz: üretim tamamlandı (S1–S10), gate turu 1

```
GATE: security
SONUÇ: FAIL
```

FAIL gerekçesi (AGENT_BASELINE §4): **1 critical + 1 high + 2 medium**.

---

## BULGULAR

### G1 — [SEV: critical] Sentry, gelen HTTP isteğinin HAM GÖVDESİNİ üçüncü tarafa gönderiyor

`apps/api/src/observability/sentry.ts:105-119` (`Sentry.init` seçenek kümesi)

`Sentry.init` yalnızca `dataCollection: { userInfo: false }` veriyor. `@sentry/node@11.12.0`'ın
geri kalan `dataCollection` varsayılanları **ölçüldü**:

```
userInfo:false  cookies:true  httpHeaders:{request:true,response:true}
httpBodies:["incomingRequest","outgoingRequest","incomingResponse","outgoingResponse"]
urlQueryParams:true  stackFrameVariables:true
```

`requestDataIntegration` (varsayılan entegrasyon) başlık / çerez / query değerlerini **kendi
filtresinden geçiriyor** (ölçüldü: `authorization` ve `cookie` → `[Filtered]`), ama
`request.data` (istek gövdesi) **hiçbir filtreye tabi değil** — kaynak kanıtı:
`@sentry/core/build/cjs/integrations/requestdata.js` → `addNormalizedRequestDataToEvent()`
yalnızca `cookies`, `headers`, `query_string`, `url` için `filterKeyValueData(...)` çağırıyor;
`requestData.data` `event.request`'e **olduğu gibi** yazılıyor.

**Ölçüm (gerçekçi Nest/Express benzeri async zincir, sahte taşıyıcıyla tele yakalanan zarf):**

```
POST /api/auth/sign-in  body={"email":"kurban@example.com","password":"hunter2pass",
                              "cardNumber":"4111111111111111","cvv":"123","tckn":"12345678901"}

TEL (wire) içeriği:
  hunter2pass        => BULUNDU
  4111111111111111   => BULUNDU
  12345678901        => BULUNDU
  kurban@example.com => BULUNDU
  event.request.data = "{\"email\":\"kurban@example.com\",\"password\":\"hunter2pass\", …}"
```

**Saldırı/olay senaryosu (saldırgan GEREKMİYOR, tek bir 5xx yeterli):** bir kiracının müşterisi
giriş / kayıt / (v0.5.x'te) ödeme formunu gönderir. O istek sırasında `logLevel: 'error'` taşıyan
herhangi bir `AppError` (`app-exception.filter.ts:136-139` → `captureAppError`) **ya da**
`onUncaughtException`/`onUnhandledRejection` varsayılan entegrasyonlarının yakaladığı bir hata
oluşursa, zarf müşterinin **açık metin parolasını**, **TCKN'sini**, **tam e-postasını** ve ödeme
uçları geldiğinde **kart numarası + CVV'sini** `sentry.io`'ya taşır. Saldırgan 500 üretebildiği
bir uçta bunu **bilerek tetikleyebilir** (kendi verisi için), ama gerçek maruziyet **her gerçek
kullanıcının** gövdesinin her hatada dışa akmasıdır.

İhlal edilen kurallar: CLAUDE.md §2 yasaklar (*"Kart verisi loglanmayacak, saklanmayacak"*) ·
§4 log formatı (*"Asla loglanmaz: şifre, token, çerez, API anahtarı, kart numarası/CVV, TCKN,
tam adres, tam e-posta"*) · §10 md 7 · KVKK (kişisel verinin üçüncü tarafa aktarımı) · PCI
kapsam dışı kalma hedefi.

⚠ İkinci yüzey, **aynı kök neden**: `httpBodies` varsayılanı `"outgoingRequest"` da içeriyor ⇒
`packages/integrations` adaptörleri doğduğunda **giden** sağlayıcı isteklerinin gövdeleri (API
anahtarı, kart payload'ı) de aynı kanaldan gider.
⚠ Üçüncü yüzey: `tracesSampleRate` kodda **verilmiyor** ama `@sentry/node/build/cjs/sdk/index.js:170`
onu `process.env.SENTRY_TRACES_SAMPLE_RATE`'ten **okuyor** ⇒ K-A28-2'nin *"verilmez"* değişmezi
bir ortam değişkeniyle ters çevrilebilir; span açıldığında gövde ayrıca
`addNormalizedRequestDataToSpan()` → `HTTP_REQUEST_BODY_DATA` attribute'una (yine **filtresiz**)
yazılır.

**Önerilen düzeltme** (ölçülmüş: aşağıdaki tek alan gövdeyi tamamen kesiyor —
`HAS_DATA=false`, üç sentinel de `yok`):

```ts
dataCollection: {
  userInfo: false,
  httpBodies: [],                                   // ⇐ yük taşıyan düzeltme
  cookies: false,                                   // derinlemesine savunma
  httpHeaders: { request: false, response: false },  // derinlemesine savunma
  urlQueryParams: false,                             // derinlemesine savunma
  stackFrameVariables: false,                        // derinlemesine savunma
},
tracesSampleRate: 0,   // env ile ters çevrilmeyi kapatır
```

`AC-62`'nin mekanik pini bu **altı alanı tek tek** kapsayacak şekilde genişletilmeli (bugün
yalnızca `enableOpenTelemetrySetup`/`dataCollection.userInfo`/`tracesSampleRate` yokluğunu
pinliyor; `httpBodies` **hiç** pinli değil ⇒ regresyon sessiz kalır).

**Sorumlu ajan:** `backend` (S5 — `observability/sentry.ts`), pini `qa`/`backend` birlikte.

---

### G2 — [SEV: high] K-A28-1 (gelen `traceparent` KABUL EDİLMEZ) `@sentry/node` üzerinden YENİDEN KIRILDI

`apps/api/src/observability/instrumentation.ts:141` (kapatılan kanal) +
`apps/api/src/observability/sentry.ts:105` (yeniden açan kanal) ·
`apps/api/src/observability/trace-id.ts:61-69` (etkilenen tek kaynak)

S6'nın empirik düzeltmesi (`HttpInstrumentation({ disableIncomingRequestInstrumentation: true })`)
**yalnızca OTel'in kanalını** kapatıyor. `@sentry/node`'un **varsayılan** `httpIntegration`'ı aynı
işi kendi yolundan yapıyor:

```
@sentry/node/build/cjs/integrations/http/httpServerIntegration.js:38-41
  const ctx = api.propagation.extract(api.context.active(), normalizedRequest.headers)
                 .setValue(HTTP_SERVER_INSTRUMENTED_KEY, true);
  api.context.with(ctx, () => { … next() … });   // istek ZİNCİRİNİN TAMAMI bu bağlamda koşar
```

Zincirin üç halkası da ölçüldü:

1. **Global propagator HER ZAMAN kurulu.** `@opentelemetry/sdk-node@0.223.2`
   `build/src/sdk.js:164-166` → `utils.js:191-207`: `textMapPropagator` verilmediğinde ve
   `OTEL_PROPAGATORS` boş olduğunda `setupPropagator(undefined)` → `CompositePropagator([
   W3CTraceContextPropagator, W3CBaggagePropagator ])` **global** olarak kaydediliyor.
   `spanProcessors: []` kararı bunu **etkilemiyor** (o yalnızca `TracerProvider`'ı engelliyor).
2. **Kanal tetikleniyor.** `httpServerIntegration.setupOnce()` Node'un **yerleşik**
   `http.server.request.start` diagnostics kanalına abone olup `server.emit`'i sarmalıyor ⇒
   `--import` preload'ı veya modül yaması **gerekmiyor**, ilk istekten itibaren aktif.
3. **Aynı `@opentelemetry/api` kopyası.** `pnpm why @opentelemetry/api` → **Found 1 version**
   (`1.9.1`); `@sentry+opentelemetry@11.12.0_@opentelemetry+api@1.9.1` ⇒ Sentry'nin yazdığı
   bağlamı **bizim** `trace.getSpanContext(context.active())` çağrımız okuyor.

**Empirik ölçüm (mekanik izolasyon + nedensel açıklama + kontrol grubu):**

```
NodeSDK(spanProcessors:[], disableIncomingRequestInstrumentation:true) + Sentry.init(DSN dolu)
  istek#1 traceparent=00-11112222333344445555666677778888-… →
          FROM_ACTIVE_SPAN:11112222333344445555666677778888      ⇐ SALDIRGANIN DEĞERİ
  istek#2 aynı → aynı sonuç
KONTROL: aynı kurulum, Sentry.init YOK → LOCAL_GENERATED         ⇐ nedensellik Sentry'de
```

**Saldırı senaryosu:** kimliği doğrulanmamış herhangi bir istemci
`traceparent: 00-<32 hex>-<16 hex>-01` gönderir. Seçtiği trace id (a) o isteğin **tüm log
kayıtlarının** `traceId` alanına (`request-context.middleware.ts:77-96`), (b) **`x-trace-id`
yanıt başlığına** (`:112` ve `app-exception.filter.ts:95`), (c) `QueueService.enqueue` →
`jobPayloadBaseSchema.traceId` → **worker'ın iş loglarına** (`job-runner.ts:446`) ve
`bullmq-otel` metadata'sına (`queue.module.ts:116`, süreç-dışı kanal) yazılır. Saldırgan kendi
yanıtlarındaki `x-trace-id`'den **başka bir kiracının** trace id'sini gözlemleyip aynı değeri
dayatarak o korelasyon kimliğine **kendi uydurma log satırlarını** enjekte edebilir ⇒ olay
müdahalesinde inkâr edilebilirlik (repudiation), kiracılar arası log korelasyonu zehirlenmesi,
`AC-53`'ün *"tek `traceId` zinciri"* garantisinin çürümesi. **Kiracı verisi OKUNMUYOR** ⇒ bu
yüzden `critical` değil `high`.

**Pinin neden yeşil kaldığı (kör nokta):** `apps/api/src/__tests__/log-correlation.test.ts:293`
`createTestApp({ stream })` ile koşuyor; `SENTRY_DSN` **tanımsız** ⇒ `startSentry()` erken dönüyor
⇒ Sentry kanalı testte **hiç kurulmuyor**. Pin üretimdeki (DSN dolu) yapılandırmayı **ölçmüyor**.

**Önerilen düzeltme (ölçüldü, yapısal ve kütüphane-bağımsız):**
`createObservabilitySdk()`'a `textMapPropagator: null` eklenmesi — `sdk.js:164` bu değeri
*"kaydetme"* olarak yorumluyor ⇒ `propagation.extract()` **kim çağırırsa çağırsın** no-op olur.
Doğrulama:

```
NodeSDK(..., textMapPropagator:null) + Sentry.init(DSN dolu) + saldırgan traceparent
  → LOCAL_GENERATED        ⇐ kanal yapısal olarak kapandı
```

⭐ Bu, exporter'ı olmayan bu sürümde hiçbir yeteneği kaybettirmiyor (W3C sürekliliği v0.18.0'ın
işi, K-A28-1 zaten *"yeniden açma: v0.18.0"* diyor). İkinci (daha dar) seçenek Sentry'nin `Http`
entegrasyonunu varsayılan kümeden çıkarmak; ⚠ gelen-istek sarmalaması `httpServerIntegration`
içinde **koşulsuz** olduğu için seçenekle kapatılamaz, entegrasyonun **kendisi** listeden
çıkarılmalıdır.
⚠ `log-correlation.test.ts`'in K-A28-1 pini **Sentry başlatılmış** hâliyle de koşmalı; aksi
hâlde aynı regresyon üçüncü kez geri gelir.

**Sorumlu ajan:** `backend` (S6 — `observability/instrumentation.ts`), pin genişletmesi `qa`.

---

### G3 — [SEV: medium] Bu sürüm `pnpm audit`'e YENİ bir moderate zafiyet ekliyor (`@opentelemetry/core < 2.8.0`)

`pnpm-workspace.yaml` katalog girdisi `'@opentelemetry/sdk-trace-base': 2.1.0` ·
`apps/api/package.json:58` (devDependencies)

```
moderate  OpenTelemetry Core: Unbounded memory allocation in W3C Baggage propagation
          @opentelemetry/core  savunmasız <2.8.0  yamalı >=2.8.0
          Paths: apps__api>@opentelemetry/sdk-trace-base>@opentelemetry/core
                 apps__api>@opentelemetry/sdk-trace-base>@opentelemetry/resources>@opentelemetry/core
```

Kurulu iki kopya ölçüldü: `@opentelemetry+core@2.1.0` (savunmasız, **yalnızca** `sdk-trace-base`
dev yolundan) ve `@opentelemetry+core@2.12.1` (**yamalı**; üretim yolu — `sdk-node`'un çözdüğü
kopya, ölçüldü). ⇒ **Bugün üretimde uzaktan sömürülebilir değil.**

**Senaryo (neden kozmetik değil):** zafiyetin konusu **W3C Baggage ayrıştırması**. G2'de
ölçüldüğü gibi `NodeSDK.start()` `W3CBaggagePropagator`'ı global olarak kuruyor ve Sentry her
gelen istekte `propagation.extract()` çağırıyor ⇒ savunmasız ayrıştırıcı **üretime girdiği an**
kimliği doğrulanmamış bir istemcinin `baggage` başlığıyla sınırsız bellek ayırmaya zorlanabilir
(DoS). `architect`'in yazılı **fail-closed yedeği** tam bunu öngörüyor: *"`spanProcessors: []`
kabul edilmezse `@opentelemetry/sdk-trace-base` **üretim bağımlılığına terfi**"* ⇒ o yedek
devreye girerse savunmasız kopya **üretim yoluna** taşınır.

**Önerilen düzeltme:** katalogda `'@opentelemetry/sdk-trace-base': 2.1.0 → 2.12.1` (üretim
kopyasıyla aynı sürüm). Tek satır; hem zafiyeti kapatır hem iki `@opentelemetry/core` kopyasını
**tekilleştirir**. ⚠ 7 günlük minimum sürüm yaşı kuralı `2.12.1` için `npm view
@opentelemetry/sdk-trace-base@2.12.1 time --json` ile **o sürümün** tarihinden doğrulanmalı.

**Sorumlu ajan:** `devops`.

---

### G4 — [SEV: medium] `SECRET_FIELD_NAMES` zarf-sınırı savunmasının kapsamı CLAUDE.md §4 listesinin ALTINDA

`packages/errors/src/redaction.ts:84-101` (`SECRET_FIELD_NAMES`) ·
`:205-235` (`redactDeep`) · tüketici `observability/sentry.ts:160`

Bu sürüm `redactDeep()`'i *"`AppError.context` ilk kez süreç dışına çıkıyor"* gerekçesiyle
**zarf sınırındaki üçüncü savunma katmanı** ilan ediyor (L-11/:3957). Ama kapalı küme (16 ad)
CLAUDE.md §4'ün *"asla loglanmaz"* listesinin **şu kalemlerini içermiyor**:

```
kart numarası (cardNumber / pan / card_number) · CVV/CVC · TCKN (tckn / nationalId)
tam adres (address) · tam e-posta (email) · yaygın varyantlar:
api_key · client_secret · access_token · refresh_token · jwt · bearer · otp
```

Ek olarak eşleşme **tam ve büyük/küçük harf duyarlı** (`SECRET_FIELD_NAMES.has(key)`,
`:230`) ⇒ `Authorization`, `Password`, `API_KEY`, `Api-Key` gibi anahtarlar **redakte edilmez**.

**Senaryo:** bir `AppError.context`'e (ör. ileride bir ödeme/fatura adaptörünün hata bağlamı,
ya da bir Zod doğrulama hatasının taşıdığı alan) `{ tckn: '…' }` / `{ cvv: '123' }` /
`{ Authorization: 'Bearer …' }` düşerse `redactDeep` onu **olduğu gibi** geçirir ve değer Sentry
zarfıyla süreç dışına çıkar — yani bu sürümün *"kapatıyorum"* dediği sınıfın tam kendisi. Bugün
depodaki `context` nesneleri düz id alanları olduğu için somut sömürü zinciri kurulamıyor ⇒
`high` değil **`medium`** (AGENT_BASELINE §4 *"emin değilsen bir alt seviye"*).

**Önerilen düzeltme:** `SECRET_FIELD_NAMES`'i §4 listesiyle hizala (kart/CVV/TCKN/adres/e-posta
+ yukarıdaki varyantlar) ve `redactDeep`'in anahtar araması öncesinde **normalizasyon** uygula
(`key.toLowerCase()` + `-`/`_` kaldırma) ⇒ `Authorization`/`api_key`/`API-KEY` aynı girdiye
düşer. ⭐ `'value'` ve `'code'` dışlamaları **korunmalı** (yazılı, gerekçeli kararlar) ·
`PINO_REDACT_PATHS` türetmesi otomatik genişler, `AC-63`'ün `.length` tabanlı pini kırılmaz.
⚠ Normalizasyon `PINO_REDACT_PATHS`'in **yol metinlerini** değiştirmemeli (fast-redact yolları
harfe duyarlıdır) — normalizasyon yalnızca `redactDeep`'in arama tarafında.

**Sorumlu ajan:** `backend` (S3 — `packages/errors`).

---

### G5 — [SEV: low] REST ve tRPC hata yollarında redaksiyon ASİMETRİK (teknik borç satırı)

`apps/api/src/errors/error-mapping.ts:86` (`logContext = { …, context: error.context }` — ham) ·
`apps/api/src/errors/app-exception.filter.ts:127` (`logPayload` o ham değeri loglar) ·
karşılaştırma: `packages/trpc/src/trpc.ts:197` (`context: redactDeep(appError.context)`)

Aynı olgu iki yolda farklı korunuyor: tRPC yolu `redactDeep`'ten geçiyor, REST yolu geçmiyor.
pino'nun `redact.paths`'i yalnızca kök seviye + **bir** joker seviye (`*.ad`) kapsıyor ⇒
`context.a.b.token` gibi derinlik-3 bir sır REST yolunda log dosyasına/Loki'ye **ham** yazılır,
tRPC yolunda redakte edilir. Sentry zarfı ayrıca `redactDeep`'ten geçtiği için **süreç dışı
kanal etkilenmiyor**; bu bir **gerileme değil** (REST yolu bu sürümden önce de hamdı) ama yeni
ilan edilen *"üçüncü savunma katmanı"* tutarsız kalıyor.

**Borç satırı:** `[low] apps/api/src/errors/error-mapping.ts:86 — REST hata yolu
`AppError.context`'i `redactDeep` olmadan logluyor; tRPC yolu (T-028/S9) geçiriyor ⇒ derinlik>1
sırlar için asimetrik koruma. Sorumlu: `backend`. Vade önerisi: **v0.18.0** (log toplayıcı/OTLP
exporter geldiğinde log kaydı da süreç dışına çıkar; o sürümde zorunlu olur).`

---

### G6 — [SEV: low] AC-61 DSN taraması yalnızca `*.sentry.io` biçimini görüyor ve CI'da KOŞMUYOR (teknik borç satırı)

`scripts/guards.sh:1559-1575` (alt kontrol 1)

Desen: `[0-9a-f]{32}@[A-Za-z0-9.-]+\.sentry.io/[0-9]+`. Ölçülen boşluklar:

- **Kendi barındırdığımız Sentry** DSN'i (`https://<32hex>@sentry.arkesoft.app/3`) **eşleşmez**;
  `onpremise`/proxy DSN biçimleri de öyle. `*.ingest.*.sentry.io` eşleşir (iyi).
- `sentry.io` içindeki `.` kaçışsız (ERE'de herhangi bir karakter) — zararsız ama gevşek.
- ⚠⚠ **Kapı CI'da yok:** `.github/workflows/` içinde `scripts/guards.sh`'e tek atıf bir
  **yorum satırı** (`ci.yml:576`); CI kendi satır içi adımlarını koşturuyor ⇒ depo **PUBLIC**
  olduğu hâlde DSN ağı yalnızca **yerel** beşli kapıda gerçek. (`architect` bunu dürüstçe
  kaydetmişti; burada bağımsız olarak teyit edildi — `docs`/`release` *"CI'da kapılı"*
  **yazmamalı**.)

Bugünkü durum temiz (ölçüldü): takip edilen dosyalarda `[0-9a-f]{32}@…` deseni **0** eşleşme,
`.env` `.gitignore`'un 7. satırında, diff'teki 40 sır-kelimesi eşleşmesinin **tamamı** alan adı
listesi/test.

**Borç satırı:** `[low] scripts/guards.sh:1565 — AC-61 DSN deseni yalnızca `*.sentry.io`
barındırmasını görüyor (self-hosted DSN kör noktada) ve guards.sh CI'da çağrılmıyor ⇒ public
depoda DSN ağı yalnızca yerel. Sorumlu: `devops`. Vade önerisi: **v0.18.0** (guards CI paritesi
ile birlikte); desen genel `[0-9a-f]{32}@<host>/<digits>` biçimine genişletilsin.`

---

## ÖLÇÜMLER

**`pnpm audit`** (tam koşum, 2026-11-24): **7 zafiyet — 0 critical · 2 high · 4 moderate · 1 low**

| Sev | Paket | Yol | Bu sürüm mü getirdi |
| --- | --- | --- | --- |
| high | `multer` | `apps__api>@nestjs/core>@nestjs/platform-express>multer` | hayır (önceden var) |
| high | `@astrojs/node` | `apps__storefront>@astrojs/node` | hayır |
| moderate | `effect` | `packages__db>@prisma/client>prisma>@prisma/config>effect` | hayır |
| moderate | **`@opentelemetry/core`** | `apps__api>@opentelemetry/sdk-trace-base>…` | ⚠ **EVET → G3** |
| moderate | `minimatch` | `packages__themes__modern>eslint>…` | hayır |
| moderate | `astro` | `packages__themes__modern>astro` | hayır |
| low | `astro` | `apps__storefront>astro` | hayır |

⇒ **critical/high açık YOK**; iki `high` bu değişiklikle ilgisiz, önceden mevcut yollarda.
Bu sürümün eklediği **tek** yeni zafiyet G3 (dev yolu).

**İncelenen dosya sayısı:** 59 değişen/yeni dosyadan **27'si birebir okundu veya diff'i
incelendi** (6 üretim dosyası `apps/api/src/observability/`, `app-exception.filter.ts`,
`error-mapping.ts`, 9 `errors/domain/*`, `redaction.ts`, `app-error.ts`, `trpc.ts`,
`request-context.middleware.ts`, 4 queue dosyası, `api-env.ts`, `eslint.config.mjs`,
`audit-log.writer.ts`, `main.ts`, `main.worker.ts`, `guards.sh`, `pnpm-workspace.yaml`,
`apps/api/package.json`) + 7 `node_modules` üst-akış kaynağı (`sdk-node/sdk.js`,
`sdk-node/utils.js`, `@sentry/node` `sdk/index.js`, `integrations/http/index.js`,
`httpServerIntegration.js`, `@sentry/core` `requestdata.js`, `server-subscription.js`).

**Tenant izolasyon listesi (CLAUDE.md §7, 18 madde) — karşılanmayan madde numaraları:**

- **md 6** (*"girdideki hiçbir `id` doğrudan güvenilmiyor"*) — ⚠ **KARŞILANMIYOR**: gelen
  `traceparent` başlığındaki istemci üretimi kimlik `getCurrentTraceId()` üzerinden log/yanıt
  başlığı/iş payload'ına giriyor (**G2**). Kuyruk tarafı **temiz** (aşağıya bkz.).
- **md 8** (*"dış kaynak tenant'a kapsamlı"*) — ⚠ **KISMEN**: Sentry zarfı platform genelinde
  tek proje (tasarım gereği, `tenant_id` tag'li; kiracının Sentry erişimi yok ⇒ kiracı-kiracı
  okuması yok) **ama** zarf kiracı müşterisinin ham gövdesini üçüncü tarafa taşıyor (**G1**).
- Diğer 16 madde: **N/A (9)** — yeni tablo/kolon/prosedür/önbellek anahtarı/dosya yolu/türetilmiş
  DB nesnesi/`SECURITY DEFINER`/`public` dışı şema/dört sır listesi **hiçbirine dokunulmuyor**
  (ölçüldü: Prisma şeması ve `packages/db/sql/*` dosya değişikliği **0**) — veya **✓ korunuyor
  (7)**: `tenantId` iş payload'ında hâlâ zorunlu (`jobPayloadBaseSchema`), worker tenant bağlamını
  kuruyor, log kayıtlarında `tenantId` var, hata gövdesi tel sözleşmesi değişmedi
  (`logLevel` `error-body.ts`'e **girmiyor** — ölçüldü), prosedür tipleri değişmedi, süper admin
  denetim kaydı yüzeyi değişmedi, `withTenant` kullanımı değişmedi.

**Ölçülen NEGATİFLER (kanıtlı "temiz" sonuçlar — sonraki turda tekrar ölçülmesine gerek yok):**

1. **Sentry teli — başlık/çerez/query/IP kanalları temiz.** `authorization` → `[Filtered]`,
   `cookie` → `[Filtered]`, `api_key=` → `[Filtered]`, `user.ip_address` **yok**
   (`dataCollection.userInfo: false` çalışıyor), `sdkProcessingMetadata` tele **çıkmıyor**
   (ham başlıklar orada duruyor ama serileştirilmiyor), yığın çerçevesi `vars` **yok**.
   ⇒ G1 **yalnızca** `request.data` kanalı.
2. **Kuyruk trace sahteciliği yapısal olarak imkânsız.** `queue.service.ts:198-200`
   `{ ...payload, ...correlation }` ⇒ çağıranın `traceId`'si **üzerine yazılıyor**, parse
   **sonra** koşuyor, `as` yok. `tenantId` hâlâ `z.string().min(1)` zorunlu. Worker
   `payload.traceId`'yi Redis'ten **tekrar parse** ederek okuyor, yeniden üretmiyor ⇒ bir
   kiracının işi başka kiracının izine **bağlanmıyor** (iz bir kiracının isteğinden geliyor).
   ⚠ Tek kusur: o iz G2 nedeniyle istemci tarafından **seçilebiliyor** (aynı bulgu).
3. **`logLevel` devri alarm kör noktası YARATMIYOR.** `apps/api/src/errors/domain/*` taranan
   **9/9** 5xx sınıfı (`500`×4, `503`×5) `logLevel: 'error'` **açıkça** beyan ediyor ⇒
   `httpStatus >= 500` olup `logLevel !== 'error'` olan sınıf **0**; `captureAppError` tetiği
   (`logLevel === 'error'`) hiçbir 5xx'i kaybetmiyor. S9'un raporladığı beş sınıf **düzeltilmiş**.
4. **Tel sözleşmesi sabit.** `logLevel` `packages/errors/src/error-body.ts`'te **0** eşleşme ⇒
   public API yüzeyi hareket etmiyor (patch doğru etki).
5. **`@opentelemetry/api` tek kopya.** `pnpm why` → *"Found 1 version"* (`1.9.1`); kurulu
   `node_modules/.pnpm` girdisi tek; `@sentry+opentelemetry@11.12.0` **aynı** kopyaya bağlı
   ⇒ `A-A28-7` doğrulandı (⚠ aynı zamanda G2'nin çalışma mekanizması).
6. **`better-auth` peer'ı (KISIT 2) yeni davranış açmıyor** — kimlik yolunda `@opentelemetry/api`
   doğrudan import eden `better-auth` kodu yok; paket tek kopya ve OTel'in `TracerProvider`'ı
   hiç kurulmadığı için (ölçüldü) olası bir better-auth telemetrisi **no-op** span üretir.
7. **`x-trace-id` yansıtması başlık enjeksiyonu DEĞİL.** Değer `W3CTraceContextPropagator`'ın
   doğruladığı 32 hex karakterden oluşuyor (CR/LF veya ayırıcı taşımıyor) ⇒ yanıt başlığı
   bölme/XSS yüzeyi yok. ⚠ Tahmin edilemezlik ise G2 nedeniyle **yok** (istemci seçiyor).
8. **Repoda sır yok.** `git ls-files | xargs grep -nE "[0-9a-f]{32}@[A-Za-z0-9.-]+"` → **0**;
   diff'te `password|secret|api[_-]?key|BEGIN .* PRIVATE KEY` → **40** eşleşme, elle incelendi,
   **tamamı** alan adı listesi / test sentinel'i / yorum; gerçek sır değeri **0**.
   `.env` `.gitignore:7`'de; `.env.example`'a yeni anahtar **eklenmemiş** (`guards` K8 PASS).
9. **`packages/errors` bağımlılık yüzeyi sabit:** `dependencies = { zod }` — `redactDeep`
   Sentry'ye bağımlı değil (sorumluluk sınırı korunuyor).
10. **`pnpm guards` → 25/25 PASS** (AC-61 dahil, tek başına koşuldu). ⚠ Ama CI bu script'i
    **çağırmıyor** (G6).
11. **Yeni enstrümantasyonlar ek dışa-akış kanalı açmıyor:** `spanProcessors: []` +
    `logRecordProcessors: []` + `metricReaders: []` ⇒ `TracerProvider` hiç kurulmuyor
    (`sdk.js:217` ölçüldü) ⇒ `arkesoft.tenant.id` attribute'u bugün **hiçbir** span'de dışa
    gitmiyor; `ARKESOFT_SPAN_ATTRIBUTE_KEYS` kapalı kümesi (1 anahtar) PII taşımıyor
    (ULID/UUID, A4).
12. **T-015/T-016 kör noktalarına dokunulmuyor:** `pg_proc.prosecdef`, PUBLIC-dışı `EXECUTE`,
    `pg_trigger`, `pg_rewrite`, `rolconfig` eksenlerinde değişiklik **0** (Prisma şeması ve
    `packages/db/sql/*` dosya değişikliği **0**); dört sır listesine dokunulmuyor (yeni sır
    taşıyan tablo **yok**).
13. **KVKK — fazladan veri toplama yok** (G1 hariç): `audit-log.writer.ts:107` IP'yi 45 karaktere
    **kırpıyor** (saklamayı daraltıyor), yeni kişisel veri alanı **0**, silme talebi akışına
    dokunan değişiklik **0**.
14. **Enjeksiyon yüzeyi yok:** ham SQL değişikliği **0**, kullanıcı girdisi dosya yolu/komut/HTML
    hedefine girmiyor (DOM değişikliği 0 — üç frontend uygulamasında **sıfır** dosya), yeni
    yönlendirme hedefi **0**. SSRF: tek giden hedef operatörün verdiği `SENTRY_DSN` (⚠ `z.url()`
    host kısıtlamıyor — operatör kontrolünde, saldırgan yüzeyi değil).
15. **Oran sınırlama:** yeni uç/prosedür **0** ⇒ yeni oran sınırı gerekmiyor; mevcut
    `AUTH_IP_LIMITS` ↔ `rate-limit.policy.ts` bütçe pini `guards`'ta PASS.

**Ölçüm koşulları (AGENT_BASELINE §4 ders 2):** sakin makine, eşzamanlı turbo komutu
**koşturulmadı** (`pnpm audit`, `pnpm why`, `pnpm guards` **sırayla**, her biri bitince);
Playwright / `pnpm build` / `pnpm test` / `test:isolation` **koşturulmadı** (handoff yasağı).
G1/G2 ölçümleri `node --input-type=commonjs -e` ile **bellek içi**, repoya **dosya yazmadan**,
üretim dosyası **mutasyona uğratılmadan** yapıldı; her ölçüm için **kontrol grubu** alındı
(G2: Sentry'siz koşum; G1: `httpBodies: []` ile iki yönlü mutasyon).
