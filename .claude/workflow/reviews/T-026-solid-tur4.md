# T-026 — `solid` gate raporu, düzeltme turu 4 (SON TUR)

- **Tarih:** 2026-11-19
- **Sürüm:** ROADMAP `v0.0.22` (platform `minor`, `@arkesoft/trpc` `patch`)
- **Kapsam:** TAM (tur 1/2/3 FAIL ⇒ daraltma yok)
- **Araç kısıtı:** `Bash` YOK — hiçbir komut koşturulmadı. Tüm kanıtlar **kaynak okuma +
  elle yürütme (trace)** ile üretildi; nerede koşturulamadığı `DOĞRULANAMADI`da yazılı.

```
GATE: solid
SONUÇ: PASS
```

Gerekçe (AGENT_BASELINE §4): `critical`/`high` **yok**; `medium` sayısı **2** (eşik: ≥3
FAIL) ⇒ **PASS**. İki `medium` ve on bir `low` teknik borca yazılır. ⚠ Tur 3'ün üç
`high`/`medium` bulgusunun (S5, S6 ve üç yorum düzeltmesi) kapanışı aşağıda **bağımsız**
doğrulandı — `backend`'in mutasyon kanıtlarına dayanılmadı.

---

## 1. S5'in kapanışı — kök-şekil korumasının `null` istisnası

**Durum: KAPANDI (geniş ölçüde) — ⚠ bir artık fail-open kaldı, bkz. bulgu `M1`.**

**Nasıl ölçtüm (mutasyon kanıtına dayanmadan):**

