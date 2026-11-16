# T-021 — UI: Süper admin iskeleti

## Kaynak UX

docs/ux/T-021-super-admin-iskeleti.md

## Mevcut envanter — tek dokunulmazlık notu

`@arkesoft/ui`'nin kaynağı (`packages/ui/src`) bu planda **hiçbir yerde değiştirilmez** —
AC-2'nin yapısal garantisi (`@arkesoft/ui` → `@arkesoft/trpc`/`apps/*` bağımlılığı
KAZANMAZ) bu Task'ta da korunur. Bu, dosyadaki bu yolu adıyla anan **tek** satırdır
(bir mekanik tarama bu dosyada o yol dizesinin tam olarak bir kez geçtiğini
doğrulayabilir); aşağıda bileşenlerden her söz edişte yalnızca `@arkesoft/ui` paket adı
veya bileşen adı (`Button`, `DataTable`…) kullanılır, dosya yolu tekrarlanmaz.

`@arkesoft/ui` barrel'ı (gerçekten okunarak çıkarılan envanter — hiçbir bileşen
varsayılmadı): `Button` (`primary|secondary|destructive`, tek boyut `md`, `isLoading`),
`Input` (zorunlu görünür `label`, opsiyonel `error` → `aria-invalid`+`aria-describedby`),
`Card`/`CardHeader`/`CardTitle`(`<p>`, `<h*>` üretmez)/`CardContent`, `Skeleton`
(genel amaçlı, `aria-hidden`), `DataTable` (sunum kabuğu — sıralama/sayfalama/
sanallaştırma yok, bugüne kadar hiç tüketicisi yok), `Toast` (tüketicisi yok, bu plan
da tüketmiyor), `Checkbox`, `CopyButton` (bu plan ikisini kullanmıyor), `cn`,
`FOCUS_RING_CLASS_NAMES`, `COLOR_TOKENS`/`CONTRAST_PAIRS`. Radix **hiç yok** —
`ConfirmDialog`/`UserMenu` gibi Radix tüketen bileşenler `apps/admin`'in **kendi**
dosyaları, barrel'dan dışa açılmıyor.

`apps/admin/src/components/` emsali (okundu): `LoadingState` (h1|h2, `aria-live="polite"`),
`ErrorState` (h1|h2, `role="alert"`, zorunlu `onRetry`), `EmptyState` (sabit h2,
`role="status"`, eylemsiz), `AppShell`/`Sidebar`/`Topbar`/`UserMenu` (kabuk kompozisyonu,
`UserMenu` Radix `DropdownMenu` kullanıyor), `ConfirmDialog` (Radix `Dialog`),
`ChallengeCountdown` (saf sayaç + eşikli `role="status"` duyuru).

**AC-2'nin birinci yarısını karşılayan en az iki `@arkesoft/ui` bileşeni (aşağıda adıyla
geçiyor):** `DataTable`, `Button`, `Input`, `Card`/`CardHeader`/`CardTitle`/`CardContent`,
`Skeleton` — beşi de bu planda **gerçek tüketici** kazanıyor (`DataTable`'ın T-008'den
beri ilk tüketicisi bu Task).

## ⚠⚠ `apps/superadmin`'e yerel kopya — gerekçe + borç satırı

`EmptyState`/`ErrorState`/`LoadingState` `@arkesoft/ui`'de **yok** (ölçüldü — üçü de
`apps/admin`'in kendi dosyaları). `apps/superadmin` → `apps/admin` bağımlılığı CLAUDE.md
§3'ün yönünü (`apps/*` → `packages/*`, uygulamalar arası bağımlılık yok) ihlal eder —
dolayısıyla üçü **`apps/superadmin/src/components/`** altına **yerel kopya** olarak
taşınır (metin/i18n anahtarları hariç, görsel/erişilebilirlik sözleşmesi birebir
korunur). ⚠⚠ **Bu üçü `@arkesoft/ui`'ye TERFİ ETTİRİLMEZ** — ettirilirse AC-2'nin
yapısal garantisi düşer (bu bileşenler bugün `apps/admin`'e özgü i18n/route varsayımı
taşımıyor olsa da, terfi kararı bu Task'ın kapsamı değil, ayrı bir ADR gerektirir).

**Borç satırı (SEV: low):**

> `SEV: low` · `apps/admin/src/components/EmptyState.tsx:1` ve kardeşleri
> (`ErrorState.tsx:1`, `LoadingState.tsx:1`) · **iki uygulamada birebir aynı üç dosyanın
> kopyası yaşıyor** (`apps/admin` ve `apps/superadmin`), tek doğruluk kaynağı yok ·
> sorumlu ajan: `architect` · vade önerisi: üçüncü bir panel (`apps/storefront` admin
> yüzeyi veya benzeri) bu üç durumu ihtiyaç duyduğunda, `@arkesoft/ui`'ye i18n'siz/
> route'suz bir "sunum çekirdeği" (yalnızca `heading`/`body`/`onRetry` gibi saf prop'lar
> — bugünkü hâlleri zaten böyle) terfi ettirme kararı ADR olarak yazılsın; iki kopya
> şimdilik kabul edilebilir çünkü üçü de zaten veri çekmeyen, route bilmeyen saf sunum
> bileşenleri (CLAUDE.md §3 ihlali yok, yalnızca DRY borcu).

## Ekranlar ve rotalar (ux'in tablosuyla birebir)

| #   | Ekran                                | Rota                       | Kabuk                  | Dosya türü (bkz. "Dosya türü disiplini")     |
| --- | ------------------------------------ | -------------------------- | ---------------------- | -------------------------------------------- |
| 1   | Giriş                                | `/giris`                   | Hayır                  | `.tsx` (JSX) + `.ts` (form/hata mantığı)     |
| 2   | 2FA doğrulama (giriş sırasında)      | `/giris` (2. adım)         | Hayır                  | aynı dosya çifti                             |
| 3   | 2FA kurulum duvarı                   | `/iki-adimli-dogrulama`    | Hayır (duvar kabuksuz) | `.tsx` + `.ts` (karar fonksiyonu)            |
| 4   | Kiracı listesi                       | `/`                        | Evet                   | `.tsx` (route) + `.ts` (etiket/sıra mantığı) |
| 5   | Platform denetim kaydı               | `/denetim-kaydi`           | Evet                   | `.tsx` (route) + `.ts` (eylem etiketi)       |
| 6   | Kabuk                                | layout                     | —                      | `.tsx` (JSX) + `.ts` (navigasyon guard)      |
| —   | Yetkisiz (`PLATFORM_ADMIN_REQUIRED`) | herhangi bir korumalı rota | Hayır                  | `.tsx` (render-only)                         |
| —   | Ağ erişimi reddedildi                | herhangi bir nokta         | Hayır                  | `.tsx` (render-only)                         |

