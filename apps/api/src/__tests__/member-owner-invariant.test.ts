// @arkesoft/api — AC7: INV-OWNER ("her kiracının TAM OLARAK BİR `owner`'ı
// var") ve sahiplik devrinin karşılaştır-ve-değiştir (CAS) zorlaması
// (ROADMAP v0.0.14, T-014/S5, architect K-A11/K-A12)
//
// ⚠⚠ BU DOSYANIN KAPSAMI HAKKINDA ŞEFFAFLIK NOTU (architect R-A2, BAĞLAYICI):
// burada ölçülen şey INV-OWNER'ın **UYGULAMA KODUNDA ve bir GREP KAPISINDA**
// karşılanmasıdır — **VERİTABANI GARANTİSİ DEĞİLDİR**. Kiracıyı sahipsiz
// bırakabilecek üçüncü yol (`app_user` satırının sert silinmesi) üretim
// kodunda YOKTUR ve bu olgu `production-write-path-grep.qa.test.ts`'in grep
// kapısıyla mekanik olarak pinlenir; veritabanı seviyesindeki güçlü biçim
// (yabancı anahtar aksiyonunun değiştirilmesi) hesap silme yüzeyi açıldığında
// gelecek ve o sürüm migration linter'ının ilgili kuralını iki yönlü testle
// rafine etmek zorunda. Bu süit "borç kapandı" DEMEZ.
//
// ⚠ AYRI BİR DEVİR PROSEDÜRÜ YOKTUR: devir, `member.updateRole`'ün
// `role: 'owner'` ile MEVCUT sahip tarafından çağrılmasıdır. Bu yüzden
// aşağıdaki vakaların hepsi AYNI ucu kullanır.
//
// ⚠ HER VAKA KENDİ KİRACISINI KURAR: roller ve denetim izi vaka başına temiz
// başlar. Asıllar (kullanıcı hesapları) bir kez kurulur — kayıt yolu oran
// sınırlıdır ve her vakada yeni hesap açmak testi ortam durumuna bağımlı
// kılardı.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { memberRoleSchema, trpcErrorDataSchema } from '@arkesoft/trpc'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import type { OwnerMembershipProtectionReason } from '../errors/domain/owner-membership-protected.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin

const trpcErrorEnvelopeSchema = z.object({ error: z.object({ data: trpcErrorDataSchema }) })
const trpcSuccessEnvelopeSchema = z.object({ result: z.object({ data: memberRoleSchema }) })

/**
 * Korunan üç reddin kapalı sözlüğü — hata sınıfından TİP olarak alınır,
 * burada elle yazılmaz. Üç reddin HEPSİ bu dosyada bir vakaya karşılık gelir;
 * sözlüğe dördüncü bir değer eklenirse bu eşleme tablosu derlenmez.
 */
const PROTECTION_REASON_CASES = {
  remove_owner: 'member.remove ile sahibin çıkarılması',
  demote_owner: 'member.updateRole ile sahibin başka role indirilmesi',
  transfer_without_ownership: 'sahip olmayan bir aslın devir denemesi (veya yarışın kaybı)',
} as const satisfies Record<OwnerMembershipProtectionReason, string>

