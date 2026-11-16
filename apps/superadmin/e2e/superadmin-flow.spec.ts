// @arkesoft/superadmin — süper admin ana akışı (ROADMAP v0.0.20, T-021/S10)
//
// AC-7: en az İKİ fixture kiracısı için liste `slug`/`mağaza adı`/`plan`/
// `durum`/`oluşturulma`'yı GERÇEK değerlerle gösterir (metin eşlemesi, sayfa
// varlığı DEĞİL); sıra deterministik.
// AC-8 (SAYARAK): `platform_audit_log` satır sayısı akış ÖNCESİ `n`, SONRASI
// TAM `n+2` — `platform.tenantList`'e TEK, DOĞRUDAN (tarayıcı/React Query'den
// BAĞIMSIZ) bir çağrı `platform_admin_signed_in` (idempotent, bu session için
// İLK geçiş) VE `tenant_impersonation_started` (`plan` bağının OKUNMASI,
// ADR-0023 §3) satırlarını TEK istekte üretir — StrictMode'un çift mount'una/
// `refetchOnWindowFocus`'a bağımlı OLMADAN deterministik ölçüm (dosya başı
// notu `fixtures/platform-admin.ts`'te).
//
// AC18 bütçesi: 1 `sign-up` + 1 `sign-in` (TEK kullanıcı — platform
// yöneticisi VE iki kiracının sahibi AYNI kullanıcı; `enable`/`verify-totp`/
// `createTenant`/`platform.*` İKİNCİ bir kimlik doğrulama çağrısı
// GEREKTİRMEZ, S1'in ölçtüğü "aynı sessionCookiePair zincir boyunca geçerli"
// davranışı) — `e2e/auth-budget.ts`'in beyanıyla EŞLEŞİR.
import { expect, test, type APIRequestContext } from '@playwright/test'

import {
  countPlatformAuditLogRows,
  callTenantListDirectly,
  createE2eTenant,
  createVerifiedFixtureUser,
  deleteFixtureTenantBySlug,
  deleteFixtureUserByEmail,
  deletePlatformAuditLogByActor,
  enableTotpTwoFactor,
  grantPlatformAdmin,
  queryTenantRealValues,
  type CreatedE2eTenant,
} from './fixtures/platform-admin.js'

