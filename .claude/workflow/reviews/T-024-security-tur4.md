# T-024 — `security` gate, tur 4

- **Tarih:** 2026-11-18
- **Sürüm:** ROADMAP v0.0.20.3
- **Dal:** `feat/v0.0.20-super-admin-iskeleti`
- **Kapsam:** TAM (tur 1/2/3 FAIL)

```
GATE: security
SONUÇ: PASS
```

---

## 1. Tur 3 `high` bulgusunun kapanış durumu — **KAPANDI**

**Bulgu (tur 3):** `video: 'retain-on-failure'` `retries`'ten bağımsız çalışır; başarısız
testte `video.webm` doğar ve PUBLIC artefakta yüklenirdi. `if: failure()` koruma sağlamaz
(koşullar çakışır).

**Düzeltme (FIX 4, `devops`):** `ci.yml:1894-1899` `path:` listesine
`!apps/*/test-results/**/*.webm` ve `!apps/*/test-results/**/trace.zip` eklendi.

**Bağımsız doğrulama (bu tur — `devops`'un ölçümüne GÜVENİLMEDİ, sıfırdan kuruldu):**

- Depo **dışı** `/tmp/sec-t4-glob`, gerçek `@actions/glob`, **iki sürüm**: `0.7.0` **ve**
  `0.5.0`.
- `ci.yml:1894-1899` ile **birebir** beş satırlık desen sırası.
- **28 sentetik dosya**, derinlik ekseni kasıtlı olarak genişletildi:
  - **sıfır derinlik** — `apps/admin/test-results/video.webm`, `.../trace.zip`,
    `.../error-context.md` (doğrudan `test-results` kökünde)
  - **1 seviye** — `test-results/<test-dizini>/{video.webm,trace.zip,error-context.md}`
  - **retry alt dizini** — `test-results/<test>-retry1/...`
  - **3 seviye** — `test-results/a/b/c/...`
  - **hash adlı video** — `0f3ea1b2c3d4.webm` (Playwright'ın çok sayfalı adlandırması)
  - üç uygulama (`admin`/`superadmin`/`storefront`)
- **SONUÇ (her iki glob sürümünde de aynı):** `test-results` altında sızan hassas dosya
  **0**. `test-failed-1.png`, `.last-run.json`, görsel `-actual.png`/`-diff.png`
  **korunuyor** (teşhis değeri duruyor).

**Ek ölçüm — `**` sıfır segment:** `@actions/glob`'un `**`'ı **sıfır dizin seviyesini de**
eşleştiriyor (sıfır derinlikteki `video.webm` hariç tutuldu) ⇒ desen derinlikten bağımsız.

**Ek ölçüm — `trace-1.zip` var mı:** Playwright **1.64.1** kaynağı okundu
(`playwright/lib/worker/workerProcessEntry.js:682-684`): çoklu context'in trace'leri
`mergeTraceFiles()` ile **TEK** `trace.zip`'e birleştiriliyor; ordinal ekli (`trace-1.zip`)
bir çıktı bu sürümde **üretilmiyor**, geçici parçalar `_artifactsDir` (os temp) altında
kalıyor, `test-results`'a düşmüyor. ⇒ literal `trace.zip` deseni bugün **tam kapsıyor**
(sürüme bağlı varsayım — L4).

---

## 2. ⚠⚠ DÖRDÜNCÜ KANAL — **ARANDI ve BULUNDU**

### Arama yöntemi (ne tarandı)

| Eksen                              | Ölçüm                                                                                                                              | Sonuç                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/*/playwright-report`         | `html` reporter / `PLAYWRIGHT_HTML_REPORT` / `blob-report` jetonu `apps`+`packages`+`scripts`+`.github`+`turbo.json` genelinde grep | **Sıfır eşleşme** ⇒ dizin bugün **hiç doğmuyor**; yükleme kolu bugün boş. `run-visual.sh`'ta da html YOK. |
| `test-results` altındaki diğer tür | sentetik glob koşumu + `screenshot:` override araması                                                                               | `screenshot` ayarı hiçbir config'te YOK ⇒ varsayılan `off`, başarısızlık ekran görüntüsü üretilmiyor.      |
| `.last-run.json`                   | içerik şeması                                                                                                                        | test id + durum, PII yok.                                                                                   |
| görsel `-actual.png`/`-diff.png`   | `toHaveScreenshot` kullanıcıları grep                                                                                                | yalnızca `apps/storefront/e2e/visual/**` + `storefront-theme.spec.ts` ⇒ anonim demo vitrin, PII yok.        |
| `playwright-annotations.json`      | `git check-ignore -v` ×3 + glob deseni                                                                                               | `.gitignore:55` üçünü de yakalıyor; yükleme glob'unun dışında.                                             |
| `GITHUB_STEP_SUMMARY` (AC-21)      | `a11y-incomplete` **tek üretici** grep + `jq` ifadesi                                                                                | Tek üretici `a11y.ts:499-502`; `description` = `<scanName>/<ruleId> × <n>`, üçü de statik ⇒ PII'siz.        |
| `run-gates` artefaktları           | `action.yml:111,151`                                                                                                                 | Yalnızca vitest logu, `redact-test-log.ts` borusundan geçiyor, `retention-days: 1`. e2e job'u bunu kullanmıyor. |
| `cat /tmp/arkesoft-e2e-api.log`    | `ci.yml:1319,1392`                                                                                                                   | Yalnızca **hazırlık probu düşerse**, yani test trafiği **başlamadan önce** — kullanıcı verisi içermez.      |
| **e2e adımının kendi stdout'u**    | **gerçek Playwright 1.64.1 koşumu (depo dışı)**                                                                                      | ⚠ **AÇIK — dördüncü kanal (M1).**                                                                          |

### Bulunan kanal: `test:e2e` adımının stdout'u → PUBLIC Actions job log'u

Ampirik ölçüm (depo **dışı** `/tmp/sec-t4-pw`, gerçek `@playwright/test@1.64.1`, yalnızca
`page.setContent`, DB/port/oran-sınırı/Docker'a **dokunulmadı**, bitince temizlendi):

| Senaryo                                             | stdout'a ne düştü                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `expect(locator).toBeVisible()` düştü               | Yalnızca locator ifadesi + call log. **Sayfa içeriği YOK.**                                              |
| `expect(bodyText).toContain(...)` düştü             | **`Received string:` = sayfanın TAM `innerText`'i, KESİLMEDEN** (44 satırlık sentetik sayfanın tamamı). |
| strict mode ihlali (`toHaveText`, 2 eşleşme)        | **Eşleşen elemanların ham `outerHTML`'i** (`<button aria-label="Firefox / 198.51.100.9 …">`).            |
| düz `Error` (a11y.ts deseni)                        | `error.message` **aynen** (a11y.ts bunu kaynakta redakte ettiği için güvenli).                           |
| `error-context.md` içeriği (`# Page snapshot`/ARIA) | **BASILMIYOR** — yalnızca dosya **yolu** (`runner/index.js:1351` ölçüldü). ✅                             |

Bu kanal:

- `redact-test-log.ts` tarafından **kapsanmıyor** (ölçüldü: yalnızca
  `.github/actions/run-gates/action.yml:93,143`; `test:e2e` borusunda **hiç yok**),
- `if: failure()` ve dört `path:` hariç tutmasından **tamamen bağımsız** (farklı taşıma),
- depo PUBLIC olduğu için **giriş gerektirmeden** okunabilir (artefakttan daha erişilebilir),
- `docs/testing.md` §7'nin "üç katman" taksonomisinde ve `ADR-0025`'in üç gözden geçirme
  notunda **hiç sayılmıyor** (yalnızca `a11y.ts:73-79` doğru biçimde adlandırıyor).

**T-024 bu kanalı genişletiyor mu — ölçüldü:** Yeni a11y spec'lerinin kendi hata mesajları
bu kanala **sayfa içeriği dökmüyor** (sabit `name` ile `toBeVisible` + a11y.ts'in redakte
edilmiş düz `Error`'u). **AMA** T-024 bu kanalın **en geniş** desenini iki yerde ekliyor:
`apps/storefront/e2e/accessibility.spec.ts:75` ve `:91`
(`expect(bodyText).toContain(...)`) — bugün anonim vitrin sayfaları (demo kiracı + 404),
yani **PII taşımıyor**; ama aynı desen oturum-içi bir taramaya kopyalanırsa tam sayfa
metni doğrudan public log'a düşer. ⇒ `medium` (somut, ölçülmüş, bugün sömürülebilir
**değil**).

---

## 3. BULGULAR

- [SEV: medium] `.github/workflows/ci.yml:1520-1627` (`test:e2e` adımı) + `docs/testing.md`
  §7 — **Dördüncü PII kanalı: e2e adımının stdout'u.** Saldırı senaryosu: depo PUBLIC;
  herhangi bir kişi (giriş gerekmeden) başarısız bir `e2e` koşumunun job log'unu açar.
  Playwright'ın generic matcher hataları (`toContain`/`toHaveText`) `Received string:`
  altında **tam sayfa metnini kesilmeden**, strict-mode ihlalleri ise eşleşen
  elemanların **ham `outerHTML`'ini** basar. Bu kanalı ne `redact-test-log.ts` (borusunda
  değil — ölçüldü), ne `if: failure()`, ne de dört `path:` hariç tutması kapsar. Bugün bu
  kanaldan **gerçek PII akmıyor** (T-024'ün iki `expect(bodyText).toContain` örneği anonim
  vitrin sayfalarında; oturum-içi spec'lerin mesajları redakte/sabit) — bu yüzden `high`
  değil. Risk, kanalın **savunma modelinde hiç sayılmıyor** olması: bir sonraki ajan aynı
  deseni `/hesap/guvenlik` veya süper admin kiracı listesine kopyalarsa tam sayfa metni
  tek satırlık bir değişiklikle public log'a düşer ve hiçbir mevcut kapı bunu görmez.
  **Önerilen düzeltme:** (a) `docs/testing.md` §7'ye **dördüncü katman/kanal** olarak
  yazılsın (artefakt ≠ tek yüzey); (b) `ADR-0025`'e gözden geçirme notu #4; (c) opsiyonel
  mekanik kapı: `guards.sh`'e "oturum-içi (`storageState`/`browser.newContext`) kullanan
  spec'lerde `expect(<string>).toContain/toHaveText` deseni yasak" taraması, ya da
  `test:e2e` adımına `redact-test-log.ts` borusu (⚠ `pipefail` + Playwright exit kodu
  korunmalı). **Sorumlu ajan:** `devops` (+ `docs`).

- [SEV: medium] `docs/testing.md:372-466` (§7 "PII azaltma — üç katman") — **Bölüm FIX
  turu 4'ü hiç yansıtmıyor ve shipped davranışın TERSİNİ söylüyor.** `:442` birebir şunu
  yazıyor: _"sonuç listesinde `error-context.md` hiç yok; trace/screenshot/**video**/html
  **korunuyor**"_. Bu, `ci.yml:1897-1898`'in bugünkü hâliyle **yanlış** —
  `!apps/*/test-results/**/*.webm` ve `!...trace.zip` FIX 4'te eklendi; video ve trace
  artık **korunmuyor, hariç tutuluyor** (bu turda iki glob sürümüyle ölçüldü). Bölümün
  tamamında `webm`/`trace.zip`/video kanalı (yani `security` tur 3'ün `high` bulgusu ve
  onun düzeltmesi) **hiç geçmiyor**; başlık hâlâ "üç katman" diyor, oysa dört hariç tutma
  deseni + env + `failure()` shipped. Bu, bu Task'ta ölçümle çürüyen **yedinci** olgusal
  iddia ve Task'ın kendi dersinin ("bir savunmanın kapsamı, kapattığı kanal sayılmadan
  ilan edilemez") kanonik belgede tekrarı. Somut sonuç: belgeye güvenen bir sonraki ajan
  "video zaten korunuyor" diye okur ve ya kanalı yeniden açar ya da kapalı bir kanalı
  ikinci kez kapatmaya çalışır. **Önerilen düzeltme:** §7'yi dört hariç tutma desenini
  (ve M1'in stdout kanalını) kapsayacak biçimde güncelle; `:442`'deki "video korunuyor"
  ifadesini düzelt. **Sorumlu ajan:** `docs`.

### `low` bulgular (düzeltme turu açmaz — borç satırı metni)

- [SEV: low] `docs/testing.md:436,450,469,474,475,476` — `ci.yml:1815-1824` / `:1816` /
  `:1822` / `:1824` atıfları **bayat**: artefakt yükleme adımı bugün **`:1889-1900`**;
  `:1815-1824` aralığı artık FIX 4'ün yorum bloğunun içine düşüyor. ⚠ Aynı paragraf
  (`:470-473`) _"bu bölüm bu turda `Grep`/`Read` ile doğrudan doğrulanmış güncel satırlara
  düzeltildi"_ diyor — bu Task'ta **dördüncü** bayat-satır vakası. **Öneri:** satır
  numarası yerine adım **adına** atıf (`.gitignore:46-50`'nin benimsediği disiplin).
  **Sorumlu:** `docs` · **Vade:** v0.0.20.5.
- [SEV: low] `docs/testing.md:552` ve `.claude/workflow/tasks/T-024.md:365` —
  `.gitignore:52` deniyor; `playwright-annotations.json` gerçekte **`.gitignore:55`**
  (`:52` bir yorum satırı). Davranış doğru (`git check-ignore -v` üç uygulama için de
  `:55` döndü), yalnızca atıf yanlış. **Sorumlu:** `docs` · **Vade:** v0.0.20.5.
- [SEV: low] `docs/adr/0025-erisilebilirlik-kapisinin-mekanik-siniri.md` — gözden geçirme
  notu zinciri **#3'te duruyor**; FIX turu 4 (video kanalı, `security` tur 3 `high`) için
  **not #4 yok**. Ayrıca `:32` hâlâ `if: always()` diyor (bugün `failure()`), `:65-66`,
  `:159`, `:162` `ci.yml:1558`/`:1565`/`:1604` atıfları bayat (bugün `:1890`, `:1900`,
  `:1626`). **Sorumlu:** `docs` · **Vade:** v0.0.20.5.
- [SEV: low] `.github/workflows/ci.yml:1898` — `!apps/*/test-results/**/trace.zip` literal
  dosya adı; Playwright **1.64.1** için doğru olduğu bu turda kaynaktan ölçüldü
  (`workerProcessEntry.js:682-684`, çoklu context `mergeTraceFiles` ile tek dosyaya
  birleşiyor), ama bu **sürüme bağlı** bir varsayım. `!apps/*/test-results/**/*.zip`
  sürümden bağımsız olurdu ve bugün hiçbir teşhis dosyası kaybettirmezdi.
  **Sorumlu:** `devops` · **Vade:** Playwright major yükseltmesi.
- [SEV: low] `scripts/guards.sh:922-957` (`check_axe_single_source`) — tarama yalnızca
  `-name '*.ts'`; bir `.tsx`/`.mts`/`.cts` dosyası `@axe-core/playwright`'ı doğrudan
  import ederse kapı **görmez**. Kendi içinde fail-closed (boş hedef listesi → `return 1`,
  home dosyası kaybolursa → `return 1`) ve kendi jetonunu taramıyor (`.sh`, scan seti
  `.ts`) ⇒ literal-jeton tuzağına düşmüyor. **Sorumlu:** `devops` · **Vade:** v0.0.22.
- [SEV: low] `ROADMAP.md:3822` ve `:3946` (`F7`/`D26` borç satırları) — bu Task'ta
  (2026-11-18) yazılan _"`pnpm audit` bugün **2 high** (`multer` + `picomatch` ReDoS)"_
  sayımı **bugün geçerli değil**: aynı gün yeniden ölçüldüğünde çıktı **1 high
  (`multer`) / 3 moderate / 1 low**, `picomatch` hiç görünmüyor. **Sorumlu:** `docs` ·
  **Vade:** v0.0.22.

---

## 4. Kontrol listesi

| Madde                                                          | Durum                                                                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant izolasyon listesinin 14 maddesi bu değişiklik için      | **Uygulanamaz/karşılandı** — `git status --porcelain 'apps/*/src' packages/themes` → **sıfır**; yeni tablo/prosedür/kuyruk işi/migration YOK. |
| Girdiden gelen id'ler için sahiplik (IDOR)                     | ✓ yeni uç nokta yok                                                                                                                            |
| Yetkisiz vs. yok ayrımı                                        | ✓ etkilenmedi                                                                                                                                  |
| Yetki kontrolü atlatılamıyor                                   | ✓ etkilenmedi                                                                                                                                  |
| Her dış veri Zod ile                                           | ✓ yeni dış veri girişi yok; `a11y.ts` `process.env` okumuyor (`check_e2e_env_passthrough` zorluyor)                                            |
| Enjeksiyon yüzeyi (SQL/komut/yol/XSS/yönlendirme)              | ✓ yeni ham SQL yok (admin spec'i ikinci oturumu **gerçek HTTP sign-in** ile açıyor, `INSERT` yok); `run:` blokları `env:` üzerinden            |
| Sır loglanmıyor/saklanmıyor/repoya girmemiş                    | ✓ diff + dört yeni dosya üzerinde sır grep'i → eşleşme yok; `password` yalnızca çalışma zamanı fixture değeri                                 |
| Ödeme akışı (imza/replay/idempotency)                          | yok — kapsam dışı                                                                                                                              |
| Kart verisi                                                    | yok — kapsam dışı                                                                                                                              |
| Oran sınırlama                                                 | ✓ `auth-budget.ts` beyanları güncellendi; admin payı 1 sign-up + 2 sign-in, config'te taşma kapısı (`playwright.config.ts:80-86`) duruyor      |
| SSRF / dosya yükleme                                           | yok — kapsam dışı                                                                                                                              |
| `pnpm audit`                                                   | ✓ koştu — aşağıdaki ÖLÇÜMLER; T-024 **hiçbirini getirmedi**                                                                                   |
| KVKK — gereksiz veri toplama                                   | ✓ `a11y.ts` `node.html`'i hiç okumuyor; `target[0]` + `failureSummary` tek redaksiyon noktasından geçiyor                                      |
| Süper admin işlemleri denetim kaydı                            | ✓ etkilenmedi; superadmin spec'i `platform_audit_log`'u kendi temizliyor                                                                        |

---

## 5. `if: failure()` + dört hariç tutmanın birleşik etkisi (gözlem — bulgu DEĞİL)

Bir e2e başarısızlığında artefakt artık pratikte şunu taşıyor: `.last-run.json`, boş test
dizinleri ve (görsel koşum düştüyse) `-actual.png`/`-diff.png`. **Kaybedilen teşhis:**
başarısız testin videosu, ARIA sayfa anlık görüntüsü ve hata bağlamı dosyası — yani
"ekranda ne vardı" sorusuna cevap veren her şey. **Kalan teşhis:** job log'undaki
`error.message` + kaynak kod parçacığı + stack (ki M1'e göre bu kanal zaten geniş) ve
AC-21 adımının `GITHUB_STEP_SUMMARY` çıktısı. Değerlendirme: teşhis yeteneği **daraldı ama
yok olmadı**; "savunma eklerken başka şeyi kırma" riski bu turda **gerçekleşmedi** —
`upload-artifact@v4` hiçbir dosya eşleşmediğinde uyarı üretir, job'u kırmaz
(`run-gates/action.yml:99-101`'in zaten belgelediği davranış).

---

## 6. ÖLÇÜMLER

- **`pnpm audit` (bu turda gerçekten koşturuldu):** **5 zafiyet — 0 kritik / 1 high
  (`multer` GHSA-q7qp-rjg7-q26m, transitive `@nestjs/platform-express`) / 3 moderate
  (`minimatch`, `astro`, `@astrojs/node`) / 1 low (`astro`)**. Hiçbiri T-024 kaynaklı
  değil: lock diff'i yalnızca `@axe-core/playwright@4.14.0` + `axe-core@4.14.0` ekliyor.
  Tedarik zinciri kontrolü: `ls node_modules/.pnpm/axe-core@*` → **tek kopya** (4.14.0);
  katalogda tam sürüm pinli, lock'ta `integrity` hash'li, peer `playwright-core@1.64.1`
  karşılanıyor, `onlyBuiltDependencies`'e eklenmemiş (install script yok).
- **İncelenen dosya sayısı:** **23** (`ci.yml` ilgili ~450 satır, `run-gates/action.yml`,
  üç `playwright.config.ts`, `base.ts`, `a11y.ts`, dört yeni spec, `ActiveSessionsCard.tsx`,
  `guards.sh` diff, `.gitignore`, `docs/testing.md` §7, `ADR-0025`, `turbo.json`,
  `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml` diff, Playwright 1.64.1'in
  `runner/index.js` + `worker/workerProcessEntry.js`).
- **Tenant izolasyon listesinden karşılanmayan madde:** **yok** — değişiklik hiçbir
  tenant'a bağlı tabloya, prosedüre, kuyruk işine veya `apps/*/src`'e dokunmuyor
  (`git status --porcelain 'apps/*/src' packages/themes` → sıfır satır, ölçüldü).
- **Glob ölçümü:** 2 `@actions/glob` sürümü × 28 sentetik dosya × 5 desen → `test-results`
  altında **0** sızıntı.
- **Playwright ölçümü:** gerçek `@playwright/test@1.64.1`, 4 senaryo, depo dışı `/tmp`,
  yalnızca `setContent`. DB/port/oran-sınırı/Docker'a **dokunulmadı**; fikstürler
  (`/tmp/sec-t4-glob`, `/tmp/sec-t4-pw`) **silindi** (doğrulandı).
- **Ortam:** ölçümler sakin makinede, kullanıcının 3000/5173/5174 portlarına ve ~25
  konteynerine dokunulmadan alındı. Hiçbir depo dosyası değiştirilmedi (bu rapor hariç).
