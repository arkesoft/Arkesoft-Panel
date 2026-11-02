// @arkesoft/storefront — TEK e2e spec (ROADMAP v0.0.8, T-009/S9, qa — ÜRETİM
// ROLÜNDE, e2e hattının KENDİSİ)
//
// YEREL, HERMETİK DEĞİL: `pnpm infra:up` + `pnpm db:migrate` + `pnpm db:seed`
// + çalışan `apps/api` süreci + `playwright install chromium` ÖN KOŞUL
// (orkestratör notu, bu dosya bunları BAŞLATMAZ — `global-setup.ts` yalnızca
// API'nin AYAKTA olduğunu DOĞRULAR).
//
// ⚠ KRİTİK BULGU (qa, T-009/S9 — ölçüldü, HEM `astro dev` HEM `astro
// build` + `node dist/server/entry.mjs` ÜRETİM modunda REPRODUCE EDİLDİ,
// 3/3 deterministik, flaky DEĞİL): `src/middleware.ts`'in (S6'nın dosyası)
// `context.rewrite('/404')`/`context.rewrite('/503')` çağrıları Astro'nun
// middleware zincirini REWRITE HEDEFİ için de YENİDEN çalıştırıyordu
// (`skipMiddleware` yalnızca Astro'nun KENDİ dahili 404 akışında true olur,
// uygulama kodunun `context.rewrite()`'ında DEĞİL — ölçüldü:
// `astro/dist/core/middleware/astro-middleware.js`, `state.counter`). Sonuç:
// `onRequest` AYNI çözümsüz `Host` başlığıyla kendi kendini 4 kez çağırır,
// Astro'nun dahili döngü koruması `state.counter === 4`'te "Loop Detected"
// (508) döner; bu yanıt `withStatus(...)` ile SARILDIĞI için DIŞARI görünen
// HTTP durumu (404/503) kodun NİYETİYLE TUTARLI OLABİLİR ama GÖVDE HER ZAMAN
// "Loop Detected" düz metni OLABİLİR — ASLA `404.astro`/`503.astro`'nun
// Türkçe HTML'i DEĞİL. Bu, mevcut `middleware.test.ts`'in (Vitest, `rewrite`
// MOCKLANMIŞ) hiç YAKALAYAMADIĞI bir regresyon sınıfıydı: mock, gerçek
// Astro'nun rewrite'ı middleware'i yeniden çalıştırdığı gerçeğini TAKLİT
// ETMİYOR.
//
// DÜZELTME TURU 1 (frontend, S6 — bu turda ÖLÇÜLEREK doğrulandı): `src/
// middleware.ts` artık `/404`/`/503` rewrite HEDEFİNDE erken çıkıp kiracı
// çözümünü TEKRARLAMIYOR, döngü hiç BAŞLAMIYOR — bu dosyadaki testlerin
// TAMAMI bugün YEŞİL (ham çıktı qa'nın T-009 düzeltme turu 1 handoff'unda).
// AŞAĞIDAKİ gövde assertion'ları (M4, qa'nın bu turdaki eki) bu düzeltmenin
// GELECEKTE KISMEN bozulması (durum doğru kalır, gövde "Loop Detected"e
// döner) durumunu da yakalar — `status()` tek başına bu sınıfa KÖR
// (dosya başı KRİTİK BULGU, MUTASYON KANITIYLA doğrulandı, qa raporunda).
import { expect, test } from '@playwright/test'
import type { APIResponse, Page, Response as PlaywrightResponse } from '@playwright/test'

import { storefrontUrl } from './e2e-port.js'
import {
  createCustomDomainTenantFixture,
  createSoftDeletedTenantFixture,
  deleteTenantFixture,
} from './fixtures/custom-domain-tenant.js'
import type { CustomDomainTenantFixture, TenantFixture } from './fixtures/custom-domain-tenant.js'
// M4 düzeltmesi (qa, T-009 düzeltme turu 1): beklenen 404 Türkçe dizesi TEK
// doğruluk kaynağından (`src/messages/messages.ts`) ithal edilir, teste
// sabit YAZILMAZ — dize değişirse bu test de DEĞİŞMEK ZORUNDA kalır,
// sessizce yanlış kalmaz.
import { MESSAGES } from '../src/messages/messages.js'

