# T-008 — `solid` gate, tur 2

Tarih: 2026-11-01
Sürüm: ROADMAP v0.0.7 (platform 0.0.6 → 0.0.7)
Task: `.claude/workflow/tasks/T-008.md`
Tur 1 raporu: `.claude/workflow/reviews/T-008-solid-tur1.md`

```
GATE: solid
SONUÇ: PASS
```

PASS gerekçesi `AGENT_BASELINE.md` §4: `critical` 0 · **`high` 0** · **`medium` 1** (1–2 `medium`
→ PASS, borca kaydedilir) · `low` 13. Tur 1'in 2 `high`'ı **kapandı**, 8 `medium`'un **7'si
kapandı** (M6 kısmen — kayıt bekliyor, kod tarafı tamam).

---

## 0. Ölçüm kapsamı ve yöntemi

**`Bash` tool'um yok — hiçbir komut çalıştırılmadı.** Orkestratör'ün bildirdiği
`lint 17/17 · typecheck 17/17 · format:check temiz · build 12/12 · test 624 · test:isolation 8/8 ·
bütçe MAKSİMUM 174.53/250 (%69.8)` sayılarını **doğrulayamadım**. Aşağıdaki her ölçüm `Read` +
`Grep` (ripgrep) ile yapıldı ve **kapsamı açıkça yazılıdır**.

**Çapraz doğrulayabildiğim iki sayı (dosyaları okuyup test sayarak):**

| Orkestratör | Benim sayımım | Sonuç |
| --- | --- | --- |
| `ui 21` | `tokens.test.ts` 13 + `tailwind-custom-property-syntax.qa.test.ts` **8** (4 kök + 4 iç `describe`) = **21** | ✔ tutuyor |
| `admin 29` | `normalize-panel-error` 12 + `messages` **12** (7+3+2) + `transport-aware-fetch` 4 + `panel-origin-pin` 1 = **29** | ✔ tutuyor |

| Ölçüm | Kapsam | Sonuç |
| --- | --- | --- |
| `any` | `apps/admin/**/*.{ts,tsx}` — **kod satırı** | **3** — `src/routeTree.gen.ts:19,24,29` (ÜRETİLMİŞ, architect Karar 3 ile **muaf**). Elle yazılan kodda **0**. `:8`'deki "NOT make any changes" **yorum** → bulgu değil |
| `any` | `packages/ui/**/*.{ts,tsx}` | **0** |
| `@ts-nocheck` | aynı iki kapsam — kod | **1** (`routeTree.gen.ts:3`, muaf) |
| `@ts-ignore` / `@ts-expect-error` | aynı iki kapsam | **0** |
| `as` tip zorlama | `apps/admin/**/*.{ts,tsx}` — kod | **9**; **9/9'u elle yazılmış runtime guard'ın İÇİNDE** (`unknown` → `Record<string, unknown>` genişletmesi, ardından alan kontrolü): `scripts/check-bundle-budget.ts:80,92,135,144` · `scripts/check-compiled-css-contract.ts:119` · `e2e/panel-flow.spec.ts:46,53` · `e2e/qa-blind-spot-…:106,113`. `packages/ui` **0** |
| `import * as` | aynı kapsam | 1 (`UserMenu.tsx:21`, Radix namespace import — tip zorlama değil) |
| `eslint-disable` | `apps/admin/**` | **2**: `_app.tsx:51` (gerekçeli, meşru) · `routeTree.gen.ts:1` (üretilmiş) |
| Geçersiz Tailwind v4 `-[--token]` | `packages/ui/src/**` + `apps/admin/src/**` — kod | **0** |
| `text-(--font-size-` (ipucu yok) | aynı kapsam — kod | **0** (hepsi `text-(length:--font-size-*)`) |
| `fetch(` / `useQuery(` / `@tanstack/*` / `@arkesoft/{trpc,api,db}` | `packages/ui/src/**` + `packages/ui/package.json` | **0** (AC14 yapısal olarak korunuyor) |
| `vite build` çağrısı | repo geneli `*.{json,yml,yaml,mjs,ts}` | **1** — `apps/admin/package.json:9` (tek nokta, bugün başka yol yok) |
| İncelenen dosya | — | **30** (28 tam/kısmi okuma + 2 grep-only) |
| En büyük fonksiyon | — | `apps/admin/scripts/check-bundle-budget.ts:255-384` → `main()`, **130 satır** (tur 1'de en büyük 104'tü) |

---

## 1. Tur 1'in 17 bulgusunun kapanış kararı

### `high`

**H1 (AC12/AC13 — düzeltilen hata sınıfına sıfır regresyon koruması) → KAPANDI**

Dayanak — koruma artık **üç katmanda** ve her katman **kullanımı** ölçüyor:

| Katman | Dosya:satır | Pozitif assertion var mı |
| --- | --- | --- |
| Kaynak | `packages/ui/src/__tests__/tailwind-custom-property-syntax.qa.test.ts:217-233` | **evet** — `text-(length:--font-size-*)` **≥1** zorunlu (2 ağaçta) |
| Derlenmiş artefakt | `apps/admin/scripts/check-compiled-css-contract.ts:300-321` (P1) | **evet** — kaynakta referans verilen HER token izinli özellikte `var()` olarak geçmek zorunda |
| Render edilmiş DOM | `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts:211-223` | **evet** — `boxShadow`/`outlineStyle`/`outlineWidth` odaklı≠odaksız **ve** `boxShadow !== 'none'`, Input **ve** birincil Button için |

Bekçi `build` zincirinde gerçekten koşuyor (`apps/admin/package.json:9`) — architect Risk 4
("script var ama zincirde değil") **ihlal edilmemiş**.

