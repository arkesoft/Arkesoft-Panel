// @arkesoft/api — `AuthGuard`'ın owner 2FA zorlama kapısı (ROADMAP v0.0.15,
// T-016/S6, ADR-0018)
//
// ADR-0014 standardı: TEK implementasyon + TAM gövde assert'i + "yakın-ıska"
// içeren sentetik veri. ÜÇ yakın-ıska hücresi (aşağıda AÇIKÇA işaretli) HİÇBİRİ
// 403 ALMAMALIDIR — aksi hâlde 403 assert'i rolü/politikayı DEĞİL başka bir
// şeyi ölçüyor olurdu.
//
// ⚠ ÖLÜMCÜL KİLİT KANITI (bağlam özeti madde 2): `tenant.kind === 'exempt'`
// dalı (`auth.guard.ts`'in `enforceTenantMembership`'i) 2FA kontrolüne HİÇ
// GİRMEDEN `true` döner — bu BİRİM test ile (hiçbir Prisma çağrısı atılmadan)
// VE bir HTTP testiyle (`/auth/sessions`, BUGÜN GERÇEKTEN tenant-exempt olan
// bilinen bir uç) KANITLANIR. `/auth/two-factor/*` uçlarının KENDİSİ bu
// alt görevin DOKUNMA YASAĞI listesindeki dört dosyaya (S5'in işi) EKLENECEK —
// bu dosya o dosyalara DOKUNMAZ, yalnızca "tenant-exempt bir yol asla bu
// kontrole girmez" YAPISAL değişmezini kanıtlar; S5'in eklemesi tamamlandığında
// `/auth/two-factor/*` da AYNI yapısal garantiden otomatik YARARLANIR.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { ExecutionContext, INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { pino } from 'pino'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { AuthGuard } from '../auth/auth.guard.js'
import { TwoFactorComplianceService } from '../auth/two-factor-compliance.service.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { TwoFactorRequiredError } from '../errors/domain/two-factor-required.error.js'
import { TwoFactorSetupRequiredError } from '../errors/domain/two-factor-setup-required.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { requestContextStorage } from '../request-context/request-context.storage.js'
import type { RequestContext } from '../request-context/request-context.types.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { AuthProbeController } from './helpers/auth-probe.controller.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

function tenantHost(slug: string): string {
  return `${slug}.${BASE_ENV.APP_BASE_DOMAIN}`
}

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

const REQUEST_ID = 'req_test000000000000000000s6tf'
const GUARD_TEST_CLIENT = { ip: null, userAgent: null } as const satisfies RequestContext['client']

/** `auth-guard.test.ts`'in BİREBİR AYNI yardımcısı (bilerek yerel kopya — dosya sahipliği). */
function runWithStore<T>(
  store: Omit<RequestContext, 'requestId' | 'receivedAt' | 'client'>,
  callback: () => T,
): T {
  const fullStore: RequestContext = {
    requestId: REQUEST_ID,
    receivedAt: Date.now(),
    client: GUARD_TEST_CLIENT,
    ...store,
  }
  return requestContextStorage.run(fullStore, callback)
}

const FAKE_EXECUTION_CONTEXT = {} as unknown as ExecutionContext

type FakeTenantRow = { readonly requireTwoFactorForOwner: boolean } | null
type FakeUserRow = { readonly twoFactorEnabled: boolean } | null

/** `TwoFactorComplianceService`'in birim testleri İÇİN sahte `PrismaService` — gerçek DB'ye DOKUNMAZ. */
function createFakePrismaService(options: {
  readonly tenantRow: FakeTenantRow
  readonly userRow: FakeUserRow
}): {
  readonly prismaService: PrismaService
  readonly tenantFindUnique: ReturnType<typeof vi.fn>
  readonly userFindUnique: ReturnType<typeof vi.fn>
} {
  const tenantFindUnique = vi.fn().mockResolvedValue(options.tenantRow)
  const userFindUnique = vi.fn().mockResolvedValue(options.userRow)
  const prismaService = {
    db: {
      tenant: { findUnique: tenantFindUnique },
      user: { findUnique: userFindUnique },
    },
  } as unknown as PrismaService
  return { prismaService, tenantFindUnique, userFindUnique }
}

