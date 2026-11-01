# T-008 — wcag gate, tur 2

Tarih: 2026-11-01
Sürüm: ROADMAP v0.0.7 (platform 0.0.6 → 0.0.7)
Task: `.claude/workflow/tasks/T-008.md` → "Düzeltme Turu 1 — architect kararları" + "Gate Sonuçları — Tur 2"

```
GATE: wcag
SONUÇ: PASS
```

PASS gerekçesi (`AGENT_BASELINE.md` §4): critical 0, high 0, medium **1** (yeni — eşik
<3), low 2 (yeni) + 1 eski borç (ux'e ait, yeniden sayılmadı). Tur 1'in **1 high + 2
medium + 4 low**'unun **tamamı kapandı**, biri (**L1/skip-link**) kapanırken **farklı
doğada yeni bir medium bulguya evrildi** (aşağıda, §2).

## 0. Yöntem

`Bash` + canlı Playwright (gerçek dev sunucusu, `panel.arkesoft.localhost:5173`,
`vite --port 5173` ben başlattım — Orkestratör ortamı "port serbest" bıraktı, ben
kapattım, oturum sonu `lsof -i :5173` boş). `getComputedStyle`/`getBoundingClientRect`
canlı ölçüm + gerçek `vite build` (derlenmiş CSS artefaktı + bekçi script çıktısı) +
`emulateMedia({ reducedMotion: 'reduce' })` + 200% zoom emülasyonu (viewport 640×400,
CSS px sabit — standart teknik). `axe-core` **eklenmedi** (yeni bağımlılık, Orkestratör
onayı gerekir) — manuel liste tam koşuldu, aşağıda öneri olarak not edildi.

**Oran sınırı bütçesi:** Oturum başı Redis: `sign-in:ip=1/20`, `sign-up:ip=1/10`
(önceki ajanlardan kalıntı, Orkestratör'ün bildirdiğiyle **birebir**). Bu turda **7
gerçek sign-up + 7 gerçek sign-in** kullandım (oturum sonu: `sign-in:ip=8/20`,
`sign-up:ip=8/10`). Bu, tur 1'in (1+1) kullanımından **belirgin biçimde fazla** —
dürüst gerekçe: skip-link'in Enter-ile-odak-taşıma davranışını ve logout-sonrası
`storageState` yeniden kullanımını doğru sıralamaya oturtmak için **5 düzeltme-ölç
döngüsü** gerekti (ilk üç deneme kendi teşhis script'imin hatalarıydı — bkz. §5 "Kendi
hatalarım"), + 1 ayrı 200%/320px zoom probu. **Yeni kullanıcı TİPİ üretmedim** (aynı
`createVerifiedFixtureUser` + UI sign-in deseni, production testinin birebir aynısı);
sayaç **flush edilmedi**. Tavan (10/saat, 20/15dk) aşılmadı, kalan rezerv 2/10 ve
12/20 — bir sonraki ajan için hâlâ kullanılabilir ama tur1'deki kadar bol değil; bunu
Orkestratöre açıkça bildiriyorum.

**Geçici dosyalar:** `apps/admin/e2e/wcag-tur2-diagnostic.tmp.spec.ts` (ana teşhis,
5 revizyon, hepsi ölçüldü, **silindi**) + `apps/admin/e2e/wcag-tur2-zoom.tmp.spec.ts`
(200%/320px zoom probu, **silindi**) + `apps/admin/dist/` ve `apps/admin/test-results/`
(derlenmiş/test artefaktları, **silindi**). Oturum başı `git status --short` satır
sayısı **68**, oturum sonu **68** (BİREBİR AYNI, aşağıda kanıt).

```
$ git status --short | wc -l
      68
```

---

## 1. Tur 1'in 7 bulgusu — kapanış kararı

| # | Tur 1 | Karar | Dayanak (ekranda ölçülmüş) |
| - | ----- | ----- | --------------------------- |
| **H1** | `text-(--font-size-*)` → `color`'a derleniyor; hata metinleri lacivert; buton 3.45:1 riski (WCAG 1.4.3) | **KAPANDI** | `pnpm build` canlı koşuldu: `[check-compiled-css-contract] PASS — N1/N2/P1/P2 hepsi geçti` (332 bildirim, 23 referanslı token, 0 sapma). Derlenmiş CSS'te `grep 'color:var(--font-size'` → **0**; `font-size:var(--font-size-h1\|body\|small)` → **3/3 var**. Canlı DOM: `/sign-in` h1 `fontSize:"24px"` (tur1: 16px) · field-error `color:"rgb(185, 28, 28)"` (tur1: rgb(15,23,42) lacivert) · submit-error alert `color:"rgb(185, 28, 28)"`, `bg:"rgb(254, 242, 242)"` (tur1: lacivert). Birincil buton **hesapladım**: beyaz `#FFFFFF` / `brand-500 #2563EB` = **5.17:1** — 4.5:1'i geçiyor, VE artık **deterministik** (derleme sırasına bağlı DEĞİL): mekanik bekçi `color:var(--font-size-*)` desenini fail-closed yakaladığı için H1'in kök nedeni (cascade çarpışması) yapısal olarak kapandı, "bugün kazanıyor ama tesadüf" riski bitti. |
| **M1** (solid M2 çapraz) | `@source` globu `.ts`'i kaçırıyor; odak halkası literal kopyalara bağımlı (2.4.11/2.4.13) | **KAPANDI** | `apps/admin/src/styles.css:35` → `@source '...packages/ui/src/**/*.{ts,tsx}'` (ÖLÇÜLDÜ, `.ts` dahil). `Sidebar.tsx`/`UserMenu.tsx` artık literal `focus-visible:ring-...` TAŞIMIYOR, `@arkesoft/ui`'den `FOCUS_RING_CLASS_NAMES` import ediyor (kod okudum). Derlenmiş CSS'te `.focus-visible\:ring-\(--color-focus-ring\)` → **tam 1 bildirim** (tekrar kopya YOK, tek kaynaktan). Canlı ölçüm — odaklı/odaksız `boxShadow` farkı **5 ayrı öğede** doğrulandı: email input, submit button, sidebar "Panel" linki, UserMenu tetikleyicisi, **yeni skip-link** — hepsi birebir aynı desen (`rgb(255,255,255) 0 0 0 2px, rgb(37,99,235) 0 0 0 4px`). |
| **M2** (solid M5 çapraz) | Tanınmayan `issue.code` sessizce yutuluyor (3.3.1/3.3.3) | **KAPANDI** | `_auth.sign-in.tsx:52-73` okudum: her iki çözücü artık `errorType !== undefined` olduğunda **asla `undefined` dönmüyor** — tanınan kodlar kendi mesajına, tanınmayanlar `MESSAGES.auth.signIn.fieldGenericError`'a ("Bu alanda bir sorun var. Lütfen kontrol edip tekrar deneyin." — 3.3.3'ün istediği eylem önerisi VAR: "kontrol edip tekrar deneyin") düşüyor. Canlı ölçüm (boş gönderim, bilinen `too_small` yolu): `aria-invalid:"true"`, `aria-describedby:"_r_0_-error"`, hata `<p>` görünür VE kırmızı — üstüne react-hook-form'un `shouldFocusError` varsayılanı odağı **otomatik** email alanına taşıyor (ÖLÇTÜM: `active-element-after-submit = {tag:"INPUT", name:"email"}, — tur1'de belgelenmemiş POZİTİF bir davranış, screen reader kullanıcısı submit sonrası doğrudan hatalı alana düşüyor). Jenerik dalın kendisi (Zod şeması `too_small`/`invalid_format` dışında kod ÜRETMEDİĞİ için) bugün UI'dan hâlâ tetiklenemiyor — tur1'le AYNI, kod okumasıyla doğrulandı, bu BEKLENEN (savunma amaçlı, gelecekteki şema genişlemesi için). |
| **L1** | Skip-link yok (2.4.1) | **KISMEN KAPANDI → YENİ bir medium bulguya evrildi** | Skip-link EKLENDİ (`AppShell.tsx:59-67`, katalogdan metin, doğru odak halkası, ilk Tab durağı — ÖLÇTÜM: `app-first-tab = {tag:"A", text:"İçeriğe geç", href:"#main-content"}`, odaklanınca GÖRÜNÜR hâle geliyor: `{width:112, height:40, visibility:"visible", position:"absolute"}`, yalnızca ekran-okuyucuya değil GÖRSEL olarak da görünür — bu kısım tam istenen şekilde çalışıyor). **AMA** Enter'a basınca odak **main'e TAŞINMIYOR** — bkz. §2 yeni bulgu. |
| **L2** | `prefers-reduced-motion` yok (2.3.3, AAA) | **KAPANDI** | `Button.tsx:48` ve `LoadingState.tsx:53` → `motion-reduce:animate-none`. **`emulateMedia({ reducedMotion: 'reduce' })` ile CANLI doğrulandı** (sadece class varlığı DEĞİL): Button'un yükleniyor spinner'ı `{animationName:"none", animationDuration:"0s"}` — tercih GERÇEKTEN uygulanıyor, element `display` değişmiyor (gösterge görünür kalıyor, sadece dönme duruyor — istenen davranış). |
| **L3** | "Şifre"/"parola" tutarsızlığı | **AÇIK — kayıtlı borç, DEĞİŞMEDİ** | `messages.ts:107-117,181,186` okudum — tutarsızlık AYNEN duruyor (`passwordLabel:'Şifre'` vs `INVALID_EMAIL_OR_PASSWORD:'...parola...'`), ama artık **bilinçli kilitli**: dosya başı yorumu her iki yönün de (qa'nın `getByText('...parola...')` / `getByLabel('Şifre')`) birini kırdığını açıklıyor. Task dosyası bunu Orkestratör kararıyla **v0.0.8/ux**'a borçlamış — benim turumda yeniden saymıyorum, yalnızca değişmediğini teyit ediyorum. |
| **L4** | Devre dışı buton ~2.54:1 (WCAG muaf) | **KAPANDI (bilinçli, değişmedi)** | `Button.tsx:88-98` yorumu okudum — `disabled:opacity-60` KASITLI korunmuş, gerekçe (1.4.3/1.4.11 disabled istisnası) aynen duruyor. `docs/ui/T-008.md:122-126` bu kararı `wcag` tur1 raporumdan (satır 447-453) birebir alıntılıyor — **doğru alıntılanmış**, ekranda hâlâ aynı (kod değişmedi). İhlal değil, bulgu değil. |

---

## 2. YENİ bulgu — skip-link, odağı GERÇEKTEN `<main>`'e taşımıyor (WCAG 2.4.1 Bypass Blocks)

**Canlı ölçüm (authenticated dashboard):**
```
app-first-tab:                    {tag:"A", text:"İçeriğe geç", href:"#main-content"}
skiplink-visible-on-focus:        {width:112.2, height:40, visibility:"visible", position:"absolute"}
active-element-after-skiplink-enter: {tag:"BODY", id:"", tabIndex:-1}     ← main'e DEĞİL
tab-after-skiplink:                {tag:"A", text:"İçeriğe geç"}          ← skip-link'in KENDİSİNE geri dönüyor
```

**Kök neden:** `AppShell.tsx:80` → `<main id="main-content" className="flex-1 ...">` —
`tabIndex` **YOK**. Tarayıcı bir fragment bağlantısı (`href="#id"`) etkinleştiğinde
hedefi **yalnızca odaklanabilirse** (native focusable veya `tabindex` taşıyorsa)
odaklar; aksi halde (Chromium'un davranışı, ÖLÇÜLDÜ) odak **`<body>`**'ye düşer.
Bunun sonucu: kullanıcı Enter'a bastığında *görsel olarak* sayfa kaymıyor bile (zaten
`<main>` görünür alanda), odak **hiçbir yere taşınmıyor**, ve bir sonraki Tab DOM'un en
başından (skip-link'in kendisinden) yeniden başlıyor — **"atlama" mekanizması
fiilen HİÇBİR ŞEYİ atlamıyor**, kullanıcı aynı skip-link'i tekrar görür.

**Neden medium, high değil:** Klavye tuzağı YOK (kullanıcı tekrar Tab'layarak normal
sırayla içeriğe ulaşabilir — Topbar → Sidebar → main), form alanları etiketli, odak
göstergesi görünür, görev klavyeyle tamamlanabiliyor (ölçtüm, §5 "tam tur"). Ama
eklenen mekanizma **WCAG 2.4.1'in istediği "yinelenen blokları atlama" şartını
fiilen karşılamıyor** — bu, tur1'in L1 bulgusunun kapanışını iddia eden bir
düzeltmenin **kendisi kusurlu**, dolayısıyla AGENT_BASELINE §4'ün "standart ihlali,
erişilebilirlik engeli" tanımına tam uyuyor.

**Düzeltme:** `<main id="main-content" tabIndex={-1}>` — tek satır. Bu, native
olmayan odak hedefleri için standart WCAG deseni (WAI-ARIA Authoring Practices'in
"skip link" örneği). Regresyon koruması: `panel-flow.spec.ts`'e (veya yeni bir
`wcag`/`qa` test dosyasına) şu assertion eklenmeli: skip-link'e `Enter` sonrası
`document.activeElement.id === 'main-content'`.

- `apps/admin/src/components/AppShell.tsx:80`
- **Sorumlu:** `frontend` (S5). **Vade: bu sürüm** — tur1'in L1'ini "kapatan" değişikliğin
  bir parçası, ayrı bir borç satırı açmaya gerek yok, aynı değişiklik tek satırla tamamlanır.

---

## 3. YENİ bulgu (low) — AC11 "tam bir `h1`" şartı, kabuklu arka plan hatasında ihlal ediliyor

**Canlı ölçüm** (kimlik doğrulanmış oturum, mount-sonrası `session.me` ikinci isteği
deterministik 500 döndürülerek tetiklendi — `panel-flow.spec.ts`'in test (d)'siyle
AYNI mekanizma, bağımsızca yeniden ölçtüm):
```
bg-error-h1-count:          0
bg-error-h2-count:          1   ("Bir sorun oluştu")
bg-error-role-alert-visible: true
bg-error-shell-intact:      {userMenu: true, nav: true}
```

`_app.tsx:184-214`'teki `AppLayoutComponent`, arka plan yeniden doğrulaması
başarısız olduğunda `{panelError === null ? <Outlet/> : <ErrorState headingLevel="h2".../>}`
dallanmasıyla `Outlet`'i (route'un kendi `h1`'ini, "Panel") **tamamen unmount**
ediyor — ikisi birbirini DIŞLIYOR, yan yana KALMIYOR (task dosyasının Risk/karar
notları ve benim tur1 §2.3'teki "aynı DOM'da kalır" ifadem bu noktada **YANLIŞTI**,
düzeltiyorum). Sonuç: bu geçici durumda sayfada **hiçbir `h1` yok**, sadece bir `h2`.

**Neden low, medium değil:** Bu, `qa`'nın kendi testinde (`panel-flow.spec.ts:472`,
`toHaveCount(0)`) **bilinçli olarak pinlenmiş** bir davranış; dosya başı yorumu
(`:409-417`) WCAG'ın "sayfa başlığı" değişmezini bu geçici bildirim durumu için
**kapsam dışı** sayıyor gerekçesiyle açıklıyor. `ErrorState`'in `role="alert"`
taşıması (ÖLÇTÜM: `bg-error-role-alert-visible: true`) bu durumda içeriğin
(başlık + mesaj + "Tekrar dene") ekran okuyucuya **anında ve bütünüyle duyurulmasını**
sağlıyor — yani bilgi kaybı YOK, yalnızca **sonradan** heading-navigasyonu yapan bir
kullanıcı (NVDA/JAWS "H" tuşu) sayfada beklediği `h1`'i bulamaz. WCAG 2.2'de "her
sayfada tam bir `h1` olmalı" diye numaralandırılmış bir AA kriteri **yok** — en yakın
ilişkili kriterler 2.4.6 (Headings and Labels) ve 1.3.1 (Info and Relationships),
ikisi de bu durumda teknik olarak ihlal edilmiyor (mevcut başlık açıklayıcı, yapı
tutarlı). Bu nedenle bunu AC11'in **proje-içi** sözleşmesine karşı bir sapma olarak
kaydediyorum, numaralandırılmış bir AA ihlali olarak DEĞİL — **low**, iyileştirme
önerisi.

