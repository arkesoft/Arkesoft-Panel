# T-010 · solid · GATE TUR 1

Tarih: 2026-11-02 · Sürüm: v0.0.9 (`@arkesoft/theme-sdk` 0.0.1 → 0.1.0, minor)
Kapsam: `packages/theme-sdk/**` (19 üretim + 15 test `.ts`, 2 `scripts/*.ts`, paket
yapılandırması, `README.md`) + `docs/theme-contract.schema.json`

```
GATE: solid
SONUÇ: FAIL
```

⚠ **`Bash` aracı bu ajana verilmedi → hiçbir komut çalıştırılmadı.** `lint`/`typecheck`/
`test`/`format:check` sayıları Orkestratörün BAĞLAM ÖZETİ'nden alınmıştır; bu raporun
kendi bulguları **statik okuma + `rg`** ile üretildi. Grep kapsamı her bulguda ayrıca
belirtildi (kod satırı mı yorum mu).

---

## BULGULAR

### medium

- **[SEV: medium]** `packages/theme-sdk/src/settings/validate-settings.ts:70-80` (+112) —
  **AC5'in "SOY ama RAPORLA" değişmezi İÇ İÇE (group) ayarlarda tutmuyor.**
  `unknownKeysOf()` yalnızca **kök** `Object.keys(input)` ile çalışıyor; bir `group`
  tanımının değer nesnesi içindeki bilinmeyen anahtar `schemaFromDefinitions`'ın
  `z.object` (strip) davranışıyla **soyuluyor** ama `unknownKeys`'e **girmiyor** →
  `{ advanced: { borderRadius: 4, ghost: 'x' } }` için sonuç `ok: true`,
  `unknownKeys: []`, `ghost` **sessizce kayboldu**. Gerekçenin kendisi (tema v2'nin
  yazdığı yeni anahtarın v1 tarafından rollback sırasında okunup raporlanması,
  dosya başı yorumu satır 4-14) iç içe anahtar için **birebir aynı** geçerli; dosya
  "SDK hiçbir şeyi kalıcılaştırmaz/silmez, `unknownKeys` salt rapordur" diyor ama
  iç içe katmanda rapor yok. Hiçbir test `group` içeren bir `validateThemeSettings`
  vakası taşımıyor (`settings/__tests__/validate-settings.test.ts` dört vakasının
  hiçbirinde `group` yok; `primitives.test.ts:285-298` yalnızca **kök** strip'i
  ölçüyor). — **Düzeltme:** `unknownKeysOf`'u tanım ağacı boyunca özyineli hale getir
  (derinlik-1 garantisi zaten var) ve yolu `advanced.ghost` biçiminde raporla
  (`formatThemeContractPath` hazır); iç içe pozitif/negatif test ekle. — **backend**

- **[SEV: medium]** `packages/theme-sdk/src/migrations/chain.ts:65-66` ↔
  `packages/theme-sdk/src/manifest/manifest.ts:61-65` — **"geçerli tema sürüm biçimi"
  için İKİ kaynak var ve ikisi ÖLÇÜLEBİLİR ŞEKİLDE SAPMIŞ.** `chain.ts`
  `SEMVER_FORMAT_PATTERN` (resmi semver.org deseni, prerelease sayısal tanımlayıcıda
  **baştaki sıfır yasak**: `0|[1-9]\d*|\d*[a-zA-Z-]…`), `manifest.ts`
  `SEMVER_CORE_SOURCE` (prerelease `[0-9A-Za-z-]+`, **baştaki sıfır serbest**).
  Ölçüm: `version: "1.0.0-01"` → `THEME_VERSION_FORMAT_PATTERN` **kabul eder**,
  `extractMajor()` **`undefined` döner** ve `chain.ts:243-248` `version` yolunda ikinci
  bir `THEME_MANIFEST_INVALID` üretir. Aynı alanı iki farklı kural doğruluyor. Yorumun
  kabul ettiği gerekçe (`manifest.ts:22-26`: "S4/S5 paralelliğinin ön koşulu")
  **artık geçerli değil** — iki alt görev de bitti, geriye kalıcı iki doğruluk kaynağı
  kaldı. Bu, benzer görünen iki kod değil; **aynı sebeple** (tema sürüm biçimi kuralı)
  değişecek tek bir kuralın iki kopyası. — **Düzeltme:** semver çekirdek desenini tek
  bir modülde (ör. `src/semver-format.ts`) tanımla, `chain.ts` ve `manifest.ts` oradan
  tüketsin; `1.0.0-01` için tek bulgu üreten bir test ekle. — **backend**

