// @arkesoft/api — AC9: WORKER sürecinin graceful shutdown'ı (ROADMAP v0.0.11,
// T-013/S7, architect K1.b/K1.c/K1.d)
//
// AC9: "Worker süreci SIGTERM aldığında devam eden işi bitirir, yeni iş almaz,
// Redis ve Postgres bağlantılarını kapatır, exit 0 verir — v0.0.4'ün AC11'i
// worker için de geçerli."
//
// ⚠⚠ NEDEN AYRI BİR TEST DOSYASI ve NEDEN GERÇEK OS SÜRECİ: v0.0.4'ün AC11'i
// ZATEN KAZANILMIŞ bir davranıştı; v0.0.11 API sürecine İKİNCİ bir Redis
// bağlantısı (`'queue'` profili) ve AYRI bir worker süreci ekliyor → bu bir
// REGRESYON KORUMASI. In-process bir taklit (Nest bağlamını testin içinde
// kurup `app.close()` çağırmak) AC9'un ÜÇ iddiasını ÖLÇEMEZ: süreç exit KODU,
// `worker.close()`'un `app.close()`'tan ÖNCE koştuğu kapanış ZİNCİRİ ve açık
// handle KALMADIĞI. Bu yüzden `dist/main.worker.js` GERÇEKTEN spawn edilir
// (`fixtures/shutdown-child.ts` → `startWorkerShutdownChild`).
//
// ⚠⚠ ÜÇ TUZAK — hepsi S6 tarafından GERÇEK süreçle ölçüldü ve bu dosya üçüne
// de karşı kuruldu:
//
//   (1) `CLIENT LIST`'te İKİ ad deseni var ve ikisinin SAHİBİ FARKLI:
//         `arkesoft-worker-<pid>`        → BİZİM ioredis örneğimiz,
//                                          `QueueLifecycleService` kapatır
//         `arkesoft:queue:<base64(ad)>`  → BullMQ'nun BLOKE EDEN kopyası,
//                                          `worker.close()` kapatır
//       Yalnızca ilkini aramak kapanışın YARISININ bozulmasını GÖRMEZDİ
//       (sızan kopya sayılmazdı → test YANLIŞ YEŞİL). "Tam olarak 1" ASSERT
//       EDİLMEZ (R-S3-3: bir worker birkaç bağlantı açabilir); `> 0` / `== 0`
//       ölçülür ve İKİ DESEN de ayrı ayrı aranır.
//
//   (2) ⚠ `pg_stat_activity > 0` şartı için SIGTERM'den ÖNCE GERÇEK BİR İŞ
//       koşmalı. S6'nın ölçümünde worker BOŞTA durduğu için Postgres'e HİÇ
//       dokunmadı → `$disconnect()` NO-OP olurdu ve "çıkış sonrası 0 satır"
//       iddiası HİÇBİR ŞEY kanıtlamazdı (AC11'in aynı tuzağı,
//       `shutdown.test.ts:141-147`). Bu yüzden sıra ZORUNLU:
//         hazır-ol → GERÇEK iş kuyruğa at → `completed` bekle →
//         `pg_stat_activity > 0` ölç → SIGTERM → exit 0 → 0 satır ölç
//
//   (3) ⚠ `WORKER_READY_LOG_EVENT` fixture'da IMPORT EDİLİR, metni YAZILMAZ
//       (bkz. fixture dosya başı yorumu).
//
// ⚠ BAĞLANTI SAYIMI KİMLİK (`id=`) TEMELLİ, salt ad temelli DEĞİL: spawn'dan
// ÖNCE bir `CLIENT LIST` anlık görüntüsü alınır ve çocuğa ait bağlantılar
// "yeni gelen ve iki desenden birine uyan" kümesi olarak belirlenir. Gerekçe:
// BullMQ'nun bloke eden kopyasının adı YALNIZCA önek + kuyruk adından türüyor
// (`utils/create-backend.js`) — pid TAŞIMIYOR, yani başka bir sürecin aynı
// kuyruk için açtığı kopya addan AYIRT EDİLEMEZ. (`apps/api`'nin
// `vitest.config.ts`'i `fileParallelism: false` taşıdığı için bugün bu durum
// oluşmuyor; ölçüm yine de o varsayıma DAYANMIYOR.)

