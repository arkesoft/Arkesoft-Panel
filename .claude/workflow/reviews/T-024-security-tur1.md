# T-024 — `security` gate raporu (tur 1)

Tarih: 2026-11-18 · Sürüm: ROADMAP v0.0.20.3 · Ölçüm koşulu: load avg 3.07/3.46/3.97, 25 Docker
konteyneri çalışıyor · Playwright **koşturulmadı** (oran sınırı yasağı), ölçümler kaynak + kurulu
paket + diskteki artefakt üzerinden.

GATE: security
SONUÇ: FAIL

## BULGULAR

- **[SEV: high]** `docs/adr/0025-erisilebilirlik-kapisinin-mekanik-siniri.md:101` +
  `docs/testing.md:366-379` + `scripts/playwright/a11y.ts:50-67` — **"PII riski kaynakta kapatıldı"
  iddiası ölçülerek çürüdü: Playwright'ın KENDİ `error-context.md`'si başarısızlıkta sayfanın TAM
  ARIA anlık görüntüsünü yazıyor ve o dosya aynı public artefakta yükleniyor.**
  Ölçüm: `node_modules/.pnpm/playwright@1.64.1/.../playwright/lib/index.js:662-722` —
  `_takePageSnapshot()` test hatası varsa `page.ariaSnapshot({ mode: 'ai' })` alır, `didFinishTest()`
  bunu `testInfo.outputPath('error-context.md')`'ye yazar;
  `.../playwright/lib/errorContext.js:75-81` çıktıya `# Page snapshot` başlığı altında koyar.
  `outputDir` hiçbir config'te ezilmemiş ⇒ dosya `apps/<app>/test-results/**` altına düşer ve
  `ci.yml:1558-1565` tam bu yolu `if: always()` + `retention-days: 7` ile **public** depoya yükler.
  **Diskte kanıt var:** `apps/superadmin/test-results/accessibility-Süper-admin--009b0-.../error-context.md`
  (10 590 bayt, 225 satır) — bu görevin YENİ `accessibility.spec.ts`'i tarafından üretilmiş; o örnek
  `beforeAll`'da (sayfasız) kırıldığı için `# Page snapshot` bölümü yok, ama dosyanın üretildiği ve
  hata mesajını (`# Error details`) birebir taşıdığı ölçüldü.
  **Saldırı senaryosu:** admin `/hesap/guvenlik` (dialog açık) veya superadmin `/` taraması — yani
  bu sürümün eklediği iki oturum-içi tarama — bir ihlal bulup `expectNoAccessibilityViolations`
  fırlattığında (bu kapının NORMAL çalışma biçimi), test `await context.close()`'a ulaşamaz, context
  "leftover" kalır ve giriş yapılmış sayfanın tüm erişilebilir metni (fixture e-postası, oturum
  listesi: IP/user-agent/tarih, kiracı adları) `error-context.md`'ye yazılır. Depo PUBLIC ⇒ herhangi
  bir anonim kişi `e2e-playwright-artifacts` artefaktını 7 gün boyunca indirir. `a11y.ts`'in
  `node.html`'i hiç okumaması bu kanalı **etkilemez** — ARIA anlık görüntüsü tek bir `node.html`
  parçasından **daha geniştir**.
  **Önerilen düzeltme:** (a) `ci.yml`'in yükleme adımına `!apps/*/test-results/**/error-context.md`
  hariç tutması eklensin **veya** (b) `test:e2e` adımına `PLAYWRIGHT_NO_COPY_PROMPT: '1'` env'i
  (ölçüldü: `index.js:663` bu değişken varsa anlık görüntü alınmaz) + `turbo.json`'ın
  `test:e2e.passThroughEnv` girdisi (aksi hâlde `check_e2e_env_passthrough` kırar); **ve** ADR-0025:101
  ile `docs/testing.md`'nin "kaynakta kapatıldı / ek boruya bağımlı değil" cümlesi düzeltilsin.
  **Sorumlu ajan:** `devops` (CI + env), `architect`/`docs` (ADR-0025 tehdit modeli düzeltmesi).