1. **Sınırın doğruluğu.** Yeni dal `classify-contract-change.ts:699`:
   `else if (isJsonRecord(beforeSchema) !== isJsonRecord(afterSchema))`. Dış `if`
   `isJsonRecord(before) && isJsonRecord(after)` olduğundan bu dal **yalnızca** taraflardan
   tam biri record iken çalışır. `ContractSurfaceProcedureEntry.input/output` tipi
   (`build-contract-surface.ts:87-88`) `z.core.JSONSchema.BaseSchema | null`'dır ve
   `z.toJSONSchema()` kök olarak **her zaman** bir nesne üretir (dizi kökü bile
   `{type:'array', items:…}` **record**'udur) ⇒ record-olmayan tek değer `null`'dır.
   **Sonuç: dal tam olarak `null`↔non-null sınırındadır, ne dar ne geniş.** ✓
2. **Yeni gevşetme doğurdu mu?** Hayır. Dal yalnızca **ekler** (`diffs.push`), hiçbir
   erken dönüş/atlama getirmez; `nonNullHasProperties === true` olduğunda **hiçbir şey
   yapmaz** ve akış değişmeden alan döngüsüne devam eder. Bu dalın `false` olduğu her
   girdide davranış FIX 3 öncesiyle **birebir aynıdır**.
3. **Yeni sıkılaştırma doğurdu mu?** Evet, **sınırlı ve belgelenmiş** olarak: yön ayrımı
   yapılmıyor (`null`→nesne ve nesne→`null` ikisi de `*_TYPE_NARROWED`/MAJOR). Girdi
   tarafında `.input()` **kaldırılması** teorik olarak genişlemedir; fail-closed MAJOR
   verilmesi `:712-717` yorumunda açıkça yazılı ve deponun kabul edilmiş felsefesiyle
   (ADR-0027 K7) tutarlı. **Aşırı-sıkı, yanlış değil.**
4. **Mükerrer diff riski?** Yok — iki yol **birbirini dışlar**: `properties` varsa kök
   diff'i **eklenmez** ve alan döngüsü çalışır; `properties` yoksa kök diff'i eklenir ve
   `readSchemaProperties` iki tarafta da `{}` döndüğü için alan döngüsü **sıfır** tur
   atar. Her iki durumda da tek bir diff üretilir — testlerdeki `onlyDiff` iddialarıyla
   tutarlı.
5. **`?? {}` kullanılmadı iddiası:** doğrulandı. `:718` mevcut `beforeDiffTarget`/
   `afterDiffTarget` değişkenlerini **yeniden kullanıyor**, yeni normalizasyon yok ⇒ F2'nin
   iki `onlyDiff` testi (`classify-contract-change.test.ts:707`, `:725`) bu dala **girmez**
   (object kökü `properties` taşır). ✓

**⚠ Ama:** `nonNullHasProperties` (`:719-720`) `properties`'in **varlığını** sorar, **dolu
olup olmadığını** değil. Zod v4.6.7 `objectProcessor` boş şekilde bile `json.properties = {}`
yazar (`node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/json-schema-processors.cjs:440-441`,
okundu) ⇒ `null ↔ z.object({})` dalı tetiklemez **ve** alan döngüsü boş döner ⇒ **0 diff /
PATCH**. Ayrıntı ve düzeltme: bulgu **`M1`**.

---

## 2. S6'nın kapanışı — `canonicalizeJsonValue`'da öz `__proto__`

**Durum: KAPANDI. `Object.fromEntries` seçimi bir boşluk BIRAKMIYOR.**

**Nasıl ölçtüm:**

1. **Mekanizma.** `canonicalize.ts:81-92` artık `Object.fromEntries(...)` kuruyor.
   `Object.fromEntries` spesifikasyon gereği `CreateDataPropertyOrThrow`
   (`[[DefineOwnProperty]]`) kullanır ⇒ `'__proto__'` **öz, sayılabilir veri özelliği**
   olur; köşeli-parantez ataması ise `Object.prototype`'ın `__proto__` **setter**'ını
   tetikleyip bilgiyi sessizce yutardı.
2. **Aşağı akış gerçekten görüyor mu?** Evet. Tek tüketici `JSON.stringify`
   (`classify-contract-change.ts:277-281` `isSchemaEqual`, ve üretim betiği
   `generate-contract-surface.ts:235-236`). `JSON.stringify` `EnumerableOwnPropertyNames`
   üzerinden gider ⇒ öz `__proto__` **serileşir**. Elle yürüttüm:
   `{type:'string'}` + öz `__proto__` → `{"__proto__":{"type":"number"},"type":"string"}`
   ≠ `{"type":"string"}` ⇒ `isSchemaEqual` `false` → `hasUntrackedConstraintChange` `true`
   → `NARROWED` → `OUTPUT_TYPE_NARROWED`/MAJOR. Testin
   (`classify-contract-change.test.ts:1100-1129`) beklediği sonuç **bu**. Düzeltme öncesi
   aynı yolda iki taraf da `{"type":"string"}`'e indirgenir, `UNCHANGED` → **0 diff**
   ⇒ `onlyDiff` "0 bulundu" ile patlar. `backend`'in "1 FAIL" ölçümü bu yürütmeyle
   **tutarlı** (ikinci test — iki taraf da aynı anahtarı taşıyan karşıt-kanıt — düzeltme
   öncesi de yeşil kalırdı).
3. **`Object.create(null)`'a göre boşluk var mı?** **Yok.** İki seçenek de
   `[[DefineOwnProperty]]` yoluna girer; fark yalnızca sonucun prototipidir. Bu kod
   yolunda prototipin önemi olabilecek tek yer `JSON.stringify` (`toJSON` araması) ve
   tüketicinin nesne üzerinde metot çağırması — `Object.create(null)` ikincisini **kırar**,
   birincisini değiştirmez. ⇒ `backend`'in gerekçesi (dosyada zaten kurulu
   `Object.fromEntries` emsali + tüketicinin `Object.prototype` metotlarını kaybetmemesi)
   **doğru ve yeterli**. Ayrıca prototip kirliliği riski yok: öz `__proto__` **veri**
   özelliği nesnenin `[[Prototype]]`'ını değiştirmez, dolayısıyla aşağı akıştaki
   köşeli-parantez **okumaları** (`readSchemaProperties` vb.) zehirlenemez.
4. **Artefakt değişmedi** (Orkestratör md5 ölçümü) — bu **beklenen**: bugünkü 17
   prosedürün hiçbir şemasında `__proto__` anahtarı yok, düzeltme yalnızca gelecekteki/
   sentetik girdiyi etkiliyor. md5 sabitliği bir çelişki **değil**, tutarlılık kanıtıdır.

---

## 3. Üç yorum düzeltmesinin olgusal denetimi

### 3.1 `(root)` sentinel çarpışma uyarısı (`classify-contract-change.ts:691-695`) — **DOĞRU**

Kod `:695` ve `:727`'de `fieldName: '(root)'` üretiyor; `FieldLevelContractChangeDiff`
`fieldName`'i düz `string`. Gerçek bir `z.object({ '(root)': … })` alanı alan döngüsünden
(`:743`) aynı `fieldName` ve — kısıt değişirse — aynı `*_TYPE_NARROWED` `reason`'ıyla
geçer ⇒ programatik tüketici ikisini ayıramaz. Uyarı **olgusal olarak doğru**; `docs`
karşılığı (`api-versioning.md:355-363`) de doğru.

### 3.2 "matematiksel olarak ulaşılamaz" düzeltmesi + `enum` sıra karşı örneği (`:422-430`, `:454-458`) — **DOĞRU**

`{type:'string',enum:['a','b']}` → `{type:'string',enum:['b','a']}` için elle yürüttüm:

