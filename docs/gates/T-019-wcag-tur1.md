# GATE: wcag — T-019 (ROADMAP v0.1.0), Tur 1

**SONUÇ: PASS** · Bulgular: `critical` 0 · `high` 0 · **`medium` 1** · **`low` 3**
(taban kuralı: 1-2 `medium` = PASS + borç kaydı)

> ⚠ Bu rapor `wcag` ajanının çıktısından **Orkestratör tarafından diske işlendi** —
> `wcag` ajanının `Write` aracı yok (`pm`/`architect` ile aynı düzen). İçerik ajanın
> kendi ölçümleridir; Orkestratör **yorum eklemedi**, yalnızca biçimlendirdi.

---

## Yöntem notu — iki yapısal kısıt (dürüst kayıt)

- **Otomatik axe taraması YAPILMADI.** `@axe-core/playwright` repoda yok
  (`ROADMAP:3116` — _"v0.0.19'da resmîleşir"_); eklemek **CLAUDE.md §4.5 tetikleyici 3**'ü
  (yeni ana bağımlılık) ateşlerdi. ⇒ Bu tur **tamamen elle, kaynak okuma** üzerinden
  yürütüldü (JSX/ARIA/odak/klavye akışı/kontrast formülü elle).
  Bu bir **eksiklik değil, kayıtlı bir kısıt** — `pm` Task dosyasında _"AC yapılamayan tek
  kalem: K6'nın erişilebilirlik doğrulaması"_ diye önceden kaydetti.
- **`pnpm --filter @arkesoft/admin test:e2e` ÇALIŞTIRILMADI.** Sign-up IP oran sınırı
  sayacı `qa` gate'inin koşumları sonrası **limit üstünde** (`Q-2`); koşmak **garanti
  sahte kırmızı** üretirdi. `registration-flow.spec.ts` yalnızca **okundu**.
- **Kontrast:** `packages/ui/src/tokens.ts`'in `calculateContrastRatio`'su **elle**
  (WCAG 2.1 relative-luminance formülü) yeniden hesaplandı.

**İncelenen yüzey:** 7 bileşen/rota dosyası (`_auth.kayit.tsx`, `_app.index.tsx`,
`_app.magaza-olustur.tsx`, `_app.kurulum.$slug.tsx`, `StoreWizard.tsx`,
`SiteTypeFieldset.tsx`, `OnboardingChecklistCard.tsx`) + 5 controller/saf fonksiyon
(`sign-up-controller.ts`, `store-wizard-controller.ts`, `slug-outcome-message.ts`,
`checklist-step-label.ts`, `stored-tenant-reference.ts`) + `packages/ui`'den
`Input.tsx`, `Button.tsx`, `Skeleton.tsx`, `Card.tsx`, `tokens.ts`.

---

## WCAG 2.2 AA kontrol listesi

