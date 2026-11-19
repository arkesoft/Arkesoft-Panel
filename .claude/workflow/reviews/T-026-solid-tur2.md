# T-026 — `solid` gate, tur 2 (TAM yeniden denetim)

- **Tarih:** 2026-11-19
- **Sürüm:** ROADMAP v0.0.22
- **Tur:** 2 (tur 1 FAIL ⇒ WORKFLOW.md yeniden koşum tablosu gereği tam yeniden denetim)
- **Araç kısıtı:** `Bash` YOK. Hiçbir komut çalıştırılmadı. Tüm bulgular **statik okuma +
  artefakt ölçümü** ile üretildi; "ölçtüm" dediğim her yerde kaynağı yazdım.

```
GATE: solid
SONUÇ: FAIL
```

---

## 0. İncelenen dosyalar

| Dosya                                                     | Satır | Ne için                                 |
| --------------------------------------------------------- | ----- | --------------------------------------- |
| `packages/trpc/src/contract/classify-contract-change.ts`   | 842   | F1/F2/F3 düzeltmeleri + tam yeni yüzey  |
| `packages/trpc/src/__tests__/classify-contract-change.test.ts` | 798 | 35 test                                 |
| `packages/trpc/src/__tests__/contract-surface.test.ts`     | 469   | 31 test (F4 + `security` içerik kapıları) |
| `packages/trpc/src/contract/canonicalize.ts`               | 78    | `isSchemaEqual`'in tabanı               |
| `packages/trpc/src/contract/build-contract-surface.ts`     | (kısmi) | yardımcı tekrarının sayımı            |
| `docs/api-contract-surface.json`                           | (tam tarama) | erişilebilirlik ölçümü           |
| `docs/api-versioning.md`                                   | 155-274 | §9 kör nokta listesi + §10 kod tablosu |
| `scripts/guards.sh`                                        | 1225-1360 | `test:contract` zinciri kapsamı      |

---

## 1. F1–F4 kapanış durumu (bağımsız doğrulama — `backend`'in mutasyon kanıtlarına
dayanılmadı)

| # | Durum | Nasıl ölçtüm |
| - | ----- | ------------ |
| **F1** | ⚠ **KISMEN kapandı — artık düzeltmesi YENİ bir high doğurdu (bkz. S1)** | `classify-contract-change.ts:245-258`'i okudum. `in` GERÇEKTEN yok, `Object.keys(...).includes(...)` var (`:249,:250,:253,:257`). Dizi kökü → `items` yönlendirmesi doğru: `docs/api-contract-surface.json:445-502`'de `session.list` çıktısı `{"$schema","items":{…},"type":"array"}` — `ownKeys=["$schema","items","type"]`, `properties` yok, `items` var ve `items.properties` var ⇒ `items` döner. Test `:648-697` bunu kapsıyor. **AMA** bulgunun başlığı "kök şema düğümü **hiç** kıyaslanmıyor" idi; kök düğümün KENDİSİ hâlâ hiçbir eksende kıyaslanmıyor ⇒ S1. |
| **F2** | ✅ **Kapandı** | `:585-611`'de erken dönüş YOK. `null` yolunu elle izledim: `resolveFieldDiffTarget(null)` → `isJsonRecord(null)=false` → `null` döner → `readSchemaProperties(null)` → `{}` (`:171-177`), `readSchemaRequired(null)` → boş `Set` (`:180-189`). Yeni `reason` kodu eklenmemiş: `FieldChangeReason` birleşimi `:85-99`'da hâlâ **14** kod, `ProcedureChangeReason` `:77`'de **3** ⇒ toplam 17, `docs/api-versioning.md:254` ile tutarlı. `null`→`null` yolu: iki taraf da `{}`'e indirgenir, `allFieldNames` boş, döngü hiç dönmez ⇒ 0 diff — `backend`'in "5 prosedür hâlâ 0 diff" iddiası **kodla** doğrulandı (koşumla değil). |
| **F3** | ⚠ **KISMEN kapandı — gölgelemenin İKİNCİ sınıfı hâlâ açık** | `:339-356` + `:381-409` okundu. `stripTrackedAxisKeys` mutasyonsuz, `in` yok. İZLENEN↔İZLENMEYEN gölgelemesi gerçekten kapandı. **Ama sorulan soru buydu: yeni kontrol "ilk konuşan ekseni dön" desenini tekrar üretiyor mu?** → **Evet, izlenen üç eksen ARASINDA.** `:390-403` hâlâ `enum → type → pattern` sırasıyla **ilk konuşanda erken dönüyor**; `hasUntrackedConstraintChange` bu durumda `false` döner çünkü değişen anahtarların **ikisi de izleniyor**. Karşı vaka S2'de. |
| **F4** | ✅ **Kapandı** | `contract-surface.test.ts:309-311` gerçek bir çalışma zamanı kontrolü (`value === null \|\| (typeof value === 'object' && !Array.isArray(value))`). `:352-372`'de beş test: `null`/düz nesne kabul, dizi/dize/sayı **red**. Totolojik değil — `() => true` bu beş testten üçünü geçemezdi. `as` kullanılmamış (`contract-surface.test.ts`'te tek `as` → `:143` `as const`, tip zorlaması değil). |

