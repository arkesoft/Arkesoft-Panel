# T-008 — `solid` gate, tur 1

Tarih: 2026-11-01
Sürüm: ROADMAP v0.0.7 (platform 0.0.6 → 0.0.7)
Task: `.claude/workflow/tasks/T-008.md`

```
GATE: solid
SONUÇ: FAIL
```

FAIL gerekçesi `AGENT_BASELINE.md` §4: **2 `high`** (tek başına yeterli) **+ 8 `medium`**.
Karar kurala göre verildi, tercihe göre değil.

---

## 0. Ölçüm kapsamı ve yöntemi

**`Bash` tool'um yok — hiçbir komut çalıştırılmadı.** Orkestratör'ün bildirdiği
`lint 17/17 · typecheck 17/17 · test 613 · test:isolation 16 · build 12/12 · format:check temiz`
sayılarını **doğrulayamadım**; aşağıdaki ölçümlerin tamamı `Read` + `Grep` (ripgrep) ile
yapıldı ve her birinin **kapsamı açıkça yazılıdır** (Orkestratör'ün dört kez atladığı şey).

| Ölçüm | Kapsam | Sonuç |
| --- | --- | --- |
| Geçersiz Tailwind v4 arbitrary-value (`[--token]`) | `**/*.{ts,tsx,css}`, `node_modules` hariç — **kod**, yorum dahil | **0** |
| Aynı desen | `**/*.md` — **doküman metni** | **2** (`docs/ui/T-008.md:13`, `.claude/workflow/tasks/T-008.md:315`) → M3 |
| Geçerli `(--token)` | `**/*.{ts,tsx,css}`, `node_modules` hariç | **48** (v0.0.7 yüzeyi 45: `packages/ui` 20 + `apps/admin/src` 25) |
| Derlenen CSS'te geçersiz bildirim (`:\s*--color-…`) | `apps/admin/dist/assets/index-DefH_jTw.css` | **0** |
| Derlenen CSS'te `var(--color-focus-ring)` / `--tw-ring-color` | aynı dosya | **var** (odak ring'i gerçekten üretiliyor) |
| `any` | `apps/admin/**` + `packages/ui/**`, `node_modules` hariç — **kod satırı** | **3** — hepsi `src/routeTree.gen.ts:19,24,29` (ÜRETİLMİŞ). Elle yazılmış kodda **0**. `routeTree.gen.ts:8`'deki eşleşme **yorum** → bulgu değil |
| `@ts-nocheck` | aynı kapsam — **kod satırı** | **1** (`src/routeTree.gen.ts:3`) → M6 |
| `@ts-ignore` / `@ts-expect-error` | aynı kapsam | **0** |
| `eslint-disable` | `apps/admin/**` | **2**: `_app.tsx:61` (gerekçeli, meşru), `routeTree.gen.ts:1` (üretilmiş) |
| `as` tip zorlama | `apps/admin/**` + `packages/ui/**` — **kod** | `scripts/check-bundle-budget.ts:54,89,98` (runtime guard içinde, meşru) · `e2e/panel-flow.spec.ts:46,53` (→ L5) · `packages/ui` **0** |
| `toHaveCSS` / `evaluate` / `getComputedStyle` / `boxShadow` | `apps/admin/**`, `node_modules` hariç | **0** → H1 |
| `fetch(` / `useQuery(` / `@tanstack/*` / `@arkesoft/{trpc,api,db}` | `packages/ui/src/**` | **0** (AC14 yapısal olarak sağlanıyor) |
| İncelenen dosya | — | **46** |
| En büyük fonksiyon | — | `apps/admin/src/routes/_auth.sign-in.tsx:70-173` → `SignInPage`, **104 satır** (ikinci: `_app.tsx:123-206` `AppLayoutComponent`, 84) |

---

## 1. Yedi özel dikkat maddesinin değerlendirmesi

### 1 — AC13'ün kör noktası: **sınıfı teşhis edildi, bu sürümde ÜÇ örneği daha var**

Kör noktanın sınıfı: **"bildirimi pinleyen, kullanımı ölçmeyen kontrol."**
`tokens.test.ts` token *değerinin* erişilebilir olduğunu ve `theme.css` ↔ `tokens.ts`
*bildirimlerinin* eşleştiğini kanıtlıyor. Hata ise **kullanım yerinde** yaşıyordu
(bileşen `className` dizeleri). Bildirim ile kullanım arasındaki boşluğu ölçen hiçbir
kontrol yok ve **S2'nin düzelttiği hata sınıfına karşı hâlâ sıfır regresyon koruması
var** → H1.

Aynı sınıfın bu sürümdeki diğer örnekleri:

| Mekanizma | Niyet | Gerçekten ölçtüğü | Bulgu |
| --- | --- | --- | --- |
| **AC12 odak kalıbı** | odak göstergesi *görünür* | yalnızca sınıf listesinin *metni*; hesaplanmış stil ölçümü **hiç yok** | **H1** |
| **AC8 i18n taraması** | *ekranda* ham sunucu metni / i18n anahtarı yok | yalnızca `resolveErrorMessage`'ın **dönüş dizesi**; `MESSAGES` ağacı ve render edilen DOM ölçülmüyor; "kasıtlı başarısız giriş" senaryosu **hiç yok** | **H2** |
| **AC16 paket bütçesi** | *ilk rotanın* JS'i | entry + statik import = `index-*.js` + `messages-*.js`; `autoCodeSplitting` yüzünden **sıfır rota kodu** | **M8** |
| **`headingLevel` asimetrisi** | çift `h1` doğmasın | `h1` kolu ölçülüyor; **`h2` kolu ve "ikisi birlikte" konfigürasyonu** ölçülmüyor | **M9** |
| **AC4/AC23 `any` 0** | panelde `any` yok | elle yazılan kodu kapsıyor; üretilmiş `routeTree.gen.ts`'teki 3 `as any` + `@ts-nocheck`'i **kapsamıyor**, muafiyet hiçbir yerde yazılı değil | **M6** |

