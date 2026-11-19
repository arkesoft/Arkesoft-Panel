# T-026 — `solid` gate raporu, düzeltme turu 3

Tarih: 2026-11-19 · Sürüm: ROADMAP v0.0.22 · Kapsam: **TAM** (tur 1 FAIL, tur 2 FAIL)

```
GATE: solid
SONUÇ: FAIL
```

**FAIL gerekçesi (AGENT_BASELINE.md §4):** 1 `high` (S5). `medium` sayısı 2 ⇒ tek başına
FAIL etmezdi; karar `high`'tan geliyor.

⚠ **Hiçbir komut çalıştırılmadı** — `Bash` aracım yok. Aşağıdaki her iddia **kaynak
okuyarak** üretildi; `backend`'in mutasyon kanıtları **yeniden üretilmedi**, akıl
yürütmeyle izlendi (bkz. §7 DOĞRULANAMADI).

---

## 1. S1–S4'ün kapanış durumu (bağımsız doğrulama)

| # | Durum | Nasıl ölçtüm |
| - | ----- | ------------ |
| **S1(a)** kök şekil takası (object↔array) | ⭐ **KAPANDI** | `classify-contract-change.ts:679-692` kök-şekil koruması. Elle izledim: `before={type:"object",properties:{id,label},required:[…]}`, `after={type:"array",items:{…}}` ⇒ `stripRootStructuralKeys` (`:295-300`) `properties`/`required`/`items`'i atar ⇒ `{type:"object"}` vs `{type:"array"}` ⇒ `isSchemaEqual` false ⇒ `OUTPUT_TYPE_NARROWED`/MAJOR. Testi de doğruladım: `classify-contract-change.test.ts:806-822` (`onlyDiff` ⇒ **tek** diff, yani alan döngüsü ek gürültü üretmiyor). |
| **S1(b)** kök `type`/`additionalProperties`/`$schema` | ⭐ **KAPANDI** | Aynı süzgeç. `:844-883` testi `additionalProperties:false` kaldırılmasını MAJOR'a bağlıyor. ⭐ Ayrı okuyucu yazılmaması **doğru karar**: tek süzgeç iki yarıyı da kapsıyor, ikinci bir "kök eksen listesi" bakım yükü doğurmuyor. |
| **S2** izlenen↔izlenen eksen gölgelemesi | ⭐ **KAPANDI, monotonluk DOĞRULANDI** | `:436-447`. Üç eksen bir **dizi literalinde** çağrılıyor ⇒ üçü de **her zaman** değerlendirilir; `&&`/`??`/erken `return` **yok**. Monotonluk kanıtı (§3). |
| **S3** `in` operatörü / prototip okuması | ⭐ **DOSYA İÇİNDE KAPANDI**, ⚠ **paket içinde değil** | `classify-contract-change.ts`'te gerçek `in` kullanımı **0** (tek eşleşme `:706` yorum metni). ⚠ AMA kardeş dosyalarda **5** gerçek kullanım duruyor (S8) ve `canonicalize.ts:69` düzeltmenin yarısını **aşağı akışta geri alıyor** (S6). |
| **S4** `docs` §9 bayatlığı | ⚠ **YENİDEN BAYATLADI** | §9'un bu turdaki hâli, tur 2'nin düzeltmelerini **önceki** duruma göre anlatıyor (S7). |

### ⚠⚠ S1'in iki alt sorusu (Orkestratör'ün özel talebi)

**(i) Koruma doğru yerde mi?** ⭐ **Evet.** `resolveFieldDiffTarget`'ı değiştirmemek ve
kıyaslamayı **orijinal** köklere uygulamak doğru ayrım: hedef çözümü "alanları nerede
arayacağım" sorusunu, kök-şekil koruması "kökün kendisi değişti mi" sorusunu yanıtlıyor;
ikisi **farklı sebeplerle** değişecek ⇒ ayrı tutulmaları doğru (F1'in dizi-kökü davranışı
korunmuş: `:685-697` testi hâlâ tek `OUTPUT_FIELD_REMOVED` veriyor).

**(ii) Yeni bir gevşetme doğurdu mu?** ⭐ **Düzeltmenin kendisi hayır** — koruma yalnızca
`diffs.push` yapar, hiçbir dalı atlamaz veya bastırmaz, dolayısıyla **hiçbir** önceki
sonucu hafifletemez. ⚠⚠ **AMA korumanın `null` istisnası eski bir gevşetmeyi açık
bırakıyor ve yorum onu "kapalı" diye anlatıyor** ⇒ **S5**.

---

## 2. BULGULAR

### S5 — [SEV: high] `packages/trpc/src/contract/classify-contract-change.ts:679` (+ yanlış iddia `:675-678`) — `null`↔nesne-olmayan kök geçişi **hâlâ** sessizce `PATCH`; yorum "kapalı" diyor

