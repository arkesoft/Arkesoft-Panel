// @arkesoft/admin — TEK e2e spec (ROADMAP v0.0.7, T-008/S5, architect/PO
// "Test yapılandırması" + AC2/AC3/AC4/AC9/AC10/AC11/AC18)
//
// YEREL, HERMETİK DEĞİL: `pnpm infra:up` + `pnpm db:migrate` + `pnpm db:seed`
// + çalışan `apps/api` süreci + `playwright install chromium` ÖN KOŞUL
// (orkestratör notu, bu dosya bunları BAŞLATMAZ).
//
// AC18 ORAN SINIRI BÜTÇESİ (bağlayıcı — DÜZELTME TURU 2: yorum düzeltildi,
// `solid` tur 2 M-N1): `/auth/sign-in/email` IP bazlı `platform:auth:*`
// sayacını tüketiyor (20/pencere, BAŞARILI istekler DE sayılıyor). Bütçe
// SPEC BAŞINA DEĞİL, **KOŞUM BAŞINA** (iki spec dosyasının İKİSİ DE AYNI
// IP'yi paylaşır) ve TOPLAM ≤4 — TEK doğruluk kaynağı `playwright.config.ts`
// (orada toplam ve her dosyanın payı yazılı, burada TEKRAR EDİLMİYOR ki
// üçüncü bir spec eklendiğinde iki yer senkronsuz kalmasın). Bu dosyanın
// payı TAM OLARAK 3:
//   1. Programatik (`createVerifiedFixtureUser` + tek `sign-in/email`) —
//      AC9'un `page.route()` testleri bu storageState'i YENİDEN KULLANIR,
//      kendi sign-in'leri YOK.
//   2. UI girişi (AC2/AC3/AC4).
//   3. Klavye-yalnız giriş (AC10).
// `test.describe.serial` + `playwright.config.ts`'in `workers: 1`'i —
// global `platform:auth:*` flush'u YASAK (bu dosya böyle bir şey YAPMIYOR).
//
// AC10/AC11 MEKANİK: `.click(`/`.tap(` 0 — TÜM etkileşim `fill`/`press`/
// `keyboard.press`. Etkileşimli öğelere erişim YALNIZCA `getByRole`/
// `getByLabel` — `locator('.css')`/`data-testid` 0 (etiketsiz öğe testi
// KIRAR, asıl mekanizma bu).
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const FIXTURE_PASSWORD = 'arkesoft-e2e-fixture-password-123'
const MAILPIT_BASE_URL = 'http://127.0.0.1:8025'

interface MailpitAddress {
  readonly Address: string
}
interface MailpitMessageSummary {
  readonly ID: string
  readonly To: readonly MailpitAddress[]
}
interface MailpitMessagesListResponse {
  readonly messages: readonly MailpitMessageSummary[]
}
interface MailpitMessageDetail {
  readonly Text: string
}

function isMailpitMessagesListResponse(value: unknown): value is MailpitMessagesListResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return Array.isArray((value as Record<string, unknown>)['messages'])
}

function isMailpitMessageDetail(value: unknown): value is MailpitMessageDetail {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return typeof (value as Record<string, unknown>)['Text'] === 'string'
}

/**
 * Mailpit'ten (`infra/docker-compose.yml`'in açtığı `:8025`) belirli bir
 * alıcıya gönderilmiş e-postadaki doğrulama bağlantısının `token` sorgu
 * parametresini okur. "Token üretildi" varsayımıyla sessizce boş DÖNMEZ —
 * bulunamazsa throw eder (`apps/api`'nin kendi Mailpit okuyucusuyla AYNI
 * disiplin, bkz. `apps/api/src/__tests__/helpers/mailpit-client.ts`).
 */
