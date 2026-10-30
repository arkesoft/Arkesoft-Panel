# T-007 — Kod Kalitesi (solid) Gate · Tur 1

- **Tarih:** 2026-10-30
- **Task:** T-007 (ROADMAP v0.0.6 — tRPC sözleşme katmanı)
- **Sürüm etkisi:** minor (platform 0.0.5 → 0.0.6)
- **Ajan:** solid
- **Araç kısıtı:** Bu oturumda `Bash` tool'u **yok** → `pnpm lint/typecheck/test/build`,
  `git diff` ve `rg` **çalıştırılmadı**. Tüm bulgular dosya okuması + `Grep`/`Glob`
  ile statik olarak üretildi. Üretim ajanlarının bildirdiği koşum sayıları
  (552/552, 16/16 vb.) **bağımsız doğrulanmadı**, rapora kanıt olarak alınmadı.

```
GATE: solid
SONUÇ: FAIL
```

---

## BULGULAR

### medium

#### M1 — Güncelliğini yitirmiş, aktif olarak YANLIŞ test yorumları

- **`packages/trpc/src/__tests__/procedures.test.ts:9-37`**, **`:126-129`**, **`:152-154`**
- Dosya başı yorumu (9-37) `appErrorBoundary`'nin `try/catch` deseniyle yazıldığını,
  `next()`'in asla throw etmediğini, AC3'ün **bugün 500 gözlediğini** ve bu dosyanın
  `DURUM: BLOCKED` gerekçesi olduğunu söylüyor. Satır 126-129 ve 152-154 aynı iddiayı
  assert'lerin başında tekrarlıyor: _"GERÇEK, GEVŞETİLMEMİŞ sonuç: … bu assert BUGÜN
  BAŞARISIZ OLUR (gözlenen: data.code === 'INTERNAL_SERVER_ERROR', httpStatus === 500)"_.
  Bunların **hiçbiri artık doğru değil** — `trpc.ts:136-148` düzeltildi
  (`result.ok` okuma deseni), S3/Orkestratör 20/20 yeşil raporladı.
- Dahası, 24-30 arasındaki kod bloğu `toTrpcError(result.error.cause ?? result.error, ctx)`
  önerisini "önerilen düzeltme" olarak sunuyor; bu öneri **bilinçli olarak reddedildi**
  (S3 `isAppError` kontrolü + olduğu gibi yeniden fırlatma desenini seçti, `toTrpcError`
  imzasını darlattı ve "unknown" dalını kaldırdı). Yorum, uygulanan tasarımın tam tersini
  tavsiye ediyor.
- Beş yıl sonra bu dosyayı açan biri (a) testin kırmızı olduğunu, (b) üretim kodunda
  bilinen bir hata olduğunu, (c) terk edilmiş bir düzeltmeyi uygulaması gerektiğini
  sanacak. CLAUDE.md §4 "yorum *neden*i anlatır" standardının ihlali — bu yorum artık
  var olmayan bir _ne_'yi anlatıyor.
- **Önerilen düzeltme:** 9-37 arası bloğu "tRPC v11'in `callRecursive`'i her middleware
  seviyesinde hatayı `{ok:false,error}` dönüş değerine çevirir; bu yüzden
  `appErrorBoundary` `next()`'in **dönüş değerini** okur, `try/catch` kullanmaz
  (T-007/S4 bulgusu)" şeklinde **geçmiş zamanlı ve mevcut tasarımı açıklayan** bir
  gerekçeye indir. Reddedilen öneri kod bloğunu sil (ADR/Task kaydında duruyor).
  126-129 ve 152-154'teki "BUGÜN BAŞARISIZ OLUR" cümlelerini kaldır.
- **Sorumlu ajan:** backend (S4 dosya sahibi)

#### M2 — `errorFormatter`'ın domain-hatası yolu, sahibi olan paketin test süitinde korunmasız

- **`packages/trpc/src/__tests__/procedures.test.ts:110-158`** (AC3 + port totalliği
  testleri) ve **`packages/trpc/src/trpc.ts:64-76`** (`cause` parse başarı dalı)
- `packages/trpc`'nin 20 testinin **hiçbiri** `data.appError`'ın bir **domain**
  hatasının `code`/`message`/`details` değerlerini taşıdığını assert etmiyor:
  - `procedures.test.ts:130-131` ve `:155-156` yalnızca `caught.data?.code` ve
    `caught.data?.httpStatus` okuyor. Bu iki alan `shape.code`/`appError.httpStatus`
    üzerinden `toTrpcError`'un seçtiği tRPC kodundan gelir ve
    **`trpcErrorDataSchema.safeParse(error.cause)` başarısız olsa bile aynı kalır**
    (`trpc.ts:91-95` fallback dalı `shape.data.code`/`shape.data.httpStatus`'u aynen
    taşır). Yani S3'ün bildirdiği risk gerçekleşirse bu iki test **yeşil kalır**.
  - `error-formatter.test.ts` yalnızca **çerçeve** hatası yolunu (bilinmeyen prosedür)
    tetikliyor; o yolda `appError.code` **zaten** `HTTP_EXCEPTION` olmalı → fail-closed
    dalı ile sağlıklı dalı ayırt edemez.
- Sonuç: `TRPCError.cause` sarmalaması (`unstable-core-do-not-import` altındaki
  `UnknownCauseError` + `Object.assign` davranışı) bir `@trpc/server` **minor**
  yükseltmesinde değişirse, her domain hatası tele `code: 'HTTP_EXCEPTION'`,
  `message: 'errors.http.generic'`, `details: {}` olarak çıkar; `packages/trpc test`
  **yeşil kalır**. Sessiz dejenerasyon yalnızca `apps/api/src/__tests__/trpc-http.test.ts:221`
  (gerçek Postgres gerektiren entegrasyon testi) tarafından yakalanır — yani bağımlılığı
  sahiplenen paket, kendi riskini kendi hermetik süitinde ölçmüyor.
- Bu bulgu medium/high sınırında: bugün yanlış davranış **yok**, eksik olan regresyon
  korumasıdır → AGENT_BASELINE §4 "eksik test" = medium.
