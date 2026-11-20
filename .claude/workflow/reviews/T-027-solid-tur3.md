# T-027 — `solid` gate raporu, TUR 3

Tarih: 2026-11-20
Sürüm: ROADMAP `v0.0.18` (platform `0.11.0 → 0.12.0`, MINOR)
Kapsam: ⚠⚠ **DAR** — yalnızca tur 2'nin iki `medium` bulgusunun kapanış denetimi.
Yeni tarama yapılmadı (tur 1/2 ölçümleri taşınıyor).

```
GATE: solid
SONUÇ: PASS
```

---

## 1. Neden bu tur var

Tur 2'de **PASS** verdim (2 `medium` + 7 `low`). BASELINE §4'e göre 2 `medium` düzeltme
turu açmayı zorunlu kılmıyordu; Orkestratör **açtı**. Ve kendi dersim bu turun sebebi:
_"Düzeltme bir hipotezdir; onu yalnızca düzeltmeden SONRA koşan **bağımsız** bir denetim
sınar."_ `qa` kendi düzeltmesini kendisi doğruladı (`T-027-qa-tur3.md`) — bu bağımsız
değil.

⚠ **Bash aracım yok.** Mutasyon koşturamadım. Aşağıdaki her sonuç ya **statik analiz**
(dosya okuması + AST/esquery semantiği) ya da Orkestratörün kayıtlı ölçümünün
**bağımsız doğrulaması**. Koşturulamayan üç ölçüm §6'da **talep** olarak yazıldı.

---

## 2. T2-M1 — AC-47'nin davranışsal kapsamı → **KAPANDI**

### 2.1 Tur 2 bulgusu neydi

Altı fikstür `base.js:32`'nin global `IGNORES`'una girdiği için `pnpm lint` onları **hiç**
değerlendirmiyordu; depoda ESLint'i programatik koşturan dosya **0**'dı; `guards.sh`'in
24. adımının üç alt kontrolü **tamamen metin sayımı**ydı. Orkestratör atlatmayı **fiilen
uyguladı**: `base.js:386`'daki spread yoruma alındı → geçiş sayısı 2 kaldı → `pnpm guards`
24/24 **yeşil**, float-para yasağı **tamamen ölü**.

### 2.2 Düzeltme gerçekten ikinci bir davranışsal ağ kuruyor mu — **EVET**

`packages/i18n/src/__tests__/eslint-money-fixtures.test.ts` (6 test) ESLint'in programatik
API'siyle altı fikstürü lint ediyor. Ağın **gerçek** olduğunu şu beş eksende doğruladım:

| # | Eksen | Ölçüm | Sonuç |
| --- | --- | --- | --- |
| 1 | Test **gerçekten koşuyor mu** | `vitest.config.ts:12` → `include: ['src/**/*.test.ts']`; dosya `src/__tests__/` altında ⇒ desen **eşliyor** | ✅ kayıtlı, koşuyor |
| 2 | **Yeni bağımlılık 0 mı**, `eslint` nereden çözülüyor | `packages/i18n/package.json:29-35` → `eslint: catalog:` **ve** `@arkesoft/config: workspace:*` **ikisi de ZATEN devDependency** | ✅ yeni bağımlılık **0** |
| 3 | Üretim grafiği bozuldu mu | `purity.test.ts:102-105` `dependencies`'i `{zod, @arkesoft/errors}` olarak **mekanik pinliyor**; `package.json:25-28` birebir öyle | ✅ değişmedi, **pinli** |
| 4 | `dist`'e sızıyor mu | `tsconfig.build.json:13` → `exclude: [..., "src/__tests__"]` | ✅ sızmıyor |
| 5 | Saflık testini kırıyor mu | `purity.test.ts:36-40` `readdirSync`'i **recursive olmadan** çağırıyor ⇒ `src/__tests__/` kapsam dışı. Yeni dosya `node:path` + `eslint` import ediyor (ikisi de `FORBIDDEN_PATTERNS`'da) ⇒ **doğru yere** konmuş | ✅ kırmıyor |

### 2.3 ⭐ En güçlü bulgu: seçici↔fikstür eşlemesi **1:1**

Bu, "ağ gerçek mi" sorusunun asıl cevabı. Üç pozitif fikstürün her biri **tam bir**
seçiciyi tetikliyor, başkasını değil:

| Fikstür | İçerik | Tetiklenen seçici | Diğerleri neden tetiklenmez |
| --- | --- | --- | --- |
| `money-pozitif-1.ts:9` | `export const price = 19.99` | **#1** `VariableDeclarator` | Property yok, `toFixed` yok |
| `money-pozitif-2.ts:9` | `export const payload = { totalAmount: 19.99 }` | **#2** `Property` | `id.name` = `payload` → `MONEY_NAME_SOURCE`'a **uymaz**; literalin ebeveyni `Property`, `VariableDeclarator` değil |
| `money-pozitif-3.ts:10` | `return price.toFixed(2)` | **#3** `CallExpression` | `price` bir **parametre**, `VariableDeclarator` değil; `2`'nin `raw`'ı `^[0-9]*\.[0-9]+$`'e **uymaz** |

⇒ `base.js:190-206`'daki **üç seçiciden herhangi biri** silinirse **tam bir** test kırmızı
olur. Tur 2'de olmayan şey buydu: per-seçici davranışsal kanıt.

Ayrıca: üç pozitif fikstürün **hiçbiri** `$queryRawUnsafe` veya literal `userMessageKey`
içermiyor (ikisi de aynı `no-restricted-syntax` kuralının parçası) ⇒ `errorCount >= 1`
assertion'ının **başka hiçbir kaynağı yok** ⇒ **vacuous değil**.

### 2.4 Vacuity denetimi — **ağ fail-CLOSED**

Handoff'un sorduğu _"hiçbir fikstür bulunamadı ⇒ kırmızı mı yeşil mi"_ sorusu:

- ⭐ Test `readdirSync` **kullanmıyor**; `POSITIVE_FIXTURES`/`NEGATIVE_FIXTURES`
  (`:66-67`) **sabit altı isimli dizi**. `it.each` her koşumda **6 test üretmek
  zorunda** ⇒ _"0 dosya keşfedildi → sessiz yeşil"_ deliği **yapısal olarak yok**.
  `expect(files.length).toBeGreaterThan(0)` sınıfı güvenceye bu tasarımda **ihtiyaç
  duyulmuyor** — sabit dizi aynı işi daha sıkı yapıyor.
- Fikstür **silinirse/yolu çözülemezse**: `eslint.lintFiles([mevcut-olmayan])` **fırlatır**
  ⇒ kırmızı. Ek olarak `:96` `expect(results).toHaveLength(1)` ikinci ağ.
- **Global ignore yine uygulanırsa** (`ignore: false` semantiği bozulursa): ESLint
  ya 0 sonuç döner (`:96` kırmızı) ya "File ignored…" uyarısıyla 0 `no-restricted-syntax`
  döner (pozitif testler kırmızı). ⇒ fail-closed.
- **Config hiç yüklenmezse / parse hatası olursa**: fatal mesaj `ruleId: null` taşır ⇒
  pozitif testlerde 0 money hatası ⇒ kırmızı. ⇒ fail-closed.

### 2.5 İkinci atlatma yolu (`MONEY_NAME_SOURCE` → hiçbir şeye uymayan desen)