## Bileşen eşlemesi

### Ekran 1-2 — Giriş ve 2FA doğrulama (admin'in `sign-in.tsx` deseninin birebir taşınması)

| UX öğesi                                         | Bileşen                                                                                            | Varyant/Boyut                          | Kaynak                                          | Not                                                                                                                                                                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form kapsayıcı                                   | `Card`+`CardHeader`+`CardTitle`+`CardContent`                                                      | mevcut                                 | `@arkesoft/ui` (MEVCUT)                         | `CardTitle` metni `auth.signIn.title`; sayfanın tek `h1`'i route dosyasında (`headingRef`+`tabIndex={-1}`+mount `focus()`, T-016/T-019 deseni), `CardTitle` `<h*>` üretmiyor.                                                                             |
| E-posta alanı                                    | `Input`                                                                                            | `type="email"`                         | `@arkesoft/ui` (MEVCUT)                         | `label="E-posta adresi"`, hata `INVALID_EMAIL_OR_PASSWORD` **form seviyesinde** gösterilir (alan `aria-invalid` almaz — tek mesaj hangi alanın yanlış olduğunu söylemiyor, admin'in mevcut deseniyle aynı).                                               |
| Parola alanı                                     | `Input`                                                                                            | `type="password"`                      | `@arkesoft/ui` (MEVCUT)                         | `label="Şifre"`, `autoComplete="current-password"`.                                                                                                                                                                                                       |
| Form seviyesi hata                               | `<p role="alert">` (Input'un DIŞINDA, çağıranın kendi JSX'i)                                       | —                                      | yeni, `apps/superadmin`                         | `INVALID_EMAIL_OR_PASSWORD`/`RATE_LIMIT_EXCEEDED`/`errors.network` — hangi alanın yanlış olduğu bilinmediği için field-level `Input.error` **kullanılmaz** (T-016/T-017'nin field-level kuralının istisnası, admin'in mevcut `sign-in.tsx`'iyle tutarlı). |
| "Giriş yap" düğmesi                              | `Button`                                                                                           | `variant="primary"`, `isLoading`       | `@arkesoft/ui` (MEVCUT)                         | `auth.signIn.submit` / gönderilirken `auth.signIn.submitting`.                                                                                                                                                                                            |
| 2FA kod alanı                                    | `Input`                                                                                            | `inputMode="numeric"`, `maxLength={6}` | `@arkesoft/ui` (MEVCUT)                         | `label="Doğrulama kodu"`, hata `INVALID_CODE` → `Input.error` (field-level, T-016 kuralı burada **geçerli** — tek alan var, belirsizlik yok).                                                                                                             |
| Geri sayım                                       | `ChallengeCountdown` (yerel kopya)                                                                 | —                                      | `apps/admin` emsali → `apps/superadmin`'e kopya | Aynı eşik mekaniği (60s/0s `role="status"`), metinler mesaj kataloğundan.                                                                                                                                                                                 |
| "Doğrula" düğmesi                                | `Button`                                                                                           | `variant="primary"`, `isLoading`       | `@arkesoft/ui` (MEVCUT)                         | `auth.twoFactor.verifyButton`.                                                                                                                                                                                                                            |
| "Yedek kod kullanın" bağlantısı                  | `<button type="button">` (link görünümlü, `Button` DEĞİL)                                          | —                                      | yeni, `apps/superadmin`                         | T-016/admin'in aynı deseni — gerçek bir `Button` değil, metin bağlantısı; `FOCUS_RING_CLASS_NAMES` ile odak halkası.                                                                                                                                      |
| Terminal hatalar (deneme aşımı/kilit/süre doldu) | yerel `ErrorState` (bkz. aşağı) **DEĞİL** — T-016'nın aynı üç metni, forma **geri dönüş** linkiyle | —                                      | T-016 emsali                                    | UX bunu "T-016'nın aynı üç durumu" diye tanımlıyor — bu üçü form içinde `role="alert"` + "Girişe dön" bağlantısıyla kalır, tam sayfa `ErrorState`'e geçmez (T-016'nın kendi kararı, burada bozulmuyor).                                                   |

### Ekran 3 — 2FA kurulum duvarı (`TWO_FACTOR_REQUIRED`)

| UX öğesi                                      | Bileşen                             | Varyant/Boyut       | Kaynak                                                  | Not                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ----------------------------------- | ------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duvar kapsayıcı                               | **YENİ yerel** `TwoFactorSetupWall` | —                   | yeni, `apps/superadmin` (bkz. "Yeni bileşen önerileri") | Kendi `h1`'i (`platform.twoFactorWall.title`), mount'ta `focus()`. `role="status"` — bu bir hata değil, beklenen bir sonraki adım (EmptyState'in "durum, hata değil" mantığıyla aynı aile).                                                                                                                                                                                                                          |
| Açıklama metni                                | `<p>`                               | —                   | yeni                                                    | `platform.twoFactorWall.body`.                                                                                                                                                                                                                                                                                                                                                                                       |
| "Kurulumu başlat" düğmesi                     | `Button`                            | `variant="primary"` | `@arkesoft/ui` (MEVCUT)                                 | `platform.twoFactorWall.startButton` — T-016'nın 3 adımlı kurulum sihirbazını açar (bu belge o sihirbazı yeniden tasarlamıyor, T-016'nın `TwoFactorSetupWizard` deseni `apps/superadmin`'e **de** yerel kopyalanır — aynı "packages/ui'de yok, apps/admin'e özgü" gerekçesiyle, ayrı bir borç satırı gerektirmiyor çünkü bu bileşen zaten T-016'da `apps/admin`'e özgü tasarlanmıştı, "terfi" beklentisi hiç yoktu). |
| Yükleniyor (henüz `platform.session` dönmedi) | yerel `LoadingState`                | `headingLevel="h1"` | kopya, bkz. "Yeni bileşen önerileri"                    | UX'in şartı: bu ekran **hiç gösterilmez**, kabuk kendi yükleniyor durumunda kalır.                                                                                                                                                                                                                                                                                                                                   |
| `platform.session` hatası (ağ/sunucu)         | yerel `ErrorState`                  | `headingLevel="h1"` | kopya                                                   | "Bir şeyler ters gitti. Lütfen tekrar deneyin." — 2FA duvarı **da** gösterilmez (UX: "bilmiyorum" fail-closed, "2FA kurman gerekiyor" demek değil).                                                                                                                                                                                                                                                                  |

### Ekran 4 — Kiracı listesi

| UX öğesi                    | Bileşen                                         | Varyant/Boyut                                 | Kaynak                                              | Not                                                                                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------- | --------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liste (≥768px)              | `DataTable`                                     | 5 sütun (bkz. "DataTable kullanımı")          | `@arkesoft/ui` (MEVCUT, **ilk gerçek tüketici**)    | `caption="Mağaza listesi"` (`sr-only`).                                                                                                                                                                                                                                            |
| Liste (< 768px)             | native `<ul>`/`<li>` kart görünümü              | —                                             | yeni, `apps/superadmin`                             | Aynı veri, aynı sütun anlamı — bkz. "Responsive plan". `DataTable` kendi içinde kart dönüşümü yapamaz (sunum kabuğu, bkz. envanter notu) — bu yüzden iki markup paralel render edilir, `hidden md:block` / `md:hidden` ile tek biri görünür (CSS-seviyesi seçim, veri tek kaynak). |
| Durum rozeti (hücre içinde) | düz metin + renkli nokta (`<span aria-hidden>`) | —                                             | yeni, saf fonksiyon `resolveTenantStatusLabel`      | WCAG 1.4.1: durum **her zaman** görünür metinle ("Beklemede"/"Kuruluyor"/"Aktif"/"Askıya alınmış"), nokta yalnızca metnin yanında dekoratif destek.                                                                                                                                |
| Yükleniyor                  | `Skeleton` × 5                                  | satır yüksekliğine yakın blok (`h-10 w-full`) | `@arkesoft/ui` (MEVCUT)                             | `DataTable`'ın **dışında**, ayrı bir yığın (`DataTable`'ın `isLoading` prop'u yok — sunum kabuğu veri durumunu bilmez) — veri gelene kadar `DataTable` hiç mount edilmez.                                                                                                          |
| Boş durum                   | yerel `EmptyState`                              | kopya, sabit h2, `role="status"`              | kopya, `DataTable`'ın `emptyState` prop'una geçilir | "Henüz hiç mağaza oluşturulmamış." — eylem yok (UX kararı).                                                                                                                                                                                                                        |
| Hata                        | yerel `ErrorState`                              | `headingLevel="h2"` (kabuk zaten mountlu)     | kopya                                               | "Mağaza listesi şu anda yüklenemedi." + "Yeniden dene".                                                                                                                                                                                                                            |

### Ekran 5 — Platform denetim kaydı

| UX öğesi        | Bileşen                                            | Varyant/Boyut       | Kaynak                                 | Not                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------- | ------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liste kapsayıcı | native `<ul>`                                      | —                   | yeni, `apps/superadmin` (T-017 emsali) | **`DataTable` KULLANILMIYOR** — bkz. "KARAR gerektiren gerilim" bölümü, bu bilinçli bir sapma.                                                                                                              |
| Her kayıt       | native `<li>`                                      | —                   | yeni                                   | Aktör + Eylem + Konu + Zaman, dikey istif (T-017'nin oturum satırı deseniyle aynı).                                                                                                                         |
| Eylem etiketi   | düz metin, saf fonksiyon `resolveAuditActionLabel` | —                   | yeni                                   | 2 üyelik kapalı sözlük (`login`→"Giriş yaptı", `tenantAccess`→"Kiracı verisine erişti") — gerçek enum adları backend'den geldiğinde `frontend`/`docs` teyit eder (UX'in kendi notu, bu plan değiştirmiyor). |
| Yükleniyor      | `Skeleton` × 5                                     | `h-12 w-full`       | `@arkesoft/ui` (MEVCUT)                | Kart/`<ul>` dışında, T-017'nin aynı deseni.                                                                                                                                                                 |
| Boş durum       | **N/A**                                            | —                   | —                                      | UX'in şartı: yapısal olarak sıfır satır beklenmez; gerçekleşirse bu bir hata, ayrı bir `EmptyState` render edilmez.                                                                                         |
| Hata            | yerel `ErrorState`                                 | `headingLevel="h2"` | kopya                                  | "Denetim kaydı şu anda yüklenemedi." + "Yeniden dene".                                                                                                                                                      |

### Ekran 6 — Kabuk

| UX öğesi                                     | Bileşen                                                | Varyant/Boyut                     | Kaynak                                                                                    | Not                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kabuk kompozisyonu                           | yerel `AppShell`+`Sidebar`+`Topbar`                    | kopya, adapte                     | `apps/admin` emsali → `apps/superadmin`'e kopya (aynı "cross-app import yasak" gerekçesi) | Skip-link + `tabIndex={-1}` `<main>` deseni **birebir** taşınır (WCAG 2.4.1 Bypass Blocks, `AppShell.tsx`'in düzeltme turu 2 dersi tekrarlanmaz).                                                                                                                                                                                                           |
| Navigasyon ("Mağazalar"/"Denetim kaydı")     | gerçek `<a>`/router `Link`                             | `aria-current="page"`             | `@tanstack/react-router`                                                                  | `Sidebar`'ın mevcut `NAV_LINK_CLASS_NAME` deseni (`FOCUS_RING_CLASS_NAMES` ithal, çıplak kopya yok).                                                                                                                                                                                                                                                        |
| Kimlik göstergesi                            | düz `<span>` (dekoratif rozet + e-posta metni)         | —                                 | yerel kopya, `Topbar`                                                                     | UX: "giriş yapan kullanıcının e-postası" — admin'in `userId`-only kısıtı burada **geçerli değil** (`platform.session` muhtemelen e-posta döner, backend teyit eder); e-posta tele çıkmıyorsa aynı `deriveUserBadgeInitials` dekoratif kısaltmasına düşülür (VARSAYIM, bkz. RİSKLER).                                                                        |
| "Çıkış yap" düğmesi                          | `Button`                                               | `variant="secondary"`             | `@arkesoft/ui` (MEVCUT)                                                                   | **KARAR:** admin'in Radix `DropdownMenu`'lü `UserMenu`'sü buraya **taşınmıyor** — menünün içeriği tek bir eylem (çıkış), dropdown gereksiz dolaylama + gereksiz bir Radix bağımlılığı (`@radix-ui/react-dropdown-menu`) ekler. Düğme `Topbar`'da doğrudan görünür. Onay diyaloğu **yok** (UX: "Yıkıcı işlemler" tablosu — anında çıkış, sürtünme eklenmez). |
| Mobil nav (360px, UX: "hamburger")           | native `<button aria-expanded> + <nav>` açılır/kapanır | —                                 | yeni, `apps/superadmin`                                                                   | Radix **gerekmez** — iki öğelik bir nav için native disclosure (buton + `aria-expanded`/`aria-controls`, `Escape` ile kapanma elle eklenir) yeterli; `UserMenu`'nün Radix'ini taşımadığımız için burada da yeni bağımlılık açılmıyor.                                                                                                                       |
| Yükleniyor (`platform.session` dönene kadar) | yerel `LoadingState`                                   | `headingLevel="h1"` (kabuksuz an) | kopya                                                                                     | Navigasyon **render edilmez** (UX: hangi bağlantıların geçerli olduğu bilinmiyor).                                                                                                                                                                                                                                                                          |
| Genel hata (kimlik belirsiz)                 | yerel `ErrorState`                                     | `headingLevel="h1"`               | kopya                                                                                     | "Bir şeyler ters gitti. Lütfen tekrar deneyin." — navigasyon gösterilmeden.                                                                                                                                                                                                                                                                                 |

## ⚠⚠ Üç 403'ün görsel ayrımı — bileşen/ikon/vurgu

UX'in açık uyarısı ("aynı bileşen/renk/ikonla üçünü göstermek bu belgenin amacını boşa
düşürür") burada **üç ayrı yerel bileşenle** karşılanıyor — tek bir "GenericWall" bileşeni
**bilerek seçilmedi**, çünkü üçünün ortak bir prop (`tone`) ile tek bileşende tutulması
ileride dördüncü bir durum eklendiğinde varsayılan tonun yanlış seçilmesi riskini taşır;
üç ayrı dosya adı bu riski derleme zamanında ortadan kaldırır.

| #   | Kod                                                 | Bileşen (yeni, yerel) | `role`          | Renk/vurgu (token)                                                                                                                 | Eylem                                                                                                          | Gerekçe                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------- | --------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `PLATFORM_ADMIN_REQUIRED`                           | `UnauthorizedWall`    | `role="status"` | **nötr** — `--color-border-subtle` sol kenarlık + `--color-surface-muted` zemin, `--color-text-secondary` ikonsuz dekoratif işaret | **Yok** — hiçbir `Button` render edilmez (odaklanabilir ama işlevsiz kontrol bırakılmaz, UX madde 5)           | Bu bir sistem arızası değil, kalıcı bir yetki sınırı — alarm rengi (`danger`) yanlış sinyal verir ("düzeltilebilir bir şey var" izlenimi), nötr/sakin ton "burada durma" demenin doğru tonu.                                                                         |
| 2   | `TWO_FACTOR_REQUIRED`                               | `TwoFactorSetupWall`  | `role="status"` | **marka/eylem** — `--color-brand-500` sol kenarlık, `Button variant="primary"`                                                     | **Var** — "Kurulumu başlat"                                                                                    | Bu bir engel değil, bir sonraki adım — marka rengi "ileri git" sinyali verir, `ErrorState`'in `danger` ailesinden **bilerek** ayrılır.                                                                                                                               |
| 3   | IP reddi (öneri kod `PLATFORM_NETWORK_NOT_ALLOWED`) | `NetworkBlockedWall`  | `role="alert"`  | **danger** — `--color-danger-500` sol kenarlık, `--color-danger-surface` zemin                                                     | **Yok** ama ortam değişkeni **adı** (`SUPERADMIN_IP_ALLOWLIST`) `font-(--font-weight-semibold)` ile vurgulanır | Üçünün en "gerçek blokaj" olanı — `role="alert"` + `danger` tonu bunu doğru sınıflandırır; UX'in "allowlist içeriği sızmaz" kısıtı metin seviyesinde korunur, bileşen bunu zorlamaz (çağıranın sorumluluğu, bileşen sadece `envVarName: string` prop'u render eder). |

Üçü de kendi `h1`'ini taşır, mount'ta `focus()` çağırır (T-016 Ekran 9 deseni), kabuğun
**dışında** render edilir (navigasyon yok — UX'in şartı, hangi bağlantıların erişilebilir
olduğu henüz bilinmiyor).

## Yeni bileşen önerileri

Hepsi **`apps/superadmin`'e yerel** — hiçbiri `@arkesoft/ui`'ye girmiyor (AC-2 gerekçesi
yukarıda).

| Bileşen                       | Neden yeni                                                        | Kaynak kopya/emsal                                                                             |
| ----------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `LoadingState`                | `@arkesoft/ui`'de yok, cross-app import yasak                     | `apps/admin/src/components/LoadingState.tsx` — birebir kopya                                   |
| `ErrorState`                  | aynı                                                              | `apps/admin/src/components/ErrorState.tsx` — birebir kopya                                     |
| `EmptyState`                  | aynı                                                              | `apps/admin/src/components/EmptyState.tsx` — birebir kopya                                     |
| `UnauthorizedWall`            | üç 403'ün görsel ayrımı gerektirdiği yeni bir durum (bkz. yukarı) | yeni desen, `ErrorState`'in `role`/layout iskeletinden esinlenir ama `onRetry` zorunluluğu yok |
| `TwoFactorSetupWall`          | aynı                                                              | yeni desen                                                                                     |
| `NetworkBlockedWall`          | aynı                                                              | yeni desen                                                                                     |
| `AppShell`/`Sidebar`/`Topbar` | `@arkesoft/ui`'de yok, cross-app import yasak                     | `apps/admin` emsali, `UserMenu`/Radix **çıkarılmış** sade kopya                                |
| `ChallengeCountdown`          | aynı                                                              | `apps/admin/src/components/ChallengeCountdown.tsx` — birebir kopya                             |

**`@arkesoft/ui`'ye hiçbir ekleme önerilmiyor** — beş mevcut bileşen (`DataTable`,
`Button`, `Input`, `Card` ailesi, `Skeleton`) bu planın tüm ihtiyacını karşılıyor.

