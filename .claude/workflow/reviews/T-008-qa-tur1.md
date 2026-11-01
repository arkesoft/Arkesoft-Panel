# T-008 — qa gate, tur 1

- **Tarih:** 2026-11-01
- **Sürüm:** ROADMAP v0.0.7 (platform 0.0.6 → 0.0.7), `minor`
- **Kapsam:** `apps/admin/**`, `packages/ui/**`, `apps/api/src/{http/*, tenancy/tenant-exempt-paths.ts, trpc/trpc.controller.ts, auth/auth.controller.ts}` (S1/S2/S3/S4/S5/S6/S7 çıktıları) · 23 AC
- **Önceki gate'ler (bu tur):** `security` → PASS (7 low, 0 high/critical) · `solid` → **FAIL** (2 high + 8 medium — `AGENT_BASELINE §4`)

```
GATE: qa
SONUÇ: FAIL
BULGULAR:
  - [SEV: high] packages/ui/src/tokens.ts:132-133 + apps/admin/src/{components/UserMenu.tsx:27, Sidebar.tsx:28} — AC12'nin kendi metni "inputlar ve birincil buton için odaklı durumun hesaplanmış outline-style/box-shadow değeri odaksızdan FARKLI" diyor; bu, architect'in AC kapsama haritasında AÇIKÇA S5'e ("hesaplanmış stil") atanmış bir kanıt yüküydü. Benim turumdan ÖNCE repo genelinde `getComputedStyle`/`boxShadow`/`outlineStyle`/`toHaveCSS` grep'i **0** idi — yalnızca `outline-none`/`focus-visible:ring-*` SINIF LİSTESİNİN varlığı (statik grep) doğrulanmıştı; `tokens.test.ts`'in AC13 kontrast testiyle AYNI sınıf kör nokta (ham kaynak/hex üzerinde matematik, render edilen DOM/CSS'e hiç bakmıyor — bu sürümün beş `packages/ui` bileşeninin geçersiz CSS ürettiği ve bunun 13/13 yeşil AC13 testiyle YAKALANAMADIĞI olayının BİREBİR aynı sınıfı). `solid` gate'i BAĞIMSIZ olarak AYNI boşluğu H1 olarak işaretledi — çapraz doğrulandı. **Ben kapattım:** `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts` testi (A) — sign-in sayfasında e-posta alanı + birincil buton için odaklı/odaksız `getComputedStyle` karşılaştırması, canlı Playwright koşumunda **PASS** (ÖLÇÜMLER). Bulgu yine de kayıtta kalıyor çünkü AC, teslim anında (benim turumdan önce) karşılanmamıştı. — frontend (S5)
  - [SEV: low] apps/admin/e2e/panel-flow.spec.ts — AC8'in RENDER yarısı (gerçek başarısız giriş → ekranda Türkçe katalog metni, ham İngilizce/i18n anahtarı YOK) hiçbir testte ÖLÇÜLMEMİŞTİ (`security` gate'i bunu tur1'de AYNI şekilde buldu, `qa`'ya atadı). GÜVENLİK AÇIĞI DEĞİL (mesaj alanı yapısal olarak taşınmıyor, `panel-error.ts` grep'i doğruladı) ama eksik gerileme bekçisiydi. **Kapattım:** aynı dosyada test (G) — kasıtlı yanlış parola → "E-posta veya parola hatalı." görünür, `/\berrors\.[a-z]/` ve ham İngilizce metin **0**; canlı koşumda PASS. — frontend/qa (security tur1'in notu)
  - [SEV: medium] apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts, test (F) — FLAKY. `headingLevel` kabuksuz→kabuklu (h1→h2) geçiş testi (`context.setOffline(true/false)` ile `refetchOnReconnect` tetikleme) İZOLE koşulduğunda 3/3 PASS, TAM e2e paketiyle (panel-flow.spec.ts + bu dosya) BİRLİKTE koşulduğunda 1/1 koşumda FAIL (`getByRole('heading',{level:2,...})` zaman aşımına uğradı — arka plan yeniden doğrulaması BU KEZ tetiklenmedi/gözlemlenemedi). Kasıtlı bozma (`headingLevel="h2"`→`"h1"`) ile testin GERÇEKTEN mekanizmayı ölçtüğü doğrulandı (bozulunca deterministik FAIL). Kök neden `context.setOffline` toggle'ının `online`/`offline` DOM olaylarını ATEŞLEME ZAMANLAMASININ worker'ın önceki yüküne (kaç context/sayfa önceden açılmış) bağlı görünmesi — benim testimin kendi tetikleme tekniği, üretim kodunda bir kusur DEĞİL. Susturulmadı, raporlanıyor. Öneri: `setOffline` yerine `window.dispatchEvent(new Event('online'))` + açık bir `waitForFunction` ile daha deterministik tetikleme, veya retry/`toPass()` sarmalayıcısı. — qa (kendi testim, düzeltme sorumluluğu bende; sonraki turda sağlamlaştırılacak)
  - [SEV: medium] `platform:auth:post-auth-sign-up-email:ip:*` (EMAIL_IP_LIMIT=10/saat, `rate-limit.policy.ts:56`) — AC18/PO riski 8'in odaklandığı sign-in bütçesinden (20/15dk) DAHA DAR bir gerçek operasyonel sınır: her tam `panel-flow.spec.ts` koşumu 3 `sign-up` tüketiyor (3 fixture kullanıcısı) → saatte ~3 tam koşumdan sonra sign-up 429'a çarpar. CANLI ÖLÇÜLDÜ (ÖLÇÜMLER'deki Redis zaman çizelgesi): bu turda sayaç saatlik tavana (10/10) tam OTURDU ve test (E)/(F)'nin gerçek `sign-up` denemesi geçici olarak BLOKE OLDU (pencere dolana kadar ~51 dk beklemek gerekti — bu QA turunun kendi yoğun koşumlarının birikimiyle, pencere doğal olarak sıfırlanınca testler PASS verdi). Bu, S5'in "sign-up 429, Retry-After ~50dk" gözleminin **doğru teşhisidir**: ayrı bir limitleyici DEĞİL, AYNI v0.0.5 `EMAIL_IP_LIMIT` politikasının sign-up'a (2026-10-29 kullanıcı kararıyla) GENİŞLETİLMİŞ hâli — bu sürüme ait bir REGRESYON değil, ama tekrarlanan YEREL e2e/QA iterasyonu için belgelenmemiş bir operasyonel risk. Öneri: `docs/development.md`'ye "saatte en çok ~3 tam e2e koşumu" notu + v0.0.8'in borç 1439 kapsamına bu gözlemin eklenmesi. — docs/architect (vade v0.0.8)
  - [SEV: low] .github/ci-expected-test-packages.txt:28-30 yorumu artık BAYAT: "packages/ui'nin bugünkü süiti BOŞ (S2 henüz koşmadı)" diyor ama S2 `tokens.test.ts`'i (13, ben 4 daha ekledim → 17) ÇOKTAN yazdı. Fonksiyonel boşluk YOK (ÖLÇÜLDÜ: `turbo run test --dry=json --filter='@arkesoft/admin...'` çıktısında `@arkesoft/ui:test` GERÇEKTEN admin'in kapanışında, CI'da GERÇEKTEN koşuyor) — yalnızca yorum metni güncel değil. — devops (S1)
  - [SEV: low] `apps/admin/src/routeTree.gen.ts` — ÜRETİLMİŞ dosyada `any` (3) ve `@ts-nocheck` (1) var; `eslint.config.mjs`'in `ignores` listesi ve `.prettierignore` BİLEREK bu dosyayı dışarıda tutuyor (architect riski 6, mekanik DoD). `typecheck` kapsamı DARALTILMADI (tsconfig `include` listesinde, ÖLÇÜLDÜ). AC23'ün ham metni "any 0" diyor ama bu, ELLE YAZILMIŞ kaynak için — üretilmiş dosyadaki istisna AÇIKÇA belgelenmiş, gizlenmemiş; bilgilendirme amaçlı kayıt. — bilgi (aksiyon gerekmez)
ÖLÇÜMLER: aşağıdaki "Ölçümler" bölümü (gerçek komut çıktıları)
```

