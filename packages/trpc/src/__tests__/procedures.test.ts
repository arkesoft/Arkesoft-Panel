// @arkesoft/trpc — prosedür birim testleri (ROADMAP v0.0.6, T-007/ST-3 (S4),
// architect "Test yapılandırması" bölümü)
//
// AC1 (temiz koşum) + AC3 (anonim/tenant'sız context → UNAUTHORIZED/401,
// GERÇEK istemci üzerinden) + "publicProcedure'ün HERMETİK semantiği"
// (architect K4 — `ctx.auth`/`ctx.tenant` daraltması yapmayan taban,
// anonim context'te başarıyla çalışır).
//
// GEÇMİŞ TUR NOTU (T-007/S4 bulgusu, solid tur1 M1 ile güncellendi): tRPC
// v11'in `callRecursive`'i HER middleware seviyesinde kendi hatasını
// YAKALAR ve `{ok:false, error}` DÖNÜŞ DEĞERİNE çevirir — `next()` bu
// yüzden ASLA throw/reject ETMEZ. Bu yüzden `appErrorBoundary`
// (`src/trpc.ts`) `try/catch` DEĞİL, `next()`'in DÖNÜŞ DEĞERİNİ
// (`result.ok`) okuyan desenle yazılmıştır (ADR-0010 madde 3.4'ün
// uygulama notu — solid tur2 M5: ADR düzeltmesiyle atıf hizalandı, önceki
// tur "3.5" yazıyordu). Bu dosyadaki testler artık bu düzeltilmiş davranışı
// GERÇEK, GEVŞETİLMEMİŞ sonuçlarıyla (401/404, 500 DEĞİL) assert eder.

import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { isTRPCClientError } from '@trpc/client'
import { describe, expect, it } from 'vitest'

import {
  HARNESS_TENANT_SUMMARY,
  createFakeErrorFactoryPort,
  createFakeTenantReadPort,
  createHarness,
  createRecordingLogger,
} from './harness.js'
import { publicProcedure, router } from '../trpc.js'
import type { TrpcContext } from '../context/trpc-context.types.js'
import type { AppRouter } from '../routers/app.router.js'

describe('session.me (protectedProcedure)', () => {
  it('kimlikli context için yalnızca {userId, sessionId} döner', async () => {
    const harness = createHarness({
      auth: { kind: 'authenticated', userId: 'user_42', sessionId: 'session_42' },
    })

    const result = await harness.client.session.me.query()

    expect(result).toEqual({ userId: 'user_42', sessionId: 'session_42' })
    expect(Object.keys(result).sort()).toEqual(['sessionId', 'userId'])
  })
})

describe('tenant.current (tenantProcedure) — başarı yolu', () => {
  it("çözülmüş tenant context için TenantReadPort'un döndürdüğü TenantSummary'yi tele TAŞIR (sıfır dallanma)", async () => {
    const harness = createHarness({ tenantSummary: HARNESS_TENANT_SUMMARY })

    const result = await harness.client.tenant.current.query()

    expect(result).toEqual(HARNESS_TENANT_SUMMARY)
  })
})

describe('publicProcedure — hermetik semantik (architect K4)', () => {
  it("ctx.auth/ctx.tenant daraltması YAPMAYAN taban; anonim/tenant'sız context'te BAŞARIYLA çalışır", async () => {
    // Bu test `appRouter`'ı DEĞİL, yalnızca `publicProcedure`/`router`
    // builder'larından kurulmuş AD-HOC bir test router'ını koşar — v0.0.6
    // appRouter'ının yayınladığı iki prosedür de (`session.me`/
    // `tenant.current`) protected/tenant'tır (architect riski 8: "v0.0.6'da
    // HTTP yüzeyinde erişilebilir publicProcedure YOK"); bu yüzden
    // `publicProcedure`'ün KENDİSİNİN hermetik çalıştığı, builder'ın bir
    // ÜRÜNÜ üzerinden ayrıca kanıtlanır.
    const pingRouter = router({ ping: publicProcedure.query(() => 'pong') })

    const context: TrpcContext = {
      requestId: 'req_public_probe',
      logger: createRecordingLogger(),
      auth: { kind: 'anonymous' },
      tenant: { kind: 'absent' },
      ports: { tenantRead: createFakeTenantReadPort(HARNESS_TENANT_SUMMARY) },
      errors: createFakeErrorFactoryPort(),
    }

    const response = await fetchRequestHandler({
      endpoint: '/trpc',
      req: new Request('http://trpc.test/trpc/ping'),
      router: pingRouter,
      allowBatching: false,
      createContext: () => context,
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ result: { data: 'pong' } })
  })
})

