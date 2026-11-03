// @arkesoft/storefront — tema render e2e'si (ROADMAP v0.0.10, T-012/S9,
// architect K1/K5 + ADR-0002 — frontend ÜRETİM ROLÜNDE, AC4/AC6'nın e2e
// kanıtı)
//
// KAPSAM (bu dosya, S9'un "İŞ" listesine BİREBİR karşılık gelir):
//   İŞ 1/AC4 — `--color-primary` TAM olarak demo değerine eşit VE görünür
//     bir öğenin (PageHeading `h1`) hesaplanmış `color`'ı o değerden türüyor.
//     ⚠ Değişkenin TANIMLI olması YETMEZ — "beyan ile gerçeklik arasındaki
//     boşluk" sınıfının e2e karşılığı bu ikinci ölçümle kapatılıyor.
//   İŞ 2 — ÜCRETSİZ KAZANÇ: AYNI koşumda İKİ render yolu kanıtlanıyor —
//     (a) `demo-magaza` → DB'den gelen seçim (migration backfill'i,
//     `modern`/`0.1.0`) ve (b) `fixtures/custom-domain-tenant.ts`'in
//     (DEĞİŞTİRİLMEDİ) ürettiği özel alan adı kiracısı → tema kolonlarını
//     YAZMADIĞI için `theme_id IS NULL` → `middleware.ts`'in
//     `DEFAULT_THEME_SELECTION`'a düştüğü varsayılan tema yolu. ⚠ SINIR
//     (architect/po, gizlenmiyor): bu sürümde TEK tema kayıtlı
//     (`modern@0.1.0`) — iki yol da AYNI girdiye varıyor, "farklı kiracı
//     farklı tema" burada KANITLANMIYOR (o v0.3.0'ın işi). Ayrı bir fixture
//     EKLENMEDİ (A-P3 korunuyor) — mevcut `createCustomDomainTenantFixture`
//     kullanıldı.
//   İŞ 4/AC6 — kiracı sayfasının `Cache-Control`'ü `cache-policy.ts`'ten
//     geliyor ve `immutable` İÇERMİYOR (DEĞER tarafı). `/_astro/*`'ta kalan
//     KURAL ile DEĞER ayrımının build-çıktısı yarısı (`rg -c "color-primary"
//     dist/client/_astro/` → 0) bu dosyanın DIŞINDA, ayrı bir komutla
//     ölçülür — bu test yalnızca ÇALIŞMA ZAMANI/SSR HTML tarafını ölçer.
//
// ⚠ `toHaveScreenshot`/`toMatchSnapshot` BU DOSYADA YOK (görsel regresyon
// v0.0.19, R2 — kullanıcı onayı 2026-11-03). Renk doğrulaması
// `getComputedStyle` ile — piksel karşılaştırmasından DAHA KESİN.
//
// ⚠ `playwright.config.ts`/`e2e/global-setup.ts`/`e2e/e2e-port.ts`/
// `e2e/fixtures/custom-domain-tenant.ts`/`e2e/storefront-host.spec.ts`
// DEĞİŞTİRİLMEDİ — bu dosya onları yalnızca OKUYUP kullanıyor.
import { expect, test } from '@playwright/test'
import type { Page, Response as PlaywrightResponse } from '@playwright/test'

import { modernTheme } from '@arkesoft/themes-modern'

import { storefrontUrl } from './e2e-port.js'
import {
  createCustomDomainTenantFixture,
  deleteTenantFixture,
} from './fixtures/custom-domain-tenant.js'
import type { CustomDomainTenantFixture } from './fixtures/custom-domain-tenant.js'
// `STOREFRONT_CACHE_CONTROL` — AC17'nin TEK yazılı kaynağı (`cache-policy.ts`
// dosya başı yorumu); bu test bunu DOĞRUDAN tekrar yazmaz, ithal eder.
import { STOREFRONT_CACHE_CONTROL } from '../src/lib/cache-policy.js'

const BASE_DOMAIN = 'arkesoft.localhost'
const DEMO_TENANT_HOST = `demo-magaza.${BASE_DOMAIN}`
// `packages/db/src/seed-data.ts`'in (DOKUNULMADI) sabit değeri —
// `storefront-host.spec.ts`'in dosya başı yorumuyla AYNI gerekçeyle, bu
// dosya o paketi İTHAL EDEMEZ (AC10), literal tekrarı BİLİNÇLİ.
const DEMO_TENANT_NAME = 'Demo Mağaza'

/**
 * ⚠ BAĞIMSIZ PİN (bilinçli, hardcoded) — `docs/ui/T-012.md`/architect'in
 * dondurduğu palet değeri VE AC4'ün metninin kendisi ("TAM OLARAK
 * '#2563EB'"). `theme.config.ts`'ten OKUNARAK türetilmedi: amaç tam olarak
 * bunun BAĞIMSIZ bir kontrol olması — `color-primary`'nin hex'i ileride
 * değişirse (bu palet DONDUĞU için bu bir TEMA MAJORU olurdu) bu test
 * KIRILIR ve değişikliği GÖRÜNÜR kılar; `theme.config.ts`'ten okusaydı test
 * her zaman trivially geçer, pin'in amacı kaybolurdu.
 */
