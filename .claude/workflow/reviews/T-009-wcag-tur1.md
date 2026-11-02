# T-009 · WCAG Gate · Tur 1 — 2026-11-02

GATE: wcag
SONUÇ: PASS

BULGULAR:
  - [SEV: low] `apps/storefront/src/pages/503.astro:23` — `/503` doğrudan istenirse (middleware'in `pathname==='/503'` erken-çıkış dalı, tenant çözümü atlanır) `Astro.originPathname` `"/503"` olur, "Yeniden dene" `href="/503/"` kapalı döngü üretir (ölçüldü: `curl http://127.0.0.1:4321/503` → `href="/503/"`). WCAG ihlali değil (bağlantı geçerli, erişilebilir adı doğru, 2.4.4 karşılanıyor) — aynı kök neden security-B'nin düşük bulgusuyla örtüşüyor, mükerrer kayıt önerilmiyor — sorumlu: frontend — vade: v0.0.10.
  - [SEV: low] `apps/storefront/src/messages/messages.ts:47` — "Yeniden dene" bağlamdan bağımsız (AAA, 2.4.9) değil ama AA (2.4.4, bağlamla) yeterli; isteğe bağlı iyileştirme: "Sayfayı yeniden yükle" gibi daha açıklayıcı metin — sorumlu: ux — vade: isteğe bağlı, borç.

ÖLÇÜMLER:
  - axe-core 4.14.0 (manuel enjeksiyon, `@axe-core/playwright` repo'da yok — ROADMAP'te v0.0.19 öncesi altyapı eksik, baseline'da not edilmiş) → 3 sayfa × 0 ihlal (tenant 0/19 pass, 404 0/18 pass, 503 0/20 pass)
  - Kontrast bağımsız hesap: `#1F2937`/`#FFFFFF` = 14.67:1 (WCAG luminance formülü) — ux'in 14.68 iddiasını doğruluyor (yuvarlama farkı); yüzeyde başka renk çifti YOK (link/ikincil metin aynı tonu devralıyor, disabled durum yok)
  - Klavye turu: 3 sayfa, tuzak YOK, mantıksal sıra; odak göstergesi her etkileşimli öğede `outlineStyle:auto outlineWidth:1px` (tarayıcı varsayılanı, kaldırılmamış); `outline: none|0` taraması → 0 eşleşme
  - Skip-link: YOK, ancak GEREKLİ DEĞİL (gerekçe: `<body>` tek çocuğu `<main>`, atlanacak kalıcı header/nav/içerik yok — T-008'in skip-link-atlamıyor tuzağı burada geçerli değil çünkü atlanacak bir şey yok)
  - 3 sayfada `<html lang="tr">` ✓, tek `<h1>` ✓, sayfaya özgü anlamlı `<title>` ✓ (ölçüldü: DOM'dan okunarak)
  - TenantGreeting adası: `client:idle` (index.astro:28); SSR çıktısı JS'siz TAM anlamlı (`curl` ile doğrulandı — `<details>` dolu metinle render), gerçek tarayıcıda `data-hydrated` false→true geçişi ve `Enter` ile aç/kapa doğrulandı; ARIA eklenmemiş (native `<details>/<summary>` kullanılmış) — `grep aria-\|role=` → 0 eşleşme kod içinde
  - 320px genişlik: 3 sayfa, yatay kaydırma YOK (`scrollWidth === clientWidth`); 200% zoom simülasyonu (640px viewport): aynı sonuç
  - `prefers-reduced-motion`: N/A — yüzeyde animasyon/transition/autoplay YOK (`grep` → 0 eşleşme)
  - Hedef boyutu (2.5.8): disclosure tetikleyicisi `min-h-11 min-w-11` (44×44px); "Yeniden dene" bağlantısı ölçülen kutu 640×24px (flex-stretch nedeniyle genişlik tam, yükseklik tam 24px eşiğinde — sınırda ama karşılıyor)
  - İncelenen yüzey: 3 sayfa (index/404/503) + 1 layout + 1 React adası; Astro dev toolbar (yalnızca `astro dev`, prod build'de YOK) tab sırasına dev-only gürültü ekliyor — kapsam dışı, bulgu değil
