# T-016 · `wcag` gate · tur 4 (DAR) — PASS

> Orkestratör diske yazdı (ajanın `Write`'ı yok). İçerik handoff'tan birebir.

## SONUÇ: PASS — M-W1 ve M-W2 **kapandı**, yeni bulgu yok

## M-W1 — KAPANDI, üç katmanlı kanıt

**Statik:** `TwoFactorSetupWizard.tsx:111-176` (şifre) ve `:179-262` (TOTP) — kopuk
`role="alert"` kutuları **gerçekten kaldırılmış**; hata `resolveFieldErrorMessage(...)` →
`Input.error`; `onSubmit` sonrası `setFocus('password')`/`setFocus('code')`.
`ConfirmDialog.tsx`: `errorMessage` prop'u **ve** `<p role="alert">` **tamamen** yok.
`TwoFactorStatusCard.tsx:300-354`: `mutationError` → `Input.error` + `passwordInputRef`
+ `useEffect([mutationError])`.

**⚠ ORKESTRATÖR SAYIMINI DÜZELTTİ.** Ben **iki** dosyada 4 eşleşme ölçmüştüm; `wcag`
**dört** dosyada **8** eşleşme ölçtü: **6 yorum** (`ConfirmDialog:16`,
`SetupWizard:15,125,190`, `StatusCard:11,38`) + **1 gerçek JSX** (`StatusCard:168` —
kart seviyesi `session.me` **fetch** hatası, `statusQuery.isError`; M-W1'in konusu olan
**alan** hatası **değil**, tur 1'de de işaretlenmemişti, **meşru**) + ChallengeForm'da
**sıfır** (zaten doğru emsaldi). *"Orkestratör'ün 4 sayısı yalnızca ilk iki dosyaya
bakıyordu, doğru"* — eksik tarama, yanlış sonuç değil.

**Testleri BİZZAT koşturdu** (*"frontend'in iddiasına güvenmedim"*): admin **79/79**.

**⭐ DOM BAĞLAMA ZİNCİRİNİ CANLI ÖLÇTÜ.** Önce `jsdom`'un repoda **hiç kurulu
olmadığını** doğruladı (`find node_modules/.pnpm -iname "jsdom@*"` → **boş**) → proje
içi hiçbir araçla ölçülemez. Çözüm: `vite`'ın `build()` API'siyle **gerçek
`packages/ui/src/components/Input.tsx` kaynağını** (elle kopyalanmış markup **değil**,
dosyanın kendisi) bir probe bileşenine import edip IIFE bundle'a derledi, Chromium'da
yükledi ve prop'ları **`TwoFactorManagePasswordDialog`'daki gibi** verdi:
```json
{ "ariaInvalid": "true",
  "ariaDescribedby": "_r_0_-error",
  "errorParagraphText": "Şifreniz doğrulanamadı. Tekrar deneyin.",
  "isInputFocused": true,
  "activeElementTag": "INPUT" }
```
→ `aria-invalid`/`aria-describedby` **gerçekten** oluşuyor, işaret ettiği `<p>` **gerçekten**
hata metnini taşıyor, `.focus()` **gerçekten** `document.activeElement`'i taşıyor.
**`frontend`'in `DOĞRULANAMADI` işaretlediği zincir böylece kapandı.**

**Dürüst kalan sınır:** probe `TwoFactorManagePasswordDialog`'un **doğrudan**
`ref.current.focus()` yolunu ölçtü; sihirbazın `passwordForm.setFocus(...)`'u (react-hook-form
sarmalayıcısı, aynı DOM ref'i üzerinden) **ayrıca** canlı test **edilmedi** — RHF'nin
belgelenmiş, yaygın API'si olduğu ve **proje-özgü risk taşımadığı** için kütüphanenin
kendi kapsamına dayanıldı.

## M-W2 — KAPANDI

`_auth.sign-in.tsx:131` + `:133-135`: bağımlılık `step.kind` **değil** `focusKey`.
`sign-in-focus.ts:25-30`: `twoFactorMethod` adımında `${kind}:${mode}` → mod değişince
anahtar **değişiyor**. Vacuity testi eski davranışı taklit edip totp/backup için **aynı**
anahtar ürettiğini, yenisinin **farklı** ürettiğini kanıtlıyor (79/79'un parçası).
DOM tarafı **ölçülmedi**, gerekçeli: `useEffect` bağımlılık karşılaştırması React'in
**temel sözleşmesi**, proje-özgü risk yok — tur 1'de de aynı güven seviyesi kullanıldı.

## BELGELER ARASI ÇELİŞKİ — a11y kararı (BAĞLAYICI)

**`frontend`'in çözümü DOĞRU, `docs/ui:154` GÜNCELLENMELİ** (yanlış olan taraf o).
Gerekçe: her iki gerçek `ConfirmDialog` tüketicisinde diyaloğun **tam olarak bir**
odaklanabilir alanı var (şifre `Input`'u) → hata **o alana** ait. Ayrı bir `role="alert"`
kutusu, `:213`'ün **kendi uyardığı** çift duyuruyu üretirdi (`aria-describedby` zaten
metni taşırken üstte **aynı** metni tekrar eden bağımsız assertive live region).
*"`:154`'ün tarifi, `:213`'ün genel kuralı yazılmadan ÖNCE düşünülmüş, tutarsız bir ayrıntı."*

**⚠ ANCAK İLERİYE DÖNÜK BİR BOŞLUK BULDU (yeni WCAG bulgusu DEĞİL):**
`frontend`, `ConfirmDialog`'un **genel bileşen sözleşmesinden** `errorMessage`/
`role="alert"` affordance'ını **tamamen sildi** — yalnızca mevcut iki tüketici için
"kullanmadı" değil, **API'den kaldırdı**. Ama `docs/ui §237` v0.1.0 için `ConfirmDialog`'un
**alansız** bir politika-kapatma onayında yeniden kullanılacağını **öngörüyor**; o
senaryoda çocuk `Input` **yok** → mutasyon hatası bağlanacak **hiçbir alan** bulamaz.
**Önerilen `:154` metni:** *"Alanlı diyaloglarda hata → o alanın `error` prop'u
(field-level). **Alansız** diyaloglarda (ör. v0.1.0 politika onayı) `ConfirmDialog`
opsiyonel bir genel `errorMessage`/`role='alert'` affordance'ını **geri kazanmalı** —
iki mod birbirini dışlamaz."*

## DAR TUR DİSİPLİNİ
Üç `low` **yeniden taranmadı/ölçülmedi** (talimata uyuldu), SEV değişmedi, borçta.
axe-core / geniş kontrast / sticky-overlap / 3.3.8 **tekrarlanmadı**.

## HİJYEN
`git status --porcelain` → **132** (tur başında ve sonunda **birebir aynı**).
Ölçüm/derleme işleri scratchpad'de, iş bitince `rm -rf`.
⚠ Port **3000**: kullanıcının PID 11734 — **dokunulmadı**. Port **3100**: bir süreç buldu,
**öldürmeden** `ps` ile kökünü izledi (`turbo run dev --filter=@arkesoft/api`, 12:09'dan
beri **1s23dk**, `--watch` modunda) → *"benim oturumumdan ÖNCE başlamış… kullanıcının/
ortamın kendi kalıcı dev süreci; dokunmadım."* **Doğru davranış.**
