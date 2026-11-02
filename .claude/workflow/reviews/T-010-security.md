# T-010 · security gate · üç tur (derlenmiş)

> **Not (Orkestratör):** Bu raporu Orkestratör dökmüştür. Gate ajanına **üç turda da dosya
> yazmaması talimat verildi** — T-009'da aynı rol sekiz yüzeyi tek bağlamda taşımaya
> çalışıp **üç denemede hiç çıktı üretemedi** (bağlam tükenmesi). Bu Task'ta kapsam her
> turda dört-beş yüzeye bölündü ve `Write` yasaklandı. Denetim izindeki boşluk **ajanın
> ihlali değil, Orkestratör'ün kararıdır**. Ölçümler ajanın ham çıktısıdır.
> Kardeş raporlar: `T-010-solid-tur{1,2,3}.md`, `T-010-qa-tur{1,2,3}.md` (diskte).

| Tur | Kapsam | Sonuç | critical | high | medium | low |
| --- | ------ | ----- | -------- | ---- | ------ | --- |
| 1 | dört yüzey | **FAIL** | 0 | **2** | 3 | 6 |
| 2 | TAM (kural değişti) | **FAIL** | 0 | **1** | 3 | 6 |
| 3 | TAM | **PASS** | 0 | 0 | **0** | 5 |

---

## TUR 1 — iki `high`, aynı güvenlik kontrolü

**H1 · `manifest/asset-ref.ts:58-76`** — `isValidThemeAssetPath` dört ham-dize **kara
listesi**; normalizasyon, karakter izni, uzunluk sınırı **yok**. **36 girdi ölçüldü, 22'si
atlattı.** En çarpıcısı: belgelenen iki red (baştaki `/`, `..` segmenti) **tek baştaki
boşlukla** düşüyor — `' /etc/passwd'` ve `' ../x'` **KABUL**. Ek atlatmalar:
`%2e%2e%2f` · `%2E%2E/` · `%252e…` · `....//` · `.../` · `．．/` · `․․/` ·
NUL (`a.jpg\0.png`) · CR/LF · `a\tb` · `a‮b` · `a1:/foo` (şema deseni `/^[a-z]+:/i`
**rakamlı şemayı kaçırıyor**) · `''` · `'.'` · `'assets/'` · `'./a.jpg'` · 8 KB yol.
⚠ **Zamanlama:** `path` biçimini **v0.0.10'dan SONRA** sıkmak yayınlanmış temaları
reddeder → **`major`**. Bu yüzden `high`.

**H2 · `settings/primitives.ts:178`** — `settings`/`group.children` dizilerinde **yinelenen
`key` tespit edilmiyor**; `Object.fromEntries` **son tanımı kazandırıyor**. Ölçülen senaryo:
```
settings: [{key:'hero',type:'image'}, {key:'hero',type:'text'}]        → KABUL
validateThemeSettings(…, {hero:'../../etc/passwd'})                    → ok:true
```
→ **H1'in yol doğrulamasının TAMAMI tek bir yinelenen anahtarla devre dışı.** Kardeş yüzey
`templates` bu sınıf için `THEME_TEMPLATE_DUPLICATE` taşıyor, `settings` taşımıyor.

**Üç `medium`:** `key` için biçim/uzunluk doğrulaması **yok** (`''`, `' '`, `'../x'`,
`'a\nb'`, `'toString'`, `'<script>'`, 5000 karakter → hepsi KABUL) · `structuredClone`
`try` **dışında** → klonlanamaz girdi ayrımlı birleşim sözleşmesini **ihlal edip fırlatıyor**
(`DOMException`) · AC6 katman 1 **yalnızca** `validateThemeManifest` yolunda; üç doğrudan
giriş noktası `{key:'__proto__'}`'yu **KABUL** ediyor ve `deriveDefaultSettings` çıktısı
**öz `__proto__` anahtarı** taşıyor.

**Olumlu (tur 1):** asimetrik güven sınırı **sağlam** (9 nesne yüzeyi, **0** gevşek; 8/8 iç
içe/dizi/DU yüzeyinde red; "SOY→REDDET" sızıntısı **yok**) · prototip kirliliği 4/4 temiz ·
`dist/client` sır **0** · `pnpm audit` v0.0.8 tabanıyla **birebir** · CLAUDE.md §7 **N/A**.