- **[SEV: medium]** `scripts/playwright/a11y.ts:347-362` (`formatResultSummary`) — **`target[0]`
  parçacıkları `redactAxeDetail()`'den GEÇMİYOR; yalnızca `failureSummary` maskeleniyor.**
  Ölçüm: axe-core 4.14.0 seçici üreticisi öznitelik DEĞERLERİNİ seçiciye gömüyor —
  `node_modules/.pnpm/axe-core@4.14.0/.../axe.js:7905` `ignoredAttributes` listesi yalnızca
  `class/style/id/selected/checked/disabled/tabindex/aria-*/xmlns`'i dışlıyor; `:7914-7936`
  `getAttributeNameValue()` `href`/`src` için "friendly URI end"i (**alan adı dâhil**, ör.
  `a[href$="demo-magaza.arkesoft.localhost"]`), diğer her öznitelik için ham değeri
  (`:7940` ⇒ değer uzunluğu < 31 olmak kaydıyla) yazıyor. Yani `value`, `name`, `title`, `alt`,
  `placeholder`, `aria-label`, `data-*` içindeki ≤ 30 karakterlik kullanıcı verisi seçiciye girer.
  **Saldırı senaryosu:** oturum-içi bir taramada ihlalli düğüm `<input value="Ahmet Yılmaz">` veya
  kiracı alt alan adına bağlı bir `<a href>` ise, üretilen mesaj (`hedefler=[...]`, ≤ 80 karakter
  kesme VAR, maskeleme YOK) hem public CI stdout loguna (`test:e2e` borusunda `redact-test-log.ts`
  **yok** — ADR-0025 bunu kendisi ölçmüş) hem `error-context.md`'ye düşer. `docs/testing.md:377-378`
  `target[0]`'ı açıkça "güvenli alan" sayıyor — bu sınıflandırma ölçülerek yanlış.
  **Önerilen düzeltme:** `targetSnippets` da `redactAxeDetail()`'den geçsin (tek satır:
  `truncate(redactAxeDetail(stringifyFirstTarget(node)), TARGET_SNIPPET_MAX_LENGTH)`), docs/ADR'deki
  "güvenli alanlar" listesi düzeltilsin. **Sorumlu ajan:** `a11y.ts` sahibi (S1) + `docs`.

- **[SEV: medium]** `scripts/playwright/a11y.ts:411-415` ↔ `:34-43`, `:187-189`,
  `docs/adr/0025-...:96-98` — **"BAYAT GİRDİ = KIRMIZI" ack listesi için UYGULANMAMIŞ; beyan var,
  zorlama yok.** Ölçüm: `staleAllowlistEntries` yalnızca `ALLOWED_VIOLATIONS` üzerinde dönüyor
  (`:411`); `ACKNOWLEDGED_INCOMPLETE_RULE_IDS` için hiçbir bayatlık kontrolü yok (`:424-429` sadece
  eşleşmeyenleri kırıyor). Oysa dosya başı `:38-43` "bir allowlist/**acknowledge** girdisi ... HİÇBİR
  gerçek ihlal/`incomplete` ile eşleşmiyorsa test KIRILIR" diyor, `:187-189` "Her girdi ...
  BAYATLAMAYA karşı korunur" diyor ve ADR-0025:96-98 bunu "yapısal olarak engelliyor" diye ilan
  ediyor. **Somut sonuç:** bugün kayıtlı üç ack (`admin-account-security-dialog` ×
  `aria-hidden-focus`/`color-contrast`/`label-content-name-mismatch`) o sayfada o üç kuralı
  **süresiz** susturuyor; Radix ileride `inert` eklediğinde ya da aynı sayfada BAŞKA bir öğe gerçek
  bir `color-contrast` belirsizliği ürettiğinde kapı sessizce yeşil kalır — bu, sürümün kapatmayı
  iddia ettiği "sessiz yeşil" sınıfının ta kendisi. **Ek fail-open ekseni:** iki listede de bayatlık
  ve boş-alan kontrolleri `entry.scanName !== scanName` ile filtreleniyor ⇒ bir `scanName` artık hiç
  taranmıyorsa (spec silinir/atlanır) o scanName'in girdileri ne doğrulanır ne bayat sayılır.
  **Önerilen düzeltme:** ack listesi için de `matchedAckKeys`/`staleAckEntries` döngüsü eklensin;
  ayrıca "hiç taranmayan scanName" için `A11yScanName` × beklenen tarama eşlemesini bir birim testiyle
  (Vitest) kapatın. **Sorumlu ajan:** `a11y.ts` sahibi (S1).