---

## 2. BULGULAR

### S1 — [SEV: high] `packages/trpc/src/contract/classify-contract-change.ts:245-258,604-605` — kök şema düğümü **hâlâ** hiçbir eksende kıyaslanmıyor; F1 düzeltmesi bir alt vakayı **gevşetti**

F1 düzeltmesi "hangi düğümün alanlarını kıyaslayacağız" sorusunu çözdü ama "kök düğümün
**kendisi** değişti mi" sorusunu hiç sormadı. İki ölçülmüş alt vaka:

**(a) Kök şekil takası (object ↔ array) artık `PATCH` — tur 1'de `MAJOR`'dı.**
`before = {"type":"object","properties":{"a":…},"required":["a"]}`,
`after = {"type":"array","items":{"type":"object","properties":{"a":…},"required":["a"]}}`
(çıktı ekseni). Kodu elle izledim: `resolveFieldDiffTarget(before)` → `before`
(`:250`), `resolveFieldDiffTarget(after)` → `after.items` (`:257`). İki tarafın
`properties`/`required`'ı **birebir aynı** ⇒ `allFieldNames` üzerinde hiçbir dal
tetiklenmez ⇒ **0 diff / `PATCH`**.
Düzeltme ÖNCESİ aynı girdi: `afterProperties = readSchemaProperties(arrayRoot) = {}`
⇒ `a` için `existedBefore && !existsAfter` ⇒ `OUTPUT_FIELD_REMOVED` / **MAJOR**.
⇒ **MAJOR → PATCH**. Bu, `:236-240`'taki yazılı iddiayı — _"yeni tespit EKLER, var
olan hiçbir sonucu GEVŞETMEZ"_ — doğrudan çürütür. Gerçek sınıf MAJOR'dır (tüketici
diziyi `for..of` ile geziyordu, artık nesne geliyor). Hiçbir test bu geçişi kapsamıyor
(35 testin tamamını taradım; `z.array(...)` ↔ `z.object(...)` kök takası yok).

**(b) Kök seviyesindeki `additionalProperties` / `$schema` / `type` hiçbir zaman
kıyaslanmıyor — bugünkü artefaktta erişilebilir.**
`diffProcedureIo` kök düğümden yalnızca `properties` ve `required` okur (`:608-611`);
kökün geri kalanı hiçbir yere girmez. `docs/api-contract-surface.json`'da
`additionalProperties` ve `$schema` kök seviyede **mevcut** (ör. `:507-509`
`session.me` çıktısı; `:449` `session.list` kökü `$schema`+`type:"array"` taşıyor;
`minLength|maxLength|…|additionalProperties|anyOf|oneOf|allOf|$ref|const` deseni
artefaktta **47 eşleşme**). Bir çıktı kökünden `"additionalProperties": false`
kaldırılması = kısıt gevşemesi = tablo gereği `OUTPUT_TYPE_WIDENED` / **MAJOR**;
sınıflandırıcı **`PATCH`** der.