async function findVerificationToken(email: string): Promise<string> {
  const target = email.toLowerCase()

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listResponse = await fetch(`${MAILPIT_BASE_URL}/api/v1/messages?limit=50`)
    const listRaw: unknown = await listResponse.json()

    if (isMailpitMessagesListResponse(listRaw)) {
      const match = listRaw.messages.find((message) =>
        message.To.some((address) => address.Address.toLowerCase() === target),
      )

      if (match !== undefined) {
        const detailResponse = await fetch(`${MAILPIT_BASE_URL}/api/v1/message/${match.ID}`)
        const detailRaw: unknown = await detailResponse.json()

        if (!isMailpitMessageDetail(detailRaw)) {
          throw new Error('Mailpit mesaj gövdesi beklenen şekilde değil')
        }

        const urlMatch = /https?:\/\/\S+/.exec(detailRaw.Text)
        if (urlMatch === null) {
          throw new Error('Doğrulama e-postasında bağlantı bulunamadı')
        }

        const token = new URL(urlMatch[0]).searchParams.get('token')
        if (token === null) {
          throw new Error("Doğrulama bağlantısında 'token' sorgu parametresi bulunamadı")
        }

        return token
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250)
    })
  }

  throw new Error(`Mailpit'te ${email} alıcısına gönderilmiş mesaj bulunamadı`)
}

interface FixtureUser {
  readonly email: string
  readonly password: string
}

/**
 * Kayıt → Mailpit'ten doğrulama bağlantısı → doğrulama. GİRİŞ (sign-in)
 * YAPMAZ — her çağıran kendi `sign-in/email` çağrısını (AC18 bütçesine
 * sayılan) kendisi yapar, bu fonksiyon bütçeye dahil DEĞİL.
 */
async function createVerifiedFixtureUser(request: APIRequestContext): Promise<FixtureUser> {
  const email = `e2e-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}@arkesoft.test`
  const password = FIXTURE_PASSWORD

  const signUpResponse = await request.post('/auth/sign-up/email', {
    data: { name: 'E2E Panel Kullanıcısı', email, password },
  })
  expect(signUpResponse.ok()).toBe(true)

  const token = await findVerificationToken(email)
  const verifyResponse = await request.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
  expect(verifyResponse.ok()).toBe(true)

  return { email, password }
}

/** AC11 — her sayfada tam BİR `h1`, BİR `main`, `html[lang="tr"]`, boş olmayan `<title>`. */
async function expectBasicPageInvariants(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('main')).toHaveCount(1)
  expect(await page.title()).not.toBe('')
}

