// @arkesoft/admin — mobil görünüm yerleşim gözlemi (ROADMAP v0.0.19,
// T-020/S5, ADR-0022 Karar 3 (K3) proje matrisi + kullanıcı kararı 2
// "çoklu viewport daraltıldı").
//
// ⚠⚠ AUTH TÜKETMEZ (`R-12`, `auth-budget.ts`'in `responsive/sign-in-
// layout.spec.ts` girdisi `{ signIn: 0, signUp: 0 }`) — bu dosya BİLEREK
// kimlik doğrulama (sign-in/sign-up) UÇLARINA TEK bir ağ çağrısı bile
// YAPMAZ (`auth-budget.test.ts`'in "çarpan değişmezi" bu dosyayı MEKANİK
// olarak denetler — ⚠ bu yorumun KENDİSİ bile o uçların TAM yolunu
// LİTERAL YAZMAZ, çünkü denetim BU DOSYANIN METNİNİ tarıyor ve kendi
// açıklamasıyla kendini YANLIŞ-POZİTİF tetikleme riskine düşmemeli —
// AGENT_BASELINE §5 "literal-jeton kuralı"nın AYNI sınıfı, ÖLÇÜLDÜ: bu
// yorum ÖNCE tam yolu yazıyordu ve testin KENDİSİNİ KIRDI). Kullanıcı
// kararı 2'nin gerekçesi: "çoklu viewport"un AMACI zaten duyarlı RENDER —
// auth akışını İKİNCİ kez koşmak DEĞİL.
//
// `e2e/responsive/` bu dosyasız BOŞ kalırdı ve Playwright "no tests found"
// ile GÜRÜLTÜLÜ kırılırdı (R-12) — tek görevi `admin-mobile` projesinin
// `testDir`'ini DOLDURMAK, oturumsuz/herkese açık `/sign-in` ekranının
// mobil viewport'ta TEMEL yerleşim değişmezlerini (AC11'in AYNI disiplini,
// `panel-flow.spec.ts:136-142`'den OKUNDU) gözlemlemek.
import { expect, test } from '@playwright/test'

test.describe('Mobil yerleşim — /sign-in (T-020, auth tüketmez)', () => {
  test("/sign-in mobil viewport'ta tek h1/tek main taşır, yatay taşma üretmez", async ({
    page,
  }) => {
    await page.goto('/sign-in')

    await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
    await expect(page.getByRole('heading', { level: 1, name: 'Giriş yap' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('main')).toHaveCount(1)
    expect(await page.title()).not.toBe('')

    // Mobil viewport'ta `<body>` genişliği viewport'u AŞMAMALI — yatay
    // taşma (kesilen/ezilen form alanları) olmadığının MEKANİK kanıtı.
    const viewportSize = page.viewportSize()
    expect(viewportSize).not.toBeNull()
    if (viewportSize !== null) {
      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyScrollWidth).toBeLessThanOrEqual(viewportSize.width)
    }

    // E-posta/şifre alanları DOKUNULABİLİR genişlikte görünür — form
    // gönderilmez, ağ çağrısı YAPILMAZ (dosya başı notu: auth tüketmez).
    await expect(page.getByLabel('E-posta adresi')).toBeVisible()
    await expect(page.getByLabel('Şifre')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible()
  })
})
