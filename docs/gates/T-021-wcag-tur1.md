# GATE: wcag — T-021 (ROADMAP v0.0.20), Tur 1

**SONUÇ: PASS** · `critical` 0 · `high` 0 · **`medium` 1** · **`low` 2**
(+1 `DOĞRULANAMADI`-only not, bulgu sayılmadı)

> ⚠ Bu rapor `wcag` ajanının çıktısından **Orkestratör tarafından diske işlendi** —
> ajanın `Write` aracı yok. İçerik ajanın kendi ölçümleridir.

⚠ Tur **tamamen statik okuma** ile yapıldı — `@axe-core/playwright` **yok**
(kullanıcı kararıyla v0.0.20.1), e2e bütçesi **`qa`'ya ayrıldı**; hiçbir komut
çalıştırılmadı. ⭐ **`wcag` DÖRDÜNCÜ kez elle koştu** (T-016, T-019, T-020, T-021).

---

## ①–④ — Orkestratör'ün özel sorduğu dört kalem

### ① Dual-markup (`TenantListView.tsx`) — **TEMİZ**

`:68` (`hidden md:block` → `DataTable`) ve `:103` (`md:hidden` → `<ul>`) **doğru**.
⭐ **Ölçüm:** `packages/config/tailwind/theme.css`'te Tailwind'in `hidden` sınıfı
**override EDİLMEMİŞ** (grep ile teyit) ⇒ gerçek `display:none` üretiyor,
`visibility:hidden` **değil** ⇒ her an **yalnızca biri** erişilebilirlik ağacında.
⚠ Boş-durum dalında ek bir gözlem var → **BULGU 3**.

### ② Üç 403'ün `role` ayrımı — **TEMİZ, tutarlı ve gerekçeli**