**Aynı sınıftan OLMAYANLAR (pozitif tespit):**
- **AC7 `deepEqual`** — gerçek: `normalize-panel-error.test.ts:46-68` iki **farklı şekilli**
  girdi (zarf a `Error{body}`, zarf b `{data:{appError}}`) veriyor ve çıktıları
  karşılaştırıyor; ayrıca probe 3→4 sırası regresyonunu adıyla yakalayan bir test var
  (`:71-81`). Totoloji yok.
- **Port pin testleri** — `panel-origin-pin.test.ts` yalnızca `.env.example` ↔ `PANEL_DEV_PORT`'u
  pinliyor ama **drift yapısal olarak imkânsız**: `vite.config.ts:74` ve
  `playwright.config.ts:25,43` portu **aynı sabitten türetiyor** (`import { PANEL_DEV_PORT }`).
  Üç yerin ikisi literal olsaydı kör nokta olurdu; değil. ✔
- **`theme.css` ↔ `tokens.ts` pin'i** — harf durumundan bağımsız, `toStrictEqual` ile
  **küme eşitliği** (tek yönlü `toContain` değil) → fazladan/eksik token ikisi de kırılır. ✔

### 2 — `messages.ts` iki yazıcılı denetimi: **AC8 GEVŞETİLMEDİ** ✔

- `PANEL_ERROR_CODES` (`:38-61`, 19 girdi), `GENERIC_ERROR_MESSAGE` (`:70`),
  `ERROR_MESSAGES … satisfies Record<PanelErrorCode, string>` (`:78-107`),
  `isPanelErrorCode` (`:118`), `resolveErrorMessage` (`:128-133`),
  `formatSupportCodeLine` (`:140-145`) — **hiçbiri değişmemiş**; kapalı dünya ve
  fail-closed geri düşüş yerinde.
- S5 **yalnızca eklemiş**: `:147-212` arası `MESSAGES` bloğu. Sınır yorumu (`:148-149`)
  bunu açıkça kayda geçiriyor ve kayıt doğru.
- **İki export meşru bir ayrım mı?** Evet: `ERROR_MESSAGES` *kod→metin* eşlemesi (kapalı
  dünya, derleme zamanı zorlamalı), `MESSAGES` *ekran metni* ağacı (kodu olmayan statik
  metin). İki doğruluk kaynağı değil — kesişimleri boş.
- **Ama:** `PanelError` → metin köprüsü **ikisinde de yok**; boşluk iki route dosyasına
  taşındı → **M4**. Ayrıca `MESSAGES`'ın 24 girdisinin **hiçbiri** birim testli değil
  (`messages.test.ts` yalnızca `resolveErrorMessage`/`formatSupportCodeLine` test ediyor)
  → **H2**.

### 3 — S5'in bildirdiği iki tekrar

**① `FOCUS_RING_CLASS_NAMES` — tekrar HÂLÂ DURUYOR ve yorumu artık YANLIŞ.**
`packages/ui/src/index.ts:24` sabiti **export ediyor**, ama `Sidebar.tsx:26-28` ve
`UserMenu.tsx:25-27` literal kopyayı taşımaya devam ediyor; iki dosyanın yorumu
("`@arkesoft/ui`'nin index.ts barrel'ı bu sabiti DIŞA AÇMIYOR") **güncelliğini yitirmiş,
okuyana yanlış bilgi veriyor**. S5'in o anki kararı meşruydu (`packages/ui` DOKUNMAZ
listesindeydi); **bugün temizlenmeli** → **M1**.
⚠ Temizlik **tek başına yapılamaz**: `@source` glob'u `.ts` dosyalarını kapsamadığı için
kopyayı silmek odak göstergesini **sessizce yok eder** → **M2** ile birlikte düzeltilmeli.

**② `MESSAGES.errors.network` — evet, hata katmanının API'sinde gerçek bir boşluk.**
`resolveErrorMessage(code: string)` **bir kod** istiyor; `PanelError`'ın `kind:'unknown'`
dalı kodsuz; `GENERIC_ERROR_MESSAGE` `private`. Sonuç: her çağıran kendi 6 satırlık
köprüsünü yazdı → `_app.tsx:38-43` ve `_auth.sign-in.tsx:42-47` **birebir iki kopya**.
Üçüncü ekran üçüncü kopyayı doğurur. İkisi **aynı sebeple** değişir (yüzeysel benzerlik
değil, aynı politika) → **M4**.

### 4 — R-P1 birleştirmesi: **İKİ DOSYADA DA DOĞRULANDI** ✔

| Dosya | `restrictedImportsOptions` import | `mergeRestrictions` ile birleştirme | Sonuç |
| --- | --- | --- | --- |
| `apps/admin/eslint.config.mjs` | `:10` | `:60-63` → `mergeRestrictions(restrictedImportsOptions, trpcServerRestriction)` | ✔ |
| `packages/ui/eslint.config.mjs` | `:10` | `:93-96` → `mergeRestrictions(restrictedImportsOptions, uiBoundaryRestriction)` | ✔ |

`packages/config/eslint/base.js:38-45` okundu: React sınıf bileşeni yasağı
(`name: 'react', importNames: ['Component','PureComponent']`) **`restrictedImportsOptions`
nesnesinin İÇİNDE**, ayrı bir kural olarak değil → birleştirme onu koruyor. Prisma/`pg`
yasakları (`:46-81`) da aynı nesnede. `mergeRestrictions` `paths`/`patterns`'ı
`flatMap … ?? []` ile topluyor, `importNames` alanı aynen taşınıyor. **Sessiz kayıp YOK.**
S4'ün kasıtlı ihlal kanıtı (`class X extends Component` → lint exit 1) bu okumayla tutarlı.
Tek yan bulgu: helper artık **dört** dosyada birebir kopya → **L7** (üretim ajanları
`packages/config/**` DOKUNMAZ listesinde olduğu için kaçınılmazdı, bu yüzden `low`).

