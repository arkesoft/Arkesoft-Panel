// @arkesoft/storefront — Playwright yapılandırması (ROADMAP v0.0.8, T-009/S9,
// qa; v0.0.19, T-020/S6, ADR-0022 K3/K4/K5 — proje matrisi + görsel
// regresyon RESMÎLEŞTİ)
//
// v0.0.19 ÜÇ DEĞİŞİKLİK (eski "TEK proje" asgarisinin YERİNE):
// (1) DÖRT adlandırılmış proje, DİZİN tabanlı ayrım (`--grep` YASAK, ADR
//     Karar 3): `storefront-desktop`/`storefront-mobile` (DEV sunucusu,
//     `:4321`, auth TÜKETMEYEN — storefront'ta hiç auth ucu YOK, `po`'nun
//     A-PO-3'ü) ve `storefront-visual-desktop`/`storefront-visual-mobile`
//     (ÜRETİM derlemesi, `:4322`, ADR Karar 5).
// (2) `scripts/playwright/base.ts`'in (S4) TEK ÇAĞRISI ile tüketildi —
//     ⚠⚠ İKİNCİ bir native `defineConfig(taban, kendi)` birleştirmesi YOK
//     (S4'ün bağlayıcı kısıtı: native merge `expect`/`use` için SIĞ, ikinci
//     çağrı `animations`/`caret`/`scale` varsayılanlarını SESSİZCE ezer).
// (3) `snapshotPathTemplate` platform soneki (`{-snapshotSuffix}`) TAŞIMAZ
//     (ADR Karar 4, "tek kanonik set") — Playwright'ın VARSAYILANI
//     (`{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}
//     {-projectName}{-snapshotSuffix}{ext}`, ÖLÇÜLDÜ:
//     `node_modules/.../playwright/lib/worker/workerProcessEntry.js:1255`)
//     `{-projectName}` BÖLÜMÜNÜ KORUR (desktop/mobile PNG'lerini ayırt
//     etmek için GEREKLİ), yalnızca `{-snapshotSuffix}` (host işletim
//     sistemi) KALDIRILDI — tüm görsel koşumlar pinli Linux konteynerde
//     (ADR Karar 4) çalıştığı için bu segment GEREKSİZ VE RİSKLİ: biri
//     yanlışlıkla Docker DIŞINDA (macOS'ta) `--update-snapshots`
//     çalıştırırsa bu segment OLMADAN aynı yola yazar ve hatayı GÖRÜNÜR
//     kılar (platform sonekiyle ise "-darwin" ikinci bir sessiz set
//     doğurabilirdi).
//
// A-M5/A-M7/HALKA 3 notları (qa/T-011, DEĞİŞTİRİLMEDİ) — aşağıda, DEV
// sunucusu (`storefront-desktop`/`storefront-mobile`) için GEÇERLİ kalıyor.
//
// ⚠⚠ GÖRSEL SUNUCU (ADR Karar 5) — `astro build` + `node dist/server/
// entry.mjs`, `astro dev` DEĞİL. Ölçülmüş gerekçe (`storefront-theme.
// spec.ts:149-155`): `astro dev`'in geliştirme araç çubuğu `<body>`'ye
// `main`'in DIŞINDA ek `h1` enjekte ediyor; üretim derlemesinde YOK.
// ⚠⚠ R-11 (bağlayıcı): `createRootEnvIntegration()` kök `.env`'i YALNIZCA
// `dev` dalında yüklüyor (`astro.config.ts:46-49`) ⇒ üretim sunucusu
// başlatılırken `APP_BASE_DOMAIN`/`STOREFRONT_API_BASE_URL` KABUK
// DEĞİŞKENİYLE AÇIKÇA verilmek ZORUNDADIR — `scripts/run-visual.sh`'in işi
// (bu dosya DEĞİL; bu dosya sadece `reuseExistingServer: true` ile
// `run-visual.sh`'in ÖNCEDEN başlattığı sunucuyu BEKLER/KULLANIR).
//
// ⚠⚠ BRIEF'TE OLMAYAN, BU ALT GÖREVDE ÖLÇÜLMÜŞ İKİNCİ BULGU — Chromium'un
// `*.localhost` ana bilgisayar adları için KENDİ dahili (OS `/etc/hosts`'u
// BAYPAS EDEN) döngüsel-adres kısayolu (bkz. `e2e/visual/visual-port.ts`
// dosya başı yorumu, orada AYRINTILI ölçüm) — bu konteyner içinde
// `page.goto('http://demo-magaza.arkesoft.localhost:4322/')` HOST
// makinedeki üretim sunucusuna DEĞİL, konteynerin KENDİ (boş) `127.0.0.1`
// adresine düşer. Telafi: `buildVisualHostResolverRulesArgument()` —
// `run-visual.sh`'in çözdüğü host-gateway IP'si VARSA, görsel projelerin
// Chromium `launchOptions.args`'ına `--host-resolver-rules` EKLENİR; Docker
// DIŞINDA (env değişkeni YOKSA) bayrak EKLENMEZ (gerekmiyor — tarayıcı ve
// sunucu AYNI makinede).
import { existsSync } from 'node:fs'

