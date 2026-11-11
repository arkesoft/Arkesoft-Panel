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
import { generateTotpCode } from '../auth/two-factor/totp-code-generator.port.js'
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
    // ROADMAP v0.0.14, T-014/S4 EKLEMESİ (additive, po R-PO2):
    // `RequestContext.client` ZORUNLU bir alan ve `?` ile opsiyonel
    // YAPILMADI (`auth`'un v0.0.5 emsali) → bu dosyadaki BEŞ kurucunun
    // hepsi DOLDURULDU.
    // ⚠ İSTEMCİ IP'Sİ BU ALANDAN OKUNMUYOR: oran sınırı muhafızı IP'yi
    // HAM İSTEKTEN (`resolveClientIp`) çözmeye devam ediyor — iki yol AYNI
    // saf çözümleyiciyi paylaşır ama muhafız ALS'ye BAĞIMLI DEĞİLDİR. Bu
    // yüzden buradaki `null` değerler aşağıdaki sayaç assert'lerini
    // ETKİLEMEZ; etkilerse bu, davranış değişikliği olurdu.
    client: { ip: null, userAgent: null },
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

  // T-016 FIX turu 1, madde 1/F1 (`high`) — `sessionUserId` kapsamı (dört
  // 2FA-kimlik-gerekli uç): ALS'teki `auth.authenticated.userId` OKUNUR,
  // body'de `email` ARANMAZ.
  it('`sessionUserId` kapsamı (ör. /auth/two-factor/disable): authenticated userId HESAP kapsamı olur', async () => {
    const checkAndIncrement = vi.fn().mockResolvedValue({ exceeded: false, retryAfterSeconds: 900 })
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/two-factor/disable',
      body: { password: 'yanlis-parola' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    const store: RequestContext = {
      requestId: REQUEST_ID,
      receivedAt: Date.now(),
      logger: pino({ level: 'silent' }),
      tenant: { kind: 'exempt' },
      auth: { kind: 'authenticated', userId: 'usr_victim', sessionId: 'ses_stolen' },
      client: { ip: null, userAgent: null },
    }

    await expect(
      requestContextStorage.run(store, () => guard.canActivate(fakeExecutionContext(req))),
    ).resolves.toBe(true)
    expect(checkAndIncrement).toHaveBeenCalledTimes(2)
  })

  it('`sessionUserId` kapsamı: auth.kind !== "authenticated" → hesap kapsamı ATLANIR (yalnızca IP)', async () => {
    const checkAndIncrement = vi.fn().mockResolvedValue({ exceeded: false, retryAfterSeconds: 900 })
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/two-factor/disable',
      body: { password: 'x' },
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    }

    await expect(runWithStore(() => guard.canActivate(fakeExecutionContext(req)))).resolves.toBe(
      true,
    )
    expect(checkAndIncrement).toHaveBeenCalledTimes(1)
  })

  // T-016 FIX turu 1, madde 1/F1 — `twoFactorChallengeOrSession` kapsamı:
  // HAM `Cookie` başlığından okunur, `getRequestContext().auth` HİÇ
  // KULLANILMAZ (bu iki uç `AUTH_EXEMPT_PATHS`'TE — `context.auth` ASLA
  // doldurulmaz, testin `auth: {kind:'exempt'}` değeri BUNU TEMSİL EDER).
  it('`twoFactorChallengeOrSession` kapsamı: two_factor challenge çerezi VARSA onun değeri HESAP kapsamı olur', async () => {
    const checkAndIncrement = vi.fn().mockResolvedValue({ exceeded: false, retryAfterSeconds: 900 })
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/two-factor/verify-totp',
      body: { code: '000000' },
      headers: { cookie: 'better-auth.two_factor=challenge-abc' },
      socket: { remoteAddress: '10.0.0.1' },
    }

    await expect(runWithStore(() => guard.canActivate(fakeExecutionContext(req)))).resolves.toBe(
      true,
    )
    expect(checkAndIncrement).toHaveBeenCalledTimes(2)
  })

  it('`twoFactorChallengeOrSession` kapsamı: challenge YOK ama session_token VAR (2FA kurulum onayı) → o değer HESAP kapsamı olur', async () => {
    const checkAndIncrement = vi.fn().mockResolvedValue({ exceeded: false, retryAfterSeconds: 900 })
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'POST',
      url: '/auth/two-factor/verify-totp',
      body: { code: '000000' },
      headers: { cookie: 'better-auth.session_token=session-xyz' },
      socket: { remoteAddress: '10.0.0.1' },
    }

    await expect(runWithStore(() => guard.canActivate(fakeExecutionContext(req)))).resolves.toBe(
      true,
    )
    expect(checkAndIncrement).toHaveBeenCalledTimes(2)
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
      // T-014/S4 (po R-PO2) — ZORUNLU alan, `?` YOK. Gerekçe dosyanın
      // yukarısındaki `runWithStore` yorumunda.
      client: { ip: null, userAgent: null },
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
      // T-014/S4 (po R-PO2) — ZORUNLU alan, `?` YOK. Gerekçe dosyanın
      // yukarısındaki `runWithStore` yorumunda.
      client: { ip: null, userAgent: null },
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
      // T-014/S4 (po R-PO2) — ZORUNLU alan, `?` YOK. Gerekçe dosyanın
      // yukarısındaki `runWithStore` yorumunda.
      client: { ip: null, userAgent: null },
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
      // T-014/S4 (po R-PO2) — ZORUNLU alan, `?` YOK. Gerekçe dosyanın
      // yukarısındaki `runWithStore` yorumunda.
      client: { ip: null, userAgent: null },
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

// --- (4) T-016 FIX turu 1, madde 1/F1 (`high`) — altı 2FA ucunun CANLI -----
// kanıtı. Her test KENDİ `createTestApp()`'ını kurar (`platform:auth:*`
// flush — bloklar arası çapraz kirlenme YOK, dosya başı yorumu).

const totpUriSchema = z.object({
  method: z.literal('totp'),
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
})

function extractBase32SecretFromTotpUri(totpURI: string): string {
  return extractQueryParam(totpURI, 'secret')
}

function toCookiePair(setCookieHeader: string): string {
  const firstSegment = setCookieHeader.split(';')[0]
  if (firstSegment === undefined) {
    throw new Error(`beklenmeyen Set-Cookie biçimi: ${setCookieHeader}`)
  }
  return firstSegment.trim()
}

function findSetCookie(setCookies: readonly string[], namePrefix: string): string | undefined {
  return setCookies.find(
    (entry) => entry.startsWith(`${namePrefix}=`) || entry.includes(`${namePrefix}=`),
  )
}

const setCookieHeaderSchema = z.array(z.string()).min(1)

describe('F1 (high) — /auth/two-factor/disable: ÇALINTI oturum çerezi + parola tahmini, `sessionUserId` kapsamı', () => {
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
    'SÖMÜRÜ SENARYOSU: 5 YANLIŞ parola denemesi (hepsi 400 INVALID_PASSWORD, 2FA KAPATILMAZ), ' +
      "6. deneme 429 — düzeltmeden ÖNCE bu uç `rate-limit.policy.ts`'te TANIMSIZDI (fail-open, sınırsız)",
    async () => {
      const email = uniqueEmail('f1-disable-oracle')
      await signUpAndVerify(httpServer(), email, TEST_PASSWORD)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD })
      const cookiePair = toCookiePair(
        setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])[0] ?? '',
      )

      // RAPORA GİRER (madde 1, "ham çıktı: N yanlış tahmin, hepsi 400") — HER
      // deneme YANLIŞ parola, 2FA satırı/`twoFactorEnabled` DEĞİŞMEZ.
      const attemptStatuses: number[] = []
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await request(httpServer())
          .post('/auth/two-factor/disable')
          .set('Cookie', cookiePair)
          .send({ password: 'yanlis-parola' })
        attemptStatuses.push(response.status)
        expect(response.status).toBe(400)
        expect(response.status).not.toBe(429)
      }
      expect(attemptStatuses).toEqual([400, 400, 400, 400, 400])

      // RAPORA GİRER (madde 1, "sonra 429") — 6. deneme Redis sayacı
      // (`platform:auth:post-auth-two-factor-disable:account:<hmac>`) 5
      // sınırını aştığı için 429 verir, Better Auth'a hiç ULAŞMAZ.
      const sixth = await request(httpServer())
        .post('/auth/two-factor/disable')
        .set('Cookie', cookiePair)
        .send({ password: 'yanlis-parola' })

      expect(sixth.status).toBe(429)
      expect(sixth.headers['retry-after']).toBeDefined()
      expect(errorBodySchema.parse(sixth.body).code).toBe('RATE_LIMIT_EXCEEDED')
    },
    20_000,
  )
})

