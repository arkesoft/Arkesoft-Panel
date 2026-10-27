# T-002 · solid gate · Tur 1

Tarih: 2026-10-26
Sürüm: v0.0.4 — NestJS API iskeleti ve tenant context

```
GATE: solid
SONUÇ: PASS
```

**PASS gerekçesi (AGENT_BASELINE §4):** 0 critical · 0 high · **2 medium** · 11 low →
kural gereği PASS (1–2 medium = teknik borca kaydedilir). İki medium da davranış hatası
değil, **genişleme noktası** bulgusudur (DRY + açık/kapalı ilkesi); ikisi de v0.0.6'da
dokunulacak yüzeyde duruyor, bu yüzden borç kaydı önemli.

Bulgu dağılımı: **0 critical / 0 high / 2 medium / 11 low**

---

## BULGULAR

### [SEV: medium] `apps/api/src/errors/error-mapping.ts:123` + `apps/api/src/tenancy/tenant.guard.ts:38` + `apps/api/src/tenancy/tenant-resolver.service.ts:223`

**Üç ayrı dosyada birbirinin kopyası üç `assertNever` yardımcısı** var
(`assertNever`, `assertNeverTenantResolution`, `assertNeverHostResult`); gövdeleri birebir
aynı desen (`throw new Error(<dosya adı> + JSON.stringify(value))`).