| Bileşen                     | `role`      | Eylem                                                    | Değerlendirme                                                                                                                                                                                                   |
| --------------------------- | ----------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UnauthorizedWall.tsx:32`   | `status`    | ⭐ **YOK** (grep: dosyada `Button`/`button` **hiç yok**) | ⭐ Doğru — kalıcı **yetki sınırı**, alarm değil; _polite_ tonlama _"burada durma, arıza yok"_ mesajını doğru veriyor. ⚠ _"Tekrar giriş"_ önerisi **yok**                                                        |
| `TwoFactorSetupWall.tsx:37` | `status`    | `Button variant="primary"`                               | ⭐ Doğru — bu bir **hata değil**, bir **sonraki adım**                                                                                                                                                          |
| `NetworkBlockedWall.tsx:39` | **`alert`** | YOK                                                      | ⭐ **Gerekçeli görüş: doğru seçim.** Üçünün tek **gerçek blokajı**; `status` olsaydı panelin **kalıcı olarak kapalı** olabileceği (`SUPERADMIN_IP_ALLOWLIST` boş) gerçeğinin **aciliyeti yanlış yumuşatılırdı** |

⭐ Üçü de kendi `h1`'ini taşıyor, mount'ta `focus()` çağırıyor, **kabuksuz** render ediliyor.

### ③ T-019'un `W-3` borcu — ⚠⚠ KARIŞIK: bir DOC HATASI + bir GERÇEK TEKRAR

⚠⚠ **`docs/ux/T-021` ve `docs/ui/T-021`'in _"W-3"_ tanımı YANLIŞ.** O belgeler onu
_"2FA kod alanının etiket↔hata ilişkisi"_ diye tarif ediyor — ⭐ ama **gerçek `W-3`**
(`ROADMAP:3244`, `T-019.md:1442`) bir **hedef boyutu (2.5.8)** sorunudur.
⇒ **Doc-seviyesi karışıklık, kod bulgusu değil** → `docs` (`S11`).

⭐ Docs'un tarif ettiği eksen (etiket↔hata) **TEMİZ**:
`TwoFactorChallengeForm.tsx:125-133` `Input`'un `error` prop'unu kullanıyor,
`packages/ui/src/components/Input.tsx:42-43` bunu `aria-invalid` + `aria-describedby`'ye
**doğru** bağlıyor; form seviyesi hata (`_auth.giris.tsx:163-171`) **ayrı** `role="alert"`
kutusu — ⭐ alan seviyesiyle **karıştırılmıyor** (T-016/T-017 kuralı **korunmuş**).

⚠ **Gerçek `W-3` ise REPRODUCE EDİLDİ** → **BULGU 2**.

### ④ `S8`'in iki kararının erişilebilirlik sonucu

1. **Native disclosure (`Sidebar.tsx`)** — `aria-expanded`/`aria-controls`/`useId`
   **doğru** bağlanmış, `Escape` dinleyicisi **var**, hedef boyutları `min-h-11 min-w-11`
   (**44px**, 2.5.8 **fazlasıyla** karşılanıyor). ⚠ **Ama Radix'in bir garantisi eksik**
   → **BULGU 1**.
2. **Kimlik rozeti (_"SA"_)** — `Topbar.tsx:36-41` `aria-hidden="true"`, metin yok.
   ⭐ **Doğru karar:** `platform.session` e-posta/`userId` **döndürmüyor**; anlamlı bir ad
   üretilemeyen bir kısaltmayı ekran okuyucuya duyurmak **bilgi değeri sıfır** olurdu.

---

## BULGULAR

### `medium` — odak tetikleyiciye DÖNMÜYOR

**`apps/superadmin/src/components/Sidebar.tsx:41-50`** · WCAG **2.4.3 Focus Order**

Mobil nav disclosure `Escape` ile **kapanıyor** ama odak tetikleyici (`☰`) düğmesine
**dönmüyor**.

⚠ **Gerçek kullanıcı senaryosu:** 360px'te, ekran okuyucu kullanan bir operasyon
kullanıcısı menüyü açar, *"Denetim kaydı"*na `Tab` ile ulaşır (`:74`/`:85`), vazgeçip
`Escape`'e basar → `<nav>` `hidden` (`display:none`) olur, **odaklı öğe DOM akışından
çıkar**, tarayıcı odağı **`document.body`'ye düşürür** ⇒ kullanıcı **konumunu kaybeder**,
sayfanın **başından** `Tab`'lamak zorunda kalır.

⭐ **Radix'in dismissable-layer'ının sağladığı _"tetikleyiciye odak dönüşü"_ garantisi
elle karşılanmamış** — ⚠ `S4`/`S8`'in Radix'i **bilinçli reddetme** kararının
**ölçülmemiş bedeli**.

**Öneri:** toggle düğmesine `ref` ekle; `Escape` handler'ında **ve** link seçimiyle
kapanmada `.focus()` çağır. → **`frontend`**

### `low` — gerçek `W-3` (2.5.8) ÜÇÜNCÜ konuma kopyalandı

**`apps/superadmin/src/features/two-factor/TwoFactorChallengeForm.tsx:149-160`** ·
WCAG **2.5.8 Target Size**

_"Yedek kod kullanın"_ / _"Kimlik doğrulayıcı kullanın"_ `<Link>`'i yalnızca
`text-(length:--font-size-small)` taşıyor — **dolgu/min-height yok**, **<24px**.
⚠ `apps/admin/.../TwoFactorChallengeForm.tsx:149-160`'tan **birebir aynı hâliyle**
kopyalanmış (⭐ dosyanın **kendi yorumu** da bunu doğruluyor), **düzeltilmeden**.

⇒ ⚠⚠ **Borç artık ÜÇ konumda:** `apps/admin/src/routes/_auth.kayit.tsx:219-234` ·
`apps/admin/.../TwoFactorChallengeForm.tsx:149-160` · **şimdi**
`apps/superadmin/.../TwoFactorChallengeForm.tsx:149-160`.

⚠ Motor bozukluğu olan / titreyen elle dokunmatik kullanıcıda **isabet oranı düşük**.
**Öneri (T-019'unkiyle aynı, ⭐ merkezi çözülmeli):** `min-h-11` + `inline-flex items-center`.
→ **`frontend`** + ⚠ **`docs`**: `docs/ux/T-021` madde 4 ve `docs/ui/T-021` erişilebilirlik
tablosu madde 4'teki _"W-3"_ tanımı **düzeltilsin**.

### `low` (kısmen `DOĞRULANAMADI`) — İÇ İÇE İKİ CANLI BÖLGE

**`packages/ui/src/components/DataTable.tsx:40-46`** +
**`apps/superadmin/src/features/tenants/TenantListView.tsx:64-97`** · WCAG **4.1.3**

Kiracı listesi **boşken**, ≥768px dalında `DataTable`'ın **kendi** boş-durum sarmalayıcısı
(`<div role="status">`) `EmptyState`'in **kendi** `role="status"` sarmalayıcısını
**içine alıyor** ⇒ **iki iç içe canlı bölge, aynı metin**.

⚠ Canlı ekran okuyucu/axe testi koşulmadığı için çift duyurunun **fiilen oluşup
oluşmadığı `DOĞRULANAMADI`**.
⭐⭐ **Ama kayda değer:** `DataTable`'ın **T-008'den beri ilk gerçek tüketicisi** bu Task
⇒ bu etkileşim **ilk kez** ortaya çıkıyor.

⚠⚠ **Düzeltme bu sürümde YAPILAMAZ:** `packages/ui` **AC-2 gereği değişmez**.
⇒ **Teknik borç** → `ui`.

---

## `S2`'nin numaralı denetim listesi — madde madde sonuç

| #   | Eksen                               | Sonuç                                                                                                                                       |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Odak sırası (giriş→2FA)             | ✅ **PASS** — `_auth.giris.tsx:60-64` (`computeSignInFocusKey` + `headingRef` + `focus()`); ⭐ hiçbir geçişte odak `<body>`'ye **düşmüyor** |
| 2   | Odak sırası (duvar ekranları)       | ✅ **PASS** — üç duvar + `TwoFactorSetupWizard`'ın **üç adımı** da aynı desen                                                               |
| 3   | Klavye tuzağı                       | ✅ **PASS (tuzak yok)** — ⚠ ama bkz. BULGU 1 (tuzak **değil**, odak **kaybı**)                                                              |
| 4   | Etiket↔hata ilişkisi                | ✅ **PASS** (③)                                                                                                                             |
| 5   | Durum/eylem ayrımı                  | ✅ **PASS** — `UnauthorizedWall`'da **hiç** odaklanabilir kontrol yok (grep teyitli)                                                        |
| 6   | Durum renkle tek başına iletilmiyor | ✅ **PASS** — `tenant-status-label.ts` + `:82-93`,`:113-122` görünür metin + `aria-hidden` nokta                                            |
| 7   | Liste semantiği                     | ✅ **PASS** — `AuditLogView.tsx:59-78` native `<ul>/<li>`, ⭐ `<table>` zorlaması **yok**                                                   |
| 8   | Kontrast AA                         | ✅ **PASS** — yeni token **yok**; `CONTRAST_PAIRS` zaten pinli ve `tokens.test.ts` ile **mekanik** doğrulanıyor                             |
| 9   | Canlı bölge gürültüsü               | ✅ **PASS** — `challenge-countdown.ts:22-24` yalnızca **60s/0s** eşiklerinde                                                                |
| 10  | Kabuk navigasyonu erişilebilir ad   | ✅ **PASS** — gerçek `Link`, `aria-current="page"`, nav'da `aria-label`                                                                     |

## WCAG 2.2 yeni kriterleri ve ek eksenler

- **2.4.11 Focus Not Obscured** — `DOĞRULANAMADI` (sticky toolbar `BackupCodesList.tsx:59`
  **birebir kopya**, canlı test gerektirir) ⇒ ⭐ **yeni regresyon değil**.
- **2.5.7 Dragging** · **3.3.7 Redundant Entry** — **N/A**.
- **2.5.8 Target Size** — `Sidebar` toggle/link'leri **44px**, fazlasıyla geçiyor;
  ⚠ tek istisna **BULGU 2**.
- **1.4.10 Reflow (320px)** — statik CSS taramasında sabit-px genişlik/taşma deseni
  **görülmedi** (hepsi `flex`/`w-full`/`max-w-*`); ⚠ canlı 320px/200% zoom testi
  koşulmadı ⇒ **`DOĞRULANAMADI`**.
- **`lang`** — `index.html:7` → `lang="tr"`, boş olmayan `<title>`, her rota kendi
  `document.title`'ını set ediyor ⇒ **PASS**.
- **`outline:none`** — ⭐ `apps/superadmin/src` içinde **HİÇ YOK** (grep teyitli);
  `FOCUS_RING_CLASS_NAMES` **tutarlı** kullanılıyor.
- **`prefers-reduced-motion`** — `LoadingState.tsx:31` → `motion-reduce:animate-none` ✅.

## Ölçümler

axe-core **koşulmadı** (altyapı v0.0.20.1'e bırakıldı) · incelenen dosya **22/68**
(6 ekran + kabuk + 3 duvar + 2FA akışı + karar dosyaları; kalan ~46 **a11y yüzeyi
taşımıyor**) · en dar kontrast payı `success-600/success-surface` **4.79:1** (eşik 4.5,
önceki turlarda pinli) · `critical/high/medium/low` = **0/0/1/2**.

## Temiz çıkan eksenler (⭐ bir sonraki tur TEKRAR BAKMASIN)

Dual-markup · üç 403'ün `role`/ton ayrımı · 2FA etiket↔hata · form↔alan hata ayrımı ·
durum/eylem ayrımı · renk-bağımsız durum metni · denetim kaydı liste semantiği ·
canlı bölge disiplini · kabuk nav erişilebilir adı · kontrast token registry'si ·
`lang`/`title` · `outline` kaldırma **yok** · `prefers-reduced-motion` · 2.5.7/3.3.7 N/A.