describe('F1 (high) — /auth/two-factor/verify-totp: ÖN-GİRİŞ modu (challenge çerezi), `twoFactorChallengeOrSession` kapsamı', () => {
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
    "5 YANLIŞ TOTP kodu (hepsi 401 INVALID_CODE) → 6.'sı 429 — Better Auth'un KENDİ hesap " +
      "kilidi (10 deneme/900s) BU dalda ÇALIŞIR AMA bizim 5'lik eşiğimiz ONDAN ÖNCE devreye girer",
    async () => {
      const email = uniqueEmail('f1-verify-totp-signin')
      await signUpAndVerify(httpServer(), email, TEST_PASSWORD)

      const firstSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD })
      const sessionCookiePair = toCookiePair(
        setCookieHeaderSchema.parse(firstSignIn.headers['set-cookie'])[0] ?? '',
      )

      const enableResponse = await request(httpServer())
        .post('/auth/two-factor/enable')
        .set('Cookie', sessionCookiePair)
        .send({ password: TEST_PASSWORD, method: 'totp' })
      const { totpURI } = totpUriSchema.parse(enableResponse.body)
      const base32Secret = extractBase32SecretFromTotpUri(totpURI)

      const confirmCode = await generateTotpCode({ base32Secret })
      await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', sessionCookiePair)
        .send({ code: confirmCode })

      // YENİ bir sign-in → YENİ bir challenge (`two_factor` çerezi, NORMAL
      // oturum çerezi YOK).
      const challengeSignIn = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD })
      const challengeCookieHeader = setCookieHeaderSchema.parse(
        challengeSignIn.headers['set-cookie'],
      )
      const twoFactorCookieEntry = findSetCookie(challengeCookieHeader, 'two_factor')
      if (twoFactorCookieEntry === undefined) {
        throw new Error('two_factor çerezi bulunamadı')
      }
      const twoFactorCookiePair = toCookiePair(twoFactorCookieEntry)

      const attemptStatuses: number[] = []
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await request(httpServer())
          .post('/auth/two-factor/verify-totp')
          .set('Cookie', twoFactorCookiePair)
          .send({ code: '000000' })
        attemptStatuses.push(response.status)
        expect(response.status).toBe(401)
      }
      expect(attemptStatuses).toEqual([401, 401, 401, 401, 401])

      const sixth = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', twoFactorCookiePair)
        .send({ code: '000000' })

      expect(sixth.status).toBe(429)
      expect(errorBodySchema.parse(sixth.body).code).toBe('RATE_LIMIT_EXCEEDED')
    },
    30_000,
  )
})

