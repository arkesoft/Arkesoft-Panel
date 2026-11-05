// @arkesoft/api — `member.*` ÇAPRAZ KİRACI OKUMA **VE YAZMA** izolasyonu
// (ROADMAP v0.0.14, T-014/`qa` tur 1 — CLAUDE.md §6 "istisnasız" + §7 md 11)
//
// ⚠⚠ BU DOSYA `qa` GATE'İ TARAFINDAN, ÖLÇÜLMÜŞ BİR BOŞLUĞU KAPATMAK İÇİN
// YAZILDI. Boşluğun kendisi iki bağımsız `rg` ölçümüyle saptandı:
//
//   1. `member.*` — platformun İLK YAZMA namespace'i — HİÇBİR
//      `*.isolation.test.ts` dosyasında geçmiyordu. Oysa platformun yazılı
//      deseni her yeni tRPC namespace'ine izolasyon süitinde bir bölüm
//      açıyor: v0.0.8 `storefront.currentTenant`'ı, v0.0.11 `job.*`'ı
//      `trpc-cross-tenant.isolation.test.ts`'e EKLEDİ. v0.0.14 iki yeni
//      kiracıya bağlı tablo (`audit_log`, `tenant_invitation`) ve DÖRT
//      mutation getirdi; `pnpm test:isolation` bunların HTTP katmanına HİÇ
//      dokunmuyordu.
//   2. Depoda HİÇBİR test AYNI kullanıcıya İKİ kiracıda üyelik vermiyordu →
//      "izin kapısı rolü DOĞRU kiracı için çözüyor" iddiası hiçbir yerde
//      ÖLÇÜLMEMİŞTİ. Bu, yetki modelinin en doğrudan çapraz kiracı
//      sorusudur: A'da `owner` olan bir asıl, B'de `readonly` iken B'nin
//      yazma uçlarına ne alır?
//
// ⚠ NEDEN `createTenantIsolationSuite()` İÇİNE KONULMADI (R-A7'nin yanlış
// uygulanmaması için): o süit `packages/db`'de yaşar, kiracı TABLOLARI
// üzerinde parametriktir ve TEK çağrı noktası kuralı ONA aittir — ikinci bir
// çağrı noktası gerçekten iki dosyayı da kırar. Bu dosya o süiti ÇAĞIRMAZ;
// ölçtüğü şey veri katmanı yüklemi değil, HTTP + yetki + iş kuralı
// zincirinin TAMAMI. `auth-cross-tenant.isolation.test.ts` (v0.0.5) aynı
// gerekçeyle AYRI bir dosya olarak yaşıyor ve bu paket zaten ÜÇ bağımsız
// izolasyon dosyası taşıyor — "tek dosya" kuralı bu pakette YOK.
//
// ⚠ NEDEN `pnpm test` İÇİNDEKİ MEVCUT ASSERT YETMİYOR: `member-authz.test.ts`
// üye OLMAYAN bir aslın yabancı kiracıda 403 aldığını ölçüyor, ama (a) sürüm
// kapısı `pnpm test:isolation`'ı AYRI koşturur ve çapraz erişim kanıtının
// orada olması beklenir, (b) o assert yalnızca DURUM KODUNA bakıyor — yabancı
// kiracıda bir satır OLUŞMADIĞINI ölçmüyor, (c) çift üyelik vakası yok.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { appErrorBodySchema } from '@arkesoft/errors'
import { ROLE_PERMISSIONS, trpcErrorDataSchema } from '@arkesoft/trpc'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

/** `SameOriginGuard`'ın güvenilir orijini — guard ile AYNI tek kaynaktan türetilir. */
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin

/** ROADMAP v0.0.14'ün kabul kriterinde adıyla sayılan üç yazma ucu. */
const WRITE_PROCEDURE_PATHS = ['member.invite', 'member.updateRole', 'member.remove'] as const
type WriteProcedurePath = (typeof WRITE_PROCEDURE_PATHS)[number]

const MEMBER_WRITE_PERMISSION = 'member:write'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

