# ADR-0013 — theme-sdk: sözleşme sınırları, saflık pini ve hata tasarımı

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-02
- **Karar verenler:** architect, backend, solid, security, qa, PO (T-010)
- **İlgili versiyon:** `v0.0.9` (bkz. `ROADMAP.md`)

---

## Bağlam

`packages/theme-sdk` v0.0.1'de boş bir iskeletti. v0.0.9 onu "bir temanın
platformla konuşma sözleşmesi" olarak neredeyse sıfırdan kurdu: `theme.json`
biçimi, sekiz ayar ilkeli, şablon/slot tanımı, `defineTheme()`, ayar migration
zinciri, `validateThemeManifest()`/`validateThemeSettings()` ve
`docs/theme-contract.schema.json` üretimi.

Üç gücün çatıştığı bir tasarım alanıydı:

1. **Yazar güveni vs. geri alma garantisi.** Bir tema yazarının `theme.json`'ı
   yanlış yazması (`"tempaltes"` yazım hatası gibi) ile bir tema sürümünün
   kullanıcının **kendi** geçmiş ayar verisini okuması (CLAUDE.md §9'un 7
   günlük geri alma + N-2 penceresi) aynı mekanizmayla (bilinmeyen anahtar
   davranışı) çözülemezdi — iki yüzey, iki farklı güven modeli ister.
2. **Saflık vs. sözleşme üretimi.** Paket hiçbir I/O yapmayacak (v0.0.10'un
   önbellek/servis yolu kararlarını açık tutmak için) ama JSON Schema
   artefaktını diske **yazmak** da zorunda (AC12).
3. **Kapalı bağımlılık listesi vs. platform idiomları.** `{ zod }` dışında
   bağımlılık yok kararı, `@arkesoft/errors`'ın `AppError` idiomunu ve
   paylaşılan `assertNever`'ı bu pakette **kullanılamaz** kılıyor.

Bu üç gerilim altıncı karara kadar architect tarafından tasarlandı; üç
düzeltme turu (`security`/`solid`/`qa`) yedi ek kararı (7–13) zorunlu kıldı —
özellikle yol geçişi (`ThemeAssetRef.path`) ve prototip kirliliği
(`settings` anahtarları) saflık pini nedeniyle **ikinci bir savunma
katmanı olmadan** kapatılamayan iki gerçek enjeksiyon sınıfıydı.

## Karar

### 1 — Asimetrik güven sınırı

`theme.json` **manifesti** bilinmeyen kök anahtarı **REDDEDER**
(`z.strictObject`, kod `THEME_MANIFEST_UNKNOWN_KEY`). **Ayar değerleri**
bilinmeyen anahtarı **SOYAR ama RAPORLAR** (`{ ok: true, value, unknownKeys }`).
Gerekçe: manifest'in yazarı masadadır — `"tempaltes"` gibi bir yazım hatası
sessizce soyulursa tema **yanlış sözleşmeyle** yayınlanır. Ayar değerleri ise
CLAUDE.md §9'un 7 günlük geri alma + N-2 penceresi yüzünden tema v2'nin
yazdığı yeni bir ayarın v1 tarafından **okunabilmesini** gerektirir; reddetmek
kullanıcının kendi verisi üzerinde rollback'i kırar. SDK hiçbir şeyi
kalıcılaştırmaz veya silmez — kalıcılık kararı çağıranın (`apps/api`) işidir.

### 2 — Saflık pini, v0.0.10'un üç önbellek yolunu açık tutan mekanizmadır

Paket hiçbir Node built-in'ini ve `fetch`'i **import etmez** — "HTTP'yi
bilmeyen bir paket, servis/önbellek mimarisinin üç adayından (SSR'dan servis,
kiracı ayırıcılı varlık yolu, vekil/CDN katmanı) hiçbirini erkenden
dışlayamaz". Pin **özyinelemelidir** ve **özyinelemenin kendisi ölçülür**
(bir alt dizin dosyası bulunmuş olmalı — `recursive: true` düşerse pin
sessizce hiçbir şey taramaz, bu yüzden öz-ölçüm zorunlu). Manifest **hiçbir
alanda** servis edilen URL yolu, önbellek başlığı, `publicPath` veya
`assetsPrefix` adlandırmaz. Paketin tek I/O noktası `scripts/`'tedir;
`dist/`'e girmez.