describe("F1 (high) — /auth/two-factor/verify-totp: 2FA KURULUM ONAYI modu (OTURUM YOLU) — Better Auth'un hesap kilidi BU dalda HİÇ ÇALIŞMAZ", () => {
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
    'ASIL KANIT — "oturum yolundaki kilit boşluğu": `enable` SONRASI (henüz confirm EDİLMEMİŞ) ' +
      "NORMAL oturum çerezi İLE 5 YANLIŞ TOTP kodu (hepsi 401, Better Auth'un KENDİ kilidi bu " +
      "dalda `isSignIn===false` olduğu için HİÇ TETİKLENMEZ) → 6.'sı 429 (TELAFİ, `session_token` " +
      'çerezinin HAM değeri hesap kapsamı olarak kullanılır)',
    async () => {
      const email = uniqueEmail('f1-verify-totp-setup')
      await signUpAndVerify(httpServer(), email, TEST_PASSWORD)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD })
      const sessionCookiePair = toCookiePair(
        setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])[0] ?? '',
      )

      // `enable` — `verified:false` satırı oluşur, HENÜZ onaylanmadı.
      const enableResponse = await request(httpServer())
        .post('/auth/two-factor/enable')
        .set('Cookie', sessionCookiePair)
        .send({ password: TEST_PASSWORD, method: 'totp' })
      expect(enableResponse.status).toBe(200)
      totpUriSchema.parse(enableResponse.body)

      // RAPORA GİRER — NORMAL oturum çerezi İLE (challenge çerezi YOK) 5
      // YANLIŞ kod: `isSignIn = !session.session` BURADA `false`'tur (gerçek
      // bir oturum var) — Better Auth'un `assertTwoFactorNotLocked`/
      // `beginAttempt(5)`'i BU dalda HİÇ ÇAĞRILMAZ (`totp/index.mjs:148-153`,
      // ÖLÇÜLDÜ). Düzeltmeden ÖNCE bu döngü SINIRSIZ tekrarlanabilirdi.
      const attemptStatuses: number[] = []
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await request(httpServer())
          .post('/auth/two-factor/verify-totp')
          .set('Cookie', sessionCookiePair)
          .send({ code: '000000' })
        attemptStatuses.push(response.status)
        expect(response.status).toBe(401)
        expect(response.status).not.toBe(429)
      }
      expect(attemptStatuses).toEqual([401, 401, 401, 401, 401])

      // RAPORA GİRER — 6. deneme TELAFİ gatesi (`session_token` çerezinin HAM
      // değeri `account` kapsamı) tarafından 429 İLE KESİLİR.
      const sixth = await request(httpServer())
        .post('/auth/two-factor/verify-totp')
        .set('Cookie', sessionCookiePair)
        .send({ code: '000000' })

      expect(sixth.status).toBe(429)
      expect(sixth.headers['retry-after']).toBeDefined()
      expect(errorBodySchema.parse(sixth.body).code).toBe('RATE_LIMIT_EXCEEDED')
    },
    30_000,
  )
})

