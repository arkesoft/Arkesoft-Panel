// @arkesoft/superadmin — yetkilendirme sınırları (ROADMAP v0.0.20, T-021/S10)
//
// AC-4 (2FA zorunlu, anti-vacuity): 2FA kaydı OLMAYAN bir platform yöneticisi
// (a) kuruluma yönlenir, (b) aynı oturumla herhangi bir superadmin veri
// ucuna DOĞRUDAN çağrıda 403 alır (401 DEĞİL, 200 DEĞİL) — `TWO_FACTOR_
// REQUIRED` (`platformAdminProcedure`'ün ikinci dalı, `packages/trpc/src/
// authz/platform-admin-procedure.ts`, OKUNDU).
//
// AC18 bütçesi: 1 `sign-up` + 1 `sign-in` — `e2e/auth-budget.ts`'in
// beyanıyla EŞLEŞİR.
import { expect, test, type APIRequestContext } from '@playwright/test'
import { z } from 'zod'

import {
  callTenantListDirectly,
  createVerifiedFixtureUser,
  deleteFixtureUserByEmail,
  deletePlatformAuditLogByActor,
  grantPlatformAdmin,
} from './fixtures/platform-admin.js'

/**
 * tRPC'nin KENDİ hata zarfı (`packages/trpc/src/trpc.ts:150-173`'ün
 * `errorFormatter`'ı, OKUNDU) — `{error:{data:{appError:{code}}}}`. Better
 * Auth'un/`AuthGuard`'ın ÇIPLAK `{code,message,...}` gövdesiyle (başka
 * testlerde görülen) KARIŞTIRILMAZ: bu hata bir `platformAdminProcedure`
 * RESOLVER'inden (middleware) fırlıyor, dolayısıyla tRPC'nin standart
 * zarfından GEÇER.
 */
const trpcErrorEnvelopeSchema = z.object({
  error: z.object({ data: z.object({ appError: z.object({ code: z.string() }) }) }),
})

// ⚠⚠ ÖLÇÜLMÜŞ DÜZELTME (devops, bu alt görev — canlı koşumda bulundu):
// `.serial` KULLANILMAZ — AC-4(a) ile AC-4(b) arasında bir SIRA bağımlılığı
// YOK (ikisi de SADECE `beforeAll`'un ürettiği aynı durumu okur), ama
// Playwright'ın `.serial` MODU bir test BAŞARISIZ olduğunda AYNI bloktaki
// SONRAKİ testleri "did not run" ile ATLAR — canlı ölçüm: AC-4(a) kasıtlı
// olmayan bir nedenle (apps/superadmin/src bulgusu, aşağıya bkz.) başarısız
// olunca AC-4(b) HİÇ ÇALIŞMADI, "2 passed" raporu YANILTICIYDI (gerçekte
// 1 geçti + 1 atlandı, 1 başarısız). `fullyParallel:false` (playwright.
// config.ts) zaten SIRALI yürütmeyi global olarak garanti ediyor — `.serial`
// burada SADECE "başarısızlıkta atla" davranışını EKLERDİ, hiçbir sıra
// garantisi KAYBOLMAZ.
test.describe('Süper admin yetkilendirme sınırları (T-021/S10, AC-4)', () => {
  let request: APIRequestContext | undefined
  let email: string | undefined
  let userId: string | undefined
  let storageState: Awaited<ReturnType<APIRequestContext['storageState']>> | undefined

  test.beforeAll(async ({ playwright }) => {
    const fixture = await createVerifiedFixtureUser(playwright, 'e2e-superadmin-authz')
    email = fixture.email
    userId = fixture.userId
    request = fixture.request

    // `platform_admin` satırı VAR — 2FA YOK (`enableTotpTwoFactor`
    // BİLİNÇLİ OLARAK çağrılmaz). "Yönetici değil" ile "2FA yok" arasındaki
    // ayrım BU testin konusu (AC-4(b)'nin `TWO_FACTOR_REQUIRED` beklentisi).
    grantPlatformAdmin(fixture.userId)

    storageState = await fixture.request.storageState()
  })

  test.afterAll(async () => {
    // Bu dosyanın akışı `platformAdminProcedure`'ün HER ikinci dal
    // ÇAĞRISINDA (AC-4(b)) `requirePlatformAdmin`'i tetikler ama
    // `ensureSignInRecorded` (R-PO4) başarısız dalın (`twoFactorRequired`
    // fırlatıldığı an) ÖNÜNE GEÇMEDEN çalışır — BU AKIŞ `platform_audit_log`a
    // YAZMAZ (2FA kontrolü `requirePlatformAdmin`'in KENDİSİ BAŞARILI
    // döndükten SONRA middleware'de yapılır, `ensureSignInRecorded` İSE
    // `requirePlatformAdmin` BAŞARILI OLUR OLMAZ portun İÇİNDE çağrılır —
    // bu yüzden satır YİNE DE yazılabilir). Temizlik güvenlik payı olarak
    // HER İKİ durumda da çalışır (sıfır satırsa no-op).
    if (userId !== undefined) {
      deletePlatformAuditLogByActor(userId)
    }
    if (email !== undefined) {
      deleteFixtureUserByEmail(email)
    }
    if (request !== undefined) {
      await request.dispose()
    }
  })

  test('AC-4(a) — 2FA kaydı olmayan platform yöneticisi kuruluma yönlenir', async ({ browser }) => {
    if (storageState === undefined) {
      throw new Error('beforeAll fixture kurulumu tamamlanmadı')
    }

    const context = await browser.newContext({ storageState })
    const page = await context.newPage()
    await page.goto('/')

    await expect(page).toHaveURL(/\/iki-adimli-dogrulama$/)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Devam etmeden önce iki adımlı doğrulamayı kurmanız gerekiyor',
      }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kurulumu başlat', exact: true })).toBeVisible()

    await context.close()
  })

  test('AC-4(b) — aynı oturumla platform.tenantList DOĞRUDAN çağrısı 403 TWO_FACTOR_REQUIRED döner (401/200 değil)', async () => {
    if (request === undefined) {
      throw new Error('beforeAll fixture kurulumu tamamlanmadı')
    }

    const response = await callTenantListDirectly(request)

    // ====== RAPORA GİRER (AC-4(b), ham durum kodu + gövde) ======
    expect(response.status).toBe(403)
    const envelope = trpcErrorEnvelopeSchema.parse(response.body)
    expect(envelope.error.data.appError.code).toBe('TWO_FACTOR_REQUIRED')
  })
})