---

## TUR 2 — düzeltme kuralı değiştirdi, tablo yeniden ölçüldü

**H1 → KAPANDI.** İzin listesi + **512** uzunluk sınırı 22 atlatmanın **21'ini yapısal
olarak** kapattı; 14 doğru red **regresyonsuz** korundu. `a..b/c.jpg` **bilinçli kabul**
(`..` **segment** olarak yasak, alt dize değil — bir dizin adı olarak masum).
⚠ **Yeni izin listesi üzerinde 30 ek sınama:** en tehlikeli sınıf **yapısal olarak kapalı**
— `.env` · `.hidden/x` · `.git/config` → **RED**. Ayrıca `a//b` · `_x/y` · `-x/y` · `a/..` ·
`x/..%2f..%2fy` · 513 karakter → RED. Uzunluk sınırı **segment sayısından bağımsız**.

**H2 → KAPANMADI (yeni `high`).** Şema seviyesine taşıma `validateThemeSettings` ve manifest
yolunu kapattı ama **iki dışa açık giriş noktası korumasız kaldı:**
```
migrations/run.ts:221   migrateThemeSettings → schemaFromDefinitions ön kontrolsüz
  yinelenen 'hero' (image→text) + migrate() → {hero:'../../etc/passwd'}   → ok:true
  (aynı migrate yinelenen key OLMADAN → ok:false)
settings/defaults.ts:55 deriveDefaultSettings → sessizce gölgelenmiş varsayılan {"hero":"x"}
```

**`cause` eklemesi sır sızıntısı kanalını YENİDEN AÇTI (`medium`).** `buildRunFailure`
`cause`'u **öz + enumerable** yazıyor, üstelik alan beyan edilen dönüş tipinde **görünmüyor**:
```
message ve issues          → 4/4 TEMİZ
JSON.stringify(result)     → fırlatılan DİZE ve DÜZ NESNE için 'GIZLI: db://user:pass@host' SIZDI
```
⚠ Tur 1'de bu kanal **temiz** ölçülmüştü. Sonuç somut: `apps/api` sonucu CLAUDE.md §4 gereği
**yapılandırılmış JSON** olarak loglayacak → kiracı yapılandırması üzerine kapanan bir
migration **doğrudan log sızıntısı kanalı**.

**Yayınlanan şemada `key` için aynı boşluk (`medium`).** `key` hâlâ `{"type":"string"}`;
iki *"zayıf izdüşüm"* notunun **ikisi de `path`'e** ait. `path` için kapatılan boşluğun
**birebir aynısı** `key` için açık.

---

## TUR 3 — PASS

| Bulgu | Sonuç | Ölçüm |
| ----- | ----- | ----- |
| **S1** `high` | **KAPANDI** | yinelenen `hero` + `../../etc/passwd` → `{"ok":false,"issues":[{"code":"THEME_SETTING_INVALID","path":"[1].key"}]}`; `deriveDefaultSettings` → `ThemeContractError` **fırlatıyor** |
| **S3** `medium` | **KAPANDI** | `JSON.stringify(result)` **TAM nesne** üzerinde dize/düz nesne/`Error` için **TEMİZ**; `Object.keys(result)` üç dalda da `["ok","issues"]`; `cause` erişilebilir ama **non-enumerable** |
| **S4** `medium` | **KAPANDI** | **15** `key` konumunda `pattern:"^[A-Za-z][A-Za-z0-9_-]*$"` + `maxLength:128`, ikisi de `keys.ts`'ten (**ikinci kopya yok**); *"zayıf izdüşüm"* notu **2 → 17** |
| **M(sec3)** | **KAPANDI** | `isAcceptableSettingKey` tek kaynak; **dört** giriş noktası aynı güçte reddediyor |

**Altı girdi × dört giriş noktası = 24/24 REDDET**, hepsi `THEME_SETTING_KEY_UNSAFE`.

