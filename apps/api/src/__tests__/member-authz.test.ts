// @arkesoft/api — AC1: `member.*` yazma uçlarının YETKİ MATRİSİ + `perf`
// ikamesinin BİRİNCİ ölçümü (ROADMAP v0.0.14, T-014/S5, architect K-A5/K-A6)
//
// ⚠⚠ BU DOSYA PLATFORMUN İLK MUTATION TESTİDİR. T-014'ten önce sözleşme
// yüzeyinde SIFIR yazma ucu vardı (beş prosedürün beşi de okumaydı), yani
// "yetkisiz bir asıl bir YAZMA ucuna ne alır" sorusu HİÇBİR testte
// ölçülmemişti.
//
// ⚠ TOPOLOJİ ÖLÇÜLDÜ, VARSAYILMADI (ADR-0011 madde 4): üç yazma ucu KİRACI
// KAPSAMLIDIR → kiracı bağlamı çözülemeyen bir istek prosedüre HİÇ ULAŞMAZ,
// muhafız 404 `TENANT_NOT_FOUND` üretir (aşağıda AYRI bir `it` ile ölçülüyor —
// "panel host'u 404" iddiasının bu süitteki karşılığı). Testler bu yüzden
// kiracıyı geliştirici başlığıyla (`x-arkesoft-tenant`, `NODE_ENV !==
// 'production'` dalı) seçer; bu, mevcut tRPC testlerinin (`trpc-cross-tenant.
// isolation.test.ts`, `trpc-full-chain-domain-error.test.ts`) AYNI deseni.
//
// ⚠ `Origin` BAŞLIĞI ZORUNLU ve bu bir test hilesi DEĞİL, ölçülmüş bir
// gerekliliktir: `SameOriginGuard` (`same-origin.guard.ts`) GÜVENSİZ
// metotlarda `Origin`/`Sec-Fetch-Site`/`Referer` ÜÇÜ DE yokken VE istek çerez
// taşıyorken `missing_origin_with_cookie` ile reddeder. Platformun ilk
// mutation'ları ilk kez bu dalı yoğun kullanıyor. Güvenilir orijin
// `ApiEnv.AUTH_BASE_URL`'den TÜRETİLİR — literal yazılmaz (guard'ın kendisi de
// o tek değerden türetiyor).
//
// ⚠⚠ GÖVDE ŞEKLİ HAKKINDA ÖLÇÜLMÜŞ BİR FARK (raporun KARARLAR bölümüne de
// taşındı): `PERMISSION_DENIED` tRPC'nin İÇİNDEN fırlatıldığı için tel gövdesi
// tRPC hata ZARFIDIR (`{error:{data:{code,httpStatus,appError}}}`);
// `TENANT_MEMBERSHIP_REQUIRED` ise `AuthGuard`'dan, yani tRPC'ye GİRMEDEN
// fırlatıldığı için DÜZ `AppErrorBody`'dir. İkisi "birebir aynı gövde" DEĞİL,
// "birebir aynı `AppErrorBody`"dir — ve kabul kriterinin anlamı budur:
// platformun TEK tel sözleşmesi (`@arkesoft/errors`) her iki yolda da aynı
// dört alanı, aynı boş `details` ile üretir. Aşağıdaki karşılaştırma bu farkı
// gizlemek yerine AÇIKÇA ölçer.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { appErrorBodySchema } from '@arkesoft/errors'
import {
  memberInvitationSchema,
  memberRemovedSchema,
  memberRoleSchema,
  ROLE_PERMISSIONS,
  tenantRoleSchema,
  trpcErrorDataSchema,
} from '@arkesoft/trpc'
import type { TenantRoleWire } from '@arkesoft/trpc'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { MemberWritePortAdapter } from '../trpc/ports/member-write.port.adapter.js'
import { MembershipReadPortAdapter } from '../trpc/ports/membership-read.port.adapter.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

/** `SameOriginGuard`'ın güvenilir orijini — guard ile AYNI tek kaynaktan türetilir. */
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin

