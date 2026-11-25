# T-028 — `solid` gate, tur 1

Tarih: 2026-11-24
Sürüm: ROADMAP v0.0.17 · platform minor (0.12.0 → 0.13.0) · `@arkesoft/trpc` patch (0.8.5 → 0.8.6)

```
GATE: solid
SONUÇ: FAIL
```

⚠ **Hiçbir komut koşturulmadı** — `Bash` aracı bilinçli olarak verilmedi (paralel `security`
ajanıyla çakışma önlemi). Tüm ölçümler `Read`/`Grep`/`Glob` ile, `path` her çağrıda açıkça
verilerek yapıldı (AGENT_BASELINE §4, ders 4).

⚠ Bu rapor `prettier --write` ile kapatılamadı (`Bash` yok) — biçimlendirmeyi **Orkestratör**
kapatır (AGENT_BASELINE §5).

---

## BULGULAR

### [SEV: high] `apps/api/src/observability/sentry.ts:155` — Sentry zarfındaki `trace_id`, isteğin `traceId`'sinin İKİNCİ kaynağı; zarf logla korelasyonsuz

**Neden.** `captureAppError` tag'i `getCurrentTraceId()`'yi **yeniden çağırıyor**. Bu sürümde
`TracerProvider` hiç kurulmuyor — bunu dosyanın kendisi yazıyor
(`observability/instrumentation.ts:60-63`: _"aktif span bağlamı hiçbir zaman GEÇERLİ olmaz,
çünkü `TracerProvider` hiç kurulmadı"_). ⇒ `getCurrentTraceId()` her çağrıda **Katman 1 yerel
üretimine** düşer ve **YENİ bir rastgele 32-hex** döner (`trace-id.ts:47-49,61-68`).

Sonuç: aynı istek için `x-trace-id` yanıt başlığı / log kaydındaki `traceId` ile Sentry
zarfının `trace_id` tag'i **farklı** olur. Operatör zarftan loga **hiçbir zaman** geçemez;
daha kötüsü, tag biçimsel olarak geçerli göründüğü için **sessizce yanlış** bir korelasyon
vaat eder.

Depo bu kuralı **üç yerde bağlayıcı** olarak yazmış ve `sentry.ts` üçünü de deliyor:

- `apps/api/src/errors/app-exception.filter.ts:35-39` — _"`getCurrentTraceId()` BURADA YENİDEN
  ÇAĞRILMAZ (S4'ün bağlayıcı şartı: aksi hâlde … başarı ve hata yanıtları FARKLI `traceId`
  taşırdı)"_
- `apps/api/src/request-context/request-context.middleware.ts:29-32` — _"`getCurrentTraceId()`
  BURADA çağrılır ki … iki ayrı çağrı iki farklı yerel-üretim sonucu döndürebilirdi"_
- `apps/api/src/queue/queue.service.ts:38-42` — _"`getCurrentTraceId()` BURADA DOĞRUDAN tekrar
  ÇAĞRILMAZ: aktif bir OTel span YOKKEN her çağrı YENİ bir rastgele kimlik üretir"_

⚠⚠ Doğru değer **çağıranın elinde**: `app-exception.filter.ts:82` ALS'den `traceId`'yi okuyup
`x-trace-id`'ye yazıyor, ama `:138`'de `captureAppError({ error, tenantId, requestId })` ile
**üç korelasyon kimliğinden yalnızca ikisini** geçiriyor.

⚠⚠ **Hiçbir test yakalamıyor** — `__tests__/sentry-invariants.test.ts:374` yalnızca
`expect(typeof tags['trace_id']).toBe('string')` diyor (değer karşılaştırması yok).
`__tests__/app-exception-filter-log-level.test.ts` zarfı **zaten yakalıyor** ve ALS'ye
`EXPECTED_TRACE_ID` yazıyor (`:94,115`) — `tags.trace_id` assert'i eklenirse bu bulgu
**kırmızıya düşer**. Eksik negatif test aynı düzenlemede kapanır.

**Önerilen düzeltme.** `CaptureAppErrorInput`'a `readonly traceId: string` ekle
(`sentry.ts:123-128`); `sentry.ts:155`'i `scope.setTag('trace_id', input.traceId)` yap;
`sentry.ts:62`'deki `getCurrentTraceId` import'unu **kaldır** (yapısal garanti: bu dosya
artık traceId **üretemez**); `app-exception.filter.ts:138`'de `traceId`'yi geçir (değer
`:82`'de zaten hesaplanmış). `app-exception-filter-log-level.test.ts`'e
`expect(tags['trace_id']).toBe(EXPECTED_TRACE_ID)` pini ekle.

**Sorumlu ajan:** `backend`

---

### [SEV: high] `apps/api/src/__tests__/observability-runtime-contract.test.ts:392` ve `:710-711` — boşa çıkan (vacuous) assertion; yorumlar bunun tersini iddia ediyor

**Neden.** Üç assertion **tanım gereği her zaman doğru** (`Array.length >= 0` ve
`count >= 0` asla yanlış olamaz) ⇒ hiçbir mutasyon bu pinleri kıramaz:

```
:392   expect(prismaSpans.length).toBeGreaterThanOrEqual(0)
:710   expect(firstImportSpanCount).toBeGreaterThanOrEqual(0)
:711   expect(preloadSpanCount).toBeGreaterThanOrEqual(0)
```

⚠⚠ Daha ağırı: her iki yerde de **hemen üstündeki yorum kodun yaptığının tersini söylüyor** —
bu, beş yıl sonra bakacak birini "bu pin gerçek" diye yanıltacak en kötü yorum sınıfı:

- `:387-391` — _"`toBeGreaterThan` yerine `toBeGreaterThanOrEqual(0)` **KULLANILMAZ**
  (gevşetme olurdu)"_ … ve `:392` **tam olarak onu kullanıyor**.
- `:706-709` — _"`toBeGreaterThanOrEqual(0)` iki yönlü mutasyonu **YAKALAR** (biri sıfıra
  düşerse pin **KIRILIR**, bu BİLİNÇLİ)"_ … `x >= 0`, `x === 0` iken **doğrudur**; sıfıra
  düşmek pini **kırmaz**.

⭐ Testin **geçerli** yarısı var ve korunmalı: `:385` (`httpSpans.length > 0`) ve `:716`
(`preloadSpanCount > 0`) gerçek boşa-çıkmama kanıtlarıdır. Kusur yalnızca üç tautolojide.

⚠ Bu, K-A28-9'un _"sonuç ne olursa olsun NEEDS_INPUT üretilmez, yalnızca sayı raporlanır"_
kararıyla **çelişmez** — kararın gereği `console.info` ile zaten yerine getiriliyor
(`:371-380`, `:700-704`). Sorun, **raporlama**nın yanına **sahte bir pin** konmuş olması.

**Önerilen düzeltme.** Üç satırı ya **sil** (ölçüm `console.info` ile raporlanmaya devam
eder, yorum "bu sayı pinlenmez, raporlanır" diye düzeltilir) ya da **ölçülmüş gerçek değere**
pinle (ör. Prisma span'i bugün 0 ise `expect(prismaSpans.length).toBe(0)` + K-A28-9'un
"DB halkası v0.18.0 borcu" gerekçesi). ⚠⚠ Her iki durumda da **yanlış yorumlar** (`:387-391`,
`:706-709`) düzeltilmek zorunda — mevcut metin kodun tersini beyan ediyor.

**Sorumlu ajan:** `backend` (dosya sahibi) · teyit `qa`

---

### [SEV: medium] `apps/api/src/errors/error-mapping.ts:86` — aynı veri (`AppError.context`) iki tüketiciden birinde `redactDeep`'ten geçiyor, diğerinde ham

**Neden.** Bu sürüm `redactDeep()`'i _"`AppError.context` için ÜÇÜNCÜ savunma katmanı"_ olarak
kuruyor ve **iki** yolda uyguluyor:

- `apps/api/src/observability/sentry.ts:160` → `context: redactDeep(error.context)`
- `packages/trpc/src/trpc.ts:197` → `context: redactDeep(appError.context)`

Ama **REST log yolu** aynı veriyi **ham** yazıyor: `error-mapping.ts:86`
(`logContext = { code, isRetryable, context: error.context }`) →
`app-exception.filter.ts:127` (`logPayload = { code, ...mapped.logContext }`) →
`logger.<seviye>(logPayload)`. Bu yolda `redactDeep` **hiç geçmiyor** (ölçüldü: `redactDeep`
`apps/api/src/errors/` altında 0 eşleşme).

⚠ Pratik fark ölçülebilir: pino'nun `redact.paths`'i yalnızca kök ve **tek seviye** joker
taşıyor (`redaction.ts:108-115` — altı ad için `*.ad`) ⇒ `logContext.context` altındaki
**derinlik ≥ 2** bir sır (`context.user.password`) REST yolunda maskelenmez, tRPC yolunda
maskelenir. L-11 borcunun (`:3957`) kapatıldığı iddia edilen yüzey **yarım** kalmış.

⚠ Bu bir **tasarım kararı değil, sessiz bir eksiklik**: `error-mapping.ts` ve
`app-exception.filter.ts`'in hiçbir yorumunda bu yolun neden redakte edilmediği yazılı değil
(ikisini de baştan sona okudum). Beş yıl sonra bakan biri hangi yolun doğru olduğunu
söyleyemez.

**Önerilen düzeltme.** İki seçenekten **biri**, ama açıkça: (a) `mapAppError`'ın
`logContext`'inde de `redactDeep(error.context)` kullan (tRPC yoluyla simetri; `logAppError`
ile aynı tek satır) — tercih edilen; ya da (b) neden gerekmediğini `error-mapping.ts`'e
**yaz** (pino `redact.paths`'in derinlik sınırını da kabul ederek) ve borcu yeniden
tarihlendir. Seçenek (a) için `app-error-boundary-redaction.test.ts`'in **birebir ikizi** bir
test REST yoluna eklenebilir (mevcut `app-exception-filter-log-level.test.ts` dikişi hazır).

**Sorumlu ajan:** `backend` · ⚠ `security` bu bulguyu kendi ekseninde daha yüksek görebilir
(zarf dışına çıkan veri), çakışma değil **aynı kök neden**.

---

### [SEV: medium] `apps/api/src/__tests__/observability-shutdown-order.test.ts:50` — kapanış sırası pini `Promise.all` mutasyonunu YAKALAMAZ

**Neden.** `callOrder` yalnızca **çağrı başlangıç** sırasını kaydediyor. Üretim kodu
`observability-shutdown.service.ts:60-64`'teki sıralı `await`'ler yerine
`await Promise.all([shutdownObservability(), shutdownSentry()])` olarak değiştirilse
`callOrder` **hâlâ** `['otel', 'sentry']` olur ⇒ test **yeşil kalır**, oysa K-A28-3'ün
bağlayıcı garantisi (_"OTel kapanışı **tamamlanmadan** Sentry flush'ı başlamaz"_) **kırılmış**
olur. Aynı şey `void shutdownObservability(); await shutdownSentry()` mutasyonu için de
geçerli.

⭐ Bu, deponun _"ardışık yeşil, yokluğu kanıtlamaz"_ dersinin (AGENT_BASELINE §4, ders 1) test
tasarımındaki karşılığı: pin **tamamlanma** eksenini hiç ölçmüyor.

**Önerilen düzeltme.** OTel mock'unu **ertelenmiş (deferred)** bir promise ile kur; çözülmeden
**önce** `expect(shutdownSentry).not.toHaveBeenCalled()` assert'i koy, sonra çöz ve sırayı
doğrula. Böylece `Promise.all` mutasyonu **kırmızıya** düşer.

**Sorumlu ajan:** `backend`

---

### [SEV: low] `packages/trpc/src/trpc.ts:150-159` ve `:318` — güncelliğini yitirmiş yorum: "beş sınıf `warn`'a düşer" iddiası artık YANLIŞ

**Neden.** `:150-159` şunu yazıyor: `httpStatus: 500` taşıyan ama `logLevel` beyan etmeyen
**beş** sınıf (`JOB_HANDLER_NOT_REGISTERED`, `JOB_IDENTIFIER_MISSING`,
`JOB_TYPE_NOT_REGISTERED`, `REQUEST_CONTEXT_UNAVAILABLE`, `TENANT_RESOLUTION_FAILED`)
_"ESKİ eşlemede `error` yazardı, YENİ eşlemede `warn` yazar … düzeltme gerekiyorsa
`po`/`architect`'in kararı"_ — yani **açık bir davranış gerilemesi** gibi okunuyor.

Ölçüldü: **beşi de** `logLevel: 'error'` beyan ediyor ⇒ gerileme **yok**, yorum **bayat**:

```
errors/domain/job-handler-not-registered.error.ts:52      logLevel: 'error'
errors/domain/job-identifier-missing.error.ts:37          logLevel: 'error'
errors/domain/job-type-not-registered.error.ts:39         logLevel: 'error'
errors/domain/request-context-unavailable.error.ts:29     logLevel: 'error'
errors/domain/tenant-resolution-failed.error.ts:32        logLevel: 'error'
```

Ayrıca `:318` hâlâ _"(4xx → `warn`, 5xx → `error`)"_ diyor — bu, bu sürümde **silinen** ikinci
kaynağın (`SERVER_ERROR_STATUS_THRESHOLD`) tarifi; artık seviye `appError.logLevel`'dan
geliyor.

**Önerilen düzeltme.** `:150-159`'u "beş sınıf aynı turda `logLevel: 'error'` beyan etti,
davranış **değişmedi**" olarak güncelle (açık karar bırakma ifadesini kaldır); `:318`'deki
`4xx → warn, 5xx → error` parantezini `appError.logLevel` atfıyla değiştir.
⭐ `high`/`medium` düzeltmesi `trpc.ts`'e dokunursa **yolu üstündeyse kapat** (AGENT_BASELINE §4).

**Sorumlu ajan:** `backend` · vade: bu tur (yolu üstünde) · aksi hâlde ROADMAP teknik borç

---

### [SEV: low] `apps/api/src/observability/trace-attributes.ts:39-45` — yorum var olmayan bir mekanizmayı beyan ediyor

**Neden.** `ARKESOFT_SPAN_ATTRIBUTE_KEYS`'in dokümanı _"`security`/`qa`'nın derinlemesine
taraması (AC-55/L-12, S9) **bu diziyi GEZEREK** her anahtarın değerinin PII taşımadığını
doğrular"_ diyor. Ölçüldü (`*.ts` geneli): `ARKESOFT_SPAN_ATTRIBUTE_KEYS` ve
`ARKESOFT_TENANT_ID_ATTRIBUTE` için **yalnızca tanım satırları** eşleşiyor — ne üretimde ne
testte **tek** tüketici var. Diziyi gezen bir test **yok**.

⭐ Dosyanın **tüketicisiz olması** bulgu DEĞİL — bu bilinçli ve `:9-19`'da gerekçeli
(_"dikişi kur, yüzeyi ertele"_, v0.18.0, kullanıcı onaylı). Bulgu yalnızca **yorumun**
olmayan bir doğrulamayı var gibi beyan etmesi.

**Önerilen düzeltme.** Cümleyi gelecek kipine çevir ("bir exporter eklendiğinde (v0.18.0) bu
diziyi gezen tarama **yazılacak**") ya da diziyi gezen küçük pini **şimdi** ekle (`arkesoft.*`
öneki + yasaklı ad listesi kontrolü — ağ/exporter gerektirmez).
⚠ `qa`'ya not: AC-55'in "mekanik derinlemesine tarama" iddiası bu dizi üzerinden
**karşılanmıyor**; AC doğrulaması `qa`'nın işi, burada yalnızca yorum/gerçek sapması
raporlanıyor.

**Sorumlu ajan:** `docs` (yorum) veya `backend` (pin) · vade: v0.18.0

---

### [SEV: low] `packages/errors/src/redaction.ts:205-210,219-222` — `redactDeep` özyineleme iç durumunu public imzada taşıyor; paylaşılan `seen` DAG'ı hatalı `[circular]` yazıyor

**Neden — iki ayrı küçük kusur, aynı düzenlemede kapanır.**

1. **İmza sızıntısı:** `redactDeep(value, maxDepth, depth, seen)` — son iki parametre
   **özyineleme iç durumu** ama **dışa açık**. Dışa açılan bir fonksiyonun sözleşmesi
   çağıranın bilmemesi gereken durumu taşımamalı; çağıran `seen`'i önceden doldurarak veya
   `depth` vererek davranışı değiştirebilir.
2. **DAG → yanlış `[circular]`:** `seen` kardeş dallar **arasında paylaşılıyor** ve çıkışta
   **kaldırılmıyor** (`:222` `seen.add(value)`, `delete` yok). ⇒ devirli **olmayan** ama
   tekrar eden bir referans (ör. `{ a: tenant, b: tenant }` — aynı nesne iki alanda) ikinci
   kez görüldüğünde `'[circular]'` yazılır ve **teşhis verisi kaybolur**.
   ⭐ Yön **fail-closed** (sır sızmaz, fazla maskelenir) — bu yüzden `low`, `medium` değil.
   Mevcut test (`__tests__/redaction.test.ts:388-397`) yalnızca **gerçek** devirli durumu
   ölçüyor; DAG vakası için negatif test **yok**.

**Önerilen düzeltme.** Özyinelemeyi dosya-yerel bir yardımcıya (`redactDeepInternal`) taşı;
public imzayı `redactDeep(value: unknown, maxDepth?: number): unknown` olarak daralt. `seen`
için mark/unmark uygula (alt ağaç bitince `seen.delete(value)`) ⇒ yalnızca **gerçek** devir
`[circular]` olur. `redaction.test.ts`'e DAG vakası için bir test ekle (aynı nesne iki alanda
→ **iki** alan da redakte edilmiş hâliyle görünür, `[circular]` **yok**).