### 3 — Kapalı bağımlılık listesi: `{ zod }`; `@arkesoft/errors` reddedildi

`dependencies` tam olarak `{ "zod": "catalog:" }`. `@arkesoft/errors`
bilerek dahil edilmedi: `AppError` `httpStatus` ve `userMessageKey` taşır —
ikisi de bu paketin bilmemesi gereken bir katmanın (HTTP/sunum) kavramı ve
Karar 2'nin "HTTP'yi bilmeyen paket" argümanını çürütür. `code` → `AppError`
eşlemesi **uygulamanın** (`apps/api`, v0.0.21) işidir.

### 4 — Hata mesajları Türkçe geliştirici metnidir, i18n anahtarı değil

Kararlı makine sözleşmesi `code`'dur (`ThemeContractErrorCode`); `message`
değişmek **patch**, `code` değişmek **major**'dır. Tüketici tema
geliştiricisi olduğu için mesaj CI logunda/terminalde okunan Türkçe metindir
— son kullanıcıya çeviri `code` → i18n anahtarı eşlemesiyle **uygulama**
katmanında (v0.0.21) yapılır; bu CLAUDE.md §4'ün katman ayrımıyla uyumludur.
Zod'un `tr` locale'i **kullanılmaz** (global `z.config()` yan etkisi saflığa
aykırı). `satisfies Record<ThemeContractErrorCode, string>` tablonun eksiksiz
olduğunu derleme zamanında zorlar.

### 5 — Semver karşılaştırması bu paketin işi değildir

`sdkRange`/`version` alanları yalnızca **biçim** doğrulanır; bir sürümün bir
aralığa uyup uymadığının hesaplanması `packages/versioning`'in işidir (henüz
doldurulmadı, kapsam dışı). Migration zinciri doğrulaması **saf graf işi**dir
(boşluk/tekrar/döngü/eksik hedef major) — precedence hesabı değildir.

### 6 — İki yapısal daraltma

`templates` **DİZİ**dir (anahtarlı nesne değil): `'404'` JS'te integer-benzeri
bir anahtar olarak değerlendirilirdi ve nesne anahtarı olarak **listenin
başına taşınırdı** — bu `z.toJSONSchema()`'nın determinizmini bozardı; dizi
biçiminde tel değeri `'404'` korunur. Bedeli: tekrarlı `type` mümkün olur,
bu yüzden `THEME_TEMPLATE_DUPLICATE` eklendi (dizi biçiminin zorunlu sonucu).
`group` ilkesi **derinlik-1**'dir: özyinelemeli bir şema `z.toJSONSchema()`'yı
`$defs` + `__schemaN` otomatik adlarına zorlar, bu da AC12'nin bayt-birebir
karşılaştırmasına kırılganlık sokar. İç içe `group` ileride **minor**'dır.

### 7 — `..` segment olarak yasak, alt dize olarak değil

`ThemeAssetRef.path` doğrulaması **kara listeden izin listesine** çevrildi
(`^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9._-]+)*$` + 512 uzunluk) — 36
ölçülmüş girdinin 22 atlatmasından 21'i yapısal olarak kapandı. `a..b/c.jpg`
**bilinçli olarak kabul edilir**: `..` iki nokta içeren ama **tam `..` segmenti
olmayan** bir dizin adıdır, alt dize yasağı meşru adları (`v1.2.3` gibi)
reddederdi. **Zamanlama gerekçesi:** `path` biçimini v0.0.10'dan **sonra**
sıkmak yayınlanmış temaları reddeder → `major` olurdu; bu yüzden sıkılaştırma
v0.0.9'da, ilk yayından önce yapıldı.

### 8 — Ayar anahtarı kabul edilebilirliği tek kaynak

