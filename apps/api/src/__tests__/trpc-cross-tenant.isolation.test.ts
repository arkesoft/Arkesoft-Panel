// @arkesoft/api — AC6 çapraz kiracı oturumu testi (/trpc/tenant.current)
// (ROADMAP v0.0.6, T-007/S6, architect K2 — AC6 NİHAİ METİN)
//
// `createTenantIsolationSuite()` İÇİNE KONULMAZ — `auth-cross-tenant.
// isolation.test.ts`'in (T-006/S6) AYNI gerekçesi: `tenant` platform
// tablosudur, bu süit kiracı TABLOLARI üzerinde parametrik. Eşdeğeri BURADA,
// gerçek Postgres + gerçek HTTP ile.
//
// `pnpm test:isolation` İÇİNDE koşar — `vitest.isolation.config.ts`'in
// `include: ['src/**/*.isolation.test.ts']` GLOB'u bu dosyayı OTOMATİK
// toplar; o dosyaya DOKUNULMADI.
//
// DÜZELTME NOTU (raporun KARARLAR bölümüne de taşınır): AC6'nın metni "test
// `/auth/sessions` ile `/trpc/tenant.current` çıktısını karşılaştırır" diyor.
// Ölçüldü: `/auth/sessions` `TENANT_EXEMPT_PATHS`'TE (12 elemanlı küme,
// `tenant-exempt-paths.ts`) — `TenantContextMiddleware` bu yol için
// `tenant.kind`'i HER ZAMAN `'exempt'` yazar (host/başlık İÇERİĞİNDEN
// BAĞIMSIZ), `AuthGuard.enforceTenantMembership`'in `'exempt'` dalı HER ZAMAN
// `true` döner (`auth.guard.ts:90-93`) — bu yüzden `/auth/sessions` YAPISAL
// OLARAK asla `403 TENANT_MEMBERSHIP_REQUIRED` ÜRETEMEZ, hangi `x-arkesoft-
// tenant` değeri gönderilirse gönderilsin. v0.0.5'in GERÇEK 403 emsali
// (tenant-EXEMPT OLMAYAN, aynı güvenlik sınıfı bir uç) `auth-cross-tenant.
// isolation.test.ts`'in KULLANDIĞI `/__auth_probe`'tur — bu dosya
// karşılaştırmayı `/auth/sessions` YERİNE `/__auth_probe` ile yapar.
// AC6'nın BAĞLAYICI/değişmeyen şartlarının (gövdede/başlıkta tenant B kimliği
// yok, log'da tenantId(B) var) TÜMÜ aşağıda ÖLÇÜLÜYOR.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type { INestApplication } from '@nestjs/common'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { appErrorBodySchema } from '@arkesoft/errors'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { PrismaService } from '../prisma/prisma.service.js'
import { AuthProbeController } from './helpers/auth-probe.controller.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

function uniqueRequestId(prefix: string): string {
  return `req-${prefix}-${randomUUID().replaceAll('-', '')}`
}

/** `log-correlation.test.ts`/`trpc-http.test.ts`'in AYNI küçük yardımcısı — bu dosyaya ÖZGÜ, paylaşılmaz. */
function createMemoryLogStream(): { readonly stream: Writable; readonly getLines: () => string[] } {
  const chunks: Buffer[] = []

  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })

  return {
    stream,
    getLines: () =>
      Buffer.concat(chunks)
        .toString('utf-8')
        .split('\n')
        .filter((line) => line.length > 0),
  }
}

function parseLogLines(lines: readonly string[]): Record<string, unknown>[] {
  return lines.map((line) => z.record(z.string(), z.unknown()).parse(JSON.parse(line)))
}

