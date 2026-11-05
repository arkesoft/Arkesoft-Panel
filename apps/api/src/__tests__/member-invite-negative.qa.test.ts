// @arkesoft/api — DAVET AKIŞININ KAPSANMAYAN NEGATİF SENARYOLARI
// (ROADMAP v0.0.14, T-014/`qa` tur 1 — A-A4 sınır değerleri, K-A9'un bağlayıcı
// sıra listesi)
//
// ⚠⚠ BU DOSYA `qa`'NIN "EKSİK SENARYO TARAMASI" ADIMINDA BULUNAN BOŞLUKLARI
// KAPATIR. Tarama `rg` ile yapıldı, varsayılmadı:
//
//   · `PENDING_INVITATION_LIMIT_REACHED` jetonu HİÇBİR test dosyasında
//     geçmiyordu → bekleyen davet ÜST SINIRI hiçbir testte ÇALIŞTIRILMAMIŞTI.
//     ⚠ Bu, sürümün tek kötüye kullanım denetimidir: oran sınırı mekanizması
//     HİÇBİR tRPC prosedürünü kapsamıyor (v0.1.0'a vadeli, `security`'nin
//     T-013 kaydı) ve `architect` R-PM9'un cevabını açıkça "kötüye kullanım
//     İŞ KURALIYLA sınırlandı (üst sınır + cooldown + TTL)" diye yazdı. Yani
//     üst sınır bir konfor özelliği değil, YERİNE GEÇEN denetim.
//   · `ALREADY_MEMBER` jetonu HİÇBİR test dosyasında geçmiyordu → K-A9'un
//     bağlayıcı sıra listesinin BİRİNCİ maddesi ölçülmemişti.
//
// ⚠ A-A4 ("TTL 7 gün, üst sınır 50, cooldown 60 sn — üçü de dışa açık sabit")
// doğrulaması `security` + `qa`'ya verilmişti. `security` tur 1 üst sınırı
// yalnızca ARİTMETİK olarak değerlendirdi (kendi DOĞRULANAMADI listesinde
// yazılı: "L4'ün 3000/saat hesabı aritmetik"). Çalıştırılan ölçüm BURADA.
//
// ⚠ ÜST SINIR TESTİ 50 HTTP İSTEĞİ ATMAZ: bekleyen davetler doğrudan veri
// katmanında, kiracı bağlamı İÇİNDE tohumlanır ve ardından TEK bir gerçek
// istek atılır. Gerekçe ölçülmüş — kayıt/oturum yolu oran sınırlı (10/saat) ve
// 50 gerçek davet akışı bu dosyayı hem yavaş hem FLAKY yapardı (`solid` L-6
// aynı sınıf riski kaydetti). Tohumlama sınırı DEĞİŞTİRMEZ; sınırın okuduğu
// şey satır SAYISIDIR.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { trpcErrorDataSchema } from '@arkesoft/trpc'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PENDING_INVITATION_LIMIT } from '../member/member.constants.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin

const trpcErrorEnvelopeSchema = z.object({ error: z.object({ data: trpcErrorDataSchema }) })

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

