# T-027 — `security` gate, tur 2 (DAR kapsam)

- **Tarih:** 2026-11-20
- **Sürüm:** ROADMAP `v0.0.18`
- **Kapsam:** ⚠⚠ DAR — yalnızca tur 1 bulgularının kapanışı + düzeltme turunun açtığı yüzey.
  Yeni tarama YAPILMADI (fail-closed matrisi, DOM sink, canlı DB yetkileri, `pnpm audit`,
  KVKK, ReDoS, tenant izolasyon listesi: tur 1 sonuçları taşınıyor).

```
GATE: security
SONUÇ: PASS
```

---

## 1. Tur 1 `medium`'u — KAPANDI (bağımsız olarak ölçüldü)

**Bulgu (tur 1):** `packages/i18n/src/money.ts` — `Money`'nin güvenli tamsayı koruması
asimetrik; `of`/`add`/`subtract`/`multiplyBy` yalnızca `Number.isInteger` denetliyordu.

`backend`'in düzeltmesi `Money.of`'a `Number.isSafeInteger` ekledi
(`packages/i18n/src/money.ts:103-107`) ve `add`/`subtract`/`multiplyBy` sonucu bu TEK
noktadan geçiyor (`:125`, `:131`, `:144`).

Üç vaka **kendim ölçüldüm** (`packages/i18n/dist/money.js`, derleme `src`'den taze):

```
of(999999999999999).multiplyBy(11)  →  THROW "Money.of: amountMinor güvenli tamsayı
                                        aralığını aşıyor … alınan: 10999999999999988"
of(MAX_SAFE).add(of(2))             →  THROW (alınan: 9007199254740992)
of(MAX_SAFE + 2)                    →  THROW (alınan: 9007199254740992)
REFERANS multiplyByRatio({11,1})    →  THROW "…yuvarlanmış sonuç güvenli tamsayı
                                        aralığını aşıyor — 10999999999999989"  (DEĞİŞMEDİ)
REFERANS multiplyByRatio({11,100})  →  110000000000000  (DEĞİŞMEDİ)
```

⇒ Tur 1'deki saldırı senaryosu (`multiplyBy(quantity)`, `quantity` kullanıcı girdisi,
sessiz 1 kuruş kaybı) **kapalı**. Sessiz kayıp yerine fırlatma var: fail-closed.

---

## 2. `backend`'in IEEE-754 iddiası — ÇÜRÜTÜLEMEDİ

**İddia:** "Izgara güvenli sınırın ÜSTÜNDE yalnızca büyür ⇒ gerçek sonuç aralığı aştığında
kayan nokta sonucu da KESİNLİKLE aralık dışına düşer" (`money.ts:22-27`).

### 2.1 Ampirik çürütme arayışı — 1.307.651 deneme, 0 karşı örnek

İki hata sınıfı birlikte arandı (yalnızca biri aranırsa diğer yön kör kalır):

| Sınıf                                                       | Bulunan |
| ----------------------------------------------------------- | ------- |
| **A) Sessiz yanlış:** gerçek (BigInt) sonuç aralık dışı ama metot DÖNDÜ | **0** |
| **B) Yanlış-pozitif:** gerçek sonuç aralık İÇİNDE ama metot FIRLATTI    | **0** |

Deneme tasarımı: `2^53` sınırının ±8 komşuluğu (her iki yön, `add`/`sub`/`mul` çapraz) ·
`q ∈ [2,4096]` için `floor(MAX_SAFE/q) ± 3` çarpımları (ızgara geçişi tam burada kritik) ·
`a+b`'nin `2^53` civarına düştüğü ±2048 çift · 400k rasgele deneme (işaret ve büyüklük
tabanı rasgele). Toplam 1.307.651 çağrı; 1.154.063 başarılı dönüş, 153.588 fırlatma.
Her dönüşün değeri `BigInt` referansıyla **birebir** karşılaştırıldı.

### 2.2 Neden yapısal olarak doğru (ampirik sonucun nedensel açıklaması)

