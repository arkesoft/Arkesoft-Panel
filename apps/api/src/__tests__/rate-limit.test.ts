// @arkesoft/api — oran sınırlama testleri (ROADMAP v0.0.5, T-006/S8,
// architect "S8 satırı" + "HATA SINIFLARI" + AC7, PO riski 8)
//
// ÜÇ SEVİYE: (1) BİRİM — `RateLimitGuard`/`RateLimitAccountResetInterceptor`
// mock `RateLimitService` ile, Redis'e DOKUNMADAN (`auth-guard.test.ts`'in
// `runWithStore` deseni). (2) `RateLimitService` — GERÇEK Redis (`createTestApp`
// üzerinden `app.get(RateLimitService)`). (3) HTTP — gerçek Postgres + Redis
// + Mailpit, AC7'nin TAM senaryosu + varlık-sızdırmazlık + atomiklik.
//
// Her HTTP `describe` bloğu KENDİ `createTestApp()` örneğini kurar —
// `create-test-app.ts`'in T-006/S8 eklemesi (`platform:auth:*` flush, app.init()
// SONRASI) her blok için TEMİZ bir rate-limit başlangıcı garantiler; bloklar
// ARASI çapraz kirlenme YOK.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { ExecutionContext } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { pino } from 'pino'
import { of } from 'rxjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  RateLimitAccountResetInterceptor,
  RateLimitGuard,
} from '../auth/rate-limit/rate-limit.guard.js'
import { RateLimitService } from '../auth/rate-limit/rate-limit.service.js'
import type { RateLimitCheckResult } from '../auth/rate-limit/rate-limit.service.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { RateLimitExceededError } from '../errors/domain/rate-limit-exceeded.error.js'
import { RateLimitStoreUnavailableError } from '../errors/domain/rate-limit-store-unavailable.error.js'
import type { HttpResponseWithLifecycle } from '../http/http-request.types.js'
import { requestContextStorage } from '../request-context/request-context.storage.js'
import type { RequestContext } from '../request-context/request-context.types.js'
import type { RedisService } from '../redis/redis.service.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TEST_PASSWORD = 'arkesoft-s8-rate-limit-password-123'
const REQUEST_ID = 'req_test0000000000000000000008'

