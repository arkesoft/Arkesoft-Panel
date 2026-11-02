# T-010 · solid · GATE TUR 2 (KAPSAM: TAM)

Tarih: 2026-11-02 · Sürüm: v0.0.9 (`@arkesoft/theme-sdk` 0.0.1 → 0.1.0, minor)
Kapsam: düzeltme turu 1/3'te değişen 27 dosya + tur 1 taban çizgisiyle yapısal karşılaştırma

```
GATE: solid
SONUÇ: PASS
```

⚠ **`Bash` aracı bu ajana verilmedi → komut çalıştırılmadı.** `lint`/`typecheck`/`test`/
`build`/`format` sayıları Orkestratörün ölçtüğü değerlerdir. Bu raporun kendi bulguları
statik okuma + `Grep` ile üretildi. Grep kapsamı: `packages/theme-sdk/**/*.ts`; her
eşleşme elle okunup **kod/yorum ayrımı** yapıldı (bu sürümde gerekçeler kasten
yorumlarda ve bu meşru — yorumda jeton bulmak tek başına bulgu değildir).

---

## BULGULAR

### medium

- **[SEV: medium]** `packages/theme-sdk/src/migrations/run.ts:221` (↔ `src/settings/schema-from-definitions.ts:107-110`) —
  **İki partinin dikişi kırık: `migrateThemeSettings` artık yakalanmamış istisna
  fırlatabiliyor.** Parti A, `schemaFromDefinitions()`'a güvensiz `key` için
  `throw new ThemeContractError(...)` ekledi (M2 düzeltmesi); parti B ise aynı turda
  `run.ts`'i "çağıran **HİÇBİR ZAMAN** yakalanmamış bir istisna ALMAZ" iddiasıyla
  sertleştirdi (`run.ts:68-69`, B2). Ama `run.ts:221`'deki
  `schemaFromDefinitions(targetSettingDefinitions)` çağrısı **`try` DIŞINDA** — ve
  `targetSettingDefinitions` tam olarak M2'nin gerekçesindeki sınıftır ("`ThemeSetting
  Definition[]` tipli olmak şemadan geçmiş olmak DEĞİLDİR", `unsafe-key-scan.ts:7-11`).
  Ölçülebilir yol: `migrateThemeSettings([], '1.0.0', [{ key: 'constructor', type:
  'toggle', label: 'x', default: true }], {})` → dönüş tipi `ThemeContractResult` olduğu
  hâlde `ThemeContractError` **fırlar**. Kardeş fonksiyon `validateThemeSettings` aynı
  tuzağa düşmüyor çünkü `findUnsafeSettingKeyIssues`'u **kendisi önce** çağırıyor
  (`validate-settings.ts:147`); `run.ts` çağırmıyor. Dosya başı yorumu bu yüzden artık
  **gerçeği söylemiyor** — tur 1'in M3'ünün kusuru tam olarak buydu. Hiçbir test bu yolu
  tutmuyor. `high` değil: tetiklenmesi için çağıranın manifest doğrulamasını atlayıp
  kara listedeki bir `key` geçirmesi gerekir (kenar durum, AGENT_BASELINE §4).
  — **Düzeltme:** `run.ts:221`'i `try`'a al ve `buildRunFailure(..., error)` ile raporla
  (yardımcı hazır), **veya** `findUnsafeSettingKeyIssues(targetSettingDefinitions)`'ı
  fonksiyonun başında ön kontrol olarak çağır; her iki durumda davranışı pinleyen test
  ekle. — **backend**

- **[SEV: medium]** `packages/theme-sdk/src/settings/unsafe-key-scan.ts:42` ↔ `src/settings/keys.ts:97-110` —
  **Savunmacı ön kontrol, taklit ettiği katmanın YARISINI uyguluyor; bir kural iki yerde
  iki farklı güçte.** `findUnsafeSettingKeyIssues` yalnızca `isUnsafeSettingKey`'i (isim
  kara listesi) çağırıyor; `SETTING_KEY_FORMAT_PATTERN` (`keys.ts:79`) ve
  `MAX_SETTING_KEY_LENGTH` (`keys.ts:82`) **modül-özel** olduğu için tarayıcı onlara
  erişemiyor. Oysa `keys.ts:21-28` M1 çözümünün **İKİ parça** olduğunu açıkça yazıyor.
  Ölçülen sonuç: `keys.test.ts:13-25`'in manifest yolunda reddedildiğini pinlediği yedi
  girdiden altısı (`''`, `' '`, `'../x'`, `'a\nb'`, `'<script>'`, 5000 karakter) üç
  **doğrudan dışa açık** giriş noktasında (`validateThemeSettings`,
  `deriveDefaultSettings`, `schemaFromDefinitions`) **kabul ediliyor** — yalnızca
  `'toString'` yakalanıyor. Bu, benzer görünen iki kod değil; **aynı sebeple** (ayar
  anahtarı kabul kuralı) değişecek tek kuralın iki kopyası — B4'ün semver dersiyle
  birebir aynı sınıf, aynı turda bir yerde kapatılıp başka yerde açılmış.
  — **Düzeltme:** `keys.ts`'ten tek bir `isAcceptableSettingKey(key): boolean` dışa aç,
  hem `SETTING_KEY_SCHEMA` hem `unsafe-key-scan.ts` onu tüketsin; `keys.test.ts`'in
  `it.each` kümesini tarayıcı üzerinden de koştur. — **backend**

### low (düzeltme turu AÇMAZ — borç satırı metinleri)

| #  | SEV | dosya:satır | Açıklama | Sorumlu | Vade |
| -- | --- | ----------- | -------- | ------- | ---- |
| L1 | low | `packages/theme-sdk/src/settings/duplicate-key-issues.ts:6-22` | **Bayat başlık — aynı turda kaldırılan tüketiciyi anlatıyor.** "İKİ tüketicisi var" diyor ve ikincisi olarak `../manifest/validate-manifest.ts`'i sayıyor; satır 16-22 o yoldan gelebilecek çift raporlamanın neden gerileme olmadığını 7 satır boyunca savunuyor. Oysa B1 o çağrıyı **sildi** (`validate-manifest.ts:35-57` kaldırmayı belgeliyor). Bugün tek tüketici `validate-settings.ts:142`. Okuyucu manifest doğrulamasında var olmayan bir "ikinci savunma katmanı" sanır. | backend | v0.0.10 |
| L2 | low | `packages/theme-sdk/src/json-schema.ts:168-173` | **B5'in getirdiği gerçek tekrar.** Yeni genel yardımcı `pathEquals` (`:132-140`) eklendi ama var olan `isTemplateTypeOverridePath` ona **katlanmadı**: gövdesi birebir aynı mantık (`isTemplateTypeOverridePath(p)` ≡ `pathEquals(p, TEMPLATE_TYPE_OVERRIDE_PATH)`). Aynı sebeple değişecek iki kopya. Fonksiyonu sil, `pathEquals` çağır. | backend | v0.0.10 |
| L3 | low | `packages/theme-sdk/src/settings/__tests__/keys.test.ts:36-44` | Kara liste 3 → **9** isme büyüdü (`keys.ts:54-64`) ama `it.each` hâlâ yalnızca `__proto__`/`constructor`/`prototype`'ı pinliyor; describe adı da hâlâ *"üç adlı kara liste"* diyor. Altı yeni isimden yalnızca `toString` (satır 19) dolaylı kapsanıyor. `valueOf`/`hasOwnProperty`/`isPrototypeOf`/`propertyIsEnumerable`/`toLocaleString` kümeden **silinse hiçbir test kırılmaz** — ve bu isimler üç doğrudan giriş noktasında (medium #2) **tek savunma**. `it.each`'i dokuz isme çıkar, describe adını düzelt. | qa | v0.0.10 |
| L4 | low | `packages/theme-sdk/src/migrations/run.ts:111-118,151` | M3'ün kapanışı **tip seviyesinde görünmez**: `buildRunFailure` `cause` taşıyor ama `migrateThemeSettings`'in bildirilen dönüş tipi `ThemeContractResult<ThemeSettingsValue>` bu alanı **içermiyor** → tüketici `cause`'u ancak kendi tip koruyucusuyla keşfedebiliyor (testin `hasCause`'u, `migration-run.test.ts:17-19`). Üstelik üçüncü başarısızlık dalı (`run.ts:224-229`, şema reddi) `cause` **taşımıyor** → alan 3 yoldan 2'sinde var. Gerçek çözüm `ThemeContractIssue`/`ThemeContractFailure` tel sözleşmesinin genişlemesi (**minor**, architect kararı) — `run.ts:78-80` bunun bilinçli olarak ertelendiğini zaten yazıyor. Borç olarak taşınmalı ki ertelenmiş karar kaybolmasın. | architect (karar) + backend | v0.0.10 |
| L5 | low | `packages/theme-sdk/src/index.ts:26-43` | Barrel'ın "BİLİNÇLİ OLARAK DIŞARIDA BIRAKILANLAR" listesi **eksik kaldı**: dört yeni modül (`semver-format.ts`, `settings/duplicate-key-check.ts`, `duplicate-key-issues.ts`, `unsafe-key-scan.ts`) ve beş yeni dışa açılan sabit (`THEME_ID_PATTERN`, `THEME_SDK_RANGE_FORMAT_PATTERN`, `ASSET_PATH_FORMAT_PATTERN`, `MAX_ASSET_PATH_LENGTH`, `THEME_SETTINGS_LIST_SCHEMA`) listede yok. Dışlamanın **kendisi doğru** (hepsinin paket-içi tüketicisi var → ölü kod değil; `package.json` `exports` yalnızca `"."` → semver yüzeyi büyümedi) ama **yazılı değil** — bu listenin tek varlık sebebi "bilinçli sınır" ile "gözden kaçmış" ayrımını yapmaktı. | backend | v0.0.10 |

---

## A — TUR 1'İN DÖRT `medium`'UNUN KAPANIŞI

| # | Kapandı mı | Ayırt edici testle pinli mi | Yorum/test adı gerçeği söylüyor mu |
| - | --- | --- | --- |
| **M1** iç içe `unknownKeys` | **EVET.** `unknownKeysOf` özyineli (`validate-settings.ts:84-110`), yol `formatThemeContractPath` ile `advanced.ghost`. Strip davranışı değişmedi. | **EVET** — `validate-settings.test.ts:216-238` pozitif (`toEqual(['advanced.ghost'])` **ve** `value` içinde `ghost` yok), `:240-257` negatif (gerileme yok). | **EVET** — `:73-82`'deki düzeltme notu eski kusuru ölçümle anlatıyor, iddia kodla örtüşüyor. |
| **M2** semver iki kaynak | **EVET.** Tek kaynak `src/semver-format.ts:45`; `chain.ts:56` ve `manifest.ts:53` oradan besleniyor, yerel kopya **0**. Daha **katı** (resmi semver.org) desen kazandı. | **EVET, iki tüketicide ayrı ayrı:** `semver-format.test.ts:19-45` (desen + `extractMajor`), **ve** `validate-manifest.test.ts:304-319` manifest yolunda `version: '1.0.0-01'` için `toHaveLength(1)` — eski sapmanın belirtisi olan **ikinci bulgunun yokluğu** birebir pinlenmiş. | **EVET** — `semver-format.ts:11-32` sapmayı ve "katı olan kazandı" kararını gerekçesiyle taşıyor. |
| **M3** yutulan `cause` | **EVET (davranış).** `catch (migrationError)` + `buildRunFailure` (`run.ts:111-118,201-210`); `message` hâlâ sabit (sır hijyeni). ⚠ Tip yüzeyinde görünmez → **L4**. | **EVET** — `migration-run.test.ts:162-201` **iki** assertion: `JSON.stringify(issues)` içinde `'GIZLI'` **yok** (sır hijyeni) **ve** `cause.cause` `toBe(secretLeakingError)` (**referans eşitliği** — "erişilebilir" iddiasının ayırt edici kanıtı). Tip koruyucusu `as` kullanmıyor. | **EVET — tur 1'in asıl kusuru buydu, kapandı.** "sarmalanır" diyen test adı artık gerçekten sarmalamayı ölçen bir vaka ile eşleşiyor. |
| **M4** JSON Schema zayıf izdüşüm | **EVET.** `id`/`sdkRange`/`ThemeAssetRef.path` için `override` (`json-schema.ts:255-269`); desenler **tek kaynaktan** import, yeniden tanımlanmıyor. Üretilen dosyada doğrulandı: `docs/theme-contract.schema.json:5,13,136-138,283-285`. | **EVET** — `contract-schema.test.ts:79-151`: `id` pattern **birebir** dize, `path` `pattern`+`maxLength:512`+`description` `toContain('zayıf izdüşüm')`. `sdkRange` yalnızca `typeof === 'string'` ölçüyor (zayıf) ama bayt-birebir bayatlık testi (`:38-44`) gerçek değeri kapsıyor. | **EVET** — `json-schema.ts:71-84` `..`-segment reddinin **neden** ifade edilemediğini (segment bazlı kural) yazıyor; `description` notu üretilen dosyaya **gerçekten** düşmüş. |

**Dördü de kapandı; ikisinde (M3, M4) ifade edilemeyen/ertelenen kalıntı yazılı ve pinli.**

---

## B — DÜZELTMELERİN GETİRDİĞİ SEKİZ YENİ KARAR

1. **`..` segment mi alt dize mi → DOĞRU AYRIM (bulgu değil).** `a..b` iki nokta içeren
   ama `..` **olmayan** meşru bir ad; yol geçişi semantiği yalnızca **tam** `..`
   segmentinden doğar. İzin listesi (`asset-ref.ts:87`) ilk karakteri alfanümerik
   zorladığı için `../x` **zaten** desenden geçmez; `a/../b` desenden geçer ve
   `isTraversalSegment` (`:96-98`, `split('/')` ile) yakalar. İki mekanizma
   **örtüşmeli**, çakışmıyor. Alt dize yasağı meşru adları (`v1.2.3`) reddederdi.
2. **Kara liste 3 → 9 → LİSTE TAM (izin listesiyle **birlikte**).**
   `Object.prototype`'ın tüm öz üyeleri: `constructor`, `hasOwnProperty`,
   `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`, `toString`, `valueOf`,
   `__proto__`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`,
   `__lookupSetter__`. `__x__` biçimli **beşinin tamamı** `SETTING_KEY_FORMAT_PATTERN`
   (`^[A-Za-z]…`, `keys.ts:79`) tarafından **yapısal olarak** reddedilir → kara listenin
   kapatması gereken küme tam olarak kalan yedi isimdir ve dokuzluk küme onu **kapsar**.
   Çakışma yok, `isUnsafeSettingKey || isFormatInvalid` (`:102`) ikisini aynı koda
   düşürüyor — tüketici için tek anlam. ⚠ **AMA** bu "birlikte çalışma" yalnızca
   `SETTING_KEY_SCHEMA` yolunda var; `unsafe-key-scan.ts` izin listesine erişemiyor →
   **medium #2**. Test kapsamı da üç isimde kalmış → **L3**.