- `isSchemaEqual` → `canonicalizeJsonValue` **anahtarları** sıralar ama `enum` dizisini
  sıralamaz (`canonicalize.ts:46`, `SORTED_ARRAY_FIELD_NAME = 'required'`) ⇒ JSON dizeleri
  farklı ⇒ `false`. Erken dönüş **olmaz**.
- `hasUntrackedConstraintChange` → `stripTrackedAxisKeys` ikisinden de `enum`/`type`/
  `pattern`'i çıkarır ⇒ `{}` vs `{}` ⇒ `false`.
- Üç eksen: `compareEnumAxis` **Set tabanlı** ⇒ `UNCHANGED`; `compareTypeAxis`
  `UNCHANGED`; `comparePatternAxis` (ikisi de `null`) `UNCHANGED`.
- ⇒ Hiçbir eksen `NARROWED`/`WIDENED` demez ⇒ **son `return 'NARROWED'` (`:458`) gerçekten
  çalışır.** "Ulaşılamaz" iddiasının yanlış olduğu, karşı örneğin doğru olduğu
  **doğrulandı**. ⚠ Bu dalı pinleyen bir test **yok** — bkz. `L10`.

### 3.3 İki `ADR-0027` atfı (`:258`, `:369`) — **YANLIŞ (yeni bulgu `L2`)**

Her iki yorum da *"`in` operatörü KULLANILMAZ (T-023'ün prototip zinciri tuzağı,
ADR-0027)"* diyor. ADR-0027'nin **tamamını** okudum (224 satır): on bir kararın
(`:38-99`) ve sekiz reddedilen alternatifin (`:103-112`) **hiçbiri** `in` operatörü,
prototip zinciri veya öz-anahtar okuma hakkında değil; tur 1'de eklenen gözden geçirme
notu (`:174-215`) da bu ekseni içermiyor. ⇒ Tur 3'ün düzeltmesi **bir yanlış atfı
(AGENT_BASELINE §5) başka bir yanlış atıfla değiştirdi**. Düzeltme bulgu `L2`'de.

---

## 4. `docs` §9/§10 olgusal denetimi

- **md.1 — "KAPANDI" iddiası DOĞRU.** İki yarının ikisi de kodda karşılanıyor:
  izlenen↔izlenmeyen `hasUntrackedConstraintChange` (`:437-439`, eksen değerlendirmesinden
  **önce** çalışır), izlenen↔izlenen ise `:441-452`'deki **koşulsuz** dizi literali +
  NARROWED-baskın katlama. `docs`'un *"aralarında erken dönüş yok"* cümlesi **birebir
  doğru**. md.1'in "izlenen üç eksenin hiçbiri değişmediğinde fail-closed `NARROWED`"
  cümlesi de `:458` ile uyumlu.
- **md.2 — "kısmen" artık BAYAT (ama tamamen yanlış değil).** `api-versioning.md:271-276`
  *"`null`↔non-null kök geçişi hâlâ fail-OPEN … `backend` bu turda (FIX 3) ele alıyor"*
  diyor; FIX 3 **indi** ve ilkel/`anyOf`/ilkel-dizi kökleri **kapandı** (§1). ⚠ Ne var ki
  bulgu `M1` nedeniyle *"kapandı"* yazmak da **yanlış olur** — boş `properties` taşıyan
  kök hâlâ açık. Doğru metin ikisini de söylemeli; düzeltme `L3`'te.
- **md.3/md.5/md.6 — doğru.** md.6'nın mutasyon anlatısı `contract-surface.test.ts:496-518`
  ile birebir eşleşiyor (`visit(\`${key}[]\`, item)`, `:416`). ⚠ Satırın markdown
  biçimlenmesi bozuk (`L6`).
- **§10 `reason` tablosu — SAYILAR DOĞRU.** `ProcedureChangeReason` 3 kod (`:77`),
  `FieldChangeReason` 14 kod (`:85-99`) ⇒ **17**; §10'un tablosu 3 + 14 = 17 satır ve her
  satırın sınıfı `buildDiff`'in (`:505-628`) ilgili dalıyla **birebir** eşleşiyor (14
  alan dalını tek tek karşılaştırdım; sapma yok). Dört turdur yeni `reason` kodu
  eklenmemiş.
- **§10 `(root)` satırı (`:355-363`) — DOĞRU** (bkz. §3.1).
- **⚠ §10 girişi bayat + ölü atıf (`:315-318`)** — bulgu `L4`.
- **⚠ ADR-0027 `docs`'tan DAHA BAYAT** — bulgu `M2`. `docs` §9'u üç kez güncelledi ama
  ADR'nin K8/K9 metni ve "Olumsuz ve kabul edilen maliyetler" bölümü hâlâ **tersini**
  söylüyor.