**Önerilen düzeltme (kendi güvenlik etkisi ÖLÇÜLDÜ):** `diffProcedureIo`'da hedef
çözümünden sonra, **iki taraf da `isJsonRecord` ise**, kök düğümleri
`properties`/`required`/`items` anahtarları çıkarılmış hâlleriyle `isSchemaEqual` ile
kıyasla; farklıysa fail-closed `*_TYPE_NARROWED` üret (sentetik `fieldName: '(kök)'`).
_Etki ölçümü:_ yalnızca diff **EKLER**, hiçbir diff'i kaldırmaz veya hafifletmez ⇒
monoton sıkılaştırma. 66 testin tamamını statik izledim: `null`↔nesne testleri
(`:707-741`) "iki taraf da record" koşuluyla elenir ⇒ `onlyDiff` hâlâ 1; F1 dizi
testleri (`:649-683`) kökleri `items` çıkarıldıktan sonra `{$schema,type:"array"}` ile
**eşit** ⇒ ek diff yok; satır 4-10 testlerinde kökler aynı. ⚠ Bu izleme **koşturulmadı**
(`Bash` yok) — `backend` uygularken mutasyon kanıtını kendisi üretmeli.
**Sorumlu:** `backend`.

---

### S2 — [SEV: medium] `packages/trpc/src/contract/classify-contract-change.ts:386-403` — F3'ün kapattığı gölgeleme deseni, izlenen **üç eksenin kendi arasında** aynen duruyor

`hasUntrackedConstraintChange` (`:354-356`) yalnızca `enum`/`type`/`pattern` **dışındaki**
bir farkı arar. İki **izlenen** eksen aynı anda, **zıt yönlerde** değişirse bu kontrol
`false` döner ve `:390-392` ilk konuşan eksenin sonucuyla erken dönülür — tur 1'de
bulduğum ve `docs/api-versioning.md:199-209`'da yazılı olan desenin birebir aynısı.

**Ölçülmüş karşı vaka (elle izlendi):**
`before = {"type":"string","enum":["a","b"]}` → `after = {"type":"string","enum":["a","b","c"],"pattern":"^[ab]$"}`

1. `isSchemaEqual` → false.
2. `stripTrackedAxisKeys` her iki tarafı da `{}`'e indirger (değişen anahtarların ikisi
   de `TRACKED_AXIS_KEYS` içinde, `:339`) ⇒ `hasUntrackedConstraintChange` → **false**,
   `:386` dalı atlanır.
3. `compareEnumAxis` → `before ⊂ after` ⇒ **`WIDENED`** ⇒ `:392` **erken döner**.
4. `comparePatternAxis` (pattern **EKLENDİ** ⇒ `NARROWED`, `:322`) **hiç çağrılmaz.**

Sonuç: girdi ekseninde `INPUT_TYPE_WIDENED` / **MINOR**. Gerçek sınıf **MAJOR** —
önceden geçerli olan `"c"` değeri yeni `pattern` tarafından reddediliyor. Aynı sınıf
`type` GENİŞLEDİ + `pattern` EKLENDİ ve `enum` GENİŞLEDİ + `type` DARALDI
kombinasyonlarında da üretilir. 35 testin hiçbiri **iki izlenen ekseni aynı alanda
aynı anda** oynatmıyor (hepsini taradım) ⇒ eksik negatif test.

