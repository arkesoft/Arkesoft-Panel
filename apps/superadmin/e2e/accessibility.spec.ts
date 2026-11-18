// @arkesoft/superadmin — erişilebilirlik (axe-core) e2e taraması (ROADMAP
// v0.0.20.3, T-024/S6, ADR-0025, docs/testing.md).
//
// İKİ TARAMA (architect/po kararı, bağlayıcı — T-024.md "İŞ" bölümü):
//   1. `/giris` — OTURUMSUZ (`scanName: 'superadmin-sign-in'`, sıfır auth
//      maliyeti).
//   2. `/` — oturum içi, sidebar'lı kabuk (`scanName: 'superadmin-
//      dashboard'`). Platform yöneticisi 2FA KURULU olmalı — kurulu
//      OLMAYAN bir hesap `/iki-adimli-dogrulama`'ya yönlenir
//      (`superadmin-authz.spec.ts` AC-4(a)) ve asıl kabuk hiç render
//      EDİLMEZ; bu dosya bu yüzden `enableTotpTwoFactor`'ü ÇAĞIRIR.
//
// Mimarinin keşif ölçümü (T-024.md "KEŞİF ÖLÇÜMÜ — SONUÇLAR") bu iki
// sayfanın `violations`/`incomplete` ikisinde de **0** olduğunu buldu —
// `scripts/playwright/a11y.ts`'in `ALLOWED_VIOLATIONS`/
// `ACKNOWLEDGED_INCOMPLETE_RULE_IDS` tablolarında bu dosyanın `scanName`'leri
// için HİÇBİR girdi YOK (ikisi de boşsa boş kalır) — bir girdi EKLENİRSE ve
// karşılık gelen bulgu gerçek değilse `expectNoAccessibilityViolations`
// BAYAT girdi olarak testi KIRAR (yardımcının dosya başı notu (c)).
//
// `/giris`'te `h1` YOK bulgusu (mimari `VARSAYIM A-T24-3`, borç `D21`) axe
// tarafında İŞARETLENMEZ — `page-has-heading-one` best-practice etiketinde,
// `WCAG_RULE_TAGS` kümesinde (wcag2a/wcag2aa/wcag21a/wcag21aa) YOK; bu
// dosya o borcu TEKRARLAMAZ, `apps/superadmin/src`'e DOKUNMAZ.
//
// AC18/AC-25 bütçesi (bağlayıcı, `auth-budget.ts`): bu dosyanın payı TAM
// OLARAK 1 `sign-up` + 1 `sign-in` — `createVerifiedFixtureUser`'ın TEK
// zinciri (`superadmin-flow.spec.ts`'in AYNI deseni); `enable`/`verify-totp`
// İKİNCİ bir kimlik doğrulama çağrısı GEREKTİRMEZ (S1'in "aynı
// sessionCookiePair zincir boyunca geçerli" ölçümü, `fixtures/
// platform-admin.ts` dosya başı notu).
//
// Temizlik — İKİ çağrı, biri YETMEZ (`sidebar-focus-return.qa.spec.ts:
// 58-68`'in AYNI deseni): `deleteFixtureUserByEmail` HEM
// `deletePlatformAuditLogByActor` — `platform_audit_log.actor_user_id`'de
// FK YOK, `app_user` silinince CASCADE İLE GİTMEZ (fixture dosyasının kendi
// notu). `global-teardown.ts`'in süpürmesi YEDEK, birincil önlem DEĞİL.
import { expect, test, type APIRequestContext } from '@playwright/test'

import {
  createVerifiedFixtureUser,
  deleteFixtureUserByEmail,
  deletePlatformAuditLogByActor,
  enableTotpTwoFactor,
  grantPlatformAdmin,
} from './fixtures/platform-admin.js'

import { expectNoAccessibilityViolations } from '../../../scripts/playwright/a11y.js'

test.describe('Süper admin erişilebilirlik taraması (T-024/S6, AC-19/AC-20/AC-21)', () => {
  let email: string | undefined
  let userId: string | undefined
  let storageState: Awaited<ReturnType<APIRequestContext['storageState']>> | undefined

  // ---------------------------------------------------------------------
  // Bu dosyanın TEK `sign-up` + TEK `sign-in` çağrısı (dosya başı yorumu,
  // AC18/AC-25 bütçesi 1/1) — `createVerifiedFixtureUser` ikisini TEK
  // zincirde üretir, `enableTotpTwoFactor` İKİNCİ bir kimlik doğrulama
  // çağrısı EKLEMEZ.
  // ---------------------------------------------------------------------
  test.beforeAll(async ({ playwright }) => {
    const fixture = await createVerifiedFixtureUser(playwright, 'e2e-superadmin-a11y')
    email = fixture.email
    userId = fixture.userId

    grantPlatformAdmin(fixture.userId)
    await enableTotpTwoFactor(fixture.request, fixture.password)

    storageState = await fixture.request.storageState()
    await fixture.request.dispose()
  })

  test.afterAll(() => {
    if (userId !== undefined) {
      deletePlatformAuditLogByActor(userId)
    }
    if (email !== undefined) {
      deleteFixtureUserByEmail(email)
    }
  })

  // ---------------------------------------------------------------------
  // (1) `/giris` — oturumsuz, sıfır auth maliyeti (AC-19/AC-20).
  // ---------------------------------------------------------------------
  test('/giris oturumsuz erişilebilirlik ihlali taşımıyor (AC-19/AC-20)', async ({
    page,
  }, testInfo) => {
    await page.goto('/giris')
    await expect(page.getByRole('heading', { level: 1, name: 'Giriş yap' })).toBeVisible()

    await expectNoAccessibilityViolations(page, 'superadmin-sign-in', testInfo)
  })

  // ---------------------------------------------------------------------
  // (2) `/` — oturum içi, sidebar'lı kabuk (AC-19/AC-20/AC-21). 2FA
  // `beforeAll`'da zaten kurulu olduğu için `_app.tsx` guard'ı asıl
  // kabuğu (mağaza listesi + `Sidebar`) render eder.
  // ---------------------------------------------------------------------
  test('/ (sidebar) oturum içi erişilebilirlik ihlali taşımıyor (AC-19/AC-20/AC-21)', async ({
    browser,
  }, testInfo) => {
    if (storageState === undefined) {
      throw new Error('beforeAll fixture kurulumu tamamlanmadı')
    }

    const context = await browser.newContext({ storageState })
    const page = await context.newPage()

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Mağazalar' })).toBeVisible()

    await expectNoAccessibilityViolations(page, 'superadmin-dashboard', testInfo)

    await context.close()
  })
})
