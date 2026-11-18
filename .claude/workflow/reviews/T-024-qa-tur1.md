# T-024 — `qa` gate — tur 1

Tarih: 2026-11-18 · Sürüm: v0.0.20.3

GATE: qa
SONUÇ: PASS

## BULGULAR

- [SEV: medium] `apps/admin/playwright-annotations.json` (ve `apps/storefront`/`apps/superadmin` eşleniği) — `.gitignore:42-43` yalnızca `playwright-report/` ve `test-results/` dizinlerini kapsıyor; F4'ün CI'da `process.env['CI']` iken yazdığı `playwright-annotations.json` dosyası (üç `playwright.config.ts`) bu listede YOK. `git check-ignore -v apps/admin/playwright-annotations.json` → eşleşme yok, `git status --porcelain` dosyayı `??` (takipsiz) gösteriyor. Dosya test başlıklarını VE başarısız testlerde hata mesajlarını/stack trace'leri taşıyor (ÖLÇÜLDÜ: gerçek bir koşumda superadmin'in annotasyon JSON'u başarısız testlerin tam `Error details` bloklarını içeriyordu). PUBLIC depoda bir `git add -A`/`git add .` bu dosyayı yanlışlıkla commit'leyebilir — F1'in CI artefakt yükleme yolunu kapatma çabasıyla AYNI sınıf bir sızıntı yüzeyini git seviyesinde yeniden açar. Önerilen düzeltme: `.gitignore`'a `playwright-annotations.json` (veya `apps/*/playwright-annotations.json`) eklemek. Sorumlu ajan: devops.
- [SEV: medium] **Flaky — `pnpm test:isolation` (yeni sınıf, bilinen iki flake'ten AYRI).** İlk koşum: `@arkesoft/api:test:isolation` `Startup Error: ENOTEMPTY: directory not empty, rmdir '…/node_modules/.vitest-cache'` ile exit 1 verdi (dosya içeriği/test mantığı değil, vitest'in önbellek dizinini silme/oluşturma arasındaki bir dosya sistemi yarışı). Aynı komutun İKİNCİ koşumu (hiçbir dosya değişmeden) 11/11 görev, `@arkesoft/db` 9 dosya/86 test + `@arkesoft/api` 6 dosya/31 test, tamamı yeşil. Bu, `docs/testing.md` §1'de kayıtlı **iki bilinen flake** (test:isolation ~%6.7 oranı, `two-factor-acceptance-ac3-backup-code-single-use.test.ts`) sınıfından **FARKLI** bir kök neden (dosya sistemi/önbellek yarışı, test içeriği değil) — kapatılmıyor, teknik borca kaydediliyor, susturulmuyor. Sorumlu ajan: devops (vitest önbellek/çalışma dizini izolasyonu).
- [SEV: low] **F1'in "dosya hiç doğmaz" iddiası aşırı iddialı.** `ci.yml` ve `scripts/playwright/a11y.ts` dosya başı yorumları `PLAYWRIGHT_NO_COPY_PROMPT=1` için *"dosya hiç doğmaz"* diyor — ÖLÇÜLDÜ: `error-context.md` dosyasının KENDİSİ **hâlâ doğuyor** (çünkü `buildErrorContext()` `meaningfulErrors.length>0` tek başına dosyayı üretmeye yeterli görüyor, `errorContext.js:44`), yalnızca PII taşıyan **"# Page snapshot"** bölümü (tam sayfa ARIA ağacı) env değişkeniyle bastırılıyor (`playwright/lib/index.js:662-680`'in `_takePageSnapshot()`'ı). Güvenlik özelliği GERÇEKTEN çalışıyor (PII sızmıyor — iki yönlü ölçüldü, aşağıya bkz.), ama yorum metni "dosya" ile "PII bölümü"nü birbirine karıştırıyor; ileride biri "dosya yoksa risk yok" diye başka bir alanı (örn. `Error details`) genişletip aynı kanalı yeniden açabilir. Önerilen düzeltme: yorumu *"PII taşıyan sayfa anlık görüntüsü bölümü doğmaz, dosyanın kendisi (PII içermeyen Error details/Test source ile) doğabilir"* şeklinde düzeltmek. Sorumlu ajan: devops (ci.yml) + frontend (a11y.ts, aynı cümle kalıbı orada da var).

## DOĞRULANAMADI