describe("AC3 — anonim/tenant'sız context'te tenant.current (GERÇEK istemci üzerinden)", () => {
  it('error.data.code === "UNAUTHORIZED" ve httpStatus === 401 (ROADMAP v0.0.6 AC3)', async () => {
    const harness = createHarness({ auth: { kind: 'anonymous' }, tenant: { kind: 'absent' } })

    let caught: unknown
    try {
      await harness.client.tenant.current.query()
      throw new Error("beklenen hata fırlatılmadı — tenant.current anonim context'te BAŞARILI oldu")
    } catch (error) {
      caught = error
    }

    if (!isTRPCClientError<AppRouter>(caught)) {
      throw new Error(`beklenen TRPCClientError değil: ${String(caught)}`)
    }

    expect(caught.data?.code).toBe('UNAUTHORIZED')
    expect(caught.data?.httpStatus).toBe(401)
    // solid tur1 M2: `data.code`/`data.httpStatus` tRPC'nin KENDİ sözlüğünden
    // gelir ve `cause` round-trip'i bozulsa bile DOĞRU kalır (appErrorBoundary
    // hâlâ `isAppError` ile çalışır) — sessiz dejenerasyonu yakalayan asıl
    // alan `data.appError.code`'dur; bu portun fırlattığı
    // `HarnessUnauthenticatedError`'ın KENDİ kodunu taşıdığını doğrula.
    expect(caught.data?.appError.code).toBe('UNAUTHENTICATED')
  })
})

describe('TenantReadPort totalliği — bulunamadı durumu tele yansır', () => {
  it('port TenantNotFoundError fırlatınca yanıt NOT_FOUND/404 olur (sıfır null-kontrolü, architect K1)', async () => {
    const mismatchedSummary = { ...HARNESS_TENANT_SUMMARY, id: 'tenant_does_not_match_context' }
    const harness = createHarness({ tenantRead: createFakeTenantReadPort(mismatchedSummary) })

    let caught: unknown
    try {
      await harness.client.tenant.current.query()
      throw new Error('beklenen hata fırlatılmadı — port uyumsuzluğa rağmen BAŞARILI oldu')
    } catch (error) {
      caught = error
    }

    if (!isTRPCClientError<AppRouter>(caught)) {
      throw new Error(`beklenen TRPCClientError değil: ${String(caught)}`)
    }

    expect(caught.data?.code).toBe('NOT_FOUND')
    expect(caught.data?.httpStatus).toBe(404)
    // solid tur1 M2: port'un fırlattığı `HarnessTenantNotFoundError`'ın
    // KENDİ kodunun tele taşındığını doğrula — `data.code`/`data.httpStatus`
    // yalnızca tRPC sözlüğünü ölçer, domain içeriğinin round-trip'ini ÖLÇMEZ.
    expect(caught.data?.appError.code).toBe('TENANT_NOT_FOUND')
  })
})

describe("requireTenant'ın hata dalı — kimlikli kullanıcı + tenant'sız context (solid tur1 M3)", () => {
  it('error.data.code === "UNAUTHORIZED", httpStatus === 401 ve appError.code === "TENANT_CONTEXT_REQUIRED"', async () => {
    const harness = createHarness({
      auth: { kind: 'authenticated', userId: 'user_42', sessionId: 'session_42' },
      tenant: { kind: 'absent' },
    })

    let caught: unknown
    try {
      await harness.client.tenant.current.query()
      throw new Error(
        "beklenen hata fırlatılmadı — tenant.current kimlikli+tenant'sız context'te BAŞARILI oldu",
      )
    } catch (error) {
      caught = error
    }

    if (!isTRPCClientError<AppRouter>(caught)) {
      throw new Error(`beklenen TRPCClientError değil: ${String(caught)}`)
    }

    // `requireAuth` bu context'te kısa devre YAPMAZ (`auth.kind ===
    // 'authenticated'`) — zincir `requireTenant`'a ULAŞIR ve
    // `ctx.errors.tenantContextRequired()` fırlatılır (trpc.ts). HTTP
    // yolunda bu dal yapısal olarak erişilemez (`TenantGuard` önce 404
    // verir, K2/ADR-0010 madde 5) — bu yüzden koruma yalnızca burada,
    // `packages/trpc`'nin hermetik koşum hattında kurulur.
    expect(caught.data?.code).toBe('UNAUTHORIZED')
    expect(caught.data?.httpStatus).toBe(401)
    expect(caught.data?.appError.code).toBe('TENANT_CONTEXT_REQUIRED')
  })
})
