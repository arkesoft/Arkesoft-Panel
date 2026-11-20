# T-027 — QA Gate, Tur 2 (DAR kapsam)

Tarih: 2026-11-20 · Sürüm: v0.0.18 (platform minor hedefi) · Dal: `feat/v0.0.21-surum-kayit-modeli`

GATE: qa
SONUÇ: PASS

## Kapsam

Tur 1'de PASS verildi (2 `medium` mükerrer + 1 `low`, teknik borca kaydedildi). Tur 2 DAR
kapsamda **yalnızca üç şey** denetlendi — yeni tarama yapılmadı:

1. Tur 1'in kasıtlı kırmızı testi (`money-safe-integer-range.test.ts`) yeşile dönmüş mü,
   gevşetilmemiş mi, hâlâ gerçek bir defekti yakalıyor mu (mutasyonla doğrulandı).
2. `backend`'in `multiplyByRatio`'yu BigInt'e taşımama kararının test kapsamı — simetri
   iddiası ek vektörlerle sınandı.
3. `devops`'un `guards.sh` alt kontrol 3a-ii düzeltmesi — tur 1'in mutasyonu birebir tekrar
   edildi + devops'un ölçmediği iki senaryo (0 geçiş, >2 geçiş) ayrıca sınandı.

## BULGULAR

BULGULAR: yok

## ÖLÇÜMLER

### 1. Kasıtlı kırmızı test — yeşil VE hâlâ gerçek