describe('TwoFactorComplianceService — birim (sahte PrismaService, DB YOK)', () => {
  it('politika KAPALI → "not_required", ikinci sorgu (user.twoFactorEnabled) HİÇ ATILMAZ', async () => {
    const { prismaService, tenantFindUnique, userFindUnique } = createFakePrismaService({
      tenantRow: { requireTwoFactorForOwner: false },
      userRow: null,
    })
    const service = new TwoFactorComplianceService(prismaService)

    const status = await service.evaluateOwnerStatus('tnt_1', 'usr_1')

    expect(status).toBe('not_required')
    expect(tenantFindUnique).toHaveBeenCalledTimes(1)
    // BOŞ ASSERT KANITI (ADR-0014): spy GERÇEKTEN 0 çağrı gördü, "tanımlı
    // ama hiç çalışmadı" DEĞİL — `toHaveBeenCalledTimes(0)` `expect.any()`
    // ile KARIŞTIRILAMAZ, bu doğrudan bir sayı iddiasıdır.
    expect(userFindUnique).toHaveBeenCalledTimes(0)
  })

  it('politika AÇIK + kullanıcı 2FA AÇIK → "satisfied"', async () => {
    const { prismaService, userFindUnique } = createFakePrismaService({
      tenantRow: { requireTwoFactorForOwner: true },
      userRow: { twoFactorEnabled: true },
    })
    const service = new TwoFactorComplianceService(prismaService)

    const status = await service.evaluateOwnerStatus('tnt_1', 'usr_1')

    expect(status).toBe('satisfied')
    expect(userFindUnique).toHaveBeenCalledTimes(1)
  })

  it('politika AÇIK + kullanıcı 2FA KAPALI → "setup_required"', async () => {
    const { prismaService } = createFakePrismaService({
      tenantRow: { requireTwoFactorForOwner: true },
      userRow: { twoFactorEnabled: false },
    })
    const service = new TwoFactorComplianceService(prismaService)

    await expect(service.evaluateOwnerStatus('tnt_1', 'usr_1')).resolves.toBe('setup_required')
  })

  it('politika AÇIK + kullanıcı satırı YOK (teorik) → "setup_required" (korumacı, fail-closed)', async () => {
    const { prismaService } = createFakePrismaService({
      tenantRow: { requireTwoFactorForOwner: true },
      userRow: null,
    })
    const service = new TwoFactorComplianceService(prismaService)

    await expect(service.evaluateOwnerStatus('tnt_1', 'usr_1')).resolves.toBe('setup_required')
  })

  it('tenant satırı YOK (teorik hard-delete yarışı) → "not_required" (TenantGuard\'ın işi, burada TEKRARLANMAZ)', async () => {
    const { prismaService } = createFakePrismaService({ tenantRow: null, userRow: null })
    const service = new TwoFactorComplianceService(prismaService)

    await expect(service.evaluateOwnerStatus('tnt_1', 'usr_1')).resolves.toBe('not_required')
  })

  it('assertOwnerCompliance: "setup_required" → TwoFactorRequiredError (403), context {userId, tenantId}, log uyarısı', async () => {
    const { prismaService } = createFakePrismaService({
      tenantRow: { requireTwoFactorForOwner: true },
      userRow: { twoFactorEnabled: false },
    })
    const service = new TwoFactorComplianceService(prismaService)
    const logger = pino({ level: 'silent' })
    const warnSpy = vi.spyOn(logger, 'warn')

    const identity = { userId: 'usr_1', sessionId: 'ses_1' }
    await expect(service.assertOwnerCompliance(identity, 'tnt_1', logger)).rejects.toBeInstanceOf(
      TwoFactorRequiredError,
    )
    // BOŞ ASSERT KANITI — `rejects` ZİNCİRİ gerçekten tetiklendi mi, spy
    // GERÇEKTEN çağrıldı mı: ikisi de AYRI assert'le doğrulanır (sessiz boşalma
    // riskine karşı, bağlam özeti "⚠" notu).
    expect(warnSpy).toHaveBeenCalledTimes(1)

    try {
      await service.assertOwnerCompliance(identity, 'tnt_1', logger)
      expect.fail('TwoFactorRequiredError BEKLENİYORDU')
    } catch (error) {
      expect(error).toBeInstanceOf(TwoFactorRequiredError)
      const typed = error as TwoFactorRequiredError
      expect(typed.code).toBe('TWO_FACTOR_REQUIRED')
      expect(typed.httpStatus).toBe(403)
      expect(typed.context).toEqual({ userId: 'usr_1', tenantId: 'tnt_1' })
    }
  })

  it('assertOwnerCompliance: "satisfied" → FIRLATMAZ (resolves undefined)', async () => {
    const { prismaService } = createFakePrismaService({
      tenantRow: { requireTwoFactorForOwner: true },
      userRow: { twoFactorEnabled: true },
    })
    const service = new TwoFactorComplianceService(prismaService)
    const logger = pino({ level: 'silent' })

    await expect(
      service.assertOwnerCompliance({ userId: 'usr_1', sessionId: 'ses_1' }, 'tnt_1', logger),
    ).resolves.toBeUndefined()
  })
})

