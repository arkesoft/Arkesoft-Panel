// @arkesoft/admin — `expectNoAccessibilityViolations` yardımcısının öz-testi
// (ROADMAP v0.0.20.3, T-024/S3, ADR-0025).
//
// ⚠⚠ NEDEN SENTETİK DOM, GERÇEK UYGULAMA SAYFASI DEĞİL (mimari/po kararı,
// bağlayıcı): bu dosya `page.setContent(...)` ile KENDİ ürettiği HTML'i
// tarar, `/sign-in`/`/hesap/guvenlik` gibi gerçek bir rotaya `page.goto`
// YAPMAZ. Üç gerekçe:
// (a) uygulamanın BUGÜNKÜ taban ihlal sayısından (mimarinin keşif ölçümü:
//     0/6 sayfa) BAĞIMSIZ — uygulama ihlal biriktirse/düzeltse bile bu
//     öz-test davranışı DEĞİŞMEZ.
// (b) auth MALİYETİ sıfır — `/hesap/guvenlik` oturum GEREKTİRİR,
//     `expectNoAccessibilityViolations`'ın KENDİSİNİ sınamak için sign-in/
//     sign-up bütçesi harcamak GEREKSİZ (bkz. `auth-budget.ts` girdisi:
//     `{ signIn: 0, signUp: 0 }`).
// (c) öz-test gerçek bir sayfayı kırarsa (ör. bir komponent regresyonu)
//     teşhis BULANIKLAŞIR — "yardımcı mı bozuk, sayfa mı bozuk?" sorusu
//     sentetik DOM'da HİÇ doğmaz, yalnızca yardımcının KENDİ mantığı
//     sınanır.
//
// ⚠ Proje: `admin-desktop` (`playwright.config.ts`'in `testIgnore:
// ['**/responsive/**']`i bu dosyayı KAPSAR, `e2e/responsive/` ALTINDA
// DEĞİL). `scanName` HER BEŞ assert'te AYNI: `'a11y-helper-self-test'` —
// `scripts/playwright/a11y.ts`'in `A11yScanName` kapalı birleşiminde BİR
// üye (S1'in eklediği).
//
// ⚠⚠ AC-22 — DÖRT ASSERT, ELLE MUTASYON YOK: her senaryo kendi sentetik
// HTML'ini BAĞIMSIZ üretir (a/b "ihlalli", c/d AYNI sayfanın "düzeltilmiş"
// biçimi) — bir testin DOM'u çalışma zamanında elle değiştirilip "geri
// alınmaz", İKİ AYRI `page.setContent` çağrısı kullanılır.
//
// ⭐ AC-21 — BEŞİNCİ ASSERT: arka planı görsel (gradyan) olan bir metin
// bloğu axe'ın `color-contrast` kuralının kontrast oranını HESAPLAYAMAMASINA
// (`incomplete`) yol açar — `ACKNOWLEDGED_INCOMPLETE_RULE_IDS` VARSAYILAN
// BOŞ olduğu için bu `incomplete` testi KIRAR (sessizce yutulmaz) VE
// `testInfo.annotations`'a ad ad yazılır — ikisi BİRLİKTE doğrulanır.
import { expect, test } from '@playwright/test'

import { expectNoAccessibilityViolations } from '../../../scripts/playwright/a11y.js'

/** Beş senaryonun hepsinin paylaştığı tarama adı (S1'in kapalı birleşiminde bir üye). */
const SCAN_NAME = 'a11y-helper-self-test'