Girdiler zaten güvenli tamsayı ⇒ tam olarak temsil edilebilir; IEEE-754 toplama ve çarpma
**doğru yuvarlanmış** sonuç verir. `[2^53, 2^54)` binade'inde ızgara adımı 2'dir ve `2^53`
ızgara noktasının **kendisidir**. Yuvarlama-en-yakına bir değeri ızgara noktasının ötesine
**taşımaz** ⇒ `|gerçek| ≥ 2^53` ise `|fl(sonuç)| ≥ 2^53 > MAX_SAFE_INTEGER` ⇒
`Number.isSafeInteger` **false** ⇒ fırlar. Ters yön de kapalı: `|gerçek| ≤ 2^53-1` ise
gerçek değer tam temsil edilebilir, `fl = gerçek` ⇒ yanlış-pozitif yok. Toplama için de
aynı argüman geçerli (`|a+b| ≤ 2^54-2`, sonsuza taşma yok). ⇒ **İddia toplama ekseninde de,
negatif yönde de ayakta.**

### 2.3 Negatif yön / `MIN_SAFE_INTEGER` — ölçüldü

```
of(MIN_SAFE)                      →  OK   -9007199254740991
of(MIN_SAFE - 2)                  →  THROW
of(MIN_SAFE).subtract(of(2))      →  THROW
of(MIN_SAFE).add(of(-2))          →  THROW
of(MIN_SAFE).multiplyBy(2)        →  THROW
of(-999999999999999).multiplyBy(11) → THROW
of(MIN_SAFE).multiplyBy(-1)       →  OK   9007199254740991   (gerçek değer DOĞRU)
```

### 2.4 `multiplyBy`'ın `quantity` ön-denetimi (`:139`) — "tamsayı ama güvensiz" girdi nereye düşer

`Number.isInteger` geçiren güvensiz çarpanlar ön-denetimden GEÇER, ama sonuç `Money.of`'un
yeni kapısına ÇARPAR:

```
of(100).multiplyBy(1e300)            →  THROW (Money.of aralık)
of(100).multiplyBy(2**53)            →  THROW (Money.of aralık)
of(100).multiplyBy(2**53 + 2)        →  THROW (Money.of aralık)
of(100).multiplyBy(-1e300)           →  THROW (Money.of aralık)
of(100).multiplyBy(1e21)             →  THROW (Money.of aralık)
of(100).multiplyBy(Number.MAX_VALUE) →  THROW (FractionalMinorUnitError — çarpım Infinity,
                                        isInteger(Infinity) false; ETİKET farklı, ama FIRLAR)
Infinity / -Infinity / NaN / 0.5 / '11' / null / undefined / true  →  THROW (ön-denetim)
```

⇒ `quantity` ön-denetiminin değiştirilmemesi **güvenlik açığı üretmiyor**; `Money.of`
arkada yakalıyor. **Tek geçen durum:** `of(0).multiplyBy(1e300) → 0` ve
`zero('TRY').multiplyBy(1e300) → 0` — gerçek çarpım 0 olduğu için **matematiksel olarak
doğru cevap**; para kaybı/kazancı yok ⇒ bulgu değil.

### 2.5 Negatif sıfır — zararsız (ölçüldü)

`of(-0)`, `of(0).multiplyBy(-1)` → `amountMinor` `-0` taşıyor, ama
`equals(zero) → true`, `compare(zero) → 0`, `JSON.stringify → {"amountMinor":0}`.
Gözlemlenebilir bir sapma yok ⇒ bulgu değil.

### 2.6 `Money.of` kapısını ATLATMA — veri yolu YOK

| Yol                                                | Sonuç                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `Money.zero`                                       | Dış girdi almıyor, sabit `0` ⇒ atlatma yüzeyi yok                 |
| `toJSON` üzerinden yeniden kurma                   | `fromJSON` **yok**; yeniden kurma `Money.of`'tan geçmek zorunda   |
| `amountMinor`                                      | Getter değil, düz alan (`writable: true`)                         |
| `new Money(1e300,'TRY')` (çalışma zamanında)       | **Başarılı** — `private` yalnızca derleme zamanı                  |
| `m.amountMinor = 1e300` (çalışma zamanında)        | **Başarılı** — `readonly` yalnızca derleme zamanı, `Object.freeze` yok |
| `Object.create(Money.prototype)` + `add(of(1))`    | **FIRLATTI** — sonuç `Money.of`'tan geçtiği için uydurma örnek bile yakalanıyor |

⇒ Son iki satır TypeScript dışında (saf JS) **mümkün**, ama bir saldırganın bunu
kullanabilmesi için **süreç içinde kod çalıştırması** gerekir — o noktada zaten tam
kompromi var. Modül yalnızca `Money` dışa açıyor, tüm veri yolları (`JSONB`, HTTP, env)
`Money.of`'tan geçmek zorunda ve `fromJSON` yok ⇒ **bulgu değil**. ⭐ Üçüncü satır
düzeltmenin gücünü gösteriyor: TEK NOKTA, **uydurulmuş** bir örneği bile yakalıyor.

