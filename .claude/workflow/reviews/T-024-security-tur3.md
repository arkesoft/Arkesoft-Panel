# T-024 — `security` gate, tur 3 (TAM kapsam)

Tarih: 2026-11-18
Sürüm: ROADMAP v0.0.20.3
Dal: `feat/v0.0.20-super-admin-iskeleti`

```
GATE: security
SONUÇ: FAIL
```

---

## 1. Tur 2 `high` bulgusunun kapanış durumu — **KAPANDI** (bağımsız ölçüldü)

Tur 2'nin bulgusu: `_ariaSnapshotForExpect()` → `matcherResult.ariaSnapshot` →
`errors[].errorContext` → `error-context.md`'nin `# Error details` bölümü.
`PLAYWRIGHT_NO_COPY_PROMPT` bu dalı hiç görmüyordu.

`devops`'un `@actions/glob` ölçümüne **güvenilmedi**, sıfırdan tekrar ölçüldü.

### 1.1 Desen sırası — kendi fikstürümle, İKİ glob sürümüyle

Depo dışı `/tmp`'te, `actions/upload-artifact@v4`'ün `getDefaultGlobOptions()`
değerleriyle (`followSymbolicLinks: true, implicitDescendants: true,
omitBrokenSymbolicLinks: true`) birebir. Fikstür **bilerek** `devops`'unkinden
geniş tutuldu — iç içe derinlik eksenini sınamak için:

| Fikstür dosyası                                            | Amaç                  |
| ---------------------------------------------------------- | --------------------- |
| `apps/admin/test-results/error-context.md`                  | **sıfır derinlik**    |
| `apps/admin/test-results/a11y-admin-desktop/error-context.md` | normal (1 seviye)   |
| `apps/admin/test-results/retry-dir-1/error-context.md`      | retry alt dizini      |
| `apps/admin/test-results/deep/nest/er/error-context.md`     | **3 seviye derin**    |
| `apps/storefront/…`, `apps/superadmin/…`                    | çok uygulama          |
| `trace.zip` · `video.webm` · `test-failed-1.png` · `index.html` · `.last-run.json` | korunmalı |

Sonuç (`@actions/glob@0.7.0`, minimatch 10):

| Desen sırası                                                     | `error-context.md` |
| ---------------------------------------------------------------- | ------------------ |
| **A — nihai `ci.yml` sırası** (`:1821` → `:1822` → `:1823`)       | **0 / 6**          |
| B — negate İLK (sıra ters)                                        | 6 / 6 (etkisiz)    |
| C — negate EN SON                                                 | 0 / 6              |
| D — hariç tutma yok (eski hâl)                                    | 6 / 6              |

Aynı dört koşum `@actions/glob@0.5.0` + **minimatch 3.1.5** ile tekrarlandı →
**birebir aynı sonuç**. ⇒ Bulgu `upload-artifact`'ın hangi glob sürümünü
paketlediğinden **bağımsız**. `**` sıfır segment de eşleştiriyor (sıfır
derinlikteki dosya da hariç tutuluyor), derin iç içe yapı da kapsanıyor.

### 1.2 Kaynak doğrulaması

`playwright@1.64.1/lib/errorContext.js:65-72` doğrudan okundu — `error.errorContext`
**ayrı bir `# Page snapshot` bölümü değil**, `# Error details`'in **içine** ek bir
` ```yaml ` bloğu olarak yazılıyor. `docs`/`devops`'un düzelttiği anlatı **doğru**.

### 1.3 Ampirik (depo dışı `/tmp`, yalnızca `page.setContent`, gerçek Playwright 1.64.1)

Sentetik "oturum-içi sayfa" (e-posta + IP + UA + kiracı slug'ı) + `expect(…).toBeVisible()`
matcher hatası, `PLAYWRIGHT_NO_COPY_PROMPT=1` SET:

- `error-context.md` → `# Page snapshot` **yok** (env çalışıyor), ama `# Error details`
  içinde ARIA ağacı **çıplak** (`fixture-user@…`, `88.247.13.201`, `Mozilla/5.0 …`,
  `kiraci-slug-gizli`) ⇒ tur 2'nin teşhisi **teyit edildi**.
- Nihai `path:` listesi bu dosyayı **yüklemiyor** ⇒ **kanal kapandı**.

---