describe('davet akışı — kapsanmayan negatif senaryolar (gerçek Postgres + gerçek HTTP)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let tenantId: string
  let tenantSlug: string
  let ownerCookie: string
  let existingMemberEmail: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    tenantSlug = `neg-${randomUUID().slice(0, 12)}`
    const tenant = await prismaService.db.tenant.create({
      data: { slug: tenantSlug, name: 'Negatif Senaryo Kiracısı', status: TenantStatus.active },
    })
    tenantId = tenant.id

    const owner = await createAuthenticatedSession(app.getHttpServer())
    const existingMember = await createAuthenticatedSession(app.getHttpServer())
    ownerCookie = owner.cookieHeader

    // Zaten üye olan aslın ADRESİ gerekiyor — fixture kendi adresini
    // döndürmüyor, bu yüzden platform seviyesi okumayla alınır (kullanıcı
    // tablosu `tenant_id` TAŞIMAZ).
    const memberRow = await prismaService.db.user.findUniqueOrThrow({
      where: { id: existingMember.userId },
      select: { email: true },
    })
    existingMemberEmail = memberRow.email

    await prismaService.withTenant(tenantId, async (tx) => {
      await tx.tenantMembership.create({
        data: { tenantId, userId: owner.userId, role: TenantRole.owner },
      })
      await tx.tenantMembership.create({
        data: { tenantId, userId: existingMember.userId, role: TenantRole.staff },
      })
    })
  }, 120_000)

  afterAll(async () => {
    if (app !== undefined) {
      await prismaService.db.tenant.delete({ where: { id: tenantId } })
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  async function invite(email: string, role = 'staff'): Promise<{ status: number; body: unknown }> {
    const response = await request(httpServer())
      .post('/trpc/member.invite')
      .set('Cookie', ownerCookie)
      .set('x-arkesoft-tenant', tenantSlug)
      .set('Origin', TRUSTED_ORIGIN)
      .send({ email, role })

    return { status: response.status, body: response.body }
  }

  it('ZATEN ÜYE olan bir adrese davet → 409 ALREADY_MEMBER, davet satırı AÇILMAZ (K-A9 sıra md 1)', async () => {
    const before = await prismaService.withTenant(tenantId, (tx) => tx.tenantInvitation.count())

    const response = await invite(existingMemberEmail)

    expect(response.status).toBe(409)
    const envelope = trpcErrorEnvelopeSchema.parse(response.body)
    expect(envelope.error.data.appError.code).toBe('ALREADY_MEMBER')
    // Gövde sızdırmıyor: e-posta hiçbir yerde yok.
    expect(JSON.stringify(response.body)).not.toContain(existingMemberEmail)

    // ⚠ "409 döndü ama satır açıldı" durumunu dışlar.
    expect(await prismaService.withTenant(tenantId, (tx) => tx.tenantInvitation.count())).toBe(
      before,
    )
  }, 60_000)

  it('BÜYÜK/KÜÇÜK HARF farkı ALREADY_MEMBER kontrolünü ATLATAMAZ (kullanıcı okuması kıyas duyarsız)', async () => {
    const response = await invite(existingMemberEmail.toUpperCase())

    expect(response.status).toBe(409)
    expect(trpcErrorEnvelopeSchema.parse(response.body).error.data.appError.code).toBe(
      'ALREADY_MEMBER',
    )
  }, 60_000)

  it('`owner` rolüyle davet YAPISAL olarak reddedilir — tel şeması `owner`ı taşımıyor (yetki yükselmesi)', async () => {
    const before = await prismaService.withTenant(tenantId, (tx) => tx.tenantInvitation.count())

    const response = await invite(uniqueEmail('neg-owner'), 'owner')

    // Zod girdi hatası: K-A10'un yazılı olarak bu sürümde ÇÖZÜLMEYEN jenerik
    // dalı. Ölçülen şey davranış: istek 2xx ALMIYOR ve satır AÇILMIYOR.
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await prismaService.withTenant(tenantId, (tx) => tx.tenantInvitation.count())).toBe(
      before,
    )
  }, 60_000)

  it(
    `BEKLEYEN DAVET ÜST SINIRI (${String(PENDING_INVITATION_LIMIT)}) GERÇEKTEN ZORLANIYOR — ` +
      'sınırda 409 PENDING_INVITATION_LIMIT_REACHED, satır sayısı ARTMIYOR',
    async () => {
      // ⚠ Sabit İMPORT EDİLİR, kopyalanmaz: üst sınır değiştiğinde test
      // kendiliğinden yeni sınırı ölçer.
      const seeded = Array.from({ length: PENDING_INVITATION_LIMIT }, (_, index) => ({
        tenantId,
        email: `neg-seed-${String(index)}-${randomUUID().slice(0, 8)}@arkesoft.test`,
        role: TenantRole.staff,
        // Her satır AYRI hash — `(tenant_id, token_hash)` UNIQUE.
        tokenHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
        invitedByUserId: 'neg-seed-actor',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }))

      await prismaService.withTenant(tenantId, (tx) =>
        tx.tenantInvitation.createMany({ data: seeded }),
      )

      const atLimit = await prismaService.withTenant(tenantId, (tx) => tx.tenantInvitation.count())
      // ⚠ VACUOUS OLMAMA KANITI 1: tohumlama GERÇEKTEN sınıra ulaştı.
      expect(atLimit).toBeGreaterThanOrEqual(PENDING_INVITATION_LIMIT)

      const blocked = await invite(uniqueEmail('neg-over'))

      expect(blocked.status).toBe(409)
      const envelope = trpcErrorEnvelopeSchema.parse(blocked.body)
      expect(envelope.error.data.appError.code).toBe('PENDING_INVITATION_LIMIT_REACHED')
      // Sayılar `AppError.context`'e girer, TELE girmez.
      expect(envelope.error.data.appError.details).toEqual({})

      // Reddedilen davet satır AÇMADI.
      expect(await prismaService.withTenant(tenantId, (tx) => tx.tenantInvitation.count())).toBe(
        atLimit,
      )

      // ⚠⚠ VACUOUS OLMAMA KANITI 2 (ve S4'ün "üst sınır TAZELEMEDE
      // tetiklenmiyor" bilinçli inceliğinin ölçümü): sınıra ulaşmış kiracı
      // MEVCUT bir daveti yine de tazeleyebilir. Bu, 409'un "her davet
      // reddediliyor" yüzünden değil, YENİ satır açmak yüzünden geldiğini
      // kanıtlar.
      const existingSeed = seeded[0]
      if (existingSeed === undefined) {
        throw new Error('tohumlanan davet listesi beklenmedik biçimde boş')
      }

      const refreshed = await invite(existingSeed.email)

      // ⚠⚠ ÖLÇÜLEN ŞEY DURUM KODU DEĞİL, HATA KODU — ve ayrımı veren tam bu:
      // tazeleme de 409 alır, ama sebebi ÜST SINIR DEĞİL, 60 sn'lik yeniden
      // gönderme bekleme süresidir (tohumlanan satırların `updatedAt`'ı
      // ŞİMDİ). Kapasite kontrolü MEVCUT satır için HİÇ çalışmadı — çalışsaydı
      // kod `PENDING_INVITATION_LIMIT_REACHED` olurdu. S4'ün "üst sınır
      // tazelemede tetiklenmiyor" inceliğinin ölçülebilir karşılığı budur.
      //
      // ⚠ Neden 200 ölçülemiyor (S5 aynı kısıtı ölçtü): cooldown'ı geçmek için
      // zamanı ileri almak gerekir; `updatedAt` Prisma'nın yönettiği bir alan
      // ve kiracı kapsamlı istemcide ham SQL yüzeyi YOK.
      expect(refreshed.status).toBe(409)
      expect(trpcErrorEnvelopeSchema.parse(refreshed.body).error.data.appError.code).toBe(
        'INVITATION_RESEND_TOO_SOON',
      )
      expect(await prismaService.withTenant(tenantId, (tx) => tx.tenantInvitation.count())).toBe(
        atLimit,
      )
    },
    120_000,
  )
})