describe(
  "S2-1+N-1 (medium, security/solid tur3) — FIX turu 3: `session_token` ARTIK `two_factor`'DAN " +
    'ÖNCE kazanır — hesap kapsamı ARTIK saldırganca seçilebilir DEĞİL',
  () => {
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
      'ASIL KANIT — 2FA KURULUM ONAYI modunda (session_token VAR), SALDIRGAN HER istekte ' +
        "FARKLI/rastgele bir `two_factor` çerezi EKLESE BİLE hesap kapsamı session_token'dan " +
        "türetilir: 5×401 (HER SEFERİNDE YENİ rastgele two_factor) → 6.'sı 429 " +
        '(DÜZELTMEDEN ÖNCE bu döngü SINIRSIZ tekrarlanabilirdi — mutasyon kanıtı raporda)',
      async () => {
        const email = uniqueEmail('n1-session-wins-poisoning')
        await signUpAndVerify(httpServer(), email, TEST_PASSWORD)

        const signInResponse = await request(httpServer())
          .post('/auth/sign-in/email')
          .send({ email, password: TEST_PASSWORD })
        const sessionCookiePair = toCookiePair(
          setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])[0] ?? '',
        )

        const enableResponse = await request(httpServer())
          .post('/auth/two-factor/enable')
          .set('Cookie', sessionCookiePair)
          .send({ password: TEST_PASSWORD, method: 'totp' })
        expect(enableResponse.status).toBe(200)
        totpUriSchema.parse(enableResponse.body)

        // RAPORA GİRER (kanıt 1) — ham çıktı: HER denemede YENİ rastgele bir
        // `two_factor` çerezi EKLENİR (saldırganın "her istekte taze bir
        // hesap kovası aç" stratejisi); ARTIK 401 kalıyor, 429'A YÜRÜYOR.
        const attemptStatuses: number[] = []
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          const poisonedCookie = `${sessionCookiePair}; better-auth.two_factor=${randomUUID()}`
          const response = await request(httpServer())
            .post('/auth/two-factor/verify-totp')
            .set('Cookie', poisonedCookie)
            .send({ code: '000000' })
          attemptStatuses.push(response.status)
          expect(response.status).toBe(401)
          expect(response.status).not.toBe(429)
        }
        expect(attemptStatuses).toEqual([401, 401, 401, 401, 401])

        const sixth = await request(httpServer())
          .post('/auth/two-factor/verify-totp')
          .set('Cookie', `${sessionCookiePair}; better-auth.two_factor=${randomUUID()}`)
          .send({ code: '000000' })

        // RAPORA GİRER (kanıt 1) — ham çıktı.
        expect(sixth.status).toBe(429)
        expect(sixth.headers['retry-after']).toBeDefined()
        expect(errorBodySchema.parse(sixth.body).code).toBe('RATE_LIMIT_EXCEEDED')
      },
      30_000,
    )

    it(
      'MEŞRU AKIŞ BOZULMADI (kanıt 2, ZORUNLU hücre) — sign-in → 2FA challenge (oturum çerezi ' +
        'YOK, SADECE two_factor çerezi — eklenti onu `deleteSessionCookie`/`deleteSession` ile ' +
        'SİLER) → verify-totp DOĞRU kod → 200',
      async () => {
        const email = uniqueEmail('n1-legit-pre-login')
        await signUpAndVerify(httpServer(), email, TEST_PASSWORD)

        const firstSignIn = await request(httpServer())
          .post('/auth/sign-in/email')
          .send({ email, password: TEST_PASSWORD })
        const sessionCookiePair = toCookiePair(
          setCookieHeaderSchema.parse(firstSignIn.headers['set-cookie'])[0] ?? '',
        )

        const enableResponse = await request(httpServer())
          .post('/auth/two-factor/enable')
          .set('Cookie', sessionCookiePair)
          .send({ password: TEST_PASSWORD, method: 'totp' })
        const { totpURI } = totpUriSchema.parse(enableResponse.body)
        const base32Secret = extractBase32SecretFromTotpUri(totpURI)
        const confirmCode = await generateTotpCode({ base32Secret })
        await request(httpServer())
          .post('/auth/two-factor/verify-totp')
          .set('Cookie', sessionCookiePair)
          .send({ code: confirmCode })

        // YENİ sign-in → 2FA ZORUNLU → YENİ challenge. Bu yanıtta
        // `session_token` ADI GEÇEBİLİR AMA DEĞERİ BOŞTUR (SİLME talimatı,
        // `deleteSessionCookie(ctx, true)`, `better-auth/dist/plugins/
        // two-factor/index.mjs:290`, ÖLÇÜLDÜ — aşağıdaki assert'in gerekçesi)
        // — (a)'nın öncelik tersine çevirmesi bu akışı BOZMAZ.
        const challengeSignIn = await request(httpServer())
          .post('/auth/sign-in/email')
          .send({ email, password: TEST_PASSWORD })
        const challengeCookieHeader = setCookieHeaderSchema.parse(
          challengeSignIn.headers['set-cookie'],
        )

        // RAPORA GİRER (kanıt 2) — oturum çerezi bu yanıtta GEÇERLİ bir
        // DEĞERLE YOK. ⚠ ÖLÇÜLDÜ: `deleteSessionCookie(ctx, true)` BİR
        // `Set-Cookie: better-auth.session_token=; ...` (BOŞ DEĞER,
        // tarayıcıya "sil" talimatı) YAYINLAR — bu yüzden `entry.includes(
        // 'session_token=')` TEK BAŞINA YANLIŞ POZİTİF ÜRETİR (ilk yazımda
        // BÖYLE yazılmıştı, ÇALIŞTIRILIP YANLIŞ olduğu GÖRÜLDÜ). Asıl kanıt:
        // bu adla eşleşen `Set-Cookie` girdisi VARSA DEĞERİ BOŞTUR (silme) —
        // `extractTwoFactorVerifyAccountScope`'un `.length > 0` kontrolü bu
        // yüzden onu "yok" sayar, saldırgana KULLANILABİLİR bir değer
        // KALMAZ.
        const sessionTokenEntry = challengeCookieHeader.find((entry) =>
          entry.includes('session_token='),
        )
        if (sessionTokenEntry !== undefined) {
          const pair = toCookiePair(sessionTokenEntry)
          const value = pair.slice(pair.indexOf('=') + 1)
          expect(value).toBe('')
        }

        const twoFactorCookieEntry = findSetCookie(challengeCookieHeader, 'two_factor')
        if (twoFactorCookieEntry === undefined) {
          throw new Error('two_factor çerezi bulunamadı')
        }
        const twoFactorCookiePair = toCookiePair(twoFactorCookieEntry)

        const correctCode = await generateTotpCode({ base32Secret })
        const result = await request(httpServer())
          .post('/auth/two-factor/verify-totp')
          .set('Cookie', twoFactorCookiePair)
          .send({ code: correctCode })

        // RAPORA GİRER (kanıt 2, ZORUNLU) — ham çıktı.
        expect(result.status).toBe(200)
      },
      20_000,
    )
  },
)

