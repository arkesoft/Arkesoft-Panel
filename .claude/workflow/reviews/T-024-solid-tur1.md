# T-024 — `solid` gate raporu (tur 1)

Tarih: 2026-11-18
Sürüm: ROADMAP v0.0.20.3 (patch, test-only)
Task: `.claude/workflow/tasks/T-024.md`

```
GATE: solid
SONUÇ: PASS
```

FAIL kuralı (AGENT_BASELINE §4): 2 `medium`, 0 `high`, 0 `critical` ⇒ **PASS**.
İki `medium` teknik borca kaydedilir; `low` bulgular tur açmaz.

---

## BULGULAR

### M1 — [SEV: medium] `target[0]` seçicileri `redactAxeDetail()`'den geçmiyor

`scripts/playwright/a11y.ts:348-350` (hedef seçiciler) · `:356` (yalnızca
`failureSummary` redakte ediliyor) · `:360-362` (mesaj birleştirme) · `:288`
(`TARGET_SNIPPET_MAX_LENGTH = 80`) · `docs/testing.md:376-379` (aynı önerme)

**Ölçüm.** Hata mesajı İKİ bağımsız dize kaynağından kuruluyor:

1. `targetSnippets` ← `stringifyFirstTarget(node)` — **redaksiyon YOK**, yalnızca
   80 karaktere kesiliyor.
2. `failureSummary` ← `redactAxeDetail(...)` — e-posta + fixture slug maskeleniyor.

Dosyanın kendi değişmezi (`:50-67`: "mesaj YALNIZCA şu güvenli alanlardan kurulur")
`target[0]`'ı **tanım gereği güvenli** kabul ediyor. Bu önerme kurulu axe-core
sürümünde ölçüldü ve **koşulsuz doğru değil**:

- `node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.js:7940`
  `filterAttributes()` — `ignoredAttributes` (`class`, `style`, `id`, `tabindex`, …)
  DIŞINDAKİ **her** özniteliği, değeri **31 karakterden kısaysa** seçiciye katar.
- `:7914-7931` `getAttributeNameValue()` — `href`/`src` için "friendly URI end"
  son ekini, diğerleri için **ham öznitelik değerini** `ad="değer"` biçiminde
  seçiciye gömer.

⇒ `name`, `value`, `title`, `alt`, `placeholder`, `data-*`, `href`/`src` üzerinden
**31 karakterden kısa** bir kiracı slug'ı / kısa bir e-posta `target[0]`'a birebir
girebilir ve `TARGET_SNIPPET_MAX_LENGTH = 80` onu kesmez. `a11y.ts`'in **kendi**
`FIXTURE_TENANT_SLUG_PATTERN`'i (`:282`) ile eşleşen bir dize bu yoldan maskelenmeden
çıkar — aynı dosya onu diğer yolda (`failureSummary`) maskeliyor.

**Not — mimari karara uygunluk:** uygulama, `architect`'in R5 listesine (`T-024.md:222-225`:
"Mesaj yalnızca: `ruleId`, `impact`, düğüm sayısı, `helpUrl`, ilk 3 `target[0]`…
`failureSummary` → `redactAxeDetail()`") **birebir uyuyor**. Bulgu kararın kendisine
değil, kararın "`target[0]` güvenlidir" **önermesine** karşı ve ölçümle destekli.
Bu yüzden sorumlu ajan uygulayıcı değil `security`/`architect`.

**Önerilen düzeltme:** `targetSnippets`'i de `redactAxeDetail()`'den geçir (tek
kısıtlama noktası), ya da `stringifyFirstTarget`'in çıktısını yalnızca etiket adı +
`nth-child` eksenine indir. Gerekçe yorumu güncellenmeli (`:50-67`, `:327`,
`docs/testing.md:377`) — "güvenli alan" iddiası ölçüme dayanmalı.

**Sorumlu ajan:** `security` (R5 sahibi) + `architect`

---

### M2 — [SEV: medium] Boş-alan doğrulaması `scanName`'e kapsamlı ⇒ tablonun tamamı hiçbir koşumda doğrulanmıyor

`scripts/playwright/a11y.ts:436-438` · `:451-453` (her iki döngüde
`if (entry.scanName !== scanName) { continue }`) · iddia: `:161-170`, `:243-250`,
`:381-385`

