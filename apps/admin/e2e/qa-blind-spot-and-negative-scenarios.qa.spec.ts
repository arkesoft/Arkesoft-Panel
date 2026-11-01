// @arkesoft/admin — QA tur 1 bulguları: kör nokta kapanışları + eksik negatif
// senaryolar (ROADMAP v0.0.7, T-008, gate: qa)
//
// Bu dosya `panel-flow.spec.ts`'in (S5, üretim ajanı) SAHİBİ OLDUĞU dosyaya
// DOKUNMADAN eklenen YENİ bir dosyadır (AGENT_BASELINE §5 — "başka ajanın
// dosyasını değiştirme"). Kapsadığı yedi şey:
//
//   (A) AC12'nin kör noktası — `outline-none`/`focus-visible:ring-*` grep'i
//       SINIF LİSTESİNİN varlığını doğruluyor, derlenen CSS'in GEÇERLİLİĞİNİ
//       (gerçek odak halkasının GÖRÜNÜP görünmediğini) DOĞRULAMIYOR — AC13'ün
//       aynı sınıf kör noktası (bkz. packages/ui/src/__tests__/
//       tailwind-custom-property-syntax.qa.test.ts). Oturum GEREKMİYOR
//       (/sign-in herkese açık) — AC18 bütçesine sıfır maliyet.
//   (H) T-008 Düzeltme Turu 1 architect KARAR 2 — iki hesaplanmış-stil
//       assertion'ı (AC18 maliyeti SIFIR, /sign-in'de, kimlik GEREKMİYOR):
//       `h1`'in hesaplanmış `font-size`'ı · alan doğrulama hatası
//       `<p>`'sinin hesaplanmış `color`'ı. Derlenmiş CSS bekçisi
//       (`check-compiled-css-contract.ts`) bu eşlemeyi artık ARTEFAKT
//       seviyesinde YAKALIYOR; bu test TAMAMLAYICI katman — cascade
//       çarpışması gibi CSS-ÖTESİ etkileri yalnızca RENDER EDİLMİŞ DOM'daki
//       bir ölçüm görür (architect'in katman tablosundaki "Render edilmiş
//       DOM" satırı). QA TUR 2 (`solid` L-N14): beklenen değerler artık
//       İKİ assertion'da da ELLE YAZILMIŞ bir "ayna" DEĞİL, gerçek
//       doğruluk kaynağından TÜRETİLİYOR — bkz. her testin kendi içindeki
//       gerekçe yorumu.
//   (B) Oturum süresi dolmuş/BOZUK çerezle dashboard'a doğrudan gidiş.
//       Oturum GEREKMİYOR (bozuk çerez zaten geçersiz) — sıfır maliyet.
//   (C) `session.me` 403 (401 DEĞİL, `CROSS_SITE_REQUEST_REJECTED`) dönerse:
//       guard'ın `UNAUTHENTICATED`'e ÖZEL yönlendirmesi TETİKLENMEMELİ,
//       jenerik (kabuksuz, h1) hata ekranı GÖRÜNMELİ. Oturum GEREKMİYOR
//       (route tamamen taklit ediliyor, gerçek backend'e HİÇ gidilmiyor).
//       QA TUR 2 (`solid` L-N9): fixture gövdesinin taşıdığı ham
//       `message: 'errors.crossSiteRequestRejected'` i18n anahtarının
//       EKRANA SIZMADIĞI ayrıca assert ediliyor (bedava duran ölçüm, route
//       zaten taklit).
//   (D) Form çift gönderimi — buton `isLoading` ile `disabled` olduğu için
//       art arda iki `Enter`'ın `/auth/sign-in/email`'e YALNIZCA BİR istek
//       ürettiğini doğrular. Gerçek backend'e HİÇ gidilmiyor (route taklit) —
//       sıfır maliyet.
//   (G) AC8'in AYNI sınıf kör noktası — `messages.test.ts` yalnızca
//       `resolveErrorMessage(code)`'un SAF string çıktısını test ediyor,
//       GERÇEK bir başarısız girişin ucu uca kablolamasını (backend →
//       `normalizePanelError` → `resolveErrorMessage` → JSX render) HİÇBİR
//       test DOM'da ÖLÇMÜYOR. TEK gerçek `sign-in` denemesi (var OLMAYAN bir
//       e-posta ile — sign-up GEREKMİYOR, sıfır sign-up maliyeti).
//
// QA TUR 2 — İKİ SENARYO BU TURDA KALDIRILDI (AC18 bütçe düzeltmesi, bkz.
// `solid` tur 2 M-N1 + architect Risk 5 "koşum başına ≤4 sign-in"):
//
//   (E) `/sign-in`'e ZATEN girişliyken gidiş — GÖZLEMSEL bir senaryoydu
//       (hiçbir AC bunu talep ETMİYOR, bir "FAIL" değil, davranışın
//       belgelenmesiydi). Gözlem kayda geçmiş durumda: giriş yapmış bir
//       kullanıcı `/sign-in`'e giderse giriş formu YİNE render edilir,
//       dashboard'a OTOMATİK yönlendirme YOKTUR — bu, bu sürümün bilinen/
//       kabul edilmiş davranışıdır (AC2/AC3/AC4 bunu TALEP ETMEZ).
//   (F) `headingLevel` geçişi (kabuksuz h1 → kabuklu h2, arka plan yeniden
//       doğrulama hatası). QA TUR 1'de `test.skip` + ROADMAP takip satırı
//       önerilmişti; gerekçesinin ÖNCÜLÜ YANLIŞTI — "(F), bu dalı kapsayan
//       TEK test" iddiası `solid` tur 2 tarafından ÇÜRÜTÜLDÜ:
//       `panel-flow.spec.ts`'teki test (d) (S5, Düzeltme Turu 1) AYNI dalı
//       (`AppLayoutComponent`'in `ErrorState headingLevel="h2"` kolu) AYNI
//       `storageStateForAc9`'u kullanarak, mount-tetikli (ikinci
//       `session.me` isteği deterministik biçimde 500 döner) bir
//       tetikleyiciyle ÖLÇÜYOR ve AYNI üç şeyi assert ediyor: `level:2`
//       başlık görünür · kabuk (Topbar/Sidebar) YERİNDE kalır · `level:1`
//       başlık sayısı SIFIR. (F)'nin GERÇEK katkısı dal kapsamı DEĞİL,
//       TETİKLEYİCİ kapsamıydı (`refetchOnReconnect`'in bağlı olup
//       olmadığının doğrulanması — TanStack Query'nin bir YAPILANDIRMA
//       ayrıntısı, hiçbir AC bunu AÇIKÇA talep etmiyor). Doğru öncülle
//       yeniden değerlendirildi: (d) dal kapsamını ZATEN deterministik
//       biçimde karşılıyorken, (F)'yi SIRF bir kütüphane varsayılanının
//       kablolu kaldığını doğrulamak için FLAKY (2 farklı tetikleme
//       mekanizması denendi, ikisi de ~%25-50 başarısızlık oranı gösterdi
//       — bkz. QA tur 1 raporu §6) tutmanın gerekçesi KALMADI. KARAR:
//       CLAUDE.md §6 Seçenek 2 (kaldır) — `test.skip` + ROADMAP takip
//       satırı YERİNE doğrudan KALDIRILDI; `refetchOnReconnect`
//       tetikleyicisinin kendisi (dal kapsamı DEĞİL) hâlâ ÖLÇÜLMEMİŞ bir
//       ayrıntı olarak kalıyor ama bu, bu sürümün AC'lerinden hiçbirinin
//       karşılanmamasına yol açmıyor — KAYITLI, test YOK (`qa` tur 2
//       raporu, iş B). `docs`/S6 — (F) için ROADMAP'e `skip` takip satırı
//       EKLEMEYİN; o metin YANLIŞ öncül taşıyordu ve test artık YOK.
//
// TOPLAM gerçek backend-auth maliyeti (QA tur 2 ÖLÇÜMÜ): 0 `sign-up` + 1
// `sign-in` ((G)'nin başarısız denemesi — (E)/(F)'nin paylaştığı
// programatik `sign-up`+`sign-in` bu turda KALDIRILAN senaryolarla birlikte
// gitti). `qa` gate raporunda bu dosyanın ÇALIŞTIRILDIĞI/ÇALIŞTIRILAMADIĞI
// ve nedeni (Redis `platform:auth:*` sayaç durumu) AYRICA belgelenir.
import { COLOR_TOKENS } from '@arkesoft/ui'
import { expect, test } from '@playwright/test'

