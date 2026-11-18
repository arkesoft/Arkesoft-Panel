// scripts/playwright/two-factor-wizard.ts — Paylaşılan e2e yardımcısı: 2FA
// kurulum sihirbazının şifre adımını gönderip `secret=` değerini okur
// (ROADMAP v0.0.20.1, T-022/S10 FIX turu 1, `solid` M-2 — bağlayıcı).
//
// NEDEN BU DOSYA VAR: `submitPasswordAndCaptureTotpSecret` `apps/admin/e2e/
// two-factor-setup-reload.spec.ts` ve `apps/superadmin/e2e/two-factor-setup-
// reload.spec.ts`'te KARAKTER KARAKTER aynıydı — aynı sihirbaz DOM'una, aynı
// dört etikete, aynı `secret=` regex'ine bağlı GERÇEK bir tekrar (`solid`'in
// ölçümü). "Cross-app import yasak" gerekçesi bu vakada geçersiz: iki dosya
// ZATEN `../../../scripts/playwright/totp.js`'i import ediyordu — paylaşılan
// ev mevcuttu, yalnızca bu fonksiyon oraya taşınmamıştı. Emsal: T-021/S10 FIX
// turu 1'de `solid`'in M2'si dört kopyalı Mailpit yardımcısını AYNI şekilde
// `scripts/playwright/mailpit.ts`'e taşıttı (bkz. o dosyanın başı).
//
// YER SEÇİMİ: `sql.ts`/`totp.ts`/`mailpit.ts`/`base.ts` ile AYNI gerekçe —
// Playwright'ın TypeScript dönüştürücüsü `node_modules`'ü hariç tutar, bir
// workspace paketinden (`packages/*`) ham `.ts` ihraç edilip fixture'dan
// import EDİLEMEZ; `scripts/` zaten `scripts/tsconfig.json`'ın `include`'u
// sayesinde tip+lint kapsamında birinci sınıf bir TypeScript alanı.
//
// AKIŞ FARKLARI BİLEREK TAŞINMADI (`solid` ölçtü — beş eksende GERÇEKTEN
// farklılar: giriş yolu, sihirbaz açma, fixture, bitiş kanıtı, bütçe):
// admin'in "gönüllü kart" (`/hesap/guvenlik` + "Etkinleştir") ve superadmin'in
// "zorunlu kapı" (`beforeLoad` guard'ı otomatik yönlendirir + "Kurulumu
// başlat") akışları İKİ SPEC DOSYASINDA KALIR — bu dosya SADECE ikisinin de
// paylaştığı "şifre adımını gönder, 'totp' adımına geçişi bekle, bağlantıyı
// aç, secret'ı DOM'dan oku" adımını taşır.
import { expect, type Page } from '@playwright/test'

/**
 * Şifre adımını gönderir, 'totp' adımına geçişi bekler, "Bağlantıyı göster
 * (gelişmiş kullanıcılar için)" açıklamasını açar ve `otpauth://…?secret=`
 * değerini DOM'dan okur. `TwoFactorSetupWizard.tsx`'in `<details><p>
 * {state.totpURI}</p></details>` düzenine birebir bağlı — sayfada BAŞKA bir
 * `<details>` YOK (iki uygulamanın da hesap güvenliği/kurulum sihirbazı
 * sayfasının tek etkileşimli alanı bu kart).
 */
export async function submitPasswordAndCaptureTotpSecret(
  page: Page,
  password: string,
): Promise<string> {
  await page.getByLabel('Şifreniz').fill(password)
  await page.getByRole('button', { name: 'Devam et' }).click()
  await expect(page.getByLabel('Doğrulama kodu')).toBeVisible()

  await page.getByText('Bağlantıyı göster (gelişmiş kullanıcılar için)', { exact: true }).click()

  const uriText = await page.locator('details p').textContent()
  if (uriText === null || uriText.trim().length === 0) {
    throw new Error('totpURI <details><p> içinde bulunamadı veya boş döndü.')
  }

  const match = /secret=([A-Za-z2-7]+)/.exec(uriText)
  if (match === null) {
    throw new Error(`totpURI içinde "secret=" sorgu parametresi bulunamadı: ${uriText}`)
  }
  const secret = match[1]
  if (secret === undefined) {
    throw new Error('regex eşleşti ama yakalama grubu boştu — beklenmeyen durum.')
  }
  return secret
}