- **Önerilen düzeltme:** `procedures.test.ts`'e tek bir assert ekle — AC3/port
  testlerinde `caught.data?.appError.code`'un sahte portun fırlattığı
  `HarnessUnauthenticatedError`/`HarnessTenantNotFoundError` kodunu (`UNAUTHENTICATED`
  / `TENANT_NOT_FOUND`) taşıdığını ve `message`'ın i18n anahtarı olduğunu doğrula.
  `harness.ts`'teki sınıflar bu kodları zaten taşıyor; yeni fixture gerekmiyor.
- **Sorumlu ajan:** backend (S4) · doğrulama: qa

#### M3 — `requireTenant`'ın hata dalı hiçbir testte kapsanmıyor; ürettiği hata üretimde erişilemez

- **`packages/trpc/src/trpc.ts:171-177`** · **`apps/api/src/trpc/trpc-errors.port.adapter.ts:25-27`**
  · **`apps/api/src/errors/domain/tenant-context-required.error.ts:23`**
- AC3 testi (`procedures.test.ts:112`) context'i `auth: {kind:'anonymous'}` **ve**
  `tenant: {kind:'absent'}` kuruyor → zincir `requireAuth`'ta kısa devre yapıp
  `HarnessUnauthenticatedError` fırlatıyor. `requireTenant`'ın `throw