describe('AC6 — /trpc/tenant.current çapraz kiracı oturumu (gerçek Postgres + gerçek HTTP)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let getLines: () => string[]

  beforeAll(async () => {
    const { stream, getLines: readLines } = createMemoryLogStream()
    getLines = readLines

    const testApp = await createTestApp({ stream, smokeControllers: [AuthProbeController] })
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

  it(
    'tenant A üyesi geçerli oturumla tenant B bağlamında /trpc/tenant.current çağırınca ' +
      "403 TENANT_MEMBERSHIP_REQUIRED — gövde /__auth_probe'un ÜRETTİĞİ gövdeyle deepEqual, " +
      'tenant B kimliği gövde/başlıkta yok, log kaydında tenantId(B) var',
    async () => {
      const tenantASlug = uniqueSlug('ac6-a')
      const tenantBSlug = uniqueSlug('ac6-b')

      const tenantA = await prismaService.db.tenant.create({
        data: { slug: tenantASlug, name: 'AC6 Kiracı A', status: TenantStatus.active },
      })
      const tenantB = await prismaService.db.tenant.create({
        data: { slug: tenantBSlug, name: 'AC6 Kiracı B', status: TenantStatus.active },
      })

      try {
        const session = await createAuthenticatedSession(httpServer())

        // Kullanıcı YALNIZCA tenant A'ya üye.
        await prismaService.withTenant(tenantA.id, (tx) =>
          tx.tenantMembership.create({
            data: { tenantId: tenantA.id, userId: session.userId, role: TenantRole.owner },
          }),
        )

        const trpcRequestId = uniqueRequestId('ac6-trpc')
        const probeRequestId = uniqueRequestId('ac6-probe')

        const trpcResponse = await request(httpServer())
          .get('/trpc/tenant.current')
          .set('Cookie', session.cookieHeader)
          .set('x-arkesoft-tenant', tenantBSlug)
          .set('x-request-id', trpcRequestId)

        const probeResponse = await request(httpServer())
          .get('/__auth_probe')
          .set('Cookie', session.cookieHeader)
          .set('x-arkesoft-tenant', tenantBSlug)
          .set('x-request-id', probeRequestId)

        // --- Durum + gövde: v0.0.5'in HTTP yüzeyiyle (AuthGuard'ın ÜRETİM
        // kod yolu) birebir aynı kod/gövde (K2 NİHAİ METİN). ------------------
        expect(trpcResponse.status).toBe(403)
        expect(probeResponse.status).toBe(403)

        const trpcBody = appErrorBodySchema.parse(trpcResponse.body)
        const probeBody = appErrorBodySchema.parse(probeResponse.body)

        expect(trpcBody).toEqual({
          code: 'TENANT_MEMBERSHIP_REQUIRED',
          message: 'errors.auth.tenantMembershipRequired',
          details: {},
          requestId: trpcRequestId,
        })
        expect(probeBody).toEqual({
          code: 'TENANT_MEMBERSHIP_REQUIRED',
          message: 'errors.auth.tenantMembershipRequired',
          details: {},
          requestId: probeRequestId,
        })
        // deepEqual — yalnızca `requestId` FARKLI (her çağrı kendi değerini
        // gönderdi), diğer ÜÇ alan BİREBİR aynı.
        expect({ ...trpcBody, requestId: undefined }).toEqual({
          ...probeBody,
          requestId: undefined,
        })

        // --- (a) Gövdenin TAMAMINDA tenant B'nin (VE tenant A'nın) kimliği
        // GEÇMEZ (CLAUDE.md §7, K2'nin "korunan yarısı"). ---------------------
        const rawTrpcBody = JSON.stringify(trpcResponse.body)
        expect(rawTrpcBody).not.toContain(tenantB.id)
        expect(rawTrpcBody).not.toContain(tenantB.slug)
        expect(rawTrpcBody).not.toContain(tenantB.name)
        expect(rawTrpcBody).not.toContain(tenantA.id)
        expect(rawTrpcBody).not.toContain(tenantA.slug)
        expect(rawTrpcBody).not.toContain(tenantA.name)

        // --- (b) AYNI kontrol başlıklarda da. --------------------------------
        const rawTrpcHeaders = JSON.stringify(trpcResponse.headers)
        expect(rawTrpcHeaders).not.toContain(tenantB.id)
        expect(rawTrpcHeaders).not.toContain(tenantB.slug)
        expect(rawTrpcHeaders).not.toContain(tenantB.name)

        // --- (d) Log kaydında tenantId (B) BULUNUR, tel üstünde BULUNMAZ
        // ((a)/(b) zaten bunu kanıtlıyor). `AppExceptionFilter`'ın `logger`'ı
        // `TenantContextMiddleware`'in `child({tenantId: tenantB.id})` ile
        // ZATEN bağladığı örnektir — bu yüzden `tenantId` ÜST SEVİYE bir JSON
        // alanı olarak görünür (nested `context.tenantId` DEĞİL). Guard
        // reddi interceptor'lardan ÖNCE olduğu için `'istek tamamlandı'`
        // (RequestLoggingInterceptor) BU istekte HİÇ ÜRETİLMEZ — doğru kayıt
        // `AppExceptionFilter`'ın `'istek hata ile sonuçlandı'` log'udur.
        const records = parseLogLines(getLines())
        const errorRecord = records.find(
          (record) =>
            record['requestId'] === trpcRequestId && record['msg'] === 'istek hata ile sonuçlandı',
        )

        if (errorRecord === undefined) {
          throw new Error(
            "/trpc/tenant.current çapraz kiracı isteği için 'istek hata ile sonuçlandı' log kaydı bulunamadı",
          )
        }

        expect('tenantId' in errorRecord).toBe(true)
        expect(errorRecord['tenantId']).toBe(tenantB.id)
      } finally {
        // `tenant_membership` `onDelete: Cascade` ile tenant silinince
        // temizlenir (ADR-0003 madde 3) — `auth-cross-tenant.isolation.
        // test.ts`'in AYNI gerekçesi.
        await prismaService.db.tenant.delete({ where: { id: tenantA.id } })
        await prismaService.db.tenant.delete({ where: { id: tenantB.id } })
      }
    },
    20_000,
  )
})