### 5 — Katman ve bağımlılık denetimi: **ihlal YOK** ✔

- **`packages/ui` veri çekmiyor:** `package.json:27-33` yalnızca `clsx` + `tailwind-merge`
  (+ `react` **peer**); `@arkesoft/{trpc,api,db}` ve `@tanstack/*` **yok**. `src/**`'te
  `fetch(`/`useQuery(` **0**. `eslint.config.mjs:17-49,97` ayrıca lint zamanında yasaklıyor
  (`no-restricted-globals: ['fetch','XMLHttpRequest']` dahil). Hiç Radix girmemiş.
- **`apps/admin`'de iş kuralı yok:** `deriveUserBadgeInitials` (`Topbar.tsx:19-21`) salt
  sunum biçimlendirmesi; `_auth.sign-in.tsx:30-37`'nin Zod şeması **yalnızca şekil**
  doğruluyor ve dosya başı yorumu sunucu doğrulamasının yerine geçmediğini açıkça yazıyor.
  Tek sınırda duran şey: `_app.tsx:140-142`'nin `SESSION_NOT_FOUND → çıkış yapılmış say`
  eşlemesi (→ **L6**, hata kodu→durum politikası `auth-rest.ts`'in sözleşmesine ait).
- **`src/api/**` ↔ `src/routes/**` sınırı net:** `api/` yalnızca taşıma + sorgu tanımı
  (`session-query.ts` `queryOptions` döner, render etmez); `routes/` yalnızca render +
  durum. `components/**` tamamen prop-driven, veri çekmiyor (`AppShell.tsx:4-6`).
- **Yön ve döngü:** `apps/admin` → `@arkesoft/{ui,trpc,errors}`; `packages/ui` → hiçbir iç
  pakete bağımlı değil. `apps/*` → `apps/*` **yok**. `vite.config.ts`/`playwright.config.ts`
  → `src/app/panel-config.ts` (aynı paket içi, döngü değil). **Döngüsel bağımlılık 0.**
- **İki export alt yolu ayrışması:** `trpc-client.ts:6` yalnızca `@arkesoft/trpc` kökünden
  import ediyor; `@arkesoft/trpc/server` **hiç** import edilmiyor ve
  `apps/admin/eslint.config.mjs:19-33` hem `paths` hem `patterns` ile yasaklıyor. ✔
- **Sağlayıcı dallanması:** `if (provider === …)` sınıfı dallanma **0**. `Button`/`Toast`
  varyantları `Record<Variant, string>` haritası (koşullu dallanma yok) ✔.

### 6 — Dört Orkestratör hatasının kalıntısı

| # | Hata | Kalıntı |
| --- | --- | --- |
| ① | `cacheDir` yanlış alan | **Kalıntı yok.** `apps/admin/vitest.config.ts:18` ve `packages/ui/vitest.config.ts` doğru alanı (`test.fsModuleCachePath`) + paket-yerel yolu kullanıyor; `package.json:11,23` CLI bayrağıyla da aynı yolu veriyor. Yorumlar gerekçeyi taşıyor. ✔ |
| ② | Bağımlılık beyanları atlandı | **Kalıntı yok.** `apps/admin/package.json:16-43` 12+12 beyan yerinde. |
| ③ | `packages/ui` `@types/node` + `types` alanı | **Kalıntı yok.** `packages/ui/tsconfig.json:16` `types:["node"]`, gerekçesi `:2-13`'te ölçümle birlikte yazılı; `apps/admin/tsconfig.json:10-18` eski "bilerek eksik" notunu **geçersiz ilan edip** düzeltmiş. ✔ |
| ④ | **grep kapsamı, dördüncü kez** | **Kalıntı ihmal edilebilir.** S4'ün yeniden yazdığı iki yorum okundu: `transport-aware-fetch.ts:58` ("Tip zorlama veya gevşetilmiş tip YOK") ve `trpc-client.ts:2-5` ("paketin SUNUCU alt yolu … ASLA GİRMEZ"). Orkestratör'ün korktuğu greplenebilirlik maliyeti **gerçekleşmedi**: `@arkesoft/trpc/server` arayan biri `apps/admin/eslint.config.mjs:22` ve `:29`'da jetonu **literal olarak** ve Türkçe yasak mesajıyla birlikte bulur. **Bulgu yazmıyorum.** |

Not: Task dosyasının "Üretim Logları" bölümü **S2 ve S5'in loglarını içermiyor** (dosya
S4'ün logunda, satır 675'te bitiyor) — dördüncü Orkestratör hatasının kaydı orada olmalıydı.
Bu bir defter tutma eksiği, kod bulgusu değil; `release`/Orkestratör tamamlasın.

### 7 — Test kalitesi

**Davranış ölçen, iyi testler (pozitif tespit):**
- `apps/api/src/__tests__/no-store-headers.test.ts` — 5 vaka, **dördü negatif** (401/403/404×2),
  `expectNoStorePolicy` üç şeyi birlikte assert ediyor (`cache-control`, `vary` içinde
  `cookie`, `etag` **undefined**). Gerçek HTTP, gerçek guard zinciri. ✔
- `apps/api/src/__tests__/panel-origin-cors.test.ts` — 4 orijin vakası + `OPTIONS` 405;
  CORS başlığı **yokluğu** dört vakanın hepsinde; vaka 4 mutasyonun **gerçekleşmediğini**
  ayrıca kanıtlıyor (`:147-150`); gövde Zod'dan geçiriliyor (`:44-46,98`); güvenilir orijin
  **`BASE_ENV.AUTH_BASE_URL`'den türetiliyor** (`:50-51`) → port değişimine bağışık. ✔
- `normalize-panel-error.test.ts` — 12 test, 7'si fail-closed negatifi (null/undefined/HTML/
  döngüsel/boş/ilgisiz/3. derinlik). Implementasyon yansılamıyor, davranış ölçüyor. ✔