3. **İki dönüş biçimi (FIRLAT vs `{ok:false}`) → A2 KURALIYLA TUTARLI (bulgu değil).**
   Tur 1'de kabul ettiğim çizgi "tüketici sınıfı"ydı ve burada da aynı ölçüte göre
   çizilmiş, **dosyalarda açıkça gerekçelenmiş** (`unsafe-key-scan.ts:16-22`,
   `defaults.ts:49-50`, `schema-from-definitions.ts:101-102`): `deriveDefaultSettings`
   bir **değer**, `schemaFromDefinitions` bir **şema** döndürür — ikisi de `{ok:false}`
   ile temsil edilemez (tip imzalarını kırardı, barrel'daki `deriveDefaultSettings`
   için **major** olurdu); `validateThemeSettings` zaten Result taşıyor ve onu
   kullanıyor. Tutarlı. ⚠ Çizginin **tek çatlağı**: fırlatan iki fonksiyondan biri,
   Result döndüren bir fonksiyonun içinden korumasız çağrılıyor → **medium #1**.
4. **B1 "ULAŞILAMAZ" İDDİASI → DOĞRU, ÖLÇÜLDÜ (bulgu değil).** `manifest.ts:151`
   `settings: THEME_SETTINGS_LIST_SCHEMA` kullanıyor ve o şema dizi seviyesinde
   yinelenen-`key` `.check()`'i taşıyor (`primitives.ts:243-256`) → bir yineleme
   `safeParse`'ı **başarısız** kılar → `validate-manifest.ts:90-96` **erken döner**,
   kaldırılan çağrıya yapısal olarak ulaşılamazdı. "Şema geçti ama yineleme var"
   senaryosu imkânsız. **Çift raporlama yok** ve bu **pinli**: `validate-manifest.test.ts
   :284-301` aynı kusur için `toHaveLength(1)` ölçüyor; `:244-269` şemanın **doğrudan**
   çağrıldığında da reddettiğini (savunmanın orkestrasyondan şemaya **güçlenmesi**)
   ölçüyor. Ulaşılamaz kodu silmek doğru karar — "derinlemesine savunma" görüntüsü
   veren ölü dal okuyucuyu yanıltırdı.