const FIXTURE_PASSWORD = 'arkesoft-e2e-fixture-password-123'

/**
 * `#RRGGBB` onaltılık rengi tarayıcının `getComputedStyle` için döndürdüğü
 * `rgb(r, g, b)` metin biçimine çevirir. QA tur 2 (`solid` L-N14) —
 * (H2)'nin beklenen değeri artık ELLE YAZILMIŞ bir "ayna" DEĞİL,
 * `COLOR_TOKENS`'ten (barrel export, `packages/ui/src/index.ts`) TÜRETİLİYOR;
 * token değişirse test KENDİLİĞİNDEN takip eder, "beklenmeyen stil" diye
 * yanlış teşhis koymaz.
 */
function hexToComputedRgbString(hex: string): string {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`
}

test.describe.serial('QA tur 1 — kör nokta kapanışları + negatif senaryolar (T-008)', () => {
  // -------------------------------------------------------------------------
  // (A) AC12'nin kör noktası — hesaplanmış stil kontrolü. Oturum GEREKMİYOR.
  // -------------------------------------------------------------------------
  test('(A) sign-in sayfasında e-posta alanı ve birincil buton: odaklı hesaplanmış stil odaksızdan FARKLI (AC12 görsel etki)', async ({
    page,
  }) => {
    await page.goto('/sign-in')

    const emailInput = page.getByLabel('E-posta adresi')
    const submitButton = page.getByRole('button', { name: 'Giriş yap' })

    async function readFocusRelevantStyle(
      locator: typeof emailInput,
    ): Promise<{ outlineStyle: string; outlineWidth: string; boxShadow: string }> {
      return locator.evaluate((element) => {
        const style = window.getComputedStyle(element)
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          boxShadow: style.boxShadow,
        }
      })
    }

    const emailUnfocused = await readFocusRelevantStyle(emailInput)
    await emailInput.focus()
    const emailFocused = await readFocusRelevantStyle(emailInput)
    expect(emailFocused).not.toEqual(emailUnfocused)
    // `focus-visible:ring-*` Tailwind'de `box-shadow` ile render edilir
    // (`outline-none` + `ring` deseni) — odaklıyken somut bir gölge OLMALI.
    expect(emailFocused.boxShadow).not.toBe('none')

    const buttonUnfocused = await readFocusRelevantStyle(submitButton)
    await submitButton.focus()
    const buttonFocused = await readFocusRelevantStyle(submitButton)
    expect(buttonFocused).not.toEqual(buttonUnfocused)
    expect(buttonFocused.boxShadow).not.toBe('none')
  })

  // -------------------------------------------------------------------------
  // (H) T-008 Düzeltme Turu 1 — architect KARAR 2: iki hesaplanmış-stil
  // assertion'ı. AC18 maliyeti SIFIR (/sign-in, kimlik GEREKMİYOR). Derlenmiş
  // CSS bekçisi (`check-compiled-css-contract.ts`) token↔özellik eşlemesini
  // ARTEFAKT seviyesinde doğruluyor; bu test TAMAMLAYICI katman — RENDER
  // EDİLMİŞ DOM'daki (cascade çarpışması dahil) CSS-ÖTESİ etkileri görür.
  // -------------------------------------------------------------------------
  test("(H1) /sign-in başlığının (h1) hesaplanmış font-size'ı --font-size-h1 token'ının GERÇEKTEN ÇÖZÜLMÜŞ değerine eşit", async ({
    page,
  }) => {
    await page.goto('/sign-in')

    const heading = page.getByRole('heading', { level: 1, name: 'Giriş yap' })

    // QA TUR 2 (`solid` L-N14 + architect uyarısı — "`1.5rem`'i `24px`
    // varsayan gizli bir bağımlılık doğurma"): beklenen piksel değeri
    // `--font-size-h1`'i (örn. "1.5rem") 16px'e SABİTLEYEREK ÇARPMIYORUZ —
    // kök (`html`) elemanının O ANKİ GERÇEK çözülmüş `font-size`'ını
    // tarayıcıdan OKUYUP token'ın rem sayısıyla çarpıyoruz. Böylece test
    // kök font boyutu (zoom/erişilebilirlik ayarı/gelecekteki bir
    // `html { font-size }` kuralı) DEĞİŞSE BİLE doğru beklenen değeri
    // türetir; yalnızca `--font-size-h1` TOKEN'I veya h1'e UYGULANAN
    // Tailwind sınıfı (`text-(length:--font-size-h1)`) BOZULURSA kırılır —
    // ki bu testin ÖLÇMESİ GEREKEN tam olarak budur.
    const { actualFontSizePx, expectedFontSizePx, rootFontSizePx, remValue } =
      await heading.evaluate((element) => {
        const rootFontSizePx = Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        )
        const remToken = window
          .getComputedStyle(document.documentElement)
          .getPropertyValue('--font-size-h1')
          .trim()
        const remValue = Number.parseFloat(remToken)
        const actualFontSizePx = Number.parseFloat(window.getComputedStyle(element).fontSize)
        return {
          actualFontSizePx,
          expectedFontSizePx: remValue * rootFontSizePx,
          rootFontSizePx,
          remValue,
        }
      })

    expect(remValue, '--font-size-h1 token rem sayısı okunamadı').toBeGreaterThan(0)
    expect(rootFontSizePx, 'kök (html) font-size px olarak okunamadı').toBeGreaterThan(0)
    expect(actualFontSizePx).toBeCloseTo(expectedFontSizePx, 2)
  })

  test("(H2) alan doğrulama hatası <p>'sinin hesaplanmış color'ı --color-danger-600 token'ının GERÇEK rgb() karşılığına eşit", async ({
    page,
  }) => {
    await page.goto('/sign-in')

    // İSTEMCİ TARAFI (Zod şekil) doğrulaması — boş alanla gönderim GERÇEK
    // backend'e HİÇ gitmez (react-hook-form `handleSubmit` doğrulama
    // başarısızsa `onSubmit`'i ÇAĞIRMAZ) — sıfır auth maliyeti.
    await page.getByRole('button', { name: 'Giriş yap' }).click()

    const emailErrorParagraph = page.getByText('E-posta adresinizi girin.')
    await expect(emailErrorParagraph).toBeVisible()

    const color = await emailErrorParagraph.evaluate(
      (element) => window.getComputedStyle(element).color,
    )
    expect(color).toBe(hexToComputedRgbString(COLOR_TOKENS['--color-danger-600']))
  })

  // -------------------------------------------------------------------------
  // (B) Bozuk/geçersiz oturum çerezi — dashboard'a doğrudan gidiş. Oturum
  // GEREKMİYOR (çerez zaten bilerek BOZUK üretiliyor, gerçek girişten gelmiyor).
  // -------------------------------------------------------------------------
  test('(B) bozuk/geçersiz oturum çerezi ile dashboard"a doğrudan gidiş giriş ekranına yönlenir, veri sızdırmaz', async ({
    browser,
    baseURL,
  }) => {
    if (baseURL === undefined) {
      throw new Error('playwright.config.ts içinde use.baseURL tanımlı değil')
    }
    const context = await browser.newContext({
      storageState: {
        cookies: [
          {
            name: 'arkesoft-panel-qa-forged-session',
            value: 'bu-cerez-asla-gecerli-bir-oturuma-karsilik-gelmez',
            domain: new URL(baseURL).hostname,
            path: '/',
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
    })
    const page = await context.newPage()

    await page.goto('/')
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Giriş yap' })).toBeVisible()

    const content = await page.content()
    expect(content).not.toContain('@arkesoft.test')

    await context.close()
  })

  // -------------------------------------------------------------------------
  // (C) `session.me` 403 (401 DEĞİL) → `UNAUTHENTICATED` yönlendirmesi
  // TETİKLENMEMELİ, jenerik kabuksuz hata ekranı (h1) görünmeli. Oturum
  // GEREKMİYOR (route tamamen taklit).
  // -------------------------------------------------------------------------
  test('(C) session.me 403 CROSS_SITE_REQUEST_REJECTED dönerse /sign-in"e yönlenmez, jenerik hata ekranı (h1, kabuksuz) gösterir', async ({
    page,
  }) => {
    await page.route('**/trpc/session.me**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'CROSS_SITE_REQUEST_REJECTED',
          message: 'errors.crossSiteRequestRejected',
          details: {},
          requestId: 'req_qa_forbidden_0001',
        }),
      })
    })

    await page.goto('/')

    // `/sign-in`'E YÖNLENMEDİ — guard yalnızca `UNAUTHENTICATED` kodunda
    // yönlendirir, `CROSS_SITE_REQUEST_REJECTED` BAŞKA bir koddur.
    await expect(page).not.toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Bir sorun oluştu' })).toBeVisible()
    await expect(page.getByText('Destek kodu: req_qa_forbidden_0001')).toBeVisible()
    // Kabuksuz — Topbar/Sidebar'ın ürettiği "Kullanıcı menüsü" tetikleyicisi YOK.
    await expect(page.getByRole('button', { name: 'Kullanıcı menüsü' })).toHaveCount(0)

    // QA TUR 2 (`solid` L-N9 — "bedava duran ölçüm"): fixture gövdesi
    // `message: 'errors.crossSiteRequestRejected'` TAŞIYOR ama `PanelError`
    // hiçbir mesaj alanı taşımadığı için (ADR-0010 Ek ①) bu ham i18n anahtarı
    // EKRANA SIZAMAZ — şimdiye kadar hiçbir test bunun YOKLUĞUNU ayrıca
    // ÖLÇMEMİŞTİ (route zaten taklit, sıfır ek maliyet).
    const content = await page.content()
    expect(content).not.toMatch(/\berrors\.[a-z]/)
  })

  // -------------------------------------------------------------------------
  // (D) Form çift gönderimi — buton `isLoading` ile `disabled` olduğu için
  // art arda iki `Enter` YALNIZCA BİR isteğe yol açar. Gerçek backend'e HİÇ
  // gidilmiyor (route taklit) — sıfır maliyet.
  // -------------------------------------------------------------------------
  test('(D) giriş formunda art arda iki Enter yalnızca BİR /auth/sign-in/email isteği üretir (çift gönderim engeli)', async ({
    page,
  }) => {
    let requestCount = 0
    await page.route('**/auth/sign-in/email', async (route) => {
      requestCount += 1
      // Kasıtlı gecikme — ikinci `Enter`'ın İLK istek hâlâ sürerken (buton
      // `disabled` durumdayken) geldiğini garanti eder.
      await new Promise((resolve) => {
        setTimeout(resolve, 300)
      })
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Invalid email or password',
          code: 'INVALID_EMAIL_OR_PASSWORD',
        }),
      })
    })

    await page.goto('/sign-in')
    await page.getByLabel('E-posta adresi').fill('qa-double-submit@arkesoft.test')
    await page.getByLabel('Şifre').fill(FIXTURE_PASSWORD)

    const submitButton = page.getByRole('button', { name: 'Giriş yap' })
    await submitButton.press('Enter')
    // İKİNCİ `Enter` — buton bu noktada `disabled`/`aria-busy="true"` OLMALI,
    // bu yüzden ikinci bir istek üretMEMELİ.
    await submitButton.press('Enter')

    await expect(page.getByText('E-posta veya parola hatalı.')).toBeVisible()
    expect(requestCount).toBe(1)
  })

  // -------------------------------------------------------------------------
  // (G) AC8'in AYNI sınıf kör noktası: `messages.test.ts` yalnızca
  // `resolveErrorMessage(code)`'un SAF çıktısını (string) birim test ediyor;
  // GERÇEK bir başarısız girişin ucu uca kablolamasını (gerçek backend →
  // `normalizePanelError` → `resolveErrorMessage` → JSX render) HİÇBİR test
  // DOM'da ÖLÇMÜYOR. `panel-flow.spec.ts`'in AC9 testleri yalnızca İSTEMCİ
  // tarafı doğrulama hatalarını (boş alan, geçersiz biçim) kapsıyor — GERÇEK
  // bir "yanlış parola" reddini HİÇ DENEMİYOR. Bu test o boşluğu kapatır.
  // TEK gerçek `sign-in` denemesi (var OLMAYAN bir e-posta ile — Better
  // Auth'un enumeration-güvenli AYNI kodu döndürdüğü ÖLÇÜLDÜ, S3 handoff'u),
  // sign-up GEREKMİYOR (sıfır sign-up maliyeti). Bu dosyadaki TEK gerçek
  // `sign-in` çağrısı — QA tur 2'de (E)/(F)'nin programatik girişi
  // KALDIRILDIĞI için AC18 bütçesine toplam katkısı 1/koşum.
  // -------------------------------------------------------------------------
  test('(G) kasıtlı başarısız giriş sonrası ekranda Türkçe katalog metni görünür, ham İngilizce/i18n anahtarı YOK (AC8 ucu uca)', async ({
    page,
  }) => {
    await page.goto('/sign-in')
    await page.getByLabel('E-posta adresi').fill('qa-e2e-olmayan-kullanici@arkesoft.test')
    await page.getByLabel('Şifre').fill('kesinlikle-yanlis-bir-parola-123')
    await page.getByRole('button', { name: 'Giriş yap' }).press('Enter')

    await expect(page.getByText('E-posta veya parola hatalı.')).toBeVisible()

    const content = await page.content()
    expect(content).not.toMatch(/\berrors\.[a-z]/)
    expect(content.toLowerCase()).not.toContain('invalid email or password')
  })
})
