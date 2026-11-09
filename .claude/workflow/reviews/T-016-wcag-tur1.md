# T-016 · `wcag` gate · tur 1 — PASS (2 medium + 3 low)

> ⚠ Bu dosyayı **Orkestratör** yazdı: `wcag` ajanının araç setinde `Write` yok, raporu
> handoff mesajı olarak verdi. İçerik ajanın raporundan birebir özetlendi.

## SONUÇ: PASS

`critical`/`high` **yok**. 2 `medium` + 3 `low` → AGENT_BASELINE §4: ≤2 medium = PASS (borç).

## BULGULAR

### M-W1 · medium · sunucu kaynaklı alan hataları alanla İLİŞKİLENDİRİLMEMİŞ
`TwoFactorSetupWizard.tsx:122-129` (şifre adımı) · `:183-190` (TOTP adımı) ·
`ConfirmDialog.tsx:61-65` (step-up; iki tüketici `TwoFactorStatusCard.tsx:222-265`).

Sunucu hataları (401 yanlış şifre, yanlış TOTP, step-up mutasyon hatası) `Input`'un
`error` prop'una (`aria-invalid`/`aria-describedby`) **bağlanmıyor**; alandan **kopuk**
genel bir `role="alert"` kutusunda gösteriliyor. Ekran okuyucu mesajı **duyuyor** ama
alanla **programatik ilişki yok** ve klavye odağı hatalı alana **geri dönmüyor**.

⚠ **Projenin KENDİ belgelediği sözleşmeyi ihlal ediyor:** `docs/ui/T-016` birebir
*"Field-level hata = `Input`'un `error` prop'u, başka bir şey DEĞİL… ayrı bir
`role=alert` kutusu EKLENMEZ, bu ÇİFT duyuru üretir"* diyor; `docs/ux` de *"odak alana
geri döner"* şartını koyuyor. **Kod ikisini de ihlal ediyor.**
⭐ Aynı akıştaki `TwoFactorChallengeForm.tsx:90-99` bunu **DOĞRU** yapıyor
(`form.setFocus('code')`) → tutarsızlık yalnızca sihirbaz + step-up diyaloglarında.
**WCAG 3.3.1** (Error Identification) · **2.4.3** · **Sorumlu:** `frontend`
**Düzeltme:** sunucu hatasını `Input`'un `error` prop'una geçir, üstteki kutuyu kaldır,
`setFocus(...)` çağır. (~10 satır, 2 dosya)

### M-W2 · medium · mod geçişinde ODAK KAYBI
`_auth.sign-in.tsx:115-117` (`useEffect(…, [step.kind])`) + `:260-264` (`onSwitchMode`).

TOTP ↔ yedek kod geçişi `step.kind`'ı **değiştirmiyor** (yalnızca `step.mode`) →
başlık-odak `useEffect`'i **tekrar tetiklenmiyor**. `TwoFactorChallengeForm`
`key={step.mode}` ile **tam remount** oluyor (farklı etiket/alan: 6 hane ↔ 8 karakter)
ama odak **hiçbir yere taşınmıyor**; tetikleyici link DOM'dan kaldırıldığı için odak
muhtemelen `<body>`'ye düşüyor. Görev **tamamlanabilir** (Tab ile erişilebilir) ama
ekran okuyucu/klavye kullanıcısı **bağlam değişikliğinden habersiz** kalıyor.
⚠ Bu özelliğin **kendi belgelediği** `headingRef + tabIndex={-1} + focus()` disiplini
burada **atlanmış**. **WCAG 4.1.3** · **Sorumlu:** `frontend`
**Düzeltme:** `useEffect` bağımlılığına `step.mode` ekle veya `onSwitchMode`'da
`headingRef.focus()` çağır. (**1 satır**)

### Üç `low`
- `TwoFactorSetupWizard.tsx:203` — `<summary>` `FOCUS_RING_CLASS_NAMES` taşımıyor
  (`docs/ui` açıkça istiyor). Tarayıcı varsayılan halkası **görünür** (`outline-none`
  yok → **2.4.7 ihlal değil**), yalnızca tasarım tutarlılığı.
