# T-012 · security · tur 1

- **Tarih:** 2026-11-03
- **Sürüm:** v0.0.10 · platform MINOR → 0.2.0 · `@arkesoft/themes-modern` 0.1.0 · `@arkesoft/theme-sdk` 0.1.1 · `@arkesoft/trpc` 0.2.0 (Public API birimi)
- **Dal:** `chore/ajan-altyapisi`

```
GATE: security
SONUÇ: PASS
```

> FAIL kuralı aritmetiği (AGENT_BASELINE §4): 0 critical · 0 high · **1 medium** · 4 low → **PASS**
> (1–2 medium = PASS). ⚠ Aynı bölümün "Bulgunun sonucu ne olur" tablosu medium için
> "düzeltme turu açar mı → Evet (sayısı kaç olursa olsun)" diyor; kararı Orkestratör verir.
> Dört `low` için düzeltme turu **koşturulmaz** — borç satırı metinleri aşağıda hazır.

---

## BULGULAR

### [SEV: medium] `apps/storefront/src/themes/theme-css.ts:80` — `FONT_VALUE_PATTERN` DENGESİZ tırnağa izin veriyor; üretecin kendi yazılı değişmezi karşılanmıyor ve hiçbir test bunu kapsamıyor

**Sorumlu ajan:** frontend (S7'nin dosyası)

**Ölçüm** (desen kaynak dosyadan okundu, ikinci kopya yazılmadı):

```
=== FONT /^[A-Za-z0-9 ,"'-]+$/ ===
KABUL "ui-sans-serif, system-ui, \"Segoe UI\""     ← meşru, beklenen
RED   "</style><script>alert(1)</script>"
RED   "x; } :root { --evil: 1 } .y {"
RED   "'Arial\", sans-serif; color: red'"
RED   "Arial\\22 "            (ters eğik çizgi kaçışı)
RED   "expression(alert(1))"
RED   "url(http://evil/x)"
RED   "a\nb"                  (satır sonu)
RED   "Arial /*x*/"           (CSS yorumu)
RED   "ÿ" · RED sıfır-genişlik boşluk · RED NUL
KABUL "Arial\""               ⚠ DENGESİZ ÇİFT TIRNAK
KABUL "Arial'"                ⚠ DENGESİZ TEK TIRNAK
KABUL "\""                    ⚠ TEK KARAKTERLİK GİRDİ
KABUL "Arial\" ,x"            ⚠
```

**Sömürü senaryosu** (somut): dosya başı yorumu (satır 28-32) bağlayıcı olarak şunu
iddia ediyor — *"`<`,`>`,`;`,`{`,`}`, ters eğik çizgi, satır sonu gibi bir CSS kuralını/
HTML'i KIRABİLECEK HER KARAKTER yapısal olarak REDDEDİLİR"*. **Eşlenmemiş bir tırnak CSS
kuralını kırar.** Üretilen metin:

```
:root{--color-primary:#2563EB;--color-surface:#FFFFFF;--color-body:#374151;--font-heading:Arial";--font-body:<X>;}
```

`"` bir `<string-token>` açar; CSS Syntax §4.3.1'e göre EOF'a kadar tüketilir (EOF-in-string
= ayrıştırma hatası, token YİNE ÜRETİLİR) → `;--font-body:<X>;}` dizesinin **içine** girer.
Sonuç: `--font-heading` çöp bir değer alır, **kendisinden sonraki TÜM bildirimler düşer** ve
`:root` bloğu hiç kapanmaz. `v0.3.0`'da (bu fonksiyona kiracı JSONB'si besleyecek —
`ROADMAP.md:752-758`, `architect`/`po`'nun "izin listesi ŞİMDİ doğru kurulmak zorunda"
kararının tam hedefi) **tema ayarlarını yazabilen bir kiracı yöneticisi, TEK karakterlik
`"` değeriyle kendi herkese açık vitrininin satır-içi `<style>`'ındaki custom property'lerin
tamamını kalıcı olarak düşürür** — tipografi ve renk yok, sayfa bozuk render edilir.

