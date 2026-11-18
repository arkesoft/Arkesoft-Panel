# T-024 — `security` gate, tur 2 (TAM yeniden denetim)

- Tarih: 2026-11-18
- Sürüm: ROADMAP v0.0.20.3 (T-024)
- Dal: `feat/v0.0.20-super-admin-iskeleti`
- Kapsam: tur 1 FAIL ⇒ WORKFLOW.md yeniden koşum tablosu gereği **dar kapanış değil, tam denetim**

GATE: security
SONUÇ: **FAIL**

---

## 1. Tur 1 bulgularının kapanış durumu

| # | Tur 1 bulgusu | Durum | Nasıl ölçtüm |
| --- | --- | --- | --- |
| **F1** | PUBLIC CI artefaktında ARIA anlık görüntüsü (`error-context.md`) | ⚠⚠ **KISMEN KAPANDI — ikinci kanal AÇIK (YENİ BULGU S1, high)** | `PLAYWRIGHT_NO_COPY_PROMPT=1` ile **gerçek Playwright koşumu** (repo dışı, `/tmp`, DB/port/oran-sınırı dokunulmadı): `error-context.md` **yine** çıplak e-posta + IP + UA + kiracı slug'ı taşıyan bir ` ```yaml ` bloğu içeriyor. Kaynak zinciri okundu: `playwright-core/lib/coreBundle.js` `_ariaSnapshotForExpect()` → `playwright/lib/worker/workerProcessEntry.js:830-831` → `playwright/lib/errorContext.js:67-73`. |
| **F2** | `target[0]` redakte edilmiyordu | ✅ **KAPANDI** | `scripts/playwright/a11y.ts`'i baştan sona okudum ve **atılan hata mesajına katılan her dize kaynağını** saydım (aşağıda §2). Sayfadan türeyen **iki** kaynak var (`target[0]`, `failureSummary`), **ikisi de** `redactSensitivePatterns()`'ten geçiyor; üçüncü bir sayfa-türevi kaynak **yok**. |
| **F3** | ack bayatlık kontrolü yok + doğrulama koşum kapsamına bağlı | ✅ **KAPANDI** | `a11y.ts:507-511` `staleAcknowledgedEntries` eklenmiş, yönü **fail-closed**. `:519-553` boş-alan döngüsü **kapsam filtresiz** (her iki tabloyu bütün olarak geziyor). `:555-580` tüm hata satırları tek `failureLines`'ta toplanıp `length > 0` ile atılıyor — fail-open yolu yok. |
| **F4** | `incomplete` raporlaması CI'da görünmüyordu | ✅ **KAPANDI (kanal PII'siz)** | `jq` ifadesi yalnızca `select(.type == "a11y-incomplete") \| .description` çıkarıyor; `a11y-incomplete` tipinin **tek üreticisi** `a11y.ts:486` (repo geneli grep), `description` = `<scanName>/<ruleId> × <n>` — hepsi statik. `playwright-annotations.json` `path.resolve(configDir, outputFile)` ile `apps/<app>/` köküne düşüyor (`playwright/lib/runner/index.js:1536-1541`), yükleme glob'u `apps/*/test-results` + `apps/*/playwright-report` (`ci.yml:1743-1745`) — **tek** `upload-artifact` adımı var (repo geneli grep), dosya kapsam dışı. `git check-ignore` üç uygulama için de `.gitignore:52`'yi döndürdü. |
| **F5** | `guards.sh` `find -name '*.ts'` kör noktası | ⚠ Borçta kalmaya devam ediyor — **ama ROADMAP'e YAZILMAMIŞ** (YENİ BULGU S2, low) | `ROADMAP.md` `D21`-`D26` satırları tek tek okundu; `D26` yalnızca `pnpm audit` sayımını kapsıyor. `check_axe_single_source`/`.tsx` kör noktası için satır **yok**. |
| **F6/F7** | `pnpm audit` sayımı bayat | ✅ Borç olarak kayıtlı (`D26`) | `pnpm audit --json` yeniden koşuldu: **0 critical / 2 high / 3 moderate / 1 low**, tur 1 ile birebir aynı. |

---

