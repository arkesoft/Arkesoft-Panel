# T-012 · solid gate · tur 1

- **Tarih:** 2026-11-03
- **Sürüm:** v0.0.10 · platform 0.2.0 · `@arkesoft/themes-modern` 0.1.0 · `@arkesoft/theme-sdk` 0.1.1 · `@arkesoft/trpc` 0.2.0
- **Kapsam:** T-012'de değişen/yeni dosyalar. `.claude/workflow/**` inceleme dışı.

```
GATE: solid
SONUÇ: FAIL
```

**FAIL gerekçesi (AGENT_BASELINE §4):** 4 `medium` bulgu (≥3 ⇒ FAIL). `critical`/`high` **yok**.

---

## 1. Dört açık kararın adjudikasyonu

### K-A · Vitrinin hata tipleri `AppError`'dan türemeli mi? → **KISMİ İHLAL, SEV: medium**

S7'nin iki gerekçesini de **ölçtüm ve ikisi de yanlış çıktı**:

| S7'nin iddiası | Ölçüm | Sonuç |
| --- | --- | --- |
| "`packages/errors` barrel yorumu vitrini tüketici saymıyor" | `packages/errors/src/index.ts:3-5` gerçekten saymıyor — **ama** `apps/storefront/package.json:19` `@arkesoft/errors`'u **bağımlılık olarak BİLDİRİYOR** ve `src/lib/storefront-server-fetch.ts:35-36` + `src/lib/map-api-error.ts:53` ondan **zaten import ediyor** (v0.0.8'den beri) | İddianın dayanağı **bayat bir yorum** |
| "emsal: `StorefrontApiFailure`" | `src/lib/map-api-error.ts:57` → `StorefrontApiFailure` bir **ayrımlı birleşim SONUÇ tipi**, bir `Error` alt sınıfı **DEĞİL** | **Emsal değil.** T-012'den önce `apps/storefront/src`'te `extends Error` sayısı **0**'dı (ölçüldü) |

**Bağımlılık yönü engeli yok:** `packages/errors`'un tek bağımlılığı `zod` (CLAUDE.md §3), `apps/*` → `packages/*` yönü korunur, yeni bir ana bağımlılık **gerekmiyor** (zaten bildirilmiş). `apps/api/src/trpc/ports/storefront-tenant-read.port.adapter.ts:53` aynı akışta `AppError` türevi (`TenantNotFoundError`) kullanıyor — hiyerarşi canlı.

**Üç sınıf AYNI kategoride değil, ayırt ediyorum:**

- `ThemeResolutionError` (`registry.ts:145-155`) → **İHLAL.** İstek anında ulaşılır, ziyaretçiye **503** olarak döner. `AppError`'ın dört alanı birebir karşılığı: `code: 'THEME_RESOLUTION_FAILED'`, `httpStatus: 503`, `userMessageKey`, `context`. Sınıf `readonly context` alanını **elle yeniden yazıyor** (`:146,153`) ve `middleware.ts:240-247` `instanceof` + elle 503 eşlemesiyle `AppError.httpStatus`'u **elle yeniden uyguluyor** — var olan bir soyutlamanın kısmi kopyası (DRY).
- `ThemeCssGenerationError` (`theme-css.ts:92`) / `ThemeRegistryIntegrityError` (`registry.ts:123`) → **savunulabilir.** Modül yüklenirken fırlayan geliştirici/tema-yazarı hataları; ziyaretçiye hiç ulaşmaz. `AppError` `abstract` ve `httpStatus`+`userMessageKey` **zorunlu** (`app-error.ts:48,52,121`) — bir açılış çökmesi için uydurma bir i18n anahtarı taşımak daha kötü olurdu. Emsal: `src/lib/storefront-env-schema.ts:55` de çıplak `Error` fırlatıyor.

⚠ `registry.ts:140`'taki ölçüm (`rg -n "extends AppError" apps/storefront` → 0) **kendini doğrulayan** bir ölçümdür: "henüz kimse yapmadı" bulgusu, "yapılmamalı" kanıtı değildir.

### K-B · `S8`'in gerekçeli DOKUNMA ihlali → **DÜZELTME DOĞRU; daha iyisi var, SEV: low**

Düzeltme **doğru ve DOKUNMA ihlali meşru**: `ThemeTemplate.astro` o ana dek hiçbir gerçek build'den geçmemişti (`tsc` `.astro` görmez), kusur ilk build'de fırladı, S8 kök nedeni iki bağımsız yolla ölçtü, mantık değişikliği sıfır.

**Node alt-yol joker kuralı ile iki seçeneği karşılaştırdım:**

| | Anahtar | Specifier | Eşleşen `*` | Hedef |
| --- | --- | --- | --- | --- |
| Bugünkü (A) | `"./templates/*"` | `.../templates/home` | `home` | `./src/templates/home.astro` ✓ |
| Kusur | `"./templates/*"` | `.../templates/home.astro` | `home.astro` | `./src/templates/home.astro.astro` ✗ |
| Alternatif (B) | `"./templates/*.astro"` | `.../templates/home.astro` | `home` | `./src/templates/home.astro` ✓ |