describe('AC7 — INV-OWNER ve sahiplik devri (gerçek Postgres + gerçek HTTP)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let tenantId: string
  let tenantSlug: string
  let ownerCookie: string
  let ownerUserId: string
  let adminCookie: string
  let adminUserId: string
  let targetAUserId: string
  let targetBUserId: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    const owner = await createAuthenticatedSession(app.getHttpServer())
    const admin = await createAuthenticatedSession(app.getHttpServer())
    const targetA = await createAuthenticatedSession(app.getHttpServer())
    const targetB = await createAuthenticatedSession(app.getHttpServer())

    ownerCookie = owner.cookieHeader
    ownerUserId = owner.userId
    adminCookie = admin.cookieHeader
    adminUserId = admin.userId
    targetAUserId = targetA.userId
    targetBUserId = targetB.userId
  }, 90_000)

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  beforeEach(async () => {
    tenantSlug = `ac7-${randomUUID().slice(0, 12)}`
    const tenant = await prismaService.db.tenant.create({
      data: { slug: tenantSlug, name: 'AC7 INV-OWNER Kiracısı', status: TenantStatus.active },
    })
    tenantId = tenant.id

    await prismaService.withTenant(tenantId, async (tx) => {
      await tx.tenantMembership.create({
        data: { tenantId, userId: ownerUserId, role: TenantRole.owner },
      })
      await tx.tenantMembership.create({
        data: { tenantId, userId: adminUserId, role: TenantRole.admin },
      })
      await tx.tenantMembership.create({
        data: { tenantId, userId: targetAUserId, role: TenantRole.staff },
      })
      await tx.tenantMembership.create({
        data: { tenantId, userId: targetBUserId, role: TenantRole.staff },
      })
    })
  })

  afterEach(async () => {
    await prismaService.db.tenant.delete({ where: { id: tenantId } })
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  function callMemberWrite(options: {
    readonly path: 'member.updateRole' | 'member.remove'
    readonly cookieHeader: string
    readonly body: Record<string, string>
  }): Promise<{ readonly status: number; readonly body: unknown }> {
    return request(httpServer())
      .post(`/trpc/${options.path}`)
      .set('Cookie', options.cookieHeader)
      .set('x-arkesoft-tenant', tenantSlug)
      .set('Origin', TRUSTED_ORIGIN)
      .send(options.body)
      .then((response) => ({ status: response.status, body: response.body as unknown }))
  }

  async function readState(): Promise<{
    readonly roles: ReadonlyMap<string, string>
    readonly ownerCount: number
    readonly roleChanges: readonly { readonly subject: string; readonly diff: unknown }[]
  }> {
    return prismaService.withTenant(tenantId, async (tx) => {
      const memberships = await tx.tenantMembership.findMany({
        select: { userId: true, role: true },
      })
      const roleChanges = await tx.auditLog.findMany({
        where: { action: 'member_role_changed' },
        select: { subject: true, diff: true },
        orderBy: { createdAt: 'asc' },
      })

      return {
        roles: new Map(memberships.map((row) => [row.userId, row.role])),
        ownerCount: memberships.filter((row) => row.role === TenantRole.owner).length,
        roleChanges,
      }
    })
  }

  function expectProtectedConflict(response: {
    readonly status: number
    readonly body: unknown
  }): void {
    expect(response.status).toBe(409)
    const envelope = trpcErrorEnvelopeSchema.parse(response.body)
    expect(envelope.error.data.code).toBe('CONFLICT')
    expect(envelope.error.data.appError.code).toBe('OWNER_MEMBERSHIP_PROTECTED')
    // ⚠ Reddin SEBEBİ tele SIZMAZ: `details` boş kalır (üç reddin üçü de
    // istemciye AYNI gövdeyi verir, ayrım yalnızca `AppError.context`'tedir).
    expect(envelope.error.data.appError.details).toEqual({})
    const rawBody = JSON.stringify(response.body)
    for (const reason of Object.keys(PROTECTION_REASON_CASES)) {
      expect(rawBody).not.toContain(reason)
    }
  }

  it(`${PROTECTION_REASON_CASES.remove_owner} → 409, denetim kaydı YAZILMAZ, roller DEĞİŞMEZ`, async () => {
    const response = await callMemberWrite({
      path: 'member.remove',
      cookieHeader: ownerCookie,
      body: { userId: ownerUserId },
    })

    expectProtectedConflict(response)

    const state = await readState()
    expect(state.roles.get(ownerUserId)).toBe('owner')
    expect(state.ownerCount).toBe(1)
    const removals = await prismaService.withTenant(tenantId, (tx) =>
      tx.auditLog.count({ where: { action: 'member_removed' } }),
    )
    expect(removals).toBe(0)
  })

  it(`${PROTECTION_REASON_CASES.demote_owner} → 409, roller DEĞİŞMEZ`, async () => {
    const response = await callMemberWrite({
      path: 'member.updateRole',
      cookieHeader: ownerCookie,
      body: { userId: ownerUserId, role: 'admin' },
    })

    expectProtectedConflict(response)

    const state = await readState()
    expect(state.roles.get(ownerUserId)).toBe('owner')
    expect(state.ownerCount).toBe(1)
    expect(state.roleChanges).toEqual([])
  })

  it(
    "devir: `member.updateRole` (role: owner) TEK transaction'da CAS ile yürür — eski sahip `admin`'e iner, " +
      'kiracıda TAM BİR owner kalır, denetim izine İKİ satır yazılır',
    async () => {
      const response = await callMemberWrite({
        path: 'member.updateRole',
        cookieHeader: ownerCookie,
        body: { userId: targetAUserId, role: 'owner' },
      })

      expect(response.status).toBe(200)
      expect(trpcSuccessEnvelopeSchema.parse(response.body).result.data).toEqual({
        userId: targetAUserId,
        role: 'owner',
      })

      const state = await readState()
      // ⚠ INV-OWNER: "en az bir" DEĞİL, "TAM BİR".
      expect(state.ownerCount).toBe(1)
      expect(state.roles.get(targetAUserId)).toBe('owner')
      expect(state.roles.get(ownerUserId)).toBe('admin')

      // ⚠ DEVRİN "İKİ ADIMI" = TEK transaction'da İKİ denetim satırı. Devir
      // öncesinde sıfır satır vardı (kiracı bu vaka için yeni kuruldu) →
      // tam olarak ikisi bu devirden geliyor.
      expect(state.roleChanges).toEqual([
        { subject: ownerUserId, diff: { from: 'owner', to: 'admin' } },
        { subject: targetAUserId, diff: { from: 'staff', to: 'owner' } },
      ])
    },
  )

  it(`${PROTECTION_REASON_CASES.transfer_without_ownership} → 409; ATOMİKLİK: hiçbir satır ve hiçbir denetim kaydı değişmez`, async () => {
    // `admin` rolü `member:write` iznine SAHİPTİR (yetki kapısını geçer) — ama
    // devri yalnızca MEVCUT sahip yapabilir. Bu vaka yetki reddi DEĞİL, korunan
    // bir değişmezin reddidir ve ikisinin AYIRT EDİLMESİ önemlidir.
    const response = await callMemberWrite({
      path: 'member.updateRole',
      cookieHeader: adminCookie,
      body: { userId: targetAUserId, role: 'owner' },
    })

    expectProtectedConflict(response)

    const state = await readState()
    expect(state.ownerCount).toBe(1)
    expect(state.roles.get(ownerUserId)).toBe('owner')
    expect(state.roles.get(targetAUserId)).toBe('staff')
    // ⚠ CAS'in İLK adımı (aslın owner satırını indirme denemesi) SIFIR satır
    // etkiledi ve transaction GERİ ALINDI → hedefin yükseltilmesi de, denetim
    // satırı da OLUŞMADI.
    expect(state.roleChanges).toEqual([])
  })

  it('devirden SONRA eski sahip (artık `admin`) tekrar devir denerse 409 alır — CAS yüklemi rolü WHERE İÇİNDE taşıyor', async () => {
    const first = await callMemberWrite({
      path: 'member.updateRole',
      cookieHeader: ownerCookie,
      body: { userId: targetAUserId, role: 'owner' },
    })
    expect(first.status).toBe(200)

    const second = await callMemberWrite({
      path: 'member.updateRole',
      cookieHeader: ownerCookie,
      body: { userId: targetBUserId, role: 'owner' },
    })
    expectProtectedConflict(second)

    const state = await readState()
    expect(state.ownerCount).toBe(1)
    expect(state.roles.get(targetAUserId)).toBe('owner')
    expect(state.roles.get(targetBUserId)).toBe('staff')
    // İlk devrin iki satırı DURUYOR, ikinci deneme HİÇBİR satır EKLEMEDİ.
    expect(state.roleChanges.length).toBe(2)
  })

  it('EŞZAMANLI İKİ DEVİR: tam biri 2xx, tam biri 409 — yarışın kaybeden tarafı satır kilidiyle SERİLEŞİR, write-skew YOK', async () => {
    const [first, second] = await Promise.all([
      callMemberWrite({
        path: 'member.updateRole',
        cookieHeader: ownerCookie,
        body: { userId: targetAUserId, role: 'owner' },
      }),
      callMemberWrite({
        path: 'member.updateRole',
        cookieHeader: ownerCookie,
        body: { userId: targetBUserId, role: 'owner' },
      }),
    ])

    const statuses = [first.status, second.status].sort((a, b) => a - b)
    expect(statuses).toEqual([200, 409])

    const loser = first.status === 409 ? first : second
    expectProtectedConflict(loser)

    const state = await readState()
    // ⚠ ASIL ÖLÇÜM: iki eşzamanlı devir sonunda kiracıda İKİ owner YOK.
    // Reddedilen "en az bir" tasarımı (oku-sonra-yaz) tam burada iki owner
    // üretiyordu (ham SQL ile ayrı ölçüldü, S4 kaydı).
    expect(state.ownerCount).toBe(1)
    expect(state.roles.get(ownerUserId)).toBe('admin')
    // Kazanan taraf İKİ denetim satırı yazdı; kaybeden HİÇ yazmadı.
    expect(state.roleChanges.length).toBe(2)
  }, 60_000)

  it('her vakadan sonra kiracıda TAM BİR owner olduğu değişmezi — süitin kendi kurulumu da bu değişmeze uyuyor', async () => {
    const state = await readState()
    expect(state.ownerCount).toBe(1)
    expect(state.roles.size).toBe(4)
  })
})