test.describe.serial('Panel akışı (T-008)', () => {
  // ---------------------------------------------------------------------
  // AC3 — guard negatifi. Oturum/fixture kullanıcı GEREKMİYOR; `sign-in`
  // ÇAĞRISI YOK (AC18 bütçesine dahil değil).
  // ---------------------------------------------------------------------
  test('oturumsuz doğrudan panele gidiş giriş ekranına yönlenir, seed verisi sızdırmaz (AC3)', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Giriş yap' })).toBeVisible()
    await expectBasicPageInvariants(page)

    // 401/404'ten HİÇBİR veri render edilmedi — ne seed'li demo kullanıcının
    // ne de bu spec'in kendi fixture kullanıcılarının bilgisi ekranda.
    const content = await page.content()
    expect(content).not.toContain('demo-yonetici@arkesoft.test')
    expect(content).not.toContain('Demo Yönetici')
    expect(content).not.toContain('@arkesoft.test')
  })

  // ---------------------------------------------------------------------
  // AC2 / AC4 — UI girişi (`sign-in` #1 — AC18 bütçesi).
  // ---------------------------------------------------------------------
  test('giriş → panel → oturum yenilemede korunur → çıkış → panele doğrudan gidiş tekrar giriş ister (AC2, AC4)', async ({
    page,
    request,
  }) => {
    const { email, password } = await createVerifiedFixtureUser(request)

    await page.goto('/sign-in')
    await expectBasicPageInvariants(page)

    await page.getByLabel('E-posta adresi').fill(email)
    await page.getByLabel('Şifre').fill(password)

    const sessionMeResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/trpc/session.me') && response.request().method() === 'GET',
    )

    // KLAVYE — fare etkileşimi YOK (AC10 mekanik, bu dosyanın HİÇ bir
    // testinde `.click(`/`.tap(` kullanılmıyor).
    await page.getByRole('button', { name: 'Giriş yap' }).press('Enter')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible()
    await expectBasicPageInvariants(page)

    // AC4 — gerçek tipli çağrı: `/trpc/session.me` → 200, yanıttan türeyen
    // bir değer ekranda (userId'den türeyen rozet kısaltması + kullanıcı
    // menüsü tetikleyicisi — `session.me` e-posta/ad TAŞIMIYOR, R1).
    const sessionMeResponse = await sessionMeResponsePromise
    expect(sessionMeResponse.status()).toBe(200)
    await expect(page.getByRole('button', { name: 'Kullanıcı menüsü' })).toBeVisible()
    await expect(page.getByText('Mağaza seçilmedi')).toBeVisible()

    // Pano "gerçekten boş" — jargonsuz boş durum metni.
    await expect(page.getByText('Panel şu anda boş')).toBeVisible()

    // DÜZELTME TURU 2 (`wcag` medium, WCAG 2.4.1 Bypass Blocks — bağlayıcı
    // regresyon koruması): skip-link'in Enter'ı odağı GERÇEKTEN `<main>`'e
    // taşıyor mu? Dashboard'un kendi mount-focus efekti az önce `h1`'i
    // odaklamıştı — oradan bir Tab, `<main>` İÇİNDE etkileşimli öğe
    // OLMADIĞI için (R3 — "gerçekten boş" pano, bugün main'in tek içeriği
    // bir `h1` + `EmptyState`) DOM'daki İLK tabbable öğeye (skip-link)
    // SARAR; bu, mekanizmanın `tabIndex={-1}` düzeltmesini ölçmek için
    // KULLANILABİLİR bir başlangıç noktası (`AppShell.tsx`'in DÜZELTME
    // TURU 2 notu).
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'İçeriğe geç' })).toBeFocused()
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main-content')
    // Tab TURUNDA `main` kendisi bir durak DEĞİL (tabIndex=-1'in tanımı) —
    // main'den bir Tab, sayfanın normal döngüsüne (burada: skip-link'e,
    // main içinde başka içerik olmadığı için) devam eder; main'i bir
    // SONRAKI Tab olarak GÖRMEZ.
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'İçeriğe geç' })).toBeFocused()

    // Skip-link'in fragment navigasyonu URL'e `#main-content` EKLEDİ —
    // aşağıdaki URL assertion'ları KÖK'ü (`/`) bekliyor, bu yüzden temiz
    // bir navigasyonla SIFIRLANIYOR (YENİ bir `sign-in` ÇAĞRISI YOK, aynı
    // oturum/çerez korunuyor).
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible()

    // Sayfa yenilenince oturum korunur — giriş ekranına fırlama OLMAZ.
    await page.reload()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible()

    // Çıkış — klavyeyle (Tab ile tetikleyiciye ulaşım + Enter ile açma +
    // Enter ile tek menü öğesini seçme).
    await page.getByRole('button', { name: 'Kullanıcı menüsü' }).press('Enter')
    await expect(page.getByRole('menuitem', { name: 'Çıkış yap' })).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Giriş yap' })).toBeVisible()
    // Form boş ve hatasız (UX: "/sign-in'e yönlenir, form boş ve hatasızdır").
    await expect(page.getByLabel('E-posta adresi')).toHaveValue('')

    // Çıkıştan sonra panele DOĞRUDAN gidiş tekrar giriş ister.
    await page.goto('/')
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  // ---------------------------------------------------------------------
  // AC10 — yalnızca klavyeyle tam akış (`sign-in` #2 — AC18 bütçesi,
  // toplam 2/4). Açılır menüde `Escape` + odak dönüşü DAHİL.
  // ---------------------------------------------------------------------
  test('login → dashboard → logout tek fare etkileşimi olmadan tamamlanır, Escape odağı tetikleyiciye döndürür (AC10)', async ({
    page,
    request,
  }) => {
    const { email, password } = await createVerifiedFixtureUser(request)

    await page.goto('/sign-in')

    // Tab ile e-postadan şifreye geçilir, Enter form'u gönderir —
    // tamamen klavye (`.click(`/`.tap( 0`, AC10 mekanik).
    await page.getByLabel('E-posta adresi').fill(email)
    await page.getByLabel('E-posta adresi').press('Tab')
    await page.getByLabel('Şifre').fill(password)
    await page.getByLabel('Şifre').press('Enter')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible()

    const trigger = page.getByRole('button', { name: 'Kullanıcı menüsü' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem', { name: 'Çıkış yap' })).toBeVisible()

    // `Escape` menüyü kapatır VE odağı tetikleyiciye GERİ VERİR (Radix'in
    // varsayılanı — bkz. `UserMenu.tsx` dosya başı yorumu).
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: 'Çıkış yap' })).toBeHidden()
    await expect(trigger).toBeFocused()

    // Menüyü yeniden aç (ok tuşuyla gezinip Enter ile seç — tek öğe
    // olduğu için ok tuşu İDEMPOTENT, asıl nokta klavye ile erişilebilirlik).
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/sign-in$/)
  })

  // ---------------------------------------------------------------------
  // AC9 — yükleniyor/boş/hata gözlemlenebilir (`page.route()`). ÖNCEKİ
  // ADIMIN storageState'i YENİDEN KULLANILIYOR — bu blokta YENİ bir
  // `sign-in` çağrısı YOK (AC18 bütçesi toplam 2/4'te KALIR, tavan 4).
  // ---------------------------------------------------------------------
  test.describe('oturum doğrulama — yükleniyor/hata/boş durumları gözlemlenebilir (AC9)', () => {
    let storageStateForAc9: Awaited<ReturnType<APIRequestContext['storageState']>>

    test.beforeAll(async ({ playwright, baseURL }) => {
      if (baseURL === undefined) {
        throw new Error('playwright.config.ts içinde use.baseURL tanımlı değil')
      }
      const requestContext = await playwright.request.newContext({ baseURL })
      const fixtureUser = await createVerifiedFixtureUser(requestContext)

      // Bu dosyadaki ÜÇÜNCÜ ve SON `sign-in/email` çağrısı (AC18 bütçesi
      // 3/4) — bu `beforeAll`'un ürettiği çerez TÜM `AC9` alt testleri
      // TARAFINDAN paylaşılan `storageState` İÇİNDE yeniden kullanılıyor.
      const signInResponse = await requestContext.post('/auth/sign-in/email', {
        data: { email: fixtureUser.email, password: fixtureUser.password },
      })
      expect(signInResponse.ok()).toBe(true)

      storageStateForAc9 = await requestContext.storageState()
      await requestContext.dispose()
    })

    test('(a) session.me geciktirilince içerikten ÖNCE yükleniyor durumu görünür', async ({
      browser,
    }) => {
      const context = await browser.newContext({ storageState: storageStateForAc9 })
      const page = await context.newPage()

      await page.route('**/trpc/session.me**', async (route) => {
        // AC9(a) TUZAĞI (architect): `defaultPendingMs` router.ts'te
        // AÇIKÇA düşük (50ms) — bu gecikme onun BELİRGİN üstünde, "yükleniyor"
        // durumu GERÇEKTEN gözlemlenebilir.
        await new Promise((resolve) => {
          setTimeout(resolve, 400)
        })
        await route.continue()
      })

      await page.goto('/')
      await expect(page.getByText('Oturumunuz doğrulanıyor…')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible()
      // DÜZELTME TURU 1 (`solid` M8): bu test daha önce `expectBasicPageInvariants`
      // ÇAĞIRMIYORDU — pending/hata durumları kontrolsüz kalmıştı. Bu konfigürasyonda
      // (başarıyla biten pending → dashboard) tam BİR h1 beklenir (guard'ın kabuksuz
      // pending `h1`'i mount olana KADAR, ardından dashboard'un kendi `h1`'i).
      await expectBasicPageInvariants(page)

      await context.close()
    })

    test('(b) 500 ve ağ iptalinde hata + "Tekrar dene" — tıklanınca istek YENİDEN gidiyor', async ({
      browser,
    }) => {
      const context = await browser.newContext({ storageState: storageStateForAc9 })
      const page = await context.newPage()

      let sessionMeRequestCount = 0
      await page.route('**/trpc/session.me**', async (route) => {
        sessionMeRequestCount += 1
        if (sessionMeRequestCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 'INTERNAL_ERROR',
              message: 'errors.internal',
              details: {},
              requestId: 'req_e2e_test_0001',
            }),
          })
          return
        }
        await route.continue()
      })

      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: 'Bir sorun oluştu' })).toBeVisible()
      await expect(page.getByText('Destek kodu: req_e2e_test_0001')).toBeVisible()
      // DÜZELTME TURU 1 (`solid` M8): guard seviyesindeki (KABUKSUZ) hata durumu
      // da `AppShell` render ETMEZ — `AppGuardErrorComponent` `headingLevel="h1"`
      // kullanıyor, bu yüzden tam BİR h1 beklenir (ErrorState'in kendi başlığı).
      await expectBasicPageInvariants(page)

      const retryButton = page.getByRole('button', { name: 'Tekrar dene' })
      await retryButton.press('Enter')

      await expect(page.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible()
      expect(sessionMeRequestCount).toBeGreaterThanOrEqual(2)

      await context.close()
    })

    test('(b) ağ iptalinde de hata + "Tekrar dene" gösterilir', async ({ browser }) => {
      const context = await browser.newContext({ storageState: storageStateForAc9 })
      const page = await context.newPage()

      let aborted = false
      await page.route('**/trpc/session.me**', async (route) => {
        if (!aborted) {
          aborted = true
          await route.abort('failed')
          return
        }
        await route.continue()
      })

      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: 'Bir sorun oluştu' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
      // DÜZELTME TURU 1 (`solid` M8): ağ iptalinde de guard KABUKSUZ kalır,
      // tam BİR h1 (ErrorState'in `h1` başlığı) beklenir.
      await expectBasicPageInvariants(page)

      await context.close()
    })

    test('(c) pano boş durumu jargonsuz metinle ne geleceğini söylüyor', async ({ browser }) => {
      const context = await browser.newContext({ storageState: storageStateForAc9 })
      const page = await context.newPage()

      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 2, name: 'Panel şu anda boş' })).toBeVisible()
      await expect(
        page.getByText(
          'Ürün, sipariş ve mağaza ayarları gibi yönetim ekranları bu panele adım adım ekleniyor.',
        ),
      ).toBeVisible()

      await context.close()
    })

    // ---------------------------------------------------------------------
    // DÜZELTME TURU 1 (`solid` M8 — bağlayıcı): `headingLevel`'ın `h2` kolu
    // ve "route h1 + ErrorState aynı DOM'da" (kabuk kurulduktan SONRA arka
    // plan yeniden doğrulaması başarısız olan) konfigürasyonu önceki turda
    // HİÇ senaryolaştırılmamıştı (`_app.tsx`'in `AppLayoutComponent`'indeki
    // `ErrorState headingLevel="h2"` dalı). AYNI `storageStateForAc9`
    // YENİDEN KULLANILIYOR — YENİ bir `sign-in` ÇAĞRISI YOK (AC18 bütçesi
    // bu turda da 3/4'te kalır).
    //
    // `qa`'nın `qa-blind-spot-and-negative-scenarios.qa.spec.ts`'teki (F)
    // testi AYNI kodu `context.setOffline` tetikleyicisiyle ölçüp ŞU
    // SONUCU KANITLADI (tur 1/2): `Outlet` (dashboard'un kendi `h1`'i) bu
    // dalda HER ZAMAN unmount olur. DÜZELTME TURU 2 (`wcag` low, AC11 "tam
    // bir h1" — bağlayıcı): bu KEŞİF `wcag` tarafından AC11'in "her sayfada
    // tam BİR h1" şartına karşı bir SAPMA olarak ölçüldü (h1 sayısı 0 idi,
    // 2 KADAR ihlal — `role="alert"` duyuru yapıyor olması AC11'in LAFZINI
    // karşılamaz). `_app.tsx`'e `sr-only` bir `h1` eklendi (`ErrorState`'in
    // `headingLevel="h2"` kolu DEĞİŞTİRİLMEDİ, solid M8'in "simetrik
    // sözleşme" kararı KORUNUYOR) — bu yüzden AŞAĞIDAKİ assertion artık
    // `expectBasicPageInvariants` ile AYNI şartı (tam BİR h1) doğruluyor.
    test('(d) kabuk kurulduktan SONRA arka plan yeniden doğrulaması başarısız olursa kabuklu (h2) hata görünür, kabuk YERİNDE kalır', async ({
      browser,
    }) => {
      const context = await browser.newContext({ storageState: storageStateForAc9 })
      const page = await context.newPage()

      let sessionMeRequestCount = 0
      await page.route('**/trpc/session.me**', async (route) => {
        sessionMeRequestCount += 1
        if (sessionMeRequestCount === 1) {
          await route.continue()
          return
        }
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'INTERNAL_ERROR',
            message: 'errors.internal',
            details: {},
            requestId: 'req_e2e_test_0002',
          }),
        })
      })

      // DÜZELTME TURU 1 — ÖLÇÜLDÜ: guard'ın ilk isteği VE mount-tetikli arka
      // plan yeniden doğrulaması (`staleTime` varsayılanı 0 → `refetchOnMount`
      // ANINDA ikinci isteği fırlatır) ARASINDA burada KASITLI bir gecikme
      // YOK — ikisi de aynı test çalışmasında saniyenin çok altında sürer.
      // Bu yüzden "önce Panel görünür, SONRA h2'ye geçer" ara karesi
      // GÜVENİLİR GÖZLEMLENEMEZ (ilk `toBeVisible` taraması bile h2'yi
      // bulabilir) — doğrudan NİHAİ (deterministik) duruma bakılır: iki
      // istek de TAMAMLANDIĞINDA kabuklu h2 hata ekranı görünür olmak
      // ZORUNDA.
      await page.goto('/')
      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByRole('heading', { level: 2, name: 'Bir sorun oluştu' })).toBeVisible()
      await expect(page.getByText('Destek kodu: req_e2e_test_0002')).toBeVisible()

      // Kabuk YERİNDE — `AppShell` yeniden mount OLMADI, `Topbar`/`Sidebar`
      // hâlâ görünür (dosya başı notundaki "AppShell yeniden mount olmadı"
      // iddiasının bu dosyadaki bağımsız kanıtı).
      await expect(page.getByRole('button', { name: 'Kullanıcı menüsü' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Panel navigasyonu' })).toBeVisible()

      // AC11'in TAMAMI artık GEÇERLİ (DÜZELTME TURU 2): `main`, `lang="tr"`,
      // boş olmayan `<title>` VE tam BİR h1 (`expectBasicPageInvariants`'ın
      // kendisi KULLANILIYOR — artık özel durum istisnası GEREKMİYOR).
      await expectBasicPageInvariants(page)

      // Tam olarak BİR h1 — `sr-only` (görsel olarak gizli, ekran
      // okuyucuya DUYURULAN) heading-navigasyon değişmezini sağlıyor;
      // ÇİFT h1 OLUŞMADI (`qa` (F)'nin bağımsız doğruladığı AYNI sonuç,
      // farklı tetikleyiciyle — offline/reconnect DEĞİL, doğrudan ikinci
      // istek 500).
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bir sorun oluştu')

      await context.close()
    })
  })

  // ---------------------------------------------------------------------
  // AC9 — giriş formu alan doğrulama (boş gönderim + geçersiz e-posta).
  // `sign-in/email` ÇAĞRISI YOK (istemci doğrulaması gönderimi engeller).
  // ---------------------------------------------------------------------
  test('giriş formu — boş gönderim ve geçersiz e-posta alan bazlı hata gösterir (AC9)', async ({
    page,
  }) => {
    await page.goto('/sign-in')

    await page.getByRole('button', { name: 'Giriş yap' }).press('Enter')

    const emailField = page.getByLabel('E-posta adresi')
    const passwordField = page.getByLabel('Şifre')

    await expect(emailField).toHaveAttribute('aria-invalid', 'true')
    await expect(passwordField).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('E-posta adresinizi girin.')).toBeVisible()
    await expect(page.getByText('Şifrenizi girin.')).toBeVisible()

    const emailDescribedBy = await emailField.getAttribute('aria-describedby')
    expect(emailDescribedBy).not.toBeNull()
    if (emailDescribedBy !== null) {
      await expect(page.locator(`#${emailDescribedBy}`)).toHaveText('E-posta adresinizi girin.')
    }

    await emailField.fill('gecersiz-eposta')
    await page.getByRole('button', { name: 'Giriş yap' }).press('Enter')
    await expect(emailField).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Geçerli bir e-posta adresi girin.')).toBeVisible()
  })
})
