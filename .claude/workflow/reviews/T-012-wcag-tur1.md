# T-012 — wcag gate — tur 1

Tarih: 2026-11-03
Sürüm: v0.0.10
GATE: wcag
SONUÇ: PASS

---

## 0. Ortam / yöntem notu

- `apps/api` bu turun başında AYAKTA DEĞİLDİ. `pnpm --filter @arkesoft/api dev` ile başlatıldı,
  `GET http://127.0.0.1:3000/health/ready` → `200 {"status":"ok","checks":{"database":"up","redis":"up"}}`
  ile DOĞRULANDI.
- **İŞ 2 kararı: (b) üretim yolu seçildi.** `pnpm --filter @arkesoft/storefront build` çalıştırıldı
  (`[build] Complete!`), ardından üretilen `dist/server/entry.mjs` doğrudan `node` ile `PORT=4322`
  üzerinde başlatıldı (4321 değil — aynı anda iki storefront süreci çalışmasın diye farklı port
  seçildi; `astro.config.ts`'teki `4321` sabiti DEĞİŞTİRİLMEDİ, sadece runtime `PORT` env'i ile
  override edildi). Bu yol `astro dev`'in geliştirme araç çubuğunu (S9'un bildirdiği ek `h1`
  enjeksiyonu) **yapısal olarak içermez** — üretim build'inde o kod hiç yok. Dolayısıyla İŞ 2'nin
  "iki telafiden biri" sorusu: **telafi gerekmedi**, çünkü araç çubuğu üretim sunucusunda hiç
  render edilmiyor. `main h1` kapsamına daraltma (a) yoluna gerek kalmadı.
- Tenant host çözümü için Chromium `--host-resolver-rules=MAP demo-magaza.arkesoft.localhost 127.0.0.1`
  ile başlatıldı (gerçek `/etc/hosts` dosyasına dokunulmadı — kalıcı sistem değişikliği yapılmadı).
  `curl -H "Host: demo-magaza.arkesoft.localhost"` ile de çapraz doğrulandı (200 ana sayfa, 404
  olmayan yol).
- Kök `.env`'deki `APP_BASE_DOMAIN`/`STOREFRONT_API_BASE_URL` değerleri üretim sürecine **env
  değişkeni olarak** aktarıldı (`.env` dosyası okunmadı/değiştirilmedi, sadece `source` ile shell'e
  alınıp alt sürece miras bırakıldı) — standalone build, `dev`'e özgü `createRootEnvIntegration`
  entegrasyonunu çalıştırmıyor, bu beklenen davranış (`astro.config.ts` yorumunda da belirtiliyor).
