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
// `MOBILE_DEVICE_NAME` sabitleri `desktopDevice`/`mobileDevice` kısayollarını
// (aşağıda) üretmek için BU MODÜL İÇİNDE kullanılır — çağıranlar bu iki
// kısayolu ve `createPlaywrightBaseConfig`'i import eder (ölçüldü,
// v0.0.20.1/T-022: `apps/admin`, `apps/storefront`, `apps/superadmin`);
// ham ad sabitlerinin kendisi dışa açılmaz (ROADMAP:3414, AC-6).
import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'

/** Masaüstü proje matrisinde kullanılacak ortak Playwright cihaz adı. */
const DESKTOP_DEVICE_NAME = 'Desktop Chrome'

/**
 * Mobil proje matrisinde kullanılacak ortak Playwright cihaz adı.
 * `Pixel 7`: Playwright'ın güncel Android referans cihazı, masaüstünden
 * belirgin ölçüde farklı viewport (duyarlı render'ı anlamlı şekilde ayırt
 * eder) — "çoklu viewport" kapsam maddesinin tek doğruluk kaynağı burası.
 */
const MOBILE_DEVICE_NAME = 'Pixel 7'

/** `devices[DESKTOP_DEVICE_NAME]` kısayolu — proje matrisi kurarken kullanılır. */
export const desktopDevice = devices[DESKTOP_DEVICE_NAME]

/** `devices[MOBILE_DEVICE_NAME]` kısayolu — proje matrisi kurarken kullanılır. */
export const mobileDevice = devices[MOBILE_DEVICE_NAME]

/** WCAG 1.4.10 (reflow) referans genişliği — 320 CSS px. */
const WCAG_REFLOW_VIEWPORT_WIDTH = 320

/**
 * `mobileDevice`'ın CİHAZ PROFİLİNİ (userAgent, isMobile, hasTouch,
 * deviceScaleFactor, defaultBrowserType) KORUYAN, yalnızca `viewport`
 * GENİŞLİĞİ WCAG 1.4.10'un referans genişliğine (320 CSS px) daraltılmış
 * türevi (T-024, ROADMAP v0.0.20.3). `mobileDevice` (`Pixel 7`, 412 px)
 * BİLEREK DEĞİŞMEDİ — `storefront-visual-mobile` onu tüketmeye DEVAM EDER,
 * mobil görsel regresyon referans PNG'leri bu eklemeden ETKİLENMEZ.
 */
export const reflowMobileDevice = {
  ...mobileDevice,
  viewport: { width: WCAG_REFLOW_VIEWPORT_WIDTH, height: mobileDevice.viewport.height },
}

/**
 * Görsel regresyon karşılaştırma eşiği — ADR-0022 Karar 4'ün GEREKÇELİ
 * değeri. `0.002` (binde 2): font rasterizasyonunun CI koşucusu ile yerel
 * makine arasında ÜRETEBİLECEĞİ alt-piksel gürültüsüne tolerans tanır
 * (Karar 5'in üretim derlemesi + Karar 4'ün pinli Docker imajı kararlarıyla
 * BİRLİKTE okunmalı: asıl kaynak izolasyonu onlar yapar, bu değer onlardan
 * SONRA kalan artık gürültüyü emer) — ancak gerçek bir renk/yerleşim
 * değişikliğini (AC-8'in mutasyon testi) GEÇİRMEYECEK kadar sıkıdır.
 */
const VISUAL_MAX_DIFF_PIXEL_RATIO = 0.002

/**
 * Görsel regresyon piksel-başı renk farkı toleransı — ADR-0022 Karar 4.
 * `0.2`, Playwright'ın kendi varsayılanıyla AYNI (pixelmatch'in YIQ renk
 * uzayında hesapladığı fark için "ne kadar farklı bir piksel 'farklı'
 * sayılsın" sorusuna cevap) — bilinçli olarak DEĞİŞTİRİLMEDİ; asıl
 * gerekçeli gevşetme `maxDiffPixelRatio` üzerinden ("kaç piksel farklı
 * olabilir", yukarı bkz.), `threshold` üzerinden DEĞİL — ikisini birden
 * gevşetmek AC-8'in mutasyon testinin tespit gücünü gereksiz yere düşürür.
 */
const VISUAL_THRESHOLD = 0.2

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
    //
    // ⚠⚠ GATE DÜZELTME (S-11, İŞ ④, devops, T-020 gate fix turu 2,
    // 2026-11-15): `security`+`solid` tur 2 BAĞIMSIZ ÖLÇTÜ — bu PİN
    // yalnızca ÜST SEVİYEDE; Playwright `projects[].retries`'i de
    // DESTEKLİYOR ve o, üst seviyeyi PROJE BAZINDA EZER — bu dosyaya
    // hiç dokunmadan `apps/admin/playwright.config.ts`'in `projects:`
    // dizisine `retries: 2` eklemek yukarıdaki satırı EL DEĞMEDEN
    // bırakırken `on-first-retry` trace'ini yine PUBLIC artefakta
    // yükleyebilirdi (`solid`: bu satır o zamana kadar DAVRANIŞSAL
    // OLARAK NO-OP'tu — belge, kapı DEĞİL). Düzeltme kapı tarafı:
    // `scripts/guards.sh`'in `check_playwright_retries_single_source`
    // adımı artık `apps/**`/`packages/**`/`scripts/**` genelindeki TÜM
    // `.ts` dosyalarını tarayıp `retries` jetonunun YALNIZCA bu dosyada
    // geçtiğini zorluyor — bir `projects[]` girdisine (veya başka bir
    // `overrides` çağrısına) `retries` eklenmesi `pnpm guards`'ı KIRMIZI
    // yapar (ölçüldü, devops T-020 gate fix turu 2 raporu). Seçim PİN
    // (iddia küçültme değil) — gerekçe R-9 (depo PUBLIC, trace oturum
    // çerezi + `Authorization` taşıyor) ve bu satır "flaky test geçsin"
    // refleksinin EN OLASI hedefi.
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