**Düzeltme önerisi (zorunlu değil):** `AppLayoutComponent`'in hata dalında route'un
kendi başlığını (`<Outlet/>`'ın `h1`'i) korumak mimari olarak zor (Outlet tamamen
başka bir bileşen ağacı) — alternatif: `ErrorState`'e `visuallyHidden` bir `h1`
("Panel — arka plan hatası") eklemek, heading-navigasyon kullanıcılarının bağlamı
kaybetmemesini sağlar. Bu bir **öneri**, mevcut `role="alert"` çözümü yeterli kabul
edilebilir.

- `apps/admin/src/routes/_app.tsx:184-214`
- **Sorumlu:** `ux`/`frontend` (isteğe bağlı, borç değil — bilinçli kabul).

---

## 4. YENİ bulgu (low) — `CONTRAST_PAIRS` sidebar çiftlerini kapsamıyor, `--color-brand-50` hiçbir testte pinlenmiyor

`docs/ui/T-008.md:118-124`'ün alıntıladığı üç oranı **yeniden hesapladım** (WCAG 2.1
formülü, bağımsız):
```
sidebar aktif link brand-500/brand-50:        4.75:1  (eşik 4.5:1, DAR PAY)  — doğru alıntılanmış
sidebar pasif link text-primary/surface-muted: 16.30:1 (eşik 4.5:1)          — doğru alıntılanmış
devre dışı buton beyaz/~#7CA1F3:                ~2.54:1 (muaf)               — doğru alıntılanmış
```
Üçü de `docs/ui/T-008.md`'de doğru kaydedilmiş. Ama `packages/ui/src/tokens.ts`'in
`CONTRAST_PAIRS`'i (10 çift) **hiçbiri `--color-brand-50`'yi kullanmıyor** (grep
doğruladım) — yani bu token'ın hex değeri değişirse (ör. bir sonraki tema turunda),
`tokens.test.ts`'in `it.each(CONTRAST_PAIRS)` süiti bunu **yakalamaz**; sidebar aktif
link kontrastı (4.75:1, 4.5 eşiğine 0.25 payla) sessizce 4.5'in altına düşebilir ve
hiçbir otomatik test kırılmaz.