**Ölçüm.** `findEmptyFieldError` kontrolü, `expectNoAccessibilityViolations`'ın
**içinde** ve yalnızca **o anda taranan `scanName`'e ait girdiler** üzerinde çalışıyor.
Sonuç: bir girdinin `reason`/`domEvidence` alanının boş olmadığı yalnızca **o
`scanName` gerçekten taranırsa** doğrulanıyor.

Bu, handoff'un işaret ettiği emsalin (`tsc`, `''` için exit 0 veriyordu ⇒ çalışma
zamanı kontrolü eklendi) **aynı sınıftan ikinci bir boşluğu**: çalışma zamanı
kontrolü eklendi ama **koşum kapsamına** bağlandı.

Somut sonuçlar:

- `A11yScanName` (`:105-112`) 7 üye taşıyor; üyeler **üç ayrı Playwright koşumuna**
  dağılmış. `pnpm --filter @arkesoft/admin test:e2e` tek başına koşturulduğunda
  `superadmin-*` / `storefront-*` girdileri **hiç doğrulanmaz**.
- Birleşime bir üye eklenip henüz spec yazılmadıysa, o üyeye ait boş gerekçeli bir
  ack girdisi **hiçbir koşumda** yakalanmaz.
- Aynı koşulluluk "bayat girdi" kontrolü için de geçerli (`:411-415`); dosya başı
  `:38-43` bunu "yapısal olarak imkânsız" diye niteliyor — ölçülen gerçek
  "**koşum kapsamına bağlı**". Yorum fazla iddia ediyor.

Bugün davranışsal hata YOK (ölçüldü: üç ack girdisi de
`admin-account-security-dialog` için ve o tarama `apps/admin/e2e/accessibility.spec.ts:129`'da
koşuyor). Bulgu **gelecek girdiler için zorlanmayan bir invariant**.

**Önerilen düzeltme (ucuz ve kapsam içi):** boş-alan döngülerindeki `scanName`
filtresini kaldır — tablo **bütün olarak** doğrulansın; herhangi bir uygulamanın
herhangi bir taraması tabloyu baştan sona denetler. Bu aynı zamanda 107 satırlık
fonksiyonun iki sorumluluğundan birini (veri bütünlüğü doğrulaması) ayrı bir
fonksiyona taşımak için doğal yer. ⚠ "Bayat girdi" kontrolü doğası gereği
`scanName`'e kapsamlı kalmalı — o filtre KALDIRILMAMALI (kaldırılırsa fail-CLOSED
kontrol yanlış pozitife döner).

⚠ `scripts/` altında Vitest altyapısı **yok** (`scripts/tsconfig.json:9-10`, borç
T3-1) ⇒ `auth-budget.test.ts` emsalindeki "veriyi birim testiyle doğrula" çözümü
bugün **uygulanabilir değil**; yukarıdaki tek satırlık değişiklik uygulanabilir olan.

**Sorumlu ajan:** `frontend` (S1/S5 sahibi)

---

### L1 — [SEV: low] Altı ölü export + dosya başı iddiasıyla çelişki

`scripts/playwright/a11y.ts:25-27` (iddia) vs `:96`, `:105`, `:119`, `:136`, `:157`,
`:191` (gerçek)

Dosya başı: *"`expectNoAccessibilityViolations` dışında **hiçbir fonksiyon/tip export
EDİLMEZ**"*. Ölçüm (repo geneli grep, `**/*.{ts,tsx,sh,json}`): `WCAG_RULE_TAGS`,
`A11yScanName`, `AllowedViolation`, `ALLOWED_VIOLATIONS`, `AcknowledgedIncompleteRule`,
`ACKNOWLEDGED_INCOMPLETE_RULE_IDS` **export edilmiş** ve **hiçbir dosyadan import
edilmiyor** (altısı da yalnızca kendi dosyasında kullanılıyor).