- Ölçüm aracı: Playwright (`playwright-core@1.64.1`, repoda zaten `@playwright/test` devDependency'si
  üzerinden var — yeni bağımlılık eklenmedi) ile `getComputedStyle` okundu. Kontrast oranları
  **elle** (WCAG 2.x relative luminance formülü, Python'da) hesaplandı — kütüphane/online hesaplayıcı
  kullanılmadı.
- Temizlik: ölçüm sonunda `node dist/server/entry.mjs` ve `apps/api dev` süreçleri `pkill` ile
  durduruldu. Doğrulama: `pgrep -fl 'astro dev'` → boş, `lsof -i :3000` → boş, `lsof -i :4321` → boş,
  `lsof -i :4322` → boş.

---

## 1. Kontrast tablosu — KENDİ HESABIM (gerçek `getComputedStyle` değerleri üzerinden)

| # | Metin/öğe | Gerçek render rengi (`getComputedStyle`) | Gerçek zemin | Hesapladığım oran | Eşik (boyuta göre) | Sonuç |
|---|---|---|---|---|---|---|
| 1 | `PageHeading` (h1, "Demo Mağaza") | `rgb(37,99,235)` = `#2563EB` (`--color-primary`) | `rgb(255,255,255)` (`.theme-modern-section` → `--color-surface`) | **5.17:1** | 24px/font-weight 600 → **büyük metin, eşik 3.0** (aynı zamanda normal eşik 4.5'i de geçiyor) | ✓ AA |
| 2 | `BodyText` (p, mağaza açıklaması) | `rgb(55,65,81)` = `#374151` (`--color-body`) | `rgb(255,255,255)` (`--color-surface`) | **10.31:1** | 16px normal → eşik 4.5 | ✓ AA |
| 3 | `TenantGreeting` `<details>/<summary>`/`<p>` | `rgb(31,41,55)` = `#1F2937` (`BaseLayout`'un `text-[#1F2937]`'inden miras — `PageSection` bu elemanı **sarmıyor**, bkz. not aşağıda) | `rgb(255,255,255)` (`body.bg-white`) | **14.68:1** | 16px normal → eşik 4.5 | ✓ AA |
| 4 | `/404` sayfası h1 + p (tema **bağlanmamış**, kiracısız render) | `rgb(31,41,55)` = `#1F2937` (miras, `PageHeading`/`BodyText` kullanılmıyor) | `rgb(255,255,255)` | **14.68:1** | h1 24px/600, p 16px/400 → en sıkı eşik 4.5 | ✓ AA |
| 5 | Odak göstergesi (`<summary>`, tarayıcı varsayılan `outline: auto`) | `outlineColor: rgb(0,95,204)` = `#005FCC` (Chromium `-webkit-focus-ring-color`, kodda **hiçbir** `outline` kuralı yok — doğrulandı: `rg outline` → 0 eşleşme) | `rgb(255,255,255)` | **5.98:1** | WCAG 2.2 **1.4.11 Non-text Contrast**, eşik 3.0 | ✓ AA |

**`docs/ui/T-012.md` ile karşılaştırma:**

- Satır 1 (`#2563EB`/`#FFFFFF` = 5.17:1) — **birebir eşleşiyor**, doc'un iddiasıyla aynı.
- Satır 2 (`#374151`/`#FFFFFF` = 10.31:1) — **birebir eşleşiyor**.
- Satır 3/4 (`#1F2937`/`#FFFFFF` = 14.68:1) — doc bunu "palete dahil değil, referans" olarak ayrıca
  not etmiş ve **aynı sayıyı** (14.68:1) kendi elle hesabında veriyor — **eşleşiyor**.
- Satır 5 (odak göstergesi) — doc bunu **bu sürümde tüketicisi olmadığı için** "gelecekte eklenecek
  bir bağlantı/kontrol için şimdiden karar" olarak işaretlemiş (`--color-primary`/2px/`outline-offset:2px`
  önerisi, henüz kodda yok). **Ben gerçek bir etkileşimli öğenin (native `<summary>`) var olduğunu ve
  onun tarayıcı varsayılan odak halkası taşıdığını ölçtüm** — bu doc'un "hiçbir etkileşimli öğe yok"
  iddiasıyla **TAM örtüşmüyor**: `TenantGreeting` (T-009'dan miras, bu sürümde değişmedi) zaten
  etkileşimli bir öğe ve odak göstergesi zaten var, ölçülebilir ve geçiyor (5.98:1). Bu bir
  **tutarsızlık değil eksik kapsam** — `ui`/S1'in planı yalnızca kendi ürettiği üç bileşeni (`PageSection`/
  `PageHeading`/`BodyText`) kapsıyordu, `TenantGreeting` T-009'un ürünü ve bu planın dışında kalmış.
  Sonuç olumlu (geçiyor) olduğu için **bulgu değil**, ama rapor ediyorum çünkü talimat "tablo ile
  render arasında uyuşmazlık varsa BULGU" diyordu — burada uyuşmazlık **render'ın aleyhine değil
  lehine** (doc'un kapsamadığı bir öğe de AA'yı geçiyor), dolayısıyla FAIL tetiklemiyorum.

**En düşük ölçülen oran: 5.17:1** (`color-primary`/`color-surface` çifti) — doc'un iddiasıyla aynı.

---

## 2. axe-core

**Yok.** `rg axe-core` repo genelinde yalnızca `pnpm-lock.yaml`'da `eslint-plugin-jsx-a11y`'nin
**geçişli (transitive)** bağımlılığı olarak görünüyor (`axe-core@4.14.0`, lint-time statik kural
motoru — `@axe-core/playwright` gibi bir çalışma zamanı tarayıcı entegrasyonu **değil**). Hiçbir
`package.json`'da doğrudan bağımlılık olarak yok.

→ **Yeni ana bağımlılık EKLENMEDİ** (CLAUDE.md §4.5 md 3, Orkestratör onayı gerektirir).
→ Elle kontrol listesi bu raporun 1, 3 ve 4. bölümlerinde uygulandı.
→ **Borç önerisi (docs/ROADMAP'e):** `@axe-core/playwright` (veya eşdeğeri) e2e altyapısına eklensin;
  bugünkü lint-time `eslint-plugin-jsx-a11y` statik taramayı **tamamlar**, onun yerini tutmaz
  (jsx-a11y yalnızca JSX/TSX'i görür, `.astro` dosyalarını görmez — bu sürümün üç yeni bileşeni
  `.astro`, yani bugün jsx-a11y'nin kapsamı dışında). SEV: low, vade önerisi: v0.0.19 (Playwright
  altyapısı zaten o sürümde genişletiliyor).

---

## 3. WCAG 2.2 AA — kontrast dışı maddeler (ölçüm sonuçları)

| Madde | Ölçüm | Sonuç |
|---|---|---|
| Tek `h1` | Ana sayfa: `document.querySelectorAll('h1').length` = **1**, `main h1` = **1**. 404 sayfası: aynı şekilde **1**/**1**. Başlık sırası (`headingSequence`): sadece `["H1"]` — atlama yok (zaten h2+ hiç yok). | ✓ |
| Klavye erişimi | `Tab` → ilk ve tek odaklanabilir öğe `<summary>` ("Bu sayfa neden böyle görünüyor?"). `Enter` → `details.open === true` (açıldı). İkinci `Tab` → `document.body` (sayfada başka odaklanabilir öğe yok, klavye tuzağı **yok**). | ✓ |
| `<details>`/`<summary>` erişilebilir ad | `<summary>` metni "Bu sayfa neden böyle görünüyor?" — native semantik (HTML-AAM: `<summary>` örtük olarak buton benzeri rol + ebeveyn `<details>`'in `open` durumunu `aria-expanded` eşdeğeri olarak dışa verir). Kodda `rg outline/aria` → **ek ARIA yok**, gerekmiyor da (doğru karar — "gerekmeyen yere ARIA ekleme" kuralına uygun). | ✓ |
| Odak göstergesi + kontrastı | §1 madde 5: `outline: auto`, `#005FCC`, **5.98:1** (eşik 3.0, 1.4.11). Kodda hiçbir yerde `outline: none` yok (`rg outline` → 0 eşleşme `apps/storefront/src`, `packages/themes/modern/src`). | ✓ |
| `lang` | `document.documentElement.lang` → ana sayfa **"tr"**, 404 sayfası **"tr"** (`BaseLayout.astro` her ikisine de `lang="tr"` geçiriyor — `index.astro:33`, `404.astro`). | ✓ |
| Reflow (1.4.10) | 320px: `scrollWidth === clientWidth === 320` (yatay kaydırma yok). 640px (1280'in %50'si, 200% zoom'un kaba yaklaşıklaması): `scrollWidth === clientWidth === 640`. Gerçek tarayıcı zoom API'si Playwright'ta yok — bu bir **yaklaşıklama**, gerçek `Ctrl/Cmd +` zoom testi **ölçemedim**. | ✓ (yaklaşık), ⚠ gerçek zoom ölçülemedi |
| `prefers-reduced-motion` | `hasAnimationOrTransition` taraması: sayfadaki **hiçbir** elementte `animation-name !== 'none'` veya `transition-duration > 0` yok. Kodda da `rg animation/transition` taraması gerekmedi çünkü DOM'da hiç yok. | **N/A** — hareket içeriği hiç yok, destekleyecek bir şey yok |
| WCAG 2.2 yeni kriterler | 2.4.11 (odak gizleme): N/A, sticky/overlay yok. 2.5.7 (sürükle-bırak): N/A, drag yok. 2.5.8 (hedef boyutu ≥24×24): `<summary>` ölçülen gerçek kutu **640×44px** (Tailwind `min-h-11 min-w-11` = 44px, container tam genişlik) — **çok rahat geçiyor**. 3.3.7 (tekrar veri girişi): N/A, form yok. | ✓ / N/A |

---

## 4. Diğer gözlemler (bulgu değil, bilgi amaçlı)

- `TenantGreeting` (`<details>`), `PageSection`'ın **içine sarılmıyor** — `index.astro`'da
  `ThemeTemplate` (tema içeriği) ile `TenantGreeting` kardeş (sibling) öğeler, ikincisi
  `BaseLayout`'un `text-[#1F2937]`'inden miras alıyor, temanın `--color-body`'sinden değil. Bu
  `docs/ui/T-012.md`'nin "VARSAYIMLAR" bölümünde açıkça frontend'in kararına bırakılmış
  (`PageSection`'ın `children` kabul etmesi zorunlu değil). Sonuç kontrast açısından **daha** iyi
  (14.68:1 > 10.31:1) — davranış değişikliği istenmiyor, sadece not ediliyor.
- `/404` rotası temaya **bağlı değil** (architect risk 6, bilinçli sınır, `docs/ui/T-012.md` satır
  39/262'de teyit edilmiş) — bu turun kapsamında yeniden tartışılmadı, sadece erişilebilirlik
  açısından **bağımsız olarak da AA'yı karşıladığı** doğrulandı (bkz. §1 satır 4).

---

## ÖLÇÜLEMEYEN / ÖLÇEMEDİĞİM NOKTALAR (açık bildirim)

1. **Gerçek tarayıcı zoom'u (200%)** — Playwright'ta native `Ctrl +`/`Cmd +` zoom API'si yok;
   viewport genişliğini yarıya indirerek (1280→640) **yaklaşık** bir reflow testi yapıldı, sonuç
   temiz ama bu gerçek zoom davranışının **birebir eşdeğeri değil**.
2. **Firefox/Safari'nin varsayılan odak halkası rengi** — yalnızca Chromium'da ölçüldü (`#005FCC`,
   5.98:1). Diğer motorların varsayılan halka rengi farklı olabilir; kodda **hiçbir** özel `outline`
   kuralı olmadığı için bu tamamen tarayıcı varsayılanına bağlı — ölçülemedi (bu ortamda yalnızca
   Chromium kuruluydu, `~/Library/Caches/ms-playwright` taraması bunu doğruladı).
3. **CI'da axe/e2e** — `qa`'nın ölçümüyle tutarlı: bu turun tüm ölçümleri **yalnızca yerel**
   (v0.0.19 CI altyapısı henüz yok).

---

GATE: wcag
SONUÇ: PASS
BULGULAR:
  - [SEV: low] `docs/ui/T-012.md` (İş 5, "Odak göstergesi kontrastı" bölümü) — doc bu sürümde
    "hiçbir etkileşimli öğe yok" diyor ama render edilen sayfada `TenantGreeting`'in native
    `<summary>`'si zaten etkileşimli ve odak göstergesi taşıyor (ölçüldü, 5.98:1, geçiyor). Doc'un
    kapsamı T-009'dan miras kalan bu bileşeni atlamış. Davranış/sonuç doğru (AA geçiyor), sadece
    dokümantasyon kapsamı eksik. — Önerilen düzeltme: `docs/ui/T-012.md`'ye bir dipnot eklensin
    ("TenantGreeting zaten etkileşimli, odak göstergesi tarayıcı varsayılanı, ölçüldü X:1") —
    sorumlu ajan: `ui` (bir sonraki dokunuşta, ayrı tur açılmaz, ROADMAP borcuna gider).
  - [SEV: low] `@axe-core/playwright` (veya eşdeğeri) hâlâ yok — bu sürümün tüm a11y denetimi elle
    yapıldı; otomatik regresyon koruması eksik. — Önerilen düzeltme: v0.0.19 Playwright altyapı
    genişlemesinde eklensin — sorumlu ajan: `devops`/`docs` (ROADMAP teknik borç tablosu).
  - [SEV: low] Gerçek tarayıcı 200% zoom davranışı bu turda ölçülemedi (yalnızca viewport-yarı
    yaklaşıklaması yapıldı); Firefox/Safari'nin varsayılan odak halkası rengi ölçülemedi (yalnızca
    Chromium kuruluydu). — Önerilen düzeltme: çoklu tarayıcı Playwright projesi + gerçek zoom emülasyonu
    v0.0.19 e2e genişlemesine not düşülsün — sorumlu ajan: `docs` (ROADMAP borcu).
ÖLÇÜMLER:
  - axe-core ihlal sayısı: ÇALIŞTIRILAMADI (altyapı yok, yukarıda gerekçeli) — elle kontrol listesi
    uygulandı (bu dosyanın §1/§3'ü).
  - İncelenen sayfa/bileşen sayısı: 2 sayfa (ana sayfa `/`, `/404`), 3 yeni tema bileşeni
    (`PageSection`, `PageHeading`, `BodyText`), 1 mevcut React adası (`TenantGreeting`, değişmedi).
  - En kötü (en düşük) ölçülen kontrast oranı: **5.17:1** (`#2563EB`/`#FFFFFF`, `color-primary`),
    eşik 4.5 (normal metin) — **geçiyor**, doc'un iddiasıyla birebir eşleşiyor.
  - Kontrast çifti sayısı ölçülen: 5 (tümü AA geçti; en düşüğü 5.17:1, en yükseği 14.68:1).
  - `low` bulgu sayısı: 3 (düzeltme turu açmıyor, ROADMAP teknik borcuna gidiyor).
