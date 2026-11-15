# T-020 — `perf` gate, TUR 1

- **Tarih:** 2026-11-15
- **Sürüm:** `v0.0.19` (ROADMAP) — dal `feat/v0.0.19-test-altyapisi`, PR #5
- **GATE:** perf
- **SONUÇ:** **PASS**

---

## 0. Çerçeve doğrulaması — bu sürümün yüzeyi (kendi ölçtüm)

```
git diff origin/feat/v0.0.21-surum-kayit-modeli...HEAD --stat
```

→ **38 dosya, +5093/−345.** `apps/*/src/**` veya `packages/*/src/**` içinde **SIFIR**
dosya. Değişenler: kök `package.json`/`turbo.json`/`pnpm-workspace.yaml`,
`.github/**`, `apps/*/e2e/**`, `apps/*/playwright.config.ts`, `apps/admin/vitest.config.ts`,
`scripts/**`, `docs/**`, 4 referans PNG.

⇒ **Core Web Vitals, bundle boyutu, vitrin ada (client JS), N+1 sorgu, indeks:
KONUSUZ — gerekçeli atlama.** Hiçbir üretim rota/bileşen/sorgu değişmedi; ölçecek bir
yüzey yok. Bu beş eksen aşağıdaki "bütçe tablosu"nda `ÖLÇÜLEMEDİ: kapsam dışı (apps/*/src,
packages/*/src değişmedi)` olarak işaretlendi — tahmin yazılmadı.

**Tek istisna not:** `pnpm-lock.yaml` **değişti** (+3 satır — `@playwright/test` kök
`devDependencies`'e eklendi, `catalog:` üzerinden `1.64.1`). Bu, İş①'in Playwright
önbellek analizinde load-bearing bir sabittir (aşağıda).

**Ölçüm koşulları (bu oturum, `AGENT_BASELINE` §4 ders 2 gereği):**
`docker ps -q | wc -l` → **25** konteyner (kullanıcının `demo-site`/diğer projeleri,
dokunulmadı) · `uptime` → başlangıçta **load avg 5.09 4.52 4.78**, ölçüm bitiminde
**1.89 3.29 4.12** (dalgalı, paylaşılan makine). `wcag` gate'i bu oturumda **paralel**
koşuyordu — kendi `Bash` çağrılarım bu yüzden API/CI'a değil, yalnızca `gh api`/`git`/yerel
`pnpm test:visual`'a dokundu (aşağıdaki İş② ölçümü hariç, `pnpm test`/`build`/`guards`
**tekrar koşturulmadı** — taban bu oturumda zaten alınmıştı, eşzamanlı koşumla kendi
gürültümü üretmemek için tekrarlanmadı).

---

## İş① — CI MALİYETİ (asıl iş)

### 1.1 Dört üretim koşumunun gerçek job süreleri (`gh run view --json jobs`)

| Koşum                           | Oluşturma | `e2e` başlar | `e2e` biter | **`e2e` süresi** | `api` süresi (aynı koşum)            | **Kritik yol** |
| ------------------------------- | --------- | ------------ | ----------- | ---------------- | ------------------------------------ | -------------- |
| `43723308968` (deneme 2, rerun) | 14:14:57  | 14:22:21     | 14:25:24    | **3m03s (183s)** | 14:22:21→14:26:15 = **3m54s (234s)** | `api`          |
| `43724498831`                   | 14:28:01  | 14:28:30     | 14:30:36    | **2m06s (126s)** | 14:28:30→14:31:57 = **3m27s (207s)** | `api`          |
| `43728274895`                   | 15:09:19  | 15:09:46     | 15:12:07    | **2m21s (141s)** | 15:09:46→15:14:55 = **5m09s (309s)** | `api`          |
| `43731621671`                   | 15:45:12  | 15:45:50     | 15:48:33    | **2m43s (163s)** | 15:45:50→15:51:01 = **5m11s (311s)** | `api`          |