## 2. ⚠⚠ ÜÇÜNCÜ KANAL ARANDI — **BULUNDU**

Tur 1 bir kanal, tur 2 ikincisini buldu. Aynı mantık bir kez daha yürütüldü:
Playwright'ın `testInfo`'ya sayfa türevi içerik yazan **tüm** yolları kaynaktan
tarandı ve her biri ayrı ayrı ölçüldü.

| # | Kanal | Üretim koşulu (ÖLÇÜLDÜ) | Artefakta giriyor mu | Durum |
| - | ----- | ----------------------- | -------------------- | ----- |
| 1 | `error-context.md` / `_takePageSnapshot()` | düz `Error`, env yoksa | **HAYIR** (`:1822`) | ✅ kapalı |
| 2 | `error-context.md` / `matcherResult.ariaSnapshot` | matcher hatası | **HAYIR** (`:1822`) | ✅ kapalı |
| 3 | **`video.webm`** | **her başarısız test, `retries: 0` iken DE** | **EVET** | ❌ **AÇIK** |
| 4 | `trace.zip` | `retries ≥ 1` gerekir | EVET (hariç tutulmuyor) | ⚠ tek jeton uzakta |
| 5 | `test-failed-1.png` | `screenshot` ayarı — **hiç set edilmemiş ⇒ `off`** | — | ✅ üretilmiyor (ölçüldü) |
| 6 | `playwright-annotations.json` (json reporter) | her koşum | HAYIR (glob dışı + gitignore) | ✅ ve **PII taşımıyor** (ölçüldü) |
| 7 | `GITHUB_STEP_SUMMARY` (AC-21 `jq` adımı) | her koşum | (public özet) | ✅ yalnızca `scanName/ruleId × n` |
| 8 | **stdout** (public Actions logu, `dot` reporter) | her hata | (public log) | ✅ ARIA ağacı **yok** (ölçüldü) |
| 9 | `playwright-report/` (html reporter) | hiç yapılandırılmamış | — | ✅ doğmuyor |

Kanal 6 ölçümü: üretilen `annotations.json`'da `errorContext`/`ariaSnapshot`
anahtarı **yok**, enjekte edilen IP/e-posta **yok**; `attachments` yalnızca
`{name, contentType, path}` taşıyor.

Kanal 8 ölçümü: `runner/index.js:1491` `formatError()` yalnızca
`message`/`snippet`/`stack`/`cause` kullanıyor; `error-context` eki `:1351-1355`'te
**yalnızca yol satırı** olarak basılıyor (`Error Context: test-results/…`).
Gerçek koşumda stdout'ta ARIA ağacı **görülmedi**.

---

## 3. BULGULAR

```
BULGULAR:
  - [SEV: high] .github/workflows/ci.yml:1734-1735 (gerekçe) + :1820-1823 (path listesi)
    — `video.webm` kanalı AÇIK; adımın kendi gerekçesi ÖLÇÜMLE YANLIŞ
    — `!apps/*/test-results/**/*.webm` (ve savunma derinliği için `**/trace.zip`)
      hariç tutma desenleri `:1821`'den SONRA eklenecek; alternatif: CI'da `video: 'off'`
    — devops
  - [SEV: low] scripts/playwright/a11y.ts:67 — bayat olgu: "`if: always()` + `retention-days: 7`"
    — `if: failure()` olarak düzeltilecek — docs (vade v0.0.21)
  - [SEV: low] .gitignore:47 — bayat atıf "ci.yml:1591 civarı"; gerçek `jq` adımı `:1656`
    — atıf güncellenecek — docs (vade v0.0.21)
  - [SEV: low] .github/workflows/ci.yml:1815 (adım adı) + ADR-0025:182 / docs/testing.md:
    "screenshot" iddiası ve `index.js:666` off-by-one atfı
    — adım adından "screenshot" düşürülecek, atıf `:667` olacak — devops/docs (vade v0.0.22)
```

### F-A (high) — `video.webm`: üçüncü ve hâlâ açık ARIA/PII kanalı

**Ölçülmüş olgu.** `ci.yml:1733-1735` şunu iddia ediyor:

> «…ikisi `retries`'e (varsayılan 0, `base.ts` pini) ve `on-first-retry`/
> `retain-on-failure` bayraklarına bağlıdır, **yani `retries: 0` iken trace/video
> HİÇ ÜRETİLMEZ**…»

