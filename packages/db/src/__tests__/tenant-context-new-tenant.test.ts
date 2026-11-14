// @arkesoft/db — `withNewTenant()` entegrasyon testleri + `PlatformTenantWriter`
// negatif tip pini (ROADMAP v0.1.0, T-019/S1, architect VERİ MODELİ —
// ADR-0021 §4).
//
// İKİ KATMAN taşır (tek dosyada, Task handoff'unun açık kararı):
//   1. GERÇEK Postgres entegrasyon testleri (`describe` içinde) — `withTenant`
//      testlerinin BİREBİR aynı deseni (`testAppPrisma`, bkz. `test-client.ts`).
//      Üç vaka: (a) TEK transaction'da `tenant` + `tenant_membership(owner)` +
//      `subscription` yazımı ve bunların AYRI bir `withTenant` okumasıyla
//      doğrulanması; (b) kayıtlı olmayan istemci FAIL-CLOSED `throw` eder ve
//      `insertTenant`/`callback` HİÇ ÇAĞRILMAZ; (c) `insertTenant` boş/
//      yalnızca boşluk bir `id` döndürürse `throw` eder VE transaction
//      ROLLBACK olur — yazılan `tenant` satırı KALICI KALMAZ (R-A1'in
//      "sahipsiz kiracı yapısal olarak imkânsız" iddiasının mekanik kanıtı).
//   2. Derleme zamanı NEGATİF tip pini (modül seviyesi, hiçbir yerden
//      çağrılmaz) — `PlatformTenantWriter`'ın `user`/`account`/`session`/
//      `verification`/`twoFactor`/`$transaction` TAŞIMADIĞINI kanıtlar
//      (`auth-model-narrowing.pin.ts`'in deseniyle BİREBİR — bu dosyanın
//      `.test.ts` olması `tsc`'nin onu TARAMASINI engellemez, Vitest'in
//      `it()` bulmamasıyla İLGİSİZ bir eksen).

import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { TenantRole, TenantStatus, UserStatus, withNewTenant, withTenant } from '../index.js'
import type { PlatformTenantWriter, TransactionClient } from '../index.js'
import { testAppPrisma, testMigrationPrisma } from './helpers/test-client.js'