function uniqueEmail(label: string): string {
  return `s8-${label}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

function runWithStore<T>(callback: () => T): T {
  const store: RequestContext = {
    requestId: REQUEST_ID,
    receivedAt: Date.now(),
    logger: pino({ level: 'silent' }),
    tenant: { kind: 'exempt' },
    auth: { kind: 'exempt' },
  }
  return requestContextStorage.run(store, callback)
}

const errorBodySchema = z.object({ code: z.string(), message: z.string() })

// --- (1) BİRİM — RateLimitGuard / RateLimitAccountResetInterceptor, mock servis ---

type FakeRequest = {
  readonly method: string
  readonly url: string
  readonly body: unknown
  readonly headers: Record<string, string>
  readonly socket: { readonly remoteAddress: string }
}

function fakeExecutionContext(req: FakeRequest, res: unknown = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext
}

function buildFakeRateLimitService(
  checkAndIncrement: (key: { key: string }) => Promise<RateLimitCheckResult>,
): RateLimitService {
  return {
    buildScopeKey: (routeKey: string, scope: string, rawValue: string) => ({
      key: `platform:auth:${routeKey}:${scope}:${rawValue}`,
      counterKeyPrefix: `${scope}-prefix`,
    }),
    checkAndIncrement: (key: { key: string }) => checkAndIncrement(key),
    resetCounter: vi.fn().mockResolvedValue(undefined),
  } as unknown as RateLimitService
}

describe('RateLimitGuard — birim (mock RateLimitService, Redis YOK)', () => {
  it('politika TANIMSIZ rota (ör. /health) → true, Redis hiç çağrılmaz', async () => {
    const checkAndIncrement = vi.fn()
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'GET',
      url: '/health',
      body: {},
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    await expect(runWithStore(() => guard.canActivate(fakeExecutionContext(req)))).resolves.toBe(
      true,
    )
    expect(checkAndIncrement).not.toHaveBeenCalled()
  })

  it('ikisi de eşik ALTINDA → true, HEM hesap HEM IP artırılır', async () => {
    const checkAndIncrement = vi.fn().mockResolvedValue({ exceeded: false, retryAfterSeconds: 900 })
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/sign-in/email',
      body: { email: 'user@arkesoft.test', password: 'x' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    await expect(runWithStore(() => guard.canActivate(fakeExecutionContext(req)))).resolves.toBe(
      true,
    )
    expect(checkAndIncrement).toHaveBeenCalledTimes(2)
  })

  it('gövdede email YOKSA → yalnızca IP kapsamı artırılır (hesap kapsamı ATLANIR)', async () => {
    const checkAndIncrement = vi.fn().mockResolvedValue({ exceeded: false, retryAfterSeconds: 900 })
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/sign-in/email',
      body: {},
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    await expect(runWithStore(() => guard.canActivate(fakeExecutionContext(req)))).resolves.toBe(
      true,
    )
    expect(checkAndIncrement).toHaveBeenCalledTimes(1)
  })

  it('HESAP eşik AŞILDI → RateLimitExceededError(scope="account")', async () => {
    let callIndex = 0
    const checkAndIncrement = vi.fn().mockImplementation(() => {
      callIndex += 1
      // İLK çağrı IP (eşik altı), İKİNCİ çağrı HESAP (eşik aşıldı) — guard'ın
      // kendi ÇAĞRI SIRASI (`rate-limit.guard.ts`: önce IP, sonra hesap).
      return Promise.resolve(
        callIndex === 1
          ? { exceeded: false, retryAfterSeconds: 900 }
          : { exceeded: true, retryAfterSeconds: 123 },
      )
    })
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/sign-in/email',
      body: { email: 'user@arkesoft.test' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    const error = await runWithStore(() =>
      guard.canActivate(fakeExecutionContext(req)).catch((cause: unknown) => cause),
    )

    expect(error).toBeInstanceOf(RateLimitExceededError)
    const rateLimitError = error as RateLimitExceededError
    expect(rateLimitError.context).toEqual({ scope: 'account', retryAfterSeconds: 123 })
    expect(rateLimitError.httpHeaders).toEqual({ 'Retry-After': '123' })
  })

  it('IP eşik AŞILDI (hesap altında) → RateLimitExceededError(scope="ip")', async () => {
    const checkAndIncrement = vi
      .fn()
      .mockResolvedValueOnce({ exceeded: true, retryAfterSeconds: 55 })
      .mockResolvedValueOnce({ exceeded: false, retryAfterSeconds: 55 })
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/sign-in/email',
      body: { email: 'user@arkesoft.test' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    const error = await runWithStore(() =>
      guard.canActivate(fakeExecutionContext(req)).catch((cause: unknown) => cause),
    )

    expect(error).toBeInstanceOf(RateLimitExceededError)
    expect((error as RateLimitExceededError).context).toEqual({
      scope: 'ip',
      retryAfterSeconds: 55,
    })
  })

  it('İKİSİ birden aşıldı → "account" raporlanır, retryAfter MAX alınır', async () => {
    const checkAndIncrement = vi
      .fn()
      .mockResolvedValueOnce({ exceeded: true, retryAfterSeconds: 40 }) // ip
      .mockResolvedValueOnce({ exceeded: true, retryAfterSeconds: 90 }) // account
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/sign-in/email',
      body: { email: 'user@arkesoft.test' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    const error = await runWithStore(() =>
      guard.canActivate(fakeExecutionContext(req)).catch((cause: unknown) => cause),
    )

    expect(error).toBeInstanceOf(RateLimitExceededError)
    expect((error as RateLimitExceededError).context).toEqual({
      scope: 'account',
      retryAfterSeconds: 90,
    })
  })
})

describe('RateLimitAccountResetInterceptor — birim (mock RateLimitService, Redis YOK)', () => {
  function fakeFinishResponse(statusCode: number): {
    readonly response: HttpResponseWithLifecycle
    readonly triggerFinish: () => void
  } {
    let finishCallback: (() => void) | undefined
    const response = {
      statusCode,
      setHeader: vi.fn(),
      on: (event: string, cb: () => void) => {
        if (event === 'finish') {
          finishCallback = cb
        }
      },
    }
    return {
      response,
      triggerFinish: () => finishCallback?.(),
    }
  }

  it('resetAccountOnSuccess=false olan rota (ör. request-password-reset) → resetCounter ASLA çağrılmaz', () => {
    const resetCounter = vi.fn().mockResolvedValue(undefined)
    const service = { resetCounter } as unknown as RateLimitService
    const interceptor = new RateLimitAccountResetInterceptor(service)

    const { response, triggerFinish } = fakeFinishResponse(200)
    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/request-password-reset',
      body: { email: 'user@arkesoft.test' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    interceptor.intercept(fakeExecutionContext(req, response), { handle: () => of(undefined) })
    triggerFinish()

    expect(resetCounter).not.toHaveBeenCalled()
  })

  it('2xx + resetAccountOnSuccess=true (sign-in) → resetCounter ÇAĞRILIR', async () => {
    const resetCounter = vi.fn().mockResolvedValue(undefined)
    const service = {
      resetCounter,
      buildScopeKey: (routeKey: string, scope: string, rawValue: string) => ({
        key: `platform:auth:${routeKey}:${scope}:${rawValue}`,
        counterKeyPrefix: 'prefix',
      }),
    } as unknown as RateLimitService
    const interceptor = new RateLimitAccountResetInterceptor(service)

    const { response, triggerFinish } = fakeFinishResponse(200)
    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/sign-in/email',
      body: { email: 'user@arkesoft.test' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    interceptor.intercept(fakeExecutionContext(req, response), { handle: () => of(undefined) })
    triggerFinish()
    // `resetCounter` `'finish'` geri çağrısı İÇİNDE `void ... .catch()` ile
    // ÇAĞRILIR — mikro görev kuyruğunun boşalmasını bekler.
    await Promise.resolve()

    expect(resetCounter).toHaveBeenCalledTimes(1)
  })

  it('BAŞARISIZ giriş (401) + resetAccountOnSuccess=true → resetCounter ÇAĞRILMAZ', async () => {
    const resetCounter = vi.fn().mockResolvedValue(undefined)
    const peekCount = vi.fn().mockResolvedValue(0)
    const service = {
      resetCounter,
      peekCount,
      buildScopeKey: (routeKey: string, scope: string, rawValue: string) => ({
        key: `platform:auth:${routeKey}:${scope}:${rawValue}`,
        counterKeyPrefix: 'prefix',
      }),
    } as unknown as RateLimitService
    const interceptor = new RateLimitAccountResetInterceptor(service)

    const { response, triggerFinish } = fakeFinishResponse(401)
    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/sign-in/email',
      body: { email: 'user@arkesoft.test' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    const store: RequestContext = {
      requestId: REQUEST_ID,
      receivedAt: Date.now(),
      logger: pino({ level: 'silent' }),
      tenant: { kind: 'exempt' },
      auth: { kind: 'exempt' },
    }

    requestContextStorage.run(store, () => {
      interceptor.intercept(fakeExecutionContext(req, response), { handle: () => of(undefined) })
      triggerFinish()
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(resetCounter).not.toHaveBeenCalled()
  })

  // FIX turu 2, madde 3 (security/qa tur2 S-4) — architect'in BAĞLAYICI
  // LOG DESENİ listesindeki `warn giriş başarısız (reason, failureCount)`
  // olayı HİÇ üretilmiyordu (ÖLÇÜLDÜ: `grep failureCount` → 0 satır).
  it('BAŞARISIZ giriş (401) → "giriş başarısız" warn + reason/failureCount/emailMasked ÜRETİLİR (ham e-posta YOK)', async () => {
    const resetCounter = vi.fn().mockResolvedValue(undefined)
    const peekCount = vi.fn().mockResolvedValue(4)
    const service = {
      resetCounter,
      peekCount,
      buildScopeKey: (routeKey: string, scope: string, rawValue: string) => ({
        key: `platform:auth:${routeKey}:${scope}:${rawValue}`,
        counterKeyPrefix: 'prefix',
      }),
    } as unknown as RateLimitService
    const interceptor = new RateLimitAccountResetInterceptor(service)

    const { response, triggerFinish } = fakeFinishResponse(401)
    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/sign-in/email',
      body: { email: 'user@arkesoft.test' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    const store: RequestContext = {
      requestId: REQUEST_ID,
      receivedAt: Date.now(),
      logger: pino({ level: 'silent' }),
      tenant: { kind: 'exempt' },
      auth: { kind: 'exempt' },
    }
    const warnSpy = vi.spyOn(store.logger, 'warn')

    requestContextStorage.run(store, () => {
      interceptor.intercept(fakeExecutionContext(req, response), { handle: () => of(undefined) })
      triggerFinish()
    })
    // `peekCount`'un ÇÖZÜLMESİNİ + `.then()` zincirinin tamamlanmasını
    // BEKLE (iki mikro görev hopu).
    await Promise.resolve()
    await Promise.resolve()

    expect(peekCount).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      { reason: 'invalid_credentials', failureCount: 4, emailMasked: 'u***@arkesoft.test' },
      'giriş başarısız',
    )
  })

  it('BAŞARISIZ giriş (403, doğrulanmamış e-posta) → reason="email_not_verified"', async () => {
    const peekCount = vi.fn().mockResolvedValue(1)
    const service = {
      resetCounter: vi.fn().mockResolvedValue(undefined),
      peekCount,
      buildScopeKey: (routeKey: string, scope: string, rawValue: string) => ({
        key: `platform:auth:${routeKey}:${scope}:${rawValue}`,
        counterKeyPrefix: 'prefix',
      }),
    } as unknown as RateLimitService
    const interceptor = new RateLimitAccountResetInterceptor(service)

    const { response, triggerFinish } = fakeFinishResponse(403)
    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/sign-in/email',
      body: { email: 'dogrulanmamis@arkesoft.test' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    const store: RequestContext = {
      requestId: REQUEST_ID,
      receivedAt: Date.now(),
      logger: pino({ level: 'silent' }),
      tenant: { kind: 'exempt' },
      auth: { kind: 'exempt' },
    }
    const warnSpy = vi.spyOn(store.logger, 'warn')

    requestContextStorage.run(store, () => {
      interceptor.intercept(fakeExecutionContext(req, response), { handle: () => of(undefined) })
      triggerFinish()
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(warnSpy).toHaveBeenCalledWith(
      { reason: 'email_not_verified', failureCount: 1, emailMasked: 'd***@arkesoft.test' },
      'giriş başarısız',
    )
  })

  it('429 (RateLimitGuard zaten reddetti) → interceptor HİÇ koşmaz, "giriş başarısız" ÜRETİLMEZ (çift loglama yok)', async () => {
    // Guard interceptor'DAN ÖNCE koşar ve eşik aşıldığında zincir
    // interceptor'a hiç GİRMEZ (Nest'in guard→interceptor sırası) — bu test
    // o varsayımı AYRICA, interceptor'ı 429 durum koduyla ÇAĞIRARAK bile
    // `peekCount`'un YALNIZCA bilinen 401/403 dallarında tetiklendiğini pinler.
    const peekCount = vi.fn().mockResolvedValue(99)
    const service = {
      resetCounter: vi.fn().mockResolvedValue(undefined),
      peekCount,
      buildScopeKey: (routeKey: string, scope: string, rawValue: string) => ({
        key: `platform:auth:${routeKey}:${scope}:${rawValue}`,
        counterKeyPrefix: 'prefix',
      }),
    } as unknown as RateLimitService
    const interceptor = new RateLimitAccountResetInterceptor(service)

    const { response, triggerFinish } = fakeFinishResponse(429)
    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/sign-in/email',
      body: { email: 'user@arkesoft.test' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    const store: RequestContext = {
      requestId: REQUEST_ID,
      receivedAt: Date.now(),
      logger: pino({ level: 'silent' }),
      tenant: { kind: 'exempt' },
      auth: { kind: 'exempt' },
    }

    requestContextStorage.run(store, () => {
      interceptor.intercept(fakeExecutionContext(req, response), { handle: () => of(undefined) })
      triggerFinish()
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(peekCount).not.toHaveBeenCalled()
  })
})

describe('RateLimitExceededError — birim (architect "HATA SINIFLARI")', () => {
  it('RATE_LIMIT_EXCEEDED/429, httpHeaders Retry-After, context PII/ham değer TAŞIMAZ', () => {
    const error = new RateLimitExceededError('ip', 42)
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(error.httpStatus).toBe(429)
    expect(error.isRetryable).toBe(false)
    expect(error.context).toEqual({ scope: 'ip', retryAfterSeconds: 42 })
    expect(error.httpHeaders).toEqual({ 'Retry-After': '42' })
  })
})

// FIX turu 2, madde 8 (security tur2 S-7) — Redis ulaşılamazken ÖNCESİ
// SARILMADAN yukarı çıkıyordu (500 INTERNAL_ERROR, /health/ready AYNI
// arızada DOĞRU 503 veriyordu — TUTARSIZLIK). `RateLimitService` burada
// DOĞRUDAN (Nest DI'sız) kurulur — `redis.eval`'ı REDDEDEN sahte bir
// `Redis` istemcisiyle.
describe('RateLimitService.checkAndIncrement — Redis ulaşılamazken (birim, FAIL-CLOSED)', () => {
  it('ioredis REDDİ → RateLimitStoreUnavailableError (503, isRetryable, causeMessage korunur), FAIL-OPEN YOK', async () => {
    const connectionError = new Error('connect ECONNREFUSED 127.0.0.1:6399')
    const fakeRedis = { eval: vi.fn().mockRejectedValue(connectionError) }
    const fakeRedisService = { client: fakeRedis } as unknown as RedisService
    const rateLimitService = new RateLimitService(fakeRedisService, BASE_ENV)

    const scopeKey = rateLimitService.buildScopeKey('POST /auth/sign-in/email', 'ip', '203.0.113.9')

    const error = await rateLimitService
      .checkAndIncrement(scopeKey, 20, 900)
      .catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(RateLimitStoreUnavailableError)
    const storeError = error as RateLimitStoreUnavailableError
    expect(storeError.code).toBe('RATE_LIMIT_STORE_UNAVAILABLE')
    expect(storeError.httpStatus).toBe(503)
    expect(storeError.isRetryable).toBe(true)
    expect(storeError.context).toEqual({
      causeCode: undefined,
      causeMessage: 'connect ECONNREFUSED 127.0.0.1:6399',
    })
    expect(storeError.cause).toBe(connectionError)
  })

  it('AggregateError (happy-eyeballs, BOŞ .message) REDDİ → causeMessage BOŞ DİZE DÖNMEZ (.errors[0]e düşer)', async () => {
    const aggregate = new AggregateError(
      [
        new Error('connect ECONNREFUSED ::1:6399'),
        new Error('connect ECONNREFUSED 127.0.0.1:6399'),
      ],
      '',
    )
    const fakeRedis = { eval: vi.fn().mockRejectedValue(aggregate) }
    const fakeRedisService = { client: fakeRedis } as unknown as RedisService
    const rateLimitService = new RateLimitService(fakeRedisService, BASE_ENV)

    const scopeKey = rateLimitService.buildScopeKey(
      'POST /auth/sign-in/email',
      'ip',
      '203.0.113.10',
    )

    const error = await rateLimitService
      .checkAndIncrement(scopeKey, 20, 900)
      .catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(RateLimitStoreUnavailableError)
    const storeError = error as RateLimitStoreUnavailableError
    expect(storeError.context['causeMessage']).toBe('connect ECONNREFUSED ::1:6399')
    expect(storeError.context['causeMessage']).not.toBe('')
  })
})

// --- (2) RateLimitService — GERÇEK Redis -----------------------------------

describe('RateLimitService — gerçek Redis (atomiklik + anahtar uzayı)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  function service(): RateLimitService {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.get(RateLimitService)
  }

  it('buildScopeKey — anahtar BOŞLUK TAŞIMAZ (GERİ ALMA kolunun `xargs` tabanlı SCAN+DEL komutu İÇİN ZORUNLU)', () => {
    const scopeKey = service().buildScopeKey('POST /auth/sign-in/email', 'ip', '203.0.113.9')
    expect(scopeKey.key).not.toMatch(/\s/)
    expect(scopeKey.key.startsWith('platform:auth:')).toBe(true)
    expect(scopeKey.counterKeyPrefix).toHaveLength(8)
  })

  it('buildScopeKey — ham e-posta/IP anahtarda GÖRÜNMEZ (HMAC)', () => {
    const scopeKey = service().buildScopeKey(
      'POST /auth/sign-in/email',
      'account',
      'gizli-kullanici@arkesoft.test',
    )
    expect(scopeKey.key).not.toContain('gizli-kullanici')
    expect(scopeKey.key).not.toContain('@arkesoft.test')
  })

  it('checkAndIncrement — ATOMİK artırır, limit aşılınca exceeded=true ve retryAfterSeconds>0 döner', async () => {
    const rateLimitService = service()
    const scopeKey = rateLimitService.buildScopeKey(
      'POST /auth/sign-in/email',
      'account',
      uniqueEmail('svc-atomic'),
    )

    const first = await rateLimitService.checkAndIncrement(scopeKey, 2, 60)
    const second = await rateLimitService.checkAndIncrement(scopeKey, 2, 60)
    const third = await rateLimitService.checkAndIncrement(scopeKey, 2, 60)

    expect(first.exceeded).toBe(false)
    expect(second.exceeded).toBe(false)
    expect(third.exceeded).toBe(true)
    expect(third.retryAfterSeconds).toBeGreaterThan(0)
    expect(third.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('resetCounter — sayacı SIFIRLAR, sonraki istek yeniden count=1 kabul edilir', async () => {
    const rateLimitService = service()
    const scopeKey = rateLimitService.buildScopeKey(
      'POST /auth/sign-in/email',
      'account',
      uniqueEmail('svc-reset'),
    )

    await rateLimitService.checkAndIncrement(scopeKey, 1, 60)
    const blocked = await rateLimitService.checkAndIncrement(scopeKey, 1, 60)
    expect(blocked.exceeded).toBe(true)

    await rateLimitService.resetCounter(scopeKey)

    const afterReset = await rateLimitService.checkAndIncrement(scopeKey, 1, 60)
    expect(afterReset.exceeded).toBe(false)
  })

  it('ATOMİKLİK (ÖLÇÜLDÜ) — 30 EŞZAMANLI istek, limit=10 → TAM 10 kabul, TAM 20 ret (yarış koşulu altında eşik AŞILMAZ)', async () => {
    const rateLimitService = service()
    const scopeKey = rateLimitService.buildScopeKey(
      'POST /auth/sign-in/email',
      'account',
      uniqueEmail('svc-concurrency'),
    )

    const results = await Promise.all(
      Array.from({ length: 30 }, () => rateLimitService.checkAndIncrement(scopeKey, 10, 60)),
    )

    const accepted = results.filter((result) => !result.exceeded).length
    const rejected = results.filter((result) => result.exceeded).length

    expect(accepted).toBe(10)
    expect(rejected).toBe(20)
  })
})

// --- (3) HTTP — gerçek Postgres + Redis + Mailpit (AC7) ---------------------

async function signUpAndVerify(httpServer: Server, email: string, password: string): Promise<void> {
  await deleteAllMailpitMessages()
  await request(httpServer)
    .post('/auth/sign-up/email')
    .send({ name: 'S8 Rate Limit Kullanıcısı', email, password })

  const delivered = await findLatestMailpitMessageTo(email)
  const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
  await request(httpServer).get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
}

describe('AC7 — hesap bazlı eşik + başarılı giriş SIFIRLAMA (K3, sign-in/email)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
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

  it('5 başarısız denemeden SONRA 6. istek 429 + Retry-After', async () => {
    const email = uniqueEmail('login-5th')
    await signUpAndVerify(httpServer(), email, TEST_PASSWORD)

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: 'yanlis-parola' })
      expect(response.status).not.toBe(429)
    }

    const sixth = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: 'yanlis-parola' })

    expect(sixth.status).toBe(429)
    expect(sixth.headers['retry-after']).toBeDefined()
    const body = errorBodySchema.parse(sixth.body)
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED')
  })

  it('ARAYA başarılı giriş girerse hesap sayacı SIFIRLANIR — sıfırlama SONRASI 5 yeni başarısız deneme 429 GETİRMEZ', async () => {
    const email = uniqueEmail('login-reset')
    await signUpAndVerify(httpServer(), email, TEST_PASSWORD)

    // 3 başarısız (count 1-3).
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: 'yanlis-parola' })
      expect(response.status).not.toBe(429)
    }

    // 1 BAŞARILI — hesap sayacını SIFIRLAR (K3).
    const successResponse = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: TEST_PASSWORD })
    expect(successResponse.status).toBe(200)

    // `'finish'` olayı + sıfırlama mikro görevinin tamamlanmasını bekle.
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Sıfırlama SONRASI 5 YENİ başarısız deneme — count 1-5, 429 GELMEMELİ.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: 'yanlis-parola' })
      expect(response.status).not.toBe(429)
    }

    // 6. (sıfırlama SONRASI) başarısız deneme → 429.
    const blockedResponse = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: 'yanlis-parola' })
    expect(blockedResponse.status).toBe(429)
  }, 15_000)
})

// AYRI `describe` — AYRI `createTestApp()` örneği (`create-test-app.ts`'in
// T-006/S8 flush'ı ile TEMİZ bir IP sayacıyla başlar). Yukarıdaki `describe`
// bloğundaki İKİ test de AYNI loopback IP'den sign-in/email'e istek atıyor —
// AYNI app'i (AYNI IP sayacını) paylaşsaydı bu test onların bıraktığı
// KALINTI üzerine inşa edilir ve 20. istekten ÖNCE 429 alırdı (ÖLÇÜLDÜ).
describe('AC7 — IP eşiği AYRICA doğrulanır (K3, sign-in/email: 20/15dk)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
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

  it('20 FARKLI e-posta (hesap eşiği HİÇBİRİNDE tetiklenmez) kabul edilir, 21. istek 429', async () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const response = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email: uniqueEmail(`ip-${String(attempt)}`), password: 'yanlis-parola' })
      expect(response.status).not.toBe(429)
    }

    const blocked = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email: uniqueEmail('ip-21'), password: 'yanlis-parola' })

    expect(blocked.status).toBe(429)
    expect(blocked.headers['retry-after']).toBeDefined()
  }, 15_000)
})

// FIX turu 1, madde 7 (solid M-6) — "düzeltilmedi: gerekçe" KAYDI (bkz.
// `rate-limit.guard.ts` dosya başı yorumu): solid gate IP sayacının
// BAŞARILI denemeleri de saydığını (K3'ün metni "20 BAŞARISIZ" diyor,
// davranış "20 DENEME") bir sapma olarak işaretledi. ÖNERİLEN düzeltme
// (başarıda IP sayacını da sıfırla) KASITLI OLARAK UYGULANMADI — paylaşılan
// bir IP'de saldırganın KENDİ geçerli hesabıyla ara sıra başarılı giriş
// yaparak IP sayacını sıfırlayıp kurbana karşı SINIRSIZ deneme hakkı
// kazanmasını ENGELLEMEK için. Bu test, solid'in "eksik negatif test"
// bulgusunu KAPATIR: BAŞARILI girişlerin de IP sayacını TÜKETTİĞİNİ (ve
// sıfırlamadığını) PİNLER.
describe('AC7 — IP eşiği BAŞARILI girişleri de TÜKETİR (solid M-6, bilinçli — "düzeltilmedi")', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
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
    '20 BAŞARILI giriş (AYNI hesap, AYNI IP) → 21. istek (DOĞRU parola) YİNE 429 ' +
      '(hesap sayacı her seferinde sıfırlanır, IP sayacı SIFIRLANMAZ)',
    async () => {
      const email = uniqueEmail('ip-success-consumes')
      await deleteAllMailpitMessages()

      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S8 IP Tüketim Testi', email, password: TEST_PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(token)}`)

      for (let attempt = 1; attempt <= 20; attempt += 1) {
        const response = await request(httpServer())
          .post('/auth/sign-in/email')
          .send({ email, password: TEST_PASSWORD })
        expect(response.status).toBe(200)
      }

      // 21. istek DOĞRU parolayla YAPILIYOR — hesap sayacı HER başarıda
      // sıfırlandığı için hesap eşiği BURADA tetiklenemez; 429 SADECE IP
      // sayacının (20 BAŞARILI denemeyle dolmuş) eşiğinden gelebilir.
      const blocked = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD })

      expect(blocked.status).toBe(429)
      expect(blocked.headers['retry-after']).toBeDefined()
    },
    20_000,
  )
})