const BASE_DOMAIN = 'arkesoft.localhost'
const DEMO_TENANT_HOST = `demo-magaza.${BASE_DOMAIN}`
// `packages/db/src/seed-data.ts`'in (`DEMO_SEED`, DOKUNULMADI) sabit
// değerleri — bu dosya o paketi İTHAL EDEMEZ (AC10, `apps/storefront/src/**`
// veritabanına dokunmaz; bu kısıt e2e'nin kendisine de uygulanıyor, bkz.
// `fixtures/custom-domain-tenant.ts` dosya başı yorumu). ROADMAP v0.0.8'in
// kabul kriteri METNİ zaten "tenant adını içeren sayfa" derken BU değeri
// kastediyor — literal TEKRARI burada BİLİNÇLİ.
const DEMO_TENANT_NAME = 'Demo Mağaza'
const DEMO_TENANT_SLUG = 'demo-magaza'
// ROADMAP v0.0.8 kabul kriterinin BİREBİR host'u.
const NEVER_EXISTED_HOST = `yok.${BASE_DOMAIN}`
// M4 düzeltmesi: Astro'nun KENDİ döngü koruması bu düz metni döner — hiçbir
// 404/503 sayfasının HTML'inde GEÇMEZ (bkz. dosya başı KRİTİK BULGU).
// Beklenen dizelerin TERSİ olduğu için `messages.ts`'ten İTHAL EDİLMEZ; bu
// zaten Astro'nun iç mesajı, Arkesoft'un i18n kataloğuna ait DEĞİL.
const LOOP_DETECTED_BODY = 'Loop Detected'

/** `page.goto`/`request.get` HER ZAMAN bir yanıt döner (yönlendirme/ağ hatası durumunda `null`/fırlatma olur) — bu yardımcı o garantiyi TİP GÜVENLİ hâle getirir (CLAUDE.md §4: "unknown + narrowing", `as` yok). */
function expectNavigationResponse(response: PlaywrightResponse | null): PlaywrightResponse {
  if (response === null) {
    throw new Error('page.goto beklenmedik şekilde null Response döndürdü')
  }
  return response
}

async function bodyTextOf(page: Page): Promise<string> {
  return page.locator('body').innerText()
}

test.describe.serial('AC4 — kiracı sayfası (200, gövdede tenant adı)', () => {
  test("demo-magaza.arkesoft.localhost kök yolu 200 döner ve gövde tenant ADINI içerir (SLUG'u değil)", async ({
    page,
  }) => {
    // `baseURL` (playwright.config.ts) zaten `http://demo-magaza.arkesoft.localhost:<PORT>` — relatif yol yeterli.
    const response = expectNavigationResponse(await page.goto('/'))
    expect(response.status()).toBe(200)

    const bodyText = await bodyTextOf(page)
    // MUTASYON KANITI (qa raporunda ham çıktıyla belgelendi): bu satır
    // GEÇİCİ olarak `DEMO_TENANT_SLUG` ile değiştirilip koşturuldu, test
    // KIRMIZIYA döndü (gövde "demo-magaza" slug'ını İÇERMİYOR, sadece
    // "Demo Mağaza" görünen adını içeriyor), sonra BU HALİNE geri alındı.
    expect(bodyText).toContain(DEMO_TENANT_NAME)
    expect(bodyText).not.toContain(DEMO_TENANT_SLUG)
  })
})

test.describe('AC5 — çözülemeyen kiracı (404, response.status() + gövde ile)', () => {
  // ⚠ Dosya başı KRİTİK BULGU: "yok" geçerli bir slug formatı olduğu için
  // `resolveHost` bunu `subdomain` dalına düşürür, API'ye ÇIKAR, API
  // `no_row` ile 404 döner. DÜZELTME TURU 1'den SONRA (ölçüldü) middleware
  // artık kendi kendini yeniden tetiklemiyor — durum VE gövde doğru.
  test(`${NEVER_EXISTED_HOST} kök yolu response.status() 404 döner (200+gövde KABUL EDİLMEZ)`, async ({
    page,
  }) => {
    const response = expectNavigationResponse(await page.goto(storefrontUrl(NEVER_EXISTED_HOST)))
    expect(response.status()).toBe(404)

    // M4 düzeltmesi (qa, T-009 düzeltme turu 1 — bağlayıcı): `status()` TEK
    // BAŞINA "durum doğru ama gövde 'Loop Detected'" regresyon sınıfına
    // YAPISAL OLARAK KÖR (dosya başı KRİTİK BULGU — `withStatus()` niyet
    // edilen durumu rewrite'ın GERÇEKTEN 404.astro'yu render edip
    // etmediğinden BAĞIMSIZ damgalar). MUTASYON KANITI (qa, bu turda,
    // Playwright route intercept ile `middleware.ts`'e DOKUNMADAN ölçüldü):
    // gövde sahte "Loop Detected" ile değiştirildiğinde yukarıdaki
    // `status()` assertion'ı YEŞİL KALDI, aşağıdaki gövde assertion'ları
    // KIRMIZIYA döndü — qa'nın T-009 düzeltme turu 1 handoff'unda ham çıktı.
    const bodyText = await bodyTextOf(page)
    expect(bodyText).toContain(MESSAGES.storefront.notFound.heading)
    expect(bodyText).not.toContain(LOOP_DETECTED_BODY)
  })
})