import {
  createPlaywrightBaseConfig,
  desktopDevice,
  mobileDevice,
  reflowMobileDevice,
} from '../../scripts/playwright/base.js'
import { STOREFRONT_E2E_PORT, storefrontUrl } from './e2e/e2e-port.js'
import {
  buildVisualHostResolverRulesArgument,
  STOREFRONT_VISUAL_PORT,
  storefrontVisualUrl,
} from './e2e/visual/visual-port.js'

// ⚠⚠⚠ GATE DÜZELTME (devops, T-020 gate fix turu 1, 2026-11-15 —
// `solid`+`security` tur 1'in BAĞIMSIZ buluştuğu `high` bulgu, S-1/İŞ ①):
// ADR-0022 K1(b)'nin fail-closed `NODE_ENV=test` kapısı için BURADA
// sabitleniyor (`apps/admin/playwright.config.ts:53` emsali BİREBİR —
// `playwright test` NODE_ENV'i KENDİSİ AYARLAMAZ, ÖLÇÜLDÜ:
// `node -e "console.log(process.env.NODE_ENV)"` → `undefined`).
// `fixtures/custom-domain-tenant.ts`'in `assertTestEnvironment()`'ı bu
// değeri OKUR, AYARLAMAZ — tek yazıcı BURASI. `??=` — zaten `test` İSE
// DOKUNULMAZ. DEV (`astro dev`) `webServer.command`'ı AŞAĞIDA bu değeri
// çocuk sürecinden AÇIKÇA GERİ ALIR (`env NODE_ENV=development env -u …`)
// — NODE_ENV=test'in dev sunucusuna SIZMASI (Vite/React'ın geliştirme
// dışı bir moda düşmesi) riske değmez.
process.env['NODE_ENV'] ??= 'test'

// T-011/S3 — HALKA 3 KATMAN 1 (yükleme, DEĞİŞTİRİLMEDİ): bkz. orijinal
// gerekçe — Playwright KOŞUCU süreci kendi ortamını `webServer`'ın
// yüklemesinden BAĞIMSIZ olarak ister. ⚠ Görsel koşumda (`ARKESOFT_
// STOREFRONT_VISUAL_RUN=1`) bu BİLEREK YİNE ÇAĞRILIR ama zararsızdır: kök
// `.env` konteynerde YOK (git izlemiyor, `-v` ile mount edilen repoda
// `.env` sadece `.gitignore`'lu YEREL dosya; CI'da da yok) → `existsSync`
// `false` döner, sessizce atlanır — R-11'in gerektirdiği AÇIK kabuk
// değişkenleri (`run-visual.sh`'in `-e` bayrakları) bu yüklemeden
// BAĞIMSIZ, HER ZAMAN devrede.
const rootEnvUrl = new URL('../../.env', import.meta.url)
if (existsSync(rootEnvUrl)) {
  process.loadEnvFile(rootEnvUrl)
}

const DEMO_TENANT_HOST = 'demo-magaza.arkesoft.localhost'
const DEV_BASE_URL = storefrontUrl(DEMO_TENANT_HOST)
const VISUAL_BASE_URL = storefrontVisualUrl(DEMO_TENANT_HOST)

/** `scripts/run-visual.sh` BU bayrağı AÇIKÇA `1` olarak ayarlar — başka hiçbir çağıran bunu kendiliğinden set ETMEMELİ. */
const isVisualRun = process.env['ARKESOFT_STOREFRONT_VISUAL_RUN'] === '1'

const visualHostResolverRulesArgument = buildVisualHostResolverRulesArgument()
const visualLaunchOptions =
  visualHostResolverRulesArgument === undefined
    ? {}
    : { launchOptions: { args: [visualHostResolverRulesArgument] } }

