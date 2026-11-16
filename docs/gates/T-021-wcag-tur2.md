# GATE: wcag — T-021 (ROADMAP v0.0.20), Tur 2 (DAR kapsam)

**SONUÇ: PASS** · `critical` 0 · `high` 0 · **`medium` 0** (⭐ tur 1'in `medium`'u
**ÇÖZÜLDÜ**) · `low` **2** (değişmedi, borç) + **1 yeni `low` not** (⚠ kod değil,
**test defekti** → `qa`)

> ⚠ Bu rapor `wcag` ajanının çıktısından **Orkestratör tarafından diske işlendi** —
> ajanın `Write` aracı yok. İçerik ajanın kendi ölçümleridir.

⭐ **DAR kapsam korundu:** yalnızca `Sidebar.tsx`'in iki değişikliği + üç soru.
Tur 1'de **temiz** çıkan **14 eksen tekrar taranmadı**. ⚠ Hiçbir komut çalıştırılmadı
(`test:e2e` yasaktı, uyuldu).

---

## Soru 1 — `Escape` yolu gerçekten kapandı mı? **EVET**

`Sidebar.tsx:94-107` — `document` seviyesinde `keydown`; `Escape`'te
`closeMobileNavAndRestoreFocus(setIsMobileNavOpen, () => mobileNavToggleButtonRef.current?.focus())`
(`:72-78`).

⭐ **Sıra kritik ve doğru:** `setIsOpen(false)` **önce**, `.focus()` **hemen sonra** —
⚠ ikisi de **aynı senkron event handler içinde**. React henüz commit yapmadığı için nav
**hâlâ DOM'da**; odak düğmeye taşındığı anda nav _"terk edilmiş"_ olur ⇒ `display:none`
olduğunda **düşecek bir odak kalmaz**.
⇒ ⭐ `qa`'nın `sidebar-focus-return.qa.spec.ts:63-83` testi bunu **canlı tarayıcıda**
`toBeFocused()` ile **PASS** ölçtü. **Tur 1'in `medium`'u (2.4.3) bu yol için KAPANDI.**

## Soru 2 — ⚠⚠ Link yolu kararı WCAG açısından doğru mu? **EVET — karar desteklendi**

> ⭐ **`wcag` Orkestratör'ün anlatısını DEVRALMADI — bağımsız kod kanıtı buldu.**

**`apps/superadmin/src/routes/_app.denetim-kaydi.tsx:16-22`** — hedef rota **kendi**
`headingRef`'ini `tabIndex={-1}` ile taşıyor ve `useEffect`'te mount'ta
`headingRef.current?.focus()` çağırıyor.
⭐⭐ **Ve bu, T-016'dan beri bu kod tabanında TUTARLI UYGULANAN SPA odak yönetimi
desenidir** — ⚠ ayrı bir icat **değil**. (⭐ Bu kanıtı Orkestratör sunmamıştı.)

**WCAG gerekçesi:** 2.4.3 (Focus Order) _"mantıklı sıra"_ ister, ⚠ _"aynı öğeye dönüş"_
**istemez**. Kullanıcı bir linke tıkladığında **niyeti kapatmak değil, GİTMEKTİR**;
hedef **yeni sayfanın içeriğidir**.
⚠ Odağı `☰` düğmesine geri vermek, ekran okuyucuya _"navigasyonu aç/kapat düğmesi,
kapalı"_ duyurusu yaptırır — ⭐ **yanlış bağlam**, ve kullanıcıyı **yeni sayfanın
başlığından uzaklaştırır**.

⇒ Doğru sonuç **zaten** `headingRef.focus()` ile elde ediliyor; link `onClick`'ine
ikinci bir `.focus()` eklemek **yalnızca yarış durumu yaratan ÖLÜ KOD** olurdu
(⭐ `qa` tur 1 bunu **ölçmüştü**: odak **her zaman** `headingRef.focus()` tarafından
eziliyor).
⚠ Ölü kod bırakmak WCAG ihlali **üretmez** ama gelecekte _"neden iki `.focus()` var"_
karışıklığına yol açardı ⇒ **kaldırmak doğru temizlik**.

### ⚠⚠ TEK AÇIK UÇ — `qa`'nın TEST DEFEKTİ (wcag bulgusu DEĞİL)