**Önerilen düzeltme (kendi güvenlik etkisi ÖLÇÜLDÜ):** üç ekseni de **değerlendir**,
sonra katla: herhangi biri `NARROWED` ise `NARROWED`; değilse herhangi biri `WIDENED`
ise `WIDENED`; değilse `UNCHANGED` (mevcut son fail-closed ağı `:408` korunur).
_Etki ölçümü:_ yalnızca bazı `WIDENED` sonuçlarını `NARROWED`'a çevirebilir, tersi
**matematiksel olarak imkânsız** (`NARROWED` baskın) ⇒ monoton sıkılaştırma, tur 1'deki
kısıtla uyumlu. `WIDENED` bekleyen üç testi (`:435-451`, `:453-469`, `:471-485`) elle
izledim: üçünde de diğer iki eksen `UNCHANGED`/`null` ⇒ sonuç değişmez. ⚠ Koşturulmadı.
**Sorumlu:** `backend`.

---

### S3 — [SEV: medium] `packages/trpc/src/contract/classify-contract-change.ts:619-620` (+ değer okumaları `:659-660`, aynı sınıf `:346-349`) — `in` operatörü prototip zincirini yürüyor (T-023'ün birebir aynı hata sınıfı)

```ts
const existedBefore = fieldName in beforeProperties   // :619
const existsAfter = fieldName in afterProperties      // :620
```

`beforeProperties`/`afterProperties` `readSchemaProperties`'ten gelir (`:171-177`) ve
`Object.prototype`'ı miras alan düz nesnelerdir. `allFieldNames` ise **yalnızca kendi
anahtarlardan** kurulur (`Object.keys`, `:613-616`). ⇒ `toString`/`constructor`/
`valueOf`/`hasOwnProperty` adlı bir alan, **bulunmadığı tarafta da** "zaten vardı"
görünür ve `FIELD_ADDED`/`FIELD_REMOVED` dalları **atlanır**.

**Erişilebilirlik ölçümü (istenen):** `docs/api-contract-surface.json` üzerinde
`"(toString|constructor|valueOf|hasOwnProperty|__proto__|isPrototypeOf|propertyIsEnumerable|toLocaleString)"\s*:`
deseniyle tarama → **0 eşleşme**. ⇒ **bugün üretimde erişilebilir DEĞİL.** Ancak
`z.object({ toString: z.string() })` geçerli TypeScript/Zod'dur ve bu alan adı bir
JSON API'sinde makul olmasa da yasaklı değildir; kapı bunu **yakalamaz**.