## Tasarım token'ları

Doğruluk kaynağı `@arkesoft/ui`'nin `tokens.ts`/`theme.css` çifti (T-016/T-017'nin aynı
notu) — **yeni token icat edilmiyor**, hepsi mevcut.

| Kullanım                           | Token                                                                                                     | Not                                                                                                                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kart/duvar zemin-kenarlık          | `--color-surface` / `--color-border-subtle`                                                               | mevcut, değişiklik yok.                                                                                                                                                                                                                             |
| `UnauthorizedWall` vurgusu         | `--color-border-subtle` + `--color-surface-muted` + `--color-text-secondary`                              | nötr — dar pay yok, ikisi de zaten pinli çiftler.                                                                                                                                                                                                   |
| `TwoFactorSetupWall` vurgusu       | `--color-brand-500` (kenarlık) + `Button` `primary`                                                       | `Button`'ın kendi pinli çifti (`text-inverse`/`brand-500`, 4.5).                                                                                                                                                                                    |
| `NetworkBlockedWall` vurgusu       | `--color-danger-500` (kenarlık) / `--color-danger-surface` (zemin) / `--color-danger-600` (metin)         | üçü de `CONTRAST_PAIRS`'te zaten pinli.                                                                                                                                                                                                             |
| Durum rozeti — Aktif               | `--color-success-600` / `--color-success-surface`                                                         | pinli, **dar pay** (`tokens.ts`'in kendi notu — 4.79:1, bu plan değiştirmiyor).                                                                                                                                                                     |
| Durum rozeti — Askıya alınmış      | `--color-danger-600` / `--color-danger-surface`                                                           | pinli (4.5).                                                                                                                                                                                                                                        |
| Durum rozeti — Beklemede/Kuruluyor | `--color-text-secondary` / `--color-surface`                                                              | pinli (4.5) — **yeni bir "uyarı" tonu icat edilmedi**, token setinde `warning` yok; nötr ton bu iki ara-durum için yeterli (ne başarı ne hata).                                                                                                     |
| "Adres" (slug) hücresi             | `--font-mono`                                                                                             | T-017'nin IP için reddettiği aynı tokenı burada **kabul ediyorum** — slug bir tanımlayıcı/host parçası, okunabilirlik için monospace faydalı; UX'in itirazı IP'ye özgüydü, slug'a genellenmiyor (düşük riskli KARAR, `po`/`frontend` reddedebilir). |
| Odak halkası                       | `FOCUS_RING_CLASS_NAMES`                                                                                  | tek izinli halka, çıplak kopya yok.                                                                                                                                                                                                                 |
| Yarıçap                            | `--radius-control` (buton/input/duvar kenarlığı), `--radius-card` (Card)                                  | mevcut.                                                                                                                                                                                                                                             |
| Tipografi                          | `--font-size-h1`/`--font-size-body`/`--font-size-small`, `--font-weight-semibold`/`--font-weight-regular` | mevcut, T-008'den beri sabit.                                                                                                                                                                                                                       |

**Yeni token GEREKMİYOR.**

## Responsive plan

⚠ `A-T21-5`: görsel regresyon bu Task'ta **kapsam dışı** (`responsive/` dizini yok,
süper admin masaüstü öncelikli iç araç) — ama UX'in mobil davranış şartları **kapsam
dışı değil**, aşağıda tanımlanıyor; yalnızca Playwright görsel referansı gerekmiyor.

