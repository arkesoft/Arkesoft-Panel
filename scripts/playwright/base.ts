// scripts/playwright/base.ts — Paylaşılan Playwright taban yardımcısı
// (ROADMAP v0.0.19, T-020/S4, ADR-0022 Karar 6).
//
// ⚠⚠ BU DOSYANIN TİP+LINT KAPSAMDA KALMASI `scripts/tsconfig.json`'ın
// `include` listesine BAĞLIDIR (ADR-0022 Karar 6 düzeltme notu, R-A).
// `include: ["*.ts"]` yalnızca üst seviyeyi kapsar — bu dosya alt dizinde
// olduğu için genişletme YAPILMADAN `check_scripts_typecheck` onu hiç
// GÖRMEZ ve `check_scripts_eslint` "dosya projede yok" hatasıyla kırılır.
// Genişletme bu alt görevin AYRILMAZ parçası (bkz. `scripts/tsconfig.json`).
//
// NEDEN `scripts/playwright/` (ve NEDEN `packages/config` DEĞİL):
// - Playwright'ın TypeScript dönüştürücüsü `node_modules`'ü hariç tutar ⇒
//   bir workspace paketinden (`packages/config`) ham `.ts` ihraç edilip
//   `playwright.config.ts`'ten import edilemez (pnpm sembolik bağı
//   `node_modules` İÇİNE düşer).
// - `packages/config`'i `dist/`'e derlemek bayat-derleme (stale dist)
//   tuzağını geri getirir (T-019'da beş kez önlenen sınıf).
// - `scripts/` zaten workspace DIŞI, kök seviyeli bir TypeScript alanı ve
//   `pnpm guards` onu tip+lint denetiminden geçiriyor (yukarıdaki not).
//
// TASARIM KISITI — TABAN PROJE DAYATMAZ, YARDIMCI OLUR:
// `createPlaywrightBaseConfig()` bir `defineConfig` GİRDİSİ döner, `projects`
// alanını KENDİSİ belirlemez — çağıran (`apps/admin`, `apps/storefront`,
// v0.0.20'de `apps/superadmin`) kendi proje matrisini `overrides.projects`
// ile verir ve bu fonksiyon onu olduğu gibi geçirir. `DESKTOP_DEVICE_NAME` /
// `MOBILE_DEVICE_NAME` sabitleri çağıranın proje matrisini kurarken
// kullanacağı ortak cihaz adlarıdır — v0.0.20 `superadmin` projesi bu
// sabitleri ve bu fonksiyonu kullanarak TEK dosyayla (kendi
// `playwright.config.ts`'i) katılabilir.
import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'

/** Masaüstü proje matrisinde kullanılacak ortak Playwright cihaz adı. */
export const DESKTOP_DEVICE_NAME = 'Desktop Chrome'

/**
 * Mobil proje matrisinde kullanılacak ortak Playwright cihaz adı.
 * `Pixel 7`: Playwright'ın güncel Android referans cihazı, masaüstünden
 * belirgin ölçüde farklı viewport (duyarlı render'ı anlamlı şekilde ayırt
 * eder) — "çoklu viewport" kapsam maddesinin tek doğruluk kaynağı burası.
 */
export const MOBILE_DEVICE_NAME = 'Pixel 7'

/** `devices[DESKTOP_DEVICE_NAME]` kısayolu — proje matrisi kurarken kullanılır. */
export const desktopDevice = devices[DESKTOP_DEVICE_NAME]

/** `devices[MOBILE_DEVICE_NAME]` kısayolu — proje matrisi kurarken kullanılır. */
export const mobileDevice = devices[MOBILE_DEVICE_NAME]

/**
 * Görsel regresyon karşılaştırma eşiği — ADR-0022 Karar 4'ün GEREKÇELİ
 * değeri. `0.002` (binde 2): font rasterizasyonunun CI koşucusu ile yerel
 * makine arasında ÜRETEBİLECEĞİ alt-piksel gürültüsüne tolerans tanır
 * (Karar 5'in üretim derlemesi + Karar 4'ün pinli Docker imajı kararlarıyla
 * BİRLİKTE okunmalı: asıl kaynak izolasyonu onlar yapar, bu değer onlardan
 * SONRA kalan artık gürültüyü emer) — ancak gerçek bir renk/yerleşim
 * değişikliğini (AC-8'in mutasyon testi) GEÇİRMEYECEK kadar sıkıdır.
 */
export const VISUAL_MAX_DIFF_PIXEL_RATIO = 0.002