---

## 5. BULGULAR

### `M1` — [SEV: medium] `classify-contract-change.ts:719-721` — kök-şekil korumasının artık fail-open'ı: boş `properties`

`nonNullHasProperties`, `properties`'in **varlığını** sorar, **dolu** olup olmadığını
değil. Zod v4.6.7 `objectProcessor` boş şekli olan bir nesne için bile `json.properties = {}`
emit eder (ölçüldü: `node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4/core/json-schema-processors.cjs:440-441`)
⇒ `.input(z.object({}))` eklenmesi/kaldırılması (ve `z.array(z.object({}))` kökü) bu dalı
**tetiklemez**, alan döngüsü de sıfır alan görür ⇒ **0 diff / `PATCH`**. Gerçekte girdisi
olmayan bir prosedüre nesne girdisi gelmesi **MAJOR**'dır.

**Önerilen düzeltme** (`backend`):

```ts
const nonNullProperties = isJsonRecord(nonNullDiffTarget)
  ? readSchemaProperties(nonNullDiffTarget)
  : {}
const nonNullHasProperties = Object.keys(nonNullProperties).length > 0
```

**⚠ Önerinin kendi güvenlik etkisini ÖLÇTÜM** (T-023 dersi — öneri yazan, önerisinin
fail-open/closed yönünü kendi ölçer):

- **Yön:** kesinlikle **monoton sıkılaştırma**. Tek davranış değişikliği
  `PATCH → MAJOR`'dır (yalnızca `null ↔ boş-`properties`` vakasında). Hiçbir `MAJOR`
  `MINOR`/`PATCH`'e inmez.
- **Mükerrer diff üretir mi?** Hayır — kök diff'i tam da alan döngüsünün **0 alan**
  göreceği durumda eklenir.
- **Mevcut testleri kırar mı?** Hayır. Bu dala giren/girebilecek **sekiz** testi tek tek
  yürüttüm: `classify-contract-change.test.ts:707`, `:725`, `:743`, `:988`, `:1006`,
  `:1023`, `:1040`, `:1057`. Hiçbirinde non-null taraf **boş** `properties` taşımıyor
  (`:707`/`:725`/`:1040` dolu object; `:988`/`:1006` ilkel; `:1023` ilkel-dizi;
  `:743`/`:1057` iki taraf da `null` ⇒ dal hiç çalışmıyor) ⇒ **sekizinin de sonucu
  değişmez**.
- **Artefaktı oynatır mı?** Hayır — `docs/api-contract-surface.json`'da `"properties": {}`
  eşleşmesi **0** (ölçüldü) ve bu kod artefakt üretmiyor (yalnızca sınıflandırma).
- **⚠ Koşturulamadı** (`Bash` yok): yukarıdakiler elle yürütme sonucudur, `vitest`
  çıktısıyla teyit edilmedi.

**Neden `high` değil (dürüst gerekçe):** (a) tetikleyici şekil (`properties` **boş** kök)
bugün üretimde **0 kez** mevcut ve `z.object({})` girdisi semantik olarak anlamsıza yakın;
(b) bu bir **gerileme değil** — FIX 3 öncesi de aynı sonuç dönüyordu, FIX 3 durumu
**sadece iyileştirdi** (üç şekil kapandı); (c) AGENT_BASELINE §4: "kenar durumda hata"
tanımına birebir oturuyor ve "emin değilsen bir alt seviyeyi seç" kuralı geçerli.
**Sorumlu:** `backend` · **Vade:** `v0.0.23` (en geç `v1` taşımasından önce).

### `M2` — [SEV: medium] `docs/adr/0027-…md:73-77`, `:80-82`, `:133-135` — ADR, gönderilen davranışın TERSİNİ söylüyor

Üç ayrı yerde ADR, üç düzeltme turunda değişen mekanizmayı **eski hâliyle** anlatıyor:

1. **K9 (`:80-82`):** *"`null`↔nesne geçişi … bilinçli kapsam dışı. `diffProcedureIo` bu
   durumda **sessizce boş dizi döner**; bir prosedür girdisiz/çıktısız hâle gelirse bu
   **yakalanmaz**."* ⇒ F2 (tur 1) ve S5 (tur 3) sonrası **yanlış**: bu geçiş artık MAJOR
   üretiyor (`:699-731`, `:756-768`).
2. **"Olumsuz ve kabul edilen maliyetler" (`:133-135`):** *"bu durum oluşursa
   sınıflandırıcı sessizce hiçbir fark bildirmez. **Karşı önlem yok**."* ⇒ aynı şekilde
   yanlış.