// --- (5) Q-1 (qa gate, tur 1) — iki yeni rotanın (`POST /auth/sessions/revoke`, -
// `/revoke-all`) 429'u UÇTAN UCA hiçbir testte ölçülmüyordu (security gate
// tur1, F3; ROADMAP v0.0.15.1, T-017). Kablolama ÖNCESİ yalnızca YAPIM GEREĞİ
// kanıtlıydı (küresel `APP_GUARD` + `sensitive-operations.ts`'in (b) kapısı +
// `rate-limit-policy.test.ts`'in tablo pini) — GERÇEK bir HTTP 429'un bu iki
// rotada DOĞDUĞU hiçbir testte GÖZLENMEMİŞTİ. `F1 (high)` bloklarıyla
// (`/auth/two-factor/disable` vb.) AYNI desen: beş YANLIŞ parola denemesi
// (hepsi 400 `INVALID_PASSWORD`, `StepUpService`'in tek-biçimli sinyali —
// ADR-0019 §Karar 5), ALTINCI istek Redis sayacı (`sessionUserId` kapsamı,
// `rate-limit.policy.ts`'in bu iki rota için kayıtlı girdisi) 5 sınırını
// AŞTIĞI için 429 verir, `StepUpService`'e hiç ULAŞMAZ.
//
// VACUITY KANITI (qa, bu dosyada koşturulup kaldırıldı — raporda): her iki
// testte de 6. isteğin eşiğini `LOGIN_ACCOUNT_LIMIT`'in GEÇİCİ olarak 999'a
// çıkarılmasıyla yeniden koşturuldu → 6. istek 400'E DÜŞTÜ (429 DEĞİL),
// `expect(sixth.status).toBe(429)` KIRMIZI verdi — testin GERÇEKTEN eşiği
// ölçtüğünün kanıtı (geri alma `shasum -a 256` ile, rapora bkz).
// --------------------------------------------------------------------------