**(B) daha sağlam, gerekçe:** (A)'da **doğal yazım yanlış yazımdır.** Üçüncü şablonu (`product.astro`) ekleyecek geliştirici, dosya adıyla eşleşen `.../templates/product.astro`'yu yazacak ve **aynı tuzağa** basacak — bu tuzak bu görevde **bir kez zaten patladı**. (B)'de doğal yazım tek doğru yazımdır; ayrıca (A) çağrı yerinde Astro bileşenini uzantısız, JS/TS modülü gibi gösteriyor (`ThemeTemplate.astro:52-53`). (B)'nin maliyeti `@arkesoft/themes-modern`'in **public alt-yol yüzeyini** değiştirmek; paket `private: true`, tek tüketici, tek çağrı yeri → **şimdi bedavaya yakın, ikinci tüketiciden sonra kırıcı**.

SEV **low**: bugünkü hâl **yanlış davranış üretmiyor** ve hata modu gürültülü (build FAIL), tekrarlayan bir ayak kapanı.

### K-C · Kayıt defteri anahtar biçimi iki yerde → **SEV: medium, BU SÜRÜMDE kapatılmalı**

Biçim (`${id}@${version}`) **iki üretici yerde** yaşıyor: `registry.ts:83` (`registryKeyOf`) + `:175` (`resolveTheme`'in kendi birleştirmesi) ve `middleware.ts:264`. Bunları senkron tutan **hiçbir test yok** (`theme-template-dispatch.test.ts` *anahtar değerlerini* pinliyor, *formülü* değil).

**`as` meşru mu?** CLAUDE.md §2'nin *amacı* (doğrulanmamış veriye tip verme) bugün **ihlal edilmiyor**: `resolveTheme()` aynı formülle kurulmuş anahtarı `Object.hasOwn` ile doğruladı ve fırlamadı. Yani iddia **bugün doğru** — ama doğruluğu, iki formülün **karakter karakter aynı kalmasına** bağlı ve bunu hiçbir mekanizma zorlamıyor. Dolayısıyla asıl kusur `as` değil, **pinlenmemiş tekrar**.

**Somut hata senaryosu (kanıt):** `registry.ts:175`'teki birleştirme değişirse (ör. ayraç `@` → `/`), `assertRegistryKeysMatchManifests` **fırlamaz** (o yalnızca `registryKeyOf` ↔ yazılı anahtarı karşılaştırır, `resolveTheme`'in formülünü denetlemez) ve `resolveTheme` yeni formülle çözer; `middleware.ts:264` **eski** formülle üretir → `as ThemeRegistryKey` **yalan** olur → `ThemeTemplate.astro:87,91`'in iki `if`'i de düşer → `:95` çıplak `Error` fırlatır → ziyaretçiye **tasarlanmış 503 yerine 500** gider.

**Karar: v0.0.21 borcu DEĞİL, bu sürümde kapatılmalı.** Gerekçe: (a) düzeltme bir satır — `ThemeRegistryEntry`'ye `readonly key: ThemeRegistryKey` eklenir, `resolveTheme` `{ ...THEME_REGISTRY[key], key }` döner, `middleware.ts:264` **silinir**; (b) ekleme (additive), davranış değişikliği yok, yeni bağımlılık yok; (c) erteleme, iki formülü **tam N-2 işinin yapıldığı turda** canlı tutar — drift riskinin en yüksek olduğu an; (d) handoff bunu zaten "teknik ihlal" diye raporluyor — bir satırla kapanan belgelenmiş ihlal, borç tablosunun en pahalı sınıfıdır.

### K-D · `theme-setting-definition.ts` geçişli tip türetimi → **phantom dependency DEĞİL, SEV: low**

