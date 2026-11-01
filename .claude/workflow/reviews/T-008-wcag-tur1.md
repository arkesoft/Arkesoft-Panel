# T-008 — wcag gate, tur 1

Tarih: 2026-11-01
Sürüm: ROADMAP v0.0.7 (platform 0.0.6 → 0.0.7)
Task: `.claude/workflow/tasks/T-008.md`
İlk koşum (bu ajan bu projede ilk kez çalışıyor).

```
GATE: wcag
SONUÇ: FAIL
```

FAIL gerekçesi (`AGENT_BASELINE.md` §4): **1 `high`** (tek başına yeterli). Ayrıca
2 `medium` (eşik ≥3'ün altında, tek başına FAIL üretmezdi) + 4 `low`.

---

## 0. Yöntem

`Bash` aracım var. Statik okuma (solid/qa/security/perf tur1 raporları + kaynak kod)
+ canlı Playwright koşumları (gerçek dev sunucusu, `panel.arkesoft.localhost:5173`) +
gerçek `getComputedStyle`/`getBoundingClientRect` ölçümleri + derlenmiş CSS analizi
kullanıldı. `axe-core` **eklenmedi** (yeni bağımlılık — Orkestratör onayı gerekir);
gerekiyorsa aşağıda öneri olarak not edildi.

**Oran sınırı bütçesi:** Oturum başında Redis'te `platform:auth:post-auth-sign-in-email:ip:*=1`,
`...sign-up-email:ip:*=1` bulundu (önceki ajanlardan kalıntı, düşük). Bu turda **1 yeni
sign-up + 1 yeni sign-in** kullandım (kimlik doğrulanmış dashboard görünümünü 320px/
landmark/tab-order için ölçmek üzere); turun geri kalanı (AC12 odak testi, hata mesajı
rengi testi) `page.route()` mock'ları ile **sıfır gerçek auth maliyetiyle** yapıldı.
Oturum sonu Redis durumu: `sign-in=1/20`, `sign-up=2/10` — bütçe bolca korunuyor.

**Geçici dosyalar:** `apps/admin/e2e/wcag-diagnostic{,2,3,4}.tmp.spec.ts` (4 adet, teşhis
için yazıldı, ölçüldü, **hepsi silindi**) + `apps/admin/src/routes/_auth.sign-in.tsx`
üzerinde **tek satırlık kasıtlı bozma** (`text-(--font-size-h1)` →
`text-(length:--font-size-h1)`, aşağıdaki H1 bulgusunun kanıtı) — ölçüldü, **orijinaline
geri alındı** (`/tmp/sign-in-backup.tsx` yedeğiyle birebir karşılaştırıldı). Oturum sonu
`git status --short` satır sayısı oturum başıyla **birebir aynı (61)** — kanıt aşağıda.

---

## 1. Yeni bulgu — H1: `text-(--font-size-*)` Tailwind v4 söz dizimi `color`'a derleniyor, `font-size`'a DEĞİL

Bu, bu turun **en önemli keşfi** ve mevcut gate raporlarının hiçbirinde yok. Tam olarak
bu sürümün merkezi dersiyle (S2/S5'in `[--x]`→`(--x)` bulgusu, solid H1, qa'nın çapraz
doğrulaması) **AYNI sınıftan** ama **farklı bir Tailwind v4 belirsizliği** yüzünden
doğuyor: `text-*` utility'si hem `color` hem `font-size` taşıyabiliyor; bir CSS özel
özelliğine (`--font-size-h1` gibi) **tip ipucu olmadan** (`text-(--x)`) referans
verildiğinde Tailwind bunu **renk** olarak yorumluyor — doğru söz dizimi
`text-(length:--font-size-h1)`.

**Kapsam — 23 kullanım, 13 dosya (hepsi etkili):**
```
$ grep -rln "text-(--font-size-" apps/admin/src packages/ui/src
apps/admin/src/components/{ErrorState,Topbar,UserMenu,LoadingState,Sidebar,EmptyState}.tsx
apps/admin/src/routes/{_app.index,_auth.sign-in}.tsx
packages/ui/src/components/{Button,Card,DataTable,Input,Toast}.tsx
$ grep -rno "text-(--font-size-[a-z0-9]*)" apps/admin/src packages/ui/src | wc -l
23
```

**Kanıt A — font-size HİÇBİR YERDE uygulanmıyor (canlı ölçüm, `/sign-in`):**
```
h1-style    {"fontSize":"16px","color":"rgb(15, 23, 42)"}   # beklenen: 24px (--font-size-h1: 1.5rem)
label-style {"fontSize":"16px","color":"rgb(15, 23, 42)"}   # beklenen: 16px (--font-size-body — tesadüfen doğru)
button-style{"fontSize":"16px","color":"rgb(255, 255, 255)"}
```
Derlenen CSS'te kanıt: `.text-\(--font-size-h1\){color:var(--font-size-h1)}` —
`font-size` DEĞİL, `color` üretiliyor; aynısı `--font-size-body`/`--font-size-small` için
de geçerli. Karşılaştırma: `.font-\(--font-weight-semibold\){font-weight:var(...)}` —
`font-*` (ağırlık) namespace'i DOĞRU derleniyor, yalnızca `text-*` (boyut) etkili.

**Kanıt B — kasıtlı düzeltme ile doğrulandı (kanıtlanmış kök neden):**
`_auth.sign-in.tsx:123`'teki `text-(--font-size-h1)` → `text-(length:--font-size-h1)`
yapıldı, dev sunucu HMR ile yeniden derledi, ölçüm tekrarlandı:
```
h1-style {"fontSize":"24px","color":"rgb(15, 23, 42)"}   # DOĞRU — 1.5rem
```
Değişiklik **orijinaline geri alındı** (`/tmp/sign-in-backup.tsx` ile `diff` karşılaştırması
sıfır fark verdi), tekrar ölçüldü → `16px` (bozuk hâline döndüğü teyitli).

**Kanıt C — bu DAHA KÖTÜSÜ: bazı elemanlarda RENK de bozuluyor (CSS cascade çarpışması).**
`color` özelliğini AYNI elemanda iki Tailwind utility'si hedefliyor: bozuk
`text-(--font-size-*)` (geçersiz değer → "invalid at computed-value time" → **inherited**
değere düşer) ile doğru `text-(--color-*)`. Hangisinin "kazandığı" derlenmiş
stylesheet'teki SIRAYA bağlı (ikisi de tek sınıf seçici, eşit özgüllük). Canlı ölçümle
İKİ GERÇEK örnekte renk utility'sinin **kaybettiği** doğrulandı:

```
# _auth.sign-in.tsx:137-141 — gönderim hatası kutusu (role="alert")
#   className: "... text-(--font-size-small) text-(--color-danger-600)"
submit-error-alert-text-style {"color":"rgb(15, 23, 42)","fontSize":"16px"}
#   BEKLENEN: rgb(185, 28, 28) (#B91C1C, danger-600/kırmızı). GERÇEK: text-primary (lacivert).

# Input.tsx:53 — alan doğrulama hatası <p>
#   className: "text-(--font-size-small) text-(--color-danger-600)"
field-error-style {"color":"rgb(15, 23, 42)","fontSize":"16px"}
#   AYNI sorun — "E-posta adresinizi girin." hatası da KIRMIZI DEĞİL, lacivert.
```

Derlenmiş CSS'te sıra teyit edildi (`apps/admin/dist/assets/*.css`, byte pozisyonu):
tüm `--color-*` hedefli `text-*` kuralları (brand-500, danger-600, success-600,
text-inverse, text-primary, text-secondary — pozisyon 8916–9219) **önce**, tüm
`--font-size-*` hedefli kurallar (body/h1/small — pozisyon 9286–9392) **sonra** geliyor
→ bozuk kural kazanıyor, renk utility'si etkisiz kalıyor.

**Neden `high` (WCAG 1.4.3 Contrast (Minimum) — gerçek, hesaplanmış risk):**
Bugün HER iki örnekte de fallback (inherited `text-primary`, çok koyu) açık arka
zeminler (danger-surface, surface) üzerinde **kontrastı KAZARA düşürmüyor** (hesapladım:
text-primary/danger-surface ≈ 17:1 — geçiyor). Ama mekanizma **öngörülemez** ve
**sıralamaya bağlı**: birincil `Button`'da (`text-(--color-text-inverse)` +
`text-(--font-size-body)`, AYNI çarpışma deseni) bugün BEYAZ metin KAZANIYOR (ölçtüm,
`button-style` yukarıda) — ama bu **tesadüf**, derlenmiş CSS'teki sıraya bağlı, kodun
niyetine değil. Eğer aynı çarpışma Button'da da (herhangi bir derleme/import sırası
değişikliğiyle) renk utility'sinin KAYBETMESİ yönüne dönerse: metin **inherited
`text-primary` (#0F172A)** olur, zemin **`brand-500` (#2563EB)** kalır →
**hesapladım: kontrast 3.45:1 — 4.5:1 AA eşiğini KIRAR.** Yani bu sürümün en kritik
etkileşimli öğesi (giriş butonu) bir derleme-sırası değişikliğiyle WCAG 1.4.3'ü ihlal
edecek bir uçurumun kenarında. Bu, S2/S5'in bu oturumda zaten "istatistiksel olarak hiçbir
statik/dinamik kapının yakalayamadığı" sınıf olarak tescil ettiği hata sınıfının (solid
H1, qa'nın çapraz doğrulaması) **üçüncü, hâlâ DÜZELTİLMEMİŞ örneği** — ve ilk ikisinden
farklı olarak **şu anda aktif ve gözle görülür** (hata mesajları KIRMIZI DEĞİL),
düzeltilmiş bir hatanın regresyon koruması eksikliği değil, düzeltilmemiş bir hata.
Hiçbir test (ne `tokens.test.ts`, ne qa'nın yeni testleri) bunu ölçmüyor — qa'nın
testleri hata metninin GÖRÜNÜRLÜĞÜNÜ/İÇERİĞİNİ assert ediyor, RENGİNİ değil.

**Düzeltme:** `packages/ui` + `apps/admin`'deki tüm `text-(--font-size-*)` kullanımlarını
`text-(length:--font-size-*)` yap (23 yer, 13 dosya). Regresyon koruması: `tokens.test.ts`'e
veya yeni bir build-sonrası script'e derlenmiş CSS'te `text-\(--font-size-[a-z]*\)\s*{\s*color:`
desenininin **0** olduğunu pinleyen bir kontrol eklenmeli (S2'nin AC13 kör noktası önerisinin
doğal uzantısı — `check-bundle-budget.ts` deseniyle aynı, yeni bağımlılık istemez).
**Sorumlu ajan:** `frontend` (S2 — `packages/ui` beş bileşen + S5 — `apps/admin` yedi
bileşen/iki rota).

---

## 2. Altı özel dikkat maddesi

### 2.1 — Odak göstergesinin gerçekten ekranda olması (2.4.11/2.4.13)

**Canlı ölçüm (`/sign-in`, oturum gerekmez):**
```
email-unfocused {"outlineStyle":"none","boxShadow":"none"}
email-focused   {"outlineStyle":"none","boxShadow":"rgba(0,0,0,0) 0 0 0 0, rgba(0,0,0,0) 0 0 0 0,
                  rgb(255,255,255) 0 0 0 2px, rgb(37,99,235) 0 0 0 4px, rgba(0,0,0,0) 0 0 0 0"}
button-focused  {"outlineStyle":"none","boxShadow":"... rgb(255,255,255) 0 0 0 2px, rgb(37,99,235) 0 0 0 4px ..."}
```
Yorumlama: native `outline` bilinçli kaldırılmış (`outline-none`) ve **eşdeğeri** (Tailwind
`ring` deseni → `box-shadow`) KONMUŞ — AC12'nin "çıplak `outline-none` yasak" şartı
karşılanıyor. Halka 2px beyaz ofset + 2px mavi (`#2563EB`, token'daki `--color-focus-ring`
ile birebir) — toplam ~2px kalın, net görünür bir halka. Odaklı/odaksız durum FARKLI
(2.4.11/2.4.13'ün çekirdek şartı) — hem `Input` hem `Button` için canlı doğrulandı
(qa'nın `(A)` testiyle çapraz doğrulama + benim bağımsız ölçümüm, birebir aynı sonuç).

**Kontrast:** halka rengi `#2563EB` / zemin `#FFFFFF` → hesapladım: **5.17:1** — 3:1 eşiğini
rahatça geçiyor (`tokens.ts`'in `CONTRAST_PAIRS`'teki "focus-ring/surface" girdisiyle
TUTARLI, ama benim ölçümüm **gerçek halkanın renk DEĞERİNİ** `getComputedStyle`'dan okuyarak
yapıldı — token dosyasına değil tarayıcıya güvenerek).

`grep outline-none` çıktısının **tamamı** (AC12'nin istediği, dört satır, kod):
```
apps/admin/src/components/Sidebar.tsx:28:  'focus-visible:outline-none focus-visible:ring-2 ...'
apps/admin/src/components/UserMenu.tsx:27: 'focus-visible:outline-none focus-visible:ring-2 ...'
packages/ui/src/tokens.ts:133:             'focus-visible:outline-none focus-visible:ring-2 ...'
```
Üçünün hepsinde `outline-none` **her zaman** `focus-visible:` ön ekiyle VE aynı satırda
`ring-2`/`ring-offset-2`/`ring-(--color-focus-ring)` ile birlikte — çıplak/eşlikçisiz
`outline-none` **0**. **PASS.**

**Kaydırılabilir alanda kabuğun altında kalma (2.4.11 Focus Not Obscured):** tek sabit
header/sidebar var ama hiçbiri `position: sticky/fixed` ile overlay yapmıyor (AppShell
düz flex düzeni, `Topbar.tsx`/`Sidebar.tsx` okudum — konumlandırma yok) → odak hiçbir
sabit öğenin altında kalmıyor. **PASS** (bu sürümde risk yok, ileride sticky eklenirse
yeniden ölçülmeli).

### 2.2 — `@source` glob `.ts`'i kaçırıyor (solid M2) — BAĞIMSIZCA DOĞRULANDI

```
$ grep -rn "focus-visible:ring-(--color-focus-ring)" packages/ui/src apps/admin/src
packages/ui/src/tokens.ts:133:        (KANONİK — .ts, glob'un DIŞINDA)
apps/admin/src/components/UserMenu.tsx:27:   (KOPYA — .tsx, apps/admin'in KENDİ varsayılan taramasında)
apps/admin/src/components/Sidebar.tsx:28:    (KOPYA — .tsx, aynı)
```
`apps/admin/src/styles.css:27`: `@source '../../../packages/ui/src/**/*.tsx';` — yalnızca
`.tsx`. `packages/ui/src/components/Button.tsx`/`Input.tsx` literal dizeyi TAŞIMIYOR,
yalnızca `FOCUS_RING_CLASS_NAMES` değişkenini import ediyor (`import { FOCUS_RING_CLASS_NAMES }
from '../tokens'`) — Tailwind'in metin tabanlı tarayıcısı DEĞİŞKEN ADINI değil, LİTERAL
DİZEYİ arar. Yani `packages/ui`'nin KENDİ içeriği (glob doğru çalışsa bile, çalışmıyor
çünkü kaynak `.ts`'te) bu utility'leri ASLA üretmez. **Bugün** derlenen CSS'te bu
utility'ler VAR OLMASININ **TEK SEBEBİ** `Sidebar.tsx`/`UserMenu.tsx`'teki literal
kopyaların `apps/admin/src` içinde (varsayılan taranan kök) olması — bağımsızca
doğruladım, solid'in iddiasıyla BİREBİR örtüşüyor.
**Sonuç:** `solid` M1 (tekrar temizliği — kopyaları silip `@arkesoft/ui`'den import etmek)
`@source` glob'u `.ts`'i de kapsayacak şekilde (`**/*.{ts,tsx}`) GÜNCELLENMEDEN yapılırsa,
`Button`/`Input`/`Sidebar`/`UserMenu`'nün HEPSİNDEN odak halkası **sessizce** kaybolur —
2.4.11/2.4.13'ün tam ihlali, hiçbir test yakalamaz (H1'in birebir aynı mekanizması).
`solid`'in medium kategorisine **katılıyorum** — bugün BOZUK değil (ölçtüm, çalışıyor),
ama tek bir "doğru" refactor'la (M1) kırılacak, zaten tanımlanmış bir risk. **medium**
olarak kaydediyorum (solid'in M2'siyle çapraz doğrulama, yeni bir bulgu değil — ama WCAG
numarasına (2.4.11/2.4.13) bağlıyorum).

### 2.3 — `headingLevel` asimetrisinin `h2` kolu

Kod okuması (`_app.tsx:115-206`): `AppLayoutComponent` guard BAŞARILI olduktan SONRA
`useQuery(sessionMeQueryOptions)` kendi gözlemcisini kuruyor; bu gözlemci guard'ın
`staleTime:'static'` override'ını TAŞIMIYOR → varsayılan `staleTime:0` + varsayılan
`refetchOnReconnect:true` → bağlantı kesilip yeniden kurulduğunda arka planda otomatik
yeniden doğrulama. Başarısız olursa `AppShell` YERİNDE kalıp `<main>` içeriği
`ErrorState headingLevel="h2"` olur (`_app.tsx:191-203`) — route'un KENDİ `h1`'i
(`_app.index.tsx:31`, "Panel") AppShell'in İÇİNDE, AYNI DOM'da kalır. Bu konfigürasyon
("route h1 + ErrorState aynı DOM'da") çift `h1` riskinin **gerçekten doğabileceği TEK
yer** (solid M8'in tam olarak işaret ettiği).

`qa`'nın `(F)` testi (`qa-blind-spot-and-negative-scenarios.qa.spec.ts:369-410`) bunu
`context.setOffline(true)`→`(false)` ile GERÇEKTEN tetikleyip canlı doğrulamış: `h2`
render ediliyor, sayfada `h1` sayısı hâlâ **1** (route'un kendi `h1`'i), çift `h1` YOK.
**Kasıtlı bozma ile de doğrulanmış** (`headingLevel="h2"`→`"h1"` değiştirilince test
deterministik FAIL veriyor — testin GERÇEKTEN mekanizmayı ölçtüğünün kanıtı). Bu testi
**ben yeniden koşmadım** (oran sınırı bütçesini korumak için, qa'nın kendi turunda zaten
canlı PASS + kasıtlı-bozma kanıtıyla belgelenmiş) — ama kod okumasıyla mekanizmanın
doğruluğunu bağımsızca teyit ettim (`_app.tsx`'in guard/gözlemci ayrışmasını satır satır
okudum, qa'nın teşhisiyle BİREBİR örtüşüyor).

**Sonuç:** solid M8 (test kapsamı eksikliği) bu turda `qa` tarafından KAPATILDI. Benim
tarafımdan **yeni bir bulgu yok** — mekanizma doğru, test var ve geçiyor. `qa`'nın kendi
flaky bulgusu (test paket halinde koşulunca zamanlama sorunu) kendi kaydı, tekrarlamıyorum.

### 2.4 — M5: tanınmayan `issue.code` → sessiz yutma (3.3.1/3.3.3)

`_auth.sign-in.tsx:49-64` — `resolveEmailFieldErrorMessage`/`resolvePasswordFieldErrorMessage`
tanınmayan kodda `undefined` dönüyor → `Input`'a `error` prop'u HİÇ geçirilmiyor →
`aria-invalid`/`aria-describedby`/hata `<p>` **hiç render edilmiyor**. Form gönderilmiyor
(react-hook-form engelliyor) ama kullanıcıya/ekran okuyucuya HİÇBİR açıklama yok —
WCAG **3.3.1 Error Identification** (hata tanımlanmalı) ve **3.3.3 Error Suggestion**
(düzeltme önerisi) ikisi de ihlal edilir, TETİKLENİRSE.

**Bağımsızca ölçtüm (gerçek kod çalıştırarak, varsayıma dayanmadan):**
```js
z.object({ email: z.string().min(1).pipe(z.email()), password: z.string().min(1) })
// '' / ''        -> email: too_small,    password: too_small   (HER İKİSİ işleniyor)
// 'notanemail'   -> email: invalid_format                       (işleniyor)
// ' ' / ' '      -> email: invalid_format                       (işleniyor)
// 'a@b' / 'x'    -> email: invalid_format                       (işleniyor)
```
**Bugün** e-posta alanı için yalnızca `too_small`/`invalid_format`, parola için yalnızca
`too_small` üretilebiliyor — HER İKİSİ de kodda işleniyor. **Bugün tetiklenmiyor**
(solid'in iddiasıyla tutarlı, bağımsızca doğrulandı) — ama Zod sürüm değişikliği/şema
genişlemesi (ör. parolaya `.max()` eklenmesi → `too_big`) bunu sessizce açar. **medium**
(solid ile aynı kategori — latent, bugün erişilemez, regresyon riski gerçek).
**Sorumlu ajan:** `frontend` (S5).

### 2.5 — Klavye ve odak yönetimi — tam tur

① **Tab sırası:** canlı iz (authenticated dashboard, 320px'e geçmeden önce masaüstünde):
`UserMenu tetikleyici` → `Sidebar "Panel" linki` → (main'de focusable yok) → `BODY`'ye
düşüp döngü başa dönüyor. DOM sırası (Topbar→Sidebar→main) ile tab sırası TUTARLI.
Pozitif `tabindex` **0** (grep: `tabIndex={-1}` yalnızca headingRef'lerde, kasıtlı ve
doğru kullanım — odağı taşımak için, tab sırasına girmemek için).
② **Skip link:** YOK. Ama bugün sidebar'da TEK öğe olduğu için `<main>`'e ulaşmak
yalnızca **2 Tab** tüketiyor (UserMenu + Sidebar linki) — WCAG 2.4.1 Bypass Blocks'un
pratik etkisi bugün düşük. v0.0.14 (RBAC) sidebar'a öğe eklediğinde bu sayı büyüyecek
→ **low** bulgu, o sürümden ÖNCE eklenmeli.
③ **`UserMenu`:** canlı doğrulandı (`panel-flow.spec.ts` AC10 testi, qa'nın (A) testiyle
aynı akış) — Enter ile açılıyor, `ArrowDown`+Enter ile öğe seçiliyor, **`Escape` menüyü
kapatıp odağı tetikleyiciye GERİ VERİYOR** (`await expect(trigger).toBeFocused()` canlı
PASS). Menü açıkken odak tuzağı YOK (Radix'in "dismissable layer" varsayılanı, elle
`focus()` çağrısı YOK — kod okudum, `UserMenu.tsx` dosya başı yorumu bunu doğru
belgeliyor).
④ **Rota geçişinde odak/duyuru — SPA'nın klasik AA açığına karşı İYİ bir çözüm:**
`_auth.sign-in.tsx:72-79` ve `_app.index.tsx:21-27` her ikisi de mount olduğunda
`document.title` güncelliyor VE kendi `h1`'ine `tabIndex={-1}` + `ref.current.focus()`
ile odağı taşıyor — ekran okuyucular programatik odak değişiminde yeni elemanın
erişilebilir adını (başlık metnini) okur, bu SPA'larda navigasyon duyurusu için
yaygın kabul görmüş bir desen (WAI-ARIA Authoring Practices). Geçici durumlar
(`LoadingState`/`ErrorState`, guard'ın kabuksuz pending/error dalları) odağı TAŞIMIYOR,
bunun yerine `aria-live="polite"`/`role="alert"` kullanıyor — **tutarlı ve doğru bir
ayrım**: kalıcı rota görünümleri odak taşır, geçici/kesintili durumlar canlı bölge
kullanır. **Pozitif tespit, bulgu değil.**
⑤ **Yükleniyor durumu duyurusu:** `LoadingState` `aria-live="polite"` taşıyor
(`LoadingState.tsx:26`); gönderim sırasında `Button`'un `aria-busy="true"`'su
(`Button.tsx:78`) + metin değişimi ("Giriş yapılıyor…") — buton kendisi focused
kaldığı için bazı ekran okuyucular metin değişimini okuyabilir ama GARANTİ DEĞİL
(buton bir canlı bölge değil) → **low** iyileştirme önerisi: buton metnine ayrıca
`aria-live="polite"` içeren görünmez bir eşlik eklenebilir (AAA'ya yakın bir öneri,
zorunlu değil).
⑥ **Fare olmadan çıkış:** canlı doğrulandı (`panel-flow.spec.ts` AC10 testi) —
Tab→Enter (giriş) → `UserMenu` Enter → ok tuşu+Enter (çıkış) → `/sign-in`'e dönüyor,
`.click(`/`.tap(` **0** (grep, spec kodu). **PASS.**

### 2.6 — Kontrast: ekrandaki gerçek çiftler (canlı ölçüm, `tokens.ts`'in listelemediği kombinasyonlar dahil)

| Çift (gerçek render) | Ölçüm yöntemi | Hesaplanan oran | Eşik | Sonuç |
| --- | --- | --- | --- | --- |
| Odak halkası `#2563EB` / surface `#FFFFFF` | `getComputedStyle` (box-shadow rengi) + WCAG formülü | **5.17:1** | 3:1 | PASS |
| Sidebar aktif link `brand-500 #2563EB` / `brand-50 #EFF6FF` | `tokens.ts` hex + formül (bu çift `CONTRAST_PAIRS`'TE YOK) | **4.75:1** | 4.5:1 | PASS (dar değil ama pinlenmemiş — öneri: `CONTRAST_PAIRS`'e eklensin) |
| Sidebar pasif link `text-primary #0F172A` / `surface-muted #F1F5F9` | aynı yöntem (bu çift de listede YOK) | **16.28:1** | 4.5:1 | PASS |
| Disabled birincil buton: `text-inverse` (opaklık 0.6 ile beyaza karışmış) / `brand-500` (opaklık 0.6 ile beyaza karışmış zemin ≈ `#7CA1F3`) | elle kompozisyon hesaplandı (CSS `opacity` davranışı) + formül | **~2.54:1** | — | **Kapsam dışı** — WCAG 1.4.3/1.4.11 devre dışı (disabled) UI bileşenlerini istisna tutuyor; düşük/bilgilendirme (bkz. §3) |
| **(H1'in açtığı risk)** `text-primary #0F172A` (fallback) / `brand-500 #2563EB` (buton zemini) — EĞER renk çarpışması Button'a sıçrarsa | hesaplandı (bugün GERÇEKLEŞMİYOR, Button'da beyaz KAZANIYOR — ölçtüm) | **3.45:1** | 4.5:1 | **Bugün N/A, ama 1 derleme-sırası değişikliğiyle FAIL olur — bkz. H1** |

`tokens.ts`'in kendi `CONTRAST_PAIRS`'i (10 çift, `success-600`/`success-surface` 4.79:1
dar payıyla) — bağımsızca yeniden hesapladım, `ui`'nin bildirdiği sayıyla **birebir
eşleşiyor**, totoloji karşıtı fixture'daki `#94A3B8` → **2.56:1** (benim hesabım da
AYNI) — `#64748B`'ye (`--color-border`) düzeltilmiş hâliyle **gerçek oran 4.76:1** idi
(solid/qa'nın belgelediği S2 düzeltmesiyle TUTARLI, kendim yeniden hesapladım).

---

## 3. Ayrıca denetlenenler

- **`index.html`:** `lang="tr"` ✔, `<title>` boş değil ✔, viewport meta
  `width=device-width, initial-scale=1.0` — `user-scalable=no`/`maximum-scale` **YOK**
  → zoom ENGELLENMİYOR (1.4.4 Resize Text açısından temiz).
- **Landmark yapısı (canlı ölçüm, authenticated dashboard):**
  `{"headers":1,"navs":1,"mains":1,"h1Count":1}` — tam olarak bir `<header>`, bir `<nav
  aria-label="Panel navigasyonu">`, bir `<main>`, bir `<h1>`. Birden fazla `<nav>` yok,
  dolayısıyla ek `aria-label` ayrımı gerekmiyor (zaten var). **PASS.**
- **`ErrorState`'in `role="alert"` kullanımı:** `_app.tsx`'in guard hatası (oturum
  doğrulama 500/ağ) ve dashboard'un arka plan hatası için kullanılıyor — bunlar
  gerçekten BEKLENMEYEN/dikkat gerektiren durumlar, `role="alert"` **doğru** (fazla
  değil). `LoadingState` AYRI olarak `aria-live="polite"` kullanıyor (daha az agresif,
  geçiş durumu için doğru seçim) — iki durumun ayrıştırılması **tutarlı ve bilinçli**.
  `EmptyState` `role="status"` (boş durum bir hata değil, bilgilendirme) — **doğru**.
- **Mobil/responsive 320px (canlı ölçüm, HEM `/sign-in` HEM authenticated dashboard):**
  `reflow-320-has-horizontal-scroll: false` (iki sayfada da) — **1.4.10 PASS**.
  Dokunma hedefleri: `email-rect-320 {width:238,height:44}`, `button-rect-320
  {width:238,height:44}`, `user-menu-trigger-rect {width:44,height:44}`,
  `sidebar-link-rect {width:63.6,height:44}` — **tümü ≥24×24px (2.5.8), hatta ≥44×44px**
  (WCAG 2.5.5 AAA eşiğini de karşılıyor, gerekmese de).
- **`jsx-a11y` eklentisinin kapsamı:** `pnpm lint` → **17/17 temiz** (canlı koştum,
  cache hit önceki turlarla tutarlı). `security`'nin ölçtüğü gibi eklenti GERÇEKTEN
  çalışıyor (kasıtlı `<img>` alt-text ihlali tetikliyor) ama bu STATİK bir kural
  motorudur — derlenen CSS'in geçerliliğini (bu raporun H1'i), odak göstergesinin
  görünürlüğünü, renk kontrastını, klavye tuzaklarını veya SPA rota duyurusunu
  **ÖLÇEMEZ**. Bu gate'in (ve canlı Playwright testlerinin) üstlendiği iş jsx-a11y'nin
  **tamamlayıcısı**, yedeği değil.
- **Türkçe microcopy ↔ ekran metni uyumu:** `docs/ux/T-008.md`'nin "Microcopy" tablosu
  (satır 230-275) ile `messages.ts`'in `MESSAGES`/`ERROR_MESSAGES` içeriği **birebir
  eşleşiyor** (grep ile karşılaştırdım — "Giriş yap", "Tekrar dene", "Mağaza seçilmedi",
  "Panel şu anda boş", "E-posta veya parola hatalı." hepsi birebir). Hata metinleri
  eylem öneriyor (3.3.3): "Tekrar dene", "Lütfen daha sonra tekrar deneyin", "Giriş
  yapmanız gerekiyor" — jenerik "Tıkla"/"Devam" **yok**.
  **Tutarsızlık (low):** alan etiketi "Şifre" ama aynı akışın hata metni "parola"
  ("E-posta veya parola hatalı.") — iki farklı Türkçe eşanlamlı aynı alanı anıyor,
  UX dokümanının KENDİSİNDE de bu tutarsızlık var (anlatım bölümleri "parola" diyor,
  mikrokopi tablosu "Şifre" diyor). Bilişsel netlik açısından küçük bir sürtünme
  (ekran okuyucu kullanıcısı doğrusal dinlerken iki terimi eşleştirmek için ek bilişsel
  yük) — **low**, `ux` kararı.
- **`prefers-reduced-motion`:** `grep -rn "prefers-reduced-motion"` → **0** eşleşme.
  İki `animate-spin` kullanımı (`Button.tsx:40` buton içi spinner, `LoadingState.tsx:34`
  sayfa spinneri) HİÇBİR KOŞULDA durdurulmuyor. WCAG **2.3.3 Animation from Interactions
  AAA'dır** (baseline kuralı: AAA'yı `high` işaretleme) → **low**, düşük maliyetli
  iyileştirme önerisi (`@media (prefers-reduced-motion: reduce) { animation: none }`).
- **`DataTable`/`Toast` (AC15 muaf, tüketicisiz):** kod incelemesi — `DataTable`
  `<th scope="col">`, `<caption class="sr-only">`, boş durum `role="status"` ile
  yapısal olarak sağlam. `Toast` `role="status"` taşıyor. **Bulgu yazmıyorum** (brief'in
  "ekranda yok diye bulgu yazma" kısıtı).

---

## 4. BULGULAR

```
BULGULAR:
```

### high

**H1 — `text-(--font-size-*)` Tailwind v4 söz dizimi `color`'a derleniyor, `font-size`'a
DEĞİL; iki gerçek ekranda hata mesajı rengini de bozuyor, birincil butonda 3.45:1'e
düşme riski hesaplandı (WCAG 1.4.3 Contrast (Minimum))**

- `apps/admin/src/{components/{ErrorState,Topbar,UserMenu,LoadingState,Sidebar,EmptyState}.tsx,
  routes/{_app.index,_auth.sign-in}.tsx}` + `packages/ui/src/components/{Button,Card,
  DataTable,Input,Toast}.tsx` — 23 kullanım, 13 dosya
- Tam analiz ve canlı kanıt yukarıda §1. Özet: `text-(--font-size-h1)` →
  `color:var(--font-size-h1)` (geçersiz, "invalid at computed-value time" →
  **inherited** değere düşer) üretiyor, `font-size` HİÇBİR YERDE uygulanmıyor
  (h1 24px yerine 16px — ölçtüm, düzeltip doğruladım, geri aldım). İKİ gerçek
  ekranda (gönderim hatası alert'i, alan doğrulama hatası) bu AYNI zamanda
  `text-(--color-danger-600)` (kırmızı) utility'sini ÖZELLİK ÇARPIŞMASIYLA
  eziyor — hata mesajları **kırmızı değil, lacivert** render ediliyor (ölçtüm,
  iki gerçek örnek). Birincil `Button`'da bugün beyaz metin KAZANIYOR (ölçtüm)
  ama bu derlenmiş CSS'teki rastgele sıraya bağlı; AYNI çarpışma Button'a
  sıçrarsa kontrast **3.45:1**'e düşer (hesapladım) — 4.5:1 AA eşiğini kırar.
  Sıfır test kapsamı (`tokens.test.ts` ham hex pinler, `getComputedStyle`
  ölçmez; qa'nın yeni testleri metin GÖRÜNÜRLÜĞÜNÜ/İÇERİĞİNİ ölçer, RENGİNİ
  ölçmez) — bu sürümün "statik kapılar çalışma zamanını göremez" dersinin
  (solid H1, qa'nın çapraz doğrulaması) **düzeltilmemiş** üçüncü örneği.
- **Düzeltme:** 23 kullanımın hepsinde `text-(--font-size-X)` →
  `text-(length:--font-size-X)`. Regresyon koruması: derlenmiş CSS'te
  `text-\(--font-size-[a-z0-9]*\)\s*{\s*color:` deseninin **0** olduğunu
  pinleyen bir kontrol (`check-bundle-budget.ts`'in doğal uzantısı veya
  `tokens.test.ts`'e `node:fs` ile build-sonrası bir assertion).
- **Sorumlu ajan:** `frontend` (S2 — `packages/ui`, S5 — `apps/admin`).

### medium

**M1 — (solid M2'nin çapraz doğrulaması) `@source` glob'u `.ts`'i kaçırıyor; `FOCUS_RING_CLASS_NAMES`'in kanonik kaynağı taranmıyor — 2.4.11/2.4.13 regresyon riski**

- `apps/admin/src/styles.css:27` (`@source '...packages/ui/src/**/*.tsx'`) ·
  `packages/ui/src/tokens.ts:132-133` (kanonik, `.ts`, glob dışı) ·
  `packages/ui/src/components/{Button,Input}.tsx` (literal dizeyi TAŞIMIYOR,
  yalnızca değişken import ediyor)
- Bağımsızca doğrulandı (§2.2). Bugün odak halkası ÇALIŞIYOR ama TEK SEBEBİ
  `Sidebar.tsx`/`UserMenu.tsx`'teki (solid M1'in işaret ettiği) literal
  kopyaların `apps/admin/src`'in varsayılan taramasında olması. `solid` M1
  (kopya temizliği) glob düzeltmeden yapılırsa `Button`/`Input` dahil TÜM
  odak göstergeleri sessizce kaybolur.
- **Düzeltme:** solid'in önerdiği gibi — glob'u `**/*.{ts,tsx}` yap, M1 ile
  AYNI düzenlemede.
- **Sorumlu ajan:** `frontend` (S5). *(solid M2 ile aynı bulgu, bağımsızca
  doğrulandı ve WCAG 2.4.11/2.4.13'e bağlandı — tekrar sayılmasın, çapraz
  doğrulama olarak kayıtlı.)*

**M2 — (solid M5'in çapraz doğrulaması) Tanınmayan alan doğrulama kodu sessizce yutuluyor — WCAG 3.3.1/3.3.3**

- `apps/admin/src/routes/_auth.sign-in.tsx:49-64`
- Bağımsızca doğrulandı (§2.4, gerçek Zod kodu çalıştırılarak). Bugün
  erişilemez (yalnızca `too_small`/`invalid_format` üretiliyor, ikisi de
  işleniyor) ama şema genişlediğinde (`.max()` gibi) sessizce açılır —
  `Input` `aria-invalid`/hata metnini HİÇ render etmez, ekran okuyucu
  kullanıcısı hiçbir açıklama görmez.
- **Düzeltme:** son dalı jenerik bir mesaja düşür (`=> string`, `undefined`
  dönmesin).
- **Sorumlu ajan:** `frontend` (S5). *(solid M5 ile aynı bulgu, bağımsızca
  doğrulandı ve WCAG 3.3.1/3.3.3'e bağlandı.)*

### low

- **L1 — Skip-link yok (2.4.1 Bypass Blocks), bugün düşük etkili.**
  `apps/admin/src/components/AppShell.tsx` — canlı tab-order izi: `<main>`'e
  ulaşmak 2 Tab (UserMenu + Sidebar'ın tek linki). v0.0.14 (RBAC) sidebar'a
  öğe ekleyince büyüyecek. **Düzeltme:** `<a href="#main-content"
  class="sr-only focus:not-sr-only">` ekle, `<main id="main-content">`.
  **Sorumlu:** `frontend`, vade v0.0.14'ten önce.
- **L2 — `prefers-reduced-motion` desteklenmiyor.** `Button.tsx:40`,
  `LoadingState.tsx:34` (`animate-spin`, hiç durdurulmuyor). WCAG 2.3.3 AAA
  (yüksek işaretlenmedi, baseline kuralı). **Düzeltme:**
  `@media (prefers-reduced-motion: reduce)` ile `animation: none`.
  **Sorumlu:** `frontend`/`ui`.
- **L3 — Terminoloji tutarsızlığı: "Şifre" (alan etiketi) / "parola" (hata
  metni).** `messages.ts:174` (`passwordLabel: 'Şifre'`) vs `:105`
  (`INVALID_EMAIL_OR_PASSWORD: 'E-posta veya parola hatalı.'`); aynı
  tutarsızlık `docs/ux/T-008.md`'nin kendisinde de var (anlatım "parola",
  mikrokopi tablosu "Şifre"). **Düzeltme:** tek terime birleştir (ux kararı).
  **Sorumlu:** `ux`.
- **L4 — Disabled birincil buton kontrastı bilgilendirme (WCAG'den MUAF, ama
  CLAUDE.md'nin "disabled okunabilir olmalı" niyetine yakın değil).**
  `packages/ui/src/components/Button.tsx:80` (`disabled:opacity-60`) — hesapladım:
  beyaz metin / `~#7CA1F3` (opaklıkla açılmış `brand-500`) ≈ **2.54:1**. WCAG
  1.4.3/1.4.11 devre dışı UI bileşenlerini İSTİSNA TUTUYOR → **ihlal değil**,
  ama istenirse `disabled:opacity-80` gibi daha hafif bir soluklaştırma
  okunabilirliği artırır. **Sorumlu:** `ui` (isteğe bağlı iyileştirme).

---

## 5. ÖLÇÜMLER

```
ÖLÇÜMLER:
  Ortam: dev sunucu canlı (panel.arkesoft.localhost:5173, Playwright chromium),
         gerçek API (node --env-file=.env apps/api/dist/main.js, /health 200),
         Redis homebrew örneği (127.0.0.1:6379) doğrulandı (qa'nın bu turda
         belgelediği tuzakla AYNI örnek, teyit edildi).

  Oran sınırı bütçesi (oturum başı → sonu):
    sign-in:ip   1/20  → 1/20 (ttl doğal sıfırlandı, benim turum 0 yeni sign-in
                 ÜRETMEDİ dışında AC10 testi hariç — bkz. not)
    sign-up:ip   1/10  → 2/10 (benim turumun TEK yeni auth maliyeti — dashboard
                 320px/landmark/tab-order ölçümü için 1 sign-up + 1 sign-in)
    NOT: AC10 keyboard-loop testini (panel-flow.spec.ts) ben YENİDEN KOŞMADIM
    (qa'nın bu turdaki canlı PASE kaydına güvenildi); benim 1 sign-up/sign-in'im
    kendi diagnostic2 koşumuma ait.

  Canlı ölçümler (gerçek getComputedStyle/getBoundingClientRect):
    h1 font-size (bozuk hâl):          16px  (beklenen 24px)
    h1 font-size (düzeltilmiş, geri alındı): 24px (text-(length:--font-size-h1) ile)
    email/button odaksız box-shadow:   none
    email/button odaklı box-shadow:    rgb(255,255,255) 0 0 0 2px, rgb(37,99,235) 0 0 0 4px
    submit-error-alert metin rengi:    rgb(15,23,42)  (beklenen rgb(185,28,28) danger-600)
    field-error metin rengi:           rgb(15,23,42)  (beklenen rgb(185,28,28) danger-600)
    submit-error-alert zemin rengi:    rgb(254,242,242) (danger-surface, DOĞRU)
    landmarks (authenticated):         {headers:1, navs:1, mains:1, h1Count:1}
    320px reflow (sign-in + dashboard): hasHorizontalScroll: false (iki sayfada)
    user-menu-trigger / sidebar-link / input / button rect: ≥44×44px (hepsi)
    tab-order (authenticated, masaüstü): UserMenu → Sidebar link → (main boş) → BODY → döngü

  Hesaplanan kontrast oranları (WCAG 2.1 formülü, elle + bağımsızca):
    focus-ring #2563EB / surface #FFFFFF:              5.17:1  (eşik 3:1)   PASS
    sidebar aktif link brand-500/brand-50 (yeni ölçüm): 4.75:1  (eşik 4.5:1) PASS
    sidebar pasif link text-primary/surface-muted (yeni ölçüm): 16.28:1 (eşik 4.5:1) PASS
    disabled buton beyaz / ~#7CA1F3 (hesaplandı):       2.54:1  (WCAG muaf — disabled)
    (H1 riski) text-primary(fallback) / brand-500:      3.45:1  (eşik 4.5:1) — bugün N/A, risk
    success-600/success-surface (ui'nin bildirdiği, yeniden hesaplandı): 4.79:1 (eşik 4.5:1) PASS, dar pay
    totoloji-karşıtı fixture #94A3B8/#FFFFFF (yeniden hesaplandı): 2.56:1 (başarısız, KASITLI)

  Statik/komut ölçümleri:
    pnpm lint:                      17/17 (canlı koştum)
    grep "outline-none" (kod):      3 satır, hepsi `focus-visible:` eşlikli, çıplak 0
    grep "text-(--font-size-":      23 eşleşme, 13 dosya
    grep "prefers-reduced-motion":  0 eşleşme
    grep "animate-spin":            2 (Button.tsx, LoadingState.tsx)
    derlenmiş CSS'te geçersiz `[--x]` söz dizimi:  0 (S2/S5'in düzeltmesi hâlâ yerinde)
    derlenmiş CSS'te var(--color-focus-ring):      1 (üretiliyor)
    derlenmiş CSS text-(--font-size-*) kuralı sırası: --color-* kuralların TÜMÜNDEN SONRA
      (byte pozisyonu 9286-9392 > 8916-9219) — H1'in cascade çarpışma kanıtı

  İncelenen dosya/bileşen: 13 (apps/admin bileşen/rota) + 5 (packages/ui bileşen)
    + 3 route guard dosyası + index.html + styles.css + theme.css + tokens.ts
    + 2 e2e spec dosyası (panel-flow.spec.ts 417 satır, qa-blind-spot... 410+ satır)
    + 4 önceki gate raporu (solid/qa/security/perf tur1, 1267 satır toplam)

  Bulgu dağılımı: critical 0 · high 1 · medium 2 · low 4

  Geçici dosyalar (hepsi silindi, git status --short ile doğrulandı):
    apps/admin/e2e/wcag-diagnostic.tmp.spec.ts      (yazıldı, koşturuldu, silindi)
    apps/admin/e2e/wcag-diagnostic2.tmp.spec.ts     (yazıldı, koşturuldu, silindi)
    apps/admin/e2e/wcag-diagnostic3.tmp.spec.ts     (yazıldı, koşturuldu 2x, silindi)
    apps/admin/e2e/wcag-diagnostic4.tmp.spec.ts     (yazıldı, koşturuldu, silindi)
    apps/admin/src/routes/_auth.sign-in.tsx         (1 satır kasıtlı bozma, ölçüldü,
                                                      /tmp/sign-in-backup.tsx ile
                                                      birebir karşılaştırılarak geri alındı)
  Oturum başı git status --short satır sayısı: 61 · oturum sonu: 61 (BİREBİR AYNI)
```

**SONUÇ: FAIL** — `AGENT_BASELINE.md` §4: en az bir `high` bulgu → FAIL. H1 düzeltilip
(23 kullanım + regresyon koruması) M1/M2 (solid'in M2/M5'iyle paylaşılan, aynı düzenlemede
kapatılacak) çözüldüğünde tur 2'de PASS beklenir; L1-L4 teknik borca düşer (3 veya daha az
`medium` + yalnızca `low` kombinasyonu PASS eşiğinin altında kalır).