describe('member.* — çapraz kiracı YAZMA izolasyonu (gerçek Postgres + gerçek HTTP)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService

  /** A: aslın `owner` olduğu kiracı. */
  let tenantAId: string
  let tenantASlug: string
  /** B: aslın HİÇ ÜYE OLMADIĞI kiracı. */
  let tenantBId: string
  let tenantBSlug: string
  /** C: aslın `readonly` olduğu kiracı — ÇİFT ÜYELİK vakası. */
  let tenantCId: string
  let tenantCSlug: string

  /** A'da `owner`, C'de `readonly`, B'de üye DEĞİL. */
  let actorCookie: string
  let actorUserId: string
  /** Yalnızca A'nın üyesi — yabancı kiracı bağlamından hedeflenecek kurban. */
  let tenantAMemberUserId: string
  /** Yalnızca C'nin üyesi — C bağlamında hedeflenecek. */
  let tenantCMemberUserId: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    tenantASlug = `mx-a-${randomUUID().slice(0, 10)}`
    tenantBSlug = `mx-b-${randomUUID().slice(0, 10)}`
    tenantCSlug = `mx-c-${randomUUID().slice(0, 10)}`

    const [tenantA, tenantB, tenantC] = await Promise.all([
      prismaService.db.tenant.create({
        data: { slug: tenantASlug, name: 'Çapraz Kiracı A', status: TenantStatus.active },
      }),
      prismaService.db.tenant.create({
        data: { slug: tenantBSlug, name: 'Çapraz Kiracı B', status: TenantStatus.active },
      }),
      prismaService.db.tenant.create({
        data: { slug: tenantCSlug, name: 'Çapraz Kiracı C', status: TenantStatus.active },
      }),
    ])
    tenantAId = tenantA.id
    tenantBId = tenantB.id
    tenantCId = tenantC.id

    const actor = await createAuthenticatedSession(app.getHttpServer())
    const tenantAMember = await createAuthenticatedSession(app.getHttpServer())
    const tenantCMember = await createAuthenticatedSession(app.getHttpServer())
    const tenantBOwner = await createAuthenticatedSession(app.getHttpServer())

    actorCookie = actor.cookieHeader
    actorUserId = actor.userId
    tenantAMemberUserId = tenantAMember.userId
    tenantCMemberUserId = tenantCMember.userId

    await prismaService.withTenant(tenantAId, async (tx) => {
      await tx.tenantMembership.create({
        data: { tenantId: tenantAId, userId: actor.userId, role: TenantRole.owner },
      })
      await tx.tenantMembership.create({
        data: { tenantId: tenantAId, userId: tenantAMember.userId, role: TenantRole.staff },
      })
    })

    // B'nin KENDİ sahibi var ama asıl B'nin üyesi DEĞİL — B'nin boş kalması
    // "yazma olmadı" assert'ini vacuous yapardı (satır sayısı zaten 0 olurdu).
    await prismaService.withTenant(tenantBId, (tx) =>
      tx.tenantMembership.create({
        data: { tenantId: tenantBId, userId: tenantBOwner.userId, role: TenantRole.owner },
      }),
    )

    // ⚠ ÇİFT ÜYELİK: AYNI kullanıcı A'da `owner`, C'de `readonly`.
    await prismaService.withTenant(tenantCId, async (tx) => {
      await tx.tenantMembership.create({
        data: { tenantId: tenantCId, userId: actor.userId, role: TenantRole.readonly },
      })
      await tx.tenantMembership.create({
        data: { tenantId: tenantCId, userId: tenantCMember.userId, role: TenantRole.staff },
      })
    })
  }, 120_000)

  afterAll(async () => {
    if (app !== undefined) {
      // Üç tabloya da `onDelete: Cascade` ile bağlı — kiracıyı silmek
      // `tenant_membership`/`audit_log`/`tenant_invitation` satırlarını alır.
      await prismaService.db.tenant.delete({ where: { id: tenantAId } })
      await prismaService.db.tenant.delete({ where: { id: tenantBId } })
      await prismaService.db.tenant.delete({ where: { id: tenantCId } })
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  /** Verilen kiracının iki yeni tablosundaki satır sayısı — kiracı bağlamı İÇİNDE okunur. */
  async function countTenantScopedRows(
    tenantId: string,
  ): Promise<{ readonly auditLogs: number; readonly invitations: number }> {
    return prismaService.withTenant(tenantId, async (tx) => ({
      auditLogs: await tx.auditLog.count(),
      invitations: await tx.tenantInvitation.count(),
    }))
  }

  function writeInputFor(path: WriteProcedurePath, targetUserId: string): Record<string, string> {
    switch (path) {
      case 'member.invite':
        return { email: uniqueEmail('mx'), role: 'staff' }
      case 'member.updateRole':
        return { userId: targetUserId, role: 'admin' }
      case 'member.remove':
        return { userId: targetUserId }
    }
  }

  async function callWrite(options: {
    readonly path: WriteProcedurePath
    readonly slug: string
    readonly targetUserId: string
    readonly cookieHeader: string
  }): Promise<{ readonly status: number; readonly body: unknown }> {
    const response = await request(httpServer())
      .post(`/trpc/${options.path}`)
      .set('Cookie', options.cookieHeader)
      .set('x-arkesoft-tenant', options.slug)
      .set('x-request-id', `mx-${randomUUID().replaceAll('-', '').slice(0, 16)}`)
      .set('Origin', TRUSTED_ORIGIN)
      .send(writeInputFor(options.path, options.targetUserId))

    return { status: response.status, body: response.body }
  }

  it('(1) ÜYE OLMAYAN asıl, yabancı kiracının ÜÇ yazma ucunda da 403 alır VE o kiracıda HİÇBİR SATIR OLUŞMAZ', async () => {
    const before = await countTenantScopedRows(tenantBId)

    for (const path of WRITE_PROCEDURE_PATHS) {
      const response = await callWrite({
        path,
        slug: tenantBSlug,
        targetUserId: tenantAMemberUserId,
        cookieHeader: actorCookie,
      })

      expect(response.status, `${path} → yabancı kiracıda 403 beklenir`).toBe(403)
      expect(appErrorBodySchema.parse(response.body).code).toBe('TENANT_MEMBERSHIP_REQUIRED')
    }

    // ⚠ ASIL KATKI: durum kodu tek başına "yazma olmadı" DEMEZ. İki yeni
    // kiracıya bağlı tablonun satır sayısı DEĞİŞMEMİŞ olmalı.
    expect(await countTenantScopedRows(tenantBId)).toEqual(before)
  }, 90_000)

  it('(2) ÇİFT ÜYELİK: A’da `owner` olan asıl, C’de `readonly` olduğu için C’nin yazma uçlarında 403 PERMISSION_DENIED alır', async () => {
    // Kataloğun iki rol hakkında ne dediğini PİNLE — 403/200 beklentisi
    // kopyalanmış bir sabit değil, kataloğun kendisiyle tutarlı.
    expect(ROLE_PERMISSIONS.owner).toContain(MEMBER_WRITE_PERMISSION)
    expect(ROLE_PERMISSIONS.readonly).not.toContain(MEMBER_WRITE_PERMISSION)

    const before = await countTenantScopedRows(tenantCId)

    for (const path of WRITE_PROCEDURE_PATHS) {
      const response = await callWrite({
        path,
        slug: tenantCSlug,
        targetUserId: tenantCMemberUserId,
        cookieHeader: actorCookie,
      })

      // ⚠⚠ BU TESTİN VARLIK SEBEBİ: izin kapısı rolü AKTÖRÜN BAŞKA BİR
      // KİRACIDAKİ rolünden DEĞİL, İSTEĞİN kiracısından çözmek zorunda. Rol
      // kiracıdan bağımsız okunsaydı (ya da ilk bulunan üyelik satırından
      // okunsaydı) bu asıl `owner` sayılır ve 200 alırdı.
      expect(response.status, `${path} → C'de readonly ⇒ 403 beklenir`).toBe(403)
      const envelope = z
        .object({ error: z.object({ data: trpcErrorDataSchema }) })
        .parse(response.body)
      expect(envelope.error.data.appError.code).toBe('PERMISSION_DENIED')
    }

    expect(await countTenantScopedRows(tenantCId)).toEqual(before)

    // ⚠ ÇİFT ÜYELİĞİN KENDİSİ DE ÖLÇÜLÜR: aynı kullanıcının rolü iki kiracıda
    // FARKLI ve her biri kendi bağlamında okunuyor. Bu assert olmadan (2)'nin
    // 403'ü "asıl C'nin hiç üyesi değil" diye de açıklanabilirdi.
    const actorRoles = await Promise.all([
      prismaService.withTenant(tenantAId, (tx) =>
        tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId: tenantAId, userId: actorUserId } },
          select: { role: true },
        }),
      ),
      prismaService.withTenant(tenantCId, (tx) =>
        tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId: tenantCId, userId: actorUserId } },
          select: { role: true },
        }),
      ),
    ])
    expect(actorRoles).toEqual([{ role: TenantRole.owner }, { role: TenantRole.readonly }])

    // C'nin üyesinin rolü GERÇEKTEN değişmedi (403 "hiçbir şey yapmadı"
    // anlamına gelmek ZORUNDA).
    const targetMembership = await prismaService.withTenant(tenantCId, (tx) =>
      tx.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: tenantCId, userId: tenantCMemberUserId } },
        select: { role: true },
      }),
    )
    expect(targetMembership).toEqual({ role: TenantRole.staff })
  }, 90_000)

  it('(3) VACUOUS DEĞİL: AYNI oturum, AYNI uçlar, `owner` olduğu kiracıda 200 alır ve satır SAYISI ARTAR', async () => {
    const before = await countTenantScopedRows(tenantAId)

    const response = await callWrite({
      path: 'member.invite',
      slug: tenantASlug,
      targetUserId: tenantAMemberUserId,
      cookieHeader: actorCookie,
    })

    // ⚠ (1) ve (2)'nin 403'leri "bu oturum hiçbir yerde yazamıyor" yüzünden
    // DEĞİL, kiracı başına yetki çözümü yüzünden. Bu assert o ayrımı verir.
    expect(response.status).toBe(200)

    const after = await countTenantScopedRows(tenantAId)
    expect(after.invitations).toBe(before.invitations + 1)
    expect(after.auditLogs).toBe(before.auditLogs + 1)
  }, 90_000)

  it('(4) YABANCI KİRACININ ÜYELİK SATIRI, kendi kiracısında `owner` olan bir asıl tarafından DEĞİŞTİRİLEMEZ', async () => {
    // Asıl A'nın `owner`'ı; hedef YALNIZCA C'nin üyesi. İstek A bağlamında
    // koşuyor → yetki kapısı GEÇİLİR (A'da owner), iş kuralı hedefi A
    // kapsamında arar ve BULAMAZ.
    const updateResponse = await callWrite({
      path: 'member.updateRole',
      slug: tenantASlug,
      targetUserId: tenantCMemberUserId,
      cookieHeader: actorCookie,
    })
    expect(updateResponse.status).toBe(403)
    const updateEnvelope = z
      .object({ error: z.object({ data: trpcErrorDataSchema }) })
      .parse(updateResponse.body)
    expect(updateEnvelope.error.data.appError.code).toBe('TENANT_MEMBERSHIP_REQUIRED')

    const removeResponse = await callWrite({
      path: 'member.remove',
      slug: tenantASlug,
      targetUserId: tenantCMemberUserId,
      cookieHeader: actorCookie,
    })
    expect(removeResponse.status).toBe(403)

    // ⚠ C'deki satır OLDUĞU GİBİ duruyor — "403 döndü ama satır gitti"
    // durumunu dışlar.
    const survivor = await prismaService.withTenant(tenantCId, (tx) =>
      tx.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: tenantCId, userId: tenantCMemberUserId } },
        select: { role: true },
      }),
    )
    expect(survivor).toEqual({ role: TenantRole.staff })
  }, 90_000)

  it('(5) yabancı kiracının davet belirteci A bağlamında KULLANILAMAZ — davet satırı C’de DURUR', async () => {
    // C'nin kendi sahibini kur (asıl C'de readonly, davet EDEMEZ).
    const tenantCOwner = await createAuthenticatedSession(httpServer())
    await prismaService.withTenant(tenantCId, (tx) =>
      tx.tenantMembership.create({
        data: { tenantId: tenantCId, userId: tenantCOwner.userId, role: TenantRole.owner },
      }),
    )

    const invited = await callWrite({
      path: 'member.invite',
      slug: tenantCSlug,
      targetUserId: tenantCMemberUserId,
      cookieHeader: tenantCOwner.cookieHeader,
    })
    expect(invited.status).toBe(200)

    // A bağlamındaki asıl, C'nin bekleyen davetlerini GÖREMEZ (RLS + kiracı
    // kapsamlı istemci). Veri katmanı tanığı: A'da davet sayısı C'dekinden
    // BAĞIMSIZ.
    const inCContext = await countTenantScopedRows(tenantCId)
    expect(inCContext.invitations).toBeGreaterThan(0)

    const aContextInvitationEmails = await prismaService.withTenant(tenantAId, (tx) =>
      tx.tenantInvitation.findMany({ select: { tenantId: true } }),
    )
    // ⚠ A bağlamında C'ye ait HİÇBİR davet satırı görünmüyor.
    expect(aContextInvitationEmails.every((row) => row.tenantId === tenantAId)).toBe(true)
  }, 120_000)
})