/**
 * Görsel regresyon piksel-başı renk farkı toleransı — ADR-0022 Karar 4.
 * `0.2`, Playwright'ın kendi varsayılanıyla AYNI (pixelmatch'in YIQ renk
 * uzayında hesapladığı fark için "ne kadar farklı bir piksel 'farklı'
 * sayılsın" sorusuna cevap) — bilinçli olarak DEĞİŞTİRİLMEDİ; asıl
 * gerekçeli gevşetme `maxDiffPixelRatio` üzerinden ("kaç piksel farklı
 * olabilir", yukarı bkz.), `threshold` üzerinden DEĞİL — ikisini birden
 * gevşetmek AC-8'in mutasyon testinin tespit gücünü gereksiz yere düşürür.
 */
export const VISUAL_THRESHOLD = 0.2

/**
 * Tüm Playwright projelerinde ortak taban ayarlar (ADR-0022 Karar 6).
 * `overrides` ile BİRLEŞTİRİLİR (deep merge — `use`/`expect.toHaveScreenshot`
 * alanları), `projects`/`testDir`/`webServer`/`globalSetup` gibi proje
 * ÖZELİNDEKİ alanlara KARIŞMAZ, `overrides`'tan geldiği hâliyle geçer.
 *
 * @param overrides Çağıranın kendi proje matrisi, `testDir`, `webServer` vb.
 * @returns `defineConfig`'e verilecek tam yapılandırma.
 */
export function createPlaywrightBaseConfig(
  overrides: PlaywrightTestConfig = {},
): PlaywrightTestConfig {
  return defineConfig({
    ...overrides,
    // R-8 (po, T-020): üç CI koşumu SIRALI alınacak — bu taban onu
    // ZORLAMAZ (CI topolojisi `devops`'un S8/S9'unda), ama `forbidOnly` CI'da
    // yanlışlıkla bırakılmış bir `test.only`'yi gürültülü biçimde kırar.
    forbidOnly: overrides.forbidOnly ?? Boolean(process.env['CI']),
    // Oran sınırı bütçesi dar (ADR-0022, `auth-budget.ts`); `workers: 1`
    // admin/storefront'un BUGÜNKÜ emsaliyle birebir — paylaşılan değişken
    // altyapıya (tek Postgres/Redis/Mailpit) paralel yüklenmeyi engeller.
    workers: overrides.workers ?? 1,
    // ⚠⚠ GATE DÜZELTME (devops, T-020 gate fix turu 1, `security` tur 1
    // S-4, [low], "yolu üstündeyse kapat"): depo PUBLIC
    // (`gh repo view` → `"visibility":"PUBLIC"`) — Playwright'ın
    // VARSAYILANI zaten `retries: 0` olduğu için `on-first-retry` trace'i
    // BUGÜN hiç üretmiyor, ama bu BUGÜNE KADAR hiçbir yapılandırmanın
    // `retries`'i AYARLAMAMASININ TESADÜFÜYDÜ — tek satırlık, zararsız
    // görünen bir `retries: 2` eklemesi (CI'da ÇOK YAYGIN) başarısız bir
    // koşumun `set-cookie`/`Authorization` başlıklarını taşıyan
    // `trace.zip`'ini PUBLIC, giriş GEREKTİRMEYEN bir Actions artefaktına
    // yükler. Bu satır o tesadüfü AÇIK bir karara çevirir — bir SONRAKİ
    // ajan "retries ekleyelim, flaky testler geçsin" DEMESİN.
    retries: overrides.retries ?? 0,
    use: {
      // ⚠ R-9 (po, T-020): trace/video artefaktları OTURUM ÇEREZİ ve
      // `Authorization` BAŞLIĞI taşır — bu iki ayar azaltmanın PARÇASI:
      // `on-first-retry` artefaktı yalnızca BAŞARISIZ olup yeniden denenen
      // testler için üretir (yeşil koşumlarda sıfır artefakt), `retain-on-
      // failure` videoyu yalnızca kalıcı başarısızlıkta saklar. CI'daki
      // `retention-days` (S8'in dosyası) ile BİRLİKTE azaltma zinciri.
      trace: 'on-first-retry',
      video: 'retain-on-failure',
      ...overrides.use,
    },
    expect: {
      ...overrides.expect,
      toHaveScreenshot: {
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
        threshold: VISUAL_THRESHOLD,
        ...overrides.expect?.toHaveScreenshot,
      },
    },
  })
}