Bu cümle **video için yanlış**. `video: 'retain-on-failure'` `retries`'ten
**bağımsızdır**: Playwright her test için kaydeder, **başarısızlıkta saklar**.

Ampirik (depo dışı `/tmp`, yalnızca `page.setContent`, `retries: 0`,
`trace: 'on-first-retry'`, `video: 'retain-on-failure'` — `base.ts` ile birebir):

- Başarısız test → `test-results/<dir>/video.webm` **üretildi** (10 842 bayt).
  `trace.zip` üretilmedi (o kısım doğru), `test-failed-1.png` üretilmedi.
- Kaydedilen videodan bir kare `ffmpeg` ile çıkarıldı: karede sentetik
  **e-posta, IP adresi, user-agent ve kiracı slug'ı okunabilir** hâlde.
- Geçen test → `test-results` yalnızca `.last-run.json`; video **yok**.
- Aynı sonuç `PLAYWRIGHT_NO_COPY_PROMPT` SET ve UNSET iken **ikisinde de**.

`apps/{admin,superadmin,storefront}/playwright.config.ts`'te `video`/`trace`/
`screenshot` **override'ı yok** (grep: sıfır eşleşme) ⇒ `base.ts:148-149` üç
uygulamada da geçerli.

**Neden üç katman bunu kapatmıyor.**

1. Hariç tutma deseni **yalnızca** `error-context.md`'yi hedefliyor — `.webm`
   hariç tutulmuyor (§1.1 A koşumu: video sonuç listesinde **korunuyor**;
   `docs/testing.md:454-457` bunu zaten açıkça yazıyor).
2. `PLAYWRIGHT_NO_COPY_PROMPT` videoyu hiç etkilemiyor (ölçüldü).
3. `if: always()` → `if: failure()` **hiç yardımcı olmuyor** — video **tam
   olarak** başarısızlıkta doğar, artefakt **tam olarak** başarısızlıkta yüklenir.
   İki koşul birebir çakışıyor.