`isAcceptableSettingKey` = dokuz adlı `Object.prototype` kara listesi
(`constructor`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`,
`toLocaleString`, `toString`, `valueOf`, `__proto__`, ve `__defineGetter__`
ailesinin kapsandığı biçim deseni) **+** biçim deseni
(`^[A-Za-z][A-Za-z0-9_-]*$`) **+** 128 uzunluk sınırı. Gerekçe: `'toString'`
biçimsel olarak `'primaryColor'`'dan **ayırt edilemez** — bir izin listesi
tek başına bu sınıfı kapatamaz, kara liste zorunludur. `CONSTRUCTOR`/
`ToString` (büyük harfli varyantlar) **kabul edilir** ve bu **doğrudur** —
JS üye adları büyük/küçük harf duyarlıdır, bunlar prototip üyesi değildir.

### 9 — Ön kontrol tek noktada

`assertDefinitionsAreAcceptable()` (yinelenen `key` kontrolü + Karar 8'in
anahtar kabul edilebilirliği) `schemaFromDefinitions()`'ın **içinde** yaşar;
`validateThemeSettings`/`deriveDefaultSettings`/`migrateThemeSettings` kendi
kopyalarını **taşımaz**, hepsi bu tek noktaya devreder. Gerekçe: önceki
tasarımda üç kopya **farklı güçlerde** sapmıştı (bir kopya yarım güçte, biri
tamamen yoktu) — bu, aynı sebeple değişecek bir kuralın birden fazla
kopyasıydı. Mutasyon kanıtı: ön kontrol devre dışı bırakıldığında **26 test
kırmızıya düşer** (düzeltme öncesi ölçüm: 20).

### 10 — `cause` non-enumerable taşınır

Migration/doğrulama başarısızlıklarının taşıdığı orijinal hata (`cause`)
`Object.defineProperty(result, 'cause', { enumerable: false })` ile eklenir.
Bu, iki gate'in çelişen talebini birlikte karşılar: `solid` ayıklanabilirlik
istedi (hata önceden tamamen atılıyordu), `security` sır hijyeni istedi
(serileştirilen sonuç sır taşımamalı) — `enumerable: false` sayesinde
`JSON.stringify(result)` alana **ulaşmaz** ama `result.cause` ile doğrudan
erişim mümkündür. `ThemeContractIssue`/`ThemeContractResult` tel sözleşmesi
bu kararla **genişletilmedi** (tip yüzeyinde görünmez — bilinçli, bkz.
Teknik Borç).

### 11 — Yayınlanan JSON Schema zayıf bir izdüşümdür ve bu belgelidir

`z.toJSONSchema()` Zod'un `.check()` ile kurulan çalışma zamanı kurallarını
(örn. `..` segment reddi, prototip kara listesi, yinelenen `key`) **taşımaz**.
`id`/`sdkRange`/`ThemeAssetRef.path`/ayar `key` alanları için `override` ile
`pattern`+`maxLength` geri kazandırıldı; geri kazandırılamayan kurallar
üretilen şemanın `description` alanına **"zayıf izdüşüm"** notu olarak
yazıldı (17 not). `migrations` alanı emit'ten **çıkarıldı** — `z.custom()`
fonksiyon değeri JSON Schema'da `{}`'ye düşer, yarım bir temsil yanıltıcı
olurdu. **Yan bulgu:** varsayılan `io: "output"` modunda düz bir `z.object`
de `additionalProperties: false` üretir — üretilen şema "REDDET" (manifest)
ile "SOY" (ayarlar) davranışını **ayırt edemez**; bu yüzden **yalnızca
manifest şeması** emit edilir (`io: 'input'` ayırt edebilir — gelecekteki
kaçış kapısı olarak not edildi).

### 12 — `scripts/`'te hesaplanmış dinamik `import()`

`scripts/generate-contract-schema.ts` modül belirtecini bir değişkene atayıp
`import(değişken)` ile çağırır — bu, TypeScript'in statik modül çözümlemesini
(TS2307/TS5097) kasıtlı olarak devre dışı bırakır; Node çalışma zamanında
native tip-sıyırmayla koşar. Kabul edildi, şu şartla: statik çözümlemenin
kaybı yerine **gerçek bir çalışma zamanı kontrolü** konmuştur (`as`
kullanmayan iki tip koruyucu), hata yolu `{ cause }` ile sarmalanmıştır ve
yüzey `isDirectlyExecuted()` korumasının ardındadır. **Gözden geçirme
koşulu:** `scripts/` kendi `tsconfig`'ini kazandığında bu teknik kaldırılır.

### 13 — Paket iki hata deyimi taşır ve bu tutarlı bir tasarımdır

**Kural:** çok bulgu döndürmesi veya "uyarıyla başarı" dönmesi gereken
yüzeyler (`validateThemeManifest`, `validateThemeSettings`,
`validateMigrationChain`, `migrateThemeSettings`) **ayrımlı birleşim**
döner; tek doğru/yanlış kararı olan ve tüketicisi bir tema yazarının
`theme.config.ts` dosyası olan yüzeyler (`assertThemeManifest`,
`defineTheme`, `deriveDefaultSettings`, `schemaFromDefinitions`) **fırlatır**
— CLAUDE.md §4'ün "beklenen durum için hata fırlat" ilkesi orada doğrudan
geçerlidir. Çizgi **tüketici sınıfına** göre çizilir, rastgele değildir; dört
dosyada ayrı ayrı yazılı ve `solid` tur 3'te mimari olarak doğrulanmıştır.

### Değerlendirilen alternatifler

| Alternatif                                                             | Neden seçilmedi                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| İki yüzeyde de REDDET (manifest + ayarlar)                              | Ayarlarda reddetmek CLAUDE.md §9'un 7 günlük geri alma + N-2 penceresini kırar — v1, v2'nin yazdığı ayarı okuyamaz hale gelir.                   |
| İki yüzeyde de SOY (manifest + ayarlar)                                 | Manifestte soymak `"tempaltes"` gibi bir yazım hatasını sessizce yutar; tema yanlış sözleşmeyle yayınlanır, yazar hiç uyarılmaz.                 |
| Ayarlarda SOY ve **sessizce at** (`unknownKeys` raporlanmaz)            | Çağıran veri kaybını hiç bilemez; rollback sırasında hangi anahtarın düştüğü izlenemez.                                                         |
| `@arkesoft/errors`'a bağımlanmak                                       | `AppError` `httpStatus`/`userMessageKey` taşır — HTTP ve sunum katmanının kavramları, Karar 2'nin "HTTP'yi bilmeyen paket" argümanını çürütür.   |
| Paket-yerel `assertNever`'ı paylaşılan pakete terfi ettirmek            | Tek bir fonksiyon için paketler-arası kenar açmak kapalı `{ zod }` bağımlılık kararını çürütür; borç 1583 zaten terfiyi önermiyor.               |
| `sdkRange` karşılaştırmasını bu pakette tutmak                         | Paket I/O yapmadığı için `package.json`'ı okuyamaz; aralık hesaplama `packages/versioning`'in ayrı bir sorumluluğu.                              |
| `packages/versioning`'i bu sürümde doldurmak                           | v0.0.9'un ilan edilen kapsamı dışında; ayrı bir Task'ın işi.                                                                                    |
| JSON Schema üretimi için yeni bir bağımlılık eklemek                   | Ölçüldü: `zod@4.6.7`'nin yerleşik `z.toJSONSchema()`'sı kabul kriterini karşılıyor; yeni ana bağımlılık gerekçesiz eklenemez (CLAUDE.md §2).      |
| `templates`'ı anahtarlı nesne yapmak                                   | `'404'` JS'te integer-benzeri anahtar sırasına tabi olup listenin başına taşınır → `z.toJSONSchema()` determinizmi bozulur.                      |
| `group` ilkesini özyinelemeli yapmak                                   | Özyinelemeli şema `z.toJSONSchema()`'yı `$defs` + `__schemaN` otomatik adlarına zorlar; AC12'nin bayt-birebir karşılaştırmasına kırılganlık sokar. |

## Sonuçlar

### Olumlu

- İki güven sınırı (manifest/ayarlar) CLAUDE.md §9'un geri alma garantisini
  **ve** yazar hatasına karşı korumayı aynı anda sağlıyor; 15/15 yüzeyde
  manifest reddi, 0 gevşek (security tur 3 ölçtü).
- Saflık pini (`src/` hiçbir Node built-in/`fetch` import etmiyor, pin
  özyinelemeli ve öz-ölçülü) v0.0.10'un üç önbellek/servis mimarisi adayının
  hiçbirini bu sürümde kapatmıyor.
- Ayar anahtarı kabul edilebilirliği ve ön kontrol artık **tek kaynak**;
  mutasyon kanıtlı (devre dışı bırakılırsa 26 test kırmızı).
- `cause`'un non-enumerable taşınması, ayıklanabilirlik ile sır hijyenini
  aynı mekanizmada uzlaştırdı; tel sözleşmesi genişlemedi.
- JSON Schema'nın zayıf izdüşüm olduğu **belgeli** (17 not) — üçüncü taraf
  bir araç üretilen şemaya güvenirse hangi kuralların eksik olduğunu bilir.

### Olumsuz ve kabul edilen maliyetler

- Ayar değerlerinde iç içe (`group`) bilinmeyen anahtar hâlâ raporlanmıyor
  (soyuluyor ama `unknownKeys`'e girmiyor) — açık `low` borç, vade v0.0.10.
- `ThemeAssetRef.path` izin listesi yalnızca **ilk segmentin** harf/rakamla
  başlamasını zorluyor; `x/.env`, `assets/.hidden` kabul ediliyor (SEC-5,
  **v0.0.10'da varlık servisi yazılmadan önce kapatılmalı** — bkz. ROADMAP
  v0.0.10 bağlayıcı not).
- `migrate()` için zaman aşımı yok (SEC-7, bugün CLI/build zamanı, v0.0.21'de
  sunucuda koşarsa DoS yüzeyi).
- Yayınlanan JSON Schema `key` alanı için aynı zayıf izdüşüm boşluğunu taşıyor
  (yalnızca `pattern`+`maxLength`, prototip kara listesi ifade edilemiyor).
- `scripts/`'teki hesaplanmış dinamik `import()` statik modül çözümlemesini
  feda ediyor (Karar 12) — `scripts/` kendi `tsconfig`'ini kazanana kadar.

### Etkilenen sonraki kararlar

- **v0.0.10** (ilk tema paketi + storefront render): manifestin servis
  yolu/önbellek alanı taşımaması gerektiğini doğrudan etkiler (Karar 2);
  `ThemeAssetRef.path`'in mantıksal kimlik olması servis çözücüsünün kendi
  izin listesini kurmasını **zorunlu kılar** (SEC-5 önce kapanmalı).
- **v0.0.21** (`code` → `AppError`/i18n eşlemesi): Karar 3 ve 4'ün ertelediği
  katman burada doldurulacak.
- **`packages/versioning`** doğduğunda Karar 5'in "semver karşılaştırması bu
  paketin işi değil" sınırı yeniden değerlendirilebilir.

## Gözden geçirme koşulları

- v0.0.10 üç önbellek/servis yolundan **(b)** (kiracı ayırıcılı varlık yolu)
  veya **(c)** (vekil/CDN katmanı) seçilir ve manifestin servis yolu/önek
  alanı taşıması gerekirse → Karar 2 yeniden değerlendirilir.
- Üçüncü taraf tema kabulü (v1.0) manifest parse'ının sertleştirilmesini
  gerektirirse → Karar 1'in asimetrisi yeniden değerlendirilir.
- `z.toJSONSchema()`'nın determinizmi bir zod yükseltmesinde bozulursa →
  kanonik sıralama Karar 6/11'in tasarımına girmek zorunda kalır.
- `unknownKeys`'in raporlanması pratikte yetersiz kalırsa (örn. iç içe
  `group` boşluğu production'da sorun yaratırsa) → Karar 1 ve 9 birlikte
  yeniden değerlendirilir.
- `@arkesoft/errors` HTTP taşımayan bir alt yüzey (yalnızca `code`+`context`)
  sunarsa → Karar 3 yeniden değerlendirilir.
- `scripts/` kendi `tsconfig`'ini kazanırsa → Karar 12'deki hesaplanmış
  dinamik `import()` kaldırılır (zorunlu, borç değil).

---

**Not:** Bu ADR üç düzeltme turunun (`security`/`solid`/`qa`) kararlarını da
kapsar (Karar 7–13) — gate raporları: `.claude/workflow/reviews/T-010-security.md`,
`.claude/workflow/reviews/T-010-solid-tur{1,2,3}.md`, `.claude/workflow/reviews/T-010-qa-tur{1,2,3}.md`.