describe('withNewTenant', () => {
  const createdTenantIds: string[] = []
  const createdUserIds: string[] = []
  const testPlanId = `wnt-plan-${randomUUID()}`
  const testPlanLimits = {
    maxProducts: 1,
    maxOrdersPerMonth: 1,
    maxStorageBytes: 1,
    maxUsers: 1,
  }

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await testAppPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
    }
    if (createdUserIds.length > 0) {
      await testAppPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
    }
    // `plan` `AppPrismaDatabase`/`TenantTransactionClient` allowlist'inin
    // HİÇBİRİNE eklenmez (ADR-0021 §4) — `testAppPrisma`'nın TİPİ burada
    // (test yardımcısında) BİLEREK tam `PrismaDatabase`'tir (bkz.
    // `test-client.ts`), bu yüzden `.plan` erişimi derlenir; bu, üretim
    // kodundaki (`apps/api`) kısıtlamayla ÇELİŞMEZ — o kısıt `apps/api`'nin
    // KENDİ dar tipini (`AppPrismaDatabase`) kullanmasından gelir.
    await testAppPrisma.plan.deleteMany({ where: { id: testPlanId } })
  })

  it('tek transaction: tenant + tenant_membership(owner) + subscription aynı anda yazılır', async () => {
    const suffix = randomUUID()
    const slug = `wnt-pos-${suffix}`

    const user = await testAppPrisma.user.create({
      data: {
        email: `wnt-pos-${suffix}@arkesoft.test`,
        name: 'withNewTenant Testi — Owner',
        status: UserStatus.active,
      },
    })
    createdUserIds.push(user.id)

    const tenantId = await withNewTenant(
      testAppPrisma,
      async (tx) => {
        // `PlatformTenantWriter`'ın İKİNCİ üyesi (`plan`) burada EGZERSİZ
        // EDİLİR — kayıt akışının "trial planını OKUMA/yazma" ihtiyacının
        // karşılığı (ADR-0021 §4, `PlatformTenantWriter` doc'u).
        await tx.plan.upsert({
          where: { id: testPlanId },
          create: { id: testPlanId, name: 'withNewTenant Test Planı', limits: testPlanLimits },
          update: {},
        })

        const tenant = await tx.tenant.create({
          data: { slug, name: 'withNewTenant Testi', status: TenantStatus.active },
        })
        return { id: tenant.id }
      },
      async (tx, newTenantId) => {
        await tx.tenantMembership.create({
          data: { tenantId: newTenantId, userId: user.id, role: TenantRole.owner },
        })
        await tx.subscription.create({
          data: {
            tenantId: newTenantId,
            planId: testPlanId,
            limits: testPlanLimits,
            startedAt: new Date(),
          },
        })
        return newTenantId
      },
    )
    createdTenantIds.push(tenantId)

    // Doğrulama AYRI bir `withTenant` okumasıyla (`withNewTenant`'ın yazdığı
    // transaction COMMIT olduktan SONRA, farklı bir bağlantı/transaction'da)
    // — iki yazıcı yolun (`withTenant`/`withNewTenant`) AYNI GUC sözleşmesini
    // paylaştığını da dolaylı olarak kanıtlar.
    const membership = await withTenant(testAppPrisma, tenantId, (tx) =>
      tx.tenantMembership.findMany({ where: { tenantId } }),
    )
    expect(membership).toHaveLength(1)
    expect(membership[0]?.role).toBe(TenantRole.owner)
    expect(membership[0]?.userId).toBe(user.id)

    const subscription = await withTenant(testAppPrisma, tenantId, (tx) =>
      tx.subscription.findUnique({ where: { tenantId } }),
    )
    expect(subscription).not.toBeNull()
    expect(subscription?.planId).toBe(testPlanId)
    expect(subscription?.limits).toEqual(testPlanLimits)
  })

  // ⚠ ÖLÇÜLMÜŞ DÜZELTME: `withNewTenant` `async` DEĞİLDİR — fail-closed
  // kontrolü `client.$transaction(...)`'a ULAŞMADAN SENKRON `throw` eder
  // (`withTenant`'ın BİREBİR aynı deseni). `await expect(fn()).rejects.
  // toThrow()` bu durumda YANLIŞ araçtır (ifade `expect()`'e ULAŞMADAN
  // fırlar) — doğru araç `expect(() => fn()).toThrow()`.
  it('kayıtlı olmayan istemci FAIL-CLOSED SENKRON throw eder; insertTenant/callback HİÇ ÇAĞRILMAZ', () => {
    const insertTenant = vi.fn()
    const callback = vi.fn()

    expect(() => {
      // `void` — çağrı SENKRON `throw` eder (yukarıdaki not); dönen
      // `Promise<T>` hiç ÜRETİLMEZ, ama tip seviyesinde yine de bir Promise
      // beklenir (`@typescript-eslint/no-floating-promises` bunu BİLMEZ).
      void withNewTenant(
        testMigrationPrisma,
        insertTenant as unknown as (tx: PlatformTenantWriter) => Promise<{ readonly id: string }>,
        callback as unknown as (tx: TransactionClient, tenantId: string) => Promise<unknown>,
      )
    }).toThrow('withNewTenant(): bu istemci tenant context için kaydedilmemiş')

    expect(insertTenant).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it('insertTenant boş/yalnızca boşluk bir "id" döndürürse throw eder VE tenant satırı KALICI KALMAZ (rollback)', async () => {
    const suffix = randomUUID()
    const slug = `wnt-rollback-${suffix}`
    const callback = vi.fn()

    await expect(
      withNewTenant(
        testAppPrisma,
        async (tx) => {
          // Satır GERÇEKTEN yazılır — asıl iddia bunun transaction ROLLBACK
          // ile birlikte GERİ ALINDIĞIDIR, "hiç yazılmadığı" DEĞİL.
          await tx.tenant.create({
            data: { slug, name: 'Rollback Testi', status: TenantStatus.active },
          })
          return { id: '   ' }
        },
        callback as unknown as (tx: TransactionClient, tenantId: string) => Promise<unknown>,
      ),
    ).rejects.toThrow(
      'withNewTenant(): "insertTenant" boş veya yalnızca boşluk olan bir "id" döndürdü.',
    )

    expect(callback).not.toHaveBeenCalled()

    const leftover = await testAppPrisma.tenant.findUnique({ where: { slug } })
    expect(leftover).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// NEGATİF TİP PİNİ — `PlatformTenantWriter` KAPALI DÜNYA (derleme zamanı;
// `auth-model-narrowing.pin.ts`'in deseniyle BİREBİR — bu fonksiyon hiçbir
// yerden ÇAĞRILMAZ, varlığı DERLENMESİ yeterlidir). `tsc`/`pnpm typecheck`
// bu dosyayı `.test.ts` uzantısına bakmadan tarar; Vitest'in `include`
// deseni bu eksenle İLGİSİZDİR — kanıt tamamen derleme zamanındadır.
// ---------------------------------------------------------------------------

/**
 * `PlatformTenantWriter` (`tenant-context.ts`) YALNIZCA `tenant`/`plan`
 * taşır. `user`/`account`/`session`/`verification`/`twoFactor`
 * (`AUTH_SECRET_BEARING_MODELS`'in BİREBİR dışlaması — kayıt akışının
 * platform fazı kimlik doğrulama tablolarına erişmemeli) ve `$transaction`
 * (iç içe transaction YAPISAL olarak İMKÂNSIZ olmalı, `withTenant`'ın
 * BİREBİR aynı kararı) ERİŞİLEMEZ OLMALIDIR. Her satırdaki `@ts-expect-error`
 * GERÇEKTEN bir tip hatası bulmazsa `pnpm typecheck` KIRMIZIYA döner.
 */
export function pinPlatformTenantWriterDropsAuthModelsAndTransaction(
  tx: PlatformTenantWriter,
): readonly unknown[] {
  return [
    // @ts-expect-error — "user" PlatformTenantWriter'da YOK (AUTH_SECRET_BEARING_MODELS'in bağlayıcı dışlaması), erişilemez.
    tx.user,
    // @ts-expect-error — "account" PlatformTenantWriter'da YOK, erişilemez.
    tx.account,
    // @ts-expect-error — "session" PlatformTenantWriter'da YOK, erişilemez.
    tx.session,
    // @ts-expect-error — "verification" PlatformTenantWriter'da YOK, erişilemez.
    tx.verification,
    // @ts-expect-error — "twoFactor" PlatformTenantWriter'da YOK, erişilemez.
    tx.twoFactor,
    // @ts-expect-error — "$transaction" PlatformTenantWriter'da YOK (iç içe transaction yapısal olarak imkânsız), erişilemez.
    tx.$transaction,
  ]
}