- `transport-aware-fetch.test.ts` — 4 dal (ok / AppErrorBody / JSON ama şema dışı / JSON değil);
  başarılı yanıtta `json()`'un **çağrılmadığını** assert ediyor (`:27`) — gerçek sözleşme. ✔

**Zayıf/eksik:**
- **AC12'nin hesaplanmış-stil yarısı tamamen yok** (417 satırda 0 `toHaveCSS`/`evaluate`) → **H1**.
- **AC8'in render yarısı yok**; "kasıtlı başarısız giriş" senaryosu **hiçbir testte yok** → **H2**.
- `headingLevel` asimetrisi yarım ölçülmüş → **M9**.
- `messages.test.ts:12-17` yalnızca `message.length > 0` assert ediyor (gevşek) — kapalı
  dünya sayacı (`:52-54`) bunu telafi ediyor, tek başına bulgu değil.
- `e2e:349-368` (ağ iptali) hata **metnini** assert etmiyor → `MESSAGES.errors.network`
  hiçbir yerde ölçülmüyor (H2'nin parçası).
- **AC18 bütçesi KORUNUYOR** ✔ — `sign-in/email` çağrısı saydım: `e2e:182` (UI),
  `e2e:237` (klavye), `e2e:279` (programatik) = **3 ≤ 4**. AC9'un dört alt testi
  `storageStateForAc9`'u yeniden kullanıyor, kendi girişi yok. `describe.serial` +
  `workers: 1` + `fullyParallel: false` üçü birlikte. Global `platform:auth:*` flush'u yok. ✔
  *Gözlem (`qa`'ya):* `createVerifiedFixtureUser` koşum başına 3× `sign-up/email` +
  3× `verify-email` de çağırıyor; bu uçlar da `platform:auth:*` sayacını tüketiyorsa iki
  ardışık koşumun gerçek maliyeti 3 değil ~18'dir — AC18'in "iki kez üst üste" şartı
  bütçeyi daha hızlı tüketebilir. Ölçmek `qa`'nın işi, bulgu yazmıyorum.
- **AC17 mekanik korunuyor** ✔ — `playwright.config.ts`: `projects` 1, viewport 1,
  `workers: 1`, `toHaveScreenshot`/`toMatchSnapshot` **0**, kök script yok, turbo görevi yok.

---

## 2. BULGULAR

```
BULGULAR:
```

### high

**H1 — AC12/AC13: düzeltilen hata sınıfına karşı sıfır regresyon koruması**

- `apps/admin/e2e/panel-flow.spec.ts:1-417` (ölçüm yok) ve
  `packages/ui/src/__tests__/tokens.test.ts:41-89`
- AC12 **"input'lar ve birincil buton için odaklı durumun hesaplanmış `outline-style`/
  `box-shadow` değeri odaksızdan farklı"** diyor. Tek spec'te `toHaveCSS`, `evaluate`,
  `getComputedStyle`, `boxShadow` **sıfır** kez geçiyor (kapsam: `apps/admin/**`, kod).
  `tokens.test.ts` ham hex üzerinde matematik + `theme.css`↔`tokens.ts` bildirim pini
  yapıyor; **kullanım yerini** (bileşen `className` dizelerini) ve derlenen CSS'i
  ölçmüyor. Sonuç: S2'nin düzelttiği hata — `[--x]` arbitrary-value söz dizimi →
  `background-color:--color-brand-500` (geçersiz), 35 kullanım/20 geçersiz bildirim,
  tarayıcıda şeffaf buton + `border-radius:0` — **bugün tekrar yazılsa hiçbir statik veya
  dinamik kapı onu yakalamaz.** 13/13 yeşil AC13 testi onu bir kez göremedi; ikinci kez de
  göremeyecek. (Benim ölçümüm: kodda geçersiz desen **0**, derlenen CSS'te geçersiz
  bildirim **0** → *mevcut* durum temiz; eksik olan **koruma**.)
- **Düzeltme:** spec'e iki assertion ekle — (a) `Input` ve birincil `Button` için
  `focus()` öncesi/sonrası `box-shadow`/`outline-style` farkı (`toHaveCSS` yeterli,
  bağımlılık gerekmez); (b) `tokens.test.ts`'e `FOCUS_RING_CLASS_NAMES` ve bileşen
  `className` dizeleri üzerinde `[--` **yasak** / `(--` **zorunlu** yapısal kontrolü
  (`node:fs`, yeni paket yok) — ya da derlenen `dist/assets/*.css`'te
  `:\s*--color-` eşleşmesinin 0 olduğunu pinleyen bir build-sonrası kontrol.
- **Sorumlu ajan:** `frontend` (S5 — spec) + `frontend` (S2 — tokens testi); verdiği
  `wcag`.

**H2 — AC8'in render yarısı ölçülmemiş; başarısız giriş yolu hiç test edilmemiş**

- `apps/admin/e2e/panel-flow.spec.ts:311-334` (fırsat kaçırıldı) ·
  `apps/admin/src/__tests__/messages.test.ts:1-67` (kapsam dar) ·
  `apps/admin/src/messages/messages.ts:164-212` (`MESSAGES`, testsiz)
- AC8 **"giriş ekranı + kasıtlı başarısız giriş + hata durumunun render edilen metni
  `/\berrors\.[a-z]/` ile eşleşmiyor ve Better Auth'un ham İngilizce mesajını içermiyor"**
  diyor; AC kapsama haritası render yarısını **S5'e** veriyor. Gerçek durum:
  (i) tek spec'te **yanlış parolayla giriş denemesi yok** — `INVALID_EMAIL_OR_PASSWORD`
  ekran yolunun kapsamı **0**, UX'in özel olarak yazdığı enumeration-güvenli metin
  ("E-posta veya parola hatalı.") hiç çalıştırılmıyor;
  (ii) render edilen içerik üzerinde `/\berrors\.[a-z]/` veya `Invalid email or password`
  **yokluk assertion'ı yok** (benim ölçümüm: `apps/admin/**` içinde `not.toMatch` yalnızca
  `messages.test.ts:32,34`'te, yani **fonksiyon dönüşü** üzerinde);
  (iii) ironik biçimde `e2e:324-329` 500 fixture'ı gövdeye **`message: 'errors.internal'`**
  koyuyor — yani i18n-anahtarı-biçimli bir sunucu metni bilinçli olarak sahneye sürülüyor —
  ama o dizenin **ekranda bulunmadığı assert edilmiyor**; bedava duran ölçüm atlanmış;
  (iv) S5'in eklediği `MESSAGES` ağacının 24 girdisinin hiçbiri birim testli değil.
  Yapısal garanti (`PanelError` hiçbir mesaj alanı taşımıyor, `panel-error.ts:16-18`)
  gerçek ve değerli — ama PM'in kendi kuralı "**ölçülmeyen AC geçmiş sayılmaz**".
  AC18 bütçesinde **bir giriş daha yeri var** (3/4), yani engel teknik değil.
- **Düzeltme:** spec'e tek test ekle — yanlış parolayla giriş → `aria-live`/`role="alert"`
  bloğunda **"E-posta veya parola hatalı."** görünür **ve** `page.content()` ne
  `/\berrors\.[a-z]/` ne `Invalid email or password` içeriyor; `e2e:336-338`'e
  `expect(await page.content()).not.toContain('errors.internal')` satırını ekle;
  `messages.test.ts`'e `MESSAGES` ağacını özyineleyip her yaprağın boş olmadığını ve
  `/\berrors\.[a-z]/` ile eşleşmediğini assert eden bir test ekle.
- **Sorumlu ajan:** `frontend` (S5) + `qa`.

### medium

**M1 — `FOCUS_RING_CLASS_NAMES` tekrarı duruyor, gerekçe yorumu artık yanlış**

- `apps/admin/src/components/Sidebar.tsx:14-28` · `apps/admin/src/components/UserMenu.tsx:25-27`
  (karşılığı: `packages/ui/src/tokens.ts:132-133`, barrel export `packages/ui/src/index.ts:24`)
- Aynı 4 utility'lik dize **üç** yerde. Üçü **aynı sebeple** değişir (odak token'ı/kalıbı
  değişimi) → gerçek tekrar, yüzeysel benzerlik değil. Dahası iki dosyanın yorumu
  "`@arkesoft/ui`'nin index.ts barrel'ı bu sabiti DIŞA AÇMIYOR" diyor; **açıyor**
  (`index.ts:24`) → okuyanı yanlış yönlendiren, güncelliğini yitirmiş yorum.
- **Düzeltme:** iki dosyada `import { FOCUS_RING_CLASS_NAMES } from '@arkesoft/ui'`,
  yerel `const`'ları ve geçersiz yorumları sil. **M2 ile AYNI düzenlemede** yapılmalı.
- **Sorumlu ajan:** `frontend` (S5)

**M2 — `@source` glob'u `.ts` dosyalarını kapsamıyor; M1'in temizliği odak göstergesini sessizce yok eder**

- `apps/admin/src/styles.css:27` → `@source '../../../packages/ui/src/**/*.tsx';`
- `FOCUS_RING_CLASS_NAMES`'in **kanonik** bildirimi `packages/ui/src/tokens.ts` içinde —
  bir **`.ts`** dosyası, bu glob'un dışında. Odak utility'leri şu an üretiliyor
  (derlenen CSS'te `.focus-visible\:ring-2`, `ring-offset-2`,
  `--tw-ring-color: var(--color-focus-ring)` **var** — ölçtüm), ama bunun **tek sebebi
  M1'deki kopyaların `apps/admin/src/components/*.tsx` içinde olması**. Kopyalar
  silindiğinde Tailwind kalıbı hiçbir taranan dosyada görmez → odak göstergesi CSS'ten
  **sessizce düşer**, AC12 kırılır ve **H1 yüzünden hiçbir test bunu yakalamaz.**
- **Düzeltme:** glob'u `'../../../packages/ui/src/**/*.{ts,tsx}'` yap (aynı düzenlemede
  M1 ile); gerekçeyi yoruma yaz ("sınıf dizeleri `.ts` modüllerinde de yaşıyor").
