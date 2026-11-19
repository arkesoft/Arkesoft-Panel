# T-026 — `solid` gate, tur 1

- **Tarih:** 2026-11-19
- **Sürüm:** ROADMAP v0.0.22
- **Kapsam:** `packages/trpc/src/contract/**` (3 yeni dosya) · `packages/trpc/scripts/**` (2 yeni dosya) · `packages/trpc/src/__tests__/{contract-surface,classify-contract-change}.test.ts` · `packages/trpc/{package.json,tsconfig.json}` · `turbo.json` · `scripts/guards.sh` (yeni adım) · `docs/api-versioning.md` · `docs/api-contract-surface.json`
- **Araç kısıtı:** `Bash` yok — hiçbir komut koşturulmadı. Tüm ölçümler `Read`/`Grep` ile statik.

```
GATE: solid
SONUÇ: FAIL
```

---

## Sekiz maddenin sonucu

| # | Madde | Sonuç | Ölçüm |
| - | ----- | ----- | ----- |
| 1 | Sınıflandırıcının saflığı | **PASS** | `src/contract/**` içinde `node:` ithalatı **0**, `process.` erişimi **0**, `require(` **0**, `prettier` ithalatı **0**. Üç dosyanın TÜM ithalatları: `zod` + `../routers/app.router.js` (yalnızca `build-contract-surface.ts`), `import type` + `./canonicalize.js` (`classify-contract-change.ts`), **sıfır** (`canonicalize.ts`). TEK I/O noktası doğrulandı: `node:fs`/`node:module`/`node:url` + `writeFileSync` + `process.std*` yalnızca `scripts/generate-contract-surface.ts`'te. |
| 2 | `index.ts` kapanış ihlali yokluğu | **PASS** | `src/index.ts`'te `contract` jetonu **0 eşleşme**; `src/server.ts`'te de **0**. Üç dosyanın da başında yasak notu yazılı (`build-contract-surface.ts:5-16`, `canonicalize.ts:4-10`, `classify-contract-change.ts:11-23`), emsale (`authz/procedure-surface.ts:28-30`) atıfla. Mekanik kapı kısmen kapsıyor — bkz. **L4**. |
| 3 | Serileştiricinin tek kopya olması | **PASS** | `prettier` ithalatı tüm pakette **1 yer**: `scripts/serialize-contract-surface.ts:45`. `serializeContractSurface` **2 tüketici**: `scripts/generate-contract-surface.ts:236` (dinamik `.ts` ithalatı) ve `src/__tests__/contract-surface.test.ts:38` (statik). İkisi de **aynı** fonksiyonu çağırıyor; ikinci biçimlendirme mantığı **yok**. `theme-sdk` V7 / `R-A5` sapması tekrarlanmamış. |
| 4 | `as` / `any` / `@ts-ignore` | **PASS** | `src/contract/**` + `scripts/**`: `: any`/`as any`/`any[]`/`<any` → **0**; `@ts-ignore`/`@ts-expect-error` → **0**; `eslint-disable` → **0**; boş `catch {}` → **0**; çıplak `object`/`Function` tipi → **0**. `S2`'nin "`as` → 0" ölçümü **bağımsız olarak teyit edildi**. `scripts/`'in dinamik `import(degisken)` daraltması **`as` içermiyor** — üç tip koruyucu da gerçek runtime guard (`typeof value !== 'object'` + anahtar varlığı + `typeof … === 'function'`): `generate-contract-surface.ts:117-127, 156-166, 198-208`. Ayrıca `readInstalledPackageVersion` dış JSON'u **Zod** ile parse ediyor (`:81, :102-109`). ⚠ İstisna test tarafında — bkz. **F4**. |
| 5 | Exhaustive `switch` + `assertNever` | **PASS** | **5** exhaustive switch, hepsi `default: assertNever` taşıyor: `reasonForIo` (`:349-357`), `buildDiff` (`:382-503`, 17 `reason` kodunun tamamı), `diffProcedureIo`'nun `constraintChange`'i (`:579-604`), `classificationRank` (`:615-624`), `scopeLabel` (`:712-722`). `reason` kodu sayısı `docs/api-versioning.md:184`'ün "17 kod" beyanıyla ve `FieldChangeReason`(14) + `ProcedureChangeReason`(3) birleşimiyle **tutarlı**. **Yerel kopya kararı DOĞRU** — gerekçe aşağıda. |
| 6 | 758 satır bölünmeli mi | **BÖLÜNMEMELİ** | Gerekçe aşağıda. En büyük fonksiyon `buildDiff` **124 satır** (`:381-504`) ama tamamı tek bir `switch`'in veri dalları — dallanma derinliği 1, döngü yok, koşul yok. |
| 7 | `S2`'nin üç kör noktası | **KISMEN KABUL EDİLEMEZ** | (7.1) Aşırı-sıkılık iddiası **tam değil** → **F3** (medium). (7.2) VAR/YOK geçişi fail-OPEN → **F2** (high). (7.3) `GENERATOR_DRIFT` severity'ye katılmaması → **kabul edilebilir**, bulgu yazmadım (gerekçe aşağıda). **EK:** aynı sınıftan, `S2`'nin de kör noktası olarak **saymadığı** dördüncü bir delik ölçüldü → **F1** (high). |
| 8 | Sıralı eksen deneme deseni başka yerde gölgeleme riski taşıyor mu | **EVET** | İki yerde: (a) eksenler arası yön çatışması → **F3**; (b) kök düğümün **hiç** kıyaslanmaması → **F1**. İkisi de aynı kök nedenden: "ilk konuşan ekseni dön" deseni, **artık farkı** (residual) hiç sormuyor. |