**Meşru türetme, ölçtüm:**
- `apps/storefront` `@arkesoft/theme-sdk`'yı **modül olarak hiç çözmüyor** — yalnızca bildirilmiş `@arkesoft/themes-modern`'in bir export'unun **çıkarılmış tipini** kullanıyor. pnpm'in phantom-dependency koruması modül çözümlemesi hakkındadır; burada çözümleme yok.
- Türetmenin **tipi doğru veriyor**: `packages/theme-sdk/src/define-theme.ts:78` → `defineTheme(input: unknown): ThemeDefinition` **jenerik değil**, girdiye bağlı daraltma yapmıyor. Dolayısıyla `typeof modernTheme` ≡ `ThemeDefinition`, `typeof modernTheme.manifest.settings[number]` ≡ sekiz ilkelin tam birleşimi — modern'in beş ayarının dar literal tipi **değil**.
- Bu **derleme zamanında pinli**: `theme-css.test.ts:59-74` `Record<'select'|'toggle'|'image'|'text'|'number', ThemeSettingDefinition>` kuruyor ve `:47` bir `group` atıyor; tip daralsa bu atamalar `tsc`'yi kırar. `typecheck` 21/21 yeşil → bugün tam birleşim olduğu **ölçülmüş** oluyor.
- Turbo grafiği staleness'ı kapatıyor: `turbo.json:60-62,67-68` → `typecheck`/`test` `dependsOn: ["^build"]`, yani `theme-sdk`'nın `dist/` üretimi topolojik olarak önce koşuyor (`theme-sdk/package.json:7-14` `exports` `dist/`'e bakıyor).

**Yine de `@arkesoft/theme-sdk` açık bağımlılık olarak BİLDİRİLMELİ (low):** `theme-css.ts:138-188` **theme-sdk'nın ilkel birleşimi üzerinde exhaustive `switch` + `assertNever`** uyguluyor — bu, manifestin kaydetmesi gereken doğrudan bir sözleşme bağımlılığıdır. İkinci somut maliyet: `registry.ts:62` `type ThemeDefinition = typeof modernTheme` — kayıt defterinin **girdi tipi tek bir somut temanın adını taşıyor**; ikinci tema paketi geldiğinde (`corporate`, v0.0.21) `buildRegistryEntry(corporateTheme)` "modern'in tipine" karşı denetlenir. Üçüncüsü KISS: bu dolaylılık `theme-setting-definition.ts`'te 1 satır tip için 27 satır gerekçe yorumu + `registry.ts:52-62`'de 11 satır daha ödüyor.

S7'nin **prosedürel olarak haklı** olduğunu kaydediyorum: `package.json` S3'ün dosyasıydı, DOKUNMA listesindeydi. Vade önerisi: v0.0.21 (ikinci kayıt girdisiyle birlikte), daha erken olursa daha iyi.

---

## 2. Öncelikli inceleme hatları

### Hat 1 · Beyan ↔ gerçeklik boşlukları

**Doğrulanıp TEMİZ çıkanlar (ölçüldü):**

| Beyan | Ölçüm | Sonuç |
| --- | --- | --- |
| `theme.config.ts:45` `color-primary` = "Başlıkların metin rengi" | `PageHeading.astro:23` `color: var(--color-primary)` | ✓ |
| `:51` `color-surface` = "Sayfa zemini" | `PageSection.astro:38` `background-color: var(--color-surface)` | ✓ |
| `:61` `color-body` = "Gövde paragrafları" | `BodyText.astro:20-21` `color: var(--color-body)`, `font-family: var(--font-body)` | ✓ |
| `trpc/schemas/storefront-tenant.schema.ts:43` "kapı DB CHECK kısıtı" | `migration.sql:32-33` kısıt **gerçekten var** | ✓ |
| `theme-css.ts:41-45` "SAF, modül-düzeyi yan etki yok" | modül düzeyinde yalnızca 3 regex + 1 sınıf; fonksiyon flatMap/map/join | ✓ |
| `registry.ts:29-37` "süreç başına bir kez" | `registry.test.ts:48-53` `toBe` kimlik testi | ✓ |
| `README.md:58-62` ".astro typecheck/lint'ten geçmez" | doğru, borç açıkça yazılı | ✓ (dürüst) |

**BOŞLUK bulunanlar:**

1. **`registry.ts:87-91` N-2 iddiası — "id başına ÇOK girdi taşıyabilir" yapısal olarak doğru, ama onu KORUYAN pin kısmen kör.** Bkz. M3.
2. **`ThemeTemplate.astro:81` "adlandırılmış bir hata FIRLATIR" ↔ `:95` çıplak `new Error(...)`.** Kardeş modüllerin üçü de adlandırılmış sınıf tanımlıyor; bu dosya tanımlamıyor. Bkz. L1.
3. **`procedures.test.ts:148` başlığı "port'un döndürdüğü `{name,themeId,themeVersion}`'i tele TAŞIR"** ↔ `harness.ts:181` sahte port `themeId`/`themeVersion`'ı **sabit `null`** döndürüyor. Test yalnızca `null`'ların taşındığını kanıtlıyor. Bkz. M4.
4. **`theme-manifest.test.ts:42-46` "settings listesinde image tipinde bir ayar YOK"** ↔ assertion yalnızca **derinlik-0**'a bakıyor; `primitives.ts:159-167,187-204` `image`'ın meşru bir `group` çocuğu olduğunu gösteriyor. Bkz. L7.
5. **`migration-sql.test.ts:1569-1572`** yorum olarak "tam satır SQL yorumları elenmeli, aksi hâlde yasağı anan gerekçe metni yanlış pozitif üretir" diyor ve eliyor; **:1593-1596, :1599-1606, :1609-1613** aynı dosyada **elemiyor** (pozitif assertion'lar → yanlış **YEŞİL** yüzeyi). Bugün zararsız (migration yorumları tırnaksız yazıyor) ama ev kuralı 3 kardeş assertion'da uygulanmamış. Bkz. L8.
6. **`packages/errors/src/index.ts:3-5`** tüketici listesi `apps/storefront`'u saymıyor; vitrin v0.0.8'den beri tüketici. Bu bayat yorum K-A'nın **taşıyıcı kanıtıydı**. Bkz. L4.

### Hat 2 · `solid`'in kendi reçetesine karşı üç pin denetimi

> Reçete: (1) tek uygulama + (2) TAM ÇIKTI assert'i + (3) YAKIN-KAÇIRMA içeren sentetik veri.

**Pin 1 · `theme-css-no-literal-keys.test.ts` → GEÇER.**
(1) Anahtar listesi `modernTheme.manifest.settings`'ten **canlı** okunuyor (`:38`), elle yazılmıyor. (2) `expect(violations).toEqual([])` — tam dizi; `:39` `length > 0` boşluk üzerinde geçmeyi engelliyor. (3) Mutasyon kanıtı süit dışında, elle, geri alınmış — repo konvansiyonu. `codeLinesOf`'un satır-öneki tabanlı yorum elemesini (`:33`) kontrol ettim: TS'te kod satırı `//` veya `*` ile başlayamaz, yanlış **negatif** yüzeyi yok (tek yüzey, `/* key */` tek satır yorumu → yanlış **pozitif**, yani gürültü, güvenlik açığı değil).

**Pin 2 · `theme-template-dispatch.test.ts` → REÇETEYİ İHLAL EDİYOR (madde 1).** Bkz. M3.

**Pin 3 · `router-output.test-d.ts` negatif pini → GEÇER (bir kaydıyla).**
(1) Beklenen şekil literal, şemadan türetilmemiş (`:40-46,:78-82`) — totoloji karşıtlığı gerçek. (2) `toEqualTypeOf` **iki yönlü** tam eşitlik (`:12-15`'te gevşek yardımcının bilinçli reddi yazılı). (3) Alan başına negatif satır (`:109-114`).
⚠ **Ölçemedim:** `expect-type`'ın `NegativeExpectTypeOf.toHaveProperty` imzasının mutasyona gerçekten duyarlı olduğunu (`:97-106`'nın iddiası) bağımsız olarak doğrulamadım — kütüphane içi tipleri okumadım ve mutasyon koşturmadım. S4'ün kanıtına güveniyorum.
📌 **Gözlem (bulgu değil):** `:78`'in `toEqualTypeOf`'u **zaten** iki yönlü tam eşitlik olduğu için fazladan bir alanı tek başına reddediyor; `:109-114` mekanik olarak **gereksiz** (derinlemesine savunma). `:91-95`'in "pozitif pinin güncellenmesi tek başına denetimsiz bir gevşetme olurdu" gerekçesi bu yüzden teknik olarak yanlış — pozitif pin **ekleme**yle gevşemez. Public API sözleşmesinde fazlalık savunulabilir (CLAUDE.md §9), bulgu yazmıyorum.

**Bonus · `EXPECTED_COLOR_PRIMARY_HEX` (`storefront-theme.spec.ts:65`) → DOĞRU TASARIM, sessizce ayrışamaz.**
S9'un bağımsız literali `:136`'da `expect(EXPECTED_COLOR_PRIMARY_HEX).toBe(findColorSettingDefault('color-primary'))` ile **canlı manifeste karşı eşitlenmiş**. Yani iki özellik birlikte sağlanıyor: palet değişirse test kırılır (inceleme kapısı) **ve** literal ile `theme.config.ts` **sessizce ayrışamaz**. Ayrıca `:142` değişkenin değerini, `:156-163` görünür bir `h1`'in **hesaplanmış** rengini ölçüyor — "beyan ≠ gerçeklik" sınıfının e2e karşılığı gerçekten kapatılmış. Bulgu yok.

### Hat 3 · AC3'ün ölçüm değişikliği → **SERTLEŞTİRME (gevşetme DEĞİL)**

architect'in korumak istediği değişmez: *"adın ikinci bir DOĞRULUK KAYNAĞI olmaması."* **Korunuyor.** Her yeniden-adlandırma sapma yolunu tek tek izledim — `theme.config.ts:41`'de `color-primary` → `color-brand` yapıldığında:

| Yer | Rol | Sonuç |
| --- | --- | --- |
| `theme-css.ts` | üretici | `--color-brand` **otomatik** üretir (0 literal) ✓ |
| `theme-manifest.test.ts:48-55` | doğrulayıcı | **KIRMIZI** ✓ |
| `storefront-theme.spec.ts:136` | doğrulayıcı | `findColorSettingDefault` **FIRLATIR** ✓ |
| `PageHeading.astro:23` | **tüketici** | `var(--color-primary)` tanımsız kalır → `spec.ts:163` hesaplanmış renk assert'i **KIRMIZI** ✓ |

**Sessizce yeşil kalan hiçbir yol bulamadım.** Üstelik architect'in orijinal ölçütü (*"repoda tam 1 kez"*) yapısal olarak sağlanamaz (CSS `var()` adı **literal** yazmayı zorunlu kılar) ve **sağlanabilir hâle getirilmesinin tek yolu doğrulayıcıları silmekti** — `spec.ts:136`'nın çapraz kontrolü ile `theme-manifest.test.ts:50`'nin literali, drift'i gürültülü kılan şeylerin tam kendisi. Bir **sayım** metriği test kapsamını cezalandırıyordu.

Yeni ölçüt daha güçlü üç nedenden: **konum kapsamlı SIFIR** (en güçlü biçim — "az" değil, "üretici dosyada hiç"), **mutasyon kanıtlı**, **boş küme üzerinde geçmiyor** (anahtarlar canlı okunuyor, `length > 0`).

⚠ Tek kayıt (low): pin **tek bir dosya yoluna** sabitlenmiş (`theme-css-no-literal-keys.test.ts:27`). İkinci bir üretici dosya doğarsa (ör. `src/themes/theme-css-admin.ts`) pin onu **kapsamaz**. Bkz. L9.

### Hat 4 · `theme-css.ts`'in exhaustive switch'i → **GERÇEKTEN EXHAUSTIVE; dallar BİLİNÇLİ no-op**

- **Exhaustive mi?** Evet, **derleyici zorluyor**: `default` dalı `assertNever(definition, ...)` (`:187`). SDK'ya 9. ilkel eklenirse `definition` artık `never` olmaz → `pnpm typecheck` kırılır. `assert-never.ts:31` imzası (`value: never`) bunu sağlıyor.
- **`group` derinlik-1 doğru mu?** Evet, **ölçtüm**: `primitives.ts:159-167` `THEME_SETTING_LEAF_SCHEMA` `group`'u **içermiyor**, `:187-204` `children: z.array(THEME_SETTING_LEAF_SCHEMA)`. Yani `children` elemanları `ThemeSettingLeaf` ⊂ `ThemeSettingDefinition` — `:153` `definition.children.flatMap(declarationsOf)` tip olarak geçerli **ve** sonsuz özyineleme **yapısal olarak imkânsız**. `group`'un **kendi** `key`'i `CSS_VARIABLE_NAME_PATTERN`'den geçirilmiyor — doğru, çünkü `group` hiç bildirim üretmiyor.
- **Sessizce atlıyor mu, bilinçli no-op mu?** **Bilinçli no-op.** Beş dalın her birinde yazılı gerekçe (`:154-185`) **ve** her biri davranış olarak pinli: `theme-css.test.ts:76-83` beş tip için `expect(css).toBe(':root{}')` — tam çıktı assert'i. Sessiz atlama olsaydı test onu ayırt edemezdi; burada no-op **beklenen davranış olarak ölçülüyor**.

Bulgu yok. ✓

---

## 3. Bağımlılık yönü, döngü, `packages/ui`

| Kontrol | Ölçüm | Sonuç |
| --- | --- | --- |
| `apps/storefront` → `packages/themes/modern` | `apps/storefront/package.json:20` | ✓ |
| `packages/themes/modern` → `packages/theme-sdk` | `packages/themes/modern/package.json:18` (tek `dependencies` girdisi) | ✓ |
| `packages/theme-sdk` → `{zod}` | `packages/theme-sdk/package.json:26-28` | ✓ |
| `apps/*` → `packages/*` yönü | `rg "@arkesoft/(ui\|storefront\|admin\|api\|superadmin)" packages/` → **hiçbir paket bir app'i import etmiyor** (yalnızca kendi ad/ESLint-yasak dizeleri eşleşti) | ✓ ihlal yok |
| Döngü | Zincir doğrusal, `theme-sdk`'nın iç paket bağımlılığı **yok** | ✓ döngü yok |
| `packages/ui` | T-012 kapsamında **hiç dosyası yok**; `packages/ui/src/{theme.css,tokens.ts}` eşleşmeleri **T-008** kaynaklı | ✓ dokunulmadı |
| `packages/ui` veri çekiyor / `trpc` bağımlı mı | hayır (bu turda değişmedi) | ✓ |

---

## 4. Bulgular

### MEDIUM

**M1 — `apps/storefront/src/themes/registry.ts:145-155` · SEV: medium · sorumlu: `frontend` (S7) + `architect` (karar)**
`ThemeResolutionError` `AppError` yerine çıplak `Error`'dan türüyor; CLAUDE.md §4 *"Tek hiyerarşi: `AppError`"*.
**Kanıt (iddia değil):** (a) Gerekçenin iki dayanağı da ölçülerek çürütüldü — `apps/storefront/package.json:19` `@arkesoft/errors`'u bildiriyor ve `src/lib/map-api-error.ts:53` ondan import ediyor; `StorefrontApiFailure` (`map-api-error.ts:57`) bir `Error` sınıfı değil, ayrımlı birleşim. (b) Bu hata istek anında ziyaretçiye **503** döndürüyor, yani `AppError`'ın `httpStatus`+`userMessageKey` taşıyıcısının tam hedef kitlesi. (c) Sınıf `AppError.context`'i (`:146,153`) ve `middleware.ts:240-247` `AppError.httpStatus` eşlemesini **elle yeniden uyguluyor** — var olan soyutlamanın kısmi kopyası. (d) v0.3.0'da `generateThemeCss` kiracı JSONB'si alacak (`theme-css.ts:16`) → hata sınıfı kiracı-girdi hatasına dönüşecek ve i18n anahtarı **zorunlu** olacak.
**Önerilen düzeltme:** `ThemeResolutionError`'ı `AppError`'dan türet (`code: 'THEME_RESOLUTION_FAILED'`, `httpStatus: 503`, `userMessageKey`); `middleware.ts:240` `instanceof` kontrolünü `isAppError` + `httpStatus` eşlemesine çevir. `ThemeCssGenerationError`/`ThemeRegistryIntegrityError` çıplak `Error` **kalabilir** (açılış-anı geliştirici hataları, `storefront-env-schema.ts:55` emsali) — ama bu ayrımı ilgili dosya başı yorumlarına **yaz**, "vitrin AppError tüketmiyor" gerekçesini **kaldır** (yanlış).

**M2 — `apps/storefront/src/middleware.ts:264` (+ `src/themes/registry.ts:83,175`) · SEV: medium · sorumlu: `frontend` (S7 yüzey, S8 tüketici)**
Kayıt defteri anahtar **formülü** iki üretici yerde yaşıyor, hiçbir test senkronluğunu pinlemiyor.
**Kanıt:** `registry.ts:175`'teki ayraç değişirse `assertRegistryKeysMatchManifests` **fırlamaz** (o yalnızca `registryKeyOf` ↔ yazılı anahtarı karşılaştırır, `resolveTheme`'in formülünü denetlemez). O durumda `resolveTheme` yeni formülle çözer, `middleware.ts:264` eski formülle üretir, `as ThemeRegistryKey` yalan olur, `ThemeTemplate.astro:87,91` iki `if`'i de düşer, `:95` çıplak `Error` fırlatır → ziyaretçi **tasarlanmış 503 yerine 500** görür. `as`'ın meşruiyeti bugün geçerli ama **ölçülmeyen bir özdeşliğe** bağlı.
**Önerilen düzeltme (bu sürümde, ~3 satır):** `ThemeRegistryEntry`'ye `readonly key: ThemeRegistryKey` ekle, `resolveTheme` çözülmüş anahtarı da döndür, `middleware.ts:264`'ü ve `as`'ı **sil**. Yolu üstündeyse: Adım 5.5'i `src/lib/resolve-tenant-theme.ts`'e çıkar (L6'yı da kapatır).

