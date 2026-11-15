// @arkesoft/admin — kayıt ve mağaza oluşturma e2e akışı (ROADMAP v0.1.0,
// T-019/S11, docs/ux/T-019-kayit-ve-kiraci-olusturma.md,
// docs/ui/T-019-kayit-ve-kiraci-olusturma.md)
//
// YEREL, HERMETİK DEĞİL: `panel-flow.spec.ts`'in dosya başı yorumuyla AYNI
// ön koşullar (`pnpm infra:up` + `pnpm db:migrate` + `pnpm db:seed` + çalışan
// `apps/api` süreci + `playwright install chromium`).
//
// ⚠⚠ AC18 ORAN SINIRI BÜTÇESİ (bağlayıcı, TEK doğruluk kaynağı
// `playwright.config.ts:42-53`, burada TEKRAR EDİLMİYOR — o dosyanın
// kuralı): bu dosyanın payı TAM OLARAK 1 `sign-up` + 1 `sign-in` —
// `beforeAll`'da BİR kez (`createVerifiedFixtureUser` + BİR `sign-in/email`)
// ve o oturumun `storageState`'i TÜM testler TARAFINDAN yeniden kullanılır.
// Aşağıdaki testlerin HİÇBİRİ kendi `sign-up`/`sign-in` çağrısını AÇMAZ —
// slug müsaitlik kontrolleri (`registration.checkSlugAvailability`) ve
// kayıt formunun istemci tarafı doğrulaması bu bütçeye dahil DEĞİLDİR (sıfır
// ağ çağrısı / ayrı bir rota, `/auth/*` dışı).
//
// `test.describe.serial` + `playwright.config.ts`'in `workers: 1`'i —
// Postgres/Redis MÜNHASIR koşum (bu dosya koşarken kök `pnpm test` KOŞMAZ,
// handoff'un bağlayıcı kısıtı).
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { deleteFixtureTenantBySlug, deleteFixtureUserByEmail } from './fixtures/tenant-cleanup.js'
import { createVerifiedFixtureUser, type FixtureUser } from './helpers/verified-fixture-user.js'

/**
 * `registration.createTenant`'ın tRPC `httpLink` (toplu olmayan) yanıt
 * zarfı — `{result:{data:{slug,status}}}`. `unknown`'dan DARALTILIR, tip
 * elle yeniden TANIMLANMAZ gibi görünse de bu bir e2e TEST dosyası (tRPC
 * tipleri `@arkesoft/trpc`'den gelir, bu zarf şekli ONUN DEĞİL `httpLink`'in
 * ÜZERİNE bindiği tel protokolünün biçimidir) — `panel-flow.spec.ts`'in
 * Mailpit yanıtı için kurduğu AYNI "fırlamadan daralt" disiplini.
 */
interface CreateTenantResponseEnvelope {
  readonly result: { readonly data: { readonly slug: string; readonly status: string } }
}

function isCreateTenantResponseEnvelope(value: unknown): value is CreateTenantResponseEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const result = (value as Record<string, unknown>)['result']
  if (typeof result !== 'object' || result === null) {
    return false
  }
  const data = (result as Record<string, unknown>)['data']
  if (typeof data !== 'object' || data === null) {
    return false
  }
  const slug = (data as Record<string, unknown>)['slug']
  const status = (data as Record<string, unknown>)['status']
  return typeof slug === 'string' && typeof status === 'string'
}