- **AC-19/AC-20 — superadmin'in oturum-içi sayfası (`superadmin-dashboard` scanName, `/` sidebar).** Yerel sandbox kısıtı (port 5173/5174 kullanıcının kendi oturumu, DOKUNULMADI) `ARKESOFT_SUPERADMIN_E2E_PORT=5274` kullanmayı GEREKTİRDİ. Bu, `apps/superadmin/e2e/fixtures/platform-admin.ts:82`'nin HARDCODED `SUPERADMIN_TRUSTED_ORIGIN = 'http://superadmin.arkesoft.localhost:5174'`'ü (TOTP `enable`/`verify-totp` çağrılarının `Origin` başlığı) ile `apps/api/src/auth/trusted-origins.ts`'in **TEK** `SUPERADMIN_BASE_URL` yuvasıyla çakıştı: `SUPERADMIN_BASE_URL=…:5174` verilince (fixture'ı tatmin etmek için) GERÇEK tarayıcı sayfası (`:5274`de render olan) kendi `Origin: …:5274` başlığını taşıyan istekler için `SameOriginGuard` tarafından reddedildi → React `ErrorBoundary` devreye girdi ("Bir şeyler ters gitti"), "Mağazalar" başlığı HİÇ render olmadı. ⚠ **Bu T-024'ün YENİ bir regresyonu DEĞİL** — AYNI çakışma, AYNI çalıştırmada, T-024'TEN BAĞIMSIZ DÖRT ÖNCEDEN VAR OLAN spec'i de (`superadmin-authz.spec.ts` AC-4(a), `sidebar-focus-return.qa.spec.ts` (2 test), `superadmin-flow.spec.ts` AC-7, `two-factor-setup-reload.spec.ts`) AYNI şekilde düşürdü — beşi de `enableTotpTwoFactor`'ü (AYNI hardcoded Origin) kullanıyor. Bu, ROADMAP'in zaten kayıtlı `D22` borcunun (mimari, T-024, vade v0.0.21, sorumlu frontend) TAM OLARAK öngördüğü senaryo — "T-024'ün keşif koşumu ve S6 ikisi de bu yüzden çift-orijinli API kurmak zorunda kaldı" notu bunu doğruluyor; `trusted-origins.ts` TEK superadmin orijini desteklediği için (ÖLÇÜLDÜ, kod okundu) iki farklı port AYNI ANDA karşılanamıyor. ⚠⚠ Port 5174'ü kullanmak (kullanıcının oturumu [::1]:5174'e BAĞLI, 127.0.0.1:5174 BOŞ olsa da) brief'in mutlak yasağını ihlal ederdi — denenmedi.
  - **Elde edilen kısmi kanıt:** aynı koşumda `accessibility.spec.ts`'in OTURUMSUZ testi (`/giris`, `scanName: superadmin-sign-in`) **geçti** (0 ihlal) — bu AC-20'nin altı sayfasından birini doğrudan doğruluyor. Diğer beş sayfa (admin ×2, storefront ×2) **tam** koşumda doğrulandı (aşağıya bkz).
  - **Öneri:** Orkestratör'ün gerçek CI koşumunda (varsayılan portlar, çakışma yok) superadmin'in 9 testinin TAMAMININ yeşil olduğunu teyit etmesi — mimarinin keşif ölçümü (`0/6 sayfa` ihlal, dashboard dahil) buna zaten GÜÇLÜ bir ön-kanıt sağlıyor.
- **AC-19 toplam sayı (superadmin ≥9):** **sayı** doğrulandı (9 test TOPLANDI/koştu), ama **yeşil** doğrulanamadı (3 geçti/6 başarısız, hepsi yukarıdaki nedenle).

## KABUL KRİTERİ EŞLEMESİ