`:679`'daki koruma `isJsonRecord(beforeSchema) && isJsonRecord(afterSchema)` şartına bağlı.
`:675-678` yorumu bu istisnayı şöyle gerekçelendiriyor:

> "İki taraftan biri record DEĞİLSE (`null`↔nesne geçişi, F2'nin alanı) bu kontrol ATLANIR
> — **o geçiş zaten alan döngüsünde doğru sınıflandırılıyor**"

⚠⚠ **Bu iddia yalnızca nesne-köklü şemalar için doğru.** Elle izlediğim karşı vaka:

```
before: input = null                    (bugünkü 5 prosedürden biri, ör. session.me)
after:  input = { type: "string" }      (.input(z.string()) eklendi)

:679  isJsonRecord(null) === false            ⇒ kök-şekil koruması ATLANIR
:663  resolveFieldDiffTarget(null)   → null   (isJsonRecord değil, olduğu gibi döner)
:664  resolveFieldDiffTarget({type}) → kendisi ("properties" YOK, "items" YOK)
:694  readSchemaProperties(null)     → {}
:695  readSchemaProperties({type})   → {}     ("properties" anahtarı YOK)
:699  allFieldNames                  → ∅      ⇒ döngü HİÇ ÇALIŞMAZ
sonuç: 0 diff ⇒ severity PATCH
```

Gerçek sınıf **MAJOR** (argümansız bir prosedüre **zorunlu** girdi eklendi). Aynı delik
simetrik olarak da açık: `output: {anyOf:[…]}` → `null` (çıktı şeması kaldırıldı),
`input: {type:"string"}` → `null`, `output: {type:"array", items:{type:"string"}}` → `null`.
Ortak koşul: **bir taraf `null` VE diğer tarafın çözülmüş hedefi `properties` taşımıyor**
(ilkel kök, `z.union`→`anyOf`, ilkel dizisi, tuple).

**Neden `high`:**

1. ⭐ Bu, tur 2'de `high` verdiğim **S1(a) ile birebir aynı davranış sınıfı**: gerçek bir
   kırıcı değişiklik için sınıflandırıcının **olumlu** bir "fark yok" cevabı üretmesi.
   Rapor metni `SÖZLEŞME SAPMASI — 0 fark` + `SONUÇ: PATCH — public API sözleşmesinde
   izlenen bir fark yok` olur (`:909`, `:919`) — operatör aktif olarak **yanlış
   bilgilendirilir**.
2. ⚠ Yorum (`:675-678`) vakayı **kapalı ilan ettiği** için bir sonraki geliştirici burayı
   yeniden ölçmez. Tur 2'nin ölçülmüş dersi tam buydu (`:241-259`'da kaldırılan
   "gevşetmez" iddiası).
3. ⭐ **Dürüst sınır — severityi şişirmemek için yazıyorum:** Katman 2 (bayt testi,
   `contract-surface.test.ts:276-283`) ve Katman 1 bağlantı testi (`:333-343`) bu
   değişiklikte **yine de kırmızı** yanar ⇒ değişiklik CI'dan **görünmez geçmez**.
   Hatalı olan **sınıf etiketi**, tespitin kendisi değil. Severityi yine de `high`
   tutuyorum: AC-36/AC-37'nin (ve `A1` varsayımının) tüm amacı **sınıflandırma**;
   "kırıldı"yı Katman 2 zaten söylüyordu, bu modülün var oluş sebebi o değil.
4. ⚠ Erişilebilirlik dürüstçe: **bugün sıfır** — 17 prosedürün 12'sinde girdi nesne
   köklü, 5'inde girdi `null` (`platform.session`, `session.list`, `session.me`,
   `storefront.currentTenant`, `tenant.current`) ve hiçbirinde ilkel/union kök yok
   (`routers/*.ts` `.input(`/`.output(` taraması). Delik, o beş prosedürden birine
   `.input(z.string())`/`.output(z.union([…]))` eklendiği **ilk** gün açılır.

**Önerilen düzeltme — kendi etkisini ölçtüm (T-023 tuzağı):**

⚠ **Naif çözüm YANLIŞ:** `beforeSchema ?? {}` / `afterSchema ?? {}` ile normalize etmek
kök-şekil korumasını **her** `null`↔nesne geçişinde ateşler ⇒ `{}` vs `{type:"object"}`
farklı ⇒ F2'nin iki testi (`classify-contract-change.test.ts:707-723` ve `:725-741`,
ikisi de `onlyDiff` kullanıyor) **1 diff beklerken 2 diff alır ve kırılır**; üstelik
`:676-678`'in kaçınmak istediği **mükerrer kök diff'i** gerçekten doğar.

⭐ **Dar çözüm:** `null`↔non-null geçişinde, **non-null tarafın çözülmüş hedefi
`properties` taşımıyorsa** tek bir `(root)` diff'i ekle (alan döngüsü o durumda zaten
sıfır diff üretiyor, mükerrerlik yapısal olarak imkânsız). Ölçülen yarıçap — testleri
sayarak çıkardım:

