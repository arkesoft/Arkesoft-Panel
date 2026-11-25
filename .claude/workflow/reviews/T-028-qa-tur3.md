# T-028 — `qa` gate, tur 3 (TAM yeniden denetim)

**Tarih:** 2026-11-24 · **Sürüm:** v0.0.17 (platform 0.12.0 → 0.13.0 adayı) · **Faz:** gate turu 3, paralel ajan yok, senden sonra yalnızca `release`

```
GATE: qa
SONUÇ: PASS
```

---

## 1. Kabul kriteri eşlemesi — AC-52 … AC-63 (13 kriter, tek satır sonuç)

| AC | Kriter (özet) | Sonuç | Kanıt |
| --- | --- | --- | --- |
| AC-52 | `traceId` log alanı + `requestId` tek kez | **GEÇTİ** | `log-correlation.test.ts` yeşil (tam süit koşumunda doğrulandı, kök `pnpm test` 2/3 çalıştırmada 115/115 dosya yeşil) |
| AC-53 | Tek `traceId` zinciri (HTTP→DB→kuyruk, bellek-içi exporter) | **GEÇTİ** | `queue-trace-propagation.test.ts` (3 halka, gerçek Postgres/BullMQ) + `observability-runtime-contract.test.ts` (a) Prisma span > 0, boşa-çıkmama — ikisi de tam koşumda yeşil |
| AC-54 | Yanıt başlığı `x-trace-id` (başarı **ve** hata) | **GEÇTİ** | `log-correlation.test.ts` (başarı, S4) + `app-exception-filter-log-level.test.ts` (hata, S8) — ayrı iki yazma yüzeyi, ikisi de yeşil |
| AC-55 | Span attribute güvenliği (derinlemesine tarama, L-12) | **GEÇTİ** | `audit-log-no-log-leak.test.ts` → `findForbiddenFieldDeep` 5 test (üst seviye/iç içe/dizi-içi/temiz/birincil tip) + mutasyon kanıtı (özyinelemeli dal geçici kaldırıldı → 2/5 kırmızı → geri alındı) — kaynakta okudum, kanıt gerçek |
| AC-56 | `logLevel` additive + dört-anahtar pini + `test:contract` diff 0 | **GEÇTİ** | `app-error.test.ts`/`error-body.test.ts` yeşil (tam koşumda) · kendim koşturdum: `pnpm test:contract --force` → 34/34, `git diff --stat -- docs/api-contract-surface.json` → **boş** |
| AC-57 | Sentry sahte taşıyıcı, DSN boşken no-op (sıfır zarf/soket) + SIGTERM→exit 0 | **GEÇTİ** | `sentry-invariants.test.ts` describe (2) (DSN yok→0 zarf, lsof delta 0) + `observability-runtime-contract.test.ts` (b)/(d) (gerçek alt süreç, lsof -iTCP 0 satır, SIGTERM exit 0) — tam koşumda yeşil |
| AC-58 | `pnpm env:check` yeni değişken tanımlanmadan yeşil | **GEÇTİ** | kendim koşturdum: `pnpm env:check` → exit 0, `git diff --stat -- .env.example` → **boş** |
| AC-59 | `redactDeep` iki yönlü mutasyon (derinlik-3 sızmaz, kontrol kalkınca kırmızı) | **GEÇTİ** | `redaction.test.ts` describe `redactDeep — AC-59` yeşil (tam koşumda); mutasyon kanıtı dosya içinde belgeli |
| AC-60 | `docs/observability.md` dürüst, dayanaksız eşik sayısı 0 | **GEÇTİ** | `docs/observability.md`'yi tam okudum — "Bugün çalışmayanlar" bölümü brief'in istediği dört eksiği de açıkça sayıyor (exporter yok, `trace-attributes.ts` tüketicisiz, `guards`'ın 25. adımı CI'da yok, ESM `node:http` yakalanmıyor); perf'in +%258 sayısı "olduğu gibi, kabul edilebilir denmeden" raporlanmış; ADR-0029'da 8 satırlık "değerlendirilen alternatifler" tablosu gerçekten var. Üç yasak ifade taraması (`gözlemlenebilirlik tamamlandı`/`CI'da kapılı`/`izleme eklendi`) → **0 eşleşme** (kendim grep'ledim) |
| AC-61 | `guards` 24→25 (DSN biçimi 0, reddedilen meta-paket 0) | **GEÇTİ** | kendim koşturdum: `pnpm guards` → 25/25 adım PASS, "AC-61 — Sentry DSN sızıntısı + reddedilen OpenTelemetry meta-paketi (T-028/S10)" iki alt kontrol de PASS |
| AC-62 | Sentry değişmezleri mekanik pin (altı `dataCollection` alanı + **beforeBreadcrumb**) | **GEÇTİ — düzeltme turu 2 sonrası yeniden ölçüldü** | `sentry-invariants.test.ts`'i baştan sona okudum: altı alan (`userInfo`/`httpBodies`/`cookies`/`httpHeaders`/`urlQueryParams`/`stackFrameVariables`) tek tek statik pinli **ve** `beforeBreadcrumb: () => null` için **YENİ bir statik pin eklenmiş** (`:263-265`, "M3 düzeltmesi" yorumuyla, davranışsal kanıt ayrı dosyada). `sentry.ts`'in kendisini okudum — kod bu pinlerle birebir örtüşüyor |
| AC-63 | `PINO_REDACT_PATHS` bugünkü **28** girdinin süperkümesi | **GEÇTİ** | `redaction.test.ts` describe `PINO_REDACT_PATHS — AC-63` tam koşumda yeşil; `po`'nun düzeltmesi (28, 29 değil) ROADMAP'te kayıtlı |

**Karşılıksız kriter: YOK.** 13/13 geçti.

---

## 2. Tur 2'nin M3'ü — akıbeti

`sentry.ts:241`'e `beforeBreadcrumb: () => null` eklendi. Benim tur 2'de yazdığım
`sentry-console-breadcrumb-leak.test.ts` dosyasını **tekrar okudum, hiçbir satırı
değişmemiş** (git'te takipsiz olduğu için `git diff` göstermiyor, ama dosya içeriğini
`Read` ile baştan sona kontrol ettim — eşik düşürme/`skip`/assert gevşetme yok).
Kendi koşturduğum tam süit çalıştırmalarında (`pnpm test`, 3 bağımsız koşum) bu dosya
**her üçünde de 1/1 PASS**. ⇒ **Testim DEĞİŞTİRİLMEDEN yeşile döndü** — gevşetme değil,
üretim düzeltmesi.

Ayrıca `sentry-invariants.test.ts`'e M3 için **ek bir statik pin** eklenmiş (regresyon
ikinci kilidi) — bu da benim testimden ayrı, `backend`'in attığı ek güvence.

