// @arkesoft/api — IP yazımı + "son görülme" çözünürlüğü testleri (ROADMAP
// v0.0.15.1, T-017/S6)
//
// İKİ AC'yi KAPSAR:
//
// (A) IP YAZIMI — `auth-instance.ts`'in `databaseHooks.session.create.before`'u
//     `RequestContext.client.ip`'i Better Auth'un KENDİ `disableIpTracking`
//     ürettiği `''`'nin ÜZERİNE yazar. ⚠ DOD'un E riski: `127.0.0.1` geri
//     düşüşü KABUL EDİLMEZ — bu dosya `AUTH_TRUSTED_PROXY_COUNT: 1` override'ı
//     + GERÇEK bir `X-Forwarded-For` başlığıyla, LOOPBACK OLMAYAN bir IP'yi
//     AÇIKÇA bir başlıktan SÜRER (`client-ip.ts`'in hop-sayısı algoritması,
//     ÖLÇÜLDÜ: `trustedProxyCount=1`, tek hop'luk XFF → o hop AYNEN okunur).
//
// (B) AC8 — "son görülme" (`lastSeenAt = Session.updatedAt`) `updateAge`
//     penceresinden (`SESSION_LAST_SEEN_RESOLUTION_SECONDS`, 300s) DAHA SIK
//     İLERLEMEZ. Gerçek 300s BEKLEMEK YERİNE (yavaş, kırılgan) DB satırı
//     DOĞRUDAN manipüle edilir — Better Auth'un KENDİ ÖLÇÜLMÜŞ formülü
//     (`expiresAt − expiresIn·1000 + updateAge·1000 ≤ now`, `auth-instance.ts`'in
//     `SESSION_LAST_SEEN_RESOLUTION_SECONDS` yorumu) `expiresAt`'i geriye
//     kaydırarak "pencere geçti" durumunu DETERMİNİSTİK üretir; session HENÜZ
//     GERÇEKTEN SÜRESİ DOLMAMIŞ olur (yalnızca `updateAge` kadar "eski"),
//     `session.mjs:155`'in erken "süresi dolmuş → sil" dalına DÜŞMEZ.
//
// SONDA (RAPORA GİRER): `SESSION_LAST_SEEN_RESOLUTION_SECONDS`'ı geçici
// olarak değiştirip (ör. `0`) bu testin (B) NEGATİF kolunun KIRMIZIYA
// düştüğünü doğrulamak MUTASYON KANITI — bu dosyada DEĞİL, Task raporunda
// (`shasum` ile geri alma kanıtlı) elle koşulur; kalıcı kod DEĞİŞTİRİLMEZ.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import { parseEnv } from '@arkesoft/config/env'
import { createPrismaClient } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  resolveSessionIpAddressForCreateHook,
  SESSION_LAST_SEEN_RESOLUTION_SECONDS,
} from '../auth/auth-instance.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const PASSWORD = 'arkesoft-s6-ip-last-seen-password-123'