**Neden low, medium değil:** Bugün ihlal YOK (ölçtüm, 4.75:1 geçiyor), risk
**gelecekteki bir token değişikliğine bağlı regresyon**, `ui`'nin kendi dokümanı
BİLEREK "ekleme öneriliyor" diye işaretlemiş (§"CONTRAST_PAIRS" tablosu, satır 122) —
yani zaten görünür bir öneri, benim bulgum bunu WCAG numarasına (1.4.3) bağlayıp
teyit ediyor, yeni bir keşif değil, **doğrulama**.

- `packages/ui/src/tokens.ts:63-120` (`CONTRAST_PAIRS`)
- **Düzeltme:** iki girdi ekle: `{label:'sidebar aktif link (brand-500/brand-50)', textHex: COLOR_TOKENS['--color-brand-500'], backgroundHex: COLOR_TOKENS['--color-brand-50'], threshold:4.5}` ve pasif link çifti.
- **Sorumlu:** `ui` (S2), vade: bir sonraki `packages/ui` dokunuşu — borç, bu sürümü FAIL ettirmez.

---

## 5. Diğer ölçümler (bulgu üretmeyen, DoD'un istediği doğrulamalar)

**Klavye — tam tur (fare `click`/`tap` kullanılmadı):**
```
tab1 (/sign-in):  INPUT type=email
tab2:             INPUT type=password
tab3:             BUTTON "Giriş yap"
full-tab-trace (authenticated): A "İçeriğe geç" → BUTTON "U4" (UserMenu) → A "Panel" (Sidebar)
                 → BODY (main'de focusable yok, döngü) → A "İçeriğe geç" → BUTTON "U4"
UserMenu:        Enter açar · Escape kapatır VE odağı tetikleyiciye GERİ VERİR
                 (ÖLÇTÜM: {tag:"BUTTON", ariaLabel:"Kullanıcı menüsü"}) · ArrowDown+Enter
                 ile "Çıkış yap" seçilir
Logout sonrası:  odak otomatik `/sign-in`'in `h1`'ine taşınıyor
                 (ÖLÇTÜM: {tag:"H1", tabIndex:-1, text:"Giriş yap"}), `document.title`
                 güncelleniyor ("Giriş yap · Arkesoft Panel") — SPA rota geçişi screen
                 reader'a doğru duyuruluyor (programatik odak deseni, tur1'de de PASS).
```