test.describe.serial('AC6 — soft-delete ≡ hiç var olmamış (bayt bayt)', () => {
  let fixture: TenantFixture

  test.beforeAll(() => {
    fixture = createSoftDeletedTenantFixture()
  })

  test.afterAll(() => {
    deleteTenantFixture(fixture)
  })

  // NOT: bu test İKİ host'un BİRBİRİNE göre bayt-bayt eşitliğini ölçer —
  // AC6'nın metni "hangi yanıtı" değil "ikisinin de AYNI yanıtı" istiyor.
  test('soft-delete edilmiş host ile hiç var olmamış host AYNI durumu AYNI gövdeyi döner', async ({
    request,
  }) => {
    const softDeletedHost = `${fixture.slug}.${BASE_DOMAIN}`

    const softDeletedResponse = await request.get(storefrontUrl(softDeletedHost))
    const neverExistedResponse = await request.get(storefrontUrl(NEVER_EXISTED_HOST))
    const softDeletedBody = await softDeletedResponse.text()
    const neverExistedBody = await neverExistedResponse.text()

    expect(softDeletedResponse.status()).toBe(neverExistedResponse.status())
    expect(softDeletedBody).toBe(neverExistedBody)
    expect(softDeletedResponse.headers()['cache-control']).toBe(
      neverExistedResponse.headers()['cache-control'],
    )

    // qa'nın kendi `low` bulgusu (T-009 qa gate turu — aynı dosya/düzenleme
    // olduğu için run.md [7] istisnasıyla bu turda kapatıldı): yukarıdaki üç
    // satır SADECE ikisinin BİRBİRİNE eşit olduğunu ölçer, HANGİ içeriğe eşit
    // olduklarını ÖLÇMEZ — bir regresyon ikisini de AYNI "Loop Detected"e
    // düşürse (dosya başı KRİTİK BULGU) üç assertion da YEŞİL KALIRDI.
    // Aşağıdaki iki satır BUNU kapatır: eşit oldukları gövdenin GERÇEKTEN
    // Türkçe 404 sayfası olduğunu, Astro'nun döngü-koruması düz metni
    // OLMADIĞINI doğrular.
    expect(softDeletedBody).toContain(MESSAGES.storefront.notFound.heading)
    expect(softDeletedBody).not.toContain(LOOP_DETECTED_BODY)
  })
})