import type { Server } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'

import type { INestApplication } from '@nestjs/common'
import { createPrismaClient, DEMO_SEED, JobStatus } from '@arkesoft/db'
import type { PrismaDatabase } from '@arkesoft/db'
import { Queue, Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createRootLogger } from '../logging/root-logger.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { TENANT_PROVISION_JOB } from '../queue/job-registry.js'
import { QUEUE_KEY_PREFIX } from '../queue/queue-constants.js'
import {
  QUEUE_CLOSED_LOG_EVENT,
  WORKER_SHUTDOWN_COMPLETED_LOG_EVENT,
  WORKER_SHUTDOWN_STARTED_LOG_EVENT,
} from '../queue/queue-log-events.js'
import { createQueueRedisConnection } from '../queue/queue.module.js'
import { QueueService } from '../queue/queue.service.js'
import type { JobQueueRegistry } from '../queue/queue.service.js'
import { JOB_QUEUE_REGISTRY, QUEUE_CONNECTION } from '../queue/queue.tokens.js'
import { buildQueueConnectionName } from '../redis/create-redis-connection.js'
import {
  buildApiForShutdownTest,
  startWorkerShutdownChild,
  withApplicationName,
  WORKER_SHUTDOWN_CHILD_APPLICATION_NAME,
} from './fixtures/shutdown-child.js'
import type { WorkerLogRecord, WorkerShutdownChildHandle } from './fixtures/shutdown-child.js'
import { assertQueueCapableRedis } from './helpers/assert-queue-capable-redis.js'
import { createTestApp } from './helpers/create-test-app.js'

/** `beforeAll`'un `tsc` derlemesi + spawn + iş + kapanışı kapsayan bütçesi (ms). */
const AC9_TEST_TIMEOUT_MS = 90_000

/** `Job` satırının terminal duruma geçmesi için üst sınır (ms). */
const TERMINAL_WAIT_TIMEOUT_MS = 20_000

/** Yoklama aralığı (ms). */
const POLL_INTERVAL_MS = 25

/**
 * BullMQ'nun BLOKE EDEN kopyasının ad öneki. ⚠ Ad YALNIZCA kuyruk önekinden ve
 * kuyruk adının base64'ünden türetilir (`bullmq/utils/create-backend.js`) —
 * sürecin pid'ini TAŞIMAZ. Bu yüzden bu desen `id` temelli delta ile birlikte
 * kullanılır (dosya başı yorumu).
 */
const BULLMQ_BLOCKING_CLIENT_NAME_PREFIX = `${QUEUE_KEY_PREFIX}:`

/**
 * `CLIENT LIST` yanıtı tek bir metindir (satır başına bir istemci). Dış
 * dünyadan gelen veri → Zod ile parse edilir, `as` KULLANILMAZ.
 */
const clientListReplySchema = z.string()

/** `CLIENT LIST` satırından ölçüme giren iki alan. */
type RedisClientEntry = {
  /** Redis'in istemciye verdiği kimlik — ad çakışmalarını ayırt eden TEK alan. */
  readonly id: string
  /** `CLIENT SETNAME` ile atanmış ad; atanmamışsa boş dize. */
  readonly name: string
}

function parseClientListLine(line: string): RedisClientEntry {
  const fields = new Map<string, string>(
    line.split(' ').map((field) => {
      const separatorIndex = field.indexOf('=')

      return [field.slice(0, separatorIndex), field.slice(separatorIndex + 1)] as const
    }),
  )

  const id = fields.get('id')
  const name = fields.get('name')

  if (id === undefined || name === undefined) {
    throw new Error(`CLIENT LIST satırında id/name alanı yok — ölçüm yapılamaz: ${line}`)
  }

  return { id, name }
}