**H2 (AC8'in render yarısı + başarısız giriş yolu) → KAPANDI**

- `qa-blind-spot-…:387-400` **(G)**: gerçek bir başarısız giriş (var olmayan kullanıcı, gerçek
  backend) → `page.getByText('E-posta veya parola hatalı.')` görünür **ve** `page.content()`
  ne `/\berrors\.[a-z]/` ne `invalid email or password` içeriyor. Tur 1'de bu senaryo
  **hiç yoktu**.
- `qa-blind-spot-…:244-261` **(H2)**: alan hatası `<p>`'sinin hesaplanmış `color`'ı.
- `messages.test.ts:63-90`: `resolvePanelErrorMessage` için üç test — `known`, `known` ama
  **katalog dışı kod** (fail-closed), `unknown` → `MESSAGES.errors.network`.
- Kalan artık: `MESSAGES` ağacının 24+ yaprağı için hâlâ özyinelemeli "boş değil / i18n anahtarı
  biçiminde değil" taraması **yok**; 500 ekranlarında (`errors.internal` fixture'ı sahnede)
  **yokluk** assertion'ı hâlâ yok → **L-N13** (low). AC8'in lafzı ("giriş ekranı + kasıtlı
  başarısız giriş") **karşılanıyor**.

### `medium`

**M1 (`FOCUS_RING_CLASS_NAMES` tekrarı + yanlış yorum) → KAPANDI.**
`Sidebar.tsx:25` ve `UserMenu.tsx:27` artık `@arkesoft/ui` barrel'ından ithal ediyor; literal
kopya **0** (ölçtüm: `apps/admin/src`'te `FOCUS_RING_CLASS_NAMES` yalnızca import + kullanım);
yorumlar (`Sidebar.tsx:14-20`, `UserMenu.tsx:24`) **doğru**. Üçüncü tüketici de (`AppShell.tsx:23`)
aynı kaynağı kullanıyor. **Kalıntı:** kanonik sabitin dosya başı yorumu (`packages/ui/src/tokens.ts:132-142`)
hâlâ silinen kopyalardan bahsediyor → **L-N1**.

**M2 (`@source` globu `.ts`'i kaçırıyor) → KAPANDI.**
`apps/admin/src/styles.css:35` → `@source '../../../packages/ui/src/**/*.{ts,tsx}';` + gerekçe
yorumu (`:27-33`) + "geri DARALTMA" talimatı. **Sıra doğru uygulanmış**: glob genişlemesi ve kopya
silinmesi **aynı düzenlemede**, architect Risk 1 ihlal edilmemiş (P1 `.ts`'i **gevşetilmeden**
tarıyor: `check-compiled-css-contract.ts:173`).

**M3 (bağlayıcı doküman geçersiz söz dizimini reçete ediyor) → KAPANDI.**
`docs/ui/T-008.md:13` artık `ring-(--color-focus-ring)` + neden açıklaması; ayrıca `:143-167`
kalıcı "Tailwind v4 özel-özellik söz dizimi reçetesi" bölümü (namespace → derlenen özellik →
doğru söz dizimi → tip ipucu tablosu + iki hata sınıfı). Reçete bekçinin allowlist'iyle
**birebir tutarlı** (karşılaştırdım: 5 namespace, aynı özellikler).

**M4 (`resolvePanelErrorDisplayMessage` iki kopya) → KAPANDI.**
`messages/messages.ts:253-258` `resolvePanelErrorMessage(error: PanelError)`; iki yerel kopya
silindi (`_app.tsx:31-33`, `_auth.sign-in.tsx:40-42` kayıt yorumları yerinde), iki çağıran tek
kaynağı kullanıyor (`_app.tsx:94,204`, `_auth.sign-in.tsx:114`). Boşluk **üreticide** kapatıldı
— tur 1'in talebi buydu. Küçük artık: `switch`+`assertNever` yerine `if/return` → **L-N8**.

**M5 (tanınmayan `issue.code` → sessiz yutma) → KAPANDI.**
`_auth.sign-in.tsx:62` ve `:72` son dal artık `MESSAGES.auth.signIn.fieldGenericError`
(`messages.ts:191`). İmza `string | undefined` **kaldı** ama `undefined` artık **yalnızca
`errorType === undefined`** (yani "hata yok") durumunda dönüyor (`:53-55`, `:66-68`) — bu
semantik olarak doğru ve `Input`'un `error` prop'unun opsiyonelliğiyle uyumlu. Sessiz yutma yolu
**kapalı**: hata varsa her zaman görünür bir metin var.

**M6 (`routeTree.gen.ts` muafiyeti yazılı değil) → KISMEN (kod tarafı tamam, kayıt bekliyor).**
- Muafiyetin **tanımı** architect Karar 3'te net ve Risk 6 yeniden ifade edildi (task:926-931) —
  "typecheck kapsıyor" iddiası düzeltildi. ✔
- Kanonik ölçüm komutu `--glob '!**/routeTree.gen.ts'` taşıyor ve bu turda uygulandı. ✔
- A-A10 ölçüldü ve tuttu (md5 birebir yeniden üretim). ✔
- **AÇIK olan tek şey kayıt:** `docs/development.md`'de `routeTree.gen.ts` geçmiyor (ölçtüm:
  grep `routeTree\.gen` → **0 eşleşme**), ROADMAP'te de yok. S6 henüz koşmadı → **bulgu
  yazmıyorum**, ama §4'te **kapanış şartı** olarak bildiriyorum.

**M7 (AC16 bütçesi rota kodunu ölçmüyor) → KAPANDI.**
`bundle-budget.config.ts:37-46` iki giriş noktası bildirimi + `check-bundle-budget.ts:263-319`
iki fail-closed `throw` + `:341-362` üç sayı raporu + `:367,374` eşik **yalnızca maksimuma**
bağlı. Eşikler **değişmedi** (250/50, `bundle-budget.config.ts:11,14`). architect Risk 2'nin üç
yasağı: `throw`→`console.warn` **yapılmamış** ✔ · bildirim listesi **boşaltılmamış** (2 giriş,
3 önek) ✔ · assertion B **kaldırılmamış** ✔ · `DELIBERATELY_LAZY_ROUTE_SRCS` **boş** ✔.
Ölçülen %69.8 < %100 → A-A12 tuttu, bütçe yükseltilmedi.

**M8 (`headingLevel`'ın `h2` kolu) → KAPANDI.**
`panel-flow.spec.ts:419-475` **(d)** — `h2` kolu **deterministik** bir tetikleyiciyle (ikinci
`session.me` isteği 500) ölçülüyor: `getByRole('heading',{level:2})` görünür · kabuk yerinde
(`Kullanıcı menüsü` + `navigation`) · `heading level 1` sayısı **0** · AC11'in `lang`/`main`/
`<title>` şartları ayrıca assert ediliyor. `expectBasicPageInvariants` üç yeni yere eklendi
(`:311`, `:347`, `:377`) ve (d)'de **bilerek çağrılmaması** gerekçeli (`:398-418`) — gerekçe
doğru (bu dalda `Outlet` unmount olduğu için "tam bir h1" şartı geçerli değil). ✔

### `low`

| # | Karar | Dayanak |
| --- | --- | --- |
| **L1** (ölü `src/index.ts`) | **KAPANDI** | Dosya yok (`Glob` → "No files found"); `from '@arkesoft/admin'` değer-import'u repo genelinde **0** (kalan eşleşmeler yorum/CI filtresi/ROADMAP metni); `tsconfig.json:20` glob tabanlı, kırık referans yok |
| **L2** (beş bayat yorum) | **KISMEN** | 4/5 düzeltildi: `_app.tsx:5-9` (`ensureQueryData`→`query`), `_app.tsx:38-41`, `__root.tsx`, `session-query.ts:6-8` (nesne vs fonksiyon) ✔. **Düzeltilmeyen:** `_app.tsx:171-173` savunma dalının gerekçesi hâlâ "`useQuery` ilk render'da senkron `data` ÜRETMEYEBİLİR" diyor — TanStack Query için **yanlış**; gerçek erişilebilir yol `queryClient.clear()` sonrası yeniden render (`:148`). *Neden*i yanlış anlatan yorum → **L-N2** olarak yeniden açıyorum |
| **L3** (`tenant-exempt-paths.ts` numaralandırması) | **AÇIK — kabul edilebilir** | `:29` hâlâ "üç grup" diyor, `(1)`+`(2)` listeli, `:53` `(4)` ekliyor. `apps/api` bu turda **DOKUNMAZ** listesindeydi → ertelenmesi plana uygun; borca kalır |
| **L4** (`CardHeader`/`CardTitle` kayıt dışı) | **KAPANDI** | `packages/ui/src/index.ts:32-40` AC15 kaydını açıkça yazıyor (+ `perf`'in 0 KiB tree-shaking ölçümü). `LoadingStateProps.headingLevel`'ın `'h2'` kolu **tip olarak korunuyor** ve kararın gerekçesi `LoadingState.tsx:11-23`'te (simetrik sözleşme: `ErrorState`'in `h2` kolu **gerçekten** kullanılıyor) — gevşetme değil, **belgelenmiş** kullanılmayan genellik. Kabul |
| **L5** (e2e `as Record` yerine Zod) | **AÇIK ve GENİŞLEDİ** | `panel-flow.spec.ts:46,53` duruyor; aynı guard çifti `qa-blind-spot-…:106,113`'e **kopyalandı** → **L-N10** |
| **L6** (`SESSION_NOT_FOUND` sunum katmanında) | **KAPANDI** | `_app.tsx:130-139` gerekçe yorumu yazıldı: tek tüketici, ADR-0010 §3.6'ya atıf, ikinci tüketicide `isSessionAlreadyGone(code)`'a terfi sözü. "Erken soyutlama yapmama" kararı meşru ve **kayıtlı** |
| **L7** (`mergeRestrictions` ×4) | **AÇIK — kabul edilebilir** | `packages/config/**` plan gereği DOKUNMAZ'dı; kopya plan tarafından zorunlu kılındı, 6 satır, davranışı tur 1'de 2/2 dosyada doğruladım. `devops` borcu olarak kalması **kabul edilebilir** |

---

## 2. Sekiz özel dikkat maddesi

### 1 — Adlandırdığım sınıf ("bildirimi pinleyen, kullanımı ölçmeyen kontrol") kapandı mı?

**Dört yeni mekanizmanın hepsini kendi kriterimle denetledim. Dördü de totoloji tuzağına
DÜŞMEMİŞ.**

| Mekanizma | Yalnızca "yasak kalıp yok" mu? | Sıfır kullanımda geçer mi? | Karar |
| --- | --- | --- | --- |
| ① **N1** (`check-compiled-css-contract.ts:274-282`) | evet, saf negatif | evet (sıfır CSS'te geçer) | **tek başına totoloji — ama P2 kapatıyor** |
| ① **N2** (`:284-298`) | evet, saf negatif (her `var()` kullanımı üzerinde) | evet | **tek başına totoloji — P1+P2 kapatıyor** |
| ① **P1** (`:300-321`) | **hayır — POZİTİF**: kaynakta referans verilen HER token derlenmiş CSS'te **izinli bir özellikte** `var()` olarak geçmek zorunda | **hayır** | **✔ kullanımı ÖLÇÜYOR** |
| ① **P2** (`:323-343`) | hayır — üç alt eşik: `declarations ≥ 50`, `@theme` token tanımı `≥ 5`, `referencedTokens.size > 0` | **hayır** (boş/yanlış dosya ve boş kaynak taraması **kırmızı**) | **✔ sağlık kontrolü gerçek** |
| ② **Bütçe A** (`check-bundle-budget.ts:263-288`) | hayır — bildirilen her önek **≥1 manifest anahtarıyla** eşleşmek zorunda, yoksa `throw` | **hayır** (sessiz küçülme imkânsız) | **✔** |
| ② **Bütçe B** (`:294-319`) | hayır — `isDynamicEntry` taşıyan her anahtar **ya talep edilmiş ya muaf listesinde** olmak zorunda, yoksa `throw` | **hayır** | **✔** (muafiyet listesinin genişliği → **L-N6**) |
| ③ **Kaynak testi** (`tailwind-…qa.test.ts:217-233`) | hayır — iki negatif (`toBe(0)`) **+ iki pozitif** (`toBeGreaterThan(0)`, iki ağaçta) | **hayır** | **✔** |
| ④ **e2e hesaplanmış stil** (`qa-blind-spot-…:211-223`, `:239-241`, `:257-260`) | hayır — `not.toEqual` + `boxShadow !== 'none'` + `font-size === '24px'` + `color === 'rgb(185, 28, 28)'` | **hayır** (öğe yoksa locator zaman aşımına düşer) | **✔** |

**Kritik gözlem:** `architect`'in P1'i bu tuzaktan kaçınmak için tasarlaması **işe yaramış** —
ama P1 tek başına yeterli olmazdı: P1'in girdisi kaynak taramasıdır ve kaynak hiç token
referansı içermezse P1 **boş kümede döner, sessizce geçer**. Bunu kapatan şey `:339-343`'teki
üçüncü P2 alt kontrolü (`referencedTokens.size === 0` → kırmızı). **İkisi birlikte** totolojiyi
kapatıyor; P1 yalnız bırakılsaydı sınıf tekrar ederdi. Bu, sınıfın bu sürümde **anlaşıldığının**
kanıtı.

**Sınıfın tur 1'deki beş örneğinin bugünkü durumu:** H1 ✔ · H2 ✔ · M6 ✔ (kod tarafı) ·
M7 ✔ · M8 ✔. **Sınıf bu sürümde kapandı.** Yeni bir örneği **bir yerde** buldum:
`pnpm test:e2e`'in AC18 bütçesi artık *bildirilen* sayıyı (≤4) *gerçek* sayıyla (5) uyumsuz
ölçüyor ve kimse ölçmüyor → **M-N1** (bu turun tek `medium`'u, aşağıda).

### 2 — `architect`'in bulduğu totolojinin düzeltmesi yeni kör nokta doğuruyor mu?

**Hayır — dışlama ÇOK DAR, çok geniş değil. Ölçtüm.**

`countWrappedUsagesExcludingUnhintedFontSize` (`tailwind-…qa.test.ts:149-160`) sağlık
sayacından **yalnızca** `match.startsWith('text-(--' + 'font-size-')` olan eşleşmeleri çıkarıyor.
Dışlamanın genişliğini ölçtüm (kapsam: `packages/ui/src` + `apps/admin/src`, kod satırları):

- Dışlanan biçim (`text-(--font-size-…`) **bugün 0 kez** geçiyor → sağlık sayacından çıkan
  gerçek eleman **sıfır**.
- Sayaçta kalan meşru eşleşmeler: `bg-(--color-*)`, `text-(--color-*)`, `border-(--color-*)`,
  `ring-(--color-*)`, `rounded-(--radius-*)`, `font-(--font-weight-*)` — ölçtüm, `packages/ui`'de
  (ör. `Toast.tsx:26-28`, `Button.tsx:59`) ve `apps/admin`'de (ör. `Sidebar.tsx:36,43`) bolca var.
  Pozitif sağlık kanıtı **gerçekten iyi huylu eşleşmelerden** geliyor.
- Dışlanan şeyin **kendisi** iki ayrı assertion'la (`:217-222`) **açıkça pinleniyor** → dışlama
  "sessiz" değil. Bu, düzeltmenin doğru yapıldığının yapısal kanıtı.

**Düzeltmenin dar bıraktığı yer (yeni kör nokta değil, bilinen ve belgeli sınır):**
`countUnhintedFontSizeUsages` **yalnızca `text-` önekine** bağlı. `font-(--font-size-h1)` veya
`leading-(--font-size-h1)` gibi başka bir utility ile yanlış namespace kullanılırsa **bu test
görmez**. Ama **bekçi görür**: N2 token'ın namespace'ini bulup özelliği allowlist'te arar
(`check-compiled-css-contract.ts:284-298`) → `font-size` dışı her özellik **kırmızı**. Yetki
devri dosya başında açıkça yazılı (`tailwind-…qa.test.ts:6-17`, "BU TESTİN YETKİSİ YOK") →
**bulgu yazmıyorum**, kapsam bilinçli ve doğru katmana devredilmiş.

### 3 — `test.skip` ve CLAUDE.md §6

**Mekanik uyum:** §6 `test.skip`'i "ROADMAP'te takip kaydı olmadan" yasaklıyor. Takip satırının
**birebir metni** `qa-blind-spot-…:481-487`'de hazır; ROADMAP'te **henüz yok** (ölçtüm:
`ROADMAP.md`'de `refetchOnReconnect` → 0 eşleşme). Talimat gereği bunu "ihlal" saymıyorum —
S6 işleyecek. **§4'te kapanış şartı olarak bildiriyorum.**

**Metnin yeterliliği — iki sorun buldum:**

1. **Metin ne denendiğini ve neden bırakıldığını iyi anlatıyor** (2 mekanizma, ölçülmüş
   başarısızlık oranı, kök neden hipotezi, vade v0.0.19, sorumlu `qa`). Bu kısım **yeterli**.
2. **Ama gerekçesinin bir öncülü YANLIŞ.** `:71-74` ve `:476-480` şöyle diyor: *"bu, h1→h2
   geçişini kapsayan **TEK** test — kaldırmak gerçek bir kapsam boşluğu açar."* Bu **doğru
   değil**: `panel-flow.spec.ts:419-475` **(d)** aynı dalı (`AppLayoutComponent`'in
   `ErrorState headingLevel="h2"` kolu) **deterministik** bir tetikleyiciyle ölçüyor ve aynı üç
   şeyi assert ediyor (`level:2` başlık · kabuk yerinde · `level:1` sayısı 0). (F)'nin gerçek
   katkısı **dal kapsamı değil, tetikleyici kapsamı** (`refetchOnReconnect` kablolaması). →
   **L-N12**: ROADMAP satırı **yazılmadan önce** metin düzeltilsin, aksi halde kalıcı kayda
   yanlış bir "kapsam boşluğu" gerekçesi giriyor ve v0.0.19'da gereksiz iş doğuruyor.
3. Ayrıca `:450-456` ve `:514-522`'deki **eski** yorum blokları hâlâ "DETERMİNİSTİK …
   zamanlama belirsizliği YOK" diyor — `test.skip('…FLAKY…')` satırının **hemen üstünde**.
   Birbiriyle çelişen iki yorum → **L-N3**.

### 4 — `pnpm test`'in `platform:auth:*`'ı sıfırlaması: kabul edilebilir dev kolaylığı mı?

**Değerlendirmem: hayır, kabul edilebilir dev kolaylığı DEĞİL — gerçek bir test kalitesi
defektidir.** Gerekçe:

- `apps/api/src/__tests__/helpers/create-test-app.ts:159` her `createTestApp()` sonrası
  `platform:auth:*` **global** Redis namespace'ini siliyor (`:63-64,70-78`). Bir test yardımcısı,
  **sahibi olmadığı** paylaşılan altyapı durumunu mutasyona uğratıyor — test izolasyonunun ihlali
  (kendi namespace'ini değil, **platform kapsamlı** öneki temizliyor).
- Doğrudan sonuç: **zorunlu kapı komutu** (`pnpm test`) AC18'in "arada elle Redis flush olmadan"
  önkoşulunu **yan etki olarak** ihlal ediyor. Kapıyı iki e2e koşumu arasında çalıştıran biri
  AC18'i farkında olmadan geçersiz kılıyor ve **oran sınırı regresyonlarını da gizliyor**
  (sayaç sürekli sıfırlanıyorsa limitleyicinin bozulması testlerde görünmez).
- **Hafifletici üç gerçek:** (a) davranış `:26-30` ve `:157-158`'de **belgeli**, gizli değil;
  (b) T-006/S8'den **önceden var**, bu turun ürünü değil; (c) `apps/api` bu turda **DOKUNMAZ**
  listesindeydi; kök neden `apps/api` test hattının hermetikliği = **borç 1439, vade v0.0.8**.

→ Bu turda `low` (**L-N11**), **sorumlu `backend` (S3) + `qa`**, vade **v0.0.8** (borç 1439'un
içine, ayrı satır olarak: *"test yardımcısı global `platform:auth:*` önekini siliyor → AC18
önkoşulu `pnpm test` ile sessizce geçersizleşiyor"*). Bu turda `medium` yazmak, kapsam dışı ve
önceki sürümden devredilen bir borcu bu sürüme fatura etmek olurdu.

### 5 — S1'in `minimatch` atfı düzeltmesi: teyit

**Teknik ölçüm doğru, kayıt henüz hiçbir izlenen dosyada yok.**
- `security` tur 1'in kendi raporu (`T-008-security-tur1.md:59-69`) zaten **1 yol** (`jsx-a11y`
  → `minimatch@3.1.5`) ile **60 yol** arasındaki farkı gösteriyor ve `minimatch@10.2.6`'nın
  `eslint`'ten geldiğini kabul ediyor. S1'in "jsx-a11y'yi kaldırmak bu bulguyu **kapatmaz**"
  sonucu bu veriyle **tutarlı** → teyit ediyorum.
- **Ama düzeltilmiş borç metni ROADMAP'te yok** (ölçtüm: `ROADMAP.md`'de `minimatch` →
  **0 eşleşme**). Kayıt doğruluğu ancak S6 satırı yazdığında gerçekleşir → §4 kapanış şartı.
  Bu bir kod kalitesi bulgusu değil, bulgu yazmıyorum.

### 6 — İki script'in kod kalitesi

| Kriter | `check-compiled-css-contract.ts` | `check-bundle-budget.ts` |
| --- | --- | --- |
| `any` / `@ts-ignore` | **0** / **0** | **0** / **0** |
| `as` | 1 (`:119`, guard içinde) | 4 (`:80,92,135,144`, guard içinde) |
| Regex'ler belgeli mi | **evet** — `:184`, `:212`, `:228`, `:274`, `:331` hepsi JSDoc/yorumlu; `:200-204` neden AST gerekmediğini açıklıyor | yok (regex yok) |
| Fail-closed tablo genişletilebilir mi + **görünür inceleme** gerektiriyor mu | **evet** — `:74-87` tablo + "varsayılan REDDETMEK, meşru yeni çift **Türkçe gerekçeyle**" + `TENANT_EXEMPT_PATHS` emsali | **evet** — `bundle-budget.config.ts:48-56` muafiyet listesi + "Türkçe GEREKÇE yorumu taşımak ZORUNDA" |
| Hata mesajları eyleme dönük mü (Türkçe) | **evet** — `:295` izinli özellikleri **listeliyor**; `:318` tam token adını veriyor; `:327,336,341` ne yapılacağını söylüyor | **evet** — `:277-283` olası üç nedeni **sayıyor** ve hangi dosyayı güncelleyeceğini yazıyor; `:310-316` iki seçeneği açıklıyor |
| `throw` vs `process.exitCode` ayrımı tutarlı mı | **evet, ilkeli:** *yapısal/girdi* hataları `throw` (`:116,121,144,149`), *sözleşme ihlalleri* toplanıp `:354` `process.exitCode = 1` (tüm ihlaller **bir arada raporlanıyor** — iyi tasarım) | **evet, ilkeli:** fail-closed A/B `throw` (architect "exitCode yetmez" dedi, uyulmuş), bütçe aşımı `:382` `process.exitCode = 1` |
| İkisi arasında tekrar | `parseManifest`/`isManifestEntry` **benzer ama aynı değil**: CSS bekçisi `isEntry`+`css` ister, bütçe `file`+`src`+`imports`+`dynamicImports` ister ve `file: string` **zorunluluğunu** doğrular. **İkisi farklı sebeplerle değişir** (biri CSS çıktısı, diğeri chunk grafiği) → **meşru bağımsızlık, tekrar olarak işaretlemiyorum.** `:100-101` bu seçimi açıkça kayda geçiriyor | — |

**architect Risk 2'nin üç yasağı — hiçbiri ihlal edilmemiş** (yukarıda M7'de dosya:satır ile).

**İki bulgu:** `main()` 130 satır / 7 sorumluluk ve iki assertion'ın `main` içine gömülü olması
(→ **L-N5**); `DELIBERATELY_LAZY_ROUTE_SRCS`'in `startsWith` eşleşmesi (→ **L-N6**); N1 regex'inin
çok-bileşenli değer kör noktası (→ **L-N7**).

### 7 — `rm -rf dist/.vite`

① **Taşınabilirlik:** bulgu **değil**. Aynı paketin `clean` script'i (`apps/admin/package.json:14`)
zaten `rm -rf dist .turbo` kullanıyor ve `packages/ui/package.json:25` de aynı — repo genelinde
**yerleşik konvansiyon**, bu satır ondan sapmıyor. CI ubuntu, dev darwin; Windows desteği hiçbir
yerde iddia edilmiyor.

② **Artık-risk kaydı yeterli mi:** **bugün yeterli.** Ölçtüm: repo genelinde `vite build`'i
çağıran **tek** yer `apps/admin/package.json:9` (kapsam: `*.{json,yml,yaml,mjs,ts}`); alternatif
bir deploy yolu **yok** (v0.0.7'de deploy hattı yok). Risk gerçek ama **hipotetik** → borç satırı
doğru çözüm. Kalıcı çözüm (kanonik komutun CI adımı olması) Orkestratör onayı bekliyor; sınıfı
architect Risk 4'ün ("script zincirde değilse hiç koşmaz") kardeşi: *zincir var ama atlanabilir*.

③ **Sıra DOĞRU.** `vite build && CSS bekçisi && bütçe && rm -rf dist/.vite`: iki script de
manifest'i **silinmeden önce** okuyor. Teyit: `check-compiled-css-contract.ts:69,261` ve
`check-bundle-budget.ts:59,258` ikisi de `dist/.vite/manifest.json`'u okuyor ve `rm` zincirin
**son** halkası. Sıra bozulsaydı script'ler manifest bulamayıp **`throw`** ederdi (fail-closed,
sessiz geçmezdi) — yani yanlış sıra bile sessiz yeşil üretmiyor. ✔
Yan etki: `pnpm build` sonrası manifest yok → script'leri **tek başına** yeniden koşmak
`throw` verir. Fail-closed, kabul.

### 8 — Yeni tekrar veya sızıntı

① **`messages.ts`'in üçüncü yazıcısından sonra AC8'in yapısal garantisi — HÂLÂ YERİNDE. ✔**
Satır satır doğruladım:
- `PanelError` (`errors/panel-error.ts:16-18`) hâlâ **hiçbir mesaj alanı taşımıyor** (`code`,
  `requestId`, `kind` — hepsi bu). Karar 1 (`:9-11`) yerinde.
- `ERROR_MESSAGES … satisfies Record<PanelErrorCode, string>` (`messages.ts:119`) **duruyor** →
  kapalı dünya derleme zamanında zorlanıyor; `ERROR_MESSAGES_KEY_COUNT` (`:127`) + testi
  (`messages.test.ts:54-56`) bağımsız çalışma zamanı kanıtı.
- `GENERIC_ERROR_MESSAGE` (`:70`) hâlâ **private**; `resolveErrorMessage` gövdesi (`:140-145`)
  **değişmemiş** → fail-closed geri düşüş **gevşetilmedi**.
- Üçüncü yazıcı (`resolvePanelErrorMessage`, `:253-258`) garantiyi **genişletmiyor, devralıyor**:
  `known` → `resolveErrorMessage`, `unknown` → katalog sabiti. Ham sunucu metni basma yolu
  **hâlâ yapısal olarak imkânsız**. Üç yazıcı (S4 yapı · S5 `MESSAGES` · S5 `resolvePanelErrorMessage`)
  kesişimi boş, sınır yorumları (`:6-10`, `:159-165`, `:235-241`) doğru.

② **`AppShell.skipToContentLabel`: katman ihlali YOK. ✔**
`AppShell.tsx:29` prop olarak `string` alıyor; metin `MESSAGES.appShell.skipToContent`'ten
(`messages.ts:209-212`) `_app.tsx:186` üzerinden geliyor. Sunum bileşeni katalogdan **import
etmiyor** — mevcut 11 etiket prop'uyla **aynı desen**. Gözlem (bulgu değil): prop sayısı 12'ye
çıktı; v0.0.14'te ikinci ekran gelince bir `panelLabels` nesnesi/context düşünülebilir. Bugün
erken soyutlama olurdu.

③ **`apps/admin/src/index.ts` silindi — kırılan import YOK. ✔** (L1'de ölçümle).

④ **`motion-reduce:animate-none` iki yerde: tekrar DEĞİL. ✔**
`Button.tsx:48` ve `LoadingState.tsx:53` **iki ayrı DOM öğesine** uygulanan bir Tailwind
varyantı; sınıf dizesini "paylaşmak" mümkün değil (her öğe kendi `className`'ini taşır). İki
spinner markup'ı birbirine benziyor ama ortak bir `Spinner` bileşenine çıkarmak
`docs/ui/T-008.md:9`'un bağlayıcı "altıncı bileşen önerilmiyor" kararını ihlal ederdi →
**yüzeysel benzerlik, işaretlemiyorum.**

### Katman / bağımlılık / sağlayıcı denetimi (bu turda yeniden)

- **`packages/ui` veri çekmiyor:** `package.json:27-33` yalnızca `clsx` + `tailwind-merge`
  (+ `react` **peer**); `@arkesoft/*` ve `@tanstack/*` **yok**; `src/**`'te `fetch(`/`useQuery(`
  **0**. ✔
- **`apps/admin`'de iş kuralı yok:** `_auth.sign-in.tsx:29-36` Zod şeması yalnızca **şekil**
  doğruluyor ve `:4-11` sunucu doğrulamasının yerine geçmediğini yazıyor. ✔
- **Bağımlılık yönü:** `apps/admin` → `@arkesoft/{ui,trpc,errors,config}`; `packages/ui` → hiçbir
  iç pakete bağımlı değil; `apps/*` → `apps/*` **0**. **Döngüsel bağımlılık 0.** ✔
- **Yeni ana bağımlılık 0** (iki script yalnızca `node:fs`/`node:path`/`node:url`/`node:zlib`). ✔
- **Çekirdekte sağlayıcı dallanması 0** (`if (provider === …)` sınıfı dallanma yok). ✔

---

## 3. BULGULAR

```
BULGULAR:
```

### medium (1)

**M-N1 — AC18'in koşum başına `sign-in` bütçesi aşıldı (5/4) ve değişiklikten sonra iki-ardışık-koşum ÖLÇÜLMEDİ**

- `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts:180` (programatik `sign-in`)
  ve `:393` ((G)'nin **gerçek backend'e giden** başarısız girişi) ·
  `apps/admin/e2e/panel-flow.spec.ts:8-17` (bütçe **"spec başına"** diye yazılı) ·
  `apps/admin/playwright.config.ts:17-20` (bayat değişmez iddiası) ve `:29-32` (bütçe
  **"koşum başına"** diye yazılı — aynı paket içinde **çelişkili iki tanım**)
- **Ölçüm (kapsam: `apps/admin/e2e/**`, gerçek `/auth/*` çağrıları; `page.route()` ile taklit
  edilenler SAYILMADI):** `panel-flow.spec.ts` **3** `sign-in` (UI · klavye · `:279`
  programatik) + `qa-blind-spot-…` **2** (`:180` programatik + `:393` (G)) = **koşum başına 5
  `sign-in`**. `sign-up`: 3 + 1 = **4**.
- `architect` Risk 5 (task:402) **bağlayıcı**: *"**koşum başına** ≤4 `sign-in`. Aşan spec AC18'i
  kırar ve 'flaky' diye **yanlış teşhis** edilir."* `playwright.config.ts:29` bunu doğru yazıyor;
  ama `panel-flow.spec.ts:10` **"spec başına EN ÇOK 4"** diye yeniden yorumlamış — ve bütçe
  tam o yorum sayesinde ikinci spec dosyası eklenirken **kimse tarafından toplanmadı**.
  `playwright.config.ts:18-20`'nin "sayacı paylaşan **TEK bir spec dosyası var**" değişmezi
  artık **yanlış**: iki dosya var, ikisi de aynı IP sayacını tüketiyor.
- **`high` DEĞİL, çünkü:** AC18'in **lafzı** (task:143) "iki ardışık koşum aynı sayıyla yeşil"
  diyor; aritmetik hâlâ tutuyor (`sign-in` 2×5 = 10 ≤ 20/15dk; `sign-up` 2×4 = 8 ≤ 10/saat) →
  AC'nin **başarısız olduğunu kanıtlayamam**. `AGENT_BASELINE` §4: "emin değilsen bir alt
  seviyeyi seç".
- **Ama ölçüm eksik:** Orkestratör'ün bu turdaki ölçüm bloğunda `test:e2e` **hiç yok**. İki
  ardışık koşum en son `security`/`qa` tur 1'de, **ikinci spec dosyası eklenmeden önce**
  ölçüldü (8 test). Şimdi koşum 15 test ve bütçe %25 daha fazla tüketiyor; `sign-up` tarafında
  iki koşum **8/10** → bir tek fazladan koşum AC18'in doğrulanmasını **bir saat boyunca
  imkânsız** kılıyor (`qa` bu turda tam olarak buna çarptı).
- **Düzeltme (üç adım, hepsi gerekli):** (i) koşum başına sayıyı **≤4'e indir** — en ucuz yol
  `qa-blind-spot-…:180`'in programatik girişini kaldırıp (E)'nin oturumunu `panel-flow`'un
  `storageStateForAc9` desenine bağlamak **veya** (G)'nin gerçek denemesini korumak için
  (E)/(F)'yi `storageState`'siz kurgulamak; **veya** architect Risk 5'in sayısını **ölçülmüş
  gerekçeyle resmen revize etmek** (Karar 4'ün kendi ilkesi gereği sessiz yükseltme **yasak**);
  (ii) `panel-flow.spec.ts:10`'un "spec başına" ifadesini "**koşum başına, iki spec dosyasının
  TOPLAMI**" olarak düzelt ve iki dosyanın toplamını tek yerde (`playwright.config.ts`) yaz;
  (iii) `playwright.config.ts:18-20`'nin "TEK spec dosyası" değişmezini düzelt ve **AC18'i
  değişiklik sonrası yeniden ölç** (iki ardışık koşum, aynı sayı).
- **Sorumlu ajan:** `qa` (yeni spec'in sahibi + AC18 ölçümü) + `architect` (bütçe tanımının tek
  yeri) ; verdiği `solid`
- **Not:** (iii)'ün ölçümü **kırmızı** gelirse bu bulgu `high`'a yükselir (AC18 karşılanmıyor).

### low (13)

- **L-N1** — `packages/ui/src/tokens.ts:132-142` — **bayat ve yanlış yönlendiren yorum**:
  "Şu an (`apps/admin/src/styles.css:27`) glob yalnızca `.tsx` tarıyor; odak halkası CSS'i bu
  sabit ÜZERİNDEN DEĞİL, `Sidebar.tsx`/`UserMenu.tsx`'teki LİTERAL kopyalar sayesinde üretiliyor.
  O kopyalar … temizlenmeden önce glob … düzeltilmek ZORUNDA." Üç şeyin **üçü de artık yanlış**:
  glob `{ts,tsx}` (ve `:35`'te, `:27`'de değil), kopyalar **silindi**, odak halkası **bu sabit
  üzerinden** üretiliyor. Bu, tur 1'de M1'in şikâyet ettiği defekt sınıfının (güncelliğini
  yitirmiş yorum) **başka bir dosyada tekrarı**. **Düzeltme:** uyarıyı "tüketen uygulamanın
  `@source` globu `.ts`'i **taramak zorundadır**; `apps/admin` bunu `styles.css:35`'te yapıyor"
  biçiminde kalıcı bir **kurala** çevir, tarihçeyi sil. **Sorumlu:** `frontend` (S2)
- **L-N2** — `apps/admin/src/routes/_app.tsx:171-173` — L2'nin **kapanmayan** parçası: savunma
  dalının gerekçesi hâlâ "`useQuery` ilk render'da senkron `data` ÜRETMEYEBİLİR (cache okuma
  bir an sürebilir)" diyor. TanStack Query için **doğru değil** (cache okuması senkron); o dalın
  gerçek erişilebilir yolu `handleSignOut`'un `queryClient.clear()`'ı sonrası yeniden render
  (`:148`). *Neden*i yanlış anlatan yorum, kodu tekrar eden yorumdan daha zararlıdır.
  **Düzeltme:** gerekçeyi gerçek yola göre yaz. **Sorumlu:** `frontend` (S5)
- **L-N3** — `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts:450-456` ve
  `:514-522` — `test.skip('…FLAKY…')` satırının (`:488`) **hemen üstünde ve içinde** duran iki
  yorum bloğu hâlâ "DETERMİNİSTİK tetikleyici … zamanlama belirsizliği YOK" diyor; `:458-487`
  ise tam tersini (iki mekanizma da deterministik değil) kanıtla anlatıyor. Beş yıl sonra okuyan
  biri hangisine inanacağını bilemez. **Düzeltme:** eski iki bloğu sil veya "DENENDİ, YETERSİZ"
  olarak işaretle. **Sorumlu:** `qa`
- **L-N4** — `apps/admin/scripts/check-compiled-css-contract.ts:42` — dosya başı yorumundaki
  hedef `build` satırı `&& rm -rf dist/.vite` halkasını **içermiyor** (gerçek satır:
  `apps/admin/package.json:9`). Bekçinin kendi belgelediği zincir, gerçek zincirden sapmış.
  **Düzeltme:** satırı güncelle (veya "güncel hâli `package.json`'da" deyip kopyalamayı bırak —
  ikinci seçenek bayatlamayı yapısal olarak önler). **Sorumlu:** `frontend` (S5)
- **L-N5** — `apps/admin/scripts/check-bundle-budget.ts:255-384` — `main()` **130 satır** (bu
  sürümün en büyük fonksiyonu, tur 1'de 104'tü) ve **yedi sorumluluk** taşıyor: config yükle ·
  manifest ayrıştır · assertion A · assertion B · paylaşılan çekirdek · giriş noktası toplamları ·
  rapor + eşik. İki fail-closed assertion `main`'in **içine gömülü** olduğu için **izole olarak
  test edilemez** (bugün ikisinin de birim testi yok). **Düzeltme:** `assertDeclaredPrefixesExist()`
  ve `assertEveryDynamicEntryIsAccountedFor()` olarak çıkar (saf fonksiyonlar, `manifest` +
  `budget` alır, `throw` eder) — `main` 7 çağrıya iner ve assertion'lar test edilebilir hâle
  gelir. **Sorumlu:** `frontend` (S5)
- **L-N6** — `apps/admin/scripts/check-bundle-budget.ts:304-306` +
  `apps/admin/bundle-budget.config.ts:56` — fail-closed assertion B'nin muafiyet eşleşmesi
  `src === allowed || src.startsWith(allowed)`. **Önek** eşleşmesi olduğu için listeye tek bir
  `'src/routes/'` satırı eklemek **assertion B'yi tümüyle etkisizleştirir** — architect Risk
  2'nin yasakladığı "bildirim listesini boşaltmak" eylemine **tek satırda ve görünmez biçimde**
  denk bir sonuç. Liste bugün **boş**, yasak ihlal edilmemiş; sorun mekanizmanın kendisi.
  **Düzeltme:** eşleşmeyi **tam eşitliğe** indir (veya öneki `.tsx`/`.ts` ile bitmeye zorla) ve
  `DELIBERATELY_LAZY_ROUTE_SRCS.length` için bir üst sınır/kardinalite assertion'ı ekle
  (`TENANT_EXEMPT_PATHS` emsalinin aynısı). **Sorumlu:** `architect` (karar) + `frontend` (S5)
- **L-N7** — `apps/admin/scripts/check-compiled-css-contract.ts:274` — N1'in deseni
  (`/:\s*(--[a-zA-Z0-9-]+)\s*[;}]/`) yalnızca **değerin TAMAMI** sarılmamış bir özel özellik
  olan bildirimi görüyor. Çok bileşenli bir değerde (ör. `box-shadow:0 0 0 2px --color-focus-ring`)
  sarılmamış token **görünmez**. Bu sürümün gerçek hatası tek bileşenliydi (ölçüldü: 20 geçersiz
  bildirim, hepsi tek değer) → bugün kayıp yok; ama N1 "sınıf 1'in regresyon koruması" olarak
  iddia edildiği için sınırı yazılı olmalı. **Düzeltme:** deseni değer içinde herhangi bir
  konumda arayacak biçimde genişlet (`var(` ile başlamayan `--token` token'ı) **veya** bu sınırı
  dosya başı yorumuna yaz. **Sorumlu:** `frontend` (S5)
- **L-N8** — `apps/admin/src/messages/messages.ts:253-258` ve `:242` — iki küçük sapma:
  (a) `resolvePanelErrorMessage` discriminated union üzerinde `if/return` kullanıyor;
  CLAUDE.md §4 "discriminated union + exhaustive `switch` (+ `assertNever`)" diyor — `PanelError`'a
  üçüncü bir `kind` eklenirse fonksiyon **sessizce** `MESSAGES.errors.network` döner (tsc uyarmaz);
  (b) `import type { PanelError }` dosyanın **242. satırında** (259 satırlık dosyada), diğer tüm
  modüllerin aksine. **Düzeltme:** `switch (error.kind)` + `assertNever(error)`; import'u dosya
  başına taşı. **Sorumlu:** `frontend` (S4 dosya sahibi)
- **L-N9** — `apps/admin/src/__tests__/messages.test.ts:13-57` ve
  `apps/admin/src/messages/messages.ts:176-233` — H2'nin kalan artığı: `MESSAGES` ağacının
  24+ yaprağı için hâlâ "boş değil **ve** `/\berrors\.[a-z]/` ile eşleşmiyor" özyinelemeli
  taraması yok; ayrıca 500/403 ekranlarında (`errors.internal` / `errors.crossSiteRequestRejected`
  fixture gövdede sahnede — `panel-flow.spec.ts:331`, `:438`, `qa-blind-spot-…:317`) o dizelerin
  **ekranda bulunmadığı** assert edilmiyor (bedava duran iki ölçüm). Yapısal garanti bunu
  imkânsız kılıyor, bu yüzden `low`. **Düzeltme:** `messages.test.ts`'e ağacı özyineleyen tek
  test + üç e2e noktasına `expect(await page.content()).not.toMatch(/\berrors\.[a-z]/)`.
  **Sorumlu:** `qa`
- **L-N10** — `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts:85-184` —
  `panel-flow.spec.ts:25-130`'dan **~70 satır birebir kopya**: `FIXTURE_PASSWORD`,
  `MAILPIT_BASE_URL`, dört Mailpit arayüzü, iki tip guard (`as Record<string, unknown>` dahil —
  tur 1 L5'i şimdi **iki** dosyada), `findVerificationToken`. İkisi **aynı sebeple** değişir
  (Mailpit API / doğrulama e-postası biçimi) → **gerçek tekrar**. `medium` **değil**: kopya
  `AGENT_BASELINE` §5'in "başka ajanın dosyasını değiştirme" kuralı tarafından **zorunlu
  kılındı** (L7 ile aynı statü) ve `:116` bunu açıkça kayda geçiriyor. **Düzeltme:**
  `e2e/helpers/mailpit.ts` + `e2e/helpers/fixture-user.ts` — **mevcut v0.0.19 e2e fixture
  borcunun içine** (yeni borç satırı değil). **Sorumlu:** `qa`
- **L-N11** — `apps/api/src/__tests__/helpers/create-test-app.ts:159` (+ `:63-78`) — test
  yardımcısı her `createTestApp()` sonrası **global** `platform:auth:*` Redis önekini siliyor →
  zorunlu kapı komutu (`pnpm test`) AC18'in "arada elle flush yok" önkoşulunu **yan etki olarak
  ihlal ediyor** ve oran sınırı regresyonlarını gizliyor. Değerlendirmem: **kabul edilebilir dev
  kolaylığı değil, test izolasyonu defekti** (yardımcı sahibi olmadığı paylaşılan durumu
  mutasyona uğratıyor); `low` çünkü davranış belgeli (`:26-30`), **T-006/S8'den önceden var** ve
  `apps/api` bu turda DOKUNMAZ. **Düzeltme:** flush'ı testin kendi oluşturduğu anahtar önekine
  daralt (ör. `platform:auth:*:ip:<test-ip>`) veya test hattına izole Redis DB ver.
  **Sorumlu:** `backend` (S3) + `qa` ; **vade v0.0.8** (borç 1439 hermetiklik satırının içine,
  ayrı madde)
- **L-N12** — `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts:71-74`, `:476-480`
  ve `:481-487` — `test.skip` gerekçesinin öncülü **yanlış**: "(F) … h1→h2 geçişini kapsayan
  **TEK** test — kaldırmak gerçek bir kapsam boşluğu açar." `panel-flow.spec.ts:419-475` **(d)**
  aynı dalı **deterministik** tetikleyiciyle ve aynı üç assertion'la ölçüyor. (F)'nin gerçek
  katkısı dal değil **tetikleyici** kapsamı (`refetchOnReconnect`). ROADMAP takip satırı bu
  yanlış öncülle **kalıcı kayda geçerse** v0.0.19'da gereksiz iş doğurur. **Düzeltme:** metni
  *"(d) dalı kapsıyor; (F)'nin kapsadığı ek şey `refetchOnReconnect` kablolamasıdır"* diye
  düzelt — **sonra** ROADMAP'e yaz. **Sorumlu:** `qa` (metin) + `docs` (S6, kayıt)
- **L-N13** — `apps/admin/scripts/check-compiled-css-contract.ts:284-321` — N2 ve P1 için
  **kayıtlı kasıtlı-bozma kanıtı bulamadım** (kapsam: script dosyası + task dosyasının "Düzeltme
  Turu 1" bölümü). N1 için kanıt **var ve değerli** (`:4-11`: bekçi yazılırken yorum metninin
  kendisi N1'i kırmış, "ÖLÇÜLDÜ — bizzat yaşandı"). P1'in architect tarafından "bugün KIRMIZI"
  diye tasarlandığı yazılı ama **kırmızı ölçtüğü koşum raporlanmamış**; iki script için birim
  testi de yok. **Düzeltme:** `pnpm --filter @arkesoft/admin build` zincirinde N2 ve P1'i tek
  tek kırmızıya düşürüp çıktıyı rapora yaz (`qa`'nın kaynak testi için yaptığının aynısı) —
  ya da L-N5'in çıkarmasından sonra birim testi yaz. **Sorumlu:** `qa` + `frontend` (S5)
- **L-N14** — `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts:241` (`'24px'`)
  ve `:260` (`'rgb(185, 28, 28)'`) — iki hesaplanmış-stil assertion'ı token değerlerinin
  **elle tutulan aynası**; `--font-size-h1` veya `--color-danger-600` değişirse test
  "beklenmeyen stil" diye kırılır, oysa sebep kasıtlı bir token değişikliğidir. Pin olarak
  **savunulabilir** (değişiklik bilinçli olmak zorunda) ama hata mesajı kök nedeni söylemiyor.
  **Düzeltme:** beklenen değeri `COLOR_TOKENS['--color-danger-600']`'dan türet (barrel zaten
  export ediyor, `packages/ui/src/index.ts:22`) veya assertion'a "token X'ten gelir" yorumu ekle.
  **Sorumlu:** `qa`

---

## 4. Kapanış şartları (kod bulgusu değil — kayıt eksikleri)

Bunlar PASS'ı engellemiyor ama **S6/`docs` koşmadan sürüm kapanmamalı**:

1. **`routeTree.gen.ts` muafiyeti** → `docs/development.md`'ye (architect Karar 3). Ölçtüm:
   dosyada `routeTree.gen` **0 eşleşme**. M6'nın kapanışı buna bağlı.
2. **(F) `test.skip` takip satırı** → ROADMAP'e (CLAUDE.md §6 zorunluluğu). Ölçtüm: ROADMAP'te
   `refetchOnReconnect` **0 eşleşme**. **L-N12 gereği metin düzeltildikten sonra** yazılsın.
3. **`minimatch` borç satırı** → ROADMAP'e, S1'in düzeltilmiş atfıyla ("jsx-a11y'yi kaldırmak
   bu bulguyu kapatmaz; 60 yolun asıl hacmi `eslint` ← her paketin devDependency'si").
   Ölçtüm: ROADMAP'te `minimatch` **0 eşleşme**.
4. **`qa`'nın homebrew `redis-server` keşfi** → `docs/development.md`'ye. Ölçtüm: dosyada
   `redis-server`/`homebrew` **0 eşleşme**.
5. **AC16'nın yeni sayısı** `release`/`docs`'ta **"bütçe gevşetildi" diye yazılmamalı** —
   doğru ifade architect Karar 1'de (task:846-848): *"bütçe artık rota kodunu da ölçüyor;
   kullanım %52.6 → ~%70, tavan aynı."*
6. **AC18'in iki ardışık koşumu**, ikinci spec dosyası eklendikten **sonra** yeniden ölçülsün
   (M-N1 (iii)).

---

## 5. ÖLÇÜMLER

```
ÖLÇÜMLER:
  komut çalıştırılmadı (Bash tool yok) — Orkestratör'ün lint/typecheck/format/test/
  isolation/build/bütçe sayıları DOĞRULANMADI. Aşağıdakiler Read + Grep (ripgrep)
  ölçümleridir; her birinin kapsamı §0'da yazılı.

  Çapraz doğrulanabilen iki sayı TUTTU: ui 21 (13+8) · admin 29 (12+12+4+1).

  İncelenen dosya: 30
    apps/admin 20 (src 10 · e2e 2 · scripts 2 · kök yapılandırma 5 · package.json 1)
    packages/ui 5 · apps/api 1 (grep) · docs 2 · .github 1 · ROADMAP 1 (grep)

  any (KOD satırı, yorum hariç):
    apps/admin/**/*.{ts,tsx}   3 — hepsi src/routeTree.gen.ts:19,24,29 (ÜRETİLMİŞ,
                                   architect Karar 3 ile MUAF; kanonik komut
                                   --glob '!**/routeTree.gen.ts' taşıyor)
    elle yazılmış kod          0
    packages/ui/**/*.{ts,tsx}  0
  @ts-nocheck:                 1 (routeTree.gen.ts:3, muaf) · @ts-ignore/@ts-expect-error: 0
  gerekçesiz as:               0 (9 kullanımın 9'u elle yazılmış runtime guard içinde)
  eslint-disable-next-line:    1 (_app.tsx:51, gerekçeli — TanStack redirect() Response döner)
  console.log (uygulama kodu): 0 (iki script process.stdout/stderr, no-console o dizinde kapalı)

  En büyük fonksiyon: 130 satır — apps/admin/scripts/check-bundle-budget.ts:255-384 main()
                      ikinci: 104 — apps/admin/src/routes/_auth.sign-in.tsx:79-182 SignInPage
                      üçüncü: 104 — apps/admin/src/routes/_app.tsx:113-216 AppLayoutComponent
                      dördüncü: 100 — check-compiled-css-contract.ts:260-359 main()
                      (tur 1'de en büyük 104'tü → +26, yeni script'ten)

  Döngüsel bağımlılık: 0 · Katman ihlali: 0 · Çekirdekte sağlayıcı dallanması: 0
  Yeni ana bağımlılık: 0 (iki script yalnızca node:fs/path/url/zlib)
  Geçersiz Tailwind v4 söz dizimi: kodda 0 · ipucusuz text-(--font-size-*): 0 · DOKÜMANDA 0 (M3 kapandı)
  architect Risk 2'nin üç yasağı: 3/3 İHLAL EDİLMEMİŞ (throw yerinde · bildirim listesi dolu · B yerinde)
  Bütçe eşikleri: 250/50 KiB DEĞİŞMEDİ (bundle-budget.config.ts:11,14)
  build zinciri sırası: DOĞRU (iki script manifest'i rm -rf'TEN ÖNCE okuyor)
  vite build çağıran yer: 1 (apps/admin/package.json:9 — tek nokta, alternatif deploy yolu yok)
  AC18 sign-in bütçesi: 5/4 — AŞILDI (panel-flow 3 + qa spec 2) → M-N1
  AC18 sign-up: 4/koşum (tavan 10/saat → iki koşum 8/10)

  Tur 1 bulgularının kapanışı:
    high  2/2 KAPANDI
    medium 7/8 KAPANDI · 1 KISMEN (M6 — kod tarafı tamam, docs kaydı bekliyor)
    low   3/7 KAPANDI (L1, L4, L6) · 1 KISMEN (L2 → L-N2) · 3 AÇIK ve kabul edilebilir
          (L3 apps/api DOKUNMAZ · L5 genişledi → L-N10 · L7 packages/config DOKUNMAZ)

  Bulgu dağılımı (tur 2): critical 0 · high 0 · medium 1 · low 13
    (tur 1: critical 0 · high 2 · medium 8 · low 7)
```

**SONUÇ: PASS** — `AGENT_BASELINE.md` §4: `high`/`critical` **0** ve `medium` **1** (1–2 →
PASS, bulgu teknik borca kaydedilir). Tur 1'in iki `high`'ı ve yedi `medium`'u **ölçümle
doğrulanarak** kapandı; M6'nın tek kalan parçası bir **kayıt** (§4 madde 1) ve S6 henüz koşmadı.
Tek `medium` (M-N1) teknik borca kaydedilmeli; **M-N1 (iii)'ün ölçümü kırmızı gelirse bu gate
`high`'a yükselir ve FAIL olur** — AC18 o zaman karşılanmıyor demektir.