### 2.7 Yeni fırlatma mesajı istemciye sızmıyor

Yeni kapı ham `Error` fırlatıyor ve mesaj tutarı içeriyor (`alınan: 10999999999999988`).
`packages/errors/src/error-body.ts:112-115`: `unknownErrorBody` `message` alanına
`ERROR_MESSAGE_KEYS.INTERNAL_ERROR` (`errors.internal.unknown`) yazıyor — ham `Error`
mesajı **istemciye taşınmıyor**. Tutar zaten kiracının kendi verisi; çapraz-kiracı sızıntı
yok. ⇒ bulgu değil.

---

## 3. ESLint kapı duruşu (M2'nin `guards.sh` değişikliği) — GERİLEME 0

Tur 1 ölçümü **birebir tekrarlandı** (`eslint --print-config`, paket dizininden; kökten
çalıştırmak boş çıktı verir — kök `eslint.config.mjs` YOK):

| Yol                                      | Seçici sayısı | İçerik                                          |
| ---------------------------------------- | ------------- | ----------------------------------------------- |
| ÜRETİM (`packages/i18n/src/money.ts`)    | **6**         | ham SQL 2 + `userMessageKey` literal 1 + float-para 3 |
| TEST (`src/__tests__/money.test.ts`)     | **2**         | ham SQL 2                                       |

⇒ Tur 1 ile **AYNI (6/2)**. `$executeRawUnsafe`/`$queryRawUnsafe` tenant-izolasyon yasağı
flat-config refactor'ında ve M2 düzeltmesinde **kaybolmadı**.

**Yapılandırma varlığı ≠ yürürlük** olduğu için ayrıca **işlevsel** doğrulama yapıldı
(`--stdin --stdin-filename` ile, diske yazmadan):

```
db.$executeRawUnsafe(sql)       →  TETİKLENDİ  "…yasak (CLAUDE.md §2, K-E12): dize
                                   birleştirmeye açık, tenant izolasyonunu atlatabilir"
db["$queryRawUnsafe"](sql)      →  TETİKLENDİ  "…hesaplanmış (computed) erişimle de
                                   çağrılamaz…"
export const price = 19.99      →  TETİKLENDİ  "Float para literali yasak…"
{ totalAmount: 19.99 }          →  TETİKLENDİ  "Float para literali yasak…"
```

⇒ Hem doğrudan hem hesaplanmış erişim biçimi yakalanıyor; float-para yasağı üretim
yolunda **gerçekten yürürlükte**.

