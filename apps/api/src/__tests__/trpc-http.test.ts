// @arkesoft/api — `/trpc` entegrasyon testleri (ROADMAP v0.0.6, T-007/S6,
// architect "Test yapılandırması" → "apps/api" bölümü, R4 sınırı)
//
// R4 (architect kararı, bağlayıcı): bu dosya apps/api'ye eklenen **TEK**
// `createTestApp()` kullanan entegrasyon dosyasıdır — tek `createTestApp()`,
// tek `createAuthenticatedSession()` (`beforeAll`'da BİR KEZ). "Her AC için
// ayrı dosya" YAZILMADI; aşağıdaki `it()` blokları AYNI kurulan oturum/kiracı/
// üyeliği PAYLAŞIR.
//
// Kapsar: AC5 (uçtan uca tipli `session.me` çağrısı, `as`/`any` yok), AC7
// (sızdırmazlık — anahtar kümesi taraması), AC9(b)+AC10 (tek fixture, iki
// yüzey — `TrpcProbeController` + test-kapsamlı `TenantReadPort`), AC13
// (`/trpc/tenant.current` log kaydında `requestId`+`tenantId`).
//
// AC12: bu dosya `platform:auth:*` önekine KOD SATIRLARINDA YAZMAZ ve koşum
// kapsamı olmayan global bir anahtar KULLANMAZ — `create-test-app.ts:159`'un
// TEK flush'ı bu dosya için de geçerli, ayrıca bir Redis anahtarı/sayaç bu
// dosyada DOĞMUYOR.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type { INestApplication } from '@nestjs/common'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { appErrorBodySchema } from '@arkesoft/errors'
import { createTrpcClient, trpcErrorDataSchema } from '@arkesoft/trpc'
import type { TrpcClient } from '@arkesoft/trpc'
import { createTrpcRequestHandler } from '@arkesoft/trpc/server'
import type { TenantReadPort, TrpcContext, TrpcRequestHandler } from '@arkesoft/trpc/server'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { TenantContextRequiredError } from '../errors/domain/tenant-context-required.error.js'
import { UnauthenticatedError } from '../errors/domain/unauthenticated.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'
import { ProbeDetailsError, TrpcProbeController } from './helpers/trpc-probe.controller.js'
import { tenantStatusWireValuesMatchPrismaAtRuntime } from './type-pins/trpc-wire-contract.pin.js'

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

function uniqueRequestId(prefix: string): string {
  // `request-id.ts`'in kabul deseni (`/^[A-Za-z0-9_-]{8,64}$/`) ile uyumlu.
  return `req-${prefix}-${randomUUID().replaceAll('-', '')}`
}

/** `log-correlation.test.ts`'in (T-002/ST-7) AYNI küçük yardımcısı — bu dosyaya ÖZGÜ, paylaşılmaz (o dosya da kendi kopyasını taşır). */
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

/** Testin kendi HTTP sunucusunu ephemeral bir porta bağlar — `createTrpcClient()` gerçek bir `url` ister. */
async function listen(server: Server): Promise<string> {
  if (!server.listening) {
    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })
  }

  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('listen: beklenmeyen sunucu adresi')
  }

  return `http://127.0.0.1:${String(address.port)}`
}