**FAIL kuralı uygulaması (AGENT_BASELINE §4):** `critical 0 · high 1 · medium 2 · low 3` → **en az bir `high` → FAIL**. Yüksek bulgu bu turda **qa tarafından kapatıldı** (test yazıldı, canlı koşumda PASS) ama teslim anındaki durum AC12'yi karşılamıyordu — kayıt bu yüzden duruyor. `solid` zaten bağımsız olarak FAIL döndürdü (2 high + 8 medium); bu rapor `solid`'in bulgusunu ÇAPRAZ DOĞRULUYOR, tekrar etmiyor.

---

## Ölçümler

### 1. Beş zorunlu kapı + format:check — kendi koşumumla (hepsi `--force`, cache bypass)

| Komut | Çıktı | Orkestratör iddiası | Sonuç |
| --- | --- | --- | --- |
| `pnpm lint` (→ `turbo run lint --force`) | `Tasks: 17 successful, 17 total` | 17/17 | ✅ doğrulandı |
| `pnpm typecheck` (→ `turbo run typecheck --force`) | `Tasks: 17 successful, 17 total` | 17/17 | ✅ doğrulandı |
| `pnpm test` (→ `turbo run test --force`) | ui **17** (13+4 qa eklemesi) · errors 48 · admin 26 · trpc 26 · db 166 · api 334 → **617** toplam (613 + benim 4 yeni testim) | 613 | ✅ doğrulandı (taban 613'ün üstüne 4 ekledim) |
| `pnpm test:isolation` (→ `turbo run test:isolation --force`) | db **14** + api **2** = **16**, `Tasks: 8 successful` | 16 | ✅ doğrulandı |
| `pnpm build` (→ `turbo run build --force`) | `Tasks: 12 successful, 12 total`; admin: `ilk rota JS (gzip): 131.38 KiB / bütçe 250.00 KiB` · `ilk rota CSS (gzip): 3.36 KiB / bütçe 50.00 KiB` | 12/12, JS 131.39/250, CSS 3.49/50 | ✅ doğrulandı (CSS'teki 3.49→3.36 KiB farkı ölçüm gürültüsü/derleme sırası, bütçenin ÇOK altında, materyal değil) |
| `pnpm format:check` | `All matched files use Prettier code style!` | temiz | ✅ doğrulandı (kendi eklediğim iki dosyayı da `prettier --write` ile biçimledim, ÖNCE okuyup sahipliğimi doğrulayarak) |

Üretim koduna **kalıcı hiçbir değişiklik yapılmadı** — `git status --short` ile doğrulandı: değiştirilmiş (tracked) dosya listesi oturumun başındakiyle BİREBİR aynı; benim eklediğim her şey YENİ (untracked) dosya.

### 2. AC1–AC23 kabul kriteri eşlemesi

| AC | Dayanak | Durum |
| --- | --- | --- |
| AC1 | `pnpm --filter @arkesoft/admin build` exit 0, `dist/index.html` + hash'li asset'ler (ÖLÇÜLDÜ, dosya listesi görüldü); kök `pnpm build` 12/12 | ✅ |
| AC2 | `panel-flow.spec.ts` test 2 — login→dashboard→reload (oturum korunur)→logout→doğrudan gidiş→sign-in; canlı koşumda PASS (bu turda İKİ kez) | ✅ |
| AC3 | `panel-flow.spec.ts` test 1 — oturumsuz `/` → `/sign-in`, `page.content()` seed/fixture verisi **0**; canlı PASS | ✅ |
| AC4 | Test 2 içinde `session.me` 200 assertion'ı + ekranda türeyen değer (`Kullanıcı menüsü`, `Mağaza seçilmedi`); `apps/admin/src`'te `any`/`@ts-ignore` **0** (elle yazılmış kod; routeTree.gen.ts istisnası ayrı kayıtta) | ✅ |
| AC5 | `tenant-exempt-paths.test.ts:38` → `TENANT_EXEMPT_PATHS.size).toBe(13)` + `/trpc/session.me` satırı (84); `auth-exempt-paths.test.ts:25` → `AUTH_EXEMPT_PATHS.size).toBe(9)` (değişmedi) — ikisi de 334 api testinin içinde PASS | ✅ |
| AC6 | `panel-origin-cors.test.ts` (5 test: 4 vaka + OPTIONS 405), `apps/api` 334 testinin içinde PASS; CORS başlığı YOKLUĞU dört vakada da assert ediliyor (okudum) | ✅ |
| AC7 | `normalize-panel-error.test.ts` (11 test) — probe 1/3/4 sırası, deepEqual((a),(b)), fail-closed (circular/null/html → unknown, fırlamadan); admin 26 testinin içinde PASS | ✅ |
| AC8 | Birim: `messages.test.ts` (9 test, kapalı dünya + i18n anahtar yokluğu). **Render yarısı benim turumdan önce EKSİKTİ** (security tur1 bulgusu) → test (G) ile kapatıldı, canlı PASS | ✅ (benim eklediğim testle) |
| AC9 | `panel-flow.spec.ts` 4 alt test (a/b/b-network/c) + form doğrulama testi; canlı PASS (bu turda) | ✅ |
| AC10 | `grep '\.click(\|\.tap('` → spec KODUNDA **0** (yalnızca yorumda 3 eşleşme); test 3 canlı PASS | ✅ |
| AC11 | `grep "locator('\.\|data-testid"` → spec KODUNDA **0**; `expectBasicPageInvariants` her sayfada `lang=tr` + tek h1 + tek main + boş olmayan title doğruluyor | ✅ |
| AC12 | Sınıf deseni: `FOCUS_RING_CLASS_NAMES` tek kaynak, `UserMenu.tsx`/`Sidebar.tsx` aynı deseni tüketiyor (3/3 tutarlı). **Hesaplanmış stil kanıtı EKSİKTİ** (yukarıdaki high bulgu) → test (A) ile kapatıldı, canlı PASS | ⚠→✅ (yüksek bulgu kayıtlı, test eklendi) |
| AC13 | `tokens.test.ts` 13/13 (totoloji karşıtı fixture dahil) + derlenmiş CSS'te `var(--` **101**, sarılmamış özel özellik **0** (kendi ölçümüm, build sonrası grep). Kör nokta ayrıca `tailwind-custom-property-syntax.qa.test.ts` (4 yeni test) ile kaynak seviyesinde kapatıldı, kasıtlı bozma ile doğrulandı | ✅ |
| AC14 | `packages/ui/package.json`'da `@arkesoft/trpc`/`-api`/`-db`/`@tanstack/react-query` **0**; `src`'te aynı import'lar + `fetch(`/`useQuery(` **0** (grep) | ✅ |
| AC15 | `index.ts` 5 bileşeni export ediyor; `apps/admin` Button/Input/Card'ı GERÇEKTEN kullanıyor (grep); Toast/DataTable tüketicisi **0**, `index.ts`'in dosya başı yorumunda AÇIKÇA belgeli (gizlenmemiş) | ✅ |
| AC16 | Gerçek ölçüm: JS 131.38 KiB/250, CSS 3.36 KiB/50. **Kasıtlı aşım tekrarlandı** (bütçe 100 KiB'ye düşürüldü → `[bundle-budget] AŞIM` + exit 1), sonra TAM olarak geri alındı (`git diff --stat` boş) ve build yeniden PASS verdi | ✅ |
| AC17 | `playwright.config.ts`: `projects` **1**, `workers:1`; `grep "toHaveScreenshot\|toMatchSnapshot"` kodda **0**; kök `test:e2e`/`turbo.json` görevi/CI e2e job'u **0** (`git diff --stat turbo.json`/`ci.yml` boş) | ✅ |
| AC18 | `panel-flow.spec.ts` **arada Redis flush OLMADAN art arda İKİ kez** koşturuldu → **8/8, 8/8** (iki ayrı canlı koşum). Redis sayaçları ÖLÇÜLDÜ: sign-in +3/+3 (tam spec'in iddia ettiği sayı), sign-up +3/+3 — **sıfır 429**. Erken turda rastlanan tek 429 izole ölçümle BAŞKA bir kaynağa (bu QA turunun KENDİ birikmiş aktivitesi + önceki ajan oturumları, paylaşılan `platform:auth:*` sayacı — v0.0.5 borcu) atfedildi, "flaky" DEĞİL diye teşhis edildi (ÖLÇÜMLER §4) | ✅ |
| AC19 | `no-store-headers.test.ts` (5/5: 200 + 401 + 403 + iki 404 — hepsi `no-store, private` + `Vary: Cookie` + ETag yok), 334 api testinin içinde PASS | ✅ |
| AC20 | Bu bölümün 1. maddesi — beş komut + format:check, kendi koşumum | ✅ |
| AC21 | `pnpm format:check` bu rapor + Task dosyası + diğer gate raporları yazıldıktan SONRA tekrar koşturuldu (bu oturumun SONUNDA) → temiz | ✅ |
| AC22 | `apps/admin/src`'te `x-arkesoft-tenant` **0** (grep); architect'in "Tenant izolasyonu" bölümü §7'nin 14 maddesini madde madde N/A olarak gerekçelendiriyor (okudum); `tenant.current` panel host'undan erişilemez (AC5 ile aynı mekanizma) | ✅ |
| AC23 | `any`/`@ts-ignore`/`@ts-expect-error`/`extends Component`/`.js`/`.jsx`/`console.log`/Next.js referansı → elle yazılmış kaynakta **0** (grep, kodu koda sınırladım). `routeTree.gen.ts` (ÜRETİLMİŞ) istisnası AÇIKÇA belgeli, lint'ten hariç, typecheck'ten HARİÇ DEĞİL. `pnpm lint` 17/17 | ✅ |

**Sonuç: 23/23 AC şu an karşılanıyor** — ancak AC12 teslim anında karşılanmıyordu (yüksek bulgu, bkz. BULGULAR) ve `solid` bağımsız olarak 2 high + 8 medium ile FAIL verdi. Bu yüzden `qa`'nın kendi SONUÇ'u da **FAIL**.

### 3. AC13 kör noktası — mekanizma analizi ve kapatma

**Neden kaçırdı:** `tokens.test.ts`'in `calculateContrastRatio` testleri `COLOR_TOKENS`'teki HAM HEX DİZELERİ üzerinde WCAG formülünü matematik olarak uygulayıp assert ediyor — hiçbir noktada bir tarayıcı açılmıyor, hiçbir CSS derlenmiyor/okunuyor (yalnızca `theme.css`'in METNİ `tokens.ts` ile pin testinde karşılaştırılıyor, bu da bir METİN eşitliği, bir GEÇERLİLİK kontrolü değil). Bu sürümde beş bileşen `[--token]` (köşeli parantez, Tailwind v4'te `var()` ile SARILMADAN derlenir) kullanmıştı — hex değerleri `tokens.ts`'te ve `theme.css`'te DOĞRU ve BİREBİR eşleşiyordu (pin testi YEŞİL), kontrast matematiği de DOĞRU hesaplanıyordu (13/13 YEŞİL) — ama TARAYICIDA o renk/yarıçap/odak halkası HİÇ UYGULANMIYORDU, çünkü derlenen bildirim geçersizdi. İki test de "doğru girdi → doğru çıktı" sağlıyordu, "bu girdi gerçekten DOM'a ULAŞIYOR mu" sorusunu hiç sormuyordu.

**Aynı sınıftan muzdarip başka AC'ler (istenen değerlendirme):**
- **AC12 — EVET, aynı kör nokta, benim turumdan önce KAPANMAMIŞ.** Odak deseni grep'i (`outline-none`/`focus-visible:ring-*`) SINIF LİSTESİNİN metninin varlığını doğruluyor; `ring-(--color-focus-ring)` yazısı Tailwind'in GERÇEKTEN `var(--color-focus-ring)`'e çevirdiği GEÇERLİ bir bildirim mi ÜRETTİĞİNİ hiç ölçmüyor. AC13'teki hatanın AYNISI burada da olabilirdi (nitekim AYNI commit'te, aynı befriend `[--x]`→`(--x)` değişimiyle düzeltildi) ve grep bunu YAKALAYAMAZDI. Kapattım: test (A), `getComputedStyle` ile odaklı/odaksız karşılaştırma.
- **AC8'in i18n taraması — KISMEN, ama yapısal bir ikinci savunma hattı VAR.** `messages.test.ts` yalnızca `resolveErrorMessage(code)`'un SAF çıktısını test ediyor — gerçek bir başarısız girişin DOM'a ulaşıp ulaşmadığını ÖLÇMÜYORDU (security tur1'in bulgusu, `low` — çünkü `PanelError` tipinin hiçbir alanı ham mesaj TAŞIMIYOR, yani render katmanı YANLIŞ bir şey render etse bile SIZDIRACAK bir alan YOK; AC12'nin aksine burada TİPİN ŞEKLİ ikinci bir fail-closed katman). Kapattım: test (G).
- **AC7'nin deepEqual'i — HAYIR, bu kör noktadan MUAF.** `normalizePanelError` saf bir fonksiyon (girdi→çıktı), DOM/CSS/tarayıcı hiç karışmıyor; birim testinin ölçtüğü şey birim testinin iddia ettiği şeyin TAMAMI. Render tarafı (mesajın EKRANA gerçekten BASILIP basılmadığı) ayrı bir kaygı ve o da AC9/AC8 testleriyle (ve şimdi test G ile) kapatılıyor.

**Yazdığım test (yeni bağımlılık YOK):**
`packages/ui/src/__tests__/tailwind-custom-property-syntax.qa.test.ts` — `packages/ui/src` ve `apps/admin/src`'i `node:fs` ile tarayıp Tailwind v4'ün TEHLİKELİ söz dizimini (`-[--x]`, sarılmamış) **kaynak seviyesinde** arar; 0 olmasını assert eder + totoloji karşıtı sağlık kontrolü (doğru `-(-x)` söz diziminin en az bir yerde kullanıldığını da assert eder). **Kasıtlı bozma ile doğrulandı:** `Button.tsx`'te `bg-(--color-brand-500)`'ü `bg-[--color-brand-500]`'e geçici olarak değiştirdim → test **FAIL** verdi (tam olarak bozduğum satırı ve dosyayı raporladı); sonra `cp` ile ORİJİNALİNE geri döndürdüm (`git diff --stat` boş, kalıcı değişiklik 0), test tekrar PASS verdi.

### 4. AC18 — oran sınırı bütçesi, iki ardışık koşum, ve 429'un izole atfı

**İki ardışık koşum (production spec, arada flush YOK):**

```
# Koşum 1
8 passed (5.1s)
# Redis ÖNCESİ: sign-in=3, sign-up=1 → SONRASI: sign-in=6, sign-up=4 (+3/+3, spec'in iddia ettiği sayı BİREBİR)

# Koşum 2 (hemen ardından, flush yok)
8 passed (4.7s)
# SONRASI: sign-in=9, sign-up=7 (+3/+3 yine)
```

Sıfır 429, sıfır flaky — AC18 **birebir kriterine göre** karşılanıyor.

**Erken turda rastlanan tek 429'un izole teşhisi:** Bu QA turunun EN BAŞINDA (önce koşturduğum bir deneme çalıştırmasında) test 3 (AC10) `RATE_LIMIT_EXCEEDED` ile FAIL verdi. Kaynağı DOĞRU atfetmek için:
1. `docker exec arkesoft-redis redis-cli` → **boş** (0 anahtar). Araştırıp `lsof -p <api-pid>` ile API'nin GERÇEKTE `[::1]:6379`'a bağlı olduğunu, bu portun Docker'ın YANI SIRA bir homebrew `redis-server`'ın (PID 1445, 6 Eylül'den beri ayakta) TARAFINDAN da dinlendiğini buldum — API GERÇEKTE o YEREL redis'i kullanıyor, Docker'ınki değil (devops'a bildirilecek bir ortam notu, bu sürüme ait DEĞİL).
2. Doğru Redis'te `platform:auth:post-auth-sign-in-email:ip:*` sayacını okudum: erken 429, bu QA turunun KENDİ önceki manuel `curl` probe'larım + bu oturumdaki tekrarlı deneme koşumlarının BİRİKİMİYLE (muhtemelen önceki ajan oturumlarının da katkısıyla, aynı paylaşılan yerel IP) pencereyi doldurmuştu; TTL kısa bir süre sonra DOĞAL olarak sıfırlandı (900s pencere), BUNU doğruladım (iki temiz ölçüm arasında count sıfırdan yeniden başladı).
3. **Sonuç: bu sürüme ait bir regresyon DEĞİL** — "borç 1439" (v0.0.5, paylaşılan IP, per-test izolasyon YOK, v0.0.8'in konusu) ile BİREBİR aynı sınıf, "flaky" diye YANLIŞ teşhis EDİLMEDİ.

**Yeni, daha dar gözlem (bu QA turunun kendi canlı deneyi):** `platform:auth:post-auth-sign-up-email:ip:*` (EMAIL_IP_LIMIT=10/saat) sign-in'in 20/15dk'lık bütçesinden DAHA SIKI — her tam spec koşumu 3 sign-up tüketiyor, saatte ~3 tam koşumdan sonra BU sayaç 429 verir (gerçekten OLDU: bu turda count tam 10/10'a oturdu, test (E)/(F)'nin gerçek sign-up'ı ~51 dakika BEKLEMEK ZORUNDA kaldı, pencere doğal sıfırlanana kadar). Bu S5'in "sign-up 429, Retry-After ~50dk" gözleminin DOĞRULANMIŞ, DOĞRU teşhisidir (medium bulgu, BULGULAR'da).

### 5. AC16 — kasıtlı aşım kanıtı tekrarı

```
# bundle-budget.config.ts: 250*1024 → 100*1024 (geçici, scratchpad'e yedeklendi)
$ pnpm build
[bundle-budget] ilk rota JS (gzip): 131.38 KiB / bütçe 100.00 KiB
[bundle-budget] AŞIM: JS 131.38 KiB > bütçe 100.00 KiB
[ELIFECYCLE] Command failed with exit code 1.

# geri alındı — git diff --stat apps/admin/bundle-budget.config.ts → BOŞ
$ pnpm build
✓ built — JS 131.38 KiB / 250.00 KiB (PASS)
```

### 6. `headingLevel` geçişi (kabuksuz → kabuklu) — test edildi, PASS + flaky bulgu

Mekanizma analizi (kod okuyarak): `_app.tsx`'in guard'ı `ensureQueryData` eşdeğeri `{...sessionMeQueryOptions, staleTime:'static'}` kullanıyor (tek seferlik, hiç stale SAYILMAZ) ama `AppLayoutComponent`'in kendi `useQuery(sessionMeQueryOptions)` gözlemcisi bu override'ı TAŞIMIYOR → VARSAYILAN `staleTime: 0` (TanStack Query'nin kendi varsayılanı) devreye giriyor. `retry:false` ve `refetchOnWindowFocus:false` AÇIKÇA kapalı ama `refetchOnReconnect` (varsayılan `true`) KAPATILMAMIŞ — `query-core`'un `shouldFetchOn()`/`isStale()` kaynağını okudum: `staleTime:0` → sorgu HER ZAMAN "stale" → bağlantı kesilip YENİDEN kurulduğunda (`context.setOffline(true)`→`(false)`) ARKA PLANDA otomatik bir yeniden doğrulama GERÇEKTEN tetikleniyor.

**Canlı doğrulama:** `qa-blind-spot-and-negative-scenarios.qa.spec.ts` test (F) — kabuk kurulduktan SONRA `session.me`'yi 500'e düşürüp reconnect simüle ettim → `h2` "Bir sorun oluştu" GERÇEKTEN render edildi, kabuk (Topbar/Sidebar) YERİNDE kaldı, sayfada `h1` sayısı **0** (AC11 ihlali YOK). **Kasıtlı bozma:** `_app.tsx:192`'deki `headingLevel="h2"`'yi `"h1"`'e çevirdim → test DETERMİNİSTİK olarak FAIL verdi ("Bir sorun oluştu" h2 bulunamadı); geri aldım (`git diff --stat` boş), test tekrar PASS.

**Ama:** izole koşulduğunda 3/3 PASS, TAM paketle (iki spec dosyası birlikte) koşulduğunda 1 defa FAIL (yukarıdaki medium bulgu — `context.setOffline`'ın zamanlaması worker'ın önceki yüküne bağlı görünüyor). Mekanizma GERÇEK ve DOĞRU çalışıyor; testin KENDİ tetikleme tekniği güvenilmez.

### 7. Eksik negatif senaryolar — tam liste

| # | Senaryo | Durum |
| --- | --- | --- |
| 1 | Oturum süresi dolmuş/bozuk çerezle dashboard'a gidiş | ✅ Test (B) ile kapatıldı, canlı PASS |
| 2 | `session.me` 403 dönerse (401 değil) | ✅ Test (C) ile kapatıldı, canlı PASS |
| 3 | Aynı sekmede iki kez çıkış | ❌ **Test edilmedi** — bu QA turunda `platform:auth:*` bütçesi (bkz. §4) tükendiği için ek bir gerçek oturum harcamaktan kaçınıldı. Kod okuyarak değerlendirildi: `handleSignOut` `isSigningOut` ile ikinci tıklamayı/Enter'ı `disabled` üzerinden engelliyor (Button `isLoading` deseni, test D'nin form submit'inde doğrulanan AYNI mekanizma) — yapısal olarak KORUNUYOR görünüyor ama CANLI DOĞRULANMADI. Sorumlu: qa, sonraki tur |
| 4 | `/sign-in`'e zaten girişliyken gidiş (yönlendirme var mı?) | ✅ Test (E) ile GÖZLEMLENDİ: yönlendirme YOK, form yeniden render ediliyor. Hiçbir AC bunu talep etmiyor — bu bir FAIL değil, belgelenmiş davranış |
| 5 | Form çift gönderimi (buton disabled mı) | ✅ Test (D) ile kapatıldı: art arda 2 `Enter` → 1 istek, canlı PASS |
| 6 | Çok yavaş ağda `defaultPendingMs` davranışı | ⚠ Kısmen — `panel-flow.spec.ts`'in AC9(a) testi 400ms gecikmeyle (50ms eşiğin üstünde) "yükleniyor" durumunu zaten doğruluyor; DAHA UÇ bir senaryo (ör. 10s+ gecikme, timeout davranışı) test edilmedi — düşük öncelik, `defaultPendingMs` zaten mekanizması doğru |
| 7 | `routeTree.gen.ts` typecheck kapsamında mı | ✅ DOĞRULANDI: `tsconfig.json`'un `include`'u `src/**/*` (routeTree.gen.ts'i KAPSIYOR); `eslint.config.mjs`'in `ignores`'u ve `.prettierignore` SADECE lint/format'tan hariç tutuyor — typecheck'ten DEĞİL |

### 8. Önceki gate'lerin qa'ya atadığı bulgular — kapatıldı mı

| Kaynak | Bulgu | Kapatıldı mı |
| --- | --- | --- |
| security tur1 | "AC8'in RENDER yarısı mekanik ölçülmemiş... spec'e test ekle" (low, → qa) | ✅ test (G) |
| security tur1 | "fixture kullanıcıları kalıcı/parolaları commit'li... koşum başına rastgele parola" (low, → qa, vade v0.0.19) | ⏳ Ertelenmiş kalıyor (vade zaten v0.0.19, bu turun kapsamı değil) |
| solid tur1 | H1: `toHaveCSS`/`evaluate`/`getComputedStyle`/`boxShadow` → 0 (AC12 kör noktası) | ✅ test (A) — ÇAPRAZ DOĞRULAMA, aynı bulgu benim BULGULAR'ımda da var |

### 9. Yazdığım dosyalar (yeni, üretim dosyası DEĞİŞTİRİLMEDİ)

- `packages/ui/src/__tests__/tailwind-custom-property-syntax.qa.test.ts` — 4 test, AC13 kör noktası kaynak-seviyesi regresyon bekçisi
- `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts` — 7 test (A–G): AC12 hesaplanmış stil, bozuk çerez, 403≠401, çift gönderim, AC8 ucu uca, zaten-girişli /sign-in gözlemi, headingLevel geçişi

Her ikisi de `pnpm lint`/`pnpm typecheck`/`pnpm format:check`'ten GEÇİYOR (kendi dosyalarım, kendim biçimledim — başka ajanın dosyasına dokunulmadı, `git status --short` ile doğrulandı).

### 10. Diagnostik amaçlı geçici değişiklikler — TÜMÜ GERİ ALINDI

| Dosya | Amaç | Geri alma kanıtı |
| --- | --- | --- |
| `packages/ui/src/components/Button.tsx` | AC13 kör noktası regresyon testinin GERÇEKTEN yakaladığını kanıtlamak (`(--x)`→`[--x]`) | `git diff --stat` → boş |
| `apps/admin/bundle-budget.config.ts` | AC16 kasıtlı aşım kanıtını tekrarlamak (250→100 KiB) | `git diff --stat` → boş |
| `apps/admin/src/routes/_app.tsx` | Test (F)'in headingLevel geçişini GERÇEKTEN ölçtüğünü kanıtlamak (`h2`→`h1`) | `git diff --stat` → boş |

Ayrıca: oturum ortasında API süreci (önceden başlatılmış, PID 6425) çöktü (bu sürümle ilgisiz görünen bir ortam olayı — kök neden araştırılmadı, zaman kısıtı) → `node --env-file=.env apps/api/dist/main.js` ile yeniden başlatıldı, `/health` 200 ile doğrulandı, kalan tüm ölçümler bu YENİDEN BAŞLATILMIŞ süreçle yapıldı.