**M2'nin 3a-ii pini** (`scripts/guards.sh:1482-1492`) okundu: `grep -cE` ile değişken
adının **satır** sayısı 2'ye pinli. Silme yönünde (en olası gerileme) fail-closed çalışıyor
(0 veya 1 → ihlal). ⓘ Kalıntı kör nokta — teknik olarak kaçınılmaz ve kardeş kontrol 2 ile
aynı: pin **ada göre bağlılığı** doğruluyor, **etkin kapsamı** (blok `files` glob'u)
doğrulamıyor. Bu kör noktayı AC-47 fixture'ları kapatıyor (aşağı) ⇒ ayrı bulgu açılmıyor.

**AC-47 altı fixture — Task dosyasındaki kayıtla birebir yeniden üretildi** (kararlı
pencere: `base.js` sha ölçüm öncesi/sonrası AYNI):

```
money-pozitif-1.ts  exit 1   9:22   "Float para literali yasak…"
money-pozitif-2.ts  exit 1   (1 ihlal)
money-pozitif-3.ts  exit 1  10:10   "Para alanında .toFixed() yasak…"
money-negatif-1/2/3 exit 0   (0 ihlal — discountRate/opacity/widthRatio yanlış-pozitif YOK)
```

---

## 4. Tur 1 `low`'larından bu turda dokunulan kodla ilgili ikisi — TEYİT

1. **`packages/i18n/src/__tests__/purity.test.ts:60-66`** — `@arkesoft/config`'in iki
   katmandan da kaçması: dosya **DOKUNULMADI**. Kanıt: mtime `2026-11-19 21:46:43`,
   dizindeki **en eski** dosya (diğer tüm test dosyaları `11:21`+ ve `13:42`).
   ⇒ Tur 1 `low`'u aynen geçerli, borç tablosuna.
2. **`packages/i18n/src/money.ts:116`** — `assertSameCurrency`'deki
   `eslint-disable-next-line @typescript-eslint/no-unnecessary-condition`: **hâlâ yerinde**
   ve **gerekçeli** (tek üyeli `SupportedCurrencyCode` birleşiminin geçici yan etkisi
   olduğu, `SUPPORTED_CURRENCIES`'e ikinci para birimi eklendiğinde gerçek dal kazanacağı
   yazılı). `backend` kasıtlı dokunmamış, kapsam dışı. ⇒ Borç tablosuna.

---

## 5. `qa`'nın yeni test dosyası — sır/PII taraması

`packages/i18n/src/__tests__/money-safe-integer-range.test.ts` (5 test) okundu:
yalnızca sayısal tutarlar ve `'TRY'` içeriyor; parola/token/API anahtarı/TCKN/kart verisi
**yok**, gerçek müşteri verisi **yok**. Bu turun dokunulan yüzeyinde (`base.js`,
`guards.sh`, `packages/i18n/src`, `__fixtures__`) sır taraması: eşleşen tek şeyler
i18n **mesaj kataloğu** metinleri (`errors.auth.invalidPassword`) ve `guards.sh`'in
literal-jeton kuralı gereği parçalı yazılmış **shell değişken adları**
(`key_token_a='userMessage'` + `'Key'`) — ikisi de sır değil. ⇒ Temiz.

Paket kapsamlı test koşumu (kök `pnpm test` KOŞTURULMADI — run-owner kapısı):
`cd packages/i18n && npx vitest run` → **10 dosya / 84 test, hepsi yeşil, 479 ms**.

---

## BULGULAR

```
BULGULAR:
  - [SEV: low] packages/i18n/src/__tests__/money-safe-integer-range.test.ts:1-17 —
    Dosya başı yorumu BAYAT: "⚠⚠ BULGU: … yalnızca `Number.isInteger` denetler,
    `Number.isSafeInteger` DENETLEMEZ" ve "Bugünkü üretim kodu bu testleri KIRMIZI
    geçirir — bu KASITLIDIR, bulgunun kanıtıdır" diyor. Ölçüm: beş testin BEŞİ de
    YEŞİL (84/84 koşumda). Ayrıca atıf verdiği satır numaraları (`money.ts:79-84,
    98-101,104-107,113-120`) düzeltme sonrası karşılığını yitirdi. Senaryo: bulguyu
    bilmeyen bir geliştirici/ajan dosyayı açıp "asimetri hâlâ AÇIK, testler kırmızı"
    sonucuna varır ve kapanmış bir bulguyu yeniden açar (ya da daha kötüsü, "testler
    kasıtlı kırmızı" diyen yoruma güvenip gerçek bir kırmızıyı normal sayar) —
    güvenlik etkisi yok, sahte-yeşil/sahte-kırmızı okuma riski var.
    → Öneri: yorum "bulgu KAPANDI (gate tur 1 → düzeltme turu 1), bu dosya artık
    REGRESYON testidir" olarak güncellenip satır atıfları tazelensin. — qa (vade: docs
    adımı, bu Task içinde)
```

`critical` / `high` / `medium` bulgu **yok** ⇒ `AGENT_BASELINE.md` §4 uyarınca **PASS**.
Tek `low` düzeltme turu **açmaz** → borç tablosuna (veya `docs` adımında yolu üstünde
kapatılır).

---

## ⚠ ORKESTRATÖRE SÜREÇ UYARISI (bulgu değil, ölçüm hijyeni)

Ölçüm penceremde `packages/config/eslint/base.js` **değişti**: mtime `14:04:59`, benim
`14:02`–`14:06` arası ölçümlerimin **ortasında**. Etkisi somut ve neredeyse rapora girdi:

```
~14:04 (mutasyon penceresi):  fixture yolunda no-restricted-syntax = 3 seçici
                              money-pozitif-1.ts → exit 0, 0 ihlal
~14:06+ (kararlı pencere):    fixture yolunda no-restricted-syntax = 6 seçici
                              money-pozitif-1.ts → exit 1, 9:22  ✓ Task kaydıyla birebir
```

İlk okumayı "AC-47 fixture'ları sahte yeşil" diye bir bulgu olarak yazmak üzereydim;
`base.js`'in mtime'ını kontrol edip sha-sabitlenmiş kararlı pencerede yeniden ölçünce
**eşzamanlı bir ajanın mutasyon testinin gürültüsü** olduğu ortaya çıktı (M2'nin
doğrulaması tam olarak `:386`'daki spread'i silip geri koymak). Bu, AGENT_BASELINE §5'teki
_"Eşzamanlı komut koşturma — kendi gürültünü bulgu sanma"_ tuzağının bu Task'taki yeni bir
vakası.

⚠⚠ **İKİNCİ dokunuş** (rapor yazılırken ölçüldü): `base.js` mtime `14:04:59` → **`14:11:39`**
olarak yeniden değişti, ama sha **birebir aynı** kaldı (`89ea1b88…`) ⇒ içerik **net sıfır**,
yalnızca dosya yeniden yazılmış (muhtemelen eşzamanlı bir `prettier --write` veya ikinci bir
mutasyon+geri alma çevrimi). Kendi `prettier --write`'ım **yalnızca bu rapor dosyasını**
hedefledi — base.js'e dokunmadım (sha kanıtı). Teyit tekrarlandı: `money-pozitif-1.ts`
**exit 1**, 3a-ii geçiş sayısı **2** ⇒ kapı sağlam ve bu raporun TÜM ölçümleri geçerli.

⇒ **Eylem önerisi:** (1) Bu pencerede (`14:00`–`14:12`) ölçüm alan diğer paralel ajanların
(`solid` TAM, `qa` DAR) `base.js`/`lint` ile ilgili ölçümleri **yeniden alınmalı** — kendi
yanlış okumam bu pencerenin ölçüm değerini düşürdüğünün kanıtı. (2) Üretim dosyasında
mutasyon testi yapan ajan bunu Orkestratöre bildirmeli ve pencere diğer gate'lerle
çakışmayacak şekilde **seri** hâle getirilmeli. (3) ⚠ AGENT_BASELINE §5 _"başka ajanın
dosyasında `prettier --write` çalıştırma"_ yasağı ihlal edilmiş olabilir (`base.js` sahibi
`devops`); içerik net sıfır olduğu için zarar yok, ama Orkestratör kimin dokunduğunu
teyit etmeli.

