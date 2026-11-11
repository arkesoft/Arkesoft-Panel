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
import type {
  JobReadPort,
  MemberWritePort,
  MembershipReadPort,
  SessionListReadPort,
  SessionSecurityReadPort,
  StorefrontTenantReadPort,
  TenantReadPort,
  TenantSecurityWritePort,
  TrpcContext,
  TrpcRequestHandler,
} from '@arkesoft/trpc/server'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { PermissionDeniedError } from '../errors/domain/permission-denied.error.js'
import { TenantContextRequiredError } from '../errors/domain/tenant-context-required.error.js'
import { UnauthenticatedError } from '../errors/domain/unauthenticated.error.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'
import { ProbeDetailsError, TrpcProbeController } from './helpers/trpc-probe.controller.js'
import {
  jobStatusWireValuesMatchPrismaAtRuntime,
  tenantRoleWireValuesMatchPrismaAtRuntime,
  tenantStatusWireValuesMatchPrismaAtRuntime,
} from './type-pins/trpc-wire-contract.pin.js'

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
    // ROADMAP v0.0.15, T-016 FIX turu 2/M-4 — `beforeAll`'da bu kullanıcı
    // için 2FA kurulmadı, varsayılan `app_user.two_factor_enabled` değeri
    // `false`'tur (`schema.prisma:154`); bu alanın GERÇEKTEN
    // `SessionSecurityReadPort` üzerinden DOLDUĞUNUN kanıtı
    // `session-me-two-factor-enabled.test.ts`'in iki hücreli testidir —
    // burası yalnızca "tip/varlık doğru" sanity'sidir.
    expect(typeof result.twoFactorEnabled).toBe('boolean')
    expect(result.twoFactorEnabled).toBe(false)
  })

  it('AC7 — session.me yanıt JSON anahtar kümesinde token/password/hash/secret alt dizesi içeren anahtar YOK (programatik)', async () => {
    const client = createClient()
    const result = await client.session.me.query()

    const forbiddenSubstrings = ['token', 'password', 'hash', 'secret']
    const leakedKeys = Object.keys(result).filter((key) =>
      forbiddenSubstrings.some((needle) => key.toLowerCase().includes(needle)),
    )

    expect(leakedKeys).toEqual([])
    // ROADMAP v0.0.15, T-016 FIX turu 2/M-4 — `twoFactorEnabled` EKLENDİ
    // (MINOR, katkısal); anahtar kümesi ARTIK ÜÇ alan.
    expect(Object.keys(result).sort()).toEqual(['sessionId', 'twoFactorEnabled', 'userId'])
  })

  // ROADMAP v0.0.15.1, T-017/S9 — `session.list` canlı HTTP turu. `session.me`'nin
  // (grup 4, `tenant-exempt-paths.ts`) AYNI gerekçesiyle KİRACI MUAFTIR —
  // bu yüzden `x-arkesoft-tenant` BAŞLIĞI GÖNDERİLMEDEN (panel host'u taklidi,
  // `session-me-two-factor-enabled.test.ts`'in AYNI deseni) çağrılır.
  it('/trpc/session.list — panel host (kiracı başlığı YOK) → 200, kendi oturumunu döner', async () => {
    const client = createTrpcClient({
      url: `${baseUrl}/trpc`,
      headers: () => ({ cookie: cookieHeader }),
    })

    const result = await client.session.list.query()

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThanOrEqual(1)
    const current = result.find((row) => row.isCurrent)
    expect(current).toBeDefined()
  })

  it('/trpc/session.list — oturumsuz çağrı 401 döner (kimlik ZORUNLU)', async () => {
    const response = await request(httpServer()).get('/trpc/session.list')

    expect(response.status).toBe(401)
  })

  // Q-2 (qa gate, tur 1; security gate tur1 F4) — ADR-0019 §9 "kullanıcı-çapraz
  // erişim testi zorunlu" diyor; REST taşımasında VAR (`auth-sessions.test.ts`'in
  // AC1'i — iki oturum, iki satır, TAM BİR isCurrent), ama tRPC taşımasında
  // (`/trpc/session.list`) hiçbir testte İKİ KULLANICI birden GEÇMEMİŞTİ
  // (yukarıdaki "panel host" testi TEK kullanıcılı). Sahiplik mantığı AYNI
  // fonksiyonda (`SessionsService.listOwnSessions` → `where: { userId }`) —
  // izolasyon KAPALI, eksik olan TAŞIMA SEVİYESİ pinidir (security F4'ün
  // gerekçesiyle BİREBİR). Bu test o taşıma seviyesi pinini kapatır: GERÇEK
  // `createTrpcClient()` + GERÇEK HTTP + İKİ bağımsız kullanıcı.
  it(
    "/trpc/session.list — İKİ KULLANICI: A, B'nin oturumunu GÖRMEZ VE B, A'nınkini " +
      'GÖRMEZ (taşıma seviyesi kullanıcı-çapraz pini, ADR-0019 §9)',
    async () => {
      const userA = await createAuthenticatedSession(httpServer())
      const userB = await createAuthenticatedSession(httpServer())

      const clientA = createTrpcClient({
        url: `${baseUrl}/trpc`,
        headers: () => ({ cookie: userA.cookieHeader }),
      })
      const clientB = createTrpcClient({
        url: `${baseUrl}/trpc`,
        headers: () => ({ cookie: userB.cookieHeader }),
      })

      const resultA = await clientA.session.list.query()
      const resultB = await clientB.session.list.query()

      expect(resultA.length).toBeGreaterThanOrEqual(1)
      expect(resultB.length).toBeGreaterThanOrEqual(1)

      const sessionIdsA = resultA.map((row) => row.id)
      const sessionIdsB = resultB.map((row) => row.id)

      // ÇAPRAZ SIZINTI YOK — A'nın listesi B'nin HİÇBİR satırını (VE tersi)
      // İÇERMEZ. Kesişim BOŞ KÜME olmalı.
      expect(sessionIdsA.some((id) => sessionIdsB.includes(id))).toBe(false)
      expect(sessionIdsB.some((id) => sessionIdsA.includes(id))).toBe(false)

      // Her kullanıcı KENDİ listesinde TAM BİR isCurrent satır görür — başkasının
      // oturumu "isCurrent" OLARAK da SIZMAZ (yanlış-pozitif sahiplik yok).
      expect(resultA.filter((row) => row.isCurrent).length).toBe(1)
      expect(resultB.filter((row) => row.isCurrent).length).toBe(1)
    },
  )

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
    // Bu probe `storefront.currentTenant`'ı ÇAĞIRMAZ — stub yalnızca
    // `TrpcPorts`'un (v0.0.8'den itibaren ZORUNLU) alanını doldurmak için
    // var, hiçbir assert buna dayanmaz.
    const probeStorefrontTenantRead: StorefrontTenantReadPort = {
      findPublicTenant: () => Promise.reject(new ProbeDetailsError()),
    }
    // Bu probe `job.*`'ı ÇAĞIRMAZ — stub yalnızca `TrpcPorts`'un
    // (v0.0.11'den itibaren ZORUNLU) alanını doldurmak için var, hiçbir
    // assert buna dayanmaz. ⚠ Opsiyonel YAPILMASI YASAK (po R-P2) —
    // `storefrontTenantRead`'in v0.0.8 emsali.
    const probeJobRead: JobReadPort = {
      findJob: () => Promise.reject(new ProbeDetailsError()),
      listJobs: () => Promise.reject(new ProbeDetailsError()),
    }
    // ROADMAP v0.0.14, T-014/S4 — `TrpcPorts`'un v0.0.14'ten itibaren ZORUNLU
    // iki üyesi. Bu probe `member.*`'ı ÇAĞIRMAZ; stub yalnızca sözleşmeyi
    // doldurmak için var ve hiçbir assert buna dayanmaz.
    // ⚠ OPSİYONEL YAPILMASI YASAK (po R-PM5, `context/trpc-context.types.ts`
    // dosyasının YAZILI yasağı): `storefrontTenantRead`'in v0.0.8 ve
    // `jobRead`'in v0.0.11 emsali — bir typecheck hatasını susturmak için `?`
    // konmaz, doğru çözüm portu DOLDURMAKTIR. Bu iki satır o çözümdür.
    const probeMembershipRead: MembershipReadPort = {
      requireRole: () => Promise.reject(new ProbeDetailsError()),
    }
    const probeMemberWrite: MemberWritePort = {
      invite: () => Promise.reject(new ProbeDetailsError()),
      acceptInvitation: () => Promise.reject(new ProbeDetailsError()),
      updateRole: () => Promise.reject(new ProbeDetailsError()),
      remove: () => Promise.reject(new ProbeDetailsError()),
    }
    // ROADMAP v0.0.15, T-016/S7 — `TrpcPorts`'un ZORUNLU yeni üyesi. Bu probe
    // `tenant.updateSecurityPolicy`'yi ÇAĞIRMAZ; stub yalnızca sözleşmeyi
    // doldurmak için var, hiçbir assert buna dayanmaz.
    const probeTenantSecurityWrite: TenantSecurityWritePort = {
      updateSecurityPolicy: () => Promise.reject(new ProbeDetailsError()),
    }
    // ROADMAP v0.0.15, T-016 FIX turu 2/M-4 — `TrpcPorts`'un ZORUNLU yeni
    // üyesi. Bu probe `session.me`'yi ÇAĞIRMAZ (hedef `tenant.current`);
    // stub yalnızca sözleşmeyi doldurmak için var, hiçbir assert buna
    // dayanmaz.
    const probeSessionSecurityRead: SessionSecurityReadPort = {
      isTwoFactorEnabled: () => Promise.reject(new ProbeDetailsError()),
    }
    // ROADMAP v0.0.15.1, T-017/S9 — `TrpcPorts`'un ZORUNLU yeni üyesi. Bu
    // probe `session.list`'i ÇAĞIRMAZ (hedef `tenant.current`); stub
    // yalnızca sözleşmeyi doldurmak için var, hiçbir assert buna dayanmaz.
    const probeSessionListRead: SessionListReadPort = {
      listOwnSessions: () => Promise.reject(new ProbeDetailsError()),
    }
    const context: TrpcContext = {
      requestId,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      auth: { kind: 'authenticated', userId: 'probe-user', sessionId: 'probe-session' },
      tenant: { kind: 'resolved', tenantId: 'probe-tenant', slug: 'probe', status: 'active' },
      ports: {
        tenantRead: probeTenantRead,
        tenantSecurityWrite: probeTenantSecurityWrite,
        storefrontTenantRead: probeStorefrontTenantRead,
        jobRead: probeJobRead,
        membershipRead: probeMembershipRead,
        memberWrite: probeMemberWrite,
        sessionSecurityRead: probeSessionSecurityRead,
        sessionListRead: probeSessionListRead,
      },
      errors: {
        unauthenticated: () => new UnauthenticatedError(),
        tenantContextRequired: () => new TenantContextRequiredError(),
        // ROADMAP v0.0.14, T-014/S4 — `TrpcErrorFactoryPort`'un ZORUNLU üçüncü
        // üyesi. Bu probe izin kapısına UĞRAMAZ (`tenant.current`
        // `tenantProcedure`'dür); fabrika yalnızca sözleşmeyi doldurur.
        permissionDenied: (permission, role) => new PermissionDeniedError(permission, role),
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

  it('PİN 5 çalışma zamanı yarısı — jobStatusSchema.options, Object.values(JobStatus) ile SIRALANMIŞ eşleşiyor', () => {
    // ROADMAP v0.0.11, T-013/S8. Tip pini anahtar KÜMESİNİ denetler; bu
    // assert DEĞER kümesini denetler (tip pininin yakalayamayacağı sapma:
    // aynı anahtarlar ama Prisma'nın değer tarafı farklı yazılmış).
    expect(jobStatusWireValuesMatchPrismaAtRuntime()).toBe(true)
  })

  it('PİN 8 çalışma zamanı yarısı — tenantRoleSchema.options, Object.values(TenantRole) ile SIRALANMIŞ eşleşiyor', () => {
    // ROADMAP v0.0.14, T-014/S4 — AC4. PİN 1/5'in birebir ikizi: tip pini
    // (`pinTenantRoleWireKeysExactlyMatchTenantRole`, `pnpm typecheck`)
    // anahtar KÜMESİNİ denetler, bu assert DEĞER kümesini denetler.
    // ⚠ BU ÇAĞRI OLMADAN pin YALNIZCA tip seviyesinde kalırdı — pin dosyası
    // bir `.test.ts` DEĞİL (vitest glob'u onu yakalamaz), yani içindeki
    // çalışma zamanı fonksiyonları ancak buradan çağrılırsa KOŞAR.
    expect(tenantRoleWireValuesMatchPrismaAtRuntime()).toBe(true)
  })

  // GÜVENLİK DÜZELTMESİ (security tur 1, medium bulgu — GUARD ATLATMA):
  // `/trpc/*` yanıtlarında `Cache-Control` YOKTU ve `Vary` `Cookie`
  // TAŞIMIYORDU — kimlik Cookie ile taşındığı için (Authorization DEĞİL) ve
  // yanıt `ETag` taşıdığı için, önünde paylaşımlı bir önbellek (Cloudflare
  // "Cache Everything", ters vekil, ingress) varsa RFC 9111 §4.2.2 gereği
  // `200 GET` sezgisel olarak saklanabilir ve `TenantGuard`+`AuthGuard`
  // zinciri sonraki (kimliksiz/başka kullanıcılı) istekler için TAMAMEN
  // ATLANABİLİRDİ.
  //
  // GÜNCELLEME (ROADMAP v0.0.7, T-008/S3, architect K6, borç 1440+1441+1453):
  // ESKİ çözüm (`trpc.controller.ts`'in `forwardTrpcWebResponse`'u) bu iki
  // başlığı yalnızca BAŞARILI `/trpc` yanıtlarına yazıyordu — guard reddi
  // (401/403/404) yanıtları bu başlıkları HİÇ TAŞIMIYORDU (0/5, AC19).
  // Yazım ARTIK `NoStoreHeadersMiddleware`'de (GLOBAL, guard'lardan ÖNCE
  // koşar) — HER yanıt (bu dosyanın `200`'ü dahil) `Cache-Control: no-store,
  // private` TAŞIR; `trpc.controller.ts` yalnızca `Vary`'ye `Cookie`'yi
  // (tRPC'nin KENDİ yazdığı `trpc-accept, accept` değerini EZMEDEN)
  // `appendHeader` ile EKLER.
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

    // GÜNCELLEME (ROADMAP v0.0.7, T-008/S3, architect K6 madde 7, A-A4):
    // `ETag` ARTIK YAZILMIYOR — `HttpHardeningInitializer`
    // (`OnApplicationBootstrap`) `app.set('etag', false)` ile Express'in
    // varsayılanını KAPATTI. RFC 9111 §5.2.2.5 gereği `no-store` bulunan bir
    // yanıt HİÇBİR önbellek tarafından SAKLANAMAZ, dolayısıyla `ETag`'in
    // koşullu doğrulama için kullanılması zaten yapısal olarak imkansızdı —
    // bu assert'in GEVŞETİLMESİ DEĞİL, middleware kaynağına göre
    // GÜNCELLENMESİdir (CLAUDE.md kısıtı): önceki hâl `etag`'in VARLIĞINI
    // assert ediyordu, şimdi YOKLUĞUNU assert ediyor.
    expect(response.headers['etag']).toBeUndefined()
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

  // AC13/AC8 (ROADMAP v0.0.8, T-009/S7, güncelleme v0.0.10/T-012/S4, ADR-0012) —
  // `storefront.currentTenant` GERÇEK HTTP yanıtının gövdesi `{name, themeId,
  // themeVersion}`'ın DIŞINDA HİÇBİR ALAN taşımaz (`planId`/`deletedAt`/`id`/
  // `slug`/`status`/`primaryDomain` → 0 bayt, AC8 negatif pin) VE bu yüzey
  // OTURUMSUZ (`Cookie` YOK) 200 döner — kimlik ekseni açıldı, tenant ekseni
  // (`x-arkesoft-tenant` → host çözümü) DEĞİŞMEDİ.
  it('AC13 — /trpc/storefront.currentTenant: OTURUMSUZ 200, gövde yalnızca {name,themeId,themeVersion} (altı yasak alan 0 bayt)', async () => {
    const response = await request(httpServer())
      .get('/trpc/storefront.currentTenant')
      .set('x-arkesoft-tenant', tenantSlug)

    expect(response.status).toBe(200)

    const body = z
      .object({ result: z.object({ data: z.record(z.string(), z.unknown()) }) })
      .parse(response.body)

    expect(Object.keys(body.result.data)).toEqual(['name', 'themeId', 'themeVersion'])

    const forbiddenKeys = ['planId', 'deletedAt', 'id', 'slug', 'status', 'primaryDomain']
    for (const key of forbiddenKeys) {
      expect(key in body.result.data, `${key} BEKLENMEDEN tele yazıldı`).toBe(false)
    }
  })

  // AC13 — çözümsüz host (bilinmeyen slug) → 404, `TenantGuard`'ın normal
  // davranışı; kimlik muafiyeti (`AUTH_EXEMPT_PATHS`) kiracı çözümünü
  // ATLAMAZ — `TENANT_EXEMPT_PATHS` BU yolu İÇERMİYOR (değişmedi).
  it('AC13 — /trpc/storefront.currentTenant: ÇÖZÜMSÜZ host (bilinmeyen slug) → 404', async () => {
    const response = await request(httpServer())
      .get('/trpc/storefront.currentTenant')
      .set('x-arkesoft-tenant', uniqueSlug('s7-unresolved'))

    expect(response.status).toBe(404)
  })
})