describe('/trpc entegrasyonu (gerçek Postgres + gerçek HTTP) — ROADMAP v0.0.6, T-007/S6', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let getLines: () => string[]
  let baseUrl: string
  let cookieHeader: string
  let userId: string
  let tenantId: string
  let tenantSlug: string

  beforeAll(async () => {
    const { stream, getLines: readLines } = createMemoryLogStream()
    getLines = readLines

    const testApp = await createTestApp({ stream, smokeControllers: [TrpcProbeController] })
    app = testApp.app
    prismaService = app.get(PrismaService)

    const session = await createAuthenticatedSession(app.getHttpServer())
    cookieHeader = session.cookieHeader
    userId = session.userId

    tenantSlug = uniqueSlug('s6-trpc')
    const tenant = await prismaService.db.tenant.create({
      data: { slug: tenantSlug, name: 'S6 tRPC Entegrasyon Kiracısı', status: TenantStatus.active },
    })
    tenantId = tenant.id

    // R2 — `AuthGuard`'ın üyelik kontrolü `/trpc/*`'nin TAMAMI için geçerli
    // (hangi prosedür çağrılırsa çağrılsın); TEK üyelik TÜM `it()` blokları
    // tarafından paylaşılır.
    await prismaService.withTenant(tenantId, (tx) =>
      tx.tenantMembership.create({ data: { tenantId, userId, role: TenantRole.owner } }),
    )

    baseUrl = await listen(app.getHttpServer())
  })

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

  function createClient(): TrpcClient {
    return createTrpcClient({
      url: `${baseUrl}/trpc`,
      headers: () => ({ cookie: cookieHeader, 'x-arkesoft-tenant': tenantSlug }),
    })
  }

  it('AC5 — createTrpcClient() ile mount edilmiş GERÇEK uygulamaya session.me çağrısı 200 + doğru alanlar (as/any yok)', async () => {
    const client = createClient()

    const result = await client.session.me.query()

    expect(result.userId).toBe(userId)
    expect(typeof result.sessionId).toBe('string')
    expect(result.sessionId.length).toBeGreaterThan(0)
  })

  it('AC7 — session.me yanıt JSON anahtar kümesinde token/password/hash/secret alt dizesi içeren anahtar YOK (programatik)', async () => {
    const client = createClient()
    const result = await client.session.me.query()

    const forbiddenSubstrings = ['token', 'password', 'hash', 'secret']
    const leakedKeys = Object.keys(result).filter((key) =>
      forbiddenSubstrings.some((needle) => key.toLowerCase().includes(needle)),
    )

    expect(leakedKeys).toEqual([])
    expect(Object.keys(result).sort()).toEqual(['sessionId', 'userId'])
  })

  it("AC9(b)+AC10 — yalnızca test dosyasında tanımlı AppError alt sınıfı HTTP probe'undan VE tRPC yolundan AYNI gövdeyi üretir", async () => {
    const requestId = uniqueRequestId('ac9b-ac10')

    // --- Yüzey 1: HTTP probe (AppExceptionFilter) ---------------------------
    const httpResponse = await request(httpServer())
      .get('/__trpc_probe/http')
      .set('Cookie', cookieHeader)
      .set('x-arkesoft-tenant', tenantSlug)
      .set('x-request-id', requestId)

    expect(httpResponse.status).toBe(422)
    const httpBody = appErrorBodySchema.parse(httpResponse.body)
    expect(httpBody.details).toEqual({ probe: 'x' })
    expect(httpBody.requestId).toBe(requestId)

    // --- Yüzey 2: tRPC yolu — test-kapsamlı TenantReadPort, GERÇEK appRouter/
    // errorFormatter/appErrorBoundary'yi (packages/trpc'nin ÜRETİM kodu,
    // DEĞİŞTİRİLMEDİ) `createTrpcRequestHandler()` üzerinden çalıştırır. Nest
    // guard zincirinin DIŞINDA, elle kurulmuş bir TrpcContext ile çağrılır —
    // bu yüzden AppModule'ün DI grafiğine hiçbir sağlayıcı override EKLENMEDİ.
    const probeTenantRead: TenantReadPort = {
      findSummary: () => Promise.reject(new ProbeDetailsError()),
    }
    const context: TrpcContext = {
      requestId,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      auth: { kind: 'authenticated', userId: 'probe-user', sessionId: 'probe-session' },
      tenant: { kind: 'resolved', tenantId: 'probe-tenant', slug: 'probe', status: 'active' },
      ports: { tenantRead: probeTenantRead },
      errors: {
        unauthenticated: () => new UnauthenticatedError(),
        tenantContextRequired: () => new TenantContextRequiredError(),
      },
    }

    const handler: TrpcRequestHandler = createTrpcRequestHandler()
    const trpcResponse = await handler({
      req: new Request('http://trpc-probe.test/trpc/tenant.current'),
      context,
    })

    const trpcEnvelope = z
      .object({ error: z.object({ data: trpcErrorDataSchema }) })
      .parse(await trpcResponse.json())
    const trpcAppErrorBody = appErrorBodySchema.parse(trpcEnvelope.error.data.appError)

    expect(trpcAppErrorBody).toEqual(httpBody)

    // git diff --stat -- packages/errors packages/trpc/src apps/api/src/errors
    // BOŞ olmak ZORUNDA (AC9(b)'nin asıl iddiası) — bu test dosyasının KENDİSİ
    // bu üç dizine hiçbir satır YAZMADI; kanıt raporun KOŞTURULAN KOMUTLAR
    // bölümünde.
  })

  it('AC13 — /trpc/tenant.current log kaydında requestId VE tenantId dolu (NDJSON parse)', async () => {
    const requestId = uniqueRequestId('ac13')

    const response = await request(httpServer())
      .get('/trpc/tenant.current')
      .set('Cookie', cookieHeader)
      .set('x-arkesoft-tenant', tenantSlug)
      .set('x-request-id', requestId)

    expect(response.status).toBe(200)

    const records = parseLogLines(getLines())
    const completionRecord = records.find((record) => {
      if (record['requestId'] !== requestId) {
        return false
      }
      const handler = record['handler']
      return typeof handler === 'string' && handler.includes('TrpcController')
    })

    if (completionRecord === undefined) {
      throw new Error("'/trpc/tenant.current' için log tamamlama kaydı bulunamadı")
    }

    expect(completionRecord['requestId']).toBe(requestId)
    expect('tenantId' in completionRecord).toBe(true)
    expect(completionRecord['tenantId']).toBe(tenantId)
  })

  it('PİN 1 çalışma zamanı yarısı — tenantStatusSchema.options, Object.values(TenantStatus) ile SIRALANMIŞ eşleşiyor', () => {
    expect(tenantStatusWireValuesMatchPrismaAtRuntime()).toBe(true)
  })

  // GÜVENLİK DÜZELTMESİ (security tur 1, medium bulgu — GUARD ATLATMA):
  // `/trpc/*` yanıtlarında `Cache-Control` YOKTU ve `Vary` `Cookie`
  // TAŞIMIYORDU — kimlik Cookie ile taşındığı için (Authorization DEĞİL) ve
  // yanıt `ETag` taşıdığı için, önünde paylaşımlı bir önbellek (Cloudflare
  // "Cache Everything", ters vekil, ingress) varsa RFC 9111 §4.2.2 gereği
  // `200 GET` sezgisel olarak saklanabilir ve `TenantGuard`+`AuthGuard`
  // zinciri sonraki (kimliksiz/başka kullanıcılı) istekler için TAMAMEN
  // ATLANABİLİRDİ. `trpc.controller.ts`'in `forwardTrpcWebResponse`'u artık
  // `Cache-Control: no-store, private` YAZIYOR ve `Vary`'ye `Cookie`'yi
  // (tRPC'nin KENDİ yazdığı `trpc-accept, accept` değerini EZMEDEN) EKLİYOR.
  it("GÜVENLİK — /trpc/tenant.current: Cache-Control: no-store, private + Vary'ye Cookie EKLENDİ (tRPC'nin trpc-accept/accept değeri EZİLMEDEN)", async () => {
    const response = await request(httpServer())
      .get('/trpc/tenant.current')
      .set('Cookie', cookieHeader)
      .set('x-arkesoft-tenant', tenantSlug)

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store, private')

    const varyValues = (response.headers['vary'] ?? '')
      .split(',')
      .map((value: string) => value.trim().toLowerCase())
    expect(varyValues).toContain('cookie')
    // tRPC'nin kendi yazdığı değerler EZİLMEDİ — ikisi de HÂLÂ mevcut.
    expect(varyValues).toContain('trpc-accept')
    expect(varyValues).toContain('accept')

    // `ETag` HÂLÂ YAZILIYOR (Express'in varsayılan davranışı, bu alt görevin
    // DOKUNMADIĞI bir katman) — ama RFC 9111 §5.2.2.5 gereği `no-store`
    // bulunan bir yanıt HİÇBİR önbellek tarafından SAKLANAMAZ, dolayısıyla
    // `ETag`'in sonraki bir istekte koşullu doğrulama için KULLANILMASI da
    // yapısal olarak imkansızlaşır (saklanacak bir kopya yok) — ÖLÇÜLDÜ
    // (gerçek yanıt, bkz. rapor): `etag: 'W/"a2-vmE4HWCHK7N2+tUKbdp52/vcRTc"'`
    // ile BİRLİKTE `cache-control: 'no-store, private'` AYNI yanıtta.
    expect(typeof response.headers['etag']).toBe('string')
  })

  it('GÜVENLİK — /trpc/session.me: AYNI iki başlık mevcut (yalnızca tenant.current değil, /trpc yüzeyinin TAMAMI)', async () => {
    const response = await request(httpServer())
      .get('/trpc/session.me')
      .set('Cookie', cookieHeader)
      .set('x-arkesoft-tenant', tenantSlug)

    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store, private')

    const varyValues = (response.headers['vary'] ?? '')
      .split(',')
      .map((value: string) => value.trim().toLowerCase())
    expect(varyValues).toContain('cookie')
  })
})