## 2. BULGULAR

### [SEV: high] `.github/workflows/ci.yml:1738-1746` (+ gerekçe yorumları `:1565`, `:1576-1577`, `:1732-1733`; `docs/testing.md:400-410`; `docs/adr/0025-…:157-166`)

**F1'in ikinci kanalı kapatılmadı; kapatıldığını söyleyen gerekçe ÖLÇÜMLE ÇÜRÜDÜ.**

`PLAYWRIGHT_NO_COPY_PROMPT` yalnızca `playwright/lib/index.js:662-680`'deki
`_takePageSnapshot()` yolunu kapatır (= `# Page snapshot` bölümü). Playwright'ın
**ikinci**, bağımsız bir ARIA anlık görüntüsü üretme yolu daha var:

1. `playwright-core/lib/coreBundle.js` → injected `expect`:
   `const ariaSnapshot = core.matches !== options.isNot ? void 0 : this._ariaSnapshotForExpect(element, options, frameVisible)`
   — yani **matcher başarısız olduğunda** anlık görüntü üretilir.
2. `_ariaSnapshotForExpect()`: element **görünür değilse / hiç bulunamadıysa**
   `return this.ariaSnapshotForExpectFailure(this.document.body, { mode: "default" })`
   ⇒ **tüm sayfanın** ARIA ağacı.
3. `playwright/lib/matchers/expect.js:13339` → `ExpectError.matcherResult.ariaSnapshot`
4. `playwright/lib/worker/workerProcessEntry.js:830-831` → `testInfo.errors[i].errorContext`
5. `playwright/lib/errorContext.js:67-73` → `if (error.errorContext) lines.push("", "```yaml", error.errorContext, "```")`
   — **`pageSnapshot`'tan tamamen bağımsız**, `PLAYWRIGHT_NO_COPY_PROMPT` bu dalı hiç görmez.

**AMPİRİK ÖLÇÜM (bu turda, gerçek Playwright 1.64.1 koşumu, `PLAYWRIGHT_NO_COPY_PROMPT=1`
set edilmiş hâlde; repo dışında `/tmp`, DB/port/oran-sınırı dokunulmadı):**
üretilen `error-context.md` içinde `# Page snapshot` **yok** (env çalışıyor), ama
`# Error details` altında:

```yaml
- main:
  - heading "Aktif oturumlar" [level=1]
  - paragraph: gizli-fixture-eposta@arkesoft.test
  - paragraph: IP 203.0.113.9 — Chrome 141 macOS
  - paragraph: "Kiracı: e2e-magaza-1763400000000-abc"
```

— e-posta, IP, user-agent ve kiracı slug'ı **çıplak**. `a11y.ts`'in redaksiyonu bu
metne **hiç dokunmaz**: dize Playwright'ın matcher katmanında, `a11y.ts` çağrılmadan
**önce** üretilir.

**Saldırı senaryosu (somut):** `apps/admin/e2e/accessibility.spec.ts:134`
(`await expect(terminateTrigger).toBeVisible()`) oturum-içi `/hesap/guvenlik`
sayfasında koşuyor; o sayfa aktif oturum listesini (fixture e-postası, IP, user-agent,
tarih) render ediyor. Bu matcher **herhangi bir nedenle** düşerse (ikinci oturum
satırı geç gelir, render yarışı, D24 sınıfı 403) Playwright `document.body`'nin tam
ARIA ağacını `error-context.md`'ye yazar; dosya `apps/admin/test-results/<test>/`
altına düşer (⚠ `outputDir` hiçbir config'te override edilmemiş — grep: 0 eşleşme ⇒
Playwright varsayılanı `test-results`), `ci.yml:1738-1746`'daki **tek**
`upload-artifact` adımı `apps/*/test-results` glob'uyla onu `if: always()` +
`retention-days: 7` ile yükler. **Depo PUBLIC** ⇒ kimlik doğrulaması olmayan
herhangi biri `gh run download` / artifact URL'si ile indirir.
Aynı senaryo `apps/superadmin/e2e/accessibility.spec.ts:110`
(`expect(heading "Mağazalar").toBeVisible()`, oturum-içi kiracı listesi) için de
geçerli.

