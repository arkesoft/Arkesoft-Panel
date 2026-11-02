T-010 — qa — GATE TUR 1 — 2026-11-02 — v0.0.9 (packages/theme-sdk)

GATE: qa
SONUÇ: PASS

BULGULAR:
  - [SEV: medium] `src/settings/zod-issue-mapping.ts:94` (`themeContractIssuesFromUnrecognizedKeys`) — AC4'ün kendi dosya başı yorumu "bir `unrecognized_keys` issue'su BİRDEN FAZLA anahtar taşıyabilir, her anahtar KENDİ issue'suna genişletilir (`flatMap`)" diyor ama **tüm 99 test** bu dalı yalnızca TEK bilinmeyen anahtarla (`"tempaltes"`) tetikliyor. Mutasyonla doğrulandı: `issue.keys.map(...)` → `issue.keys.slice(0,1).map(...)` (ikinciden sonraki tüm bilinmeyen anahtarları sessizce düşür) yapıldığında **99 testin hepsi yeşil kaldı**. Bir tema yazarı theme.json'ına İKİ yazım hatası birden yazarsa (`"tempaltes"` + `"setttings"`) bugünkü kodun ikisini de rapor ettiği doğru ama bunu kanıtlayan bir test yok — regresyon sessizce geçer. Önerilen düzeltme: `validate-manifest.test.ts`'e aynı anda ≥2 bilinmeyen kök anahtar taşıyan bir vaka + `result.issues`'ın HER İKİSİNİ de (path bazında) içerdiğini `toEqual`/`toContainEqual` ile pinleyen bir test. Sorumlu ajan: backend (test S5/S3 kapsamında, mevcut testi genişletir).
  - [SEV: medium] `src/manifest/__tests__/templates.test.ts:53-59` ("yalnızca 404 eksikse (home var) YİNE THEME_TEMPLATE_MISSING döner") — test başlığı belirli bir kodu (`THEME_TEMPLATE_MISSING`) iddia ediyor ama gövde yalnızca `result.success === false` ölçüyor, kodu DEĞİL (komşu satır 36-51'deki ilk test code+params'ı doğru ölçüyor, bu ikincisi ölçmüyor). Mutasyonla doğrulandı: `THEME_TEMPLATE_MISSING_CODE` sabiti `'THEME_TEMPLATE_UNKNOWN'`'a değiştirildiğinde iki komşu test (templates.test.ts:36 ve validate-manifest.test.ts:201) kırmızıya düştü ama BU test (templates.test.ts:53) yeşil kaldı — başlığının iddia ettiği şeyi KANITLAMIYOR. "Hata varlığını ölçüp kodunu ölçmeyen" ailesinin yeni bir örneği (T-009'da bulunan `status()` eşitlik örneğiyle aynı sınıf). Önerilen düzeltme: bu `it` bloğuna da `issue`'nun `THEME_TEMPLATE_MISSING` kodunu taşıdığını doğrulayan assertion eklenmeli (ilk testteki desenin birebir tekrarı). Sorumlu ajan: backend (S5).
  - [SEV: low] `src/manifest/__tests__/validate-manifest.test.ts:156-167` ("migrate alanı fonksiyon değilse… reddedilir") — yalnızca `result.ok === false` ölçer, fallback kodun (`THEME_MANIFEST_INVALID`, architect'in belgelediği karar) GERÇEKTEN üretildiğini ölçmez. Komşu "version biçimi" testi (satır 144-154) AYNI fallback senaryosu için kodu doğru ölçüyor — bu testte tutarsızlık var. Birincil kusuru (migrate-doğrulamasının hiç çalışmaması) hâlâ yakalar (`ok` yanlış olurdu), bu yüzden `medium` değil `low` — yalnızca ikincil detay (kod) pinlenmemiş. Vade: v0.0.9 borç tablosu. Sorumlu ajan: backend.

ÖLÇÜMLER:

KABUL KRİTERİ EŞLEMESİ:
AC1 (→S2, 15 kod+ThemeContractIssue+ayrımlı birleşim+satisfies Türkçe mesaj) → `errors.test.ts`(3) + `messages.test.ts`(2) + `paths.test.ts`(7) + `assert-never.test.ts`(1) → GEÇTİ, `satisfies Record<...>` pini TS1360 mutasyonuyla BAĞIMSIZ doğrulandı.
AC2 (→S9, CI tutarlılığı + test adıyla görünür) → `pnpm test`/`turbo run test` gerçek koşum → GEÇTİ: `@arkesoft/theme-sdk:test` kendi adıyla listelendi, `vitest run` (flag'siz, `--passWithNoTests` YOK), 15 dosya/99 test; paket toplamları (23+39+48+99+37+66+32+166+312) = **822** — ROADMAP/handoff'un iddia ettiği sayı birebir teyit edildi. `ci.yml` diff'i ayrı `theme-sdk` job'u + `ci-gate.needs` listesine eklendiğini doğruladı.
AC3 (→S5+S3, path+code+Türkçe mesaj) → `validate-manifest.test.ts` "AC3" bloğu + `validate-settings.test.ts` "AC3" bloğu → GEÇTİ, `toBe` ile tam path/mesaj/kod eşleşmesi (totolojik değil, gerçek path hesaplanıyor).
AC4 (→S5, manifest strictObject REDDET) → `validate-manifest.test.ts:58-79` + `asset-ref.test.ts` strictObject testi → GEÇTİ TEK anahtar için; ÇOK anahtar (flatMap) dalı BULGU #1'de not edildi.
AC5 (→S3, SOY ama RAPORLA) → `validate-settings.test.ts` "AC5" bloğu(2) → GEÇTİ (kök seviye); `group` içinde SOY-ama-RAPORLA'nın tutmadığı zaten solid'in medium bulgusu (#6) — test dosyasında `group` içeren TEK bir `validateThemeSettings` vakası yok, bu solid'in bulgusunun test-kapsamı yüzü, tekrar yazılmadı.
AC6 (→S3, prototip kirliliği 2 katman) → `primitives.test.ts` "katman 1"(3) + `validate-settings.test.ts` "katman 2"(1) + `migration-run.test.ts` "sessiz başarısızlık katman 2"(1) + `define-theme.test.ts` "katman 1 defineTheme yolunda"(1) → her biri GEÇTİ ve iddia ettiğini ölçüyor (referans-eşitsizliği ikinci assertion'ıyla "yanlış nedenle yeşil" riski bilerek kapatılmış). Ancak testlerin TÜMÜ `defineTheme()`/`validateThemeManifest()`/`validateThemeSettings()` GİRİŞ NOKTALARINDAN geçiyor — security'nin high bulgusu (#5: `defaults.ts`/`schema-from-definitions.ts`/`validate-settings.ts`'e DOĞRUDAN `{key:'__proto__'}` tanımı verildiğinde katman-1 devre dışı) tam olarak bu üç modülü DOĞRUDAN (üst katman doğrulaması atlanarak) çağıran bir test YOK olduğu için sessiz kalıyor — test-kapsamı yüzü security'nin bulgusuyla BİREBİR örtüşüyor, ayrı bulgu açılmadı.
AC7 (→S4, eksik hedef major) → `migration-chain.test.ts` "AC7" bloğu(2) → GEÇTİ, `toEqual` tam issue object. `0.x` boşluğu testsiz (solid'in low'u) — tekrar yazılmadı.
AC8 (→S4, gap/duplicate/cycle — 3 ayrı kod 3 ayrı test) → `migration-chain.test.ts` 3 ayrı `describe` → GEÇTİ, her biri `issues.length===1` + tam `toEqual` ile komşu koda sızmadığını kanıtlıyor — bu AC'nin kendi DoD'u zaten bu titizliği istiyordu, karşılandı.
AC9 (→S6, migrate() çıktısı hedef şemadan geçmeli) → `migration-run.test.ts` AC9 bloğu(1) + "fırlatırsa" bloğu(1) → GEÇTİ, path+code ikisi de ölçülüyor. `structuredClone` try-dışı kusuru (solid #4) klonlanamaz girdi (ör. fonksiyon/Symbol taşıyan bir `settings`) ile TETİKLENEBİLİR bir senaryo — böyle bir test YOK, bu solid'in bulgusunun test-kapsamı yüzü, tekrar yazılmadı.
AC10 (→S8, defineTheme + 8 ilkelin TAMAMI) → `define-theme.test.ts` → GEÇTİ, `Set` eşitliği ile "sessizce atlanamaz" garantisi var. 9. ilkel eklenirse testin kör kalması (solid'in low'u) — tekrar yazılmadı.
AC11 (→S5, 7 şablon + zorunlu küme) → `templates.test.ts` + `validate-manifest.test.ts` şablon blokları → GEÇTİ ÇOĞUNLUKLA; BULGU #2 bu AC'nin bir testinin (missing-404-only) zayıf olduğunu gösteriyor.
AC12 (→S7, JSON Schema docs, bayt-birebir) → `contract-schema.test.ts`(3) + `pnpm format:check` gerçek koşum → GEÇTİ, mutasyonla (`docs/theme-contract.schema.json`'a tek karakter) BAĞIMSIZ doğrulandı: tam olarak 1 test kırmızı oldu (`bellekte yeniden üretilen şema... bayt-birebir eşleşir`), diğer 2 testi etkilemedi (ayırt edicilik kanıtlandı).
AC13 (→S2+S5+S8, saflık+servis-URL-yok+özyineleme öz-ölçümü) → `purity.test.ts`(4) + `no-service-url-fields.test.ts`(1) → GEÇTİ, `recursive:true` mutasyonuyla BAĞIMSIZ doğrulandı: tam olarak 1 test (öz-ölçüm) kırmızı oldu, diğer 3'ü (yasaklı dizgi/dependencies/json-schema.ts kapsamı) etkilenmedi. `no-service-url-fields.test.ts`'in heuristik zayıflığı (computed property kaçırabilir) solid'in low'u — tekrar yazılmadı.
AC14 (→S11, changeset+sürüm) → **ölçülemedi** — S11 henüz koşmadı (Task dosyasında "TODO"). `pnpm release:version` sonrası `git diff package.json`'da `"version"` satırı olmaması gerektiği (R-F) ileride doğrulanacak.

MUTASYON KANITLARI (4/4 bağımsız doğrulandı, tamamı geri alındı):
1. `messages.ts` satır 47 silindi → `pnpm typecheck` → `src/messages.ts(65,3): error TS1360` (+ kademeli TS2339/TS7053 aynı kök nedenden) → GERİ ALINDI.
2. `docs/theme-contract.schema.json` `$schema` değerine tek harf (`X`) eklendi → `pnpm --filter theme-sdk test` → TAM OLARAK 1 test kırmızı (`bayt-birebir eşleşir`), diğer 2 contract-schema testi (migrations-yok, templates-enum) etkilenmedi → AYIRT EDİCİ, GERİ ALINDI.
3. `purity.test.ts`'te `readdirSync(SRC_DIR, { withFileTypes: true, recursive: true })` → `{ withFileTypes: true }` → TAM OLARAK 1 test kırmızı, mesaj birebir iddia edilen `"expected 0 to be greater than 0"` → diğer 3 purity testi (yasaklı dizgi, dependencies, json-schema.ts kapsamı) etkilenmedi çünkü düz `src/` dosyaları hâlâ bulunuyor → AYIRT EDİCİ, GERİ ALINDI.
4. `migrations/run.ts` satır 108 `let current: unknown = structuredClone(settings)` → `let current: unknown = settings` → TAM OLARAK 1 test kırmızı (`migrate() kendi aldığı değeri yerinde mutasyona uğratsa bile orijinal girdi parametresi değişmez`), `toEqual(inputSnapshot)` başarısızlığı `mutatedByMigrate:true` sızıntısını gösterdi → AYIRT EDİCİ, GERİ ALINDI.
Her mutasyon sonrası `mv <dosya>.bak <dosya>` ile geri alındı; nihai `git status --short packages/theme-sdk docs/` çıktısı mutasyon denemeleri ÖNCESİYLE birebir aynı (yalnızca orijinal üretim turunun `M`/`??` satırları, hiçbir `.bak`/stray diff yok).

EK MUTASYON (qa'nın kendi bulgusu için kanıt, geri alındı):
5. `zod-issue-mapping.ts`'te `issue.keys.map(...)` → `issue.keys.slice(0,1).map(...)` → **99/99 test YEŞİL kaldı** (bkz. BULGU #1).
6. `templates.ts`'te `THEME_TEMPLATE_MISSING_CODE` değeri `'THEME_TEMPLATE_UNKNOWN'`'a değiştirildi → 2 test kırmızı (templates.test.ts:36, validate-manifest.test.ts:201), templates.test.ts:53 YEŞİL kaldı (bkz. BULGU #2).
İkisi de `mv <dosya>.bak <dosya>` ile geri alındı, `git status --short` temiz.

FLAKY + SUSTURMA:
- `test.skip`/`test.todo`/`it.skip`/`describe.skip` → **grep 0 sonuç**, `packages/theme-sdk/src/**/*.test.ts`.
- `--passWithNoTests` → **grep 0 sonuç** `packages/theme-sdk` içinde (`package.json`'daki `test` scripti düz `vitest run`; `admin`/`storefront`/`ui` paketleri bu bayrağı taşıyor ama S1'in DoD'u theme-sdk için bunu açıkça yasaklamıştı — teyit edildi).
- theme-sdk süiti **4 kez** koşuldu (3'ü "kararlılık" için istenen, +1 `turbo run test --concurrency=1` içinde): 99/99, 15/15 dosya, sonuçlar BİREBİR aynı her koşumda. Süre: 419ms–488ms (doğrudan `pnpm --filter` koşumları) / 970ms (turbo cache-bypass, transform dahil) — CI maliyeti açısından ihmal edilebilir (`perf` gate bu sürümde atlandı, gözlem bilgi amaçlı).

TEST SAYILARI: yeni eklenen (qa tarafından) 0 — qa test YAZMAZ, kapsam ölçer · toplam geçen 99/99 (theme-sdk) · toplam geçen (monorepo) 822/822 · toplam başarısız 0.

KOŞTURULAN KOMUTLAR:
- `pnpm --filter @arkesoft/theme-sdk lint` → exit 0, çıktısız (temiz).
- `pnpm --filter @arkesoft/theme-sdk typecheck` → exit 0, çıktısız (temiz).
- `rm -rf dist && pnpm --filter @arkesoft/theme-sdk build` → exit 0, 7 `.js` çıktı üretildi (temiz ağaçtan).
- `pnpm --filter @arkesoft/theme-sdk test` → exit 0, 3 ayrı koşum, hepsi 15/15 dosya · 99/99 test.
- `npx turbo run test --concurrency=1` (Orkestratörün talimatı, `apps/api` flaky uyarısı dikkate alındı) → 16/16 görev başarılı, 7 cache + 9 gerçek koşum, theme-sdk 15/15·99/99 kendi adıyla göründü, `apps/api` 42/42·312/312 bu koşumda flaky DEĞİLDİ (bu sürüme atfedilmeyecek borç, teyit amaçlı koşuldu).
- `pnpm format:check` (yalnızca `--check`, dosya değiştirilmedi) + `npx prettier --check docs/theme-contract.schema.json` → ikisi de temiz.
- `pnpm --filter @arkesoft/theme-sdk test:isolation` → bu paket için script YOK ("komut bu sürümde henüz yok" — paket DB'ye gitmiyor, tasarım gereği tenant izolasyonu maddesi uygulanabilir değil, architect'in "Zorunlu alanlar" notuyla tutarlı).
- `pnpm --filter @arkesoft/theme-sdk test:e2e` → bu sürümde yok (UI yüzeyi sıfır, mimari kararla tutarlı).
- 4+2 mutasyon denemesi (yukarıda ayrıntılı) — tümü `mv <dosya>.bak <dosya>` ile geri alındı, `git status --short` mutasyonlar öncesiyle birebir eşleşti.

SONUÇ GEREKÇESİ: 2 `medium` + 1 `low` bulgu → AGENT_BASELINE §4 tablosu "1–2 medium → PASS (borca kaydedilir)" kuralına girer. `critical`/`high` yok. qa'nın kendi SONUCU bağımsızdır; security ve solid'in kendi FAIL sonuçları bu rapora dahil edilmedi (tekrarlanmadı), Orkestratör'ün genel karar toplamı ayrı bir adımdır.