**Yeni desen üzerinde 40 girdilik kendi atlatma denemesi → 0 atlatma.** İki kararı
kayda değer: `CONSTRUCTOR`/`ToString` **kabul** ve bu **doğru** (JS üye adları büyük/küçük
harf duyarlı, `obj['CONSTRUCTOR']` bir prototip üyesi değil) · `__defineGetter__` ailesi
kara listede **yok ve gerek de yok** (baştaki `_` yapısal olarak reddediyor). Desen
`global` bayrağı **taşımıyor** (`lastIndex` durumu yok).

**Güven sınırı bozulmadı:** manifest **15/15 yüzeyde REDDET, 0 gevşek** · ayar değeri hâlâ
**SOY** · iç içe bilinmeyen anahtar hâlâ **`ok:true`** + `unknownKeys:["top","advanced.ghost"]`
(CLAUDE.md §9 geri alma garantisi **duruyor**) · prototip kirliliği **7/7 temiz** ·
`structuredClone` girdi mutasyonu koruması **duruyor**.

**Sağlamlaştırma yeni bir şey açmadı:** kod/yol isabeti **korundu**, genel-geçere **düşmedi**
(`THEME_SETTING_KEY_UNSAFE@[0].key`, iç içe `@[0].children[0].key`, yinelenen
`THEME_SETTING_INVALID@[1].key`) · **dokuz dal** tek tek denendi, üç belgeli başarısızlık
dalının **üçü de** Result döndürüyor.

**Maliyet (500 tanım, 20 çağrı):** ön kontrol **2.3 ms** (0.12 ms/çağrı) — DoS **değil**.
`schemaFromDefinitions` 12.8 ms · `deriveDefaultSettings` 16.6 ms · `validateThemeSettings`
106.3 ms (baskın maliyet `safeParse`, ön kontrol **değil**).

**`dist/` temiz — desenle arandı, kelimeyle değil:** `__tests__` **0** ·
`(from|import|require)\s*\(?\s*['"](node:)?(fs|path|os|child_process|crypto|http|https|net|process|url|util|worker_threads)['"]`
→ **0** · `import(` **0** · `require(` **0** · `process\.[a-z]` **0**. Tek `fetch(`
eşleşmesi saflık pininin yasaklı listesini **alıntılayan bir yorum**.