**M3 — `apps/storefront/src/themes/__tests__/theme-template-dispatch.test.ts:23,32-44` · SEV: medium · sorumlu: `frontend` (S7)**
Drift-pin, `registry.ts`'i **grep'liyor** — oysa o dosya **düz `.ts` ve vitest'te import edilebilir** (`registry.test.ts:5` zaten ediyor). Reçete maddesi 1 (tek uygulama) ihlali: regex, kayıt defterinin şeklinin **ikinci bir temsili**.
**Kanıt (yanlış YEŞİL senaryosu):** v0.0.21'de ikinci girdi `REGISTRY_KEY_LINE_PATTERN`'in göremediği bir biçimde yazılırsa (ör. `...extraEntries,` yayılımı veya `[registryKeyOf(x)]: buildRegistryEntry(x),` hesaplanmış anahtar), `registryKeys()` yalnızca `['modern@0.1.0']` döner; dispatcher da güncellenmemişse `toEqual` **geçer**, `:58-59`'un `length > 0` koruması **boş** kümeyi engelliyor ama **kısmi** kümeyi engellemiyor → pin tam olarak var olma sebebi olan senaryoda kör. Sonuç: yeni temadaki kiracı `ThemeTemplate.astro:95`'ten **500** alır. Pinin vadesi (ikinci kayıt girdisi) **ROADMAP'te planlı** (v0.0.21), yani bu teorik değil.
**Önerilen düzeltme:** registry tarafını gerçek modülden oku (`Object.keys(THEME_REGISTRY)` için anahtar listesini `registry.ts`'ten export et — M2'nin `key` eklemesiyle aynı düzenleme); grep'i **yalnızca** kaçınılmaz olan `.astro` tarafında bırak. Tek yönlü grep, iki yönlü grep'ten güvenli.

