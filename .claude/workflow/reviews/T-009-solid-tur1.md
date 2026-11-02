# T-009 — `solid` gate, tur 1

Tarih: 2026-11-02
Sürüm: ROADMAP v0.0.8 (storefront iskeleti ve host çözümü) · versiyon etkisi **minor**
Kapsam: `packages/tenancy` (yeni) · `apps/storefront` (yeni uygulama) · `packages/trpc` (dördüncü
builder + yeni router/port/şema) · `apps/api` (adaptör + muafiyet + fail-closed kapılar) ·
`docs/development.md` (terfi taraması)

```
GATE: solid
SONUÇ: FAIL
```

**FAIL gerekçesi:** `AGENT_BASELINE.md` §4 — **4 `medium` bulgu** (eşik: ≥3 → FAIL). `critical`
veya `high` bulgu **yok**. Karar kurala göre verildi, takdirle değil.

---

## BULGULAR

### medium (4) — düzeltme turu açar

- **[SEV: medium]** `apps/storefront/src/env.d.ts:17-19` + `apps/storefront/src/middleware.ts:142-148`
  — **`App.Locals.tenant` zorunlu (opsiyonel değil) bildirilmiş, ama erken-çıkış dalında HİÇ
  yazılmıyor.** `onRequest`'in adım 0'ı (`/404`/`/503`) `context.locals.tenant`'a hiçbir şey atamadan
  `next()` çağırıyor; tip sözleşmesi o yolda yalan söylüyor. Üstüne, `StorefrontTenantContext`'in
  `unresolved` dalı üretim kodunda **hiçbir yerde kurulmuyor** (ölçüm: `rg "kind: 'unresolved'"
  apps/storefront/src` → yalnızca testler) — yani ayrık birleşim **ulaşılamayan** bir durumu
  modelliyor, **ulaşılabilir** olanı (`undefined`) modellemiyor. `requireResolvedTenant`
  (`storefront-tenant-context.ts:36`) bu durumda tasarlanmış Türkçe hatayı değil, `switch
  (context.kind)` üzerinde bir `TypeError` üretir — savunma kapısı kendi kapsadığını iddia ettiği
  durumu kapsamıyor. Bugün tetiklenebilir bir yol **yok** (404/503 sayfaları `locals`'ı okumuyor),
  ama `/404`/`/503`'e kiracıya bağlı tek bir satır eklendiği veya üçüncü bir rewrite hedefi doğduğu
  anda gerçek bir hataya dönüşür. CLAUDE.md §4 (`exactOptionalPropertyTypes`, ayrık birleşim gerçek
  durumları modeller).
  — **Düzeltme:** ya `App.Locals`'ta alanı `tenant?: StorefrontTenantContext` yapıp
  `requireResolvedTenant`'ı `StorefrontTenantContext | undefined` kabul edecek şekilde genişlet
  (üçüncü dal: açık Türkçe hata), ya da erken-çıkış dalında `context.locals.tenant = { kind:
  'unresolved' }` yazarak hem tipi doğru kıl hem o dalı ölü olmaktan çıkar. İkincisi K16'nın
  mevcut tasarımıyla daha tutarlı ve tek satır.
  — **Sorumlu ajan:** `frontend`

- **[SEV: medium]** `apps/storefront/src/middleware.ts:142` +
  `apps/storefront/src/lib/__tests__/middleware.test.ts:313-328` — **düzeltme turu 1'in erken-çıkış
  koşulunun `/503` kolu mutasyonla ölçülmüyor.** Re-entrancy harness'i (gerçek Astro davranışını
  taklit eden sarmalayıcı — bu kısım **doğru** ve projenin ders aldığının kanıtı) yalnızca **tek**
  vakayı koşuyor: host yok → `unresolved` → `rewrite('/404')`. Yaptığım mutasyon analizi:
  `context.url.pathname === '/503'` kolu koşuldan **kaldırılırsa hiçbir test kırmızıya dönmez** —
  503 testleri (`middleware.test.ts:202-236`) düz `vi.fn` rewrite'ı kullanıyor, yeniden girmiyor.
  Aynı şekilde `withStatus`/`applyStorefrontCachePolicy`'nin erken-çıkış dalındaki çağrıları
  (`:145-146`) da mutasyon-hayatta-kalan: dış katman onları zaten tekrar uyguluyor, doğrudan
  `/404`/`/503` isteği için ise **hiç test yok**. Yani `critical` bulgunun düzeltmesinin yarısı
  (API-hata → 503 yolu) bekçisiz. `AGENT_BASELINE` §4 "eksik test".
  — **Düzeltme:** `createLoopSimulatingHarness` ile ikinci bir vaka: çözülmüş host + `queryMock`
  500 ile reddediyor → `invocationCount() === 2`, `status === 503`, gövde "Loop Detected"
  içermiyor. Üçüncü vaka: geçerli host üzerinde **doğrudan** `GET /404` ve `/503` → durum
  damgalanıyor, `cache-control` yazılıyor, `createStorefrontTrpcClientMock` **çağrılmıyor**
  (dosya başı yorumunun 75-83. satırlardaki güvenlik iddiasının ölçümü de böylece doğar).
  — **Sorumlu ajan:** `frontend`