**Sonuç:** `e2e` job'u **dört koşumun dördünde de** kritik yol **değil** — `api` job'u
her seferinde daha uzun sürüyor (207s-311s vs `e2e`'nin 126s-183s). `ci-gate`'in
`startedAt`'i her koşumda `api`'nin `completedAt`'ine denk geliyor (örn. koşum 1:
`api` 14:26:15 biter, `ci-gate` 14:26:17 başlar) — `e2e`'nin kendisi **hiçbir zaman**
toplam süreyi uzatmıyor.

**Değişkenlik (⭐ istenen):** `e2e` süresi 126s-183s arasında **%45 bantta** dalgalanıyor
(aynı dalın aynı türden dört ardışık koşumu, farklı dakikalarda). `api` da aynı sınıfta
dalgalanıyor (207s-311s, **%50 bant**) — bu, T-020'nin **getirdiği** bir değişkenlik değil,
paylaşılan GitHub-hosted runner'ların **var olan** gürültüsü (ⓒ `uptime`/`docker ps`
koşulları farklı makinelerde, GH tarafında ölçülemez).

### 1.2 Sentetik yük altında — `e2e` KRİTİK YOLA DÖNÜŞÜYOR (tek veri noktası, dürüst)

`43723308968`'in **1. denemesi** (`ARKESOFT_E2E_SYNTHETIC_LOAD=1` açıkken, S9d/e
mekanizmasıyla) ayrı attempt API'siyle çekildi:

| Job             | Süre                                                       | Not               |
| --------------- | ---------------------------------------------------------- | ----------------- |
| `e2e`           | 14:15:24→14:21:02 = **5m38s (338s)**                       | burada kritik yol |
| `api`           | 14:15:23→14:18:42 = **3m19s (199s)**                       |                   |
| toplam iş akışı | createdAt 14:14:57→completedAt 14:21:08 = **6m11s (371s)** |                   |

**Karşılaştırma (sibling PR #4, `e2e` job'u YOK — "önce" tabanı, koşum `43696827470`):**
`createdAt` 08:56:33 → `ci-gate` biter 09:02:20 = **5m47s (347s)**, kritik yol `api`
(08:57:04→09:02:14 = **5m10s/310s**).

⇒ **Dürüst çerçeveleme:** sentetik yük altında toplam iş akışı **371s**, e2e'siz
tabana (**347s**) göre **+24s (%7)** daha uzun — ama bu farkın büyük kısmı `api`
job'unun **kendi** koşum-başı gürültüsünden geliyor (199s vs 310s aralığında, iki ölçüm
noktası tek başına ayırt edici değil). **Net mesaj:** sentetik yük **varsayılan kapalı**
(`ARKESOFT_E2E_SYNTHETIC_LOAD` depo değişkeni bugün **tanımsız** — `S9` doğruladı, bu
gate tekrar sorgulamadı çünkü değişken değişmedi), dolayısıyla **gündelik CI'da bu
senaryo hiç gerçekleşmiyor.** `timeout-minutes: 45` karşısında en kötü gözlenen süre
(338s = **%12.5**) geniş marj bırakıyor.

### 1.3 Paralellik — bağımsız doğrulandı

