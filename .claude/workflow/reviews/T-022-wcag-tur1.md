# T-022 — GATE wcag, tur 1

Tarih: 2026-11-17 · Platform sürümü: v0.0.20.1 (hazırlanıyor) · Dal: feat/v0.0.21-surum-kayit-modeli

GATE: wcag
SONUÇ: PASS

## Kapsam (DAR — architect kararı, birebir uygulandı)
Yalnızca iki uygulamada eklenen yeni kullanıcıya dönük metin
(`MESSAGES.auth.twoFactor.setupResumedNotice`) ve onun render edildiği
`TwoFactorSetupWizard.tsx`'in "totp" adımı incelendi: aria-live/alan ilişkisi,
kontrast, odak. Tam tarama YAPILMADI (architect'in sınırı). `@axe-core/playwright`
**v0.0.20.3'e ait** — bu turda axe koşmadı, bu **beklenen** bir durumdur, bulgu
olarak yazılmaz.

İncelenen dosyalar:
- `apps/admin/src/messages/messages.ts:306-345`
- `apps/superadmin/src/messages/messages.ts:138-156`
- `apps/admin/src/features/two-factor/TwoFactorSetupWizard.tsx:179-267`
- `apps/superadmin/src/features/two-factor/TwoFactorSetupWizard.tsx:158-242`
- `apps/admin/src/features/two-factor/two-factor-setup-controller.ts` (davranış doğrulaması için)
- `apps/admin/src/features/two-factor/TwoFactorStatusCard.tsx` (odak zinciri bağlamı için)
- `packages/ui/src/theme.css` (kontrast token'ları — `packages/config/tailwind/theme.css` BAYAT/yer tutucu, gerçek doğruluk kaynağı bu dosya, ölçüldü)
- `packages/ui/src/components/Card.tsx`, `packages/ui/src/components/Input.tsx`
- `docs/ux/T-022-iki-faktorlu-kurulumun-surdurulmesi.md`

## `ux`'in `aria-live` GEREKMİYOR kararına karşı ölçülmüş değerlendirme — KATILIYORUM

`ux`'in üç gerekçesi kod okunarak doğrulandı:

1. **Tek render iddiası DOĞRULANDI.** `two-factor-setup-controller.ts:154-160`
   (`submitPassword`, `get-totp-uri` başarılı dalı) — `step: 'totp'` ve
   `backupCodes` (null ya da liste) **TEK bir `setState` çağrısında** birlikte
   yazılıyor. `TwoFactorSetupWizard.tsx`'te adım geçişi (`if (state.step ===
   'password')` → `if (state.step === 'totp')`) tamamen farklı bir JSX ağacı
   döndürüyor — yani "totp" adımına geçildiğinde başlık (`h2`), manuel anahtar,
   yönerge **ve** (varsa) `setupResumedNotice` **aynı commit'te** DOM'a giriyor.
   Metnin "sonradan, kullanıcı ekranı zaten okumaya başlamışken" DOM'a girdiği
   bir ikinci an **yok** — bu, asenkron bir durum güncellemesi değil, yeni
   adımın statik içeriğinin parçası.
2. **Odak zaten başlığa taşınıyor** (`TwoFactorSetupWizard.tsx:88-90`,
   `useEffect` `[state.step]` bağımlılığıyla `headingRef.current?.focus()`).
   Ekran okuyucu kullanıcısı adım değiştiğinde `h2`'ye düşer ve doğal doküman
   sırasıyla (başlık → manuel anahtar → yönerge → **bu satır** → kod alanı)
   ilerler. `aria-live` eklemek burada **aynı metni iki kez** duyurur —
   gerçek bir gürültü kaynağı olurdu, uydurma değil.
3. **Kategori doğru seçilmiş.** Metin ne hata (`role="alert"` kullanıcı
   hiçbir şey yanlış yapmadı) ne geçici onay (`role="status"`) — kalıcı,
   adıma bağlı açıklama metni, `manualKeyInstructions` ile birebir aynı
   sınıf. İkisi de `aria-live` taşımıyor; tutarlı.

**Sonuç: `ux`'in kararı doğru. `aria-live` gerekmiyor, eklenmemesi bir bulgu değil.**

## Dar kontrol listesi — sonuçlar

1. **Alan ilişkisi** — Metin bağımsız, kalıcı bir bilgilendirme paragrafı;
   belirli bir form alanını (kod girişini) **tanımlamıyor** — `manualKeyLabel`/
   `manualKeyInstructions` ile aynı kapsayıcı `<div>` içinde, aynı muameleyle
   (düz `<p>`, `aria-describedby` yok) render ediliyor. `aria-describedby`
   **gerekmiyor** — tutarlı, pre-existing desenle aynı sınıf.
2. **Odak** — `headingRef.current?.focus()` her `state.step` değişiminde
   çalışıyor (admin: `TwoFactorSetupWizard.tsx:88-90`; superadmin: aynı desen).
   Şifre gönderimi sonrası odak yeni adımın `h2` başlığına gidiyor, bilgi
   satırı görüş alanında (başlığın hemen altında, aynı kart/sayfa). Reload
   sonrası: admin'de kart `wizardOpen=false`'a döner, kullanıcı "Etkinleştir"e
   tekrar basar → yeni mount → `useEffect` ilk render'da da tetiklenir →
   odak yeni password adımı başlığına gider (odak **kaybolmuyor**, kullanıcı
   tarayıcının native reload'ından sonra beklenen şekilde sıfırdan başlıyor).
   Superadmin'de zorunlu kapı otomatik aynı rotaya döner, aynı mekanizma
   geçerli. Modal/dialog odak tuzağı bu değişiklikle **ilgisiz** — yeni metin
   bir dialog açmıyor.
3. **Kontrast** — `setupResumedNotice` render sınıfı `text-(length:--font-
   size-small) text-(--color-text-secondary)`, `manualKeyInstructions` ile
   **AYNI jeton**. Gerçek doğruluk kaynağı `packages/ui/src/theme.css:19`
   (`--color-text-secondary: #475569`) — `packages/config/tailwind/theme.css`
   dosya başında kendini "ŞU AN YER TUTUCU, hiçbir yerden içe alınmıyor" diye
   tanımlıyor, gerçek tüketilen dosya `packages/ui/src/theme.css`. Arka plan
   `--color-surface: #ffffff` (`Card.tsx:23`, admin'de kart içi; superadmin'de
   `body { background-color: var(--color-surface) }`, `styles.css:38`).
   **Hesaplanan kontrast oranı: #475569 / #ffffff ≈ 7.58:1** — WCAG AA normal
   metin eşiği (4.5:1) **rahatlıkla karşılanıyor**, büyük metin eşiğinin de
   (3:1) üstünde. `disabled` durumu bu metinle ilgisiz (statik bilgi metni,
   disabled hâli yok).
4. **Klavye** — Yeni metin bir buton/bağlantı/form alanı **taşımıyor**, `Tab`
   sırasına yeni bir durak eklemiyor (doğrulandı: düz `<p>`, `tabIndex` yok).
   `<details>`/`<summary>` (yedek bağlantı gösterimi) bu diff'te
   **değişmedi** — native HTML, klavyeyle zaten erişilebilir (Enter/Space),
   etiketli (`MESSAGES.auth.twoFactor.showUriToggle`). Sihirbazın diğer tüm
   etkileşimli öğeleri (şifre/kod `Input`, "Doğrula"/"Vazgeç" `Button`) bu
   turda **değişmedi** — önceki `wcag` turlarında (FIX turu 1 W-1, FIX turu 4
   M-W1) zaten düzeltilmiş durumda, bu task'ın konusu değil.
5. **Dil** — Metin `MESSAGES.auth.twoFactor.setupResumedNotice`'tan geliyor
   (admin: `messages.ts:320-321`, superadmin: `messages.ts:152-153`).
   `TwoFactorSetupWizard.tsx`'te (admin `:226`, superadmin `:201`) **kodda
   sabit yazılmış metin YOK** — `{MESSAGES.auth.twoFactor.setupResumedNotice}`
   ile referanslanıyor. CLAUDE.md §10/17 ihlali yok.
6. **İki uygulamada metin AYNI mı** — `diff` ile birebir karşılaştırıldı:
   her iki `messages.ts`'teki `setupResumedNotice` değeri **harf harf aynı**
   (`'Kurulum zaten başlatılmıştı — aynı anahtarla devam edin; yedek kodlar
   bu ekranda tekrar gösterilemez.'`). `docs/ux/T-022-*.md`'nin "iki uygulama,
   bir metin" şartı karşılanıyor.

## BULGULAR

BULGULAR: yok

## ÖLÇÜMLER

- axe taraması: **koşmadı** — `@axe-core/playwright` bu sürümde (v0.0.20.1)
  yok, kullanımı v0.0.20.3'te planlı. Bu, architect'in kararıyla **beklenen**
  durum, bulgu değil.
- İncelenen bileşen/dosya sayısı: 2 `messages.ts` + 2 `TwoFactorSetupWizard.tsx`
  + 1 controller (davranış doğrulaması) + 1 status card (odak bağlamı) + 2
  tema dosyası (kontrast kaynağı) = **8 dosya**.
- Hesaplanan en kötü kontrast oranı (bu diff kapsamında): **≈7.58:1**
  (`#475569` metin / `#ffffff` zemin) — WCAG AA 4.5:1 eşiğinin üstünde, bu
  turda tespit edilen **tek** kontrast çifti (yeni metin başka bir token
  kullanmıyor).
- `aria-live` kararı: `ux`'in gerekçesi kod okunarak **doğrulandı** (tek
  `setState` commit'i, odak-tabanlı duyuru, kalıcı-statik metin kategorisi).
- Playwright koşturulmadı (statik inceleme kontrol listesinin tamamını
  kapattı; tarayıcı açmaya gerek görülmedi — oran-sınırı bütçesi
  korundu, 0 sign-up harcandı).

## PASS/FAIL gerekçesi
Critical/high bulgu yok, medium bulgu yok (0/3 eşiği), low bulgu yok. **PASS.**