⚠⚠ **Ayrıca üç yerde yazılı gerekçe olgusal olarak YANLIŞ** (bu Task ailesinde
üçüncü kez — "kendi güvenlik gerekçemiz yanlış olabilir" tuzağı):
- `ci.yml:1565` — *"bu, bu sürümün PII riski taşıyan TEK bölümdü"*
- `ci.yml:1576-1577` — *"`!**/error-context.md` hariç tutma deseni — REDDEDİLDİ,
  çünkü dosya (a)'dan SONRA da artık PII taşımıyor"* ⇒ **reddin dayanağı çürük**
- `ci.yml:1571-1575` / `:1732-1736` / `docs/testing.md:402-410` /
  `docs/adr/0025-…:157-166` — *"kalan bölümler PII taşımıyor çünkü hata mesajı F2'den
  geçiyor"* ⇒ matcher hataları `a11y.ts`'ten **hiç geçmez**.
- `qa` tur 1'in iki yönlü ölçümü **geçerli ama genellenemez**: `a11y.ts` düz
  `new Error` atar ⇒ `matcherResult` **yok** ⇒ `errorContext` **yok**; ölçüm tam
  olarak bu dalı kaçırmış.

**Önerilen düzeltme:** `ci.yml:1743-1745`'teki `path:` listesine
`!apps/*/test-results/**/error-context.md` eklenir (reddedilen (b) seçeneği —
ret gerekçesi artık geçersiz). `a11y.ts` tarafında **yapılabilecek bir şey yok**;
dize Playwright'ın içinde doğuyor. İsteğe bağlı ikinci katman: `:1739`
`if: always()` → `if: failure()` (yeşil koşumda artefaktın teşhis değeri yok).
Düzeltme sonrası doğrulama: yukarıdaki probe'un birebir tekrarı + artefakt
içeriğinde `error-context.md` olmadığının teyidi.

**Sorumlu ajan:** `devops`

---

### [SEV: low] `scripts/guards.sh:936-940` (`check_axe_single_source`) — borç satırı ROADMAP'e yazılmamış

`find apps packages scripts -type f -name '*.ts'` yalnızca `.ts` uzantısını tarar;
`.tsx`/`.mts`/`.cts` kör noktada. `apps/admin` ve `apps/superadmin` `.tsx` dosyaları
taşıyor ⇒ bir `.tsx` dosyası `@axe-core/playwright`'ı doğrudan import edip
`disableRules`/`exclude` çağırırsa kapı **görmez** (R6-② mekanik koruması kısmen
delik). Sömürü değeri düşük: `axe-core` pnpm strict altında kökten **çözülemiyor**
(ölçüldü: `node_modules/axe-core` yok, yalnızca `.pnpm` altında) ⇒ ikinci bir giriş
yolu yok; ve `.tsx` dosyaları Playwright spec'i değil.

⚠ Tur 1'de bu bulgu `low` olarak **borca** bırakılmıştı; `ROADMAP.md`'nin
`D21`-`D26` satırlarında **karşılığı yok** (`D26` yalnızca `pnpm audit` sayımını
kapsıyor). Borç satırının metni (`docs` kopyalayabilsin diye):

> \| low \| `scripts/guards.sh:936-940` (`check_axe_single_source`) (`D27`) \|
> Tarama `-name '*.ts'` ile sınırlı; `.tsx`/`.mts`/`.cts` kör noktada ⇒ bir `.tsx`
> dosyası `@axe-core/playwright`'ı doğrudan import edip yardımcının allowlist
> sözleşmesini (R6-②) baypas ederse kapı yakalamaz. Aynı sınıf kör nokta
> `check_playwright_retries_single_source`'ta da var (emsal dosya). Sömürü değeri
> düşük (`axe-core` pnpm strict altında kökten çözülemiyor). \| devops \| v0.0.22 \|
> security tur 1→2 \|

**Sorumlu ajan:** `docs` (kayıt) + `devops` (vadesi geldiğinde düzeltme)

---

## 3. Denetlenip TEMİZ çıkan eksenler