`apps/superadmin/e2e/sidebar-focus-return.qa.spec.ts:85-107`, özellikle **`:104`**
(`await expect(toggleButton).toBeFocused()`) ⚠ **hâlâ link yolunda odağın toggle'a
dönmesini assert ediyor** ⇒ **artık YANLIŞ BEKLENTİ**.

⭐ **Yerine geçmesi gereken assertion (`wcag` yazdı):**

```ts
await expect(page.getByRole('heading', { level: 1, name: 'Denetim kaydı' })).toBeFocused()
```

⚠ Bu bir **WCAG kod bulgusu değil** — `qa`'nın kendi spec'inin **FIX 2'yi henüz
yansıtmaması**. → **`qa` tur 2**.

## Soru 3 — İki `low` hâlâ geçerli mi? **İKİSİ DE, AYNEN** (FIX 2 yan etkisi yok)

1. **`W-3` (2.5.8 hedef boyutu)** — `TwoFactorChallengeForm.tsx:149-160` hâlâ
   `text-(length:--font-size-small)` + `text-(--color-brand-500)`; ⚠ `min-h`/dolgu
   **yok**, **<24px**. ⭐ **Üç konumdaki borç aynen duruyor**; _"merkezi çözülmeli"_
   kararı geçerli ⇒ ⭐ bu turda **dokunulmaması DOĞRU** (kapsam dışı).
2. **İç içe `role="status"`** — `packages/ui/src/components/DataTable.tsx:40-46` +
   `apps/superadmin/src/components/EmptyState.tsx:18-19`, çağıran
   `TenantListView.tsx:64,96-97`. ⭐ `packages/ui` **AC-2 nedeniyle dokunulmamış** — doğru.

### ⭐ `docs` (S11) İÇİN NET DÜZELTME CÜMLESİ

⚠ İkisi de **hâlâ yanlış**, teyit edildi: `docs/ux/T-021-…:362-365` ve
`docs/ui/T-021-…:264`.

> Gerçek `W-3`, **"2FA kod alanının etiket↔hata ilişkisi"** değildir. Gerçek `W-3`
> (`ROADMAP.md:3244`, `T-019.md:1442`) **2.5.8 Hedef Boyutu**'dur: _"Yedek kod
> kullanın"_/_"Kimlik doğrulayıcı kullanın"_ bağlantısının dokunma/tıklama alanı
> **24×24px altında** kalıyor (yalnızca küçük `font-size`, dolgu/`min-height` yok).
> `docs/ux` madde 4 ve `docs/ui` tablosundaki satır 4 bu tanımla **değiştirilmeli**;
> _"etiket↔hata ilişkisi"_ ekseni (`aria-invalid`/`aria-describedby`) **ayrı ve zaten
> temiz** bir eksendir, `W-3` ile **karıştırılmamalı**.

---

## BULGULAR

| SEV                     | Yer                                                       | Açıklama                                                                                                                                                             | Sorumlu                       |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `low` **(YENİ)**        | `apps/superadmin/e2e/sidebar-focus-return.qa.spec.ts:104` | ⚠ Link yolu testi **yanlış beklentiyi** assert ediyor (toggle odağı bekliyor; doğrusu `headingRef`). ⭐ **Erişilebilirlik kod bulgusu DEĞİL**, test-kod tutarsızlığı | **`qa`**                      |
| `low` (borç, değişmedi) | `TwoFactorChallengeForm.tsx:149-160`                      | 2.5.8, **üç konumda** tekrarlanan borç                                                                                                                               | `frontend` (merkezi) + `docs` |
| `low` (borç, değişmedi) | `DataTable.tsx:40-46` + `EmptyState.tsx:18-19`            | İç içe iki `role="status"` (4.1.3); ⚠ `packages/ui` bu sürümde **değişmiyor** (AC-2)                                                                                 | `ui` (borç)                   |

**⭐ ÇÖZÜLEN (tur 1'in `medium`'u):** `Sidebar.tsx:94-107` — `Escape` yolunda odak toggle
düğmesine **doğru dönüyor**, ⭐ `qa` **canlı ölçümüyle** doğrulandı. Link yolunda odak
geri **yüklenmemesi KASITLI ve DOĞRU**.

## Ölçümler

İncelenen dosya **5** (+2 borç teyidi) · axe/e2e **koşturulmadı** (yasaklıydı) ·
⭐ **yeni kod taraması yok — dar kapsam korundu** ·
`critical/high/medium/low` = **0/0/0/2** (+1 test-kod notu, ⚠ wcag bulgusu **değil**).