- **Sorumlu ajan:** `frontend` (S5)

**M3 — Bağlayıcı tasarım dokümanı hâlâ GEÇERSİZ söz dizimini reçete ediyor**

- `docs/ui/T-008.md:13` → `focus-visible:ring-[--color-focus-ring]`
- Kod `(--…)`'e düzeltildi, ama **"tek ve sabit"** diye bağlayıcı ilan edilen kalıbı
  taşıyan doküman `[--…]` (Tailwind v4'te geçersiz) kaldı. Bu dokümanı izleyen sonraki
  bileşen yazarı **tam olarak aynı hatayı** yeniden üretir. (Kapsam notu: bu bir
  **doküman metni** eşleşmesidir — kodda 0 ölçtüm; ama burada metnin kendisi reçete
  olduğu için bulgudur, "yorumda jeton" durumu değildir.)
- **Düzeltme:** `docs/ui/T-008.md:13`'ü `(--color-focus-ring)` yap + "Tailwind v4'te
  `[--x]` `var()` ile sarmaz, geçersiz CSS üretir" notunu ekle (tekrarı önleyen ders).
  `.claude/workflow/tasks/T-008.md:315` tarihsel kayıt — Orkestratör isterse yanına not düşer.
- **Sorumlu ajan:** `ui` (+ `docs`)

**M4 — `resolvePanelErrorDisplayMessage` iki kopya; kök neden hata katmanının API boşluğu**

- `apps/admin/src/routes/_app.tsx:38-43` · `apps/admin/src/routes/_auth.sign-in.tsx:42-47`
- Birebir aynı 6 satır, iki dosyada. Yorum ("ayrı bir paylaşılan modül AÇILMADI") kararı
  kayda geçiriyor ama kararı haklı çıkarmıyor: ikisi **aynı sebeple** değişir
  (`PanelError`→metin politikası). Üçüncü ekran üçüncü kopyayı doğurur. Kök neden:
  `messages.ts` kodsuz dalı çözen bir API **sunmuyor** — `resolveErrorMessage(code: string)`
  kod istiyor, `GENERIC_ERROR_MESSAGE` (`messages.ts:70`) `private`, `kind:'unknown'`
  (`panel-error.ts:18`) kodsuz. S5 bunu doğru teşhis etti ama boşluğu **tüketicide**
  kapattı, **üreticide** değil.
- **Düzeltme:** `messages.ts`'e `export function resolvePanelErrorMessage(error: PanelError): string`
  ekle (tek `switch`, `kind:'known'` → `resolveErrorMessage`, `kind:'unknown'` →
  `MESSAGES.errors.network`); iki yerel kopyayı sil. Not: `messages.ts`'in `PanelError`
  tipini import etmesi katman ihlali değil (aynı paket, `errors/` → `messages/` yönü tek).
- **Sorumlu ajan:** `frontend` (S4 dosya sahibi + S5 çağıranlar)

**M5 — Alan doğrulama hatası tanınmayan kodda SESSİZCE yutuluyor**

- `apps/admin/src/routes/_auth.sign-in.tsx:49-57` ve `:59-64`
- `resolveEmailFieldErrorMessage` / `resolvePasswordFieldErrorMessage` tanınmayan
  `issue.code` için **`undefined`** dönüyor. `Input` (`packages/ui/src/components/Input.tsx:29,42-43,52`)
  `error === undefined` ise `aria-invalid`'i **ve** hata `<p>`'sini **hiç render etmiyor**.
  Sonuç: doğrulama gerçekten başarısız (`react-hook-form` gönderimi engeller) ama kullanıcı
  **hiçbir açıklama görmez** ve ekran okuyucuya hiçbir şey duyurulmaz — "hata `null`'a
  çevrilip sessizce devam" deseni (CLAUDE.md §10 madde 16). Bugün tetiklenmiyor (ölçülen
  iki kod `too_small`/`invalid_format` kapsanıyor) ama Zod sürümü, şema kuralı veya alan
  eklendiğinde **sessizce** doğar. `resolveErrorMessage`'ın fail-closed deseninin tam tersi.