ctx.errors.tenantContextRequired()` satırına **hiçbir test ulaşmıyor**
  (`auth: 'authenticated'` + `tenant: 'absent'` kombinasyonu ne `packages/trpc`'de
  ne `apps/api`'de kuruluyor; `harness.ts`'in `HarnessTenantContextRequiredError`'ı da
  bu yüzden hiç örneklenmiyor).
- Aynı dal HTTP yolunda **yapısal olarak erişilemez**: `/trpc/*` tenant-muaf değil,
  `TenantGuard` çözülemeyen kiracıyı 404 ile reddediyor (K2/ADR-0010 madde 5). Yani
  `TenantContextRequiredError` + `TrpcErrorFactoryPort.tenantContextRequired()` bugün
  yalnızca "ileride bir worker" için var olan, **hiç koşmayan ve hiç test edilmeyen**
  bir genellik. ROADMAP'in AC3 lafzı ("`tenantProcedure` tenant yoksa `UNAUTHORIZED`
  döner") fiilen `requireAuth` tarafından karşılanıyor.
- **Önerilen düzeltme (kapsamı büyütmeyen):** `procedures.test.ts`'e
  `createHarness({ auth: {kind:'authenticated',…}, tenant: {kind:'absent'} })` ile tek
  bir test ekle; `data.code === 'UNAUTHORIZED'`, `httpStatus === 401` ve
  `data.appError.code === 'TENANT_CONTEXT_REQUIRED'` assert et. Sınıfı/portu **kaldırma**
  (ADR-0009 madde 4 "sıfır dallanma" kuralı `requireTenant`'ın bir şey fırlatmasını
  gerektiriyor) — yalnızca kapsa.
- **Sorumlu ajan:** backend (S4)

#### M4 — Bir log'un YOKLUĞUNU pinleyen, adı bulgu bildiren test

- **`packages/trpc/src/__tests__/error-formatter.test.ts:125-136`**
- `expect(harness.logger.entries).toEqual([])` bu yolda **hiçbir** log üretilmediğini
  assert ediyor. Üç ayrı problem:
  1. **Değişim kuplajı (ölçülmüş sonucu var):** S3 `errorFormatter`'ın
     `cause`-parse-fail dalına `warn` eklemeyi **bu assert yüzünden** kapatamadı
     (`trpc.ts:78-89` bunu gerekçe olarak yazıyor). Bir üretim iyileştirmesini bloke
     eden test, davranış değil **uygulama detayı** pinliyor.
  2. **Assert kapsamı niyetten geniş:** iddiası "`warn` yok" ama assert'i "hiç log yok".
     Gelecekte eklenecek meşru bir `info`/`debug` (ör. OTel köprüsü, v0.0.17) bu testi
     ilgisiz bir sebeple kırar.
  3. **Test adı davranışı söylemiyor:** `"BULGU (RİSKLER'e taşınır): cause-parse-fail
dalı warn LOGLAMAZ — … ASİMETRİK"` — test adı bir gate bulgusunun metni, test
     edilen davranışın adı değil. Kalıcı test süiti bir tur-içi iletişim kanalı olarak
     kullanılmış.
- **Önerilen düzeltme:** İki seçenekten biri: (a) assert'i niyetle eşitle —
  `expect(harness.logger.entries.filter(e => e.level === 'warn')).toEqual([])` ve adı
  `"cause-parse-fail dalı warn üretmez (ayırt edilebilir gövde ile karşılanıyor)"`
  yap; **ya da** (b) tercih edilen: aynı turda `trpc.ts`'e `warn` ekleyip bu testi
  "warn üretir ve mesajı `trpc.error-formatter.unparsable-cause`'dur" olarak çevir —
  böylece `httpStatusToTrpcCode` ile asimetri de kapanır (M2'nin sessiz dejenerasyon
  riskinin ikinci yarısı). (b) seçilirse S4 + S3 dosyalarının **aynı** alt görevde
  değişmesi gerekir; bu bir test gevşetmesi **değildir** (assert sıkılaşıyor).
- **Sorumlu ajan:** backend (S3 + S4 birlikte) · po (alt görev sınırını birleştirmesi için)

### low

| #   | Konum                                                                                                                                      | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Önerilen düzeltme                                                                                                                                                                                                                                         | Sorumlu                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| L1  | `packages/trpc/src/schemas/trpc-error-data.schema.ts:14-15`                                                                                | **Orkestratör hatasının kalıntısı.** Yorum hâlâ `instanceof` yerine "sınıf-örneği operatörü" paraphrase'ını taşıyor. `trpc.ts:40` düzeltildi, bu dosya atlandı → greplenebilirlik ve okunabilirlik kaybı aynen duruyor.                                                                                                                                                                                                                                                                         | Paraphrase'ı `instanceof` literaliyle değiştir.                                                                                                                                                                                                           | backend (S3)                      |
| L2  | `packages/trpc/src/handler/create-trpc-request-handler.ts:4`                                                                               | Aynı sınıf kalıntı: "Backend uygulamasının `/trpc` denetleyicisi (S5)". 12 paketli monorepo'da "backend uygulaması" hangi paket olduğunu söylemiyor.                                                                                                                                                                                                                                                                                                                                            | `apps/api`'nin `TrpcController`'ı şeklinde literalleştir.                                                                                                                                                                                                 | backend (S3)                      |
| L3  | `packages/trpc/src/context/trpc-context.types.ts:65`                                                                                       | Yorum "**Beş** alan:" diyor, altında **altı** alan listeli (`requestId`, `logger`, `auth`, `tenant`, `ports`, `errors`).                                                                                                                                                                                                                                                                                                                                                                        | "Altı alan".                                                                                                                                                                                                                                              | backend (S3)                      |
| L4  | `packages/trpc/src/trpc.ts:34` + `:90`                                                                                                     | `FALLBACK_REQUEST_ID = 'unknown'` — platform tel alanı olan `requestId` için **varsayılan değer kararı sözleşme katmanında** veriliyor (özel dikkat #2'nin aradığı "karar sızması" biçimi: dallanma değil ama varsayılan değer). Bu sihirli dize tele `requestId: 'unknown'` olarak çıkabilir ve log korelasyonunda sessizce "bilinmiyor" anlamı kazanır.                                                                                                                                       | Sentinel'i `@arkesoft/errors`'un fabrikalarına (`genericTransportErrorBody`) taşı veya `TrpcContext`'i zorunlu kılan bir yol seç; sözleşme katmanı platform alanının anlamına karar vermesin.                                                             | backend (S3) + architect teyidi   |
| L5  | `packages/trpc/src/schemas/trpc-error-data.schema.ts:25`                                                                                   | `code: z.string()` — S1'in ölçtüğü sözlük **kapalı** (21 anahtar) ama şema açık `string`. İstemci `data.code` üzerinde exhaustive dallanamıyor; ayrıca `safeParse` yabancı bir `{code:string,httpStatus:number,appError:{…}}` nesnesini de kabul eder (fail-closed dalın kapsamını daraltır). Gerekçe yorumu yok.                                                                                                                                                                               | `z.enum([...21 anahtar])` veya `z.string()` kalacaksa **neden** kalacağını yaz (ör. "tRPC sözlüğü minor'da büyüyebilir, kapalı liste kırıcı olur").                                                                                                       | backend (S3)                      |
| L6  | `packages/trpc/src/__tests__/harness.ts:32-35` + `:358`                                                                                    | **Ölü export.** `export type { TrpcHandlerOptions }` hiçbir test tarafından import edilmiyor; satır 32-35'teki import yalnızca bu ölü re-export'a hizmet ediyor.                                                                                                                                                                                                                                                                                                                                | İkisini de sil (`TrpcRequestHandler` kalır, o kullanılıyor).                                                                                                                                                                                              | backend (S4)                      |
| L7  | `packages/trpc/src/client/create-trpc-client.ts:56-57`                                                                                     | `const readHeaders = options.headers; return {...withFetch, headers: () => readHeaders()}` — anlamsız sarmalayıcı lambda; `headers: options.headers` (daraltma sonrası) aynı işi yapıyor.                                                                                                                                                                                                                                                                                                       | Sarmalayıcıyı kaldır.                                                                                                                                                                                                                                     | backend (S3)                      |
| L8  | `apps/api/src/trpc/trpc-logger.adapter.ts:21-43`                                                                                           | Üç blok (`info`/`warn`/`error`) **birebir** aynı `if (context === undefined) … else …` gövdesini tekrarlıyor (gerçek tekrar: aynı sebeple değişirler — pino çağrı imzası).                                                                                                                                                                                                                                                                                                                      | `const forward = (level: 'info'                                                                                                                                                                                                                           | 'warn'                            | 'error') => (message, context) => {…}` ile tek gövde. | backend (S5) |
| L9  | `apps/api/src/trpc/trpc.controller.ts:108-109`                                                                                             | Alanların **bildirilen tipi** somut adaptör sınıfları (`TenantReadPortAdapter`, `TrpcErrorsPortAdapter`), oysa controller'ın ihtiyacı yalnızca `TenantReadPort`/`TrpcErrorFactoryPort` soyutlamaları. DI token'ın sınıf referansı olması Nest idiomu (repo emsali tutarlı: `@Inject(PrismaService)`, `@Inject(RedisService)`, `@Inject(RateLimitService)`) → **token seçimi bulgu değil**; bildirilen tip DIP açısından gereksiz daraltma.                                                      | `private readonly tenantRead: TenantReadPort` / `errorsPort: TrpcErrorFactoryPort` (token sınıf referansı kalır).                                                                                                                                         | backend (S5)                      |
| L10 | `apps/api/src/trpc/trpc.controller.ts:116` + `apps/api/src/trpc/trpc-context.factory.ts:91`                                                | `createTrpcContext(ports, errors)` — `errors` de bir porttur ama `ports` nesnesinin dışında, ikinci konumsal parametre olarak geçiyor. Üçüncü bir port eklendiğinde imza yine değişecek.                                                                                                                                                                                                                                                                                                        | Tek seçenek nesnesi: `createTrpcContext({ ports, errors })` veya `errors`'u `TrpcPorts` içine al (ikincisi `@arkesoft/trpc` sözleşme değişikliği → architect kararı).                                                                                     | backend (S5) + architect          |
| L11 | `apps/api/src/trpc/trpc.controller.ts:66-71`                                                                                               | GET/HEAD dışı dal (`content-type` yazma + `JSON.stringify(req.body ?? {})`) v0.0.6'da **hiç koşulmuyor** ve **hiç test edilmiyor** (mutation yok; architect riski 7 bunu açıkça kayda geçmiş). İleriye dönük genellik.                                                                                                                                                                                                                                                                          | Ya bir POST probe testiyle kapsa ya da yorumda "test edilmedi, ilk mutation prosedürünün sahibi kapsar" ifadesini borç tablosuna bağla (bugün yorum yalnızca "ileriye dönük" diyor).                                                                      | backend (S6) / docs (borç satırı) |
| L12 | `apps/api/src/__tests__/trpc-http.test.ts:43-75` + `apps/api/src/__tests__/trpc-cross-tenant.isolation.test.ts:44-75`                      | `createMemoryLogStream` + `parseLogLines` (+ `uniqueSlug`/`uniqueRequestId`) birebir kopyalandı; `createMemoryLogStream` artık repoda **7 dosyada** duruyor. Aynı sebeple değişirler (pino NDJSON çıktı biçimi) → gerçek tekrar, yüzeysel benzerlik değil. Önceki turlarda kabul edilmiş bir konvansiyon olduğu ve S6'nın dosya listesi yeni helper dosyası içermediği için **low**; T-007 kopya sayısını 5→7 çıkardı.                                                                          | `src/__tests__/helpers/log-stream.ts` (mevcut `helpers/` dizini) altına çıkar; po dosya listesine ekler.                                                                                                                                                  | po + backend                      |
| L13 | `packages/errors/src/__tests__/error-body.test.ts:74`                                                                                      | `} as unknown as AppError` — çift tip zorlaması, runtime doğrulaması yok (CLAUDE.md §2). Repo emsali bunu **test-yalnızca framework mock'u** için kabul ediyor (`rate-limit.test.ts`, `auth-guard.test.ts`, `tenant-guard.test.ts`; T-006/solid tur2 kaydı) → bu yüzden low. Fark: burada taklit edilen şey bir çerçeve arayüzü değil **platformun kendi** `AppError`'ı. 62-67 arası yorum senaryoyu açıklıyor ama **zorlamanın kendisinin neden kaçınılmaz olduğunu** yazmıyor.                | Yorumda tek cümle: "`publicDetails` prototipte bir getter olduğundan örnek üzerinden kaldırılamaz; yapısal yedek yolu tetiklemenin tek yolu çift zorlama" + emsale atıf.                                                                                  | backend (S2)                      |
| L14 | `packages/errors/src/__tests__/error-body.test.ts:72-73`                                                                                   | Yorum bozuk/yanlış: "`userMessageKey` hariç diğer AppError alanları (`toErrorBody` yalnızca bunları okur)" — oysa nesne **`userMessageKey`'i içeriyor** ve `toErrorBody` tam olarak onu okuyor (`error-body.ts:76`).                                                                                                                                                                                                                                                                            | "`toErrorBody`'nin okuduğu üç alan (`code`/`userMessageKey` ve şema için `httpStatus`) var; `publicDetails` BİLİNÇLİ olarak yok."                                                                                                                         | backend (S2)                      |
| L15 | `packages/trpc/src/trpc.ts:69,70,72,120,127` · `schemas/trpc-error-data.schema.ts:4,19` · `error-mapping/http-status-to-trpc-code.ts:6,14` | Kod yorumları **`ADR-0010 madde 3.1 … 3.6`** diye atıf yapıyor; ADR-0010 taslağının "madde 3" bölümü **numaralandırılmamış madde imleriyle** yazılmış. ADR yayınlandığında bu dokuz atıf sarkan referansa dönüşür.                                                                                                                                                                                                                                                                              | S7 (docs) ADR-0010 madde 3'ün alt maddelerini **3.1–3.6 olarak numaralandırsın** (kodun varsaydığı sıra: spread yasağı · `message` okunmaz · ortam dallanması yok · çeviri boundary'de · durum↔kod kapalı tablo · tek makine-okunur kod). Kod değişmesin. | docs (S7)                         |
| L16 | `apps/api/src/__tests__/trpc-cross-tenant.isolation.test.ts:166-169`                                                                       | `expect({...trpcBody, requestId: undefined}).toEqual({...probeBody, requestId: undefined})` — satır 152-163 **her iki gövdeyi tam literalle** zaten assert etti; bu üçüncü assert hiçbir yeni bilgi vermiyor (ölü assert). Ayrıca aynı `it()` gövdesi **108 satır** ve dört ayrı iddiayı (durum · gövde eşitliği · gövde/başlık sızdırmazlığı · log) tek blokta topluyor; başarısızlıkta hangi iddianın düştüğü yığın izinden okunur ama fixture'ı paylaşan dört `it()` daha okunabilir olurdu. | Ölü assert'i sil. Bölme isteğe bağlı (fixture maliyeti gerekçeli); bölünürse `beforeAll` seviyesine taşınmalı.                                                                                                                                            | backend (S6)                      |

---

## Altı özel dikkat maddesinin değerlendirmesi

### 1. ADR-0009 "TEK İFADE" resolver kuralı — **UYUMLU**

- `packages/trpc/src/routers/tenant.router.ts:18` →
  `({ ctx }) => ctx.ports.tenantRead.findSummary(ctx.tenant.tenantId)`: `ctx.ports.*`
  üzerinde **tek çağrı**, dallanma/`null` kontrolü/`await`/hesaplama yok.
- `packages/trpc/src/routers/session.router.ts:16` →
  `({ ctx }) => ({ userId: ctx.auth.userId, sessionId: ctx.auth.sessionId })`:
  `ctx` alanlarından **nesne kurulumu**, ADR madde 4'ün ikinci izinli biçimi.
- **Portların totalliği gerçek:** `ports/tenant-read.port.ts:20` imzası
  `Promise<TenantSummary>` (`| null` yok, `?` yok); yokluk kararı
  `apps/api/src/trpc/ports/tenant-read.port.adapter.ts:37-39`'da `TenantNotFoundError`
  fırlatılarak veriliyor. `packages/trpc/src` ağacında `null` yorumu/`?? `varsayılanı
  **yok** — tek istisna L4'teki `FALLBACK_REQUEST_ID` (hata yolu, resolver değil).
- `requireAuth`/`requireTenant` daraltmaları context override ile tip düzeyinde
  taşındığı için resolver'larda `null`/`undefined` kontrolü **yapısal olarak** gerekmiyor.
  Kuralı mümkün kılan mekanizma doğru kurulmuş.

### 2. Port deseni vs "`packages/trpc` iş mantığı yapmaz" — **UYUMLU** (iki küçük sızma, L4/L5)

- **Katman ihlali yok.** `packages/trpc/src` altındaki **gerçek import satırlarının
  tamamı** (62 satır okundu): `zod`, `@trpc/server`, `@trpc/server/adapters/fetch`,
  `@trpc/server/http` (yalnızca test), `@trpc/client`, `@arkesoft/errors` + relatif
  yollar. `@arkesoft/db`, `@prisma/client`, `@arkesoft/api`, `apps/**` → **0**.
  `packages/trpc/package.json:29-34` dependencies tam olarak izin verilen dört paket.
  `eslint.config.mjs:19-65` dört yasağı `no-restricted-imports` ile zorluyor ve
  `restrictedImportsOptions`'ı yeniden beyan ederek flat-config "sonraki blok öncekini
  ezer" tuzağını doğru şekilde kapatıyor.
- **Karar sızması taraması:** şemalarda iş kuralı yok (`.min(1)` vb. yok —
  `tenant-summary.schema.ts:46-52`, `session-identity.schema.ts:18-21`), hata kodu
  **literali** yok (kodlar `error.code`/`error.httpStatus` üzerinden okunuyor,
  `trpc.ts:46-51`), `publicProcedure` erişilebilirlik kararı `apps/api`'nin muafiyet
  kümelerinde. Bulunan iki sızma: L4 (`requestId` varsayılanı) ve L5 (sözlük
  genişliği kararı). İkisi de low.
- **`TenantStatus`'un yerel bildirilmesi → DRY ihlali DEĞİL, gerekçeli tekrar.**
  Kararım: üç bağımsız sebep. (a) **Farklı değişme sebepleri:** Prisma enum'u bir
  _migration_ ile değişir, tel sözlüğü bir _public API semver_ kararıyla değişir;
  birleştirmek bir migration'ın tel sözleşmesini sessizce değiştirmesine izin verirdi —
  "farklı sebeplerle değişecek iki şeyi birleştirmek daha kötüdür" kuralının tam
  örneği. (b) **Bağımlılık yönü:** `packages/trpc` → `@arkesoft/db` CLAUDE.md §3 ve
  ADR-0009 madde 5 tarafından yasak; tarayıcı tüketicisinin grafiğine Prisma tipi
  girmesi istenmiyor. (c) **Sapma mekanik olarak kapatılmış:** `trpc-wire-contract.pin.ts:52-79`
  tip pini + `:89-97` çalışma zamanı pini, ikisi birlikte hem anahtar kümesini hem
  değerleri karşılaştırıyor. Bu, `AUTH_EXEMPT_PATHS` literal-liste + pin idiomunun
  doğru tekrarı. **Bulgu yazılmadı.**

### 3. S5'in DI deseni (sınıf referanslı token) — **BULGU DEĞİL** (yalnızca L9)

Repo konvansiyonunu ölçtüm (`@Inject(` → 30 eşleşme, `*.tokens.ts` → 6 dosya):
Symbol token'lar **sınıf olmayan** sağlayıcılar için ayrılmış (`API_ENV`, `ROOT_LOGGER`,
`PRISMA_CLIENT`, `AUTH_INSTANCE`, `AUTH_SESSION_READER`, `HEALTH_CHECKS`,
`PLATFORM_VERSION`). **Sınıf sağlayıcılar istisnasız sınıf referansıyla** enjekte
ediliyor: `@Inject(PrismaService)` (5 yerde), `@Inject(RedisService)`,
`@Inject(SessionsService)`, `@Inject(RateLimitService)` (3 yerde),
`@Inject(TenantResolverService)`. `@Inject(TenantReadPortAdapter)` bu desene
**tam uyumlu** — `DatabaseHealthCheck` emsali tek örnek değil, kural bu.
`*.tokens.ts` ile tutarsızlık **yok**: o dosyalar farklı bir sağlayıcı sınıfı için var.
Bağımlılık tersine çevirme ihlali de yok — soyutlama (`TenantReadPort`) `packages/trpc`'de
bildirilmiş, `TrpcPorts` üzerinden geçiriliyor; DI token'ı Nest'in çalışma zamanı
gereksinimidir, tasarım bağımlılığı değil. **Tek kalıntı:** controller'ın alan _tipini_
soyutlama değil somut sınıf olarak bildirmesi → L9 (low).

### 4. `warn` asimetrisi ve sessiz dejenerasyon — **GERÇEK RİSK, KORUMA YETERSİZ** (M2 + M4)

- Asimetri **bir tutarsızlık bulgusudur** ama tek başına low: `httpStatusToTrpcCode`
  (`http-status-to-trpc-code.ts:66`) fail-closed dalında `warn` logluyor, `errorFormatter`
  (`trpc.ts:90-97`) loglamıyor. S3'ün gerekçesi (test sahipliği) **süreç olarak doğru**,
  tasarım olarak borç.
- **S3'ün bildirdiği risk gerçek ve bugün korunmasız.** Ölçtüğüm zincir: `cause`
  round-trip bozulursa `appErrorBoundary` (`trpc.ts:143`) **hâlâ** `isAppError(cause)`
  ile çalışır (AppError gerçek bir `Error` → tRPC onu sarmalamaz), dolayısıyla
  `toTrpcError` doğru tRPC kodunu ve HTTP durumunu üretmeye devam eder. Kırılan şey
  yalnızca `errorFormatter`'ın `trpcErrorDataSchema.safeParse(error.cause)` okuması
  (`cause` bir **düz nesne** olduğu için `UnknownCauseError` + `Object.assign`
  davranışına bağlı) → `data.appError` jenerik gövdeye düşer, `data.code` ve
  `data.httpStatus` **doğru kalır**. `packages/trpc`'nin 20 testinden hiçbiri
  `data.appError`'ın domain içeriğini okumadığı için süit **yeşil kalır**. Tek yakalayan
  test `apps/api` entegrasyon testi (gerçek Postgres). → **M2**.
- Yani: sessiz dejenerasyona karşı koruma **yeterli değil**, ve `warn`'ın eksikliği
  ikinci savunma hattını da kapatıyor. M2 + M4 birlikte çözülmeli (M4(b) seçeneği).

### 5. Orkestratör'ün iki hatası — **KALINTI VAR** (L1, L2)

Kapsam: **yalnızca yorum satırları** taranarak (jetonun yorumda geçmesi tek başına
bulgu sayılmadı; aranan şey _okunabilirliği bozan paraphrase_).

- `packages/trpc/src/schemas/trpc-error-data.schema.ts:14-15` → `instanceof` yerine
  "sınıf-örneği operatörü" **kalmış** (L1).
- `packages/trpc/src/handler/create-trpc-request-handler.ts:4` → `apps/api` yerine
  "Backend uygulamasının … denetleyicisi" **kalmış** (L2).
- Düzeltilmiş olduğu doğrulananlar: `trpc.ts:40` `instanceof` literal · `trpc.ts:22` ve
  `client/create-trpc-client.ts:4,9` `httpBatchLink` literal · `trpc.controller.ts:4,19`
  `express` / `TENANT_EXEMPT_PATHS` / `AUTH_EXEMPT_PATHS` literal ·
  `tenant-summary.schema.ts:4-8` `@arkesoft/db` / `@prisma/client` literal.
- **Yorum dili/standardı:** tamamı Türkçe (CLAUDE.md §4 ✓), kod/tip/dosya adları
  İngilizce ✓, kebab-case dosya adları ✓, `TenantStatusWire`/`TrpcContext` PascalCase ✓,
  hata kodları SCREAMING_SNAKE_CASE ✓, boolean yok (dolayısıyla `is`/`has`/`can` ihlali
  yok), `data`/`temp`/`handle`/`process` gibi belirsiz ad **yok** (tek yakın örnek
  `trpc-http.test.ts:245`'teki yerel `handler` değişkeni — bir log alanının adı,
  bağlamda net).
- **Yorum yoğunluğu:** S3'ün dosyalarında yüksek — `trpc.ts` 198 satırın ~90'ı yorum,
  `http-status-to-trpc-code.ts` 68 satırın 23'ü dosya başı yorumu. Ama içerik
  **"neden"** anlatıyor (neden `instanceof` yok, neden spread yasak, neden tablo
  kapalı-dünya, neden batching kapalı) ve bağlayıcı kararların kod yanında durması
  architect riski 5'in açık talebi. **Aşırılık bulgusu yazmıyorum** — tek istisna M1,
  orada sorun uzunluk değil **yanlışlık**.

### 6. S2'nin `error-body.test.ts` değişikliği — **TEST GEVŞETMESİ DEĞİL** (yan bulgular L13, L14)

- Eski assert `expect(body.details).toEqual({ fields: { slug: 'errors.slug.taken' } })`
  **birebir** korunmuş (`:109`); değişen tek şey `details`'in **nereden geldiği**
  (üçüncü parametre → `SampleErrorWithPublicDetails.publicDetails`). Ölçülen davranış
  aynı: "bir hata `{fields:…}` taşıyorsa bu `body.details`'e birebir yansır".
  Gerekçe yorumu PO riski 1'in şart koştuğu gibi dosyaya yazılmış (`:40-47`, `:101-103`).
- **Testin ölçtüğü şey zayıflamadı, güçlendi:** S2 ayrıca iki yeni negatif/fail-closed
  testi ekledi (`:93-99` varsayılan `{}`, `:114-118` `publicDetails` taşımayan yapısal
  nesne → `{}`) ve `httpHeaders` sızdırmazlık testi (`:148-156`) değişmeden duruyor.
  `appErrorShapeSchema` büyütülmemiş (`app-error.ts:148-152`, üç alan).
- **`error-mapping.test.ts`'in hiç değişmemesi yeterli kanıt mı?** Kısmen —
  **yapısal gerekçe daha güçlü:** `resolveAppErrorDetails()` silindi ve `toErrorBody`
  artık `error.publicDetails`'i okuyor; `ValidationError`/`DependencyUnavailableError`
  override'ları (`validation.error.ts:31-33`, `dependency-unavailable.error.ts:31-33`)
  **aynı** `{fields}`/`{checks}` nesnelerini döndürüyor, dolayısıyla
  `mapErrorToResponse` → `toErrorBody` çıktısı literal olarak değişemez. O dosyanın
  `details.fields`/`details.checks` assert'lerinin değişmeden geçmesi bu yapısal
  eşitliğin **gözlemsel teyididir**; tek başına kanıt olsaydı yetersiz olurdu (o dosya
  yalnızca iki alt sınıfı kapsıyor), ama yapı + gözlem birlikte yeterli.
  **Not:** `git diff` çalıştıramadım → "hiç değişmedi" iddiasını bağımsız
  doğrulayamadım, Orkestratör'ün ölçümüne dayanıyorum.
- Yan bulgular: L13 (`as unknown as` gerekçesi eksik), L14 (satır 72-73'teki yorum yanlış).

---

## Diğer denetlenen maddeler

| Kontrol                                        | Sonuç                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`any`**                                      | **0** (kodda). Altı eşleşmenin tamamı `harness.ts`'in Türkçe **yorumlarında** ("`as`/`any` YOK" ifadeleri). Kapsam: `packages/trpc/src/**`, `apps/api/src/trpc/**`, `packages/errors/src/{app-error,error-body,index}.ts`, `apps/api/src/errors/**`, yeni testler.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **`@ts-ignore` / `@ts-expect-error`**          | **0**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **`eslint-disable`**                           | **0**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Gerekçesiz `as`**                            | **1** — `packages/errors/src/__tests__/error-body.test.ts:74` (`as unknown as AppError`, test kapsamı, L13). Üretim kodunda **0**. `as const` (tip zorlaması değil): 1 (`http-status-to-trpc-code.test.ts:34`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **S3'ün `fetch` tip çatışması**                | Çözüm doğru: `create-trpc-client.ts:20,32` tipi `Parameters<typeof httpLink<AppRouter>>[0]`'dan **indeksli erişimle** türetiyor, `as` yok. `harness.ts:188-287` ponyfill'i `unknown` + Zod (`HEADERS_*_SCHEMA`) + `instanceof`/`typeof` daraltmasıyla yazılmış, `as` yok. **Kalıntı yok.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **S6'nın `JSON.parse(x) as unknown`'ları**     | Kaldırılmış — `trpc-http.test.ts:74` ve `trpc-cross-tenant.isolation.test.ts:74` `z.record(...).parse(JSON.parse(line))`; `trpc-http.test.ts:216-219` ve `error-formatter.test.ts:45-46` da Zod ile. ✓                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Ölü kod — `appErrorBoundary`**               | `trpc.ts:136-148` artık `result.ok` okuyor, `try/catch` yok → ölü dal kapandı. Üç dalın hepsi erişilebilir (`ok` · `isAppError(cause)` · `throw result.error`), üçüncüsü `error-formatter.test.ts`'in bilinmeyen-prosedür testiyle kapsanıyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Ölü kod — `toTrpcError` daraltması sonrası** | `toTrpcError` imzası `(appError: AppError, ctx)` → "unknown" dalı kaldırılmış. Kalan import'lar **hepsi kullanımda**: `isAppError` (`:143`), `toErrorBody` (`:47`), `genericTransportErrorBody` (`:94`), `AppError` tip (`:46`), `TRPCError` (`:50`), `trpcErrorDataSchema` (`:64`), `TrpcErrorData` (`:49,91`), `httpStatusToTrpcCode` (`:48`). **Kullanılmayan import yok.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Diğer ölü kod**                              | L6 (`harness.ts` ölü re-export), L11 (koşmayan POST dalı), L16 (ölü assert), M3 (test edilmeyen + HTTP'de erişilemeyen dal). `packages/errors`: `resolveAppErrorDetails` silinmiş ✓. `index.ts` export'larının tümü tüketiliyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Döngüsel bağımlılık**                        | **Yok.** `packages/errors` → yalnızca `zod` (`redaction.ts` hiç import taşımıyor → `.` alt yolu pino'yu **çekmiyor**). `packages/trpc` → `@arkesoft/errors` + `@trpc/*` + `zod`. `apps/api` → `@arkesoft/{db,errors,trpc}`. Ters yön **yok**; `packages/ui` hiçbir `@arkesoft/trpc` bağımlılığı taşımıyor (AC8 ✓). Dosya içi döngü de yok: `trpc.ts` → `schemas/`+`error-mapping/`+`context/`; `routers/` → `trpc.ts`; `handler/` → `routers/`; `server.ts` → hepsi. Tek yön.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **İki export alt yolu**                        | **Gerçekten ayrışmış.** `dist/index.js` (**ölçüldü, 15 satır**) yalnızca üç şema modülü + `client/create-trpc-client.js` import ediyor; `dist/server.js`, `dist/trpc.js`, `dist/routers/*` ve `dist/handler/*` **hiç** çekilmiyor. `dist/client/create-trpc-client.js` yalnızca `@trpc/client`'ı import ediyor — `AppRouter` type-only olduğu için `verbatimModuleSyntax` silmiş. ✓                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Exhaustive switch + `assertNever`**          | `trpc-context.factory.ts:42-59` ve `:64-82` doğru kurulmuş; `assertNever` mevcut kopyadan (`errors/assert-never.ts`) import ediliyor, dördüncü kopya yazılmamış. **Fail-open dal yok:** `auth` → `pending`/`failed` **fırlatıyor**, `tenant` → `pending` fırlatıyor; `exempt`/`unauthenticated` → `anonymous` ve `exempt`/`unresolved`/`failed` → `absent` eşlemeleri "default allow" **değil** (en kısıtlı duruma düşüyorlar, `requireAuth`/`requireTenant` onları reddediyor). Mevcut `RequestContextUnavailableError`'ın yeniden kullanılması doğru karar — yeni bir sınıf icat edilmemiş. ✓                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Tip pinlerinin kırılabilirliği**             | Dördünü de statik olarak izledim. **Pin 1** (`:52-79`): şemaya `'archived'` eklenince `ExtraWireStatuses = 'archived'` → `AssertNoExtraWireStatuses` bir tuple'a dönüşür → `return { noExtra: true }` derlenmez ✓. **Pin 2** (`:104-130`): `planId` eklenince `AssertPlanIdExcludedFromTenantSummary` tuple olur ✓ (S6 bunu ölçerek kanıtladı); `Tenant`'ta olmayan bir alan eklenince `subset` dalı kırılır ✓. **Pin 3** (`:136-164`): `CurrentUserIdentity`'ye `email` eklenip `SessionIdentity`'ye yansıtılmazsa `MissingKeys` tuple olur ✓. **Pin 4** (`:178-182`): adaptörün imzası sapınca `satisfies` kırılır; adaptördeki `implements` bildirimiyle kısmen örtüşüyor ama `implements` kaldırılırsa pin ayakta kalır → gereksiz değil. **Çalışma zamanı pini** (`:89-97`) `boolean` döndürüp `trpc-http.test.ts:259`'da `toBe(true)` ile assert ediliyor — başarısızlıkta mesaj "expected false to be true" olur, hangi değerin saptığını söylemez (iyileştirme önerisi, bulgu yazmadım: pin tasarımı `packages/db` emsalini izliyor). |
| **Test: davranış mı implementasyon mu**        | Çoğunluk **davranış**: `procedures.test.ts` gerçek istemci + gerçek `appRouter` üzerinden tele çıkan değeri okuyor; `error-formatter.test.ts:52-79` anahtar kümesi + ham-metin taraması; `http-status-to-trpc-code.test.ts:47-65` totoloji karşıtı (kendi tablosunu `@trpc/server`'ın **public** `getHTTPStatusCodeFromError`'ı ile karşılaştırıyor — doğru kurulum); `router-output.test-d.ts` beklenen şekli **literal** yazıyor (şemadan türetmiyor) → AC4 Mutasyon A gerçekten kırabilir. **İki istisna:** M4 (log yokluğu pini) ve `error-formatter.test.ts:81-103` (`NODE_ENV` testi — tRPC `isDev`'i `initTRPC.create()` anında yakaladığı için modül yüklendikten sonra `process.env` mutasyonu davranışı **değiştiremez** → test yapısal olarak kırılamaz, totolojik; gerçek garanti "spread yok" ve o `:52-60`'ta zaten ölçülüyor). İkincisini bulgu yazmadım: zararsız ve niyeti belgelenmiş, ama M4 ile aynı sınıf bir "kırılamaz assert".                                                                                        |
| **Mock aşırılığı (`harness.ts`)**              | **Hayır, dengeli.** Sahte olan yalnızca **portlar** (dış dünya sınırı: DB okuması, hata fabrikası, logger) ve `fetch` taşıması. `appRouter`, `router`, `publicProcedure`/`protectedProcedure`/`tenantProcedure`, `errorFormatter`, `appErrorBoundary`, `createTrpcRequestHandler`, `createTrpcClient`, `toErrorBody` — **hepsi gerçek**. `vi.mock`/`vi.spyOn` **hiç kullanılmamış**. Hermetiklik iddiası import listesinden doğrulanabilir: `harness.ts`'in import'ları `zod`, `@arkesoft/errors` + relatif yollar; Redis/Postgres/Prisma yüzeyi **yok**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Yapılandırma tutarlılığı**                   | `packages/trpc/tsconfig.build.json` `packages/errors/tsconfig.build.json`'un **birebir** kopyası (yalnızca yorum farkı) ✓. `vitest.config.ts` aynı iskelet + `typecheck` bloğu ✓. `package.json#scripts` beş script, errors ile birebir aynı sıra/içerik ✓. `exports` iki alt yol, `types`+`default` sırası doğru ✓. `tsconfig.json` `include: ["src/**/*","*.config.ts"]` → `vitest.config.ts` ve `.test-d.ts` kapsamda ✓.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Tek sorumluluk**                             | İhlal bulunmadı. Her dosya tek sebeple değişir: şemalar tel şekli, portlar sözleşme, `trpc.ts` builder+hata çevirisi, `http-status-to-trpc-code.ts` tek tablo, router'lar tek prosedür, handler taşıma, client taşıma. `apps/api` tarafında `trpc.controller.ts` (HTTP↔Web köprüsü), `trpc-context.factory.ts` (ALS→context eşlemesi), iki port adaptörü, logger adaptörü ayrı dosyalarda. `trpc.ts`'in `errorFormatter` + üç middleware + üç builder'ı aynı dosyada tutması tRPC'nin `t` nesnesini paylaşma zorunluluğundan kaynaklanıyor (teknik zorunluluk, ihlal değil).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Hata yönetimi deseni**                       | `catch {}` **yok** · hata `null`'a çevrilmiyor **hiçbir yerde** · beklenen durum için `null` dönülmüyor (portlar total) · sağlayıcıya özgü tip dışarı sızmıyor (`TRPCError` `packages/trpc` dışına çıkmıyor; `apps/api` yalnızca `AppError` üretiyor) · tek hiyerarşi korunmuş (`packages/trpc` hiçbir hata sınıfı **tanımlamıyor**, port üzerinden `apps/api`'den alıyor) · yeni sınıf `TenantContextRequiredError` dört alanı taşıyor ve `publicDetails`'i bilinçli override etmiyor (fail-closed) ✓. **Tek açık:** M3 (o sınıfın yolu test edilmiyor).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Sağlayıcı dallanması**                       | `if (provider === …)` sınıfı dallanma **yok**. `httpStatusToTrpcCode`'un tablosu bir sağlayıcı dallanması değil, protokol eşlemesi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

