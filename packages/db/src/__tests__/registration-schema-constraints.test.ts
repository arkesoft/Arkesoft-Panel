// @arkesoft/db — `plan`/`subscription` tablolarının kısıt (UNIQUE/FK/ENUM/
// NOT NULL) davranışının CANLI doğrulaması (ROADMAP v0.1.0, T-019/S1,
// architect VERİ MODELİ — ADR-0021 §4).
//
// Emsal `version-registry-constraints.test.ts`'in (T-018, qa) BİREBİR AYNI
// sınıfı: `migration-sql.test.ts` kısıtların SQL METNİNDE yazılı OLDUĞUNU
// pinler, bu dosya CANLI Postgres'te GERÇEKTEN davranıp davranmadığını
// (bir INSERT/UPDATE/DELETE GERÇEKTEN kabul/red ediliyor mu) ölçer.
//
// ⚠⚠ ÖLÇÜLMÜŞ TUZAK (`version-registry-constraints.test.ts` dosya başı
// notuyla BİREBİR): `withTenant()` TEK bir Postgres `$transaction` açar —
// callback içinde yakalanan bir kısıt ihlali transaction'ı Postgres
// tarafında ABORTED yapar ve `$transaction` COMMIT'te TÜM transaction'ı
// (ihlalden ÖNCEKİ başarılı yazmalar DAHİL) geri alır. "önce başarılı yaz,
// sonra İHLAL DENE, sonra satır sayısını DOĞRULA" üçlüsü bu yüzden AYRI
// `withTenant()` çağrılarında (AYRI SQL transaction'larında) yapılır.
//
// KAPSAM DIŞI (BİLEREK): çapraz kiracı RLS senaryoları (okuma/`WITH CHECK`/
// "bulunamadı" semantiği/varlık oracle'ı/hata gövdesi/havuz sızıntısı) — bu
// YEDİ senaryo `tenant-isolation-suite.ts`'in `TenantScopedProbe` kaydıdır
// ve `subscription` için prob kaydı AYRI bir alt görevin (S5) işidir,
// `tenant-membership.isolation.test.ts`'in TEK çağrı noktasında yaşar. Bu
// dosya o kaydı TEKRARLAMAZ — yalnızca RLS'siz (UNIQUE/FK/ENUM/NOT NULL)
// kısıtları ölçer.

import { randomUUID } from 'node:crypto'

import { afterAll, describe, expect, it } from 'vitest'

import { isUniqueConstraintError, SubscriptionStatus, TenantStatus, withTenant } from '../index.js'
import { testAppPrisma } from './helpers/test-client.js'

const PROBE_LIMITS = { maxProducts: 1, maxOrdersPerMonth: 1, maxStorageBytes: 1, maxUsers: 1 }

async function createProbePlan(label: string): Promise<string> {
  const id = `rsc-plan-${label}-${randomUUID().slice(0, 8)}`
  await testAppPrisma.plan.create({
    data: { id, name: 'Kayıt Şeması Kısıt Probu', limits: PROBE_LIMITS },
  })
  return id
}

async function createProbeTenant(label: string): Promise<string> {
  const tenant = await testAppPrisma.tenant.create({
    data: {
      slug: `rsc-${label}-${randomUUID()}`,
      name: 'Kayıt Şeması Kısıt Probu',
      status: TenantStatus.active,
    },
  })
  return tenant.id
}

describe('plan — doğal anahtar (id) UNIQUE (Theme.id emsali)', () => {
  const createdPlanIds: string[] = []

  afterAll(async () => {
    if (createdPlanIds.length > 0) {
      await testAppPrisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } })
    }
  })

  it('aynı id ile ikinci plan REDDEDİLİR (P2002)', async () => {
    const id = `rsc-plan-dup-${randomUUID().slice(0, 8)}`
    createdPlanIds.push(id)

    await testAppPrisma.plan.create({ data: { id, name: 'İlk', limits: PROBE_LIMITS } })

    let caughtError: unknown
    try {
      await testAppPrisma.plan.create({ data: { id, name: 'Mükerrer', limits: PROBE_LIMITS } })
    } catch (error) {
      caughtError = error
    }

    expect(isUniqueConstraintError(caughtError)).toBe(true)
  })
})