- **[SEV: medium]** `scripts/playwright/a11y.ts:417-422` + üç `playwright.config.ts` (reporter yok) —
  **Onaylanmış `incomplete`'lerin "ad ad raporlanması" (AC-21) CI'da HİÇBİR yere çıkmıyor.**
  Ölçüm: `playwright/lib/common/index.js:703` ⇒ varsayılan reporter CI'da `dot`, yerelde `list`;
  üç config'te de `reporter` ayarı YOK (grep: 0 eşleşme) ve `test:e2e` script'leri
  (`apps/*/package.json:12`) `--reporter` geçmiyor. `reporters/base.js`, `list.js`, `dot.js` ve
  `errorContext.js` içinde `annotations` jetonu **0 eşleşme** ⇒ `testInfo.annotations`'a yazılan
  `a11y-incomplete` kayıtları ne stdout'a ne artefakta düşüyor; `apps/*/playwright-report` dizini
  (ci.yml:1564) html reporter olmadığı için hiç oluşmuyor. Öz-test (e) yalnızca annotation'ın
  **süreç içinde** var olduğunu kanıtlıyor, raporlandığını değil. **Sonuç:** kırmayan (= onaylanmış)
  `incomplete` yolu fiilen sessiz; AC-21'in "ya kırar ya adlandırılmış biçimde raporlar" garantisinin
  ikinci yarısı gözlemlenebilir değil. **Önerilen düzeltme:** `json`/`html` reporter'ı CI'da ekleyin
  **veya** onaylanmış `incomplete`'leri annotation'a ek olarak süreç çıktısına yazın (annotation'a
  güvenmeyin). **Sorumlu ajan:** `devops` (+ `qa`: AC-21 kanıtı).

- **[SEV: low]** `scripts/guards.sh:936-939` (`check_axe_single_source`) ve aynı sınıftan
  `check_playwright_retries_single_source` (`:876-910`) — **tarama `-name '*.ts'` ile sınırlı; `.tsx`,
  `.mts`, `.cts`, `.js` kör nokta.** Ölçüm (sentetik dosyalarla, /tmp): `find -name '*.ts'` dört
  dosyadan yalnızca ikisini (`.ts`) gördü; grep deseni `.tsx` ve `.mts` dosyalarındaki jetonu
  **yakalayabiliyordu** ama `find` onları hiç listelemiyor. Ayrıca parçalı/dinamik import
  (`import("@axe-core/play" + "wright")`) jeton taramasından kaçıyor (ölçüldü: grep 0 eşleşme).
  Hafifletici (ölçüldü): üç config de `testMatch: '**/*.spec.ts'` pinli ⇒ `.spec.mts` bir SPEC olarak
  koşmaz; kaçış için `.spec.ts`'ten import edilen `.mts`/`.tsx` bir yardımcı modül gerekir. Yine de
  `retries` pini aynı kör noktayı paylaşıyor ve O artefakt `trace.zip` (oturum çerezi + `Authorization`)
  taşıyor. **Önerilen düzeltme:** iki `find` de `\( -name '*.ts' -o -name '*.tsx' -o -name '*.mts' -o
  -name '*.cts' \)` kapsasın. **Sorumlu ajan:** `devops` · **Vade:** v0.0.22.