- **Düzeltme:** iki fonksiyonun son dalını jenerik bir alan mesajına döndür
  (`MESSAGES.auth.signIn.fieldInvalid` gibi yeni bir katalog girdisi) — `undefined` yerine
  `string` dön, imzayı `=> string` yap; böylece `exhaustive` olmayan durum da görünür kalır.
- **Sorumlu ajan:** `frontend` (S5)

**M6 — Üretilmiş rota ağacı: 3 `as any` + `@ts-nocheck`; muafiyet yazılı değil, "typecheck kapsıyor" iddiası fiilen yanlış**

- `apps/admin/src/routeTree.gen.ts:3` (`@ts-nocheck`), `:19`, `:24`, `:29` (`} as any)`) —
  **kod satırları**; `:8`'deki "NOT make any changes" eşleşmesi **yorumdur, bulgu değil**.
- İki ayrı sorun: (a) AC4 **"`apps/admin/src`'te `any`/`@ts-ignore` 0"** ve AC23 **"`any` 0"**
  bu dosyayı kapsamıyor, ama muafiyet ne ROADMAP'te ne AC lafzında ne dosya başı yorumunda
  **hiçbir yerde yazılı değil** → ölçüm ile iddia ayrışmış; (b) architect riski 6 ve
  `tsconfig`/PO kararı "`typecheck` kapsamı **daraltılmaz**, `routeTree.gen.ts` typecheck
  dışında **bırakılmıyor**" diyor — `@ts-nocheck` bu garantiyi **fiilen iptal ediyor**:
  dosya `include`'da (`tsconfig.json:20`) ama içindeki hiçbir tip hatası `tsc --noEmit`'te
  görünmez (ör. bir route dosyası yeniden adlandırılırsa veya `parentRoute` uyuşmazsa).
  `high` **değil**, çünkü kod makine üretimi, upstream'in kontrolünde ve CLAUDE.md §2
  üretilen çıktıları kardeş kural için zaten muaf tutuyor; sorun **defter tutma**.
- **Düzeltme:** (i) muafiyeti açıkça yaz — AC4/AC23 lafzına "elle yazılan kaynak" kaydı +
  ROADMAP'e borç satırı; (ii) "typecheck kapsıyor" iddiasını düzelt (`@ts-nocheck` nedeniyle
  kapsamıyor) veya üretilmiş ağacı `src/` dışına (`src/generated/` + ayrı not) al.
- **Sorumlu ajan:** `devops` (S7 tarama kapsamı) + `architect` (iddianın düzeltilmesi)

**M7 — AC16 bütçesinin ölçtüğü "ilk rota" sıfır rota kodu içeriyor**

- `apps/admin/scripts/check-bundle-budget.ts:107-139` (`collectFirstRouteManifestKeys`) +
  `apps/admin/bundle-budget.config.ts:10,13`
- Script architect K7'nin yazılı tanımını (**entry + geçişli statik `imports`,
  `dynamicImports` izlenmez**) birebir uyguluyor — implementasyon doğru. Tanım ise
  `autoCodeSplitting: true` (`vite.config.ts:65`) ile birlikte ölçülen kümeyi boşaltıyor:
  `dist/.vite/manifest.json` okundu, entry (`index.html`) `imports: ["_messages-…js"]`,
  ve **dört rota bileşeninin tamamı** `isDynamicEntry: true`. Yani bütçe
  `index-*.js` + `messages-*.js` + `index-*.css`'i ölçüyor; `/sign-in`'in ilk boyada
  gerçekten indirdiği `_auth.sign-in-*.js` + `auth-rest-*.js` + `dist-*.js` chunk'ları
  **bütçenin dışında**. Sonuç: AC16'nın tavanı, kapatmak için kurulduğu büyümeyi
  (rota kodu) **yapısal olarak göremez** — mekanizma var, ölçtüğü şey niyetin yarısı.