---

## ÖLÇÜMLER

- **İncelenen dosya:** **46** değişen/yeni dosya tam okundu
  (`packages/trpc/src` 18 + `packages/trpc` yapılandırma 5 + `packages/errors` 4 +
  `apps/api/src/trpc` 6 + `apps/api/src/errors` 4 + `apps/api/src/__tests__` 6 +
  `app.module.ts` 1 + `dist/{index,client/create-trpc-client}.js` 2)
  - **7** referans/emsal dosya (`packages/errors` yapılandırması, muafiyet testleri,
    iki ADR taslağı, Task dosyası).
- **`any` sayısı:** **0** (kodda) · yorumda 6 anlatım.
  `@ts-ignore`/`@ts-expect-error`: **0** · `eslint-disable`: **0** ·
  gerekçesiz `as`: **1** (test kapsamı, L13) · üretim kodunda `as`: **0**.
- **En büyük fonksiyon:** `apps/api/src/__tests__/trpc-cross-tenant.isolation.test.ts:108-216`
  — tek `it()` gövdesi **108 satır** (L16). Üretim kodunda en büyük:
  `packages/trpc/src/trpc.ts:54-98` `errorFormatter` **45 satır** (yorum hariç **~18**);
  `apps/api/src/trpc/trpc-context.factory.ts` en büyük fonksiyonu **19 satır**.