const EXPECTED_COLOR_PRIMARY_HEX = '#2563EB'

/** `page.goto`/`request.get` HER ZAMAN bir yanıt döner — `storefront-host.spec.ts`'in AYNI yardımcısı, dosyalar arası paylaşılan bir modül yok (CLAUDE.md §4: "unknown + narrowing", `as` yok). */
function expectNavigationResponse(response: PlaywrightResponse | null): PlaywrightResponse {
  if (response === null) {
    throw new Error('page.goto beklenmedik şekilde null Response döndürdü')
  }
  return response
}

/** `:root` üzerindeki bir CSS özel özelliğinin TARAYICIDA gerçekten HESAPLANMIŞ değerini okur. */
async function computedRootCustomProperty(page: Page, propertyName: string): Promise<string> {
  return page.evaluate(
    (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    propertyName,
  )
}

/**
 * `#rrggbb` hex'ini tarayıcının `getComputedStyle` ile ürettiği `rgb(r, g, b)`
 * biçimine çevirir — ikinci bir hex-ayrıştırma kopyası (theme-css.ts'in
 * `COLOR_VALUE_PATTERN`'i) BURADA TEKRAR YAZILMAZ, bu yalnızca test
 * assertion'ı için BİÇİM dönüşümüdür.
 */
function hexToComputedRgb(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`storefront-theme.spec.ts: beklenmeyen hex biçimi — "${hex}"`)
  }
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return `rgb(${String(red)}, ${String(green)}, ${String(blue)})`
}

/**
 * ⚠ TUTARLILIK PİNİ (ek, mekanik): yukarıdaki BAĞIMSIZ pin'in `theme.
 * config.ts`'in GERÇEK `color-primary` varsayılanıyla AYNI olduğunu da
 * ölçer — `modernTheme` zaten `@arkesoft/storefront`'un bağımlılığı
 * (`package.json`, `@arkesoft/themes-modern`), bu ithal `pnpm typecheck`i
 * KIRMAZ (`src/themes/theme-setting-definition.ts`'in dosya başı yorumuyla
 * AYNI yapısal garanti — `@arkesoft/theme-sdk` DEĞİL, somut tema paketi).
 */
type ThemeSettingDefinitionUnion = (typeof modernTheme.manifest.settings)[number]

function isColorSetting(
  setting: ThemeSettingDefinitionUnion,
): setting is Extract<ThemeSettingDefinitionUnion, { readonly type: 'color' }> {
  return setting.type === 'color'
}

function findColorSettingDefault(key: string): string {
  const match = modernTheme.manifest.settings
    .filter(isColorSetting)
    .find((setting) => setting.key === key)

  if (match === undefined) {
    throw new Error(
      `storefront-theme.spec.ts: "${key}" renk ayarı modernTheme manifestinde bulunamadı.`,
    )
  }

  return match.default
}

test.describe('AC4 — tema renkleri gerçekten UYGULANIYOR (DB seçimi yolu)', () => {
  test(`${DEMO_TENANT_HOST}: --color-primary TAM OLARAK "${EXPECTED_COLOR_PRIMARY_HEX}" VE PageHeading'in hesaplanmış rengi bu değerden TÜRÜYOR`, async ({
    page,
  }) => {
    // Mekanik tutarlılık: palet dondu, test'in bağımsız pin'i ile
    // `theme.config.ts`'in gerçek varsayılanı SAPARSA (ikisi de bu dosyada
    // AÇIKÇA görünür) bu assertion en baştan KIRMIZI döner.
    expect(EXPECTED_COLOR_PRIMARY_HEX).toBe(findColorSettingDefault('color-primary'))

    const response = expectNavigationResponse(await page.goto(storefrontUrl(DEMO_TENANT_HOST)))
    expect(response.status()).toBe(200)

    const computedColorPrimary = await computedRootCustomProperty(page, '--color-primary')
    expect(computedColorPrimary).toBe(EXPECTED_COLOR_PRIMARY_HEX)

    // ⚠ İKİNCİ YARI (bağlayıcı, "beyan ile gerçeklik arasındaki boşluk"ın
    // e2e karşılığı): değişkenin TANIMLI olması yetmez — tek `h1`in (tek
    // `h1` kuralı, docs/ui/T-012.md) hesaplanmış `color`'ı bu değerden
    // GERÇEKTEN türemek zorunda. ⚠ ÖLÇÜLDÜ (bu alt görev): locator `main
    // h1`'e KASITLI OLARAK daraltıldı — `astro dev`'in (bu koşumun
    // `webServer`'ı) kendi geliştirme araç çubuğu `<body>`'ye `main`'in
    // DIŞINDA ek `h1` öğeleri enjekte ediyor ("Audit"/"Settings" panelleri);
    // çıplak `page.locator('h1')` bu yüzden strict-mode'da BİRDEN FAZLA
    // eşleşmeyle KIRILIYORDU (production build'de/`node dist/server/
    // entry.mjs`'te bu araç çubuğu YOK — bu YALNIZCA bu e2e'nin `astro dev`
    // kullanmasının bir yan etkisi, tema kodunun kusuru DEĞİL). `main`
    // (`BaseLayout.astro:33`, DEĞİŞTİRİLMEDİ) tek içerik kapsayıcısı.
    const heading = page.locator('main h1')
    await expect(heading).toHaveCount(1)
    await expect(heading).toHaveText(DEMO_TENANT_NAME)

    const headingComputedColor = await heading.evaluate(
      (element) => getComputedStyle(element).color,
    )
    expect(headingComputedColor).toBe(hexToComputedRgb(EXPECTED_COLOR_PRIMARY_HEX))
  })
})

