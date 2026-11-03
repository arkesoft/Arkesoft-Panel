# T-011 · GATE: solid · tur 3 (DAR kapsam)

**Tarih:** 2026-11-02
**Sürüm:** v0.0.9.1 · platform patch 0.1.0 → 0.1.1
**Kapsam:** DAR — yalnızca FIX 2'nin değiştirdiği 3 dosya + kendi tur 2 bulgularımın kapanışı.
Yeni tarama YAPILMADI (run.md DAR kuralı).

```
GATE: solid
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] apps/storefront/src/lib/__tests__/env-contract.test.ts:373-389 — P8 self-test'i `extractWebServerCommandLine`'ın TAM GİRDİYİ döndürme (`return raw`) arıza biçimine KÖR; bu, L1'in düzelttiği ORİJİNAL kusurun aynısı. Sentetik blok BİR BÜTÜN olarak da `not.toContain('astro dev')` + `toContain('astro build')` assert'lerini geçiyor; gerçek pinler (P6/P8) de geçer çünkü `playwright.config.ts` metninde 'astro build'/'astro preview' HİÇ YOK ve önek :108'de var → beş assert birden SESSİZCE yeşil. :115-120 ve :364-372'deki "mutasyona karşı duyarlılık GERÇEKTEN ölçülüyor" beyanı bu arıza biçimi için geçerli değil. — Self-test'i TEK SATIR garantisiyle güçlendir: `expect(webServerCommandLine).not.toContain('webServer')` (+ istenirse `.not.toContain('port:')`) veya doğrudan `toBe('    command: `astro build && astro preview`,')`; P7 self-test'inin `toEqual` (tam çıktı) deseniyle hizalanır. — qa
  - [SEV: low] apps/storefront/src/lib/__tests__/root-env-integration.test.ts:13-15 — L3'ün yeni başlığı `env-contract.test.ts:198`'in `mockRestore()` desenine atıf veriyor; o çağrı gerçekte `:232`'de (`:198` P2'nin kapanış satırı). FIX 2 aynı turda `env-contract.test.ts`'e 2 yardımcı fonksiyon (~34 satır) ekleyince referans kaydı — L2'nin TAM OLARAK bu yüzden satır numarasından sembole çevirdiği kusur, ikinci dosyada tekrarlandı. — Referansı sembolle ver (`env-contract.test.ts`'in `buildLoadEnvFileSpy.mockRestore()` çağrısı), satır numarası yazma. — qa, vade v0.0.14
  - [SEV: low] apps/storefront/src/lib/__tests__/root-env-integration.test.ts:156 — `error.mock.calls[0] as [string]` hâlâ doğrulanmamış `as` (CLAUDE.md §4: `as` yalnızca Zod doğrulamasından hemen sonra meşru). L4 ile AYNI bulgu sınıfı, farklı çağrı yeri; aynı dosyada ve aynı düzenlemede kapanabilirdi (AGENT_BASELINE §4 "yolu üstündeyse kapat"). — `expect(error).toHaveBeenCalledWith(expect.stringMatching(/.../))` ile üç regex'i ayrı ayrı assert et; `as` kalkar. — qa, vade v0.0.14
  - [SEV: low] apps/storefront/src/lib/root-env-integration.ts:98 — `existsSync(rootEnvPath)` false kolu (kök `.env` yokken sessiz atlama) test edilmiyor; L5'in kaldırdığı assert bu kolu zaten egzersiz ETMİYORDU, yani kapsam azalmadı ama boşluk açık. qa borcu test:200-215'te gerekçeli kaydetti — kabul ediyorum. — `vi.doMock('node:fs')` + test başına dinamik yeniden-import iskelesi; v0.0.14'te `node:fs` mock hijyeni ile birlikte. — qa/devops, vade v0.0.14
ÖLÇÜMLER: kapsamda 3 dosya denetlendi + 6 referans dosyası okundu (root-env-integration.ts, storefront-env-schema.ts, storefront-env.test.ts, eslint.config.mjs, playwright.config.ts, vitest.config.ts) + 3 kanıt dosyası (.gitignore, package.json:23, .github/** setup-workspace/ci.yml) · `any`: 0 · `@ts-ignore`: 0 · doğrulanmamış `as`: 1 (`root-env-integration.test.ts:156`) + 4 önceden kabul edilmiş test-double `as unknown as` = 5 (qa'nın 7→5 ölçümüyle birebir) · en büyük fonksiyon: 33 satır (`env-contract.test.ts:213-246`, P4 test gövdesi); en büyük yardımcı: 13 satır (`root-env-integration.test.ts:53-65`, `runSetupHook`) · KOŞTURULAN KOMUT YOK (Bash izni yok — tüm ölçümler kaynak okuma + `rg` ile)
```

