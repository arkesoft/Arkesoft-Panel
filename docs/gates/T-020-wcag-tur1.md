# GATE: wcag — T-020 (ROADMAP v0.0.19), Tur 1

**SONUÇ: PASS** · Bulgular: `critical` 0 · `high` 0 · `medium` 0 · **`low` 2**

> ⚠ Bu rapor `wcag` ajanının çıktısından **Orkestratör tarafından diske işlendi** —
> ajanın `Write` aracı yok. İçerik ajanın kendi ölçümleridir.

---

## Çerçeve — bu sürümün yüzeyi dar, ve bu kayıtlı bir durum

⭐ **Hiçbir `apps/*/src/**` dosyası değişmedi** (`architect` ölçtü; versiyon etkisi bu
yüzden **changeset muaf**) ⇒ yeni kullanıcıya dönük ekran/bileşen/akış **yok**.
`pm` bu nedenle **`FRONTEND VAR MI: YOK`** dedi, `ux`/`ui` **koşmadı**.
⚠ `@axe-core/playwright` **kullanıcı kararıyla kapsam dışı** (→ v0.0.20) ⇒
**`wcag` ÜÇÜNCÜ kez elle koştu** (T-016, T-019, T-020). Kayıtlı borç: `ROADMAP:3156`.

**Gerçek yüzey:** üç yeni spec + **ilk kez** bir mobil viewport projesi.

---

## Soru 1 — Yeni mobil viewport erişilebilirlik açısından ne ortaya çıkarıyor?

**Hedef boyutu (2.5.8):** `admin-mobile` projesi **yalnızca** `/sign-in`'in `credentials`
adımını render ediyor (spec formu **bilerek göndermiyor** — `auth-budget.ts`'in
`{signIn:0, signUp:0}` pini). O ekrandaki **üç** interaktif öğe (e-posta, şifre,
"Giriş yap") `h-11`/`min-w-11` ⇒ **44 px**, 2.5.8 **rahatça karşılanıyor**.

⚠⚠ **T-019'un `W-3` borcu bu projede GÖRÜNMÜYOR — ve sebebi mekanik:**
`sign-in-layout.spec.ts` formu **göndermediği** için 2FA adımına **hiç geçmiyor**;
`home-layout.spec.ts` `/kayit`'e **hiç gitmiyor**.
⇒ **Mobil viewport bu borcu YENİ GÖRÜNÜR KILMADI ve yeni bir örneğini de üretmedi.**
(Bu yüzden `W-3` burada **tekrar yazılmadı** — kayıtlı borç.)

**Yansıma/taşma (1.4.10):** Her iki spec `bodyScrollWidth <= viewportSize.width`
kontrolü yapıyor — ⚠⚠ **ama viewport `Pixel 7`'nin 412 px'i**, WCAG'ın referans
genişliği olan **320 CSS px DEĞİL**. → `low` bulgu (aşağıda).

**Odak görünürlüğü:** `FOCUS_RING_CLASS_NAMES` (`focus-visible:ring-2` + `outline-none`
**eşdeğerle birlikte**) viewport'tan bağımsız bir CSS sınıfı ⇒ mobil projede **korunuyor**.
`outline:none` hiçbir yerde **eşdeğersiz** kaldırılmamış.

## Soru 2 — Yeni spec'ler erişilebilirlik regresyonu kodluyor mu? **HAYIR**

⭐ **Emsal doğru:** ikisi de `getByRole`/`getByLabel` kullanıyor
(`getByRole('heading', {level:1, name:…})`, `getByLabel('E-posta adresi')`),
**`getByText`'e düşmüyorlar**. `lang` niteliği, tek `h1`/tek `main` sayımı ve
`page.title()` boş değil kontrolleri — hepsi **yapısal/semantik**; görsel bir özelliği
semantik sanan bir varsayım **yok**.
⚠ `home-layout.spec.ts`'in `main h1` CSS seçicisi `getByRole` değil ama **sayım amaçlı**
(tekillik), erişilebilir ad iddiası **taşımıyor** ⇒ kırılgan değil.

**Tek zayıflık:** reflow assert'i yalnızca **gövde** düzeyinde taşmayı yakalıyor; iç içe
bir kapsayıcının `overflow-x: scroll` ile kendi içinde taşması bu kontrolden **geçer**.
⭐ Bugün bu şablonlarda öyle bir kapsayıcı **yok** (ölçüldü: `home.astro` yalnızca
`PageHeading`/`BodyText`; `/sign-in` tek sütun form) ⇒ risk **düşük**.

## Soru 3 — Görsel regresyon ↔ `prefers-reduced-motion`

**Gerekçeli görüş: bulgu DEĞİL, görsel regresyonun DOĞAL SINIRI — ama kayda değer.**