test.describe.serial('Kayıt ve mağaza oluşturma akışı (T-019)', () => {
  // T-020/S5 — ADR-0022 D-1 (architect ölçtü): bu describe HER koşumda bir
  // `tenant` + `app_user` + `tenant_membership` SIZDIRIYORDU (`afterAll`
  // yoktu, yalnızca `context.close()` vardı). `FixtureUser | undefined` —
  // `createdSlug`'ın AYNI disiplini (:60-63 notu): `beforeAll` BAŞARISIZ
  // olursa Playwright `afterAll`'ı YİNE çalıştırır ve `fixtureUser` çalışma
  // zamanında GERÇEKTEN `undefined` kalabilir — tip bu gerçeği söylemeli.
  let fixtureUser: FixtureUser | undefined
  let storageStateAfterSignIn: Awaited<ReturnType<APIRequestContext['storageState']>>
  // `string | undefined` — bu `describe.serial` BLOĞUNUN SIRASINA bağımlı:
  // değer ANCAK aşağıdaki mağaza oluşturma testi (`:236`) başarıyla
  // TAMAMLANIRSA atanır; sıra bozulursa veya o test düşerse bu değişken
  // GERÇEKTEN atanmamış kalır — tip bu gerçeği söylemeli, `:292`'deki
  // `undefined` koruması TİP YALANI değil GERÇEK bir çalışma zamanı
  // durumudur (bir sonraki ajan bu tipi "gereksiz" sanıp geri ALMASIN).
  let createdSlug: string | undefined

  // -------------------------------------------------------------------
  // Bu dosyanın TEK `sign-up` + TEK `sign-in` çağrısı (AC18 bütçesi,
  // 1/1 — toplamda TEK oturum, aşağıdaki HİÇBİR test kendi başına
  // kimlik doğrulamaz).
  // -------------------------------------------------------------------
  test.beforeAll(async ({ playwright, baseURL }) => {
    if (baseURL === undefined) {
      throw new Error('playwright.config.ts içinde use.baseURL tanımlı değil')
    }
    const requestContext = await playwright.request.newContext({ baseURL })

    fixtureUser = await createVerifiedFixtureUser(requestContext)

    const signInResponse = await requestContext.post('/auth/sign-in/email', {
      data: { email: fixtureUser.email, password: fixtureUser.password },
    })
    expect(signInResponse.ok()).toBe(true)

    storageStateAfterSignIn = await requestContext.storageState()
    await requestContext.dispose()
  })

  // ---------------------------------------------------------------------
  // AC-3 (dört adımın BİRİNCİSİ — "hesap") — oturumsuz doğrudan
  // `/magaza-olustur`'a gidiş mağaza sihirbazını ATLAYAMAZ, giriş ekranına
  // yönlenir. `sign-in` ÇAĞRISI YOK (ücretsiz negatif).
  // ---------------------------------------------------------------------
  test('oturumsuz /magaza-olustur sihirbazı atlanamaz, giriş ekranına yönlenir (AC-3)', async ({
    page,
  }) => {
    await page.goto('/magaza-olustur')
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Giriş yap' })).toBeVisible()
  })

  // ---------------------------------------------------------------------
  // `/kayit` formunun istemci tarafı alan doğrulaması — `sign-up/email`
  // ÇAĞRISI YOK (Zod reddi gönderimi engeller, ücretsiz negatif).
  // ---------------------------------------------------------------------
  test('kayıt formu — boş gönderim ve geçersiz e-posta alan bazlı hata gösterir', async ({
    page,
  }) => {
    await page.goto('/kayit')
    await expect(page.getByRole('heading', { level: 1, name: 'Hesap oluştur' })).toBeVisible()

    await page.getByRole('button', { name: 'Hesap oluştur' }).click()

    const emailField = page.getByLabel('E-posta adresi')
    const passwordField = page.getByLabel('Şifre', { exact: true })
    const passwordConfirmField = page.getByLabel('Şifre (tekrar)')

    await expect(emailField).toHaveAttribute('aria-invalid', 'true')
    await expect(passwordField).toHaveAttribute('aria-invalid', 'true')
    await expect(passwordConfirmField).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('E-posta adresinizi girin.')).toBeVisible()
    await expect(page.getByText('Şifrenizi girin.')).toBeVisible()
    await expect(page.getByText('Şifrenizi tekrar girin.')).toBeVisible()

    await emailField.fill('gecersiz-eposta')
    await page.getByRole('button', { name: 'Hesap oluştur' }).click()
    await expect(emailField).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Geçerli bir e-posta adresi girin.')).toBeVisible()
  })

  // ---------------------------------------------------------------------
  // AC-1 + AC-3 (kalan üç adım) + AC-20/wcag elle çapaları — TEK test,
  // `beforeAll`'un storageState'ini yeniden kullanır (sıfır ek auth maliyeti).
  // ---------------------------------------------------------------------
  test('mağaza oluşturma sihirbazı dört adımı sırayla zorlar, slug çıktıları doğru metinle duyurulur, kiracı pending doğar (AC-1, AC-3)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: storageStateAfterSignIn })
    const page: Page = await context.newPage()

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible()
    // İlk girişte saklı bir mağaza referansı YOK — "mağaza yok" durumu
    // (bkz. `_app.index.tsx` — `dashboard.onboarding.noStoreTitle`, PANEL-FLOW
    // DÜZELTMESİ'nin RİSKLER notuyla AYNI ölçüm).
    await expect(
      page.getByRole('heading', { level: 2, name: 'Henüz bir mağazan yok' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Mağaza oluştur' }).click()
    await expect(page).toHaveURL(/\/magaza-olustur$/)

    // --- Adım 2/4: mağaza adı ---------------------------------------
    const storeNameHeading = page.getByRole('heading', { level: 1, name: 'Mağaza adı' })
    // wcag çapası ① — adım açıldığında odak başlığa taşınır.
    await expect(storeNameHeading).toBeFocused()

    // Boş gönderim BLOKLANIR — adımda KALINIR (AC-3: eksik adımla ilerlenemez).
    await page.getByRole('button', { name: 'İleri' }).click()
    await expect(page.getByText('Mağazanın bir adı olmalı.')).toBeVisible()
    await expect(storeNameHeading).toBeVisible()

    const storeName = `E2E Mağaza ${String(Date.now())}`
    await page.getByLabel('Mağazanın adı').fill(storeName)
    await page.getByRole('button', { name: 'İleri' }).click()

    // --- Adım 3/4: mağaza adresi (slug) -----------------------------
    const slugHeading = page.getByRole('heading', { level: 1, name: 'Mağaza adresi' })
    await expect(slugHeading).toBeFocused()

    const slugInput = page.getByLabel('Mağazanın adresi')
    const nextButton = page.getByRole('button', { name: 'İleri' })
    const liveRegion = page.getByRole('status')

    // Adım açılır açılmaz ÖNERİLEN slug otomatik (debounce'suz) kontrol
    // edilir — tekil, benzersiz bir ad seçildiği için 'available' beklenir.
    await expect(liveRegion).toContainText('Bu adres kullanılabilir.')
    await expect(nextButton).toBeEnabled()
    const suggestedSlug = await slugInput.inputValue()
    expect(suggestedSlug.length).toBeGreaterThan(0)

    // Ücretsiz negatif — rezerve (`admin`, 12 üyeden biri). wcag çapası ②/③:
    // sonuç METİN olarak duyurulur (renk tek başına DEĞİL — aşağıdaki
    // assertion `toContainText` ile METNİ doğruluyor, görsel sınıfa bakmıyor).
    await slugInput.fill('admin')
    await expect(liveRegion).toContainText(
      'Bu adres platform tarafından kullanıldığı için seçilemez. Başka bir adres dene.',
    )
    await expect(nextButton).toBeDisabled()

    // Ücretsiz negatif — alınmış (seed'in `demo-magaza`'sı, ikinci hesap
    // GEREKMİYOR).
    await slugInput.fill('demo-magaza')
    await expect(liveRegion).toContainText(
      'Bu mağaza adresi başka bir mağaza tarafından kullanılıyor. Başka bir adres dene.',
    )
    await expect(nextButton).toBeDisabled()

    // Ücretsiz negatif — geçersiz biçim (baş/son tire).
    await slugInput.fill('-gecersiz-')
    await expect(liveRegion).toContainText(
      'Bu adreste yalnızca küçük harf, rakam ve tire kullanılabilir; tire ile başlayıp bitemez.',
    )
    await expect(nextButton).toBeDisabled()

    // Müsait olduğu ÖNCEDEN ÖLÇÜLEN öneriye geri dön — adım İLERLEYEMEZ
    // (buton devre dışı) demiştik, şimdi İLERLEYEBİLİR olduğunu kanıtla.
    await slugInput.fill(suggestedSlug)
    await expect(liveRegion).toContainText('Bu adres kullanılabilir.')
    await expect(nextButton).toBeEnabled()
    await nextButton.click()

    // --- Adım 4/4: site tipi -----------------------------------------
    const siteTypeHeading = page.getByRole('heading', { level: 1, name: 'Site tipi' })
    await expect(siteTypeHeading).toBeFocused()

    const submitButton = page.getByRole('button', { name: 'Mağazanı oluştur' })

    // Seçim YAPILMADAN gönderim BLOKLANIR — adımda KALINIR (AC-3).
    await submitButton.click()
    await expect(page.getByText('Bir site tipi seç.')).toBeVisible()
    await expect(siteTypeHeading).toBeVisible()

    await page.getByLabel('E-ticaret (ürün satışı yapacağım)').check()

    const createTenantResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/trpc/registration.createTenant') &&
        response.request().method() === 'POST',
    )
    await submitButton.click()

    const createTenantResponse = await createTenantResponsePromise
    expect(createTenantResponse.status()).toBe(200)
    const createTenantBody: unknown = await createTenantResponse.json()
    if (!isCreateTenantResponseEnvelope(createTenantBody)) {
      throw new Error('registration.createTenant yanıtı beklenen zarf biçiminde değil')
    }
    expect(createTenantBody.result.data.slug).toBe(suggestedSlug)
    // AC-1 — yeni kiracı HER ZAMAN 'pending' doğar.
    expect(createTenantBody.result.data.status).toBe('pending')

    createdSlug = suggestedSlug

    // `createTenant` başarısı `/kurulum/{slug}`'a YÖNLENDİRİR.
    await expect(page).toHaveURL(new RegExp(`/kurulum/${suggestedSlug}$`))
    const checklistHeading = page.getByRole('heading', { level: 1, name: 'Kurulum adımların' })
    await expect(checklistHeading).toBeFocused()

    // ⚠⚠ AC-1'in `tenant_membership(role='owner')` kanıtı DAVRANIŞSAL —
    // bu dosyanın "DOKUNACAĞIN DOSYALAR" listesi `packages/db`'yi KAPSAMIYOR
    // ve `apps/admin`'in `package.json`'ı bu alt görevin dosya listesinde
    // YOK, bu yüzden ham bir DB sorgusu BURADAN atılamaz (CLAUDE.md §2 "yeni
    // ana bağımlılık" + görevin DOKUNMA listesi). Kanıt İKİ parçalı: (1) KOD
    // OKUMASI — `registration.service.ts:190-193` `createTenant`'ın yazdığı
    // TEK `tenantMembership` satırının `role: TenantRole.owner` OLDUĞUNU
    // gösterir (başka bir rol yazma yolu YOK); (2) bu test — `onboardingChecklist`
    // (`registration.service.ts:236-251`) sahiplik doğrulamasını
    // (`tenantMembership.findUnique`) HER ŞEYDEN ÖNCE yapar ve üyelik YOKSA AYNI
    // 404'ü (`TENANT_NOT_FOUND`) döner (`dashboard.onboarding.
    // slugNotFoundOrForbidden`) — AŞAĞIDAKİ assertion'ların bu mesajı
    // GÖRMEMESİ ve gerçek liste verisinin görünmesi, oluşturan kullanıcı
    // için bu satırın YAZILDIĞININ gözlemlenebilir kanıtıdır.
    await expect(
      page.getByText('Bu adrese erişiminiz yok veya böyle bir mağaza yok.'),
    ).not.toBeVisible()
    await expect(
      page.getByText(
        'Mağazan oluşturuldu ama henüz ziyaretçilere açık değil. Yayına alma adımı çok yakında burada olacak.',
      ),
    ).toBeVisible()

    const checklist = page.getByRole('list')
    await expect(checklist).toBeVisible()
    await expect(checklist.getByText('Hesabını oluşturdun')).toBeVisible()
    await expect(checklist.getByText('Mağazanın adını ve adresini belirledin')).toBeVisible()
    await expect(checklist.getByText('Mağazanın türünü seçtin')).toBeVisible()
    await expect(checklist.getByText('Deneme aboneliğin başladı')).toBeVisible()
    await expect(checklist.getByText('Siteni yayına al')).toBeVisible()
    await expect(checklist.getByText('Yakında', { exact: true })).toBeVisible()
    // Dört adım tamamlandı (`hesap`/`mağaza adı`/`site tipi`/`deneme
    // aboneliği`), `provisioning` HER ZAMAN bekliyor (v0.2.0'ın işi) —
    // "Tamamlandı" TAM dört kez görünür olmalı.
    await expect(checklist.getByText('Tamamlandı')).toHaveCount(4)
    await expect(checklist.getByText('Bekliyor')).toHaveCount(1)

    await context.close()
  })

  // ---------------------------------------------------------------------
  // AC-19 — kontrol listesi sayfa YENİLENMESİNDEN SONRA DA sunucudan
  // okunur (istemci durumu DEĞİL) + yükleniyor/hata durumları gözlemlenebilir.
  // Önceki testin `storageState`'i VE `createdSlug`'ı yeniden kullanılır —
  // sıfır ek `sign-in`/`sign-up` maliyeti.
  // ---------------------------------------------------------------------
  test('kurulum kontrol listesi sayfa yenilemesinden sonra da sunucudan okunur; yükleniyor/hata durumları gözlemlenebilir (AC-19)', async ({
    browser,
  }) => {
    if (createdSlug === undefined || createdSlug.length === 0) {
      throw new Error('createdSlug önceki testte doldurulmadı — test sırası bozulmuş olabilir')
    }

    const context = await browser.newContext({ storageState: storageStateAfterSignIn })
    const page = await context.newPage()

    let checklistRequestCount = 0
    await page.route('**/trpc/registration.onboardingChecklist**', async (route) => {
      checklistRequestCount += 1
      await route.continue()
    })

    await page.goto(`/kurulum/${createdSlug}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Kurulum adımların' })).toBeVisible()
    await expect(page.getByRole('list')).toBeVisible()
    expect(checklistRequestCount).toBe(1)

    // Sayfa YENİLENİR — TanStack Query cache'i (bellek içi, kalıcı DEĞİL)
    // tamamen sıfırlanır; içerik YİNE görünüyorsa kaynağı İSTEMCİ durumu
    // DEĞİL, YENİ bir ağ isteğidir (aşağıdaki sayaç bunu mekanik kanıtlar).
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Kurulum adımların' })).toBeVisible()
    await expect(page.getByRole('list')).toBeVisible()
    expect(checklistRequestCount).toBeGreaterThanOrEqual(2)

    // --- Yükleniyor durumu --------------------------------------------
    await page.unroute('**/trpc/registration.onboardingChecklist**')
    await page.route('**/trpc/registration.onboardingChecklist**', async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 400)
      })
      await route.continue()
    })

    await page.reload()
    // Liste HENÜZ yok (gecikmeli istek sürerken) — banner (sorgu durumundan
    // BAĞIMSIZ render edilir) görünür ama madde listesi DEĞİL.
    await expect(
      page.getByText(
        'Mağazan oluşturuldu ama henüz ziyaretçilere açık değil. Yayına alma adımı çok yakında burada olacak.',
      ),
    ).toBeVisible()
    await expect(page.getByRole('list')).toHaveCount(0)
    // Yukarıdaki `toHaveCount(0)` ANLIK doğrulanır (mock'un 400 ms
    // gecikmesi HENÜZ çözülmeden) — "yükleniyor" anının kendisini pinler.
    // AŞAĞIDAKİ `toBeVisible()` ise KASITLI olarak AYNI locator'ı TEKRAR
    // bekler: Playwright'ın kendi otomatik-yeniden-deneme penceresi
    // (varsayılan `expect` zaman aşımı 5000 ms, `playwright.config.ts`
    // override ETMİYOR) mock'un 400 ms gecikmesinden UZUN — bu yüzden bu
    // assertion "yükleniyor → yüklendi" GEÇİŞİNİN kendisini pinler (liste
    // gecikme çözüldükten SONRA görünür hâle gelir). Bu, `toHaveCount(0)`
    // sonucunu SESSİZCE geçersiz kılan bir kopyala-yapıştır artığı DEĞİL —
    // iki assert BİRLİKTE yükleniyor durumunun ANLIK hâlini VE ondan
    // yüklenmiş duruma geçişi KANITLAR.
    await expect(page.getByRole('list')).toBeVisible()

    // --- Hata + "Tekrar dene" ------------------------------------------
    await page.unroute('**/trpc/registration.onboardingChecklist**')
    let onboardingChecklistAttempt = 0
    await page.route('**/trpc/registration.onboardingChecklist**', async (route) => {
      onboardingChecklistAttempt += 1
      if (onboardingChecklistAttempt === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'INTERNAL_ERROR',
            message: 'errors.internal',
            details: {},
            requestId: 'req_e2e_registration_0001',
          }),
        })
        return
      }
      await route.continue()
    })

    await page.reload()
    await expect(page.getByText('Kurulum durumun şu anda yüklenemedi.')).toBeVisible()
    await expect(page.getByRole('list')).toHaveCount(0)

    await page.getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(page.getByRole('list')).toBeVisible()
    await expect(page.getByText('Kurulum durumun şu anda yüklenemedi.')).toHaveCount(0)

    await context.close()
  })

  // -------------------------------------------------------------------
  // T-020/S5 — ADR-0022 D-1'in teardown'ı. SIRA ÖNEMLİ: önce `tenant`
  // (varsa — `createdSlug` yalnızca mağaza oluşturma testi BAŞARILI
  // olursa atanır), sonra `app_user` — `tenant_membership` ikisinden
  // BİRİNİN `onDelete: Cascade`'iyle zaten gider (dosya başı notu,
  // `fixtures/tenant-cleanup.ts`), sıra SIRF okunabilirlik için.
  // -------------------------------------------------------------------
  test.afterAll(() => {
    if (createdSlug !== undefined) {
      deleteFixtureTenantBySlug(createdSlug)
    }
    if (fixtureUser !== undefined) {
      deleteFixtureUserByEmail(fixtureUser.email)
    }
  })
})