describe('Q-1 (qa) — /auth/sessions/revoke: 5 YANLIŞ parola denemesi 400, 6.sı 429 (sessionUserId kapsamı)', () => {
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
    'SÖMÜRÜ SENARYOSU: 5 YANLIŞ parola denemesi (hepsi 400 INVALID_PASSWORD, HİÇBİR oturum ' +
      'sonlanmaz), 6. deneme 429 — düzeltmeden ÖNCE bu uç hiçbir testte UÇTAN UCA ölçülmemişti ' +
      '(security gate tur1, F3)',
    async () => {
      const email = uniqueEmail('q1-revoke-oracle')
      await signUpAndVerify(httpServer(), email, TEST_PASSWORD)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD })
      const cookiePair = toCookiePair(
        setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])[0] ?? '',
      )

      // `sessionId` SAHİPLİK kontrolünden ÖNCE step-up'a ÇARPAR (ADR-0019
      // §Karar 4, auth-sessions.test.ts'in "SIRA KANITI"yla AYNI gerekçe) —
      // var olmayan/rastgele bir kimlik bu testin AMACI için YETERLİ (yanlış
      // parola her durumda 400'de biter, sahiplik kontrolüne hiç ULAŞMAZ).
      const attemptStatuses: number[] = []
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await request(httpServer())
          .post('/auth/sessions/revoke')
          .set('Cookie', cookiePair)
          .set('Origin', BASE_ENV.AUTH_BASE_URL)
          .send({ sessionId: `ses_${randomUUID()}`, password: 'yanlis-parola' })
        attemptStatuses.push(response.status)
        expect(response.status).toBe(400)
        expect(response.status).not.toBe(429)
      }
      expect(attemptStatuses).toEqual([400, 400, 400, 400, 400])

      const sixth = await request(httpServer())
        .post('/auth/sessions/revoke')
        .set('Cookie', cookiePair)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .send({ sessionId: `ses_${randomUUID()}`, password: 'yanlis-parola' })

      expect(sixth.status).toBe(429)
      expect(sixth.headers['retry-after']).toBeDefined()
      expect(errorBodySchema.parse(sixth.body).code).toBe('RATE_LIMIT_EXCEEDED')
    },
    20_000,
  )
})