---

## İŞ 1 · M1 kapanışı ve getirdiği yeni risk

### M1 — **KAPANDI ✔**

- `filterPublicPrefixedLines` (`env-contract.test.ts:135-137`) ve `extractWebServerCommandLine`
  (`:122-124`) adlandırılmış, tek noktada yaşayan fonksiyonlar.
- Çağrı yerleri okundu: P6 `:271`, P6 self-test `:290`, P7 `:309`, P7 self-test `:334`,
  P8 `:348`, P8 self-test `:381`. **Hiçbir self-test mantığı satır içinde yeniden yazmıyor** —
  M1'in kusurunun kökü tam olarak buydu. Kapandı.

### (a) Pini VE self-test'i aynı anda YEŞİL bırakan bir arıza biçimi var mı → **EVET, bir tane var**

Mutasyonu **koşturmadım** (hiçbir dosyayı değiştirme kısıtı); statik olarak, gerçek dosya
metinleri üzerinden türettim. Kanıt zinciri:

**Arıza biçimi:** `extractWebServerCommandLine = (raw) => raw` (tam girdiyi döndür) — ki bu,
L1'in düzelttiği **orijinal kusurun** (P6'nın tüm dosya metninde arama yapması) fonksiyon
içine taşınmış hâli.

| Assert | Girdi | Sonuç |
| --- | --- | --- |
| P8 self-test `:387` `not.toContain('astro dev')` | sentetik blok (4 satır) | blokta 'astro dev' yok → **YEŞİL** |
| P8 self-test `:388` `toContain('astro build')` | sentetik blok | `:375`'te var → **YEŞİL** |
| P6 self-test `:296` `not.toContain(driftedPrefix)` | playwright.config.ts TAMAMI | sapmış önek dosyada yok → **YEŞİL** |
| P6 `:277` `toContain('${prefix} astro dev')` | dosya TAMAMI | `playwright.config.ts:108` o öneki birebir taşıyor → **YEŞİL** |
| P8 `:354-356` `toContain('astro dev')`, `not.toContain('astro build')`, `not.toContain('astro preview')` | dosya TAMAMI | `rg 'astro (build\|preview\|dev)' playwright.config.ts` → **4 eşleşme, hepsi 'astro dev'** (`:17`, `:20`, `:56`, `:108`); 'astro build'/'astro preview' dosyada **HİÇ YOK** → **YEŞİL** |

→ **Beşi birden yeşil.** Yani tek nokta, bir mutasyon için (`includes('webServer')`) gürültülü
arızalanıyor ama **başka bir mutasyon için sessiz**. Orkestratörün endişesi haklı;
`qa`'nın tek mutasyon ölçümü yeterli kanıt değildi.

**Simetri notu (kök neden):** `filterPublicPrefixedLines`'ın self-test'i `toEqual([...])` ile
**tam çıktıyı** pinliyor ve sentetik veri bilerek bir yakın-kaçırma satırı taşıyor
(`PUBLICSENTINEL=1`) → gevşeme (daha az eşleşme) **ve** genişleme (daha çok eşleşme)
yönlerinin **ikisi de** kırmızı veriyor; bu self-test sağlam. `extractWebServerCommandLine`'ın
self-test'i ise `toContain`/`not.toContain` ile **alt dizge** assert ediyor — çıkarıcının
"hangi satırı" döndürdüğünü değil, "döndürdüğü metnin neyi içerdiğini" ölçüyor.
**Kusur paylaşılan fonksiyonda değil, assert'in şeklinde.** → yukarıdaki `medium`.