**Niçin critical/high DEĞİL** (ölçülerek sınırlandı): çapraz kiracı erişimi **yok** (değer
kiracının kendi sayfasına girer), XSS **yok** (`<`,`>`,`/`,`(`,`)`,`;`,`{`,`}`, ters eğik
çizgi, satır sonu **hepsi RED** → `</style`, `<script`, `expression()`, `url()` **üretilemez**),
veri sızdırma **yok** (`(`/`)`/`:`/`/` reddedildiği için `url()` ile exfiltration, `{`/`}`
reddedildiği için seçici enjeksiyonu **imkânsız**), bugün erişilebilir **değil** (girdi
`theme.config.ts`'in derleme-zamanı sabitleri). Kalan sınıf: **tek kiracı içinde kalıcı,
doğrulamadan geçen görsel bozma** + üretecin kendi yazılı değişmezinin ihlali.

**Test boşluğu (mutasyon kanıtlı):** `FONT_VALUE_PATTERN`'i `/(?:)/` yaptığımda **tam 2** test
kırmızıya döndü — ikisi de `;` ve `<script>` hakkında, **hiçbiri tırnak dengesi hakkında
değil**. Kabul testi (`theme-css.test.ts:122`) yalnızca **dengeli** tırnak kullanıyor.

**Önerilen düzeltme:** (a) `"`/`'`'ü izin listesinden ÇIKAR ve çok kelimeli aile adlarının
tırnaklamasını ÜRETECİN kendisi yapsın (izin listesi daha da küçülür — tercih edilen), veya
(b) desene ek olarak denge kontrolü ekle (`"` sayısı ÇİFT **ve** `'` sayısı ÇİFT) ve
`Arial"` için adlandırılmış hata fırlatan bir test yaz.

---

### [SEV: low] `packages/theme-sdk/src/manifest/asset-ref.ts:122-124, 136-138` — `isTraversalSegment` SEC-5a'dan sonra ÖLÜ ve KORUMASIZ

**Sorumlu ajan:** backend + architect · **Vade önerisi:** v0.0.14

**Mutasyon ölçümü:** `if (path.split('/').some(isTraversalSegment)) { return false }` bloğunu
tamamen kaldırdım → `asset-ref.test.ts` **47/47 YEŞİL kaldı** (taban da 47/47). Yani bu
savunmayı koruyan **hiçbir test yok**.

**Gerekçe:** SEC-5a sonrası desen HER segmentin `[A-Za-z0-9]` ile başlamasını zorluyor; `..`
segmenti deseni **zaten** geçemez (ölçüldü: `..`, `x/..`, `x/../y` → RED). Dosya başı
yorumu (satır 46-55) ise bu kontrolü `..`'yı yakalayan **mekanizma** olarak sunuyor.

**Senaryo:** bugün sömürülebilir değil. Risk ileri yönlü: desen bir gün gevşetilirse (ör.
`.well-known` için `.` ile başlayan segmente izin verilirse), yol geçişinin **tek** bariyeri
bu kontrol olur ve onu sınayan **sıfır** test vardır.

**Önerilen düzeltme:** `isValidThemeAssetPath`'i desenden BAĞIMSIZ sınayan bir test ekle
(yardımcıyı test için dışa aç veya desenin kabul ettiği bir biçimle kontrolü tetikle), ya da
kontrolü açıkça "artıklı derinlemesine savunma" olarak işaretleyip bu mutasyon ölçümünü
yoruma yaz.

---

### [SEV: low] `apps/storefront/src/themes/registry.ts:71-79, 174-182` — `styleText` süreç geneli bir girdide DONUYOR; v0.3.0'ın kiracı JSONB'si için değişmez PİNLENMEMİŞ

**Sorumlu ajan:** architect + frontend · **Vade önerisi:** v0.3.0'dan ÖNCE

**Bugünkü durum DOĞRU (ölçüldü):** `styleText`'in tek girdisi tema MANİFESTİ
(`theme.config.ts`'in derleme-zamanı `default`'ları) — kiracı verisi **yok**. `rg "new Map|
cache|memo|WeakMap" apps/storefront/src/themes/` → **0 kod eşleşmesi** (tek eşleşme bir
yorumda "memoizasyon" kelimesi). Dolayısıyla "ilk kiracının değeri donup diğerlerine servis
ediliyor" **bugün gerçekleşmiyor**: donan şey kiracıdan **bağımsız**.

**İleri yönlü senaryo:** v0.3.0'da kiracı JSONB'si `generateThemeCss()`'e beslendiğinde, en
bariz uygulama yeri `buildRegistryEntry()`/`ThemeRegistryEntry.styleText` (çünkü
`resolveTheme()` `styleText`'i döndürüyor ve yorum "SÜREÇ BAŞINA BİR KEZ" diyor). O
uygulama **çapraz kiracı sızıntısı** olur: ilk kiracının renkleri süreç geneli bir dizeye
donar ve aynı süreçteki diğer kiracılara servis edilir. Kodda veya testte *"`styleText`
YALNIZCA manifestten türer"* diye bir pin **yok**.

**Önerilen düzeltme:** değişmezi **bugün** pinle — alanı `manifestStyleText` olarak
adlandır, "kiracıya özgü CSS kayıt defterinde memoize EDİLEMEZ" kuralını ADR-0002'ye satır
olarak ekle ve iki farklı kiracı bağlamında kayıt defteri girdisinin **referansça aynı**
kaldığını (yani kiracıya duyarlı OLMADIĞINI) ölçen bir test yaz.

---

### [SEV: low] `apps/storefront/src/themes/theme-css.ts:63` — vitrinin ad izin listesi SDK'nın yayınlanan sözleşmesinden SIKI; ihlal TÜM kiracıları düşürüyor

**Sorumlu ajan:** architect · **Vade önerisi:** v0.0.21 (ikinci tema)

Vitrin: `^[a-z][a-z0-9-]*$`. SDK'nın yayınlanan sözleşmesi
(`docs/theme-contract.schema.json`, ayar `key` alanı): `^[A-Za-z][A-Za-z0-9_-]*$`. Ölçüldü:
`Brand-Accent` SDK'da **GEÇERLİ**, vitrinde **RED**; `a_b` de aynı.

**Senaryo:** SDK sözleşmesine uyan bir tema yazarı `myKey`/`my_key` anahtarı yazar →
`registry.ts` **modül yüklenirken** `ThemeCssGenerationError` fırlatır → vitrin süreci hiç
açılmaz, **o temayı kullanmayan kiracılar dahil TÜM kiracılar** hizmet alamaz. Yön doğru
(fail-closed) ve bugün CI yakalıyor (tek, repo içi tema; `pnpm test`/`build` `registry.ts`'i
ithal ediyor) — ama patlama yarıçapı platform geneli ve SDK yazarı **uyarmıyor**.

**Önerilen düzeltme:** daraltmayı `assertThemeManifest()`'e taşı (tek doğruluk kaynağı, hata
tema YAZARININ masasında doğar, vitrin açılışında değil) veya tema yazım README'sine daha
sıkı sözleşmeyi yaz.

---

### [SEV: low] `apps/storefront/src/themes/theme-css.ts:71` — hex deseni SDK'nın yayınlanan deseniyle BİREBİR AYNI ama drift pini YOK

**Sorumlu ajan:** frontend · **Vade önerisi:** v0.0.14

Ölçüldü: `COLOR_VALUE_PATTERN` = `^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$`;
`docs/theme-contract.schema.json`'da SDK'nın yayınladığı renk deseni **birebir aynı dize**.
Kopyalama yapısal olarak zorunlu (vitrin pnpm katı izolasyonu altında `@arkesoft/theme-sdk`'yi
çözemez — `theme-setting-definition.ts` dosya başında ölçülmüş) ama iki kopyanın **sessizce
sapmasını** engelleyen pin yok: SDK'nın deseni gevşerse vitrin sıkı kalır (zararsız) ama
SDK'nın deseni **sıkılaşırsa** vitrin daha gevşek kalır ve enjeksiyon kapısı iki yerden
birinde açık kalır.

**Önerilen düzeltme:** `theme-template-dispatch.test.ts`'in grep tabanlı drift-pin desenini
kullan — `theme-css.ts`'teki literali `docs/theme-contract.schema.json`'daki renk `pattern`'i
ile karşılaştıran mekanik bir test.

---

## ÖLÇÜMLER

### `pnpm audit` (ham koşuldu)

| Önem | Sayı | Paket | Durum |
| --- | --- | --- | --- |
| critical | **0** | — | — |
| high | **1** | `multer` (GHSA-q7qp-rjg7-q26m, `@nestjs/platform-express` geçişli, 4 yol) | Önceden takipli — ROADMAP `:1768` / v0.0.16 |
| moderate | **1** | `minimatch` (GHSA-g3hv-75wg-m249, eslint geçişli, 64 yol) | Önceden takipli — ROADMAP `:1592` |
| low | **0** | — | — |

**Önceki ölçümle karşılaştırma: DEĞİŞİKLİK YOK** (kritik 0 · high 1 · moderate 1). **Yeni açık
GELMEDİ.** `pnpm-lock.yaml`'ın +29 satırı **tamamen** `workspace:*` link ve `catalog:` girdisi:
`@arkesoft/themes-modern` → link; `dependencies` = yalnızca `@arkesoft/theme-sdk` (link);
`devDependencies` = `@arkesoft/config` (link) + `@types/node`/`astro`/`eslint`/`typescript`/
`vitest` (hepsi `catalog:`). **Sıfır yeni dış paket, sıfır yeni registry tarball'ı.**
`peerDependencies` **YOK**. → "yeni ana bağımlılık YOK" iddiası **TEYİT EDİLDİ**.

### İncelenen dosya sayısı

**~30** dosya (tam okuma: 16 · diff okuma: 9 · grep/ölçüm: 5) + 4 `dist` artefaktı.

### Kiracı izolasyonu kontrol listesi — 14/14 doğrulandı, **karşılanmayan madde YOK**

| # | Madde | Verdict | Kanıt |
| --- | --- | --- | --- |
| 1 | `tenant_id` NOT NULL | **N/A — doğrulandı** | Canlı `\d tenant`: `tenant_id` kolonu yok, tablo kiracı kimliğinin kaynağı (V4). Migration **yalnızca 2 kolon ekliyor**, yeni kiracıya bağlı tablo YOK |
| 2 | RLS + `current_setting` | **N/A — doğrulandı** | Canlı: `pg_class.relrowsecurity = f`, `relforcerowsecurity = f` (önceden var olan V4 kararı, bu görev değiştirmedi). Yeni kiracı tablosu olmadığı için eksik politika yok |
| 3 | `(tenant_id, …)` bileşik indeks | **N/A — doğrulandı** | Okuma `id` (PK) + `deleted_at` üzerinden; `tenant_pkey` mevcut, yeni sorgu deseni yok |
| 4 | `tenantProcedure`/`permissionProcedure` | **DEĞİŞMEDİ** | `storefront.router.ts:27` `publicTenantProcedure` (ADR-0012 §1 istisnası) |
| 5 | `withTenant()` | **GENİŞLEMEDİ** | `storefront-tenant-read.port.adapter.ts:47` ham `prisma.db.tenant` — 4 maddeli yazılı gerekçe mevcut; `select` **yalnızca** `themeId`/`themeVersion` ile genişledi. Yeni ham çağrı yeri YOK |
| 6 | Girdideki `id`'ye güvenme / sahiplik | **GİRDİ YOK** | `storefront.router.ts`'te `.input()` **hiç bildirilmemiş**; `tenantId` = `ctx.tenant.tenantId` (host çözümü). `themeId`/`themeVersion` **dışarı** akıyor ve tüketicide **TAM EŞLEŞME** aramasıyla karşılanıyor |
| 7 | Kuyruk işi `tenantId` | **N/A** | Diff'te kuyruk işi yok |
| 8 | Dış kaynak kapsamlandırması (**YENİ YÜZEY: tema CSS**) | **YAPISAL — ölçüldü** | aşağıda ayrı blok |
| 9 | Önbellek anahtarı | **ÖNBELLEK YOK — ölçüldü** | `cache-policy.ts:22` `private, no-store` **değişmedi**, her dönüş yolunda koşulsuz; `src/themes/`'te 0 memoizasyon kodu. Kalan ileri risk = low bulgu #3 |
| 10 | Dosya yolu tenant öneki | **N/A** | SEC-5b kapsam dışı; `src/pages/` altında varlık rotası YOK, `dist`'te tema varlık servis yolu DOĞMADI |
| 11 | `createTenantIsolationSuite()` | **YENİ VAKA YOK** | Yeni kiracıya bağlı kaynak eklenmedi. ⚠ `pnpm test:isolation` **koşturulmadı** (handoff yasağı) → handoff'un 18 testi **ölçemedim**, devralındı |
| 12 | Hata mesajı başka kiracının varlığını sızdırmıyor | **TEST PİNLİ** | aşağıda ayrı blok |
| 13 | Loglarda `tenantId` | **N/A — doğrulandı** | Vitrin uygulama logu üretmiyor: `eslint.config.mjs:158` `'no-console': 'error'`; `rg "console\.|logger\."` → tek eşleşme `root-env-integration.ts:111` (yalnızca `command === 'dev'`, env şema hatası, sır içermez) |
| 14 | Süper admin denetim kaydı | **N/A** | Süper admin yolu değişmedi |

#### Madde 8 — tema CSS'i gerçekten kiracıya kapsamlı mı (İŞ 4 + İŞ 5)

**DEĞER araması (kelime değil, gerçek değer):**

```
dist/client/_astro/ içinde TANIMLANAN custom property'ler (--ad: ) — TAM LİSTE:
  --color-white --container-2xl --default-font-family --default-mono-font-family
  --font-mono --font-sans --font-weight-semibold --spacing
  --text-2xl --text-2xl--line-height --tw-font-weight
→ --color-primary / --color-surface / --color-body / --font-heading / --font-body: SIFIR

Palet hex'leri dist/client'ta:  2563EB → 0 · 2563eb → 0 · 374151 → 0 · FFFFFF → 0
Palet hex'leri dist/server'da:  virtual_astro_middleware.mjs:2602 (2563EB) · :2618 (374151)
```

⚠ **YANLIŞ POZİTİF ELENDİ:** `Segoe UI` / `Noto Sans` / `Helvetica Neue` `dist/client/_astro/
messages.BmdPD-KH.css`'te **eşleşiyor** — ama dosyayı okudum: bu **Tailwind v4.3.3'ün kendi
`--font-sans` preflight'ı** (`-apple-system, BlinkMacSystemFont, "Segoe UI", …`), temanın
`SYSTEM_FONT_STACK`'i **DEĞİL** (farklı token listesi: Tailwind'de `BlinkMacSystemFont` var,
temada `ui-sans-serif` ile başlıyor; `ui-sans-serif` dist/client'ta **0 eşleşme**). T-011'deki
"yedi eşleşmenin üçü Türkçe yorumdaki örnek host" dersinin aynısı.

**K1 değişmezi doğrulandı:** KURAL (`theme-modern-section { background-color: var(--color-surface) }`)
`dist/server/chunks/index_B8cgVAjs.mjs` + `server_C5t7C-sd.mjs`'te (Astro küçük scoped CSS'i
satır içine aldı), `dist/client`'ta `var(--color-surface|--font-heading|--color-primary)` → **0**.
DEĞER yalnızca SSR HTML'inde: `dist/server/chunks/index_B8cgVAjs.mjs:110` →
`` <style>${unescapeHTML(theme.styleText)}</style> `` (kaçışsız — tek savunma izin listesi,
bulgu #1).

**Çapraz kiracı yolu YOK:** `styleText`'in tek girdisi tema manifesti. DB'den gelen seçim
(`themeId@themeVersion`) **yalnızca hangi kayıt defteri girdisinin** döneceğini belirliyor;
kiracı A, B'nin verisini değil, B'nin de seçebileceği **aynı statik temanın** CSS'ini görür.
Bir kiracının **başka** bir kiracının **verisini** görme yolu yok.

**`image` tipi ayar:** `rg "type: 'image'" packages/themes apps/storefront/src` (testler hariç)
→ **0 eşleşme**. `dist`'te tema varlık servis yolu **doğmadı** (`/assets/` eşleşmeleri Astro'nun
kendi `node`/`sharp`/`errors` chunk'ları; `src/pages/` = `404.astro`, `503.astro`, `index.astro`,
`robots.txt.ts`, `sitemap.xml.ts` — varlık rotası yok). → **SEC-5b'nin kapsam dışı olması
YAPISAL olarak teyit edildi.**

