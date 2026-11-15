// @arkesoft/storefront — görsel regresyon: `modern` temasının iki şablonu
// (ROADMAP v0.0.19, T-020/S6, ADR-0022 Karar 4/5, `pm`'in AC-6/AC-8/AC-9).
//
// ⚠⚠ BU DOSYA YALNIZCA `storefront-visual-desktop`/`storefront-visual-
// mobile` projelerinde koşar (`playwright.config.ts`'in `testDir: './e2e/
// visual'` ayrımı) — `storefront-desktop`/`storefront-mobile`
// `testIgnore: ['**/visual/**']` taşıdığı için bu dosyayı HİÇ GÖRMEZ
// (`AC-1`'in "test:e2e görsel projeleri koşturmuyor" şartının mekanik
// karşılığı, `R-5`).
//
// ⚠ Bu koşum `scripts/run-visual.sh` ÜZERİNDEN, pinli Playwright Docker
// imajı İÇİNDE çalışmak ZORUNDADIR (ADR Karar 4 — "yerelde kırmızı = CI'da
// kırmızı" tanım gereği doğru olsun). Doğrudan `playwright test
// --project=storefront-visual-desktop` çalıştırmak (Docker DIŞINDA) HALA
// ÇALIŞIR (üretim sunucusu AYNI makinede olduğu için ağ sorunu yok) ama
// rasterizasyon GARANTİSİ (font/alt-piksel) o zaman YOKTUR — kanonik koşum
// yolu BUDUR.
//
// İKİ "ŞABLON" — `po`'nun sınırı (bağlayıcı, raporda açıkça belirtildi):
//   1. `home` — `demo-magaza.arkesoft.localhost` kök sayfası, GERÇEKTEN
//      `@arkesoft/themes-modern`'in `home` şablonunu (`ThemeTemplate` →
//      `PageHeading`/`BodyText`) render eder — AC-8'in renk mutasyonu
//      BURAYI KIRAR.
//   2. `not-found` — `yok.arkesoft.localhost` (çözülemeyen kiracı, aynı
//      `storefront-host.spec.ts:62`'nin `NEVER_EXISTED_HOST`'u) → `src/
//      pages/404.astro`. ⚠⚠ SINIR (DOĞRULANAMADI'dan taşınmadı, ÖLÇÜLDÜ —
//      `packages/themes/modern/src/templates/404.astro`'nun KENDİ dosya
//      başı yorumu): tema paketinin `404.astro` ŞABLONU bu sürümde HİÇBİR
//      ROTAYA BAĞLANMAZ (yalnızca manifest beyanı için var). Bu test bu
//      yüzden tema paketinin `404.astro`'SUNU DEĞİL, storefront'un KENDİ
//      (tema'dan bağımsız, statik) "mağaza bulunamadı" sayfasını
//      görüntüler — AC-8'in renk mutasyonu BU TESTİ KIRMAZ (tema rengini
//      hiç okumuyor). "2 şablon" kapsam maddesinin ikinci PNG çifti bu
//      yüzden "tema render yüzeyinin ikinci durumu" olarak okunmalı,
//      "tema paketinin 404 şablonu" olarak DEĞİL — bu ayrım devops
//      raporunda VARSAYIM olarak işaretlendi.
import { expect, test } from '@playwright/test'
import type { Page, Response as PlaywrightResponse } from '@playwright/test'

import { storefrontVisualUrl } from './visual-port.js'

const DEMO_TENANT_HOST = 'demo-magaza.arkesoft.localhost'
// `storefront-host.spec.ts:62`'nin AYNI sabiti — dosyalar arası paylaşılan
// modül yok (CLAUDE.md §4, dosyalar arası bağımsızlık ilkesi diğer e2e
// dosyalarıyla AYNI, bkz. `storefront-theme.spec.ts:67` emsali).
const NEVER_EXISTED_HOST = 'yok.arkesoft.localhost'

/** `page.goto`'nun `null` döndürmediğini doğrular — diğer storefront e2e dosyalarıyla AYNI yardımcı, paylaşılan modül YOK (bilinçli, dosya başı notu). */
function expectNavigationResponse(response: PlaywrightResponse | null): PlaywrightResponse {
  if (response === null) {
    throw new Error('page.goto beklenmedik şekilde null Response döndürdü')
  }
  return response
}