**Somut saldırı senaryosu.** Kimliği doğrulanmamış bir internet kullanıcısı
(depo PUBLIC; tehdit modeli `po` R-9 + `security` tur 1/2 ile aynı) başarısız bir
`e2e` koşumunun `e2e-playwright-artifacts` artefaktını 7 gün boyunca indirir.
İçinde `apps/admin/test-results/…/video.webm` vardır: admin `/hesap/guvenlik`
sayfasının **oturum-içi** kaydı — aktif oturum listesi (IP adresleri,
user-agent'lar, tarihler), fixture kullanıcısının e-postası, kiracı adları; ve
`apps/superadmin/test-results/…/video.webm` — superadmin "Mağazalar" kiracı
listesi. Tetikleyici teorik değil: `apps/admin/e2e/accessibility.spec.ts:134`
ve `apps/superadmin/e2e/accessibility.spec.ts:110` tam olarak bu sayfalarda
matcher assert'i yapıyor ve `D24` (same-origin guard) sınıfı bir hata
superadmin ayağını **yerelde zaten düşürüyor** (`qa` tur 1: 1/2).

**Önem derecesi gerekçesi (şişirilmedi).** İçerik sınıfı F1 ile **aynı**
(oturum-içi sayfanın tam içeriği), yüzey **aynı** (aynı artefakt, aynı public
depo, aynı 7 gün). F1 iki turda `high` derecelendirildi; yalnızca dosya biçimi
farklı olduğu için düşürmek tutarsız olurdu. Hafifletici olgular dürüstçe
kayda geçirilir: veri **sentetik e2e fixture** verisidir (üretim kiracı verisi
değil) ve video `trace.zip`'in aksine **çerez/`Authorization` taşımaz**. Buna
rağmen `high`, çünkü (a) kanal açık ve somut, (b) birleştirilmiş kodun kendi
güvenlik gerekçesi **ölçümle yanlış** ve bir sonraki okuyucuyu "video yok"
sonucuna götürür — bu Task'ta **altıncı** çürüyen olgusal iddia ve **üçüncü**
"tek katman ≠ kapalı kanal" vakası.

**Önerilen düzeltme (ampirik olarak ölçüldü).** `path:` listesi:

```
apps/*/test-results
!apps/*/test-results/**/error-context.md
!apps/*/test-results/**/*.webm
!apps/*/test-results/**/trace.zip
apps/*/playwright-report
```

Bu dizilimle ölçülen sonuç: `error-context.md` 0, `video.webm` 0, `trace.zip` 0;
`test-failed-1.png`, `playwright-report/**`, `.last-run.json` **korunuyor**.
(`trace.zip` bugün `retries: 0` sayesinde doğmuyor; desen, `guards.sh`'in tek
jetonluk `retries` savunmasına ek ikinci katman — `D27` ile aynı aile.)
Ayrıca `ci.yml:1733-1735`'teki "trace/video HİÇ ÜRETİLMEZ" cümlesi düzeltilmeli.

---

## 4. İstenen diğer denetimler

### 4.1 `if: failure()` yan etkisi — **yan etki YOK**

- `ci.yml`'de `upload-artifact` **tek** adımdır (`:1817`); `download-artifact`
  tüm `.github/` ağacında **sıfır** ⇒ hiçbir iş bu artefakta bağımlı değil.
- `test:visual` çıktısı (`-actual/-diff.png`) `apps/*/test-results` altına düşer;
  adımda `continue-on-error` yok ⇒ görsel hata iş durumunu `failure` yapar ve
  artefakt **yine yüklenir**. Teşhis değeri kaybı yok.
- `playwright-report/` bu depoda hiç doğmuyor (html reporter yapılandırılmamış).
- Tek daralma: iş **iptal/timeout** olursa (`cancelled`) artefakt yüklenmez —
  `always()` yüklerdi. Bulgu olarak yazılmadı; teşhis değeri marjinal.

### 4.2 `docs`'un nihai anlatısı — satır satır sınandı

Doğru çıkanlar (doğrudan kaynaktan): `ci.yml:1520` (E2E adımı), `:1626`
(`PLAYWRIGHT_NO_COPY_PROMPT`), `:1815-1824`, `:1816` (`failure()`), `:1822`
(hariç tutma), `:1824` (`retention-days`), `turbo.json:215`,
`run-gates/action.yml:93,143` (redact borusu), `index.js:663` (env erken dönüş),
`workerProcessEntry.js:830-831`, `errorContext.js:44`/`:75`, `expect.js:13339`
(`ExpectError` kurulumu — docs'un tarif ettiği şey için **doğru** atıf;
`ariaSnapshot` alanının kendisi `:12142`). `docs` bayat atıfları gerçekten
düzeltmiş.

Yanlış/bayat kalanlar (hepsi `low`, §3'te listelendi): `a11y.ts:67`'nin
`if: always()` iddiası · `.gitignore:47`'nin `ci.yml:1591` atfı ·
`index.js:666` off-by-one (gerçek `:667`) · `errorContext.js:67-73` (gerçek
`:65-72`; `ci.yml` doğru yazmış, `docs`/ADR bir-iki satır kaymış) ·
`ci.yml:1815` adım adındaki "screenshot" (hiç üretilmiyor).

ADR-0025'in gövdesindeki (`:32`, `:65`, `:159`) `if: always()` / `ci.yml:1558`
atıfları **bulgu değildir** — ADR'nin kendi "Kullanım" kuralı geçmişe dönük
düzenlemeyi yasaklıyor ve `:167-205`'teki "Gözden geçirme notu" madde 3 durumu
doğru anlatıyor (ölçümlerimle birebir uyuşuyor).

### 4.3 `frontend`'in FIX 3 düzeltmesi — **doğru, yeni fail-open YOK**

- `a11y.ts:160-169` docblock'u artık "KISITLI olarak engeller … tek paket
  koşumunda değil, ancak TAM `pnpm test:e2e` koştuğunda kapanır" diyor ve
  dosya başının `:44-56` düzeltmesine atıf veriyor — `:44-56` gerçekten o
  içerik. İddia daraltıldı, davranış değişmedi (yalnızca yorum).
- `a11y-helper-self-test.spec.ts:62,161` artık satır numarası yerine dal metni
  (`İHLAL:` / `BEYAN EDİLMEMİŞ incomplete:`) çapası kullanıyor; iki dize
  `a11y.ts:560` ve `:563`'te **mevcut** ⇒ çapa geçerli. `D29` kapandı.

### 4.4 Tam yüzey taraması

- **Tenant izolasyonu (CLAUDE.md §7, 14 madde):** değişiklik hiçbir tabloya,
  prosedüre, sorguya, kuyruk işine, önbellek/S3/arama anahtarına **dokunmuyor**.
  `git status --porcelain` ölçümü: `apps/*/src` **sıfır**, `packages/themes`
  **sıfır**, `*.prisma`/`*.sql` **sıfır**. Tek `packages/db` dosyası
  `vitest.isolation.config.ts` (test koşucusu ayarı, şema değil).
  ⇒ **Karşılanmayan madde yok; 14 maddenin tamamı bu değişiklik için N/A.**
  Yeni spec'ler fixture temizliğini yapıyor (`deleteFixtureUserByEmail`,
  superadmin'de ayrıca `deletePlatformAuditLogByActor`).
- **Sır yönetimi:** yeni/değişen dosyalarda sabit parola/token/anahtar **yok**;
  `fixtureUser.password` çalışma zamanında üretiliyor ve yalnızca sign-in
  gövdesinde kullanılıyor. `console.*`/`process.stdout` **sıfır eşleşme**.
- **Girdi doğrulama / enjeksiyon / SSRF / dosya / oran sınırı / KVKK / ödeme:**
  bu değişiklikte yüzey yok (test-only).
- **Tedarik zinciri:** `@axe-core/playwright@4.14.0` **tam sürüme pinli**
  (aralık değil), lock'ta `sha512` integrity, tek geçişli bağımlılığı
  `axe-core@4.14.0` **zaten depoda vardı** (ikinci kopya yok), peer
  `playwright-core@1.64.1` karşılanıyor, kök `devDependencies` (hiçbir çalışma
  zamanı paketine girmiyor). Bulgu yok.
- **`guards.sh` / `check_axe_single_source`:** fail-closed (hedef üretilemezse,
  dosya yoksa, jeton `a11y.ts`'ten kaybolursa `return 1`). `.ts`-only kör
  noktası `D27` olarak zaten borçta.

---

## 5. ÖLÇÜMLER

- **`pnpm audit`:** **1 high / 3 moderate / 1 low** (0 critical).
  high = `multer` (DoS, `apps/api` → NestJS üzerinden geçişli);
  moderate/low = `astro` / `@astrojs/node`. **Hiçbiri `@axe-core/playwright`
  veya `axe-core` kaynaklı değil**, hiçbiri bu değişiklikle gelmedi —
  ROADMAP `D26` ile zaten kayıtlı.
- **İncelenen dosya sayısı:** 27 (19 değişmiş + 8 yeni/ilgili; ayrıca
  `playwright@1.64.1` kaynağından 5 dosya ve `@actions/glob` 2 sürüm).
- **Tenant izolasyon listesinden karşılanmayan madde:** **yok** (14/14 N/A —
  çalışma zamanı/DB yüzeyi sıfır, `git status --porcelain` ile ölçüldü).
- **Sentetik koşumlar:** 4 Playwright koşumu + 7 glob koşumu, **hepsi depo
  dışı `/tmp`'te**, yalnızca `page.setContent`; DB/port/oran-sınırı/Docker'a
  dokunulmadı. `pnpm test:e2e`, `pnpm test:isolation`, `pnpm build`
  **koşturulmadı**. Geçici dizinler silindi; depo çalışma ağacı
  **değiştirilmedi** (başlangıç ve bitişte `git status --porcelain` → 32 satır,
  birebir aynı).
- **Yeni kanal sayımı:** 9 kanal tarandı, 1'i (`video.webm`) açık bulundu.

## 6. DOĞRULANAMADI

- **Artefakt indirmenin gerçekten anonim olup olmadığı** bu turda yeniden
  ölçülmedi; `po` R-9 ve `security` tur 1/2'nin tehdit modeli (PUBLIC depo ⇒
  giriş gerektirmeyen indirme) olduğu gibi devralındı. F-A'nın derecesi bu
  varsayıma bağlı; varsayım çürürse derece yeniden değerlendirilmelidir.
- **Gerçek CI koşumunda** `apps/*/test-results` altında video üretilip
  üretilmediği doğrudan gözlenmedi (yalnızca aynı yapılandırmayla sentetik
  olarak üretildi). `qa`/CI koşumu teyit etmeli.
