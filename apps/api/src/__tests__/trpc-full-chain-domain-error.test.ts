// @arkesoft/api — gerçek Nest guard zinciri + gerçek TrpcController üzerinden
// bir domain hatasının uçtan uca gözlenmesi (ROADMAP v0.0.6, T-007, qa tur1
// medium bulgusunun KAPATILMASI).
//
// TUR1'İN BULGUSU: `trpc-http.test.ts`'in AC9(b)+AC10 fixture'ı
// `createTrpcRequestHandler()`'ı elle kurulmuş bir `TrpcContext` ile
// DOĞRUDAN çağırıyordu — gerçek `TrpcController.handle()`, gerçek
// `TenantGuard`/`AuthGuard`/`RateLimitGuard`/`SameOriginGuard` zinciri ve
// gerçek `createTrpcContext()` bu testin DIŞINDA kalıyordu. "Gerçek bir HTTP
// isteğinin, gerçek guard zincirinden geçip, DI ile enjekte edilmiş gerçek
// bir port adaptöründen fırlatılan bir AppError'ı doğru AppErrorBody'ye
// çevirdiği" senaryosu HİÇBİR testte gözlenmiyordu.
//
// TUR2'NİN ÖLÇÜMÜ: bu senaryo üretim kodu (`TenantReadPortAdapter`,
// `TrpcController`, guard'lar) HİÇ DEĞİŞTİRİLMEDEN ve `create-test-app.ts`
// (SIRALI PAYLAŞIMLI dosya) HİÇ DOKUNULMADAN kapatılabiliyor:
// `TenantReadPortAdapter` `@Injectable()` + SINIF-REFERANSLI DI token'la
// enjekte ediliyor (`@Inject(TenantReadPortAdapter)`, `trpc.controller.ts`)
// → Nest'in STANDART test API'si (`Test.createTestingModule(...)
// .overrideProvider(TenantReadPortAdapter).useValue(...)`) bu sağlayıcıyı
// ÜRETİM KODUNA DOKUNMADAN, bu test dosyasının İÇİNDE, AppModule'ü aynen
// kurarak değiştirebiliyor. İstek gerçek guard zincirinin (Tenant/Auth/
// RateLimit/SameOrigin) TAMAMINDAN geçiyor, gerçek `TrpcController.handle()`
// koşuyor, override edilmiş port `AppError` fırlatıyor, gerçek
// `appErrorBoundary`/`errorFormatter` doğru tel gövdesini üretiyor.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { appErrorBodySchema } from '@arkesoft/errors'
import { trpcErrorDataSchema } from '@arkesoft/trpc'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { AppModule } from '../app.module.js'
import { TenantNotFoundError } from '../errors/domain/tenant-not-found.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { RedisService } from '../redis/redis.service.js'
import { TenantReadPortAdapter } from '../trpc/ports/tenant-read.port.adapter.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'

/** JSON-RPC2 hata zarfı — `trpc-http.test.ts`'in AYNI şeması (bu dosyaya özgü, paylaşılmaz). */
const trpcErrorEnvelopeSchema = z.object({ error: z.object({ data: trpcErrorDataSchema }) })

/** `batch`'in tip bilgisi TAŞIMAYAN `scanStream` çıktısı — Zod ile daraltılır, `as` KULLANILMAZ. */
const scanBatchSchema = z.array(z.string())

/**
 * AC12 ile AYNI gerekçe: `create-test-app.ts:flushRateLimitCounters`
 * YENİDEN İHRAÇ EDİLMİYOR (dosyaya dokunulmuyor) — bu dosya PAYLAŞILAN
 * `platform:auth:*` Redis sayaçlarının kendi `beforeAll`'u İÇİN KÜÇÜK, yerel
 * bir kopyasını taşır (solid tur1 L12'nin `createMemoryLogStream` emsaliyle
 * AYNI, kabul edilmiş desen — bu dosya `rate-limit.test.ts`'in SAYAÇLARINA
 * YAZMAZ, sadece kendi `beforeAll`'undan ÖNCE OKUR/TEMİZLER).
 */
async function flushAuthRateLimitCounters(redisService: RedisService): Promise<void> {
  const stream = redisService.client.scanStream({ match: 'platform:auth:*', count: 100 })
  for await (const batch of stream) {
    const keys = scanBatchSchema.parse(batch)
    if (keys.length > 0) {
      await redisService.client.del(...keys)
    }
  }
}

describe('/trpc — gerçek guard zinciri üzerinden gerçek bir domain hatası (qa tur2, tur1 medium bulgusunun kapatılması)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let cookieHeader: string
  let tenantId: string
  let tenantSlug: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TenantReadPortAdapter)
      .useValue({ findSummary: () => Promise.reject(new TenantNotFoundError()) })
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()

    prismaService = app.get(PrismaService)
    await flushAuthRateLimitCounters(app.get(RedisService))

    const session = await createAuthenticatedSession(app.getHttpServer())
    cookieHeader = session.cookieHeader

    tenantSlug = `qa-full-chain-${randomUUID().slice(0, 12)}`
    const tenant = await prismaService.db.tenant.create({
      data: { slug: tenantSlug, name: 'QA Tam Zincir Kiracısı', status: TenantStatus.active },
    })
    tenantId = tenant.id

    await prismaService.withTenant(tenantId, (tx) =>
      tx.tenantMembership.create({
        data: { tenantId, userId: session.userId, role: TenantRole.owner },
      }),
    )
  })

  afterAll(async () => {
    if (app !== undefined) {
      await prismaService.db.tenant.delete({ where: { id: tenantId } })
      await app.close()
    }
  })

  it('gerçek TenantGuard/AuthGuard/RateLimitGuard/SameOriginGuard zincirinden geçer, gerçek TrpcController.handle() koşar, DI ile override edilmiş TenantReadPortAdapter AppError fırlatır, gerçek errorFormatter/appErrorBoundary doğru NOT_FOUND gövdesini üretir', async () => {
    if (app === undefined) throw new Error('app yok')

    const response = await request(app.getHttpServer())
      .get('/trpc/tenant.current')
      .set('Cookie', cookieHeader)
      .set('x-arkesoft-tenant', tenantSlug)
      .set('x-request-id', 'req-qa-full-chain-01')

    expect(response.status).toBe(404)

    const envelope = trpcErrorEnvelopeSchema.parse(response.body)
    expect(envelope.error.data.code).toBe('NOT_FOUND')

    const appError = appErrorBodySchema.parse(envelope.error.data.appError)
    expect(appError.code).toBe('TENANT_NOT_FOUND')
    expect(appError.requestId).toBe('req-qa-full-chain-01')

    // §7 madde 12'nin korunan yarısı: gövdede başka kiracının kimliği yok.
    const bodyText = JSON.stringify(response.body)
    expect(bodyText).not.toContain(tenantId)
    expect(bodyText).not.toContain(tenantSlug)
  })
})
