// @arkesoft/superadmin — Sidebar mobil nav odak dönüşü (QA tur 1, T-021,
// wcag tur1 M1 doğrulaması)
//
// wcag tur1 `Sidebar.tsx:41-50`'yi statik okuyarak "odak tetikleyiciye
// DÖNMÜYOR" bulgusunu `medium` olarak işaretledi (Radix'siz, elle yazılmış
// `closeMobileNavAndRestoreFocus`'un `document.activeElement` kanıtı YOKTU
// — `apps/superadmin`'in Vitest kararı `environment: 'node'`, DOM yok).
// Orkestratör bu kanıt boşluğunu AÇIKÇA `qa`'nın turuna devretti ("DOM
// kanıtı üretilemedi") ve "Escape sonrası (ve link seçimi sonrası) odak
// toggle düğmesinde olmalı" assertion'ını İSTEDİ.
//
// BULGU (qa tur 1): kod bu testten ÖNCE ZATEN `mobileNavToggleButtonRef.
// current?.focus()` çağrısı taşıyordu (dosya başı yorumu "DÜZELTME (wcag
// tur 1, T-021 M1)" diyor) — bu test o düzeltmenin GERÇEKTEN çalıştığını
// `toBeFocused()` ile CANLI TARAYICIDA kanıtlar (statik okuma değil).
// Escape yolunda PASS; bağlantı seçimi yolunda FAIL — ikinci test ÖZGÜN
// talebi (toggle'a dönüş) LİTERAL assert ediyordu.
//
// DÜZELTME (qa tur 2, T-021 — Orkestratör talimatı + wcag tur 2 BAĞIMSIZ
// doğrulaması): qa tur 1'in "Bağlantı seçimi" assertion'ı artık YANLIŞ
// beklentiyi test ediyordu. FIX turu 2/3 (`Sidebar.tsx`) bağlantı seçiminde
// toggle'a odak geri-yükleme çağrısını BİLEREK KALDIRDI — bağlantı seçimi
// SAYFA DEĞİŞTİRİR ve hedef rota kendi `headingRef.current?.focus()`'unu
// (mount `useEffect`'i, bkz. `_app.denetim-kaydi.tsx`) çağırarak odağı
// kendi `h1`'ine alır; bu WCAG 2.4.3 (Focus Order) ile UYUMLU, T-016'dan
// beri bu kod tabanında TUTARLI uygulanan SPA odak yönetimi desenidir
// (wcag tur 2 `_app.denetim-kaydi.tsx:16-22`'yi okuyarak bağımsız olarak
// AYNI sonuca ulaştı — Orkestratör'ün anlatısını devralmadı). Toggle'a
// odak geri vermek burada EZİLEN, ölü bir çağrı üretirdi (qa tur 1 zaten
// ölçmüştü). ⇒ Bu GEVŞETME DEĞİL — assertion SİLİNMİYOR, DOĞRU hedefe
// (hedef sayfanın başlığı) çevriliyor; CLAUDE.md §10 md 6 ihlal edilmiyor.
//
// AC18 bütçesi: 1 sign-up + 1 sign-in (`createVerifiedFixtureUser`'ın TEK
// zinciri — `superadmin-authz.spec.ts`'in AYNI deseni). `e2e/auth-budget.ts`
// güncellenmeli (bu dosya `qa` tarafından İSTENEN bir kanıt testi olarak
// eklendi; kalıcı sahiplik kararı `devops`'a bırakılır — rapora bkz.).
import { expect, test, type APIRequestContext } from '@playwright/test'

import {
  createVerifiedFixtureUser,
  deleteFixtureUserByEmail,
  deletePlatformAuditLogByActor,
  enableTotpTwoFactor,
  grantPlatformAdmin,
} from './fixtures/platform-admin.js'

// Dar viewport — `Sidebar.tsx`'in mobil toggle düğmesi yalnızca `md:hidden`
// ALTINDA (768px) görünür; `superadmin` projesi `desktopDevice` kullandığı
// için bu TEK testte viewport AÇIKÇA küçültülür (ikinci bir proje İCAT
// EDİLMEZ — A-T21-5, ADR-0022 Karar 3 bu sürümde açılmadı).
const MOBILE_VIEWPORT = { width: 375, height: 812 }

test.describe('Sidebar mobil nav — odak dönüşü (qa tur 1/2, wcag tur1/2 M1)', () => {
  let email: string | undefined
  let userId: string | undefined
  let storageState: Awaited<ReturnType<APIRequestContext['storageState']>> | undefined

  test.beforeAll(async ({ playwright }) => {
    const fixture = await createVerifiedFixtureUser(playwright, 'e2e-superadmin-focus-return')
    email = fixture.email
    userId = fixture.userId

    grantPlatformAdmin(fixture.userId)
    await enableTotpTwoFactor(fixture.request, fixture.password)

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

  test('Escape — mobil nav kapanınca odak toggle düğmesine döner', async ({ browser }) => {
    if (storageState === undefined) {
      throw new Error('beforeAll fixture kurulumu tamamlanmadı')
    }

    const context = await browser.newContext({ storageState, viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Mağazalar' })).toBeVisible()

    const toggleButton = page.getByRole('button', { name: 'Navigasyonu aç/kapat' })
    await toggleButton.click()
    await expect(page.getByRole('navigation', { name: 'Süper admin navigasyonu' })).toBeVisible()

    await page.keyboard.press('Escape')

    // ====== RAPORA GİRER (②, canlı DOM kanıtı) ======
    await expect(toggleButton).toBeFocused()

    await context.close()
  })

  test('Bağlantı seçimi — mobil nav kapanınca odak hedef sayfanın başlığına geçer', async ({
    browser,
  }) => {
    if (storageState === undefined) {
      throw new Error('beforeAll fixture kurulumu tamamlanmadı')
    }

    const context = await browser.newContext({ storageState, viewport: MOBILE_VIEWPORT })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Mağazalar' })).toBeVisible()

    const toggleButton = page.getByRole('button', { name: 'Navigasyonu aç/kapat' })
    await toggleButton.click()
    const nav = page.getByRole('navigation', { name: 'Süper admin navigasyonu' })
    await expect(nav).toBeVisible()

    await nav.getByRole('link', { name: 'Denetim kaydı' }).click()

    // ====== RAPORA GİRER (qa tur 2 düzeltmesi — ②'nin doğru hedefi) ======
    // Bağlantı seçimi SAYFA DEĞİŞTİRİR; odak toggle'a DÖNMEZ, hedef rotanın
    // kendi `headingRef.current?.focus()`'u (mount `useEffect`'i) tarafından
    // devralınır — `Sidebar.tsx` FIX turu 2/3'ten itibaren bu yolda odak
    // geri-yükleme çağrısı TAŞIMIYOR (bkz. dosya başı yorumu).
    await expect(page.getByRole('heading', { level: 1, name: 'Denetim kaydı' })).toBeFocused()

    await context.close()
  })
})