- **[SEV: medium]** `apps/storefront/eslint.config.mjs:76-77` (ve `:88-99`) — **architect K14'ün
  "adalar `storefront-env`/`api-client` ithal EDEMEZ" şartı uygulanmamış, ve yorum bunu var olmayan
  bir mekanizmaya atfediyor.** Yorum birebir şöyle diyor: *"adaların `storefront-env`/`api-client`
  ithal edemeyeceği garantisi bu kuralla DEĞİL, modül sınırıyla sağlanır"* — böyle bir modül sınırı
  **yok**. `src/components/**` için tanımlı tek ek kural `no-restricted-globals` ve o yalnızca o
  dosyada **doğrudan** `process` kullanımını yakalar; `src/components/TenantGreeting.tsx`'in
  `../lib/storefront-env.js`'i ithal etmesini **hiçbir şey engellemiyor** ve o durumda kural
  **tetiklenmez** (global `src/lib`'de kullanılıyor). Sonucu AC11'in *"`dist/client` sır 0"*
  garantisinin doğrudan ihlali olurdu: `STOREFRONT_API_BASE_URL` istemci paketine girer.
  Bugün ihlal **yok** (TenantGreeting yalnızca `react` ithal ediyor) — ama yapısal kapı eksik ve
  yanlış yorum bir sonraki ajana "kapı var" diyor.
  — **Düzeltme:** `files: ['src/components/**']` bloğuna `no-restricted-imports` ekle (`mergeRestrictions`
  deseniyle, R-P1 tuzağına dikkat): `src/lib/storefront-env`, `src/lib/api-client`,
  `src/lib/storefront-server-fetch` + `../lib/*` desenleri yasak. Yanlış yorumu düzelt.
  — **Sorumlu ajan:** `devops` (dosya sahibi S3) — düzeltme tek blok

- **[SEV: medium]** `apps/storefront/e2e/storefront-host.spec.ts:96-101` ve `:193-201` —
  **düzeltme turu 1'in ② bağlayıcı şartı (gövde Türkçe `404.astro`/`503.astro`) hiçbir seviyede
  pinlenmiyor.** İki e2e testi yalnızca `response.status()`'u assert ediyor. Oysa regresyonun tanımı
  *"durum doğru görünüyordu, gövde 'Loop Detected' idi"* — yani **status assertion'ı bu hata
  sınıfına yapısal olarak kördür** (AC8 testleri `:218-222` dahil: yorumu bunu kendisi kabul ediyor,
  *"gövde içeriği İÇİN YETERLİ DEĞİL"*). Birim testi de kapatamaz: oradaki 404 gövdesi
  (`middleware.test.ts:315`) testin **kendi** ürettiği stub. Sonuç: düzeltmenin yarısı yalnızca
  insan gözüyle doğrulandı. **Karar: bu bir öneri değil, bulgudur** — çünkü ölçülmemiş olan şey
  `qa`'nın bulduğu `critical`'ın kabul şartının kendisi.
  — **Düzeltme:** iki testte gövde assertion'ı: `expect(await response.text()).toContain(
  MESSAGES.storefront.notFound.heading)` benzeri (literal tekrarı e2e'de zaten kabul edilmiş desen,
  `:47-53`) **ve** `.not.toContain('Loop Detected')`. 503 yolu için de bir vaka.
  — **Sorumlu ajan:** `qa`

### low (11) — düzeltme turu AÇMAZ, borç satırı metinleri aşağıda

- **[SEV: low]** `docs/development.md:238-241` — terfi sonrası **tek kaçan** eskimiş yol referansı.
  Blok *"`apps/api/src/tenancy/**` … değiştirilirken"* diyor ve 1. madde olarak
  `src/__tests__/resolve-host.test.ts`'i (yani `apps/api/src/__tests__/...`) *"mutlaka yeşil
  kalmalı"* diye işaret ediyor — o dosya artık **yok**, `packages/tenancy/src/__tests__/resolve-host.test.ts`'e
  taşındı; host çözümleme mantığı da artık `apps/api/src/tenancy/**` altında değil. Güvenlik-kritik
  bir runbook bölümünde var olmayan dosyaya yönlendirme. — **Düzeltme:** iki yolu `@arkesoft/tenancy`'ye
  güncelle. — **Sorumlu ajan:** `docs` — **vade: v0.0.9**
- **[SEV: low]** `packages/tenancy/src/resolve-host.ts:78-80` (ve `:58-62`) — terfi sonrası
  **tek-tüketici** varsayan yorumlar. *"`APP_BASE_DOMAIN` da açılışta (`TenantResolverService`
  kurucusunda) AYNI fonksiyondan geçer"* — artık **ikinci** bir açılış normalizasyonu var
  (`apps/storefront/src/middleware.ts:96-107`) ve yorum onu anmıyor; `:58-62` de yalnızca
  `TenantResolverService`'in iki dalı Prisma'ya çevirdiğini yazıyor. Paket iki tüketiciye hizmet
  ediyor, yorum birini biliyor. — **Düzeltme:** iki tüketiciyi de anan nötr ifade. — **Sorumlu
  ajan:** `backend` — **vade: v0.0.9**
- **[SEV: low]** `apps/storefront/astro.config.ts:13-15` — *"Bu dosyanın tek sayfası
  (`index.astro`) `prerender` İHRAÇ ETMEZ"*. S4 yazdığında doğruydu; S6 dört rota daha ekledi
  (`404.astro`, `503.astro`, `robots.txt.ts`, `sitemap.xml.ts`). Garanti hâlâ geçerli ama yorum
  kapsamı yanlış sayıyor — K13'ün çapraz kiracı sızıntısı argümanının dayanağı bu cümle.
  — **Düzeltme:** *"beş rotanın hiçbiri `prerender` ihraç etmez"*. — **Sorumlu ajan:** `frontend`
  — **vade: v0.0.9**
- **[SEV: low]** `apps/storefront/src/lib/storefront-tenant-context.ts:15-16` — R9 notu
  **ADR-0012 ile çelişiyor.** Not: *"`themeId`/`themeVersion` `StorefrontTenant`'a BURAYA eklenir
  — başka hiçbir dosya değişmez"*. ADR-0012 "Etkilenen sonraki kararlar" (`:311-314`) ise v0.0.10'da
  `storefrontTenantSchema`'nın (`packages/trpc`) **ekleme** alacağını ve AC13 küme-eşitliği testinin
  elle güncelleneceğini yazıyor; ayrıca `middleware.ts:207` `tenant: { name: tenantName }`'i elle
  kuruyor, o da değişmek zorunda. En az üç dosya. Aynı adın (`StorefrontTenant`) iki paketde iki
  ayrı bildirimi (`packages/trpc/src/schemas/storefront-tenant.schema.ts:42` ve burası) bu karışıklığı
  büyütüyor — **birleştirme ÖNERMİYORUM** (locals tipi ile tel tipi ayrı kalmakta haklı), yalnızca
  yanlış cümle düzeltilmeli. — **Sorumlu ajan:** `frontend` — **vade: v0.0.10 (R9 turu)**
- **[SEV: low]** `apps/storefront/src/middleware.ts:114-116` — `assertNever`'ın **dördüncü** üretim
  kopyası (`apps/api/src/errors/assert-never.ts:36`, `apps/admin/src/errors/assert-never.ts:24`,
  `scripts/sync-platform-version.ts:401`), ve tek **dosya içine gömülü** olanı. **Değerlendirme
  (talep edilen):** `packages/*`'a terfi **önermiyorum** — kullanıcının `packages/tenancy` için
  verdiği gerekçe (*"12 rezerve etiket + slug regex bir güvenlik sınırıdır"*) 3 satırlık bir
  `throw` yardımcısına **transfer etmiyor**; sapmanın davranışsal sonucu yok, yeni paket/export
  yüzeyi erken soyutlama olurdu (KISS). Ama uygulama-içi kopyanın **kendi modülüne** çıkması
  gerekir: T-006'nın `apps/api` içinde yaptığı tam olarak buydu ve storefront'un ikinci ayrık
  birleşimi (v0.0.10 tema durumu) beşinci kopyayı aynı uygulamada üretecek.
  — **Düzeltme:** `apps/storefront/src/lib/assert-never.ts` (admin deseni birebir).
  — **Sorumlu ajan:** `frontend` — **vade: v0.0.10**
- **[SEV: low]** `apps/storefront/src/lib/__tests__/storefront-tenant-context.test.ts:27-31` ·
  `apps/storefront/src/lib/__tests__/api-client.test.ts:91` ·
  `apps/api/src/__tests__/create-test-app-fail-closed.test.ts:42` — **test adı ölçtüğünden fazlasını
  iddia ediyor.** (a) *"SEBEP KODU TAŞIMADIĞI **tip düzeyinde** doğrulanır"* diyen test,
  **testin kendi yazdığı** `{kind:'unresolved'}` literalinin `Object.keys`'ini ölçüyor — üretim
  tipini ölçmüyor; `reason?:` opsiyonel olarak eklenirse yeşil kalır. Repoda doğru araç **var**
  (`packages/trpc/src/__tests__/router-output.test-d.ts`'in `expectTypeOf`'u). (b) *"httpBatchLink'e
  DEĞİL … dayanır"* diyen test yalnızca mock çıktısının geri döndüğünü ölçüyor; `httpBatchLink`
  hakkında **sıfır** bilgi üretiyor. (c) *"Redis'e HİÇBİR komut gitmeden"* diyen test bir Redis
  casusu kurmuyor. Projenin tekrar yakalandığı *"bildirimi pinleyen, kullanımı ölçmeyen kontrol"*
  sınıfının üç küçük örneği. — **Düzeltme:** (a) `*.test-d.ts`'e taşı veya adı daralt; (b) adı
  "dönüş değerini aynen taşır" yap; (c) adı daralt. — **Sorumlu ajan:** `qa` (a,b) / `backend` (c)
  — **vade: v0.0.10**
- **[SEV: low]** `packages/tenancy/src/__tests__/purity.test.ts:31-35` — saflık pini **özyinelemeli
  değil**. `readdirSync(SRC_DIR).filter(entry.isFile())` yalnızca `src/`'in **kökündeki** `.ts`
  dosyalarını tarar; `src/<altdizin>/x.ts` eklenirse yasaklı import pini **sessizce** o dosyayı
  atlar ve `expect(files.length).toBeGreaterThan(0)` bunu yakalamaz. Dosya başı yorumu *"`src/`
  altındaki üretim kaynaklarında"* diyor — iddia kapsamı uygulamadan geniş. — **Düzeltme:**
  `readdirSync(..., { recursive: true })` + `__tests__` filtresi. — **Sorumlu ajan:** `backend`
  — **vade: v0.0.9**
- **[SEV: low]** `apps/storefront/src/lib/__tests__/cache-policy.test.ts:22-38` — **altı "yanıt
  sınıfı" parametresi ayırt edici güç taşımıyor.** `applyStorefrontCachePolicy` tek koşulsuz
  `headers.set`; `content-type`'ı **hiç okumuyor** (dosyanın kendi yorumu bunu kabul ediyor). Altı
  vaka aynı assertion'ın altı kopyası → `it.each` tablosu AC16'nın anlatısını yansıtıyor, davranışı
  ölçmüyor. Gerçek ölçüm `middleware.test.ts` (üç sınıf) ve e2e'de. Zararsız ama "beş/altı sınıf
  ölçüldü" izlenimi veriyor. — **Düzeltme:** tabloyu tek vakaya indir, "sınıf" ölçümünü
  middleware/e2e seviyesine atfet. — **Sorumlu ajan:** `frontend` — **vade: v0.0.10**
- **[SEV: low]** `packages/trpc/src/index.ts:13` — `storefrontTenantSchema` (çalışma zamanı değeri)
  kök alt yoldan ihraç ediliyor ama **tüketicisi sıfır**: router ona relatif yoldan erişiyor,
  `apps/api` yalnızca `StorefrontTenant` **tipini** alıyor, `apps/storefront` hiç almıyor. Ölü
  export. (Tip ihracı meşru, o kalmalı.) — **Düzeltme:** değeri ihraçtan çıkar veya ilk tüketici
  doğana kadar beklet. — **Sorumlu ajan:** `backend` — **vade: v0.0.10**
- **[SEV: low]** `apps/storefront/src/pages/503.astro:23` + `apps/storefront/src/middleware.ts:142`
  — erken çıkış `/503`'ü **doğrudan istenebilir** bir yol yapıyor; o durumda
  `Astro.originPathname === '/503'` olur ve "Yeniden dene" bağlantısı kullanıcıyı **aynı 503'e**
  geri gönderir (kapalı döngü). Normal akışta (rewrite) sorun yok. — **Düzeltme:** bağlantıyı
  `/`'a düşüren bir yedek veya middleware'in erken-çıkış dalında `/404`'e yönlendirme kararı.
  — **Sorumlu ajan:** `frontend` — **vade: v0.0.10**
- **[SEV: low]** `apps/storefront/src/middleware.ts:146,163,201,212` — UYARI 3'ün *"HER dönüş
  yolunda, KOŞULSUZ"* değişmezi **dört ayrı çağrı yerinde, sözleşmeyle** korunuyor; yapısal bir
  tek-çıkış yok. Dosyanın kendisi v0.0.7'nin **0/5** dersini anlatıyor ve tam o hata biçimini
  (beşinci dönüş yolu eklenince başlık düşer) yapısal olarak açık bırakıyor. — **Düzeltme:**
  `onRequest`'i tek `finally`/sarmalayıcı dönüşe indir (`const respond = (r, s) => {…}`), veya
  `renderNotFound`/`renderUnavailable` politikayı kendi içinde uygulasın (çağrı yeri 4→2).
  — **Sorumlu ajan:** `frontend` — **vade: v0.0.10**
- **[SEV: low]** `apps/storefront/src/lib/storefront-env.ts:24` — *"`process.env` `src/**` altında
  YALNIZCA bu dosyada okunur (K17, **mekanik pin**)"*. Mekanik pin olarak yazıldığı hâliyle
  **yanlış**: `src/lib/__tests__/api-client.test.ts:26-34` ve
  `src/lib/__tests__/storefront-env.test.ts:14-22,94,102` de `src/**` altında ve `process.env`
  okuyor/yazıyor (meşru test kurulumu). Niyet (üretim kodu) doğru; cümle bir gate'in grep'ini
  yanlış-pozitife sürüklüyor. — **Düzeltme:** *"üretim kodunda (`__tests__` hariç)"* ibaresi.
  — **Sorumlu ajan:** `frontend` — **vade: v0.0.9**
- **[SEV: low]** `apps/storefront/e2e/storefront-host.spec.ts:252-255` — `getText(response)`
  anlamsız sarmalayıcı: gövdesi `return response.text()`, JSDoc'u gerekçeyi *"isimlendirme amaçlı"*
  diye kabul ediyor. KISS. — **Düzeltme:** çağrı yerlerinde `await (await request.get(...)).text()`.
  — **Sorumlu ajan:** `qa` — **vade: v0.0.10**
- **[SEV: low]** `packages/trpc/src/context/trpc-context.types.ts:70` — JSDoc *"Beş alan"* diyor,
  altı madde sayıyor (`requestId`, `logger`, `auth`, `tenant`, `ports`, `errors`). **Önceki
  sürümden devrolmuş** bir sapma (bu tur dosya `TrpcPorts` için değişti, sayım cümlesi
  değişmedi). — **Düzeltme:** "Altı alan". — **Sorumlu ajan:** `backend` — **vade: v0.0.9**

---

## ÖLÇÜMLER

| Ölçüm | Değer |
| ----- | ----- |
| İncelenen dosya (tam veya kısmi) | **54** — `packages/tenancy` 5 · `apps/storefront` 29 (üretim 20 + test 8 + e2e 1) · `packages/trpc` 12 · `apps/api` 6 · `docs` 2 |
| `any` | **0** — kapsam: `apps/storefront/src/**` (üretim, `__tests__` hariç), `packages/tenancy/src/**`, `packages/trpc`'nin yeni/değişen beş dosyası, `apps/api`'nin yeni adaptörü. Desen: `: any`, `as any`, `\bas\s+(unknown\|any\|[A-Z])` |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | **0** (aynı kapsam) |
| `as` tip zorlama — **üretim** kodu | **0** (`apps/storefront/src/**` ve `packages/tenancy/src/**` için grep ham çıktısı: eşleşme yok) |
| `as` — **test** dosyaları | var ve **gerekçeli**: `middleware.test.ts:73,93,…` (`as unknown as APIContext`, `tenant-guard.test.ts:55` emsali, dosya başında yazılı) · `storefront-server-fetch.test.ts:199-206` (`toBeInstanceOf` doğrulamasından **hemen sonra**) → CLAUDE.md §4'ün üretim kısıtı ihlal edilmiyor; bulgu yazılmadı |
| `eslint-disable` | **1** — `TenantGreeting.tsx:48` (`react-hooks/set-state-in-effect`), 9 satırlık gerekçeli yorumla; CLAUDE.md §2'nin istediği ROADMAP notu **`docs` fazına kalmış** (ölçüm, bulgu değil) |
| En büyük fonksiyon | **86 satır** — `createStorefrontServerFetch` (`storefront-server-fetch.ts:215-300`; yürütülebilir ifade ≈35, kalanı yorum). İkinci: `onRequest` **82 satır** (`middleware.ts:133-214`, yürütülebilir ≈45) |
| Döngüsel bağımlılık | **0** — `packages/tenancy` `dependencies: {}` (yaprak); `apps/* → packages/*` yönü korunuyor; `packages/trpc` bağımlılık listesi **değişmedi** (`@arkesoft/tenancy` **eklenmemiş**) |
| Katman ihlali | **0** — `@arkesoft/db` 0 · `@prisma/client` 0 · `@arkesoft/trpc/server` 0 (hepsi yalnızca `eslint.config.mjs`'in yasak metninde) · `.mutate(` 0 (yazma yüzeyi yok) · `console.` 0 · `httpBatchLink` 0 (yalnızca `api-client.ts:6` yorumunda) |
| Çekirdekte sağlayıcı dallanması | **0** |
| `process.env` — üretim | **1 dosya** (`storefront-env.ts:72`) ✔ K17 |
| `'private, no-store'` literali — üretim | **1 yer** (`cache-policy.ts:22`) ✔ AC17; kalan eşleşmeler test assertion'ı (pinin kendisi) |
| Komut koşumu | **Hiçbiri** — `Bash` aracım yok. `lint`/`typecheck`/`test`/`build`/`format:check`/`git diff` **çalıştırılmadı**; BAĞLAM ÖZETİ'ndeki sayılar bağımsız doğrulanmadı. Mutasyon analizleri **kod okunarak** yapıldı (M2'nin hayatta kalan mutantı dosya akışı izlenerek türetildi) |

---

## SEKİZ ÖZEL DİKKAT MADDESİ — DENETİM SONUÇLARI

### 1. AC9 — kopya tanım SIFIR ✔ **GEÇTİ (bağımsız doğrulandı)**

- Tanım tekliği: `rg "export (const RESERVED_SUBDOMAINS|function normalizeHostname|function
  resolveHost)"` (repo, `dist` hariç) → **3 eşleşme, hepsi `packages/tenancy/src`**.
- `apps/api` kalıntısı: `apps/api/src/tenancy/` artık **5 dosya** (`tenancy.module.ts`,
  `tenant.guard.ts`, `tenant-context.middleware.ts`, `tenant-resolver.service.ts`,
  `tenant-exempt-paths.ts`) — `resolve-host*` glob'u **0 dosya**. Test de kopyalanmamış
  (`apps/api/src/**/resolve-host*` → yok).
- İki tüketici de **kök alt yoldan** ithal ediyor: `tenant-resolver.service.ts:32` ve
  `middleware.ts:87` (ikisi de `from '@arkesoft/tenancy'`, iç dosya yoluna girmiyor —
  `index.ts`'in beyanıyla uyumlu).
- `dependencies: {}` **boş** ✔ ve bu `purity.test.ts:60-73` ile pinli (pin özyinelemelilik
  kusuru için bkz. low bulgu).
- **Gövdelerin IDENTIK olması:** `Bash` yok → `diff`/`git show` **koşturulamadı**. Dolaylı
  doğrulama yaptım: algoritmanın tamamı (`MAX_HOST_HEADER_LENGTH`, `SLUG_PATTERN`, adım 3'ün adım
  4'ten önce gelmesi, `endsWith('.'+base)` tercihi, 8 sebebin literal kümesi) `apps/api`'nin
  T-002/ST-5 tarihli yorumlarıyla **birebir tutarlı**, terfi notu dışında hiçbir satır v0.0.8
  izi taşımıyor, ve `apps/api/src/__tests__/tenant-resolver.test.ts:84`'ün "9 sebep — SORGU YOK"
  sayımı değişmemiş. **Kanıt gücü: dolaylı.** S1'in `diff` ölçümünü çürütecek bir iz bulamadım.

### 2. Terfi sonrası eskimiş yol yorumları — **BİR KAÇAK BULDUM**

- `apps/*` taraması temiz: `rg "@arkesoft/tenancy" apps/` → 14 eşleşme, hepsi güncel
  (`request-context.accessors.ts:5`, `tenant-exempt-paths.ts:24,57`,
  `tenant-resolver.service.ts:20,32,107`, `request-context.types.ts:23`,
  `request-context.storage.ts:3`, `tenant-resolver.test.ts:9,84`, `admin/vite.config.ts:25`,
  `request-origin.ts:7`). Eski yol (`apps/api/src/tenancy/resolve-host|reserved-subdomains`)
  → yalnızca **terfi notlarının kendisi** + ADR-0012 + geçmiş Task dosyaları.
- **ADR'lerdeki kalıntılar için bulgu YAZILMADI** (`0004-*.md:105`, `0011-*.md:14`,
  `0012-*.md:28` — `0000-sablon.md:49-50` gereği ADR'ler geçmişe dönük düzenlenmez; ADR-0012
  taşınmayı zaten kaydetti). Talimata uyuldu.
- **Kaçak:** `docs/development.md:238-241` (low bulgu). S1'in sekiz dosyalık taraması `docs/`'u
  kapsamamış; bu, taramanın **tek** eksiği.
- Ek olarak paketin **kendi içinde** tek-tüketici varsayan iki yorum kaldı (low bulgu).

### 3. Dördüncü builder'ın merdivene tutarlı eklenmesi ✔ **GEÇTİ, dört yorum da güncel**

- `trpc.ts:9-15` merdiven yorumu **iki eksenin çarpımı** olarak yeniden yazılmış, dört builder
  hizalı tabloda (kimlik × kiracı) — doğru.
- `trpc.ts:207-216` (`publicProcedure` JSDoc'u) **güncellenmiş** ve hâlâ **doğru**: "v0.0.8'de
  HÂLÂ HTTP yüzeyinde erişilebilir bir yolu YOKTUR … `/trpc` yüzeyinin kimlik+üyelik gerektirmeyen
  TEK dalı artık `publicTenantProcedure`'dür — bu builder'ın KENDİSİ değil". `auth-exempt-paths.ts`
  ölçümüyle tutarlı (kümedeki tek `/trpc` yolu `storefront.currentTenant`).
- `trpc.ts:219-240` (`publicTenantProcedure` JSDoc'u) **üç zorunlu cümleyi taşıyor**: ① kimlik yok
  ② kiracı iki katmanda (TenantGuard + `requireTenant`, **değiştirilmeden paylaşılan**)
  ③ her prosedürün tam yolu `AUTH_EXEMPT_PATHS`'e tek tek + ADR-0012'nin dört koşulu (A/B/C/D
  birebir sayılmış).
- `trpc.controller.ts:26-36` cümlesi **ADR-0012 atfıyla güncellenmiş**: *"Kimse `publicProcedure`'ü
  … bu iki kümeye GEREKÇESİZ satır eklemeye KALKMASIN — her ekleme ADR-0012 gibi AYRI ve AÇIK bir
  karar gerektirir"*. Dördüncü builder'ın varlığı cümleyi geçersizleştirmemiş, **daraltmış**.
- `requireTenant` (`trpc.ts:195-201`) **değiştirilmemiş**, iki builder paylaşıyor — kopya yok.

### 4. Port sınırı ✔ **GEÇTİ**

- `storefront-tenant-read.port.ts` ve `storefront-tenant.schema.ts` **yeni, ayrı** dosyalar;
  `tenant-read.port.ts` başlığı yalnızca "ROADMAP v0.0.6, T-007/ST-2" taşıyor (T-009 izi **yok**)
  ve `tenant-summary.schema.ts` kök ihracı değişmemiş → `git diff` boşluğu **dolaylı olarak**
  doğrulandı (`Bash` yok).
- Port **total**: JSDoc *"Satır bulunamazsa port `AppError` fırlatır; bu fonksiyon
  `null`/`undefined` DÖNMEZ"*; adaptör (`storefront-tenant-read.port.adapter.ts:52-54`)
  `row === null` → `throw new TenantNotFoundError()`. Harness sahtesi de **total**
  (`harness.ts:168-180`, `null` dönmüyor, `AppError` reddediyor) — yani sahte, portun en önemli
  özelliğini (totallik) **taklit ediyor**.
- Resolver `null` kontrolü **yapmıyor**: `storefront.router.ts:29` tek ifade, sıfır dallanma.
- `packages/trpc/package.json` `dependencies` = `@arkesoft/errors`, `@trpc/client`, `@trpc/server`,
  `zod` — **`@arkesoft/tenancy` YOK**, ADR-0009 madde 5'in kapalı listesi korunmuş.
- Ayrılığın gerekçesi iki dosyada da yazılı; sızdırmazlık Zod'un soyma davranışına **değil**
  portun dönüş tipine dayandırılmış; `router-output.test-d.ts:71-82` hem **literal** hem export
  tipiyle pinliyor (literal pin, totoloji karşıtı — doğru kurulmuş).

### 5. Üç tek-literal garantisi ✔ **ÜÇÜ DE GEÇTİ** (birinde yorum cümlesi fazla iddialı)

| Garanti | Ölçüm | Sonuç |
| ------- | ----- | ----- |
| `'private, no-store'` tek yerde | üretim: `cache-policy.ts:22` **tek**; istisna listesi **yok** (fonksiyon gövdesi tek `headers.set`, sıfır dal); `Vary` **yazılmıyor** (`cache-policy.test.ts:40-46` pinliyor) | ✔ |
| `process.env` tek dosyada | üretim: `storefront-env.ts:72` **tek** | ✔ (yorumun "`src/**`" ifadesi test dosyalarını saymıyor → low bulgu) |
| `request-origin.ts` saflığı | `env`/`storefrontEnv`/`primaryDomain`/`APP_BASE_DOMAIN`/`X-Forwarded-Proto` → **0 kod eşleşmesi**; `requestUrl.host`/`.hostname` **okunmuyor** (yalnızca `.protocol` + `.port`), ve `request-origin.test.ts:36-47` bunu **ayırt edici** bir vakayla ölçüyor (farklı host + farklı port) | ✔ |

### 6. K13b uyumu — `.astro` dosyaları **kaynak okunarak** denetlendi ✔ **GEÇTİ**

Dört `.astro` dosyasının **tamamını** okudum (`BaseLayout.astro`, `index.astro`, `404.astro`,
`503.astro`):

| Yasak | Bulgu |
| ----- | ----- |
| Koşul (`&&`, `? :`, `if`) | **0** — `BaseLayout.astro:30` adlandırılmış slot (`head-extra`) kompozisyonuyla çözülmüş; 404/503 kendi `<meta robots>`'unu, `index.astro:24` kendi `<link canonical>`'ını slota geçiriyor |
| Döngü (`map`, `for`) | **0** |
| `try`/`catch` | **0** |
| fetch / ağ | **0** |
| env okuma | **0** |
| Tür dönüşümü / `as` | **0** |
| Frontmatter'daki tek mantık | `index.astro:15` `requireResolvedTenant(Astro.locals.tenant)` — **tek fonksiyon çağrısı**, daraltma mantığı `.ts`'te (`storefront-tenant-context.ts:36-47`) ✔ |
| `Astro.response.status` | **0** (`src/pages/**` genelinde `response.status` eşleşmesi yok) → **I-404 değişmezi korunuyor** ✔ |

K13b'nin telafisi **gerçekten** uygulanmış. Üç kapıdan geçmeme borcu (vade v0.0.9) için bulgu
**yazılmadı**, talimata uyuldu.

### 7. İki düzeltme turunun kalitesi — **FIX 2 temiz, FIX 1 yarım ölçülmüş**

**FIX 1 (self-rewrite döngüsü):**
- I-404 ✔ (`src/pages/**` → `response.status` 0; durum yalnızca `middleware.ts`'in `withStatus`'u).
- Reddedilen alternatifler **üçü de** gerekçeli yazılmış (`middleware.ts:58-73`: `next('/404')`'ün
  aynı re-entrancy'yi paylaştığı, elle `new Response` ile iki render yolu sapması, 3xx'in durumu
  yanlış bildirmesi) — kaliteli.
- **Birim testi re-entrancy'yi GERÇEKTEN simüle ediyor** (`middleware.test.ts:259-311`):
  `rewrite(path)` sahtesi, `url.pathname`'i rewrite hedefine çevirmiş **yeni bir context** ile
  `onRequest`'i **yeniden çağırıyor**; harness Astro'nun `state.counter === 4` eşiğini modelliyor
  ve 4. girişte `onRequest`'i çağırmadan "Loop Detected" döndürüyor. Mock'un arkasına
  **saklanmıyor** — (a) seçeneği meşru ve gerekçesi yazılı. **Ama tek vaka** → `/503` kolu
  mutasyonla ölçülmüyor (medium bulgu), gövde hiçbir seviyede pinli değil (medium bulgu).

**FIX 2 (`map-api-error.ts`):**
- İki probe ✔ · fail-closed ✔ (`:102-103`, hiçbir probe eşleşmezse `unavailable`) ·
  **fırlatmıyor** ✔ (`mapApiError` içinde `throw` yok; `map-api-error.test.ts:95-112`
  `undefined`/`null`/düz `Error`/HTML/boş nesne/**döngüsel `cause`** için `not.toThrow()`) ·
  `instanceof` **0** ✔ · `safeParse` `middleware.ts`'te **0** ✔ (şema adı/Zod aracı o dosyada hiç
  geçmiyor, dosya başı yorumunun `:33-36`'daki iddiası **doğru**).
- `middleware.ts:190-199` exhaustive `switch` + `default: assertNever` ✔. (Not: `switch`
  **`default` içeriyor** ama içeriği `assertNever` — handoff'un "`default` YOK" beklentisiyle
  biçimsel fark; `assertNever`'lı `default` CLAUDE.md §4'ün önerdiği kalıbın **kendisi** ve
  `apps/api/src/errors/error-mapping.ts:132` emsaliyle birebir. Bulgu yazmadım.)
- **Zarf (b)'nin ulaşılamazlığı ölü kod SAYILMADI** — gerekçe `map-api-error.ts:36-41`'de
  **açıkça ve anlaşılır** yazılı: bugün `TenantGuard` HTTP seviyesinde önce reddediyor, dal
  ADR-0012 madde 8'in lafzı + gelecek prosedür hataları için korunuyor, **terfi tetikleyicisi
  adıyla belirtilmiş** (üçüncü tüketici `apps/superadmin` v0.0.20 veya dördüncü zarf şekli).
  Yorumun orada ve anlaşılır olduğunu **doğruladım**.
- Ponyfill üç yola ayrılmış ✔ (`storefront-server-fetch.ts:247-286`), çift ayrıştırma **kasıtlı
  ve gerekçeli** (tek doğruluk kaynağı `rawBody` kalsın diye) — gereksiz karmaşıklık değil.

**`assertNever` dördüncü kopyası:** değerlendirme low bulgusunda; **terfi önermiyorum**, gerekçe
orada ölçülü.

### 8. Test kalitesi — "mock gerçeği taklit etmiyor" sınıfının başka örneği var mı?

**Somut cevap: bu sınıfta yeni bir örnek BULAMADIM.** Dördünü tek tek ölçtüm:

| Denetlenen | Mock neyi taklit ediyor | Taklit, taklit ettiği şeyin **en önemli** özelliğini taşıyor mu |
| ---------- | ----------------------- | --------------------------------------------------------------- |
| `api-client.test.ts` | `createTrpcClient` + `createStorefrontServerFetch` | **Evet, ama farklı bir yolla:** bu dosya davranışı değil **argümanları** ölçüyor (URL yetkisi ↔ bağlantı hedefi ayrımı) ve bu ayrım K18'in **tam** özü. Gerçek davranış `storefront-server-fetch.test.ts`'te **gerçek `node:http` sunucusuyla** ölçülüyor → sınıf kapalı. Tek boşluk: `https:` → 443 dalı test edilmiyor (önemsiz) |
| `storefront-tenant-context.test.ts` | mock yok (saf fonksiyon) | Sınıf uygulanamaz. Üçüncü testin **totoloji** olması ayrı bir kusur (low bulgu) |
| `harness.ts`'in yeni portu | `StorefrontTenantReadPort` | **Evet** — sahte **total** (`null` dönmüyor, `AppError` reddediyor) ve dönüşü bilerek `{name}`'e indiriyor; portun iki ayırt edici özelliği (totallik + sızdırmazlık) **ikisi de** taklitte var |
| `create-test-app-fail-closed.test.ts` | mock yok — **gerçek** `createTestApp()` çağrılıyor | **Evet** — iki kapı gerçek senaryoyla tetikleniyor (`process.env.NODE_ENV='development'`; `REDIS_URL` host'u `redis.example.com`), hata **mesaj regex'iyle** pinli. Totoloji değil |

**Bu sınıfın karşıtı olan güçlü kanıt:** `storefront-server-fetch.test.ts:269-310` (A-A6)
**gerçek** `@trpc/client` + **gerçek** ponyfill + **gerçek** `node:http` sunucusu kurup
`cause` derinliğini **ölçüyor** ve `mapApiError`'ın "azami 1 seviye" sınırının yeterli olduğunu
**sessizce artırmadan** kanıtlıyor. Bu, FIX 2 için projenin dersi alınmış hâli.

**S7'nin sekiz pini — pin mi totoloji mi? Cevap: PİN.** `auth-exempt-paths.test.ts` kardinalite
(`:28`) + **küme eşitliği** (`:32`) + pozitif tam eşleşme (`:36,39-41`) + **iki negatif**
(`:76-82`: `session.me` ve `tenant.current` **false** → "tam olarak bir yolun açıldığının"
kanıtı) + prefix/case/kök yol/sorgu dizesi reddi taşıyor. Küme eşitliği olduğu için "sıfır
kullanımda da geçer" kusuru **yok** — eleman çıkarılırsa da eklenirse de kırmızı olur.
`TENANT_EXEMPT_PATHS`'in 13'te kalması `tenant-exempt-paths.test.ts:79-85`'te ayrıca pinli.
**Bildirim–kullanım boşluğu da kapatılmış:** `trpc-http.test.ts:335-338` gerçek HTTP yanıtı
üzerinde oturumsuz 200'ü **ve** gövdenin küme eşitliğini ölçüyor; `trpc-cross-tenant.isolation.test.ts:230`
çapraz okumayı **ayrı `describe`**'da (iki güven seviyesi karıştırılmamış).

**e2e'nin gövdeyi pinlememesi — kararım: BULGU (medium), öneri değil.** Gerekçe yukarıda M4'te.

---

## KONTROL LİSTESİ

- [x] Tek sorumluluk ihlali arandı — `onRequest` yedi adım taşıyor **ama** bu K21'in açık kararı
  ("tek yetki noktası") ve I-404'ün dayanağı; ADR'ye dayanan bir tasarım kararına kişisel tercih
  dayatmadım. Yalnızca **yapısal** sonucunu (dört çağrı yerinde sözleşmeyle korunan değişmez) low
  olarak yazdım.
- [x] Katman ve paket sorumluluk sınırları doğrulandı — ihlal **0**
- [x] Bağımlılık yönü korunuyor; döngüsel bağımlılık **0**
- [x] Dış sağlayıcılar arayüz arkasında; çekirdekte sağlayıcı dallanması **0**
- [x] Gerçek tekrar arandı — `StorefrontTenant`'ın iki bildirimi **yüzeysel benzerlik** sayıldı ve
  birleştirme **önerilmedi** (locals sözleşmesi ≠ tel sözleşmesi); `messages.ts`'in `title`/`heading`
  aynılığı da **tekrar sayılmadı** (ux kararı, ayrı sebeplerle değişecek). `assertNever`'ın dördüncü
  kopyası için terfi **önerilmedi** (gerekçe ölçülü)
- [x] Gereksiz soyutlama ve erken genelleme arandı — `getText` sarmalayıcısı (low); başka yok
- [x] İsimlendirme tablosuna uyum — **tam**: dosyalar kebab-case (`map-api-error.ts`,
  `storefront-server-fetch.ts`), React bileşeni PascalCase (`TenantGreeting.tsx`), `.astro`
  sayfaları Astro'nun rota sözleşmesi gereği (`index`/`404`/`503`) + layout PascalCase
  (`BaseLayout.astro`), tipler PascalCase, sabitler SCREAMING_SNAKE_CASE
  (`STOREFRONT_CACHE_CONTROL`, `NORMALIZED_BASE_DOMAIN`, `API_REQUEST_TIMEOUT_MS`), hata kodu
  SCREAMING_SNAKE_CASE, tRPC prosedürü `storefront.currentTenant` (`namespace.action`). Belirsiz ad
  (`data`/`temp`/`handle`/`process`) **0**. Boolean öneki gereken yeni boolean **yok** (`hydrated`
  bir React state; `is` öneki tartışılabilir ama `useState` idiomuyla tutarlı → bulgu yazmadım)
- [x] `any` / `@ts-ignore` / gerekçesiz `as` arandı — **0** (kapsam yukarıda)
- [x] Hata yönetimi deseni doğrulandı — `catch {}` **0**; `storefront-server-fetch.ts:201` boş
  `catch` **değil** (`return undefined` ile açık, gerekçeli sınıflandırma kararı); hata `null`'a
  çevrilmiyor; port total; sağlayıcıya/çerçeveye özgü tip (`TRPCClientError`) `instanceof` ile
  sızdırılmıyor, yapısal probe'la indirgeniyor
- [x] Test kalitesi değerlendirildi (davranış mı implementasyon mu) — madde 8
- [x] Ölü kod arandı — `storefrontTenantSchema` kök ihracı (low); `unresolved` dalı (M1 içinde);
  zarf (b) dalı **ölü kod sayılmadı** (gerekçesi yazılı)
- [x] Yorumlar *neden*i anlatıyor ve güncel — genel kalite **yüksek** (neden/reddedilen alternatif
  anlatımı örnek düzeyde); altı eskimiş/yanlış/fazla-iddialı cümle low olarak yazıldı
- [x] Her bulgu `dosya:satır` içeriyor