**M4 — `packages/trpc/src/__tests__/harness.ts:181` + `src/__tests__/procedures.test.ts:148-165,180-184` · SEV: medium · sorumlu: `backend` (S4)**
`storefront.currentTenant`'tan **null olmayan** bir tema seçiminin tele geçtiğini doğrulayan **hiçbir test yok**; sahte port `themeId`/`themeVersion`'ı **sabit `null`** döndürüyor.
**Kanıt:** Üç storefront prosedür testinin üçü de `themeId: null, themeVersion: null` assert ediyor. Resolver `themeId: null` döndürecek şekilde bozulsa (veya şema `z.null()`'a daralsa) **üçü de yeşil kalır**; `router-output.test-d.ts:78-82` tip düzeyinde `string | null` beklediği için **o da yeşil kalır**; `Object.keys(result)` küme eşitliği (`:164`) alan **varlığını** ölçüyor, **değerini** değil. Bu yolun tek gerçek kapsamı `storefront-theme.spec.ts` — ve handoff'un kendi ölçümü e2e'nin **CI'a giremediğini** (v0.0.19) söylüyor. Yani v0.0.10'un **ana özelliği** (kiracının DB'deki `themeId` seçiminin vitrine ulaşması) CI'da **hiçbir kapıdan geçmiyor**. Ayrıca `procedures.test.ts:148` test başlığı taşımayı iddia ediyor, veri yalnızca `null` kullanıyor — Hat 1 sınıfı.
**Önerilen düzeltme:** `createHarness({ storefrontTenantRead: ... })` override'ı **zaten var** (`harness.ts:322,365-366`); `findPublicTenant`'ın `{name:'…', themeId:'modern', themeVersion:'0.1.0'}` döndüğü ~6 satırlık bir test ekle ve `expect(result).toEqual({...})` ile **tam çıktıyı** assert et. Yeni fixture gerekmiyor.