**Sorumlu ajan:** `backend` · vade: ROADMAP teknik borç (v0.18.0)

---

## Denetlenen ve TEMİZ bulunan eksenler

| Eksen | Sonuç | Kanıt |
| --- | --- | --- |
| **Tek doğruluk kaynağı (1/3)** `SECRET_FIELD_NAMES` | ⭐ **GERÇEK** | `redaction.ts:84-101` kapalı küme (16 ad); `PINO_REDACT_PATHS` (`:152-159`) üç parçadan **türetiliyor**, elle liste yok. Tek tüketici `logging/root-logger.ts:50`. Gizli ikinci sır-ad listesi **yok** (`*.ts` geneli tarandı) |
| **Tek doğruluk kaynağı (2/3)** `AppErrorLogLevel` | ⭐ **GERÇEK** | `app-error.ts:71` dört seviye; `:176` `options.logLevel ?? 'warn'`. `isRetryable`'dan türetme **yok** (bağımsız eksen, `:35-39` gerekçeli). `packages/errors`'ta `code → logLevel` defteri **açılmamış** |
| **Tek doğruluk kaynağı (3/3)** `appError.logLevel` | ⭐ **GERÇEK** | `trpc.ts:200` `writeAtLevel(ctx.logger, appError.logLevel, …)`; `SERVER_ERROR_STATUS_THRESHOLD` **silinmiş** (0 eşleşme). `error-mapping.ts:89` `const logLevel = error.logLevel` — kopyalamıyor. `httpStatus`'tan seviye türeten **kalıntı dal yok** |
| **Katman ihlali** | **0** | `packages/errors/package.json:25-27` tek üretim bağımlılığı `zod` — iç paket bağımlılığı **yok**. `packages/trpc` iş mantığı taşımıyor (log dalı + tip çevirisi). `observability/*` domain bilgisi taşımıyor (`captureAppError` `error.code`/`httpStatus`/`context`'i jenerik okur) |
| **Döngüsel bağımlılık** | **0** | `observability/*` → `errors/*` yönünde **hiç** import yok; ters yön var (`app-exception.filter.ts:55-56`). `trace-id.ts` yalnızca `@opentelemetry/api` + `node:crypto` |
| **Sağlayıcı soyutlaması** | ⭐ **yapısal** | `if (provider === …)` **yok**. `@sentry/node` tek dosyadan import ediliyor ve `eslint.config.mjs:207-222` + **altı ayrık blok** (`:361,379,397,417,445,…`) bunu `no-restricted-imports` ile zorluyor — test dosyaları **dahil** (`:430-434`). K-A28-2 gerçek |
| **`any` / `@ts-ignore`** | **0** | Üretim kodunda 0. `as unknown as` yalnızca test sahtelerinde (deponun yerleşik deseni). Yeni üretim `as`: 2 yapısal daraltma (`instrumentation.ts:92` `globalThis`, `redaction.ts:229` `typeof`-korumalı) — kabul |
| **Hata yönetimi deseni** | **temiz** | `catch {}` **yok**; `null`'a çevirme **yok**. Dört seviyeli dağıtım exhaustive `switch` + `assertNever` (`app-exception.filter.ts:129-152`, `trpc.ts:97-112`) |
| **`traceparent` reddi (K-A28-1)** | ⭐ **çalışma zamanında doğrulanmış** | `trace-id.ts` gelen başlığı okumuyor; `instrumentation.ts:141` `disableIncomingRequestInstrumentation: true` ile `propagation.extract()` kanalı da kapatılmış (`:113-140` empirik kök neden kayıtlı) |
| **Kuyruk `traceId` yayılımı** | ⭐ **doğru desen** | `queue.service.ts:78-82` ALS'yi **önce** okuyor, `getCurrentTraceId()` yalnızca geri düşme; `job-payload.base.ts:46-49` opsiyonel + biçim regex'i (expand/contract) |
| **Gerçek tekrar (DRY)** | **0 yeni** | `assertNever`'ın `packages/trpc:67` yerel kopyası **gerekçeli** (bağımlılık yönü, `:62-66`) — yüzeysel benzerlik, tekrar değil |
| **İsimlendirme (§4)** | **uyumlu** | Dosyalar kebab-case; tipler PascalCase; sabitler SCREAMING_SNAKE_CASE (`SENTRY_FLUSH_TIMEOUT_MS`, `ARKESOFT_TENANT_ID_ATTRIBUTE`); hata kodları SCREAMING_SNAKE_CASE; dışa açılan her fonksiyonun dönüş tipi **açık** (`getCurrentTraceId(): string`, `startSentry(…): void`, `shutdownSentry(): Promise<void>`, `createArkesoftInstrumentations(): readonly [...]`) |
| **Ölü kod** | **1, gerekçeli** | `trace-attributes.ts` tüketicisiz — kullanıcı onaylı erteleme (yorum kusuru ayrıca `low` olarak yazıldı). Başka gerekçesiz ölü kod **yok** |
| **Test kalitesi (olumlu)** | ⭐ | `app-exception-filter-log-level.test.ts` dört seviyeyi **ve** üç negatifi ölçüyor (`:243-246`); `app-error-boundary-redaction.test.ts:101-108` pozitif kontrol + "sentinel tam bir kez" boşa-çıkmama pini; `redaction.test.ts:315-327` AC-63 pini **sabit sayı yazmadan** `.length` üzerinden (R-PO1'in dersi uygulanmış) |

---

## ⚠ Kapsam dışı bırakılan gözlem (bulgu DEĞİL)

`scripts/redact-test-log.ts:140` elle yazılmış bir sır-ad listesi taşıyor
(`/"(cookie|authorization|set-cookie)"…/`). **Bulgu olarak yazılmadı**, iki gerekçeyle:
(1) dosya bu Task'ın değişen yüzeyinde **değil** (handoff'un listesinde yok, `Bash` olmadığı
için `git diff` ile teyit edemedim — Orkestratör doğrulayabilir); (2) amacı **farklı** — bir
**metin akışını** regex'le maskeliyor, `SECRET_FIELD_NAMES` ise **nesne anahtarı** eşliyor.
Farklı sebeplerle değişecek iki şeyi birleştirmek daha kötü bir tasarım olurdu.

---

## ÖLÇÜMLER

- **İncelenen dosya:** 22 (13 üretim + 9 test/yapılandırma)
- **Üretim kodunda `any`:** **0** · `@ts-ignore`/`@ts-expect-error`: **0** · gerekçesiz `as`: **0**
  (iki yapısal daraltma kabul edildi: `instrumentation.ts:92`, `redaction.ts:229`)
- **En büyük fonksiyon:** üretim → `AppExceptionFilter.catch` **40 satır**
  (`app-exception.filter.ts:72-111`); test → `(a)` geri çağrısı **94 satır**
  (`observability-runtime-contract.test.ts:313-406`)
- **Katman ihlali:** 0 · **döngüsel bağımlılık:** 0 · **çekirdekte sağlayıcı dallanması:** 0
- **Boşa çıkan (vacuous) assertion:** **3** (tek dosyada: `:392`, `:710`, `:711`)
- **Kodun tersini beyan eden yorum:** **2 blok** (`:387-391`, `:706-709`)
- **Bulgu dağılımı:** high **2** · medium **2** · low **3** → FAIL (AGENT_BASELINE §4: ≥1 high)
- **Komut koşturulmadı** (`Bash` aracı yok — bilinçli, paralel `security` ile çakışma önlemi)

## FAIL gerekçesi (kural, karar değil)

AGENT_BASELINE §4: _"En az bir `critical` **veya** `high` bulgu → **FAIL**"_. İki `high` var.
İki `medium` tek başına PASS'tı (eşik 3), `low`'lar tur açmaz.

**Düzeltme turu açan:** high-1, high-2, medium-1, medium-2 (4 bulgu, hepsi `backend`).
**Teknik borca giden:** üç `low` — ⚠ `low-1` (`trpc.ts`) ve `low-2` düzeltme turunda aynı
dosyaya dokunuluyorsa _"yolu üstündeyse kapat"_ istisnasına girer.
