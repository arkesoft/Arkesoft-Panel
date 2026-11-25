// @arkesoft/api — RateLimitGuard büyük/küçük harf regresyonu (ROADMAP
// v0.0.20, T-021 FIX turu 3, security tur2 F2-TUR2, `medium`)
//
// CANLI ÖLÇÜM (security tur2 §2(b)): aynı oturum, aynı gövde (`{}`) ile
// `/auth/sessions/revoke` · `/AUTH/sessions/revoke` · `/Auth/Sessions/Revoke`
// ÜÇ birebir aynı POST atıldı — ÜÇÜ DE gerçek işleyiciye ULAŞTI (400
// `VALIDATION_ERROR`, gövde şeması çalıştı) ama Redis sayacı (`platform:
// auth:post-auth-sessions-revoke:ip:*`) **1**'DE KALDI — iki istek
// TAMAMEN ÖLÇÜLMEDİ. Kök neden `resolveRateLimitPolicy`'nin case-variant
// URL'ler için `undefined` dönmesiydi (`rate-limit.policy.ts` dosya başı
// GÜNCELLEME yorumu) — `RateLimitGuard.canActivate` `policy === undefined`
// ise `RateLimitService.checkAndIncrement`'i HİÇ ÇAĞIRMADAN `true` döner
// (`rate-limit.guard.ts:212-216`) — Redis'e DOKUNMAZ.
//
// Bu dosya `rate-limit.test.ts`'in KENDİ "(1) BİRİM" seviyesini (mock
// `RateLimitService`, Redis YOK) kullanır — `checkAndIncrement`'in
// ÇAĞRILMASI (veya ÇAĞRILMAMASI) canlı Redis sayacının artıp artmadığının
// BİREBİR, deterministik, CI-güvenli vekilidir: `RateLimitGuard` gerçek
// `resolveRateLimitPolicy`'yi (mock'lanmadı) req.method/req.url ile
// doğrudan çağırır (`rate-limit.guard.ts:212`) — test burada GERÇEK
// üretim fonksiyonunu egzersiz eder, sahte bir politika İNCELEMEZ.

import type { ExecutionContext } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { RateLimitGuard } from '../auth/rate-limit/rate-limit.guard.js'
import type {
  RateLimitService,
  RateLimitCheckResult,
} from '../auth/rate-limit/rate-limit.service.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { requestContextStorage } from '../request-context/request-context.storage.js'
import type { RequestContext } from '../request-context/request-context.types.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const REQUEST_ID = 'req_test00000000000000000t021f3'

type FakeRequest = {
  readonly method: string
  readonly url: string
  readonly body: unknown
  readonly headers: Record<string, string>
  readonly socket: { readonly remoteAddress: string }
}

function fakeExecutionContext(req: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
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

function buildAuthenticatedStore(): RequestContext {
  return {
    requestId: REQUEST_ID,
    receivedAt: Date.now(),
    logger: pino({ level: 'silent' }),
    tenant: { kind: 'exempt' },
    auth: { kind: 'authenticated', userId: 'usr_t021f3', sessionId: 'ses_t021f3' },
    client: { ip: null, userAgent: null },
    // ROADMAP v0.0.17, T-028/S4 EKLEMESİ (additive): ZORUNLU alan, `client`
    // İLE AYNI gerekçe — bu dosyanın konusuyla ilgisiz, sabit değer yeterli.
    traceId: 'test-trace-id-rate-limit-guard-case',
  }
}

describe('RateLimitGuard — /auth/sessions/revoke büyük/küçük harf regresyonu (F2-TUR2)', () => {
  it.each([
    ['POST', '/auth/sessions/revoke'],
    ['POST', '/AUTH/sessions/revoke'],
    ['POST', '/Auth/Sessions/Revoke'],
  ])(
    '%s %s → sayaç ARTAR (checkAndIncrement İKİ KEZ çağrılır — IP + hesap)',
    async (method, url) => {
      const checkAndIncrement = vi
        .fn()
        .mockResolvedValue({ exceeded: false, retryAfterSeconds: 900 })
      const service = buildFakeRateLimitService(checkAndIncrement)
      const guard = new RateLimitGuard(service, BASE_ENV)

      const req: FakeRequest = {
        method,
        url,
        body: {},
        headers: {},
        socket: { remoteAddress: '203.0.113.50' },
      }

      await expect(
        requestContextStorage.run(buildAuthenticatedStore(), () =>
          guard.canActivate(fakeExecutionContext(req)),
        ),
      ).resolves.toBe(true)

      // DÜZELTMEDEN ÖNCE: policy === undefined ⇒ checkAndIncrement HİÇ
      // ÇAĞRILMAZDI (0 çağrı, Redis sayacı 1'de KALIRDI — canlı kanıt,
      // dosya başı yorumu). DÜZELTMEDEN SONRA: HER ÜÇ varyant için de İKİ
      // çağrı (IP + hesap kapsamı) — sayaç GERÇEKTEN artar.
      expect(checkAndIncrement).toHaveBeenCalledTimes(2)
    },
  )

  // Vacuous DEĞİL — `AUTH_DELEGATED_PATHS`'in (Better Auth delege yüzeyi,
  // security tur2 §2(c)'nin SAĞLAM bulduğu, BİLEREK dokunulmayan yüzey)
  // bir case varyantı BU fallback'e GİRMEMELİ.
  it('POST /Auth/Sign-In/Email (own-path DEĞİL) → policy undefined, checkAndIncrement ÇAĞRILMAZ', async () => {
    const checkAndIncrement = vi.fn().mockResolvedValue({ exceeded: false, retryAfterSeconds: 900 })
    const service = buildFakeRateLimitService(checkAndIncrement)
    const guard = new RateLimitGuard(service, BASE_ENV)

    const req: FakeRequest = {
      method: 'POST',
      url: '/Auth/Sign-In/Email',
      body: { email: 'x@arkesoft.test', password: 'x' },
      headers: {},
      socket: { remoteAddress: '203.0.113.50' },
    }

    await expect(
      requestContextStorage.run(buildAuthenticatedStore(), () =>
        guard.canActivate(fakeExecutionContext(req)),
      ),
    ).resolves.toBe(true)
    expect(checkAndIncrement).not.toHaveBeenCalled()
  })
})