/** ROADMAP v0.0.14'ün kabul kriterinde ADIYLA sayılan üç yazma ucu. */
const WRITE_PROCEDURE_PATHS = ['member.invite', 'member.updateRole', 'member.remove'] as const
type WriteProcedurePath = (typeof WRITE_PROCEDURE_PATHS)[number]

/** Üç yazma ucunun tamamını kapılayan izin (katalogdan okunur, KOPYALANMAZ). */
const MEMBER_WRITE_PERMISSION = 'member:write'

/** `x-request-id` deseni `[A-Za-z0-9_-]{8,64}` — nokta İÇERMEZ (ölçüldü: noktalı değer YOK SAYILIR). */
function uniqueRequestId(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll('-', '').slice(0, 16)}`
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

describe('AC1 — member.* yazma uçlarının yetki matrisi (gerçek Postgres + gerçek HTTP)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let tenantId: string
  let tenantSlug: string
  let otherTenantId: string
  let otherTenantSlug: string
  let ownerCookie: string
  let readonlyCookie: string
  let actorCookie: string
  let actorUserId: string
  let targetUserId: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    tenantSlug = `ac1-${randomUUID().slice(0, 12)}`
    otherTenantSlug = `ac1-other-${randomUUID().slice(0, 10)}`

    const tenant = await prismaService.db.tenant.create({
      data: { slug: tenantSlug, name: 'AC1 Yetki Matrisi Kiracısı', status: TenantStatus.active },
    })
    tenantId = tenant.id

    const otherTenant = await prismaService.db.tenant.create({
      data: { slug: otherTenantSlug, name: 'AC1 Yabancı Kiracı', status: TenantStatus.active },
    })
    otherTenantId = otherTenant.id

    const owner = await createAuthenticatedSession(app.getHttpServer())
    const readonlyMember = await createAuthenticatedSession(app.getHttpServer())
    const actor = await createAuthenticatedSession(app.getHttpServer())
    const target = await createAuthenticatedSession(app.getHttpServer())

    ownerCookie = owner.cookieHeader
    readonlyCookie = readonlyMember.cookieHeader
    actorCookie = actor.cookieHeader
    actorUserId = actor.userId
    targetUserId = target.userId

    await prismaService.withTenant(tenantId, async (tx) => {
      await tx.tenantMembership.create({
        data: { tenantId, userId: owner.userId, role: TenantRole.owner },
      })
      await tx.tenantMembership.create({
        data: { tenantId, userId: readonlyMember.userId, role: TenantRole.readonly },
      })
      // Matris aslı: rolü her vaka ÖNCESİNDE doğrudan veri katmanında
      // değiştirilir (API üzerinden değil — ölçülen şey API'nin YETKİ kapısı,
      // kurulumun kendisi değil).
      await tx.tenantMembership.create({
        data: { tenantId, userId: actor.userId, role: TenantRole.readonly },
      })
      await tx.tenantMembership.create({
        data: { tenantId, userId: target.userId, role: TenantRole.staff },
      })
    })
  }, 90_000)

  afterAll(async () => {
    if (app !== undefined) {
      // `tenant_membership`/`audit_log`/`tenant_invitation` üçü de kiracıya
      // `onDelete: Cascade` ile bağlı — kiracıyı silmek satırları temizler.
      await prismaService.db.tenant.delete({ where: { id: tenantId } })
      await prismaService.db.tenant.delete({ where: { id: otherTenantId } })
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  /** Üç yazma ucunun GEÇERLİ girdileri — yetki kapısı girdiden ÖNCE koşar, ama jenerik gövdeye düşmemek için girdiler geçerli tutulur. */
  function writeInputFor(path: WriteProcedurePath): Record<string, string> {
    switch (path) {
      case 'member.invite':
        return { email: uniqueEmail('ac1'), role: 'staff' }
      case 'member.updateRole':
        return { userId: targetUserId, role: 'admin' }
      case 'member.remove':
        return { userId: targetUserId }
    }
  }

  async function callWriteProcedure(options: {
    readonly path: WriteProcedurePath
    readonly cookieHeader: string
    readonly slug: string
    readonly requestId: string
  }): Promise<{ readonly status: number; readonly body: unknown }> {
    const response = await request(httpServer())
      .post(`/trpc/${options.path}`)
      .set('Cookie', options.cookieHeader)
      .set('x-arkesoft-tenant', options.slug)
      .set('x-request-id', options.requestId)
      .set('Origin', TRUSTED_ORIGIN)
      .send(writeInputFor(options.path))

    return { status: response.status, body: response.body }
  }

  /** Matris vakası öncesi aslın rolünü ve hedef üyeliğin varlığını yeniden kurar. */
  async function resetMatrixFixture(actorRole: TenantRoleWire): Promise<void> {
    await prismaService.withTenant(tenantId, async (tx) => {
      await tx.tenantMembership.update({
        where: { tenantId_userId: { tenantId, userId: actorUserId } },
        data: { role: actorRole },
      })
      await tx.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId, userId: targetUserId } },
        create: { tenantId, userId: targetUserId, role: TenantRole.staff },
        update: { role: TenantRole.staff },
      })
    })
  }

  it(
    'ROADMAP kriteri (a): `readonly` rolü ÜÇ yazma ucunun ÜÇÜNDE DE 403 PERMISSION_DENIED alır — ' +
      'AppErrorBody TENANT_MEMBERSHIP_REQUIRED ile BİREBİR aynı şekli taşır (details BOŞ)',
    async () => {
      // Kataloğun ROADMAP'in adıyla saydığı rol hakkında ne dediğini PİNLE —
      // 403 beklentisi kataloğa göre "türetilmiş" değil, kabul kriterinin
      // LİTERAL ifadesidir; ikisinin aynı şeyi söylediği burada ölçülür.
      expect(ROLE_PERMISSIONS.readonly).not.toContain(MEMBER_WRITE_PERMISSION)

      // Karşılaştırma tabanı: AYNI asıl, ÜYE OLMADIĞI kiracıda AYNI ucu
      // çağırır → `AuthGuard` 403 TENANT_MEMBERSHIP_REQUIRED üretir.
      const crossRequestId = uniqueRequestId('ac1-cross')
      const cross = await callWriteProcedure({
        path: 'member.remove',
        cookieHeader: readonlyCookie,
        slug: otherTenantSlug,
        requestId: crossRequestId,
      })

      expect(cross.status).toBe(403)
      const crossBody = appErrorBodySchema.parse(cross.body)
      expect(crossBody).toEqual({
        code: 'TENANT_MEMBERSHIP_REQUIRED',
        message: 'errors.auth.tenantMembershipRequired',
        details: {},
        requestId: crossRequestId,
      })

      for (const path of WRITE_PROCEDURE_PATHS) {
        const requestId = uniqueRequestId('ac1-ro')
        const response = await callWriteProcedure({
          path,
          cookieHeader: readonlyCookie,
          slug: tenantSlug,
          requestId,
        })

        expect(response.status, `${path} → readonly 403 beklenir`).toBe(403)

        const envelope = z
          .object({ error: z.object({ data: trpcErrorDataSchema }) })
          .parse(response.body)

        expect(envelope.error.data.code).toBe('FORBIDDEN')
        expect(envelope.error.data.httpStatus).toBe(403)
        expect(envelope.error.data.appError).toEqual({
          code: 'PERMISSION_DENIED',
          message: 'errors.authz.permissionDenied',
          details: {},
          requestId,
        })

        // ⚠ İZİN ADI ve ROL TELE SIZMAZ (`publicDetails` override EDİLMEDİ):
        // gövdenin TAMAMI taranır, yalnızca `details` değil.
        const rawBody = JSON.stringify(response.body)
        expect(rawBody).not.toContain(MEMBER_WRITE_PERMISSION)
        expect(rawBody).not.toContain('readonly')

        // Dört alanın ADI ve `details`in BOŞLUĞU iki yolda da AYNI — kabul
        // kriterinin "birebir" ifadesinin ölçülebilir karşılığı.
        expect(Object.keys(envelope.error.data.appError).sort()).toEqual(
          Object.keys(crossBody).sort(),
        )
        expect(envelope.error.data.appError.details).toEqual(crossBody.details)
      }
    },
    60_000,
  )

  it(
    'ROADMAP kriteri (b): `owner` rolü ÜÇ yazma ucunun ÜÇÜNDE DE 2xx alır — ' +
      'çıktıların üçü de kendi tel şemasını geçer',
    async () => {
      expect(ROLE_PERMISSIONS.owner).toContain(MEMBER_WRITE_PERMISSION)

      await resetMatrixFixture('readonly')

      const inviteResponse = await callWriteProcedure({
        path: 'member.invite',
        cookieHeader: ownerCookie,
        slug: tenantSlug,
        requestId: uniqueRequestId('ac1-own-inv'),
      })
      expect(inviteResponse.status).toBe(200)
      const invite = z
        .object({ result: z.object({ data: memberInvitationSchema }) })
        .parse(inviteResponse.body)
      expect(invite.result.data.invitationId.length).toBeGreaterThan(0)

      const updateResponse = await callWriteProcedure({
        path: 'member.updateRole',
        cookieHeader: ownerCookie,
        slug: tenantSlug,
        requestId: uniqueRequestId('ac1-own-upd'),
      })
      expect(updateResponse.status).toBe(200)
      const updated = z
        .object({ result: z.object({ data: memberRoleSchema }) })
        .parse(updateResponse.body)
      expect(updated.result.data).toEqual({ userId: targetUserId, role: 'admin' })

      const removeResponse = await callWriteProcedure({
        path: 'member.remove',
        cookieHeader: ownerCookie,
        slug: tenantSlug,
        requestId: uniqueRequestId('ac1-own-rm'),
      })
      expect(removeResponse.status).toBe(200)
      const removed = z
        .object({ result: z.object({ data: memberRemovedSchema }) })
        .parse(removeResponse.body)
      expect(removed.result.data).toEqual({ userId: targetUserId })

      // Yazmaların GERÇEKTEN olduğunun veri katmanı kanıtı — 2xx tek başına
      // "hiçbir şey yapmadı ama 200 döndü" durumunu dışlamaz.
      const state = await prismaService.withTenant(tenantId, async (tx) => ({
        target: await tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId, userId: targetUserId } },
          select: { id: true },
        }),
        pendingInvitations: await tx.tenantInvitation.count(),
      }))
      expect(state.target).toBeNull()
      expect(state.pendingInvitations).toBeGreaterThan(0)
    },
    60_000,
  )

  it('matris (mekanik): kalan ÜÇ rol × ÜÇ uç — beklenti ROLE_PERMISSIONS kataloğundan OKUNUR, kopyalanmaz', async () => {
    // ⚠ NEDEN BU AYAK VAR ve neden (a)/(b)'nin YERİNE GEÇMEZ: (a) ve (b)
    // kabul kriterinin LİTERAL ifadesini ölçer (kataloğa bakmadan: readonly
    // 403, owner 2xx). Bu ayak ise HTTP davranışının kataloğun TAMAMIYLA
    // tutarlı olduğunu ölçer — ikisi birden olmazsa ya beklenti kopyalanmış
    // olur (katalog sapınca test sessizce yanlışlanır) ya da kapsam üç role
    // kör kalır.
    const remainingRoles = tenantRoleSchema.options.filter(
      (role) => role !== 'owner' && role !== 'readonly',
    )
    expect(remainingRoles).toEqual(['admin', 'staff', 'support'])

    for (const role of remainingRoles) {
      const expectsSuccess = ROLE_PERMISSIONS[role].includes(MEMBER_WRITE_PERMISSION)

      for (const path of WRITE_PROCEDURE_PATHS) {
        await resetMatrixFixture(role)

        const response = await callWriteProcedure({
          path,
          cookieHeader: actorCookie,
          slug: tenantSlug,
          requestId: uniqueRequestId('ac1-mx'),
        })

        if (expectsSuccess) {
          expect(response.status, `${role} → ${path} 2xx beklenir`).toBe(200)
        } else {
          expect(response.status, `${role} → ${path} 403 beklenir`).toBe(403)
          const envelope = z
            .object({ error: z.object({ data: trpcErrorDataSchema }) })
            .parse(response.body)
          expect(envelope.error.data.appError.code).toBe('PERMISSION_DENIED')
        }
      }
    }
  }, 90_000)

  it('kiracı bağlamı çözülemeyen istek yazma ucuna HİÇ ULAŞMAZ — 404 TENANT_NOT_FOUND (ADR-0011 madde 4)', async () => {
    const requestId = uniqueRequestId('ac1-notenant')

    const response = await request(httpServer())
      .post('/trpc/member.invite')
      .set('Cookie', ownerCookie)
      .set('x-request-id', requestId)
      .set('Origin', TRUSTED_ORIGIN)
      .send({ email: uniqueEmail('ac1-notenant'), role: 'staff' })

    expect(response.status).toBe(404)
    expect(appErrorBodySchema.parse(response.body)).toEqual({
      code: 'TENANT_NOT_FOUND',
      message: 'errors.tenant.notFound',
      details: {},
      requestId,
    })
  })
})

// ---------------------------------------------------------------------------
// `perf` İKAMESİ — ÖLÇÜM 1 (architect K-A15, `qa`'nın DoD'una BAĞLAYICI)
// ---------------------------------------------------------------------------
//
// `perf` gate'i bu sürümde KOŞMUYOR; ikamesinin birinci maddesi şu: "izinli
// çağrı üyelik satırını TAM BİR KEZ okuyor (muhafızla toplam İKİ), ÜÇÜNCÜ
// okuma YOK". Sözleşme katmanı bunun YARISINI kendi süitinde ölçtü (port TAM
// 1 kez çağrılıyor); kalan yarısı — guard + adaptör TOPLAMININ iki olması —
// yalnızca BURADA, gerçek Nest zinciriyle ölçülebilir.
//
// ⚠ ÖLÇÜM ARACI ÖLÇÜLEREK SEÇİLDİ, VARSAYILMADI: veri katmanının üyelik
// delegesinin `findUnique` üyesi `{writable:true, enumerable:true,
// configurable:true}` bir KENDİ özelliğidir (çalışma anında okundu) → `vi.spyOn`
// onu sarabilir. Her kiracı kapsamlı transaction'ın `tx`'i AYRI bir nesne
// olduğu için sarma `withTenant` sarmalayıcısının içinde, transaction BAŞINA
// yapılır.
//
// ⚠ ÖLÇÜM NEDEN `member.invite` ÜZERİNDE: davet ucu, davet edilen adrese ait
// bir hesap YOKKEN üyelik tablosunu HİÇ OKUMAZ ("zaten üye mi" kontrolü
// kullanıcı kimliği bilinmediği için erken döner). Böylece isteğin TOPLAM
// üyelik okuması tam olarak YETKİ yolundan gelenlerdir — ölçüm iş okumalarıyla
// karışmaz. Diğer iki uç hedef üyeliği zaten okumak ZORUNDADIR (iş kuralı),
// o okuma bir "üçüncü yetki okuması" DEĞİLDİR.
describe('perf ikamesi ölçüm 1 — izinli istek üyelik satırını TAM İKİ KEZ okur (guard + izin kapısı)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let tenantId: string
  let tenantSlug: string
  let ownerCookie: string
  let readonlyCookie: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    tenantSlug = `perf1-${randomUUID().slice(0, 12)}`
    const tenant = await prismaService.db.tenant.create({
      data: { slug: tenantSlug, name: 'perf ikamesi ölçüm 1', status: TenantStatus.active },
    })
    tenantId = tenant.id

    const owner = await createAuthenticatedSession(app.getHttpServer())
    const readonlyMember = await createAuthenticatedSession(app.getHttpServer())
    ownerCookie = owner.cookieHeader
    readonlyCookie = readonlyMember.cookieHeader

    await prismaService.withTenant(tenantId, async (tx) => {
      await tx.tenantMembership.create({
        data: { tenantId, userId: owner.userId, role: TenantRole.owner },
      })
      await tx.tenantMembership.create({
        data: { tenantId, userId: readonlyMember.userId, role: TenantRole.readonly },
      })
    })
  }, 90_000)

  afterAll(async () => {
    if (app !== undefined) {
      await prismaService.db.tenant.delete({ where: { id: tenantId } })
      await app.close()
    }
  })

  it(
    'izinli davet: port TAM 1 kez çağrılır, üyelik okuması TAM 2 (biri `{id}` muhafızın, biri `{role}` izin kapısının), ' +
      'ÜÇÜNCÜ okuma YOK — izin REDDİNDE yazma portu HİÇ çağrılmaz',
    async () => {
      if (app === undefined) {
        throw new Error('test uygulaması henüz kurulmadı')
      }

      const membershipAdapter = app.get(MembershipReadPortAdapter)
      const writeAdapter = app.get(MemberWritePortAdapter)

      const requireRoleSpy = vi.spyOn(membershipAdapter, 'requireRole')
      const inviteSpy = vi.spyOn(writeAdapter, 'invite')

      const membershipSelects: unknown[] = []
      // ⚠ Sarmalamadan ÖNCE bağlanır — `vi.spyOn` metodu değiştirdikten sonra
      // alınan bir referans sarmalayıcının KENDİSİ olur ve sonsuz özyineleme
      // üretir.
      const originalWithTenant = prismaService.withTenant.bind(prismaService)
      const withTenantSpy = vi.spyOn(prismaService, 'withTenant')
      withTenantSpy.mockImplementation((requestedTenantId, callback) =>
        originalWithTenant(requestedTenantId, async (tx) => {
          const findUniqueSpy = vi.spyOn(tx.tenantMembership, 'findUnique')
          try {
            return await callback(tx)
          } finally {
            for (const call of findUniqueSpy.mock.calls) {
              membershipSelects.push(call[0])
            }
          }
        }),
      )

      try {
        const permitted = await request(app.getHttpServer())
          .post('/trpc/member.invite')
          .set('Cookie', ownerCookie)
          .set('x-arkesoft-tenant', tenantSlug)
          .set('Origin', TRUSTED_ORIGIN)
          .send({ email: uniqueEmail('perf1-ok'), role: 'staff' })

        expect(permitted.status).toBe(200)
        expect(requireRoleSpy.mock.calls.length).toBe(1)
        expect(inviteSpy.mock.calls.length).toBe(1)
        // ⚠ TAM İKİ okuma ve İKİSİNİN DE KİM OLDUĞU belli: muhafız yalnızca
        // varlığı (`id`), izin kapısı yalnızca rolü (`role`) okur. Sayıyı
        // yazmak yetmez — hangi okumanın hangisi olduğu assert'lenirse
        // "üçüncü okuma yok" iddiası ölçülebilir hâle gelir.
        expect(membershipSelects).toEqual([
          expect.objectContaining({ select: { id: true } }),
          expect.objectContaining({ select: { role: true } }),
        ])

        requireRoleSpy.mockClear()
        inviteSpy.mockClear()
        membershipSelects.length = 0

        const denied = await request(app.getHttpServer())
          .post('/trpc/member.invite')
          .set('Cookie', readonlyCookie)
          .set('x-arkesoft-tenant', tenantSlug)
          .set('Origin', TRUSTED_ORIGIN)
          .send({ email: uniqueEmail('perf1-denied'), role: 'staff' })

        expect(denied.status).toBe(403)
        expect(requireRoleSpy.mock.calls.length).toBe(1)
        // ⚠ İZİN KAPISI `next()`'TEN ÖNCE FIRLATIR: yazma portu HİÇ çağrılmaz
        // (sözleşme katmanının ölçtüğü sıra `apps/api` zincirinde de KORUNUYOR).
        expect(inviteSpy.mock.calls.length).toBe(0)
        expect(membershipSelects).toEqual([
          expect.objectContaining({ select: { id: true } }),
          expect.objectContaining({ select: { role: true } }),
        ])
      } finally {
        withTenantSpy.mockRestore()
        requireRoleSpy.mockRestore()
        inviteSpy.mockRestore()
      }
    },
    60_000,
  )
})
