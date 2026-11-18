// @arkesoft/admin — erişilebilirlik (axe-core) e2e taraması (ROADMAP
// v0.0.20.3, T-024/S5, ADR-0025, docs/testing.md).
//
// İKİ TARAMA (mimari/po kararı, bağlayıcı):
//   1. `/sign-in` — OTURUMSUZ (`scanName: 'admin-sign-in'`, sıfır auth
//      maliyeti).
//   2. `/hesap/guvenlik` — `ActiveSessionsCard`'ın oturum iptal
//      `ConfirmDialog`'u AÇIKKEN (`scanName: 'admin-account-security-
//      dialog'`) — axe kapalı bir dialog'u TARAYAMAZ (DOM'da yok), bu
//      yüzden AÇIK hâliyle taranır (architect raporu, "axe'ın
//      yakalamadıkları" tablosu, "açılmamış içerik" satırı).
//
// ⚠⚠ "SONLANDIR" TETİKLEYİCİSİ İKİNCİ BİR OTURUM GEREKTİRİR
// (`ActiveSessionsCard.tsx`: `!row.isCurrent ? <Button…Sonlandır…> : null`)
// — tek oturumla bu satır HİÇ render EDİLMEZ. ⚠⚠ ORKESTRATÖR DÜZELTMESİ
// (bağlayıcı — bu dosyanın ÖNCEKİ sürümü ikinci satırı bir SQL `INSERT`'le
// üretiyordu; Orkestratör kendi "ek sign-in/sign-up maliyeti SIFIR" kısıtının
// GEREKSİZ DARALTICI olduğunu ÖLÇTÜ: gerçek bütçe `signIn 10/20`,
// `signUp 8/10` — `signIn`'e bir pay EKLEMEK sınırın çok altında kalıyor):
// ikinci oturum şimdi AYNI fixture kullanıcısıyla GERÇEK bir İKİNCİ
// `/auth/sign-in/email` çağrısıyla üretiliyor — SQL `INSERT` YOK, yeni bir
// SQL-yazma yüzeyi YOK (`security`/`solid`'in bulgu yazacağı sınıf
// kapandı). `requireEmailVerification: true` (apps/api `auth-instance.
// ts:702`) yüzünden sign-up/verify-email OTOMATİK oturum AÇMIYOR (ÖLÇÜLDÜ,
// probe: sign-up yanıtı `token:null`) — bu yüzden `signUp` 1'de KALIYOR,
// yalnızca `signIn` 2'ye çıkıyor. Temizlik: `app_user` silinince
// `session.user_id`'nin `onDelete: Cascade`'i (schema.prisma:283) İKİ
// oturum satırını da GİDERİR — AYRI bir DELETE GEREKMİYOR (ikinci sign-in
// de aynı kullanıcıya bağlı, ayrı bir fixture kullanıcısı AÇILMADI).
//
// ⚠ AC18 BÜTÇESİ (bağlayıcı, `auth-budget.ts`): bu dosyanın payı TAM
// OLARAK 1 `sign-up` + 2 `sign-in`.
//
// ⚠⚠ AC-21 — İKİNCİ test üç GERÇEK `incomplete` bulgusuyla karşılaşır
// (mimarinin keşif ölçümü: `aria-hidden-focus`×3, `color-contrast`×1,
// `label-content-name-mismatch`×1 — hepsi `admin-account-security-dialog`
// taramasında). Üçü de `scripts/playwright/a11y.ts`'in
// `ACKNOWLEDGED_INCOMPLETE_RULE_IDS` veri tablosunda GEREKÇELİ birer ack
// girdisiyle KAYITLI (S5'in eklediği, `a11y.ts`'in MANTIK satırlarına
// DOKUNULMADI) — sessizce yutulmuyorlar, `testInfo.annotations`'a AD AD
// yazılıyorlar (helper'ın KENDİ, S3'te öz-testle kanıtlanmış mekanizması).
//
// `test.describe.serial` + `playwright.config.ts`'in `workers: 1`'i —
// `panel-flow.spec.ts`/`registration-flow.spec.ts`'in AYNI disiplini.
import { expect, test, type APIRequestContext } from '@playwright/test'

import { deleteFixtureUserByEmail } from './fixtures/tenant-cleanup.js'
import { createVerifiedFixtureUser, type FixtureUser } from './helpers/verified-fixture-user.js'

import { expectNoAccessibilityViolations } from '../../../scripts/playwright/a11y.js'