ADR-0025'in bağlayıcı maddeleri ihlal **edilmiyor** (Karar 2/3/5 ham `analyze()`
sonucunun ve `include`/`exclude`/`disableRules`'ün dışarı çıkmamasını şart koşuyor —
bu korunmuş). İhlal edilen, dosyanın **kendi** yazılı iddiası. Depoda
`eslint-plugin-import` olmadığı için (architect ölçtü) ölü export'u yakalayan mekanik
kontrol yok; T-022/`solid`'in "ölü-export" kuralı (T-024.md:211'de atıf) bu sınıf için
konmuştu.

**Önerilen düzeltme:** altı sembolden `export` anahtar kelimesini kaldır **veya**
dosya başı iddiasını "tek dışa açılan **fonksiyon**" olarak düzelt. Borç satırı:
`SEV low · scripts/playwright/a11y.ts:25-27,96,105,119,136,157,191 · ölü export +
yanlış dosya başı iddiası · frontend · vade v0.0.20.5`.

---

### L2 — [SEV: low] `storageStateAfterSignIn` tipi `undefined` olabilirliğini gizliyor

`apps/admin/e2e/accessibility.spec.ts:57` (bildirim) · `:117` (kullanım) ·
karşıtı: `apps/superadmin/e2e/accessibility.spec.ts:53` + `:102-104`

Aynı dosyanın `:53-55` yorumu *"`beforeAll` BAŞARISIZ olursa … `fixtureUser` GERÇEKTEN
`undefined` kalabilir"* diyor ve `fixtureUser`'ı `| undefined` ile bildiriyor (`:56`);
iki satır aşağıdaki `storageStateAfterSignIn` **aynı muhakemeye tabi olduğu hâlde**
`| undefined` taşımıyor ve `:117`'de kontrolsüz kullanılıyor. TypeScript bunu
yakalamaz — kesin-atama analizi kapanış (closure) sınırını geçmez, yani tip burada
çalışma zamanı garantisinden **fazlasını vaat ediyor**. Superadmin spec'i aynı durumu
`| undefined` + açık kontrol + anlamlı hata mesajıyla **doğru** çözmüş; iki kardeş
dosya arasında gerekçesiz asimetri.

Pratik etki bugün sıfır (Playwright `beforeAll` fırlatırsa testleri koşturmaz) ⇒ `low`.

**Sorumlu ajan:** `frontend`

---

### L3 — [SEV: low] Reflow spec'lerinde kapsanan (subsumed) tekrar

`apps/admin/e2e/responsive/sign-in-layout.spec.ts:36-43` vs `:45-50` ·
`apps/storefront/e2e/responsive/home-layout.spec.ts:34-41` vs `:43-48`

Her iki dosyada da `document.body.scrollWidth` **iki kez** okunuyor ve iki kez assert
ediliyor. İkinci blok (`width === 320` + `scrollWidth <= 320`) birincisini
(`scrollWidth <= viewportSize.width`) **tamamen kapsıyor**: viewport 320'ye pinlendiği
assert edildikten sonra birinci assert birebir aynı iddiadır, üstelik daha zayıftır
(gerçek genişlik ne olursa ona göre geçer). Birinci bloğun `viewportSize !== null`
koruması da artık ölü ağırlık.

⚠ **Tekrar sanılmaması gereken şey (ölçüldü, bilinçli olarak işaretlenMEDİ):**
`320` sabitinin spec'lerde literal yazılması ile `scripts/playwright/base.ts:51`'in
`WCAG_REFLOW_VIEWPORT_WIDTH`'i **DRY ihlali değildir** — sabiti import edip
`toBe(WCAG_REFLOW_VIEWPORT_WIDTH)` yazmak testi totolojik yapar ve yanlış bir değeri
**hiç** yakalayamaz. Literal 320 WCAG 1.4.10'un kendi referans değeri; doğru yerde.

**Önerilen düzeltme:** birinci bloğu kaldır (yalnızca AC-23 bloğu kalsın).
**Sorumlu ajan:** `frontend`

---

### L4 — [SEV: low] Öz-test assert'leri "ihlal" ile "beyan edilmemiş incomplete" dalını ayırt etmiyor

`apps/admin/e2e/a11y-helper-self-test.spec.ts:60-62`, `:83-85`, `:154-156` vs
`scripts/playwright/a11y.ts:479` (`İHLAL:` öneki) / `:482`
(`BEYAN EDİLMEMİŞ incomplete:` öneki)

