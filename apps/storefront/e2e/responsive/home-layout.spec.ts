// @arkesoft/storefront — mobil görünüm yerleşim gözlemi (ROADMAP v0.0.19,
// T-020/S6, ADR-0022 Karar 3 (K3) proje matrisi, `apps/admin/e2e/
// responsive/sign-in-layout.spec.ts`'in BİREBİR EMSALİ).
//
// ⚠⚠ `R-12` (bağlayıcı, S5'in admin'de ölçtüğü aynı tuzak): `e2e/
// responsive/` BU DOSYASIZ BOŞ kalırdı ve Playwright `storefront-mobile`
// projesi için "no tests found" ile GÜRÜLTÜLÜ kırılırdı — tek görevi o
// projenin `testDir`'ini DOLDURMAK.
//
// ⚠ Storefront e2e'sinde kimlik doğrulama (sign-in/sign-up) UÇLARI HİÇ YOK
// (`po`'nun A-PO-3'ü, Orkestratör ölçtü: `e2e/`'de `sign-in`/`sign-up`/
// `auth/` SIFIR eşleşme) — bu dosya da istisna DEĞİL, bu yüzden
// `apps/admin/e2e/auth-budget.ts`'in bir KARŞILIĞI storefront'ta YOK
// (A-PO-3, bağlayıcı). Bu dosya SEED'deki `demo-magaza` kiracısına
// (`packages/db/src/seed-data.ts`, DOKUNULMADI) salt-okunur bir `page.goto`
// yapar — oran sınırı bütçesine katkısı SIFIR.
import { expect, test } from '@playwright/test'

import { storefrontUrl } from '../e2e-port.js'

test.describe('Mobil yerleşim — demo-magaza kök sayfası (T-020, oran sınırına katkısı sıfır)', () => {
  test("kök sayfa mobil viewport'ta tek h1/tek main taşır, yatay taşma üretmez", async ({
    page,
  }) => {
    const response = await page.goto(storefrontUrl('demo-magaza.arkesoft.localhost'))
    expect(response?.status()).toBe(200)

    await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
    await expect(page.locator('main h1')).toHaveCount(1)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)
    expect(await page.title()).not.toBe('')

    // Mobil viewport'ta `<body>` genişliği viewport'u AŞMAMALI — yatay
    // taşma olmadığının MEKANİK kanıtı (`apps/admin`'in AYNI disiplini).
    const viewportSize = page.viewportSize()
    expect(viewportSize).not.toBeNull()
    if (viewportSize !== null) {
      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyScrollWidth).toBeLessThanOrEqual(viewportSize.width)
    }
  })
})