### LOW (düzeltme turu açmaz — ROADMAP teknik borç satırları)

| # | `dosya:satır` | Açıklama | Sorumlu | Vade |
| --- | --- | --- | --- | --- |
| **L1** | `apps/storefront/src/themes/ThemeTemplate.astro:81` ↔ `:95` | Yorum "**adlandırılmış** bir hata FIRLATIR" diyor, kod çıplak `new Error(...)` fırlatıyor (`name === 'Error'`). Kardeş üç modül adlandırılmış sınıf tanımlıyor. M2'nin hata yüzeyi tam burası — çıplak `Error` tanı yapmayı zorlaştırır. | `frontend` | M2 ile aynı düzenlemede kapanabilir |
| **L2** | `packages/themes/modern/src/theme.config.ts:42-43,50-51,57-58,66-67,74-75` | `label`/`description` **kullanıcıya dönük Türkçe metin**, kodda sabit (CLAUDE.md §4/§10.17). **Bugün yapısal olarak kaçınılmaz:** `packages/i18n` **henüz yok** (glob: 0 dosya) ve `theme-sdk`'nın sözleşmesi (`primitives.ts:53-58` `label: z.string()`, yorumda "görünür ad") bir i18n **anahtar/çözümleme** mekanizması sunmuyor. Kusur, sapmanın **hiçbir yerde yazılı olmaması**: aynı dosya beş sapmayı gerekçeyle kaydediyor, bunu kaydetmiyor. Her yeni tema bu borcu çoğaltır; sonradan çözmek **tema sözleşmesi MAJOR'u** ister. | `architect` (karar) + `docs` (borç satırı) | v0.0.21 (`packages/ui` şema→form motoru) |
| **L3** | K-B: `packages/themes/modern/package.json:9` + `README.md:18-23` | `exports` kalıbı `"./templates/*"` → doğal (`.astro` uzantılı) yazım **çift uzantı** üretiyor; tuzak bu görevde bir kez patladı. `"./templates/*.astro"` doğal yazımı tek doğru yazım yapar. README `exports`'u belgeliyor ama "specifier **uzantısız** olmak zorunda" kuralını **yazmıyor**. | `frontend`/`docs` | v0.0.21'den önce (ikinci tüketiciden sonra kırıcı) |
| **L4** | K-D: `apps/storefront/package.json` (`@arkesoft/theme-sdk` bildirilmiyor) + `src/themes/registry.ts:62` | `theme-css.ts:138-188` theme-sdk'nın ilkel birleşimi üzerinde exhaustive switch uyguluyor — manifestte kaydı yok. `type ThemeDefinition = typeof modernTheme` kayıt defterinin girdi tipini **tek somut temanın adına** bağlıyor (N-2'de ikinci tema "modern'in tipine" karşı denetlenir). S7 prosedürel olarak haklıydı (`package.json` DOKUNMA listesinde). | `devops`/`frontend` | v0.0.21 |
| **L5** | `packages/errors/src/index.ts:3-5` | Barrel tüketici listesi `apps/storefront`'u saymıyor; vitrin v0.0.8'den beri (`storefront-server-fetch.ts:35`, `map-api-error.ts:53`) tüketici. Bu **bayat yorum** M1'in gerekçesinin taşıyıcısıydı — bayat yorumlar karar verdirir. | `docs` | v0.0.11 |
| **L6** | `apps/storefront/src/middleware.ts:133-279` | `onRequest` **147 satır**, yedi sorumluluk (erken çıkış + durum damgalama, host okuma, host çözümleme, API çağrısı, hata eşleme, **tema seçimi/çözümü**, locals yazma, önbellek politikası); bu turda ~40 satır büyüdü. Ev deseni tersini söylüyor: `index.astro` bilinçli olarak mantıksız (K13b) ve mantığı `storefront-tenant-context.ts`'te. Adım 5.5'i `src/lib/resolve-tenant-theme.ts`'e çıkarmak M2'nin de doğal yeri. | `frontend` | M2 ile birlikte |
| **L7** | `packages/themes/modern/src/__tests__/theme-manifest.test.ts:42-46` | "settings listesinde `image` tipinde ayar YOK" assertion'ı **derinlik-0 kör**: `primitives.ts:159-167,187-204` `image`'ın meşru bir `group` çocuğu olduğunu gösteriyor. Bir `group` içine `image` eklenirse BN-1/SEC-5 **bağlayıcı** sıralama kısıtı (varlık servis çözücüsü yok) ihlal edilir ve bu test **yeşil kalır**; başka hiçbir kapı yakalamaz. `medium` yerine `low`: bugün assertion **doğru ve boş değil**, tetikleyici düzenleme planlı değil. Düzeltme 3 satır (özyineli düzleştirme). | `frontend` (S5) | v0.0.11 |
| **L8** | `packages/db/src/__tests__/migration-sql.test.ts:1595,1596,1601,1611,1613` | SQL yorumları **elenmiyor**, oysa `:1569-1572` aynı dosyada bunun **neden zorunlu olduğunu** yazıp eliyor. Pozitif `includes` assertion'ları olduğu için yüzey yanlış **YEŞİL**: bir yorum satırı aranan dizeyi içerirse gerçek SQL ifadesi silinse bile test geçer. Bugün zararsız (`migration.sql:16,25` dizeleri tırnaksız yazıyor, assertion'lar tırnaklı arıyor). | `db` (S2) | v0.0.11 |
| **L9** | `apps/storefront/src/themes/__tests__/theme-css-no-literal-keys.test.ts:27` | AC3 pini **tek dosya yoluna** sabit. İkinci bir üretici dosya (`src/themes/theme-css-*.ts`) doğarsa pin kapsamaz ve "adın ikinci doğruluk kaynağı olmaması" değişmezi sessizce zayıflar. Düzeltme: dizin taraması (`src/themes/*.ts` eksi `__tests__`), dosya sayısı `> 0` assert'i ile. | `frontend` | v0.0.21 |
| **L10** | `packages/themes/modern/src/components/PageSection.astro:29` | `interface Props {}` **ölü**: boş, `Astro.props` hiç okunmuyor. `.astro` ESLint kapsamında olmadığı için `no-empty-object-type` yakalamıyor (README:58-62 borcu). | `frontend` (S5) | v0.0.19 |
| **L11** | `apps/storefront/src/themes/ThemeTemplate.astro:83-98` | Aynı dosya içinde **karışık girinti** (frontmatter yorumları boşluk, fonksiyon gövdesi sekme). `.astro` Prettier kapsamında olmadığı için (`format:check` exit 0) araç yakalamıyor — bu yüzden stil tartışması değil, **denetimsiz** bir tutarsızlık. `home.astro`/`404.astro`/bileşenler sekme, `theme.config.ts` boşluk. | `frontend` | v0.0.19 (`astro check` + prettier-plugin-astro ile birlikte) |
| **L12** | `apps/storefront/src/themes/ThemeTemplate.astro:91-93` + `packages/themes/modern/src/templates/404.astro` | Üretimde **ulaşılamaz**: `index.astro:51` yalnızca `kind="home"` geçiyor, `kind='404'` geçen başka çağıran/test yok. Manifest `templates` **beyanı** zorunlu (AC1) ama Astro **dosyası** ve dispatch **dalı** zorunlu değil. İkisi de yazılı gerekçe taşıyor (bilinçli sınır, v0.1.x) → ölü kod değil "erken genellik"; yalnızca borç olarak kayda geçsin. | `frontend` | v0.1.x |
| **L13** | `apps/storefront/src/themes/__tests__/registry.test.ts:41` | `error as ThemeResolutionError` — `toBeInstanceOf`'tan sonra, Zod'dan sonra değil (CLAUDE.md §2). Test kodu ve önceki satır zaten assert ediyor, ama `if (!(error instanceof ThemeResolutionError)) throw ...` ile daraltma `as`'ı tamamen kaldırırdı (dosyanın kendi `:38` deseni bunu zaten yapıyor). `middleware.test.ts`'in yeni satırlarındaki `as unknown as OnRequestNext` (`:218,239,259,279`) T-009'dan gelen **mevcut** idiom — kapsam dışı sayıyorum, yeniden litige etmiyorum. | `frontend` | v0.0.11 |