describe('subscription — tenantId @unique, GERÇEK 1:1 (TenantVersionState emsali)', () => {
  const createdTenantIds: string[] = []
  const createdPlanIds: string[] = []

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await testAppPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
    }
    if (createdPlanIds.length > 0) {
      await testAppPrisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } })
    }
  })

  it('aynı tenant için İKİNCİ abonelik REDDEDİLİR (P2002 — RLS DEĞİL, tenant_id gerçekten eşleşiyor)', async () => {
    const planId = await createProbePlan('unique')
    createdPlanIds.push(planId)
    const tenantId = await createProbeTenant('sub-unique')
    createdTenantIds.push(tenantId)

    await withTenant(testAppPrisma, tenantId, (tx) =>
      tx.subscription.create({
        data: {
          tenantId,
          planId,
          status: SubscriptionStatus.active,
          limits: PROBE_LIMITS,
          startedAt: new Date(),
        },
      }),
    )

    let caughtError: unknown
    try {
      await withTenant(testAppPrisma, tenantId, (tx) =>
        tx.subscription.create({
          data: {
            tenantId,
            planId,
            status: SubscriptionStatus.active,
            limits: PROBE_LIMITS,
            startedAt: new Date(),
          },
        }),
      )
    } catch (error) {
      caughtError = error
    }

    expect(isUniqueConstraintError(caughtError)).toBe(true)

    const rowCount = await withTenant(testAppPrisma, tenantId, (tx) =>
      tx.subscription.count({ where: { tenantId } }),
    )
    expect(rowCount).toBe(1)
  })
})

describe('subscription.planId — FK ON DELETE RESTRICT (CASCADE DEĞİL)', () => {
  const createdTenantIds: string[] = []
  const createdPlanIds: string[] = []

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await testAppPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
    }
    if (createdPlanIds.length > 0) {
      await testAppPrisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } })
    }
  })

  it('canlı aboneliği olan bir plan SİLİNEMEZ (subscription_plan_id_fkey, RESTRICT)', async () => {
    const planId = await createProbePlan('restrict')
    createdPlanIds.push(planId)
    const tenantId = await createProbeTenant('sub-restrict')
    createdTenantIds.push(tenantId)

    await withTenant(testAppPrisma, tenantId, (tx) =>
      tx.subscription.create({
        data: {
          tenantId,
          planId,
          status: SubscriptionStatus.active,
          limits: PROBE_LIMITS,
          startedAt: new Date(),
        },
      }),
    )

    await expect(testAppPrisma.plan.delete({ where: { id: planId } })).rejects.toThrow(
      /subscription_plan_id_fkey/,
    )

    // Plan SİLİNMEDİ (RESTRICT reddi gerçekten etkili oldu) — ikinci doğrulama katmanı.
    const plan = await testAppPrisma.plan.findUnique({ where: { id: planId } })
    expect(plan).not.toBeNull()
  })
})

describe('subscription.tenantId — FK ON DELETE CASCADE', () => {
  const createdPlanIds: string[] = []

  afterAll(async () => {
    if (createdPlanIds.length > 0) {
      await testAppPrisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } })
    }
  })

  it('tenant SİLİNİNCE bağlı subscription satırı da gider (ADR-0003 madde 3 — cleanupTenant sızıntısı olmaz)', async () => {
    const planId = await createProbePlan('cascade')
    createdPlanIds.push(planId)
    const tenantId = await createProbeTenant('sub-cascade')

    await withTenant(testAppPrisma, tenantId, (tx) =>
      tx.subscription.create({
        data: {
          tenantId,
          planId,
          status: SubscriptionStatus.active,
          limits: PROBE_LIMITS,
          startedAt: new Date(),
        },
      }),
    )

    const beforeCount = await withTenant(testAppPrisma, tenantId, (tx) =>
      tx.subscription.count({ where: { tenantId } }),
    )
    expect(beforeCount).toBe(1)

    await testAppPrisma.tenant.delete({ where: { id: tenantId } })

    const afterCount = await withTenant(testAppPrisma, tenantId, (tx) =>
      tx.subscription.count({ where: { tenantId } }),
    )
    expect(afterCount).toBe(0)
  })
})