export default createPlaywrightBaseConfig({
  testDir: './e2e',
  // DÜZELTME (ROADMAP v0.0.20.3, T-024 fix turu 1, `security` tur1 F4 —
  // medium) — `apps/admin/playwright.config.ts`'in AYNI gerekçesi
  // (DEĞİŞTİRİLMEDİ, ayrıntı orada): `dot` (CI varsayılanı, DAVRANIŞ
  // DEĞİŞMİYOR) + `json` (outputFile glob'ların DIŞINDA — `ci.yml`'in
  // mevcut yükleme adımına GİRMEZ), YALNIZCA `process.env['CI']` iken.
  // ⚠ `test:visual`'ın (`scripts/run-visual.sh`) AYNI config dosyasını AYNI
  // outputFile ile İKİNCİ kez çağırması dosyayı EZER — bu ZARARSIZDIR:
  // `ci.yml`'in annotation okuma adımı `test:e2e` İLE `test:visual`
  // ARASINDA konumlandı (görsel projeler `e2e/visual/**`'i, `a11y.ts`
  // kullanan `accessibility.spec.ts` ise `e2e/`'i tarar — İKİSİ AYRI
  // `testDir`, çakışma YOK), ayrıntı: `ci.yml`'deki okuma adımının yorumu.
  // `exactOptionalPropertyTypes: true` — `apps/admin/playwright.config.ts`'in
  // AYNI gerekçesi (DEĞİŞTİRİLMEDİ): anahtar CI DIŞINDA hiç SPREAD EDİLMEZ.
  ...(process.env['CI']
    ? { reporter: [['dot'], ['json', { outputFile: 'playwright-annotations.json' }]] as const }
    : {}),
  // T-020/S6 — ADR-0022 Karar 6 düzeltmesinin AYNI gerekçesi (`apps/admin/
  // playwright.config.ts:90-98`, DEĞİŞTİRİLMEDİ — emsal): Playwright'ın
  // VARSAYILAN `testMatch`'i `*.test.ts`'i DE eşleştirir. Storefront'ta
  // BUGÜN bir Vitest `.test.ts` dosyası `e2e/` altında YOK (ÖLÇÜLDÜ), ama
  // bu sabitleme savunma amaçlı — ileride bir Vitest testi BURAYA eklenirse
  // İKİ test koşucusunun aynı dizinde yaşamasının GİZLİ maliyeti (`S5`'in
  // ölçtüğü çöküş) BURADA ÖNLENİR.
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  // AC6/AC7/AC8 fixture'ları (docker exec ile Postgres'e yazan) ve rezerve
  // alt alan adı/rate-limit bütçesi paylaşımı PARALEL koşumla YARIŞMASIN —
  // apps/admin'in AC18 gerekçesiyle AYNI sınıf önlem (DEĞİŞTİRİLMEDİ).
  fullyParallel: false,
  // T-020/S6 — ADR-0022 Karar 4: platform soneki (`{-snapshotSuffix}`)
  // KALDIRILDI (dosya başı notu), `{-projectName}` KORUNDU.
  snapshotPathTemplate:
    '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}',
  // T-020/S6 — ADR-0022 K3: DÖRT adlandırılmış proje, DİZİN tabanlı ayrım.
  // `storefront-desktop`/`storefront-mobile` DEV sunucusuna (`:4321`)
  // karşı koşar; `storefront-visual-*` ÜRETİM sunucusuna (`:4322`, ADR
  // Karar 5) karşı koşar — İKİSİ AYRI `use.baseURL` taşır, taban onu
  // DAYATMAZ (S4'ün tasarım kısıtı).
  projects: [
    {
      name: 'storefront-desktop',
      testDir: './e2e',
      testIgnore: ['**/responsive/**', '**/visual/**'],
      use: { ...desktopDevice, baseURL: DEV_BASE_URL },
    },
    {
      name: 'storefront-mobile',
      testDir: './e2e/responsive',
      // T-024 (ROADMAP v0.0.20.3): WCAG 1.4.10 referans genişliği (320 px)
      // — `mobileDevice` (412 px) DEĞİL, `reflowMobileDevice` (bkz. base.ts).
      use: { ...reflowMobileDevice, baseURL: DEV_BASE_URL },
    },
    {
      name: 'storefront-visual-desktop',
      testDir: './e2e/visual',
      use: { ...desktopDevice, baseURL: VISUAL_BASE_URL, ...visualLaunchOptions },
    },
    {
      name: 'storefront-visual-mobile',
      testDir: './e2e/visual',
      // ⚠⚠ T-024: BİLEREK DEĞİŞMEDİ — `mobileDevice` (412 px), AC-24'ün
      // yapısal garantisi (mobil görsel regresyon referans PNG'leri).
      use: { ...mobileDevice, baseURL: VISUAL_BASE_URL, ...visualLaunchOptions },
    },
  ],
  use: {
    baseURL: DEV_BASE_URL,
  },
  // T-020/S6 — isVisualRun`a göre TEK bir webServer girdisi (ARRAY DEĞİL):
  // ikisini birden koşulsuz tanımlamak, `test:e2e` (DEV projeleri) çalışırken
  // Playwright'ın GÖRSEL sunucuyu da başlatmaya ÇALIŞMASINA yol açardı
  // (R-11'in env şartları DEV koşumunda YOK) — `R-5`'in "test:e2e görsel
  // projeleri koşturmuyor" şartının `webServer` yarısı BÖYLE korunuyor.
  // ⚠⚠ DAL SIRASI BİLİNÇLİ (`!isVisualRun` ÖNCE): `src/lib/__tests__/
  // env-contract.test.ts`'in P6/P8 pin'leri `playwright.config.ts`'in ham
  // METNİNDE `command:` İLE BAŞLAYAN İLK satırı ayıklıyor
  // (`extractWebServerCommandLine`, DOKUNULMADI) ve bunun DEV `astro dev`
  // komutu olmasını BEKLİYOR — ÖLÇÜLDÜ: dal sırası `isVisualRun ? … : …`
  // olsaydı GÖRSEL komut METİNDE ÖNCE geçer ve iki pin KIRMIZI düşerdi
  // (`pnpm test` ile yakalandı). Çalışma zamanı DAVRANIŞI (hangi dalın
  // SEÇİLDİĞİ) bu ters çevirmeden ETKİLENMEZ — yalnızca METİN SIRASI.
  webServer: !isVisualRun
    ? {
        // T-011/S3 — HALKA 3 KATMAN 1 (dedektör temizliği, DEĞİŞTİRİLMEDİ):
        // `package.json`'ın `dev` script'indeki önekle BİREBİR AYNI —
        // `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AI_AGENT astro
        // dev` metni BU satırda AYNEN geçmeli (env-contract.test.ts
        // P6/P8'in `"${prefix} astro dev"` alt dizge pini, DOKUNULMADI).
        // ⚠⚠ GATE DÜZELTME (devops, T-020 gate fix turu 1, S-1/İŞ ① önerisi
        // #3): yukarıdaki dosya başı `NODE_ENV ??= 'test'` pini bu ÇOCUK
        // sürece SIZMASIN diye DIŞ bir `env NODE_ENV=development` sarmalayıcı
        // EKLENDİ (admin'in `env NODE_ENV=development vite …` deseninin
        // BİREBİR ikizi, TERS yönde sarmalama) — İÇ `env -u …` öneki
        // DEĞİŞMEDİ, yukarıdaki P6/P8 pini BU YÜZDEN BOZULMAZ (sandbox'ta
        // `env A=1 env -u X Y printenv` ile doğrulandı: dış `env` NODE_ENV'i
        // SETLER, iç `env` agent-dedektör değişkenlerini UNSETLER, ikisi
        // ÇARPIŞMAZ).
        command: `env NODE_ENV=development env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AI_AGENT astro dev --port ${String(STOREFRONT_E2E_PORT)}`,
        url: DEV_BASE_URL,
        // T-011/S3 — HALKA 3 KATMAN 2 (DEĞİŞTİRİLMEDİ): koşulsuz `false`.
        reuseExistingServer: false,
        timeout: 30_000,
      }
    : {
        // `scripts/run-visual.sh` bu sunucuyu HOST makinede ÖNCEDEN
        // başlatır ve sağlıklı olduğunu DOĞRULAR (ADR Karar 4/5) — bu
        // komut yalnızca `run-visual.sh`'in BEKLENMEDİK şekilde
        // başarısız olduğu bir senaryoda (savunma amaçlı) Playwright
        // TARAFINDAN denenir; `reuseExistingServer: true` NORMAL yolun
        // bunu HİÇ ÇALIŞTIRMAMASINI sağlar (probe ZATEN 200 alır).
        command: `env PORT=${String(STOREFRONT_VISUAL_PORT)} HOST=0.0.0.0 node dist/server/entry.mjs`,
        url: VISUAL_BASE_URL,
        reuseExistingServer: true,
        timeout: 30_000,
      },
})