3. **K8 (`:73-77`):** *"üç eksen **sırayla** denenir … **sıralı deneme** buna karşı
   tasarlandı."* ⇒ tur 2'nin S2 düzeltmesi sıralı-erken-dönüşü **kaldırdı**; bugün üçü de
   koşulsuz değerlendirilip NARROWED-baskın katlanıyor (`:441-452`).

Tur 1'de eklenen gözden geçirme notu (`:196-215`) yalnızca *"gözden geçirme koşulu 2/3
erken tetiklendi"* diyor; **düzeltmelerin indiğini ve mekanizmanın değiştiğini kayda
geçirmiyor** ve tur 2/3'ten sonra **güncellenmedi**. Beş yıl sonra ADR'yi karar kaydı
olarak okuyan biri, tam da bu Task'ın üç turunu harcadığı eksende **gönderilenin tersini**
öğrenir.

**Önerilen düzeltme** (`docs`): K1-K11 metnine **dokunmadan**, mevcut "Gözden geçirme
notu" bölümüne (`:174`, deponun kendi kabul ettiği mekanizma — bu Task'ta bir kez zaten
kullanıldı) *"düzeltme turu 2-4"* başlıklı bir ek yaz; K8'in sıralı denemeden katlamaya
geçtiğini, K9'un fail-closed'landığını ve **`M1`'in artık açık kaldığını** üç cümleyle
kayda geçir; "Olumsuz" bölümünün ilgili maddesine aynı nota işaretçi koy. ⚠ `L2`'nin
düzeltmesi (aşağıda) aynı eke iliştirilebilir — **tek dokunuş**.
**Sorumlu:** `docs` · **Vade:** bu sürüm (commit öncesi) tercih edilir, en geç `v0.0.23`.

---

## 6. `low` envanteri (borç satırı metinleri — `docs` kopyalayabilir)

Düzeltme turu **açılmaz** (AGENT_BASELINE §4); doğrudan ROADMAP teknik borç tablosuna.

- **`L1` (devreden, AÇIK)** [SEV: low] `packages/trpc/src/contract/build-contract-surface.ts:116`
  ↔ `packages/trpc/src/contract/classify-contract-change.ts:641` — `readProperty`
  (prototip zincirini **yürür**, `key in value` kullanır `:111`) ile `readOwnProperty`
  (**yalnızca öz** anahtar) aynı klasörde, neredeyse aynı adla, **zıt** semantikle yaşıyor.
  Üstelik bir dosya `in`'i yasak ilan ederken (`:258`, `:369`) kardeşi onu kullanıyor ve
  **neden kabul edilebilir olduğunu yazmıyor** (gerçek sebep: okunan anahtarlar sabit ve
  saldırgan kontrolünde değil — `_def`, `type`, `inputs`, `output`). Öneri: `readProperty`
  → `readInheritedOrOwnProperty` + `build-contract-surface.ts:109-118`'e tek cümlelik
  gerekçe. **Sorumlu:** `backend` · **Vade:** `v0.0.23`.
- **`L2` (YENİ)** [SEV: low] `packages/trpc/src/contract/classify-contract-change.ts:258`
  ve `:369` — `in` yasağı **ADR-0027'ye** atfediliyor; ADR-0027'de böyle bir karar **yok**
  (224 satırın tamamı okundu). Tur 3'te düzeltilen yanlış atıf (AGENT_BASELINE §5) yerine
  **başka bir yanlış atıf** kondu. Öneri: ya atfı *"T-023 ölçümü; `__tests__/`
  `authz-consistency.test.ts` emsali"* ile sınırla, ya da `M2`'nin ADR ekine bir karar
  satırı olarak yaz ve atıf doğru hâle gelsin. **Sorumlu:** `backend` (yorum) veya `docs`
  (ADR eki) · **Vade:** `v0.0.23`.
- **`L3` (YENİ)** [SEV: low] `docs/api-versioning.md:271-276` — md.2'nin
  *"`null`↔non-null hâlâ fail-OPEN / `backend` bu turda ele alıyor"* metni **bayat**.
  Doğru metin: ilkel/`anyOf`/ilkel-dizi kökleri **kapandı** (tur 4 bağımsız doğruladı),
  **boş `properties` taşıyan kök** hâlâ açık (bulgu `M1`). Paragrafın kendisi zaten
  *"güncellenmeli"* diyor. **Sorumlu:** `docs` · **Vade:** bu sürüm.