- **[SEV: low]** `pnpm-lock.yaml` (bu sürümün **değiştirmediği** satırlar) — `pnpm audit`: **2 high
  / 3 moderate / 1 low.** `high`: `multer` (GHSA — ROADMAP:3740/4063'te kayıtlı borç) ve **`picomatch`
  ReDoS** (`astro > unstorage > anymatch > picomatch`) — picomatch ROADMAP/docs'ta **kayıtsız**
  (grep: 0 eşleşme), ROADMAP:3822'nin "1 high" sayımı bayatladı. Hiçbiri T-024 tarafından
  getirilmedi: lock diff'i yalnızca `@axe-core/playwright@4.14.0` + `axe-core@4.14.0` girdilerini
  ekliyor (17 satır, integrity hash'li, catalog'da tam sürüm pinli) ve audit çıktısında axe
  **hiç geçmiyor**. **Önerilen düzeltme:** `picomatch` borç satırı eklensin, ROADMAP:3822 sayımı
  güncellensin. **Sorumlu ajan:** `devops`/`docs` · **Vade:** v0.0.22.

## Bulgu ÇIKMAYAN eksenler (ölçüldü)

1. **`node.html` gerçekten hiç okunmuyor** — `a11y.ts` satır satır okundu: tek okuma yüzeyleri
   `result.id`, `result.impact`, `result.helpUrl`, `node.target[0]` (`:329-338`),
   `node.failureSummary` (`:352-356`) ve `nodes.length`. `analyze()` sonucu fonksiyondan dışarı
   çıkmıyor; `include`/`exclude`/`disableRules` dışa açılmıyor; export yüzeyi
   `expectNoAccessibilityViolations` + veri/tip sabitleri.
2. **Tedarik zinciri:** `@axe-core/playwright@4.14.0` catalog'da **tam sürüm** pinli
   (`pnpm-workspace.yaml:320`), lock'ta `integrity: sha512-SMkvMsG...` var, geçişli tek bağımlılık
   `axe-core@4.14.0` (kurulu kopya sayısı: `node_modules/.pnpm` içinde **1**), peer `playwright-core@1.64.1`
   mevcut sürümden karşılanıyor, lisans MPL-2.0. `pnpm-workspace.yaml`'a eklenen 11 satırın 10'u
   **yorum**, 1'i catalog girdisi — `onlyBuiltDependencies`/lifecycle izni **eklenmedi**. Paketin
   `prepare: pnpm exec playwright install && pnpm run build` script'i var, ancak kayıt tarball'ından
   kurulumda `prepare` çalışmaz ve pnpm lifecycle'ı varsayılan olarak bloklar — **postinstall
   çalışmıyor** (bu turda `pnpm install` koşturulmadı, aşağı bkz.).
3. **Öz-testin kendi riski:** `a11y-helper-self-test.spec.ts` beş senaryoda da `page.setContent` ile
   **sentetik** DOM üretiyor; gerçek rotaya `goto` YOK, çalışan bir sayfanın DOM'u mutasyona
   uğratılmıyor, dolayısıyla geri alma/sonraki teste sızma sorunu yapısal olarak yok (a/b ile c/d
   ayrı `setContent` çağrıları). Şablon dizelerinde **interpolasyon yok** ⇒ `innerHTML`/XSS deseni
   öğretmiyor. Auth maliyeti 0/0, `auth-budget.ts`'e doğru işlenmiş.
4. **Fixture kimlik bilgisi:** yeni spec'ler parolayı yalnızca istek gövdesinde taşıyor; `console`
   kullanımı **0** (grep), `process.env` kullanımı **0** (grep — `check_e2e_env_passthrough` sınırına
   uyulmuş), `storageState()` **dosyaya yazılmıyor** (yol parametresi yok, config'lerde de yok) ⇒
   çerez diske düşmüyor. `trace: 'on-first-retry'` + `retries: 0` (config'lerde `retries` jetonu 0
   eşleşme) ⇒ **trace üretilmiyor**; `video: 'retain-on-failure'` yalnızca başarısızlıkta kalıyor
   (bu kanal T-024 öncesinden var, F1'in kapsamında değerlendirildi).
5. **SQL/Prisma sınırı:** yeni dosyalarda `prisma`/`PrismaClient`/`psql`/`runSql` **0 eşleşme**;
   temizlik mevcut `tenant-cleanup.ts`/`platform-admin.ts` üzerinden ve o yollar çapalı fail-closed
   desenlerle (`tenant-cleanup.ts:88`, `platform-admin.ts:102,105,116`) korunuyor. Yeni SQL yazma
   yüzeyi yok.
6. **Sır taraması:** `git diff | grep -niE "(password|secret|api[_-]?key|token|BEGIN .*PRIVATE KEY)"`
   → tek eşleşme ROADMAP'in borç metni; yeni dosyalarda sabit sır yok (admin fixture parolası
   `verified-fixture-user.ts`'te **önceden** mevcut, bu sürüm eklemedi).
7. **Tenant izolasyonu:** değişiklik test-only; yeni tablo/sorgu/kuyruk işi/önbellek anahtarı/S3
   öneki/uç nokta YOK ⇒ CLAUDE.md §7'nin 14 maddesi bu değişiklik için **uygulanamaz** (karşılanmayan
   madde yok). Yeni spec'ler yalnızca kendi fixture kullanıcısının verisini okuyor.

## DOĞRULANAMADI

- **Playwright hiç koşturulmadı** (oran sınırı yasağı) ⇒ F1'in `# Page snapshot` bölümü oturum-içi
  bir a11y hatasıyla **ampirik olarak üretilmedi**. Kanıt zinciri: mekanizma kaynak kodda ölçüldü
  (`index.js:662-722`, `errorContext.js:75-81`) + dosyanın bu görevin spec'i tarafından ilgili
  artefakt yoluna yazıldığı diskte ölçüldü. Ampirik son adım `qa`'nın koşumunda doğrulanabilir.
- `pnpm install` / `pnpm build` / `pnpm guards` **koşturulmadı** (paralel ajan + yasak) ⇒
  `check_axe_single_source`'un deponun gerçek dosya kümesinde yeşil döndüğü doğrulanmadı; yalnızca
  `find`/`grep` deseninin kapsamı sentetik dosyalarla ölçüldü.
- `@axe-core/playwright`'ın yayıncı/imza (provenance) doğrulaması yapılmadı — kayıt defterine ağ
  sorgusu atılmadı; yalnızca lock'taki integrity hash'in varlığı ve tek kopya olduğu ölçüldü.

## ÖLÇÜMLER

- `pnpm audit`: **2 high · 3 moderate · 1 low** (hiçbiri `@axe-core/playwright`/`axe-core` kaynaklı;
  lock diff'i yalnızca iki axe girdisi ekliyor).
- İncelenen dosya: **19** (yeni 6: `a11y.ts`, 3 × `accessibility.spec.ts`, öz-test, ADR-0025;
  değişen 13'ün tamamı diff olarak; ek olarak `ci.yml` artefakt bloğu, `base.ts`, kurulu
  `axe-core`/`playwright` kaynakları, iki fixture dosyası).
- Tenant izolasyon listesinden **karşılanmayan madde yok** (değişiklik test-only; madde kümesi
  uygulanamaz — ayrıntı "Bulgu çıkmayan eksenler" §7).
- Ölçüm koşulu: load avg 3.07/3.46/3.97, 25 konteyner, 2026-11-18 17:11.