---

## BULGULAR

### F1 — [SEV: high] `packages/trpc/src/contract/classify-contract-change.ts:511-535` — kök şema düğümü **hiç** kıyaslanmıyor; dizi-köklü çıktılar sınıflandırıcıya **görünmez**

`diffProcedureIo` girdi/çıktı şemasından **yalnızca** `schema.properties` ve `schema.required` okuyor (`:525-533`). Kök düğümün kendisi hiçbir yerde `isSchemaEqual` ile karşılaştırılmıyor. Sonuç: kökü **nesne olmayan** bir şemada `properties` her iki tarafta da yok → `allFieldNames` **boş** → döngü hiç çalışmıyor → **sıfır fark, `PATCH`**.

**Bugün üretimde erişilebilir (ölçüldü):** `docs/api-contract-surface.json:445-502` — `session.list`'in çıktısı `{"type":"array","items":{… 8 alan, 8'i de required …}}`. Yani `session.list` çıktısından `id` alanının kaldırılması (`apps/admin/src/features/sessions/ActiveSessionsCard.tsx`'in okuduğu alan) sınıflandırıcıya göre **0 fark / `PATCH`**'tır. Aynı delik kök `{"type":"string"}` → `{"type":"number"}` geçişini ve kök `additionalProperties` değişimini de yutuyor.

⚠ **Not:** iç içe geçmiş (nested) nesneler bu delikte **değil** — bir alanın şema düğümü değiştiğinde `compareFieldConstraint` (`:311-335`) fail-closed `NARROWED` dönüyor. Delik **yalnızca kök** seviyesinde, çünkü köke uygulanan bir `isSchemaEqual` artık-kontrolü **yok**.

Mevcut hafifletme **yetersiz**: `AC-35`'in bayt-birebir snapshot'ı (`contract-surface.test.ts:276-283`) kırmızı yanar, ama geliştirici o noktada sınıflandırıcıya başvurur ve `"SONUÇ: PATCH — public API sözleşmesinde izlenen bir fark yok"` (`:741`) cümlesini okur. Bu, kırıcı bir değişiklikte **aktif olarak yanıltıcı** bir çıktıdır.

**Önerilen düzeltme (kendi güvenlik etkisi ölçülerek):** `diffProcedureIo`'nun sonunda bir **artık (residual) kontrolü**: iki kök düğümden alan yürüyüşünün ZATEN hesapladığı anahtarları (`properties`, `required`) **çıkararak** yeni nesneler kur, kalanı `isSchemaEqual` ile kıyasla; farklıysa fail-closed bir `*_TYPE_NARROWED` farkı (`fieldName: '(root)'`) üret.
**Önerinin kendi etkisi:** (a) yalnızca fark **EKLER**, hiçbir koşulda azaltmaz ⇒ yeni fail-open **imkansız**; (b) sıradan nesne-köklü değişimlerde artık `{$schema, additionalProperties, type}` iki tarafta **aynı** kalır ⇒ yanlış `MAJOR` üretmez (ölçüm: `docs/api-contract-surface.json`'daki 12 nesne-köklü girişin kök artığı yalnızca bu üç anahtardan oluşuyor); (c) **`in` operatörü KULLANILMAMALI** — T-023'te benim kendi önerim prototip zinciri yüzünden fail-CLOSED bir kontrolü fail-OPEN'a çevirdi; burada anahtar çıkarma `Object.keys(...).filter(...)` ile yapılmalı, girdi **mutasyona uğratılmamalı** (`canonicalize.ts`'in bozmama disiplini). Ayrıca `session.list` için bir **negatif test** (array `items` içinden alan kaldır → `MAJOR`) zorunlu; bugün böyle bir test **yok**.

**Sorumlu ajan:** `backend` (S2) · ikincil: `docs` (S4) — `docs/api-versioning.md:161-179`'daki "bilinen kör noktalar" listesi bu dördüncü kör noktayı **anmıyor**.

---

### F2 — [SEV: high] `packages/trpc/src/contract/classify-contract-change.ts:520-522` — girdi/çıktı **VAR/YOK** geçişi sessizce `[]` dönüyor (fail-OPEN)

```ts
if (beforeSchema === null || afterSchema === null) {
  return []
}
```

Tek bir taraf `null` olduğunda **hiçbir** fark üretilmiyor. Bu bir fail-OPEN'dır: girdisiz bir prosedüre **zorunlu** alanlı girdi eklemek, mevcut tüm çağıranları kırar (`session.me()` artık argüman ister) ⇒ gerçek sınıf **MAJOR**, sınıflandırıcının dediği **PATCH**.

**Bugün üretimde erişilebilir (ölçüldü):** `docs/api-contract-surface.json`'da **5** adet `"input": null` var — `platform.session:308`, `session.list:446`, `session.me:505`, `storefront.currentTenant:520`, `tenant.current:535`. Bunlardan birine sayfalama/filtre girdisi eklemek (ör. `session.list`'e `cursor`) olağan bir evrim adımıdır.

"Kural tablosunda yok, kapsam dışı" gerekçesi (`:517-519` yorumu) **tutmuyor**: `null`'ı boş şema (`{}`) gibi ele almak **yeni bir kural eklemek değil**, var olan tablo satırlarını (`REQUIRED_FIELD_ADDED` / `OPTIONAL_FIELD_ADDED` / `FIELD_REMOVED`) uygulamaktır. `docs/api-versioning.md:172-176`'daki yazılı operatör uyarısı ("gözle kontrol etmeden güvenmeyin") bir hafifletme sayılamaz — bu deponun kendi ölçülmüş dersi tam tersini söylüyor: *"Uyarı ve yazılı kural denendi, ikisi de yetmedi; yerine mekanik yerel kapı kondu"* (`CLAUDE.md` §6).

**Önerilen düzeltme (kendi güvenlik etkisi ölçülerek):** koşulu `&&`'e çevir (ikisi de `null` ise `[]`), sonra `beforeSchema ?? {}` / `afterSchema ?? {}` ile devam et.
**Önerinin kendi etkisi — dal dal ölçüldü:** (a) **ikisi de `null`** (bugünkü 5 prosedürün kendisiyle kıyaslanması, Katman 1 testi dahil): `readSchemaProperties({})` → `{}`, `allFieldNames` boş ⇒ **bugünkü davranışla birebir aynı**, yeni gürültü yok; (b) `null` → `{cursor: required}` ⇒ `INPUT_REQUIRED_FIELD_ADDED`/**MAJOR** ✓; (c) `null` → `{label: optional}` ⇒ `INPUT_OPTIONAL_FIELD_ADDED`/**MINOR** ✓ (doğru sınıf, aşırı-sıkı değil); (d) `{cursor}` → `null` ⇒ `INPUT_FIELD_REMOVED`/**MAJOR** ✓; (e) çıktı `{id}` → `null` ⇒ `OUTPUT_FIELD_REMOVED`/**MAJOR** ✓. Yalnızca fark **ekler** ⇒ yeni fail-open imkansız. ⚠ Bu düzeltme **F1'i kapatmaz**: kök nesne-olmayan ise (`null` → `z.string()`) yine 0 fark çıkar; iki düzeltme **birlikte** gerekiyor.

**Sorumlu ajan:** `backend` (S2) · ikincil: `docs` (S4) — kör nokta listesi ve §9.2 metni düzeltme sonrası güncellenmeli.

---

### F3 — [SEV: medium] `packages/trpc/src/contract/classify-contract-change.ts:326-334` + `docs/api-versioning.md:166-171` — izlenen bir eksenin **GENİŞLEDİ**'si, izlenmeyen bir kısıtın **daralmasını** gölgeliyor

`S2` doğru bir regresyonu kapattı (bir eksenin `UNCHANGED`'ı diğerini gölgelemesin). Ama desen hâlâ **"ilk konuşan ekseni dön"**: bir eksen `WIDENED` derse fonksiyon **hemen** döner ve `:331-334`'teki fail-closed artık-dalına **hiç ulaşılmaz**.

**Ölçülmüş erişilebilir vaka:** `z.string().regex(/^[A-Z]+$/)` → `z.string().min(3)`.
- `isSchemaEqual` → `false`; `compareEnumAxis` → `null` (atlanır); `compareTypeAxis` → `UNCHANGED` (ikisi de `string`, atlanır); `comparePatternAxis` → `afterPattern === null` ⇒ **`WIDENED`** (`:293`) ⇒ `:327-329` erken döner.
- Sonuç: `INPUT_TYPE_WIDENED` / **MINOR**. Oysa `minLength: 3` **eklendi** — önceden geçerli olan `"AB"` artık reddediliyor ⇒ gerçek sınıf **MAJOR**.

Bu aynı zamanda bir **doküman hatasıdır**: `docs/api-versioning.md:166-171` *"`minLength`, `format`, `multipleOf` … bu eksenlerden biri değişirse sınıflandırıcı fail-closed `NARROWED` döner"* diyor. Bu iddia yalnızca izlenen eksenlerin **hiçbiri** değişmediğinde doğru. 7.1'in cevabı bu yüzden "aşırı-sıkı ama yanlış değil" **değil**: bir köşede **az-sıkı**.

**Önerilen düzeltme (kendi güvenlik etkisi ölçülerek):** F1'in tekniğinin alan seviyesindeki ikizi — `WIDENED` döndürmeden önce iki düğümden `enum`/`type`/`pattern` anahtarlarını çıkarıp kalanı `isSchemaEqual` ile kıyasla; **artık farklıysa** fail-closed `NARROWED` dön. **Etkisi:** yalnızca `WIDENED` → `NARROWED` yönünde hareket eder (monoton sıkılaştırma), hiçbir `NARROWED`'ı `WIDENED`'a çevirmez ⇒ yeni fail-open yok. Maliyeti: `description`/`format` gibi zararsız bir anahtar bir genişlemeyle **aynı commit'te** değişirse yanlış `MAJOR` — ki bu, bugün artık-dalının (`:334`) zaten uyguladığı davranışın **tutarlı** uzantısıdır. `:413-427` ve `:471-485`'teki pattern testleri bu düzeltmeden sonra da yeşil kalır (ikisinde de artık fark yok).

**Sorumlu ajan:** `backend` (S2) · `docs` (S4) — §9.1'in iddiası düzeltilmeli.

---

### F4 — [SEV: medium] `packages/trpc/src/__tests__/contract-surface.test.ts:312-313` — `z.custom<T>(() => true)`, doğrulamasız `as`'in Zod kılığı; yorum tersini iddia ediyor

```ts
input: z.custom<ContractSurfaceProcedureEntry['input']>(() => true),
output: z.custom<ContractSurfaceProcedureEntry['output']>(() => true),
```

Doğrulayıcı bir **totoloji**: her değeri kabul ediyor. Semantik olarak `as ContractSurfaceProcedureEntry['input']` ile birebir aynı — tek farkı `as` taramasına/ESLint kuralına görünmemesi. `:308-311` yorumu ise *"Zod doğrulamasından HEMEN SONRA tip bağlama (CLAUDE.md §4) … `as` KULLANILMAZ"* diyor; **yanlış yorum**, çünkü hiçbir doğrulama yapılmıyor. `CLAUDE.md` §4: *"Parse edilmemiş veriye tip verilmez."*

Davranışsal risk **sınırlı** (ölçüldü): diskte `input: 42` olsaydı `readSchemaProperties(42)` → `{}` döner, canlı tarafta alanlar var ⇒ farklar üretilir ⇒ test **kırmızı** olur, sessiz fail-open **değil**. Bulgunun ağırlığı **emsalde**: "`as`'i `z.custom(() => true)` ile yıka, sonra yoruma `as KULLANILMAZ` yaz" deseni üretim koduna kopyalanırsa deponun kendi tip disiplini kuralını içten boşaltır.

**Önerilen düzeltme:** doğrulayıcıyı gerçek bir daraltmaya çevir — `(value) => value === null || (typeof value === 'object' && !Array.isArray(value))` — ve yorumu gerçeğe uydur. **Etkisi:** yalnızca doğrulamayı sıkılaştırır, yeni fail-open yok.

**Sorumlu ajan:** `backend` (S1/S2 — blok S2 tarafından eklendi, `:39-47`).

---

## BULGULAR — `low` (⚠ tur AÇMAZ; ROADMAP teknik borç tablosuna, borç satırı metni hazır)

- **[SEV: low]** `packages/trpc/src/contract/classify-contract-change.ts:158-164` — `isUnknownArray`/`isJsonRecord`, `canonicalize.ts:36-43`'ün **birebir** kopyası (3. `isUnknownArray` kopyası: `build-contract-surface.ts:142-144`). Diğer kopyalar için yazılı bir gerekçe var (bağımlılık yönü, test↔üretim ayrımı) ama **bu çift için yok**: `classify-contract-change.ts` `canonicalize.ts`'i **zaten çalışma zamanında ithal ediyor** (`:61`), yani paylaşmanın maliyeti sıfır. Davranışsal risk sıfır (gövdeler `Array.isArray`/`typeof` üzerine totolojik sarmalayıcı, anlamlı şekilde sapamaz) ⇒ `low`. **Öneri:** `src/contract/json-guards.ts`. **Sorumlu:** `backend`. **Vade:** v0.0.23.
- **[SEV: low]** `packages/trpc/src/contract/classify-contract-change.ts:149-151` — `assertNever` **modül değil, satır içi**. Yerel kopya kararı **doğru** (gerekçe aşağıda), ama depodaki 5 emsalin tamamı ayrı dosya (`packages/theme-sdk/src/assert-never.ts`, `apps/storefront/src/lib/assert-never.ts`, `apps/{api,admin,superadmin}/src/errors/assert-never.ts`); pakette ikinci bir tüketici doğduğunda **altıncı** kopya üretilir. **Öneri:** `packages/trpc/src/assert-never.ts`'e çıkar (+ emsallerdeki gibi birim test). **Sorumlu:** `backend`. **Vade:** v0.0.23.
- **[SEV: low]** `packages/trpc/package.json:28` — `test:contract` yalnızca `contract-surface.test.ts`'i hedefliyor; sınıflandırıcının **27 testi** (`classify-contract-change.test.ts`) bu odaklı kapıya **girmiyor**. `pnpm test` glob'u (`src/**/*.test.ts`) onları koşturduğu için kapsam boşluğu **yok**, ama `pnpm test:contract` adı "sözleşme kapısı" vaat edip sınıflandırmayı dışarıda bırakıyor. **Öneri:** desene `classify-contract-change.test.ts`'i ekle. **Sorumlu:** `devops` (S3). **Vade:** v0.0.23.
- **[SEV: low]** `packages/trpc/src/contract/{canonicalize.ts:4-10, classify-contract-change.ts:11-23}` — "`index.ts`'ten export edilmez" yasağı bu iki **saf** dosya için **mekanik olarak denetlenmiyor**. Ölçüm: `browser-entry-closure.qa.test.ts:67-78`'in yasak deseni `contract/` içermiyor; `build-contract-surface.ts` **transitif olarak** yakalanıyor (`../routers/app.router.js` → `^routers/` deseni) ama `canonicalize.ts`/`classify-contract-change.ts` çalışma zamanında hiçbir sunucu modülü çekmediği için export edilseler kapı **yeşil** kalır. Bugün tarayıcı paketi riski **yok** (bu yüzden `low`); ihlal ancak biri `build-contract-surface.ts`'ten **değer** ithal ettiğinde riske döner — ve o an kapı **zaten** kırılır. **Öneri:** desene `^contract/` ekle (yalnızca `index.ts` kapanışı için; `server.ts` kontrol kümesini etkilemez). **Sorumlu:** `qa`/`devops`. **Vade:** v0.0.23.

---

## Gerekçeli kararlar (bulgu DEĞİL)

**Madde 6 — 758 satır bölünmemeli.** Dosyanın değişmek için **tek** sebebi var: architect'in kural tablosu. 17 `reason` kodu, severity eşlemesi, `scope`, açıklama metni ve `formatContractChangeReport`'un satır biçimi **aynı tablo satırlarından** türüyor; bir satır değiştiğinde beşi **birlikte** değişir. `buildDiff`'in 124 satırı dallanma **derinliği 1** olan düz bir `switch` — okunabilirlik maliyeti satır sayısıyla doğru orantılı değil, ve `switch`'in bütünlüğü `assertNever` ile derleyici tarafından **zorlanıyor**; bölmek bu zorlamayı iki dosyaya yayar ve "yeni `reason` ekledim, severity eşlemesini unuttum" sınıfını açar. T-024 emsali (`a11y.ts`, 581 satır) ile aynı muhakeme. Sunum/alan ayrımı sorusu da aynı yere çıkıyor: `formatContractChangeReport` kendi başına bir modül olsaydı `ContractChangeReason` birleşimiyle **kilit adımlı** değişmek zorunda kalırdı — "farklı sebeplerle değişecek şeyleri birleştirmek kötüdür" kuralının **tersi** de geçerli: aynı sebeple değişenleri ayırmak da kötüdür.

**Madde 5 — `assertNever` yerel kopyası doğru karar, `packages/errors`'a taşınmamalı.** (a) `packages/trpc` → `apps/api` ithalatı `CLAUDE.md` §3'ün yön kuralını tersine çevirirdi — `S2`'nin gerekçesi **doğru**. (b) `packages/errors`'a taşıma **legal** olurdu (`packages/trpc/package.json:32` zaten ona bağımlı) ama **yanlış**: `errors`'ın yazılı sorumluluğu *"`AppError` hiyerarşi tabanı, hata gövdesi tel sözleşmesi, redaction"*; genel amaçlı bir tükenmişlik yardımcısı o sözleşmeye girmez ve `errors`'ı yardımcı çöplüğüne çevirir. (c) Depo zaten bu kararı **5 kez** vermiş (yukarıdaki `low`'da listelendi) — altıncı kopya tutarlı, aykırı değil.

**Madde 7.3 — `GENERATOR_DRIFT`'in genel `severity`'ye katılmaması kabul edilebilir.** Sapma bir semver sınıfı değil; `generatorDrift` dönüş tipinde **ayrı, zorunlu** bir alan (`:138`), `readonly changed: boolean` ile tipli, formatter her zaman satır olarak basıyor (`:749-755`) ve `docs/api-versioning.md:155-159` programatik tüketiciyi açıkça uyarıyor. `severity`'ye katmak **anlamı bozardı** (araç zinciri yükseltmesi `MINOR` sürüm gerektirmez). Bugün programatik tüketici **yok** (ölçüm: `classifyContractChange` çağrısı yalnızca iki test dosyasında; CI adımı henüz yazılmamış) ⇒ ilk tüketiciyi yazan ajan `generatorDrift.changed`'i okumak zorunda olacak. Tek kozmetik pürüz: `:741`'deki `"SONUÇ: PATCH — … izlenen bir fark yok"` satırı sapma varken de aynen basılıyor, `GENERATOR_DRIFT` satırı **ardından** geliyor — yanıltıcı değil, sadece sıralama. Bulgu yazmadım.

**Madde 8 / test kalitesi — assert yönü doğru, ama kör noktalar kodla **aynı** yerde.** Olumlu ölçümler: `onlyDiff` (`classify-contract-change.test.ts:81-90`) **tam olarak 1** fark şartını zorluyor ⇒ fazladan/eksik fark sessizce geçemez; her test `reason` + `severity` + `scope` + `fieldName`'i **birlikte** pinliyor ve ayrıca `classification.severity`'yi `toBe` ile tam eşitlikle doğruluyor; sentetik şemalar el yazması JSON değil, **üretim yolunun** (`z.toJSONSchema(..., { io, unrepresentable: 'throw' })`) çıktısı (`:37-53`) ⇒ `io` duyarlılığı sentetikte de gerçek; bağlantı testi (`:601-630`) gerçek router şekliyle çalıştığını, karşıt-kanıt testi (`:632-639`) süitin vacuous olmadığını kanıtlıyor. **T-023 tuzağı (kapatılan hatayı pinleme) kontrol edildi:** pattern testleri (`:413-427`, `:471-485`) `S2`'nin kendi bulduğu gölgeleme hatasının **doğru** sonucunu pinliyor (pattern eklendi → girdide MAJOR; pattern kaldırıldı → girdide MINOR) ⇒ yanlış davranış pinlenmemiş. **Olumsuz:** `null`↔şema geçişi (F2) ve dizi-köklü şema (F1) için **tek bir negatif test yok** — süitin kör noktası kodun kör noktasıyla **birebir örtüşüyor**, bu yüzden iki delik 27 testin arasından geçti. Eksik negatif testleri ayrı bir `medium` olarak yazmadım; F1/F2'nin düzeltme şartı olarak **zorunlu** kıldım.

---

## ÖLÇÜMLER

- **İncelenen dosya:** 13 — tam okunan 7 (`contract/{build-contract-surface,canonicalize,classify-contract-change}.ts`, `scripts/{serialize,generate}-contract-surface.ts`, `__tests__/{contract-surface,classify-contract-change}.test.ts`) + tam okunan 3 (`src/index.ts`, `__tests__/browser-entry-closure.qa.test.ts`, `packages/trpc/{package.json,tsconfig.json}`) + kısmi/hedefli okunan 4 (`turbo.json:64-87`, `scripts/guards.sh:1230-1359`, `docs/api-versioning.md:120-209`, `docs/api-contract-surface.json` seçili bloklar).
- **Bulunan `any`:** **0** (tip olarak). `: any`/`as any`/`any[]`/`<any` → 0; eşleşmelerin tamamı Türkçe yorum metni içinde. `@ts-ignore`/`@ts-expect-error` → 0. `eslint-disable` → 0. Boş `catch {}` → 0. Çıplak `object`/`Function` tipi → 0.
- **`as` (tip zorlama):** `src/contract/**` → 0 · `scripts/**` → 0 · yeni testler → yalnızca `as const` (2 yerde, tip zorlama değil). **F4** `z.custom<T>(() => true)` biçiminde **1** gizli eşdeğer.
- **En büyük fonksiyon:** `buildDiff` — **124 satır** (`classify-contract-change.ts:381-504`). İkinci: `diffProcedureIo` 98 satır (`:511-608`). Üçüncü: `classifyContractChange` 55 satır (`:655-709`).
- **Saflık:** `src/contract/**` → `node:*` 0, `process.` 0, `require(` 0, `prettier` 0, dosya yazma 0. I/O noktası sayısı: **1** (`scripts/generate-contract-surface.ts`).
- **Serileştirici tekilliği:** `prettier` ithalatı 1 yer · `serializeContractSurface` 2 tüketici, **aynı** fonksiyon.
- **Exhaustive switch:** 5/5'i `assertNever` ile kapalı. `reason` kodu: 17 (3 prosedür + 14 alan), `docs/api-versioning.md:184` beyanıyla tutarlı.
- **Erişilebilirlik ölçümü (F1/F2):** `"input": null` → 5 prosedür · dizi-köklü çıktı → 1 prosedür (`session.list`).

## DOĞRULANAMADI

- **Hiçbir komut koşturulmadı** (`Bash` aracı yok). `packages/trpc` 195/195, `guards` 23/23 ve `format:check` yeşil iddiaları **bana ait değil** — handoff'tan alındı, bağımsız teyit edilemedi.
- **F1/F2/F3'ün kırmızı yandığı negatif testler yazılamadı/koşturulamadı.** Üç bulgunun tamamı kodun **statik** okumasından ve `docs/api-contract-surface.json`'ın gerçek içeriğinden türetildi; vakalar satır satır elle izlendi (raporda dal dal yazılı) ama çalıştırılarak **gözlenmedi**. Düzeltme turunda ilk iş bu mutasyonları koşturmak olmalı.
- **`turbo.json`/`guards.sh`/kök `package.json`** değişiklikleri yalnızca ilgili bloklar hedefli okunarak incelendi; `scripts/guards.sh`'in 1230 satır öncesi **okunmadı** (kapsam dışı). `check_test_contract_chain`'in alt kontrol 2'sinin (turbo dry-run sahte yeşil dedektörü) **gerçekten** çalıştığı koşturulmadan doğrulanamadı.
- **ESLint/tsc'nin bu dosyalar üzerindeki gerçek çıktısı** görülmedi; `any`/`as` sayımları `Grep` desenlerine dayanıyor. Tip düzeyinde gizli bir gevşeme (ör. jenerik varyans) statik okumayla tespit edilemez.
- **`docs/adr/0027-*.md`** yalnızca `Grep` ile (3 satır bağlam) görüldü, tam okunmadı — ADR'nin "gözden geçirme koşulu 3"ünün F2'yi ne ölçüde önceden kabul ettiği değerlendirilemedi. ⚠ F2'nin severity'si bu nedenle ADR metnine göre değil, **davranışa** göre verildi.
- **Prettier biçimlendirmesi bu rapor dosyasına uygulanamadı** (`Bash` yok) — `AGENT_BASELINE.md` §5 gereği Orkestratör kapatır.