- **`L4` (YENİ)** [SEV: low] `docs/api-versioning.md:315-318` — §10 girişi tur 1'den kalma:
  *"Bu turda (T-026 düzeltme turu 1) `backend` paralel koşuyor … göremedim — bkz. aşağıdaki
  sorular, Orkestratöre soruldu."* ⚠ **"aşağıdaki sorular" diye bir bölüm dosyada YOK**
  (tüm dosyada tek eşleşme bu atfın kendisi) ⇒ **ölü atıf**. Ayrıca sayı dört turdur
  sabit: 3 + 14 = **17** (tur 4 bağımsız saydı). Öneri: paragrafı *"kod sayımı: 17, son
  doğrulama T-026 tur 4"* ile değiştir. **Sorumlu:** `docs` · **Vade:** bu sürüm.
- **`L5` (devreden, AÇIK — kapsamı BÜYÜDÜ)** [SEV: low] `packages/trpc/package.json:28` —
  `test:contract` yalnızca `contract-surface.test.ts`'i koşuyor ⇒ sözleşme testlerinin
  **34/82**'si (tur 3'te 34/75'ti; sınıflandırıcı tarafı 48'e çıktı). Kural tablosunun
  **tamamını** kanıtlayan 48 test odaklı takma adın **dışında**; yalnızca `pnpm test`
  koşturur. Değerlendirme değişmedi: `test:contract` yine de Katman-1 bağlantısını
  (`contract-surface.test.ts:332-344`) koşturduğu için `AC-33`/`AC-36` **karşılanıyor**.
  **Sorumlu:** `devops` · **Vade:** `v0.0.23`.
- **`L6` (YENİ)** [SEV: low] `docs/api-versioning.md:306` — satır içi kod çevresinde boşluk
  eksik: ``…`visit(`${key}[]`, item)`çağrısı eklenmiş; mutasyon öncesi`leaks=[]`…`` ⇒
  markdown hatalı render oluyor. **Sorumlu:** `docs` · **Vade:** bu sürüm.
- **`L7` (YENİ)** [SEV: low] `packages/trpc/src/contract/canonicalize.ts:36-43` ↔
  `packages/trpc/src/contract/classify-contract-change.ts:158-164` — `isUnknownArray` ve
  `isJsonRecord` **birebir aynı** iki kopya; iki dosya **aynı klasörde** ve aralarında
  **zaten bir ithalat kenarı var** (`classify-contract-change.ts:61` →
  `canonicalize.js`). Gerçek tekrar (aynı sebeple değişirler), ve **gerekçesiz**: kardeş
  `assertNever` kopyası (`:142-147`) paket yön kuralıyla, test kopyaları ise "üretim
  koduna bağımlı olmama" ile **gerekçeli**; bu ikisi değil. `:154-156` tekrarı yalnızca
  *not ediyor*, savunmuyor. Öneri: `canonicalize.ts`'ten export et, `classify`'da ithal et.
  **Sorumlu:** `backend` · **Vade:** `v0.0.23`.
- **`L8` (YENİ)** [SEV: low] `packages/trpc/src/__tests__/contract-surface.test.ts:469-487`
  ↔ `:530-546` — iki test **aynı belgeyi**, **aynı regex ve aynı dışlama listesiyle**
  tarayıp **aynı** `expect(leaks).toEqual([])` iddiasını yapıyor. Tur 2'nin düzeltmesinden
  sonra (c) zaten düzeltilmiş `walkJsonEntries`'i koşturuyor ⇒ ikinci test **ayırt edici
  hiçbir şey** iddia etmiyor. Öneri: `:530-546`'yı sil (ayırt edici olan `:497-518` ve
  `:520-528` **kalsın**). **Sorumlu:** `backend` · **Vade:** `v0.0.23`.
- **`L9` (YENİ)** [SEV: low] `packages/trpc/src/contract/classify-contract-change.ts:718-730`
  — `null` sınırında **sınıf asimetrisi**: `output: null → z.array(z.string())`
  **MAJOR** (`OUTPUT_TYPE_NARROWED`, kök), ama `output: null → z.array(z.object({id}))`
  **MINOR** (`OUTPUT_REQUIRED_FIELD_ADDED`) — yapısal olarak aynı değişiklik (çıktı
  sözleşmesinin yokluktan varlığa geçmesi) **iki sınıf** uzakta raporlanıyor. Fail-open
  **değil** (MAJOR tarafı aşırı-sıkı olan), ama hiçbir yerde belgelenmemiş. Öneri:
  `docs/api-versioning.md` §9'a bir cümle. **Sorumlu:** `docs` · **Vade:** `v0.0.23`.
- **`L10` (YENİ)** [SEV: low] `packages/trpc/src/contract/classify-contract-change.ts:454-458`
  — tur 3'te *"ulaşılabilir"* olarak **doğru** biçimde yeniden belgelenen güvenlik ağı
  dalının **testi yok**. Karşı örnek doğrulandı (`enum:['a','b'] → ['b','a']`, §3.2) ama
  `classify-contract-change.test.ts:531`'deki en yakın test (`['a','b'] → ['b','c']`)
  akıştan **daha erken** (`compareValueSets`) çıkıyor. Öneri: tek bir sentetik test
  (ham JSON Schema ile, `S2` testinin deseni). **Sorumlu:** `backend` · **Vade:** `v0.0.23`.