describe('TWO_FACTOR_REQUIRED (403) vs TWO_FACTOR_SETUP_REQUIRED (409) — AYRI sınıflar, AYRI statüler', () => {
  it('iki sınıf AYRI `code`/`httpStatus` taşır — AYNI sınıf iki statüyle KULLANILMADI', () => {
    const enforcementError = new TwoFactorRequiredError('usr_1', 'tnt_1')
    const setupError = new TwoFactorSetupRequiredError()

    expect(enforcementError.code).toBe('TWO_FACTOR_REQUIRED')
    expect(enforcementError.httpStatus).toBe(403)
    expect(setupError.code).toBe('TWO_FACTOR_SETUP_REQUIRED')
    expect(setupError.httpStatus).toBe(409)
    expect(enforcementError).not.toBeInstanceOf(TwoFactorSetupRequiredError)
    expect(setupError).not.toBeInstanceOf(TwoFactorRequiredError)
  })
})

describe('AuthGuard — ölümcül kilit YOK: tenant-exempt dal 2FA kontrolüne HİÇ GİRMEZ (birim, DB YOK)', () => {
  // T-016 FIX turu 1, madde 3/M-1 (solid) — `TwoFactorComplianceService` ARTIK
  // DI'DAN alınır (bkz. `auth.guard.ts` dosya başı GÜNCELLEME yorumu); bu
  // test artık İKİ bağımlılığı da BAĞIMSIZ birer `vi.fn()` ile GÖZLEMLER —
  // ÖNCEKİ `new Proxy` fırlatma hilesi (TEK yol, dolaylı: "Prisma'ya
  // dokunursa patlar") GEREKLİ DEĞİL artık: `TwoFactorComplianceService`
  // KENDİSİ enjekte edilebilir olduğu için "bu servis HİÇ ÇAĞRILMADI" artık
  // DOĞRUDAN assert edilebilir (solid'in istediği, daha GÜÇLÜ iddia).
  it('auth "authenticated" (owner kimliği) + tenant "exempt" → true, Prisma VE 2FA uyumluluk kontrolü HİÇ ÇAĞRILMAZ', async () => {
    const withTenantProbe = vi.fn()
    const assertOwnerComplianceProbe = vi.fn()
    const fakePrismaService = { withTenant: withTenantProbe } as unknown as PrismaService
    const fakeComplianceService = {
      assertOwnerCompliance: assertOwnerComplianceProbe,
    } as unknown as TwoFactorComplianceService
    const guard = new AuthGuard(fakePrismaService, fakeComplianceService)

    await expect(
      runWithStore(
        {
          logger: pino({ level: 'silent' }),
          tenant: { kind: 'exempt' },
          auth: { kind: 'authenticated', userId: 'usr_owner_locked_out', sessionId: 'ses_1' },
        },
        () => guard.canActivate(FAKE_EXECUTION_CONTEXT),
      ),
    ).resolves.toBe(true)

    expect(withTenantProbe).toHaveBeenCalledTimes(0)
    expect(assertOwnerComplianceProbe).toHaveBeenCalledTimes(0)
  })
})