describe('AC7 — şifre sıfırlama eşiği (K3, request-password-reset: 3/saat)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
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

  it('4. istek 429 (hesap başına 3/saat)', async () => {
    const email = uniqueEmail('reset-4th')

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await request(httpServer())
        .post('/auth/request-password-reset')
        .send({ email })
      expect(response.status).not.toBe(429)
    }

    const fourth = await request(httpServer()).post('/auth/request-password-reset').send({ email })

    expect(fourth.status).toBe(429)
    expect(fourth.headers['retry-after']).toBeDefined()
  })
})

describe('AC7 — onaylı KAPSAM GENİŞLETMESİ: sign-up/email VE send-verification-email de sınırlı', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
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

  it('POST /auth/sign-up/email — hesap başına 3/saat, 4. istek 429', async () => {
    const email = uniqueEmail('signup-4th')

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S8 Kullanıcı', email, password: TEST_PASSWORD })
      expect(response.status).not.toBe(429)
    }

    const fourth = await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'S8 Kullanıcı', email, password: TEST_PASSWORD })

    expect(fourth.status).toBe(429)
  })

  it('POST /auth/send-verification-email — hesap başına 3/saat, 4. istek 429', async () => {
    const email = uniqueEmail('resend-4th')

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await request(httpServer())
        .post('/auth/send-verification-email')
        .send({ email })
      expect(response.status).not.toBe(429)
    }

    const fourth = await request(httpServer()).post('/auth/send-verification-email').send({ email })

    expect(fourth.status).toBe(429)
  })
})