| AC | Kriter (özet) | Test / komut | Sonuç |
| --- | --- | --- | --- |
| AC-19 | `test:e2e` yeşil, 3 uygulamada axe koşar, toplam ≥52 (admin≥26/superadmin≥9/storefront≥17) | `pnpm test:e2e` (CI=1, iki apps/api süreci) | **admin 31/31 ✓** · **storefront 17/17 ✓** · **superadmin 9 koştu, 3/9 geçti** (bkz. DOĞRULANAMADI) · toplam koşan=57≥52 |
| AC-20 | 6 sayfada `violations.length===0`, etiket kümesi wcag2a/aa/21a/21aa, allowlist boş | Yukarıdaki koşum + `scripts/playwright/a11y.ts` okuması | admin /sign-in ✓ · admin dialog ✓ (3 incomplete ack ile) · storefront home ✓ · storefront 404 ✓ · superadmin /giris ✓ · superadmin dashboard **DOĞRULANAMADI** (yerel env). `ALLOWED_VIOLATIONS=[]` (kod okundu) ✓ |
| AC-21 | `incomplete` kırar YA DA adlandırılmış raporlanır, sessizce yutulmaz | `a11y-helper-self-test.spec.ts` testi (e) (31 içinde) + gerçek admin dialog taraması + `apps/admin/playwright-annotations.json` (CI=1) üzerinde gerçek `jq` | ✓ — annotation'lar `a11y-incomplete` tipinde, 4 açıklama (`admin-account-security-dialog/aria-hidden-focus × 3` dahil) gerçek dosyada doğrulandı; `ci.yml`'nin `jq` ifadesi GERÇEK dosyada çalıştırıldı, exit 0, doğru satırları çıkardı |
| AC-22 | 4 assert (kontrast/etiket → kırmızı+mesaj; geri alınca → 0), elle mutasyon yok | `a11y-helper-self-test.spec.ts` (a)-(d), admin-desktop 31 içinde | ✓ hepsi geçti (5 test — (a)-(e)) |
| AC-23 | `viewportSize().width===320` test içinde assert + `scrollWidth<=320` | `responsive/sign-in-layout.spec.ts` (admin-mobile, 1 test) + `responsive/home-layout.spec.ts` (storefront-mobile, 1 test) | ✓ ikisi de geçti (annotasyon JSON'da `admin-mobile`:1, `storefront-mobile`:1 doğrulandı) |
| AC-24 | `storefront-visual-mobile` viewport DEĞİŞMEDİ, `test:visual` yeşil, PNG değişmedi | `pnpm test:visual` + `git status --porcelain \| grep .png` | ✓ 4/4 görsel test geçti, `.png` değişiklik sayısı = 0 |
| AC-25 | `guards` 22 adım yeşil, `signUp=8`(admin)/`signUp=5`(superadmin), `docs/testing.md` eksenleri listeler | `pnpm guards` | ✓ 22/22 PASS, çıktıda `apps/admin: signIn=11/signUp=8` ve `apps/superadmin: signIn=5/signUp=5` BİREBİR geçti; `docs/testing.md` **sekiz** eksen listeliyor (T-024.md'nin ön-keşif metni "yedi" diyordu — h1/`page-has-heading-one` ekseni keşifte SONRADAN bulundu, `D21` borcuyla kayıtlı; docs bunu doğru şekilde SEKİZE genişletti — bu bir hata değil, planlamanın gerçekle güncellenmesi) |

**Ayrıca (F1-F4 ampirik doğrulama — security tur1 düzeltmeleri):**

| Düzeltme | Yöntem | Sonuç |
| --- | --- | --- |
| F1 (PLAYWRIGHT_NO_COPY_PROMPT) | `a11y-helper-self-test.spec.ts`'e GEÇİCİ bir mutasyon testi eklendi (düz `Error` fırlatan, `.rejects` SARMALAYICISIZ çağrı) → `npx playwright test` İKİ YÖNDE koşturuldu, SONRA mutasyon `/tmp` yedeğinden birebir geri alındı (`diff -q` ile doğrulandı, `git status --porcelain` o dosya için yalnızca orijinal `??` durumunu gösterdi) | **Env OLMADAN:** `error-context.md` doğdu VE "# Page snapshot" bölümü enjekte edilen e-postayı/slug'ı ÇIPLAK gösterdi. **Env İLE (`PLAYWRIGHT_NO_COPY_PROMPT=1`):** dosya YİNE doğdu (bkz. yukarıdaki `low` bulgu) ama "# Page snapshot" bölümü TAMAMEN YOKTU — PII kanalı KAPALI. Gerçek full-suite koşumunda da (superadmin'in 6 başarısız testi) hiçbir `error-context.md` sayfa-çapında PII taşımadı (matcher hatalarının KENDİ dar `errorContext`'i hariç — bu F1'in hedefi DEĞİL, Playwright'ın ayrı/önceden var olan bir mekanizması) |
| F2 (`target[0]` redaksiyonu) | Aynı dosyaya GEÇİCİ mutasyon testi: iki etiketsiz `input`, biri `data-qa-marker="qamark@example.test"` taşıyor (axe'ın seçiciyi disambiguation için bu özniteliği GÖMMESİNİ zorlamak için) → hata mesajı doğrudan yakalanıp assert edildi, SONRA mutasyon geri alındı | ✓ mesaj ham `qamark@example.test`'i TAŞIMIYORDU, `***@***` İÇERİYORDU — redaksiyon `target[0]` üzerinde GERÇEKTEN çalışıyor |
| F3 (`staleAcknowledgedEntries` yanlış pozitif vermemeli) | Gerçek `admin-account-security-dialog` taraması (mutasyon DEĞİL, gerçek dialog) tam suit koşumunda çalıştırıldı | ✓ 0 unexpected — 3 `ACKNOWLEDGED_INCOMPLETE_RULE_IDS` girdisinin (`aria-hidden-focus`, `color-contrast`, `label-content-name-mismatch`) HEPSİ gerçek `incomplete` bulgularıyla eşleşti, BAYAT uyarısı YOK |
| F4 (annotasyon JSON + `jq`) | `CI=1` ile gerçek `pnpm test:e2e` koşumu, SONRA `ci.yml:1622` civarındaki `jq` ifadesi BİREBİR gerçek `apps/admin/playwright-annotations.json` üzerinde elle çalıştırıldı | ✓ dosya gerçek `stats` taşıyordu (`expected:31,unexpected:0`), `jq` exit 0, 4 doğru `a11y-incomplete` açıklaması çıkardı |

## ÖLÇÜMLER

**TEST SAYILARI:**
- `pnpm test:e2e` (CI=1, PLAYWRIGHT_NO_COPY_PROMPT=1, iki apps/api süreci — 3100/DB1, 3101/DB2; portlar 5273/5274/5184): admin **31 passed**, storefront **17 passed**, superadmin **3 passed / 6 failed** (DOĞRULANAMADI nedeniyle, yukarı bkz.) — toplam koşan **57**.
- `pnpm test`: **21/21 görev**, **2135 test** geçti (api 842, db 272, trpc 145, admin 185, storefront 126, theme-sdk 225, versioning 82, tenancy 100, errors 54, ui 23, superadmin 76, themes-modern 5).
- `pnpm test:isolation`: 1. koşum FAIL (`ENOTEMPTY`, flake — yukarı bkz.), 2. koşum **11/11 görev**, **117 test** geçti (db 86, api 31).
- `pnpm test:visual`: **10/10 görev**, **4/4 görsel test** geçti.
- `pnpm guards`: **22/22 adım PASS**.

**KOŞTURULAN KOMUTLAR:**
| Komut | Exit | Özet |
| --- | --- | --- |
| `pnpm lint` | 0 | 23/23 görev |
| `pnpm typecheck` | 0 | 23/23 görev |
| `pnpm build` | 0 | 14/14 görev |
| `pnpm guards` | 0 | 22/22 adım, `signUp=8`/`signUp=5` birebir |
| `pnpm test` | 0 | 21/21 görev, 2135 test |
| `pnpm test:isolation` (1. koşum) | 1 | `ENOTEMPTY` flake (medium bulgu) |
| `pnpm test:isolation` (2. koşum) | 0 | 11/11 görev, 117 test |
| `pnpm test:e2e` (1. koşum, kesinti — stream arızası) | — | admin webServer timeout (0 test koştu, 0 bütçe harcandı), superadmin kısmen koştu (kesildi) |
| `pnpm test:e2e` (2. koşum, tam) | 1 | admin 31✓/storefront 17✓/superadmin 3✓-6✗ (env kısıtı) |
| `pnpm test:visual` | 0 | 4/4 görsel test, 0 PNG değişikliği |
| `npx playwright test a11y-helper-self-test.spec.ts` (F1 env'siz) | 1 (beklenen) | error-context.md DOĞDU, Page snapshot PII taşıdı |
| `npx playwright test a11y-helper-self-test.spec.ts` (F1 env'li) | 1 (beklenen) | error-context.md doğdu, Page snapshot YOK |
| `npx playwright test a11y-helper-self-test.spec.ts --grep F2` | 0 | redaksiyon doğrulandı |
| `jq` (F4, gerçek dosya) | 0 | 4 açıklama doğru çıkarıldı |

**Ortam notu:** sakin makine, `docker ps` 5 konteyner (arkesoft-*) + kullanıcının kendi oturumları (port 3000/5173/5174, dokunulmadı). Redis DB1/DB2 öncesi ~2 anahtar, sonrası 27/26 — oran sınırı bütçesi ikisinde de güvenli kaldı (`signUp` admin tarafında hiç kullanılmadı test:e2e dışında; superadmin tarafında 3-5 `signUp` kullanıldı, sınır 10).