/**
 * Bağlı Redis istemcilerini okur. ⚠ Yalnızca OKUR — hiçbir istemci
 * kapatılmaz, hiçbir yapılandırma yazılmaz.
 */
async function readRedisClients(connection: Redis): Promise<readonly RedisClientEntry[]> {
  const reply = clientListReplySchema.parse(await connection.call('CLIENT', 'LIST'))

  return reply
    .split('\n')
    .filter((line) => line.length > 0)
    .map(parseClientListLine)
}

/**
 * `pg_stat_activity` TENANT TABLOSU DEĞİL, Postgres'in platform seviyesi
 * sistem görünümüdür ve bu gözlem SADECE kapanış testlerinde yapılır —
 * `$queryRaw` kullanımı CLAUDE.md §4'ün "ham prisma çağrısı yalnızca platform
 * seviyesi tablolarda, gerekçe yorumuyla" istisnası kapsamında (R-P5,
 * `shutdown.test.ts:78-95` emsali). Hiçbir `tenant_id` taşıyan tablo
 * hedeflenmiyor.
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

async function waitFor(
  predicate: () => Promise<boolean>,
  describeFailure: () => string,
  timeoutMs = TERMINAL_WAIT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await predicate()) {
      return
    }

    await delay(POLL_INTERVAL_MS)
  }

  throw new Error(`koşul ${String(timeoutMs)}ms içinde sağlanmadı — ${describeFailure()}`)
}

describe('AC9 — worker süreci SIGTERM sonrası graceful kapanıyor (GERÇEK OS süreci)', () => {
  let app: INestApplication<Server> | undefined
  let adminDb: PrismaDatabase | undefined
  let prismaService: PrismaService
  let queueService: QueueService
  let registry: JobQueueRegistry
  let connection: Redis
  let tenantId = ''

  /** Ölçümler — kapanış sırası ve satır durumu AYRI `it`'lerde assert edilir. */
  let childHandle: WorkerShutdownChildHandle | undefined
  let enqueuedJobId = ''

  /**
   * Kapanış kayıtlarını OKUR. ⚠ Bilerek bir ANLIK GÖRÜNTÜ DEĞİL, canlı okuma:
   * ana `it` SIGTERM'den önce düşerse (ör. bir mutasyon ölçümünde) bu `it` de
   * "kayıt hiç yok" diye kaskat başarısız olurdu ve gerçek sebep görünmezdi.
   */
  const shutdownLogRecords = (): readonly WorkerLogRecord[] => childHandle?.logRecords() ?? []

  beforeAll(async () => {
    // Çocuk süreç DERLENMİŞ `dist/main.worker.js`'i koşar; test KENDİ
    // tazeliğini garanti eder (`buildApiForShutdownTest` dosya başı yorumu).
    buildApiForShutdownTest()

    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    queueService = app.get(QueueService)
    registry = app.get<JobQueueRegistry>(JOB_QUEUE_REGISTRY)
    connection = app.get<Redis>(QUEUE_CONNECTION)

    // ⚠ AC10 KAPISI — İLK ÖLÇÜM. Yanlış Redis'te buradan İLERİ GİDİLMEZ.
    await assertQueueCapableRedis(connection)

    // Temiz başlangıç: önceki koşumların artığı worker'a "gerçek iş" gibi
    // görünür (R-S5-2).
    for (const entry of registry.values()) {
      await entry.queue.obliterate({ force: true })
      await entry.dlqQueue.obliterate({ force: true })
    }

    const tenant = await prismaService.db.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })
    expect(tenant).not.toBeNull()
    tenantId = tenant?.id ?? ''

    const baseDatabaseUrl = process.env['DATABASE_URL']
    if (baseDatabaseUrl === undefined) {
      throw new Error('DATABASE_URL tanımlı değil')
    }
    adminDb = createPrismaClient({ databaseUrl: baseDatabaseUrl })
  }, AC9_TEST_TIMEOUT_MS)

  afterAll(async () => {
    // Çocuk süreç her koşulda sonlanmış olmalı (testin ortasında düşmüşse de).
    const child = childHandle?.child
    if (child?.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }

    if (tenantId !== '' && enqueuedJobId !== '') {
      const jobId = enqueuedJobId
      await prismaService.withTenant(tenantId, (tx) => tx.job.deleteMany({ where: { id: jobId } }))
    }

    for (const entry of registry.values()) {
      await entry.queue.obliterate({ force: true })
      await entry.dlqQueue.obliterate({ force: true })
    }

    if (adminDb !== undefined) {
      await adminDb.$disconnect()
    }

    if (app !== undefined) {
      await app.close()
    }
  }, AC9_TEST_TIMEOUT_MS)

  it(
    'iş koştuktan sonra SIGTERM: exit 0, Redis bağlantıları (İKİ ad deseni) ve Postgres bağlantısı KAPANIYOR',
    async () => {
      if (adminDb === undefined) {
        throw new Error('adminDb kurulmadı')
      }

      // ADIM 0 — spawn'dan ÖNCEKİ anlık görüntü: çocuğa ait bağlantılar
      // "yeni gelen" kümesinden türetilecek (dosya başı yorumu).
      const clientsBeforeSpawn = await readRedisClients(connection)
      const clientIdsBeforeSpawn = new Set(clientsBeforeSpawn.map((entry) => entry.id))

      // ADIM 1 — GERÇEK OS süreci.
      const handle = startWorkerShutdownChild()
      childHandle = handle

      const childPid = handle.child.pid
      if (childPid === undefined) {
        throw new Error(`worker çocuk süreci başlatılamadı — stderr: ${handle.stderrText()}`)
      }

      // ADIM 2 — hazır-olma: HTTP DEĞİL, stdout NDJSON (worker port açmaz).
      const readyRecord = await handle.waitUntilWorkerReady()

      expect(readyRecord.pid).toBe(childPid)
      expect(readyRecord.queueNames).toEqual([TENANT_PROVISION_JOB.name])
      expect(readyRecord.concurrency).toEqual([TENANT_PROVISION_JOB.concurrency])

      // ADIM 3 — ÇOCUĞA AİT Redis bağlantıları, İKİ AD DESENİ ayrı ayrı.
      const ownConnectionName = buildQueueConnectionName(childPid)
      const clientsAfterReady = await readRedisClients(connection)
      const childOwnedClients = clientsAfterReady.filter(
        (entry) =>
          !clientIdsBeforeSpawn.has(entry.id) &&
          (entry.name === ownConnectionName ||
            entry.name.startsWith(BULLMQ_BLOCKING_CLIENT_NAME_PREFIX)),
      )

      // Desen A — BİZİM ioredis örneğimiz (`QueueLifecycleService` kapatır).
      const ownNamedBefore = childOwnedClients.filter((entry) => entry.name === ownConnectionName)
      // Desen B — BullMQ'nun bloke eden KOPYASI (`worker.close()` kapatır).
      // ⚠ Bu deseni ölçmemek kapanışın YARISININ bozulmasını görmezdi.
      const blockingNamedBefore = childOwnedClients.filter((entry) =>
        entry.name.startsWith(BULLMQ_BLOCKING_CLIENT_NAME_PREFIX),
      )

      // ⚠ "Tam olarak 1" ASSERT EDİLMEZ (R-S3-3) — `> 0` ölçülür.
      expect(ownNamedBefore.length).toBeGreaterThan(0)
      expect(blockingNamedBefore.length).toBeGreaterThan(0)

      // ADIM 4 — ⚠ GERÇEK İŞ. Bu olmadan worker Postgres'e HİÇ dokunmaz ve
      // "çıkış sonrası 0 satır" iddiası HİÇBİR ŞEY kanıtlamaz (tuzak 2).
      const { jobId } = await queueService.enqueue(TENANT_PROVISION_JOB, { tenantId })
      enqueuedJobId = jobId

      await waitFor(
        async () => {
          const rows = await prismaService.withTenant(tenantId, (tx) =>
            tx.job.findMany({ where: { id: jobId }, select: { status: true } }),
          )

          return rows[0]?.status === JobStatus.completed
        },
        () =>
          `iş ${jobId} terminal olmadı — görülen msg: ${handle
            .logRecords()
            .map((record) => record.msg)
            .join(' | ')} · stderr: ${handle.stderrText()}`,
      )

      // ADIM 5 — Postgres bağlantısı GERÇEKTEN açıldı mı (SIGTERM'den ÖNCE)?
      const pgConnectionsBeforeShutdown = await countPgStatActivityConnections(
        adminDb,
        WORKER_SHUTDOWN_CHILD_APPLICATION_NAME,
      )
      expect(pgConnectionsBeforeShutdown).toBeGreaterThan(0)

      // ADIM 6 — SIGTERM → exit 0.
      handle.child.kill('SIGTERM')
      const result = await handle.exited

      if (result.code !== 0) {
        throw new Error(
          `worker çocuk süreci exit 0 DEĞİL — code=${String(result.code)} signal=${String(result.signal)} stderr=${handle.stderrText()}`,
        )
      }
      expect(result.code).toBe(0)

      // ADIM 7 — çıkış sonrası ölçümler, EK BEKLEME OLMADAN.
      const clientsAfterExit = await readRedisClients(connection)
      const childClientIds = new Set(childOwnedClients.map((entry) => entry.id))

      expect(clientsAfterExit.filter((entry) => childClientIds.has(entry.id))).toEqual([])
      expect(clientsAfterExit.filter((entry) => entry.name === ownConnectionName)).toEqual([])
      expect(
        clientsAfterExit.filter((entry) =>
          entry.name.startsWith(BULLMQ_BLOCKING_CLIENT_NAME_PREFIX),
        ),
      ).toEqual([])

      const pgConnectionsAfterShutdown = await countPgStatActivityConnections(
        adminDb,
        WORKER_SHUTDOWN_CHILD_APPLICATION_NAME,
      )
      expect(pgConnectionsAfterShutdown).toBe(0)

      // stdout'un son chunk'ları `exit`'ten SONRA gelebilir — kapanış
      // kayıtlarını assert eden `it`'ler bunu bekler.
      await handle.stdoutClosed
    },
    AC9_TEST_TIMEOUT_MS,
  )

  it('kapanış zinciri SIRAYLA loglandı: başladı → kuyruk kapatıldı → tamamlandı (K1.b)', () => {
    const records = shutdownLogRecords()
    const messages = records.map((record) => record.msg)

    const startedIndex = messages.indexOf(WORKER_SHUTDOWN_STARTED_LOG_EVENT)
    const queueClosedIndex = messages.indexOf(QUEUE_CLOSED_LOG_EVENT)
    const completedIndex = messages.indexOf(WORKER_SHUTDOWN_COMPLETED_LOG_EVENT)

    expect(startedIndex).toBeGreaterThanOrEqual(0)
    expect(queueClosedIndex).toBeGreaterThan(startedIndex)
    expect(completedIndex).toBeGreaterThan(queueClosedIndex)

    // Kapanış TEK SEFER koştu (`shutdownPromise` ile korunuyor, S6).
    expect(messages.filter((msg) => msg === WORKER_SHUTDOWN_STARTED_LOG_EVENT)).toHaveLength(1)
    expect(messages.filter((msg) => msg === WORKER_SHUTDOWN_COMPLETED_LOG_EVENT)).toHaveLength(1)

    // Zorla kapanışa DÜŞÜLMEDİ: normal yolda `worker.close()` bütçesi dolmaz
    // ve watchdog hiç tetiklenmez (K1.b'nin bağlayıcı ilişkisi).
    const startRecord = records[startedIndex]
    expect(startRecord?.signal).toBe('SIGTERM')
  })

  it('worker stdout’u YALNIZCA yapılandırılmış JSON üretti (CLAUDE.md §4)', () => {
    expect(childHandle?.malformedStdoutLines()).toEqual([])
  })

  it('devam eden iş BİTİRİLDİ: `Job` satırı `completed`, `progress` 100 (AC9’un "devam eden işi bitirir")', async () => {
    const rows = await prismaService.withTenant(tenantId, (tx) =>
      tx.job.findMany({ where: { id: enqueuedJobId } }),
    )
    const row = rows[0]

    expect(row?.status).toBe(JobStatus.completed)
    expect(row?.progress).toBe(100)
    expect(row?.completedAt).not.toBeNull()
    expect(row?.error).toBeNull()
  })

  it('kuyrukta askıda iş KALMADI (artık bırakmama, DoD m)', async () => {
    const entry = registry.get(TENANT_PROVISION_JOB.name)

    expect(await entry?.queue.getWaitingCount()).toBe(0)
    expect(await entry?.queue.getActiveCount()).toBe(0)
    expect(await entry?.queue.getFailedCount()).toBe(0)
    expect(await entry?.dlqQueue.getWaitingCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// ⚠⚠ AC9'UN "POSTGRES BAĞLANTISINI KAPATIR" YARISI — SÜREÇ ÖLÜMÜNDEN AYRILMIŞ
//
// ÖLÇÜLDÜ (S7, mutasyon M4): çocuk süreçteki `pg_stat_activity == 0` iddiası
// `PrismaService.onModuleDestroy()`'un `$disconnect()` çağrısı KALDIRILDIĞINDA
// DA sağlanıyor — `lint 0`, `typecheck 0`, YUKARIDAKİ BLOK YEŞİL. Sebep
// yapısal: süreç öldüğünde Postgres backend'i zaten düşer, yani "çıkış sonrası
// 0 satır" ölçümü TEMİZ KAPANIŞI ile SÜREÇ ÖLÜMÜNÜ AYIRT EDEMEZ. ⚠ Bu boşluk
// v0.0.4'ün AC11'inden DEVRALINDI (`shutdown.test.ts:161-165` aynı yapıya
// sahip); S7 onu ÖLÇTÜ ve AŞAĞIDAKİ BLOKLA KAPATTI.
//
// AYIRMA MEKANİZMASI: ölçüm SÜRECİN İÇİNDE yapılır. Süreç CANLI kalır, hiçbir
// sinyal gönderilmez → `application_name` satırını `pg_stat_activity`'den
// düşüren TEK şey `PrismaService.onModuleDestroy()`'un KENDİSİdir. Kanca
// no-op'a çevrilirse bu blok KIRMIZI verir (ölçüldü).
//
// ⚠ `application_name` HER İKİ kapanış testinden de FARKLI
// (`arkesoft-api-ac11` · `arkesoft-worker-ac9` · `arkesoft-worker-ac9-hook`) →
// üç ölçüm birbirinin bağlantısını saymaz.
// ---------------------------------------------------------------------------

/** Bu bloğun `pg_stat_activity` adı — AC11'in ve AC9 çocuk sürecinin adlarıyla ÇAKIŞMAZ. */
const PRISMA_HOOK_APPLICATION_NAME = 'arkesoft-worker-ac9-hook'

describe('AC9 — Postgres bağlantısını KAPANIŞ KANCASI kapatıyor (süreç ölümü DEĞİL)', () => {
  let adminDb: PrismaDatabase | undefined
  let scopedClient: PrismaDatabase | undefined
  let prismaService: PrismaService | undefined

  beforeAll(() => {
    const baseDatabaseUrl = process.env['DATABASE_URL']
    if (baseDatabaseUrl === undefined) {
      throw new Error('DATABASE_URL tanımlı değil')
    }

    adminDb = createPrismaClient({ databaseUrl: baseDatabaseUrl })
    scopedClient = createPrismaClient({
      databaseUrl: withApplicationName(baseDatabaseUrl, PRISMA_HOOK_APPLICATION_NAME),
    })
    // ÜRETİM SINIFI, üretim kancası — taklit YOK. Kurucusu yalnızca istemci ve
    // logger alır; Nest konteynerine gerek YOK.
    prismaService = new PrismaService(scopedClient, createRootLogger({ level: 'silent' }))
  })

  afterAll(async () => {
    // Kanca testte zaten çağrıldı; ikinci `$disconnect()` NO-OP'tur ve blok
    // testin ortasında düştüyse artık bağlantı bırakmamayı garanti eder.
    if (scopedClient !== undefined) {
      await scopedClient.$disconnect()
    }

    if (adminDb !== undefined) {
      await adminDb.$disconnect()
    }
  })

  it('kanca ÖNCESİ bağlantı AÇIK, kanca SONRASI 0 satır — süreç CANLI kalıyor', async () => {
    if (adminDb === undefined || prismaService === undefined) {
      throw new Error('ölçüm kurulmadı')
    }

    // Eager `$connect()` YOK (K-A3) → bağlantı ancak İLK sorguda kurulur.
    // `connectionProbe` `/health/ready`'nin de kullandığı tek üyeli erişimci;
    // hiçbir kiracı tablosuna dokunulmaz (platform seviyesi sabit sorgu).
    await prismaService.connectionProbe.$queryRaw`SELECT 1`

    const before = await countPgStatActivityConnections(adminDb, PRISMA_HOOK_APPLICATION_NAME)
    expect(before).toBeGreaterThan(0)

    await prismaService.onModuleDestroy()

    const after = await countPgStatActivityConnections(adminDb, PRISMA_HOOK_APPLICATION_NAME)
    expect(after).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// A-A3'ÜN ÖLÇÜMÜ — K1.c'nin DAYANDIĞI VARSAYIM
//
// K1.c tablosu `worker.close()`'un devam eden işi BEKLEDİĞİNİ, `close(true)`'un
// ise işi YARIDA BIRAKTIĞINI varsayıyor (`Job.status` `running` KALIR, `failed`
// YAZILMAZ). Bu bir KÜTÜPHANE SEMANTİĞİ iddiasıdır; varsayım olarak
// bırakılırsa `WORKER_CLOSE_TIMEOUT_MS < WORKER_SHUTDOWN_WATCHDOG_MS`
// ilişkisinin ANLAMI ölçülmemiş kalır. Burada bullmq@6.5.0 üzerinde FİİLEN
// ölçülüyor.
//
// ⚠ PROB KUYRUĞU: iş adı `JOB_DEFINITIONS`'a GİRMEZ ve üretim kuyruk adlarıyla
// ÇAKIŞMAZ → üretim topolojisine, üretim handler'ına ve `Job` tablosuna HİÇ
// dokunulmaz. Ölçülen şey bizim kodumuz değil, BullMQ'nun `close()`
// semantiğidir; bu yüzden prob doğrudan `new Worker(...)` ile kurulur.
// ---------------------------------------------------------------------------

/** Prob iş/kuyruk adı — üretim kuyruk adlarıyla ÇAKIŞMAZ. */
const CLOSE_PROBE_QUEUE_NAME = 'test.ac9-close-probe'

/** Prob handler'ının sürdüğü süre (ms) — `close()`'un beklediğini görünür kılar. */
const CLOSE_PROBE_HANDLER_DURATION_MS = 600

/** Handler'ın GERÇEKTEN başlamasını bekleme bütçesi (ms). */
const CLOSE_PROBE_START_TIMEOUT_MS = 10_000

type CloseProbeTimeline = {
  handlerStartedAt: number
  handlerFinishedAt: number | undefined
  closeResolvedAt: number | undefined
}

describe('A-A3 ölçümü — `worker.close()` devam eden işi BEKLER, `close(true)` BIRAKIR', () => {
  let probeConnection: Redis | undefined
  let probeQueue: Queue<Record<string, never>, void> | undefined

  beforeAll(async () => {
    const redisUrl = process.env['REDIS_URL']
    if (redisUrl === undefined) {
      throw new Error('REDIS_URL tanımlı değil')
    }

    // Üretim fabrikası (`'queue'` profili) — seçenekler burada YENİDEN
    // YAZILMAZ, aksi hâlde ölçüm üretimden farklı bir istemciyi ölçerdi.
    probeConnection = createQueueRedisConnection(
      { REDIS_URL: redisUrl },
      createRootLogger({ level: 'silent' }),
    )

    // ⚠ AC10 KAPISI — kuyruk kullanan her entegrasyon testinin İLK ölçümü.
    await assertQueueCapableRedis(probeConnection)

    probeQueue = new Queue(CLOSE_PROBE_QUEUE_NAME, {
      connection: probeConnection,
      prefix: QUEUE_KEY_PREFIX,
    })
    await probeQueue.obliterate({ force: true })
  }, AC9_TEST_TIMEOUT_MS)

  afterAll(async () => {
    if (probeQueue !== undefined) {
      await probeQueue.obliterate({ force: true })
      await probeQueue.close()
    }

    if (probeConnection !== undefined) {
      await probeConnection.quit()
    }
  }, AC9_TEST_TIMEOUT_MS)

  /**
   * Prob worker'ını kurar, bir iş atar, handler GERÇEKTEN başlayana kadar
   * bekler ve ardından `close(force)` çağırıp zaman çizelgesini döner.
   */
  async function measureClose(force: boolean): Promise<CloseProbeTimeline> {
    if (probeQueue === undefined || probeConnection === undefined) {
      throw new Error('prob kuyruğu kurulmadı')
    }

    const timeline: CloseProbeTimeline = {
      handlerStartedAt: 0,
      handlerFinishedAt: undefined,
      closeResolvedAt: undefined,
    }

    const worker = new Worker<Record<string, never>, void>(
      CLOSE_PROBE_QUEUE_NAME,
      async () => {
        timeline.handlerStartedAt = Date.now()
        await delay(CLOSE_PROBE_HANDLER_DURATION_MS)
        timeline.handlerFinishedAt = Date.now()
      },
      { connection: probeConnection, prefix: QUEUE_KEY_PREFIX, concurrency: 1 },
    )

    try {
      await worker.waitUntilReady()
      await probeQueue.add(CLOSE_PROBE_QUEUE_NAME, {}, { attempts: 1 })

      await waitFor(
        () => Promise.resolve(timeline.handlerStartedAt > 0),
        () => 'prob handler hiç başlamadı',
        CLOSE_PROBE_START_TIMEOUT_MS,
      )

      await worker.close(force)
      timeline.closeResolvedAt = Date.now()
    } finally {
      // Handler hâlâ koşuyorsa (zorla kapanış yolu) bitmesini BEKLE — aksi
      // hâlde zamanlayıcı test bittikten sonra ateşlenir.
      if (timeline.handlerFinishedAt === undefined) {
        await delay(CLOSE_PROBE_HANDLER_DURATION_MS * 2)
      }
      await worker.close(true)
    }

    return timeline
  }

  it(
    '`worker.close()` (graceful): devam eden handler BİTENE KADAR dönmüyor',
    async () => {
      const timeline = await measureClose(false)

      expect(timeline.handlerFinishedAt).not.toBeUndefined()
      expect(timeline.closeResolvedAt).not.toBeUndefined()
      expect(timeline.closeResolvedAt ?? 0).toBeGreaterThanOrEqual(timeline.handlerFinishedAt ?? 0)
      // En az handler süresi kadar bekledi — "anında döndü" olasılığı dışlanıyor.
      expect((timeline.closeResolvedAt ?? 0) - timeline.handlerStartedAt).toBeGreaterThanOrEqual(
        CLOSE_PROBE_HANDLER_DURATION_MS,
      )
    },
    AC9_TEST_TIMEOUT_MS,
  )

  it(
    '`worker.close(true)` (zorla): handler BİTMEDEN dönüyor — iş YARIDA kalır (K1.c)',
    async () => {
      const timeline = await measureClose(true)

      // `close(true)` çözüldüğü ANDA handler henüz bitmemişti.
      expect(timeline.closeResolvedAt).not.toBeUndefined()
      expect((timeline.closeResolvedAt ?? 0) - timeline.handlerStartedAt).toBeLessThan(
        CLOSE_PROBE_HANDLER_DURATION_MS,
      )
    },
    AC9_TEST_TIMEOUT_MS,
  )
})