| Eksen                                               | Sonuç                   | Dosya:satır                                                                                              | Kanıt                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tam klavye operasyonu (2.1.1)                       | **PASS**                | `StoreWizard.tsx` (tüm adımlar), `_auth.kayit.tsx`                                                       | Tüm etkileşimler gerçek `<button>` / `<input type="radio">` / `Link`; **hiçbir `onClick`-only `<div>` yok**. P4/P5'in `<div>` sarmalayıcıları form değil ama butonlar native ⇒ Tab + Enter/Space erişilebilir.                                                                                                      |
| Klavye tuzağı                                       | **PASS**                | —                                                                                                        | Modal/Dialog bu akışta **hiç kullanılmıyor** (Card içi state değişimi) ⇒ tuzak yüzeyi **yapısal olarak yok**.                                                                                                                                                                                                       |
| Odak yönetimi — adım/rota geçişi (2.4.3)            | **PASS**                | `StoreWizard.tsx:85-87`, `_auth.kayit.tsx:76-78`, `_app.kurulum.$slug.tsx:25-28`, `_app.index.tsx:52-55` | Her adım/rota kendi `headingRef` + `tabIndex={-1}` + `focus()`ünü taşıyor. ⭐ **Rota tabanlı** geçişler dahil (`/magaza-olustur`→`/kurulum/$slug`, `/`→`/kurulum/$slug`) — **odak `<body>`'ye düşmüyor**, hedef rotanın kendi `useEffect`'i taze mount'ta koşuyor.                                                  |
| Odak görünürlüğü (2.4.7 / 2.4.11)                   | **PASS**                | `Input.tsx:44-49`, `Button.tsx:111-116`, `SiteTypeFieldset.tsx:53-56,72-75`                              | Tümü `FOCUS_RING_CLASS_NAMES` taşıyor (tek izinli halka; `focus-ring`/`surface` çifti **3:1 pinli**). Sticky/fixed örtüşen öğe bu ekranlarda **yok** (grep ile doğrulandı) ⇒ 2.4.11 ihlali yok.                                                                                                                     |
| Form etiket ↔ hata ilişkisi (1.3.1 / 3.3.1 / 4.1.2) | **PASS**                | `Input.tsx:26-43`, `SiteTypeFieldset.tsx:39,82-90`                                                       | `error` prop'u → `aria-invalid` + `aria-describedby`; ikisi de **yoksa render edilmiyor** (boş string değil). `fieldset`'in `aria-describedby`'ı hata id'sine bağlı. ⭐ `docs/ui/T-016:213`'ün bağlayıcı kuralına (_"alan hataları `Input.error`'a gider, ayrı `role="alert"` kutusu YOK"_) **uyuluyor**.           |
| Canlı bölgeler (4.1.3)                              | ⚠ **MEDIUM bulgu**      | `store-wizard-controller.ts:163-182`, `StoreWizard.tsx:191-209`                                          | Metin **aynıysa** re-announce olmuyor (doğrulandı — React aynı string'i DOM'a yazmaz), **ama** ≥400 ms aralıklı yazan kullanıcıda her harfte **çift anons** riski gerçek. Aşağıya bak.                                                                                                                              |
| Renk tek başına anlam taşımıyor (1.4.1)             | **PASS**                | `StoreWizard.tsx:203-206`, `slug-outcome-message.ts:16-22`                                               | **5+1 outcome'ın TÜMÜ** metin taşıyor; `✓` **`aria-hidden`**; renk salt **yanında**.                                                                                                                                                                                                                                |
| Liste semantiği (1.3.1)                             | **PASS**                | `OnboardingChecklistCard.tsx:107-133`, `checklist-step-label.ts:42-46`                                   | Native `<ul>`/`<li>`×5; her maddenin durumu **görünür metinle de** (`stepDoneLabel`/`stepTodoLabel`); ikon tek başına yok (rozet de metin).                                                                                                                                                                         |
| Başlık hiyerarşisi (tek `h1`)                       | **PASS**                | `_app.tsx:204-233`                                                                                       | Shell'in `Outlet`/hata dalı **karşılıklı dışlayıcı** ⇒ aynı anda iki `h1` yüzeyi yok. Her yeni rota/adım **tam olarak bir** `h1` render ediyor.                                                                                                                                                                     |
| Kontrast AA (1.4.3 / 1.4.11)                        | **PASS (hesaplandı)**   | `tokens.ts:33-34`, `StoreWizard.tsx:44-46`                                                               | ⭐ `success-600` metni **gerçek kullanım bağlamında** `--color-surface` (beyaz) üzerinde: elle hesap **≈5.01:1** — pinli `success-surface` çiftinin **4.79:1**'inden **DAHA GÜVENLİ**. Disabled buton kontrastı (~2.5:1) **bilinçli ve belgeli** istisna (WCAG 1.4.3/1.4.11 inert muafiyeti, `Button.tsx:100-110`). |
| Hedef boyutu 24×24 px (2.5.8)                       | ⚠ **LOW bulgu**         | `_auth.kayit.tsx:219-234`                                                                                | Standalone _"Yeniden gönder"_ butonu dolgu/yükseklik taşımıyor (~14-17 px). **Mevcut desenin tekrarı** (`TwoFactorChallengeForm.tsx:149-160`) ⇒ **yeni regresyon değil**.                                                                                                                                           |
| Sürükle-bırak alternatifi (2.5.7)                   | **N/A**                 | —                                                                                                        | Akışta sürükle-bırak yok.                                                                                                                                                                                                                                                                                           |
| Tekrarlayan bilgi istenmiyor (3.3.7)                | **PASS**                | —                                                                                                        | `storeName` → `slug` önerisi `normalizeTenantSlug` ile **otomatik** doluyor; kullanıcıdan aynı bilgi **iki kez istenmiyor**.                                                                                                                                                                                        |
| Yükleniyor/boş/hata (4.1.3 açısı)                   | ⚠ **LOW bulgu**         | `OnboardingChecklistCard.tsx:79-87`                                                                      | `Skeleton`×5 **`aria-hidden`** (bileşenin kendi sözleşmesi gereği) ama **çağıran taraf** `aria-live`/`aria-busy` eklemiyor ⇒ **sessiz yükleniyor**. Mevcut desenin aynı açığı (`TwoFactorStatusCard.tsx:165-171`).                                                                                                  |
| Hareket tercihi (`prefers-reduced-motion`)          | **PASS**                | `Skeleton.tsx:28-33`, `Button.tsx:42-56`                                                                 | İkisi de `motion-reduce:animate-none` taşıyor; T-019 **yeni otomatik animasyon eklemedi** (grep: yeni dosyalarda `animate-`/`transition-` yok).                                                                                                                                                                     |
| 320 px / %200 zoom                                  | **PASS (statik okuma)** | `StoreWizard.tsx:216`                                                                                    | İki buton yan yana (`flex gap-2`) kısa Türkçe metinlerle (_"Geri"_/_"İleri"_) ⇒ 320 px taşma riski düşük; `md:max-w-2xl` kapsayıcılar **tek sütun** tabanlı. ⚠ Gerçek render **DOĞRULANAMADI**.                                                                                                                     |
| Anlamlı buton/bağlantı metni, `alt`                 | **PASS**                | `messages.ts:583-613`                                                                                    | Hata metinleri **ne yapılacağını** söylüyor (_"Başka bir adres dene"_, _"yalnızca küçük harf, rakam ve tire…"_). Görsel yok (`<img>` kullanılmıyor); yalnızca dekoratif `✓` (**`aria-hidden`**).                                                                                                                    |