---

## ÖLÇÜMLER

- **İncelenen dosya:** 9 — `packages/i18n/src/money.ts`,
  `packages/i18n/src/__tests__/money-safe-integer-range.test.ts`,
  `packages/i18n/src/__tests__/purity.test.ts`, `packages/config/eslint/base.js`,
  `packages/config/eslint.config.mjs`, altı `packages/config/eslint/__fixtures__/*.ts`
  (tek kalem), `scripts/guards.sh`, `packages/errors/src/error-body.ts`,
  `.claude/workflow/tasks/T-027.md` (AC-47 kaydı)
- **`Money` ampirik denemesi:** 1.307.651 çağrı; sessiz-yanlış **0**, yanlış-pozitif **0**
- **Tur 1 `medium`:** 1 → **KAPANDI** (3/3 vaka bağımsız doğrulandı)
- **Yeni bulgu:** `critical` 0 · `high` 0 · `medium` 0 · `low` 1
- **ESLint kapı duruşu:** ÜRETİM 6 seçici / TEST 2 seçici — tur 1 ile **aynı**, gerileme 0;
  ham SQL yasağı 2 erişim biçiminde de **işlevsel olarak** tetiklendi
- **AC-47 fixture:** 3 pozitif `exit 1` / 3 negatif `exit 0` — Task kaydıyla birebir
- **Paket testi:** `packages/i18n` → 10 dosya / 84 test yeşil (479 ms)
- **Tenant izolasyon listesinden karşılanmayan madde:** **yok** (bu turda dokunulan yüzey
  — `Money` değer nesnesi, ESLint yapılandırması, `guards.sh` — kiracı verisine, sorguya,
  önbellek anahtarına, S3 önekine, kuyruk payload'ına **dokunmuyor**; §7 tam denetimi
  tur 1'de yapıldı ve sonucu taşınıyor)
- **`pnpm audit` / KVKK / fail-closed matrisi / DOM sink / canlı DB yetkileri:** DAR kapsam
  gereği **koşturulmadı**; tur 1 sonuçları geçerli
- **Ölçüm koşulları:** kararlı pencere `base.js` sha `89ea1b88…` ile ölçüm öncesi/sonrası
  teyit edildi; kök `pnpm test`/`test:isolation` **koşturulmadı** (run-owner kapısı,
  `solid`/`qa` paralel)
```