| Kırılım            | Düzen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **360px (temel)**  | Giriş/2FA/duvar ekranları tek sütun, `Card`/duvar tam genişlik. Kiracı listesi `DataTable` **gizlenir** (`md:hidden`'ın tersi — `hidden` altında), native `<ul>`/`<li>` kart görünümü **görünür**: her kart üstte Mağaza adı + Durum rozeti aynı satırda, altında Adres (slug, `font-mono`), altında Plan, en altta Oluşturulma. Denetim kaydı zaten `<ul>`/`<li>` — doğal olarak kart gibi reflow eder, ek markup gerekmiyor. Kabuk navigasyonu hamburger disclosure'a döner (yukarıda). |
| **768px (`md:`)**  | `DataTable` görünür olur (`hidden md:block`), kart listesi gizlenir (`md:hidden`). Kabuk `Sidebar` dikey şeride döner (admin'in `md:flex-col md:w-56` deseni, birebir).                                                                                                                                                                                                                                                                                                                   |
| **1024px (`lg:`)** | İçerik kapsayıcısı genişler (`lg:w-64` sidebar, admin'in deseni); `DataTable` sütun genişlikleri doğal akışta kalır, sabit genişlik zorlanmaz.                                                                                                                                                                                                                                                                                                                                            |
| **1280px (`xl:`)** | `AppShell`'in `xl:px-8` tavanı (admin'in deseni) — içerik maksimum genişliğe ulaşır, ek bir düzen değişikliği yok.                                                                                                                                                                                                                                                                                                                                                                        |

**İki `DataTable`-adayı ekranın dar ekranda taşma davranışı (GÖREVİN madde 3):**
Kiracı listesi yukarıdaki dual-markup (`DataTable` ↔ `<ul>/<li>`) ile **taşmayı hiç
üretmez** — dar ekranda `<table>` DOM'da bile yok. Denetim kaydı `<table>` hiç
kullanmadığı için taşma sorusu onda **oluşmuyor**. Eğer ileride `DataTable` tek
markup olarak zorlanırsa (örn. yukarıdaki dual-markup kararı reddedilirse), yedek
davranış: `<div className="overflow-x-auto">` ile yatay kaydırma — bu Task'ta **devrede
değil**, sadece not düşülüyor.

## Durum görselleri

| Durum                                  | Bileşen                                                         | Yerleşim                                        |
| -------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| Giriş/2FA — gönderiliyor               | `Button.isLoading`                                              | form içinde, mevcut mekanizma.                  |
| Giriş/2FA — form hatası                | `<p role="alert">` (form) / `Input.error` (2FA kod)             | yukarıdaki Bileşen eşlemesi tablosu.            |
| 2FA duvarı — yükleniyor                | yerel `LoadingState`                                            | kabuksuz, `h1`.                                 |
| 2FA duvarı — normal                    | `TwoFactorSetupWall`                                            | kabuksuz, `h1`.                                 |
| 2FA duvarı — `platform.session` hatası | yerel `ErrorState`                                              | kabuksuz, `h1`, duvar **gösterilmez**.          |
| Kiracı listesi — yükleniyor            | `Skeleton` × 5                                                  | `DataTable`'ın **dışında**, `<main>` içinde.    |
| Kiracı listesi — normal                | `DataTable` (≥768) / `<ul>/<li>` (<768)                         | `<main>` içinde.                                |
| Kiracı listesi — boş                   | yerel `EmptyState` (DataTable'ın `emptyState` prop'una geçilir) | `DataTable` içinde render edilir.               |
| Kiracı listesi — hata                  | yerel `ErrorState`                                              | `h2`, `<main>` içinde.                          |
| Denetim kaydı — yükleniyor             | `Skeleton` × 5                                                  | `<main>` içinde.                                |
| Denetim kaydı — normal                 | `<ul>`/`<li>`                                                   | `<main>` içinde.                                |
| Denetim kaydı — hata                   | yerel `ErrorState`                                              | `h2`, `<main>` içinde.                          |
| Kabuk — yükleniyor                     | yerel `LoadingState`                                            | `h1`, navigasyonsuz.                            |
| Kabuk — genel hata                     | yerel `ErrorState`                                              | `h1`, navigasyonsuz.                            |
| 403 — `PLATFORM_ADMIN_REQUIRED`        | `UnauthorizedWall`                                              | kabuksuz, tam sayfa.                            |
| 403 — `TWO_FACTOR_REQUIRED`            | `TwoFactorSetupWall`                                            | kabuksuz, tam sayfa (Ekran 3 ile aynı bileşen). |
| 403 — IP reddi                         | `NetworkBlockedWall`                                            | kabuksuz, tam sayfa.                            |

## İkonlar

**Bu plan yeni bir ikon kütüphanesi önermiyor.** Mevcut kod tabanında (`apps/admin`)
hiçbir ikon kütüphanesi (lucide-react dahil) **hiç kullanılmıyor** — dekoratif işaretler
bugüne kadar Unicode karakter + `aria-hidden` ile çözülmüş (`ConfirmDialog`'un kapatma
işareti `×`, Topbar'ın rozeti baş harfler). Bu plan **aynı deseni** izler: üç 403
duvarının görsel ayrımı tamamen **renk/kenarlık/tipografi** ile sağlanıyor (yukarıdaki
tablo), hiçbiri bir ikona ihtiyaç duymuyor. `lucide-react` eklemek yeni bir ana
bağımlılık olur ve CLAUDE.md §2 + `AGENT_BASELINE.md` §2 onay ister — bu plan o kapıyı
**açmıyor** (T-016/T-017'nin aynı kararı tekrarlanıyor).

## Tema sözleşmesi uyumu

**Bu görev `apps/storefront`'u kapsamıyor.** `apps/superadmin` Arkesoft'un kendi iç
aracı — tenant'a ait hiçbir görsel yüzeyi yok, dolayısıyla `theme-sdk` sözleşmesi bu
plana **tabi değil** (T-016/T-017'nin aynı gerekçeli N/A'sı). Panel kendi sabit tasarım
dilini (`@arkesoft/ui`'nin `theme.css`'i) kullanır; hiçbir ekranda tenant teması
okunmaz/render edilmez.

## Erişilebilirlik notları (frontend'in uyması gerekenler)

UX'in 10 maddelik denetim listesi, bileşen seviyesine indirilmiş hâliyle:

| UX madde                              | Sorumlu bileşen                                                | Sorumluluk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Odak sırası — giriş→2FA            | Ekran 1-2'nin ortak route dosyası                              | `headingRef`+`tabIndex={-1}`+`focus()` — T-016/T-019 deseni, yeni mekanizma icat edilmez.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2. Odak sırası — duvar ekranları      | `UnauthorizedWall`, `NetworkBlockedWall`, `TwoFactorSetupWall` | Üçü de kendi `h1`'ini taşır, mount'ta `focus()` çağırır — T-016 Ekran 9 deseni.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3. Klavye tuzağı yok                  | `Input`, `Button`, native `<a>`/`Link`                         | Hiçbir `div` tabanlı tıklanabilir alan yok — mobil nav disclosure'ı da gerçek `<button aria-expanded>`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4. Etiket↔hata ilişkisi               | `Input.error` (2FA kod alanı)                                  | ⚠⚠ **DÜZELTME (`docs`, T-021 gate fazı):** bu satır daha önce `W-3`'ü yanlış tarif ediyordu. Gerçek `W-3` (`ROADMAP.md:3244`, `T-019.md:1442`) **2.5.8 Hedef Boyutu**'dur — "Yedek kod kullanın"/"Kimlik doğrulayıcı kullanın" bağlantısının dokunma alanı 24×24px altında. Etiket↔hata ilişkisi (bu satırın konusu) **ayrı ve zaten temiz** bir eksendir, `W-3` ile karıştırılmaz: `aria-invalid`/`aria-describedby` doğru bağlı, form seviyesi hata (giriş ekranı) **field-level DEĞİL**, ayrı `role="alert"`. |
| 5. Ekran okuyucu — durum/eylem ayrımı | `UnauthorizedWall`                                             | Odaklanabilir ama işlevsiz kontrol **yok** — eylem düğmesi DOM'dan tamamen çıkar, `disabled` ile gizlenmez.                                                                                                                                                                                                                                                                                                                                                                                                      |
| 6. Durum renkle tek başına iletilmez  | Kiracı listesi Durum hücresi (`resolveTenantStatusLabel`)      | Her durumda görünür metin + dekoratif nokta; nokta tek başına bilgi taşımaz.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7. Liste semantiği                    | Denetim kaydı `<ul>`/`<li>`                                    | `<table>` zorlaması yok (UX'in kendi şartı) — bkz. "KARAR gerektiren gerilim" bölümü, bu şart **korunuyor**.                                                                                                                                                                                                                                                                                                                                                                                                     |
| 8. Kontrast WCAG AA                   | Üç 403 duvarının renk token'ları                               | Yukarıdaki "Tasarım token'ları" tablosundaki her çift zaten `CONTRAST_PAIRS`'te pinli — yeni bir kontrast testi gerekmiyor.                                                                                                                                                                                                                                                                                                                                                                                      |
| 9. Canlı bölge gürültüsü yok          | `ChallengeCountdown` (yerel kopya)                             | Yalnızca 60s/0s eşiklerinde `role="status"` duyuru — T-016'nın aynı disiplini, kopyada değiştirilmez.                                                                                                                                                                                                                                                                                                                                                                                                            |
| 10. Kabuk navigasyonu erişilebilir ad | `Sidebar`'ın `Link`leri                                        | Gerçek `<a>`/router bağlantıları, `aria-current="page"` aktif rotada.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Ek notlar:**

- `DataTable`'ın `caption` prop'u kullanılır (`sr-only`, "Mağaza listesi") — `scope="col"`
  bileşenin kendi mevcut davranışı, değişiklik gerekmiyor.
- Kiracı listesinin dual-markup'ı (`DataTable` ↔ `<ul>/<li>`) **aynı veriyi** iki kez
  render ediyor olsa da, CSS (`hidden`/`md:hidden`) her an sadece biri DOM'da
  **görünür** olacak şekilde ayarlanmalı — ikisi aynı anda ekran okuyucuya duyurulursa
  (örn. `display:none` yerine `visibility:hidden` kullanılırsa) içerik **iki kez**
  okunur; `frontend` `hidden` (gerçek `display:none`) sınıfını kullanmalı.
- "Çıkış yap" düğmesinin onay gerektirmemesi (UX kararı) `Button`'ın kendi `isLoading`
  durumuyla çift-tıklamaya karşı korunur — ek bir mekanizma gerekmiyor.

## Dosya türü disiplini (.ts vs .tsx) — R-PO13 emsali

`apps/admin`'in `vitest.config.ts`'inin `include: ['src/**/*.test.ts', ...]` deseni
`.tsx`'i test kapsamı dışında bırakıyor (T-019'un ölçtüğü, `apps/superadmin`'in kendi
`vitest.config.ts`'i de aynı desenle kurulacaksa **aynı sonuç** geçerli — `architect`/
`devops` teyit etmeli). Bu yüzden karar/eşleme mantığı `.ts` dosyalarına çıkar,
`.tsx` yalnızca render eder:

| Dosya (öneri, `.ts`)                                                              | Taşıdığı mantık                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/platform-session/platform-session-gate.ts`                              | Saf fonksiyon: `platform.session` sonucu (yükleniyor/hata/`isPlatformAdmin`/`twoFactorEnabled`) → hangi ekran/duvar render edilecek kararı. DOM gerektirmez, vitest ile dört dalın tamamı test edilebilir. |
| `features/tenants/tenant-status-label.ts`                                         | Saf fonksiyon `resolveTenantStatusLabel(status: TenantStatus)` — 4 üyelik kapalı sözlük (`satisfies Record<...>`, `device-label.ts`/`checklist-step-label.ts` deseni).                                     |
| `features/audit-log/audit-action-label.ts`                                        | Saf fonksiyon `resolveAuditActionLabel(action)` — 2 üyelik kapalı sözlük.                                                                                                                                  |
| `features/registration` benzeri bir `platform-session`'a özgü guard dosyası varsa | Route `beforeLoad`'ının saf karar fonksiyonu (örn. oturum yoksa `/giris`'e yönlendirme) — T-019'un `resolveHomeRedirectTarget` deseni.                                                                     |

| Dosya (render-only, `.tsx`)                                                                                                                                                                                          | Sorumluluğu                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `routes/giris.tsx`, `routes/iki-adimli-dogrulama.tsx`, `routes/index.tsx`, `routes/denetim-kaydi.tsx`                                                                                                                | İnce route dosyaları — yukarıdaki `.ts` yardımcılarını çağırır, render eder.                                                                                       |
| `components/UnauthorizedWall.tsx`, `TwoFactorSetupWall.tsx`, `NetworkBlockedWall.tsx`, `LoadingState.tsx`, `ErrorState.tsx`, `EmptyState.tsx`, `AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `ChallengeCountdown.tsx` | Sunum-only, mantık taşımaz.                                                                                                                                        |
| `features/tenants/TenantListView.tsx`, `features/audit-log/AuditLogView.tsx`                                                                                                                                         | Veri çeken konteyner bileşenleri (`useQuery` + yukarıdaki `.ts` etiket fonksiyonlarını çağırır) — `TwoFactorStatusCard`/`ActiveSessionsCard` deseniyle aynı ayrım. |

## ⚠⚠ KARAR gerektiren gerilim — Denetim kaydı `DataTable` mi `<ul>/<li>` mi

Orkestratörün handoff'u "İki liste için `DataTable` kullanımı" diyor; UX'in kendi
erişilebilirlik denetim listesi (madde 7) ise açıkça **"`<table>` zorlaması yok"**
diyerek Platform denetim kaydı için `<ul>`/`<li>`'yi **bağlayıcı** bir karar olarak
yazmış (heterojen içerik — aktör+eylem+konu+zaman — T-017'nin oturum listesi
gerekçesiyle birebir aynı). Bu plan **UX'in yazılı kararını değiştirmiyor** (görevin
yasağı: "UX akışını değiştirme... kendin düzeltme") — bu yüzden:

- **Kiracı listesi → `DataTable`** (handoff'un açık sütun listesiyle birebir eşleşiyor,
  homojen satır içeriği zaten tablo semantiğine uyuyor — gerilim yok).
- **Denetim kaydı → `<ul>`/`<li>`** (UX'in madde 7'si + T-017 emsali korunuyor).

Eğer Orkestratör "iki liste de `DataTable`" talebinde **ısrarcıysa**, zorlanmış hâli
şu şekilde olurdu: sütunlar `Aktör`/`Eylem`/`Konu`/`Zaman`, boş durum N/A (yapısal
olarak sıfır satır yok), yükleniyor `Skeleton`×5 — ama bu, `wcag`'ın aynı Task'ta
denetleyeceği madde 7'yi **doğrudan ihlal eder** ve UX'in kendi gerekçesini
(heterojen içerik → liste semantiği) geçersiz kılar. Bu plan **`<ul>`/`<li>`'yi
önerir**, nihai kararı Orkestratöre bırakır.

## RİSKLER (sonraki ajanların bilmesi gerekenler)

1. **Yukarıdaki "KARAR gerektiren gerilim"** — Orkestratör onaylamadan `frontend`
   ilerlememeli; bu plan `<ul>`/`<li>`'yi öneriyor ama bağlayıcı değil.
2. **Topbar'daki e-posta gösterimi VARSAYIM'a dayanıyor** — `platform.session`'ın
   e-posta döndürüp döndürmediği bu belgede doğrulanamadı (UX'in ADR-0023 özeti
   `isPlatformAdmin`/`twoFactorEnabled` dışında bir alan saymıyor). Dönmüyorsa
   `Topbar` admin'in `userId`-only dekoratif kısaltma desenine düşer — `backend`/
   `frontend` kesinleştirmeli.
3. **"Adres" (slug) hücresi için `--font-mono` kullanımı bu planın KARARI**, UX bunu
   açıkça istemedi/reddetmedi — `po`/`frontend` reddedebilir, düşük riskli.
4. **Kiracı listesinin dual-markup'ı (`DataTable` ↔ `<ul>/<li>`) iki paralel render**
   gerektiriyor — `frontend`'in `hidden`/`md:hidden` sınıflarını **doğru** kullanması
   şart (bkz. Erişilebilirlik notları), aksi halde ekran okuyucuya içerik iki kez
   duyurulur.
5. **`apps/superadmin/package.json`'ın Radix bağımlılığı almayacağı** bu planın
   kararı (Topbar'da dropdown yok, mobil nav native disclosure) — `architect`/
   `devops` scaffold ederken bunu `apps/admin`'in `package.json`'ından **kopyalamamalı**.
6. **`vitest.config.ts`'in `.tsx` hariç tutma deseninin `apps/superadmin`'de de
   geçerli olacağı** bu planın varsayımı — `architect`/`devops` scaffold aşamasında
   teyit etmeli (R-PO13 emsali, yukarıdaki "Dosya türü disiplini" bölümü).

AJAN: ui
DURUM: DONE
ÇIKTILAR: docs/ui/T-021-super-admin-iskeleti.md:1 — T-021 bileşen planı (altı ekran + üç 403 görsel ayrımı, DataTable/Skeleton/Button/Input/Card eşlemesi, üç yerel durum bileşeni kopyalama gerekçesi + borç satırı, token/responsive/durum/erişilebilirlik/dosya-türü notları)
KARARLAR:

- `@arkesoft/ui`'ye hiçbir ekleme/değişiklik önerilmedi — `DataTable`, `Button`, `Input`, `Card` ailesi, `Skeleton` mevcut haliyle yeterli (AC-2'nin yapısal garantisi korunuyor).
- `EmptyState`/`ErrorState`/`LoadingState` `apps/admin`'den `apps/superadmin`'e birebir yerel kopya olarak taşındı, `@arkesoft/ui`'ye terfi ettirilmedi — gerekçe + `SEV: low` borç satırı yazıldı.
- Üç 403 ekranı üç **ayrı** yerel bileşenle (`UnauthorizedWall`/`TwoFactorSetupWall`/`NetworkBlockedWall`) çözüldü, tek bir ortak "tone" prop'lu bileşen **bilerek reddedildi** (varsayılan ton riski).
- Kiracı listesi `DataTable`'ın T-008'den beri ilk gerçek tüketicisi oldu; dar ekranda `DataTable` ↔ `<ul>/<li>` dual-markup ile kart görünümüne geçiliyor (DataTable'ın kendi sunum-kabuğu sınırı nedeniyle).
- Denetim kaydı `DataTable` **yerine** `<ul>/<li>` ile çözüldü — UX'in madde 7'siyle handoff'un "iki liste DataTable" talebi arasındaki gerilim UX'in yazılı kararı korunarak çözüldü, nihai onay Orkestratöre bırakıldı.
  VARSAYIMLAR:
- Topbar'daki kimlik göstergesinin e-posta taşıyacağı (`platform.session`'ın alan kapsamı doğrulanamadı) — backend/frontend kesinleştirmeli.
- `apps/superadmin`'in `vitest.config.ts`'inin `apps/admin`'inkiyle aynı `.tsx` hariç tutma desenine sahip olacağı — devops/architect scaffold'da teyit etmeli.
- "Adres" hücresinde `--font-mono` kullanımı — po/frontend reddedebilir.
  RİSKLER: Yukarıdaki RİSKLER bölümünde 6 madde (DataTable/liste gerilimi, Topbar e-posta varsayımı, font-mono kararı, dual-markup ekran okuyucu tekrarı riski, Radix bağımlılığı taşınmaması, vitest .tsx deseni teyidi) — tam metin dosyanın içinde.
  SONRAKİ AJAN İÇİN NOT: `frontend` (uygulayacak ajan) önce RİSKLER #1'i (DataTable/liste gerilimi) Orkestratör'e sormalı, sonra bu planın "Dosya türü disiplini" tablosundaki `.ts`/`.tsx` ayrımını birebir uygulamalı. Üç 403 bileşeninin `role`/renk ayrımı (`UnauthorizedWall`=nötr/`status`, `TwoFactorSetupWall`=marka/`status`, `NetworkBlockedWall`=danger/`alert`) **bağlayıcı** — `wcag` bunu elle denetleyecek.