### DRY — işaretlemediğim yüzeysel benzerlikler (bilinçli)

- `packages/themes/modern/src/templates/{home,404}.astro` — gövdeleri **bayt bayt aynı** (`PageSection`+`PageHeading`+`BodyText`). **Tekrar olarak işaretlemiyorum:** `home` (hero, ürün ızgarası) ile `404` (geri dönüş bağlantısı) **farklı sebeplerle** değişecek; bugün birleştirmek yarın ayırmayı pahalılaştırır.
- `theme-css.ts:71` `COLOR_VALUE_PATTERN` ↔ `primitives.ts:61` `THEME_COLOR_HEX_PATTERN` — aynı regex. **Tekrar değil:** `theme-sdk`'nın barrel'ı (`index.ts`) o deseni **export etmiyor**, devralma yapısal olarak imkânsız; üstelik üreteç kendi izin listesine sahip olmayı bilinçli seçmiş (`theme-css.ts:56-62`, `theme-css.test.ts:89-96` SDK'da geçerli ama üreteçte geçersiz bir `key` ile bunu **ölçüyor**).
- `apps/storefront/src/lib/assert-never.ts` — `apps/admin`/`apps/api`/`theme-sdk`'daki kardeşlerinin beşinci kopyası. **Tekrar olarak işaretlemiyorum:** CLAUDE.md §3 bağımlılık yönü `apps/*` → `apps/*` ithalini yasaklıyor; tek doğru çözüm ortak bir pakete terfi, o da bu görevin kapsamı değil (dosya `:5-9`'da zaten yazılı).