- **[SEV: medium]** `packages/theme-sdk/src/migrations/run.ts:124-139` —
  **`migrate()`'in fırlattığı hata tamamen atılıyor; "sarmalama" iddiası gerçekleşmiyor.**
  `catch {` (binding **yok**) orijinal `Error`'ı hiçbir yere taşımıyor: üretilen
  `ThemeContractIssue` yalnızca `{ code, path, message }` taşır, `cause` yok, orijinal
  mesaj/stack yok ve paket logger'a erişmiyor (saflık). Tema yazarının `migrate()`
  gövdesindeki bir `TypeError` üretimde **tamamen sinyalsiz** kalır. CLAUDE.md §4
  "beklenmeyen hata yakalanıp yutulmaz; **sarmalanıp** yukarı iletilir" diyor; dosya başı
  yorumu (satır 50-57) ve test adı (`migration-run.test.ts:125-126`
  *"hata yutulmaz, THEME_MIGRATION_RESULT_INVALID ile **sarmalanır**"*) bunu iddia
  ediyor ama test yalnızca `code` + `path` üzerinde assertion yapıyor — **orijinal
  hatanın taşındığına dair hiçbir assertion yok, çünkü taşınmıyor.** (Emsal: aynı
  pakette `scripts/generate-contract-schema.ts:104-108` `{ cause: error }` **kullanıyor** —
  desen pakette mevcut, burada uygulanmamış.) `catch {}` boş blok **değil** (bir
  başarısızlık sonucu dönüyor) — bu yüzden `high` değil. — **Düzeltme:** `catch (error)`
  ile yakala; `ThemeContractError`'a `cause` ekle veya `ThemeContractIssue`'ya opsiyonel,
  PII taşımayan bir tanı alanı ekle (**tel sözleşmesi genişlemesi = minor**, architect
  kararı gerekir); testi "orijinal hata erişilebilir" assertion'ıyla güçlendir. —
  **backend** (sözleşme genişlemesi kararı: **architect**)