- **Bulgu dağılımı:** critical 0 · high 0 · **medium 4** · low 16.
- **Komut çalıştırılmadı:** `Bash` tool'u bu oturumda yok → `lint`/`typecheck`/`test`/
  `build`/`test:isolation`/`format:check` ve `git diff` **çalıştırılmadı**; üretim
  ajanlarının raporladığı sayılar bulguya dayanak yapılmadı.

---

## SONUÇ gerekçesi (AGENT_BASELINE §4)

**4 medium bulgu** → "3 veya daha fazla `medium` bulgu = **FAIL**". `critical`/`high`
bulgu **yok**: katman ihlali, döngüsel bağımlılık, `any`, yutulan hata, çekirdekte
sağlayıcı dallanması ve davranışı hiç test etmeyen test **bulunamadı**. Mimari
(port deseni, total portlar, tek-ifade resolver'lar, iki export alt yolu, exhaustive
switch'ler, tek hata hiyerarşisi) **sağlam kurulmuş**; dört medium'un tamamı
**test kapsamı ve dokümantasyon doğruluğu** ekseninde ve hiçbiri üretim kodunun
davranışını değiştirmeyi gerektirmiyor (M4(b) tercih edilirse `trpc.ts`'e 1 satır).

**Tur 2 için en kısa yol:** M1 (yorum temizliği) + M2/M3 (`procedures.test.ts`'e iki
assert + bir test) + M4 (assert'i niyetle eşitle **veya** `warn` + test'i birlikte
güncelle) — dördü **tek** alt görevde, tek dosya çifti (`procedures.test.ts` +
`error-formatter.test.ts`, istenirse `trpc.ts`) ile kapanır. L1–L4 ve L15 aynı turda
yorum/atıf düzeltmesi olarak alınabilir.