test.describe('expectNoAccessibilityViolations öz-testi (T-024/S3, AC-21/AC-22)', () => {
  test('(a) yetersiz kontrastlı metin enjekte edilince kırmızı olur, mesaj color-contrast taşır', async ({
    page,
  }, testInfo) => {
    await page.setContent(`
      <!doctype html>
      <html lang="tr">
        <head><meta charset="utf-8" /><title>Kontrast ihlali</title></head>
        <body>
          <main>
            <h1>Kontrast öz-testi</h1>
            <p style="color: #777777; background-color: #666666;">Düşük kontrastlı metin</p>
          </main>
        </body>
      </html>
    `)

    // ⚠ Assert, kuralın yalnızca ADINI değil (yanlış pozitif ihtimali:
    // `incomplete` dalında da aynı kural adı geçebilir) `İHLAL:` ÖN EKİYLE
    // birlikte arıyor — `a11y.ts`'teki `failureLines.push(\`İHLAL: ...\`)`
    // satırının (ihlal dalı) kanıtı (L1, `security` gate tur 1 bulgusu).
    // ⚠ Satır numarasıyla DEĞİL dal metniyle atıf veriliyor — bu dosya her
    // `a11y.ts` düzeltmesinde (ör. bu turda +2 satır) kaymıştı.
    await expect(expectNoAccessibilityViolations(page, SCAN_NAME, testInfo)).rejects.toThrow(
      /İHLAL:.*color-contrast/s,
    )
  })

  test('(b) etiketsiz input ve adsız buton enjekte edilince kırmızı olur, mesaj label/button-name taşır', async ({
    page,
  }, testInfo) => {
    await page.setContent(`
      <!doctype html>
      <html lang="tr">
        <head><meta charset="utf-8" /><title>Etiket ihlali</title></head>
        <body>
          <main>
            <h1>Etiket öz-testi</h1>
            <label for="e-posta">E-posta</label>
            <input type="text" />
            <button></button>
          </main>
        </body>
      </html>
    `)

    // ⚠ (a)'daki AYNI düzeltme (L1) — `İHLAL:` ÖN EKİ, alternasyon
    // GRUPLANMIŞ (`(label|button-name)`) ki ön ek HER İKİ dala da uygulansın.
    await expect(expectNoAccessibilityViolations(page, SCAN_NAME, testInfo)).rejects.toThrow(
      /İHLAL:.*(label|button-name)/s,
    )
  })

  test('(c) kontrast ihlali geri alınınca 0 ihlal döner', async ({ page }, testInfo) => {
    await page.setContent(`
      <!doctype html>
      <html lang="tr">
        <head><meta charset="utf-8" /><title>Kontrast düzeltildi</title></head>
        <body>
          <main>
            <h1>Kontrast öz-testi — düzeltildi</h1>
            <p style="color: #000000; background-color: #ffffff;">Yeterli kontrastlı metin</p>
          </main>
        </body>
      </html>
    `)

    await expect(expectNoAccessibilityViolations(page, SCAN_NAME, testInfo)).resolves.not.toThrow()
  })

  test('(d) etiket ihlali geri alınınca 0 ihlal döner', async ({ page }, testInfo) => {
    await page.setContent(`
      <!doctype html>
      <html lang="tr">
        <head><meta charset="utf-8" /><title>Etiket düzeltildi</title></head>
        <body>
          <main>
            <h1>Etiket öz-testi — düzeltildi</h1>
            <label for="e-posta">E-posta</label>
            <input id="e-posta" type="text" />
            <button type="button">Gönder</button>
          </main>
        </body>
      </html>
    `)

    await expect(expectNoAccessibilityViolations(page, SCAN_NAME, testInfo)).resolves.not.toThrow()
  })

  test('(e) AC-21: gradyan üstü metin incomplete döner, testi kırar VE annotation olarak görünür', async ({
    page,
  }, testInfo) => {
    await page.setContent(`
      <!doctype html>
      <html lang="tr">
        <head>
          <meta charset="utf-8" />
          <title>Gradyan üstü metin</title>
          <style>
            main {
              background-image: linear-gradient(45deg, #000000, #ffffff);
              padding: 24px;
            }
            p {
              color: #808080;
            }
          </style>
        </head>
        <body>
          <main>
            <h1 style="color: #000000; background-color: #ffffff;">Gradyan öz-testi</h1>
            <p>Gradyan arka plan üstündeki metin — axe kontrast oranını hesaplayamaz</p>
          </main>
        </body>
      </html>
    `)

    // ⚠⚠ Sessizce yutulmadığını GÖSTER (1/2): `incomplete` ACKNOWLEDGED
    // listesinde YOK ⇒ test KIRILIR, hata mesajı kural adını taşır. ⚠ (L1,
    // `security` gate tur 1 bulgusu): `BEYAN EDİLMEMİŞ incomplete:` ÖN EKİ
    // bu bulgunun `a11y.ts`'teki `failureLines.push(\`BEYAN EDİLMEMİŞ
    // incomplete: ...\`)` satırından (incomplete dalı) geldiğini (yani
    // `İHLAL:` dalından DEĞİL) kanıtlar — (a)/(b) testleriyle AYNI sınıf
    // düzeltme, zıt dal. Satır numarası yerine dal metni: bu dosyanın iki
    // ardışık düzeltme turunda satır referansı bayatlamıştı (bkz. yukarıdaki
    // (a) testinin notu).
    await expect(expectNoAccessibilityViolations(page, SCAN_NAME, testInfo)).rejects.toThrow(
      /BEYAN EDİLMEMİŞ incomplete:.*color-contrast/s,
    )

    // ⚠⚠ Sessizce yutulmadığını GÖSTER (2/2): Playwright raporunda ad ad
    // görünen annotation KANITI — `a11y.ts`'in `incomplete` döngüsü testi
    // kırmadan ÖNCE `testInfo.annotations`'a yazar.
    const incompleteAnnotations = testInfo.annotations.filter(
      (annotation) => annotation.type === 'a11y-incomplete',
    )
    expect(incompleteAnnotations.length).toBeGreaterThan(0)
    expect(
      incompleteAnnotations.some((annotation) =>
        (annotation.description ?? '').startsWith(`${SCAN_NAME}/color-contrast × `),
      ),
    ).toBe(true)
  })
})