- **[SEV: medium]** `docs/theme-contract.schema.json:5,11` (+ `asset-ref` `path` alanı) ↔
  `packages/theme-sdk/src/json-schema.ts:146-165` — **yayınlanan JSON Schema, `.check()`
  ile kurulan HİÇBİR kuralı taşımıyor; tek bir alan için istisna yapılmış, diğerleri
  sessizce düşmüş.** Üretilen dosyada `"id": { "type": "string" }` ve
  `"sdkRange": { "type": "string" }` — `THEME_ID_PATTERN` ve
  `THEME_SDK_RANGE_FORMAT_PATTERN` **yok**; `ThemeAssetRef.path`'in dört reddi (mutlak
  URL, baştaki `/`, `..`, `\`) de **yok**. Buna karşılık `version` (`.regex()` ile
  kurulduğu için) `pattern`'ını **taşıyor** ve `templates[].type` `override` ile
  **bilinçle geri kazandırılmış** (json-schema.ts:150-160) — yani mekanizma biliniyor,
  iki/üç alana uygulanmamış. Sonuç: `docs/theme-contract.schema.json`'a göre doğrulayan
  bir üçüncü taraf aracı `id: "Corporate Base"` veya `path: "../../etc/passwd"` taşıyan
  bir `theme.json`'ı **geçerli** sayar (platform tarafı Zod ile yine reddeder — bu yüzden
  `high` değil, davranışsal açık yok). Ne `json-schema.ts` ne üretilen dosya "bu şema
  sözleşmenin **zayıf bir izdüşümüdür**" notunu taşıyor; hangi kuralların düştüğünü
  pinleyen test de yok (`contract-schema.test.ts` yalnızca `migrations` yokluğunu ve
  `type` enum'unu ölçüyor). — **Düzeltme:** ya `id`/`sdkRange`/`path` için `override`
  ile `pattern` geri kazandır, ya da (a) `json-schema.ts` dosya başına + üretilen
  dosyaya `$comment` ile "danışma amaçlı, `.check()` kuralları temsil edilmiyor" notu
  koy **ve** (b) düşen kuralların listesini pinleyen bir test ekle. — **backend**

### low (düzeltme turu AÇMAZ — borç satırı metinleri)

| # | SEV | dosya:satır | Açıklama | Sorumlu | Vade |
| - | --- | ----------- | -------- | ------- | ---- |
| 1 | low | `packages/theme-sdk/src/errors.ts:78-82` (+19-32, 73-76) | `ThemeContractSuccess.warnings` **hiçbir zaman dolmuyor** — iki üreticisi de sabit `[]` döndürüyor (`migrations/chain.ts:269`, `migrations/run.ts:159`). Dosya başı yorumu bu alanı AC5'in "SOY ama RAPORLA" taşıyıcısı ilan ediyor, ama AC5 **farklı bir tipte** (`ThemeSettingsValidationSuccess.unknownKeys`) uygulandı → yorum **yanlış**, alan **kalıcı boş** ve barrel'da (`index.ts:80`) olduğu için sonradan kaldırmak **major**. Ya `unknownKeys`'i bu alana bağla ya alanı v0.1 yüzeyi kapanmadan kaldır. | backend | v0.0.10 |
| 2 | low | `packages/theme-sdk/src/messages.ts:62` ↔ `src/migrations/chain.ts:151-168` | Mesaj *"Aynı **from/to çifti** için birden fazla migration"* diyor, kod yalnızca **`from`** üzerinden tekrar arıyor (`fromToMap.has(edge.from)`). `1.0.0→1.1.0` + `1.0.0→2.0.0` `DUPLICATE` alır ama geliştirici `to`'yu değiştirmenin çözeceğini sanır. Mesaj metni değişimi **patch**. | backend | v0.0.10 |
| 3 | low | `packages/theme-sdk/src/manifest/manifest.ts:116` | Yorum `../zod-issue-mapping.ts` diyor; gerçek yol `../settings/zod-issue-mapping.ts`. Güncelliğini yitirmiş atıf. | backend | v0.0.10 |
| 4 | low | `packages/theme-sdk/src/__tests__/purity.test.ts:16-23` ve `:107-110` | Aynı dosyanın başında iki **bayat** cümle: (a) *"alt dizinler… ⚠ BUGÜN HENÜZ DOĞMADI"* — doğdu (satır 33-50 bunu kendisi söylüyor, dosya kendisiyle çelişiyor); (b) *"`src/index.ts` — S1'in iskelet çıktısı, bu turda DOKUNULMADI"* — `index.ts` S8 tarafından baştan yazıldı. | backend | v0.0.10 |
| 5 | low | `packages/theme-sdk/README.md:43-58` | "Dosyalar" listesi yalnızca S2'nin 5 modülünü sayıyor ve kapanış notu *"Ayar ilkelleri, manifest doğrulaması, migration zinciri ve `defineTheme()` … SONRAKİ alt görevlerde eklenecek; bu README o dosyalar eklendiğinde güncellenir"* diyor — 14 üretim modülü daha eklendi, README güncellenmedi. Kendi verdiği sözü tutmayan belge. **S10 henüz çalışmadı → yolu üstünde kapatılabilir.** | docs | v0.0.9 |
| 6 | low | `packages/theme-sdk/src/__tests__/define-theme.test.ts:19-29` | Yorum *"tek kaynak, testin KENDİSİ bu kümeyi kopyalamaz"* **yanlış**: sekiz `type` değeri test dosyasına elle kopyalanmış (`primitives.ts` çalışma zamanı dizisi dışa açmıyor; `templates.ts:37` emsali açıyor). Ayırt edici güç ölçümü: bir ilkel **silinirse** fixture parse edilemez → `defineTheme` fırlatır → **kırmızı** (yani "eksik ilkel sessizce atlanamaz" iddiası **doğru**); ama **dokuzuncu** bir ilkel eklenirse test yeşil kalır ve yeni ilkel AC10 kapsamına **hiç girmez**. Düzeltme: `primitives.ts`'ten `THEME_SETTING_PRIMITIVE_TYPES` dışa açıp testte ondan türet. | qa + backend | v0.0.10 |
| 7 | low | `packages/theme-sdk/src/manifest/__tests__/no-service-url-fields.test.ts:52,55-64` | AC13 taramasının iki ölçülmüş kör noktası: (a) `FIELD_DECLARATION_PATTERN` **satır başı** dayanıyor → `z.strictObject({ url: z.string() })` gibi **tek satırlık** bildirimi ve hesaplanmış (computed) anahtarı kaçırır; (b) `FORBIDDEN_FIELD_NAMES` **tam eşleşme** → `assetUrl`, `cdnBase`, `servePath` gibi varyantları yakalamaz. Bugünün çok satırlı stili için **yeterli** (`scannedFields > 0` + `files.length > 0` boş-küme savunmaları **var** ve doğru kurulmuş) ama sınırları kayda geçmeli. | qa | v0.0.10 |
| 8 | low | `packages/theme-sdk/src/settings/zod-issue-mapping.ts:1-19` · `src/manifest/asset-ref.ts` (tüketiciler: `settings/primitives.ts:38`, `settings/schema-from-definitions.ts:20`) | **Dosya seviyesinde döngü YOK (ölçüldü)** ama `manifest/` ↔ `settings/` **karşılıklı** dizin bağımlılığı var: `manifest/manifest.ts:51` → `settings/primitives.ts` → `manifest/asset-ref.ts`, ve `manifest/validate-manifest.ts:43` → `settings/zod-issue-mapping.ts`. Her iki paylaşılan modülün de üç/iki ayrı dizinde tüketicisi var → yerleri `src/` kökü. Taşımayı engelleyen kısıt (S6'nın eşzamanlı `run.ts`'i) **artık yok**. | backend | v0.0.10 |
| 9 | low | `packages/theme-sdk/src/migrations/chain.ts:249` | A3 — `themeMajor > 1` eşiği `0.x` aralığını kontrol **dışında** bırakıyor: `0.1.0 → 0.2.0` (semver 0.x konvansiyonunda **kırıcı**) migration **gerektirmiyor**. Kuralın **lafzına** (CLAUDE.md §9 "tema **majoru**") uygun ve çapraz-sürüm denetimi zaten kapsam dışı; ama (a) dosyanın "dürüstlük notu" (34-42) yalnızca çapraz-sürümü sayıyor, bu eşiği **saymıyor**, (b) `0.x` davranışını pinleyen **hiç test yok** → eşik ileride sessizce değişebilir. v0.0.10 `modern@0.1.0` ile tam bu aralığa giriyor. ADR-0013'e bilinen kısıt olarak gir + `validateMigrationChain([], '0.2.0')` davranışını pinleyen test ekle. | docs (ADR) + backend (test) | v0.0.10 |
| 10 | low | `packages/theme-sdk/scripts/generate-contract-schema.ts:98-101,122-123` | A1 — hesaplanmış belirteçli `import()` tekniği (statik modül çözümlemesini **kasten** etkisizleştiriyor). **Haklı bulundu** (aşağıdaki A1 kararı) ama daha az dolaylı alternatif **var**: `scripts/` için kendi `tsconfig.json`'ı (`allowImportingTsExtensions: true`) veya `scripts/`'in de derlenmesi — ikisi de S7'nin DOKUNMA kapsamı dışındaydı. Borç olarak taşı. | devops | v0.0.10 |
| 11 | low | `packages/theme-sdk/src/migrations/chain.ts:112-270` | Paketin **en büyük fonksiyonu: 159 satır**, numaralanmış beş fazı (biçim · tekrar · döngü · boşluk · hedef major) paylaşılan `issues`/`parsedEdges`/`fromToMap` yerel durumu üzerinde yürütüyor. Tek sorumluluk **ihlali değil** (hepsi "zincir topolojisi", tek sebeple değişir) ama beş faz saf yardımcılara (`parseEdges`/`findDuplicates`/`findCycles`/`findGaps`/`checkTargetMajor`) ayrılabilir; bugünkü hâli okunabilirlik borcu. | backend | v0.0.10 |
| 12 | low | `packages/theme-sdk/src/manifest/templates.ts:160` | `export type ThemeTemplates` — **ölü export**: barrel'da yok, pakette hiçbir tüketicisi yok (`rg` ile tek eşleşme kendi tanım satırı). Borç **1587** sınıfı (`packages/trpc/src/index.ts:13`). Ya barrel'a ekle ya kaldır. | backend | v0.0.10 |

---

## A — ÜÇ TAŞINAN KONUNUN KARARI

### A1 · Dinamik + hesaplanmış `import()` → **KABUL (bulgu değil)**, ama ADR **ZORUNLU**

Gerekçe (dördü birlikte):

1. CLAUDE.md §2'nin yasak listesinde **değil** ve o listenin ortak kusuruna da
   sahip değil: `any`/`@ts-ignore`/gerekçesiz `as` tip güvenliğini **yerine bir şey
   koymadan** kaldırır. Burada kaldırılan **statik modül çözümlemesi** ve yerine
   **gerçek bir çalışma zamanı kontrolü** konulmuş:
   `generate-contract-schema.ts:66-76` ve `:84-94` iki tip koruyucu, `as`
   **kullanmadan**, `typeof === 'function'` ile daraltıyor. Bu, CLAUDE.md §4'ün
   "dış dünyadan gelen veri doğrulanır" ilkesinin **tam uygulaması** — ve derlenmiş
   bir `dist/` modülü bu paket için gerçekten dış dünyadır.
2. Hata yolu **sessiz değil**: (a) ithalatı `try/catch` ile sarıp `{ cause: error }`
   ile **sarmalıyor** ve ne yapılacağını söyleyen Türkçe bir mesaj üretiyor
   (`:102-109`); (b) şekil beklenmedikse fırlatıyor (`:111-115`).
3. Yüzey **asgari**: iki çağrı da `main()` içinde, `isDirectlyExecuted()` (`:146-152`)
   korumasının ardında; `src/` hiç tüketmiyor, `contract-schema.test.ts` bu dosyayı
   **hiç import etmiyor** (serileştiriciyi `scripts/serialize-schema.js`'ten **statik**
   alıyor, `:31`) → V7'nin "aynı serileştirici" kısıtı **kopya 1** ile sağlanmış.
4. Alternatifler **ölçülebilir biçimde kapsam dışıydı**: taban `tsconfig`'e
   `allowImportingTsExtensions` eklemek (`packages/config`, başka ajanın dosyası),
   `scripts/` için ayrı tsconfig (S1'in dosyası, DOKUNMA kısıtı), serileştiriciyi
   generator'a kopyalamak (V7'yi **ihlal** ederdi).

**Şart:** bu bir **yazılı mimari karar** olmadan kalıcılaşamaz — ADR-0013'e **altıncı/
yedinci karar** olarak girmeli: *"`scripts/` tek I/O noktası, `module: NodeNext` +
`verbatimModuleSyntax` altında `.ts`→`.ts` ve `.ts`→`dist/.js` ithalatını hesaplanmış
belirteçle yapar; bedeli statik çözümlemenin kaybı, karşılığı çalışma zamanı tip
koruyucusu; gözden geçirme koşulu: `scripts/` kendi tsconfig'ini kazandığında kaldırılır."*
Daha az dolaylı alternatif → **borç satırı 10**. (S10 henüz çalışmadı → bu bir
**gereklilik**, borç değil.)

### A2 · İki hata deyimi → **TUTARLI TASARIM (bulgu değil)**

Ayrım **tüketici sınıfına** göre çizilmiş ve çizgi **her iki yönde de** tutuyor:

- **Çok bulgu + uyarıyla başarı** gereken yüzeyler ayrımlı birleşim döndürüyor
  (`validateThemeManifest`, `validateThemeSettings`, `validateMigrationChain`,
  `migrateThemeSettings`). CLAUDE.md §4'ün yasakladığı şey `null` döndürüp **çağıranı
  tahmine zorlamak**; burada `ok` discriminant'ı derleyici tarafından zorlanıyor
  (`result.value`'ya daraltmasız erişim **derleme hatası**) → §4'ün *amacı* korunuyor,
  *harfi* bilinçli esnetiliyor. `validateThemeSettings`'in AC5 imzası (başarı + rapor)
  ikili fırlatma modeliyle **temsil edilemez** — bu teknik bir zorunluluk, tercih değil.
- **Tek doğru/yanlış** kararı olan yüzeyler fırlatıyor (`assertThemeManifest`,
  `defineTheme`). `defineTheme`'in tüketicisi bir tema yazarının `theme.config.ts`'i;
  orada `{ ok: false }` döndürmek sessizce `undefined` tema ihraç etmeye kapı açar.
  Ve kritik olarak **`defineTheme` yeni bir hata yolu icat etmiyor** — mevcut ikizi
  (`assertThemeManifest`) çağırıyor (`define-theme.ts:79`), yani iki deyim **iki
  uygulama değil, biri diğerinin ince sarmalayıcısı**.

Sapma **savunulabilir** ve dört ayrı dosyada tutarlı uygulanmış. **Şart:** ADR-0013'te
*"hangi yüzey hangi deyimi kullanır"* kuralı tek cümleyle yazılmalı (bugün gerekçe
`errors.ts` + `define-theme.ts` dosya başı yorumlarına **dağılmış**; beş yıl sonra
okuyan kişi ADR'de arar). Not: bu tutarlılığın **tek gerçek çatlağı** `warnings`
alanının hiç dolmaması — **borç satırı 1**.

### A3 · `0.x` boşluğu → **BULGU, ama `low`** (borç satırı 9)

Kuralın **lafzı** karşılanıyor (CLAUDE.md §9 "tema **majoru**"), çapraz-sürüm denetimi
zaten belgeli biçimde kapsam dışı, ve bugün bu yolu tetikleyen bir tema yok. `low`
yapan üç nokta: (a) kuralın *amacı* (kırıcı sürüm migration'sız yayınlanmaz) 0.x'te
karşılanmıyor, (b) dosyanın kendi "dürüstlük notu" bu eşiği **saymıyor** — kapsam dışı
olduğu **yazılmamış**, (c) `0.x` davranışı **hiç test edilmemiş**, yani bugün bilinçli
olan boşluk yarın kaza olabilir. v0.0.10 `modern@0.1.0` ile tam bu aralığa girdiği için
vade v0.0.10.

---

## B — ALTI KARARIN DEĞERLENDİRMESİ

| # | Karar | Değerlendirme |
| - | ----- | ------------- |
| B1 | `assertNever` **5. kopya** (`src/assert-never.ts`) | **KABUL.** Borç 1583 ile çatışmıyor, onu uyguluyor (terfi **önerilmiyor**, paket-içi modül öneriliyor). Paylaşılan pakete terfi **doğru biçimde reddedilmiş**: tek bir fonksiyon için paketler-arası kenar açmak kapalı `{ zod }` bağımlılık kararını çürütürdü; `apps/api` kopyasını import etmek **yapısal olarak yasak** (CLAUDE.md §3 yön kuralı). İmza/davranış platform idiomuyla aynı, iki gerçek çağrı sitesinde (`settings/defaults.ts:32`, `settings/schema-from-definitions.ts:85`) exhaustive `switch`'i **derleyiciye** bağlıyor. Bulgu değil. |
| B2 | `THEME_MANIFEST_INVALID`'in `from`/`to` biçimi için yeniden kullanımı | **KABUL.** 15 kodluk liste kapalı, 16. kod **minor** gerektirir; `path` (`migrations[0].from`) ayırt ediciliği **tam** sağlıyor ve test bunu birebir pinliyor (`migration-chain.test.ts:141-148`). `manifest.ts`'in `version` fallback'iyle **aynı** kararı veriyor → tutarlı. Bulgu değil. |
| B3 | `THEME_MIGRATION_RESULT_INVALID` iki senaryoda | **KABUL (kod seçimi olarak).** "Geçerli sonuç üretilemedi" tek anlam; iki senaryo `path` ile **ayırt edilebiliyor** (`migrations[0].migrate` vs alan yolu) ve ikisi ayrı test taşıyor (`migration-run.test.ts:101-123`, `125-148`). ⚠ Ayrı mesele: fırlatma dalının **orijinal hatayı atması** → **medium #3**. |
| B4 | `zod-issue-mapping.ts` `src/settings/` altında KALDI | **BORÇ (low #8).** O anki kısıt (S6'nın eşzamanlı `run.ts`'i + DOKUNMA yasağı) **meşru ve doğru tartılmış** — paralelliği korumak estetiğe yeğ tutulmuş. Ama kısıt artık yok ve bugün **üç** tüketicisi **üç** dizinde. Dosya seviyesinde **döngü yok** (ölçüldü) → `high` değil. |
| B5 | `.transform((value) => value as ThemeTemplateType)` | **KABUL.** `.check()` ardından çalışıyor; başarısız check parse'ı düşürür, yani bu `as` yalnızca "değer yedi üyeden biri" **çalışma zamanında doğrulandıktan sonra** gözlemlenebilir → CLAUDE.md §2'nin izin verdiği tek durum. `asset-ref`/`keys`/`select`/`id`/`sdkRange` ile **aynı idiom** (yeni desen değil) ve `z.enum` yerine seçilmesinin gerekçesi ölçülü (doğru `code`'u doğrudan üretmek). **Pakette tek üretim `as`'i.** ⚠ Bu idiomun yan etkisi (`.check()` kuralları JSON Schema'ya **yansımıyor**) → **medium #4**. |
| B6 | Barrel'dan bilinçli dışlamalar | **KABUL.** Hiçbiri borç 1587 sınıfı **ölü export değil**: `buildThemeContractJsonSchema` iki gerçek tüketiciye sahip (`scripts/generate-contract-schema.ts`, `src/__tests__/contract-schema.test.ts`) ve barrel'a eklemek build-time aracını çalışma zamanı semver yüzeyine **erken** sokardı; `SETTING_KEY_SCHEMA` `primitives.ts:49`'da, `isUnsafeSettingKey` testte kullanılıyor; ham Zod şemalarını gizlemek tüketiciyi `zod` sürümüne bağlamamanın doğru yolu. Her dışlama `index.ts:26-61`'de gerekçeli. ⚠ **Gerçek ölü export başka yerde bulundu:** `ThemeTemplates` (`manifest/templates.ts:160`) — **low #12**. |

---

## C — TEST KALİTESİ

**Dört mutasyon kanıtının doğrulanması (kod üzerinden; komut çalıştırılmadı):**

| İddia | Doğrulama | Ayırt edici mi |
| ----- | --------- | -------------- |
| S2 · `messages.ts`'ten kod silinirse `TS1360` | `messages.ts:66` `satisfies Record<ThemeContractErrorCode, string>` **yerinde**; mutasyon **geri alınmış** (15 mesaj tam). Ek olarak `messages.test.ts:17-42` çalışma zamanı ikizi: `EXPECTED_CODES` **`ThemeContractErrorCode[]` tipli** → kod **silinirse derleme**, kod **eklenirse** `toEqual` + `toHaveLength(15)` **kırmızı**. | **Evet, iki yönlü.** |
| S7 · `docs/…schema.json`'a tek boşluk → 1 test kırmızı | `contract-schema.test.ts:38-44` aynı serileştiriciyi (`scripts/serialize-schema.js`, **statik** import) çağırıp `toBe` ile **bayt** karşılaştırıyor → tek karakter farkı kırmızı. V7'nin "aynı serileştirici" kısıtı **kopya 1** ile sağlanmış (`serialize-schema.ts` tek fonksiyon, iki çağıran). | **Evet.** |
| S8 · `recursive: true` kaldırılırsa `expected 0 to be greater than 0` | `purity.test.ts:173-179` + `isWithinProductionSubdirectory` (`:130-135`, `sep` ile bölüyor, `/` sabit yazmıyor) → `recursive` düşerse alt dizin dosyası bulunmaz, assertion kırmızı. Pinin **sessiz işe yaramazlığını** yakalayan doğru mekanizma. | **Evet — bu turun en değerli testi.** |
| S6 · `migrate()` yerinde mutasyon → orijinal `input` değişmemiş | `migration-run.test.ts:151-178`: `migrate` bilinçle `mutable['mutatedByMigrate'] = true` yapıyor, `expect(input).toEqual(inputSnapshot)`. Üretim tarafı `structuredClone` (`run.ts:108`). | **Evet.** |

**AC bazlı ayırt edici güç:**

- **AC3 — YETERLİ.** `validate-manifest.test.ts:82-107` `path` **ve** `code` **ve** tam
  Türkçe mesaj metni üzerinde assertion yapıyor (`'templates[2].slots[0].id'` +
  `THEME_MANIFEST_INVALID` + `'theme.json şemayla eşleşmiyor.'`) — "fırlatıyor"
  assertion'ı **değil**. `validate-settings.test.ts:83-98` aynı üçlüyü ayar tarafında
  tekrarlıyor. `migration-chain.test.ts`'in beş negatif vakası issue listesinin
  **tamamını** `toEqual` ile pinliyor (tek bulgu + doğru path + doğru mesaj) → bir
  senaryonun başka bir koda sızması yakalanır.
- **AC6 — İKİ ASSERTION İKİ YERDE DE VAR.** S3: `validate-settings.test.ts:72`
  (`polluted === undefined`) **ve** `:77` (`not.toBe(rawInput)`). S6 ikizi:
  `migration-run.test.ts:204` **ve** `:209` (`not.toBe(rawMigrateOutput)`). İkisi de
  `JSON.parse` ile **öz anahtar** üretiyor (obje literali değil) — doğru taşıyıcı,
  testin kendisi yanlış senaryoyu sınamıyor.
- **AC10 — KISMEN.** `toEqual(new Set(ALL_EIGHT))` **eksik** ilkeli yakalar (fixture
  parse edilemez → `defineTheme` fırlatır), **dokuzuncu** ilkeli yakalamaz ve küme
  yorumun iddia ettiğinin aksine **elle kopyalanmış** → **low #6**.
- **AC13 üç parça:** S2 (`purity.test.ts`: `files.length > 0` boş-küme savunması +
  `dependencies` `toEqual({ zod: 'catalog:' })`) **sağlam**; S8 (özyineleme
  öz-ölçümü) **sağlam**; S5 (47 alan taraması) **heuristik, kör noktaları ölçüldü** →
  **low #7**. Bugünün çok satırlı stili için yeterli, kalıcı garanti değil.
- **Saflık pini `entry.parentPath` — TEYİT EDİLDİ** (`purity.test.ts:82` ve `:84`).
  `tenancy`'nin bozuk `join(SRC_DIR, entry.name)` satırı **kopyalanmamış**;
  `no-service-url-fields.test.ts:46-48` de aynı doğru biçimi kullanıyor.
- **Test adı ölçtüğünden fazlasını iddia ediyor mu (borç 1584 sınıfı)?** Bir vaka:
  `migration-run.test.ts:125-126` *"hata yutulmaz … **sarmalanır**"* — sarmalama
  **yok**, assertion yalnızca `code`+`path` (**medium #3**). Diğer 98 testin adları
  ölçtükleriyle örtüşüyor. Mock kullanımı **sıfır** (`vi.mock` yok) — bu pakette doğru
  karar, hepsi saf fonksiyon.

---

## D — YAPISAL DEĞİŞMEZLER (ölçüm)

Grep kapsamı: `packages/theme-sdk/**/*.ts` (`node_modules` hariç). Her eşleşme **elle
okunup kod/yorum ayrımı yapıldı** — bu sürümde gerekçeler kasten yorumlara yazıldı ve
bu **meşru**; aşağıdaki sayılar yalnızca **kod satırlarını** sayar.

| Değişmez | Beklenen | Ölçüm | Sonuç |
| --- | --- | --- | --- |
| `any` | 0 | **0** — iki eşleşme kod satırında var ama ikisi de Zod **seçenek değeri** (`unrepresentable: 'any'`, `json-schema.ts:149`) ve yorum metni; **tip olarak `any` yok** | ✅ |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable` | 0 | **0** | ✅ |
| üretim `as` | gerekçesiz 0 | **1** — `manifest/templates.ts:86`, `.check()` **sonrası** → CLAUDE.md §2'ye uygun (B5). Testlerde 6 `as Record<string, unknown>` (assertion daraltması, üretim değil) | ✅ |
| döngüsel bağımlılık | 0 | **dosya seviyesinde 0.** `manifest/` ↔ `settings/` **dizin** seviyesinde karşılıklı (`manifest/manifest.ts:51`→`settings/primitives.ts`→`manifest/asset-ref.ts`; `manifest/validate-manifest.ts:43`→`settings/zod-issue-mapping.ts`) → **low #8** | ⚠ |
| katman ihlali (`@arkesoft/*`, `@prisma`, `@nestjs`, `express`, `fetch(`, `node:*`) | üretimde 0 | **0** — `node:*` yalnızca `src/__tests__/` + `src/manifest/__tests__/` (pin tarayıcıları) ve `scripts/`'te; `@arkesoft/` ithali **hiç yok** (`index.ts:69`'daki `PACKAGE_NAME` dize sabiti, ithal değil) | ✅ |
| `console.*` | 0 | **0** — `scripts/` `process.stdout/stderr.write` kullanıyor (`no-console` gereği, **meşru**); `json-schema.ts:64`'teki `console.log` **yorum içinde** (geçici teşhis anlatısı), kod değil | ✅ |
| `dependencies` | tam olarak `{ zod: 'catalog:' }` | **birebir** (`package.json:26-28`), `purity.test.ts:170` `toEqual` ile pinli | ✅ |
| en büyük fonksiyon | ölç | **`validateMigrationChain` — `migrations/chain.ts:112-270`, 159 satır** (2.: `migrateThemeSettings`, `run.ts:96-160`, 65 satır) → low #11 | ⚠ |
| ölü kod / ölü export | ölç | **1 ölü export:** `ThemeTemplates` (`manifest/templates.ts:160`) → low #12. **1 kalıcı boş public alan:** `ThemeContractSuccess.warnings` → low #1. Erişilemeyen dal / yorumlanmış kod / "sonra kullanacağız" dosyası: **0** | ⚠ |
| üretilen JSON Schema determinizmi | `$defs` yok | **`$defs` 0**, `migrations` hem `properties`'ten hem `required`'tan çıkarılmış (`docs/theme-contract.schema.json:328-329`), `additionalProperties: false` 21 yerde | ✅ |

---

## ÖLÇÜMLER

İncelenen dosya **42** (19 üretim `.ts` + 15 test `.ts` + 2 `scripts/*.ts` + 4 paket
yapılandırması + `README.md` + üretilen şema artefaktı) · **`any` 0** · **`@ts-ignore` 0** ·
üretim `as` **1** (Zod sonrası, meşru) · en büyük fonksiyon **159 satır**
(`migrations/chain.ts:112-270`) · dosya seviyesi döngü **0** · katman ihlali **0** ·
ölü export **1** · bulgu **4 medium + 12 low** · ⚠ komut çalıştırılmadı (`Bash` aracı yok)

**FAIL gerekçesi (AGENT_BASELINE §4, bağlayıcı):** `critical` 0, `high` 0, **`medium` 4 ≥ 3**
→ **FAIL**. Düzeltme turu **dört medium** için açılır; **12 `low` tur açmaz**, borç
tablosuna geçer (low #5 S10'un yolu üstünde kapatılabilir).