#### Madde 12 — 503 gövdesi / logu sızdırıyor mu (İŞ 3 + İŞ 5)

- `middleware.ts:239-248`: `catch` **yalnızca** `instanceof ThemeResolutionError` kontrolü
  yapıyor; `error.context`, `error.message` **hiç okunmuyor**; `renderUnavailable()` statik
  `503.astro`'yu render ediyor.
- `rg "locals\.tenant|requireResolvedTenant|theme" src/pages/404.astro src/pages/503.astro`
  → **0 eşleşme** (kiracıya özgü hiçbir bayt yok).
- **Test pini mevcut:** `apps/storefront/src/lib/__tests__/middleware.test.ts:274,286` —
  `themeId: 'bilinmeyen-tema'` ile istek + `expect(await response.clone().text()).not.toContain('bilinmeyen-tema')`.
- `Cache-Control` 503'te de `private, no-store` (koşulsuz).
- **Fail-closed mı?** EVET: bilinmeyen `themeId` → `resolveTheme()` **fırlatır** (`null`
  DÖNMEZ, ADR-0002 Karar 2) → 503. "Seçim yok" (`null`/eksik) ile "seçim var ama bulunamadı"
  ayrı dallar; ilki `DEFAULT_THEME_SELECTION`'a düşer, ikincisi 503.