---

## 3. Dürüstlük denetimi — `docs/observability.md` + ADR-0029

**Sonuç: dayanaksız iddia bulunamadı.**

- "Bugün çalışmayanlar" bölümü (§9) brief'in işaret ettiği dört eksiğin **hepsini**
  açıkça yazıyor: span/metrik/log exportu yok, `trace-attributes.ts`'in canlı tüketicisi
  yok, `guards`'ın 25. adımı CI'da koşmuyor, ESM `node:http` yakalanmıyor (dört izole
  denemeyle gerekçeli).
- perf'in `+160ms/+%258` açılış maliyeti "mutlak eşik yok, sayı olduğu gibi raporlanıyor"
  diye yazılmış — "kabul edilebilir" denmemiş, load-average kesinlik uyarısı da aktarılmış.
- ADR-0029'un "Değerlendirilen alternatifler" tablosu **8 satır** — her biri somut (SDK
  meta-paketi, Sentry kendi tracer'ı, (A) breadcrumb filtresi, SIGTERM'e ekleme,
  10. paket, sdk-trace-base terfisi, ikinci ESM preload yolu, pino normalizasyonu) —
  uydurma/boş satır yok.
- Üç yasak ifade taraması (`gözlemlenebilirlik tamamlandı` / `CI'da kapılı` / `izleme
  eklendi`) `docs/observability.md`, ADR-0029, ROADMAP.md, CHANGELOG.md, `.changeset/`
  üzerinde kendim çalıştırdım → **0 eşleşme**.
