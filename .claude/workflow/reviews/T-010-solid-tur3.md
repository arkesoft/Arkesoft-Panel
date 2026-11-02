# T-010 · solid · GATE TUR 3 (KAPSAM: DAR · SON TUR)

Tarih: 2026-11-02 · Sürüm: v0.0.9 (`@arkesoft/theme-sdk` 0.0.1 → 0.1.0, minor)
Kapsam: tur 2'nin iki `medium`'unun kapanışı + kök sağlamlaştırmanın (F1/F2/F3)
yapısal sonuçları. **Yeni tarama yapılmadı.**

```
GATE: solid
SONUÇ: PASS
```

⚠ **`Bash` aracı bu ajana verilmedi → komut çalıştırılmadı.** `lint`/`typecheck`/
`test`/`build`/`format` sayıları Orkestratörün ölçtüğü değerlerdir. Bu raporun kendi
bulguları statik okuma + `Grep` ile üretildi.

---

## BULGULAR

### medium (1)

- **[SEV: medium]** `packages/theme-sdk/src/settings/__tests__/schema-from-definitions.test.ts:60-71`
  — **F1'in migration yolu için yazılan altı test AYIRT ETMİYOR; M1'in kapanış
  kanıtındaki hata kodu/`path` isabeti HİÇBİR YERDE pinli değil.** Describe adı
  *"altı girdi {ok:false} döner (ÖNCEDEN ön kontrol HİÇ YOKTU)"* diyor, ama tek
  assertion `expect(result.ok).toBe(false)` ve fixture `[{ key, type:'toggle', label:'x',
  default:true }]` + girdi `{}`. `schemaFromDefinitions` içindeki ön kontrol
  (`schema-from-definitions.ts:143`) **kaldırılsa bile** şema `z.object({ [key]:
  z.boolean() })` olur, `safeParse({})` zorunlu alan eksik olduğu için **başarısız**
  olur ve `run.ts:316` yine `ok:false` döner → **altı test yeşil kalır.** (Handoff'un
  ölçtüğü "mutasyon → 20 test, dört dosya kırmızı" sayısı bununla **tutarlı**: bu
  dosyanın 22 testinden 6'sı mutasyona **duyarsız**.) Blok F2'yi (fırlatmanın
  Result'a çevrilmesi) **pinliyor** — `try` geri alınsa test istisnayla kırılır — ama
  F1'i pinlemiyor ve Orkestratörün kapanış kanıtı olarak gösterdiği
  `{"code":"THEME_SETTING_KEY_UNSAFE","path":"[0].key"}` **hiçbir testte**
  doğrulanmıyor. `run.ts:296-306` `ThemeContractError` olmayan bir fırlatmayı genel-geçer
  `THEME_MIGRATION_RESULT_INVALID`'e indirger; bu dal yanlışlıkla her zaman alınsa
  (ör. `instanceof` koşulu bozulsa) **hiçbir test fark etmez**. Kardeş yolda aynı
  isabet **pinli** (`validate-settings.test.ts:212`), migration yolunda değil.
  `high` değil: davranış koddan **doğru** (`run.ts:297-298` `issues`'u birebir taşıyor)
  ve blok F2/M1'i gerçekten ayırt ediyor — kusur testin **kapsamında**, üründe değil
  (AGENT_BASELINE §4: "eksik test" → medium).
  — **Düzeltme:** (a) en az bir vakayı **ayırt edici** fixture'a çevir: `key:'<script>'`
  + girdi `{ '<script>': true }` → ön kontrol olmasa `ok:true` olurdu; (b) `result.ok`
  yanında `result.issues[0]?.code` (`THEME_SETTING_KEY_UNSAFE`) **ve**
  `result.issues[0]?.path` (`[0].key`) assertion'ı ekle; (c) describe adını ölçtüğü
  şeye göre düzelt (F2 + F1). — **qa**

### low (düzeltme turu AÇMAZ — borç satırı metinleri)

| #  | SEV | dosya:satır | Açıklama | Sorumlu | Vade |
| -- | --- | ----------- | -------- | ------- | ---- |
| L6 | low | `packages/theme-sdk/src/settings/defaults.ts:63` | **Tek nokta bir ŞEMA FABRİKASININ içine kondu; doğrulama artık yan etki olarak tüketiliyor.** `deriveDefaultSettings` `schemaFromDefinitions(definitions)` çağırıp dönüşü **atıyor** (`:52-54` bunu açıkça yazıyor: "dönen şema KULLANILMAZ, YALNIZCA doğrulama YAN ETKİSİ için"). Sonuç: (a) doğrulama isteyen çağıran tam bir Zod şema ağacı kurmak **zorunda**; (b) `group` için ön kontrol iki kez koşar (`defaults.ts:30` özyinelemesi + `schemaFromDefinitions`'ın kendi özyinelemesi); (c) `deriveDefaultSettings`'in başarısızlık yüzeyi "anahtar kabul edilebilirliği"nden "şema kurulumunda olabilecek her şey"e **genişledi**. Çözüm iki satır: `assertDefinitionsAreAcceptable`'ı (`schema-from-definitions.ts:116`) modülden dışa aç, `defaults.ts` ve `validate-settings.ts` **onu** çağırsın; `schemaFromDefinitions` da onu çağırmaya devam etsin (tek nokta korunur, yan etkiye binmek biter). | backend | v0.0.10 |
| L7 | low | `packages/theme-sdk/src/settings/duplicate-key-issues.ts:6-22` | **Tur 2'nin L1'i KAPANMADI ve KÖTÜLEŞTİ.** Başlık hâlâ *"İKİ tüketicisi var"* diyor ve ikisini **adıyla** sayıyor: `./validate-settings.ts` (F1 bu import'u **sildi**) ve `../manifest/validate-manifest.ts` (çağrı tur 1/3'te **silinmişti**) → bugün **iki adın hiçbiri** tüketici değil; gerçek tek tüketici `schema-from-definitions.ts:22`. Üstelik `:16-22` yedi satır boyunca `validateThemeManifest` yolundan gelebilecek çift raporlamanın neden gerileme olmadığını savunuyor — o yol bu dosyayı **hiç çağırmıyor**. M1'in asıl kusuruyla (yorumun gerçeği söylememesi) aynı sınıf, bu sürümde dördüncü örnek. Başlığı tek tüketiciye göre yeniden yaz, `:16-22`'yi sil. | backend | v0.0.10 |
| L8 | low | `packages/theme-sdk/src/migrations/run.ts:213-323` | `migrateThemeSettings` tur 2'de **87**, bugün **111 satır** (+28%, F2'nin `try` bloğu) ve **dört** başarısızlık dalı taşıyor. Fonksiyon dört fazı bir arada tutuyor: klonla → zinciri yürüt → hedef şemayı kur → parse et. Her faz kendi `try`/`buildRunFailure` çiftini taşıdığı için gövde doğrusal olarak büyüyor. Tur 1'in low #11'iyle (`chain.ts` 159 satır) aynı sınıf; fazları saf yardımcılara ayır (`cloneSettings`, `runChain`, `buildTargetSchema`) — her biri `ThemeContractFailure \| {ok:true}` döndürsün. | backend | v0.0.10 |
| L9 | low | `packages/theme-sdk/src/migrations/run.ts:296-306` ↔ `src/settings/validate-settings.ts:145-151` | **İki kardeş, aynı durum, ZIT politika — ikisi de yazılı değil.** `ThemeContractError` OLMAYAN bir fırlatmada `validateThemeSettings` **yeniden fırlatır** (`:151`, gerekçesi `:148-150`'de yazılı), `migrateThemeSettings` ise genel-geçer `THEME_MIGRATION_RESULT_INVALID`'e **çevirir** (bir programlama hatasını bir domain başarısızlığına indirger). Ayrım `run.ts`'in "hiçbir yolda fırlatma" sözleşmesiyle **savunulabilir** ama hiçbir dosyada bu karşılaştırma olarak yazılmamış; dal bugün `schemaFromDefinitions` yalnızca `ThemeContractError` fırlattığı için **ulaşılamaz** ve testsiz. (Tur 2'nin B4'ünde silinen ulaşılamaz daldan FARKLI: burada `catch`'in `unknown`'ını daraltmak tip seviyesinde **zorunlu**, dal kaldırılamaz.) İki satır yorum + bir test. | backend | v0.0.10 |

---

## A — TUR 2'NİN İKİ `medium`'UNUN KAPANIŞI

| # | Kapandı mı | Ayırt edici testle pinli mi | Yorum/test adı GERÇEĞİ söylüyor mu |
| - | --- | --- | --- |
| **M1** `run.ts:221` `try` dışında | **EVET.** Çağrı `run.ts:292-307`'de `try` içinde; `catch` `ThemeContractError`'ın **kendi** `issues`'unu (doğru `code`/`path`) taşıyor, genel-geçere indirgemiyor; `buildRunFailure` ile `cause` da taşınıyor. Fonksiyonun artık **hiçbir** satırı sözleşme dışına fırlatmıyor (klon `:230`, `migrate()` `:259`, şema kurulumu `:293`, parse `:311` — dördü de dallı). | **KISMEN.** F2 (fırlatma → Result) pinli: `schema-from-definitions.test.ts:60-71` `try` geri alınsa istisnayla kırılır. **AMA** aynı blok F1'i ayırt etmiyor ve `code`/`path` isabeti pinsiz → **medium (tek bulgu)**. | **EVET — M1'in asıl kusuru buydu, kapandı.** Dosya başı `:86-102` eski iddiayı ("çağıran HİÇBİR ZAMAN istisna ALMAZ") **yanlış olduğunu söyleyerek** düzeltiyor, ölçülebilir yolu (`migrateThemeSettings([], '1.0.0', [{key:'constructor',…}], {})`) birebir yazıyor ve yeni durumu doğru anlatıyor. `:289-291`'deki satır-içi not da kodla örtüşüyor. |
| **M2** yarım güçte ön kontrol | **EVET.** `keys.ts:117-122` **tek** `isAcceptableSettingKey` (kara liste **+** `SETTING_KEY_FORMAT_PATTERN` **+** `MAX_SETTING_KEY_LENGTH`); `unsafe-key-scan.ts:37,52` onu kullanıyor; `SETTING_KEY_SCHEMA` (`keys.ts:141-150`) da ona **yönlendirildi**, kendi kopyasını taşımıyor. Kuralın tek kopyası, tek gücü. | **EVET, iki yolda ayrı ayrı.** `keys.test.ts:13-24` manifest yolunda yedi girdiyi reddediyor; **yeni** `schema-from-definitions.test.ts:35-58` **aynı altı girdiyi** (`''`/`' '`/`'../x'`/`'a\nb'`/`'<script>'`/5000) `schemaFromDefinitions` **ve** `deriveDefaultSettings` üzerinden `toThrow(ThemeContractError)` ile pinliyor — fırlatan iki yol için **ayırt edici** (ön kontrol kalkarsa fırlatma biter → kırmızı). ⚠ Üçüncü yol (`migrateThemeSettings`) ayırt etmiyor → medium. | **EVET.** `unsafe-key-scan.ts:17-24` eski yarım gücü ve yeni tek kaynağı doğru anlatıyor; `keys.ts:99-115` iki tüketiciyi ve "ÖNCEDEN iki farklı güçteki kopya" sapmasını ölçümle yazıyor. ⚠ **İSTİSNA:** `duplicate-key-issues.ts:6-22` başlığı **artık iki yanlış tüketici** sayıyor → **L7**. |

**İkisi de kapandı.** M2 örnek bir kök çözüm; M1'in kapanışı kodda tam, **test kapsamında eksik**.

---

## B — KÖK SAĞLAMLAŞTIRMANIN YAPISAL SONUÇLARI (altı soru)

**1 · Çizgi hâlâ MİMARİ mi, tesadüfi mi → MİMARİ (bulgu değil).** F1 çizgiyi
**oynatmadı**: tur 1'de de `deriveDefaultSettings` ve `schemaFromDefinitions`
**fırlatıyordu**, `validateThemeSettings` Result döndürüyordu. Değişen tek şey
kontrolün **nerede yaşadığı**. Ölçüt (A2: "tüketici sınıfı") her dört dosyada
**ayrı ayrı yazılı ve bugün de geçerli**: `defaults.ts:42-48` (bir **DEĞER**
döner → `{ok:false}` imzayı kırar, barrel'daki export için **major** olurdu),
`schema-from-definitions.ts:133-138` (bir **ŞEMA** döner), `validate-settings.ts:126-135`
(**zaten** Result taşıyor → `try/catch` ile çevirir), `run.ts:86-102` (zaten Result).
"Miras aldığı yolun sonucu" itirazı reddedilir: `deriveDefaultSettings` F1'den **önce
de** fırlatıyordu, aynı gerekçeyle. ⚠ Tesadüfi olan şey **mekanizma**: tek nokta bir
şema fabrikasının içinde durduğu için doğrulama "şema kur ve at" yan etkisiyle
tüketiliyor → **L6**.

**2 · Kod/`path` isabeti KORUNDU (kodda), YARI PİNLİ.** İki yakalayıcı da
`ThemeContractError`'ın `issues`'unu **birebir** geçiriyor —
`validate-settings.ts:146` (`return { ok:false, issues: schemaConstructionError.issues }`)
ve `run.ts:297-298` — genel-geçer koda **düşmüyor**. `validateThemeSettings` için
isabet **pinli** (`validate-settings.test.ts:212` → `THEME_SETTING_KEY_UNSAFE`);
`migrateThemeSettings` için **pinsiz**, `path` (`[0].key`) **hiçbir** testte
assertion değil → **medium**.

**3 · Ölü kod DOĞMADI (bulgu değil), ama iki başlık bayatladı.** Tüketici sayımı:
`duplicate-key-check.ts` → **2** (`primitives.ts:41,194,247` + `duplicate-key-issues.ts:30`);
`duplicate-key-issues.ts` → **1** (`schema-from-definitions.ts:22`);
`unsafe-key-scan.ts` → **1** (`schema-from-definitions.ts:24`). Üçü de **canlı**;
tek tüketiciye düşmek ölü kod değil ve dosyaları birleştirmek `primitives.ts` ↔
tarayıcı **dosya seviyesinde döngüsünü** geri getirirdi (tur 2 B5'in ölçümü).
⚠ `duplicate-key-issues.ts:6-22` artık **var olmayan** iki tüketiciyi anlatıyor → **L7**.
`unsafe-key-scan.ts:7-13` "üç giriş noktası" ifadesi **dolaylı olarak doğru**
(üçü de `schemaFromDefinitions` üzerinden geçiyor) ve `keys.ts:104-108` yeni
yönlendirmeyi açıkça yazıyor → bulgu değil.

**4 · En büyük fonksiyon → DEĞİŞMEDİ: 159 satır** (`migrations/chain.ts:91-249`,
`validateMigrationChain`; dosya ve fonksiyon sınırları birebir aynı). İkinci büyük
**büyüdü**: `run.ts:213-323` `migrateThemeSettings` 87 → **111** satır → **L8**.

**5 · `defaults.ts:56` BAYAT DEĞİL (bulgu değil).** Tam metin (`:55-58`):
*"**ÖNCEKİ hâl** (yalnızca `findUnsafeSettingKeyIssues`) yinelenen `key`'i KONTROL
**ETMİYORDU**"* — geçmiş zaman, öznesi açıkça **eski** hâl; hemen üstündeki `:50-54`
bugünkü durumu doğru anlatıyor ("ARTIK kendi ön kontrol KOPYASINI taşımaz …
TEK, TAM ön kontrolden geçer"). `validate-manifest.ts:37`'nin *"bu dosyanın ESKİ
hâli"* notuyla **aynı sınıf**: meşru tarihsel not. `keys.ts:104`'ün iki parçalı
mekanizma anlatısı da **doğrulandı**: (1) `SETTING_KEY_SCHEMA` → `keys.ts:141-150`,
(2) `findUnsafeSettingKeyIssues` → `unsafe-key-scan.ts:37,52`; üç giriş noktasının
üçü de `schemaFromDefinitions`'a devrediyor (`validate-settings.ts:143`,
`defaults.ts:63`, `run.ts:294`) — yorumun saydığı yollar kodla birebir örtüşüyor.

**6 · Fixture düzeltmesi DOĞRU ÇÖZÜM (bulgu değil), kural fazla katı DEĞİL.**
`source: 'theme-asset'`, `THEME_ASSET_REF_SCHEMA`'nın (`manifest/asset-ref.ts`,
`strictObject`) **S5'ten beri var olan zorunlu** alanıdır ve F1/F2 ile **ilgisizdir**;
gerileme testinin fixture'ı eksikti, yani kırmızı **testin kendi hatasıydı**. Kuralı
gevşetmek (`source`'u opsiyonel yapmak) `image` ayar değerinin sözleşmesini
**genişletir** — varlık çözümlemesinin kaynağı belirsizleşir ve `path` izin listesinin
(B5) dayandığı "hangi kök" varsayımı kaybolur; ayrıca yayınlanan JSON Schema'yı
değiştirir (`docs/theme-contract.schema.json`) → **gereksiz kırıcı genişleme**.
Gerekçe `schema-from-definitions.test.ts:93-99`'da yazılı ve **doğru** (eksik zorunlu
alan `THEME_ASSET_REF_INVALID` değil, şema hatası üretir). Testi gevşetmeme kararı
CLAUDE.md §10/6 ile de tutarlı.

---

## C — YAPISAL DEĞİŞMEZLER: yalnızca DEĞİŞEN dosyalarda delta kontrolü

| Değişmez | Tur 2 | Tur 3 (değişen dosyalar) | Sonuç |
| --- | --- | --- | --- |
| `any` (tip) | 0 | **0** — `json-schema.ts:284` hâlâ Zod **seçenek değeri** (`unrepresentable:'any'`), kalanı yorum | ✅ |
| `@ts-ignore` / `@ts-expect-error` | 0 | **0** | ✅ |
| üretim `as` | 2 | **2 — ARTMADI** (`templates.ts:86`, `validate-settings.ts:95`; ikisi de runtime doğrulaması sonrası, tur 1/2'de meşru bulundu). Yeni/değişen dosyalarda (`keys.ts`, `unsafe-key-scan.ts`, `schema-from-definitions.ts`, `defaults.ts`, `run.ts`) **0 yeni `as`**; `run.ts:158-162` `as` KULLANMAMA kararını açıkça gerekçelendiriyor | ✅ |
| `eslint-disable` | 0 | **2 YENİ — yalnızca test, gerekçeli:** `__tests__/migration-run.test.ts:232,277` `@typescript-eslint/only-throw-error`, ikisi de Türkçe gerekçe taşıyor (F3'ün "Error OLMAYAN fırlatma" exploit girdisi — kuralı susturmadan bu senaryo yazılamaz). CLAUDE.md §2'nin istediği biçim (`disable-next-line` + gerekçe) karşılanıyor, üretim kodunda **0** | ✅ (bulgu değil) |
| katman ihlali · `console.*` · `dependencies` | 0 · 0 · `{zod}` | **değişen dosyalarda yeni ihlal 0** — `@arkesoft/*` ithali yok, `node:*` yok; `json-schema.ts:199` `console.log` **yorum içinde** | ✅ |
| en büyük fonksiyon | 159 | **159** (`chain.ts:91-249`) · 2.: `run.ts:213-323` **111** (87'den) | ⚠ L8 |

---

## D — AÇIK `low` KÜMESİ (docs için birebir liste, satır kaymaları güncel)

**Tur 2'nin beşi:**

| tur 2 # | dosya:satır (güncel) | Durum |
| --- | --- | --- |
| L1 | `src/settings/duplicate-key-issues.ts:6-22` | **AÇIK ve KÖTÜLEŞTİ** → metin **L7** olarak yeniden yazıldı (iki tüketici adının **ikisi de** artık yanlış) |
| L2 | `src/json-schema.ts:213` (eski :168-173) · `pathEquals` :177 | **AÇIK** — `isTemplateTypeOverridePath` hâlâ ayrı duruyor, `pathEquals`'a katlanmadı |
| L3 | `src/settings/__tests__/keys.test.ts:42-57` | **KAPANDI** (F5, "yolu üstünde") — `it.each` **dokuz** adı koşturuyor, describe adı *"dokuz adlı kara liste"*, `:36-41`'deki not eski ölçümü ("beş ad silinse 183/183 yeşil kalırdı") doğru anlatıyor |
| L4 | `src/migrations/run.ts:164-185` + `:213-218` | **DARALDI, AÇIK** — ⚠ **teyit: üçüncü dal artık `cause` taşıyor** (`run.ts:316-319`, F3 ile `buildRunFailure`'dan geçiyor) → 3 yoldan **3'ü**; `:312-315`'teki not bunu "yolu üstündeyken" diye doğru kaydediyor. **Kalan** kısım: `migrateThemeSettings`'in beyan edilen dönüş tipi (`:218`) hâlâ `ThemeContractResult<ThemeSettingsValue>` → `cause` **tip yüzeyinde görünmez** (architect kararı, `run.ts:78-80`) |
| L5 | `src/index.ts:26-43` | **AÇIK ve BÜYÜDÜ** — dışlama listesine dört modül + beş sabit eklenmedi; artık **`isAcceptableSettingKey`** de listede yok (`:35` yalnızca `isUnsafeSettingKey`/`SETTING_KEY_SCHEMA` sayıyor) |

**Tur 1'in 12'si: 12'si de AÇIK** (satırlar doğrulandı): #1 `src/errors.ts:78-82`
(+ `run.ts:322`, `chain.ts:248` sabit `[]`) · #2 `src/messages.ts:62` · #3
`src/manifest/manifest.ts:127` · #4 `src/__tests__/purity.test.ts:17,108` · #5
`README.md:43-58` · #6 `src/__tests__/define-theme.test.ts:19-29` · #7
`src/manifest/__tests__/no-service-url-fields.test.ts:52,55-64` · #8
`src/settings/zod-issue-mapping.ts` ↔ `src/manifest/asset-ref.ts` (dizin
karşılıklılığı) · #9 `src/migrations/chain.ts:228` (`themeMajor > 1`) · #10
`scripts/generate-contract-schema.ts:98-101,122-123` · #11
`src/migrations/chain.ts:91-249` (159 satır) · #12 `src/manifest/templates.ts:160`
(ölü export `ThemeTemplates`).

**`docs`'un kaydetmesi gereken küme:** tur 1'in **12**'si + tur 2'den **4** (L1→L7
metniyle, L2, L4 daraltılmış metinle, L5) + bu turun **3** yenisi (L6, L8, L9)
= **19 açık `low`** + **1 açık `medium`** (yukarıdaki test bulgusu). Kapanan: tur 2
L3 (tam) ve L4'ün üçüncü-dal yarısı.

---

## ÖLÇÜMLER

İncelenen dosya **11** (`settings/keys.ts`, `settings/unsafe-key-scan.ts`,
`settings/schema-from-definitions.ts`, `settings/defaults.ts`,
`settings/validate-settings.ts`, `settings/duplicate-key-issues.ts`,
`migrations/run.ts`, `index.ts` tam; `settings/__tests__/schema-from-definitions.test.ts`,
`settings/__tests__/keys.test.ts` tam; `settings/__tests__/validate-settings.test.ts`
hedefli) + paket çapında 4 `Grep` · **`any` 0** · `@ts-ignore` **0** · üretim `as`
**2 (artmadı)** · `eslint-disable` **2 (yalnızca test, gerekçeli)** · en büyük
fonksiyon **159 satır** (`migrations/chain.ts:91-249`, **değişmedi**) · 2. büyük
**111** (`migrations/run.ts:213-323`, 87'den) · yeni katman ihlali **0** · yeni
döngü **0** · ölü kod **0 yeni** · bulgu **1 medium + 4 low** (tur 2: 2 medium +
5 low) · ⚠ **komut çalıştırılmadı** (`Bash` aracı yok)

**PASS gerekçesi (AGENT_BASELINE §4, bağlayıcı):** `critical` 0, `high` 0,
`medium` **1** (≤2) → **PASS**. Tur 2'nin iki `medium`'u **kapandı**; M2 örnek bir
kök çözüm (kural artık tek kaynak, tek güç), M1 kodda tam kapandı ve **dosya başı
yorumu artık gerçeği söylüyor**. Tek `medium` üründe değil **test kapsamında**:
F1'in migration yolu ayırt edici fixture'la pinlenmemiş. `low`'lar için düzeltme
turu açılmaz; borç satırları yukarıda hazır.