- **`L11` (devreden, GÜNCELLENDİ)** [SEV: low]
  `packages/trpc/src/contract/classify-contract-change.ts:650-825` — `diffProcedureIo`
  artık **176 satır** (tur 2'de 107) ve dosyanın en büyük fonksiyonu; `buildDiff`'i
  (`:505-628`, **124**) geçti. Üç ayrılabilir sorumluluk taşıyor: (1) her-iki-record kök
  koruması, (2) `null`↔non-null kök koruması, (3) alan döngüsü. **Bu Task'ta bölünmesini
  yine ÖNERMİYORUM** (son tur, risk > kazanç — tur 1/2/3 kararıyla tutarlı), ama bir
  sonraki dokunuşta `diffRootShape(...)` çıkarılmalı; bu, iki kök dalının birbirini
  dışladığını **yapısal olarak** görünür kılar. Dosya **975 satır** — tur 3'te koyduğum
  ~1100 eşiğinin altında, **bölünme hâlâ gereksiz**. **Sorumlu:** `backend` ·
  **Vade:** `v0.0.23`.

---

## 7. TAM taramanın geri kalanı — bulgu ÇIKMAYAN eksenler

- **Tip disiplini:** `packages/trpc`'nin T-026 kapsamındaki yedi kaynak + iki test
  dosyasında `any` **0**, `@ts-ignore`/`@ts-expect-error` **0**, gerekçesiz `as` **0**
  (yalnızca `as const`, `contract-surface.test.ts:143`). `as` yerine runtime daraltma
  (`isZodSchema`, `isOperation`, `z.custom()` + `isJsonSchemaNodeOrNull`) tutarlı
  uygulanmış. ✓
- **Exhaustive switch:** beş `switch`'in beşinde de `default: assertNever(...)` var
  (`:473-481`, `:506-627`, `:796-821`, `:831-842`, `:929-940`). `buildDiff`'in 17 dalı
  `DiffInput` birleşimini **tüketiyor** — eksik dal yok (14 alan kodunu tek tek
  karşılaştırdım). ✓
- **Saflık:** `contract/` üçlüsünde `node:*` ithalatı, `process.` erişimi, dosya G/Ç
  **yok** (grep + okuma). Tek I/O noktası `scripts/generate-contract-surface.ts:238`. ✓
- **Katman/bağımlılık yönü:** `contract/` yalnızca `zod` ve paket **içi** göreli
  modülleri ithal ediyor; `apps/*`'a bağımlılık **yok**; döngü **yok** (`canonicalize`
  ithalatsız → `classify` → `build-contract-surface` tip-yalnızca). `assertNever`'ın
  `apps/api`'den ithal **edilmemesi** (`:142-147`) CLAUDE.md §3 yön kuralının doğru
  uygulanması. ✓
- **`index.ts` kapanış yasağı:** `src/index.ts` ve `src/server.ts`'te `contract`
  eşleşmesi **0** ⇒ `browser-entry-closure.qa.test.ts` sözleşmesi korunuyor. ✓
- **Hata yönetimi:** `catch {}` **yok**; üç `catch` de (`generate-contract-surface.ts:94`,
  `:135`, `:174`) orijinal hatayı `cause` ile **sarmalayıp** yukarı iletiyor. Beklenen
  durumda `null` dönüp çağıranı tahmine zorlayan yer yok (`inputs.length > 1` **gürültülü
  fırlatıyor**, `build-contract-surface.ts:180-184`). ✓
- **Sağlayıcı dallanması / soyutlama:** çekirdekte `if (provider === …)` sınıfı dallanma
  **yok**; konu dışı yüzey. ✓
- **Test kalitesi:** 48 + 34 testin tamamı **davranış** iddia ediyor (`reason` + `severity`
  + `scope` + `fieldName` üçlüsü), implementasyon yansılaması/mock **yok**; her kural
  satırının karşı-kanıtı (aşırı-sıkı olmadığını gösteren "0 diff / PATCH" testi) **var**
  (`:685`, `:743`, `:824`, `:1057`, `:1131`). `onlyDiff` (`:81-90`) iddiayı tek diff'e
  **pinliyor** — "en az bir" gevşekliği yok. ✓ (İstisna: `L8`, `L10`.)