/** TEST-NET-3 (RFC 5737) — gerçek bir rotalanabilir blok DEĞİL, LOOPBACK da DEĞİL. */
const FORWARDED_TEST_IP = '203.0.113.77'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}@arkesoft.test`
}

const signInUserSchema = z.object({ user: z.object({ id: z.string() }) })
const setCookieHeaderSchema = z.array(z.string()).min(1)

const sessionSummarySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
  isCurrent: z.boolean(),
})
const sessionSummaryListSchema = z.array(sessionSummarySchema)

describe("resolveSessionIpAddressForCreateHook — birim (karar: null → null, ASLA '')", () => {
  it('null (UNKNOWN_IP sentinel eşlemesi) → null döner', () => {
    expect(resolveSessionIpAddressForCreateHook(null)).toBeNull()
  })

  it('gerçek bir IP dizesi → BİREBİR KOPYA döner (dönüştürülmez/kırpılmaz)', () => {
    expect(resolveSessionIpAddressForCreateHook(FORWARDED_TEST_IP)).toBe(FORWARDED_TEST_IP)
  })
})

// --- (A) IP YAZIMI — gerçek HTTP + gerçek Postgres -------------------------
describe("IP yazımı — session.create.before gerçek HTTP akışında RequestContext.client.ip'i yazar", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined
  let authRolePrisma: ReturnType<typeof createPrismaClient>

  beforeAll(async () => {
    // AUTH_TRUSTED_PROXY_COUNT: 1 — `client-ip.ts`'in hop-sayısı algoritması
    // (dosya başı yorumu): tek-hop'luk `X-Forwarded-For` AYNEN istemci IP'si
    // sayılır. Varsayılan (`0`) ile bu test YAZILAMAZDI — soket adresine
    // (loopback) düşerdi, DOD'un AÇIKÇA YASAKLADIĞI senaryo.
    const testApp = await createTestApp({
      apiEnv: { ...BASE_ENV, AUTH_TRUSTED_PROXY_COUNT: 1 },
    })
    app = testApp.app
    authRolePrisma = createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_AUTH_URL })
  }, 60_000)

  afterAll(async () => {
    await authRolePrisma.$disconnect()
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
    "X-Forwarded-For ile giriş → session.ip_address GERÇEK istemci IP'sine BİREBİR eşit " +
      '(127.0.0.1 geri düşüşü DEĞİL)',
    async () => {
      const email = uniqueEmail('s6-ip')

      await request(httpServer())
        .post('/auth/sign-up/email')
        .send({ name: 'S6 IP Testi', email, password: PASSWORD })

      const delivered = await findLatestMailpitMessageTo(email)
      const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
      await request(httpServer()).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

      const signInResponse = await request(httpServer())
        .post('/auth/sign-in/email')
        .set('X-Forwarded-For', FORWARDED_TEST_IP)
        .send({ email, password: PASSWORD })

      expect(signInResponse.status).toBeGreaterThanOrEqual(200)
      expect(signInResponse.status).toBeLessThan(300)
      const userId = signInUserSchema.parse(signInResponse.body).user.id

      const sessionRows = await authRolePrisma.session.findMany({ where: { userId } })
      expect(sessionRows).toHaveLength(1)
      const sessionRow = sessionRows[0]
      if (sessionRow === undefined) {
        throw new Error('beklenen tek session satırı yok')
      }

      // ASIL İDDİA: yazılan değer GERÇEK istemci IP'si — ne Better Auth'un
      // `disableIpTracking` ürettiği `''`, ne de loopback geri düşüşü
      // (`127.0.0.1`/`::1`).
      expect(sessionRow.ipAddress).toBe(FORWARDED_TEST_IP)
      expect(sessionRow.ipAddress).not.toBe('')
      expect(sessionRow.ipAddress).not.toBe('127.0.0.1')
      expect(sessionRow.ipAddress).not.toBe('::1')
    },
    20_000,
  )
})

// --- (B) AC8 — "son görülme" ÇÖZÜNÜRLÜĞÜ -----------------------------------
describe('AC8 — son görülme (lastSeenAt = Session.updatedAt) updateAge penceresinden SIK İLERLEMEZ', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>['app'] | undefined
  let authRolePrisma: ReturnType<typeof createPrismaClient>

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    authRolePrisma = createPrismaClient({ databaseUrl: BASE_ENV.DATABASE_AUTH_URL })
  }, 60_000)

  afterAll(async () => {
    await authRolePrisma.$disconnect()
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

  /** Kayıt → doğrulama → giriş; çerez + userId döner. Bu dosyaya ÖZGÜ (yerel kopya — `auth-fixture.ts`'in AYNI örüntüsü, ama `PASSWORD` bu dosyanın sabiti). */
  async function signUpVerifyAndSignIn(
    server: Server,
  ): Promise<{ readonly cookieHeader: string; readonly userId: string }> {
    const email = uniqueEmail('s6-ac8')

    await request(server)
      .post('/auth/sign-up/email')
      .send({ name: 'S6 AC8 Testi', email, password: PASSWORD })

    const delivered = await findLatestMailpitMessageTo(email)
    const verifyToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
    await request(server).get(`/auth/verify-email?token=${encodeURIComponent(verifyToken)}`)

    const signInResponse = await request(server)
      .post('/auth/sign-in/email')
      .send({ email, password: PASSWORD })

    const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])
    const userId = signInUserSchema.parse(signInResponse.body).user.id

    return { cookieHeader: cookies.join('; '), userId }
  }

  /** `GET /auth/sessions` çağırır — bu uç `AuthContextMiddleware` üzerinden `auth.api.getSession()`'ı TETİKLER (middleware seviyesi, kimlik doğrulaması İÇİN), bu da Better Auth'un KENDİ `updateAge` yenileme mantığını (varsa) ÇALIŞTIRIR. */
  async function callProtectedSessionsEndpoint(
    server: Server,
    cookieHeader: string,
  ): Promise<readonly z.infer<typeof sessionSummarySchema>[]> {
    const response = await request(server).get('/auth/sessions').set('Cookie', cookieHeader)
    expect(response.status).toBe(200)
    return sessionSummaryListSchema.parse(response.body)
  }

  it('pencere İÇİNDE (iki ardışık istek, aradan geçen süre ≪ 300s) → updatedAt DEĞİŞMEZ (yazma YOK)', async () => {
    const { cookieHeader } = await signUpVerifyAndSignIn(httpServer())

    const first = await callProtectedSessionsEndpoint(httpServer(), cookieHeader)
    expect(first).toHaveLength(1)
    const firstRow = first[0]
    if (firstRow === undefined) {
      throw new Error('beklenen tek oturum satırı yok')
    }

    const second = await callProtectedSessionsEndpoint(httpServer(), cookieHeader)
    expect(second).toHaveLength(1)
    const secondRow = second[0]
    if (secondRow === undefined) {
      throw new Error('beklenen tek oturum satırı yok')
    }

    // Aynı `userId`/`id`, AYNI `updatedAt` — pencere içinde İKİNCİ bir
    // yazma OLMADI.
    expect(secondRow.id).toBe(firstRow.id)
    expect(secondRow.updatedAt).toBe(firstRow.updatedAt)
  }, 20_000)

  it(
    'pencere DIŞINDA (DB satırı `SESSION_LAST_SEEN_RESOLUTION_SECONDS`+1 kadar "eskitilir") → ' +
      'updatedAt İLERLER + expiresAt YENİLENİR (tek bir sonraki istekte, EN FAZLA BİR UPDATE)',
    async () => {
      const { cookieHeader } = await signUpVerifyAndSignIn(httpServer())

      const before = await callProtectedSessionsEndpoint(httpServer(), cookieHeader)
      expect(before).toHaveLength(1)
      const beforeRow = before[0]
      if (beforeRow === undefined) {
        throw new Error('beklenen tek oturum satırı yok')
      }

      // DB'yi DOĞRUDAN "eskitiriz" — `expiresAt`'i `updateAge+1` saniye
      // GERİYE kaydırmak, Better Auth'un KENDİ ÖLÇÜLMÜŞ formülünü
      // (`expiresAt − expiresIn·1000 + updateAge·1000 ≤ now`) KOŞULSUZ TRUE
      // yapar — session HENÜZ GERÇEKTEN süresi DOLMAMIŞ kalır (`expiresIn`
      // 7 gün, `updateAge+1` yalnızca 301 saniye — `session.mjs:155`'in
      // erken "süresi dolmuş" dalına DÜŞMEZ).
      const agedExpiresAt = new Date(
        new Date(beforeRow.expiresAt).getTime() - (SESSION_LAST_SEEN_RESOLUTION_SECONDS + 1) * 1000,
      )
      await authRolePrisma.session.update({
        where: { id: beforeRow.id },
        data: { expiresAt: agedExpiresAt },
      })

      const after = await callProtectedSessionsEndpoint(httpServer(), cookieHeader)
      expect(after).toHaveLength(1)
      const afterRow = after[0]
      if (afterRow === undefined) {
        throw new Error('beklenen tek oturum satırı yok')
      }

      expect(afterRow.id).toBe(beforeRow.id)
      // ASIL İDDİA — pencere AŞILDIĞINDA yazma GERÇEKLEŞTİ: `updatedAt`
      // İLERLEDİ VE `expiresAt` manipüle edilen (geçmişe kaydırılmış)
      // değerden DAHA İLERİYE yenilendi (Better Auth `now + expiresIn` ile
      // SIFIRLAR).
      expect(new Date(afterRow.updatedAt).getTime()).toBeGreaterThan(
        new Date(beforeRow.updatedAt).getTime(),
      )
      expect(new Date(afterRow.expiresAt).getTime()).toBeGreaterThan(agedExpiresAt.getTime())
    },
    20_000,
  )
})
