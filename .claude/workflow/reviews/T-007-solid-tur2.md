# T-007 — Kod Kalitesi (solid) Gate · Tur 2

- **Tarih:** 2026-10-30
- **Task:** T-007 (ROADMAP v0.0.6 — tRPC sözleşme katmanı)
- **Sürüm etkisi:** minor (platform 0.0.5 → 0.0.6)
- **Ajan:** solid
- **Kapsam:** yalnızca tur 1'in dört medium'u + düzeltmenin getirdiği yeni kusurlar.
  Tur 1'de PASS verilen alanlar (port deseni, bağımlılık yönü, döngü taraması, iki
  export alt yolu, exhaustive switch'ler, tip pinleri) **yeniden taranmadı**.
- **Araç kısıtı:** bu oturumda da `Bash` tool'u **yok** → `pnpm lint/typecheck/test/
build/test:isolation/format:check` ve `git diff` **çalıştırılmadı**. Orkestratör'ün
  kök ölçümü (561/561 vb.) rapora **kanıt olarak alınmadı**; tüm bulgular dosya
  okuması + `Grep` ile statik olarak üretildi.

```
GATE: solid
SONUÇ: PASS
```

---

## 1. Tur 1 medium'larının kapanma kararı

### M1 — bayat/yanlış test yorumları → **KAPANDI**

- `packages/trpc/src/__tests__/procedures.test.ts:9-16` artık geçmiş zamanlı, **doğru**
  bir gerekçe taşıyor ("`next()` ASLA throw ETMEZ → `result.ok` deseni"). Reddedilen
  `cause ?? error` öneri bloğu **yok**. `:107-112` ve `:135-138` artık "BUGÜN BAŞARISIZ
  OLUR" değil, **assert'in ne ölçtüğünü** anlatıyor.
- `error-formatter.test.ts:10-19` aynı desende düzeltilmiş (handoff'ta bildirilen,
  M1'in satır aralığı dışındaki ek düzeltme) — bu doğru karardı, aynı sınıf hata aynı
  turda kapandı.
- Doğrulama (kapsam: `packages/trpc/src/**`, kod + yorum):
  `BUGÜN BAŞARISIZ|DURUM: BLOCKED|cause \?\?` → **0 eşleşme**. Kalan iki
  `GEVŞETİLMEMİŞ` eşleşmesi (`error-formatter.test.ts:27`, `procedures.test.ts:16`)
  meşru — assert sıkılığını anlatıyorlar, bulgu metni değil.

### M2 — `errorFormatter`'ın domain yolu korumasız → **KAPANDI**

- `procedures.test.ts:112` → `caught.data?.appError.code` = `'UNAUTHENTICATED'`;
  `:138` → `'TENANT_NOT_FOUND'`.
- **Öngördüğüm senaryo artık yakalanıyor (denetledim):** `cause` round-trip'i bozulursa
  (`@trpc/server`'ın `UnknownCauseError` + `Object.assign` davranışı değişirse)
  `trpc.ts:94-98` fallback dalı devreye girer; `data.code`/`data.httpStatus` **doğru
  kalır** (tur 1'de bu yüzden yeşil kalıyordu) ama `data.appError.code`
  `genericTransportErrorBody`'nin `HTTP_EXCEPTION`'ına döner → **iki yeni assert de
  kırılır**. Üçüncü hat: `error-formatter.test.ts:123` `HTTP_EXCEPTION`'ın ayırt
  edilebilirliğini pinliyor. Sessiz dejenerasyon artık `packages/trpc`'nin **hermetik**
  süitinde yakalanıyor; `apps/api`'nin Postgres'li testine bağımlılık kalktı.
- Önerdiğim ikinci assert (`message`'ın i18n anahtarı olması) eklenmemiş — **gerek de
  yok**: `code` ve `message` aynı `appError` nesnesinden geliyor, biri dejenere olurken
  diğeri sağlam kalamaz. Kapanmış sayıyorum.

### M3 — `requireTenant`'ın hata dalı test edilmiyor → **KAPANDI**

- `procedures.test.ts:142-172`: `auth: authenticated` + `tenant: absent` → `requireAuth`
  kısa devre **yapmıyor**, zincir `trpc.ts:179`'a ulaşıyor;
  `data.code === 'UNAUTHORIZED'` + `httpStatus === 401` + `appError.code ===
'TENANT_CONTEXT_REQUIRED'` assert ediliyor. `harness.ts:108-116`'nın
  `HarnessTenantContextRequiredError`'ı artık **örnekleniyor** (tur 1'de hiç
  örneklenmiyordu).
- Sınıf ve port **kaldırılmamış** → ADR-0009 madde 4'ün "tek ifade / sıfır dallanma"
  kuralı korunuyor. Doğru karar.
- `:163-168`'deki yorum, dalın HTTP'de erişilemez olduğunu ve korumanın **neden** tam
  burada kurulduğunu yazıyor — tur 1'in M3 gerekçesiyle tutarlı.

### M4 — bir log'un YOKLUĞUNU pinleyen test → **KAPANDI; assert SIKILAŞTI (gevşeme yok)**

Üç eksende karşılaştırdım:

| Eksen            | Tur 1                               | Tur 2                                                                       | Yön               |
| ---------------- | ----------------------------------- | --------------------------------------------------------------------------- | ----------------- |
| `warn` davranışı | "0 warn" (dolaylı)                  | **tam 1 warn** + mesaj birebir + `context` `toEqual({requestId})`           | **sıkıldı**       |
| Üretim kodu      | log yok (asimetri)                  | `trpc.ts:91` `warn` var → `httpStatusToTrpcCode:66` ile **simetri kuruldu** | **sıkıldı**       |
| `info`/`debug`   | yasak (niyet dışı, uygulama detayı) | serbest (filtre `level === 'warn'`)                                         | bilinçli daraltma |

- `toEqual([])` **kaldırılmış** (kapsam: `packages/trpc/src/__tests__/**` — bu dosyada
  `logger.entries` üzerinde yalnızca `:137`'deki `filter` kullanımı var).
- Test adı artık davranış adı: `"cause-parse-fail dalı warn ÜRETİR ve requestId taşır"`
  — gate bulgusu metni değil.
- **Gevşetme yok:** eşik düşürülmedi, `skip` yok, silinen assert'in yerine daha
  spesifik üç assert geldi. Kaybedilen tek boyut (`info`/`debug` yasağı) zaten M4'ün 2. maddesinde "niyetten geniş" diye **bulgu olarak yazılmıştı**.
- Ancak eklenen `warn`'ın **içeriği** yeni bir bulgu doğuruyor → **M6**.

---

## 2. BULGULAR (düzeltmenin getirdiği yeni kusurlar)

### medium

#### M5 — ADR-0010 madde 3 numaralandırması kodun atıflarıyla eşleşmiyor: beş atıf artık **yanlış maddeyi** gösteriyor (L15 kapanmadı, kötüleşti)

- **Dayanak (ADR taslağı, madde 3'ün yayınlanan sırası):** 3.1 spread yasağı · 3.2
  `message` okunmaz · 3.3 ortam dallanması yok · **3.4 ham mesaj/yığın izi yalnızca
  loga gider** · **3.5 çeviri ara katmanda (+ `next()` uygulama notu)** · **3.6
  durum↔kod kapalı tablo**.
- Tur 1'de L15'in gerekçesinde kodun varsaydığı sıra ölçülmüştü: `… · çeviri
boundary'de · durum↔kod tablo · tek makine-okunur kod`. Yayınlanan sıra **bir madde
  kaydı** (araya "ham mesaj loga gider" girdi, "tek makine-okunur kod" hiç yok) ama
  **kod güncellenmedi**. Sonuç: sarkan atıf sorunu kapanmadı, **aktif olarak yanlış
  atıfa** dönüştü:
  1. `packages/trpc/src/trpc.ts:40` — "madde 3.4" → doğrusu **3.5**
  2. `packages/trpc/src/trpc.ts:123` — "madde 3.4 korunur" → doğrusu **3.5**
  3. `packages/trpc/src/error-mapping/http-status-to-trpc-code.ts:6` — "madde 3.4" → doğrusu **3.5**
  4. `packages/trpc/src/error-mapping/http-status-to-trpc-code.ts:2` — "madde 3.5" → doğrusu **3.6**
     (aynı sapma `packages/trpc/src/__tests__/http-status-to-trpc-code.test.ts:2` → "§3.5")
  5. `packages/trpc/src/schemas/trpc-error-data.schema.ts:19` — "madde 3.6: istemci
     daima `data.appError.code`'a dallanır" → ADR'de **böyle bir madde yok** (3.6
     durum↔kod tablosudur) → **sarkan atıf**
- Doğru olan iki atıf: `procedures.test.ts:14` ve `error-formatter.test.ts:14`
  ("madde 3.5'in uygulama notu") ✓ — yani düzeltme turu **yeni** atıfları doğru
  yazdı, **mevcut** atıfları hizalamadı.
- Bu, kozmetik bir numara hatası değil: ADR taslağının kendisi (satır 68-70)
  "numaralandırma değişirse o atıflar da güncellenmek zorundadır" diye **bağlayıcı bir
  değişmezlik** ilan ediyor; düzeltme turu o değişmezliği ihlal etti. Beş yıl sonra
  `trpc.ts:40`'ın gerekçesini arayan biri "ham mesaj loga gider" maddesini okuyup
  kodun iddiasının dayanaksız olduğunu düşünür.
- **Severity gerekçesi:** tur 1'de L15 **low**'du çünkü atıf henüz yayınlanmamış bir
  taslağa bakıyordu ve "ileride sarkabilir" riskiydi. Bugün atıf **yanlış** bir kurala
  işaret ediyor; bu M1 ile aynı sınıf ("aktif olarak yanlış yorum") → **medium**.
  Çalışma zamanı etkisi yok.
- **Önerilen düzeltme:** iki seçenekten biri — (a) ADR-0010 madde 3'ü kodun varsaydığı
  sıraya döndür (3.4 çeviri, 3.5 durum↔kod, 3.6 tek makine-okunur kod; "ham mesaj
  loga gider" 3.7 olur); **ya da** (b) yukarıdaki beş atıfı ADR'nin yeni
  numaralandırmasına hizala ve `schema.ts:19`'un atfını "madde 3.1 (üç anahtar)" +
  ADR'ye yeni bir madde olarak yaz. (a) daha az dosya değiştirir ve kod atıflarının
  tamamını doğru kılar.
- **Sorumlu ajan:** docs (S7) + Orkestratör (ADR'yi numaralandıran taraf)

#### M6 — cause-parse-fail dalına eklenen `warn` tanısal yük taşımıyor; ham hata mesajı/yığın izi **hiçbir loga** gitmiyor (ADR-0010 madde 3.4 karşılıksız)

- **`packages/trpc/src/trpc.ts:88-92`** · `packages/trpc/src/handler/create-trpc-request-handler.ts:34-40`
- Eklenen kayıt yalnızca `{ requestId }` taşıyor. Bu dala **iki farklı sınıf** olay
  düşüyor ve log ikisini **ayırt edemiyor**:
  1. **Rutin, istemci tetiklemeli çerçeve hataları** — bilinmeyen prosedür, `?batch=1`
     reddi (`transport-negative.test.ts:33`), `query`'ye POST, bozuk JSON. Kimlikli bir
     kiracı kullanıcısı bunu istediği kadar tetikleyebilir → her istek bir `warn`.
  2. **M4(b)'nin kurmak istediği ikinci savunma hattı** — `cause` round-trip'inin
     dejenerasyonu (M2). `trpc.ts:82-86` yorumu logun **gerekçesini** tam olarak bu
     diye yazıyor, ama `{requestId}` ile bu iki sınıfı ayırt etmek imkansız: operatör
     yalnızca hacim artışı sezgisiyle çalışabilir. Yani log, **eklenme gerekçesini
     yerine getiremiyor**.
- Daha ağır yarısı: bu dala `appErrorBoundary`'den **geçmiş** ama `AppError` olmayan
  hatalar da düşüyor (`trpc.ts:150` `throw result.error`;
  `app-error-boundary-non-app-error.test.ts:42` bunu ölçüyor). Bu bir **programlama
  hatası** sınıfıdır (ör. port adaptöründe `TypeError`) ve bugün:
  tel gövdesi jenerik (`HTTP_EXCEPTION`) · `warn` içeriği `{requestId}` ·
  `fetchRequestHandler`'a **`onError` verilmemiş** (kapsam: tüm repo `src/**/*.ts`,
  `onError` araması → bu adla bağlanmış **hiçbir hook yok**) · Nest'in
  `AppExceptionFilter`'ı tRPC zarfını hiç görmüyor. Sonuç: **hatanın mesajı ve yığın
  izi hiçbir yere yazılmıyor.** ADR-0010 **madde 3.4** ("ham mesaj ve yığın izi
  yalnızca yapılandırılmış loga gider") bu yüzden bugün **hiçbir kod tarafından
  uygulanmıyor** — gövdeye girmiyor ✓, ama loga da girmiyor ✗.
- **Severity gerekçesi (şişirmedim):** `high` listemdeki "yutulan hata" ölçütüne tam
  oturmuyor — `catch {}` yok, hata `null`'a çevrilmiyor, istemciye doğru durum + ayırt
  edilebilir kod + `requestId` ile **iletiliyor** (`appErrorBoundary` sarmalamadan
  yukarı fırlatıyor, CLAUDE.md §4 ihlali yok). Eksik olan **tanılanabilirlik**, yanlış
  davranış değil; ayrıca boşluk düzeltmeden **önce de** vardı (düzeltme onu kapatmadı,
  kapatıyor gibi görünen bir kayıt ekledi). AGENT_BASELINE §4 "emin değilsen bir alt
  seviyeyi seç" → **medium**. Not: ADR-0010 madde 3.4'ün v0.0.6 için **bağlayıcı**
  olduğu po/architect tarafından teyit edilirse bu bulgu "kabul kriterini karşılamama"
  olur ve `high`'a çıkar — bu yorum kararı benim değil.
- **Önerilen düzeltme (küçük, kapsamı büyütmeyen):** `createTrpcRequestHandler()`'a
  `onError` bağla ve `ctx.logger.error`'a `{ requestId, trpcCode, httpStatus, message,
stack }` yaz (gövdeye hiçbir şey eklemez; `redaction`'dan geçir). Ayrıca mevcut
  `warn`'ın context'ini `{ requestId, trpcCode: shape.code, httpStatus:
shape.data.httpStatus }` ile zenginleştir — M2 dejenerasyonu o anda `trpcCode`
  dağılımından **ayırt edilebilir** hâle gelir. İkisi birlikte ~6 satır, `error-formatter.test.ts:141`'in
  `toEqual`'i aynı turda güncellenir (sıkılaşma yönünde).
- **Sorumlu ajan:** backend (S3) · doğrulama: qa · ADR yorumu: architect

### low

| #   | Konum                                                                                                                                                                          | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Önerilen düzeltme                                                                                                                                                                                              | Sorumlu                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| L17 | `packages/trpc/src/__tests__/error-formatter.test.ts:28-37` · `app-error-boundary-non-app-error.test.ts:31-34` · `transport-negative.test.ts:27-30`                            | **Gerçek tekrar (bu turda doğdu).** `ERROR_ENVELOPE_SCHEMA` + `DATA_RECORD_SCHEMA` üç dosyada birebir. Yüzeysel benzerlik değil: üçü de **tek bir sebeple** değişir — JSON-RPC2 hata zarfının/`data` nesnesinin şekli (ADR-0010 madde 3.1). Dosya sahipliği kuralı (başka ajanın dosyasına dokunma) kopyalamayı **açıklıyor** ama borcu silmiyor.                                                                                                                                             | `__tests__/error-envelope.schema.ts` altına çıkar (po dosya listesine ekler). Tur 1'in L12'si (`createMemoryLogStream` 7 kopya) ile **tek** bir test-yardımcısı konsolidasyon alt görevinde birleştirilebilir. | po + backend             |
| L18 | `packages/trpc/src/__tests__/transport-negative.test.ts:80-81`                                                                                                                 | `const isSuccessStatus = … ; expect(isSuccessStatus).toBe(false)` — assert "2xx değil" diyor; 405 beklenirken 500'e dejenere olsa da **yeşil kalır**. Aynı dosyanın ilk testi (`:44`) 400'ü birebir pinliyor, yani gevşeklik bilinçli değil tutarsız. (Boolean adı `is` önekli ✓ — isimlendirme bulgusu yok.)                                                                                                                                                                                 | Gerçek durumu pinle (`expect(response.status).toBe(405)`) veya en azından `400 ≤ status < 500` aralığını assert et; gerekçeyi yorumda yaz.                                                                     | backend (qa'nın dosyası) |
| L19 | `apps/api/src/__tests__/trpc-http.test.ts:223-226`                                                                                                                             | Yorum "`git diff --stat -- packages/errors packages/trpc/src apps/api/src/errors` **BOŞ olmak ZORUNDA** (AC9(b)'nin asıl iddiası)" diyor. Düzeltme turu `packages/trpc/src/trpc.ts`'e `warn` ekledi → bu komut artık **boş değil**. İddianın dar hâli (bu test dosyasının yazarı o dizinlere yazmadı) doğru, ama yazılı hâli ölçülebilir ve **yanlış** → M1 sınıfının küçük kalıntısı.                                                                                                        | Cümleyi alt göreve kapsa: "S6 alt görevinde bu üç dizine satır yazılmadı; tur 1 düzeltmesi `trpc.ts`'e M4(b) `warn`'ını ekledi (solid tur2)".                                                                  | backend (S6)             |
| L20 | `apps/api/src/trpc/trpc.controller.ts:117-118`                                                                                                                                 | Önbellek politikası (çapraz kesen bir HTTP kararı) tek controller'ın taşıma yardımcısının **içine** yazıldı. Bugün tekrar yok (tek kopya) ve kapsam kararı `:95-99`'da gerekçeli — ama `/auth/*` borcu ödendiğinde **ikinci kopya** doğacak ve iki yüzey sessizce sapabilir. Başlık yazımını ayrıca denetledim: `setHeader`(cache-control) + `appendHeader`(vary) seçimi **doğru**, tRPC'nin `trpc-accept, accept` değeri ezilmiyor; `trpc-http.test.ts:272-312` bunu iki prosedürde ölçüyor. | `/auth/*` borcu kapatılırken politikayı tek bir interceptor'a taşı (iki kopya yazmadan). Bugün dokunma.                                                                                                        | devops/backend (borç)    |
| L21 | `.claude/workflow/tasks/T-007.md` handoff'u — `packages/trpc/src/__tests__/app-error-boundary-non-app-error.test.ts`, `packages/trpc/src/__tests__/transport-negative.test.ts` | **Denetim kaydı eksikliği.** Handoff "DÜZELTİLEN DOSYALAR (**yalnızca bunlar değişti**)" diyor ama bu **iki yeni test dosyası** listede yok; ikisi de "qa tur 1 — EKSİK TEST BULGUSU" başlığı taşıyor, yani bu düzeltme turunda doğdular (dört test → `trpc 25` sayısını açıklıyor: 20 + M3 + 4). Gate ajanı değişen dosyayı bilmezse denetlemez; bu turda ikisini de okudum (L17/L18 oradan geldi).                                                                                          | Gate handoff'larında dosya listesi `git diff --name-only` çıktısından üretilsin, ajan beyanından değil.                                                                                                        | Orkestratör              |

---

## 3. Tamamlanma tanımının diğer maddeleri

### L4'ün (`FALLBACK_REQUEST_ID = 'unknown'`) ertelenmesine **KATILIYORUM**

- Gerekçeye katılma sebebim: çözüm iki yoldan birini seçmeyi gerektiriyor
  (sentinel'i `@arkesoft/errors` fabrikalarına taşımak **veya** `TrpcContext`'i
  zorunlu kılmak) ve ikincisi `packages/trpc`'nin **sözleşme yüzeyini** değiştirir →
  architect kararı. Kapsam dışına çıkmamak doğru karardı.
- Düzeltme L4'ü **büyütmedi** (denetledim): `trpc.ts:88`'de `requestId` sentinel'e
  düşse bile `:90`'daki `ctx !== undefined` kontrolü yüzünden `'unknown'` **loga
  hiç yazılmıyor**, yalnızca tele çıkıyor — yani tur 1'deki yüzey aynı.
- Borç kaydına şunun **eklenmesini** istiyorum: `ctx === undefined` dalında logger de
  olmadığı için o yolda **hiçbir gözlemlenebilirlik yok**. Architect kararı bu iki
  problemi (sentinel + logger'sız dal) birlikte ele almalı; `TrpcContext`'i zorunlu
  kılan yol ikisini **aynı anda** kapatır. Bu, M6 ile aynı kökten beslenen bir borçtur.

### qa'nın "tetikleyici yapısal olarak erişilemez" muhakemesi — **BAĞIMSIZ DENETLENDİ, DOĞRU**

Zinciri ben de ölçtüm (kapsam: üretim kodu, `apps/api/src/{tenancy,auth,trpc}`):

1. `/trpc/*` **iki allowlist'in ikisinde de yok** — `tenancy/tenant-exempt-paths.ts:55-68`
   (on iki eleman, `/trpc` yok) ve `auth/auth-exempt-paths.ts:34-44` (dokuz eleman,
   `/trpc` yok). Her ikisi de `normalizeRequestPath` ile **TAM eşleşme** → prefix
   sızması yapısal olarak imkansız.
2. **Tenant yolu:** `tenancy/tenant-resolver.service.ts:204-210` `null` ve
   `deletedAt !== null` satırlarını `unresolved`'a çeviriyor → `tenancy/tenant.guard.ts:53-59`
   `unresolved`→404, `failed`→500, `pending`→throw; controller'a **yalnızca** `resolved`
   veya `exempt` ulaşıyor. `/trpc` için `exempt` imkansız (madde 1) → `trpc-context.factory.ts:65-71`
   her zaman `{kind:'resolved'}` üretiyor → `trpc.ts:179`'un throw'u **HTTP'den
   erişilemez**. ✓
3. **Auth yolu:** `auth/auth.guard.ts:61-75` `unauthenticated`→401, `failed`→500,
   `pending`→throw, `exempt`→true (madde 1 gereği `/trpc` için imkansız) → factory'ye
   **yalnızca** `authenticated` ulaşıyor → `trpc.ts:165`'in throw'u da **erişilemez**. ✓
4. **TOCTOU yarışı gerçekten tek kalan yol mu — hayır, o da yok:** guard'lar ve
   `createTrpcContext()` **aynı ALS anlık görüntüsünü** okuyor
   (`trpc-context.factory.ts:92` `getRequestContext()`), istek içinde yeniden çözüm
   yapılmıyor. Yani deterministik olmayan bir yarış bile kurulamaz; qa'nın "kalan tek
   yol TOCTOU" ifadesi **fazla iyimser**, durum daha katı: HTTP'den **hiçbir yol yok**.
5. `session.me` DB'ye dokunmuyor (`routers/session.router.ts:16` — `ctx.auth`'tan nesne
   kurulumu) ✓, dolayısıyla soft-delete yarışı o prosedürde de kurulamaz.

**Sonuç:** qa test uydurmadı, doğru ölçtü; atlanmış bir yol **bulamadım**. Borç kaydına
eklenmesi gereken tek düzeltme: bu erişilemezlik **kalıcı bir özellik değil** —
`trpc.ts:191`'in belgelediği v0.1.0 mekanizması (`publicProcedure`'ün tam yolunu
`AUTH_EXEMPT_PATHS`'e eklemek) devreye girdiği **anda** `auth` artık `exempt` olarak
gelebilir, `requireAuth`'ın dalı HTTP'den erişilebilir hâle gelir ve M3'ün hermetik
testi tek koruma olmaktan çıkar. Borç satırı "v0.1.0'da yeniden değerlendirilir"
koşuluyla kaydedilmeli.

### Ertelenebilir low'lar hakkında görüş (L3, L5, L7–L16)

| Low                                                  | Görüş                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L3** (`"Beş alan"` → altı), **L14** (yanlış yorum) | **Ertelenmesini önermiyorum** — ikisi de M1 sınıfı (**yanlış** yorum), tek kelimelik ve sıfır riskli. `docs` adımının (S7) ADR/CHANGELOG turunda aynı anda alınsın; borç tablosuna taşımak maliyeti faydadan büyük.                                                                                                                                              |
| **L5** (`code: z.string()` gerekçesiz)               | Ertelenebilir **ama vadeli**: public API sözleşme snapshot'ı (`pnpm test:contract`) bu alanı pinlediği sürümde karar verilmiş olmak zorunda, yoksa sözlüğü daraltmak **major** olur. Borç satırına "ilk `test:contract` sürümünden önce" yaz.                                                                                                                    |
| **L4, L10**                                          | Ertelenebilir — ikisi de architect kararı istiyor (sözleşme yüzeyi). L4 ile M6 **aynı kökten**; birlikte ele alınsın.                                                                                                                                                                                                                                            |
| **L7, L8, L13, L16**                                 | Ertelenebilir, saf temizlik. Dosya sahipleri sonraki dokunuşlarında alsın; ayrı alt görev açmaya değmez.                                                                                                                                                                                                                                                         |
| **L9**                                               | Ertelenebilir, **ama** `trpc.controller.ts` bu turda zaten değişti ve alan tipleri hâlâ somut adaptör sınıfları (`:132-133`). İkinci bir port eklendiğinde (v0.1.0) DIP ihlali görünür hâle gelir; o alt görevin kapsamına **bağlansın**.                                                                                                                        |
| **L11** (test edilmeyen POST dalı)                   | **Kısmen kapandı, kapanan kısmı yanlış anlaşılmasın:** `transport-negative.test.ts:67-85` POST'u **handler** seviyesinde reddediyor, ama `trpc.controller.ts:70-71`'in `buildTrpcWebRequest` gövde-yeniden-serileştirme dalı hâlâ **hiç koşmuyor** (o test `Request`'i elden kuruyor, controller'dan geçmiyor). Erteleme geçerli; sahibi ilk mutation prosedürü. |
| **L12, L17**                                         | Ertelenebilir ama **birlikte**: test yardımcısı kopyaları artık iki ayrı ailede (log stream 7, zarf şeması 3). Tek bir "test helpers konsolidasyonu" alt görevi; parça parça alınırsa her tur bir kopya daha doğuyor (bu tur +3 oldu).                                                                                                                           |
| **L15**                                              | **Ertelenemez → M5 oldu.** Bu turda kapanması gerekiyordu, kapanmadı ve kötüleşti.                                                                                                                                                                                                                                                                               |

### Düzeltmenin getirdiği başka yeni kusur **var mı** — hedefli denetim

| Denetlenen                              | Sonuç                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trpc.ts`'teki `warn` eklemesi          | **Mesaj adı simetrik ve doğru:** `trpc.error-formatter.unparsable-cause` ↔ `trpc.error-mapping.unmapped-http-status` (`http-status-to-trpc-code.ts:66`) — aynı `domain.action` deseni (CLAUDE.md §4). **Sır/PII sızıntısı yok** (yalnızca `requestId`). **Seviye doğru** (`warn` = beklenen ama anormal). `errorFormatter`'ın tek sorumluluğu bozulmadı (logger zaten port olarak context'te, `httpStatusToTrpcCode` emsali aynı). **Tek kusur içerikte** → M6.               |
| M4 testinin izolasyonu                  | `error-formatter.test.ts:127` kendi harness'ini (`requestId: 'req_cause_parse_fail'`) kuruyor; `toHaveLength(1)` başka testlerin logundan etkilenmiyor. `httpStatusToTrpcCode` bu dalda **hiç çağrılmıyor** → "tam 1 warn" iddiası yapısal olarak doğru, kırılgan değil. ✓                                                                                                                                                                                                    |
| `trpc.controller.ts` başlık yazımı      | `setHeader('cache-control')` + `appendHeader('vary')` ayrımı doğru; `set-cookie` döngüsü ve `getSetCookie()` dalı bozulmamış; `reply(…, status)` sırası korunmuş. Web `Headers` iterasyonu tekrarlı başlıkları virgülle birleştirdiği için `setHeader` döngüsünde değer kaybı yok. Yan etki olarak `forwardTrpcWebResponse` artık politika da taşıyor → **L20** (bugün tekrar yok).                                                                                           |
| `trpc-http.test.ts`'in yeni iki testi   | Gerçek yanıtı ölçüyor, mock yok; `vary` karşılaştırması parse edip `toContain` ile üç değeri ayrı ayrı doğruluyor (ezilmezliği **gerçekten** ölçüyor). `response.headers['vary']` `@types/superagent`'ta `{[index:string]: string}` → `any` sızması **yok**, `?? ''` `noUncheckedIndexedAccess` yüzünden gerekli. `:283`'teki `(value: string)` annotasyonu gereksiz ama zararsız (lint/stil alanı, bulgu yazmadım).                                                          |
| İki yeni test dosyasının kalitesi (L21) | **Davranış testi, implementasyon yansılaması değil:** ikisi de gerçek `createTrpcRequestHandler()`/gerçek `appRouter` üzerinden tele çıkan gövdeyi okuyor, `vi.mock`/`vi.spyOn` yok, sahte olan yalnızca port. `transport-negative.test.ts:59-63`'teki "yanlış pozitif üretmiyor" kontrol testi **doğru kurulum** (negatif testin totolojiye düşmediğini kanıtlıyor) ve `procedures.test.ts`'in mutlu yolunun tekrarı **değil** (farklı sebeple var). Kusurlar: L17, L18.     |
| `harness.ts` (L6 düzeltmesi)            | Ölü re-export **kaldırılmış**; kalan import'ların hepsi kullanımda (`TrpcRequestHandler` `:277`, `TrpcClientOptions` `:279`). Yeni ölü kod doğmamış. ✓                                                                                                                                                                                                                                                                                                                        |
| L1/L2 paraphrase kalıntısı              | **Kapandı:** `trpc-error-data.schema.ts:14-15` artık `instanceof` literali; `create-trpc-request-handler.ts:4` artık "`apps/api`'nin `TrpcController`'ı". Kapsam (yorum satırları): kalan tek paraphrase `harness.ts:7` ("ilişkisel veritabanı istemcisi, anahtar-değer önbelleği, ORM paketi") — orada **gerekçeli**, çünkü dosyanın AC11 hermetiklik iddiası tam o jetonların greple aranmasıyla denetleniyor (AGENT_BASELINE §5 literal-jeton kuralı). **Bulgu yazmadım.** |
| `any` / `@ts-ignore` / gerekçesiz `as`  | Düzeltilen + yeni dosyaların tamamında kodda **0** (`packages/trpc/src` → altı eşleşmenin hepsi `harness.ts` yorumlarında; `apps/api/src/trpc` → 0). `as` tip zorlaması `packages/trpc/src` üretim+test kodunda **0**.                                                                                                                                                                                                                                                        |
| Katman / bağımlılık yönü                | Yeni import eklenmemiş: `trpc.ts` import listesi tur 1 ile aynı, iki yeni test dosyası yalnızca `vitest`/`zod`/`@arkesoft/errors` + relatif yollar çekiyor. `packages/trpc` → `apps/*` veya `@arkesoft/db` yönü **yok**, döngü **yok**. ✓                                                                                                                                                                                                                                     |

---

## ÖLÇÜMLER

- **İncelenen dosya:** **20** — düzeltme kümesinin **8** dosyası tam okundu
  (`packages/trpc/src/{trpc.ts, schemas/trpc-error-data.schema.ts,
handler/create-trpc-request-handler.ts, __tests__/procedures.test.ts,
__tests__/error-formatter.test.ts, __tests__/harness.ts}`,
  `apps/api/src/trpc/trpc.controller.ts`, `apps/api/src/__tests__/trpc-http.test.ts`)
  - handoff'ta **bildirilmeyen 2 yeni dosya** (L21) + **8** referans dosyası
    (`http-status-to-trpc-code.ts`, `routers/session.router.ts`,
    `trpc-context.factory.ts`, `tenancy/tenant.guard.ts`,
    `tenancy/tenant-resolver.service.ts`, `tenancy/tenant-exempt-paths.ts`,
    `auth/auth-exempt-paths.ts`, `auth/auth.guard.ts`) + **2** ADR taslağı.
- **`any` sayısı:** **0** (kodda; düzeltme kümesi + iki yeni dosya). Yorumda 6 anlatım.
  `@ts-ignore`/`@ts-expect-error`: **0** · `eslint-disable`: **0** · `as` zorlaması:
  **0**.
- **En büyük fonksiyon:** üretim kodunda `packages/trpc/src/trpc.ts:54-101`
  `errorFormatter` — **48 satır** (tur 1: 45; `warn` eklemesiyle +3), yorum hariç
  **~21**. Test tarafında en büyük `it()` gövdesi
  `packages/trpc/src/__tests__/procedures.test.ts:143-172` — **30 satır**.
  (Tur 1'in 108 satırlık `it()`'i — L16 — bu turun dosya kümesinde değil, değişmedi.)
- **Bulgu dağılımı:** critical 0 · high 0 · **medium 2** (M5, M6) · low 5 (L17–L21).
  Tur 1'in dört medium'u: **4/4 kapandı**. Tur 1'in low'larından kapanan: L1, L2, L6
  (+L11 kısmen); **L15 kapanmadı → M5'e yükseldi**.
- **Komut çalıştırılmadı:** `Bash` tool'u bu oturumda da yok → `lint`/`typecheck`/
  `test`/`build`/`test:isolation`/`format:check`/`git diff` **çalıştırılmadı**;
  Orkestratör'ün 561/561 ölçümü bulguya dayanak yapılmadı. Tüm sayılar `Grep`/`Read`
  ile statik olarak üretildi.

---

## SONUÇ gerekçesi (AGENT_BASELINE §4)

**2 medium, 0 high/critical** → "1–2 `medium` = **PASS**, bulgular teknik borca
kaydedilir". Tur 1'in FAIL sebebi olan dört medium'un **tamamı kapandı**; M4'ün
assert'i **sıkıldı** (gevşeme yok) ve M2'nin öngörülen dejenerasyon senaryosu artık
`packages/trpc`'nin hermetik süitinde yakalanıyor. Yeni iki medium'un **hiçbiri
davranış hatası değil**: biri dokümantasyon atıf hizası (M5), diğeri tanılanabilirlik
(M6) — ikisi de üretim kodunun tel davranışını değiştirmeden kapanır (M5: ADR
numaralandırması veya beş yorum satırı; M6: `onError` + `warn` context'i, ~6 satır).

Verdiğim karar iki severity yorumuna **dayanıklı**: M5 low sayılsa da sonuç PASS'tır
(1 medium). Tek flip koşulu, po/architect'in ADR-0010 madde 3.4'ü v0.0.6 için
**bağlayıcı kabul kriteri** ilan etmesidir — o durumda M6 `high` olur ve kural gereği
FAIL'e döner. Bu yorum kararı gate ajanının değil, kapsam sahibinin işidir.