- **Tenant izolasyonu (CLAUDE.md §7, 14 madde):** `git status --porcelain 'apps/*/src' packages/themes packages/db/prisma packages/trpc` → **boş çıktı**. Yeni tablo/RLS/prosedür/kuyruk işi/önbellek anahtarı/S3 öneki/arama indeksi **yok**. 14 maddenin 13'ü **N/A**; 12. madde (hata mesajı başka kiracının varlığını sızdırmasın) tarandı — `a11y.ts`'in mesajı yalnızca taranan sayfadan türüyor, kiracı ayrımı iddiası taşımıyor. **Karşılanmayan madde: yok.**
- **F2 tek-kısıtlama-noktası doğrulaması (grep + satır satır okuma):** atılan hata mesajına katılan dize kaynakları tam olarak beş tanedir — `scanName` (kapalı birleşim literali), `emptyFieldErrors` (statik tablo alanları), `formatResultSummary()` (tek sayfa-türevi kaynak), `stale.reason` ×2 (statik tablo). Sayfadan türeyen **tek** fonksiyon `formatResultSummary`, onun da **iki** sayfa-türevi alanı (`target[0]` → `a11y.ts:401`, `failureSummary` → `:408`) **aynı** `redactSensitivePatterns()`'ten geçiyor, sıra redaksiyon→kesme. `helpUrl`/`impact`/`id`/`nodes.length` axe sabitleri. **Üçüncü kaçak kaynak yok.**
- **Yeni fail-open yolu (+85 satır):** `staleAcknowledgedEntries` (`:507-511`) ve kapsamsızlaştırılmış boş-alan döngüsü (`:519-553`) tek tek okundu; ikisi de yalnızca `failureLines`'a **ekleme** yapıyor, hiçbiri bir kontrolü atlatmıyor. T-023'ün `in` operatörü/prototip zinciri tuzağı **tekrarlanmamış** (`Set.has` + `Array.find` kullanılıyor). `expectNoAccessibilityViolations` altı çağrı yerinin **hepsinde** `await` ediliyor (R6-③ kapalı).
- **`fsModuleCachePath` göreli yol çözümü:** `vitest@5.0.5` `dist/chunks/index.*.js:9209` → `resolved.fsModuleCachePath = resolve(resolved.root, resolved.fsModuleCachePath)` ⇒ **config'in kendi root'una** göre. Ampirik teyit: `apps/api/node_modules/.vitest-cache` **ve** `packages/db/node_modules/.vitest-cache` **ikisi de diskte ayrı ayrı mevcut** ⇒ paylaşım gerçekten kalktı, sahte yeşil **değil**. `git check-ignore` → `.gitignore:2` (`node_modules/`) ikisini de kapsıyor.
- **Tedarik zinciri:** `git diff pnpm-lock.yaml` → **tek** değişiklik `@axe-core/playwright@4.14.0` + `axe-core@4.14.0` (zaten `eslint-plugin-jsx-a11y` üzerinden ağaçta). `ls node_modules/.pnpm | grep axe` → **iki** girdi, `axe-core` **tek kopya**. İkisinde de `preinstall`/`install`/`postinstall` **yok** (`prepare` yayınlanmış tarball'da koşmaz); `pnpm-workspace.yaml` `allowBuilds` yalnızca prisma'yı listeliyor. Lisans **MPL-2.0** (dev-only, dağıtılmıyor). Catalog'da **tam sürüm pinli**, lock'ta integrity hash'li.
- **Sır taraması:** tüm değişiklik kümesi (tracked diff + 5 yeni dosya + ADR) `password|secret|api[_-]?key|token|BEGIN .*PRIVATE KEY|bearer|tckn` ile tarandı — sabit yazılmış sır **yok**; tek eşleşmeler `fixtureUser.password` (çalışma zamanında üretilen fixture parolası, API gövdesine gidiyor, loglanmıyor).
- **Enjeksiyon:** `deletePlatformAuditLogByActor` / `deleteFixtureUserByEmail` ham SQL interpolasyonu kullanıyor **ama** `assertValidUserId` / `E2E_FIXTURE_EMAIL_PATTERN` fail-closed biçim kapılarının arkasında; **T-024 tarafından değiştirilmedi**, yalnızca çağrıldı. `jq` ifadesi veri-odaklı, kabuk enjeksiyonu yüzeyi yok; `jq` ayrıştırma hatasında basılan mesaj dosya içeriğini **dökmüyor** (ölçüldü: bozuk JSON ile `jq: parse error: Invalid numeric literal at EOF at line 1, column 153`).
- **Oran sınırlama:** yeni spec'lerin `signUp`/`signIn` payları iki `auth-budget.ts`'e yazıldı; `auth-budget.test.ts` fail-closed kapsama assert'i bunu zorluyor. Limit **değiştirilmedi**.
- **SSRF / dosya yükleme / ödeme / kart verisi / KVKK:** bu değişiklik kümesinde yüzey **yok** (test-only, üretim kodu sıfır satır).

---

## 4. ÖLÇÜMLER

- `pnpm audit --json` (bu turda koşuldu, exit 1): **critical 0 / high 2 / moderate 3 / low 1 / info 0**
  — `multer` (high, `@nestjs/platform-express` üzerinden **üretim** zincirinde),
  `picomatch` (high, ReDoS), `minimatch` (moderate), `astro` (moderate+low),
  `@astrojs/node` (moderate). **Hiçbiri `@axe-core/playwright`/`axe-core` kaynaklı
  değil**; lock diff'i yalnızca axe'ı ekliyor. Tur 1 ölçümüyle **birebir aynı** ⇒
  tedarik zinciri tur 1'den beri **değişmedi**. Kayıtlı borç: `D26` + ROADMAP `F7`.
- **İncelenen dosya sayısı: 23** — 19 değişmiş tracked dosya (`git diff --stat`) + 5 yeni dosya (`a11y.ts` 581 satır, 4 spec) − 1 çakışma; ayrıca kanıt için okunan 5 `node_modules` kaynak dosyası (playwright `index.js`, `errorContext.js`, `workerProcessEntry.js`, `expect.js`, `runner/index.js`; playwright-core `coreBundle.js`; vitest `index.*.js`) sayıma dahil **değil**.
- **Tenant izolasyon listesinden karşılanmayan madde numaraları: yok** (13 madde N/A — üretim kodu/şema değişmedi; 12. madde tarandı ve temiz).
- **Çalıştırılmayanlar (koşturma kuralları gereği):** `pnpm test:e2e`, `pnpm test:isolation`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm guards`.
- **Ölçüm koşulları:** `PLAYWRIGHT_NO_COPY_PROMPT` probe'u repo **dışında** (`/tmp/pwprobe`, sonradan silindi), yalnızca `page.setContent` kullandı — ağ/DB/port/oran-sınırı sayacı **dokunulmadı**. Hiçbir depo dosyası değiştirilmedi.

## 5. DOĞRULANAMADI

- **`error-context.md`'nin gerçek CI koşumunda üretilip üretilmediği.** Yukarıdaki
  kanal **mekanik olarak** kanıtlandı (kaynak + gerçek Playwright koşumu), ama
  T-024'ün spec'lerinden birinin CI'da **gerçekten** düştüğü bir koşum gözlenmedi.
  Bulgunun geçerliliği buna bağlı **değil** (kanal her başarısız matcher için
  açık), ama "bugüne kadar sızdı mı" sorusu **cevapsız**.
- **`wcag21a`/`wcag21aa` etiketlerinin canlı etkinliği.** Öz-test `wcag2a`
  (`label`/`button-name`) ve `wcag2aa` (`color-contrast`) etiketlerinin gerçekten
  kural çalıştırdığını kanıtlıyor; diğer iki etiket için canlı kanıt yok.
  Yanlış yazılmış bir etiket **sessizce 0 kural** koşturur. Bu `wcag` gate'inin
  "yeniden tanımlı kapsam" madde 1'inin konusu — `security` kapsamı dışı, not
  olarak bırakıldı.
- **`D25`** (`pnpm test:isolation`'ın `ENOTEMPTY` sonrası açıklanamayan 2-test
  düşüşü) — koşturma yasağı gereği bu turda ölçülmedi, `qa`/`devops`'ta kalıyor.