---

## 5. Ölçemediklerim (§5)

- **`git diff` koşturamadım** (`Bash` aracım yok) → **yedi mekanik pinin diff'lerinin boş olduğunu DOĞRULAYAMADIM** (`BaseLayout.astro`, `cache-policy.ts`, `pages/{404,503}.astro`, `e2e/storefront-host.spec.ts`, `storefront.router.ts`, `theme-sdk/migrations/chain.ts`, `.changeset/config.json`). İçeriklerinde T-012 atfı aramakla yetindim; `index.astro:17,47` ve `storefront-theme.spec.ts:31-33` dokunulmadığını **beyan** ediyor — beyanı doğrulayamadım. **`qa` bu pini ölçmeli.**
- `pnpm test`/`build`/`lint`/`typecheck`/e2e **koşturmadım** (talimat gereği). Handoff'un sayılarını (1008 test, 21/21, 13/13, 14/14) olduğu gibi aktarıyorum.
- `expect-type`'ın `NegativeExpectTypeOf.toHaveProperty` mutasyon duyarlılığını (Pin 3, madde 3) **bağımsız doğrulamadım** — S4'ün kanıtına güveniyorum.
- `apps/storefront/src/lib/__tests__/{api-client,storefront-tenant-context,assert-never}.test.ts` ve `theme-sdk/__tests__/{contract-schema,migration-chain}.test.ts`, `scripts/sync-platform-version.ts`, `docs/theme-contract.schema.json` **tam okunmadı** — token bütçesi öncelikli hatlara ve dört karara ayrıldı. Bu dosyalarda bulgu **aramadım**; "bulgu yok" demiyorum.

---

## ÖLÇÜMLER

```
İncelenen dosya                     : 38 (24 tam, 14 kısmi)
`any`                               : 0
`@ts-ignore` / `@ts-expect-error`    : 0
`catch {}` (boş blok)               : 0
`null`'a çevrilip yutulan hata       : 0
`as` tip zorlaması (üretim kodu)     : 1 — middleware.ts:264 (M2)
`as` tip zorlaması (test kodu)       : 1 — registry.test.ts:41 (L13)
                                       + 4 × `as unknown as` mock (T-009 idiomu, kapsam dışı)
`as const` / `as const satisfies`    : 4 (meşru, tip zorlaması değil)
En büyük fonksiyon                   : middleware.ts:133-279 `onRequest` — 147 satır (L6)
İkinci                               : theme-css.ts:137-189 `declarationsOf` — 53 satır (37'si gerekçe yorumu)
Exhaustive switch + assertNever      : 3 (theme-css.ts:186, middleware.ts:219, storefront-tenant-context.ts:61)
                                       — üçü de derleyici zorlamalı, doğrulandı
Dışa açık fonksiyonda eksik dönüş tipi: 0 (yalnızca yerel `resolveTemplateComponent` çıkarsanmış)
Döngüsel bağımlılık                  : 0
Katman ihlali (apps ← packages)      : 0
`packages/ui` değişikliği            : 0
Bulgu                                : 4 medium · 13 low · 0 high · 0 critical
```