Bu **gerçek** tekrardır, yüzeysel benzerlik değil: üçü de aynı sebeple değişir —
(a) fırlatılan tipin `Error` yerine bir `AppError` alt sınıfı olmasına karar verilirse,
(b) mesaj formatı/loglama standardı değişirse, (c) v0.0.17 `logLevel` eklenirse
**üç dosya birlikte** düzenlenmek zorunda. CLAUDE.md §4 `assertNever`'ı platformun
adlandırılmış idiomu olarak sayıyor ("Discriminated union + exhaustive `switch`
(+ `assertNever`) kullan") — yani paylaşılan bir yardımcı bekleniyor. Üçüncü kopya
geldiyse dördüncüsü v0.0.5/v0.0.6'da kesin gelir (`AuthGuard`, tRPC hata eşlemesi).

ST-4 bunu üretim logunda zaten işaretledi ("repoda paylaşılan yardımcı yoktu") — doğru
teşhis, ama borç kaydedilmedi.

**Önerilen düzeltme:** tek bir `assertNever(value: never): never` — yeri iki seçenekten
biri: `apps/api/src/common/assert-never.ts` (bugünün tek tüketicisi `apps/api`) **veya**
`packages/errors` (v0.0.6 `packages/trpc` ve v0.6.x `packages/integrations` da exhaustive
switch yazacak; `@arkesoft/errors` yalnızca `zod`'a bağımlı olduğu için döngü doğmaz ve
bağımlılık yönü korunur). Çağrı yerlerindeki teşhis bilgisi kaybolmasın diye imza
`assertNever(value: never, context: string): never` olabilir.
**Sorumlu ajan:** backend (yer kararı `packages/errors` olacaksa architect teyidi).

### [SEV: medium] `apps/api/src/errors/error-mapping.ts:54-64`

`resolveAppErrorDetails()` tel sözleşmesinin **tek** eşleme noktasında `instanceof`
zinciriyle alt sınıf tanıyor (`ValidationError` → `details.fields`,
`DependencyUnavailableError` → `details.checks`). Açık/kapalı ilkesi ihlali: **tel üstünde
`details` taşıyan her yeni `AppError` alt sınıfı bu merkezi fonksiyonu düzenlemeyi
zorunlu kılıyor.** İlk sürümde zaten iki dal doğdu — bu, listenin büyüyeceğinin kanıtı
(v0.0.14 `ForbiddenError`, v0.6.x `IntegrationError`).

İki ek maliyet:

1. `AppError` `packages/errors`'ta yaşıyor ama "bu hatanın `details`'i nedir" bilgisi
   `apps/api`'de tutuluyor → v0.0.6'da `packages/trpc` aynı eşlemeyi yapmak istediğinde
   ya bu dosyayı kopyalar ya `apps/api`'ye bağımlı olmak ister (bağımlılık yönü ihlali).
   K-A2'nin `AppError`'ı pakete taşıma gerekçesi tam olarak buydu; `details` üretimi
   `apps/api`'de kalarak o gerekçenin yarısını geri alıyor.
2. `isAppError()` bilinçli olarak **yapısal** yedek taşıyor (paket çoğalmasına dayanıklı),
   ama hemen ardındaki `instanceof ValidationError` o dayanıklılığı kullanmıyor —
   iki mekanizma aynı dosyada çelişiyor.

**Önerilen düzeltme:** `details` üretimini verinin sahibine taşı — `AppError`'da
geçersiz kılınabilir bir üye (`protected toPublicDetails(): Record<string, unknown>`
varsayılan `{}`, ya da `readonly publicDetails`); `ValidationError`/`DependencyUnavailableError`
onu doldurur; `mapAppError` yalnızca `toErrorBody(error, requestId, error.publicDetails)`
çağırır ve **kapanır**. AC8 sızdırmazlığı güçlenir (varsayılan `{}` sınıfın kendisinde).
`packages/errors` yüzeyi değiştiği için **v0.0.6 kararı** olarak borca yazılabilir; bu
sürümde davranış doğru.
**Sorumlu ajan:** architect (AppError yüzeyi) + backend (eşleme).

---

### [SEV: low] `apps/api/src/health/health-check.types.ts:17`

`HealthCheck.name` tipi `'database' | 'redis'` — soyutlama **bugünkü iki somut
sağlayıcıyı sayıyor**. Dosyanın kendi yorumu (satır 6-9) "yeni bir kontrol (v0.0.11
`queue`) … `HEALTH_CHECKS` dizisine ADDITIVE eklenir, **çekirdek değişmez**" diyor, ama
bu satır değişmek zorunda; union test yardımcılarına da sızmış
(`__tests__/health-ready.test.ts:37,44,51` → `name: 'database' | 'redis'` parametreleri).
Çekirdekte sağlayıcıya özgü **dallanma yok** (K-A8'in asıl kuralı sağlanıyor), bu yüzden
low.
**Önerilen düzeltme:** `readonly name: string` (yanıt sözlüğü zaten
`Record<string, DependencyCheckStatus>`) veya ad kümesini arayüzün değil **kaydın**
yanında (`health.tokens.ts`) tanımla; dosya yorumunu gerçekle hizala.
**Sorumlu ajan:** backend.

### [SEV: low] `apps/api/src/tenancy/tenant-context.middleware.ts:37,39`

K-A5'in bağlayıcı sözleşmesi "bu middleware **asla fırlatmaz**" (fırlatırsa global filter'a
ulaşmaz ve AC4'ün JSON gövdesi yerine platformun kendi 500'ü üretilir). İki çağrı `try`
bloğunun **dışında**: `getRequestContext()` (satır 37 — bilinçli ve belgeli, programlama
hatası sinyali) ve `isTenantExemptPath(req.url)` (satır 39), ki o da istemci kontrollü
`req.url` üzerinde `new URL(...)` çalıştırıyor (`tenant-exempt-paths.ts:37`) ve
**try/catch'i yok** — oysa aynı API `resolve-host.ts:77-81`'de bilinçli olarak sarılmış.
Tetiklenebilirliği düşük (Node'un HTTP ayrıştırıcısı çoğu bozuk hedefi daha önce reddeder,
`base`'li `new URL` nadiren fırlatır), bu yüzden low — ama "asla fırlatmaz" **mutlak** bir
sözleşme olarak yazılmış.
**Önerilen düzeltme:** `isTenantExemptPath` kendi `new URL`'ini sarsın (fırlatırsa `false`
dönsün → fail-closed, tenant zorunlu) ve `tenant-exempt-paths.test.ts`'e ayrıştırılamayan
girdi vakası eklensin; alternatif olarak satır 39 `try` bloğunun içine alınsın.
**Sorumlu ajan:** backend.

### [SEV: low] `apps/api/src/logging/request-logging.interceptor.ts:62-66`