describe('AC7 — varlık-sızdırmazlık (architect BAĞLAYICI kısıt)', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
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

  async function blockAfterFiveAttempts(email: string): Promise<{
    readonly status: number
    readonly retryAfter: string | undefined
    readonly code: string
  }> {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: 'yanlis-parola' })
    }

    const sixth = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: 'yanlis-parola' })

    const body = errorBodySchema.parse(sixth.body)

    return {
      status: sixth.status,
      retryAfter: sixth.headers['retry-after'],
      code: body.code,
    }
  }

  it('VAR OLAN ve VAR OLMAYAN e-posta için status + gövde şekli + Retry-After AYIRT EDİLEMEZ', async () => {
    const existingEmail = uniqueEmail('exists')
    await signUpAndVerify(httpServer(), existingEmail, TEST_PASSWORD)
    const nonExistentEmail = uniqueEmail('missing')

    const [existingResult, missingResult] = await Promise.all([
      blockAfterFiveAttempts(existingEmail),
      blockAfterFiveAttempts(nonExistentEmail),
    ])

    expect(existingResult.status).toBe(429)
    expect(missingResult.status).toBe(429)
    expect(existingResult.status).toBe(missingResult.status)
    expect(existingResult.code).toBe(missingResult.code)
    expect(existingResult.retryAfter).toBeDefined()
    expect(missingResult.retryAfter).toBeDefined()
    expect(existingResult.retryAfter).toBe(missingResult.retryAfter)
  }, 15_000)
})
