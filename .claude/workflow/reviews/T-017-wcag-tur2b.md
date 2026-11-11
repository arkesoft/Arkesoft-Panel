# T-017 — wcag gate — tur 2b (İş ③ — TAM denetim)

Tarih: 2026-11-11
Sürüm: v0.0.15.1
Kapsam: Tur 2a KAPANDI (setTimeout(0) low-borç kabulü + 6 ölçüm teyidi — TEKRARLANMADI).
Bu tur: İş ③ — axe-core yeniden + tam klavye turu + yedi yeni eksen + L-1/L-2 teyidi.

## Zemin doğrulandı (başlangıç)
- 5173 boş (LISTEN yok)
- 3000 → PID 11734 (kullanıcının, DOKUNULMADI)
- 3100 → PID 63279 (kullanıcının, DOKUNULMADI)
- git status --porcelain | wc -l → 75 (bu rapor dosyası dahil zaten; kendi başlangıcım)

## Durum: BAŞLADI — aşama aşama güncellenecek

## Oran bütçesi — ölçüm (başlangıç, tur 2a'dan devir)
Komut: `redis-cli -p 6379 GET/TTL <anahtar>` (salt okunur).

| Rota | Kullanılan/Sınır | TTL (kalan sn) |
| --- | --- | --- |
| sign-up/email IP | 5/10 | ~3057 (değişmedi, tur 2a'nın bıraktığı) |
| sign-in/email IP | 9/20 | ~347 (≈5.8 dk — yakında sıfırlanacak) |
| two-factor/enable IP | 2/20 | ~359 |
| two-factor/verify-totp IP | 2/20 | ~359 |

Karar: sign-up'tan KAÇINILACAK, sign-in kullanılacak (bütçe en geniş, TTL kısa sürede sıfırlanıyor zaten).

## Altyapı kuruldu
`apps/api` 3001'de başlatıldı (tur 2a'nın yöntemiyle, dist önceden derlenmiş,
`.env`'e YAZILMADI): `API_PORT=3001 DATABASE_AUTH_URL=... node --env-file-if-exists=../../.env dist/main.js`
→ `curl -X POST :3001/auth/sign-in/email` → 401 (beklenen, sunucu canlı).
3000/3100'e dokunulmadı.

## qa'nın spec'i yeniden koşturuldu (regresyon kontrolü, tekrar SAYILMADI — ölçüm değil doğrulama)
`npx playwright test e2e/session-security-dialog-focus.qa.spec.ts` → **2 passed (4.5s)**,
qa'nın dosyası DEĞİŞTİRİLMEDİ. Bu, İş ③'ün kendi probları için altyapının sağlam
olduğunu doğruluyor; tur 2a'nın PASS kararını TEKRARLAMIYOR.

## PROB — ActiveSessionsCard (canlı, tek koşum, 1 passed 4.8s)

Yöntem: scratchpad'de `wcag-tur2b-probe.spec.ts` + `wcag-tur2b.config.ts`
(playwright.config.ts'in webServer/baseURL ayarlarının kopyası, testDir
scratchpad'e çevrildi, depoya hiçbir dosya YAZILMADI). 1 fixture kullanıcı
(1 sign-up + 2 sign-in, iki oturum üretmek için), gerçek `apps/api` (3001).

### axe-core (4 durum + baseline = 5 ölçüm)
- `liste-baseline`: **1 ihlal** (`label-content-name-mismatch`, serious) —
  UserMenu tetikleyicisi, **L2 ile BİREBİR aynı** (aşağıda teyit).
- `tekil-diyalog-acik`: **0 ihlal**.
- `tekil-diyalog-400-hata`: **0 ihlal**.
- `toplu-diyalog-acik`: **0 ihlal**.
- `toplu-diyalog-400-hata`: **0 ihlal**.
Not: diyalog açıkken UserMenu ihlali axe'ta GÖRÜNMÜYOR — Radix'in arka plan
içeriğini `aria-hidden` ile bastırması nedeniyle (beklenen, bug değil).

### Tam klavye turu (adım adım, canlı ölçüldü)
1. `Tab` → **BUTTON "Etkinleştir"** (2FA kartı).
2. `Tab` → **BUTTON "Sonlandır"** (oturum satırı).
3. `Tab` → **BUTTON "Tüm oturumları sonlandır"**.
4. `Tab` → **BODY** (doküman sonu — tur1'in AYNI, bilinen headless-Chromium
   sarma artefaktı; gerçek tarayıcıda adres çubuğuna gider, kullanıcı
   sıkışmaz). **Yeni bir bulgu DEĞİL**, tur1 ile TUTARLI.
5. Satırdaki "Sonlandır" `focus()` + `Enter` → diyalog açıldı, **odak
   `INPUT[type=password]`'a gitti** (doğru).
6. Diyalog İÇİNDE 5× `Tab`: `Vazgeç → Sonlandır → Kapat → INPUT → Vazgeç`
   (4 elemanlı döngü: Input↔Vazgeç↔Sonlandır↔Kapat) — **`TAB-TRAP-ICINDE-MI:
   true`**, döngü diyalog dışına SIZMIYOR. Beklenen/doğru modal tuzağı
   (WCAG 2.1.2).
7. `Escape` → diyalog kapandı, odak tetikleyiciye döndü (`toBeFocused()`
   assert PASSED).

### Odak-olay sayımı (yeni eksen 2 — "ekran okuyucu iki kez duyuruyor mu")
`document.addEventListener('focusin', …)` Escape'TEN HEMEN ÖNCE takıldı,
Escape sonrası (gerçek `page.keyboard.press`, CDP round-trip gecikmesiyle)
toplanan log: **TEK bir girdi** — `["BUTTON:Chrome · Windows otu…"]`
(tetikleyici buton). **`BODY` için HİÇBİR `focusin` olayı tetiklenmedi.**
→ **Bulgu: yok.** Tur 2a'nın PROB1-5 (senkron zorlama hariç gerçekçi
problarda body'ye hiç ulaşılamadığı) sonucuyla BİREBİR tutarlı — gerçek bir
`focusin` dinleyicisi (ekran okuyucunun AX-ağacı güncellemesini tetikleyen
AYNI DOM olayı) **tek** bir hedef değişikliği görüyor, çift duyuru riski
bu ölçümde GÖZLENMEDİ.

### 400 hata durumu (yeniden teyit)
`{"ariaInvalid":"true","describedBy":"_r_c_-error","isFocused":true,"alertCount":0}`
— `aria-invalid`+`aria-describedby` doğru, odak alana döndü, sayfada
**hiçbir `role="alert"` düğümü YOK** (400 → field-level, `dialogError`
DEĞİL — kod okumasıyla TUTARLI, controller'da 400 `fieldError`'a gider).

### 360px toplu diyalog (L-1 teyidi — yeni eksen, closeLabel sonrası)
`{"overflowX":false, dialog: w=328 h=417, "Vazgeç" x=40 y=540.5 w=67.8 h=44,
"Tüm oturumları sonlandır" x=115.8 y=540.5 w=204.2 h=44, "Kapat"(×)
x=300 y=203.5 w=32 h=32}`. **Taşma YOK**, iki ana buton HÂLÂ yan yana
(`y` eşit) — **L-1 AYNEN GEÇERLİ, closeLabel eklenmesi 360px düzenini
BOZMADI/DEĞİŞTİRMEDİ** (× ikonu ayrı köşede, çakışma yok). Buton yükseklikleri
44px (≥44, WCAG 2.5.8 geniş marj), × ikonu **32×32px** (yeni ölçüm, ≥24×24
eşiğini geçiyor, 2.5.8 PASS).

## PROB — TwoFactorStatusCard (canlı, tek koşum, 1 passed 4.4s)

Yöntem: ikinci fixture kullanıcı (1 sign-up + 1 sign-in + gerçek
`two-factor/enable` → TOTP kod üret → `two-factor/verify-totp`, qa'nın
spec'indeki AYNI algoritma, repo'ya dokunulmadan scratchpad'de).

### Başlık hiyerarşisi (yeni eksen 4)
- Diyalogsuz: **tek `H1`** ("Hesap güvenliği") — sayfada başka HİÇBİR
  `h2`-`h6` YOK (CardTitle'lar `<p>`, kod okumasıyla da doğrulanmıştı).
- Diyalog açıkken: `H1` + **tam olarak bir `H2`** ("İki adımlı doğrulamayı
  devre dışı bırak" — Radix `Dialog.Title`, kaynak kodda `Primitive.h2`
  olarak doğrulandı). **Atlama YOK** (h1→h2, ara seviye kaybı yok).
→ **Bulgu: yok.**

### axe-core (3 ölçüm)
- `2fa-liste-baseline`: **1 ihlal** (`label-content-name-mismatch`,
  UserMenu — L2 ile AYNI öğe).
- `2fa-disable-diyalog-acik`: **0 ihlal**.
- `2fa-disable-diyalog-400-hata`: **0 ihlal**.

### Yeni eksen 5 — `role="alert"` bölgeleri birbirini eziyor mu
Canlı ölçüm: `{"pageAlertCount":0,"statusCount":0}` 400 hata durumunda —
**bu kart kendi diyalog hatası için `role="alert"` HİÇ RENDER ETMİYOR**
(`TwoFactorManagePasswordDialog`'da `dialogError` eşleniği YOK, yalnızca
`Input.error`, `ConfirmDialog.tsx` dosya başı yorumunun "wcag FIX turu
4/M-W1" notuyla TUTARLI). Kod okumasıyla (her iki kartın CardContent'i
kendi `<p role="alert">`'ını BAĞIMSIZ render ediyor, paylaşılan tek bir
live-region kimliği YOK) + canlı ölçümle BİRLİKTE: **çakışma riski YOK**
— yapısal olarak İKİ KART aynı anda role=alert göstermiş olsaydı bile
(ör. ikisinin de kart-seviyesi veri yükleme hatası aynı anda) bunlar AYRI
DOM düğümleri, biri diğerini EZMEZ (birbirinin üzerine yazmaz); yalnızca
ekran okuyucuya aynı anda iki ayrı duyuru kuyruğa girebilir (nadir kenar
durum, EZİLME değil, EŞZAMANLI duyuru) — bu TAM eşzamanlı senaryo canlı
ÜRETİLEMEDİ (iki kartın veri sorgusunu AYNI ANDA başarısız kılmak
gerekirdi, düşük değer/yüksek maliyet) → **DOĞRULANAMADI (tam eşzamanlı
senaryo)**, ama yapısal analiz + her kartın KENDİ hata durumunun canlı
temiz olması güçlü bir PASS sinyali.

### 2FA 400 hata durumu (canlı)
`{"ariaInvalid":"true","describedBy":"_r_b_-error","isFocused":true,
"pageAlertCount":0,"statusCount":0}` — field-level hata doğru, odak alana
döndü (kod + canlı tutarlı, `TwoFactorManagePasswordDialog`'un
`useEffect`'i çalıştı).

### Yeni eksen 3 — `MESSAGES.common.close` iki tüketicide de doğru mu
Kod okuması: `ActiveSessionsCard.tsx:447` VE
`TwoFactorStatusCard.tsx:368` **İKİSİ de** `closeLabel={MESSAGES.common.close}`
geçiyor (aynı anahtar, aynı değer "Kapat"). qa'nın yeniden koşturulan spec'i
(yukarıda) her İKİ kartta da `closeIconFoundByDistinctName` / `cancelButtonFoundByName`
assertlerini PASS etti → **canlı teyit edildi, bulgu yok.**

## Yeni eksen 1 — İki kapatma yolu ("Kapat" × ve "Vazgeç") aynı diyalogda

**Sonuç: bulgu yok — WCAG ihlali DEĞİL, aksine B2'nin düzeltmesi NİYETİNE
UYGUN çalışıyor.** Gerekçe:
- Bunlar **iki farklı bileşen** (ikon-only kapatma × / metinli "Vazgeç"
  butonu), ikisi de "diyaloğu onaylamadan kapat" eylemini yapıyor ama
  **farklı, yerleşik bir UI idiomunu** takip ediyorlar — ikon-only × için
  "Kapat"/"Close", açık metinli vazgeç butonu için "Vazgeç"/"Cancel" ayrımı
  dünya çapında (native OS diyalogları, çoğu tasarım sistemi) STANDART.
- **WCAG 3.2.4 Consistent Identification** aynı FONKSİYONA sahip
  bileşenlerin SİTE GENELİNDE kendi İÇİNDE tutarlı adlandırılmasını ister —
  "her × ikonu her zaman Kapat, her Vazgeç butonu her zaman Vazgeç" burada
  DOĞRU şekilde korunuyor (ikisi ayrı kategoriler, kendi içinde tutarlı).
  3.2.4 "aynı işlevdeki İKİ FARKLI BİLEŞEN TÜRÜNÜN aynı adı TAŞIMASI
  gerekir" demiyor — tam tersi, B2'nin düzelttiği kusur BUYDU (× ikonu
  YANLIŞLIKLA "Vazgeç" bileşeniyle AYNI adı TAŞIYORDU, bu da gerçek bir
  4.1.2/2.5.3 kusuruydu).
- Canlı DOM + qa'nın spec'i (yukarıda, 2 kart × 2 koşum) **iki kontrolün
  AYIRT EDİLEBİLİR** olduğunu doğruladı: `cancelButtonFoundByName=true`,
  `closeIconFoundByDistinctName=true`, `closeIconNoLongerSharesCancelName=0`.
  Ekran okuyucu kullanıcısı iki AYRI, kendi ADINI taşıyan kontrol duyar —
  "farklı bir şey yapacağını sanır mı" sorusunun yanıtı: HAYIR, ikisi de
  kendi adıyla "kapatma/vazgeçme" niyetini doğru TAŞIYOR (× "Kapat" ikon
  için konvansiyonel, "Vazgeç" metin butonu için konvansiyonel — İKİSİ DE
  sonucu "diyalog kapanır, hiçbir şey onaylanmaz" olduğunu DOĞRU biçimde
  ifade ediyor; kullanıcı YANLIŞ bir sonuç BEKLEMEZ).
- **WCAG 2.4.6 Headings and Labels**: her iki etiket de kendi amacını
  tanımlıyor (×="Kapat" = pencereyi kapat, "Vazgeç" = işlemden çekil) —
  ihlal YOK.

**Not (düşük önem, WCAG dışı, UX gözlemi — borca DAHİL EDİLMİYOR, tur 2a'nın
`low`'u ile AYNI KATEGORİ bile değil, salt gözlem):** iki kontrolün
FONKSİYONEL olarak birebir aynı sonucu ürettiği (her ikisi de aynı
`onOpenChange(false)` yoluna gidiyor) düşünüldüğünde, bazı tasarım
sistemlerinde × ikonu `aria-hidden` + yalnızca GÖRSEL bırakılıp TEK bir
"Vazgeç" kontrolü tercih edilir (redundancy azaltma) — ama bu bir WCAG
KRİTERİ DEĞİL, salt bir tasarım tercihi; mevcut çözüm WCAG'ı KARŞILIYOR.

## Yeni eksen 6 — axe-core YENİDEN (toplam özet) + elle kontrol listesi

**axe toplamı (8 ölçüm, 2 kart × 4 durum ortalaması, bu turda):**
| Durum | Kart | İhlal sayısı | Detay |
| --- | --- | --- | --- |
| liste-baseline | Sessions | 1 | label-content-name-mismatch (UserMenu, serious) |
| tekil-diyalog-açık | Sessions | 0 | — |
| tekil-diyalog-400-hata | Sessions | 0 | — |
| toplu-diyalog-açık | Sessions | 0 | — |
| toplu-diyalog-400-hata | Sessions | 0 | — |
| 2fa-liste-baseline | 2FA | 1 | aynı UserMenu öğesi |
| 2fa-disable-diyalog-açık | 2FA | 0 | — |
| 2fa-disable-diyalog-400-hata | 2FA | 0 | — |

**Benzersiz ihlal: 1** (`label-content-name-mismatch`, serious, UserMenu —
**L2 ile birebir aynı**, T-017'nin kendi yüzeyi DEĞİL). T-017'nin YENİ
yüzeylerinde (×2 kart × 4 diyalog durumu) axe **SIFIR** ihlal buldu — tur
1'in sonucuyla TUTARLI.

⚠ **axe tek başına yeterli değil — tur 1'in dersi bu turda da DOĞRULANDI:**
axe, × ikonunun ESKİ "Vazgeç" ad çakışmasını (B2, artık DÜZELTİLDİ) tur 1'de
YAKALAMAMIŞTI; bu turda da axe'ın YAKALAYAMAYACAĞI sınıflar VARDI (odak-olay
SAYISI/çift duyuru riski, başlık hiyerarşisi atlama, role=alert çakışma
riski, iki-kapatma-yolu kafa karışıklığı) — **bunların HEPSİ elle/canlı DOM
ölçümüyle** (yukarıdaki 7 eksen) değerlendirildi, axe raporuna GÜVENİLMEDİ.

**Elle kontrol listesi (bu turun 7 yeni ekseni + tur1'in 9 maddesi, özet):**
- [x] İki kapatma yolu ekran okuyucuda ayırt edilebilir, kafa karışıklığı YOK (eksen 1)
- [x] `setTimeout` sonrası TEK focusin olayı, çift duyuru GÖZLENMEDİ (eksen 2)
- [x] `MESSAGES.common.close` iki tüketicide de doğru (eksen 3)
- [x] Başlık hiyerarşisi atlama YOK, h1→h2 (eksen 4)
- [ ] role=alert çakışması — DOĞRULANAMADI (tam eşzamanlı senaryo canlı üretilmedi), yapısal PASS sinyali (eksen 5)
- [x] axe yeniden koşturuldu, 8 ölçüm, 1 benzersiz ihlal (kapsam dışı/L2) (eksen 6)
- [x] Tam klavye turu: ulaşma → tetikleme → trap → Escape → odak dönüşü → Tab sırası (eksen 7)
- [x] L-1 teyit edildi (hâlâ `low`, WCAG ihlali yok, closeLabel sonrası DEĞİŞMEDİ)
- [x] L-2 teyit edildi (hâlâ kapsam dışı, axe ile 2 kez yeniden doğrulandı)
- [x] Klavye ile tüm akış tamamlanabiliyor (Tab tuzağı yalnızca diyalog İÇİNDE, kasıtlı)
- [x] Görünür odak göstergesi (`FOCUS_RING_CLASS_NAMES`, kod değişmedi)
- [x] Kontrast — × ikonu className DEĞİŞMEDİ (yalnızca invisible aria-label değişti), tur1'in 7.578:1 ölçümü GEÇERLİ kalıyor (kod okumasıyla doğrulandı, yeni görsel yüzey YOK)
- [x] Form alanları programatik etiketli, hata alanla ilişkili (aria-invalid/describedby, canlı iki kartta da ölçüldü)
- [x] WCAG 2.2: 2.5.8 hedef boyutu PASS (44px butonlar, 32×32 × ikonu); 3.3.7 — step-up parola TEKRAR girişi GÜVENLİK istisnası kapsamında (yeniden kimlik doğrulama, 3.3.7'nin açık istisnası), ihlal DEĞİL; 2.4.11 odak hiçbir zaman örtülmüyor (overlay arkadaki içeriği kapatıyor ama ODAKLANAN öğe her zaman görünür); 2.5.7 N/A (sürükle-bırak yok)
- [ ] `prefers-reduced-motion` — DOĞRULANAMADI (tur1 ile AYNI, bu turda DEĞİŞEN bir animasyon/geçiş YOK, carry-over)

## Tur 1'in diğer noktalarının kısa yeniden geçişi (kod + canlı tutarlılık)

- **Parola alanı:** `<label>` ilişkisi (`Input`'un `htmlFor`/`id`, bu turda
  canlı `page.getByLabel(/şifreniz|parola/i)` İKİ KARTTA da BULDU — ölçüldü),
  `autoComplete="current-password"` (kod okundu, her iki `Input` için AYNI),
  `type="password"` (kod okundu), hata sonrası odak alana dönüyor (canlı
  ölçüldü, iki kartta da `isFocused:true`). **Değişiklik yok, tur1 ile
  tutarlı.**
- **Liste semantiği:** `<ul>/<li>` kod okumasıyla doğrulandı (değişmedi).
  "Sonlandır" erişilebilir adı `resolveTerminateAccessibleName`'den
  geliyor (değişmedi, bu turda yeniden okunmadı — tur1'in ölçümü hâlâ
  geçerli, kod satırı DEĞİŞMEDİ).
- **Yükleniyor/boş/hata:** `Skeleton`/`role="alert"`+retry kod yapısı
  DEĞİŞMEDİ (iki kartta da okundu, tur1'in tarifiyle BİREBİR).
- **Hata ayrımı:** 400→`Input.error` (iki kartta da canlı DOĞRULANDI, bu
  tur), 404→kart-seviyesi `role="alert"` (`sessionGoneNotice`, kod okundu,
  DEĞİŞMEDİ), 401→`signOutLocallyAndRedirect` (kod okundu, CANLI
  tetiklenmedi — **DOĞRULANAMADI**, tur1 ile AYNI, carry-over, yeni bir
  risk YOK).
- **IP `null`:** `resolveIpDisplayValue` kod okundu, DEĞİŞMEDİ; canlı
  ortamda IP her zaman `127.0.0.1` döndüğü için senaryo yine ÜRETİLEMEDİ —
  **DOĞRULANAMADI**, tur1 ile AYNI, yeni bulgu YOK.
- **Kontrast:** hiçbir token/renk sınıfı bu turda DEĞİŞMEDİ (kod okuması —
  `ConfirmDialog.tsx`'teki tek fark `aria-label` metni, GÖRÜNMEZ) — tur1'in
  6 canlı ölçümü (en kötüsü `success-600`/`success-surface` = 4.791:1,
  eşik 4.5:1; UI sınırları için `border`/`surface` = 4.759:1, eşik 3:1)
  **GEÇERLİ kalıyor**, yeniden ölçülmedi (gerek yok, hiçbir renk sınıfı
  dokunulmadı).

## L-1 / L-2 teyidi

- **L-1 (360px yatay istifleme, `ConfirmDialog.tsx:73`):** **HÂLÂ `low`,
  WCAG ihlali YOK.** Bu turda canlı yeniden ölçüldü (bkz. "360PX-TOPLU-
  DIYALOG" yukarıda): taşma yok, 44px buton yüksekliği korunuyor, ×
  ikonu (yeni `closeLabel` sonrası) 32×32px ile AYRI köşede, ÇAKIŞMA yok.
  `closeLabel` eklenmesi bu düzeni BOZMADI — **teyit edildi.**
- **L-2 (`UserMenu.tsx`, axe `label-content-name-mismatch`, T-008 borcu):**
  **HÂLÂ kapsam dışı.** Bu turda axe 2 KART × baseline durumunda (toplam 2
  bağımsız axe koşumu) AYNI, TEK ihlali buldu — T-017 bu bileşeni
  DEĞİŞTİRMEDİ, FAIL sayımına KATILMIYOR. **Teyit edildi.**

## Oran bütçesi — ÖLÇÜM (bitiş, perf ve sonraki turlar için devir)

Komut: `redis-cli -p 6379 GET/TTL <anahtar>` (salt okunur).

| Rota | Kullanılan/Sınır | TTL (kalan sn) |
| --- | --- | --- |
| sign-up/email IP | **9/10** | ~2340 (≈39 dk) |
| sign-in/email IP | 1/20 (pencere sıfırlandı, bu tur 3 yeni çağrı ekledi) | ~759 (≈12.6 dk) |
| two-factor/enable IP | 1/20 | ~759 |
| two-factor/verify-totp IP | 1/20 | ~759 |

⚠ **`perf` ve sonraki herhangi bir ajan için KRİTİK devir:** sign-up
bütçesi **9/10'da, yalnızca 1 DENEME KALDI**, TTL ~39 dakika. Yeni bir
`sign-up` çağrısı yapmadan önce bu anahtarın süresinin dolmasını BEKLEMEK
veya mevcut fixture kullanıcılarını (bu turda oluşturulan 2 kullanıcı)
YENİDEN KULLANMAK gerekir — aksi halde 429 `RATE_LIMIT_EXCEEDED` ile
KARŞILAŞILIR.

## Hijyen

- **Hiçbir repo dosyası değiştirilmedi/oluşturulmadı** — yalnızca
  `Read`/`Bash` kullanıldı, `Edit`/`Write` hiç çağrılmadı. `apps/admin/e2e/
  session-security-dialog-focus.qa.spec.ts` (qa'nın dosyası) OKUNDU,
  DEĞİŞTİRİLMEDİ — koşturulurken orijinal haliyle çalıştı (2 passed, iki
  bağımsız koşum).
- Geçici probe dosyaları (`wcag-tur2b-probe.spec.ts`,
  `wcag-tur2b.config.ts`, `wcag-tur2b-probe-2fa.spec.ts`,
  `wcag-tur2b-2fa.config.ts`, `api-3001.log`) **yalnızca scratchpad**'de
  oluşturuldu, iş bitince **silindi** — `apps/`/`packages/` içine HİÇBİR
  dosya YAZILMADI (`find apps packages -newer CLAUDE.md` ile doğrulandı:
  yalnızca qa'nın KENDİ dosyası ve build `dist/*.mjs` çıktıları görünüyor,
  BENİM eklediğim YOK).
- Kendi başlattığım `apps/api` süreci (3001, dist önceden derlenmiş,
  `.env`'e YAZILMADI) iş bitince **kapatıldı** (`lsof -iTCP:3001` → boş).
- `lsof -iTCP:5173` → boş (Playwright kendi webServer'ını kapattı/kapandı).
- Port **3000** (PID **11734**) ve **3100** (PID **63279**) **hiç
  DOKUNULMADI** — `lsof` ile başta VE sonda doğrulandı, PID'ler
  DEĞİŞMEDİ.
- 2 yeni gerçek test kullanıcısı (`wcag2b-sess-*@arkesoft.test`,
  `wcag2b-2fa-*@arkesoft.test`) oluşturuldu — gerçek veritabanı kayıtları,
  kart verisi/sır İÇERMİYOR, mevcut fixture deseniyle AYNI, silinmedi
  (temizlik bu ajanın yetkisi/görevi DEĞİL).
- `git status --porcelain | wc -l` → **76** (bu rapor dosyası dahil; tur
  2a'nın bıraktığı **75**'e BENİM +1 rapor dosyam eklendi — hiçbir
  üretim/kod dosyası DEĞİŞMEDİ).

---

## GATE: wcag
## SONUÇ: PASS

**Gerekçe (AGENT_BASELINE §4):** Bu turda (İş ③ — tam denetim) **sıfır**
yeni `critical`/`high`/`medium` bulgu üretildi. Yedi yeni eksenin (iki
kapatma yolu, odak-olay duyuru sayısı, `common.close` iki tüketici, başlık
hiyerarşisi, role=alert çakışması, axe yeniden, tam klavye turu) her biri
canlı ölçüldü ve **ya "bulgu yok" ya da yapısal/kod-okuması destekli
DOĞRULANAMADI** (sayılmıyor) ile sonuçlandı. L-1/L-2 (tur1'in `low`/kapsam
dışı kalemleri) **teyit edildi**, değişmedi. Tur 2a'nın tek `low`'u
(`setTimeout(0)` borcu) bu turda TEKRAR SAYILMADI (zaten kayıtlı).

## BULGULAR
  - yok (bu turun kendi ölçümünde yeni bulgu üretilmedi)

## ÖLÇÜMLER
- **axe-core:** 8 ölçüm (2 kart × baseline + diyalog-açık + 400-hata, +
  tekil/toplu diyalog Sessions kartı için 4), **1 benzersiz ihlal**
  (`label-content-name-mismatch`, serious, UserMenu — kapsam dışı/L2,
  2 kez bağımsız doğrulandı). T-017'nin KENDİ yüzeylerinde (6 durum: tekil
  açık/400, toplu açık/400, 2FA açık/400) **0 ihlal**.
- **İncelenen bileşen/dosya sayısı:** 2 canlı Playwright koşumu (toplam
  2 passed, sıfır flake) + 1 qa spec yeniden-koşumu (2 passed) + 6 statik
  dosya okuması (`ConfirmDialog.tsx`, `ActiveSessionsCard.tsx`,
  `TwoFactorStatusCard.tsx`, `Card.tsx`, `_app.hesap.guvenlik.tsx`,
  `messages.ts`) + 1 Radix kaynak kodu satırı (`Dialog.Title` → `h2`).
- **En kötü kontrast oranı:** bu turda YENİDEN ölçülmedi (hiçbir renk
  token'ı değişmedi) — tur1'in **4.759:1** (en dar UI-sınır eşiği, 3:1
  karşısında) ve **4.791:1** (en dar metin eşiği, 4.5:1 karşısında)
  ölçümleri GEÇERLİ.
- **Odak-olay sayımı:** Escape sonrası gerçek `focusin` dinleyicisiyle
  **1** hedef değişikliği (tetikleyici buton) — `BODY` için SIFIR olay.
- **Oran bütçesi (bitiş):** sign-up **9/10** (1 kaldı, TTL ~39dk) ⚠ KRİTİK
  — sign-in **1/20**, two-factor/enable **1/20**, two-factor/verify-totp
  **1/20** (pencereler bu turda sıfırlanmıştı, geniş pay var). **`perf`
  sign-up YAPMADAN ÖNCE bu anahtarın süresini kontrol ETMELİ.**