- **Yeni oracle doğdu mu?** 503 "bu host bir kiracıdır" bilgisini veriyor — ama 200-vs-404
  ayrımı bunu her kiracı için **zaten** veriyor (ROADMAP `:1702`'de takipli `low`). Ayrıca
  503 API kesintisiyle **aynı** koda düşüyor (`mapApiError` → `unavailable`), bu da ayrımı
  bulanıklaştırıyor. **Marjinal bilgi kazancı ≈ 0, yeni bulgu değil.**

#### CHECK kısıtı — canlı DB'de doğrulandı

```
docker exec arkesoft-postgres psql -U arkesoft -d arkesoft -c "\d tenant"
Check constraints:
    "tenant_theme_selection_pairing_check" CHECK ((theme_id IS NULL) = (theme_version IS NULL))
```

Gerçekten DB'de. Atlatma: Prisma istemcisi üzerinden **atlatılamaz** (kısıt DB seviyesinde,
uygulama değil); ihlal eden `INSERT`/`UPDATE` Postgres hatası alır. `BYPASSRLS`/süper
kullanıcı elle müdahalesi dışında yol yok (CLAUDE.md §10 md 19 zaten yasaklıyor).

### İŞ 1 — izin listesi mutasyon kanıtı (ZORUNLU)

Yöntem: `theme-css.ts` yedeklendi (`shasum -a 256` + `cp`), her desen literali tek tek
`/(?:)/` (her dizeyi kabul eden, **sözdizimsel geçerli**) ile değiştirildi, `theme-css.test.ts`
+ `registry.test.ts` koşturuldu, dosya birebir geri alındı.