describe('AuthGuard — HTTP: owner 2FA zorlaması (gerçek Postgres, gerçek Mailpit)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  const createdTenantIds: string[] = []

  beforeAll(async () => {
    const testApp = await createTestApp({ smokeControllers: [AuthProbeController] })
    app = testApp.app
    prismaService = app.get(PrismaService)
  }, 60_000)

  afterAll(async () => {
    if (app !== undefined) {
      // `tenant_membership`/`audit_log`/`tenant_invitation` üçü de kiracıya
      // `onDelete: Cascade` ile bağlı (`member-authz.test.ts`'in AYNI deseni)
      // — kiracıyı silmek satırları temizler, sırayla/paralel FARK ETMEZ.
      await Promise.all(
        createdTenantIds.map((id) => prismaService.db.tenant.delete({ where: { id } })),
      )
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  /** Her test KENDİ izole kiracısını kurar — DEMO_SEED/paylaşılan tenant MUTASYONA UĞRATILMAZ. */
  async function createIsolatedTenant(
    namePrefix: string,
    requireTwoFactorForOwner: boolean,
  ): Promise<{ readonly tenantId: string; readonly slug: string }> {
    const slug = uniqueSlug(namePrefix)
    const tenant = await prismaService.db.tenant.create({
      data: {
        slug,
        name: `S6 2FA — ${namePrefix}`,
        status: TenantStatus.active,
        requireTwoFactorForOwner,
      },
    })
    createdTenantIds.push(tenant.id)
    return { tenantId: tenant.id, slug }
  }

  async function addMembership(tenantId: string, userId: string, role: TenantRole): Promise<void> {
    await prismaService.withTenant(tenantId, (tx) =>
      tx.tenantMembership.create({ data: { tenantId, userId, role } }),
    )
  }

  async function setTwoFactorEnabled(userId: string, enabled: boolean): Promise<void> {
    await prismaService.db.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: enabled },
    })
  }

  it('ANA HÜCRE: owner + politika AÇIK + 2FA KAPALI → 403 TWO_FACTOR_REQUIRED, TAM gövde', async () => {
    const { tenantId, slug } = await createIsolatedTenant('owner-locked', true)
    const owner = await createAuthenticatedSession(httpServer())
    await addMembership(tenantId, owner.userId, TenantRole.owner)
    await setTwoFactorEnabled(owner.userId, false)

    const response = await request(httpServer())
      .get('/__auth_probe')
      .set('Host', tenantHost(slug))
      .set('Cookie', owner.cookieHeader)

    // RAPORA GİRER — tam gövde + durum kodu (TAMAMLANMA TANIMI madde 1).
    expect(response.status).toBe(403)
    const body = z
      .object({ code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()) })
      .parse(response.body)
    expect(body.code).toBe('TWO_FACTOR_REQUIRED')
    // `details`/tel gövdesi PII/bağlam TAŞIMAZ (AppError.context asla tele
    // serileşmez, `@arkesoft/errors` → `toErrorBody`) — mekanik kanıt.
    expect(body.details).toEqual({})
  })

  it('YAKIN-IŞKA 1: owner DEĞİL (readonly) + politika AÇIK + 2FA KAPALI → 403 ALMAZ (200)', async () => {
    const { tenantId, slug } = await createIsolatedTenant('readonly-not-owner', true)
    const readonlyMember = await createAuthenticatedSession(httpServer())
    await addMembership(tenantId, readonlyMember.userId, TenantRole.readonly)
    await setTwoFactorEnabled(readonlyMember.userId, false)

    const response = await request(httpServer())
      .get('/__auth_probe')
      .set('Host', tenantHost(slug))
      .set('Cookie', readonlyMember.cookieHeader)

    expect(response.status).toBe(200)
    const identity = z.object({ userId: z.string() }).parse(response.body)
    expect(identity.userId).toBe(readonlyMember.userId)
  })

  it('YAKIN-IŞKA 2: owner + politika AÇIK + 2FA AÇIK → 403 ALMAZ (200, "satisfied")', async () => {
    const { tenantId, slug } = await createIsolatedTenant('owner-satisfied', true)
    const owner = await createAuthenticatedSession(httpServer())
    await addMembership(tenantId, owner.userId, TenantRole.owner)
    await setTwoFactorEnabled(owner.userId, true)

    const response = await request(httpServer())
      .get('/__auth_probe')
      .set('Host', tenantHost(slug))
      .set('Cookie', owner.cookieHeader)

    expect(response.status).toBe(200)
  })

  it('YAKIN-IŞKA 3: owner + politika KAPALI + 2FA KAPALI → 403 ALMAZ (200, "not_required")', async () => {
    const { tenantId, slug } = await createIsolatedTenant('owner-policy-off', false)
    const owner = await createAuthenticatedSession(httpServer())
    await addMembership(tenantId, owner.userId, TenantRole.owner)
    await setTwoFactorEnabled(owner.userId, false)

    const response = await request(httpServer())
      .get('/__auth_probe')
      .set('Host', tenantHost(slug))
      .set('Cookie', owner.cookieHeader)

    expect(response.status).toBe(200)
  })

  it('TENANT İZOLASYONU: A kiracısının politikası (AÇIK), SAHİBİ AYNI kullanıcı olsa da B kiracısını (politika KAPALI) ETKİLEMEZ', async () => {
    const tenantA = await createIsolatedTenant('isolation-a', true)
    const tenantB = await createIsolatedTenant('isolation-b', false)
    const owner = await createAuthenticatedSession(httpServer())
    await addMembership(tenantA.tenantId, owner.userId, TenantRole.owner)
    await addMembership(tenantB.tenantId, owner.userId, TenantRole.owner)
    await setTwoFactorEnabled(owner.userId, false)

    const responseA = await request(httpServer())
      .get('/__auth_probe')
      .set('Host', tenantHost(tenantA.slug))
      .set('Cookie', owner.cookieHeader)
    const responseB = await request(httpServer())
      .get('/__auth_probe')
      .set('Host', tenantHost(tenantB.slug))
      .set('Cookie', owner.cookieHeader)

    // AYNI kullanıcı, AYNI 2FA durumu — SADECE kiracının KENDİ politikası
    // sonucu belirler (A: 403, B: 200). Politika kiracıya AİTTİR, kullanıcıya
    // DEĞİL — çapraz kiracı sızıntısı YOK (CLAUDE.md §7).
    expect(responseA.status).toBe(403)
    expect(responseB.status).toBe(200)
  })

  it("ÖLÜMCÜL KİLİT YOK (HTTP): bilinen tenant-exempt uç (`/auth/sessions`) owner'ın 2FA KAPALI/politika AÇIK durumunda HÂLÂ 200", async () => {
    const { tenantId, slug } = await createIsolatedTenant('exempt-path-proof', true)
    const owner = await createAuthenticatedSession(httpServer())
    await addMembership(tenantId, owner.userId, TenantRole.owner)
    await setTwoFactorEnabled(owner.userId, false)

    // `/auth/sessions` `AUTH_OWN_PATHS`/`TENANT_EXEMPT_PATHS`'te (BUGÜN,
    // ölçülmüş) VAR — Host BAŞLIĞI bu uç için İLGİSİZDİR (tenant-exempt),
    // yine de tenant alt alan adıyla İSTENİR (gerçekçi senaryo: owner KENDİ
    // tenant panelinden oturumlarını listeler).
    const response = await request(httpServer())
      .get('/auth/sessions')
      .set('Host', tenantHost(slug))
      .set('Cookie', owner.cookieHeader)

    expect(response.status).toBe(200)
    const body = z.array(z.object({ id: z.string() })).parse(response.body)
    expect(Array.isArray(body)).toBe(true)
  })
})
