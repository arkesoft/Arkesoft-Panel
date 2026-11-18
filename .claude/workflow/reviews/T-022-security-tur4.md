# T-022 — GATE `security`, tur 4 (nihai doğrulama)

- **Tarih:** 2026-11-17
- **Sürüm:** v0.0.20.1 (ROADMAP)
- **Kapsam:** tur 3'ün iki `medium`'u (M-1, M-2) + bir `low`'u (L-1) + tek açık
  `DOĞRULANAMADI` (matris/bölge takibi). Yeni tarama **yapılmadı**.

```
GATE: security
SONUÇ: PASS
```

---

## 1. Yöntem ve bütünlük

`Edit`/`Write` üretim dosyalarına **kullanılmadı**. `git` mutasyonu **yok**
(`git stash list` = 0; çalışma ağacı dosya sayısı tur başı ile aynı: 42).

awk süzgeci `scripts/guards.sh`'ten **bayt-bayt** çıkarıldı
(`sha256 = ceb2c81b6a84109162c133db74675a5507fcd9354ef4d78adc3e8d5556ca5139`,
3483 bayt, tek tırnak içermiyor ⇒ guards.sh'teki tırnaklama sadık) ve
`$CLAUDE_JOB_DIR/tmp/t022/boundary.awk` olarak elle beslendi. Gerçek dosya
mutasyonları yalnızca uçtan uca `pnpm guards` ölçümü için, `python3` ile
bayt kontrollü yapıldı ve her seferinde sha256 ile geri alındı.

### Bütünlük (tur sonu)

| Dosya                                 | sha256 (tur başı = tur sonu)                                       | ESC (0x1b) | BEL (0x07) |
| ------------------------------------- | ------------------------------------------------------------------ | ---------- | ---------- |
| `scripts/guards.sh`                   | `4306b405203c459e5f8d6a182e666ededa45d6fdd88bd05953aa60bc52b484e7` | **0**      | 0          |
| `scripts/redact-test-log.ts`          | `4c820c02c4cb2a0da7a8ebae67a57c50d532a4bf5fdeceec5f1ecd33cd692341` | **0**      | 0          |
| `.github/actions/run-gates/action.yml` | `8771bf85dc063b1ac8f9b46f1d9adaca6cd48d991eb7378caf3a2e94fcbcdd02` | **0**      | 0          |

`run-gates/action.yml` sha256'sı `devops`'un bildirdiği `8771bf85…` ile
**birebir eşleşti**; mutasyon/geri alma döngülerinden sonra da **aynı** kaldı.

---

## 2. (a) Mutasyon 4 ve 5 — bağımsız ham çıktı

### Mutasyon 4 — ham `tee` step'inin **içine** `# … redact-test-log …` yorumu

Gerçek dosyadan türetildi: "Birim/entegrasyon testleri" step'inin redaksiyon
borusu (`| node scripts/redact-test-log.ts \`) **silindi** (⇒ gerçek ihlal) ve
step'in içine `redact-test-log` geçen bir **yorum** konuldu.

```
=== MUTASYON 4 (ham tee + icine 'redact-test-log' YORUMU) ===
BOUNDARY	__FILE__
=== KONTROL 4b (ham tee, yorum YOK) ===
BOUNDARY	__FILE__
```

**KIRMIZI.** Yorumlu ve yorumsuz varyant **birebir aynı** bulguyu üretiyor ⇒
yorumun sonuç üzerinde **sıfır** etkisi var (M-2'nin amacı tam da bu).

Uçtan uca (gerçek dosya mutasyonu + `pnpm guards`):

```
MUTASYON UYGULANDI (m4). orijinal sha256: 8771bf85…cdd02
mutasyon sha256: 01d0c5781ccd3c83a8f989ddc927b1b33d1dd05a8408e16e1a0f0cdfee5b2640
=== pnpm guards (MUTASYON 4 gercek dosyada) ===
EXIT=1
Ham günlük ↔ artefakt yükleme sınırı İHLALİ — .github/actions/run-gates/action.yml /
  birim "__FILE__": redaksiyonsuz ("redact-test-log" YOK) bir "tee" çıktısı
  actions/upload-artifact İLE yükleniyor (secrets.* şartı YOK).
Ham günlük ↔ artefakt yükleme + retention-days sınırı (T-022/S7 FIX2) FAIL
=== GERI ALMA ===
geri alindi, sha256: 8771bf85dc063b1ac8f9b46f1d9adaca6cd48d991eb7378caf3a2e94fcbcdd02
ESLESIYOR: True
```

### Mutasyon 5 — salt-yorum kopya (`non_comment_diff_count = 0`)

Tek yön yeterli değildi; **iki yönde** üretildi:

- **5a** — 64 yorum satırının tamamı **jetonsuz** bir metinle değiştirildi.
- **5b** — 64 yorum satırının tamamı **jeton dolu** bir metinle değiştirildi.

```
m5a: yorum satiri sayisi=64  non_comment_diff_count=0
m5b: yorum satiri sayisi=64  non_comment_diff_count=0
gercek yorumlardaki jeton sayilari: {'tee': 4, 'redact-test-log': 1, 'upload-artifact': 1, 'retention-days': 2}
m5a   yorumlardaki jeton sayilari: {'tee': 0, 'redact-test-log': 0, 'upload-artifact': 0, 'retention-days': 0}
m5b   yorumlardaki jeton sayilari: {'tee': 128, 'redact-test-log': 64, 'upload-artifact': 64, 'retention-days': 64}

=== MUTASYON 5a === (cikti YOK) YESIL
=== MUTASYON 5b === (cikti YOK) YESIL
```

Uçtan uca:

```
>>> UYGULANDI m5a sha256: 35e3d741f692cbb9584e76ee1b76de3b8cf66fed72099f1be2ed5b1668f1c5eb
    pnpm guards EXIT=0 → Ham günlük ↔ artefakt … PASS
>>> UYGULANDI m5b sha256: 8840ca5b295b7cf8516342f1c199f2591078783ba2d1d2fd8fcd80eff2bd5464
    pnpm guards EXIT=0 → Ham günlük ↔ artefakt … PASS
=== GERI ALMA === ESLESIYOR: True
```

⭐ **Kritik nokta:** gerçek dosyanın yorumları bugün **jeton taşıyor** (4× `tee`,
1× `redact-test-log`, 1× `upload-artifact`, 2× `retention-days`). Bunların
tamamı silinince de (5a), 64 katına çıkarılınca da (5b) sonuç **değişmiyor**
⇒ bugünkü yeşil **tesadüfi değil, gerçek**. Tur 3'ün M-2 gerekçesi kapandı.

### Karşı-olgu (düzeltmenin yük taşıdığının kanıtı)

M-2 bloğu (`if (line ~ /^[[:space:]]*#/) { next }`) awk programından
çıkarılarak tur 3 öncesi hâl yeniden kuruldu:

| Girdi | M-2 **öncesi** | M-2 **sonrası** (bugün) |
| --- | --- | --- |
| Mutasyon 4 | **YEŞİL** ⇒ yanlış negatif (gerçek ihlal susturuluyordu) | **KIRMIZI** ✅ |
| Mutasyon 5b | **56 adet uydurma `RETENTION … 9` bulgusu** ⇒ yanlış pozitif | **YEŞİL** ✅ |
| Mutasyon 5a | YEŞİL | YEŞİL ✅ |

---

## 3. M-1 — adsız step bayrağı mirası

`devops`'un 1–3 numaralı mutasyonları bağımsız olarak yeniden üretildi:
korumalı "Test çıktısını artefakt olarak yükle" step'inden **önce**, ham `tee`
taşıyan **adsız** bir step (`- run:` / `- id:` / `- shell:`) eklendi.

```
### devops mutasyon 1-3 (DUZELTILMIS awk)
m1 (- run:)   -> KIRMIZI: BOUNDARY	__FILE__
m2 (- id:)    -> KIRMIZI: BOUNDARY	__FILE__
m3 (- shell:) -> KIRMIZI: BOUNDARY	__FILE__

### AYNI mutasyonlar, M-1 ONCESI awk (- (name|uses): ile adim tespiti)
m1 -> YESIL      m2 -> YESIL      m3 -> YESIL      ⇒ eski yanlış negatif teyit
```

**M-1 kapandı.** Üçü de düzeltilmiş awk'ta KIRMIZI, düzeltme öncesinde YEŞİL.

---

## 4. (b) Matris ölçümü — tek açık `DOĞRULANAMADI` **KAPANDI**

`devops`'un dürüstçe bıraktığı iddia: _"`in_steps_region` yalnızca bir `steps:`
satırı görülünce aktifleşiyor; bu, `strategy.matrix.include`'ın yanlışlıkla
adım sayılmasını önlüyor — ama ölçülmedi."_ Sentetik mutasyonlarla ölçüldü:

| # | Senaryo | Sonuç | Değerlendirme |
| --- | --- | --- | --- |
| **1** | `mx1` — `steps:`'ten **önce** `strategy.matrix.include`, gerçek ihlal **YOK** | **YEŞİL** | ✅ **Yanlış pozitif ÜRETMİYOR** |
| **2** | `mx2` — aynı matris + **arkasından gerçek** redaksiyonsuz `tee` + `upload-artifact` | **KIRMIZI** (`BOUNDARY build`) | ✅ **Bölge takibi BOZULMUYOR** — matrissiz referans `mx2b` ile **birebir aynı** çıktı |
| **3** | `nest1` — `with:` altında **iç içe dizi**, dizinin önünde `redact-test-log`, arkasında ham `tee` | **YEŞİL** | ✅ **Bayrakları SIFIRLAMIYOR** (doğru cevap) |
| 3-kontrol | `nest2` — aynı yapı, redaksiyon jetonu **yok** | **KIRMIZI** | ✅ Gerçek ihlal hâlâ yakalanıyor (aşırı bastırma yok) |

### `in_steps_region` gerçekten yük taşıyor mu?

`mx1`/`mx2` şeklinde bölge kontrolü çıkarılsa da sonuç değişmiyordu (matris
değerleri jeton taşımıyor). Riskin **gerçekten** doğduğu şekil ayrıca kuruldu —
`mx3`: matris **değerleri** `tee` jetonu taşıyor ve işte bir `upload-artifact`
step'i var, ama **gerçek ihlal yok**:

```
mx3  DUZELTILMIS   -> YESIL (dogru)
mx3  BOLGESIZ NAIF -> KIRMIZI: BOUNDARY	build   <-- YANLIS POZITIF
```

⇒ `in_steps_region` **ölçülmüş biçimde yük taşıyor**; `devops`'un doğrulanamamış
iddiası **doğrulandı** ve iddia ettiğinden **daha güçlü** çıktı.

Ek kenar durum (sorulmamıştı, ölçüldü): `mx4` — `strategy/matrix` anahtarı
`steps:`'ten **sonra** geliyor (YAML anahtar sırası serbest) ⇒ gerçek ihlal
**hâlâ KIRMIZI**.

### Girinti takibi gerçekten yük taşıyor mu?

Girinti takibi çıkarılıp "her `- ` yeni adım" naif sezgisi kondu:

```
naive_m1  nest1 -> KIRMIZI: BOUNDARY build   <-- YANLIS POZITIF (dogru cevap YESIL)
naive_m1  nest2 -> KIRMIZI (dogru)
naive_m1  mx1   -> YESIL   |  mx2 -> KIRMIZI
```

⇒ Girinti takibi **gerekliydi**; M-1 düzeltilirken yeni bir hata sınıfı
açılması **ölçülerek** engellenmiş. (Yönüne ilişkin not: §7 F-2.)

---

## 5. (c) L-1 / OSC teyidi

`OSC_ESCAPE_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g` eklenmiş ve
`stripAnsiEscapeCodes()` içinde CSI'dan sonra uygulanıyor. Bayt-kesin fikstür
**gerçek** `scripts/redact-test-log.ts`'ten geçirildi (fikstürde 10 ESC baytı):

```
1 DUZ            : [REDACTED]
2 CSI ortada     : [REDACTED]
3 OSC-BEL ortada : [REDACTED]        <-- BEL sonlu, sirrin ORTASINDA
4 OSC-ST  ortada : [REDACTED]        <-- ST (ESC \) sonlu, sirrin ORTASINDA
5 OSC-BEL onunde : [REDACTED]
6 OSC-ST  onunde : [REDACTED]
7 OSC ic ice CSI : [REDACTED]
8 TANI METNI     : AssertionError: expected 1 to be 2 // Expected: 1 Received: 2
9 OSC sonlandirmasiz: ^[]0;bitmeyen [REDACTED]

cikti ESC bayti: 1 | ciktida SIZAN ham sir parcasi: 0 satir | exit=0 | stderr BOS
```

- **Her iki sonlandırıcı varyant** (BEL ve ST) ✅ kapalı.
- **Tanı metni** (`AssertionError`/`Expected:`/`Received:`) ✅ aynen korunuyor —
  süzgecin varoluş sebebi bozulmamış.
- Bağımlılık ağacında OSC üreten paket **bugün yok** (bağımsız teyit:
  `terminal-link`, `supports-hyperlinks`, `ansi-escapes` → `pnpm ls -r --depth
Infinity` ve `node_modules` taramasında **sıfır** sonuç).

**L-1 kapandı** (opsiyoneldi, `devops` yine de kapattı). Artık bir kalıntı var —
§7 F-1, `low`.

---

## 6. (e) Koşullu kararın NİHAİ hâli

Tur 3'te şöyle yazılmıştı:

> _"Kabul kararı artık **savunulabilir** … Bu ikisi kapanınca karar KOŞULSUZ olur."_

İkisi de (M-1, M-2) ölçülerek kapandı, L-1 de kapandı ve tek açık
`DOĞRULANAMADI` ölçülüp doğrulandı.

⇒ **KARAR KOŞULSUZDUR.** T-022'nin ham günlük ↔ artefakt yüzeyi için kabul
kararı artık koşula bağlı değildir. Gerekçe, üçü de bu turda **bağımsız olarak
üretilmiş** ölçümlerdir: (1) birincil kontrol (redaksiyon süzgeci) gerçek
baytlarla çalışıyor; (2) regresyon dedektörü gerçek ihlalde KIRMIZI, salt-yorum
değişikliğinde YEŞİL; (3) dedektörün bugünkü yeşili tesadüfi değil.

---

## 7. BULGULAR

Üçü de `low` ⇒ **düzeltme turu AÇMAZ**, doğrudan ROADMAP teknik borç tablosuna.

```
BULGULAR:
  - [SEV: low] scripts/redact-test-log.ts:235 — SONLANDIRILMAMIŞ OSC dizisi bir
    sırrın ORTASINA düşerse sırrın ikinci yarısı HAM kalıyor. Ölçüldü: girdi
    "<16 bayt base32>ESC]8;;http://x<16 bayt base32>" (BEL/ST YOK) → çıktı
    "[REDACTED]^[]8;;http://xJBSWY3DPEHPK3PXP". Saldırı senaryosu ZAYIF ve
    TEORİK: ham vitest çıktısına biçimsiz (sonlandırıcısız) bir OSC dizisi
    basan bir üretici gerekir; bağımlılık ağacında OSC üreten paket BUGÜN YOK
    (ölçüldü) ve sonlandırılmış varyantların İKİSİ de kapalı. L-1'i YENİDEN
    AÇMAZ — kapatılan sınıfın dar bir kalıntısıdır ve dosyanın kendi
    "DAR, BİLİNÇLİ SEZGİSEL" sınırı (satır 214-218) içindedir. — Önerilen
    düzeltme: desene sonlandırıcısız varyant için satır-sonu alternatifi
    eklemek (`(?:\x07|\x1b\\|$)`) VEYA mevcut sınırı dosya başı yorumunda
    AÇIKÇA "sonlandırılmış OSC" olarak daraltmak. — Sorumlu: devops

  - [SEV: low] scripts/guards.sh:987 — Yorum, girinti takibi olmasaydı
    açılacak hata sınıfının YÖNÜNÜ yanlış yazıyor: "YENİ bir sınıf
    yanlış-negatif açardı" diyor, ölçüm ise YANLIŞ POZİTİF gösteriyor
    (naif reset, nest1'de doğru cevap YEŞİL iken BOUNDARY üretti). Yapısal
    gerekçe: bölünme `grp_unprotected`'ı yalnızca EKLEYEBİLİR (korumalı bir
    step'i {protected}+{rawtee} ikilisine ayırır), hiçbir zaman KALDIRAMAZ —
    `rawtee`/`uploads`/`retentions` zaten grup seviyesinde toplanıyor.
    Düzeltme DOĞRU, yalnızca gerekçe metni yanlış yönde. Önemli, çünkü bu
    yorumlar sonraki ajanların dayandığı tek gerekçe kaydı. — Önerilen
    düzeltme: "yanlış-negatif" → "yanlış-pozitif". — Sorumlu: docs

  - [SEV: low] scripts/guards.sh:1005 — `check_raw_log_upload_boundary` YALNIZCA
    yerel `pnpm guards`'ta koşuyor; `.github/workflows/ci.yml`'de karşılığı YOK
    (ölçüldü: "ham günlük|redact-test-log|artefakt yükleme sınırı" jetonları
    ci.yml'de sıfır eşleşme). Senaryo: bir katkıcı/ajan run-gates/action.yml'den
    "| node scripts/redact-test-log.ts" satırını kaldırır, yerelde `pnpm guards`
    KOŞMAZ, CI YEŞİL kalır ve PUBLIC depoda ANONİM indirilebilir bir artefakta
    ham otpauth sırrı/oturum çerezi düşer. ⚠ ÖNEM DÜŞÜK TUTULDU, GEREKÇE
    ÖLÇÜLDÜ: (1) birincil kontrol — redaksiyon süzgecinin KENDİSİ — action.yml
    içinde ve CI'da AKTİF, bu yalnızca regresyon dedektörü; (2) yerel-only
    olmak T-022'nin GETİRDİĞİ bir gerileme DEĞİL, önceden var olan sistemik
    desen: guards.sh'in 20 kontrolünden 7'si (K8, Slug grameri, AC-16, AC-1,
    AUTH_IP_LIMITS pin tazeliği, Playwright retries, e2e env passthrough) zaten
    ci.yml'de YOK ve bunun gerekçesi dosya başında yazılı (devops ajanı
    `.github/**`'e yazamaz). — Önerilen düzeltme: bu kontrolü
    `scripts/check-run-block-template-expression.sh` emsaliyle ayrı bir
    script'e taşıyıp ci.yml guards job'undan DA çağırmak; yerel-only kontroller
    arasında CI'a terfi için EN YÜKSEK öncelikli olan budur (tek koruduğu şey
    bir kamuya açık sır sızıntısı yolu). — Sorumlu: devops
```

**FAIL kuralı uygulaması:** 0 critical, 0 high, 0 medium, 3 low ⇒ **PASS**.
Yeni `medium`+ bulgu **yok** ⇒ Task `ESCALATED` **olmaz**.

---

## 8. (f) `docs` için borç satırı metinleri

ROADMAP teknik borç tablosuna birebir kopyalanabilir:

| SEV | Yer | Açıklama | Sorumlu | Vade önerisi |
| --- | --- | --- | --- | --- |
| low | `scripts/redact-test-log.ts:235` | Sonlandırılmamış OSC dizisi sırrın ortasına düşerse ikinci yarı ham kalıyor; sonlandırılmış BEL/ST varyantları kapalı, bağımlılık ağacında OSC üreticisi yok (ölçüldü). | devops | v0.1.x — fırsat bulundukça; bir OSC üreten paket ağaca girerse ÖNCELİKLİ |
| low | `scripts/guards.sh:987` | Girinti takibi gerekçe yorumu hata sınıfının yönünü yanlış yazıyor ("yanlış-negatif" → doğrusu "yanlış-pozitif"); düzeltmenin kendisi doğru. | docs | bir sonraki `guards.sh` dokunuşunda |
| low | `scripts/guards.sh:1005` | Ham günlük ↔ artefakt sınırı kontrolü yalnızca yerel `pnpm guards`'ta; ci.yml'de yok (guards.sh'in 20 kontrolünden 7'si bu durumda, önceden var olan desen). Yerel-only kontroller içinde CI'a terfi önceliği EN YÜKSEK olan budur. | devops | v0.1.0 — `check-run-block-template-expression.sh` emsaliyle |

---

## 9. ÖLÇÜMLER

- **`pnpm guards`:** 5 tam koşum — temiz ağaç **EXIT=0** (20/20 mekanik adım
  PASS); mutasyon 4 **EXIT=1** (doğru FAIL); mutasyon 5a **EXIT=0**; mutasyon 5b
  **EXIT=0**; geri alma sonrası **EXIT=0**.
- **awk süzgeci elle besleme:** 13 sentetik/türetilmiş girdi × 4 awk varyantı
  (düzeltilmiş, M-1 öncesi, M-2 öncesi, naif/bölgesiz) = **47 ölçüm**.
- **Redaksiyon süzgeci bayt fikstürü:** 14 satır, 10 ESC baytı; çıkan ham sır
  parçası **0** (sonlandırılmış varyantlarda), **1** (sonlandırılmamış OSC —
  §7 F-1).
- **sha256:** `run-gates/action.yml` **5 kez** ölçüldü, 5'i de `8771bf85…`
  (`devops`'un 6 ölçümüyle tutarlı). `guards.sh` ve `redact-test-log.ts` tur
  başı = tur sonu.
- **ESC baytı:** `redact-test-log.ts` = **0**, `guards.sh` = **0**,
  `run-gates/action.yml` = **0**.
- **`git` mutasyonu:** **hiç** (`stash` = 0, dosya sayısı 42 → 42).
- **İncelenen dosya sayısı:** 5 (`scripts/guards.sh`,
  `scripts/redact-test-log.ts`, `.github/actions/run-gates/action.yml`,
  `.github/workflows/ci.yml`, `package.json`).
- **Tenant izolasyon listesinden karşılanmayan madde:** **yok** — T-022'nin bu
  turdaki yüzeyi (CI iş akışı + stdin/stdout süzgeci) kiracı verisine,
  veritabanına, tRPC prosedürüne, kuyruğa veya tabloya **dokunmuyor**; §7
  listesi bu değişiklik için **uygulanabilir değil** (tur 1-3'te tam liste
  üzerinden doğrulanmıştı).
- **`pnpm audit`:** talimat gereği **tekrarlanmadı** — tur 3 değeri taşınıyor
  (1 high + 3 moderate + 1 low; T-022 **sıfır** yeni bağımlılık ekliyor,
  bu turda da teyit edildi: `package.json` diff'inde bağımlılık değişikliği yok).
- **Koşturulmayanlar (talimat gereği):** `pnpm test`, `test:isolation`,
  `test:e2e`, Playwright, `pnpm audit`. GitHub'a yazma / iş akışı tetikleme
  **yapılmadı**.
- **Ortam:** macOS (Darwin 25.6.0), `awk version 20200816` (onetrue awk).

---

## 10. (g) `DOĞRULANAMADI`

1. **awk uygulaması farkı (yeni, bu turda doğdu).** Tüm awk ölçümleri yerel
   **onetrue awk 20200816** (macOS) ile alındı. CI `ubuntu-latest`'te koşuyor ve
   orada `awk` **gawk**'tır. `gawk` ve `mawk` bu makinede **kurulu değil**
   (ölçüldü) ⇒ çapraz doğrulama **yapılamadı**. Risk düşük değerlendiriliyor:
   kullanılan yapılar POSIX (`[[:space:]]`, `sub`, `match`/`RSTART`/`RLENGTH`,
   `substr`, `split`, `length`, `next`) ve uygulamaya özgü bir ek yok — ama
   **ölçülmedi**. Pratik etki ayrıca sınırlı: bu kontrol bugün CI'da **hiç
   koşmuyor** (§7 F-3); F-3 kapatılırsa bu doğrulama **zorunlu hâle gelir**.
2. **Gerçek CI koşumu.** `pnpm guards`'ın `ubuntu-latest` üzerinde davranışı
   ölçülmedi — iş akışı tetikleme yasaktı.
3. **Süzgecin gerçek vitest çıktısı üzerindeki davranışı.** Yalnızca sentetik
   bayt fikstürleriyle ölçüldü; gerçek bir kırmızı vitest koşumunun ham çıktısı
   bu turda üretilmedi (`pnpm test` koşturma yasağı). Tur 2'de ölçülmüştü.