**Sonucun ölçümü — neden `high` değil, `medium`:** Dalı atlanan alan, alt taraftaki
kısıt karşılaştırmasına düşer (`:658-661`). Orada miras alınan değer okunur
(`beforeProperties['toString']` → yerleşik **fonksiyon**); `canonicalizeJsonValue`
fonksiyonu olduğu gibi döner (`canonicalize.ts:41-42`'de `typeof fn === 'function'`
`isJsonRecord`'u geçemez) ve `JSON.stringify(fn)` → `undefined` ⇒ gerçek şemaya **asla**
eşit olmaz ⇒ `NARROWED` ⇒ **MAJOR**. Yani genel `severity` **tesadüfen** MAJOR'da kalır.
Ölçülmüş sonuçlar:

| Senaryo (alan adı `toString`) | Beklenen | Gerçek | Not |
| ---- | ---- | ---- | ---- |
| girdiye ZORUNLU eklendi | `INPUT_REQUIRED_FIELD_ADDED`/MAJOR | `INPUT_FIELD_BECAME_REQUIRED`/MAJOR + `INPUT_TYPE_NARROWED`/MAJOR | **reason kodu yanlış** |
| girdiye OPSİYONEL eklendi | `INPUT_OPTIONAL_FIELD_ADDED`/MINOR | `INPUT_TYPE_NARROWED`/MAJOR | aşırı-sıkı |
| girdiden ZORUNLU kaldırıldı | `INPUT_FIELD_REMOVED`/MAJOR | `INPUT_FIELD_BECAME_OPTIONAL`/MINOR + `INPUT_TYPE_NARROWED`/MAJOR | **reason kodu yanlış** |

⇒ Zarar **sınıf** değil **teşhis**: `reason` kodu her vakada yanlış. Bu önemsiz değil —
`docs/api-versioning.md:250-263` ve §7'nin "gerekçeli indirgeme" prosedürü operatörü
**kodun kendisine** bakmaya yönlendiriyor. Üstelik doğruluk bir **tesadüfe** (miras
alınan değerin asla bir şemaya kanonik eşit olmamasına) dayanıyor — tasarıma değil.

**Önerilen düzeltme ve kendi güvenlik etkisinin ÖLÇÜMÜ (T-023 dersi):**
`in` yerine `Object.keys(beforeProperties).includes(fieldName)` (veya döngüden önce iki
`Set` kurmak); ayrıca `:658-661`'deki değer okumalarının yalnızca kendi anahtar varsa
yapılması. ⚠ **Bu öneri monoton sıkılaştırma DEĞİLDİR** ve bunu gizlemiyorum: yukarıdaki
tablonun **ikinci satırı** `MAJOR` → `MINOR`'a döner (tesadüfen aşırı-sıkı olan sonuç
**doğru** sonuca iner). Net etki: teşhis doğruluğu artar, tek bir yapay vakada sıkılık
azalır; diğer iki satırda sınıf aynı kalır, `reason` düzelir. Üçüncü satırda sınıf
`MAJOR` olarak **korunur** (artık doğru koddan: `INPUT_FIELD_REMOVED`).
**Aynı sınıf, bağımsız erişilebilir değil:** `stripTrackedAxisKeys:346-349`'da
`rebuilt[key] = schema[key]` — `key === '__proto__'` olsaydı anahtar oluşturmak yerine
`rebuilt`'in **prototipini** değiştirirdi (sessiz veri kaybı). `Object.fromEntries`
(CreateDataProperty semantiği) bu sınıfı kapatır. JSON Schema anahtar kümesinde
`__proto__` bulunmadığı için bugün erişilemez; aynı düzenlemede kapatılması makul.
**Sorumlu:** `backend`.

---

### S4 — [SEV: medium] `docs/api-versioning.md:194-243` — §9 "Bilinen kör noktalar" maddeleri 1, 2 ve 3 artık **var olmayan davranışı** anlatıyor; satır referansları ölü

Üç madde de düzeltme turu 1 öncesinin koduna atıf yapıyor ve operatöre **yanlış**
talimat veriyor:

- `:200-201` → `classify-contract-change.ts:311-335` ve `:262-296`. Bugünkü dosyada
  `:311` `compareTypeAxis`'in gövdesi, `compareFieldConstraint` ise `:381-409`.
- `:207` → _"sınıflandırıcı bu vakada `INPUT_TYPE_WIDENED` / `MINOR` raporlar"_
  (`regex(/^[A-Z]+$/)` → `min(3)`). **Yanlış:** `classify-contract-change.test.ts:764-780`
  artık aynı vaka için `INPUT_TYPE_NARROWED` / **MAJOR** iddia ediyor.
- `:220` → `:525-533`; `:235` → `:520-522` (kaldırılan fail-open erken dönüş). Bugünkü
  `:520` `case 'OUTPUT_FIELD_BECAME_REQUIRED':`.
- `:231-240` → _"sessizce hiçbir fark bildirmez (fail-open)… Bu senaryoyu gözle kontrol
  etmeden sınıflandırıcıya güvenmeyin."_ **Yanlış:** F2 kapandı, `:707-741`'de üç test
  bunu kanıtlıyor.

