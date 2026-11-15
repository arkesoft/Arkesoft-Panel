# GATE: solid — T-020 (ROADMAP v0.0.19), Tur 2

**SONUÇ: PASS** · `critical` 0 · `high` **0** (tur 1: 1) · `medium` **1** (tur 1: 2) ·
`low` 4 — `AGENT_BASELINE` §4: 1-2 `medium` ⇒ PASS.

> ⚠ Bu rapor `solid` ajanının çıktısından **Orkestratör tarafından diske işlendi** —
> ajanın `Write` aracı bu çağrıda kullanılamadı (`AGENT_BASELINE §5`'in `Bash`'siz gate
> ajanı istisnası). İçerik ajanın kendi ölçümleridir.

---

## 1. Tur 1 bulgularının akıbeti — **kodla doğrulandı**

| Tur 1 bulgusu                                                                     | Durum          | Kanıt                                                                                                                                       |
| --------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **`high`** storefront fabrikasında (a)+(b) yok, (c) zayıf                         | ✅ **KAPANDI** | aşağıda                                                                                                                                     |
| **`medium`** çarpan taraması `visual/`'ı kapsamıyor                               | ✅ **KAPANDI** | `auth-budget.test.ts:42,66-71,98-102` — `listFilesIfExists(VISUAL_ROOT)` taramaya katılıyor; _"dizin yoksa boş küme"_ sözleşmesi **yazılı** |
| **`medium`** guards düzyazı eşliyor / `scripts/` dışarıda / `__tests__` çelişkisi | ✅ **KAPANDI** | `guards.sh:702-705` (dizi-öğesi literalleri) · `:740` (`apps packages scripts`) · `:723-724` (`--exclude-dir=__tests__` **YOK**)            |
| **`low`** `ci.yml` _"20"_                                                         | ✅ **KAPANDI** | `:1396` artık **5**; `:1394-1395` gerekçeyi yazıyor                                                                                         |
| **`low`** uydurulmuş CLAUDE.md §4 atfı                                            | ✅ **KAPANDI** | `storefront-templates.visual.spec.ts:43-52` — atıf **kaldırıldı**, yerine _"bu bir CLAUDE.md kuralı DEĞİL"_ **açık düzeltme notu**          |

### `high`'ın ayrıntısı — **eşdeğer güçte mi, zayıf kopya mı?**

- `custom-domain-tenant.ts:85-89` (allowlist) · `:108-115` (`assertTestEnvironment`) ·
  `:122-142` (`assertDockerHostIsLoopback`) — admin ikizinin
  (`tenant-cleanup.ts:166-170`, `:190-197`, `:200-220`) **gövde olarak BİREBİR** eşi;
  tek fark hata metnindeki **önek**.
- **Çağrı noktaları da aynı yerlerde:** storefront `:163-164` + `:217-218` ·
  admin `:123-124` + `:223-224`.
- **(c):** storefront `:101` `E2E_FIXTURE_ID_PATTERN`, `:313-317` `deleteTenantFixture`
  içinde **fail-closed** uygulanıyor. ⭐ `uniqueSuffix` (`:252-254`) çıktısı desene
  **uyuyor** ⇒ kapı **yanlış-kırmızı vermez**.
- `NODE_ENV` **tek yazıcı** disiplini korunmuş: `playwright.config.ts:80`
  `??= 'test'`, dev çocuğu `:188`'de `env NODE_ENV=development` ile geri alınıyor
  (admin `:53` + `:137` emsaliyle **aynı**).

