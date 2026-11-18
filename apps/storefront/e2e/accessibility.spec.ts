// @arkesoft/storefront — erişilebilirlik (axe-core) e2e taraması (ROADMAP
// v0.0.20.3, T-024/S7, ADR-0025, docs/testing.md) — ⭐ GRUP 6'nın son spec'i.
//
// İKİ TARAMA (mimari/po kararı, bağlayıcı) — İKİSİ DE SIFIR AUTH
// (`apps/storefront`'ta hiçbir kimlik doğrulama ucu YOK, po'nun A-PO-3
// ölçümü) ⇒ `apps/storefront/e2e/auth-budget.ts` BU ALT GÖREVDE
// OLUŞTURULMADI — mimarinin raporundaki "dört spec'in dördü de
// `auth-budget`'a eklenmeli" önerisi po tarafından ÖLÇÜLEREK ÇÜRÜTÜLDÜ
// (apps/admin ve apps/superadmin'de böyle bir dosya VAR, apps/storefront'ta
// YAPISAL OLARAK YOK — icat edilmedi):
//   1. `demo-magaza` kök sayfası (`scanName: 'storefront-home'`) — fiilen
//      `packages/themes/modern`'i tarar (mimari raporu, "tema yüzeyi").
//   2. Çözülemeyen host → 404 (`scanName: 'storefront-not-found'`) —
//      `storefront-host.spec.ts:99-113`'in (DOKUNULMADI, yalnızca OKUNDU)
//      AYNI deseni (`NEVER_EXISTED_HOST`); `response.status() === 404`
//      burada da AÇIKÇA assert edilir.
//
// Keşif ölçümü (mimari, T-024, "⭐⭐ KEŞİF ÖLÇÜMÜ" tablosu): İKİ sayfa da
// `0 violations / 0 incomplete`. Bu yüzden bu dosya `scripts/playwright/
// a11y.ts`'in `ALLOWED_VIOLATIONS`/`ACKNOWLEDGED_INCOMPLETE_RULE_IDS`
// tablolarına HİÇBİR girdi EKLEMEDİ (o dosyaya hiç DOKUNULMADI) — bir ihlal
// ya da beyan edilmemiş `incomplete` çıkarsa bu test KIRMIZIYA döner;
// "gerekçeli ack" burada BİLİNÇLİ olarak YAZILMADI (keşfin öngördüğü gibi).
//
// ⚠⚠ GÖRSEL REGRESYON SINIRI (mimari `VARSAYIM A-T24-2`, bağlayıcı):
// taranan iki yüzey `storefront-templates.visual.spec.ts`'in referans
// PNG'lerinin kapsadığı yüzeylerle AYNI. Bu dosya `test:visual`/
// `test:visual:update` ÇALIŞTIRMAZ, referans PNG'lere DOKUNMAZ ve piksel
// değiştiren hiçbir düzeltme İÇERMEZ.
import { expect, test } from '@playwright/test'
import type { Response as PlaywrightResponse } from '@playwright/test'

import { storefrontUrl } from './e2e-port.js'
// `storefront-host.spec.ts`'in M4 düzeltmesiyle AYNI gerekçe: beklenen 404
// Türkçe dizesi TEK doğruluk kaynağından (`src/messages/messages.ts`) ithal
// edilir, teste sabit YAZILMAZ.
import { MESSAGES } from '../src/messages/messages.js'

import { expectNoAccessibilityViolations } from '../../../scripts/playwright/a11y.js'

// `storefront-host.spec.ts`'in (DOKUNULMADI) AYNI sabitleri — ayrı dosya
// olduğu için bağımsız bir kopya (CLAUDE.md §3 paket sınırları bu dosyanın
// `storefront-host.spec.ts`'i import ETMESİNİ GEREKTİRMİYOR, iki dosya da
// `apps/storefront/e2e/` kökünde bağımsız spec'ler).
const BASE_DOMAIN = 'arkesoft.localhost'
const DEMO_TENANT_NAME = 'Demo Mağaza'
// ROADMAP v0.0.8 kabul kriterinin BİREBİR host'u.
const NEVER_EXISTED_HOST = `yok.${BASE_DOMAIN}`

/** `page.goto` HER ZAMAN bir yanıt döner (yönlendirme/ağ hatası durumunda `null`/fırlatma olur) — bu yardımcı o garantiyi TİP GÜVENLİ hâle getirir (CLAUDE.md §4: "unknown + narrowing", `as` yok). */
function expectNavigationResponse(response: PlaywrightResponse | null): PlaywrightResponse {
  if (response === null) {
    throw new Error('page.goto beklenmedik şekilde null Response döndürdü')
  }
  return response
}

test.describe('Storefront erişilebilirlik taraması (T-024/S7, AC-19/AC-20/AC-21)', () => {
  // ---------------------------------------------------------------------
  // (1) `demo-magaza` kök sayfası — SIFIR AUTH, fiilen `packages/themes/
  // modern`'i tarar.
  // ---------------------------------------------------------------------
  test('demo-magaza kök sayfası erişilebilirlik ihlali taşımıyor (AC-19/AC-20/AC-21)', async ({
    page,
  }, testInfo) => {
    // `baseURL` (playwright.config.ts → `storefront-desktop` projesi) zaten
    // `http://demo-magaza.arkesoft.localhost:<PORT>` — relatif yol yeterli.
    const response = expectNavigationResponse(await page.goto('/'))
    expect(response.status()).toBe(200)

    // Taranan sayfanın GERÇEKTEN tenant ana sayfası olduğunu (ör. yanlışlıkla
    // bir hata sayfasını taramadığını) doğrular — axe'ın "0 ihlal" sonucu
    // yalnızca doğru sayfa taranmışsa anlamlıdır.
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(DEMO_TENANT_NAME)

    await expectNoAccessibilityViolations(page, 'storefront-home', testInfo)
  })

  // ---------------------------------------------------------------------
  // (2) Çözülemeyen host → 404 — SIFIR AUTH, `storefront-host.spec.ts:99-
  // 113`'in AYNI deseni.
  // ---------------------------------------------------------------------
  test(`${NEVER_EXISTED_HOST} → 404 sayfası erişilebilirlik ihlali taşımıyor (AC-19/AC-20/AC-21)`, async ({
    page,
  }, testInfo) => {
    const response = expectNavigationResponse(await page.goto(storefrontUrl(NEVER_EXISTED_HOST)))
    expect(response.status()).toBe(404)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(MESSAGES.storefront.notFound.heading)

    await expectNoAccessibilityViolations(page, 'storefront-not-found', testInfo)
  })
})