test.describe.serial('İŞ 2 — iki render yolu AYNI koşumda (DB seçimi + varsayılan tema)', () => {
  let fixture: CustomDomainTenantFixture

  test.beforeAll(() => {
    // ⚠ ÜCRETSİZ KAZANÇ: `createCustomDomainTenantFixture()`
    // (`fixtures/custom-domain-tenant.ts:119-121`, DEĞİŞTİRİLMEDİ) tema
    // kolonlarını YAZMAZ → `theme_id`/`theme_version` `NULL` → bu kiracı
    // `middleware.ts`'in "Adım 5.5"inde `DEFAULT_THEME_SELECTION`'a düşer.
    fixture = createCustomDomainTenantFixture()
  })

  test.afterAll(() => {
    deleteTenantFixture(fixture)
  })

  test('demo-magaza (DB seçimi) VE özel alan adı (varsayılan tema) İKİSİ de tema render ediyor; boş/kırık sayfa YOK', async ({
    page,
  }) => {
    // Yol (a) — DB'den gelen seçim (migration backfill'i: `modern`/`0.1.0`).
    const dbSelectedResponse = expectNavigationResponse(
      await page.goto(storefrontUrl(DEMO_TENANT_HOST)),
    )
    expect(dbSelectedResponse.status()).toBe(200)
    expect(await computedRootCustomProperty(page, '--color-primary')).toBe(
      EXPECTED_COLOR_PRIMARY_HEX,
    )
    await expect(page.locator('main h1')).toHaveText(DEMO_TENANT_NAME)

    // Yol (b) — `theme_id IS NULL` → varsayılan tema (pm iş kuralı md 8:
    // boş/kırık sayfa gösterilmez). Durum 200 OLMAK ZORUNDA — 404/503 bu
    // yolu AÇIKLAYAMAZ, çünkü kiracı (özel alan adı) GERÇEKTEN var/çözülüyor.
    const defaultThemeResponse = expectNavigationResponse(
      await page.goto(storefrontUrl(fixture.primaryDomain)),
    )
    expect(defaultThemeResponse.status()).toBe(200)
    expect(await computedRootCustomProperty(page, '--color-primary')).toBe(
      EXPECTED_COLOR_PRIMARY_HEX,
    )
    await expect(page.locator('main h1')).toHaveText(fixture.name)

    // ⚠ SINIR (architect/po, bağlayıcı, GİZLENMİYOR): bu sürümde TEK tema
    // kayıt defterinde (`modern@0.1.0`) — iki yol da AYNI girdiye varıyor.
    // "Farklı kiracı farklı tema görür" burada KANITLANMIYOR; bu, ikinci bir
    // tema/kayıt defteri girdisi eklendiğinde (v0.3.0) kanıtlanacak.
  })
})

test.describe('AC6 — kiracı sayfası immutable DEĞİL (BN-2 mekanik kanıt, DEĞER tarafı)', () => {
  test(`${DEMO_TENANT_HOST}: Cache-Control cache-policy.ts'ten geliyor, "immutable" İÇERMİYOR`, async ({
    request,
  }) => {
    const response = await request.get(storefrontUrl(DEMO_TENANT_HOST))
    const cacheControl = response.headers()['cache-control']

    expect(cacheControl).toBe(STOREFRONT_CACHE_CONTROL)
    expect(cacheControl).not.toContain('immutable')

    // ⚠ Bu test yalnızca KİRACI SAYFASININ (SSR HTML, DEĞER) başlığını
    // ölçer. `/_astro/*`'ta KALAN kural (adaptörün sabit
    // `max-age=31536000, immutable` başlığı, tema bileşenlerinin scoped
    // `<style>`'ı) BİLİNÇLİ ve BEKLENEN (K1'in "KURAL `/_astro/*`'ta kalır"
    // yarısı) — AC6'nın o yarısı (`rg -c "color-primary" dist/client/
    // _astro/**` → 0) bu dosyanın DIŞINDA, build çıktısı üzerinde AYRI bir
    // komutla ölçülür (handoff'ta ham çıktı).
  })
})
