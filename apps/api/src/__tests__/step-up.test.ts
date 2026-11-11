// @arkesoft/api — StepUpService + SENSITIVE_OPERATIONS testleri (ROADMAP
// v0.0.15.1, T-017/S5, ADR-0019 §Karar 4/6)
//
// Kapı (a)/(b) (`sensitive-operations.ts`'in modül YÜKLEME zamanı guard'ları)
// bu dosyanın HER testinde DOLAYLI olarak doğrulanır — import BAŞARISIZ
// olsaydı TÜM test dosyası hiç koşamadan çökerdi (`rate-limit-policy.test.ts`'in
// "modül HİÇ env'e dokunmadan içe aktarılabiliyor" dolaylı kanıt
// desemiyle AYNI disiplin). Kapı (b)'nin KENDİ ÖLÇÜMÜ ("ham çıktı: kesişim
// ∅") aşağıdaki İLK `describe` bloğunda AÇIKÇA tekrarlanır.
//
// `StepUpService.assertVerified()`'in A4 kanıtı (S8 handoff, architect
// "ölçülmüş bulgu"): gerçek `auth.api.verifyPassword` GERÇEKTEN çağıranın
// çerezinden session'ı türetip DOĞRU/YANLIŞ parolayı ayırt ediyor mu —
// `sessions.service.ts`'in `revokeOwnSession()` deseniyle (gerçek Postgres +
// Mailpit, `createTestApp()`) BİREBİR AYNI kurulum.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { Auth } from 'better-auth'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { AUTH_INSTANCE } from '../auth/auth.tokens.js'
import { resolveRateLimitPolicy } from '../auth/rate-limit/rate-limit.policy.js'
import { SENSITIVE_OPERATIONS } from '../auth/step-up/sensitive-operations.js'
import { StepUpService } from '../auth/step-up/step-up.service.js'
import { InvalidPasswordError } from '../errors/domain/invalid-password.error.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const PASSWORD = 'arkesoft-s5-stepup-password-123'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

describe('SENSITIVE_OPERATIONS — Kapı (b) ölçümü: kesişim RATE_LIMITED_ROUTES ile ∅', () => {
  it('katalogdaki ALTI işlemin HER BİRİ için resolveRateLimitPolicy TANIMLI bir politika döner (ham çıktı)', () => {
    const unprotected = Object.entries(SENSITIVE_OPERATIONS).filter(([, routeKey]) => {
      const spaceIndex = routeKey.indexOf(' ')
      const method = routeKey.slice(0, spaceIndex)
      const path = routeKey.slice(spaceIndex + 1)
      return resolveRateLimitPolicy(method, path) === undefined
    })

    // Ham çıktı — DoD §3'ün "kesişim ∅" kanıtı: korumasız kalan varsa burada
    // GÖRÜNÜR (boş dizi BEKLENİR).
    // eslint-disable-next-line no-console -- DoD'un istediği "ham çıktı" kanıtı, test logudur (üretim kodu DEĞİL)
    console.info('SENSITIVE_OPERATIONS ∖ RATE_LIMITED_ROUTES =', unprotected)

    expect(unprotected).toEqual([])
  })

  it('katalog TAM altı işlem taşır — yedinci işlem eklenince bu test KIRMIZI verir, inceleme görünürlüğünü zorlar', () => {
    expect(Object.keys(SENSITIVE_OPERATIONS)).toHaveLength(6)
  })
})

describe('StepUpService.assertVerified — A4 (gerçek Postgres + Mailpit + gerçek verifyPassword)', () => {
  let app: INestApplication<Server> | undefined
  let stepUpService: StepUpService | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    stepUpService = new StepUpService(app.get<Auth>(AUTH_INSTANCE))
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

  function service(): StepUpService {
    if (stepUpService === undefined) {
      throw new Error('StepUpService henüz kurulmadı')
    }
    return stepUpService
  }

  const setCookieHeaderSchema = z.array(z.string()).min(1)

  async function signUpVerifyAndSignIn(email: string): Promise<{ cookieHeader: string }> {
    await request(httpServer())
      .post('/auth/sign-up/email')
      .send({ name: 'S5 Step-Up Testi', email, password: PASSWORD })

    const delivered = await findLatestMailpitMessageTo(email)
    const token = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
    await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(token)}`)

    const signInResponse = await request(httpServer())
      .post('/auth/sign-in/email')
      .send({ email, password: PASSWORD })

    const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
    return { cookieHeader: cookies.join('; ') }
  }

  it('parola YOK/boş → InvalidPasswordError (auth.api.verifyPassword HİÇ çağrılmaz)', async () => {
    const email = uniqueEmail('s5-stepup-missing')
    await deleteAllMailpitMessages()
    const { cookieHeader } = await signUpVerifyAndSignIn(email)

    await expect(
      service().assertVerified('session.revoke', undefined, { cookie: cookieHeader }),
    ).rejects.toBeInstanceOf(InvalidPasswordError)

    await expect(
      service().assertVerified('session.revoke', '', { cookie: cookieHeader }),
    ).rejects.toBeInstanceOf(InvalidPasswordError)
  }, 30_000)

  it('YANLIŞ parola → gerçek auth.api.verifyPassword APIError fırlatır → InvalidPasswordError', async () => {
    const email = uniqueEmail('s5-stepup-wrong')
    await deleteAllMailpitMessages()
    const { cookieHeader } = await signUpVerifyAndSignIn(email)

    await expect(
      service().assertVerified('session.revoke', 'kesinlikle-yanlis-bir-parola', {
        cookie: cookieHeader,
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordError)
  }, 30_000)

  it('A4 — DOĞRU parola → gerçek auth.api.verifyPassword, sensitiveSessionMiddleware ÇAĞIRANIN çerezinden session türetir, assertVerified void döner (FIRLATMAZ)', async () => {
    const email = uniqueEmail('s5-stepup-correct')
    await deleteAllMailpitMessages()
    const { cookieHeader } = await signUpVerifyAndSignIn(email)

    await expect(
      service().assertVerified('session.revoke', PASSWORD, { cookie: cookieHeader }),
    ).resolves.toBeUndefined()
  }, 30_000)

  it('çerez YOK (sensitiveSessionMiddleware oturumu çözemez) → APIError → InvalidPasswordError (isAPIError daraltması)', async () => {
    await expect(service().assertVerified('session.revoke', PASSWORD, {})).rejects.toBeInstanceOf(
      InvalidPasswordError,
    )
  }, 30_000)
})