5. **Üç yeni yardımcı dosya → DOĞRU AYRIŞTIRMA, ÖLÜ KOD DEĞİL (bulgu değil).**
   Hepsinin gerçek tüketicisi var: `duplicate-key-check` → `primitives.ts:41` +
   `duplicate-key-issues.ts:30`; `duplicate-key-issues` → `validate-settings.ts:41`;
   `unsafe-key-scan` → `validate-settings.ts:44`, `defaults.ts:18`,
   `schema-from-definitions.ts:23`; `semver-format` → `chain.ts:56`, `manifest.ts:53`.
   Parçalanma **gerekçeli ve yapısal**: `duplicate-key-check.ts` bilinçli olarak
   `ThemeSettingDefinition`'a **bağımlı değil** (yapısal `{ key: string }`) — aksi hâlde
   `primitives.ts` ↔ tarayıcı **dosya seviyesinde döngü** doğardı (`:14-26` bunu
   yazıyor). Barrel'da olmamaları **bilinçli iç sınır** (`package.json` `exports` yalnızca
   `"."`), ama barrel'ın dışlama listesine **yazılmamış** → **L5**.
6. **Sabitlerin EXPORT'u → SEMVER YÜZEYİ BÜYÜMEDİ (bulgu değil).** Beş sabit modül
   seviyesinde `export` ama **barrel'da yok** ve paketin tek giriş noktası `"."` → paket
   dışından erişilemiyor, S8'in `buildThemeContractJsonSchema` gerekçesiyle **çelişmiyor**
   (o da aynı statüde). Alternatif — deseni `json-schema.ts` içinde yeniden yazmak —
   B4'ün kapattığı sapma riskini yeniden açardı. Doğru takas; tek eksik belge → **L5**.