- **Ölü kod:** `formatContractChangeReport` (`:947`) üretimde **çağrılmıyor** — ama
  `docs/api-versioning.md` §7/§8 operatöre onun çıktısını okutuyor ve `v0.0.23`'ün CI
  tüketicisi için **bilinçli** bırakıldı (`security` tur 1 bunu zaten ölçmüş). Ölü kod
  **saymıyorum**; ⚠ yine de `contract-surface.test.ts:340`'ta iddia mesajı olarak
  verilirse (`expect(classification.diffs, formatContractChangeReport(classification))`)
  `AC-36`'nın *"MAJOR olarak adlandırır"* şartı gate çıktısında **okunabilir** hâle gelir
  — `L5` ile aynı dokunuşta kapatılabilir. Başka kullanılmayan export/erişilemeyen dal
  yok (`:887-891`'in TS daraltma güvenlik ağı yorumla **doğru** işaretlenmiş).
- **İsimlendirme:** dosyalar kebab-case ✓, tipler PascalCase ✓, `reason` kodları
  SCREAMING_SNAKE_CASE ✓, boolean'lar `is`/`has`/`can` önekli (`isRequired`, `wasRequired`,
  `hasUntrackedConstraintChange`, `nonNullHasProperties`) ✓, `data`/`temp`/`handle`/
  `process` gibi belirsiz ad **yok** ✓. Sabit `TRACKED_AXIS_KEYS`/`SORTED_ARRAY_FIELD_NAME`
  ✓. Yorumlar Türkçe, kod/ad İngilizce ✓.

---

## ÖLÇÜMLER

- **İncelenen dosya:** **11** — `packages/trpc/src/contract/{classify-contract-change,
  canonicalize,build-contract-surface}.ts`, `packages/trpc/src/__tests__/{classify-contract-change,
  contract-surface}.test.ts`, `packages/trpc/scripts/{generate,serialize}-contract-surface.ts`,
  `packages/trpc/package.json` (script satırları), `docs/api-versioning.md`,
  `docs/adr/0027-…md`, `docs/api-contract-surface.json` (+ doğrulama için
  `node_modules/.pnpm/zod@4.6.7/…/json-schema-processors.cjs`, `…/to-json-schema.cjs`).
- **Bulunan `any`:** **0** (`@ts-ignore` 0, gerekçesiz `as` 0).
- **En büyük fonksiyon:** `diffProcedureIo` — **176 satır**
  (`classify-contract-change.ts:650-825`). İkinci: `buildDiff` **124**
  (`:505-628`). Üçüncü: `classifyContractChange` **55** (`:872-926`).
  Dosya toplam **975** satır (tur 3: 937).
- **Test sayısı (statik sayım, koşturulmadı):** `classify-contract-change.test.ts` **48**
  `it`, `contract-surface.test.ts` **34** `it` ⇒ toplam **82**; `pnpm test:contract`
  bunların **34**'ünü koşturur.
- **`reason` kodu sayımı:** 3 (`ProcedureChangeReason`) + 14 (`FieldChangeReason`) = **17**
  — `docs/api-versioning.md` §10 tablosuyla **eşleşiyor**.

## DOĞRULANAMADI

- **Hiçbir komut koşturulmadı** — `Bash` aracı yok. `pnpm test`, `pnpm test:contract`,
  `pnpm typecheck`, `pnpm lint`, `pnpm guards`, `md5` ve **mutasyon** koşumlarının
  **hiçbiri** bu turda bağımsız olarak çalıştırılmadı. §1/§2'deki kapanış kanıtları
  **kaynak okuma + elle yürütme**dir; `backend`'in sayısal mutasyon sonuçları
  (3 FAIL / 1 FAIL) **teyit edilmedi**, yalnızca **tutarlı** bulundu.
- `M1`'in önerilen düzeltmesinin sekiz testi kırmadığı **elle** yürütüldü, `vitest` ile
  **doğrulanmadı**.
- Orkestratör'ün bildirdiği ölçümler (md5 `3671b25e…`, 227/227, 34, 23/23, `format:check`
  yeşil) **devralındı**, yeniden üretilmedi.
- `pnpm format:check`'in **bu rapor dosyası** üzerindeki sonucu bilinmiyor — `Bash` yok ⇒
  `prettier --write` çalıştırılamadı; AGENT_BASELINE §5 gereği biçimlendirmeyi
  **Orkestratör** kapatmalı.
- `ROADMAP.md`'nin teknik borç tablosunun bugünkü hâli okunmadı ⇒ `L1`/`L5`'in orada
  **zaten** satırı olup olmadığı doğrulanmadı (`docs` tekrar satır açmadan önce baksın).
- `scripts/guards.sh`'in 23. adımı ve `turbo.json` **incelenmedi** (sahibi `devops`,
  bu turda değişmedi varsayıldı — `git diff` ile **teyit edilmedi**).