test.describe.serial('Admin erişilebilirlik taraması (T-024/S5, AC-19/AC-20/AC-21)', () => {
  // T-020/S5'in AYNI disiplini (bkz. `registration-flow.spec.ts`): `beforeAll`
  // BAŞARISIZ olursa `afterAll` yine çalışır, `fixtureUser` GERÇEKTEN
  // `undefined` kalabilir.
  let fixtureUser: FixtureUser | undefined
  // ⚠ DÜZELTME (L2, `security` gate tur 1 bulgusu): `| undefined` EKLENDİ —
  // TS'in kesin-atama analizi `beforeAll`/`test` closure sınırını GEÇMEZ, bu
  // yüzden tipin KENDİSİ (`beforeAll` başarısız olursa bu değişken ÇALIŞMA
  // ZAMANINDA `undefined` kalabilir) bu alanın sağladığından FAZLA bir
  // garanti VAAT EDİYORDU. `apps/superadmin/e2e/accessibility.spec.ts:53,
  // 102-104` emsali — AYNI muhakeme `fixtureUser`'da (bir satır yukarıda)
  // ZATEN uygulanmıştı, gerekçesiz asimetri kapatıldı.
  let storageStateAfterSignIn: Awaited<ReturnType<APIRequestContext['storageState']>> | undefined

  // ---------------------------------------------------------------------
  // Bu dosyanın TEK `sign-up` + İKİ `sign-in` çağrısı (dosya başı yorumu,
  // AC18 bütçesi 1/2 — Orkestratör düzeltmesi: ikinci oturum GERÇEK bir
  // ikinci `/auth/sign-in/email` çağrısıyla üretiliyor, AYNI fixture
  // kullanıcısıyla — `signUp` 1'de kalıyor).
  // ---------------------------------------------------------------------
  test.beforeAll(async ({ playwright, baseURL }) => {
    if (baseURL === undefined) {
      throw new Error('playwright.config.ts içinde use.baseURL tanımlı değil')
    }
    const requestContext = await playwright.request.newContext({ baseURL })

    fixtureUser = await createVerifiedFixtureUser(requestContext, 'e2e-a11y')

    // Birinci sign-in — bu oturumun `storageState`'i `/hesap/guvenlik`
    // ziyaretinde kullanılacak "current" (isCurrent=true) satır olacak.
    const signInResponse = await requestContext.post('/auth/sign-in/email', {
      data: { email: fixtureUser.email, password: fixtureUser.password },
    })
    expect(signInResponse.ok()).toBe(true)

    storageStateAfterSignIn = await requestContext.storageState()
    await requestContext.dispose()

    // İkinci sign-in — AYRI bir `APIRequestContext` (farklı çerez kavanozu,
    // `session-security-dialog-focus.qa.spec.ts`'in AYNI deseni): bu
    // oturumun çerezi hiçbir yerde kullanılmıyor, yalnızca `session`
    // tablosunda İKİNCİ bir satır üretmek için var — "Sonlandır" butonu
    // bu satırın `isCurrent=false` olmasından render edilir.
    const secondaryRequest = await playwright.request.newContext({ baseURL })
    const secondarySignIn = await secondaryRequest.post('/auth/sign-in/email', {
      data: { email: fixtureUser.email, password: fixtureUser.password },
    })
    expect(secondarySignIn.ok()).toBe(true)
    await secondaryRequest.dispose()
  })

  // ---------------------------------------------------------------------
  // (1) `/sign-in` — oturumsuz, sıfır auth maliyeti (AC-19/AC-20).
  // ---------------------------------------------------------------------
  test('/sign-in oturumsuz erişilebilirlik ihlali taşımıyor (AC-19/AC-20)', async ({
    page,
  }, testInfo) => {
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { level: 1, name: 'Giriş yap' })).toBeVisible()

    await expectNoAccessibilityViolations(page, 'admin-sign-in', testInfo)
  })

  // ---------------------------------------------------------------------
  // (2) `/hesap/guvenlik` — `ActiveSessionsCard`'ın oturum iptal
  // `ConfirmDialog`'u AÇIKKEN (AC-19/AC-20/AC-21). İkinci (gerçek) oturum
  // `beforeAll`'da zaten açıldı — "Sonlandır" tetikleyicisi bu yüzden
  // render edilir.
  // ---------------------------------------------------------------------
  test('/hesap/guvenlik — oturum sonlandırma diyaloğu AÇIKKEN erişilebilirlik ihlali taşımıyor (AC-19/AC-20/AC-21)', async ({
    browser,
  }, testInfo) => {
    if (storageStateAfterSignIn === undefined) {
      throw new Error('beforeAll fixture kurulumu tamamlanmadı')
    }

    const context = await browser.newContext({ storageState: storageStateAfterSignIn })
    const page = await context.newPage()

    await page.goto('/hesap/guvenlik')

    const terminateTrigger = page.getByRole('button', { name: /oturumunu sonlandır/ })
    await expect(terminateTrigger).toBeVisible()
    await terminateTrigger.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await expectNoAccessibilityViolations(page, 'admin-account-security-dialog', testInfo)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await context.close()
  })

  // T-020/S5'in AYNI teardown disiplini — `app_user` silinince İKİ oturum
  // satırı da `onDelete: Cascade` ile birlikte gider (dosya başı yorumu),
  // AYRI bir DELETE GEREKMİYOR — ikinci sign-in AYRI bir fixture
  // kullanıcısı AÇMADI, AYNI `fixtureUser.email`'e bağlı.
  test.afterAll(() => {
    if (fixtureUser !== undefined) {
      deleteFixtureUserByEmail(fixtureUser.email)
    }
  })
})