`toHaveScreenshot({animations:'disabled'})` **Playwright'ın KENDİ** dondurma
mekanizmasıdır: ekran görüntüsünden önce **tüm** CSS animasyon/transition'ları ve Web
Animations API'yi, tarayıcının **`prefers-reduced-motion` emülasyonundan TAMAMEN
BAĞIMSIZ** olarak durdurur.
⇒ ⚠ İkisi **aynı anda** devrede; `motion-reduce:` sınıfı **bozulsa bile** görsel test
bunu **GİZLER**.

⭐ **Bugün maruziyet SIFIR (ölçüldü):** `home.astro` yalnızca
`PageSection`/`PageHeading`/`BodyText` render ediyor — `Skeleton`/`Button` spinner'ı
**hiç yok**; `not-found` testi **statik** 404 sayfası. ⇒ Dört referans PNG'nin
hiçbirinde `motion-reduce:` **test edilen bir yüzey değil**.
⚠ İleride görsel testlere `Skeleton`/`Button` içeren bir şablon eklenirse kör nokta
**gerçek** hâle gelir. → `docs` kaydı (düzeltme gerekmiyor).

---

## Bulgular

| SEV     | dosya:satır                                                                                                           | WCAG                       | Kullanıcı senaryosu                                                                                                                                                                                                                       | Öneri                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **low** | `apps/admin/e2e/responsive/sign-in-layout.spec.ts:38-43` · `apps/storefront/e2e/responsive/home-layout.spec.ts:36-41` | **1.4.10 Reflow**          | Eski/küçük telefon (**320-375 px**) kullanan ya da **büyüteç yazılımıyla** gezinen düşük görmeli kullanıcı: 320-412 px aralığında oluşacak bir taşma regresyonundan bu testle **korunmuyor** — regresyon **mekanik olarak yakalanmıyor**. | Ayrı bir `page.setViewportSize({width:320,…})` adımı **veya** mobil projeye ikinci bir **dar-viewport** varyantı. → `devops` |
| **low** | `scripts/playwright/base.ts:116-126` ↔ `packages/ui/src/components/Skeleton.tsx:31`, `Button.tsx:54`                  | 2.3.3 (AAA, bilgilendirme) | Vestibüler bozukluğu olan, işletim sisteminde _"hareketi azalt"_ açık kullanıcı: `motion-reduce:` sınıfı bozulsa görsel test **yakalamaz**. ⭐ Bugün gerçekleşme yüzeyi **SIFIR** (ölçüldü).                                              | **Düzeltme gerekmiyor**; `docs/testing.md`'ye _"görsel regresyonun doğal sınırı"_ notu. → `docs` (kayıt)                     |

---

## Temiz çıkan eksenler

- İki `responsive` spec **gerçekten** auth tüketmiyor (koddan doğrulandı — form **hiç
  submit edilmiyor**; storefront'ta auth ucu **yok**).
- `lang="tr"` her iki spec'te **doğrulanıyor** (3.1.1).
- **Tek `h1` / tek `main`** doğrulaması — yapısal bütünlük (2.4.6 destekleyici).
- Mobildeki **üç** interaktif öğe **≥44 px** ⇒ 2.5.8 karşılanıyor.
- `home.astro` şablonunda **hiç interaktif öğe yok** ⇒ hedef boyutu yüzeyi bu şablonda yok.
- `BaseLayout.astro`'da **sabit/sticky header yok** ⇒ 2.4.11 riski bu yüzeyde yok.
- **2.5.7** (sürükle-bırak) ve **3.3.7** (tekrarlayan veri girişi) ⇒ **N/A**.
- `outline:none` hiçbir yerde **eşdeğersiz** kaldırılmamış.

## `DOĞRULANAMADI`

- **axe taraması koşmadı** — kasıtlı kapsam dışı (kullanıcı kararı; `ROADMAP:3156`,
  vade **v0.0.20**).
- **Hiçbir Playwright komutu çalıştırılmadı** — `EMAIL_IP_LIMIT` bütçesi `qa`'ya
  ayrılmıştı; değerlendirme **tamamen statik okuma**.
- Gerçek **ekran okuyucu** (VoiceOver/NVDA) ile manuel klavye testi yapılmadı.
- Gerçek `getComputedStyle` **kontrast** ölçümü alınmadı — ⚠ üretim kodu **değişmedi**;
  kontrast token'ları T-016/T-019'da **zaten ölçülmüş/kayıtlı**.

**Ölçümler:** incelenen dosya **15** (3 yeni spec + taban + 2 config + 9 destek) ·
yeni mobil viewport **`Pixel 7` = 412×839 CSS px** (⚠ **320 değil**) ·
`critical/high/medium` **0/0/0** · `low` **2**.
