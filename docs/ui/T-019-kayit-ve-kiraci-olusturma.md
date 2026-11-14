# T-019 — UI: Kayıt sihirbazı ve onboarding kontrol listesi

## Kaynak UX

`docs/ux/T-019-kayit-ve-kiraci-olusturma.md`

## Kapsam notu — ux'in "Dashboard ↔ kiracı eşleşmesi" VARSAYIM'ı bu belgede ÇÖZÜLDÜ, farklı bir mekanizmayla

`ux` bu belgeyi yazarken seçicinin `tenantId` mi `slug` mi olacağını bilmiyordu ve kendi
VARSAYIM'ını (`localStorage` + `arkesoft.lastTenantId`, `onboardingChecklist(tenantId)`)
mimari onayı beklemeye bırakmıştı (ux dosyası, "⚠ VARSAYIM — Dashboard ↔ kiracı
eşleşmesi"). Orkestratör'ün bu göreve ilettiği bağlam artık netleştirdi (ADR-0021 §3.1):
seçici **`slug`**, `onboardingChecklist` girdisi **`{ slug }`**, `createTenant` çıktısı
**`{ slug, status }`** (`tenantId` YOK). Bu belge ux'in VARSAYIM'ını **farklı ve daha
basit bir mekanizmayla** kapatıyor — `tenantId` değil `slug` saklanıyor, ve bookmarkable
bir rota (`/kurulum/{slug}`) ux'in "aynı rota (`/`)" basitleştirmesinin **yerine**
geçiyor. Aşağıdaki "Rota tablosu" ve P6/P7 bu kararı somutlaştırıyor.

**Bu, ux dosyasının metnini değiştirmez (DOKUNMA kısıtı) — `docs`/`architect` ux
dosyasının ilgili pasajını (Ekran 7-8 tek rota kararı, VARSAYIM bölümü) bu belgeyle
UYUMLU hâle getirmeli.** Aşağıdaki "RİSKLER" bunu açıkça işaretliyor.

## packages/ui envanteri (önce okundu — T-016/T-017'den beri değişen BarRel)

- `packages/ui/src/index.ts` — barrel, 9 isim dışa açık: `Button` (`primary|secondary|destructive`, tek boyut `md`), `Input`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Toast` (tüketicisiz), `DataTable` (tüketicisiz), `Skeleton`, `Checkbox`, `CopyButton`. **Radix hiç yok.**
- `packages/ui/src/components/{Button,Input,Card,Skeleton,Checkbox}.tsx` — tam okundu (bkz. aşağıdaki tablolarda referans). `CopyButton`/`Toast`/`DataTable` bu görevde **kullanılmıyor** (kopyalanacak sır/kod yok, global toast kuyruğu yok, tablo veri kümesi yok).
- `packages/ui/src/tokens.ts` + `packages/ui/src/theme.css` — doğruluk kaynağı, tam okundu; `--font-mono` T-016'da eklenmişti, bu görev onu **tüketmiyor** (monospace içerik yok).
- `apps/admin/src/components/{ErrorState,LoadingState,EmptyState,ConfirmDialog}.tsx` — tam okundu. `EmptyState` bugün **eylem düğmesi taşımıyor** (yalnızca `heading`+`body`) — bu görev bunu genişletiyor (bkz. "Mevcut bileşen genişletmeleri").
- `apps/admin/src/features/two-factor/{two-factor-setup-controller.ts,field-error-message.ts,TwoFactorSetupWizard.tsx}` — **emsal, birebir devralınan desen**: saf `.ts` controller sınıfı (React'ten bağımsız, discriminated union state, `vitest.config.ts`'in `environment:'node'`'unda test edilebilir) + ince `.tsx` görünüm.
- `apps/admin/src/routes/{_auth.sign-in,_app.index,_app,_app.hesap.guvenlik}.tsx` — tam okundu. Rota adlandırma, odak yönetimi (`headingRef`+`tabIndex={-1}`+`focus()`), `treatAsSignedOut` deseni, `AppShell` kabuğu, guard (`beforeLoad`+`redirect()`) mekanizmaları buradan alındı.
- `apps/admin/bundle-budget.config.ts` + `apps/admin/scripts/__tests__/check-bundle-budget.test.ts:125-137` — tam okundu (bkz. KARAR 1).
- `apps/admin/vitest.config.ts:15,21` — tam okundu (bkz. KARAR 2).

**Bu envanterden çıkan bağlayıcı sonuç:** bu görev **hiçbir yeni `packages/ui` bileşeni**
ve **hiçbir yeni ana bağımlılık** (ikon kütüphanesi dahil) gerektirmiyor — ihtiyaç duyulan
her ilkel (`Button`, `Input`, `Card`, `Skeleton`, `Checkbox`'ın native-input deseni) zaten
orada. `packages/ui`'ye **dokunulmuyor**.

---

## KARAR 1 — Bundle bütçesi (po'nun R-PO4'ü, `S10` birebir uygulayacak)

**Dört yeni/etkilenen rota, dördü için de açık karar:**

| Rota dosyası (YENİ)                  | URL                | Karar                                                         | Config değişikliği (TAM YOL)                                                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/_auth.kayit.tsx`         | `/kayit`           | **İlk-boya girişi (ÜÇÜNCÜ)**                                  | `bundle-budget.config.ts`'in `FIRST_PAINT_ENTRY_POINTS` dizisine (satır 37-46) ÜÇÜNCÜ eleman: `{ label: 'kimliksiz ikinci ilk ekran (/kayit)', routeModuleSrcPrefixes: ['src/routes/_auth.kayit.tsx'] }`                                                                            |
| `src/routes/_app.magaza-olustur.tsx` | `/magaza-olustur`  | **Bilinçli tembel**                                           | `DELIBERATELY_LAZY_ROUTE_SRCS`'e (satır 78-80) eleman: `'src/routes/_app.magaza-olustur.tsx?tsr-split=component'`                                                                                                                                                                   |
| `src/routes/_app.kurulum.$slug.tsx`  | `/kurulum/{slug}`  | **Bilinçli tembel**                                           | `DELIBERATELY_LAZY_ROUTE_SRCS`'e eleman: `'src/routes/_app.kurulum.$slug.tsx?tsr-split=component'`                                                                                                                                                                                  |
| `src/routes/_app.index.tsx`          | `/` (MEVCUT dosya) | **Zaten ilk-boya girişinin parçası** — config değişikliği YOK | Dosya zaten `FIRST_PAINT_ENTRY_POINTS[0].routeModuleSrcPrefixes` önekinde (`src/routes/_app.index.tsx`). Bu görev dosyanın İÇİNİ büyütüyor (redirect kararı + boş/manuel-adres görünümü) — **S10 `/`'in ölçülmüş 175 KiB'ini YENİDEN ölçmeli**, bu satır yalnızca bunu işaretliyor. |

**Gerekçe (/kayit neden ilk-boya, /magaza-olustur ve /kurulum/$slug neden tembel):**

1. `/kayit`, `/sign-in`'in **birebir kardeşi** — kimliksiz bir kullanıcının (pazarlama
   bağlantısı, e-posta davet, doğrudan yazılan URL) **ilk isteği** olabilecek bir URL.
   Mekanizma bunu `/` ve `/sign-in` için zaten böyle sınıflandırıyor — `/kayit` aynı
   sınıfa (kimliksiz, muhtemel ilk-istek URL'si) girer.
2. `/magaza-olustur` ve `/kurulum/{slug}` **bookmarklanabilir/paylaşılabilir olmaları**
   onları otomatik olarak ilk-boya yapmıyor — bugünkü **`_app.hesap.guvenlik.tsx`**
   emsali BUNU ZATEN kanıtlıyor: o rota da bookmarklanabilir (`/hesap/guvenlik`) ama
   bilinçli tembel sınıfında, çünkü `_app` korumalı rotaların İKİ kanonik "ilk yükleme"
   deneyimi yalnızca `/` (girişli ana sayfa) ve `/sign-in` (girişsiz ana sayfa) —
   derin bağlantılı bir URL'ye doğrudan gelindiğinde kabuk+ana paket önce yüklenir,
   SONRA o rotanın kendi parçası (chunk) normal client-side lazy-import ile gelir; bu
   EK bir şelale (waterfall) kabul edilebilir bir maliyettir ve "ilk içerikli rota"
   bütçesine SAYILMAZ (architect'in K7/Karar 1'inin BİREBİR aynı ayrımı).
3. **KARAR GEREKTİRİR, OTOMATİK DEĞİL** — brief'in talimatı bu, aşağıdaki iki mekanik
   sonucu da açıkça not ediyorum (RİSKLER'de tekrar işaretli):
   - `DELIBERATELY_LAZY_ROUTE_SRCS.length` **1 → 3** büyüyor —
     `apps/admin/scripts/__tests__/check-bundle-budget.test.ts:136`'daki pinli
     kardinalite testi (`expect(...).toBe(1)`) **S10 tarafından `.toBe(3)`'e
     güncellenmek ZORUNDA**, aynı "0→1" geçişinde yapılan görünür incelemeyle AYNI
     disiplinde (satır 125-134'teki yorumun deseni tekrarlanır).
   - `/kurulum/$slug` bu repodaki **İLK dinamik parametre segmentli rota** (`$slug`) —
     TanStack Router'ın dosya adı kuralı (`$paramName`) burada ilk kez kullanılıyor,
     mekanik olarak çalışması GEREKİR (standart özellik) ama S10 ilk uygulayan olarak
     bunu doğrulamalı.
4. `MAX_FIRST_ROUTE_JS_GZIP_BYTES` (250 KiB, AC16) **bu belge tarafından
   DEĞİŞTİRİLMİYOR** — üçüncü giriş noktası eklenmesi mevcut "eşik İKİ/ÜÇ girişin
   MAKSİMUMUNA bağlanır" formülünü bozmuyor (her giriş kendi ölçümüyle aynı tavana
   karşı sınanıyor). **Ama** `/kayit`'in gerçek ölçümü (form + react-hook-form + Zod
   şeması + Card/Input/Button) `/sign-in`'in 155 KiB'ine yakın çıkabilir — eğer S10'un
   ölçümü üç girişten birini 250 KiB'in ÜZERİNE çıkarırsa, bu bir **AC16 eşik yükseltme
   kararı** ister (architect gerekçesi + ROADMAP notu, CLAUDE.md §2) — bu belge o kararı
   VERMİYOR, yalnızca riskini S10'a devrediyor.

## KARAR 2 — Controller/View ayrımı (po'nun R-PO13'ü)

`vitest.config.ts:21`'in `include: ['src/**/*.test.ts', ...]` deseni `.tsx`'i test
KAPSAMI DIŞINDA bırakıyor — bu yüzden adım makinesi, debounce ve `outcome`→mesaj
eşlemesi **mutlaka** aşağıdaki `.ts` dosyalarına çıkar; `.tsx` dosyaları yalnızca
render eder, karar vermez (`TwoFactorSetupController`/`field-error-message.ts` deseni
**adıyla** devralınıyor):

| Dosya (YENİ, `.ts`)                                               | Taşıdığı mantık                                                                                                                                                                                                                                                                                                                                                                                                  | Emsal                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/admin/src/features/registration/sign-up-controller.ts`      | `SignUpController` sınıfı — iki durum (`'form'`, `'emailPending'`), `submitSignUp`/`resendVerificationEmail` metotları, gönderiliyor/hata bayrakları. Hesap-zaten-var/429/ağ hatası ayrımı BURADA (mapError callback'e devredilir, `two-factor-setup-controller.ts`'in `mapError` imzasıyla AYNI desen).                                                                                                         | `TwoFactorSetupController`                                        |
| `apps/admin/src/features/registration/store-wizard-controller.ts` | `StoreWizardController` sınıfı — DÖRT durum (`storeName`/`slug`/`siteType`/`submitting`), `setStoreName`/`goToSlugStep`/`setSlug`(debounce'lu)/`selectSiteType`/`submit`/`goBack*` metotları. **Debounce burada** (`setTimeout`/`clearTimeout`, vitest'in sahte zamanlayıcılarıyla test edilir — DOM gerekmez). Slug yarış-kaybı (submit anında `taken`) hatasını `slug` adımına GERİ yönlendirme kararı burada. | `TwoFactorSetupController` (en yakın, 3 adımlı)                   |
| `apps/admin/src/features/registration/slug-outcome-message.ts`    | SAF fonksiyonlar: `resolveSlugLiveStatusMessage(outcome \| 'checking')` (canlı bölge metni) ve `resolveSlugFieldErrorMessage(outcome)` (submit-anı alan hatası) — ux'in 5+1 `outcome` tablosunun `satisfies Record<...>` ile kapalı-dünya eşlemesi.                                                                                                                                                              | `field-error-message.ts`                                          |
| `apps/admin/src/features/registration/checklist-step-label.ts`    | SAF fonksiyon: 5 `step` anahtarı → Türkçe madde metni + durum (`'done'\|'todo'`) → görünür durum etiketi. Kapalı-dünya `satisfies Record<...>` (ux'in 5 satırlık tablosu).                                                                                                                                                                                                                                       | `device-label.ts` (T-017 emsali)                                  |
| `apps/admin/src/features/registration/stored-tenant-reference.ts` | SAF, DOM'dan bağımsız: `createTenantSlugReferenceStore(storage: Pick<Storage,'getItem'\|'setItem'\|'removeItem'>)` → `{ read, write, clear }` — `localStorage`'ı DOĞRUDAN KULLANMAZ, test edilebilirlik için enjekte edilir (node ortamında gerçek `localStorage` YOK). Ayrıca `resolveHomeRedirectTarget(storedSlug: string \| null)` — `/`'in `beforeLoad`'ının saf karar fonksiyonu.                          | yeni desen, ama AYNI "saf karar + enjekte edilen yan etki" ilkesi |

**`.tsx` dosyaları (YENİ, render-only, mantık taşımaz):**

| Dosya                                                              | Sorumluluğu                                                                                                                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/routes/_auth.kayit.tsx`                            | İnce route — `SignUpController`'ı `useState`'in lazy başlangıcıyla sarar (ref DEĞİL, `TwoFactorSetupWizard`'ın deseni), render eder.                                 |
| `apps/admin/src/routes/_app.magaza-olustur.tsx`                    | İnce route — `<StoreWizard />`'ı render eder.                                                                                                                        |
| `apps/admin/src/features/registration/StoreWizard.tsx`             | `StoreWizardController`'ı sarar, 3 adımın görünümünü (Card içinde adım değişimi) render eder — `TwoFactorSetupWizard.tsx` deseninin birebir aynısı.                  |
| `apps/admin/src/features/registration/SiteTypeFieldset.tsx`        | Sunum-only: `<fieldset>`/`<legend>`/2×native radio — `apps/admin`'e özgü, `packages/ui`'ye GİTMEZ (tek kullanım yeri).                                               |
| `apps/admin/src/routes/_app.kurulum.$slug.tsx`                     | İnce route — `useParams()`'tan `slug`'ı okur, `<OnboardingChecklistCard slug={slug} />`'ı render eder, kendi `h1`'ini taşır.                                         |
| `apps/admin/src/features/registration/OnboardingChecklistCard.tsx` | Veri çeken konteyner (`onboardingChecklist({slug})` `useQuery`'si) — `TwoFactorStatusCard`/`ActiveSessionsCard` deseniyle AYNI (yükleniyor/hata/normal/404 dalları). |
| `apps/admin/src/routes/_app.index.tsx` (MEVCUT, GENİŞLETİLİR)      | `beforeLoad`'da `resolveHomeRedirectTarget` çağrılır (saklı slug varsa `redirect()`); yoksa "mağaza yok + manuel adres" görünümü render edilir.                      |

---

## Rota tablosu — KESİN dosya adı + URL + kimlik + kabuk

| #   | Ekran (ux karşılığı)                                                              | Dosya                               | URL               | Kimlik | Kabuk (`AppShell`)                              |
| --- | --------------------------------------------------------------------------------- | ----------------------------------- | ----------------- | ------ | ----------------------------------------------- |
| P1  | Hesap oluştur (ux Ekran 1)                                                        | `_auth.kayit.tsx`                   | `/kayit`          | Yok    | Hayır (sign-in.tsx'in kabuksuz `<main>` deseni) |
| P2  | E-postanı doğrula (ux Ekran 2, aynı dosya)                                        | `_auth.kayit.tsx` (2. durum)        | `/kayit`          | Yok    | Hayır                                           |
| P3  | Mağaza adı (ux Ekran 4)                                                           | `_app.magaza-olustur.tsx`           | `/magaza-olustur` | Var    | **Evet** (bkz. not)                             |
| P4  | Mağaza adresi/slug (ux Ekran 5)                                                   | `_app.magaza-olustur.tsx` (2. adım) | `/magaza-olustur` | Var    | Evet                                            |
| P5  | Site tipi (ux Ekran 6)                                                            | `_app.magaza-olustur.tsx` (3. adım) | `/magaza-olustur` | Var    | Evet                                            |
| P6  | Panel anasayfası — mağaza yok / manuel adres (ux Ekran 7, **YENİDEN TASARLANDI**) | `_app.index.tsx` (MEVCUT)           | `/`               | Var    | Evet                                            |
| P7  | Kurulum kontrol listesi (ux Ekran 8, **TAŞINDI**)                                 | `_app.kurulum.$slug.tsx` (YENİ)     | `/kurulum/{slug}` | Var    | Evet                                            |

**Not (kabuk kararı, P3-P5):** `/magaza-olustur` bugünkü `AppShell`'in İÇİNDE render
edilir (sidebar+topbar görünür) — ux bunu bir "fokus/kiosk" ekranı olarak İSTEMEDİ,
bu belge de o yönde YENİ bir kabuk varyantı İCAT ETMİYOR (kapsam büyümesi). Dikkat
dağıtıcı bulunursa bu, `architect`'in ayrı bir pathless layout rotası açmasını
gerektiren AYRI bir karardır, bu görevin kapsamında DEĞİL.

### Rota adlandırma tutarlılığı — KARAR ve gerekçe

Repo'daki mevcut rotalar karışık: `_auth.sign-in.tsx` (İngilizce) vs
`_app.hesap.guvenlik.tsx` (Türkçe). **KARAR: yeni rotalar Türkçe URL segmentleri
taşır** (`kayit`, `magaza-olustur`, `kurulum`) — `_app.hesap.guvenlik.tsx` emsaliyle
AYNI yönde, `_auth.sign-in.tsx`'in YÖNÜNDE DEĞİL. Gerekçe:

1. TanStack Router'ın dosya-tabanlı yönlendirmesi dosya adının nokta-segmentlerini
   URL path'iyle **BİREBİR** eşler (`createFileRoute('/_app/hesap/guvenlik')`
   ÖLÇÜLDÜ) — URL kullanıcıya dönük bir metindir (CLAUDE.md §4: "kullanıcıya dönük
   metin Türkçe") ve `ux`'in kendisi zaten Türkçe URL'ler önermiş (`/kayit`,
   `/magaza-olustur`), ADR-0021 §3.1'in `/kurulum/{slug}` önerisi de Türkçe. Dosya
   adını İngilizce'ye çevirmek (`sign-up.tsx`, `create-store.tsx`) URL'i de İngilizce
   yapardı — bu, ux'in kararıyla ÇELİŞİRDİ.
2. `_auth.sign-in.tsx` bu kuralın **istisnası**, v0.0.7'den kalma bir ÖNCEKİ karar —
   bu belge onu YENİDEN ADLANDIRMIYOR (kapsam dışı, DOKUNMA listesi `apps/**`'i
   kapsıyor, ben kod yazmıyorum) ama tutarsızlığı burada AÇIKÇA işaretliyor (bkz.
   RİSKLER) — `docs`/`architect` ileride bir "rota adlandırma kuralı" ADR'si
   yazmak isteyebilir.
3. **Kod içi tanımlayıcılar (değişken/fonksiyon/sınıf adları — `StoreWizardController`,
   `resolveSlugLiveStatusMessage` vb.) hâlâ İngilizce** (CLAUDE.md §4) — bu karar
   SADECE dosya adının URL-segment kısmına uygulanıyor, kodun kendisine değil.

---

## Bileşen eşlemesi

### P1 — Hesap oluştur (`/kayit`, `form` durumu)

| UX öğesi                               | Bileşen                                                | Varyant/Boyut                                            | Kaynak                     | Not                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sayfa düzeni                           | `<main>` + `<div className="w-full max-w-sm">`         | `_auth.sign-in.tsx:211-212`'in BİREBİR kopyası           | mevcut desen               | AppShell YOK (kimliksiz).                                                                                                                                                                             |
| Başlık (durum geçişinde metin değişir) | native `<h1>` + `headingRef`/`tabIndex={-1}`/`focus()` | —                                                        | mevcut desen (sign-in.tsx) | `MESSAGES.auth.signUp.title` → `MESSAGES.auth.signUp.emailPendingTitle` geçişi, `focusKey` tekniği (`sign-in-focus.ts` BENZERİ, bu görev için AYRI bir `computeSignUpFocusKey` — iki durumlu, basit). |
| Kart kapsayıcı                         | `Card`+`CardContent`                                   | mevcut                                                   | `packages/ui` (MEVCUT)     |                                                                                                                                                                                                       |
| E-posta/şifre/şifre-tekrar alanları    | `Input`                                                | `type="email"`/`type="password"`×2, `autoComplete` uygun | `packages/ui` (MEVCUT)     | Şekil hatası (zorunlu/biçim/eşleşme) `Input.error`'a gider — `resolveEmailFieldErrorMessage` deseninin kardeşi, YENİ bir çözümleyici (`.tsx` İÇİNDE, basit).                                          |
| Genel form hatası (zaten var/429/ağ)   | sign-in.tsx'teki inline `role="alert"` `<div>`         | —                                                        | **YENİ KOMPONENT DEĞİL**   | "Bu e-posta ile zaten bir hesap var" cümlesi + içinde "Giriş yap" **`Link`** (router primitive, navigasyon — alan hatası DEĞİL, hesap-seviyesi çatışma).                                              |
| "Hesap oluştur" düğmesi                | `Button`                                               | `variant="primary"`, `isLoading`                         | `packages/ui` (MEVCUT)     |                                                                                                                                                                                                       |
| "Zaten hesabın var mı? Giriş yap"      | `@tanstack/react-router` `Link`                        | metin bağlantısı, `FOCUS_RING_CLASS_NAMES`               | mevcut router primitive    | `Sidebar.tsx`'teki Link deseniyle AYNI kurulum.                                                                                                                                                       |

### P2 — E-postanı doğrula (`/kayit`, `emailPending` durumu, aynı dosya)

| UX öğesi                | Bileşen                                                            | Varyant/Boyut           | Kaynak                                                               | Not                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------ | ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Başlık + gövde metni    | `<h1>` (odak taşınır) + `<p>`                                      | —                       | mevcut desen                                                         | `{eposta}` enterpolasyonu `MESSAGES.auth.signUp.emailPendingBody`'de (ux'in zaten verdiği şablon).                                                                                                                                                                                                            |
| "Giriş yap" eylemi      | `Link` (navigasyon, `/sign-in`'e)                                  | —                       | router primitive                                                     | ux metninde "düğme" deniyor ama bu bir **sayfa değişimi** — WCAG'ın link/buton ayrımı gereği `Link` (navigasyon = link), `Button` (işlem = buton) seçildi.                                                                                                                                                    |
| "Yeniden gönder" eylemi | native `<button type="button">` + `FOCUS_RING_CLASS_NAMES`         | metin-bağlantı görünümü | **YENİ BİLEŞEN DEĞİL** — tek kullanımlık, `apps/admin` içinde inline | Bu bir **işlem** (e-postayı tekrar tetikler), navigasyon değil — gerçek buton semantiği (`<a>`/`Link` DEĞİL). `packages/ui`'nin `Button`'ı ÖNERİLMEDİ çünkü 44px dolgu/kutu görünümü burada ağır kalırdı (metin-içi bağlantı hissi isteniyor); bu yüzden `Button` sarmalamadan native `<button>` + ince stil. |
| "Gönderiliyor…" durumu  | aynı `<button>`'ın `disabled`+`aria-busy` + metin değişimi         | —                       | —                                                                    | `isResending` controller state'inden.                                                                                                                                                                                                                                                                         |
| Yeniden gönderme hatası | `<p role="alert">` (ana mesajın/düğmenin ALTINDA, onları GİZLEMEZ) | —                       | yeni, `apps/admin`                                                   | ux'in açık şartı: "ana mesaj ve 'Giriş yap' düğmesi kaybolmaz".                                                                                                                                                                                                                                               |

### P3 — Mağaza adı (`/magaza-olustur`, adım 1/3)

| UX öğesi                    | Bileşen                       | Varyant/Boyut       | Kaynak                    | Not                                                                                                                                                                           |
| --------------------------- | ----------------------------- | ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kart kapsayıcı              | `Card`+`CardContent`          | mevcut              | `packages/ui` (MEVCUT)    | Tek kart, 3 adım İÇİNDE state değişimi (`TwoFactorSetupWizard` deseni, ayrı Dialog/rota DEĞİL).                                                                               |
| Başlık (adıma göre değişir) | `<h1>`+`headingRef`+`focus()` | —                   | mevcut desen              | `registration.storeName.stepLabel` ("Mağaza adı").                                                                                                                            |
| İlerleme metni              | `<p>` ("Adım 1 / 3")          | —                   | yeni metin, bileşen değil | **HER ZAMAN görünür metin** (360px'te de, md/lg/xl'de de) — salt görsel bar DEĞİL (WCAG 1.4.1 ile tutarlı, ux'in mobil notunu TÜM kırılımlara genişletiyorum, basitlik için). |
| Mağaza adı alanı            | `Input`                       | —                   | `packages/ui` (MEVCUT)    | `registration.storeName.inputLabel`.                                                                                                                                          |
| Zorunlu hatası              | `Input.error`                 | —                   | `packages/ui` (MEVCUT)    | `registration.storeName.required`.                                                                                                                                            |
| "İleri"                     | `Button`                      | `variant="primary"` | `packages/ui` (MEVCUT)    | `registration.storeName.next`.                                                                                                                                                |

### P4 — Mağaza adresi/slug (`/magaza-olustur`, adım 2/3)

| UX öğesi                               | Bileşen                                                                      | Varyant/Boyut                              | Kaynak                 | Not                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Başlık                                 | `<h1>`+`focus()`                                                             | —                                          | mevcut desen           | `registration.slug.stepLabel`.                                                                                                                                                                                                                                                                                                                   |
| Slug alanı (önceden doldurulmuş öneri) | `Input`                                                                      | `autoComplete="off"`, `spellCheck={false}` | `packages/ui` (MEVCUT) | Başlangıç değeri `StoreWizardController`'ın `packages/tenancy`'den **doğrudan** içe aktardığı `normalizeTenantSlug(storeName)` çıktısı — **KARAR (ux Risk #4'ü çözüyor): EVET, client-side çağrılır.** Bu bir öneri/varsayılan değer; gerçek doğrulama HER ZAMAN `checkSlugAvailability`/`createTenant` (sunucu) — CLAUDE.md §4 ihlal edilmiyor. |
| Canlı müsaitlik durumu                 | `<p role="status" aria-live="polite">` + dekoratif `aria-hidden` Unicode "✓" | —                                          | yeni, `apps/admin`     | `slug-outcome-message.ts`'ten metin — **5 outcome + "checking" ALTISI da metin taşır**, renk/ikon YALNIZCA metnin yanında (bkz. aşağıdaki "Durum görselleri"). "✓" **yeni bir ikon kütüphanesi DEĞİL** — tek kullanımlık dekoratif karakter, `lucide-react` kapısı AÇILMIYOR (bkz. "İkonlar").                                                   |
| Adres önizleme metni                   | `<p>` ("Mağazan şu adresten yayına girecek: {slug}.{alan-adı}")              | —                                          | yeni metin             | `{alan-adı}` bir ortam değişkeninden gelir (`frontend`'in sağlayacağı sabit, bu belgenin kapsamı dışı — bkz. RİSKLER).                                                                                                                                                                                                                           |
| "Geri"/"İleri"                         | `Button`×2                                                                   | `secondary` / `primary`                    | `packages/ui` (MEVCUT) | 360px'te YAN YANA (ux'in istisnası — kısa metinler). "İleri" yalnızca `outcome === 'available'` iken etkin.                                                                                                                                                                                                                                      |
| Alan hatası (submit anı yarış kaybı)   | `Input.error`                                                                | —                                          | `packages/ui` (MEVCUT) | `slug-outcome-message.ts`'in `resolveSlugFieldErrorMessage('taken')` çıktısı — `registration.slug.raceLostNotice`.                                                                                                                                                                                                                               |

### P5 — Site tipi (`/magaza-olustur`, adım 3/3)

| UX öğesi                      | Bileşen                                                                      | Varyant/Boyut                                          | Kaynak                                               | Not                                                                                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Başlık                        | `<h1>`+`focus()`                                                             | —                                                      | mevcut desen                                         | `registration.siteType.stepLabel`.                                                                                                                                                                                                                              |
| Seçenek grubu                 | `SiteTypeFieldset` → native `<fieldset>`+`<legend>`+2×`<input type="radio">` | `accent-(--color-brand-500)` (Checkbox'ın AYNI deseni) | **YENİ KOMPOZİT — `apps/admin` (packages/ui DEĞİL)** | Radix GEREKMİYOR (native radio klavye/ok-tuşu/`aria-checked` ücretsiz) — `Checkbox.tsx`'in AYNI "native input + accent-color" mantığı, YALNIZCA bu ekranda kullanıldığı için `packages/ui`'ye TAŞINMIYOR (T-016'nın `BackupCodesList` gerekçesiyle AYNI sınıf). |
| Seçim yok hatası              | `<p role="alert">`, `fieldset`'in `aria-describedby`'ına bağlı               | —                                                      | yeni, `apps/admin`                                   | ux'in kendi erişilebilirlik şartı (④) — `Input.error` DEĞİL (bu bir `<fieldset>`, `<input>` değil), ama AYNI aile: hata açıklamaya programatik bağlı.                                                                                                           |
| "Geri" / "Mağazanı oluştur"   | `Button`×2                                                                   | `secondary` / `primary`                                | `packages/ui` (MEVCUT)                               | 360px: "Mağazanı oluştur" tam genişlik kendi satırında, "Geri" ÜSTÜNDE ayrı satırda (ux'in şartı — uzun metin). `md:` ve üstünde `sm:flex-row justify-end gap-2` (ConfirmDialog'un buton satırı düzeniyle TUTARLI).                                             |
| Gönderiliyor (`createTenant`) | `Button`'ın `isLoading` + "Geri" `disabled`                                  | —                                                      | mevcut mekanizma                                     | "Geri" KALDIRILMAZ, `disabled` olur (adım geri gidilemez ama layout kaymaz).                                                                                                                                                                                    |
| Ağ/sunucu hatası (genel)      | inline `role="alert"` kutusu (sign-in.tsx deseni)                            | —                                                      | **YENİ KOMPONENT DEĞİL**                             | Aynı adımda kalır, girdi kaybolmaz.                                                                                                                                                                                                                             |
| 401 (oturum düşmüş)           | görünür YOK                                                                  | —                                                      | —                                                    | Mevcut `treatAsSignedOut` mantığı (`_app.tsx:140-151`) **BURADAN manuel olarak çağrılır** (ÜÇÜNCÜ çağrı yeri — T-017 ikinci çağrı yeriydi; bkz. RİSKLER, ortak yardımcıya terfi önerisi).                                                                       |

### P6 — Panel anasayfası, saklı adres YOK (`/`, `_app.index.tsx`)

| UX öğesi                                              | Bileşen                                   | Varyant/Boyut                        | Kaynak                                | Not                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------- | ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Başlık                                                | `<h1>` ("Panel", MEVCUT metin, DEĞİŞMEDİ) | —                                    | mevcut dosya                          | `_app.index.tsx`'in zaten var olan `h1`'i, dokunulmuyor.                                                                                                                                                                                                                                                                                   |
| "Henüz bir mağazan yok" + eylem                       | `EmptyState` (apps/admin)                 | **GENİŞLETİLMİŞ** `action` prop'uyla | `apps/admin` (MEVCUT, genişletilecek) | Bkz. "Mevcut bileşen genişletmeleri" — `action={{label:'Mağaza oluştur', onClick:...}}` ile `<Button variant="primary">` render eder.                                                                                                                                                                                                      |
| "Zaten bir mağaza oluşturdun mu?" manuel adres girişi | `Card`+`CardContent` + `Input` + `Button` | `Button variant="secondary"`         | `packages/ui` (MEVCUT)                | `EmptyState`'in AYRI, altındaki bir blok (EmptyState'in İÇİNE KARIŞTIRILMAZ — iki farklı niyet: "yeni oluştur" vs "zaten var, adresimi hatırlıyorum"). Submit → `navigate({to:'/kurulum/$slug', params:{slug: deger}})` — doğrulama/404 işi `/kurulum/{slug}`'a bırakılır (burada format kontrolü YAPILMAZ, bkz. P7'nin tek-cümle hatası). |
| Yükleniyor                                            | N/A                                       | —                                    | —                                     | `/`'in `beforeLoad`'ı senkron (yerel depo okuma) — ağ çağrısı YOK, yükleniyor durumu YAPISAL OLARAK yok.                                                                                                                                                                                                                                   |
| Saklı adres VAR (yönlendirme)                         | —                                         | —                                    | —                                     | **Görünür UI yok** — `beforeLoad` içinde `redirect({to:'/kurulum/$slug', params:{slug}})`, `_app.tsx`'in guard deseniyle AYNI mekanizma (`redirect()` fırlatma, `@typescript-eslint/only-throw-error` istisnası).                                                                                                                          |

### P7 — Kurulum kontrol listesi (`/kurulum/{slug}`, YENİ rota)

| UX öğesi                                                  | Bileşen                                                                     | Varyant/Boyut                                    | Kaynak                                                                           | Not                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Başlık                                                    | `<h1>`+`headingRef`+`focus()`                                               | —                                                | mevcut desen                                                                     | `dashboard.onboarding.checklistTitle` ("Kurulum adımların") — ux'in verdiği metin BURADA `h1` olarak kullanılıyor (ux'te `CardTitle` idi, bu belge ayrı bir `Card` başlığı AÇMIYOR — tek başlık, Card içinde ikinci bir başlık YOK, gerekçe aşağıda).                                                                                |
| Dürüst bilgi şeridi                                       | `<p>` (Card'ın en üstünde, her zaman görünür)                               | —                                                | yeni metin                                                                       | `dashboard.onboarding.pendingBanner` — ux'in metni DEĞİŞMEDİ.                                                                                                                                                                                                                                                                        |
| Kart kapsayıcı                                            | `Card`+`CardContent`                                                        | mevcut, **`CardHeader`/`CardTitle` KULLANILMAZ** | `packages/ui` (MEVCUT)                                                           | Rota zaten bir `h1` taşıyor (yukarıda) — ikinci bir başlık (`CardTitle`) metni TEKRAR ederdi; `CardContent` doğrudan banner+liste ile başlar.                                                                                                                                                                                        |
| Yükleniyor                                                | `Skeleton`×5                                                                | satır yüksekliği                                 | `packages/ui` (MEVCUT)                                                           | `TwoFactorStatusCard`/`ActiveSessionsCard`'ın P1 deseninin birebir kopyası.                                                                                                                                                                                                                                                          |
| 5 maddelik liste                                          | native `<ul>`/`<li>`×5                                                      | —                                                | yeni, `apps/admin`                                                               | T-017'nin liste-semantiği gerekçesiyle AYNI (heterojen içerik: durum metni + bazen rozet) — `DataTable`/`<table>` DEĞİL.                                                                                                                                                                                                             |
| Her maddenin durumu                                       | düz metin (`stepDoneLabel`/`stepTodoLabel`)                                 | —                                                | yeni metin                                                                       | İkon TEK BAŞINA değil — `checklist-step-label.ts`'in çözümlediği metin HER ZAMAN görünür.                                                                                                                                                                                                                                            |
| "Yakında" rozeti (5. madde — `provisioning`)              | `<span>` (metin rozet, `font-(--font-weight-semibold)` `--font-size-small`) | —                                                | yeni metin                                                                       | `dashboard.onboarding.comingSoonBadge` — **devre dışı buton DEĞİL**, etkileşimsiz `<li>` içinde salt metin+açıklama (`provisioningStepHelp`).                                                                                                                                                                                        |
| Boş durum                                                 | **N/A**                                                                     | —                                                | —                                                                                | Liste yapısal olarak her zaman 5 madde döner (ux AC-19) — ayrı bir boş durum görseli YOK, bu açıkça gerekçelendirilmiş N/A.                                                                                                                                                                                                          |
| Hata (checklist yüklenemedi)                              | `<p role="alert">` + `Button` retry                                         | `variant="secondary"`                            | **YENİ KOMPONENT DEĞİL** — `TwoFactorStatusCard`'ın hata dalının birebir kopyası | `dashboard.onboarding.loadError` + `errors.retryButton`.                                                                                                                                                                                                                                                                             |
| **Slug yok/erişim yok (4 ret modundan biri → TEK mesaj)** | `<p role="alert">` (Card'ın yerini alır, liste render EDİLMEZ)              | —                                                | yeni, `apps/admin`                                                               | **BAĞLAYICI TEK CÜMLE** (brief'ten birebir): _"Bu adrese erişiminiz yok veya böyle bir mağaza yok."_ — YENİ anahtar `dashboard.onboarding.slugNotFoundOrForbidden`. Altında "Mağaza oluştur"a dönen bir `Button`/`Link` (adres yanlış yazılmışsa kullanıcının bir çıkışı olsun) — `variant="secondary"`, `/magaza-olustur`'a `Link`. |

---

## Mevcut bileşen genişletmeleri (yeni dosya DEĞİL)

**`apps/admin/src/components/EmptyState.tsx` — opsiyonel `action?: { label: string; onClick: () => void }` prop'u eklenir.** Mevcut `heading`/`body` değişmez; `action` verilirse `CardContent`'in altına bir `<Button variant="primary" onClick={action.onClick}>{action.label}</Button>` render edilir. Bu `packages/ui` DEĞİL — `apps/admin`'in kendi dosyası, Orkestratör onayı GEREKMEZ (yeni bağımlılık yok, yalnızca bir prop). `role="status"` davranışı DEĞİŞMEZ.

**`packages/ui`'de HİÇBİR değişiklik YOK** — bu görevin bağlayıcı kısıtı zaten buydu.

## Yeni bileşen önerileri

**Yok.** `SiteTypeFieldset` ve `StoreWizard`/`OnboardingChecklistCard` `apps/admin`'e
aittir (tek kullanım yeri, 2FA'nın `BackupCodesList`/`TwoFactorStatusCard` sınıfıyla
AYNI gerekçe) — hiçbiri `packages/ui`'ye giden bir aday DEĞİL. **Yeni ana bağımlılık
YOK** (ikon kütüphanesi dahil, bkz. "İkonlar").

---

## Form mimarisi (react-hook-form + Zod resolver, CLAUDE.md §4)

| Form                   | Zod şekli (öneri)                                                                                                                                                           | Alan → bileşen                       | Not                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| P1 kayıt formu         | `{ email: z.string().min(1).pipe(z.email()), password: z.string().min(1), passwordConfirm: z.string().min(1) }` + `.refine` (eşleşme)                                       | `Input`×3                            | `sign-in.tsx`'teki `.pipe(z.email())` deseninin AYNISI — Zod'un kendi mesajı asla render edilmez, `issue.code`→`messages.ts`.             |
| P3 mağaza adı          | `{ storeName: z.string().min(1) }`                                                                                                                                          | `Input`                              | —                                                                                                                                         |
| P4 slug                | **react-hook-form GEREKMİYOR** — `StoreWizardController` kendi state'ini tutuyor (debounce'lu async kontrol, form kütüphanesinin "submit zamanı doğrula" modeline UYMUYOR). | `Input` (controlled, controller'dan) | `value`/`onChange` doğrudan controller'a bağlanır.                                                                                        |
| P5 site tipi           | **react-hook-form GEREKMİYOR** — tek seçim, controller state'inde (`siteType: 'ecommerce'\|'corporate'\|null`).                                                             | `SiteTypeFieldset`                   | Boş seçim hatası controller'ın `submit()`'inde kontrol edilir (sunucuya hiç gitmez, CLAUDE.md §4'ün "şekil istemcide" ilkesiyle TUTARLI). |
| P6 manuel adres girişi | **react-hook-form GEREKMİYOR** — tek alan, boşsa submit no-op.                                                                                                              | `Input`                              | Format doğrulaması istemcide YAPILMAZ (P7'nin tek-cümle 404'ü zaten tüm biçimsizlik/yetkisizlik durumlarını kapsıyor).                    |

---

## Tasarım token'ları

**Doğruluk kaynağı `packages/ui/src/tokens.ts` + `packages/ui/src/theme.css`** (T-016/
T-017'nin aynı notu). Bu görev **yeni token gerektirmiyor**:

| Kullanım                                            | Token                                                                                                 | Not                                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Birincil/ikincil buton                              | `--color-brand-500`/`--color-text-inverse`, `--color-border`+`--color-surface`+`--color-text-primary` | pinli (4.5 / 3+4.5), `Button`'ın MEVCUT varyantları.                                        |
| Hata metni/sınırı (Input, fieldset, alert kutuları) | `--color-danger-600`/`--color-danger-500`/`--color-danger-surface`                                    | pinli (4.5 / 3).                                                                            |
| Canlı durum "available" metni/✓ işareti             | `--color-success-600`/`--color-success-surface`                                                       | pinli (4.5, DAR PAY — `tokens.ts`'in kendi notu, bu görevin YENİ bir riski DEĞİL).          |
| Skeleton zemini                                     | `--color-surface-muted`                                                                               | mevcut.                                                                                     |
| Odak halkası                                        | `FOCUS_RING_CLASS_NAMES`                                                                              | tek izinli halka.                                                                           |
| Yarıçap                                             | `--radius-control` (buton/input/fieldset), `--radius-card` (Card)                                     | mevcut.                                                                                     |
| "Yakında" rozeti metni                              | `--color-text-secondary` / `--color-surface-muted` (hafif zemin, OPSİYONEL — düz metin de yeterli)    | yeni kontrast çifti GEREKMEZ, `--color-text-secondary`/`--color-surface` ZATEN pinli (4.5). |

---

## Responsive plan

| Kırılım                        | Düzen                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **360px (temel, prefiks yok)** | P1/P2: `sign-in.tsx`'in `max-w-sm` tek sütun kabuğu. P3/P4: tek sütun, "Geri"/"İleri" YAN YANA (kısa metin). P5: "Mağazanı oluştur" tam genişlik kendi satırında, "Geri" ÜSTÜNDE ayrı satırda. P6: `EmptyState` tam genişlik, altındaki manuel-adres `Card`'ı tam genişlik, `Input`+`Button` dikey istiflenir. P7: liste dikey `<li>` istifi (T-017'nin AYNI deseni), ilerleme/rozet metinleri satır içinde sarar, kesilmez. |
| **768px (`md:`)**              | `AppShell`'in mevcut `md:flex-row`/`md:p-6` kabuğu. P3-P5/P6/P7 içerik kapsayıcısı `md:max-w-2xl` (dashboard'ın MEVCUT kalıbı, `_app.index.tsx:30`'dan alınan sınıf). P5'in buton çifti `sm:flex-row justify-end gap-2`'ye döner.                                                                                                                                                                                            |
| **1024px (`lg:`)**             | İçerik kapsayıcısı `lg:max-w-3xl` (dashboard'la AYNI). P7 listesi hâlâ tek sütun dikey (T-017'nin "yanlış okumayı azaltma" gerekçesi burada da geçerli — kurulum adımları sırayla okunmalı, yan yana DAĞITILMAZ).                                                                                                                                                                                                            |
| **1280px (`xl:`)**             | `AppShell`'in `xl:px-8` + içerik kapsayıcısının `xl:max-w-3xl` tavanı (dashboard'la tutarlı).                                                                                                                                                                                                                                                                                                                                |

---

## Durum görselleri

| Durum                                                           | Bileşen                                                                            | Yerleşim                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| P1/P3/P5 form gönderiliyor                                      | `Button`'ın `isLoading`/`aria-busy`                                                | mevcut mekanizma.                                    |
| P2 "Gönderiliyor…" (yeniden gönder)                             | native `<button>`'ın `disabled`+metin değişimi                                     | —                                                    |
| P4 "Kontrol ediliyor…"                                          | `role="status"` canlı bölge                                                        | "İleri" `disabled`.                                  |
| P4 `available`/`taken`/`reserved`/`invalidFormat`/`unreachable` | `role="status"` canlı bölge (metin HER ZAMAN, ✓ yalnızca `available`'da dekoratif) | WCAG 1.4.1 — renk/ikon metnin YANINDA, YERİNE değil. |
| P6 "mağaza yok"                                                 | `EmptyState` (genişletilmiş `action`)                                              | sayfa içeriği.                                       |
| P6 saklı adres var                                              | **görünür yok**                                                                    | senkron `redirect()`.                                |
| P7 yükleniyor                                                   | `Skeleton`×5                                                                       | `CardContent` içinde.                                |
| P7 normal (5 madde)                                             | `<ul>`/`<li>`×5 + rozet                                                            | `CardContent` içinde, banner üstte.                  |
| P7 boş                                                          | **N/A**                                                                            | yapısal olarak imkânsız (AC-19).                     |
| P7 hata (yüklenemedi)                                           | `<p role="alert">` + `Button` retry                                                | `CardContent` içinde.                                |
| P7 slug yok/erişim yok                                          | `<p role="alert">` + `Button`/`Link` (Mağaza oluştur)                              | `Card`'ın yerini alır, liste render EDİLMEZ.         |

## İkonlar

**Yeni ikon kütüphanesi YOK.** P4'teki "yeşil onay ikonu" tek dekoratif Unicode "✓"
karakteri (`aria-hidden="true"`, metnin YANINDA) ile çözülüyor — `lucide-react`
(shadcn varsayılanı) bu görevde **gerekli değil** ve T-016/T-017'nin "yalnızca gerçek
bir ihtiyaç doğduğunda ve Orkestratör onayıyla" kuralı burada da AÇIK bırakılıyor (kapı
AÇILMIYOR). Bu, ux'in "ikon" kelimesini kullandığı tek yerin minimal/bağımlılıksız bir
çözümle karşılanması — KARAR, gerekçeli.

## Tema sözleşmesi uyumu

**Bu görev `apps/storefront`'u kapsamıyor** — tüm ekranlar `apps/admin` (panel).
T-016/T-017'nin AYNI gerekçesi: panel platformun kendi sabit tasarım dilini kullanır
(`packages/ui/src/theme.css`), tenant'ın storefront teması panelin görünümünü
etkilemez/etkilenmez. `theme-sdk` sözleşmesi bu plana **tabi değil** (gerekçeli N/A).

## Erişilebilirlik notları (frontend'in uyması gerekenler) — `wcag`'ın sekiz maddesi

① **Odak yönetimi.** P1↔P2 geçişi, P3→P4→P5 sihirbaz adımları, P7'nin mount'u — her
geçişte `headingRef`+`tabIndex={-1}`+`focus()` TEKRARLANIR (yeni strateji İCAT
EDİLMEZ, `sign-in.tsx`/`TwoFactorSetupWizard.tsx`'in AYNI deseni).

② **Tam klavye operasyonu.** Tüm düğmeler gerçek `<button>`, site tipi gerçek
`<input type="radio">` (ok tuşu gezinmesi tarayıcı varsayılanı), "Giriş yap"/"Mağaza
oluştur"a dönüş bağlantıları gerçek `Link`. Form `Enter` ile gönderilir.

③ **Canlı bölgeler.** P4'ün slug durumu `role="status"` `aria-live="polite"` —
debounce sayesinde yalnızca SONUÇ değiştiğinde duyurulur (her tuş vuruşunda değil).

④ **`aria-invalid`+`aria-describedby` / `aria-describedby` (fieldset).** P1/P3/P4'ün
alan hataları `Input.error`'a gider (docs/ui T-016:213'ün BAĞLAYICI kuralı — ayrı
`role="alert"` kutusu YOK, çift duyuru üretir). P5'in "seçim yok" hatası
`<fieldset>`'in `aria-describedby`'ına bağlanır (ux'in kendi şartı).

⑤ ⭐ **Renk TEK BAŞINA anlam taşımaz.** P4'ün 5+1 outcome'ı HER ZAMAN metin taşır
(renk/✓ yalnızca YANINDA). P7'nin "Yakında" rozeti metin (`comingSoonBadge`), salt
renk/ikon DEĞİL.

⑥ **Liste semantiği.** P7 `<ul>`/`<li>`×5 — her maddenin durumu görünür metinle de
belirtilir (`stepDoneLabel`/`stepTodoLabel`), bir onay ikonu TEK BAŞINA yeterli
SAYILMAZ.

⑦ **Kontrast AA.** Bu plandaki TÜM renk eşlemeleri `tokens.ts`'in `CONTRAST_PAIRS`'inde
ZATEN pinli (yukarıdaki token tablosu) — yeni bir kontrast testi GEREKMİYOR.

⑧ **Yükleniyor/boş/hata her ekranda tanımlı.** Yukarıdaki "Bileşen eşlemesi" ve "Durum
görselleri" tabloları her ekran için dördünü (Normal, Yükleniyor, Boş, Hata) ayrı ayrı
ele alıyor; "Boş" durumu yapısal olarak imkânsız olan yerlerde (P1/P3/P5/P6/P7'nin
listesi) AÇIKÇA N/A gerekçelendirildi, atlanmadı.

## Veri katmanı notları (mutation → query invalidation)

1. **P1 `submitSignUp` başarılı → cache değişikliği YOK** (oturum açılmıyor, `session.me` HENÜZ geçerli değil).
2. **P5 `createTenant` başarılı → `stored-tenant-reference.ts`'in `write(slug)` çağrısı + `navigate({to:'/kurulum/$slug', params:{slug}})`** — `session.me` invalidation'a GEREK YOK (kullanıcının kendi oturumu değişmiyor, yalnızca yeni bir kiracı doğdu).
3. **P7 `onboardingChecklist` sorgusu kendi `useQuery`'si** — başka bir query'yi invalidate ETMEZ (salt okuma, mutation yok bu ekranda).
4. **P7 404 (4 ret modundan biri) → `stored-tenant-reference.ts`'in `clear()` çağrısı** — ux'in "saklı referans geçersiz → sessizce sıfırla" niyetinin BU görevdeki karşılığı; sonraki `/` ziyaretinde `beforeLoad` artık yönlendirme YAPMAZ.
5. **401 (herhangi bir ekranda) → mevcut `treatAsSignedOut` çağrısı, `queryClient.clear()` dahil** — `stored-tenant-reference`'ın AYRICA temizlenmesi GEREKMEZ (çıkış yapan kullanıcı zaten `/sign-in`'e gider, bir dahaki girişte `/` tekrar `beforeLoad`'ı çalıştırır, saklı slug HÂLÂ geçerliyse yine yönlendirir — bu DOĞRU davranış, kullanıcı çıkış/giriş yapsa da mağazası aynı kalır).

---

## RİSKLER (sonraki ajanların bilmesi gerekenler)

1. **ux dosyasının "Dashboard ↔ kiracı eşleşmesi" VARSAYIM'ı ve "Ekran 7-8 aynı rota" kararı bu belgeyle ÇELİŞİYOR** (bkz. "Kapsam notu") — ben `tenantId`+`localStorage`+"aynı rota" yerine `slug`+`localStorage`+**İKİ rota** (`/` ve `/kurulum/{slug}`) seçtim, Orkestratör'ün ilettiği ADR-0021 §3.1 bilgisine dayanarak. `docs`/`architect` ux dosyasının ilgili pasajını bu belgeyle UYUMLU hâle getirmeli (ux dosyasına DOKUNMADIM).
2. **`DELIBERATELY_LAZY_ROUTE_SRCS.length` 1→3 büyüyor** — `check-bundle-budget.test.ts:136`'daki pinli test S10 tarafından `.toBe(3)`'e güncellenmek ZORUNDA, görünür bir inceleme yorumuyla (0→1 geçişindeki AYNI disiplin).
3. **`FIRST_PAINT_ENTRY_POINTS`'e üçüncü giriş (`/kayit`) eklenmesi `MAX_FIRST_ROUTE_JS_GZIP_BYTES`'ı (250 KiB) AŞABİLİR** — S10'un gerçek ölçümü eşiği aşarsa bu bir AC16 eşik-yükseltme kararı (architect gerekçesi + ROADMAP notu) GEREKTİRİR, bu belge o kararı VERMEDİ.
4. **"Alan adı" sabiti (`{slug}.{alan-adı}` önizlemesi) bu belgede TANIMLANMADI** — bir ortam değişkeninden (ör. `VITE_PUBLIC_STOREFRONT_BASE_DOMAIN`) gelmesi gerekiyor, `frontend`/`devops` sağlamalı.
5. **Debounce süresi (slug kontrolü) 400ms ÖNERİSİ** — ux "kısa bir gecikme" diyor ama sayı vermiyor; bu belgenin varsayımı, `frontend`/`qa` gerçek kullanıcı testinde ayarlayabilir.
6. **401 `treatAsSignedOut` mantığı bu görevle ÜÇÜNCÜ çağrı yerine ulaşıyor** (`_app.tsx`, T-017'nin `ActiveSessionsCard`'ı, şimdi `StoreWizard.tsx`) — tekrarlanan mantığın paylaşılan bir yardımcıya (`handleSignedOutResult(result, {queryClient, navigate})`) terfi etmesi düşünülmeli; bu belge terfiyi ZORUNLU KILMIYOR, sadece işaretliyor.
7. **Rota adlandırma tutarsızlığı** (`_auth.sign-in.tsx` İngilizce vs yeni rotalar Türkçe) ÇÖZÜLMEDİ, yalnızca gerekçelendirildi — `docs`/`architect` ileride bir adlandırma ADR'si yazmak isteyebilir.
8. **Şifre minimum uzunluk kuralı** (ux'in kendi VARSAYIM'ı, bu belgeye de miras) hâlâ ÇÖZÜLMEDİ — `backend` netleştirince P1'in Zod şeması/metni güncellenmeli.
9. **Yeni i18n anahtarları, `docs`/`ux` onayı gerektiriyor** (T-017'nin `ipUnknown` emsaliyle AYNI disiplin): `dashboard.onboarding.slugNotFoundOrForbidden` (tek cümle, BAĞLAYICI metin brief'ten), `dashboard.home.*` (manuel adres girişi için YENİ bir alt-kök — tam anahtar adları `frontend`'in `messages.ts`'e eklerken seçeceği, bu belge yalnızca varlığını öngörüyor).
10. **`/kurulum/$slug` repodaki ilk dinamik parametre segmentli rota** — mekanik olarak çalışması beklenir (TanStack Router standart özelliği) ama S10 ilk uygulayan olarak doğrulamalı.

AJAN: ui
DURUM: DONE
ÇIKTILAR: docs/ui/T-019-kayit-ve-kiraci-olusturma.md:1 — T-019 bileşen planı (rota tablosu + KESİN dosya adları, bundle bütçesi kararı, controller/view ayrımı dosya listesi, P1-P7 bileşen eşlemesi, EmptyState genişletmesi, token/responsive/durum/erişilebilirlik/veri katmanı notları)
KARARLAR:

- **Bundle bütçesi (KARAR 1):** `/kayit` → `FIRST_PAINT_ENTRY_POINTS`'e ÜÇÜNCÜ giriş (sibling of `/sign-in`, kimliksiz ilk-istek URL'si); `/magaza-olustur` ve `/kurulum/{slug}` → `DELIBERATELY_LAZY_ROUTE_SRCS` (bookmarklanabilir olmaları ilk-boya yapmaz — `_app.hesap.guvenlik.tsx` emsali bunu zaten kanıtlıyor). Üç tam yol + config satırı yukarıda verildi.
- **Controller/view ayrımı (KARAR 2):** `SignUpController`/`StoreWizardController` (.ts, adım makinesi+debounce) + `slug-outcome-message.ts`/`checklist-step-label.ts` (.ts, outcome→mesaj eşlemesi) + `stored-tenant-reference.ts` (.ts, enjekte edilebilir depo) — `TwoFactorSetupController`/`field-error-message.ts` deseninin adıyla devralınması.
- **ux'in VARSAYIM'ı `slug`-tabanlı İKİ rotaya (`/` + `/kurulum/{slug}`) çözüldü**, `tenantId`+tek-rota önerisinin YERİNE — ADR-0021 §3.1'in frozen sözleşmesine (seçici `slug`, `createTenant` çıktısı `tenantId` taşımıyor) dayanarak; ux dosyasına dokunulmadı, RİSKLER'de işaretlendi.
- **`normalizeTenantSlug`'ın client-side kullanımı onaylandı** (ux Risk #4) — yalnızca ÖNERİ/varsayılan değer için, gerçek doğrulama sunucuda kalıyor.
- **Yeni `packages/ui` bileşeni YOK, yeni ana bağımlılık YOK** (ikon kütüphanesi dahil) — "yeşil onay ikonu" dekoratif Unicode karakterle çözüldü; site tipi seçici native radio ile (`SiteTypeFieldset`, `apps/admin`).
  VARSAYIMLAR:
- Debounce süresi 400ms (ux sayı vermiyor) — `frontend`/`qa` ayarlayabilir.
- `{alan-adı}` sabitinin bir env değişkeninden geleceği varsayıldı — `frontend`/`devops` sağlamalı.
- Yeni i18n anahtarlarının (`dashboard.onboarding.slugNotFoundOrForbidden`, `dashboard.home.*`) `docs`/`ux` onayı beklediği varsayıldı (T-017 emsali).
  RİSKLER: Yukarıdaki RİSKLER bölümünde 10 madde (ux dosyasıyla çelişen mekanizma değişikliği ve docs/architect'in onu uyumlaması gerektiği, `DELIBERATELY_LAZY_ROUTE_SRCS` kardinalite testinin güncellenmesi zorunluluğu, bundle bütçesi eşiğinin aşılma riski, alan-adı sabitinin tanımsızlığı, debounce süresi varsayımı, `treatAsSignedOut`'un üçüncü çağrı yeri/terfi önerisi, rota adlandırma tutarsızlığı, şifre minimum uzunluk kuralının hâlâ çözülmemiş olması, yeni i18n anahtarlarının onay gerektirmesi, ilk dinamik-parametre rotasının doğrulanması gerektiği) — tam metin dosyanın sonunda.
  SONRAKİ AJAN İÇİN NOT: `frontend` (S10) bu planı uygularken (1) KARAR 1'deki üç config satırını BİREBİR uygulamalı ve kardinalite testini güncellemeli, (2) KARAR 2'deki her `.ts` dosyasını DOM'dan bağımsız (vitest `environment:'node'`) test etmeli, (3) `treatAsSignedOut`'un üçüncü çağrı yerini ya tekrarlamalı ya da ortak bir yardımcıya terfi etmeli (RİSKLER #6), (4) `{alan-adı}` sabitini ve debounce süresini netleştirmeli, (5) P7'nin tek-cümle 404 metnini BİREBİR (brief'ten alınan metin) kullanmalı — varlık/yetki ayrımı YAPMAMALI.