- **Düzeltme:** entry'nin yanına **ilk render edilen rotanın dinamik girdisini** (ve onun
  geçişli statik import'larını) da ekle, ya da iki sayıyı ayrı raporla
  ("entry+paylaşılan" / "ilk rota toplam") ve bütçeyi ikincisine bağla; K7'nin "ilk rota"
  tanımını buna göre netleştir.
- **Sorumlu ajan:** `architect` (tanım) + `frontend` (S5, script) ; verdiği `perf`

**M8 — `headingLevel` asimetrisinin yalnızca bir kolu test ediliyor**

- `apps/admin/e2e/panel-flow.spec.ts:131-137` (`expectBasicPageInvariants`), `:305`, `:337`,
  `:364` · karşılığı `apps/admin/src/routes/_app.tsx:86,102,168,192`
- `ui` ajanı `headingLevel` prop'unu özellikle **çift `h1` riskini** önlemek için ekledi.
  Test durumu: `ErrorState headingLevel="h1"` (kabuksuz) `:337`/`:364`'te ölçülüyor ✔;
  ama **`headingLevel="h2"` kolu (`_app.tsx:192` — kabuk mount olduktan sonra arka plan
  hatası) hiç senaryolaştırılmamış**, yani çift `h1`'in gerçekten doğabileceği **tek**
  konfigürasyon (route'un `h1`'i + `ErrorState`'in başlığı aynı DOM'da) ölçülmüyor.
  Ayrıca `expectBasicPageInvariants` hata/pending durumlarında **hiç çağrılmıyor**
  (yalnızca `:150`, `:170`, `:186` — mutlu yol), ve `:305`'teki pending kontrolü başlığın
  **düzeyini** assert etmiyor (`getByText`, `getByRole('heading', {level:1})` değil).
- **Düzeltme:** AC9 bloğuna bir test ekle — panel yüklendikten **sonra** `session.me`'yi
  500'e çevirip (`route` sayacıyla ikinci istekte), `AppShell` yerinde kalırken
  `getByRole('heading',{level:2,name:'Bir sorun oluştu'})` **ve**
  `expectBasicPageInvariants` (tam bir `h1`) assert et; `:305`'i
  `getByRole('heading',{level:1,name:'Oturumunuz doğrulanıyor…'})`'e çevir.
- **Sorumlu ajan:** `frontend` (S5) ; verdiği `wcag`

### low