| Etkilenen test | Bugünkü diff sayısı | Dar çözümden sonra |
| -------------- | ------------------- | ------------------ |
| `:707-723` (null→`z.object({id})`) | 1 | **1** (hedefte `properties` VAR ⇒ ek diff yok) |
| `:725-741` (`z.object({id})`→null) | 1 | **1** (aynı) |
| `:743-753` (null→null) | 0 | **0** (geçiş yok) |
| Diğer 72 test | — | **değişmez** (hiçbirinde `null`↔ilkel/union geçişi yok) |

⇒ **0 mevcut test kırılır, 1 delik kapanır.** Ayrıca `diffProcedureIo` 143 satıra çıktı
ve iki işi birden yapıyor; korumayı saf bir `diffRootShape(procedurePath, io, before,
after): readonly ContractChangeDiff[]` fonksiyonuna çıkarmak hem `null` istisnasını
**açıkça test edilebilir** kılar hem de SRP'yi düzeltir (bkz. §5).

**Sorumlu ajan:** `backend` (+ `docs`: §9'a kalan koşulun yazılması).

---

### S6 — [SEV: medium] `packages/trpc/src/contract/canonicalize.ts:69` — S3'ün kapattığı `__proto__` sınıfı **aşağı akışta açık**; iki düzeltmeyi de etkisiz bırakıyor

`backend` S3 için **iki** yerde (`stripRootStructuralKeys:295-300`,
`stripTrackedAxisKeys:383-389`) `rebuilt[key] = …` yerine `Object.fromEntries` kullandı ve
gerekçesini uzun uzun yazdı (`:283-293`, `:374-379`): _"köşeli parantez ATAMASI
`k === '__proto__'` durumunda ÖZ anahtar YARATMAZ, nesnenin [[Prototype]]'ını DEĞİŞTİRİR"_.

⚠ **Aynı atama, aynı sınıf, düzeltilmemiş** — ve tam olarak bu iki fonksiyonun çıktısının
**aktığı** yerde:

```ts
// canonicalize.ts:66-72
const canonical: Record<string, unknown> = {}
for (const key of Object.keys(value).sort()) {
  canonical[key] = …          // ⚠ key === '__proto__' ⇒ öz anahtar YARATILMAZ
}
```

Akış: `stripTrackedAxisKeys` / `stripRootStructuralKeys` → `isSchemaEqual` (`:277-281`) →
`canonicalizeJsonValue` → `JSON.stringify`. ⇒ Bir şemada literal `__proto__` **öz
anahtarı** varsa iki strip fonksiyonu onu özenle **korur**, `canonicalizeJsonValue` bir
satır sonra **düşürür**; iki farklı şema eşit görünür ⇒ fail-OPEN. Aynı fonksiyon
`generate-contract-surface.ts:235`'te **artefaktı üretirken** de çağrılıyor ⇒ anahtar
sürüm kontrolündeki dosyaya da hiç girmez (sessiz veri kaybı).

⚠ **Erişilebilirlik dürüstçe düşük:** bugün 0 eşleşme; `z.object({['__proto__']: …})`
gibi egzotik bir yazım ya da artefaktın elle düzenlenmesi gerekir (`JSON.parse`
`__proto__`'yu **öz** anahtar olarak üretir — diskten okunan belge bu yoldan gelir,
`contract-surface.test.ts:334`). `medium` demem bundan; sınıf olarak S3 ile **aynı**.

**Önerilen düzeltme:** `canonicalize.ts:66-73`'ü `Object.fromEntries(...)` ile kur
(davranış aynı, anahtar sırası `Object.keys().sort()`'tan geliyor) **veya**
`Object.create(null)` ile başlat. ⭐ Etki ölçümü: `canonicalizeJsonValue`'nun 5 testi
(`contract-surface.test.ts:227-258`) yalnızca sıralama ve mutasyonsuzluk iddia ediyor;
`Object.fromEntries` ikisini de korur ⇒ **0 test kırılır**. **Sorumlu:** `backend`.

---

### S7 — [SEV: medium] `docs/api-versioning.md:237-245`, `:246-258`, `:280-288` — §9 bu kez **kapanmış** kör noktaları "açık" diye anlatıyor

Tur 2'de §9'un **var olmayan davranışı** anlattığını yazmıştım; metin düzeltildi, ama aynı
turda `backend` kodu da düzeltti ⇒ belge yine **ters yönde** bayat:

| §9 maddesi | Belgenin dediği | Kodun gerçeği |
| ---------- | --------------- | ------------- |
| 1, ikinci yarı (`:237-245`) | "İzlenen↔izlenen eksen gölgelemesi **HÂLÂ AÇIK** … hâlâ erken dönebilir … **elle** kontrol edin" | `:436-447` üç ekseni **her zaman** katlıyor; erken dönüş **yok** (S2 kapandı) |
| 2 (`:246-258`) | "Kök şema düğümünün kendisi **hâlâ hiçbir eksende kıyaslanmıyor** … `additionalProperties: true → false` hâlâ görünmez kalabilir" | `:679-692` + `:844-883` testi: tam o örnek artık **MAJOR** |
| 6 (`:280-288`) | "`walkJsonEntries` dizi elemanlarını ziyaret **etmiyor** (yeni, henüz açık)" | `contract-surface.test.ts:413-419` artık `visit(\`${arrayItemKey}[]\`, item)` çağırıyor; `:497-518` testi kanıtlıyor |

⚠ Operatör zararı: madde 1 **elle kontrol** emri veriyor (gereksiz iş) ve madde 2 bir
operatörü, gerçekte MAJOR raporlanacak bir kök daralmasını "görünmez" sanmaya itiyor.
⭐ Belgenin kendisi bu güncellemeyi "`gate tur 3 PASS'ı ile` bu paragraf güncellenmeli"
(`:257-258`) diye **planlamış** ⇒ bulgu bir sürpriz değil, ama gate teslim edilen durumu
değerlendirir: bugünkü hâliyle yayına giderse belge yanlıştır. ⭐ Ayrıca §9 madde 2 artık
**S5'in** kalan koşuluyla (yalnızca `null`↔ilkel/union kökü) yeniden yazılmalı — maddeyi
tamamen silmek **yanlış** olur.

**Sorumlu:** `docs`. ⚠ `docs` §10 tablosu **doğru** (17 kod, bağımsız saydım:
`ProcedureChangeReason` 3 + `FieldChangeReason` 14) — oraya dokunulmasın.

---

### S8 — [SEV: low] `in` yasağının **mekanik koruması yok** ve yasak kardeş dosyalarda **zaten ihlal edilmiş** (Orkestratör ölçümü düzeltmesi)

⚠ Devralmam istenen ölçüm — _"`in` operatörü gerçek kullanımı: **0**"_ — **yalnızca
`classify-contract-change.ts` için doğru**. T-026'nın yüzeyinde **5 gerçek kullanım** var:

| Dosya:satır | Bağlam |
| ----------- | ------ |
| `packages/trpc/src/contract/build-contract-surface.ts:111` | `hasProperty` — `key in value` (**üretim kodu**, kardeş modül) |
| `packages/trpc/scripts/generate-contract-surface.ts:123` | `'buildContractSurface' in value` |
| `packages/trpc/scripts/generate-contract-surface.ts:162` | `'canonicalizeJsonValue' in value` |
| `packages/trpc/scripts/generate-contract-surface.ts:203` | `'serializeContractSurface' in value` |
| `packages/trpc/src/__tests__/contract-surface.test.ts:79` | `hasProperty` kopyası |

⭐ **Hiçbiri bugün zararlı değil** (hepsinde anahtar derleme-zamanı **literal**:
`_def`/`type`/`inputs`/`output`/`procedures` ve üç modül dışa aktarımı; hiçbiri
`Object.prototype`/`Function.prototype` üyesi değil — tek tek kontrol ettim). ⇒ `low`.
⚠ Ama "kod artık temiz" önermesi **yanlış**, ve asıl soruyu yanıtlıyor: **koruma yorumdan
ibaret ve yorum kendi dosyasının dışına geçmiyor.**

**Kendi önerimin etkisini ölçtüm (T-023'ün dersi):**

- ❌ **`guards.sh`'e grep adımı ÖNERMİYORUM.** ` in ` jetonunu arayan bir tarama
  `classify-contract-change.ts:706`'daki **kendi açıklama yorumunu** (`fieldName in
  beforeProperties`) ve `:258`, `:368`'i bulur ⇒ kalıcı False Positive
  (AGENT_BASELINE.md §5 literal-jeton kuralı). Ayrıca `include`/`join`/Türkçe metinlerde
  geçen " in " eşleşmeleri gürültü üretir.
- ⭐ **AST tabanlı ESLint kuralı doğru araç:** `no-restricted-syntax` →
  `BinaryExpression[operator='in']`, **yalnızca** `packages/trpc/src/contract/**`
  kapsamında. Yorumlar AST'de yok ⇒ öz-eşleşme **yapısal olarak** imkânsız.
  **Ölçülen yarıçap:** bu kapsamda bugün **1** eşleşme (`build-contract-surface.ts:111`)
  ⇒ ya o satır `Object.keys().includes()`'a çevrilir ya kural orayı hariç tutar.
  ⚠ Kuralı **depo geneline** açmak kapsam dışı ve pahalı: aynı deseni taşıyan **21**
  çağrı yeri ölçtüm (`packages/db` 10, `apps/api` 3, `packages/trpc` 5, diğer 3) —
  v0.0.22'nin işi değil.
- ⇒ **Tavsiyem:** bugün kural **eklenmesin**; borç satırı yazılsın (vade v0.0.23, sorumlu
  `devops`), çünkü kuralın bedeli (1 üretim satırını değiştirmek veya bir istisna yazmak)
  bugünkü faydasından (0 gerçek hata) büyük. ⚠ Eklenirse **AST**, asla grep.

---

### S9 — [SEV: low] `classify-contract-change.ts:422-425` ve `:449-452` — "matematiksel olarak ulaşılamaz" iddiası **yanlış**; dal `enum` yeniden sıralamasıyla erişilebilir

Son `return 'NARROWED'` dalı "güvenlik ağı, ulaşılamaz" diye belgeleniyor. Karşı vaka:

```
before: { type:"string", enum:["a","b"] }
after:  { type:"string", enum:["b","a"] }      // yalnızca SIRA değişti
:428 isSchemaEqual        → false   (D2: "enum" dizisi SIRALANMAZ, canonicalize.ts:70)
:432 hasUntracked…        → false   (kalan düğümler eşit)
:436 enum ekseni          → UNCHANGED (küme eşitliği sırayı yok sayar)
     type ekseni          → UNCHANGED ; pattern ekseni → UNCHANGED
:452 → NARROWED ⇒ MAJOR
```

⭐ Sonuç fail-closed (zararsız) ama (a) yorum **yanlış**, (b) davranış
**belgelenmemiş**: zararsız bir `z.enum([…])` yeniden sıralaması girdi tarafında MAJOR
raporlanır. **Düzeltme:** yorumu "ulaşılamaz" yerine "izlenen eksenlerin küme
semantiğiyle görünmeyen farklar (ör. `enum` sırası/tekrarı) buraya düşer — fail-closed"
olarak düzelt; `docs` §9'a bir satır. **Sorumlu:** `backend` + `docs`. Vade: v0.0.23.

---

### S10 — [SEV: low] `"(root)"` sentinel'i — bugün **kabul edilebilir**, ama hiçbir yerde **adlandırılmamış**

Değerlendirme (Orkestratör'ün 3. sorusu):

1. **Tip seviyesinde ayrı vaka olmalı mı?** ⭐ **Bugün hayır.** `fieldName: string`
   (`:121`) içine sentinel koymak bir model kusurudur, ama üçüncü bir diff varyantı
   (`RootLevelContractChangeDiff`) eklemenin maliyetini saydım: `ContractChangeDiff`
   birleşimi, `buildDiff`'in 14 alan dalı (`:525-618`), `formatContractChangeReport`
   (`:911-915`) ve `reasonForIo`'nun dönüş tipi — **4 dokunuş, 0 davranış kazancı**.
   KISS: erken genelleme olur. ⚠ Eşik: `(root)` dışında ikinci bir sentinel doğarsa
   (ör. `(items)`), **o zaman** varyant şart.
2. **Rapor çıktısında gerçek alan adı sanılabilir mi?** ⚠ **Evet, kısmen.** Üretilen
   satır: `[MAJOR] çıktı x.y · "(root)" tip/enum/pattern DARALDI (OUTPUT_TYPE_NARROWED)`
   — tırnak içinde, diğer alan adlarıyla **aynı biçimde**. Çarpışma teorik olarak da
   mümkün: JSON Schema `properties` anahtarı keyfi dizedir, `z.object({'(root)': …})`
   geçerlidir ⇒ iki farklı değişiklik **birebir aynı** satırı üretir.
3. ⇒ **Gereken:** (a) `docs/api-versioning.md` §10'a *"`fieldName` özel değeri: `(root)`
   — alan değil, şemanın **kök düğümü**"* satırı; (b) `classify-contract-change.ts:688`
   üstüne sentinel'in **rezerve** olduğunu söyleyen tek satır. **Sorumlu:** `docs` +
   `backend`. Vade: bu tur (S5 düzeltmesiyle **aynı dosyada ve aynı düzenlemede**
   kapanabilir ⇒ AGENT_BASELINE §4 "yolu üstündeyse kapat" istisnası).

---

### S11 — [SEV: low] `classify-contract-change.ts:258-259`, `:368-369` — `AGENT_BASELINE.md §5`'e yapılan atıf **karşılıksız**

İki yerde _"`in` operatörü KULLANILMAZ (T-023'ün prototip zinciri tuzağı,
**AGENT_BASELINE.md §5**)"_ yazıyor. Ölçtüm: `AGENT_BASELINE.md` içinde `prototip`,
`T-023` ve `in operatör` için **0 eşleşme** (§5'in 14 maddesinin hiçbiri bu konuda
değil). ⇒ Kuralı doğrulamak isteyen geliştirici belgede **hiçbir şey bulamaz**; kural
fiilen yalnızca bu yorumda yaşıyor (S8'in aynı kökü). ⚠ Ek olarak bir **katman** notu:
bir **ajan süreç dosyasını** üretim kodunun kaynağı olarak göstermek yanlış adres —
doğru yer `docs/adr/0027-*` veya dosya içi gerekçedir. **Düzeltme:** atfı ADR-0027'ye
(veya salt T-023 vakasına) çevir. **Sorumlu:** `backend`. Vade: v0.0.23.

---

## 3. S2'nin katlaması gerçekten monoton mu?

⭐ **Evet — kanıtı yazdım.** `A` = izlenen eksenlerin `null` olmayan sonuç kümesi.

- Eski davranış: `A`'nın (sabit `enum`→`type`→`pattern` sırasındaki) **ilk** elemanı.
- Yeni davranış (`:442-447`): `NARROWED ∈ A` ⇒ `NARROWED`; değilse `WIDENED ∈ A` ⇒
  `WIDENED`; değilse `:452` ⇒ `NARROWED`.

Eski sonuç `NARROWED` ise, o eleman `A`'da olduğundan yeni sonuç da `NARROWED` ⇒
`NARROWED → WIDENED` geçişi **imkânsız**. Eski `WIDENED`/`UNCHANGED` iken yeni
`NARROWED` olabilir (tam da istenen sıkılaştırma). ⇒ **Tek yönlü: WIDENED/UNCHANGED →
NARROWED.** `backend`'in "WIDENED bekleyen üç mevcut test hâlâ WIDENED" iddiasıyla da
tutarlı: `:435-451`, `:453-469`, `:471-485` testlerinde tek konuşan eksen var
(`enum` ya da `pattern`), ikinci bir eksen `NARROWED` demiyor.

⚠ **Yeni erken dönüş var mı?** **Yok.** `:436-440` dizi literali üç çağrıyı da
koşulsuz yapar; `.filter`/`.some` kısa devre yapsa bile **değerler zaten hesaplanmış**
olur. Tek erken dönüşler `:428-430` (`isSchemaEqual` ⇒ UNCHANGED, doğru) ve `:432-434`
(izlenmeyen eksen ⇒ fail-closed NARROWED, en sıkı sonuç) — ikisi de gevşetici değil.

---

## 4. Tur 2'nin beş `low`'u + yenileri

| # | Tur 2 `low` | Durum | Ölçüm |
| - | ----------- | ----- | ----- |
| L1 | Tip koruyucu kopyaları | ⚠ **AÇIK — yine +1** | `isUnknownArray` **3** (`canonicalize.ts:36`, `classify…:158`, `build…:142`), kayıt koruyucusu **3** (`canonicalize.ts:41`, `classify…:162`, `contract-surface.test.ts:385`), `hasProperty` **4**. ⚠ **YENİ risk:** `readOwnProperty` (`classify…:635`, **öz** anahtar) ile `readProperty` (`build…:116`, **prototip zincirini yürür**) aynı özellikte, **neredeyse aynı adla**, aynı pakette. Karıştırılması S3'ü geri getirir. Vade v0.0.23, sorumlu `backend`. |
| L2 | `assertNever` dosya-yerel kopya | ⚠ **AÇIK, değişmedi** | `:149-151`; gerekçe `:142-147`'de (paket yönü). 5 çağrı yeri (`:473`, `:620`, `:781`, `:801`, `:899`). |
| L3 | `test:contract` sınıflandırıcıyı kapsamıyor | ⚠ **AÇIK — oran KÖTÜLEŞTİ** | `package.json:28` hâlâ tek dosya. Saydım: `contract-surface.test.ts` **34** `it` (= Orkestratör'ün "test:contract 34" ölçümü ⇒ birebir teyit), `classify-contract-change.test.ts` **41**. ⇒ `test:contract` kapsamı 34/75; **41** test dışarıda (tur 2'de 35'ti). `pnpm test` kapsıyor ⇒ `low`. |
| L4 | `index.ts` export yasağının mekanik kapısı | ⭐ **YASAK TUTUYOR** (kapı hâlâ kısmi) | `src/index.ts`'te `contract`/`canonicalize` için **0 eşleşme**. ⚠ Mekanik kapı (`browser-entry-closure.qa.test.ts`) **çalışma zamanı kapanışını** ölçer; `classify-contract-change.ts` bugün `build-contract-surface`'ı `import type` ile çektiği için (`:55-60`) salt-tip bir export kapıyı **kırmazdı** — risk `:11-23`'te yazılı, mekanik değil. Değişmedi. |
| L5 | Alan seviyesi `items` izlenmiyor ⇒ `items.enum` her yönde MAJOR | ⚠ **AÇIK** | `stripRootStructuralKeys` `items`'i **yalnızca kökte** atıyor (`:297`); alan düğümlerinde `items` hâlâ "izlenmeyen kısıt" ⇒ `hasUntrackedConstraintChange` üzerinden NARROWED. Belgelenmedi. `docs` §9, vade v0.0.23. |
| L6 | `walkJsonEntries` (a)/(c) kapıları kendi vacuous-olmama kanıtını taşımıyor | ⚠ **KISMEN** | `contract-surface.test.ts:497-518` artık gezicinin dizi elemanını **ziyaret ettiğini** sentetik belgeyle kanıtlıyor; `:520-528` karşıt-kanıt. ⚠ Ama **gerçek** belge üzerinde koşan (a)/(c)/`:530` hâlâ yalnızca (b)'nin `toBeGreaterThan(0)`'ına yaslanıyor. Sorumlu `qa`, vade v0.0.23. |

**`stripRootStructuralKeys` + `stripTrackedAxisKeys` kopya mantık mı?** ⭐ **Hayır — ve
birleştirilmemeli.** Ortak olan yalnızca üç satırlık mekanik
(`Object.keys().filter().map()` + `Object.fromEntries`); **farklı sebeplerle değişirler**:
biri JSON Schema'nın **yapısal** anahtar kümesine (`properties`/`required`/`items`),
diğeri **izlenen eksen** listesine (`TRACKED_AXIS_KEYS`) bağlı. Yeni bir eksen izlemeye
başlamak ikincisini değiştirir, birincisini **değiştirmemelidir**. Bunları ortak bir
`omitKeys()` altında toplamak yüzeysel benzerliği kurumsallaştırır ⇒ **bulgu yazmıyorum**.

---

## 5. TAM tarama — yeni yüzey

| Kontrol | Sonuç | Ölçüm |
| ------- | ----- | ------ |
| `any` (kod) | **0** | `packages/trpc` (dist hariç) taraması: `any` yalnızca **yorum** metninde (`build…:38,137,139`, `canonicalize:29,35,54`, `classify…:155` + test/harness yorumları). |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable` | **0** (T-026 yüzeyinde) | Depodaki tek `@ts-expect-error` `member-procedures.test.ts:118` — T-026 **kapsamı dışı**, dokunulmamış. |
| Gerekçesiz `as` | **0** | Tek `as`: `contract-surface.test.ts:143` `as const`. Tip zorlaması yok; `z.custom()` + runtime koruyucu deseni korunmuş (`:326-327`). |
| Exhaustive switch + `assertNever` | **PASS** | 5 switch: `reasonForIo:467-475`, `buildDiff:500-621` (17 dal), `constraintChange:757-782`, `classificationRank:793-802`, `scopeLabel:891-900`. `FieldChangeReason` genişlemedi (14) ⇒ `buildDiff` eksiksiz; `(root)` **yeni kod eklemeden** mevcut `*_TYPE_NARROWED` dalını kullanıyor. |
| Saflık | **PASS** | `classify-contract-change.ts`: `node:*` ithalatı 0, `process.` 0, `catch` 0, girdi mutasyonu 0 (`stripRootStructuralKeys` **yeni** nesne kurar). I/O tek noktada (`scripts/generate-contract-surface.ts`) kaldı. |
| Katman / bağımlılık yönü | **PASS** | `classify…` → `./build-contract-surface.js` (**`import type`**) + `./canonicalize.js`. `apps/*` bağımlılığı yok, döngü yok, `index.ts`'ten export yok (L4). `scripts/` → `src/` tek yön. |
| Yutulan hata | **PASS** | `catch` yalnızca `scripts/generate-contract-surface.ts`'te ve **hepsi** `cause` ile sarmalayıp yeniden fırlatıyor (`:94-100`, `:135-142`, `:174-181`); `main().catch` `process.exitCode = 1` veriyor (`:252-256`). Sessiz `null`'a çevirme yok. |
| İsimlendirme (CLAUDE.md §4) | **PASS** | kebab-case dosyalar, PascalCase tipler, SCREAMING_SNAKE_CASE `reason`/`TRACKED_AXIS_KEYS`, `is`/`has` önekleri doğru. ⚠ Tek sürtünme `readOwnProperty` ↔ `readProperty` (L1'de). `data`/`temp`/`handle` yok. |
| Ölü kod | **PASS** | Kullanılmayan export yok; `:848-852`'deki "erişilemez" dal TS daraltması için gerekli (yorumda yazılı ve **doğru**). ⚠ `:422-425`/`:449-452`'nin "ulaşılamaz" iddiası **yanlış** (S9) — ama dal ölü değil, erişilebilir. |
| Sağlayıcı dallanması | **PASS** | Konu dışı. |
| Yorum kalitesi | ⚠ **S5/S9/S11** | Yorumlar Türkçe ve *neden*i anlatıyor. Üç hatalı/karşılıksız iddia: `:675-678` (S5), `:422-425`+`:449-451` (S9), `:258`/`:368` atfı (S11). |
| **SRP / dosya bölünmesi (~900'de?)** | ⭐ **Dosya bölünmesi hâlâ ÖNERİLMİYOR; ⚠ ama `diffProcedureIo` artık bölünmeli** | Dosya **937** satır (tur 2: 842, ⇒ +95). Tek sorumluluk ailesi (architect'in kural tablosu) hâlâ geçerli: `buildDiff` tablonun **tek kaynağı**, bölmek exhaustive-switch garantisini dağıtır. ⚠ **Değişen şey:** `diffProcedureIo` **143 satır** (`:644-786`) ve artık **iki** iş yapıyor — kök-şekil koruması + alan döngüsü. S5'in deliği tam bu birleşmenin içinde saklandı. ⇒ `diffRootShape()` çıkarılsın (S5'in düzeltmesiyle **aynı** düzenleme). **Bölme eşiğim:** `FieldChangeReason` 20 kodu aşarsa **veya** dosya ~1100 satırı geçerse `buildDiff` + tipler `contract-change-rules.ts`'e taşınsın. |

---

## 6. ÖLÇÜMLER

- **İncelenen dosya:** **10** — üretim 3 (`classify-contract-change.ts`,
  `build-contract-surface.ts`, `canonicalize.ts`), betik 2
  (`generate-contract-surface.ts`, `serialize-contract-surface.ts`), test 2
  (`classify-contract-change.test.ts`, `contract-surface.test.ts`), yapılandırma 1
  (`packages/trpc/package.json`), doküman 1 (`docs/api-versioning.md` §9/§10),
  + `src/index.ts` (export yasağı taraması)
- **`any` sayısı (kod):** **0** · yorum metninde 7 eşleşme
- **`@ts-ignore`/`eslint-disable` (T-026 yüzeyi):** **0** · **Gerekçesiz `as`:** **0**
  (`as const` 1)
- **En büyük fonksiyon:** `diffProcedureIo` — **143 satır** (`classify-contract-change.ts:644-786`).
  İkinci `buildDiff` **124** (`:499-622`), üçüncü `classifyContractChange` **55** (`:833-887`)
- **`classify-contract-change.ts`:** **937** satır (tur 1: 758 · tur 2: 842 ⇒ **+95**)
- **Test sayısı (saydım, koşturmadım):** `classify-contract-change.test.ts` **41** (+6) ·
  `contract-surface.test.ts` **34** (+3) ⇒ toplam **75** (`backend`'in 75/75 iddiasıyla
  **tutarlı**) · paket geneli 220 (Orkestratör'den devralındı)
- **`test:contract` kapsamı:** **34/75** — sınıflandırıcının 41 testi dışarıda (L3)
- **`reason` kodu:** **17** (3 prosedür + 14 alan) ⇒ `docs` §10 tablosu **doğru**
- **`in` operatörü gerçek kullanımı (T-026 yüzeyi):** ⚠ **5** — Orkestratör'ün "0"
  ölçümü yalnızca `classify-contract-change.ts` için geçerli (S8)
- **Bulgu dağılımı:** critical 0 · **high 1** · **medium 2** · **low 4** + devreden 6

---

## 7. DOĞRULANAMADI

1. **Hiçbir komut çalıştırılmadı** — `Bash` aracım yok. `pnpm test`, `test:contract`,
   `lint`, `typecheck`, `format:check` sonuçları bu rapordan **gelmiyor**; Orkestratör'ün
   "220 / 34 / 23-23 yeşil" ölçümü **devralındı**, bağımsız doğrulanmadı.
2. **`backend`'in beş mutasyon kanıtı yeniden üretilmedi.** S1(a)/S1(b)/S2/S3/S4'ün
   kapanışını **kaynak okuyarak ve elle veri izleyerek** doğruladım; "önce kırmızı /
   sonra yeşil" koşumu tekrarlanmadı.
3. **S5'in karşı vakası koşturulmadı.** `before: input=null`, `after: {type:"string"}`
   zincirini `:663`→`:699` boyunca elle izledim; vitest ile **üretilmedi**. ⇒ `backend`
   düzeltmeden önce bu vakayı **kırmızı** olarak göstermelidir (mutasyon kanıtı şartı
   benim için de geçerli).
4. **S6'nın `__proto__` senaryosu koşturulmadı** — `Object.keys`/köşeli-parantez atama
   semantiğinden türetildi, çalıştırılarak gösterilmedi.
5. **Rapor dosyası `prettier --write` ile bitirilmedi** — `Bash` yok
   (AGENT_BASELINE.md §5: `solid` için biçimlendirmeyi **Orkestratör** kapatır).
6. **`scripts/guards.sh` bu turda okunmadı** — S8'in önerisi ESLint eksenine
   kaydığı için guards adımı yeniden ölçülmedi; L4'ün mekanik kapısı da bu turda
   yalnızca `index.ts` taramasıyla (sonuç tarafından) doğrulandı.