---

## Bulgular

### ⚠ `W-1` (`medium`) — slug canlı bölgesi, yavaş yazan AT kullanıcısında ÇİFT ANONS

**Dosya:** `store-wizard-controller.ts:163-182` + `StoreWizard.tsx:191-209` +
`slug-outcome-message.ts:39-41`
**Ölçüt:** 4.1.3 Status Messages (aşırı/çakışan duyuru)

**Kullanıcı senaryosu (somut):** NVDA/JAWS kullanan bir kullanıcı mağaza adresini **harf
harf** (sentezlenmiş sesi dinleyip duraklayarak) yazıyor. Her karakter yazımı **400 ms'den
uzun** sürerse: (1) hemen _"Kontrol ediliyor…"_ anonsu, (2) ~400 ms sonra sonucun
(ör. _"Bu adres kullanılabilir."_) anonsu — ve bu **çift anons HER HARFTE tekrarlanır**.
Kullanıcı yazmaya devam etmek isterken sürekli iki ayrı cümle dinlemek zorunda kalır;
**alan pratikte kullanılamaz hâle gelir**.

⭐ **Kapsamı dürüstçe daraltılmış:** hızlı/kesintisiz yazan kullanıcıda bu **olmuyor** —
React aynı string'i DOM'a yeniden yazmadığı için `aria-live` **tetiklenmiyor** (ajan
doğruladı). Risk **özellikle yavaş / karakter-karakter yazan** AT kullanıcılarında.

**Kök neden:** `setSlug()` **her tuş vuruşunda** `slugCheckStatus:'checking'`'i **senkron**
yazıyor; debounce **yalnızca gerçek ağ çağrısını** geciktiriyor — canlı bölgeye yazımı
geciktirmiyor.