- ROADMAP'in `v0.0.17` başlığı `✅ (tamamlandı: 2026-11-24, daraltılmış kapsam)` — kapsam
  revizyonunu gizlemiyor, kutu bazında `[x]`/`[ ]` ayrımı tutarlı (Sentry/Grafana kutuları
  bilerek `[ ]` işaretli, gerekçesi satırda).
- `grep -n "Vade:.*v0.0.17" ROADMAP.md` → ham eşleşme **15** (raw grep -c 0 DEĞİL) — ama
  tek tek okudum: **hepsi** ya `✅ … (kapandı, T-028)` ya da `⚠ v0.0.17 → **v0.20.0**
  (yeniden tarihlendirildi…)` biçiminde; gerçekten **açık** (kapanmamış, yeniden
  tarihlendirilmemiş) `Vade: v0.0.17` satırı **sıfır**. `docs`'un "açık satır 0" ifadesi
  ham grep sayısı değil, bu süzülmüş anlamda **doğru**. Ayrıca `docs` orijinal dokuzlu
  listenin dışında bir **onuncu** konu-dışı borcu da kendi ölçüp yeniden tarihledi
  (`:3854`, dosya adlandırma niti) — bu şişirme değil, brief'in istediğinden fazlası.

---

## 4. Zorunlu kapı — kendim koşturdum, gerçek çıktı

```
pnpm lint                   → 25/25 PASS
pnpm typecheck               → 25/25 PASS
pnpm build                   → 15/15 PASS
pnpm test                    → 3 bağımsız tam koşum:
                                 koşum 1: 114/115 dosya, 942/943 test — 1 FAIL (bkz. §5, flaky)
                                 koşum 2: 115/115 dosya, 943/943 test — PASS
                                 koşum 3: 115/115 dosya, 943/943 test — PASS
pnpm test:isolation          → 12/12 PASS (31 test, apps/api 6 dosya)
pnpm guards                  → 25/25 adım PASS, FAIL 0
pnpm format:check            → exit 0 ("All matched files use Prettier code style!")
pnpm env:check                → exit 0, .env.example diff boş
pnpm test:contract --force   → 34/34 PASS, cache bypass teyitli ("force executing"),
                                 docs/api-contract-surface.json diff boş
```

`apps/api` test içinde: `sentry-console-breadcrumb-leak.test.ts` 1/1 PASS (3 koşumun
hepsinde) · `sentry-invariants.test.ts`, `sentry-dsn-malformed-fail-closed.test.ts`,
`sentry-request-data-pipeline-positive-control.test.ts`, `observability-runtime-contract.test.ts`,
`observability-shutdown-order.test.ts`, `instrumentation-factory.test.ts`,
`queue-trace-propagation.test.ts`, `app-exception-filter-log-level.test.ts` — hepsi
PASS (3 koşumun hepsinde, tek istisna §5'teki alakasız flaky).

**Dependency denetimi:** `apps/api/package.json`'da `dependencies` altında onaylanan
8 paket (`@opentelemetry/api`, `-instrumentation-http`, `-instrumentation-ioredis`,
`-sdk-node`, `-semantic-conventions`, `@prisma/instrumentation`, `@sentry/node`,
`bullmq-otel`) var; `@opentelemetry/sdk-trace-base` **`devDependencies`'te** (test-only
onayla birebir tutarlı — üretime terfi ETMEMİŞ, ADR-0029'un "terfi gereksiz çıktı"
kaydıyla uyumlu). Fazladan/onaysız paket yok.

---

## 5. Flaky kontrolü — ÖLÇÜLDÜ, sayı aşağıda

**Ölçüm (ölçülmedi değil — 3 bağımsız tam `pnpm test` koşumu):**

```
koşum 1 (20:28): tenant-resolution.test.ts > AC6 > "production + bilinmeyen host + ..."
                 → Error: Test timed out in 5000ms  (createTestApp bootstrap)
koşum 2 (20:32): AYNI test → PASS
koşum 3 (20:36): AYNI test → PASS
```

Oran: **1/3** tam koşum FAIL. İzole koşum (`npx vitest run src/__tests__/tenant-resolution.test.ts`)
→ **7/7 PASS, 3.43s** — tek başına hiç zaman aşımına yaklaşmıyor.