**Yayınlanan artefakt sızıntısı 0** · `pnpm audit` v0.0.8 tabanı **teyit** (`1 high` multer +
`1 orta` minimatch, ikisi de bu sürüme **atfedilmiyor**) · CLAUDE.md §7 **N/A teyit**
(14/14 madde yapısal olarak uygulanamaz; saflık pini I/O'yu **mekanik olarak** yasaklıyor).

⚠ **Ajanın dürüstlük notu:** mutasyon kanıtını (ön kontrol yoruma alınınca 20 test/4 dosya
kırmızı) **yeniden koşturmadı** — kaynak düzenlemesi gerektiriyor, yetkisi yok. Yerine pin
kapsamını statik doğruladı ve kuralı çalışma zamanında bağımsız ölçtü.
**Orkestratör düzeltme turu 3 sonrası bunu bağımsız doğruladı: mutasyon → 26 kırmızı
(düzeltme öncesi 20), geri alındı, 217/217 yeşil.**

---

## AÇIK TEKNİK BORÇ — `docs` için (10 satır)

| # | Yer | Açıklama | Sorumlu | Vade |
| - | --- | -------- | ------- | ---- |
| SEC-1 | `migrations/run.ts:164-185` | `result.cause.cause` klonlanamaz girdide Node'un `DOMException` mesajını, Zod dalında da **ham ayar değerini** (`select ayarının değeri ("GIZLI_TOKEN_abc123")…`) taşıyor; `JSON.stringify(result)` **ulaşmıyor** ama `logger.error(result.cause.cause)` yazan bir çağıran loga düşürebilir. Düzeltme: README'ye *"`cause` ayıklama içindir, loglanmaz"* notu + `apps/api` tarafında `@arkesoft/errors` redaction'ından geçirme. | docs (not) + backend (tüketici) | v0.0.21 |
| SEC-2 | `migrations/run.ts:219-221` | `migrations=null`/`undefined` → `.map` üzerinde **yakalanmamış `TypeError`**; tipli parametre olduğu için yalnızca tip ihlaliyle veya **JSONB'den Zod'suz okumayla** erişilir — *"çağıran hiçbir zaman yakalanmamış istisna almaz"* iddiasının **tek açık deliği**. Düzeltme: `Array.isArray` koruması veya `z.array(...).safeParse`. | backend | v0.0.10 |
| SEC-3 | `settings/validate-settings.ts:86-112` | `unknownKeys` **üst sınırsız**: 10 000 bilinmeyen anahtarlı ayar nesnesi 10 000 elemanlı **~79 KB**'lık rapor üretiyor (4.5 ms); doğrudan loglayan çağıranda **log amplifikasyonu**. Düzeltme: üst sınır + `truncated: boolean`. | backend | v0.0.21 |
| SEC-4 | `settings/defaults.ts:63` | `deriveDefaultSettings` yalnızca doğrulama yan etkisi için **500 anahtarlı bir Zod şemasını kurup atıyor** (~0.8 ms/çağrı israf). Düzeltme: `assertDefinitionsAreAcceptable`'ı export edip doğrudan çağır (tek kaynak korunur, şema kurulumu atlanır). | perf + backend | v0.0.10 |
| SEC-5 | `manifest/asset-ref.ts` (desen) | İzin listesi **yalnızca ilk segmentin** harf/rakamla başlamasını zorluyor → `x/.env`, `assets/.hidden` **KABUL** (kökteki `.env` RED). Ayrıca `package.json`, `node_modules/x`, `a.jpg.php`, `CON` kabul ediliyor. ⚠ **v0.0.10'da varlık servisi yazılmadan önce kapatılmalı.** Düzeltme: desende **her** segmentin harf/rakamla başlamasını zorla. | backend | **v0.0.10** |
| SEC-6 | `manifest/asset-ref.ts:96-98` | `isTraversalSegment` yalnızca `..`'yı reddediyor; `a/./b` · `a.` · `a..` · `a/.../b` kabul → **aynı mantıksal varlığın birden çok yazımı** (`a/./b ≡ a/b`) ve tüketicinin önbellek anahtarı/dedup'ı ikiye bölünebilir. Normalleştirme v0.0.10'un çözücüsüyle kararlaştırılmalı. | backend | v0.0.10 |
| SEC-7 | `migrations/run.ts:185` | `migrate()` için **zaman aşımı yok**; 1500 ms bloklayan bir migration sonuna kadar koştu (ölçüldü). Bugün CLI/build zamanı; **v0.0.21'de sunucuda koşarsa DoS yüzeyi**. | backend | v0.0.21 |
| SEC-8 | `migrations/run.ts:216` | `remainingSteps` tükendiğinde (döngüsel zincir / bilinmeyen `fromVersion`) **sessizce `{ok:true, warnings:[]}`** dönüyor; zincirin hedefe **yakınsamadığı** çağırana bildirilmiyor (ölçüldü: `fromVersion='9.9.9'` → `ok:true`). Düzeltme: `warnings`'e kayıt ekle. | backend | v0.0.10 |
| SEC-9 | `settings/validate-settings.ts:96` + `README.md` | `unknownKeys` **`"__proto__"` dizesini içerebiliyor** (ölçüldü). SDK doğru davranıyor (rapor) ama bu listeyi **atama anahtarı** olarak kullanan tüketici için tuzak; README'de uyarı **yok** (58 satır, `__proto__`/`unknownKeys` geçmiyor). | docs | v0.0.10 |
| SEC-10 | `settings/primitives.ts:109` + `settings/schema-from-definitions.ts:44` | İki `select` mesajı `THEME_CONTRACT_MESSAGES` kataloğu **dışında** sabit yazılmış (CLAUDE.md §4) ve **ham girdiyi enterpole ediyor**. ⚠ **Kısmen kapandı:** ham değer nihai `ThemeContractIssue.message`'a **ulaşmıyor** (`zod-issue-mapping` katalog mesajıyla değiştiriyor, ölçüldü) — yalnızca `result.cause.cause` (ZodError) üzerinde kalıyor. | backend | v0.0.10 |

**Tur 1/2'de açılıp kapanan `low`'lar:** `catch {}`'in `cause` taşımaması (tur 2'de kapandı,
ama S3'ü doğurdu) · `dist/`'te test dosyaları ve `node:fs` ithali (`devops` `exclude`'u
`src/**/__tests__` yaptı, tur 3'te **0** ölçüldü).