Risk sadece bayatlık değil: §7'nin "gerekçeli indirgeme" prosedürü bu bölümü kaynak
alıyor ⇒ operatör, bugün **doğru** üretilmiş bir `MAJOR`'ı §9.1'e dayanarak `MINOR`'a
indirebilir (yanlış sürümleme). ⚠ Maddeler kendilerini _"düzeltme sonrası güncellenmeli"_
diye işaretlemiş olsa da metin **bugün yanlış** ve `docs` fazı gate'ten sonra koşuyor —
bu yüzden bulgu olarak bırakıyorum, görmezden gelinmesin.
**Düzeltme:** üç maddeyi bugünkü davranışa göre yeniden yaz; S1 ve S2'deki **kalan**
kör noktaları (kök düğüm, izlenen-eksenler-arası gölgeleme) yerlerine koy. §10'un 17
kod tablosu **doğru** (union'ları saydım: 3 + 14), dokunulmasın.
**Sorumlu:** `docs`.

---

## 3. Tur 1'in dört `low`'u — durum (yenileri doğdu mu?)

| # | Tur 1 `low` | Durum | Ölçüm |
| - | ----------- | ----- | ----- |
| L1 | Tip koruyucu kopyaları | ⚠ **AÇIK — bir kopya ARTTI** | `isUnknownArray` **3** kopya: `canonicalize.ts:36`, `classify-contract-change.ts:158`, `build-contract-surface.ts:142`. Kayıt koruyucusu **3** kopya: `canonicalize.ts:41`, `classify-contract-change.ts:162`, **YENİ** `contract-surface.test.ts:385` (`isPlainRecord`). `hasProperty` **4** kopya: `build-contract-surface.ts:109`, `contract-surface.test.ts:77`, `authz-consistency.test.ts:64`, `harness.ts:709`. ⇒ bu turda **+1**. Her kopyanın başında gerekçe yorumu var (bilinçli), ama sayı artıyor — vade v0.0.23. |
| L2 | `assertNever` modül değil | ⚠ **AÇIK** | `classify-contract-change.ts:149` hâlâ dosya-yerel kopya, `:142-147`'de paket yönü gerekçesi yazılı. Dört çağrı yeri (`:429,:576,:686,:706,:804` — beş). Dokunulmadı, beklendiği gibi. |
| L3 | `test:contract` sınıflandırıcıyı kapsamıyor | ⚠ **AÇIK — değişmedi** | `packages/trpc/package.json:28`: `"test:contract": "vitest run src/__tests__/contract-surface.test.ts"`. Tek dosya. `backend`'in raporladığı **31/31**, tam olarak `contract-surface.test.ts`'in test sayısı (saydım: 4+3+5+3+5+2+1+5+3 = 31) ⇒ sınıflandırıcının **35** testi `test:contract` dışında. `guards.sh:1289-1307` yalnızca görevi **sahiplenen paket kümesini** pinliyor, dosya desenini değil ⇒ desen daraltılsa guards yeşil kalır. `pnpm test` kapsıyor; bu yüzden `low`. |
| L4 | `index.ts` export yasağının mekanik kapısı kısmi | ❓ **YENİDEN ÖLÇÜLMEDİ** | `scripts/guards.sh`'ın yalnızca `test:contract` adımını (`:1225-1360`) okudum; export yasağı taramasını bu turda doğrulamadım. Dosya başı yasak notu `classify-contract-change.ts:11-23`'te duruyor, kaldırılmamış. Bkz. DOĞRULANAMADI. |

**Yeni `low`'lar (bu turda doğdu):**

- **[SEV: low]** `classify-contract-change.ts:341-356` + `docs/api-versioning.md:194-198`
  — alan seviyesindeki **dizi** düğümleri (`docs/api-contract-surface.json:89-92`,
  `job.list` girdisindeki `status`) artık `items` izlenmediği için `items.enum`
  **hangi yönde değişirse değişsin** `hasUntrackedConstraintChange` üzerinden
  `NARROWED`/MAJOR verir. Fail-closed (zararsız) ama **belgelenmemiş**: bir enum
  genişletmesi girdi tarafında MINOR beklenirken MAJOR raporlanacak. §9'a bir satır.
  Vade: v0.0.23. Sorumlu: `docs`.
- **[SEV: low]** `contract-surface.test.ts:413-430` ve `:450-468` — (a) ve (c) kapıları
  `walkJsonEntries`'in gerçekten gezdiğine dair **kendi** kanıtını taşımıyor; tek
  vacuous-olmama kanıtı (b)'deki `expect(defaultValues.length).toBeGreaterThan(0)`
  (`:444`). (b) silinirse/ayrışırsa (a) ve (c) sessizce totolojik yeşile döner.
  (a)'nın yasak anahtar listesi de sabit dört eleman — `$id`/`deprecated`/`$defs`
  kapsam dışı. Vade: v0.0.23. Sorumlu: `qa`.

---

## 4. TAM tarama — yeni yüzeyde ihlal var mı

| Kontrol | Sonuç | Ölçüm |
| ------- | ----- | ----- |
| `any` / `@ts-ignore` / `@ts-expect-error` / `eslint-disable` | **0** | `packages/trpc/src/contract/**` taraması: yalnızca **yorum** içinde `any` geçiyor (`build-contract-surface.ts:38,137,139`, `canonicalize.ts:29,35,54`, `classify-contract-change.ts:155`). Kod eşleşmesi yok. `classify-contract-change.test.ts`: **0 eşleşme**. |
| Gerekçesiz `as` | **0** | Tek `as`: `contract-surface.test.ts:143` `as const` (literal daraltma, tip zorlaması değil). |
| Saflık (yeni fonksiyonlar) | **PASS** | `resolveFieldDiffTarget:245-258`, `stripTrackedAxisKeys:341-351`, `hasUntrackedConstraintChange:354-356`, `isJsonSchemaNodeOrNull:309-311` — hiçbiri I/O yapmıyor, `process`'e dokunmuyor, girdiyi mutasyona uğratmıyor (`stripTrackedAxisKeys` **yeni** nesne kurar). Node yerleşik ithalatı yok. |
| Exhaustive switch + `assertNever` | **PASS** | `:423-431` (`ContractChangeIo`), `:456-577` (`DiffInput.reason`, 14+3 dal), `:662-687` (`FieldConstraintChange`), `:698-707` (severity), `:796-805` (scope). Yeni kod hiçbir switch'i bozmamış; `FieldChangeReason` genişlememiş ⇒ `buildDiff` eksiksiz. |
| Katman / bağımlılık yönü | **PASS** | `classify-contract-change.ts` yalnızca `./build-contract-surface.js` (**`import type`**, `:55-60`) ve `./canonicalize.js` (`:61`) ithal eder. `apps/*`'a bağımlılık yok, döngü yok. `packages/ui`/`trpc` sınırı etkilenmemiş. |
| Sağlayıcı dallanması | **PASS** | Yok; konu dışı. |
| Yutulan hata | **PASS** | `catch` bloğu **0**; `assertNever` gerçekten fırlatıyor (`:149-151`). |
| İsimlendirme (CLAUDE.md §4) | **PASS** | Dosyalar kebab-case; tipler PascalCase; `is`/`has`/`can` öneki doğru (`isSchemaEqual`, `hasUntrackedConstraintChange`, `isJsonSchemaNodeOrNull`); sabit `TRACKED_AXIS_KEYS` SCREAMING_SNAKE_CASE (`:339`); `reason` kodları SCREAMING_SNAKE_CASE. `data`/`temp`/`handle`/`process` gibi belirsiz ad **yok**. |
| Ölü kod | **PASS (sınırlı)** | `:405-408` ve `:753-757` "ulaşılamaz" dalları **gerçekten ulaşılabilir** (bozuk `type` değerleri her iki ekseni de `null` yapabilir) ⇒ ölü değil, güvenlik ağı. Kullanılmayan export yok: `ContractChangeIo:416` modül içinde (`:419,:451,:587`), `ContractChangeScope:74` `scopeLabel:795`'te kullanılıyor. |
| Yorum kalitesi | ⚠ **S4** | Dosya içi yorumlar *neden*i anlatıyor ve Türkçe; `:228-243`, `:330-337`, `:358-379`, `:591-603` düzeltmelerin gerekçesini taşıyor. ⚠ **Tek hatalı iddia:** `:240` _"var olan hiçbir sonucu GEVŞETMEZ"_ — S1(a) ile çürütüldü. Harici doküman bayatlığı S4'te. |
| Tek sorumluluk / dosya bölünmesi | **PASS — tur 1 kararı 842 satırda da geçerli** | Dosya tek bir sorumluluk ailesini taşıyor: architect'in kural tablosu. `buildDiff:455-578` tablonun **tek kaynağı**; bölmek tabloyu dağıtır ve exhaustive switch garantisini zayıflatır. `formatContractChangeReport:813-841` sunum tarafıdır ama 29 satır ve saf ⇒ ayrı modül **gereksiz katman** olur (KISS). Bölünme **önerilmiyor**. |

---

## 5. ÖLÇÜMLER

- **İncelenen dosya:** 8 (üretim 3, test 2, artefakt 1, doküman 1, betik 1)
- **`any` sayısı:** **0** (kod); 7 eşleşme **yalnızca yorum metninde**
- **`@ts-ignore` / `eslint-disable`:** 0 · **Gerekçesiz `as`:** 0 (`as const` 1)
- **En büyük fonksiyon:** `buildDiff` — **124 satır** (`classify-contract-change.ts:455-578`).
  İkinci: `diffProcedureIo` **107** (`:585-691`). Üçüncü: `classifyContractChange` **55** (`:738-792`).
- **`classify-contract-change.ts`:** 842 satır (tur 1: 758 ⇒ **+84**)
- **Test sayısı (saydım, koşturmadım):** `classify-contract-change.test.ts` **35** ·
  `contract-surface.test.ts` **31** · toplam **66**
- **`test:contract` kapsamı:** 31 test (yalnızca `contract-surface.test.ts`) — 35 test dışarıda
- **Artefakt taraması:** prototip-adlı alan **0 eşleşme** · kök `type:"array"` **1** (`session.list`) ·
  alan seviyesi `type:"array"` **5** · izlenmeyen kısıt anahtarları **47 eşleşme**
- **Bulgu dağılımı:** high **1** · medium **3** · low **5** (3 devreden + 2 yeni)
- **FAIL gerekçesi:** ≥1 `high` **ve** ≥3 `medium` (AGENT_BASELINE.md §4 — iki koşul da sağlandı)

## 6. DOĞRULANAMADI

1. **Hiçbir komut çalıştırılmadı** — `Bash` aracım yok. `pnpm test`, `pnpm test:contract`,
   `pnpm lint`, `pnpm typecheck` sonuçları **bu rapordan gelmiyor**; `backend`'in
   bildirdiği 66/66, 31/31 ve "eslint/tsc temiz" **bağımsız olarak doğrulanmadı**.
2. **`backend`'in üç mutasyon kanıtı tekrarlanmadı.** F1/F2/F3 kapanışını **kaynak
   okuyarak** doğruladım; "önce kırmızı / sonra yeşil" iddiasını yeniden üretmedim.
3. **S1 ve S2'nin önerilen düzeltmelerinin mevcut 66 testi kırmadığı statik izlemeyle**
   çıkarıldı, koşumla **değil**. Uygulayan ajan mutasyon kanıtını kendisi üretmeli.
4. **S1(a), S1(b), S2 ve S3'ün karşı vakaları elle izlendi, çalıştırılmadı.** Hiçbiri
   için test dosyasına vaka eklenmedi (gate ajanı kod yazmaz).
5. **Tur 1'in L4'ü (`index.ts` export yasağının mekanik kapısı) yeniden ölçülmedi** —
   `guards.sh`'ın yalnızca `:1225-1360` aralığını okudum.
6. **Makine yükü ölçülmedi** (`docker ps`, load avg) — koşum yapılmadığı için konu dışı,
   ama AGENT_BASELINE.md §4 ölçüm disiplini gereği açıkça yazıyorum.
7. **Prettier biçimlendirmesi yapılmadı** — `Bash` yok; AGENT_BASELINE.md §5 gereği bu
   dosyanın `format:check` uyumunu **Orkestratör** kapatmalı.