7. **En büyük fonksiyon → DEĞİŞMEDİ: 159 satır** (`migrations/chain.ts:91-249`).
   B4'ün çıkardığı şey (desen sabiti + `extractMajor`) **modül seviyesindeydi**,
   fonksiyon gövdesinde değil — dosya 270 → 249 satıra indi, fonksiyon **birebir aynı**.
   Tur 1'in low #11 (beş fazın saf yardımcılara ayrılması) **açık**.
8. **Tur 1'in gerçek ölü export'u → KAPANMADI.** `manifest/templates.ts:160`
   `export type ThemeTemplates` hâlâ tek eşleşme (kendi tanım satırı) — low #12 açık.

---

## C — YAPISAL DEĞİŞMEZLER (tur 1 tabanıyla)

| Değişmez | Tur 1 | Tur 2 | Sonuç |
| --- | --- | --- | --- |
| `any` (tip olarak) | 0 | **0** — üç eşleşme: `json-schema.ts:239` Zod **seçenek değeri** (`unrepresentable: 'any'`), ikisi yorum | ✅ |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable` | 0 | **0** | ✅ |
| üretim `as` | 1 | **2** — `templates.ts:86` (`.check()` sonrası, tur 1'de meşru bulundu) + **YENİ** `validate-settings.ts:93` (`input as Record<string, unknown>`). İkincisi `:89-91`'deki `typeof === 'object' && !== null` daraltmasının **hemen** ardından ve erişilen her değer o noktada Zod'un `safeParse`'ından **geçmiş** (kök: `result.success` sonrası; iç içe: `group`'un `z.object`'i nesne olmayan değeri zaten reddeder) → CLAUDE.md §2'nin izin verdiği durum. `as const` (4) ve testlerdeki daraltmalar sayılmadı. | ✅ |
| en büyük fonksiyon | 159 | **159** (`chain.ts:91-249`); 2.: `run.ts:146-232`, 87 satır (65'ten büyüdü — B2/B3'ün `try` blokları) | ⚠ low #11 |
| **dosya** seviyesi döngü | 0 | **0 — ölçüldü.** `manifest.ts:54` → `settings/primitives.ts:41` → `settings/duplicate-key-check.ts` (**ithalatı yok, yaprak**); `primitives.ts:39` → `manifest/asset-ref.ts` (yalnızca `zod`/`errors`/`messages`) → geri dönüş yok. `unsafe-key-scan` → `keys` → yaprak. `duplicate-key-issues` → `primitives` **tip-only**. Yeni dört modülün hiçbiri döngü açmadı. | ✅ |
| **dizin** seviyesi `manifest/` ↔ `settings/` | karşılıklı | **karşılıklı (değişmedi)** — B1 yönü değiştirmedi, yalnızca ithal edilen sembolü değiştirdi (`THEME_SETTING_DEFINITION_SCHEMA` → `THEME_SETTINGS_LIST_SCHEMA`). `zod-issue-mapping.ts` hâlâ `settings/` altında. | ⚠ low #8 |
| katman ihlali · `console.*` | 0 · 0 | **0 · 0** — `@arkesoft/*` ithali yok, `node:*` yalnızca `__tests__/` + `scripts/`; `json-schema.ts:154`'teki `console.log` **yorum içinde** (anlatı) | ✅ |
| `dependencies` | `{ zod: 'catalog:' }` | **birebir** (`purity.test.ts:170` `toEqual` ile pinli) | ✅ |
| ölü export | 1 | **1** (`templates.ts:160`) — dört yeni modülün hepsinde gerçek tüketici var | ⚠ low #12 |

---

## D — TUR 1'İN 12 `low`'U: **12'si de AÇIK** (düzeltme turu `low` için koşturulmadı, doğru)

| tur 1 # | dosya:satır (güncel) | Durum |
| --- | --- | --- |
| 1 | `src/errors.ts:78-82` | **AÇIK** — `warnings` hâlâ kalıcı boş (`chain.ts:248`, `run.ts:231` sabit `[]`) |
| 2 | `src/messages.ts:62` | **AÇIK** — mesaj hâlâ "from/to çifti", kod hâlâ yalnızca `from`'a bakıyor (`chain.ts:137`) |
| 3 | `src/manifest/manifest.ts:127` (eski :116) | **AÇIK** — yorum hâlâ `../zod-issue-mapping.ts`, gerçek yol `../settings/zod-issue-mapping.ts` |
| 4 | `src/__tests__/purity.test.ts:16-23`, `:106-111` | **AÇIK** — "⚠ BUGÜN HENÜZ DOĞMADI" ve "index.ts … bu turda DOKUNULMADI" cümleleri yerinde, ikisi de yanlış |
| 5 | `README.md:43-58` | **AÇIK** — "Dosyalar" listesi 5 modül, söz verilen güncelleme yapılmadı (`docs`, S10) |
| 6 | `src/__tests__/define-theme.test.ts:19-29` | **AÇIK** — `THEME_SETTING_PRIMITIVE_TYPES` hiç doğmadı, sekiz değer elle kopya |
| 7 | `src/manifest/__tests__/no-service-url-fields.test.ts:52,55-64` | **AÇIK** — `FIELD_DECLARATION_PATTERN` ve `FORBIDDEN_FIELD_NAMES` aynen |
| 8 | `src/settings/zod-issue-mapping.ts` · `src/manifest/asset-ref.ts` | **AÇIK** — dizin karşılıklılığı korunuyor (C tablosu) |
| 9 | `src/migrations/chain.ts:228` (eski :249) | **AÇIK** — `themeMajor > 1` eşiği, `0.x` davranışını pinleyen test **yok** (A3, vade v0.0.10) |
| 10 | `scripts/generate-contract-schema.ts:98-101,122-123` | **AÇIK** — dokunulmadı |
| 11 | `src/migrations/chain.ts:91-249` | **AÇIK** — 159 satır, değişmedi (B7) |
| 12 | `src/manifest/templates.ts:160` | **AÇIK** — ölü export |

**Bu turun yeni `low`'ları:** L1–L5 (yukarıda). `docs`'un kaydetmesi gereken borç kümesi:
**tur 1'in 12'si + bu turun 5'i = 17 `low` satırı.**

---

## ÖLÇÜMLER

İncelenen dosya **28** (23 üretim `.ts` tam okuma/hedefli okuma + 18 test dosyasından 9'u
tam + `index.ts`/`tsconfig.build.json`/`README.md`/`docs/theme-contract.schema.json`) ·
üretim dosyası **23**, test **18** · **`any` 0** · **`@ts-ignore` 0** · üretim `as` **2**
(ikisi de runtime doğrulaması sonrası, meşru) · en büyük fonksiyon **159 satır**
(`migrations/chain.ts:91-249`, tur 1'e göre **değişmedi**) · dosya seviyesi döngü **0** ·
katman ihlali **0** · `console.*` **0** · ölü export **1** · bulgu **2 medium + 5 low**
(tur 1: 4 medium + 12 low) · ⚠ **komut çalıştırılmadı** (`Bash` aracı yok)

**PASS gerekçesi (AGENT_BASELINE §4, bağlayıcı):** `critical` 0, `high` 0, `medium` **2**
(≤2) → **PASS**; iki `medium` ve beş `low` **teknik borca kaydedilir**, düzeltme turu
açılmaz. Tur 1'in dört `medium`'u **kapandı ve ayırt edici testlerle pinli**; yeni iki
`medium` düzeltmelerin **kendi getirdiği** sorunlardır (parti A/parti B dikişi).