**Öneri:** debounce penceresi içindeyken ara `'checking'` durumunu **canlı bölgeye
YAZMAMAK** — `resolveSlugLiveStatusMessage('checking')`'i görsel-only bir göstergeyle
(ör. _"…"_) değiştirmek veya `aria-live="off"` bir öğeye taşıyıp **SONUÇ** metnini tek
canlı bölgede bırakmak. → `frontend`

### `W-2` (`low`) — hata dalında iki cümle SR akışında çelişiyor

**Dosya:** `OnboardingChecklistCard.tsx:75-104` · **Ölçüt:** 1.3.1 / genel netlik

`/kurulum/{slug}` sorgusu hata verdiğinde SR kullanıcısı art arda şunu dinler:
_"Mağazan oluşturuldu ama henüz ziyaretçilere açık değil…"_ (düz metin, normal akış) ve
hemen ardından `role="alert"` ile kesilen _"Kurulum durumun şu anda yüklenemedi."_
Sıralı dinlendiğinde ikinci cümle birinciyle **çelişiyormuş gibi** algılanıyor
(_"madem durumu bilmiyorsun, ilk cümleyi nereden biliyorsun?"_). Görsel kullanıcı bunu
stil/konumla ayırt edebilir; **ses akışında bu ayrım kaybolur**.

⚠⚠ **Ajan tasarımı KIRMAMAYI açıkça önerdi:** banner'ın koşulsuz görünürlüğü
**dokümante edilmiş** (`docs/ui/…:233`) ve T-019'un yetki alanı dışında.
**Öneri:** `loadError` metnini _"Kurulum durumun şu anda yüklenemedi"_ yerine
_**"Diğer kurulum adımların şu anda yüklenemedi"**_ gibi, ilk cümleyle **çelişmeyen** bir
ifadeye çevirmek. → mevcut `medium` teknik borç kalemine **not**; **ayrı tur gerektirmiyor**.

### `W-3` (`low`) — _"Yeniden gönder"_ hedef boyutu 24×24 px altında

**Dosya:** `_auth.kayit.tsx:219-234` · **Ölçüt:** 2.5.8 Target Size (Minimum)

Motor bozukluğu olan veya titreyen elle dokunmatik ekran kullanan kullanıcı
_"E-posta gelmedi mi? Yeniden gönder"_ bağlantı-görünümlü butonuna dokunmaya çalışıyor;
buton dolgu/yükseklik taşımıyor (~14 px font, ekstra `h-*`/`py-*` yok) ⇒ tıklanabilir alan
**~24 px'in altında**, isabet oranı düşük.