- `packages/i18n/src/__tests__/money-safe-integer-range.test.ts`: `git status --porcelain`
  → `??` (paket hiç commit'lenmemiş, tüm `packages/i18n` yeni). Commit sınırı olmadığı için
  `git diff` ile tur1→tur2 karşılaştırması yapılamadı; bunun yerine **mtime + içerik**
  kanıtı kullanıldı: dosyanın mtime'ı (13:09:39) `money.ts`'in (13:41:58) VE
  `money.test.ts`'in (13:42:14) mtime'ından **önce** — backend'in düzeltme turundan sonra
  bu dosyaya hiç dokunulmamış. İçerik de tur 1'in ölçülmüş tanımıyla birebir örtüşüyor: 5
  test, başlık yorumu "4'ü kasıtlı FAIL" vakasını anlatıyor.
- `cd packages/i18n && npx vitest run src/__tests__/money-safe-integer-range.test.ts
  src/__tests__/money.test.ts` → **32/32 PASS** (ilk çalıştırma, mutasyon öncesi).
- **Vacuous test kontrolü (kasıtlı mutasyon):** `Money.of`'taki
  `if (!Number.isSafeInteger(amountMinor)) { throw … }` bloğu (`money.ts:103-107`)
  `Write` ile geçici olarak kaldırıldı (yalnızca bu bloğun yorumunda "QA GATE TUR 2 KASITLI
  MUTASYON" notu bırakıldı). Aynı iki dosya tekrar çalıştırıldı:
  **8 FAIL / 24 PASS** — başarısız olan 8 test: benim 4 testimin TÜMÜ + backend'in
  `money.test.ts`'e eklediği "güvenli tamsayı aralığı" bloğundaki 6 testin 4'ü (sınır
  testleri — "sınırdaki değerler fırlatmaz" ve "multiplyBy güvenli aralık içinde doğru
  sonuç döner" testleri zaten aralık içinde kaldıkları için beklenen şekilde PASS kaldı).
  ⇒ Test **vacuous DEĞİL** — gerçek bir regresyonu kesin olarak yakalıyor.
- Mutasyon `Write` ile **birebir orijinal içerikle** geri yazıldı; ardından aynı iki dosya
  tekrar çalıştırıldı → **32/32 PASS**.

### 2. `multiplyByRatio`'yu BigInt'e taşımama kararı — simetri iddiası sınandı

`money.test.ts`'teki `backend`'in +6 testi (`'Money — güvenli tamsayı aralığı (gate turu
bir düzeltmesi…)'` bloğu) incelendi — şu vakaları KAPSIYOR: sınır değeri (fırlatmaz),
`of` doğrudan aşım, `add`/`subtract` **tam `MAX_SAFE_INTEGER + 2`** sınırında aşım,
`multiplyBy`'ın IEEE-754 yuvarlama örneği (999999999999999 × 11), regresyon kontrolü.

Brief'in işaret ettiği **boşlukları** QA ek test dosyasıyla kapattı —
`packages/i18n/src/__tests__/money-safe-integer-range-tur2.test.ts` (5 yeni test, hepsi
**yeşil**, kapsam genişlemesi):

1. `multiplyBy(1e300)` — tam sayı AMA güvenli OLMAYAN `quantity`. `multiplyBy`'ın ön
   denetimi (`money.ts:139`, `Number.isInteger`) bunu reddetmiyor (`Number.isInteger(1e300)
   === true`) — `backend` bu ön denetimi KASITLI OLARAK değiştirmedi (PM'in riski). Test:
   **fırlıyor** (Money.of'un `isSafeInteger` denetimi bunu zaten yakalıyor) → ✅ iddia
   doğrulandı, bulgu YOK.
2. `add` — sınırdan farklı büyüklükte, iki büyük terimin toplamı
   (`MAX_SAFE_INTEGER - 1 + MAX_SAFE_INTEGER`) → **fırlıyor**.
3. `add` (subtract DIŞINDA) ile `MIN_SAFE_INTEGER` altına inen negatif taşma → **fırlıyor**
   (tur 1'in testleri bu yönü yalnızca `subtract` üzerinden sınıyordu).
4. `subtract` — taşma OLMAYAN, güvenli aralığa GERİ DÖNEN bir çıkarma → doğru sonuç
   (gevşetme yok, regresyon kontrolü).
5. `Money.zero`/`toJSON` "bypass" ekseni: **test edilebilir bir bypass yolu YOK** — paket
   içinde `fromJSON`/deserializer bulunmuyor (`grep -rn "amountMinor" packages/i18n/src/*.ts`
   doğrulandı), `toJSON` salt çıkıştır. Bu eksen bugün **konusuz**; ileride bir
   deserializer eklenirse yeni bir drift testi gerekir — not düşüldü, bulgu AÇILMADI
   (henüz var olmayan bir kod yoluna karşı test yazılmaz).

⇒ `backend`'in simetri iddiası ("gerçek sonuç aralığı aştığında kayan nokta sonucu da
KESİNLİKLE aralık dışına düşer") **beş ek vektörde de doğrulandı**. `multiplyByRatio`'yu
ayrı bir BigInt yoluna taşımama kararı test kapsamıyla desteklenmiş durumda. Bulgu YOK.

`cd packages/i18n && npx vitest run` (paket geneli, QA'nın yeni tur2 dosyası dahil) →
**11 dosya / 89 test PASS** (84 taban + 5 yeni). `pnpm --filter @arkesoft/i18n typecheck`
→ temiz. `pnpm --filter @arkesoft/i18n lint` → temiz. `npx prettier --check` (yeni dosya)
→ zaten doğru biçimli.

### 3. `guards.sh` alt kontrol 3a-ii — M2 mutasyonu + devops'un ölçmediği iki senaryo

Taban: `pnpm guards` → **24/24 PASS** (orkestratörün ön ölçümüyle birebir örtüşüyor).

**(a) Tur 1'in mutasyonu birebir tekrarı** — `packages/config/eslint/base.js:386`'daki
`...moneyRestrictedSyntaxSelectors,` kullanım satırı `Write` ile dosyadan çıkarıldı
(tanım `:190` dosyada DURUYOR):

```
pnpm guards → FAIL
AC-46 alt kontrol 3a-ii İHLALİ — … TAM İKİ geçiş bekleniyordu, 1 kez bulundu
  (0 ise seçiciler silinmiş; 1 ise tanım dururken kural dizisinden DÜŞÜRÜLMÜŞ —
  sessiz sahte yeşil, AC-47'nin TÜM float-para koruması kaybolur; >2 ise
  ikinci bir kopya doğmuş).
```

⇒ **Artık yakalanıyor** (tur 1'de bu mutasyon `pnpm guards` 24/24 YEŞİL verip AC-47
korumasını sessizce düşürüyordu — tam olarak M2'nin tanımladığı kör nokta).

`Write` ile birebir orijinal içerik geri yazıldı → `pnpm guards` → **24/24 PASS**.
`diff` (orijinal yedek ↔ geri yazılan dosya) → **IDENTICAL**. `git diff --stat` HEAD'e göre
**163 ekleme / 14 silme** — bu Task'ın T-027/S4 diff'i, mutasyon öncesi/sonrası birebir aynı
(net sıfır).

**(b) devops'un ÖLÇMEDİĞİ senaryo 1 — tanımı silmek (0 geçiş):** hem `:190`'daki tanım bloğu
hem `:386`'daki kullanım satırı birlikte kaldırıldı (`MONEY_NAME_SOURCE` dokunulmadı, o ayrı
bir alt kontrol):

```
pnpm guards → FAIL (exit 1)
AC-46 alt kontrol 3a-ii İHLALİ — … 0 kez bulundu
  (0 ise seçiciler silinmiş; …)
```

⇒ Doğru dal (0 kez) tetiklendi, mesaj metni de doğru okundu. Orijinal içerik `Write` ile
geri yazıldı, `pnpm guards` → 24/24 PASS doğrulandı (ara kontrol).

**(c) devops'un ÖLÇMEDİĞİ senaryo 2 — ikinci kopya (>2 geçiş):** tanımın hemen altına
`moneyRestrictedSyntaxSelectors.length`'a referans veren zararsız bir yardımcı değişken
eklendi (üçüncü eşleşen satır doğurmak için — `\b…\b` kelime sınırı doğrulandı: `.length`
öncesi sınır VAR, `DebugRefCount` soneki sınır YOK, bu yüzden tam 3 satır eşleşiyor):

```
pnpm guards → FAIL (exit 1)
AC-46 alt kontrol 3a-ii İHLALİ — … 3 kez bulundu
  (… >2 ise ikinci bir kopya doğmuş).
```

⇒ Doğru dal (>2) tetiklendi. `Write` ile orijinal içerik geri yazıldı.

**Son durum doğrulaması:** `diff /tmp/base_original_backup.js packages/config/eslint/base.js`
→ **IDENTICAL**; `pnpm guards` → **24/24 PASS** (son çalıştırma).

### Komut özeti

| Komut | Sonuç |
| --- | --- |
| `pnpm guards` (taban, mutasyon öncesi) | exit 0, 24/24 PASS |
| `pnpm guards` (mutasyon: `:386` satırı silindi) | exit 1, 23/24 — AC-45+AC-46 adımı FAIL |
| `pnpm guards` (geri yazıldı) | exit 0, 24/24 PASS |
| `pnpm guards` (mutasyon: tanım+kullanım, 0 geçiş) | exit 1, AC-45+AC-46 adımı FAIL ("0 kez bulundu") |
| `pnpm guards` (geri yazıldı) | exit 0, 24/24 PASS |
| `pnpm guards` (mutasyon: 3. kopya, >2 geçiş) | exit 1, AC-45+AC-46 adımı FAIL ("3 kez bulundu") |
| `pnpm guards` (geri yazıldı, SON) | exit 0, 24/24 PASS |
| `cd packages/i18n && npx vitest run` (taban, QA'nın yeni dosyası öncesi) | 10 dosya / 84 test PASS |
| `cd packages/i18n && npx vitest run src/__tests__/money-safe-integer-range.test.ts src/__tests__/money.test.ts` (mutasyon: `Money.of`'un `isSafeInteger` denetimi kaldırıldı) | **8 FAIL / 24 PASS** — vacuous değil |
| aynı komut (geri yazıldı) | 32/32 PASS |
| `cd packages/i18n && npx vitest run` (QA'nın yeni tur2 dosyasıyla, SON) | **11 dosya / 89 test PASS** |
| `pnpm --filter @arkesoft/i18n typecheck` | temiz |
| `pnpm --filter @arkesoft/i18n lint` | temiz |
| `npx prettier --check packages/i18n/src/__tests__/money-safe-integer-range-tur2.test.ts` | "All matched files use Prettier code style!" |

### KABUL KRİTERİ EŞLEMESİ (tur 2 kapsamındaki üç madde)

| Madde | Test/Doğrulama | Sonuç |
| --- | --- | --- |
| Tur 1'in kırmızı testi yeşile döndü, gevşetilmedi, hâlâ gerçek | mtime+içerik karşılaştırması + kasıtlı geri-mutasyon (`money.ts`'in `isSafeInteger` satırları kaldırıldı) | PASS — 8 test kırmızıya döndü, test gevşetilmemiş |
| `multiplyByRatio` BigInt kararının simetri iddiası test kapsamında | `money-safe-integer-range-tur2.test.ts` (5 yeni test) | PASS — 5/5 yeşil, iddia doğrulandı |
| `guards.sh` 3a-ii mutasyonu artık yakalıyor | M2 mutasyonu + devops'un ölçmediği 0/>2 senaryoları | PASS — üç senaryonun üçü de doğru FAIL/PASS dalını veriyor |

### Dead-code notu (solid'in sorusu)

`apps/admin/src/messages/messages.ts`'teki `classifyErrorResolutionStep` merdiveninin 3.
basamağı (`isRegisteredPlatformCode`) incelendi — dosya başı yorumunda (`:199-204`) zaten
"Bu basamak ÖLÜ DEĞİL" rebuttal'ı var ve gerekçesi yazılı (sunucu geçersiz/eski bir
`messageKey` gönderdiğinde erişilir). QA'nın bu turda yazdığı testlerin TÜMÜ
`packages/i18n`/`packages/config` kapsamında — `apps/admin`'in hata çözümleme merdivenine
hiç dokunmuyor. ⇒ Bu eksen QA'nın test setinde YOK, `solid`'in alanı — yorum/değerlendirme
dışında ek bir adım atılmadı.

## Üretim kodu değişikliği

Yok. Yalnızca test dosyası eklendi (`packages/i18n/src/__tests__/money-safe-integer-range-tur2.test.ts`)
ve iki geçici mutasyon/geri-yazma turu (`money.ts`, `base.js`) kanıt amaçlı yapıldı — her
ikisi de orijinal içeriğe `Write` ile birebir geri döndürüldü ve `diff`/`pnpm guards` ile
doğrulandı.
