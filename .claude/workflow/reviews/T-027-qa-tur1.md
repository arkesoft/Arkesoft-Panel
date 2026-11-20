# T-027 — qa gate, tur 1

Tarih: 2026-11-20 · Platform sürümü: 0.11.0 (fixed grup, `@arkesoft/i18n` dahil)

GATE: qa
SONUÇ: PASS (teknik borca kaydedilen 2 `medium` — ikisi de `solid` tur 1'in bulgularıyla AYNI kök neden, bağımsız olarak mutasyonla doğrulandı)

---

## 1. Kabul kriteri → test eşlemesi (karşılıksız kriter YOK)

| AC | Konu | Kapsayan test(ler) | Durum |
| --- | --- | --- | --- |
| AC-42 | paket + `guards` sürüm tutarlılığı | `guards` "Platform sürüm tutarlılığı (--check)" adımı + `sync-platform-version.ts --check` | PASS (ölçüldü) |
| AC-43(a) | tam olmayan kuruş fırlatır | `money.test.ts` "AC-43(a)" | PASS |
| AC-43(b) | para birimi uyuşmazlığı → FIRLATIR | `money.test.ts` "AC-43(b)" ×4 (add/subtract/compare/equals) | PASS |
| AC-43(c) | her yuvarlama modu için yarım-nokta | `rounding.test.ts` + `money.test.ts` "AC-43(c) dört satır" | PASS — **mutasyonla doğrulandı** (bkz. §2.2) |
| AC-43(d) | `toFixed`/`parseFloat`/ondalık literal 0 eşleşme | `money.ts` grep (0), `AC-43(d)` handoff ölçümü | PASS (bağımsız doğrulandı: `grep -n "toFixed\|parseFloat" packages/i18n/src/money.ts` → 0) |
| AC-43(e) | `db`/`trpc`'ye bağımlı değil | `purity.test.ts` "package.json dependencies TAM OLARAK" | PASS |
| AC-44 | format: `tr-TR` varsayılan, locale parametre, geri düşme, asla boş dize, eksik/fazla değişken fırlatır | `message-resolver.test.ts`, `interpolate.test.ts`, `formatters.test.ts` | PASS (boş bundle + `defaultLocale` yok senaryosu dahil, `message-resolver.test.ts:85-89`) |
| AC-45 | drift testi 35 anahtar + yetim anahtar da kırar + negatif kanıt + literal-jeton | `tr-tr-errors.test.ts`, `catalog-diff.test.ts`, `guards.sh` adım 24 alt kontrol 1 | PASS — **mutasyonla doğrulandı** (bkz. §2.1) |
| AC-46 | `guards` 23→24, tohumlanmış drift exit 1 | `scripts/guards.sh` çalıştırması | PASS (24/24, bkz. §3) |
| AC-47 | ESLint ≥3 pozitif/≥3 negatif, yeni bağımlılık 0 | `packages/config/eslint/__fixtures__/*` (4 poz + 5 neg dahil çeşitli), `git diff packages/config/package.json` boş | PASS |
| AC-48 | şema tarafı float-para yasağı, fixture | `float-money-ban.test.ts` (4 poz + 5 neg) | PASS |
| AC-49 | `Currency` platform seviyesi, expand-only, tek doğruluk kaynağı + iki yönlü drift | `currency-i18n-consistency.test.ts` | PASS — çoklu-INSERT senaryosu elle doğrulandı (bkz. §4) |
| AC-50 | biçimlendiricinin gerçek tüketicisi var | `apps/superadmin/src/lib/format-platform-date.ts` → `@arkesoft/i18n` `formatDate` (gerçek çağrı, test dosyasında da pinli) | PASS |
| AC-51 | zorunlu kapı + `test:contract` yeşil VE tel sözleşmesi DEĞİŞMEDİ | `pnpm test:contract` (34/34) + `git diff --stat docs/api-contract-surface.json` (boş) | PASS (bağımsız koşturuldu) |

---

## 2. ⚠⚠ İstenen mutasyon doğrulamaları

### 2.1 AC-45 negatif kanıt — `diffCatalogAgainstKeys` gerçekten ayırt ediyor mu

`catalog-diff.ts`'in `orphan` hesabını kaldırdım (`orphan` sabit `[]` döndürecek şekilde),
`npx vitest run catalog-diff` koşturdum: **2/7 test KIRMIZI** oldu (`orphan`'ı doğrulayan iki
test). Dosyayı `Write` ile orijinaline geri yazdım, `diff` ile **bayt-eş** olduğunu doğruladım,
7/7 yeniden yeşil. ⇒ S5a'nın "7 test, gerçek mutasyon yok" beyanı **doğru** ve testler
**vacuous değil**.

### 2.2 AC-43(c) ikinci satırının (15/2) gerçekten ayırt edici olduğu

`rounding.ts`'in `half-even` dalını *".5'te hep aşağı"* olarak değiştirdim
(`roundedAbsQuotient = truncatedQuotient` sabit). `npx vitest run rounding money`:

- `rounding.test.ts`: 9 testten **yalnızca** `15/2` satırı KIRMIZI (8/9 yeşil kaldı).
- `money.test.ts`: 21 testten **yalnızca** `of(15).multiplyByRatio` satırı KIRMIZI (20/21 yeşil kaldı).
- Satır 1 (`5/2`), satır 3 (`25/10`), satır 4 (negatif `-5/2`) **hepsi yeşil kaldı** —
  çünkü bu üç vakada `truncatedQuotient` zaten **çift** sayı, mutasyonun ürettiği
  "her zaman aşağı" davranışı doğru `half-even` sonucuyla **tesadüfen** çakışıyor.

**Sonuç:** `po`'nun bağlayıcı şartı **doğrulandı, gereksiz DEĞİLDİ** — `15/2` satırı
olmadan bu regresyon **hiçbir testi kırmadan** geçerdi. Dosyayı orijinaline geri yazdım,
`diff` ile bayt-eş doğrulandı, 35/35 (i18n) yeniden yeşil.

### 2.3 ⚠⚠ Money taşma asimetrisi — test kapsamı ölçümü

`money.test.ts`'te `MAX_SAFE`/aralık testi **tek yerde** (satır 129-134) ve **yalnızca**
`multiplyByRatio` için — `of`/`add`/`subtract`/`multiplyBy` için **hiç yok**
(`grep -n "MAX_SAFE\|isSafeInteger\|overflow" money.test.ts` → 1 eşleşme). Bunu **ölçümle**
doğruladım (node REPL: `999999999999999 * 11 === 10999999999999988`, gerçek değer BigInt ile
`10999999999999989` — 1 kuruş sessiz fark).

**Eksik testi yazdım:** `packages/i18n/src/__tests__/money-safe-integer-range.test.ts` (5 test) —
`of`/`add`/`subtract`/`multiplyBy`'ın `multiplyByRatio` ile AYNI güvenli-aralık denetimini
yapmasını (fırlatmasını) bekler. **4/5 test bugün KIRMIZI** — bu KASITLIDIR, boşluğun
çalıştırılabilir kanıtıdır (üretim kodunu düzeltmedim, qa rolü dışı).

⚠ Bu, `solid` tur 1 bulgu #1 ve `security`'nin (medium) bulgusuyla **AYNI kök neden** —
mükerrer SEV sayılmamalı, üçü de aynı deliği farklı açılardan ölçtü.

---

## 3. ⚠⚠ guards.sh'in kendi tamlığı — mutasyonla sınandı

`solid` tur 1 bulgu #2: alt kontrol 3a yalnızca `MONEY_NAME_SOURCE` **atamasının** tekliğini
sayıyor, `moneyRestrictedSyntaxSelectors`'ın **kullanımının** (`base.js:386`
`...moneyRestrictedSyntaxSelectors,`) kural dizisine bağlı olup olmadığını denetlemiyor.
Bağımsız doğruladım:

1. `base.js:386`'daki `...moneyRestrictedSyntaxSelectors,` satırını sildim (sadece bu satır).
2. `npx eslint --no-ignore --config eslint.config.mjs` ile üç pozitif fixture'ı koşturdum:
   **0 hata** (önceden 3 hata) — float-para ESLint kuralı **tamamen sessizce kayboldu**.
3. Aynı anda guards'ın alt kontrol 2 (`userMessageKeyLiteralSelector` geçiş sayısı = 2) ve
   alt kontrol 3a (`MONEY_NAME_SOURCE` atama sayısı = 1) komutlarını elle koşturdum —
   **ikisi de PASS** verdi (ilgisiz oldukları için — alt kontrol 2 farklı bir seçiciyi
   denetliyor, alt kontrol 3a yalnızca atamayı sayıyor).
4. `base.js`'i `Write` ile orijinale geri yazdım, `diff`/`md5` ile bayt-eş doğrulandı,
   3 pozitif fixture yeniden **3 hata** verdi (düzeltildiğini kanıtladı).

**Sonuç:** `solid`'in bulgusu **doğrulandı** — bu MEKANİK kapının (AC-46) kendisi, kendi
amacının (AC-47'nin float-para yasağının silinmesini yakalamak) en doğrudan regresyon
vektörüne karşı **kör**. `pnpm lint` 25/25 VE `pnpm guards` 24/24 kalırken AC-47'nin tüm
korumasının kaybolabildiği **gösterildi**. Aynı kök neden, `solid`'in SEV'iyle (medium)
tutarlı raporluyorum — mükerrer sayılmamalı.

Ayrıca `pnpm guards` (bugünkü, mutasyonsuz hal) **24/24 PASS** çalıştırıldı — S8'in handoff
iddiası bağımsız doğrulandı.

---

## 4. ⚠ Eksik senaryo avı — sonuçlar

| Senaryo | Sonuç |
| --- | --- |
| `Money`: sıfır bölen (`denominator: 0`) | **Test VAR** (`money.test.ts` "Ratio.denominator sıfırsa fırlatır") — kapsanıyor |
| `Money`: negatif `Ratio` | Dolaylı kapsanıyor (`of(-5).multiplyByRatio` satırı negatif tutarı test ediyor; negatif `numerator`/`denominator` ayrıca `rounding.test.ts`'te "negatif payda" testiyle kapsanıyor) |
| `Money`: `Ratio` tam sayı değilse | **Test VAR** ("ondalık Ratio.numerator/denominator fırlatır") |
| `formatMessage`: iç içe süslü parantez (`{{name}}`) | Test YOK — elle doğruladım: regex tek seviyeli eşleşme yapıyor, davranış tanımsız değil ama belgelenmemiş. Bugün **üretim tüketicisi sıfır** (dosya başı yorumu) ⇒ `low` borç, test yazmadım (gerçek risk yok) |
| `formatMessage`: kaçırılmış parantez (`{name`) | Elle doğruladım: regex eşleşmiyor ⇒ değişken "fazla" sayılır ⇒ FIRLAR (iki yönlü fail-closed zaten yakalıyor) — gap YOK |
| `formatMessage`: aynı değişken iki kez | **Test VAR** ("aynı değişken birden çok yerde geçerse…") |
| `createMessageResolver`: boş bundle | **Test VAR** ("varsayılan locale bundle içinde YOKSA… FIRLAR") |
| `createMessageResolver`: `defaultLocale` bundle'da yok | Aynı test yukarıdakiyle BİRLİKTE kapsanıyor (boş bundle = defaultLocale'in de yok olduğu özel durum) |
| `diffCatalogAgainstKeys`: ikisi de boş | **Test VAR** ("boş defter + boş katalog…") |
| `diffCatalogAgainstKeys`: aynı anahtar hem missing hem orphan | **Mantıksal olarak İMKÂNSIZ** — `orphan` kataloğun TAŞIDIĞI anahtarlardan, `missing` kataloğun TAŞIMADIĞI anahtarlardan türetiliyor; aynı dize ikisine de giremez (fonksiyonun kendi tanımından). Test yazılmadı, gerek yok. |
| Paneller: `messageKey` geçerli ama katalogda karşılığı yok (çalışma zamanı) | `t()` TOTAL imzalı (`ErrorMessageKey` kapalı küme), `satisfies Record<ErrorMessageKey,string>` derleme zamanında eksik anahtarı zaten kırıyor ⇒ çalışma zamanında bu durum **oluşamaz** (ölçüldü: `tr-tr-errors.ts` 35/35). Gap YOK |
| `Currency` drift testi: migration SQL'inde İKİ `INSERT` satırı | Elle doğruladım (node ile regex testi): `matchAll` iki satırı da doğru ayrıştırıyor, `diffCurrencySeedAgainstSupportedCurrencies` zaten çok-satır senaryosunu (`[NEGATİF 3]`) sentetik fixture ile kapsıyor. Gap YOK |
| Prototip zinciri (`__proto__`/`constructor`/…) negatif testi | **YOKTU** (security'nin bulgusu) — **yazdım** (bkz. §5) |

---

## 5. ⚠ İki panel geriye dönük bulgu/kararları

### 5.1 Prototip zinciri negatif testi (security → qa atandı)

`isRegisteredPlatformCode` (`Object.hasOwn(ERROR_MESSAGE_KEYS, code)`) davranışını ölçtüm:
`__proto__`/`constructor`/`toString`/`hasOwnProperty`/`valueOf` için `Object.hasOwn` **5/5
false** döner (bugün güvenli). Bu seçimi PİNLEYEN test yoktu. İki panelde
(`apps/admin/src/__tests__/messages.test.ts`, `apps/superadmin/src/__tests__/messages.test.ts`)
`it.each` ile 6 jetonluk negatif test ekledim — ikisi de **yeşil** (davranış bugün doğru,
artık mekanik olarak korunuyor).

### 5.2 İki aile aynı metni taşıyan kodlar — mekanik pin (solid → qa'ya devredildi)

**Kararım:** bu testi **ben yazdım** (qa rolü "eksik test yaz" kapsamında) — davranışsal bir
üretim düzeltmesi DEĞİL, yalnızca mevcut (bugün doğru) durumu mekanik olarak pinleyen bir
test. Drift gerçekleşirse (gelecekte) düzeltme turunda **sorumlu ajan `frontend`**'dir
(bu dosyaların birincil yazıcısı — `messages.ts:5`). `EMAIL_NOT_VERIFIED`,
`ACCOUNT_TEMPORARILY_LOCKED`, `INVALID_PASSWORD` için `resolveErrorMessage(code) ===
TR_TR_ERROR_MESSAGES[ERROR_MESSAGE_KEYS[code]]` ikisinde de **yeşil** (bugün drift yok).

---

## 6. Flaky kontrol

`catalog-diff.test.ts`, `rounding.test.ts`, `money.test.ts` üçer kez art arda koşturuldu
(mutasyon turlarının öncesi/sonrası dahil) — sonuç her koşumda birebir aynı (7/7, 35/35).
`test:isolation` ayrı bir koşumda **eşzamanlılık gürültüsü** verdi (arka planda sürmekte
olan `turbo run test --continue`'umla çakıştı — run-owner kapısı doğru çalıştı, kendi
gürültümdü, bulgu DEĞİL — AGENT_BASELINE §5). Arka plan işi bittikten SONRA tekrar
koşturuldu: **12/12, 31/31**, temiz.

---

## 7. e2e / Playwright kararı

**`pnpm test:e2e` koşturulmadı.** Gerekçe:

- `po`'nun A-PO27-3'ü + `security`'nin bağımsız doğrulaması: taşınan 17 Türkçe metnin
  HİÇBİRİ e2e'de pinli değil; tek pinli metin (`'E-posta veya parola hatalı.'`) Better Auth
  ailesine ait ve bu Task'ta **DEĞİŞMEDİ** (ölçüldüm: `grep -n "E-posta veya parola hatalı"
  apps/admin/src/messages/messages.ts` → değer birebir aynı).
- Bu Task kritik akışlardan (kayıt/kur/ürün/sipariş/ödeme/kargo) hiçbirine **dokunmuyor** —
  yalnızca hata metni çözümleme yolunu (zaten var olan bir mekanizmayı) değiştiriyor.
- Risk/fayda: port 3000/5173/5174 kullanıcı oturumlarına dokunma yasağı + depo PUBLIC +
  `retries: 0` kısıtları altında koşturmanın getirisi (zaten e2e'de pinlenmeyen bir metin
  kümesini bir kez daha gözlemlemek) maliyetine değmiyor.

---

## BULGULAR

- [SEV: medium] `packages/i18n/src/money.ts:79-120` (`of`/`add`/`subtract`/`multiplyBy`) —
  `Number.isInteger` yalnızca kesirsizliği denetliyor, `multiplyByRatio`'nun
  `toSafeIntegerFromBigInt`'i (`:55-62`) ile AYNI güvenli-aralık denetimini yapmıyor ⇒
  `Money.of(999999999999999,'TRY').multiplyBy(11)` sessizce 1 kuruş yanlış değer üretir
  (ölçüldü: BigInt gerçek değer `10999999999999989`, `number` sonucu `10999999999999988`).
  Kanıt: `packages/i18n/src/__tests__/money-safe-integer-range.test.ts` (yeni, 5 test, 4/5
  bugün KIRMIZI — kasıtlı). ⚠ `solid` tur 1 #1 ve `security`'nin medium'u ile AYNI kök
  neden — toplam medium sayımında MÜKERRER sayılmamalı. Önerilen düzeltme: dört metodun
  tamamına `toSafeIntegerFromBigInt`'in aynı denetimini (veya `Number.isSafeInteger`
  kontrolünü) ekle. Sorumlu ajan: `backend` (S5b'nin birincil yazıcısı).

- [SEV: medium] `scripts/guards.sh:1436-1446` (alt kontrol 3a) — `MONEY_NAME_SOURCE`
  atamasının TEKLİĞİNİ sayıyor ama `moneyRestrictedSyntaxSelectors`'ın (`base.js:190-205`)
  kural dizisine (`base.js:386`) GERÇEKTEN bağlı olup olmadığını denetlemiyor. Mutasyonla
  kanıtlandı (§3): `base.js:386`'daki `...moneyRestrictedSyntaxSelectors,` satırı
  silindiğinde `pnpm lint` (3 pozitif fixture'da 0 hata) VE `pnpm guards` (24/24) **ikisi de
  yeşil kalıyor** — AC-47'nin float-para ESLint koruması tamamen ve sessizce kaybolabiliyor.
  ⚠ `solid` tur 1 #2 ile AYNI bulgu, bağımsız doğrulandı — MÜKERRER sayılmamalı. Önerilen
  düzeltme: alt kontrol 3a'ya `base.js`'in `no-restricted-syntax` dizisi İÇİNDE
  `...moneyRestrictedSyntaxSelectors` kullanımının (spread) varlığını da sayan bir denetim
  ekle (alt kontrol 2'nin `userMessageKeyLiteralSelector` için kullandığı "tanım + kullanım
  = 2 geçiş" desenine birebir benzer). Sorumlu ajan: `devops` (S8'in birincil yazıcısı).

- [SEV: low] `packages/i18n/src/interpolate.ts` — iç içe süslü parantez (`{{name}}`) davranışı
  belgelenmemiş/test edilmemiş (bugün üretim tüketicisi sıfır, dosya başı yorumunda zaten
  kayıtlı). Vade: bu fonksiyonun ilk gerçek tüketicisi geldiğinde (dosya başı yorumunun
  öngördüğü `ACCOUNT_TEMPORARILY_LOCKED` varyantı — ama o metin bilerek bu pakete
  taşınmıyor, `apps/admin`'de kalıyor) tekrar değerlendirilmeli. Sorumlu ajan: `backend`.

BULGULAR (yukarıdaki üçü dışında): yok.

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:** §1'deki tablo — **10/10 AC (42-51) bir teste eşlendi, karşılıksız
kriter YOK.**

**TEST SAYILARI:**

| Paket | Önce (S-turları sonrası) | qa tur 1 sonrası | Yeni eklenen |
| --- | --- | --- | --- |
| `@arkesoft/i18n` | 9 dosya / 73 test | **10 dosya / 78 test (74 PASS, 4 FAIL — kasıtlı)** | +1 dosya / +5 test |
| `apps/admin` | 22 dosya / 198 test | **22 dosya / 207 test (207 PASS)** | +9 test |
| `apps/superadmin` | 13 dosya / 90 test | **13 dosya / 98 test (98 PASS)** | +8 test |
| `apps/api` | 105 dosya / 878 test | **105 dosya / 878 test (878 PASS)** | 0 (regresyon kontrolü) |
| `packages/db` | 19 dosya / 290 test | **19 dosya / 290 test (290 PASS)** | 0 (regresyon kontrolü) |
| `packages/errors` | 4 dosya / 65 test | **4 dosya / 65 test (65 PASS)** | 0 (regresyon kontrolü) |
| `packages/trpc` (contract) | 34/34 | **34/34 PASS** | 0 |

**Kök `pnpm test` (turbo, 23 paket):** 22/23 başarılı, **1 başarısız** (`@arkesoft/i18n#test` —
kasıtlı, yeni yazdığım `money-safe-integer-range.test.ts`'in 4 testi bilinen defekti
sergiliyor). Toplam **878+207+98+290+65+… ≈ bütün paketlerde sıfır regresyon**, tek kırmızı
benim eklediğim kanıt testi.

**KOŞTURULAN KOMUTLAR:**

| Komut | Exit kodu | Özet |
| --- | --- | --- |
| `pnpm lint` | 0 | 25/25 paket PASS |
| `pnpm typecheck` | 0 | 25/25 paket PASS |
| `pnpm build` | 0 | 15/15 paket PASS, iki bundle bütçesi de geçti (admin 183.45/250 KiB, superadmin 163.03/250 KiB) |
| `pnpm test` (kök) | **1** | 22/23 paket PASS, `@arkesoft/i18n` kasıtlı kırmızı (4/78) |
| `npx vitest run` (`packages/i18n`, izole) | 1 | 74/78 PASS, 4 kasıtlı KIRMIZI |
| `npx vitest run` (`apps/admin`, izole) | 0 | 207/207 PASS |
| `npx vitest run` (`apps/superadmin`, izole) | 0 | 98/98 PASS |
| `pnpm test:isolation` | 0 | 12/12 görev, 31/31 test PASS (ilk koşum eşzamanlılık gürültüsüyle kirlendi, kendi arka plan işimle — tekrar koşumda temiz) |
| `pnpm guards` | 0 | **24/24 PASS** |
| `pnpm test:contract` | 0 | 34/34 PASS, `docs/api-contract-surface.json` diff **boş** (AC-51) |
| `pnpm format:check` | 0 | PASS |
| `pnpm env:check` | 0 | PASS |
| `pnpm --filter @arkesoft/config exec eslint --no-ignore --config eslint.config.mjs <money fixture'ları>` | 0/1 | Mutasyon öncesi: 3 hata (doğru). Mutasyon sonrası (spread silinmiş): 0 hata (AC-47'nin tamamen kaybolduğunu kanıtlar). Geri alındıktan sonra: yine 3 hata |

**MUTASYON KANITLARI (üçü de `Write` ile geri alındı, `diff`/`md5` ile bayt-eş doğrulandı):**
1. `catalog-diff.ts` orphan hesabı kaldırıldı → 2/7 test KIRMIZI → geri alındı → 7/7 YEŞİL.
2. `rounding.ts` half-even "hep aşağı" yapıldı → **yalnızca** 15/2 satırları KIRMIZI (rounding
   1/9, money 1/21) → geri alındı → 35/35 YEŞİL.
3. `base.js`'ten `...moneyRestrictedSyntaxSelectors` spread'i silindi → `pnpm lint`-eşdeğeri
   3 pozitif fixture'da 0 hata (AC-47 KAYBOLDU) AMA `pnpm guards` alt kontrol 2/3a yine PASS
   → geri alındı → 3 fixture yeniden 3 hata.

**DOSYALAR (bu turda eklenen/değiştirilen, qa):**
- `packages/i18n/src/__tests__/money-safe-integer-range.test.ts` (yeni, 5 test)
- `apps/admin/src/__tests__/messages.test.ts` (+9 test: prototip zinciri 6 + mekanik pin 3)
- `apps/superadmin/src/__tests__/messages.test.ts` (+8 test: prototip zinciri 6 + mekanik pin 2)