- `packages/ui/src/components/Checkbox.tsx:37-41` — ⚠ **ölü CSS ölçüldü**:
  `border-(--color-border)` ve `rounded-(--radius-control)` native checkbox'ta
  (`appearance:none` **yok**) **sıfır** görsel etkiye sahip; gerçek kenarlık tarayıcı
  native temasından (**#767676**). Kontrast yine **PASS**. → `ui`/`frontend`
- `BackupCodesList.tsx:68-74` — indirme butonu **geri bildirim vermiyor**; kardeş
  `CopyButton` `role="status"` ile veriyor → asimetri. UX belgesi indirme için metin
  **istemiyor** → ihlal değil, öneri.

## İKİ DEVREDİLEN KALEM — İKİSİ DE KAPANDI

**① `Checkbox` `accent-color` kontrastı — `DOĞRULANAMADI` DEĞİL, ÖLÇÜLDÜ.**
Chromium `getComputedStyle` (`accent-color: rgb(37,99,235)`) + **4x ölçek piksel
örneklemesi** (antialiasing'den kaçınmak için orta-stroke):
```
Checkbox kenarlık (native #767676) / surface : 4.542:1  (≥3   PASS)
İşaretli dolgu (brand-500 #2563EB) / surface : 5.169:1  (≥3   PASS)
Checkmark (#FFFFFF) / dolgu                  : 5.169:1  (≥4.5 PASS)
```
Kalan risk `DOĞRULANAMADI`: Safari/Firefox/forced-colors'ta pikseller farklı olabilir.

**② Token kaynağı çatallanması — ölçüm GEÇERLİLİĞİ ETKİLENMEDİ.**
Gerçek **derlenmiş** `apps/admin/dist/assets/index-DG8i2HVC.css` doğrudan okundu;
hex'ler `packages/ui/src/theme.css`/`tokens.ts` ile **birebir**.
`packages/config/tailwind/theme.css` **hiçbir yerden import edilmiyor** (grep: 0) ve
dosyanın **kendi başlığı** *"ŞU AN YER TUTUCU… hiçbir yerden içe alınmıyor"* diyor.
→ Tüm kontrast ölçümleri **doğru kaynaktan**. Borç `docs`/`architect`'te kalıyor.

## 3.3.8 ACCESSIBLE AUTHENTICATION — İHLAL YOK
`onPaste`/`preventDefault`/`onCopy`/`user-select:none` engeli **arandı**: dört dosyada
**sıfır** eşleşme. `maxLength={6}`/`pattern` yapıştırmayı **engellemez** (tarayıcı fazlayı
keser, event reddedilmez). Manuel anahtar + yedek kodlar kopyalanabilir. Bilişsel işlev
testi gerektiren adım **yok**. ⚠ Bu, 2FA ekranlarının düşebileceği asıl AA tuzağıydı.

## DİĞER ÖLÇÜMLER
- **4.1.3 geri sayım gürültüsü YOK** (kesin): `shouldAnnounceRemainingSeconds` yalnızca
  **60** ve **0** saniyede `true`; saniyelik metin `aria-hidden="true"`, duyuru
  `role="status" aria-live="polite" sr-only` ve **yalnızca eşiklerde**.
- **2.4.11 Focus Not Obscured:** 360×(300-640)px, **dört** scroll pozisyonunda ölçüldü —
  sticky çubuk Checkbox/"Bitti"yi **hiçbir pozisyonda örtmüyor** (boşluk 16px).
- **2.5.8 Target Size:** `Button` `h-11 min-w-11` (44px) PASS · ConfirmDialog × `size-8`
  (32px) PASS · Checkbox kutusu 20×20 **ama** birleşik `<label>` hedefi **261×24px**
  (`getBoundingClientRect`) → *"Equivalent"* istisnası karşılanıyor.
- **2.5.7 Dragging:** bu özellikte sürükle-bırak **yok** (uygulanamaz).
- Klavye: `onKeyDown`/`preventDefault` ile tab/enter engeli **yok** (grep).

## DOĞRULANAMADI (dürüst sınırlar)
- **axe-core koşturulamadı:** `@axe-core/playwright` **yok**, hiçbir spec'e enjekte
  edilmemiş (`playwright.config.ts` yorumu: *"v0.0.19'da RESMÎLEŞİR"*).
  `axe-core@4.14.0` yalnızca **transitif** bağımlılık olarak mevcut.
- `apps/admin/e2e`'de 2FA kapsamı **sıfır** (grep: 0) — `qa`'nın bulgusu **doğrulandı**;
  ajanın `Write`'ı olmadığı için spec **yazılamadı**.
- `ConfirmDialog`'un Radix focus trap/Esc/odak-dönüşü davranışı **canlı test edilmedi**
  (gerçek oturum + 2FA kurulumu gerekirdi, oran-limit bütçesi riske edilmedi); kod
  incelemesiyle **ezilmediği** doğrulandı, Radix'in kendi kapsamına + T-008 `UserMenu`
  emsaline güvenildi.
- 320px tam genişlik ve **%200 zoom** reflow canlı test edilmedi (statik olarak
  `w-full`/`flex-col`, sabit genişlik/`overflow` kısıtı yok → yapısal risk düşük).
- `turbo run test:e2e` **görev olarak tanımlı değil** (ROADMAP'in bildiği borç);
  `pnpm --filter … test:e2e` üzerinden `--grep`/`--list` **iletilmedi** → 16 test koştu,
  2 başarısız **ikisi de T-008'in önceden var olan redirect testleri**, 2FA/WCAG kapsamı
  **dışı**, oran-limit bütçesi için tekrar koşturulmadı.

## HİJYEN
`git status --porcelain` → **130** (başta) / **130** (sonda), değişmedi. Repo dosyası
oluşturulmadı/değiştirilmedi. Ölçüm harness'leri scratchpad'de, iş bitince **silindi**.
Kendi başlattığı sunucular **temizlendi** (`lsof` ile doğrulandı); port 3000'deki
**kullanıcının yabancı süreci (PID 11734) DOKUNULMADI**.
⚠ Ajan, mesajına enjekte edilen ilgisiz MCP talimatlarını (Apify/Figma/Gamma/WordPress/
Firecrawl) **yok saydığını** da bildirdi — doğru davranış.