### (b) Bu desen (pin ve kanıtı aynı yardımcıyı paylaşıyor) kabul edilebilir mi → **EVET, kabul edilebilir; self-test BAĞIMSIZ uygulama sınamamalı**

Gerekçe (ikisi de meşru olabilirdi, karar kanıta dayanıyor):

1. **Bağımsız uygulama = M1'in kusurunun tanımı.** Self-test'in varlık sebebi "H fonksiyonunun
   mutasyonu kırmızı veriyor mu" sorusudur. H'nin bir **kopyasını** sınayan test, H hakkında
   sıfır bilgi taşır — tur 2'de ölçtüğüm tam olarak buydu (`startsWith('PUBLIC')` mutasyonu
   eski self-test'i yeşil bırakıyordu). FIX 2'nin yönü **doğru**.
2. **Kopya gerçek tekrardır.** İki uygulama aynı sebeple (filtre/çıkarıcı kuralı değişirse)
   birlikte değişmek zorundadır → CLAUDE.md §4 DRY'ın hedeflediği tekrar sınıfı. Yüzeysel
   benzerlik değil, gerçek tekrar.
3. **Tek noktanın riski assert gücüyle kapatılır, çoğaltmayla değil.** `filterPublicPrefixedLines`
   bunun kanıtı: aynı desen, ama tam-çıktı assert'i ile hiçbir gerçekçi gevşemeye izin vermiyor.
   Reçete: **tek uygulama + tam çıktı (`toBe`/`toEqual`) assert'i + yakın-kaçırma içeren sentetik
   veri.** `extractWebServerCommandLine`'ın self-test'i bu reçetenin üçüncü maddesini (tam çıktı)
   karşılamıyor; tek satırlık düzeltme yeterli.

---

## İŞ 2 · M2 kapanışı

### Tur 1 ifademin düzeltilmesi — **`frontend` haklı, TEYİT EDİLDİ**

Tur 1'de *"re-export'lar ölü değil — `storefront-env.test.ts` tüketiyor"* demiştim. `rg` ile
bağımsız doğruladım: bu ifade **yalnızca `storefrontEnvSchema` için** geçerliydi, üç isim için
değil. Ölçüm:

- `storefront-env.js` üzerinden import eden tüm yerler: `src/middleware.ts:93`
  (`storefrontEnv`), `e2e/global-setup.ts:13` (`storefrontEnv`), `api-client.ts:20`
  (`storefrontEnv`), `__tests__/middleware.test.ts:39` (`vi.mock`),
  `__tests__/storefront-env.test.ts:30,43,56,69` (`storefrontEnvSchema`, dinamik) ve
  `:84,97,105` (`storefrontEnv`, dinamik).
- `parseStorefrontEnv` / `StorefrontEnv`'i `storefront-env.js` üzerinden ithal eden: **SIFIR**.
  Tüm tüketiciler `storefront-env-schema.js`'ten doğrudan alıyor
  (`root-env-integration.ts:56`, `storefront-env.ts:66-67`).

→ **M2: KAPANDI ✔.** Benim tur 1 ifadem fazla genişti; `frontend`'in ölçümü doğru.

### Asıl soru: tuzak yapısal olarak kapandı mı → **ADLANDIRILMIŞ tuzak KAPANDI; genel erişilebilirlik AÇIK ama arıza profili farklı → `low`, mevcut borca eklenir**

1. **M2'nin kanıt zinciri (adlandırılmış tuzak) yapısal olarak kapandı.** Zincir şuydu:
   `root-env-integration.ts:56` bir gün `from './storefront-env.js'` olarak sadeleştirilirse
   eager parse her `command` dalında tetiklenir. O dosya **tam olarak `parseStorefrontEnv`'i**
   import ediyor; `storefront-env.ts` artık o adı export **etmiyor** (`:64` yalnızca
   `storefrontEnvSchema`). Yani o sadeleştirme bugün **`tsc` hatası** verir → `pnpm typecheck`
   kırmızı. Gözden geçirme disiplinine değil **derleyiciye** dayanan bir savunma: kapandı.