- **L1** — `apps/admin/src/index.ts:1-9` — **ölü kod**. `package.json`'dan `exports`/`main`/
  `types` kaldırıldı (architect K5), Vite girişi `index.html` → `main.tsx`, ve hiçbir dosya
  bu modülü import etmiyor (ölçtüm: `apps/admin` dışında `@arkesoft/admin` değer-import'u 0).
  Yorumu da bayat: "Vite + React + TanStack Router iskeleti v0.0.7'de kurulacak" — kuruldu.
  **Düzeltme:** dosyayı sil. **Sorumlu:** `frontend` (S5) veya `devops`
- **L2** — Bayat `ensureQueryData` atıfları: `apps/admin/src/routes/_app.tsx:4`, `:13`, `:118`
  ve `apps/admin/src/routes/__root.tsx:7` guard'ın `ensureQueryData` kullandığını yazıyor;
  kod `:52`'de `queryClient.query({...sessionMeQueryOptions, staleTime:'static'})` kullanıyor.
  `apps/admin/src/api/session-query.ts:6` `useQuery(sessionMeQueryOptions())` yazıyor —
  export bir **nesne**, fonksiyon değil. Ayrıca `_app.tsx:162-164`'ün savunma dalı için
  verilen gerekçe ("`useQuery` ilk render'da senkron `data` ÜRETMEYEBİLİR") TanStack Query
  için **doğru değil**; o dalın gerçek erişilebilir yolu `handleSignOut`'un
  `queryClient.clear()` sonrası yeniden render'ıdır (`:148`) — yorum *neden*i yanlış
  anlatıyor. **Düzeltme:** beş yorumu güncelle. **Sorumlu:** `frontend` (S5)
- **L3** — `apps/api/src/tenancy/tenant-exempt-paths.ts:29` "Eklenen 10 eleman, **üç** grup"
  diyor ama yalnızca `(1)` ve `(2)` listeli; v0.0.7 yeni grubu `:53`'te **`(4)`** diye
  numaralandırdı → var olmayan bir `(3)`'e atıfta bulunan bir numaralandırma. Bu sürümün
  düzenlemesi tutarsızlığı pekiştirdi. **Düzeltme:** grupları `(1)(2)(3)` olarak yeniden
  numaralandır veya eksik `(3)` metnini geri koy. **Sorumlu:** `backend` (S3)
- **L4** — `packages/ui/src/index.ts:32-41` `CardHeader`/`CardTitle` export ediyor;
  `apps/admin`'de **tüketici yok** (ölçtüm: `apps/admin/src` içinde 0 eşleşme). AC15
  "tüketicisi olmayan export'lar raporda **açıkça listelenir**" diyor ama kayıtta yalnızca
  `Toast`/`DataTable` var (`index.ts:9-11`, `Toast.tsx:3-9`, `DataTable.tsx:3-9`) — bu ikisi
  **gizlenmemiş** ama `CardHeader`/`CardTitle` **listelenmemiş**. Benzer: `LoadingStateProps.headingLevel`'ın
  `'h2'` üyesi hiç kullanılmıyor ve bileşen kendi yorumunda bunu kabul ediyor
  (`LoadingState.tsx:7-9`) → kullanılmayan genellik. **Düzeltme:** ikisini AC15 kaydına
  ekle (ya da `CardHeader`/`CardTitle`'ı ilk tüketicisine kadar export etme).
  **Sorumlu:** `frontend` (S2) + `devops` (S7, AC15 raporu)
- **L5** — `apps/admin/e2e/panel-flow.spec.ts:46`, `:53` — `as Record<string, unknown>`
  (Zod'dan **önce**; runtime guard'ın içinde, güvenli genişletme). `src/` dışında olduğu
  için AC4'ün kapsamında değil ve `scripts/check-bundle-budget.ts`'in aynı deseninin
  gerekçesi var (orada `zod` bağımlılığı K7 ile yasak); burada `zod` **mevcut**
  (`package.json:28`). **Düzeltme:** iki guard'ı küçük Zod şemalarıyla değiştir.
  **Sorumlu:** `frontend` (S5)
- **L6** — `apps/admin/src/routes/_app.tsx:140-142` — `SESSION_NOT_FOUND → "çıkış yapılmış
  say"` eşlemesi sunum katmanında. Davranış doğru ve gerekçeli, ama bu bir *hata kodu →
  durum* politikasıdır ve `api/auth-rest.ts`'in `SignOutResult` sözleşmesine aittir
  (`signOut()` o kodu `{kind:'signed-out'}`'a indirgeyebilir). Bugün tek tüketici var;
  ikincisi çıktığında eşleme kopyalanır. **Düzeltme:** eşlemeyi `auth-rest.ts`'e taşı.
  **Sorumlu:** `frontend` (S4/S5)
- **L7** — `apps/admin/eslint.config.mjs:37-42` ve `packages/ui/eslint.config.mjs:52-57` —
  `mergeRestrictions` birebir aynı 6 satır artık **dört** dosyada
  (`apps/api/eslint.config.mjs:163`, `packages/trpc/eslint.config.mjs:47` + bu ikisi). Ortak
  evi dördünün **zaten import ettiği** `packages/config/eslint/base.js`
  (`:261` export satırı). `medium` **değil**: S2 ve S4'ün DOKUNMAZ listesi
  `packages/config/**`'ı kapsıyordu, yani kopya plan tarafından zorunlu kılındı.
  **Düzeltme:** `base.js`'ten `mergeRestrictions`'ı export et, dört kopyayı sil (ayrı,
  küçük bir devops işi). **Sorumlu:** `devops`

---

## 3. ÖLÇÜMLER

```
ÖLÇÜMLER:
  komut çalıştırılmadı (Bash tool yok) — Orkestratör'ün lint/typecheck/test/build
  sayıları DOĞRULANMADI. Aşağıdakiler Read + Grep (ripgrep) ölçümleridir.

  İncelenen dosya: 46
    apps/admin 31 (src 22 · e2e 1 · scripts 1 · kök yapılandırma 6 · dist/manifest 1)
    packages/ui 11 · apps/api 6 (3 yeni + 2 test + app.module/tenant-exempt/trpc.controller)
    packages/config 2 (base.js, react.js) · packages/trpc 1 · docs/ui 1

  any (KOD satırı, yorum hariç):      3 — hepsi apps/admin/src/routeTree.gen.ts:19,24,29 (ÜRETİLMİŞ)
                                          elle yazılmış kodda 0 · packages/ui'de 0
  @ts-nocheck (KOD):                  1 — routeTree.gen.ts:3
  @ts-ignore / @ts-expect-error:      0
  gerekçesiz as:                      0 (5 kullanımın hepsi runtime guard içinde veya `as const`)
  eslint-disable-next-line:           1 (_app.tsx:61, gerekçeli — TanStack redirect() Response döner)
  console.log (uygulama kodu):        0

  En büyük fonksiyon: 104 satır — apps/admin/src/routes/_auth.sign-in.tsx:70-173 (SignInPage)
                      ikinci: 84 — apps/admin/src/routes/_app.tsx:123-206 (AppLayoutComponent)

  Döngüsel bağımlılık: 0 (paketler arası ve dosyalar arası)
  Katman ihlali: 0 (packages/ui veri çekmiyor · apps/admin'de iş kuralı yok · apps/*→apps/* yok)
  Çekirdekte sağlayıcı dallanması: 0
  R-P1 birleştirmesi: 2/2 dosyada DOĞRULANDI (base.js:38-45'in sınıf bileşeni yasağı korunuyor)
  Geçersiz Tailwind v4 (--x) söz dizimi: kodda 0 · derlenen CSS'te 0 · DOKÜMANDA 2 (M3)
  AC18 sign-in bütçesi: 3/4 (e2e:182, 237, 279) — KORUNUYOR
  AC17 mekanik: projects 1 · viewport 1 · workers 1 · toHaveScreenshot/toMatchSnapshot 0

  Test sayıları (dosyaları okuyarak sayıldı, koşturulmadı):
    packages/ui/tokens.test.ts 13 (10 it.each çifti + 2 fixture + 1 pin)
    apps/admin: normalize-panel-error 12 · messages 8 · transport-aware-fetch 4 · panel-origin-pin 1 = 25
      (Orkestratör 26 bildirdi — fark muhtemelen it.each sayımı; doğrulanamadı)
    apps/api: panel-origin-cors 5 · no-store-headers 5
    e2e: 8 test (1 describe.serial + 1 iç describe)

  Bulgu dağılımı: critical 0 · high 2 · medium 8 · low 7
```

**SONUÇ: FAIL** — `AGENT_BASELINE.md` §4: en az bir `high` → FAIL (ayrıca 8 `medium` ≥ 3 → FAIL).
H1 ve H2 düzeltildiğinde ve M1+M2 **aynı düzenlemede** kapatıldığında tur 2 PASS alabilir;
M3–M8 düzeltilmezse `medium` eşiği (≥3) hâlâ FAIL verir.