// ⚠⚠ ÖLÇÜLMÜŞ BULGU (bu dosyanın yazımı sırasında — brief'in "NOT NULL
// canlı reddi" talimatını bu test ÇÜRÜTTÜ/İNCELTTİ): `subscription` FORCE
// ROW LEVEL SECURITY altında olduğu için `tenant_id = NULL` içeren bir satır
// `arkesoft_app` (RLS'e tabi, context'siz) bağlantısından denendiğinde hata
// `23502` ("null value in column … violates not-null constraint") DEĞİL,
// `42501` ("new row violates row-level security policy") olarak dönüyor —
// `NULL = current_setting(...)` karşılaştırması SQL üç-değerli mantıkta
// `NULL` (ne `true` ne `false`) döner ve `WITH CHECK` bunu RET sayar, NOT
// NULL kısıtına SIRA GELMEDEN. Bu bir GÜVENLİK ZAAFİ DEĞİL — tam tersine iki
// bağımsız savunma katmanının (NOT NULL + RLS `WITH CHECK`) AYNI yanlış
// satırı REDDETTİĞİNİN kanıtı; hangisinin ÖNCE tetiklendiği uygulama
// davranışını DEĞİŞTİRMEZ (satır her iki durumda da YAZILMAZ). Statik kanıt
// (kolonun GERÇEKTEN `NOT NULL` olduğu) zaten `migration-sql.test.ts` →
// `MISSING_TENANT_ID_COLUMN` tarafından mekanik olarak pinlidir; bu test
// CANLI davranışı (hangi hata koduyla OLURSA OLSUN, satırın asla
// YAZILMADIĞINI) ölçer.
describe('subscription — NULL tenant_id canlı reddi (CLAUDE.md §7 md 1 — RLS + NOT NULL, iki bağımsız katman)', () => {
  const createdPlanIds: string[] = []

  afterAll(async () => {
    if (createdPlanIds.length > 0) {
      await testAppPrisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } })
    }
  })

  it("NULL tenant_id ile INSERT REDDEDİLİR (raw SQL, parametreli — Unsafe DEĞİL; context'siz RLS WITH CHECK ÖNCE tetiklenir, ölçüldü)", async () => {
    const planId = await createProbePlan('not-null')
    createdPlanIds.push(planId)
    const id = randomUUID()

    await expect(
      testAppPrisma.$executeRaw`INSERT INTO subscription (id, tenant_id, plan_id, limits, started_at) VALUES (${id}, NULL, ${planId}, '{}'::jsonb, now())`,
    ).rejects.toThrow(/row-level security policy/)
  })
})

describe('site_type / subscription_status — ENUM canlı reddi (AC-1 emsali, raw SQL ile ölçüm)', () => {
  it('geçersiz site_type değeri REDDEDİLİR — Postgres ENUM seviyesinde', async () => {
    await expect(testAppPrisma.$executeRaw`SELECT 'invalid_site_type'::site_type`).rejects.toThrow(
      /invalid input value for enum site_type/,
    )
  })

  it('geçersiz subscription_status değeri REDDEDİLİR — Postgres ENUM seviyesinde', async () => {
    await expect(
      testAppPrisma.$executeRaw`SELECT 'invalid_status'::subscription_status`,
    ).rejects.toThrow(/invalid input value for enum subscription_status/)
  })
})