**Nedensel inceleme (mekanik izolasyon):**
- Makine yükü ölçüldü: `uptime` → `load averages: 8.00-10.90` (10 çekirdek) — kendi
  koşumlarım sırasında sürekli yüklüydü; `docker ps` → 26 konteyner (kullanıcının
  başka işi, dokunulmadı).
- `observability.module.ts`'i okudum: `SentryBootstrapInitializer.onModuleInit()`
  `startSentry({ dsn: env.SENTRY_DSN })` çağırıyor; test ortamında `SENTRY_DSN`
  tanımsız ⇒ `startSentry` **ilk satırda erken döner** (`sentry.ts:171-173`) — bu
  modülün `createTestApp()` bootstrap'ına eklediği maliyet **ölçülemez derecede
  düşük** (gerçek `Sentry.init` hiç çağrılmıyor).
- `instrumentation.ts` (NodeSDK, +160ms/+%258 perf'in ölçtüğü asıl maliyet) **yalnızca
  `main.ts`/`main.worker.ts`'in ilk import'u** — `createTestApp()` `Test.createTestingModule`
  ile doğrudan `AppModule`'ü kurduğu için bu dosyadan **hiç geçmiyor** (grep: bu test
  yardımcısında `instrumentation` 0 eşleşme).

**Sonuç:** bu flake **T-028'in gözlemlenebilirlik diffinin bir ürünü DEĞİL** —
`backend`'in S6 DoD'sinde zaten kayıtlı olan **aynı sınıf** (R-S6-6: "member-owner-invariant
tam-paket koşumunda bir kez Mailpit-sınıfı altyapı paralelliğiyle düştü, izole koşumda 7/7")
flake'in bu turda **farklı bir dosyada** tekrar gözlenmesi — kök neden 115 paralel
Vitest worker'ının yüklü (8-10 load-average, 10 çekirdek) bir makinede her birinin
kendi `createTestApp()` Nest bootstrap'ını açması, bu testin özelinde 5000ms'lik
varsayılan test timeout'una **marjinal olarak** çarpması.

**Derece: `low`** (ölçülmüş, nedensel açıklaması mekanik, T-028 diffine atfedilemez,
zaten kayıtlı bir sınıfın tekrarı — yeni bir regresyon değil). Düzeltme turu açmıyorum.
Takip: bu test dosyasının kendi bootstrap timeout'u genel bir sertleştirme sürümünde
(ör. `createTestApp` testlerine makine-yükü-duyarlı bir timeout bütçesi) ele alınabilir —
**borç**, sorumlu `qa`+`devops`, vade v0.20.0.

---

## 6. Yeni eksik senaryo avı (düzeltme turu 2'nin açtığı boşluk var mı)

- **`beforeBreadcrumb: () => null` — tüm breadcrumb kanallarını kapatıyor, teşhis
  kaybı mı?** İnceledim: bu sürüm zaten `tracesSampleRate: 0` ile trace toplamıyor,
  teşhis akışı pino logları + `traceId` korelasyonu üzerinden yürüyor (dosya başı
  yorumu bunu açıkça gerekçeliyor, `docs/observability.md` §4 de aynı gerekçeyi
  tekrarlıyor). Breadcrumb'ın kaybı **bilinçli, belgeli, geri dönüşü v0.18.0'da
  gerçek exporter geldiğinde yeniden değerlendirilecek** (ADR-0029 §Gözden geçirme
  koşulları, madde 2 ile dolaylı örtüşüyor). Yeni bulgu **yok**.
- **`http`/`fetch` breadcrumb'ı için ayrı bir davranışsal pin gerekli mi?** Statik pin
  (`sentry-invariants.test.ts:263-265`) `beforeBreadcrumb` alanının KOD'da var olduğunu
  pinliyor; davranışsal kanıt yalnızca `console` kanalı için var. Diğer beş kanal
  (http/fetch/childProcess/workerThreads/supabase) için ayrı bir runtime testi
  **yazılmadı** — ama bunun gerekçesi sağlam: `addBreadcrumb()`'ın **tek, ortak** giriş
  noktası olduğu kaynak kodundan (Orkestratörün önceki turda okuduğu
  `@sentry/core/.../breadcrumbs.js:10-23`) doğrulandı; altı kanalın hepsi aynı
  fonksiyona akıyor, birini davranışsal test etmek mekanizmanın kendisini test eder.
  Beş kanal için ayrı test yazmak Sentry SDK'sının kendi iç yönlendirmesini test etmek
  olurdu — kapsam dışı. **Yeni bulgu açmadım**, ama not: statik pin kaldırılırsa (birisi
  `beforeBreadcrumb` satırını silerse) hem bu pin hem `sentry-console-breadcrumb-leak.test.ts`
  kırmızı olur — çift kilit yeterli.
- Yeni `.skip`/`.only`/`test.todo`: tüm yeni/değişen test dosyalarında **0 eşleşme**
  (kendim grep'ledim).

**Yeni critical/high/medium bulgu: YOK.**

---

## 7. Tenant izolasyonu

Bu Task'ta yeni tenant'a bağlı kaynak (tablo/endpoint) **yok** — `packages/db`'ye
dokunulmamış (0 dosya, `security` tur 2'nin de doğruladığı gibi). Çapraz tenant
okuma/yazma testi gerekmiyor. Mevcut `trpc-cross-tenant.isolation.test.ts` tam
koşumda yeşil kaldı (regresyon yok).

---

## Ölçümler (özet)

```
KABUL KRİTERİ EŞLEMESİ: AC-52…AC-63 → 13/13 GEÇTİ (yukarıdaki tablo)
TEST SAYILARI: apps/api 115 dosya / 943 test (2/3 koşumda tam yeşil, 1/3 koşumda
                1 alakasız flaky FAIL — bkz. §5) · packages/errors 101 test (tam
                koşumda yeşil) · packages/trpc 228 test (değişmedi, yeşil) ·
                test:isolation 12/12 (31 test) · yeni test: BU TURDA eklenmedi
                (tur 2'nin 4 testi — M1/M2/M3/eksik-senaryo — sağlam, hiçbiri
                kaybolmadı/değişmedi)
KOŞTURULAN KOMUTLAR:
  pnpm lint                   → exit 0  (25/25)
  pnpm typecheck               → exit 0  (25/25)
  pnpm build                   → exit 0  (15/15)
  pnpm test (×3)                → 2× exit 0 (943/943) · 1× exit 1 (942/943, flaky, §5)
  pnpm test:isolation          → exit 0  (12/12, 31 test)
  pnpm guards                  → exit 0  (25/25 adım PASS)
  pnpm format:check            → exit 0
  pnpm env:check                → exit 0
  pnpm test:contract --force   → exit 0  (34/34, cache bypass teyitli, diff 0)
  npx vitest run tenant-resolution.test.ts (izole) → exit 0 (7/7, 3.43s)
  uptime / docker ps            → yük teyidi (load avg 8.00-10.90, 26 konteyner)
  git diff --stat (.env.example, docs/api-contract-surface.json) → ikisi de boş
  grep (3 yasak ifade + Vade:.*v0.0.17)             → sonuçlar §3'te
KOŞTURULMAYAN (brief'in yasakladığı): pnpm test:e2e, pnpm test:visual — DOM
  değişikliği 0 olduğu için gerekmiyor, koşturulmadı.
```

## Bulgular

- [SEV: low] `apps/api/src/__tests__/tenant-resolution.test.ts:163` — makine yükü
  altında (`createTestApp()` bootstrap'ı 5000ms test timeout'una marjinal çarpıyor)
  1/3 tam `pnpm test` koşumunda flaky FAIL verdi, izole koşumda ve diğer 2/3 tam
  koşumda PASS. Mekanik izolasyon + nedensel açıklama §5'te. T-028'in gözlemlenebilirlik
  diffine atfedilemez (ObservabilityModule test ortamında no-op, instrumentation.ts
  `createTestApp()` yolundan hiç geçmiyor) — önceden kayıtlı aynı flake sınıfının
  (R-S6-6) tekrarı. Önerilen düzeltme: makine-yükü-duyarlı timeout bütçesi veya bu
  sınıf testler için daha yüksek bir `testTimeout`. Sorumlu ajan: `qa` + `devops`,
  vade v0.20.0 (borç, tur açmıyor).

Başka bulgu yok.