Üç senaryo da yalnızca kural kimliğini (`/color-contrast/`, `/label|button-name/`)
arıyor. Kural kimliği **her iki** dalın mesajında da geçiyor ⇒ (a) senaryosunun
kırmızı olması, ihlalin **ihlal olarak** raporlandığını kanıtlamıyor; (e) senaryosunun
kırmızı olması da bulgunun **`incomplete` olarak** sınıflandığını kanıtlamıyor
(e-senaryosu annotation kontrolüyle bunu kısmen telafi ediyor, a/b etmiyor). Yardımcı
iki sınıfı ayırmak için özellikle iki farklı önek yazıyor; testler o ayrımı
doğrulamıyor.

**Önerilen düzeltme:** (a)/(b)'de `/İHLAL: .*color-contrast/` benzeri, (e)'de
`/BEYAN EDİLMEMİŞ incomplete: .*color-contrast/` deseni kullan.
**Sorumlu ajan:** `frontend`

---

### L5 — [SEV: low] `check_axe_single_source`: `2>/dev/null || true` tarama hatasını "bulgu yok" ile aynılaştırıyor

`scripts/guards.sh:944-946` (yeni) — birebir emsali `:893-895` (mevcut,
`check_playwright_retries_single_source`)

`set -uo pipefail` var ama `-e` yok (`:50`); `outside_matches="$( … | xargs -r grep -ln … 2>/dev/null || true)"`
zincirinde `grep`'in **exit 1** (eşleşme yok, normal) ile **exit 2** (okuma/çalıştırma
hatası) ve `xargs`'ın 127'si **ayırt edilemiyor**; üçü de boş çıktı ⇒ "ihlal yok" ⇒
adım **yeşil**. Bu, AGENT_BASELINE §5'teki üç kez ölçülmüş sınıfın (`2>/dev/null`
hatayı yutar; "komut çıktısızlığı ≠ bulgu yokluğu") aynısı ve kontrolün kendi
fail-closed iddiasıyla (`:938-941`) çelişiyor.

Önem `low` tutuldu, iki gerekçeyle: (1) tetiklenmesi ortam arızası gerektirir,
(2) yapı T-020'de kabul edilmiş emsalden **birebir kopya** — yalnızca kopyayı
düzeltmek iki adımı tutarsız bırakır, ikisi birlikte ele alınmalı.

⚠ **İlave ölçüm (aynı satırlar):** `find apps packages scripts …` (`:935-937`) **göreli**
yol ürettiği için `xargs` bugün güvenli. Biri bunu `"$repo_root/apps"` biçimine
çevirirse bu makinedeki checkout yolu **boşluk içerdiğinden**
(`/Users/kullanici/Desktop/Arkesoft Panel`) `xargs` yolu ikiye böler ve tarama
sessizce bozulur. Göreli yol kullanımı korunmalı (yorum düşülmesi önerilir).

**Sorumlu ajan:** `devops`

---

### L6 — [SEV: low] Kontrolün başarı mesajı kanıtladığından fazlasını iddia ediyor

`scripts/guards.sh:959`

Mesaj: *"hiçbir spec AxeBuilder'ı doğrudan import edip allowlist sözleşmesini baypas
EDEMİYOR."* Kontrolün kanıtladığı şey, `@axe-core/playwright` **jetonunun**
`apps/**`/`packages/**`/`scripts/**` altındaki `*.ts` dosyalarında yalnızca
`a11y.ts`'te geçmesi. Kapsamadıkları (ölçüldü): `axe-core`'un **doğrudan** bir
bağımlılık olarak eklenip `page.addScriptTag`/`page.evaluate` ile enjekte edilmesi.
Bu yol bugün yapısal olarak kapalı — `axe-core` kökte hoist **edilmemiş** (ölçüldü:
yalnızca `node_modules/.pnpm/axe-core@4.14.0/…` altında var) ⇒ yeni bir bağımlılık
beyanı gerekir, o da ayrı bir kapıdır. Yine de mesaj "jeton tek kaynakta" demeli,
"baypas imkânsız" dememeli (deponun kendi "iddia ≠ kapsam" disiplini).

**Sorumlu ajan:** `devops`

---