⭐⭐ **SAPMANIN BOYUTU (tur 1'de ölçülmesi istenen):** **güvenlik ekseninde SIFIRA indi.**
Kalan sapma **üç kalemde ve hepsi gerekçeli**: (i) admin'de `maxBuffer: 50MB`
(**ölçülmüş `ENOBUFS` düzeltmesi**, storefront'ta o yük yok) · (ii) admin'de
`querySqlRows` + `sweepOrphanedE2eFixtures` (storefront'ta `globalTeardown` süpürmesi
**yok**) · (iii) biçim regexlerinin **farklı** olması (id ↔ slug+email — **iki farklı
sebeple** değişir, kopya değil). ⇒ **İki fabrika artık eşdeğer güçte.**

---

## 2. ⚠⚠ YENİ `medium` — DÜZELTME, DÜZELTTİĞİ KUSURU YENİDEN ÜRETTİ

**`scripts/guards.sh:763,767`** — alt kontrol 3 (`S-2`'nin _"pozitif iddiası"_)
**MEKANİZMAYI DEĞİL METNİ** eşliyor:
`grep -q "assertDockerHostIsLoopback" "$allowed_file"` dosyanın **HER YERİNİ** tarıyor,
⚠ **YORUMLAR DÂHİL**.

**Negatif kanıt (mutasyon tarifi; ⚠ `Bash` yok, koşturulmadı):**
`custom-domain-tenant.ts`'ten iki fonksiyonun **tanımlarını** (`:108-115`, `:122-142`)
ve **dört çağrı noktasını** (`:163-164`, `:217-218`) sil; ⭐ **dosya başı yorumunu olduğu
gibi bırak** — o yorum `:58`'de `assertDockerHostIsLoopback`, `:59`+`:62`'de
`assertTestEnvironment` jetonlarını **literal olarak** içeriyor.
⇒ `grep -q` **ikisini de bulur** ⇒ alt kontrol 3 **YEŞİL** · `typecheck`/`lint` **yeşil**
(tanımsız sembol yok, kullanılmayan sembol yok) · alt kontrol 2 dosya **kümesine** bakar,
değişmez ⇒ **`pnpm guards` 17/17 YEŞİL** ve ⚠⚠ **tur 1'in `high` bulgusu AYNEN GERİ GELMİŞ
olur.**

**İkinci leg:** kontrol fonksiyonların **ÇAĞRILDIĞINI** doğrulamıyor — tanımlar dursun,
**çağrılar silinsin**: yine **17/17 yeşil**.
**Üçüncü leg (kopya sapması):** kontrol yalnızca **adın varlığını** görür, **gövdeyi**
değil. `custom-domain-tenant.ts:85-89` allowlist'ine `host.docker.internal` eklenip
admin'inkine eklenmezse tarama **yeşil kalır**.
⚠ `guards.sh:683-686` bunu **dürüstçe itiraf ediyor** (_"ÇOĞALMAYI kapatıyor, SAPMAYI
değil"_) — ⭐ **ama alt kontrol 3'ün yorumu (`:651-653`, `:752-755`) _"S-1'in tekrarını
MEKANİKLEŞTİRİR"_ diyerek DAHA FAZLASINI VAAT EDİYOR.**

**Önerilen düzeltme:** jetonu **mekanizmaya** bağla — ör.
`grep -cE '^\s*assert(TestEnvironment|DockerHostIsLoopback)\(\)$'` ile **çağrı** biçimini
ara (**≥2** beklenir) **ve** `^function assertTestEnvironment` ile **tanımı** ayrıca
doğrula; **veya** iki koruma gövdesinin `shasum`'unu iki dosya arasında karşılaştır
(⭐ **sapma ekseni de kapanır**). → `devops`

---

## 3. Dört `low` (teknik borç — düzeltme turu açmaz)

1. **`guards.sh:694-778`** — `check_adr22_k1d_shellout_boundary` **56 → 85 satır (+%52)**,
   üç alt kontrol + **64 satırlık önsöz** ⇒ tek fonksiyonda **üç sorumluluk**.
   ⚠⚠ ⭐ _**"Bölmek `run_step` sayısını değiştirir" kısıtı ÖLÇÜLDÜ ve YANLIŞ İKİLEM:**_
   `run_step` çağrı sayısını **hiçbir CI adımı/test pinlemiyor** (`grep`: `.github`
   altında **0 eşleşme**) ve zaten üç alt kontrolü yardımcı fonksiyonlara çıkarıp **TEK**
   `run_step`'ten çağırmak sayıyı **AYNEN korur**. **Boyut artışı kaçınılmaz değildi.**
2. **`playwright.config.ts:201`** (krş. `:188`) — yeni `NODE_ENV` yazıcısı (`:80`)
   **DEV** dalında açıkça geri alınıyor, ⚠ **GÖRSEL** dalında **ALINMIYOR**:
   `env PORT=… HOST=0.0.0.0 node dist/server/entry.mjs` **`NODE_ENV=test`'i miras alır**.
   ⇒ Playwright yedek dalı devreye girerse **üretim SSR girdisi `NODE_ENV=test` altında**
   koşar ⇒ aynı görsel karşılaştırmada **iki farklı sunucu kipi** olabilir.
3. ⭐⭐ **`scripts/playwright/base.ts:104`** — `retries: overrides.retries ?? 0` bugün
   **DAVRANIŞSAL OLARAK NO-OP**: Playwright varsayılanı **zaten 0** (yorumun kendisi
   `:96`'da söylüyor) ⇒ ⚠ **satır BELGE, KAPI DEĞİL.**
   **Negatif kanıt:** `apps/admin/playwright.config.ts`'e `retries: 2` eklenirse
   lint/typecheck/**guards 17/17 YEŞİL** kalır (`retries` jetonu `scripts/` altında
   yalnızca `base.ts`'te, **guards adımı YOK**).
   **Düzeltme:** ya `guards`'a **pin ekle**, ya yorumda _"bu bir VARSAYILAN, kapı
   DEĞİL"_ **de**.
4. **İki fabrika arası birebir kopya ~83 → ~117 kod satırı (+%41)**; storefront
   dosyasının **%40 → %42**'si kopya. ⚠ **İKİ KOPYA KARARINA İTİRAZ DEĞİL** (ADR K1
   gerekçesi **ayakta**); borç yalnızca **sapma tespiti** için — ⭐ yukarıdaki `medium`'un
   **üçüncü leg'i ile AYNI düzeltmede kapanır**.

---

## 4. Dört sorunun cevabı

**S1 — kapandı mı?** ✅ Üçü de (§1).
**S2 — yeni kalite sorunu?** ✅ Evet, **bir tane**: alt kontrol 3, tur 1'in düzelttiği
_"düzyazıyı eşleme"_ kusurunu **yeni bir yerde tekrar üretti** (`medium`).
Fonksiyon boyutu 85 satır ⇒ `low` (ikilem **yanlıştı**). Kopya +%41 ⇒ **eşik aşılmadı**:
(i) karar ADR+`po` tarafından **ölçülmüş gerekçeyle** kapanmış ve çürütecek yeni ölçüm
yok, (ii) alt kontrol 2 çoğalmayı **mekanik olarak ikiyle** sınırlıyor, (iii) büyüyen
kısım **tek sebeple** değişen altyapı eklentisi.
⭐ Çift `env` _"ilk bakışta kafa karıştırıcı ama gerekçe **yazılı ve ölçülmüş**_"
(`:179-187`: dış `env` **SET**, iç `env -u` **UNSET**, çarpışmıyor) ve
`env-contract.test.ts:332` **P6 pini bozulmuyor** ⇒ **bulgu değil**.
**S3 — `retries: 0` derin birleştirmeyle tutarlı mı?** ✅ **Mekanik olarak tutarlı**:
`...overrides` önce, sonra `?? 0` — `forbidOnly`/`workers` ile **birebir aynı desen**.
Tüketici verirse **kazanır — ve kazanmalı**: `base.ts:21-29`'un bağlayıcı kısıtı
_"TABAN DAYATMAZ, YARDIMCI OLUR"_. ⚠ Gerekçe yorumu **içerik olarak güçlü** ama
**mekanik olarak boş** ⇒ `low` (3).
**S4 — regresyon?** ❌ **Yok.** `S4`'ün **tek çağrı** kısıtı ayakta
(`storefront:109`, `admin:88`; ikinci `defineConfig` **yok**) · `toHaveScreenshot` derin
birleştirmesi **değişmedi** (yeni `retries` satırı `expect`/`use` **dışında**) ·
`any`/`@ts-ignore`/`eslint-disable` hâlâ **0** (iki ayrı grep, _"No matches found"_) ·
`run-visual.sh`'in **`exit 0` yasağı yerinde** (`exit 0` **0 eşleşme**; `:21` notu ve
`:304` `exit "$PLAYWRIGHT_EXIT_CODE"` duruyor) · alt kontrol 2'nin **boş-küme fail-closed**
davranışı korunmuş (`:741-750`).

## `DOĞRULANAMADI`

`Bash` **yok** ⇒ hiçbir kapı **koşturulmadı**; tüm negatif kanıtlar **mutasyon
tarifidir**. `git diff` koşulamadı ⇒ yüzey **dosya listesinden** kuruldu.
`qa`/`devops`/Orkestratör'ün bildirdiği **17/17 · 23/23 · 725/725 · 0→9** sayıları
**yeniden ölçülmedi** (brief gereği **tekrarlanmadı, üzerine inşa edildi**).

**Ölçümler:** incelenen dosya **11** (tam 5, hedefli 6) · `any` **0** ·
en büyük shell fonksiyonu **85 satır** (tur 1: 56 ⇒ **+%52**) · en büyük TS fonksiyonu
**45 satır** (değişmedi) · fabrikalar arası kopya **~117** kod satırı (**+%41**).