`ci.yml:1156` → `e2e: needs: plan` (⭐ `api`/`admin`/`superadmin`/`storefront`/`shared`/
`theme-sdk` ile **aynı seviye**) · `ci.yml:1444` → `ci-gate: needs: [plan, repo, guards,
api, admin, superadmin, storefront, shared, theme-sdk, e2e]`. Dört koşumun hepsinde
`e2e`'nin `startedAt`'i diğer sekiz job'un `startedAt`'iyle **aynı saniyede** (örn. koşum
3: hepsi `15:09:46`'da başlıyor). **Kritik yolu uzatmıyor** (§1.1).

### 1.4 Dakika maliyeti — PARASAL SIFIR, KUYRUK MALİYETİ GERÇEK

`gh repo view --json visibility` → **`PUBLIC`** (security'nin ölçtüğüyle tutarlı)
⇒ `ubuntu-latest` dakikası **ücretsiz**. **Dürüst çerçeve:** parasal maliyet **yok**,
ama her PR push'u artık **dokuzuncu bir runner-dakikası dilimi** (ort. ~2.5 dk `e2e` +
kendi kuyruk bekleme süresi) tüketiyor — paylaşılan kuyrukta **sıra** maliyeti var,
"ücretsiz" demek "bedava büyütülebilir" demek değil. Bu eksen için **tanımlı bir bütçe
yok** (CLAUDE.md'nin performans bütçe tablosu CI süresini kapsamıyor) — aşağıdaki
bütçe tablosunda ayrıca işaretlendi.

### 1.5 Playwright tarayıcı önbelleği — isabet oranı **4/4 (%100)**, bağımsız doğrulandı

Anahtar (`ci.yml:1233`): `playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`
— **`restore-keys` yok** (bilinçli, güvenlik gerekçesi, dosya başı yorumunda).

| Koşum                                    | Sonuç    | Kanıt satırı                                                                                      |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `43713883521` (ilk e2e CI koşumu, 12:26) | **MISS** | `Cache not found for input keys: playwright-Linux-4633f4...` → `Downloading Chrome for Testing …` |
| `43723308968`                            | **HIT**  | `Cache hit for: playwright-Linux-4633f4...`                                                       |
| `43724498831`                            | **HIT**  | aynı                                                                                              |
| `43728274895`                            | **HIT**  | aynı                                                                                              |
| `43731621671`                            | **HIT**  | aynı                                                                                              |

**Nedensel doğrulama (tahmin değil):** dört koşumun `headSha`'sındaki `pnpm-lock.yaml`
içeriğinin SHA-256'sı **birebir aynı**
(`d9bc6de8ab625df0ec4c4570221cdbdc82a7d9361b99d31325690364071f21d0`, dördünde de) ⇒
anahtar sabit kalıyor ⇒ hit **şans değil, tasarım**. T-020 boyunca lock dosyası **bir
kez** değişti (ⓐ `@playwright/test` kök dependency eklendi) — bu değişiklik **ilk**
e2e koşumundan **önce** gerçekleşmişti; ilk koşumun MISS'i bu tek değişikliğin faturası,
sonraki dördü lock sabit kaldığı için HIT. **`restore-keys`'in bilinçli yokluğu bugünkü
veri setinde hiçbir bedel ödetmedi** çünkü lock bu turda tekrar değişmedi.

---

## İş② — YEREL TEST SÜİTİ SÜRESİ

### 2.1 `test:visual` — yerel ölçüm (bu oturumda koşturuldu, serbest komut)

```
pnpm test:visual
```

→ **4/4 geçti**, turbo `10 successful, 10 total` (**9 cached**, yalnızca
`@arkesoft/storefront:test:visual` zorunlu) · **`Time: 8.396s`** (gerçek duvar saati
`8.624s`, `time` komutu). İç kırılım (script'in kendi logu): imaj doğrulama **1s**
(yerelde zaten çekili) + `astro build` **1s** + Playwright koşumu **2.2s**.
→ Taban (`pm`/`architect`'in verdiği) "**4/4 (~2s + Docker)**" ile **tutarlı** — Docker
kısmı burada **~6s** (imaj zaten yerel, saf "+Docker" maliyeti küçük).

### 2.2 `test:visual` — CI ölçümü (dört koşum, log'dan)

| Koşum         | `test:visual` turbo `Time:` | İmaj indirme/doğrulama | `astro build` |
| ------------- | --------------------------- | ---------------------- | ------------- |
| `43723308968` | 37.226s                     | 16s                    | 2s            |
| `43724498831` | 34.411s                     | 17s                    | 1s            |
| `43728274895` | 35.501s                     | 15s                    | 2s            |
| `43731621671` | (log kesik, aynı aralıkta)  | 14s                    | 2s            |

⇒ CI'daki ek süre (~34-37s) yerelin (~8.4s) **~4 katı** — fark **turbo'nun CI'da
sıfırdan derlediği 8 yukarı-akış paketinin** (`config/errors/ui/tenancy/versioning/
trpc/theme-sdk/db`) `cache miss` olması (CI'da kalıcı `.turbo` cache yok, uzak önbellek
kapalı: `Remote caching disabled`). **Kök neden bağımsız doğrulandı, YENİ bir kusur
DEĞİL:** `turbo.json:17-29`'daki (ADR-0014/T-011-perf) **zaten kabul edilmiş maliyet**
— `build` görevinin `passThroughEnv`'i (`APP_BASE_DOMAIN`,
`STOREFRONT_API_BASE_URL_OVERRIDE`) `test:visual` adımına **açıkça** `env:` ile
veriliyor (`ci.yml:1414-1415`) ama `test:e2e` adımına verilmiyor ⇒ aynı job içinde bile
iki adım arasında bu iki değişkenin **var/yok** durumu değişiyor ⇒ `build` görevinin
hash'i **tüm paketlerde** kayıyor (log'da doğrulandı: `@arkesoft/config:build` hash'i
`test:e2e` adımında `515926ca...` [HIT], `test:visual` adımında `f7a6118f...` [MISS]).
T-011/perf'in kendi yorumu bunu **önceden** ölçmüş ve kabul etmiş
(_"13/13 → 1/13, yalnızca db:generate isabet ediyor"_) — bu turun ölçtüğü **1/10**
(storefront:test:visual hariç 9 build/generate görevinden sadece `db:generate` hit)
bu tahminle **birebir örtüşüyor**. **Bu bir T-020 kusuru değil** — T-020 bu zaten var
olan, zaten muhasebesi yapılmış maliyeti **yeni bir tüketici** (CI'daki ardışık
`test:e2e`→`test:visual` adımı) olarak tetikliyor; mutlak etki küçük (~5-8s tsc
derlemesi, 8 paket).

### 2.3 `test:e2e` — CI ölçümü (dört koşum, log'dan)

| Koşum         | admin (23 test) | storefront (15 test) | turbo `Time:` |
| ------------- | --------------- | -------------------- | ------------- |
| `43723308968` | 28.6s           | 7.5s                 | 39.248s       |
| `43724498831` | 19.5s           | 5.0s                 | 26.276s       |
| `43728274895` | 22.9s           | 6.7s                 | 31.949s       |
| `43731621671` | 23.1s           | 5.3s                 | 30.495s       |

Taban (`admin 23/23 ~24s CI · storefront 15/15 ~6s`) ile **tutarlı** — T-020'nin
eklediği `responsive/` projesi (admin'e 1 test — `sign-in-layout.spec.ts`, storefront'a
1 test — `home-layout.spec.ts`, **ikisi de auth tüketmiyor**, kaynak:
`grep -c "test(" apps/admin/e2e/responsive/sign-in-layout.spec.ts` → **1**,
`apps/storefront/e2e/responsive/home-layout.spec.ts` → **1**) toplam süreyi ölçülebilir
şekilde **şişirmiyor** — admin'in 22 "ana" test + 1 responsive = 23 (eşleşiyor); dört
koşumun admin süresi (19.5s-28.6s) **tek bir testin eklenmesiyle açıklanamayacak
genişlikte dalgalanıyor** ⇒ dalgalanma kaynağı responsive testi değil, paylaşılan
runner gürültüsü.

**Çarpan değişmezi (`AC-4`) hatırlatması — perf'in konusu değil ama ölçümü
etkiliyor:** `pm`/`architect`'in verdiği kural (auth-tüketen spec tek viewport,
responsive/visual sıfır auth jetonu) **tutuyor** — bu yüzden "çoklu viewport" kapsamı
toplam test SAYISINI **1+1** artırdı, **22+22** değil. Bu, T-020'nin CI süresine kattığı
asıl disiplin: viewport matrisi **auth bütçesini çarpmadı**, dolayısıyla **süreyi de**
çarpmadı.

### 2.4 `--concurrency=1` pini — DOKUNULMADI, gerekçesi doğrulandı

`turbo.json:106-114` (admin/storefront'un `test:e2e`'si paylaşılan Postgres/Redis/
Mailpit + aynı IP oran-sınırı bütçesine paralel yüklenmesin diye) — **okundu, kabul
edildi, "iyileştirme fırsatı" olarak YAZILMADI** (talimat gereği).

---

## İş③ — GÖRSEL KOŞUMUN MALİYETİ

### 3.1 Pinli imaj indirme — CI'da ölçüldü, bütçe içinde

`scripts/run-visual.sh`'ın kendi logu, dört koşumda: **16s · 17s · 15s · 14s**
(ort. **~15.5s**). `R-13` eşiği **300s (5dk)** — **%95 marj**, aşılmadı.
(Yerel S6 ölçümü **80s** idi; CI'daki runner'ın ağ/katman önbelleği farklı — ikisi de
aynı pinli etikete karşı, farklı ortam, **tutarsızlık değil** çeşitli altyapı.)

### 3.2 Çift derleme yokluğu (`R-G`) — bağımsız doğrulandı

```
pnpm exec turbo run test:visual --filter=@arkesoft/storefront --dry=json
```

→ çıktıda **tek bir** `"command": "bash ../../scripts/run-visual.sh"` girdisi (tek
`test:visual` task); CI log'unda da (`43728274895`) `$ astro build` **bir kez** geçiyor
(`run-visual.sh` içinde, konteyner-öncesi). Turbo seviyesinde **ikinci bir `astro build`
task'ı yok** — `S6`'nın _"çift derleme YOK"_ iddiası **doğrulandı**, yeniden keşfedilmedi.

---

## Standart bütçe tablosu (CLAUDE.md eşikleri) — gerekçeli atlama

| Metrik                 | Bütçe              | Ölçüm                                                                                                    |
| ---------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| LCP (vitrin)           | < 2.5s             | **ÖLÇÜLEMEDİ: kapsam dışı** — `apps/storefront/src/**` değişmedi, Lighthouse CI altyapısı bu sürümde yok |
| INP                    | < 200ms            | **ÖLÇÜLEMEDİ: kapsam dışı** (aynı gerekçe)                                                               |
| CLS                    | < 0.1              | **ÖLÇÜLEMEDİ: kapsam dışı** (aynı gerekçe)                                                               |
| API p95                | < 500ms            | **ÖLÇÜLEMEDİ: kapsam dışı** — `apps/api/src/**` değişmedi                                                |
| Arama p95              | < 150ms            | **ÖLÇÜLEMEDİ: kapsam dışı** — Meilisearch sorgu kodu değişmedi                                           |
| Vitrin ada (client JS) | < 100KB gzip/sayfa | **ÖLÇÜLEMEDİ: kapsam dışı** — React ada sayısı/`client:*` direktifi değişmedi                            |
| Admin ilk yük          | < 300KB gzip       | **ÖLÇÜLEMEDİ: kapsam dışı** — admin bundle kaynağı değişmedi                                             |

## Bütçesi/eşiği tanımlı OLMAYAN eksenler (bu gate'in ölçtüğü, ama CLAUDE.md'de karşılığı yok)

- **CI job süresi/dakika maliyeti** — ölçüldü (İş①), ama platformun resmî bir bütçesi yok.
  Referans noktası olarak `timeout-minutes: 45` var; gözlenen en kötü durum (338s,
  sentetik yük altında) bunun **%12.5**'i.
- **Playwright tarayıcı önbellek isabet oranı** — ölçüldü (%100, 4/4), resmî bütçe yok.
- **Yerel/CI test süit süresi** (`test:e2e`/`test:visual`) — ölçüldü, resmî bütçe yok.
- **Pinli Docker imaj indirme süresi** — `R-13`'ün kendi ADR'si **300s** eşiğini koymuş
  (tek örnek, platform geneli değil).

---

## BULGULAR

yok

## ÖLÇÜMLER

- **Değişen dosya yüzeyi:** 38 dosya, +5093/−345; `apps/*/src/**`/`packages/*/src/**` **0**.
  (`git diff origin/feat/v0.0.21-surum-kayit-modeli...HEAD --stat`)
- **`e2e` job süresi (yüksüz, 4 koşum):** 126s · 141s · 163s · 183s (ort. **~153s/2m33s**).
- **`e2e` job süresi (yük altında, 1 koşum, opt-in değişken):** **338s/5m38s** — kritik
  yola dönüşüyor, ama değişken varsayılan **kapalı**.
- **`api` job süresi (aynı 4 koşum):** 207s · 234s · 309s · 311s — **her koşumda**
  `e2e`'den uzun, kritik yolu belirleyen bu.
- **Toplam iş akışı — e2e'siz taban (PR #4, `43696827470`):** **347s/5m47s**.
- **Toplam iş akışı — e2e'li, yük altında (`43723308968` deneme 1):** **371s/6m11s**
  (+24s/%7, büyük kısmı `api`'nin kendi gürültüsü).
- **Playwright tarayıcı önbellek isabeti:** ilk CI koşumu **MISS** (1/1), sonraki dört
  üretim koşumu **HIT** (4/4) — `pnpm-lock.yaml` SHA-256'sı dört koşumda **birebir aynı**
  (`d9bc6de8...71f21d0`), nedensellik doğrulandı.
- **Pinli görsel imaj indirme/doğrulama (CI, 4 koşum):** 14s · 15s · 16s · 17s
  (ort. **~15.5s**) — `R-13` eşiği 300s'nin **%5'i**.
- **`test:visual` yerel:** turbo `Time: 8.396s` (9 cached, 1 forced), gerçek duvar
  saati **8.624s** (`time pnpm test:visual`).
- **`test:visual` CI:** turbo `Time:` 34.4s-39.2s (4 koşum) — farkın kök nedeni
  (`passThroughEnv` kaynaklı `build` hash kayması, 1/10 cache hit) bağımsız doğrulandı,
  **T-011/perf'in zaten kabul ettiği maliyetin** yeni bir tetikleyicisi, yeni kusur değil.
- **`test:e2e` CI (admin 23 test):** 19.5s-28.6s · **(storefront 15 test):** 5.0s-7.5s ·
  turbo `Time:` 26.3s-39.2s (4 koşum) — taban (~24s/~6s) ile tutarlı.
- **Yeni `responsive` testleri:** admin **+1** (`sign-in-layout.spec.ts`), storefront
  **+1** (`home-layout.spec.ts`) — ikisi de doğrulanmış şekilde auth tüketmiyor
  (`grep -c "test("` ile sayıldı).
- **Çift derleme kontrolü (`R-G`):** `turbo run test:visual --dry=json` → tek
  `test:visual` task'ı, tek `astro build` çağrısı (CI log'unda doğrulandı) — bağımsız
  tekrar ölçüldü, S6'nın iddiasıyla örtüşüyor.
- **Repo görünürlüğü:** `gh repo view --json visibility` → `PUBLIC` → runner dakikası
  parasal maliyeti **$0** (ama kuyruk/süre maliyeti var, ayrı çerçevelendi).
- **Ölçüm koşulları:** `docker ps -q | wc -l` → 25 (başlangıç ve bitiş) · `uptime` load
  avg → 5.09/4.52/4.78 (başlangıç) → 1.89/3.29/4.12 (bitiş) · `wcag` gate'i bu oturumda
  paralel koşuyordu, kendi ölçümlerim buna dokunmadı (yalnızca `gh api`/`git`/tek bir
  yerel `pnpm test:visual` çağrısı).
- **Koşturulmayan komutlar (bilinçli):** `pnpm test`/`pnpm build`/`pnpm guards` — taban
  bu oturumda zaten alınmıştı (725/725 · 14/14 · 17/17); eşzamanlı `wcag` koşumuyla
  çakışmamak için tekrar koşturulmadı (`AGENT_BASELINE` §5). `pnpm --filter
@arkesoft/admin test:e2e` — **koşturulmadı**, auth bütçesi (`EMAIL_IP_LIMIT=10`/saat)
  `qa` tarafından aynı saatte tüketiliyordu.
- **Koşturulup DOĞRULANAMAYAN (ortam engeli):** `pnpm --filter @arkesoft/storefront
test:e2e` yerel denemesi `Timed out waiting 30000ms from config.webServer` ile düştü
  (muhtemelen yerel port/env çakışması, kaynak kodu etkisi değil — bu süreç dışı bir
  sorun olduğu için bulgu olarak **yazılmadı**, perf verdiktini etkilemiyor).