### L7 — [SEV: low, opsiyonel] `toAllowlistKey` + `Set` gereksiz dolaylama

`scripts/playwright/a11y.ts:238-241`, `:399-415`

`matchedAllowlistKeys` `Set`'i ve `toAllowlistKey()` yardımcısı, bayat-girdi tespiti
için kurulmuş; aynı sonuç doğrudan alınabiliyor:
`ALLOWED_VIOLATIONS.filter(e => e.scanName === scanName && !results.violations.some(v => v.id === e.ruleId))`.
`ALLOWED_VIOLATIONS` bugün **boş** ve ADR-0025 "gözden geçirme koşulu 1" listeyi **iki
girdiyle** sınırlıyor ⇒ `Set` optimizasyonunun ölçülebilir bir faydası yok.

⚠ **Önerinin kendi etkisi ölçüldü** (T-023'ün `in` operatörü regresyonu dersi): iki
biçim mükemmel aynı kümeyi üretir; yinelenen `(scanName, ruleId)` çiftlerinde de
davranış aynıdır; fail-CLOSED yönü **değişmez** (eşleşme bulunamayan girdi yine
bayat sayılır). Prototip zinciri/`in`/anahtar dizgisi semantiği **hiç** devreye
girmiyor.

Yine de fayda düşük ve dokunulan yol fail-closed ⇒ **borç satırı olarak bırakılması,
acele düzeltilmemesi önerilir**. **Sorumlu ajan:** `frontend`

---

## Bulgu OLMAYANLAR (kontrol edildi, bilinçli olarak işaretlenmedi)

1. **Üç `accessibility.spec.ts` arasındaki benzerlik DRY ihlali DEĞİL.** Ortak mantık
   zaten çıkarılmış (`expectNoAccessibilityViolations`). Geriye kalan, her uygulamanın
   **farklı sebeplerle değişecek** parçaları: admin iki oturum + dialog açma
   (`accessibility.spec.ts:65-94`), superadmin 2FA kurulumu + `platform_audit_log`
   temizliği (`:61-80`), storefront sıfır auth + HTTP durum assert'i (`:68-69,87-88`).
   Birleştirmek üç uygulamanın fixture yaşam döngüsünü tek modüle bağlar ve
   `apps/* → apps/*` ithalatı gerektirirdi (CLAUDE.md §3 yasak).
2. **496 satır bölünmemeli.** Ölçüm: `1-72` dosya başı gerekçe yorumu, `191-236` ack
   **verisi**, kalanın yarısı JSDoc. Daha önemlisi `check_axe_single_source`'un
   allowlist'i **tek dosya yolu** (`guards.sh:928`); dosyayı üçe bölmek `home_file`'ı
   listeye çevirmeyi zorunlu kılar ve kapıyı zayıflatır. Bölünmesi gereken şey dosya
   değil, 107 satırlık fonksiyonun **ikinci sorumluluğu** (bkz. M2).
3. **Katman sınırı korunmuş.** `scripts/playwright/a11y.ts` yalnızca `@playwright/test`
   ve `@axe-core/playwright` ithal ediyor; hiçbir `apps/*/e2e/**` bağımlılığı yok.
   `FIXTURE_TENANT_SLUG_PATTERN` (`:272-282`) bilinçli kopya, gerekçesi ve borç kaydı
   (`D23`) dosyada yazılı — `totp.ts` emsaliyle tutarlı. `apps/*/e2e → scripts/playwright`
   göreli ithalatı yerleşik emsal.
4. **`auth-budget.ts` rakamları doğru, gizli ikinci kopya doğmadı.** Elle ölçüldü:
   admin `accessibility.spec.ts` = 1 `sign-up` (`createVerifiedFixtureUser`,
   `helpers/verified-fixture-user.ts:53`) + 2 `sign-in` (`accessibility.spec.ts:75,89`)
   ⇒ `auth-budget.ts:74` `{ signIn: 2, signUp: 1 }` ✅; `a11y-helper-self-test` sıfır ağ
   çağrısı ⇒ `:73` `{0,0}` ✅; superadmin = 1+1 (`platform-admin.ts:168,179`;
   `enableTotpTwoFactor` ek çağrı yapmıyor) ⇒ `:57` ✅. Toplamlar: admin
   `signIn 11/20`, `signUp 8/10`; superadmin `5/20`, `5/10` — `docs/testing.md:357` ile
   birebir aynı.
5. **`reflowMobileDevice` türetimi doğru sınırda.** `base.ts:61-64` yalnızca EKLEME;
   `mobileDevice` (412 px) hem dokunulmamış hem **ölü değil**
   (`apps/storefront/playwright.config.ts:158`).
6. **Hata yönetimi deseni.** Yutulan hata yok; `catch {}` yok; beklenen durum için
   `null` dönülmüyor (`a11y.ts:329-338` `undefined` dalını açıkça ele alıyor,
   `storefront/e2e/accessibility.spec.ts:51-56` `null` dalını fırlatmaya çeviriyor).
   `AppError` hiyerarşisi bu katmanda uygulanmaz (test altyapısı, kullanıcıya dönük
   hata değil) — doğru karar.

---

## DOĞRULANAMADI

- **Hiçbir test koşulmadı** (handoff kısıtı: Playwright/`build` yasak, oran sınırı
  sayacı 12/10 dolu). `pnpm guards`, `pnpm typecheck`, `pnpm lint` **çalıştırılmadı**;
  tip/lint iddiaları statik okumayla kuruldu.
- **M1'in canlı kanıtı alınamadı.** `target[0]`'da gerçekten bir fixture slug'ının
  görüneceği, axe-core kaynağı okunarak (yapısal olarak **mümkün**) gösterildi;
  `apps/*`'ın gerçek DOM'unda böyle bir öznitelik bulunup bulunmadığı **koşumsuz
  ölçülemedi**. Mesaj zaten yalnızca KIRMIZI koşumda üretildiği için pratik sıklık da
  ölçülemedi. `security`/`qa` bunu mutasyonla sınayabilir.
- **`check_axe_single_source`'un gerçek davranışı** (yanlış pozitif/negatif) yalnızca
  kaynak okunarak değerlendirildi; `bash` ile koşturulmadı.

---

## ÖLÇÜMLER

| Ölçüm                              | Değer                                                                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| İncelenen dosya                    | 15 (`a11y.ts`, `base.ts`, 3× `accessibility.spec.ts`, `a11y-helper-self-test.spec.ts`, 2× `auth-budget.ts`, 2× `responsive/*.spec.ts`, 2× `playwright.config.ts`, `guards.sh` §22, `docs/testing.md` §7, ADR-0025) |
| Ek kanıt dosyası                   | 3 (`axe-core@4.14.0/axe.js`, `scripts/tsconfig.json`, `helpers/verified-fixture-user.ts`, `fixtures/platform-admin.ts`)                                                                                            |
| `any` sayısı                       | **0** (grep `\bany\b\|@ts-ignore\|@ts-expect-error\|as [A-Z]\|eslint-disable` → değişen TS dosyalarında tek eşleşme `import type { Response as PlaywrightResponse }`, tip **takma adı**, zorlama değil)             |
| `@ts-ignore` / `@ts-expect-error`  | 0                                                                                                                                                                                                                  |
| Gerekçesiz `as` zorlaması          | 0                                                                                                                                                                                                                  |
| En büyük fonksiyon                 | `expectNoAccessibilityViolations` — `scripts/playwright/a11y.ts:390-496` = **107 satır** (gövde 102)                                                                                                               |
| İkinci en büyük                    | `formatResultSummary` — `:347-363` = 17 satır                                                                                                                                                                     |
| `a11y.ts` bileşimi                 | 496 satır = 72 dosya başı yorumu + 46 ack verisi + kalan JSDoc/mantık                                                                                                                                             |
| Dışa açılan sembol / tüketilen     | 7 / **1** (6 ölü export — L1)                                                                                                                                                                                     |
| Katman ihlali                      | 0                                                                                                                                                                                                                  |
| Döngüsel bağımlılık                | 0                                                                                                                                                                                                                  |
| Çekirdekte sağlayıcı dallanması    | 0 (yok; `if (provider === …)` sınıfı dallanma bu değişiklikte yok)                                                                                                                                                |
| Bulgu dağılımı (c/h/m/l)           | **0 / 0 / 2 / 7**                                                                                                                                                                                                 |