Orkestratör **yalnızca birinci** yolu (spread'i yoruma alma) ölçtü. İkincisini **statik
olarak** analiz ettim: üç seçicinin **tamamı** `MONEY_NAME_SOURCE`'u şablon dizesiyle
gömüyor (`base.js:192,197,202`) ⇒ desen hiçbir şeye uymaz hâle getirilirse

- #1 `VariableDeclarator[id.name=/<hiç>/]` → eşleşme yok
- #2 `Property[key.name=/<hiç>/]` → eşleşme yok
- #3 `CallExpression[...][callee.object.name=/<hiç>/]` → eşleşme yok

⇒ üç pozitif fikstür de **0 hata** ⇒ **3 FAIL** (birinci yolla **birebir aynı sonuç**;
geçersiz regex yazılırsa esquery fırlatır, o da kırmızı). ⚠ **Analitik tahmin, ölçüm
değil** — §6/A'da Orkestratör için mutasyon talebi olarak yazıldı.

### 2.6 Ambient `.d.ts` bir tip yalanı mı — **hayır, ama drift kaynağı**

`arkesoft-config-eslint-base.d.ts:30-34`'ü `base.js:326-337`'nin gerçek JSDoc imzasıyla
satır satır karşılaştırdım:

| Alan | `base.js` JSDoc | Ambient ayna | Değerlendirme |
| --- | --- | --- | --- |
| `tsconfigRootDir` | `string` | `readonly string` | ✅ birebir |
| `globals?` | `Record<string, boolean \| 'readonly' \| 'writable' \| 'off'>` | aynı | ✅ birebir |
| `overrides?` | `ConfigWithExtends[]` | `readonly Linter.Config[]` | ⚠ **daraltılmış** (`extends` anahtarını kabul etmez) — ama **güvenli yönde**: çağıranı kısıtlar, sağlam olmayan kodu tip-geçerli yapamaz. Bugün bu paketin hiçbir dosyası `overrides` geçmiyor |
| dönüş | `ConfigArray` | `Linter.Config[]` | ✅ yapısal uyumlu; `tseslint.config()` `extends`'i **düzleştirerek** döner ve `new ESLint({baseConfig})` bilinmeyen anahtarı **reddeder** ⇒ uyuşmazlık olsaydı 6/6 PASS tabanı **alınamazdı** |

⇒ `as unknown as`'ten **kesinlikle daha iyi**: `as` runtime'da hiçbir şey doğrulamaz,
bu ayna ise ESLint'in **kendi doğrulayıcısına** besleniyor ⇒ anlamlı bir şekil sapması
**kırmızı test** olarak yüzeye çıkar. ⭐ `qa`'nın ilk taslaktaki `as unknown as`'i kendi
bulup kaldırması **doğru karar**. Kalan risk (tsc sapmayı göremez) → bulgu 5.

---

## 3. T2-M2 — mükerrerlik + bayat yorum → **yorum KAPANDI, mükerrerlik KALDI (borç)**

### 3.1 Bayat yorum: **düzeltildi ve yeni yanlış beyan GİRMEDİ**

Yeni dosya başı (`money-safe-integer-range.test.ts:4-15`) _"bu dosya artık REGRESYON
testidir, KASITLI KIRMIZI DEĞİL"_ diyor. Tazelenen **altı** satır atfını `money.ts`'e
karşı **tek tek** doğruladım:

| Yorumdaki atıf | `money.ts` gerçeği | Sonuç |
| --- | --- | --- |
| `:103-107` `Number.isSafeInteger` denetimi | `103-107` — birebir o blok | ✅ |
| `add` `:123-126` | `123-126` | ✅ |
| `subtract` `:129-132` | `129-132` | ✅ |
| `multiplyBy` `:138-145` | `138-145` | ✅ |
| `multiplyBy` ön denetimi `:139` `Number.isInteger` | `139` | ✅ |
| `toJSON` salt çıkış `:185-187` | `185-187` | ✅ |
| `money.test.ts:67-98` örtüşme bloğu | `67-98` — `'Money — güvenli tamsayı aralığı (gate turu bir düzeltmesi…)'` | ✅ |
| `money.test.ts:162-167` `multiplyByRatio` referansı | `162-167` | ✅ |

⇒ **Altı/sekiz atıf da doğru.** Tur 2'nin yanlış beyanı (_"üretim bozuk, testler kasıtlı
kırmızı"_) gitmiş, yerine **ölçülebilir ve ölçtüğümde doğru çıkan** bir metin gelmiş.
⚠ Tek istisna → bulgu 6 (bir göreli yol yanlış).

### 3.2 Dosya silindi — kapsam kaybı var mı: **YOK, bağımsız olarak doğrulandı**

`money-safe-integer-range-tur2.test.ts` artık diskte **yok** (glob ile doğrulandı) ve
üretim kodunda/kapılarda ona **hiçbir atıf kalmamış** (`grep` → yalnızca açıklama yorumu
+ review arşivleri).

Beş testin taşınmasını `qa`'nın **tur 3 öz-beyanına güvenmeden**, birleştirmeden **ÖNCE**
yazılmış `T-027-qa-tur2.md:60-75`'teki eksen listesiyle karşılaştırdım:

| qa-tur2'de kayıtlı eksen (birleştirmeden önce) | Birleşik dosyadaki karşılığı | Sonuç |
| --- | --- | --- |
| 1. `multiplyBy(1e300)` — tam sayı ama güvenli değil | `:124-130` | ✅ |
| 2. `add` — iki büyük terim, sınırdan farklı büyüklük | `:132-136` | ✅ |
| 3. `add` ile (subtract DIŞINDA) negatif taşma | `:138-142` | ✅ |
| 4. `subtract` — taşma yok, gevşetme kontrolü | `:144-148` | ✅ |
| 5. `Money.zero`/`toJSON` bypass referansı | `:150-154` | ✅ |

⇒ **5/5 korundu.** Dosyadaki `it(` sayımı: TUR 1 bloğu `:51,61,68,75,83` = **5**,
TUR 2 bloğu `:124,132,138,144,150` = **5** ⇒ **10 test**, beyan edilen sayı doğru.

**Test sayısı aritmetiği:** qa-tur2 `89 test / 11 dosya` ölçmüştü. Bu tur:
`89 − 5` (silinen dosya) `+ 5` (birleşiğe taşındı) `+ 6` (yeni ESLint dosyası) = **95**,
dosya sayısı `11 − 1 + 1 = 11`. ⇒ Beyan edilen **89 → 95** tutuyor, birleştirme kapsam
kaybı üretmemiş.

### 3.3 ⚠⚠ "Bağımsız ikinci şahit" gerekçesi ikna edici mi — **KISMEN; zayıf buluyorum**

Tur 2'deki şikâyetim _"ikisi aynı sebeple değişir"_ idi. **Hâlâ geçerli**, ve bunu
somut olarak ölçtüm:

`Money.of`'un güvenli-aralık hatası **ham `Error`** fırlatıyor (`money.ts:104-107`) ve o
hatanın **Türkçe metni** `/güvenli tamsayı aralığını aşıyor/` regex'iyle **dokuz ayrı
assertion** tarafından pinlenmiş:

- `money.test.ts:75, 80, 85, 92, 166` (5)
- `money-safe-integer-range.test.ts:87, 129, 135, 141` (4)

⇒ O tek dizenin kelimesi değişirse **iki ajanın sahip olduğu iki dosyada dokuz satır**
güncellenmek zorunda. Mükerrerliğin maliyeti soyut değil, **dokuz satır**.

`qa`'nın gerekçesinin **zayıf yanı**: iki dosya da **aynı üretim yolunu**, **aynı public
API** üzerinden, **aynı literallerle** sınıyor. `money.ts:103-107`'deki denetim
kaldırılırsa **ikisi birlikte** kırmızı olur ⇒ "ikinci ağ" **tespite hiçbir şey
katmıyor**. Ağın işe yaradığı tek senaryo, `money.test.ts`'in **test dosyası olarak**
kurcalanması (silinmesi/gevşetilmesi) — gerçek ama **dar** bir sınıf. (Bu deponun
CLAUDE.md §10/6'sı o sınıfı ciddiye alıyor, bu yüzden _tamamen_ boş bir gerekçe değil.)

**Yine de `medium` yazmıyorum, üç gerekçeyle:**

1. Tur 2 bulgumun **yük taşıyan** yarısı (yanlış beyanda bulunan bayat yorum) **kapandı**
   ve tazelenen atıfların **hepsini doğruladım**. Kalan kısım **yanlış bir ifade değil**,
   **kabul edilmiş ve yazılı** bir bakım maliyeti (`:34-37`).
2. Çözüm `qa`'nın **yetkisinde değil**: `money.test.ts` `backend`'in dosyası ve
   AGENT_BASELINE §5 _"başka ajanın dosyasını değiştirme"_ **bağlayıcı**. `qa` sınırı
   **doğru** biçimde aştırmadı. Kalan iki seçenekten (kendi 5 testini silmek / tutup
   gerekçelendirmek) ikincisi savunulabilir.
3. BASELINE §4: _"Emin değilsen bir alt seviyeyi seç ve gerekçesini açıklamaya yaz."_
   Bunu tur 3'te `medium` yazmak, sahibi tarafından düzeltilemeyen, belgelenmiş ve
   sınırlı bir test-bakım takası yüzünden Task'ı **ESCALATED** yapardı — orantısız.

⇒ Bulgu 7 olarak **`low` borç satırı**, sorumlu **`backend`**, vade **v0.4.0**
(`Money`'nin ilk gerçek tüketicisi).

---

## 4. BULGULAR

Hepsi `low` ⇒ BASELINE §4: **PASS**, düzeltme turu **açılmaz**, borç tablosuna yazılır.

### [SEV: low] `scripts/guards.sh:1494-1510` — davranışsal ağın **kendi varlığı** pinli değil

Alt kontrol 3b yalnızca **altı fikstür dosyasının varlığını** denetliyor. Depoda
`eslint-money-fixtures.test.ts`'e atıf veren **hiçbir mekanik kapı yok** (`grep`
doğrulandı: yalnızca yorumlar, Task dosyası ve review arşivleri). **Somut senaryo:** test
dosyası silinir → `pnpm guards` 24/24 **yeşil**, `pnpm test` **yeşil** (test sayısını
pinleyen bir kapı yok), `.github/ci-expected-test-packages.txt` **paket** düzeyinde pin
olduğu için **sapma görmez** ⇒ tur 2'nin atlatma yolu (spread'i yoruma alma) **yeniden
canlanır**. Bu, deponun **kendi** desenine aykırı: alt kontrol 2'nin gerekçesi
(`guards.sh:1391-1400`) ve `check_axe_single_source` emsali tam olarak _"koruma sessizce
kaybolabiliyorsa varlığını guards'ta pinle"_ diyor.
**Öneri:** alt kontrol 3b'nin `required_fixtures` döngüsüne kardeş bir dosya-varlık
denetimi ekle (`packages/i18n/src/__tests__/eslint-money-fixtures.test.ts`).
⭐ **Güvenlik etkisi: monoton sıkılaştırma** — tek `[ -f ... ]` satırı, yanlış-pozitif
yüzeyi **sıfır**, davranış değişmiyor. · **Sorumlu: `devops`** · Vade: v0.0.18 kapanışı
veya `guards.sh`'e sonraki dokunuş.

### [SEV: low] `packages/i18n/src/__tests__/eslint-money-fixtures.test.ts:66-67` ↔ `scripts/guards.sh:1496-1499` — altı fikstür adı **iki yerde elle** tutuluyor

Aynı altı literal isim, aynı amaç, **aynı sebeple değişir** ⇒ gerçek mükerrerlik
(yüzeysel benzerlik değil). **Somut senaryo:** `money-pozitif-4.ts` eklenir; iki sabit
listenin **hiçbiri** güncellenmezse yeni fikstür **hiç lint edilmez** ve **hiçbir kapı**
bunu söylemez.
**Öneri:** testte dizin keşfine geç **ama mutlaka taban assertion'ıyla birlikte**:
`expect(positives.length).toBeGreaterThanOrEqual(3)` + aynısı negatifler için.
⚠⚠ **Monoton DEĞİL — açıkça söylüyorum:** sabit listeyi yalnızca `readdirSync` ile
değiştirmek **bugün olmayan** bir vacuity deliği açar (0 dosya keşfedilirse `it.each([])`
vitest'te **hata değil**, sessizce sıfır test). Keşif **ancak** taban assertion'ıyla
birlikte sıkılaştırmadır; ikisi **aynı düzenlemede** yapılmalı. · **Sorumlu: `qa`**
(test) + **`devops`** (guards listesi) · Vade: v0.4.0.

### [SEV: low] `packages/i18n/src/__tests__/eslint-money-fixtures.test.ts:119` — negatif taraf fail-**OPEN**

`expect(errorCount).toBe(0)` bir **fatal** ESLint hatasında da **sağlanır** (fatal mesaj
`ruleId: null` taşır, `:103`'teki filtre onu saymaz). **Somut senaryo:**
`money-negatif-2.ts` geçersiz TS'ye dönüşür **veya** `base.js:360`'ın
`allowDefaultProject: ['eslint/__fixtures__/*.ts']` deseni bir yeniden adlandırmayla
eşleşmez olur → "was not found by the project service" fatal hatası → üç negatif test
**yeşil kalır** ve yanlış-pozitif olmadığını artık **hiçbir şey** kanıtlamaz.
⭐ Pozitif taraf bu sınıftan **etkilenmiyor** (fatal hata ⇒ 0 money hatası ⇒ kırmızı), bu
yüzden `low`: AC-47'nin asıl koruması fail-closed kalıyor.
**Öneri:** `lintFixture` içine `expect(result.fatalErrorCount).toBe(0)` ekle — tek satır,
**her iki** polariteyi birden kapatır.
⭐ **Güvenlik etkisi: monoton sıkılaştırma.** · **Sorumlu: `qa`** · Vade: v0.4.0.

### [SEV: low] `packages/i18n/src/__tests__/eslint-money-fixtures.test.ts:81` — test başına `new ESLint(...)`; varsayılan 5 sn timeout ile flake yüzeyi

`lintFixture` her çağrıda **yeni** bir `ESLint` örneği kuruyor ⇒ altı tek satırlık fikstür
için **altı kez** TypeScript `projectService` ayağa kalkıyor (`base.js:349-362` tip
bilgisine dayalı lint). `vitest.config.ts` **`testTimeout` belirlemiyor** ⇒ varsayılan
**5000 ms / test**. Orkestratörün tabanı 2.44 sn (**dosya toplamı, sakin makine**).
⚠ AGENT_BASELINE §4 ders 2 bu depoda ölçülmüş: _"Sakin makinede ölçüm, yük kaynaklı
flake için KANIT DEĞİL"_ (T-019'un ~%11 flake'i **26 konteyner / load avg 2.8-5.9**
altında çıkıyordu; bu kullanıcının ortamında ~25 konteyner var).
**Öneri:** `ESLint` örneğini **modül kapsamına taşı** (altı çağrı tek örneği paylaşır —
`lintFiles` bu kullanımda durum taşımıyor) **ve/veya** açık `testTimeout` yaz.
⭐ Taşıma **monoton**: daha az hareketli parça, daha hızlı, daha küçük timeout yüzeyi,
izolasyon kaybı yok. ⚠ **Bu bulgu ÖLÇÜLMEDİ** (Bash'im yok) — §6/B'deki yük altında
ölçüm bir testi >3000 ms gösterirse bulgu **`medium`'a yükselmeli** ve bu sürümde
kapanmalı. · **Sorumlu: `qa`** · Vade: ölçüme bağlı.

### [SEV: low] `packages/i18n/src/__tests__/arkesoft-config-eslint-base.d.ts:30-34` — elle tutulan imza aynası, tsc sapmayı **göremez**

Ayna bugün **doğru** (§2.6'da satır satır doğrulandı) ve `as`'ten **daha iyi**. Ama
`base.js` saf JS olduğu için **hiçbir** tip kontrolü aynayı kaynağıyla karşılaştırmıyor.
**Somut senaryo:** `createBaseConfig`'e zorunlu bir üçüncü parametre eklenir
(`base.js:337`); `packages/i18n`'in `typecheck`'i **temiz kalır** (ayna eski imzayı
anlatıyor) ve sapma ancak **çalışma zamanında** kırmızı testle yüzeye çıkar — yani
`pnpm typecheck` bu eksende **sessiz**.
**Öneri (borç):** `packages/config` `eslint/base.js` için gerçek bir `.d.ts` yayımlasın
(veya `allowJs` + `checkJs` + declaration emit); o gün bu ayna **silinir**.
⭐ **Monoton**, ama **bu sürümün kapsamı değil** (`packages/config`'in derleme adımı yok).
· **Sorumlu: `devops`** · Vade: `packages/config` bir derleme adımı kazandığında.

### [SEV: low] `packages/i18n/src/__tests__/money-safe-integer-range.test.ts:19` — göreli yol yanlış

Yorum `` `../__tests__/money.test.ts:67-98` `` yazıyor. Dosyanın kendisi
`packages/i18n/src/__tests__/` içinde ⇒ bu yol `packages/i18n/__tests__/money.test.ts`'e
çözülür, **var olmayan** bir yola. Doğrusu `./money.test.ts` (dosyanın kendi
konvansiyonu doğru: `:48` ve `:10` `../money.ts` yazıyor ve o **doğru**).
⚠ Bu düzeltme turunun **adı konmuş amacı** yorum doğruluğuydu; sekiz atıftan yedisi
doğru, bu biri değil. · **Sorumlu: `qa`** · Vade: v0.4.0.

### [SEV: low] `packages/i18n/src/__tests__/money-safe-integer-range.test.ts:17-37` ↔ `money.test.ts:67-98,162-167` — 5/5 mükerrerlik **kaldı** (belgelenmiş, kabul edilmiş)

Tur 2 `medium` #2'nin mükerrerlik yarısı kapanmadı; **gerekçelendirildi**. Ölçülmüş
maliyet: tek hata dizesi **dokuz assertion** tarafından, **iki ajanın sahip olduğu iki
dosyada** pinli (§3.3). _"Bağımsız ikinci şahit"_ gerekçesini **zayıf** buluyorum —
iki dosya aynı üretim yolunu aynı API ve aynı literallerle sınıyor, üretim regresyonu
**ikisini birlikte** kırmızı yapar ⇒ ikinci ağ tespite katkı vermiyor; yalnızca
`money.test.ts`'in **test olarak kurcalanmasına** karşı koruyor.
`low`'a indirme gerekçesi §3.3'te üç maddeyle yazıldı (yanlış beyan kapandı · çözüm
`qa`'nın yetkisinde değil, §5 ownership · orantılılık).
**Öneri:** `backend` `money.test.ts`'e sonraki dokunuşunda iki bloğu **tek** dosyada
birleştirsin; birleştirmede ham `Error` yerine kararlı `code` taşıyan bir `AppError`
alt sınıfına geçmek dokuz regex pinini de ortadan kaldırır (⚠ o adım **kapsam dışı**,
ayrı karar). · **Sorumlu: `backend`** · Vade: v0.4.0.

---

## 5. ÖLÇÜMLER

| Ölçüm | Değer |
| --- | --- |
| İncelenen dosya | **18** (3 değişen/yeni + `money.test.ts`, `money.ts`, `purity.test.ts`, `package.json`, 2 × `tsconfig*.json`, `vitest.config.ts`, `base.js`, 6 fikstür, `guards.sh` 24. adım bölgesi) |
| Bulunan `any` | **0** (3 eşleşme, **üçü de yorum içinde**) |
| `as` / `as unknown as` (kodda) | **0** (2 eşleşme, ikisi de yorum içinde) |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable` / boş `catch` / `console.` | **0** |
| En büyük fonksiyon (değişen dosyalarda) | `lintFixture` — **24 satır** (`eslint-money-fixtures.test.ts:80-104`) |
| Birleşik dosyadaki test sayısı | **10** (`it(` sayımı: TUR 1 = 5, TUR 2 = 5) — beyan **doğru** |
| Yeni ESLint dosyasındaki test | **6** (`it.each` 3 + 3) |
| `packages/i18n` test sayısı aritmetiği | `89 − 5 + 5 + 6 = 95` ⇒ beyan edilen **89 → 95** **tutuyor** |
| Dosya sayısı | `11 − 1 + 1 = 11` ⇒ değişmedi |
| Yeni bağımlılık | **0** (`eslint`, `@arkesoft/config` ikisi de `package.json:29-35`'te **zaten** devDependency) |
| Üretim `dependencies` | **değişmedi**, `purity.test.ts:102-105` tarafından **mekanik pinli** |
| Silinen dosyaya kalan atıf (üretim/kapı) | **0** |
| Tazelenen yorum satır atfı | **8 atıf denetlendi, 7 doğru, 1 yanlış** (bulgu 6) |
| Enumerate edilen atlatma ekseni | **5** — pozitif tarafta **hepsi fail-CLOSED** (1'i Orkestratör ölçtü, 4'ü statik analiz) |
| Seçici↔fikstür eşlemesi | **1:1** — üç seçiciden herhangi birinin silinmesi **tam bir** testi kırmızı yapar |
| ⚠ Koşturulamayan | `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, vitest — **Bash aracı yok**; §6'da talep |

**Taşınan tur 1/2 ölçümleri (yeniden taranmadı):** `any`/`@ts-ignore`/`as` sayımı · en
büyük fonksiyon · döngüsel bağımlılık · sıfır-assertion taraması · iki panel merdiveni ·
M1/M2/M3 kapanışı · IEEE-754 iddiası · yedi `low`.

---

## 6. Orkestratörden talep edilen üç ölçüm (Bash'im yok)

**A — İkinci atlatma yolunun mutasyonu (§2.5'in analitik tahminini sına).**
`base.js:180-181`'deki `MONEY_NAME_SOURCE`'u hiçbir şeye uymayan bir desene çevir
(ör. `'zzzNEVERMATCHzzz'`), sonra `cd packages/i18n && npx vitest run eslint-money-fixtures`.
**Beklenti: 3 FAIL / 3 PASS** (üçü de pozitif fikstür). Ardından `Write` ile **birebir**
geri yaz ve `base.js` md5'ini doğrula: `be1a90e8140d1736390b4f3b36914111`.
⚠ `pnpm --filter … test -- <desen>` bu depoda **filtre uygulamıyor** (BASELINE §6) —
paket dizininden `npx vitest run` kullan.

**B — Yük altında zamanlama (bulgu 4'ün derecesini belirler).**
Yük **ölçülerek** (`uptime`, `docker ps | wc -l` **rapora yazılacak**), load avg ≥ 2.5
altında `cd packages/i18n && npx vitest run eslint-money-fixtures` **5 koşum**; **test
başına** süreleri 5000 ms varsayılanına karşı raporla. Herhangi bir test > 3000 ms ise
**bulgu 4 `medium`'a yükselir** ve bu sürümde kapanmalı.

**C — Benim ölçemediğim üç kapı.** Yeni iki dosya (`eslint-money-fixtures.test.ts`,
`arkesoft-config-eslint-base.d.ts`) **bu turun kaydında** hiç `pnpm lint` /
`pnpm typecheck` / `pnpm format:check` görmedi (qa-tur3 yalnızca vitest ve guards
raporladı). Özellikle: `.d.ts` dosyası `base.js:12`'nin `TS_FILES` desenine
(`**/*.ts`) **giriyor** ⇒ `pnpm lint` onu lint **eder**; `tsconfig.json:11`'in
`include: ["src/**/*"]`'ı onu programa **alır**. Üçünü koştur.

⚠ **Bu raporun biçimlendirmesi:** BASELINE §5 — `Bash` aracı olmayan gate ajanları
(`solid`/`wcag`) `prettier --write` koşturamaz; bu dosyanın biçimlendirmesini
**Orkestratör** kapatacak.

---

## 7. NOTLAR (bulgu değil)

- **Test yerleşimi (seçenek (a)) DOĞRU karardı.** `packages/config`'in `test` script'i
  yok, `.github/ci-expected-test-packages.txt` onu `<NONEXISTENT>` olarak kaydetmiş ve
  T-026 kısıtı `.github/**`'a dokunmayı yasaklıyor ⇒ seçenek (b) `check_fake_green_test_packages`
  kapısını kırardı. `packages/i18n` **ZATEN** kayıtlı bir test paketi ⇒ yeni CI boşluğu
  açılmıyor. ⚠ Yerleşim yine de bir **yerellik** sapması (denetlenen kural
  `packages/config`'in): `packages/config` bir gün `test` script'i kazanırsa test oraya
  taşınmalı. Bunu **bulgu olarak yazmıyorum** — seçenekleri tur 2'de ben çerçeveledim,
  `qa` kısıtlar altında doğrusunu seçti; bu bir kusur değil, bir **vade kaydı**.
- **`qa`'nın öz-düzeltmesi kayda değer:** ilk taslaktaki `as unknown as Linter.Config[]`
  (CLAUDE.md §4 ihlali) **kendisi tarafından** bulunup ambient `.d.ts` ile kaldırılmış.
  Tur 3'ün sebebi "bağımsız denetim" olsa da, `qa`'nın bu eksende kendini yakalaması
  doğru yönde bir sinyal.
- **Kapsam dışı, kayıt için:** `Money.of`'un güvenli-aralık ihlali **ham `Error`**
  fırlatıyor (`money.ts:104-107`), kardeşi `FractionalMinorUnitError` ise `AppError`
  alt sınıfı — CLAUDE.md §4 _"Tek hiyerarşi: AppError"_ ekseninde bir asimetri, ve dokuz
  regex pininin **kök nedeni**. Tur 1/2'de açılmadı, bu turun dar kapsamında **değil**,
  bu yüzden **bulgu açmıyorum**; bulgu 7'nin önerisinde birleştirmeyle birlikte
  değerlendirilmesi not düşüldü.
