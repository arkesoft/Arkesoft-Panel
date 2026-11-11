// @arkesoft/api — SessionListReadPortAdapter.listOwnSessions() birim testi
// (ROADMAP v0.0.15.1, T-017/S9, architect "TASARIM" bölümü)
//
// `SessionSecurityReadPortAdapter`'ın test dosyasının (`session-security-
// read-port-adapter.test.ts`) AYNI deseni: gerçek DI-kurulu adaptör, gerçek
// Postgres, `createTestApp()` üzerinden. ⚠ BU adaptör `SessionsService`'e
// DELEGE EDER (dosya başı yorumu, `session-list-read.port.adapter.ts`) —
// bu yüzden bu test `PrismaService.db`'nin KAPSAMADIĞI `session` tablosunu
// doğrudan sorgulamaz, çağıranın KENDİ `sessionId`'sini `/trpc/session.me`
// üzerinden (zaten kiracıdan muaf, kimlik ZORUNLU uç) okur.
//
// Kapsar:
//   (A) DÖNÜŞÜM — `updatedAt` → `lastSeenAt`, `Date` → ISO-8601 dize, bu
//       oturumun KENDİSİ `isCurrent: true` taşır.
//   (B) `ipAddress`/`browserFamily`/`osFamily` tel sözleşmesine UYGUN tip
//       (adaptör BU alanları DEĞİŞTİRMEZ, sadece taşır).
//   (C) SAHİPLİK — çağıranın `userId`'si BAŞKA bir kullanıcının oturumunu
//       GÖRMEZ (çapraz kullanıcı sızıntısı yok).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { createTrpcClient } from '@arkesoft/trpc'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SessionListReadPortAdapter } from '../trpc/ports/session-list-read.port.adapter.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

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

const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const BROWSER_FAMILIES = [
  'chrome',
  'firefox',
  'safari',
  'edge',
  'opera',
  'samsung',
  'other',
  'unknown',
]
const OS_FAMILIES = ['windows', 'macos', 'linux', 'ios', 'android', 'other', 'unknown']

describe('SessionListReadPortAdapter.listOwnSessions() (ROADMAP v0.0.15.1, T-017/S9)', () => {
  let app: INestApplication<Server> | undefined
  let adapter: SessionListReadPortAdapter
  let baseUrl: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    adapter = app.get(SessionListReadPortAdapter)
    baseUrl = await listen(app.getHttpServer())
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  /** `trpc-http.test.ts`'in AYNI yardımcısı — `app`'in BU NOKTADA kurulu olduğunu garantiler. */
  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  async function resolveSessionId(cookieHeader: string): Promise<string> {
    const client = createTrpcClient({
      url: `${baseUrl}/trpc`,
      headers: () => ({ cookie: cookieHeader }),
    })
    const identity = await client.session.me.query()
    return identity.sessionId
  }

  it('DÖNÜŞÜM — lastSeenAt/createdAt/expiresAt ISO-8601, isCurrent true, tel tipine uygun', async () => {
    const session = await createAuthenticatedSession(httpServer())
    const sessionId = await resolveSessionId(session.cookieHeader)

    const result = await adapter.listOwnSessions(session.userId, sessionId)

    expect(result).toHaveLength(1)
    const [row] = result
    if (row === undefined) {
      throw new Error('beklenmedik şekilde boş dizi')
    }

    expect(row.id).toBe(sessionId)
    expect(row.isCurrent).toBe(true)
    expect(row.lastSeenAt).toMatch(ISO_8601_PATTERN)
    expect(row.createdAt).toMatch(ISO_8601_PATTERN)
    expect(row.expiresAt).toMatch(ISO_8601_PATTERN)
    expect(BROWSER_FAMILIES).toContain(row.browserFamily)
    expect(OS_FAMILIES).toContain(row.osFamily)
    // M-2 düzeltmesi (solid gate turu 1) — ÖNCEKİ assert
    // (`row.ipAddress === null || typeof row.ipAddress === 'string'`)
    // TOTOLOJİYDİ: tip ZATEN `string | null`, hiçbir girdi için KIRMIZI
    // VEREMEZDİ. Bu test `AUTH_TRUSTED_PROXY_COUNT` override ETMEZ ve
    // `X-Forwarded-For` GÖNDERMEZ → `client-ip.ts`'in varsayılan (`0`)
    // davranışı SOKET adresine düşer — GERÇEK bir değer assert'i: ne boş
    // dize sentinel'i (`''`) ne `null` kalır, Node'un IPv4/IPv6 soket
    // gösteriminin ÜÇ bilinen loopback biçiminden (ÖLÇÜLDÜ, bu ortamda
    // `::ffff:127.0.0.1`; `session-ip-and-last-seen.test.ts:149-150`'nin
    // dışladığı `127.0.0.1`/`::1` ile BİRLİKTE) biridir.
    expect(row.ipAddress).not.toBeNull()
    expect(row.ipAddress).not.toBe('')
    expect(['127.0.0.1', '::1', '::ffff:127.0.0.1']).toContain(row.ipAddress)
  })

  it(
    'SAHİPLİK — çağıranın KENDİ oturumu BAŞKA bir kullanıcının ' +
      'listesinde GÖRÜNMEZ (çapraz kullanıcı sızıntısı yok)',
    async () => {
      const sessionA = await createAuthenticatedSession(httpServer())
      const sessionB = await createAuthenticatedSession(httpServer())
      const sessionIdA = await resolveSessionId(sessionA.cookieHeader)
      const sessionIdB = await resolveSessionId(sessionB.cookieHeader)

      const resultA = await adapter.listOwnSessions(sessionA.userId, sessionIdA)
      const resultB = await adapter.listOwnSessions(sessionB.userId, sessionIdB)

      expect(resultA.map((row) => row.id)).not.toContain(sessionIdB)
      expect(resultB.map((row) => row.id)).not.toContain(sessionIdA)
    },
  )

  it(
    "PORT TOTAL'dır, FIRLATMAZ — var olmayan kullanıcı kimliği için " +
      'AppError İCAT ETMEDEN boş dizi döner',
    async () => {
      await expect(
        adapter.listOwnSessions(`nonexistent-${randomUUID()}`, `nonexistent-${randomUUID()}`),
      ).resolves.toEqual([])
    },
  )
})