/** Ekran görüntüsünden ÖNCE sayfanın tek `h1`'inin görünür olmasını bekler. */
async function waitForSingleHeading(page: Page): Promise<void> {
  const heading = page.locator('main h1')
  await expect(heading).toHaveCount(1)
  await expect(heading).toBeVisible()
}

test.describe('Görsel regresyon — `modern` temasının render yüzeyi (AC-6/AC-7/AC-8/AC-9)', () => {
  // ⚠⚠ BU ALT GÖREVDE ÖLÇÜLMÜŞ BEŞİNCİ BULGU (ÖNEMLİ, AC-8'İ SESSİZCE
  // GEÇERSİZ KILIYORDU): `page.toHaveScreenshot(…, { fullPage: true })`
  // KULLANILDIĞINDA karşılaştırma `base.ts`'in (DOKUNULMADI) `maxDiffPixel
  // Ratio: 0.002` eşiğine karşı TAM VİEWPORT'u (`1280×720` = 921.600 piksel)
  // payda alıyor. `BaseLayout.astro`'nun (DOKUNULMADI) `min-h-screen flex
  // justify-center` yerleşimi içeriği DÜŞEY ORTALIYOR — sayfanın BÜYÜK
  // kısmı BOŞ beyaz alan. `PageHeading`'in METNİ renk değişse bile
  // Playwright'ın `toHaveScreenshot` comparator'ı (pixelmatch tabanlı,
  // antialiasing-tespit sezgisi VARSAYILAN AÇIK) İNCE font gövdelerinde
  // (24-36px başlık) "aynı GEOMETRİ, farklı DÜZ RENK" örüntüsünü
  // ÇOĞUNLUKLA antialiasing SANIYOR ve atlıyor — ÖLÇÜLDÜ: `#2563EB` →
  // `#16A34A` VE `#2563EB` → `#000000` mutasyonlarının İKİSİ de tam sayfa
  // karşılaştırmasında yalnızca **~400 piksel** (toplamın **~%0.04**'ü)
  // farklı buluyordu — `maxDiffPixelRatio: 0.002` (%0.2) eşiğinin ÇOK
  // altında, test SESSİZCE yeşil kalıyordu (ham kanıt devops raporunda).
  // ⚠⚠ ÇÖZÜM — eşiği GEVŞETMEK/SIKILAŞTIRMAK DEĞİL (`base.ts` DOKUNULMAZ,
  // CLAUDE.md §10 md 6 "testi gevşetme" yasağı AYNI eksende okunur),
  // KAPSANAN BÖLGEYİ temanın GERÇEK render kapsayıcısına
  // (`PageSection.astro`'nun ürettiği `[data-arkesoft-theme="modern"]`
  // `<div>`'i, DEĞİŞTİRİLMEDİ) DARALTMAK: boş beyaz marjin OLMADAN aynı
  // ~400 piksellik fark çok daha küçük bir paydaya bölününce
  // `maxDiffPixelRatio` eşiğini GÜVENİLİR biçimde AŞIYOR (ÖLÇÜLDÜ, ham
  // çıktı devops raporunda) — eşiğin KENDİSİ hiç değişmedi, yalnızca PAYDA
  // (hangi pikseller sayılıyor) template'in GERÇEK render yüzeyine
  // indirgendi.
  test('home — demo-magaza.arkesoft.localhost kök sayfası', async ({ page }) => {
    const response = expectNavigationResponse(
      await page.goto(storefrontVisualUrl(DEMO_TENANT_HOST)),
    )
    expect(response.status()).toBe(200)
    await waitForSingleHeading(page)

    await expect(page.locator('[data-arkesoft-theme="modern"]')).toHaveScreenshot('home.png')
  })

  test('not-found — yok.arkesoft.localhost (çözülemeyen kiracı)', async ({ page }) => {
    const response = expectNavigationResponse(
      await page.goto(storefrontVisualUrl(NEVER_EXISTED_HOST)),
    )
    expect(response.status()).toBe(404)
    await waitForSingleHeading(page)

    await expect(page.locator('main')).toHaveScreenshot('not-found.png')
  })
})