| Mutasyon | Sonuç | Kırılan test |
| --- | --- | --- |
| **TABAN** (mutasyon yok) | **22 passed / 2 files** | — |
| `CSS_VARIABLE_NAME_PATTERN` → `/(?:)/` | **1 failed / 21 passed** | "CSS değişken adı izin listesine uymayan bir `key` için `ThemeCssGenerationError` FIRLATIR" |
| `COLOR_VALUE_PATTERN` → `/(?:)/` | **2 failed / 20 passed** | "geçersiz hex değeri … FIRLATIR" · "5/7 karakterli hex REDDEDİLİR" |
| `FONT_VALUE_PATTERN` → `/(?:)/` | **2 failed / 20 passed** | "font DEĞERİ `;` taşırsa FIRLATIR" · "font DEĞERİ `<script>` taşırsa FIRLATIR" |
| `isTraversalSegment` bloğu KALDIRILDI (`asset-ref.ts`) | **47 passed / 47 — YEŞİL KALDI** | ⚠ **HİÇBİRİ → low bulgu #2** |

→ Üç izin listesi de **korumalı** (mutasyon testleri kırmızıya döndürüyor). `..` yol geçişi
kontrolü **korumasız** (bulgu #2).

**Geri alma kanıtı:**
`shasum -a 256 -c` → `apps/storefront/src/themes/theme-css.ts: OK` ·
`packages/theme-sdk/src/manifest/asset-ref.ts: OK` · `cmp` → `CMP_IDENTICAL` (ikisi de) ·
depo diffstat oturum başındakiyle **birebir aynı**: `27 files changed, 765 insertions(+), 61 deletions(-)`.
**Kalıcı dosya değişikliği YOK.**

### İŞ 1 — izin listelerinin ölçülmüş davranışı

```
=== COLOR /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/ ===
RED   "#fff"                       (3 haneli kısaltma — bilinçli olarak dışarıda)
KABUL "#FFFFFF"   KABUL "#FFFFFFFF"
RED   "red"  RED "var(--x)"  RED "rgb(0,0,0)"  RED "#FF0000;}"
RED   "#FF0000</style><script>"    ← enjeksiyon girdisi
RED   "#FFFFFF " (sondaki boşluk)  RED "#ffffff\n"  RED "#FFFFFFF"  RED "#FFFFFFFFF"
→ ATLATMA BULUNAMADI. ⚠ Not: `$` JS'te (`m` bayrağı YOK) yalnızca girdi SONUNDA eşleşir —
  Python/PCRE'nin "sondaki satır sonu muafiyeti" JS'te YOK, bu yüzden "#ffffff\n" RED.

=== NAME /^[a-z][a-z0-9-]*$/ ===
KABUL "color-primary"  KABUL "a"
RED   "Brand-Accent" (SDK'da GEÇERLİ → low #4)  RED "1a"  RED "-a"
RED   "a_b" (SDK'da GEÇERLİ)  RED "a:b"  RED "a}b"  RED "a "
→ Uymayan ad SESSİZCE ATLANMIYOR: `assertValidVariableName` (theme-css.ts:100-106)
  `ThemeCssGenerationError` FIRLATIYOR. Kaçışlama YOK, izin listesi VAR (doğru tercih).

=== FONT /^[A-Za-z0-9 ,"'-]+$/ ===  → bulgu #1 (tek atlatma: dengesiz tırnak)
```

**SDK'dan devralma yok mu? — TEYİT EDİLDİ.** `theme-css.ts` üç deseni de **kendisi**
tanımlıyor (satır 63, 71, 80). `apps/storefront/package.json` `@arkesoft/theme-sdk`'yi
bağımlılık olarak **bildirmiyor** → pnpm katı izolasyonu altında devralma **yapısal olarak
imkânsız**. Tip `@arkesoft/themes-modern`'in `typeof modernTheme`'inden türetiliyor
(`theme-setting-definition.ts:28-31`), desenler türetilmiyor. **Kaçışlama değil izin listesi**
kullanılıyor (T-010'un kara liste → izin listesi dönüşümüyle aynı doğru tercih).

### İŞ 2 — SEC-5a sıkılaştırması gerçekten kapatıyor mu

```
=== ASSET /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/ ===
SEC-5a HEDEFİ:        RED "x/.env"       RED "assets/.hidden"              ✔ KAPANDI
BİLİNÇLİ KABULLER:    KABUL "a..b/c.jpg" KABUL "v1.2.3/x.jpg"              ✔ BOZULMADI
HANDOFF'UN SORDUKLARI:
  RED "x/..hidden"  RED "x/-dash"  RED "x/_under"  RED "x/."  RED "x//y"  RED "x/"
  RED "ｘ/．env" (tam genişlik homoglif)   RED "x/․env" (tek nokta öncüsü)
EK PROBE:
  RED ".."  RED "x/../y"  RED "x/.."  RED "./x"  RED "/x"  RED "x\\y"
  RED "x%2e%2eenv"  RED NUL içeren yol
KABUL "assets/a.." · "CON" · "a-" · "a." · "a_" · "x/y/z/w.jpg"
  → hepsi segment-başı kuralına uyuyor, yol geçişi semantiği YOK, zararsız
→ KALAN ATLATMA BULUNAMADI.
```

**Yayınlanan JSON Schema senkron:** `docs/theme-contract.schema.json`'daki **iki** `pattern`
alanı da kaynaktaki literalle **birebir** aynı (programatik karşılaştırma yapıldı; her iki
yol da `^[A-Za-z0-9][A-Za-z0-9._-]*(?:\\/[A-Za-z0-9][A-Za-z0-9._-]*)*$`). Drift YOK.

### İŞ 3 — Public API genişlemesi, altı alan sızıyor mu

- **Tip düzeyi:** `router-output.test-d.ts` pozitif pin 3 alana güncellendi **+** negatif pin
  6× `not.toHaveProperty` (alan BAŞINA bağımsız, intersection tabanlı değil → her satır tek
  tek mutasyona duyarlı; `backend` ilk, mutasyona duyarsız denemeyi kendi reddetmişti).
- **Çalışma zamanı / HTTP:** `apps/api/src/__tests__/trpc-http.test.ts:352` →
  `expect(Object.keys(body.result.data)).toEqual(['name', 'themeId', 'themeVersion'])`
  (**tam eşitlik**, alt küme değil) + `forbiddenKeys = ['planId','deletedAt','id','slug','status','primaryDomain']`
  için 0-bayt taraması, **gerçek Postgres + gerçek HTTP** üzerinde.
- **Sunucu tarafı seçim:** `storefront-tenant-read.port.adapter.ts:49` →
  `select: { name: true, themeId: true, themeVersion: true }` — altı yasak alan
  **resolver'a hiç gelmiyor** (Zod `.object()` soymasına güvenilmiyor, port dönüş tipine
  dayanıyor). → **altı alan sızmıyor, hem tipte hem çalışma zamanında ölçüldü.**
- `themeId`/`themeVersion` semver/slug **doğrulanmıyor** (bilinçli, ikinci doğruluk kaynağı
  olurdu) — gerçek kapı tüketicide ve **daha güçlü**: kayıt defterinin TAM EŞLEŞME araması,
  `resolveTheme()` fırlatıyor, `null` dönmüyor. Fail-closed teyit edildi (yukarıda madde 12).

### İŞ 6 — Zod parse atlatılabilir mi

`rg "currentTenant"` (apps + packages, `node_modules`/`dist` hariç, testler ayıklanmış) →
tRPC yanıtını tüketen **TEK** kod yolu: `apps/storefront/src/middleware.ts:192`
(`client.storefront.currentTenant.query()`), hemen ardından **:199**
`parseStorefrontTenantResponse(result)`. İkinci bir tüketici **YOK** → parse
**atlatılamıyor**. Şema reddi (`name` de yoksa) `ZodError` fırlatıyor; `middleware.ts:203`
catch'i `mapApiError`'a veriyor, hiçbir probe eşleşmediği için fail-closed `unavailable` →
**503**, sessizce yutulmuyor (`api-client.test.ts:164`'te pinli).

### İŞ 7 — sır yönetimi

```
git diff HEAD | grep -niE "(password|secret|api[_-]?key|token|BEGIN .*PRIVATE KEY|tckn)"
  → 0 eşleşme
takip edilmeyen dosyalarda aynı tarama → 4 eşleşme, HEPSİ Türkçe yorumda "token" kelimesi
  ("tasarım token'ları", "token tüketim kararı") — sır materyali YOK
```

- `.env` **gitignore'lu** (`.gitignore:7`) ve **DEĞİŞMEDİ**; `.env.example` takipli ve
  **DEĞİŞMEDİ** (`git status --porcelain -- '*.env*'` → boş). **Kullanıcının `.env`'ine
  YAZMADIM.**
- Kart verisi / parola / TCKN / ödeme akışı: bu değişiklikte **yüzey yok** (ödeme, webhook,
  imza doğrulama, idempotency, dosya yükleme, SSRF, komut çalıştırma — hiçbiri diff'te yok).
- KVKK: eklenen iki kolon (`theme_id`, `theme_version`) **kişisel veri değil**, platform
  meta verisi. Public API'ye **fazla veri eklenmedi** (altı yasak alan hâlâ yok, yukarıda
  ölçüldü). Silme talebi akışı etkilenmiyor (`deletedAt: null` filtresi korundu). Üçüncü
  tarafa veri gitmiyor.

### Oran sınırlama

`/trpc/*` oran sınırsız (`trpc.controller.ts:39` "RateLimitGuard /trpc'de anında true").
**Bu değişiklik yeni uç eklememiştir** — `storefront.currentTenant` v0.0.8'den beri var ve
sınırsızlık ROADMAP'te **üç satır** hâlinde takipli: `:1646`, `:1702` (⚠ "vitrin herkese açık
yayına çıkmadan v0.0.14 öne çekilmezse `medium`'a terfi eder"), `:1707`. **Yeniden bulgu
olarak yazılmadı** (çift kayıt olurdu); terfi koşulunun hâlâ geçerli olduğunu bildiriyorum.

### Ölçemediklerim (§5)

1. **`pnpm test:isolation`** — handoff tam koşumları yasakladı; handoff'un 18 testi (db 14 +
   api 4) **devralındı**, kendim doğrulamadım. Yeni kiracıya bağlı kaynak eklenmediği için
   yeni vaka beklenmiyor, ama **sayıyı ölçmedim**.
2. **`pnpm build` / `pnpm dev` / Playwright** — koşturulmadı (handoff yasağı). `dist`
   analizim S8/S9'un ürettiği **mevcut** çıktı üzerinde; bulgu #1'in düzeltmesinden sonra
   `dist` yeniden üretilmeli ve İŞ 4 taraması **yenilenmeli**.
3. **Bulgu #1'in tarayıcıda gerçekleşen etkisi** — CSS ayrıştırıcı davranışını spec
   (CSS Syntax §4.3.1) ve üretilen metin üzerinden **akıl yürüterek** belirledim; gerçek bir
   tarayıcıda render ettirmedim (Playwright yasağı). Düşen bildirim sayısı tarayıcıya göre
   değişebilir; **enjeksiyon olmadığı** sonucu desen ölçümüne dayanıyor ve ondan bağımsızdır.
4. **`theme-css.ts`/`asset-ref.ts` desenleri** modül sistemi üzerinden değil, **kaynak
   dosyadan metin olarak** okunup değerlendirildi (`.ts` modülünü node'da çözmek `.js` uzantı
   eşlemesi yüzünden mümkün değil). Desenlerin kendisi gerçek, ama `declarationsOf`'un
   çağrı sırası desen ölçümünde değil, **kod okumasıyla** doğrulandı.
