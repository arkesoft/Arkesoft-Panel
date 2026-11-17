# T-022 — GATE `security`, tur 3 (dar doğrulama)

- **Tarih:** 2026-11-17
- **Sürüm:** ROADMAP v0.0.20.1 (T-022/S7)
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- **Kapsam:** YALNIZCA tur 2'nin bıraktığı **M1 (`medium`)** ve **L1 (`low`)** bulgularının
  `devops` FIX turu 2'de kapanıp kapanmadığının doğrulanması. **Yeni tarama yapılmadı**;
  F1/F2 tur 2'de KAPANDI ilan edilmişti, bu turda yeniden açılmadı.
- **Ölçüm koşulları (AGENT_BASELINE §4 "ölçüm disiplini" 2. ders):** `load averages: 4.94
  4.65 4.79`, **25 docker konteyneri** çalışır durumda. Ölçümlerin tamamı deterministik
  (awk/grep/süzgeç girdisi) — yük duyarlı değil.

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] scripts/guards.sh:1030 — `check_raw_log_upload_boundary`'nin step tanıma sezgisi YALNIZCA `- name:`/`- uses:` ile başlayan liste öğesini step sayıyor. Korumalı bir step'ten SONRA gelen ADSIZ bir step (`- run:`, `- id:`, `- shell:`) yeni step olarak görülmez; önceki step'in `protected=1` bayrağı devam eder ve ADSIZ step'teki redaksiyonsuz `tee` MASKELENİR. Saldırı/regresyon senaryosu: bir geliştirici `run-gates/action.yml`'e (veya `ci.yml`'e) adsız bir `- run: | … 2>&1 | tee /tmp/x.log` adımı ekler ve aynı birimde `upload-artifact` zaten vardır; `pnpm guards` ve CI YEŞİL kalır, PUBLIC depoda ANONİM indirilebilir REDAKSİYONSUZ ham test günlüğü yayınlanır — yani F1 sessizce geri döner. Üç varyantın üçü de (adsız `- run:`, `- id:`, `- shell:`) ölçüldü: SIFIR bulgu; birebir aynı içeriğin `- name:`'li kontrolü BOUNDARY veriyor. — Düzeltme: step başlangıcını anahtar adından bağımsız tanı (girintili `^[[:space:]]*- ` deseni + girinti karşılaştırması) ya da `yq`/`actionlint` ile gerçek YAML ayrıştır. — devops
  - [SEV: medium] scripts/guards.sh:1044-1047 — Kural `tee `, `redact-test-log` ve `upload-artifact` jetonlarını YORUM SATIRLARINDA da eşleştiriyor (yorum sıyırma yok). İKİ yönlü ölçüldü: (a) YANLIŞ NEGATİF — redaksiyonsuz `tee` taşıyan bir step'in İÇİNE `# TODO: buraya scripts/redact-test-log.ts eklenecek` yorumu koymak bulguyu TAMAMEN susturuyor (SIFIR bulgu). Senaryo: redaksiyon borusunu kaldıran geliştirici, boruyu AÇIKLAYAN yorumu (bugün action.yml:71-84'te duran blok) silmez/adım içine taşır → guard yeşil kalır, ham günlük yayınlanır. (b) YANLIŞ POZİTİF — gerçek `action.yml`'in SALT-YORUM yeniden sözcüklenmiş kopyası (`diff` ile doğrulandı: yorum dışı SIFIR fark, dosya TAM KORUMALI) `BOUNDARY __FILE__` veriyor. Yani bugünkü YEŞİL, `action.yml:66`'daki yorumun `tee ` jetonunu ve `action.yml:72`'deki yorumun `redact-test-log` jetonunu TAŞIMASINA bağlı — tesadüfi. — Düzeltme: awk'ta satırı değerlendirmeden önce `#` ile başlayan satırları atla (YAML içi `#`'in dize içinde geçebileceği durum için en azından `^[[:space:]]*#` yeterli). — devops
  - [SEV: low] scripts/redact-test-log.ts:226 — `ANSI_ESCAPE_PATTERN` yalnızca CSI (`ESC [ … harf`) biçimini sıyırıyor. OSC (`ESC ] … BEL`) biçimi SIYRILMIYOR; bir OSC dizisi bir sırrın ORTASINA düşerse sırrın ÖN YARISI HAM kalıyor (ölçüldü: `secret=JBSWY3DP` ham geçti). ⚠ TEORİK: bağımlılık ağacında OSC üreten HİÇBİR paket yok (ölçüldü — vitest/@vitest/*/chalk/picocolors kümesinde CSI üreten 4 dosya, OSC üreten 0 dosya; `terminal-link`/`supports-hyperlinks`/`ansi-escapes` KURULU DEĞİL). Somut saldırı senaryosu kurulamadı. — Düzeltme (borç): deseni `\x1b\][^\x07\x1b]*(\x07|\x1b\\)` alternatifiyle genişlet. — devops
ÖLÇÜMLER:
  - pnpm guards: taban 20/20 PASS (exit 0) → mutasyon (A) 19/20 + hedef adım FAIL (exit 1) → mutasyon (B) 19/20 + hedef adım FAIL (exit 1) → geri alma 20/20 PASS (exit 0)
  - Mutasyon/fikstür sayısı: 2 birebir yeniden koşum (A, B) + 4 izole step-tanıma vakası + 3 yorum-kirliliği vakası + 2 retention vakası + 8 ANSI süzgeç vakası = 19
  - Bayt seviyesi ESC (0x1b) kontrolü: scripts/redact-test-log.ts → 0 (BEKLENEN); tüm ağaç (.ts/.tsx/.sh/.yml/.yaml/.md/.json/.mjs) → ham ESC baytı taşıyan dosya YOK
  - Geri alma bütünlüğü: action.yml ve ci.yml sha256 mutasyon ÖNCESİ değerle BİREBİR aynı
  - pnpm audit: 1 high + 3 moderate + 1 low (high = `multer` DoS, geçişli; T-022 SIFIR bağımlılık ekliyor — package.json diff'i yalnızca bir turbo bayrağı)
  - İncelenen dosya: 4 (scripts/guards.sh, scripts/redact-test-log.ts, .github/actions/run-gates/action.yml, .github/workflows/ci.yml)
  - Tenant izolasyon listesinden karşılanmayan madde: yok (bu tur CI/log yüzeyi; tenant'a bağlı kaynak değişmedi)
```

---

## 1. M1 — `scripts/guards.sh` kuralının körlüğü: **KAPANDI**

### 1.0 Taban (mutasyon ÖNCESİ)

```
EXIT=0
Ham günlük ↔ artefakt yükleme sınırı: .github/workflows + .github/actions genelinde
hiçbir birim redaksiyonsuz bir ham günlüğü artefakt olarak yüklemiyor; "tee" kullanan
birimlerin tamamında retention-days ≤ 1.
...
Ham günlük ↔ artefakt yükleme + retention-days sınırı (T-022/S7 FIX2) PASS
guards: TÜM mekanik adımlar PASS.
```

`sha256(.github/actions/run-gates/action.yml)` =
`8771bf85dc063b1ac8f9b46f1d9adaca6cd48d991eb7378caf3a2e94fcbcdd02`
`sha256(.github/workflows/ci.yml)` =
`69717335e413e4e00171a561154ed1eac3b2e8089e6848dbb10c17556d8f8b93`

### 1.1 Aşama (A) — BİREBİR yeniden koşum → **KIRMIZI** ✅

Tur 2'deki tanım (T-022-security-tur2.md:114-115): _"`run-gates/action.yml`'den
`| node scripts/redact-test-log.ts` satırı silinmiş + `secrets.GITHUB_TOKEN` eklenmiş
kopya → **BULGU YOK**."_

Uygulanan mutasyon: iki `| node scripts/redact-test-log.ts \` satırı silindi (ölçüldü:
`silinen redaksiyon borusu satiri: 2`), "Birim/entegrasyon testleri" adımının `env:`
bloğuna `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` eklendi. (`secrets.*` jetonu bilinçli
olarak `env:`e kondu; `run:` bloğuna koymak AYRI bir guard kuralını — "run: bloğu içi
şablon ifadesi yasağı" — tetikleyip atfı bulanıklaştırırdı.)

**Ham çıktı:**

```
EXIT=1
Ham günlük ↔ artefakt yükleme sınırı İHLALİ — .github/actions/run-gates/action.yml /
birim "__FILE__": redaksiyonsuz ("redact-test-log" YOK) bir "tee" çıktısı
actions/upload-artifact İLE yükleniyor (secrets.* şartı YOK).
...
Ham günlük ↔ artefakt yükleme + retention-days sınırı (T-022/S7 FIX2) FAIL
guards: EN AZ BİR adım FAIL — yukarıdaki özete bakın.
```

Diğer **19 adımın tamamı PASS** → atıf temiz, kırmızıyı üreten tek şey hedef kural.
⇒ Tur 2'nin (A) körlüğü **KAPANDI**: composite action artık taranıyor, `jobs:` yokluğu
dosyayı kapsam dışı bırakmıyor, birim `__FILE__` olarak doğru adlandırılıyor.

### 1.2 Aşama (B) — BİREBİR yeniden koşum → **KIRMIZI** ✅

Tur 2'deki tanım (satır 120-121): _"`secrets.*` taşımayan, ham `tee` +
`upload-artifact` yapan bir workflow job'u → **BULGU YOK**."_

Uygulanan mutasyon: `ci.yml`'e `mutation-b-fixture` job'u eklendi — ham
`pnpm exec turbo run test 2>&1 | tee /tmp/mutb-output.log` + ayrı bir
`actions/upload-artifact@v4` adımı, `retention-days: 1` (retention bulgusunun
karışmaması için), **`secrets.` jetonu YOK**.

**Ham çıktı:**

```
EXIT=1
Ham günlük ↔ artefakt yükleme sınırı İHLALİ — .github/workflows/ci.yml /
birim "mutation-b-fixture": redaksiyonsuz ("redact-test-log" YOK) bir "tee" çıktısı
actions/upload-artifact İLE yükleniyor (secrets.* şartı YOK).
...
Ham günlük ↔ artefakt yükleme + retention-days sınırı (T-022/S7 FIX2) FAIL
```

⇒ Tur 2'nin (B) körlüğü **KAPANDI**: `secrets.` şartı gerçekten kaldırılmış, ham `tee` +
`upload-artifact` ikilisi TEK BAŞINA ihlal sayılıyor. Yine **diğer 19 adım PASS**.

### 1.3 Aşama (C) — `retention-days` (izole awk ile)

`guards.sh`'ın awk programı dosyadan çıkarılıp (`sed -n '990,1075p'`) sentetik
fikstürlere uygulandı:

```
case-c-ret7          => RETENTION fix 7
case-c-retmissing    => RETENTION_MISSING fix
```

⇒ `retention-days: 7` **ve** `retention-days` yokluğu, ikisi de bulgu üretiyor —
`devops`'un (C) iddiası doğrulandı.

### 1.4 Aşama (D) — Geri alma → **YEŞİL** ✅

`git` **kullanılmadı** (yasak). Her iki dosya, mutasyon öncesinde `$CLAUDE_JOB_DIR/tmp`
altına alınan **bayt-birebir** yedeklerinden python ile geri yazıldı ve sha256 ile
doğrulandı:

```
geri yazildi, sha256: 8771bf85dc063b1ac8f9b46f1d9adaca6cd48d991eb7378caf3a2e94fcbcdd02  (beklenen ile AYNI)
ci.yml geri yazildi sha256: 69717335e413e4e00171a561154ed1eac3b2e8089e6848dbb10c17556d8f8b93  (beklenen ile AYNI)
```

Geri alma sonrası tam koşum:

```
EXIT=0
Ham günlük ↔ artefakt yükleme + retention-days sınırı (T-022/S7 FIX2) PASS
actionlint (yerelde kuruluysa)                          PASS
guards: TÜM mekanik adımlar PASS.
```

`git status --porcelain`: `ci.yml` **hiç değişmemiş** olarak görünüyor,
`action.yml` yalnızca T-022'nin kendi (commit'lenmemiş) değişikliğini taşıyor.
Ağaçta artık mutasyon kalıntısı **yok**; geçici dosyaların tamamı
`$CLAUDE_JOB_DIR/tmp` altında.

### 1.5 `devops`'un daha derin bulgusu — teyit

`devops`'un "eski `$0 !~ /redact-test-log/` eşleşmesi SATIR BAZLIYDI, doğru ve korumalı
hâle bile ihlal verirdi" tespiti, gerçek dosyanın şekliyle **tutarlı**: `action.yml:92-94`
redaksiyon borusu ile `tee` komutunu **iki ayrı satıra** yayıyor. Step bazlı
değerlendirme bunu doğru çözüyor (1.1'de doğrudan ölçüldü — korumalı hâlde SIFIR bulgu,
bor silinince BULGU).

### 1.6 ⚠ `devops`'un bıraktığı iki riskin SINANMASI — İKİSİ DE ATLATILABİLİR

`devops` bu ikisinin "bugünkü ağaçta risksiz" olduğunu bildirmişti. **İkisi de atlatma
üretti** (yukarıdaki iki `medium` bulgu). Ölçümler izole awk ile, birebir aynı içerik
üzerinde yapıldı — tek değişken step başlangıç anahtarı / yorum metni.

**(i) step tanıma:**

```
case-control     => BOUNDARY fix          <- "- name:" ile baslayan step  : YAKALANDI
case-i-run       => SIFIR BULGU           <- "- run:"  ile baslayan step  : ATLATILDI
case-i-id        => SIFIR BULGU           <- "- id:"   ile baslayan step  : ATLATILDI
case-i-shell     => SIFIR BULGU           <- "- shell:" ile baslayan step : ATLATILDI
```

Tam `pnpm guards` ile de teyit edildi: `ci.yml`'e korumalı bir adlı step + **adsız**
`- run:` ham `tee` adımı + `upload-artifact` içeren bir job eklendiğinde
`EXIT=0`, hedef adım **PASS** (yani CI yeşil kalıyor).

Mekanizma: awk `instep`/`protected` bayraklarını yalnızca `^[[:space:]]*- (name|uses):`
görünce sıfırlıyor (guards.sh:1030). Adsız step yeni step sayılmadığı için ÖNCEKİ
step'in `protected=1`'i devam ediyor ve ham `tee` korumalı sayılıyor.

**(ii) yorum kirliliği:**

```
case-ii-fn     => SIFIR BULGU             <- ham tee + step ICINDE "redact-test-log" YORUMU : ATLATILDI (yanlis negatif)
case-ii-fp     => BOUNDARY fix            <- sadece YORUMDA "| tee <dosya>" gecen step      : YANLIS POZITIF
case-ii-fp2    => BOUNDARY fix            <- yorum step DISINDA, onceki step'e yapisiyor    : YANLIS POZITIF
                  RETENTION fix 7
```

En güçlü kanıt, **gerçek** `action.yml` üzerinde: yalnızca YORUM satırlarındaki
`redact-test-log.ts` jetonu `REDAKSIYON-SUZGECI.ts` olarak yeniden sözcüklendi
(davranış değişikliği SIFIR, dosya TAM KORUMALI kalıyor):

```
--- GERCEK dosya (degismemis) ---
(bos = SIFIR BULGU)
--- SALT YORUM yeniden sozcuklenmis kopya (davranis AYNI, tam korumali) ---
BOUNDARY __FILE__
--- fark sadece yorumda mi? ---
YORUM DISI FARK YOK
```

⇒ Bugünkü YEŞİL **tesadüfi**: `action.yml:66`'daki yorum `| tee <dosya>` yazdığı için
"Tip denetimi" step'i `rawtee=1` alıyor, `action.yml:72`'deki yorum `redact-test-log.ts`
yazdığı için aynı step `protected=1` alıyor ve ikisi birbirini götürüyor. Yorum bloğunda
yapılacak masum bir düzenleme CI'ı kırabilir; tersi yönde ise gerçek bir ihlali
susturabilir.

**Not (`devops` için):** iki bulgunun da düzeltmesi aynı awk bloğunda ve tek
düzenlemede kapanabilir (yorum satırlarını atla + step başlangıcını anahtardan bağımsız
tanı).

---

## 2. L1 — ANSI kaçışları: **KAPANDI** (OSC boşluğu teorik)

Süzgeç elle beslendi (`node scripts/redact-test-log.ts < girdi`), kök `.env` **hiç
okunmadan** (`ARKESOFT_REDACT_ENV_FILE_OVERRIDE=.env.example`). `EXIT=0`, stderr boş.

| Vaka                                                | Sonuç                           |
| --------------------------------------------------- | ------------------------------- |
| 1 — CSI jetonun **ortasında** (tur 2'nin 1. vakası) | `secret=[REDACTED]` ✅ **FIXED** |
| 2 — CSI base32'nin **önünde** (tur 2'nin 2. vakası) | `"[REDACTED]` ✅ **FIXED**       |
| 3 — CSI sarmalayan (tur 2'de zaten çalışıyordu)     | `'[REDACTED]'` ✅               |
| 6 — tanı metni (ANSI'siz)                           | `AssertionError: Expected: 200 Received: 401 at foo.test.ts:42` ✅ aynen korundu |
| 7 — CSI + tanı metni                                | `AssertionError: Expected: 200` ✅ okunabilir, renk sıyrıldı |
| 8 — `ESC[2K` imleç kontrol dizisi                    | `[REDACTED]` ✅                 |

⇒ Tur 2'de bildirdiğim **iki vakanın ikisi de kapandı**; `devops`'un iki yönlü kanıtı
(maskeleme çalışıyor + tanı metni okunabilir) bağımsız olarak doğrulandı.

### 2.1 ⚠ OSC biçimi **kaçıyor** — ama teorik

```
'VAKA-4 OSC koprusu: \x1b]8;;http://ornek/x\x07[REDACTED]\x1b]8;;\x07'
'VAKA-5 OSC jeton ORTASINDA: secret=JBSWY3DP\x1b]8;;http://x\x07EHPK3PXPJBSWY3DP' -> cikti: secret=JBSWY3DP…[REDACTED]
```

- VAKA-4: OSC dizisi **sıyrılmıyor** (ham ESC baytı çıktıda kalıyor) ama `\x07` (BEL)
  kelime karakteri OLMADIĞI için `\b` sınırı bozulmuyor ⇒ sır **maskelendi**. Zarar
  kozmetik.
- VAKA-5: OSC sırrın **ortasına** düştüğünde ön yarı (`JBSWY3DP`) **HAM kaldı**. Bu, tur
  2'nin 1. vakasının OSC muadili.

**Somut senaryo kurulabilir mi? HAYIR — ölçüldü:** bağımlılık ağacında OSC üreten paket
yok.

```
taranan paket dizini sayisi: 4   (vitest, @vitest/mocker, @vitest/spy, …)
OSC (ESC ]) uretimi iceren TOPLAM dosya: 0
CSI (ESC [) uretimi iceren TOPLAM dosya: 4
terminal-link / supports-hyperlinks / ansi-escapes: KURULU DEGIL
```

⇒ Bugün bu yoldan bir sır sızdırabilecek bir üretici **yok**. `low` (borç), `medium`
değil. Süzgecin kendi başlık yorumu (satır 218-220) bu sınırı zaten dürüstçe yazmış —
ölçümüm o notu **doğruluyor**.

---

## 3. Ortam tuzağı — bayt seviyesi ESC kontrolü ✅

```
scripts/redact-test-log.ts  →  ESC(0x1b) count: 0
                               diğer C0 kontrol baytı: {} (yok)
tüm ağaç (.ts/.tsx/.sh/.yml/.yaml/.md/.json/.mjs, node_modules/.git hariç)
                            →  ham ESC baytı içeren dosya: YOK
```

Mutasyon/geri alma turlarından **sonra** tekrarlandı — yine **YOK**. `devops`'un bildirdiği
`Edit` kaynaklı ham-bayt gömme kazası bu ağaçta **mevcut değil**; `ANSI_ESCAPE_PATTERN`
kaynakta doğru biçimde (iki karakterlik `\x1b` TypeScript kaçışı) duruyor.

**Kendi önlemim:** bu turda `Edit` aracı kullanılmadı; mutasyonlar ve geri almalar
`python3` ile **bayt kontrollü** yapıldı ve sha256 ile doğrulandı — aynı tuzağa düşme
yüzeyi bilinçli olarak kapatıldı.

---

## 4. ⚠⚠ Tur 2'nin KOŞULLU KARARI — nihai hâl

Tur 2'de yazdığım şart:

> _"Dürüst sınır: KABUL EDİLEBİLİR KALAN RİSK. Şartım: bu sonucu doğru tutan `guards`
> adımı M1'de ölçüldüğü gibi KÖR — M1 kapanınca kabul kararı kendini savunabilir hâle
> gelir."_

**ŞART KARŞILANDI — kabul kararı artık savunulabilir.** Gerekçe ölçülmüş: kararın
dayandığı tek varsayım, "redaksiyon borusu yarın sessizce kaldırılamaz" idi. M1'in iki
körlüğü (composite action kapsamı + `secrets.` şartı) kapandı ve **asıl regresyon
yolunu** — `action.yml`'den `| node scripts/redact-test-log.ts` satırının silinmesini —
kural artık **KIRMIZI** veriyor (1.1, birebir mutasyonla ölçüldü). `retention-days`'in
geri büyütülmesi de yakalanıyor (1.3).

**Kararın kapsamı (dürüstçe daraltılmış):** bu turda bulunan iki yeni `medium`, kabul
kararını **geri çektirmiyor** ama şartsız da bırakmıyor. Fark şu: M1 "boruyu sil, yeşil
kal" diyordu — **tek** ve **doğal** bir düzenleme yetiyordu. Yeni atlatmalar ise
boruyu silmenin **üstüne ikinci, olağandışı bir şekil** gerektiriyor (adım adını
kaldırmak ya da açıklayıcı yorumu adımın içine taşımak). Bu, aynı sınıfta ama **belirgin
şekilde daha dar** bir yüzey. Bu iki `medium` kapandığında kabul kararı **koşulsuz**
hâle gelir; o zamana kadar "savunulabilir, ama guard'ın yakalama garantisi şekle
bağımlı" diye okunmalıdır.

---

## 5. `docs` için borç satırı metinleri

Aşağıdaki üç satır `ROADMAP.md` teknik borç tablosuna **olduğu gibi** kopyalanabilir.

| SEV      | Yer                             | Açıklama                                                                                                                                                 | Sorumlu   | Vade önerisi                      |
| -------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------- |
| `medium` | `scripts/guards.sh:1030`        | `check_raw_log_upload_boundary` step tanıma sezgisi yalnızca `- name:`/`- uses:` görüyor; korumalı step'ten sonra gelen adsız `- run:`/`- id:`/`- shell:` adımındaki redaksiyonsuz `tee` MASKELENİYOR (üç varyant mutasyonla ölçüldü, guards YEŞİL kaldı). | `devops`  | v0.0.21 (yorum kirliliğiyle BİRLİKTE, tek düzenleme) |
| `medium` | `scripts/guards.sh:1044-1047`   | Kural jetonları YORUM satırlarında da eşleştiriyor: (a) adım içi `redact-test-log` yorumu gerçek ihlali susturuyor, (b) gerçek `action.yml`'in SALT-YORUM yeniden sözcüklenmiş kopyası yanlış pozitif veriyor ⇒ bugünkü yeşil tesadüfi. | `devops`  | v0.0.21 (yukarıdakiyle aynı düzenleme) |
| `low`    | `scripts/redact-test-log.ts:226` | `ANSI_ESCAPE_PATTERN` yalnızca CSI sıyırıyor; OSC (`ESC ] … BEL`) bir sırrın ortasına düşerse ön yarısı ham kalıyor. Bugün TEORİK — bağımlılık ağacında OSC üreten paket 0 (ölçüldü). | `devops`  | fırsat buldukça / OSC üreten bir bağımlılık girerse DERHAL |

---

## 6. `DOĞRULANAMADI`

1. **Gerçek CI runner'ında redaksiyonun uçtan uca çalıştığı.** GitHub'a yazma / iş akışı
   tetikleme bu turda yasak; artefaktın gerçekten redakte yüklendiği yalnızca yerel
   süzgeç beslemesiyle ve guard mutasyonlarıyla dolaylı olarak gösterildi.
2. **Gerçek vitest çıktısının bir sırrı jeton ortasından bölüp bölmediği.** Tur 2'de de
   ölçülmemişti; bu turda da ölçülmedi (`pnpm test` koşturma yasağı). Sentetik
   fikstürler ANSI'nin ÜÇ konumunu (sarmalayan / ortada / önde) kapsıyor ve üçü de
   artık maskeleniyor — yani gerçek konum ne olursa olsun sonuç aynı.
3. **`multer` `high` advisory'sinin bu platformda istismar edilebilirliği.** Bu turun
   kapsamı M1+L1 ile sınırlı; advisory T-022 ÖNCESİNDEN geliyor (T-022 sıfır bağımlılık
   ekliyor — `package.json` diff'i yalnızca `--continue` bayrağı). Ayrı bir borç/karar
   olarak ele alınmalı.
4. **`actionlint` yerel doğrulaması.** Yerelde kurulu değil; guards adımı bloklamadan
   geçiyor. Mutasyon fikstürlerinin YAML geçerliliği `actionlint` ile DOĞRULANMADI
   (awk/grep tabanlı kural için gereksiz, ama kayda geçiyor).
5. **`qa`'nın 21/21 task / api 840/840 ölçümü** bu turda tekrarlanmadı (açıkça yasaklı);
   olduğu gibi devralındı.