// ⚠⚠ `.serial` KULLANILMAZ — AC-8 ile AC-7 arasında SIRA bağımlılığı YOK
// (ikisi de SADECE `beforeAll`'un ürettiği aynı durumu okur); `superadmin-
// authz.spec.ts`'in dosya başı notuyla AYNI ÖLÇÜLMÜŞ gerekçe — `.serial`
// bir test başarısız olduğunda kardeşini "did not run" ile atlar,
// `fullyParallel:false` ZATEN sıralı yürütmeyi garanti ediyor.
test.describe('Süper admin ana akışı (T-021/S10)', () => {
  let request: APIRequestContext | undefined
  let email: string | undefined
  let userId: string | undefined
  let storageState: Awaited<ReturnType<APIRequestContext['storageState']>> | undefined
  let olderTenant: CreatedE2eTenant | undefined
  let newerTenant: CreatedE2eTenant | undefined

  test.beforeAll(async ({ playwright }) => {
    const fixture = await createVerifiedFixtureUser(playwright, 'e2e-superadmin-flow')
    email = fixture.email
    userId = fixture.userId
    request = fixture.request

    grantPlatformAdmin(fixture.userId)
    await enableTotpTwoFactor(fixture.request, fixture.password)

    // Sırayla İKİ kiracı — `createdAt desc` sıralamasının deterministik
    // kanıtı: `newerTenant` HER ZAMAN `olderTenant`'TAN ÖNCE listelenir
    // (ikinci oluşturulanın `createdAt`'i birincininkinden ≥'dir).
    olderTenant = await createE2eTenant(fixture.request, {
      namePrefix: 'E2E Süper Admin Mağaza A',
      siteType: 'ecommerce',
    })
    newerTenant = await createE2eTenant(fixture.request, {
      namePrefix: 'E2E Süper Admin Mağaza B',
      siteType: 'corporate',
    })

    storageState = await fixture.request.storageState()
  })

  test.afterAll(async () => {
    if (olderTenant !== undefined) {
      deleteFixtureTenantBySlug(olderTenant.slug)
    }
    if (newerTenant !== undefined) {
      deleteFixtureTenantBySlug(newerTenant.slug)
    }
    if (userId !== undefined) {
      deletePlatformAuditLogByActor(userId)
    }
    if (email !== undefined) {
      deleteFixtureUserByEmail(email)
    }
    if (request !== undefined) {
      await request.dispose()
    }
  })

  test('AC-8 (SAYARAK) — platform.tenantList TEK çağrı platform_audit_log sayısını tam +2 artırır', async () => {
    if (request === undefined) {
      throw new Error('beforeAll fixture kurulumu tamamlanmadı')
    }

    const before = countPlatformAuditLogRows()

    const response = await callTenantListDirectly(request)
    expect(response.status).toBe(200)

    const after = countPlatformAuditLogRows()

    // ====== RAPORA GİRER (AC-8, ham sayım) ======
    expect(after).toBe(before + 2)
  })

  test('AC-7 — kiracı listesi en az iki fixture kiracısı için gerçek değerlerle, deterministik sırayla görünür', async ({
    browser,
  }) => {
    if (storageState === undefined || olderTenant === undefined || newerTenant === undefined) {
      throw new Error('beforeAll fixture kurulumu tamamlanmadı')
    }
    // `let` değişkenleri yerel `const`'a sabitlenir — TypeScript'in
    // dallanmış (narrowed) tipini aşağıdaki iç içe callback'lere TAŞIR
    // (yukarıdaki koruma `let`'in gelecekte yeniden atanabileceğini
    // varsaydığı için callback'lerin İÇİNDE narrowing KAYBOLUR).
    const resolvedOlderTenant = olderTenant
    const resolvedNewerTenant = newerTenant

    const olderRealValues = queryTenantRealValues(resolvedOlderTenant.slug)
    const newerRealValues = queryTenantRealValues(resolvedNewerTenant.slug)

    const context = await browser.newContext({ storageState })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Mağazalar' })).toBeVisible()

    const table = page.getByRole('table')
    await expect(table).toBeVisible()

    const olderRow = table.locator('tbody tr', {
      has: page.getByText(resolvedOlderTenant.slug, { exact: true }),
    })
    const newerRow = table.locator('tbody tr', {
      has: page.getByText(resolvedNewerTenant.slug, { exact: true }),
    })
    await expect(olderRow).toHaveCount(1)
    await expect(newerRow).toHaveCount(1)

    // Sütun sırası (`TenantListView.tsx`): mağaza adı · adres (slug) · plan ·
    // durum · oluşturulma — her hücre TEK TEK `toHaveText` (metin eşlemesi,
    // sayfa varlığı DEĞİL).
    const olderCells = olderRow.locator('td')
    await expect(olderCells.nth(0)).toHaveText(resolvedOlderTenant.name)
    await expect(olderCells.nth(1)).toHaveText(resolvedOlderTenant.slug)
    await expect(olderCells.nth(2)).toHaveText(olderRealValues.planName)
    await expect(olderCells.nth(3)).toHaveText('Beklemede')
    await expect(olderCells.nth(4)).toHaveText(
      formatExpectedPlatformDate(olderRealValues.createdAtIso),
    )

    const newerCells = newerRow.locator('td')
    await expect(newerCells.nth(0)).toHaveText(resolvedNewerTenant.name)
    await expect(newerCells.nth(1)).toHaveText(resolvedNewerTenant.slug)
    await expect(newerCells.nth(2)).toHaveText(newerRealValues.planName)
    await expect(newerCells.nth(3)).toHaveText('Beklemede')
    await expect(newerCells.nth(4)).toHaveText(
      formatExpectedPlatformDate(newerRealValues.createdAtIso),
    )

    // Sıra deterministik: sonradan oluşturulan (`newerTenant`) HER ZAMAN ÖNCE
    // listelenir (`createdAt desc`) — satır indeksleriyle doğrulanır.
    const allRows = table.locator('tbody tr')
    const rowTexts = await allRows.allTextContents()
    const olderPosition = rowTexts.findIndex((text) => text.includes(resolvedOlderTenant.slug))
    const newerPosition = rowTexts.findIndex((text) => text.includes(resolvedNewerTenant.slug))
    expect(newerPosition).toBeGreaterThanOrEqual(0)
    expect(olderPosition).toBeGreaterThanOrEqual(0)
    expect(newerPosition).toBeLessThan(olderPosition)

    // Denetim kaydı sayfası — AC-8'in ÜRETTİĞİ iki satırın GÖRÜNÜRLÜĞÜ (ayrı
    // bir sayım DEĞİL, görüntüleme kanıtı — AC-8'in sayımı YUKARIDA ayrı
    // testte TAMAMLANDI).
    await page.getByRole('link', { name: 'Denetim kaydı' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Denetim kaydı' })).toBeVisible()
    const auditList = page.getByRole('list')
    await expect(auditList).toBeVisible()
    await expect(auditList.getByText('Giriş yaptı').first()).toBeVisible()
    await expect(auditList.getByText('Kiracı verisine erişti').first()).toBeVisible()

    await context.close()
  })
})

/** `apps/superadmin/src/lib/format-platform-date.ts`'in AYNI `Intl` çağrısı — import EDİLMEZ (apps/superadmin/src DOKUNULMAZ), yalnızca aynı standart API bağımsız tekrarlanır. */
function formatExpectedPlatformDate(isoDateTime: string): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(isoDateTime),
  )
}
