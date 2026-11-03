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
// Ölçüldü: `/auth/sessions` `TENANT_EXEMPT_PATHS`'TE (ROADMAP v0.0.7'den
// itibaren 13 elemanlı küme, `tenant-exempt-paths.ts`) — `TenantContextMiddleware` bu yol için
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

// ROADMAP v0.0.8, T-009/S8, CLAUDE.md §7 madde 11 — `/trpc/storefront.
// currentTenant`'ın ÇAPRAZ OKUMA testleri. Bu yüzeyin YAZMA tarafı YOK
// (salt okunur `query`, girdi şeması YOK) → çapraz YAZMA testi TANIMSIZ;
// madde 11'in metni BİLEREK çapraz OKUMA testiyle karşılanır (architect
// K7 + ADR-0012). AYRI `describe` — yukarıdaki süit kimlikli/yetkili
// senaryoları (`tenant.current`) ölçüyor, bu süit ANONİM yüzeyi ölçüyor;
// ikisini AYNI `describe`'a koymak iki güven seviyesini (kimlikli-tenant /
// anonim-tenant) karıştırırdı — `storefront.router.ts`'in dosya başı
// yorumunun AYNI ayrım gerekçesi.
describe('/trpc/storefront.currentTenant — çapraz kiracı OKUMA (madde 11, ADR-0012, ROADMAP v0.0.8/T-009/S8)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService

  beforeAll(async () => {
    const testApp = await createTestApp()
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
    "host A ile çağrı A'nın adını, host B ile çağrı B'nin adını döner — " +
      "A'nın adı B'nin yanıtında BAYT DÜZEYİNDE geçmez (ve tersi)",
    async () => {
      const slugA = uniqueSlug('storefront-cross-a')
      const slugB = uniqueSlug('storefront-cross-b')
      const nameA = `Vitrin Çapraz Kiracı A ${randomUUID().slice(0, 8)}`
      const nameB = `Vitrin Çapraz Kiracı B ${randomUUID().slice(0, 8)}`

      const tenantA = await prismaService.db.tenant.create({
        data: { slug: slugA, name: nameA, status: TenantStatus.active },
      })
      const tenantB = await prismaService.db.tenant.create({
        data: { slug: slugB, name: nameB, status: TenantStatus.active },
      })

      try {
        const responseA = await request(httpServer())
          .get('/trpc/storefront.currentTenant')
          .set('x-arkesoft-tenant', slugA)
        const responseB = await request(httpServer())
          .get('/trpc/storefront.currentTenant')
          .set('x-arkesoft-tenant', slugB)

        expect(responseA.status).toBe(200)
        expect(responseB.status).toBe(200)

        const storefrontBodySchema = z.object({
          result: z.object({ data: z.object({ name: z.string() }) }),
        })
        const bodyA = storefrontBodySchema.parse(responseA.body)
        const bodyB = storefrontBodySchema.parse(responseB.body)

        expect(bodyA.result.data.name).toBe(nameA)
        expect(bodyB.result.data.name).toBe(nameB)

        // --- Bayt düzeyinde çapraz sızıntı yok — A'nın adı B'nin HAM
        // gövdesinde/başlığında, B'nin adı A'nın HAM gövdesinde/başlığında
        // GEÇMEZ. ----------------------------------------------------------
        const rawBodyA = JSON.stringify(responseA.body)
        const rawBodyB = JSON.stringify(responseB.body)
        expect(rawBodyA).not.toContain(nameB)
        expect(rawBodyA).not.toContain(tenantB.id)
        expect(rawBodyA).not.toContain(tenantB.slug)
        expect(rawBodyB).not.toContain(nameA)
        expect(rawBodyB).not.toContain(tenantA.id)
        expect(rawBodyB).not.toContain(tenantA.slug)

        const rawHeadersA = JSON.stringify(responseA.headers)
        const rawHeadersB = JSON.stringify(responseB.headers)
        expect(rawHeadersA).not.toContain(nameB)
        expect(rawHeadersA).not.toContain(tenantB.id)
        expect(rawHeadersB).not.toContain(nameA)
        expect(rawHeadersB).not.toContain(tenantA.id)
      } finally {
        await prismaService.db.tenant.delete({ where: { id: tenantA.id } })
        await prismaService.db.tenant.delete({ where: { id: tenantB.id } })
      }
    },
  )

  it(
    "soft-delete edilmiş kiracının host'u → 404, gövdede kiracı adı/slug 0 bayt " +
      '(AC6 — var olmayan vs. soft-delete edilmiş AYNI cevap, madde 12)',
    async () => {
      const slug = uniqueSlug('storefront-cross-softdel')
      const name = `Vitrin Soft Delete ${randomUUID().slice(0, 8)}`

      const tenant = await prismaService.db.tenant.create({
        data: { slug, name, status: TenantStatus.active },
      })

      try {
        await prismaService.db.tenant.update({
          where: { id: tenant.id },
          data: { deletedAt: new Date() },
        })

        const response = await request(httpServer())
          .get('/trpc/storefront.currentTenant')
          .set('x-arkesoft-tenant', slug)

        expect(response.status).toBe(404)

        // `TenantGuard` (global `APP_GUARD`) tRPC resolver'a ULAŞMADAN
        // FIRLATIR (bu dosyanın yukarıdaki 403 vakasının AYNI gerekçesi) —
        // gövde tRPC'nin KENDİ hata zarfına (`trpcErrorDataSchema`) SARILMAZ,
        // `AppExceptionFilter`'ın FLAT `appErrorBodySchema`'sıdır.
        const errorBody = appErrorBodySchema.parse(response.body)
        expect(errorBody.code).toBe('TENANT_NOT_FOUND')

        const rawBody = JSON.stringify(response.body)
        expect(rawBody).not.toContain(name)
        expect(rawBody).not.toContain(slug)
        expect(rawBody).not.toContain(tenant.id)

        const rawHeaders = JSON.stringify(response.headers)
        expect(rawHeaders).not.toContain(name)
        expect(rawHeaders).not.toContain(slug)
      } finally {
        await prismaService.db.tenant.delete({ where: { id: tenant.id } })
      }
    },
  )
})