test.describe.serial('AC7 — özel alan adı dalı (custom-domain) + AC14/AC15 çapraz host', () => {
  let fixture: CustomDomainTenantFixture

  test.beforeAll(() => {
    fixture = createCustomDomainTenantFixture()
  })

  test.afterAll(() => {
    deleteTenantFixture(fixture)
  })

  test('özel alan adıyla eşleşen kiracı 200 döner ve gövdede KENDİ adını taşır', async ({
    page,
  }) => {
    const response = expectNavigationResponse(await page.goto(storefrontUrl(fixture.primaryDomain)))
    expect(response.status()).toBe(200)

    const bodyText = await bodyTextOf(page)
    expect(bodyText).toContain(fixture.name)
    expect(bodyText).not.toContain(DEMO_TENANT_NAME)
  })

  test('AC14/AC15 — robots.txt/sitemap.xml: iki FARKLI host iki FARKLI çıktı üretir, çapraz URL SIFIR', async ({
    request,
  }) => {
    const demoRobots = await getText(
      await request.get(storefrontUrl(DEMO_TENANT_HOST, '/robots.txt')),
    )
    const customRobots = await getText(
      await request.get(storefrontUrl(fixture.primaryDomain, '/robots.txt')),
    )

    expect(demoRobots).toContain(`Sitemap: http://${DEMO_TENANT_HOST}`)
    expect(demoRobots).not.toContain(fixture.primaryDomain)
    expect(customRobots).toContain(`Sitemap: http://${fixture.primaryDomain}`)
    expect(customRobots).not.toContain(DEMO_TENANT_HOST)

    const demoSitemap = await getText(
      await request.get(storefrontUrl(DEMO_TENANT_HOST, '/sitemap.xml')),
    )
    const customSitemap = await getText(
      await request.get(storefrontUrl(fixture.primaryDomain, '/sitemap.xml')),
    )

    expect(demoSitemap).toContain(`<loc>http://${DEMO_TENANT_HOST}`)
    expect(demoSitemap).not.toContain(fixture.primaryDomain)
    expect(customSitemap).toContain(`<loc>http://${fixture.primaryDomain}`)
    expect(customSitemap).not.toContain(DEMO_TENANT_HOST)
  })

  // ⚠ Dosya başı KRİTİK BULGU: bilinmeyen host'ta "no_row" API'ye çıkar;
  // DÜZELTME TURU 1'den SONRA (ölçüldü) middleware artık kendi kendini
  // yeniden tetiklemiyor — her iki uç nokta da AYNI `renderNotFound()`
  // dalından geçip 404.astro'nun gövdesini döner.
  test("AC14/AC15 — bilinmeyen host'ta robots.txt VE sitemap.xml 404 döner", async ({
    request,
  }) => {
    const robotsResponse = await request.get(storefrontUrl(NEVER_EXISTED_HOST, '/robots.txt'))
    const sitemapResponse = await request.get(storefrontUrl(NEVER_EXISTED_HOST, '/sitemap.xml'))

    expect(robotsResponse.status()).toBe(404)
    expect(sitemapResponse.status()).toBe(404)

    // M4 düzeltmesi (qa, T-009 düzeltme turu 1 — bağlayıcı): burada da AYNI
    // gerekçe geçerli — `status()` tek başına rewrite zincirinin
    // self-rewrite döngüsüne çarpıp "Loop Detected" döndürdüğü durumu
    // YAKALAYAMAZ. Her iki uç nokta (`robots.txt`/`sitemap.xml`) middleware
    // seviyesinde AYNI 404 rewrite'ından geçtiği için gövde de 404.astro'nun
    // Türkçe HTML'i OLMALI, Astro'nun iç "Loop Detected" düz metni DEĞİL.
    const robotsBody = await getText(robotsResponse)
    const sitemapBody = await getText(sitemapResponse)

    expect(robotsBody).toContain(MESSAGES.storefront.notFound.heading)
    expect(robotsBody).not.toContain(LOOP_DETECTED_BODY)
    expect(sitemapBody).toContain(MESSAGES.storefront.notFound.heading)
    expect(sitemapBody).not.toContain(LOOP_DETECTED_BODY)
  })
})

test.describe('AC8 — çözümsüz sebep sınıfları (404, 5xx YOK)', () => {
  // Handoff'un önerdiği üç aday — ÜÇÜ DE `resolveHost`'un SENKRON (API'ye
  // ÇIKMAYAN) dallarıdır; dosya başı KRİTİK BULGU bu üçünü ETKİLEMEZ (her
  // seviyenin `withStatus(iç, 404)` ile SABİT 404 yazması, döngü derinliği
  // ne olursa olsun dışarı sabit 404 sızdırır — ölçüldü, 404/5xx AYRIMI
  // İÇİN yeterli, gövde içeriği İÇİN YETERLİ DEĞİL ama AC8'in metni gövdeyi
  // DEĞİL durumu test ediyor).
  const unresolvedHostCases: readonly (readonly [label: string, host: string])[] = [
    ['rezerve alt alan adı', `panel.${BASE_DOMAIN}`],
    ['iç içe alt alan adı', `a.b.${BASE_DOMAIN}`],
    ['çıplak taban alan adı', BASE_DOMAIN],
  ]

  for (const [label, host] of unresolvedHostCases) {
    test(`${label} (${host}) → 404, 5xx YOK`, async ({ request }) => {
      const response = await request.get(storefrontUrl(host))
      expect(response.status()).toBe(404)
      expect(response.status()).toBeLessThan(500)
    })
  }
})

test.describe('AC2 — JS kapalı/açık: SSR gövdesi ve hidrasyon', () => {
  test.describe('JavaScript KAPALI', () => {
    test.use({ javaScriptEnabled: false })

    test('SSR gövdesi tenant adını içerir, data-hydrated="false" kalır (hidrasyon öncesi anlamlı)', async ({
      page,
    }) => {
      await page.goto('/')

      const bodyText = await bodyTextOf(page)
      expect(bodyText).toContain(DEMO_TENANT_NAME)

      const hydratedAttribute = await page.locator('[data-hydrated]').getAttribute('data-hydrated')
      expect(hydratedAttribute).toBe('false')
    })
  })

  test('JavaScript AÇIK: hidrasyon SONRASI data-hydrated="true" olur (programatik kanıt)', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.locator('[data-hydrated="true"]')).toBeAttached({ timeout: 10_000 })
  })
})

/** `APIResponse.text()`'i narrowing'siz tüketmemek için küçük bir sarmalayıcı (CLAUDE.md §4 tutarlılığı, isimlendirme amaçlı). */
async function getText(response: APIResponse): Promise<string> {
  return response.text()
}
