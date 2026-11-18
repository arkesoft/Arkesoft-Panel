// @arkesoft/superadmin — 2FA kurulum sihirbazı: sayfa yenilemede sır KORUNUR
// (ROADMAP v0.0.20.1, T-022/S5, AC-1 + AC-2 — bu sürümün TEK uçtan uca
// kapısı, R-PO1'in gerekçesi; `apps/admin/e2e/two-factor-setup-reload.
// spec.ts`'in AYNI amacı. Şifre adımını gönderip `secret=`'i okuyan ortak
// adım `scripts/playwright/two-factor-wizard.ts`'e taşındı (T-022/S10 FIX
// turu 1, `solid` M-2) — akış farkları (giriş yolu, sihirbaz açma, fixture,
// bitiş kanıtı, bütçe) BİLEREK bu dosyada kalır, ortaklaştırılmaz.
//
// ⚠⚠ NEDEN BU SPEC VAR (R-PO1, bağlayıcı): `TOTP_NOT_ENABLED` literali
// admin/superadmin kontrolcüleri VE `apps/api`'nin sözleşme testinde (S3)
// ÜÇ yerde yaşıyor, aralarında MEKANİK BAĞ YOK. S3 yalnızca SUNUCU tarafını
// pinler; FRONTEND'in `resolveTotpUriAction`'ı yanlış yazmasını YAKALAMAZ.
// Bu spec AC-1'i (reload sonrası `secret=` EŞİT) UÇTAN UCA doğrulayan TEK
// kapıdır.
//
// AKIŞ (A-A22-4 — superadmin: 2FA ZORUNLU KAPI): `iki-adimli-dogrulama.
// tsx:126`'nın `wizardStarted` `useState`'i de MOUNT'A bağlı —
// `page.reload()` bunu `false`'a sıfırlar. Ama kapıya ULAŞMAK (`/`'den
// `/iki-adimli-dogrulama`'ya yönlenme) OTOMATİKTİR — admin'in "önce sayfaya
// git" adımı burada YOK, `beforeLoad` guard'ı HER navigasyonda kendisi
// karar verir. Bu yüzden reload sonrası kullanıcı yalnızca "Kurulumu
// başlat" düğmesini TEKRAR tıklar (admin'in "Etkinleştir" ile AYNI sınıf
// davranış, farklı giriş noktası).
//
// AC18 BÜTÇESİ: `createVerifiedFixtureUser` TEK çağrıda 1 sign-up + 1
// sign-in üretir (helper'ın kendi disiplini, `superadmin-authz.spec.ts`'in
// AYNI deseni) — İKİNCİ bir `sign-in` GEREKMEZ (storageState ile context
// açılır, UI'da TEKRAR giriş yapılmaz). `e2e/auth-budget.ts`'in
// `SPEC_AUTH_COST` satırıyla EŞLEŞİR.
import { expect, test, type APIRequestContext } from '@playwright/test'

import {
  createVerifiedFixtureUser,
  deleteFixtureUserByEmail,
  deletePlatformAuditLogByActor,
  grantPlatformAdmin,
} from './fixtures/platform-admin.js'

import { generateTotpCode } from '../../../scripts/playwright/totp.js'
import { submitPasswordAndCaptureTotpSecret } from '../../../scripts/playwright/two-factor-wizard.js'

// Bu dosya TEK test taşır (`superadmin-flow.spec.ts`'in AYNI tek-testli
// `describe` deseni) — `.serial` GEREKMEZ.
test.describe('2FA kurulum sihirbazı — reload sonrası sır korunur (T-022/S5, AC-1, zorunlu kapı akışı)', () => {
  let email: string | undefined
  let userId: string | undefined
  let password: string | undefined
  let storageState: Awaited<ReturnType<APIRequestContext['storageState']>> | undefined

  test.beforeAll(async ({ playwright }) => {
    const fixture = await createVerifiedFixtureUser(playwright, 'e2e-2fa-reload')
    email = fixture.email
    userId = fixture.userId
    password = fixture.password

    // Platform yöneticisi YAPILIR, 2FA BİLEREK KURULMAZ — bu testin konusu
    // TAM OLARAK 2FA kurulum sihirbazının KENDİSİ (`enableTotpTwoFactor`
    // fixture'ı burada ÇAĞRILMAZ, `superadmin-authz.spec.ts`'in AC-4(a)
    // testiyle AYNI başlangıç durumu).
    grantPlatformAdmin(fixture.userId)

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

  test('şifre adımı reload öncesi/sonrası AYNI secret= döner; ilk sırdan üretilen kod reload SONRASI hâlâ kabul edilir (AC-1)', async ({
    browser,
  }) => {
    if (storageState === undefined || password === undefined) {
      throw new Error('beforeAll fixture kurulumu tamamlanmadı')
    }
    const resolvedPassword = password

    const context = await browser.newContext({ storageState })
    const page = await context.newPage()

    await page.goto('/')
    await expect(page).toHaveURL(/\/iki-adimli-dogrulama$/)
    await page.getByRole('button', { name: 'Kurulumu başlat', exact: true }).click()

    // ---- Reload ÖNCESİ: sihirbaz başlatılır, şifre gönderilir, secret OKUNUR. ----
    const secretBefore = await submitPasswordAndCaptureTotpSecret(page, resolvedPassword)

    // ---- Sayfa yenilemesi — gerçek tarayıcı navigasyonu. ----
    await page.reload()
    await expect(page).toHaveURL(/\/iki-adimli-dogrulama$/)

    // ⚠⚠ A-A22-4 — zorunlu kapı: `wizardStarted` reload'da `false`'a
    // sıfırlanır, duvar yeniden "Kurulumu başlat" düğmesini gösterir;
    // KAPIYA ULAŞMAK (bu satırdan ÖNCEki yönlendirme) OTOMATİKTİR — admin'in
    // "sayfaya git" adımı burada YOK.
    await expect(page.getByRole('button', { name: 'Kurulumu başlat', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Kurulumu başlat', exact: true }).click()

    // ---- Reload SONRASI: AYNI şifre TEKRAR gönderilir, secret TEKRAR OKUNUR. ----
    const secretAfter = await submitPasswordAndCaptureTotpSecret(page, resolvedPassword)

    // ====== RAPORA GİRER (AC-1, ham secret karşılaştırması) ======
    expect(secretAfter).toBe(secretBefore)

    // ---- İLK sırdan (reload ÖNCESİ okunan) üretilen kod reload SONRASI
    // hâlâ KABUL edilir mi? — canlı defektin BİREBİR tersi.
    const code = generateTotpCode({ base32Secret: secretBefore })
    await page.getByLabel('Doğrulama kodu').fill(code)
    await page.getByRole('button', { name: 'Doğrula' }).click()

    // ====== RAPORA GİRER (AC-1, verify-totp kabul kanıtı — kurulum
    // tamamlanınca `onCompleted` '/' e yönlendirir) ======
    await expect(page).toHaveURL(/\/$/)

    await context.close()
  })
})
