// @arkesoft/admin — 2FA kurulum sihirbazı: sayfa yenilemede sır KORUNUR
// (ROADMAP v0.0.20.1, T-022/S5, AC-1 + AC-2 — bu sürümün TEK uçtan uca
// kapısı, R-PO1'in gerekçesi).
//
// ⚠⚠ NEDEN BU SPEC VAR (R-PO1, bağlayıcı): `TOTP_NOT_ENABLED` literali
// admin/superadmin kontrolcüleri VE `apps/api`'nin sözleşme testinde (S3)
// ÜÇ yerde yaşıyor, aralarında MEKANİK BAĞ YOK (kod-özdeşlik guard'ı
// `architect` tarafından HAKLI olarak reddedildi — iki dosya JSDoc'ta
// gerçekten farklı). S3 yalnızca SUNUCU tarafını pinler; FRONTEND'in
// `resolveTotpUriAction`'ı yanlış yazmasını YAKALAMAZ. Bu spec AC-1'i
// (reload sonrası `secret=` EŞİT) UÇTAN UCA (gerçek tarayıcı + gerçek
// reload + gerçek TOTP kodu) doğrulayan TEK kapıdır.
//
// AKIŞ (A-A22-4 — admin: 2FA GÖNÜLLÜ KART): `TwoFactorStatusCard.tsx:73`'in
// `wizardOpen` `useState`'i MOUNT'A bağlı — `page.reload()` bunu `false`'a
// SIFIRLAR. Bu yüzden reload SONRASI kullanıcı kartı ("Etkinleştir" düğmesi)
// TEKRAR AÇMAK ZORUNDADIR; bu spec bunu birebir uygular (superadmin'in
// "zorunlu kapı" akışından FARKLI — ADR-0024/po A-A22-4).
//
// AC18 BÜTÇESİ: `createVerifiedFixtureUser` (1 sign-up) + UI `sign-in`
// gönderimi (1 sign-in) — TEK fixture kullanıcısı, TEK test. `e2e/auth-
// budget.ts`'in `SPEC_AUTH_COST` satırıyla EŞLEŞİR.
//
// Şifre adımını gönderip `secret=`'i okuyan ortak adım (T-022/S10 FIX turu
// 1, `solid` M-2) `scripts/playwright/two-factor-wizard.ts`'e taşındı —
// `apps/superadmin/e2e/two-factor-setup-reload.spec.ts` ile BİREBİR aynı
// yardımcıyı paylaşır; akış farkları (giriş yolu, sihirbaz açma, fixture
// önek, bitiş kanıtı) BİLEREK bu dosyada kalır.
import { expect, test } from '@playwright/test'

import { createVerifiedFixtureUser } from './helpers/verified-fixture-user.js'
import { deleteFixtureUserByEmail } from './fixtures/tenant-cleanup.js'

import { generateTotpCode } from '../../../scripts/playwright/totp.js'
import { submitPasswordAndCaptureTotpSecret } from '../../../scripts/playwright/two-factor-wizard.js'

/** Bu dosyanın TEK testinin fixture kullanıcısı — `afterAll` sızıntıyı kapatır. */
const createdFixtureEmails: string[] = []

test.afterAll(() => {
  for (const email of createdFixtureEmails) {
    deleteFixtureUserByEmail(email)
  }
})

test.describe('2FA kurulum sihirbazı — reload sonrası sır korunur (T-022/S5, AC-1, gönüllü kart akışı)', () => {
  test('şifre adımı reload öncesi/sonrası AYNI secret= döner; ilk sırdan üretilen kod reload SONRASI hâlâ kabul edilir (AC-1)', async ({
    page,
    request,
  }) => {
    const { email, password } = await createVerifiedFixtureUser(request, 'e2e-2fa-reload')
    createdFixtureEmails.push(email)

    await page.goto('/sign-in')
    await page.getByLabel('E-posta adresi').fill(email)
    await page.getByLabel('Şifre').fill(password)
    await page.getByRole('button', { name: 'Giriş yap' }).press('Enter')
    await expect(page).toHaveURL(/\/$/)

    await page.goto('/hesap/guvenlik')
    await expect(page.getByRole('heading', { level: 1, name: 'Hesap güvenliği' })).toBeVisible()

    // ---- Reload ÖNCESİ: kart açılır, şifre gönderilir, secret OKUNUR. ----
    await page.getByRole('button', { name: 'Etkinleştir' }).click()
    const secretBefore = await submitPasswordAndCaptureTotpSecret(page, password)

    // ---- Sayfa yenilemesi — gerçek tarayıcı navigasyonu. ----
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Hesap güvenliği' })).toBeVisible()

    // ⚠⚠ A-A22-4 — gönüllü kart: `wizardOpen` reload'da `false`'a sıfırlanır,
    // kart NORMAL (kapalı) görünüme döner; kullanıcı "Etkinleştir"i TEKRAR
    // tıklamak ZORUNDADIR (superadmin'in otomatik yönlendirdiği "zorunlu
    // kapı" akışından FARKI budur).
    await expect(page.getByRole('button', { name: 'Etkinleştir' })).toBeVisible()
    await page.getByRole('button', { name: 'Etkinleştir' }).click()

    // ---- Reload SONRASI: AYNI şifre TEKRAR gönderilir, secret TEKRAR OKUNUR. ----
    const secretAfter = await submitPasswordAndCaptureTotpSecret(page, password)

    // ====== RAPORA GİRER (AC-1, ham secret karşılaştırması) ======
    expect(secretAfter).toBe(secretBefore)

    // ---- İLK sırdan (reload ÖNCESİ okunan) üretilen kod reload SONRASI
    // hâlâ KABUL edilir mi? — canlı defektin BİREBİR tersi (ADR-0024 Bağlam).
    const code = generateTotpCode({ base32Secret: secretBefore })
    await page.getByLabel('Doğrulama kodu').fill(code)
    await page.getByRole('button', { name: 'Doğrula' }).click()

    // ====== RAPORA GİRER (AC-1, verify-totp kabul kanıtı) ======
    await expect(page.getByText('İki adımlı doğrulama: Açık')).toBeVisible()
  })
})