describe('Q-1 (qa) — /auth/sessions/revoke-all: 5 YANLIŞ parola denemesi 400, 6.sı 429 (sessionUserId kapsamı, AYRI kova)', () => {
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
    'SÖMÜRÜ SENARYOSU: 5 YANLIŞ parola denemesi (hepsi 400 INVALID_PASSWORD, HİÇBİR oturum ' +
      'sonlanmaz), 6. deneme 429 — iki yeni rotanın İKİNCİSİ, AYRI eşik kovası ' +
      '(`routeKey` rotaya göre izole, `rate-limit.service.ts`)',
    async () => {
      const email = uniqueEmail('q1-revokeall-oracle')
      await signUpAndVerify(httpServer(), email, TEST_PASSWORD)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD })
      const cookiePair = toCookiePair(
        setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])[0] ?? '',
      )

      const attemptStatuses: number[] = []
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await request(httpServer())
          .post('/auth/sessions/revoke-all')
          .set('Cookie', cookiePair)
          .set('Origin', BASE_ENV.AUTH_BASE_URL)
          .send({ password: 'yanlis-parola' })
        attemptStatuses.push(response.status)
        expect(response.status).toBe(400)
        expect(response.status).not.toBe(429)
      }
      expect(attemptStatuses).toEqual([400, 400, 400, 400, 400])

      // İşlem HİÇBİR denemede TAMAMLANMADI — oturum HÂLÂ geçerli (AC5'in
      // "işlem tamamlanmaz" ölçütünün BU dosyadaki, oran-sınırı eksenindeki
      // tekrarı).
      const stillValid = await request(httpServer()).get('/auth/sessions').set('Cookie', cookiePair)
      expect(stillValid.status).toBe(200)

      const sixth = await request(httpServer())
        .post('/auth/sessions/revoke-all')
        .set('Cookie', cookiePair)
        .set('Origin', BASE_ENV.AUTH_BASE_URL)
        .send({ password: 'yanlis-parola' })

      expect(sixth.status).toBe(429)
      expect(sixth.headers['retry-after']).toBeDefined()
      expect(errorBodySchema.parse(sixth.body).code).toBe('RATE_LIMIT_EXCEEDED')
    },
    20_000,
  )
})
