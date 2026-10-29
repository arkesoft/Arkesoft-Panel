// @arkesoft/api — AC10 çapraz kiracı oturumu testi (ROADMAP v0.0.5, T-006/S6,
// architect R2, Orkestratör yorumu — PO riski 5, architect "Kullanıcı
// kararları" madde 3)
//
// `createTenantIsolationSuite()` İÇİNE KONULMAZ — o süit kiracı TABLOLARI
// üzerinde parametrik; `session` platform tablosu olduğu için ona DB probu
// yazmak `TENANT_SCOPED_TABLES`'a eklemeyi, o da
// `MISSING_TENANT_ID_COLUMN`/`TENANT_ID_WITHOUT_TAXONOMY_ENTRY` ile CI'ı
// KIRMAYI gerektirir. Eşdeğeri BURADA, gerçek Postgres + gerçek HTTP ile.
//
// Yalnızca tenant A'ya üye kullanıcının GEÇERLİ oturumu → tenant B host'unda
// (`x-arkesoft-tenant` geliştirici başlığı, NODE_ENV=development) 403
// `TENANT_MEMBERSHIP_REQUIRED`; AYNI oturum tenant A'da 200.
//
// `pnpm test` İÇİNDE koşar (V-P1, `*.isolation.test.ts` deseni
// `vitest.config.ts`'in `include`'ına zaten giriyor) — `pnpm test:isolation`
// script'i BU alt görevde EKLENMEZ (S7'nin işi, dedektör dosyasıyla AYNI alt
// görevde olmak ZORUNDA).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { PrismaService } from '../prisma/prisma.service.js'
import { AuthProbeController } from './helpers/auth-probe.controller.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const PASSWORD = 'arkesoft-s6-ac10-password-123'

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

function uniqueEmail(): string {
  return `s6-ac10-${randomUUID().slice(0, 12)}@arkesoft.test`
}

const signInBodySchema = z.object({ user: z.object({ id: z.string() }) })
const setCookieHeaderSchema = z.array(z.string()).min(1)

describe('AC10 — çapraz kiracı oturumu (gerçek Postgres + gerçek HTTP)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService

  beforeAll(async () => {
    const testApp = await createTestApp({ smokeControllers: [AuthProbeController] })
    app = testApp.app
    prismaService = app.get(PrismaService)
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  it('tenant A üyesi kullanıcının geçerli oturumu → tenant B 403 TENANT_MEMBERSHIP_REQUIRED, tenant A 200', async () => {
    const tenantASlug = uniqueSlug('ac10-a')
    const tenantBSlug = uniqueSlug('ac10-b')

    const tenantA = await prismaService.db.tenant.create({
      data: { slug: tenantASlug, name: 'AC10 Kiracı A', status: TenantStatus.active },
    })
    const tenantB = await prismaService.db.tenant.create({
      data: { slug: tenantBSlug, name: 'AC10 Kiracı B', status: TenantStatus.active },
    })

    try {
      const email = uniqueEmail()
      await deleteAllMailpitMessages()

      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'AC10 Kullanıcısı', email, password: PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(token)}`)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })

      const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
      const cookieHeader = cookies.join('; ')
      const userId = signInBodySchema.parse(signInResponse.body).user.id

      // Kullanıcı YALNIZCA tenant A'ya üye — R2'nin ÜRETİM kod yolundaki
      // İLK `withTenant()` kullanımının test fixture karşılığı.
      await prismaService.withTenant(tenantA.id, (tx) =>
        tx.tenantMembership.create({
          data: { tenantId: tenantA.id, userId, role: TenantRole.owner },
        }),
      )

      // --- tenant B (üye DEĞİL) → 403 TENANT_MEMBERSHIP_REQUIRED ------------
      const tenantBResponse = await request(httpServer())
        .get('/__auth_probe')
        .set('Cookie', cookieHeader)
        .set('x-arkesoft-tenant', tenantBSlug)

      expect(tenantBResponse.status).toBe(403)
      const tenantBBody = z.object({ code: z.string() }).parse(tenantBResponse.body)
      expect(tenantBBody.code).toBe('TENANT_MEMBERSHIP_REQUIRED')
      // Gövde `tenantId` TAŞIMAZ (CLAUDE.md §7 madde 12).
      expect(JSON.stringify(tenantBResponse.body)).not.toContain(tenantB.id)
      expect(JSON.stringify(tenantBResponse.body)).not.toContain(tenantA.id)

      // --- tenant A (üye) → 200 ------------------------------------------------
      const tenantAResponse = await request(httpServer())
        .get('/__auth_probe')
        .set('Cookie', cookieHeader)
        .set('x-arkesoft-tenant', tenantASlug)

      expect(tenantAResponse.status).toBe(200)
      const identity = z
        .object({ userId: z.string(), sessionId: z.string() })
        .parse(tenantAResponse.body)
      expect(identity.userId).toBe(userId)
    } finally {
      // `tenant_membership` `onDelete: Cascade` ile tenant silinince
      // temizlenir (ADR-0003 madde 3) — `app_user`/`session`/`account`/
      // `verification` kalıcı test kalıntısı olur ama platform tablosu
      // (RLS yok, güvenlik etkisi yok) ve `v0.0.11` temizlik işinin
      // kapsamıdır; bu testin konusu DEĞİL.
      await prismaService.db.tenant.delete({ where: { id: tenantA.id } })
      await prismaService.db.tenant.delete({ where: { id: tenantB.id } })
    }
  }, 20_000)
})