// ROADMAP v0.0.11, T-013/S8, CLAUDE.md §7 madde 11/12 — `/trpc/job.get` ve
// `/trpc/job.list`'in ÇAPRAZ OKUMA testleri. Bu yüzeyin YAZMA tarafı YOK
// (iki prosedür de salt okunur `query`) → çapraz YAZMA testi TANIMSIZ;
// madde 11'in metni BİLEREK çapraz OKUMA ile karşılanır (yukarıdaki
// `storefront.currentTenant` süitinin AYNI gerekçesi).
//
// ⚠⚠ AC8'İN TAM METNİ BURADA ÖLÇÜLÜR: kiracı A, B'nin `jobId`'siyle 404
// sınıfı alır VE var olmayan bir `jobId` ile BİREBİR AYNI hata gövdesini
// alır (kod + mesaj + `details` KARŞILAŞTIRMALI). Gövde `requestId` dışında
// bayt-birebir aynı olmak ZORUNDA — aksi hâlde istemci iki olguyu ayırt eder
// ve başka kiracının bir işinin VARLIĞINI öğrenir.
//
// ⚠ İddianın VACUOUS OLMADIĞI ayrıca ölçülür: (a) aynı yol KENDİ işi için
// 200 + doğru gövde döner (yani 404 "rota yok"/"yüzey bozuk" değil, gerçek
// bir domain kararı), (b) iki gövde de BOŞ/undefined DEĞİL — `JOB_NOT_FOUND`
// kodunu ve `errors.job.notFound` anahtarını GERÇEKTEN taşıyor.
//
// AYRI `describe` — yukarıdaki iki süit kiracı tablosu DEĞİL platform
// tablosunu (`tenant`) ölçüyor; bu süit KİRACIYA BAĞLI bir tabloyu (`job`)
// HTTP yüzeyinden ölçüyor.
describe('/trpc/job.* — çapraz kiracı OKUMA + varlık oracle kapanışı (AC8, ROADMAP v0.0.11/T-013/S8)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService

  beforeAll(async () => {
    const testApp = await createTestApp()
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

  /** `/trpc/<yol>?input=<json>` — tRPC'nin GET sözleşmesi (batching KAPALI). */
  function trpcQueryPath(procedure: string, input: Record<string, unknown>): string {
    return `/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`
  }

  const trpcErrorEnvelopeSchema = z.object({
    error: z.object({
      data: z.object({
        code: z.string(),
        httpStatus: z.number(),
        appError: appErrorBodySchema,
      }),
    }),
  })

  it(
    "kiracı A, B'nin jobId'siyle 404 alır; var olmayan jobId ile BİREBİR AYNI gövdeyi alır " +
      '(requestId hariç bayt-birebir) — ve aynı yol KENDİ işi için 200 döner (vacuous değil)',
    async () => {
      const slugA = uniqueSlug('job-cross-a')
      const slugB = uniqueSlug('job-cross-b')

      const tenantA = await prismaService.db.tenant.create({
        data: { slug: slugA, name: 'İş Çapraz Kiracı A', status: TenantStatus.active },
      })
      const tenantB = await prismaService.db.tenant.create({
        data: { slug: slugB, name: 'İş Çapraz Kiracı B', status: TenantStatus.active },
      })

      try {
        const session = await createAuthenticatedSession(httpServer())

        // Kullanıcı YALNIZCA kiracı A'ya üye — B bağlamında istek atmayı
        // `AuthGuard` zaten 403 ile kesiyor (yukarıdaki AC6 süiti bunu
        // ölçüyor). Buradaki soru DAHA İNCE: A bağlamında, A'nın geçerli
        // oturumuyla, B'nin bir kaynağının KİMLİĞİNİ sormak.
        await prismaService.withTenant(tenantA.id, (tx) =>
          tx.tenantMembership.create({
            data: { tenantId: tenantA.id, userId: session.userId, role: TenantRole.owner },
          }),
        )

        const jobIdA = await prismaService.withTenant(tenantA.id, async (tx) => {
          const row = await tx.job.create({
            data: {
              tenantId: tenantA.id,
              type: 'tenant.provision',
              payload: { tenantId: tenantA.id },
            },
            select: { id: true },
          })

          return row.id
        })

        const jobIdB = await prismaService.withTenant(tenantB.id, async (tx) => {
          const row = await tx.job.create({
            data: {
              tenantId: tenantB.id,
              type: 'tenant.provision',
              payload: { tenantId: tenantB.id },
            },
            select: { id: true },
          })

          return row.id
        })

        const absentJobId = `job${randomUUID().replaceAll('-', '')}`

        function getJob(jobId: string, requestId: string): Promise<request.Response> {
          return request(httpServer())
            .get(trpcQueryPath('job.get', { jobId }))
            .set('Cookie', session.cookieHeader)
            .set('x-arkesoft-tenant', slugA)
            .set('x-request-id', requestId)
        }

        const foreignRequestId = uniqueRequestId('job-foreign')
        const absentRequestId = uniqueRequestId('job-absent')
        const ownRequestId = uniqueRequestId('job-own')

        const foreignResponse = await getJob(jobIdB, foreignRequestId)
        const absentResponse = await getJob(absentJobId, absentRequestId)
        const ownResponse = await getJob(jobIdA, ownRequestId)

        // --- (a) VACUOUS DEĞİL: aynı yol KENDİ işi için ÇALIŞIYOR. ---------
        expect(ownResponse.status).toBe(200)
        const ownBody = z
          .object({ result: z.object({ data: z.object({ id: z.string(), type: z.string() }) }) })
          .parse(ownResponse.body)
        expect(ownBody.result.data.id).toBe(jobIdA)
        expect(ownBody.result.data.type).toBe('tenant.provision')

        // --- (b) 404 SINIFI: yabancı VE var olmayan kimlik. ----------------
        expect(foreignResponse.status).toBe(404)
        expect(absentResponse.status).toBe(404)

        const foreignEnvelope = trpcErrorEnvelopeSchema.parse(foreignResponse.body)
        const absentEnvelope = trpcErrorEnvelopeSchema.parse(absentResponse.body)

        // --- (c) VACUOUS DEĞİL: iki gövde de GERÇEKTEN dolu. --------------
        expect(foreignEnvelope.error.data.appError.code).toBe('JOB_NOT_FOUND')
        expect(absentEnvelope.error.data.appError.code).toBe('JOB_NOT_FOUND')
        expect(foreignEnvelope.error.data.appError.message).toBe('errors.job.notFound')
        expect(absentEnvelope.error.data.appError.message).toBe('errors.job.notFound')
        expect(foreignEnvelope.error.data.code).toBe('NOT_FOUND')
        expect(foreignEnvelope.error.data.httpStatus).toBe(404)

        // --- (d) BİREBİR AYNI GÖVDE — `requestId` HARİÇ (her çağrı kendi
        // değerini gönderdi), diğer ÜÇ alan KARŞILAŞTIRMALI olarak aynı. ---
        expect(foreignEnvelope.error.data.appError.requestId).toBe(foreignRequestId)
        expect(absentEnvelope.error.data.appError.requestId).toBe(absentRequestId)
        expect({ ...foreignEnvelope.error.data.appError, requestId: '' }).toEqual({
          ...absentEnvelope.error.data.appError,
          requestId: '',
        })
        expect({ ...foreignEnvelope.error.data, appError: null }).toEqual({
          ...absentEnvelope.error.data,
          appError: null,
        })

        // --- (e) B'nin HİÇBİR kimliği gövdede/başlıkta GEÇMEZ. ------------
        const rawForeignBody = JSON.stringify(foreignResponse.body)
        expect(rawForeignBody).not.toContain(tenantB.id)
        expect(rawForeignBody).not.toContain(tenantB.slug)
        expect(rawForeignBody).not.toContain(tenantB.name)
        expect(rawForeignBody).not.toContain(jobIdB)

        const rawForeignHeaders = JSON.stringify(foreignResponse.headers)
        expect(rawForeignHeaders).not.toContain(tenantB.id)
        expect(rawForeignHeaders).not.toContain(jobIdB)
      } finally {
        // `job` satırları `onDelete: Cascade` ile kiracı silinince temizlenir
        // (ADR-0003 madde 3) — bu dosyanın üyelik temizliğiyle AYNI gerekçe.
        await prismaService.db.tenant.delete({ where: { id: tenantA.id } })
        await prismaService.db.tenant.delete({ where: { id: tenantB.id } })
      }
    },
    20_000,
  )

  it(
    'job.list YALNIZCA kendi kiracısının satırlarını döner — ' +
      "B'nin işi A'nın listesinde ne öğe ne de bayt olarak yok",
    async () => {
      const slugA = uniqueSlug('job-list-a')
      const slugB = uniqueSlug('job-list-b')

      const tenantA = await prismaService.db.tenant.create({
        data: { slug: slugA, name: 'İş Liste Kiracı A', status: TenantStatus.active },
      })
      const tenantB = await prismaService.db.tenant.create({
        data: { slug: slugB, name: 'İş Liste Kiracı B', status: TenantStatus.active },
      })

      try {
        const session = await createAuthenticatedSession(httpServer())

        await prismaService.withTenant(tenantA.id, (tx) =>
          tx.tenantMembership.create({
            data: { tenantId: tenantA.id, userId: session.userId, role: TenantRole.owner },
          }),
        )

        const jobIdsA = await prismaService.withTenant(tenantA.id, async (tx) => {
          const ids: string[] = []
          for (const index of [0, 1]) {
            const row = await tx.job.create({
              data: {
                tenantId: tenantA.id,
                type: `tenant.provision`,
                payload: { tenantId: tenantA.id },
                createdAt: new Date(Date.parse('2026-11-03T12:00:00.000Z') + index * 1000),
              },
              select: { id: true },
            })
            ids.push(row.id)
          }
          return ids
        })

        const jobIdsB = await prismaService.withTenant(tenantB.id, async (tx) => {
          const ids: string[] = []
          for (const index of [0, 1, 2]) {
            const row = await tx.job.create({
              data: {
                tenantId: tenantB.id,
                type: 'tenant.provision',
                payload: { tenantId: tenantB.id },
                createdAt: new Date(Date.parse('2026-11-03T13:00:00.000Z') + index * 1000),
              },
              select: { id: true },
            })
            ids.push(row.id)
          }
          return ids
        })

        const response = await request(httpServer())
          .get(trpcQueryPath('job.list', { limit: 50 }))
          .set('Cookie', session.cookieHeader)
          .set('x-arkesoft-tenant', slugA)
          .set('x-request-id', uniqueRequestId('job-list'))

        expect(response.status).toBe(200)

        const body = z
          .object({
            result: z.object({
              data: z.object({
                items: z.array(z.object({ id: z.string() })),
                nextCursor: z.string().nullable(),
              }),
            }),
          })
          .parse(response.body)

        // VACUOUS DEĞİL: A'nın İKİ işi GERÇEKTEN dönüyor (boş liste değil).
        expect(body.result.data.items.map((item) => item.id).sort()).toEqual([...jobIdsA].sort())
        expect(body.result.data.nextCursor).toBeNull()

        // B'nin üç işinin HİÇBİRİ ne öğe ne de bayt olarak yok.
        const rawBody = JSON.stringify(response.body)
        for (const jobIdB of jobIdsB) {
          expect(body.result.data.items.map((item) => item.id)).not.toContain(jobIdB)
          expect(rawBody).not.toContain(jobIdB)
        }
        expect(rawBody).not.toContain(tenantB.id)
        expect(rawBody).not.toContain(tenantB.slug)
        // Kiracı A'nın kendi kimliği de tele ÇIKMAZ (K7 — `tenantId` tel
        // şemasında YOK).
        expect(rawBody).not.toContain(tenantA.id)
      } finally {
        await prismaService.db.tenant.delete({ where: { id: tenantA.id } })
        await prismaService.db.tenant.delete({ where: { id: tenantB.id } })
      }
    },
    20_000,
  )

  it("yabancı kiracının jobId'si İMLEÇ olarak verilse de AYNI 404 — imleç bir varlık oracle'ı DEĞİL", async () => {
    const slugA = uniqueSlug('job-cursor-a')
    const slugB = uniqueSlug('job-cursor-b')

    const tenantA = await prismaService.db.tenant.create({
      data: { slug: slugA, name: 'İş İmleç Kiracı A', status: TenantStatus.active },
    })
    const tenantB = await prismaService.db.tenant.create({
      data: { slug: slugB, name: 'İş İmleç Kiracı B', status: TenantStatus.active },
    })

    try {
      const session = await createAuthenticatedSession(httpServer())

      await prismaService.withTenant(tenantA.id, (tx) =>
        tx.tenantMembership.create({
          data: { tenantId: tenantA.id, userId: session.userId, role: TenantRole.owner },
        }),
      )

      const jobIdB = await prismaService.withTenant(tenantB.id, async (tx) => {
        const row = await tx.job.create({
          data: {
            tenantId: tenantB.id,
            type: 'tenant.provision',
            payload: { tenantId: tenantB.id },
          },
          select: { id: true },
        })

        return row.id
      })

      const absentCursor = `job${randomUUID().replaceAll('-', '')}`

      function listWithCursor(cursor: string, requestId: string): Promise<request.Response> {
        return request(httpServer())
          .get(trpcQueryPath('job.list', { limit: 5, cursor }))
          .set('Cookie', session.cookieHeader)
          .set('x-arkesoft-tenant', slugA)
          .set('x-request-id', requestId)
      }

      const foreignResponse = await listWithCursor(jobIdB, uniqueRequestId('cursor-foreign'))
      const absentResponse = await listWithCursor(absentCursor, uniqueRequestId('cursor-absent'))

      expect(foreignResponse.status).toBe(404)
      expect(absentResponse.status).toBe(404)

      const foreignEnvelope = trpcErrorEnvelopeSchema.parse(foreignResponse.body)
      const absentEnvelope = trpcErrorEnvelopeSchema.parse(absentResponse.body)

      expect(foreignEnvelope.error.data.appError.code).toBe('JOB_NOT_FOUND')
      expect(absentEnvelope.error.data.appError.code).toBe('JOB_NOT_FOUND')
      expect({ ...foreignEnvelope.error.data.appError, requestId: '' }).toEqual({
        ...absentEnvelope.error.data.appError,
        requestId: '',
      })
      expect(JSON.stringify(foreignResponse.body)).not.toContain(jobIdB)
    } finally {
      await prismaService.db.tenant.delete({ where: { id: tenantA.id } })
      await prismaService.db.tenant.delete({ where: { id: tenantB.id } })
    }
  }, 20_000)
})