⚠ **Yeni regresyon DEĞİL** — `TwoFactorChallengeForm.tsx:149-160`'ın **birebir aynı
deseni** (orada da çözülmemiş).
**Öneri:** `min-h-11` (44 px) + `inline-flex items-center` ⇒ **görsel boyutu
DEĞİŞTİRMEDEN** tıklanabilir kutuyu büyütmek (`Checkbox`/radyo'daki _"görsel 20 px,
hedef 44 px"_ deseninin aynısı). → **platform geneli** borç, bu tur düzeltme açmıyor.

### `W-4` (`low`) — `Skeleton` yükleniyor durumu duyurulmuyor

**Dosya:** `OnboardingChecklistCard.tsx:79-87` · **Ölçüt:** 4.1.3 Status Messages

Ekran okuyucu kullanıcısı `/kurulum/{slug}`'a gelir; `h1` + `pendingBanner` okunur, ama
ardından gelen `Skeleton`×5 (`aria-hidden="true"`) hakkında _"yükleniyor"_ bilgisi **HİÇ
duyurulmaz** — liste **sessizce** 5 maddeyle değişir. Kullanıcı sayfanın bitip bitmediğini
anlayamaz.

⚠ **Yeni regresyon DEĞİL** — ⭐ `Skeleton.tsx:10-13`'ün **kendi yorumu** çağıran tarafın
`aria-live`/`aria-busy` eklemesini **ÖNGÖRÜYOR** ama bunu yapan **HİÇBİR çağıran yok**
(`TwoFactorStatusCard.tsx:165-171` de aynı açığı taşıyor — **T-016'dan beri**).
**Öneri:** `CardContent`'in yükleniyor dalına `role="status" aria-live="polite"`
sarmalayıcısı (görünür metin gerekmez, `sr-only` _"Yükleniyor…"_ yeterli) ⇒ **iki dosyayı
birden** kapatır. → **platform geneli** borç.

---

## ⭐ UI dokümanının iddiaları ↔ kod

| UI doc iddiası                                                                                  | Kod                                                                                                                                                                   | Hüküm                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ③ _"debounce sayesinde yalnızca SONUÇ değiştiğinde duyurulur (her tuş vuruşunda değil)"_        | `setSlug()` her tuş vuruşunda `slugCheckStatus:'checking'`'i **senkron** yazıyor; debounce yalnızca **ağ çağrısını** geciktiriyor                                     | ⚠ **KISMİ DOĞRU.** İddia **hızlı/kesintisiz** yazan kullanıcı için doğru (React aynı string'i yeniden yazmıyor ⇒ re-announce yok — **doğrulandı**). **Yavaş/aralıklı** yazan kullanıcı için **YANLIŞ** (`W-1`) — doc bu **kenar durumunu öngörmemiş**.    |
| ⑦ _"TÜM renk eşlemeleri `tokens.ts`'in `CONTRAST_PAIRS`'inde ZATEN pinli"_                      | `success-600`'ün **gerçek** kullanım yüzeyi (`StoreWizard.tsx`'te `--color-surface` zemini) `CONTRAST_PAIRS`'teki pinli çiftten (`success-surface` zemini) **FARKLI** | **Doğrulandı ama eksik referans.** Gerçek yüzey test edilen çiftten **daha güvenli** (**≈5.01:1 > 4.79:1**) ⇒ sonuç **olumlu**; doc'un _"zemin"_ referansı `tokens.test.ts`'in gerçekte test ettiği zeminle **birebir eşleşmiyor**. **Bulgu değil, not.** |
| ④/⑤/⑥/⑧ (`aria-invalid`/`describedby`, renk-tek-başına-değil, liste semantiği, 4 durum tanımlı) | Kod **birebir** eşleşiyor                                                                                                                                             | **DOĞRU.**                                                                                                                                                                                                                                                |

---

## Temiz çıkan eksenler (bir sonraki tur tekrar bakmasın)

- `Input`/`SiteTypeFieldset` **etiket ↔ hata programatik ilişkisi** — tam ve doğru.
- **Tüm adım/rota geçişlerinde odak yönetimi** (`headingRef` + `tabIndex={-1}` + `focus()`)
  — hem state tabanlı (P1↔P2, P3→P4→P5) hem **rota tabanlı** geçişlerde doğrulandı;
  odak `<body>`'ye **düşmüyor**.
- **Tek `h1` disiplini** — shell'in hata dalı ile rota içeriği karşılıklı dışlayıcı
  (`_app.tsx:204-233`); yeni rotaların hiçbiri ikinci bir `h1`/`CardTitle` eklemiyor.
- **Renk tek başına anlam taşımıyor** (1.4.1) — 5+1 slug outcome'ın **tamamı** metinli.
- **Klavye tuzağı yüzeyi yok** (modal/Dialog bu akışta hiç kullanılmıyor).
- **Disabled buton kontrastı** — bilinçli, belgeli, önceki turda kapatılmış (1.4.11 muafiyeti).
- **Hata metinleri** (`registration.slug.*`) kullanıcıya **ne yapacağını** söylüyor —
  _"geçersiz"_ tarzı boş mesaj **yok**.

## DOĞRULANAMADI (ajan dürüstçe listeledi)

- Gerçek **320 px viewport / %200 zoom** render davranışı — tarayıcı/axe yok; statik CSS
  okumasıyla sınırlı değerlendirme yapıldı.
- **Ekran okuyucu (NVDA/VoiceOver) ile canlı dinleme** — yalnızca DOM/React davranışı
  mantıksal olarak izlendi; **gerçek TTS çıktısı dinlenmedi**.
- **Odak halkasının `h1` üzerinde gerçekte görünür olup olmadığı** — tarayıcı varsayılan
  outline'ı silinmemiş (grep ile doğrulandı) ama **piksel bazlı görsel teyit** yapılamadı.
