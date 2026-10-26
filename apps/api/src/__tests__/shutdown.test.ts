// @arkesoft/api — AC11 kapanış testi (ROADMAP v0.0.4, T-002/ST-7, architect
// K-A3/K-A8, R-P5)
//
// Gerçek bir OS alt sürecinde `dist/main.js` başlatılır (bkz.
// `fixtures/shutdown-child.ts`), DB'ye giden bir istek atılır (eager
// `$connect()` YOK — K-A3, bağlantı ancak BURADA kurulur), SIGTERM gönderilir;
// exit kodu VE `pg_stat_activity`'deki satır sayısı DOĞRULANIR (K-A8'in
// deterministik ölçümü).

import { setTimeout as delay } from 'node:timers/promises'

import { createPrismaClient } from '@arkesoft/db'
import type { PrismaDatabase } from '@arkesoft/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  buildApiForShutdownTest,
  SHUTDOWN_CHILD_APPLICATION_NAME,
  SHUTDOWN_CHILD_PORT,
  startShutdownChild,
} from './fixtures/shutdown-child.js'

const READY_TIMEOUT_MS = 20_000
const READY_POLL_INTERVAL_MS = 150
const SHUTDOWN_TEST_TIMEOUT_MS = 40_000

async function waitUntilReady(url: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch (error) {
      lastError = error
    }
    await delay(READY_POLL_INTERVAL_MS)
  }

  throw new Error(
    `waitUntilReady: ${url} ${String(READY_TIMEOUT_MS)}ms içinde hazır olmadı — son hata: ${String(lastError)}`,
  )
}

/**
 * `pg_stat_activity` TENANT TABLOSU DEĞİL, Postgres'in platform seviyesi
 * sistem görünümüdür ve bu gözlem SADECE bu testte yapılır — `$queryRaw`
 * kullanımı CLAUDE.md §4'ün "ham prisma çağrısı yalnızca platform seviyesi
 * tablolarda, gerekçe yorumuyla" istisnası kapsamında (R-P5). Hiçbir
 * `tenant_id` taşıyan tablo hedeflenmiyor.
 */
async function countPgStatActivityConnections(
  db: PrismaDatabase,
  applicationName: string,
): Promise<number> {
  const rows = await db.$queryRaw<{ readonly count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM pg_stat_activity
    WHERE application_name = ${applicationName}
  `
  return Number(rows[0]?.count ?? 0n)
}

describe('AC11 — SIGTERM sonrası graceful shutdown (deterministik ölçüm, K-A8)', () => {
  let adminDb: PrismaDatabase | undefined

  beforeAll(() => {
    buildApiForShutdownTest()

    const baseUrl = process.env['DATABASE_URL']
    if (baseUrl === undefined) {
      throw new Error('DATABASE_URL tanımlı değil')
    }
    adminDb = createPrismaClient({ databaseUrl: baseUrl })
  }, SHUTDOWN_TEST_TIMEOUT_MS)

  afterAll(async () => {
    if (adminDb !== undefined) {
      await adminDb.$disconnect()
    }
  })

  it(
    'exit 0 ile kapanır VE pg_stat_activity bu bağlantı için 0 satıra düşer',
    async () => {
      if (adminDb === undefined) {
        throw new Error('adminDb kurulmadı')
      }

      const { child, exited } = startShutdownChild()
      const stderrChunks: Buffer[] = []
      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk)
      })

      try {
        await waitUntilReady(`http://127.0.0.1:${String(SHUTDOWN_CHILD_PORT)}/health`)

        // DB'ye giden EN AZ bir istek — eager `$connect()` YOK (K-A3),
        // bağlantı ancak bu istekten SONRA kurulur.
        const readyResponse = await fetch(
          `http://127.0.0.1:${String(SHUTDOWN_CHILD_PORT)}/health/ready`,
        )
        expect(readyResponse.status).toBe(200)

        // Bağlantının GERÇEKTEN kurulduğunu (SIGTERM'den ÖNCE) doğrula —
        // aksi hâlde "0 satır" sonucu anlamsız olurdu ($disconnect() no-op olurdu).
        const connectionsBeforeShutdown = await countPgStatActivityConnections(
          adminDb,
          SHUTDOWN_CHILD_APPLICATION_NAME,
        )
        expect(connectionsBeforeShutdown).toBeGreaterThan(0)

        child.kill('SIGTERM')

        const result = await exited

        if (result.code !== 0) {
          throw new Error(
            `çocuk süreç exit 0 DEĞİL — code=${String(result.code)} signal=${String(result.signal)} stderr=${Buffer.concat(stderrChunks).toString('utf-8')}`,
          )
        }

        expect(result.code).toBe(0)

        const connectionsAfterShutdown = await countPgStatActivityConnections(
          adminDb,
          SHUTDOWN_CHILD_APPLICATION_NAME,
        )
        expect(connectionsAfterShutdown).toBe(0)
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
        }
      }
    },
    SHUTDOWN_TEST_TIMEOUT_MS,
  )
})