**Tipografi/renk (H1'in kapanışının kanıtı, tekrar değil — farklı sayfa/senaryo):**
```
/sign-in h1:      {fontSize:"24px", color:"rgb(15, 23, 42)", fontWeight:"600"}
label:            {fontSize:"16px", color:"rgb(15, 23, 42)"}
button:           {fontSize:"16px", color:"rgb(255, 255, 255)", backgroundColor:"rgb(37, 99, 235)"}
field-error:       {color:"rgb(185, 28, 28)", fontSize:"14px"}
submit-error alert:{bg:"rgb(254, 242, 242)", textColor:"rgb(185, 28, 28)", fontSize:"14px"}
```
Hiyerarşi doğru: h1 (24px) > body/label/button (16px) > small/error (14px).

**Odak halkası (box-shadow, 5 öğe, hepsi birebir aynı desen):**
```
unfocused:  boxShadow:"none"
focused:    rgb(255,255,255) 0 0 0 2px, rgb(37,99,235) 0 0 0 4px   (+ rgba(0,0,0,0) dolgu katmanları)
```
Hesaplanan kontrast: `#2563EB`/`#FFFFFF` = **5.17:1** (eşik 3:1, PASS).

**`prefers-reduced-motion` (emüle edilerek):**
```
reduced-motion-button-spinner: {animationName:"none", animationDuration:"0s"}
```

**320px reflow + hedef boyutu (sign-in VE dashboard, ikisi de yeniden ölçüldü):**
```
signin-reflow-320:              false
signin-email-rect-320:          {width:238, height:44}
signin-button-rect-320:         {width:238, height:44}
dashboard-320-reflow:           false
dashboard-320-usermenu-rect:    {width:44, height:44}
dashboard-320-sidebar-link-rect:{width:63.6, height:44}
```
Hepsi ≥24×24 (2.5.8), hatta ≥44×44 (AAA eşiğini de karşılıyor, gerekmese de).

**200% zoom (emüle edildi — viewport 640×400, standart teknik):**
```
signin-zoom200-reflow:          false   (h1/button görünür kalıyor)
dashboard-zoom200-reflow:       false   (h1/UserMenu/nav görünür kalıyor)
```
WCAG 1.4.4/1.4.10 açısından temiz.

**Landmark yapısı:**
```
/sign-in:        {headers:0, navs:0, mains:1, h1Count:1}   (AppShell YOK, kendi main'i var — doğru)
authenticated:   {headers:1, navs:1, mains:1, h1Count:1}
```

**Mekanik bekçi + build (ekranda ölçülen artefakt):**
```
$ pnpm build (apps/admin)
[check-compiled-css-contract] taranan CSS dosyası sayısı: 1, bildirim sayısı: 332,
  @theme token tanımı: 24, kaynakta referans verilen token sayısı: 23
[check-compiled-css-contract] PASS — N1/N2/P1/P2 hepsi geçti.
[bundle-budget] paylaşılan çekirdek — JS (gzip): 131.47 KiB, CSS (gzip): 3.56 KiB
[bundle-budget] kimlikli ilk ekran (/) — JS (gzip): 174.53 KiB / 250 KiB
[bundle-budget] kimliksiz ilk ekran (/sign-in) — JS (gzip): 154.81 KiB / 250 KiB
```
Orkestratör'ün bildirdiği sayılarla **birebir eşleşiyor** — bağımsızca doğrulandı.

**`pnpm lint` (apps/admin, kendi geçici dosyalarım silindikten SONRA):** `17/17 FULL TURBO`
— `jsx-a11y` dahil temiz. **Neyi KAPSAMIYOR (bu turda kanıtlandı):** skip-link'in
odak-hedefi eksikliği (§2 — statik bir JSX kuralı değil, runtime/DOM-semantik bir
kusur), kontrast oranları, `prefers-reduced-motion`'ın GERÇEKTEN etkili olup
olmadığı, AC11'in h1=0 durumu, SPA rota geçişi duyurusu — hepsi yalnızca canlı
ölçümle (bu rapor) yakalanabiliyor; `jsx-a11y` **tamamlayıcı**, yedek değil (tur1'in
aynı tespiti, bu turda YENİ örneklerle TEYİT edildi).

**`axe-core` önerisi (eklenmedi):** Bu turun en pahalı kısmı (5 düzeltme-ölç döngüsü,
§0) manuel Playwright prob yazmanın kırılganlığından kaynaklandı — eğer v0.0.19'un
test altyapısı genişlemesi kapsamına `@axe-core/playwright` girerse (yeni bağımlılık,
Orkestratör onayı), skip-link'in odak-hedefi gibi DOM-seviyeli kusurların bir kısmı
(ama H1/kontrast-cascade gibi derlenmiş-CSS kusurlarının HİÇBİRİ — axe render edilmiş
stili okur, "hangi Tailwind sınıfı hangi deklarasyona dönüştü" sorusunu sormaz) daha
hızlı taranabilir. Bu bir **öneri**, bu turun FAIL/PASS kararını etkilemiyor.

---

## 6. ÖLÇÜMLER

```
ÖLÇÜMLER:
  Ortam: dev sunucu BEN başlattım (vite --port 5173, panel.arkesoft.localhost:5173,
         Orkestratör "port serbest" bıraktı), oturum sonu KAPATTIM (lsof -i :5173 boş).
         Gerçek API (PID 22043, Orkestratör'ün bıraktığı süreç, DOKUNULMADI), /health 200.

  Oran sınırı bütçesi (oturum başı → sonu):
    sign-in:ip   1/20 → 8/20   (7 yeni — 5 düzeltme-ölç döngüsü + 1 ayrı zoom probu +
                 kendi hatalarımdan kaynaklanan 3 fazladan döngü, §0'da gerekçeli)
    sign-up:ip   1/10 → 8/10   (aynı 7 döngü, her biri 1 createVerifiedFixtureUser)
    Tavan AŞILMADI. Kalan rezerv: sign-in 12/20, sign-up 2/10 — bir sonraki ajana
    bildirilmesi gereken, tur1'den daha dar bir rezerv.
    Yeni kullanıcı TİPİ üretilmedi (production'daki createVerifiedFixtureUser deseni
    birebir tekrarlandı); sayaç flush edilmedi.

  Canlı ölçümler (gerçek getComputedStyle/getBoundingClientRect, bu turda):
    /sign-in h1 font-size:             24px   (tur1: 16px → KAPANDI)
    field-error metin rengi:           rgb(185,28,28)  (tur1: rgb(15,23,42) → KAPANDI)
    submit-error alert metin rengi:    rgb(185,28,28)  (tur1: rgb(15,23,42) → KAPANDI)
    birincil buton (beyaz/brand-500):  5.17:1 (hesaplandı, 4.5:1 eşiği PASS, deterministik)
    odak halkası (5 öğe, hepsi):       none → rgb(255,255,255) 0 0 0 2px, rgb(37,99,235) 0 0 0 4px
    skip-link ilk-tab durağı:          A "İçeriğe geç", odaklanınca görünür (112×40px)
    skip-link Enter-sonrası odak:      BODY (main'e TAŞINMIYOR — YENİ bulgu, §2)
    reduced-motion spinner:            animationName:"none", animationDuration:"0s"
    320px reflow (sign-in+dashboard):  false (ikisi de)
    200% zoom reflow (sign-in+dashboard): false (ikisi de, emüle edilerek)
    dokunma hedefleri (320px):         44×44 (UserMenu) · 63.6×44 (sidebar) · 238×44 (form)
    kabuklu arka plan hatası h1 sayısı: 0  (role="alert" ile telafi — YENİ low bulgu, §3)
    landmark (sign-in):                {headers:0, navs:0, mains:1, h1:1}
    landmark (authenticated):          {headers:1, navs:1, mains:1, h1:1}

  Hesaplanan kontrast oranları (WCAG 2.1 formülü, bağımsızca):
    beyaz/brand-500 (buton metni):            5.17:1  (eşik 4.5:1) PASS
    danger-600/surface (hata metni):          6.47:1  (eşik 4.5:1) PASS
    danger-600/danger-surface:                5.91:1  (eşik 4.5:1) PASS
    focus-ring/surface:                       5.17:1  (eşik 3:1)   PASS
    sidebar aktif brand-500/brand-50:         4.75:1  (eşik 4.5:1) PASS (dar pay, CONTRAST_PAIRS'te YOK — low bulgu §4)
    sidebar pasif text-primary/surface-muted: 16.30:1 (eşik 4.5:1) PASS

  Statik/artefakt ölçümleri:
    pnpm build (apps/admin):        PASS, N1/N2/P1/P2 hepsi geçti (332 bildirim, 23 token)
    bundle-budget:                  174.53 / 154.81 / 131.47 / 3.56 KiB (Orkestratör'le birebir)
    derlenmiş CSS color:var(--font-size pattern:  0
    derlenmiş CSS font-size:var(--font-size-*):   3/3 (h1, body, small)
    derlenmiş CSS .focus-visible\:ring-(--color-focus-ring) bildirim sayısı: 1 (tek kaynak)
    pnpm lint (apps/admin, geçici dosyalar silindikten sonra): 17/17 FULL TURBO

  İncelenen dosya/bileşen: 9 (AppShell, Button, LoadingState, Input, ErrorState,
    EmptyState, Topbar, Sidebar, UserMenu) + 2 route (_app.tsx, _auth.sign-in.tsx,
    _app.index.tsx) + messages.ts + tokens.ts + theme.css + check-compiled-css-contract.ts
    (başlık okuması) + 4 önceki gate tur2 raporu (solid/security/perf/qa, toplam ~1800 satır)
    + kendi tur1 raporum (529 satır)

  Bulgu dağılımı (bu tur, YENİ): critical 0 · high 0 · medium 1 (skip-link odak-hedefi,
    §2) · low 2 (AC11 h1=0 §3, CONTRAST_PAIRS gap §4)
  Tur1'in 7 bulgusu: 5 KAPANDI (H1, M1, M2, L2, L4) · 1 AÇIK/borç değişmedi (L3, ux) ·
    1 kısmen kapanıp farklı doğada yeniden açıldı (L1 → §2'nin medium'u)

  Geçici dosyalar (hepsi silindi, git status --short ile doğrulandı):
    apps/admin/e2e/wcag-tur2-diagnostic.tmp.spec.ts   (5 revizyon, hepsi ölçüldü, silindi)
    apps/admin/e2e/wcag-tur2-zoom.tmp.spec.ts         (1 koşum, ölçüldü, silindi)
    apps/admin/dist/, apps/admin/test-results/        (build/test artefaktları, silindi)
    vite dev süreci (PID 21900, ben başlattım)        (kapatıldı, lsof -i :5173 boş)
  Oturum başı git status --short satır sayısı: 68 · oturum sonu: 68 (BİREBİR AYNI)
```

**SONUÇ: PASS** — `AGENT_BASELINE.md` §4: 0 critical/high, 1 medium (<3 eşik) → PASS,
bulgular teknik borca kaydedilir. **Dikkat:** §2'nin medium bulgusu (skip-link main'e
odak taşımıyor) tur1'in L1'ini "kapatan" değişikliğin **kendisindeki** bir kusur —
tek satırlık düzeltme (`tabIndex={-1}`), bir sonraki dokunuşta (bu sürümde veya hemen
ardından) kapatılmalı; AC11/AC12'nin mekanik testleri bunu YAKALAMAZ (yalnızca
`getByRole`/`getByLabel` ile görünürlük ölçüyorlar, odak-hedefi taşımasını ÖLÇMÜYORLAR)
— regresyon koruması önerisi §2'de.