Yorum "context hiç kurulmamışsa (fallback: `rootLogger`) bile AC9'un 'her kayıtta
requestId' garantisi bozulmaz" diyor; kod ise `requestId: requestContext?.requestId`
yazıyor — o durumda değer `undefined` olur ve pino alanı **kayda hiç koymaz**. Yorum
kodun yaptığının tersini iddia ediyor (yanlış yorum, CLAUDE.md §4 yorum disiplini).
**Önerilen düzeltme:** ya yorumu gerçekle hizala ("context yoksa `requestId` alanı
bulunmaz; bu yol yalnızca middleware hiç koşmadığında görülür") ya da fallback'te
`generateRequestId()` ile bir değer üret (filter'ın `app-exception.filter.ts:42`
deseniyle tutarlı olur).
**Sorumlu ajan:** backend.

### [SEV: low] `packages/errors/src/app-error.ts:89-106`

`isAppError()` `error is AppError` vaat ediyor ama yapısal yedek yalnızca **beş alandan
üçünü** doğruluyor (`code`, `httpStatus`, `userMessageKey`). Tüketici
`apps/api/src/errors/error-mapping.ts:73` daraltmadan sonra `error.isRetryable` ve
`error.context` okuyor; yapısal yoldan geçen bir nesnede ikisi de runtime'da `undefined`
olabilir (tipler `readonly boolean` / `readonly Record<...>` diyor). `httpStatus` da
aralık doğrulaması almıyor, oysa değer doğrudan `httpAdapter.reply(..., mapped.httpStatus)`
ile adaptöre gidiyor. Paket çoğalması senaryosu bugün gerçekçi olmadığı için low.
**Önerilen düzeltme:** şemayı beş alana tamamla (`isRetryable: z.boolean()`,
`context: z.record(z.string(), z.unknown())`, `httpStatus: z.number().int().min(100).max(599)`)
veya predikatı `error is AppErrorLike` (daha dar bir tip) olarak daralt.
**Sorumlu ajan:** backend (ST-3b sahipliği).

### [SEV: low] `apps/api/src/tenancy/tenant-resolver.service.ts:88-90`

Çoklu `x-arkesoft-tenant` başlığı `reason: 'multiple_host_headers'` üretiyor — teşhis adı
"host başlığı" diyor, gerçek sebep "tenant başlığı". R4 telafisi #7'nin tek gözlem kanalı
bu `reason` alanı (middleware onu `warn` ile logluyor); yanlış ad, tarama girişimlerinin
log analizinde yanlış sınıflandırılmasına yol açar. Davranış (ret) doğru. 11 sebeplik liste
architect tarafından **bağlayıcı** verildiği için ajanın mevcut adı yeniden kullanması
kapsam içinde kalma açısından savunulabilir — bu yüzden low, kod hatası değil borç.
**Önerilen düzeltme:** v0.0.5'te 12. sebep olarak `multiple_tenant_headers` eklensin
(`TenantResolutionFailureReason` additive; exhaustive switch'ler derlemede uyarır).
Bugün: `tenant-resolver.service.ts`'teki yoruma "ad mirası" notu düşülsün.
**Sorumlu ajan:** architect (sebep listesi sahibi) → backend.

### [SEV: low] `apps/api/src/request-context/request-context.accessors.ts:70,75`

`getTenantId()` ve `getLogger()` dışa açık ama bu sürümde **hiçbir çağıranı ve hiçbir
testi yok** (grep: yalnızca tanım satırları + yorum referansları). K-A5 bunları okuma
yüzeyinin parçası olarak istedi ve v0.0.5/v0.0.6 tüketecek, bu yüzden "sil" demiyorum —
ama bugün kullanılmayan, test edilmeyen genel yüzey (erken soyutlama sinyali).
`getLogger()`'ın fail-closed davranışı da (K-A5'in açık talebi) test edilmemiş.
**Önerilen düzeltme:** ikisine birer davranış testi ekle (`error-mapping.test.ts`'teki
`runWithTenantState` yardımcısı hazır) veya borca "v0.0.5'te tüketilecek yüzey" olarak
kaydet.
**Sorumlu ajan:** backend.

### [SEV: low] `apps/api/src/index.ts:3`

Yorum "ROADMAP v0.0.1 iskeleti. NestJS uygulaması **v0.0.4'te kurulacak**" diyor — v0.0.4
bu sürüm ve uygulama kuruldu; yorum güncelliğini yitirdi. `PACKAGE_NAME`/`PackageName`
export'ları bu uygulamada hiçbir yerde tüketilmiyor (monorepo iskelet deseni). ST-2 dosyayı
bilinçli olarak değiştirmedi (sahiplik/kapsam disiplini — doğru karar), ama yorum artık
yanlış bilgi veriyor.
**Önerilen düzeltme:** tek satırlık yorum güncellemesi ("uygulama girdi noktası
`src/main.ts`"); export'lar iskelet tutarlılığı için kalabilir.
**Sorumlu ajan:** docs veya backend (tek satır).

### [SEV: low] `apps/api/src/__tests__/resolve-host.test.ts:221,232`

İki assertion davranış değil **test dosyasının kendisini/imzayı** ölçüyor:
`expect(cases.length).toBeGreaterThanOrEqual(25)` (DoD sayacının testleştirilmiş hâli) ve
`expect(resolveHost.length).toBe(2)` (fonksiyon arity'si). İkincisinin yorumu "bu test
derleme-zamanı bir kanıttır" diyor — değil, runtime arity kontrolü; `X-Forwarded-Host`
okunmadığının gerçek kanıtı imzanın kendisi ve lint/typecheck. 35 gerçek vakanın yanında
zararsız gürültü oldukları için low (kapsam boşluğu yaratmıyorlar).
**Önerilen düzeltme:** vaka sayacını kaldır (DoD zaten ölçtü), arity testini kaldır veya
yorumunu düzelt.
**Sorumlu ajan:** backend.

### [SEV: low] `apps/api/src/__tests__/helpers/create-test-app.ts:69-74`

Boş wrapper sınıfa yalnızca `no-extraneous-class`'ı susturmak için `purpose` alanı
eklenmiş; yorum "kuralı atlatmak İÇİN DEĞİL" diyor ama alanın tek işlevi bu (hiçbir yerde
okunmuyor). Meşru ihtiyaç (dinamik test modülü), fakat repo bu sınıf sorunu için **daha
görünür** bir desene zaten sahip: `with-timeout.ts:40`'taki gerekçeli
`eslint-disable-next-line`. Lint'i veri ekleyerek sessizleştirmek, beş yıl sonra "bu alan
neden var?" sorusunu doğurur.
**Önerilen düzeltme:** `purpose` alanını kaldır, sınıfın üstüne Türkçe gerekçeli
`// eslint-disable-next-line @typescript-eslint/no-extraneous-class` koy (veya
`eslint.config.mjs`'in mevcut `*.module.ts` muafiyetine test helper'larını ekleme — bu
dosya ST-2 sahipliğinde olduğu için tercih edilmez).
**Sorumlu ajan:** backend (ST-7 sahipliği).

### [SEV: low] `apps/api/src/logging/arkesoft-nest-logger.ts:49-51`

Nest'in `optionalParams`'ı log kaydına `context` alanı olarak yazılıyor;
`apps/api/src/errors/error-mapping.ts:73` ise `context` alanını **`AppError.context`**
anlamında kullanıyor. Aynı log alanı iki farklı anlam taşıyor → beş yıl sonraki Loki/Grafana
sorgularında (v0.0.17) ayrıştırılması gereken belirsizlik. İkisi de PII taşımıyor, davranış
sorunu yok.
**Önerilen düzeltme:** Nest tarafındaki alanı `nestContext`/`nestParams` olarak adlandır
(tek satır), `context` adını `AppError.context` için ayır.
**Sorumlu ajan:** backend.

### [SEV: low] `apps/api/src/__tests__/log-correlation.test.ts:79-175` + `concurrency.test.ts:74`

`statusCode`/`requestId`/`tenantId` kaydı `'finish'` olayında yazılıyor
(`request-logging.interceptor.ts:37`); log korelasyonu testleri **tek istekli**,
eşzamanlılık testi ise yalnızca **yanıt gövdelerini** doğruluyor. Yani "20 eşzamanlı istekte
log kayıtları doğru isteğe atfedildi" iddiası test edilmiyor. Mekanizma sağlam görünüyor
(`'finish'` `process.nextTick` ile `end()` çağıranın ALS bağlamından yayılır), bu yüzden
low — ama ST-4'ün spesifikasyondan ayrıştığı noktanın tek kanıtsız kalan ayağı bu.
**Önerilen düzeltme:** `concurrency.test.ts`'e bellek stream'i enjekte edip 20 kaydın
`requestId`×`tenantId` çiftlerinin **birebir ayrık ve doğru** olduğunu assert et
(yardımcılar iki dosyada da hazır).
**Sorumlu ajan:** qa/backend (test sahipliği ST-7).

---

## BİLİNÇLİ KARARLARIN DEĞERLENDİRMESİ (bulgu değil — Orkestratörün sorularına yanıt)

| Konu                                                                             | Değerlendirme                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DI disiplini** (`emitDecoratorMetadata` kapalı → her parametre açık `@Inject`) | **TAM UYUM, elle doğrulandı.** DI ile kurulan 11 yapıcının 11'i, toplam 15 enjekte parametrenin 15'i açık `@Inject(TOKEN)` taşıyor: `health.controller.ts:39,40` · `prisma.service.ts:33,34` · `redis.service.ts:26,27` · `database.health-check.ts:20` · `redis.health-check.ts:17` · `arkesoft-nest-logger.ts:17` · `request-logging.interceptor.ts:27` · `request-context.middleware.ts:28` · `app-exception.filter.ts:36,37` · `tenant-context.middleware.ts:29` · `tenant-resolver.service.ts:111,112`. Tek `@Inject`'siz yapıcı `zod-validation.pipe.ts:39` ve o DI'dan **gelmiyor** (çağıran elle `new` ediyor, dosya başında belgeli); 5 domain hatası sınıfının yapıcısı da DI dışı. **Property injection yok** (`@Inject` yalnızca yapıcı parametrelerinde). `useFactory`'lerin hepsi açık `inject:` dizisi taşıyor (`config.module.ts:24-32`, `logging.module.ts:29-33`, `prisma.module.ts:22-29`, `redis.module.ts:40-66`, `health.module.ts:21-28`). `class-as-token` kullanımı tutarlı (`PrismaService`/`RedisService`/`DatabaseHealthCheck`/`RedisHealthCheck`/`TenantResolverService`) |
| **`eslint-disable` (`with-timeout.ts:40`)**                                      | **KABUL EDİLEBİLİR.** Tek satır, kapsamı tek kural, Türkçe gerekçeli, gerekçe doğru (sarmalamak orijinal tipi/stack'i kaybettirir). Not: `promise.then(resolve, reject)` (handler referanslarını doğrudan geçmek) aynı davranışı disable **olmadan** verirdi — küçük bir iyileştirme fırsatı, bulgu olarak yazmıyorum                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **ST-4 (a): filter'da `tryGetRequestContext()?.logger ?? ROOT_LOGGER`**          | **DOĞRU.** Filter platformun son durağı; fail-closed `getLogger()` burada kullanılırsa tek bir context kaybı istemciye **hiç yanıt gitmemesi** demek. `getLogger()` spesifikasyona uygun şekilde fail-closed yazılmış ve mevcut (`accessors.ts:75`) — yalnızca bu dosyada kullanılmamış. Daha iyi bir yol yok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **ST-4 (b): `statusCode` `'finish'` olayında**                                   | **DOĞRU ve adaptör-nötr.** `tap()` gerçek HTTP yazımından önce tamamlanır; `'finish'` hem express hem fastify'ın altındaki `http.ServerResponse` olayı. ALS okuması da güvenli (`process.nextTick` bağlamı devralır). Tek eksik: eşzamanlı atıf testi (yukarıdaki son low)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **ST-6 `hasFailure` nihai `checks` sözlüğünden türetiliyor**                     | **DOĞRU ve daha temiz.** `Object.values(checks).includes('down')` tek doğruluk kaynağı olarak **yanıta giden** sözlüğü kullanıyor → "503 döndüm ama gövdede hepsi up" sapması yapısal olarak imkansız. Kapanış içindeki mutable boolean bundan kötüydü                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **ST-5: `TenantGuard` `pending` dalı ham `Error`**                               | **DOĞRU.** `pending` bir domain durumu değil, **kablolama regresyonu** (middleware o rota için koşmadı); `AppError` hiyerarşisine girmesi onu "beklenen hata" sınıfına sokar ve i18n anahtarı gerektirirdi. Filter onu `INTERNAL_ERROR` 500'e eşliyor (`error-mapping.ts:106`), mesaj yalnızca loga gidiyor → sızıntı yok. **İkinci hata ailesi doğmadı**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **ST-5: `resolve-host.ts`'in kendi `HostResolutionFailureReason`'ı**             | **DRY İHLALİ DEĞİL, saflık için gerekli.** `request-context.types.ts` `pino` ve `@arkesoft/db` import ediyor; onu import etmek saflığı (ve v0.0.8 storefront devri hedefini) kırardı. Üstelik **sapma riski derlemede kapalı**: `tenant-resolver.service.ts:152`'deki atama 8 sebebin 11'lik birleşimin alt kümesi olmasını tip düzeyinde zorluyor. Doğru karar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **ST-5: `tenancy.types.ts`/`tenancy.tokens.ts` oluşturulmadı (9 → 7 dosya)**     | **DOĞRU.** Boş dolaylama katmanı açmamak KISS; Symbol token'a ihtiyaç duymayan sınıflar için `class-as-token` repodaki mevcut örüntü. Tip tekrarı doğmadı (üstteki satır)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **ST-7 `purpose` alanı**                                                         | Meşru ihtiyaç, **seçilen çözüm zayıf** → low bulgu yazıldı (yukarıda)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **`$queryRaw` `apps/api`'de**                                                    | **YALNIZCA** `__tests__/shutdown.test.ts:59` (+`fixtures` yorumları). Gerekçe yorumu (satır 48-54) `pg_stat_activity`'nin platform seviyesi sistem görünümü olduğunu, hiçbir `tenant_id` tablosu hedeflenmediğini ve kullanımın teste özel olduğunu söylüyor → **R-P5 karşılandı, yeterli.** Üretim kodunda 0 satır                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Katman/bağımlılık — bağımsız doğrulama**                                       | `packages/errors/package.json:25-27` → `dependencies` **yalnızca `zod`** (iç paket yok) · `packages/db/package.json:39-44` → `@arkesoft/config` + `@arkesoft/errors` (+ prisma/pg) · `apps/api/package.json:27-39` → `@arkesoft/{config,db,errors}`. **Döngü yok** (errors hiçbir iç paketi, db errors'ı, api her ikisini import ediyor; ters kenar yok). `@prisma/client` importu `apps/api`'de **0** (AC13) — lint üç ayrık blokta yeniden beyan edilmiş (`eslint.config.mjs:115-142`) + `manifest.test.ts:108-127` tarama testi. `packages/db/src/health.ts` iş mantığı içermiyor (sabit `SELECT 1`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **K-A1 adaptör kenarda**                                                         | `express`/`@nestjs/platform-express` **yalnızca `main.ts:16`** ve orada bile **tip olarak** (`import type`, derlemede silinir). `res.status(`/`.json(` gerçek çağrısı `src/` içinde **0** (yalnızca kuralı açıklayan yorumlar). `AppExceptionFilter` `httpAdapter.setHeader()/reply()` kullanıyor (`app-exception.filter.ts:53,58`) ✔                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **`HealthCheck` + provider dizisi (K-A8)**                                       | Çekirdekte sağlayıcıya özgü **dallanma yok**: `health.controller.ts:66-78` yalnızca arayüz üzerinden okuyor, `check.name` **anahtar** olarak kullanılıyor, davranış seçiminde değil. `if (name === 'redis')` 0 satır. Tek pürüz: arayüzdeki ad union'ı (low bulgu)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **R-P3 sıralı paylaşımlı dosyalar**                                              | `app.module.ts:58-60` → `consumer.apply(RequestContextMiddleware, TenantContextMiddleware)` → **K-A5 sırası doğru.** Önceki yazıcıların satırları korunmuş (her ekleme `// T-002/ST-n EKLEMESİ` ile işaretli, yeniden düzenleme izi yok). `health.controller.ts:43-51` ST-2'nin liveness gövdesi (`status`/`service`/`version`/`uptimeSeconds`) **değişmemiş**; readiness ayrı handler olarak eklenmiş. `create-test-app.ts` üç kez additive genişletilmiş, imza kırılmamış                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Tip disiplini**                                                                | `any` **0** (6 eşleşme tamamı yorum metni), `@ts-ignore`/`@ts-expect-error` **0**, `eslint-disable` **1** (yukarıda). `as` kullanımlarının tamamı `as const` ya da Zod `parse`'ından **önce** daraltma amaçlı `as unknown` (`platform-version.ts:33`, `manifest.test.ts:29`, `bootstrap.test.ts:20`, `log-correlation.test.ts:66`) → CLAUDE.md §4 kuralına uygun. Dışa açılan tüm fonksiyonlarda açık dönüş tipi var                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Hata yönetimi**                                                                | Boş `catch {}` **0**; 7 `catch` noktasının tamamı ya logluyor ya sarmalayıp iletiyor ya da (resolve-host) toplam fonksiyonun belgelenmiş "unresolved" dalına çeviriyor. Hata `null`'a çevrilip sessizce yutulan yer yok. **Tek hiyerarşi korunmuş**: 5 domain hatası + `AppError` tabanı; ikinci aile doğmadı (`HttpException` **eşleniyor**, türetilmiyor). Hata kodları SCREAMING_SNAKE_CASE ✔                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **İsimlendirme**                                                                 | Tüm dosyalar kebab-case (`.module/.service/.guard/.middleware/.filter/.pipe` Nest ekleriyle), tip/sınıf PascalCase, sabitler SCREAMING_SNAKE (`MAX_HOST_HEADER_LENGTH`, `SLUG_PATTERN`, `READINESS_CHECK_TIMEOUT_MS`, `QUIT_TIMEOUT_MS`, `ERROR_LOG_THROTTLE_MS`, `TENANT_EXEMPT_PATHS`, `RESERVED_SUBDOMAINS`, `PINO_REDACT_PATHS`), boolean'lar `is`/`has` önekli (`isTenantExemptPath`, `isAppError`, `hasFailure`; `quitSucceeded` önek dışı ama okunur). `data`/`temp`/`handle`/`process` gibi belirsiz ad **yok**. Kod İngilizce, yorumlar Türkçe ✔                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Test kalitesi**                                                                | `skip`/`only`/`todo` **0**. Testler davranış odaklı: negatif/kenar vakalar bol (geçersiz `x-request-id`, hiç dönmeyen promise, soft-delete, production vs development, nested subdomain, dotsuz suffix, Zod ham mesaj sızıntısı). Mock kullanımı ölçülü (`vi.spyOn` yalnızca sorgu sayacı ve `clearTimeout`); gerçek Postgres/Redis kullanılıyor. Fixture temizliği `try/finally`/`afterAll` ile yapılmış ve **`DEMO_SEED`'e satır eklenmemiş** (`tenant-resolver.test.ts:171,196`, `tenant-resolution.test.ts:213,238`, `concurrency.test.ts:66-68` — R-P6 ✔). `concurrency.test.ts:107` **gerçekten `Promise.all`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

---

## ÖLÇÜMLER

- **İncelenen dosya:** 62 (`apps/api/src` 46 kaynak + 16 test/yardımcı/fixture ·
  `packages/errors/src` 4 kaynak + 3 test · `packages/db` değişen 3 dosya ·
  `apps/api/{package.json,tsconfig.json,vitest.config.ts,eslint.config.mjs}` ·
  `packages/errors/package.json`) — ~4.400 satır (yorumlar dahil)
- **`any`:** 0 · **`@ts-ignore`/`@ts-expect-error`:** 0 · **`eslint-disable`:** 1
  (`with-timeout.ts:40`, gerekçeli ve kabul edildi) · **gerekçesiz `as`:** 0
- **Boş `catch`:** 0 · **`console.*`:** 0 · **doğrudan `process.env` (üretim kodu):** 0
- **`@Inject`siz enjekte edilen yapıcı parametresi:** 0 / 15 parametre (11 DI yapıcısı) ·
  **property injection:** 0
- **En büyük fonksiyon:** `resolveHost()` (`resolve-host.ts:109-170`) — **62 satır**
  (yorumlar hariç ~40; 11 erken `return` ile düz akış, iç içe dal yok).
  İkinci: `TenantContextMiddleware.use()` 42 satır ·
  `HealthController.getReadiness()` 27 satır
- **En büyük dosya:** `tenant-resolver.service.ts` 226 satır (yorum oranı ~%45)
- **Kontrol edilen kategoriler (12/12):** tek sorumluluk · katman/paket sınırı ·
  bağımlılık yönü + döngü · soyutlama/sağlayıcı dallanması · DRY · KISS ·
  isimlendirme · tip disiplini · hata yönetimi · test kalitesi · ölü kod · yorum kalitesi
- **Bulgu dağılımı:** 0 critical / 0 high / **2 medium** / 11 low
- **Komut çalıştırılmadı:** bu gate yalnızca `Read`/`Grep`/`Glob` ile statik inceleme yaptı;
  `lint`/`typecheck`/`test` çıktıları **doğrulanmadı** (ST-7 raporundan alıntı yapılmadı) —
  beşli kapının doğrulaması `qa` gate'inin işi