2. **Genel erişilebilirlik hâlâ var ve orkestratörün tespiti doğrudur:** ES modül anlambilimi
   gereği `storefront-env.js`'ten **herhangi** bir ad (dolayısıyla `storefrontEnvSchema` de)
   import edilirse `:70`'teki eager `parseStorefrontEnv(process.env)` çalışır. Bu, dosyanın
   kendi yorumunda (`storefront-env-schema.ts:4-25`) birebir belgeli.

3. **Ama arıza profili M2'nin tuzağıyla aynı değil** — kararın dayanağı bu:
   - Eager parse `process.env`'i **yalnızca OKUR**. AC8'in koruduğu şey `loadEnvFile` ile
     kök `.env`'i sürece **YAZMAK** (sırların `PUBLIC_*` üzerinden istemci bundle'ına sızma
     zinciri, `root-env-integration.ts:21-31`). Salt okuma o zinciri **kurmuyor**.
   - Gerçek zarar: `astro build`/`preview`/`sync` kabukta iki değişken yoksa **fırlar** →
     **gürültülü**, sessiz değil.
   - Bugün bu yolu kullanan **sıfır** tüketici var; `root-env-integration.ts` şemaya
     ihtiyaç duymuyor (parse ediciye duyuyor).
   - Mekanik savunma, `no-restricted-imports` ile `root-env-integration.ts`'ten
     `**/storefront-env.js`'i yasaklamak olurdu — bu **zaten açık borç**: tur 2'nin
     `eslint.config.mjs:76` glob'u bulgusu (`frontend`, v0.0.14). Yeni bulgu AÇMIYORUM,
     o borç satırına **"kapsama `storefront-env.js`→`root-env-integration.ts` yönü de
     eklenmeli"** notunu bağlıyorum.

   → `low`, mevcut borca ek; FIX 2 bu durumu **kötüleştirmedi**, iyileştirdi (üç isimden ikisi
   erişilemez oldu).

---

## İŞ 3 · Test sayısı 84 → 83: **GEVŞETME DEĞİL, MEŞRU TEMİZLİK**

`qa`'nın ölçümlerini bağımsız doğruladım:

| İddia | Doğrulama |
| --- | --- |
| `.gitignore` `.env`'i izlemiyor | **✔** `.gitignore:7` = `.env` (`:8-9` `.env.local`, `.env.*.local`) |
| `env:init` yalnızca kurulumla koşuyor | **✔** `package.json:23` `"env:init": "[ -f .env] \|\| (cp .env.example .env …)"`, yalnızca `infra:up` (`:25`) ve CI aksiyonundan çağrılıyor |
| CI yeşilliği test'in kendisinden değil, `create-env` varsayılanından | **✔** `.github/actions/setup-workspace/action.yml:15` `default: 'true'`; `storefront` job'u (`ci.yml:984`, setup `:995`) bu girdiyi **vermiyor** → `.env` üretiliyor. `guards` job'u (`:348-350`) **bilerek** `'false'` veriyor çünkü konusu "`.env` olmadan çalışıyor mu" |
| Assert hiçbir `root-env-integration.ts` kod yolunu egzersiz etmiyordu | **✔** kaldırılan assert `existsSync(REPO_ROOT/.env)` idi — `createRootEnvIntegration` hiç çağrılmıyordu; ortam dosya sistemini kontrol ediyordu |
| Temiz klonda `pnpm test` kırmızı verirdi | **✔ türetildi** — `apps/storefront/vitest.config.ts`'te `setupFiles` YOK, kök `.env` üretimi yalnızca `env:init`'e bağlı; hiçbir kurulum script'i koşulmazsa dosya yok → assert kırmızı |
| `git ls-files .env` boş | **ÖLÇEMEDİM** — `Bash` iznim yok. Yukarıdaki üç kanıt (`.gitignore:7`, `env:init`'in koşullu `cp`'si, `guards` job'unun `.env` olmadan koşması) bu iddiayla tutarlı; çelişen kanıt bulamadım |

**Karar — CLAUDE.md §10 md 6 İHLAL EDİLMEDİ.** O yasak *"kabul kriterini geçirmek için testi
gevşetmek"* diyor. Burada:

1. Kaldırılan assert **hiçbir kabul kriterinin kanıtı değildi** — AC5/AC8'in kanıtı P4
   (`env-contract.test.ts:213-246`) ve `root-env-integration.test.ts`'in beş testi + üç
   `loadEnvFile` spy'ı; **hepsi yerinde, hiçbiri zayıflatılmadı** (okuyarak doğruladım).
2. Kaldırma **kırmızı bir kapıyı yeşile çevirmek için yapılmadı** — kapı FIX 2 öncesinde de
   yeşildi (957/957). Kaldırmanın sebebi benim tur 2'deki *"davranışı test etmeyen test"*
   sınıfım; §6'nın "test davranışı doğrular" ilkesi bu yönü **destekliyor**.
3. Kaldırma bir **kırılganlığı** da gideriyor: ortam-bağımlı (temiz klonda kırmızı) bir assert,
   `test.skip`'le susturulmuş bir flaky test kadar zararlıdır.
4. Reddedilen alternatif (`vi.mock('node:fs')`) gerekçesi **sağlam**: modül-geneli mock bu
   dosyadaki tüm testleri etkiler, güvenli kapsam `vi.doMock` + test başına dinamik
   yeniden-import iskelesi ister; bu bir `low` için orantısız kapsam büyümesi ve yeni flakiness
   riskidir. Boşluk **borç olarak kaydedildi** (`test.ts:200-215`) → yukarıdaki 4. `low`.
5. **Ölü kod kontrolü:** assert kalkınca `node:fs`/`existsSync` import'u da dosyada
   bırakılmamış (import listesi `:35-41`: yalnızca `node:path`, `vitest`, astro tipi, SUT) —
   `REPO_ROOT` ise `:154`/`:182`'de hâlâ kullanılıyor. Artık import/ölü sabit **yok**.
6. **84 → 83'ün tek kalem olduğunu** `git diff` ile **ölçemedim** (Bash izni yok); üç dosyanın
   mevcut hâlinde başka bir kaldırma izi (yorum artığı, `skip`, `todo`) bulamadım —
   `rg 'test\.skip\|it\.skip\|\.todo'` kapsam dosyalarında sıfır (okuma ile de doğrulandı).

---

## İŞ 4 · Beyan/gerçeklik boşluğu — FIX 2 bir tane GETİRDİ (low), ikisini KAPATTI

### `storefront-env.ts:26-43` (L1) — **KAPANDI ✔, iddia ölçümle ÖRTÜŞÜYOR**

| İddia | `eslint.config.mjs` doğrulaması |
| --- | --- |
| kural adı `no-restricted-globals` | **✔** `:149` |
| `files` kapsamı yalnızca `src/components/**` | **✔** `:138` `['src/components/**/*.ts','src/components/**/*.tsx']` |
| kısıtlanan liste `process`, `Buffer`, `__dirname`, `__filename` | **✔** `:149` birebir |
| kapsam **dışı** yollar: `src/pages/**`, `src/middleware.ts`, `src/layouts/**`, `src/lib/**` | **✔** `no-restricted-globals` yalnızca `:137-151` bloğunda; `:104-112` ve `:155-160` blokları `src/**` kapsasa da başka kurallar (`no-restricted-imports`, `no-console`) |
| "bu okumayı MEKANİK olarak ZORLAMAZ" | **✔** doğru — kural bir *yasak*, envanter *gereklilik* beyanı; `eslint.config.mjs:123-128` zaten "`src/lib/storefront-env.ts` (K17) `process.env`'i okumak ZORUNDADIR" diye bu kararı açıklıyor |
| envanter: üretim kodunda **iki** okuma noktası | **✔** `rg process\.env apps/storefront/src` → `__tests__/**` dışında **gerçek okuma** yalnızca `storefront-env.ts:70` ve `root-env-integration.ts:103`; diğer tüm eşleşmeler yorum metni (`request-origin.ts:14`, `storefront-env-schema.ts:4,7,12,41` vb.) |

Bu, FIX 1'de tekrarlanan hata sınıfının **bu kez tekrarlanmadığı** anlamına geliyor: cümle
kuralın ne yaptığını (*restricted*, *required* değil) ve kapsamını doğru söylüyor.

### `env-contract.test.ts:23-34` (L2) — **KAPANDI ✔**

- Atıf verilen başlık **birebir var**: `storefront-env.ts:13` →
  `// ⚠ BAĞIMLISLIK…` değil, tam metin `// ⚠ BAĞIMLILIK KARARI (RİSKLER'de de işaretli):`.
  Test dosyasındaki alıntı (`:23-24`) karakter karakter aynı.
- Özetlenen karar da doğru: o blok (`:13-24`) `@arkesoft/config`'in `devDependencies`'te
  olduğunu ve bu yüzden `parseEnv`/`EnvValidationError`'ın üretim yolunda
  **kullanılmadığını** söylüyor; test dosyasının "o karar üretim modüllerine özgü, bu dosya
  bir test" muhakemesi geçerli.
- **`frontend`'in paralel düzenlemesinden sonra hâlâ geçerli:** `frontend` aynı dosyaya
  `:45-63` arası yeni bir blok ekledi ve başlık `:11`'den `:13`'e kaydı — **satır numarası
  verilmediği için yorum doğru kaldı.** L2'nin düzeltme biçimi (sembol/başlık) tam olarak
  bunun için seçilmişti ve işe yaradı. Kanıtlı.

### `root-env-integration.test.ts:10-23` (L3) — **KISMİ ⚠ (yeni `low`)**

- **Doğru kısım:** `afterEach` (`:71-75`) artık `vi.restoreAllMocks()` **içeriyor** → başlığın
  "`process.loadEnvFile` üzerindeki `vi.spyOn` çağrıları … geri yüklenir" beyanı artık gerçek.
  `vi.resetModules()` de orada. Beyan ↔ gerçeklik hizalandı.
- **`env-contract.test.ts:198` deseniyle tutarlılık:** amaç olarak **evet** tutarlı — orada
  spy tek test içinde açılıp `mockRestore()` ile kapatılıyor (`try/finally` ile env geri
  alınıyor), burada dosya genelinde `afterEach` + `restoreAllMocks`. İkisi aynı hijyen
  sözleşmesini kuruyor; iki dosyanın yapısı (biri tek test içinde iki dal, diğeri altı ayrı
  test) farklı olduğu için farklı mekanizma meşru.
- **⚠ Kusur:** atıf verilen satır **yanlış**. `buildLoadEnvFileSpy.mockRestore()` gerçekte
  `env-contract.test.ts:232`'de; `:198` P2 testinin kapanış satırı. FIX 2'nin kendisi aynı
  dosyaya iki yardımcı fonksiyon ekleyerek bu referansı kaydırdı. Yani **L2'nin dersi iki
  dosyadan yalnızca birine uygulandı.** → yukarıdaki 2. `low`.

### Yeni/değişen test başlıkları — **doğru tarif ediyor ✔**

- `P6` (`:267`) "…`scripts.dev`'den türetilmiş, literal yazılmamış" — `:269`
  `deriveAstroDevEnvPrefix(pkg.scripts.dev)` ile örtüşüyor ✔
- `P7 self-test` (`:327`) "…yalnızca `PUBLIC` ile başlayan (alt çizgisiz) yakın-kaçırma
  satırını YAKALAMAZ" — `:328-336` sentetik veri + `toEqual` tam olarak bunu ölçüyor ✔
- `P8 self-test` (`:373`) "…`webServer` kelimesini taşıyan ÖNCEKİ satırı DEĞİL" — başlık
  **ölçtüğü şeyi doğru** söylüyor; sorun başlığın yanlış olması değil, **daha fazlasını
  ima eden yorumun** (`:115-120`, `:364-372`: "mutasyona karşı duyarlılık GERÇEKTEN ölçülüyor")
  tüm arıza biçimlerini kapsamaması — İŞ 1(a)'daki `medium` bunu kapsıyor.
- `root-env-integration.test.ts:134` (AC5 dal B) ve `:172` başlıkları gövdeleriyle örtüşüyor ✔

---

## İŞ 5 · Tur 2 bulgularının kapanış tablosu

| Bulgu | Durum | Kanıt |
| --- | --- | --- |
| **M1** self-test gerçek fonksiyonu çağırmıyor | **KAPANDI ✔** (+ 1 yeni `medium` kalıntı) | `env-contract.test.ts:122-124,135-137`; altı çağrı yeri `:271,290,309,334,348,381`. Kalıntı: İŞ 1(a) |
| **M2** gereksiz re-export yüzeyi/tuzak | **KAPANDI ✔** | `storefront-env.ts:64` yalnızca `storefrontEnvSchema`; `parseStorefrontEnv`/`StorefrontEnv` `:66-67`'de **yerel import** (export değil). Adlandırılmış tuzak derleyici tarafından kapatıldı (İŞ 2) |
| **L1** P6 tüm dosyada arıyordu | **KAPANDI ✔** | `:271` `extractWebServerCommandLine(playwrightConfigRaw)`; satır-bazlı |
| **L2** çapraz referans satır numarasıyla | **KAPANDI ✔** | `:23-34` başlıkla; `storefront-env.ts:13`'te birebir mevcut, `frontend`'in düzenlemesinden sağ çıktı |
| **L3** başlık ↔ `afterEach` uyuşmazlığı | **KISMİ ⚠** | `vi.restoreAllMocks()` `:73`'te ✔; ama `:13` atfı `:198` → gerçek `:232` (yeni `low`) |
| **L4** iki doğrulanmamış `as` | **KISMİ ⚠** | `:154` ve `:182` `toHaveBeenCalledWith(join(REPO_ROOT,'.env'))` ✔; `:156` `as [string]` **AÇIK** → `low`, L4 ile aynı sınıf, aynı düzenlemede kapanabilirdi |
| **L5** ortam-bağımlı `existsSync` assert'i | **KAPANDI ✔** | Test kaldırıldı, `node:fs` import'u da bırakılmadı; karar meşru (İŞ 3) |
| `turbo.json:49-52` gerekçesi | **AÇIK** — ROADMAP borcu, yeniden açılmadı | — |
| `runSetupHook`/`fakeLogger` tekrarı | **AÇIK** — ROADMAP borcu, yeniden açılmadı | — |
| `parseEnv` kopyası | **AÇIK** — ROADMAP borcu, yeniden açılmadı | — |
| `eslint.config.mjs:76` glob'u | **AÇIK** — ROADMAP borcu; İŞ 2'nin kalıntısı bu satıra **eklenmeli** (`storefront-env.js` → `root-env-integration.ts` yönü) | — |
| `check-env.ts:98-99` satır numaraları | **AÇIK** — ROADMAP borcu, yeniden açılmadı | — |

---

## Ölçemediklerim (AGENT_BASELINE §5 dürüstlük)

- **`git diff` / `git ls-files` / `shasum` / mutasyon koşumu:** `Bash` iznim yok. İŞ 1(a)'daki
  arıza biçimi **koşturularak değil**, gerçek dosya metinleri (`playwright.config.ts`,
  sentetik blok, assert listeleri) üzerinden **türetilerek** gösterildi; her adımın kanıtı
  `dosya:satır` olarak yukarıda.
- **84 → 83'ün tek kalem olduğu:** diff olmadan doğrulanamaz; dosyalarda ikinci bir kaldırma
  izi bulunmadı.
- **`pnpm test` / `build` / Playwright:** brief'in KOŞTURMA yasağı gereği çalıştırılmadı;
  `qa`'nın 957/957 ölçümü kabul edildi.
