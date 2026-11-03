// @arkesoft/api — `JobReadPortAdapter` birim/entegrasyon testleri
// (ROADMAP v0.0.11, T-013/S8, architect "tRPC SÖZLEŞMESİ" — AC8 + `perf`
// ikamesi)
//
// `trpc-storefront-tenant-read-port-adapter.test.ts`'in (T-009/S7) AYNI
// deseni: gerçek DI-kurulu adaptörü, gerçek Postgres üzerinde DOĞRUDAN
// çağırır (tam HTTP turu olmadan). Çapraz KİRACI vakaları BURADA DEĞİL,
// `trpc-cross-tenant.isolation.test.ts`'te (`pnpm test:isolation`) —
// `tenant-membership.isolation.test.ts`/`trpc-cross-tenant.isolation.test.ts`
// ayrımının aynısı.
//
// Dört öbek:
//   (A) `job.get` eşlemesi — tel şekli, ISO zaman dizeleri, hata kolonunun
//       İKİ alana inmesi, tele çıkmayan iki alanın YOKLUĞU.
//   (B) `job.get` yokluk yolu — `JobNotFoundError`, `publicDetails` BOŞ.
//   (C) `job.list` — sıralama, keyset sayfalama, durum filtresi, imleç
//       yokluğu/geçersizliği.
//   (D) ⚠ `perf` İKAMESİ (architect devretti, `perf` gate'i bu sürümde
//       KOŞMUYOR — başka kimse ölçmüyor):
//         ÖLÇÜM 1: `limit: 51` SÖZLEŞMEDE reddedilir; istek resolver'a (ve
//                  dolayısıyla porta) HİÇ ULAŞMAZ. Vacuous olmadığının
//                  kanıtı: `limit: 50` AYNI yolda KABUL edilir.
//         ÖLÇÜM 2: `job.list`'in Prisma argümanlarının şekli, uygulanan
//                  migration'daki `(tenant_id, status, created_at DESC)`
//                  indeks tanımıyla UYUMLU. İki taraf da OKUNUR: argümanlar
//                  adaptörün KENDİ sabitlerinden/fonksiyonundan, indeks
//                  tanımı diskteki migration SQL'inden. (Canlı katalogdaki
//                  indeksin VARLIĞI ayrıca `packages/db`'nin katalog
//                  linter'ında, T-013/S2, ölçülüyor — bu dosya onu
//                  TEKRARLAMAZ, sorgu ŞEKLİ ile DDL arasındaki uyumu ölçer.)
//
// Temizlik: her vaka kendi kiracısını `finally` içinde siler; `Job.tenant`
// ilişkisi `onDelete: Cascade` olduğu için iş satırları da gider (ADR-0003
// madde 3'ün aynı gerekçesi). Bu dosya Redis'e DOKUNMAZ.

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { INestApplication } from '@nestjs/common'
import { JobStatus, TenantStatus } from '@arkesoft/db'
import { isAppError } from '@arkesoft/errors'
import { jobListInputSchema } from '@arkesoft/trpc'
import { createTrpcRequestHandler } from '@arkesoft/trpc/server'
import type { JobReadPort, TrpcContext } from '@arkesoft/trpc/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { PrismaService } from '../prisma/prisma.service.js'
import {
  JOB_LIST_ORDER_BY,
  JOB_ROW_SELECT,
  JobReadPortAdapter,
  buildJobListQueryArgs,
} from '../trpc/ports/job-read.port.adapter.js'
import { createTestApp } from './helpers/create-test-app.js'

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

/** `job` tablosunun bileşik indeksini tanımlayan, UYGULANMIŞ migration dosyası. */
const JOB_MIGRATION_SQL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/db/prisma/migrations/20261103131017_job_table/migration.sql',
)

describe('JobReadPortAdapter (ROADMAP v0.0.11, T-013/S8)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let adapter: JobReadPortAdapter

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    adapter = app.get(JobReadPortAdapter)
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  async function createTenant(prefix: string): Promise<{ id: string; slug: string }> {
    const slug = uniqueSlug(prefix)
    const tenant = await prismaService.db.tenant.create({
      data: { slug, name: `S8 ${prefix} kiracısı`, status: TenantStatus.active },
    })

    return { id: tenant.id, slug: tenant.slug }
  }

  // -------------------------------------------------------------------------
  // (A) `job.get` eşlemesi
  // -------------------------------------------------------------------------

  it('job.get — kuyruğa alınmış iş TAM OLARAK dokuz alanlı tel şeklini döner (ISO dizeleri, Date YOK)', async () => {
    const tenant = await createTenant('job-get-shape')

    try {
      const createdAt = new Date('2026-11-03T09:00:00.000Z')
      const jobId = await prismaService.withTenant(tenant.id, async (tx) => {
        const row = await tx.job.create({
          data: {
            tenantId: tenant.id,
            type: 'tenant.provision',
            payload: { tenantId: tenant.id },
            createdAt,
            updatedAt: createdAt,
          },
          select: { id: true },
        })

        return row.id
      })

      const summary = await adapter.findJob(tenant.id, jobId)

      expect(Object.keys(summary).sort()).toEqual([
        'completedAt',
        'createdAt',
        'error',
        'id',
        'progress',
        'startedAt',
        'status',
        'type',
        'updatedAt',
      ])
      expect(summary).toEqual({
        id: jobId,
        type: 'tenant.provision',
        status: 'queued',
        progress: 0,
        error: null,
        createdAt: '2026-11-03T09:00:00.000Z',
        updatedAt: '2026-11-03T09:00:00.000Z',
        startedAt: null,
        completedAt: null,
      })
      // `Date` TELE ÇIKMAZ (`trpc.ts`'in "transformer YOK" değişmezi).
      expect(typeof summary.createdAt).toBe('string')

      // ⚠ K7 — tele çıkmayan iki alan: işin kuyruk girdisi ve kiracı kimliği.
      // Anahtar kümesi assert'i bunu ZATEN kapatıyor; bayt düzeyinde de
      // kontrol edilir (kiracı kimliği bir DEĞER olarak da geçmemeli).
      const rawSummary = JSON.stringify(summary)
      expect(rawSummary).not.toContain(tenant.id)
      expect(rawSummary).not.toContain(tenant.slug)
    } finally {
      await prismaService.db.tenant.delete({ where: { id: tenant.id } })
    }
  })

  it('job.get — başarısız işin hata kolonu DÖRT alandan İKİSİNE iner (details/requestId tele KOYULMAZ)', async () => {
    const tenant = await createTenant('job-get-error')

    try {
      const jobId = await prismaService.withTenant(tenant.id, async (tx) => {
        const row = await tx.job.create({
          data: {
            tenantId: tenant.id,
            type: 'tenant.provision',
            payload: { tenantId: tenant.id },
            status: JobStatus.failed,
            // `job-runner.ts`'in `toJsonErrorBody`'sinin yazdığı DÖRT alanlı
            // gövdenin birebir taklidi (`appErrorBodySchema` şekli).
            error: {
              code: 'DEPENDENCY_UNAVAILABLE',
              message: 'errors.dependency.unavailable',
              details: { dependency: 'redis' },
              requestId: 'job_internal_correlation_id',
            },
          },
          select: { id: true },
        })

        return row.id
      })

      const summary = await adapter.findJob(tenant.id, jobId)

      expect(summary.status).toBe('failed')
      expect(summary.error).toEqual({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'errors.dependency.unavailable',
      })
      expect(Object.keys(summary.error ?? {}).sort()).toEqual(['code', 'message'])

      // Bayt düzeyinde: tele koyulmayan iki alanın DEĞERLERİ de geçmez.
      const rawSummary = JSON.stringify(summary)
      expect(rawSummary).not.toContain('job_internal_correlation_id')
      expect(rawSummary).not.toContain('redis')
    } finally {
      await prismaService.db.tenant.delete({ where: { id: tenant.id } })
    }
  })

  // -------------------------------------------------------------------------
  // (B) `job.get` yokluk yolu
  // -------------------------------------------------------------------------

  it('job.get — var olmayan jobId için JobNotFoundError FIRLATIR (null DÖNMEZ, port TOTAL) ve publicDetails BOŞ', async () => {
    const tenant = await createTenant('job-get-missing')

    try {
      let caught: unknown
      try {
        await adapter.findJob(tenant.id, `job_${randomUUID().replaceAll('-', '')}`)
        throw new Error('beklenen JobNotFoundError fırlatılmadı')
      } catch (error) {
        caught = error
      }

      if (!isAppError(caught)) {
        throw new Error(`beklenen AppError değil: ${String(caught)}`)
      }

      expect(caught.code).toBe('JOB_NOT_FOUND')
      expect(caught.httpStatus).toBe(404)
      expect(caught.userMessageKey).toBe('errors.job.notFound')
      // §7 madde 12: gövde hiçbir tanımlayıcı taşımaz → "yok" ile "yabancı"
      // arasında fark ÜRETİLEMEZ.
      expect(caught.publicDetails).toEqual({})
    } finally {
      await prismaService.db.tenant.delete({ where: { id: tenant.id } })
    }
  })

  // -------------------------------------------------------------------------
  // (C) `job.list`
  // -------------------------------------------------------------------------

  it('job.list — (createdAt DESC, id DESC) sırası, keyset sayfalama ve durum filtresi', async () => {
    const tenant = await createTenant('job-list')

    try {
      const baseTime = Date.parse('2026-11-03T10:00:00.000Z')
      const createdIds = await prismaService.withTenant(tenant.id, async (tx) => {
        const ids: string[] = []

        for (const index of [0, 1, 2, 3, 4]) {
          const createdAt = new Date(baseTime + index * 1000)
          const row = await tx.job.create({
            data: {
              tenantId: tenant.id,
              type: 'tenant.provision',
              payload: { tenantId: tenant.id },
              status: index === 4 ? JobStatus.failed : JobStatus.queued,
              createdAt,
              updatedAt: createdAt,
            },
            select: { id: true },
          })
          ids.push(row.id)
        }

        return ids
      })

      // En yeni önce → oluşturma sırasının TERSİ.
      const expectedOrder = [...createdIds].reverse()

      const firstPage = await adapter.listJobs(tenant.id, { limit: 2 })
      expect(firstPage.items.map((item) => item.id)).toEqual(expectedOrder.slice(0, 2))
      expect(firstPage.nextCursor).toBe(expectedOrder[1])

      const secondPage = await adapter.listJobs(tenant.id, {
        limit: 2,
        cursor: firstPage.nextCursor ?? '',
      })
      expect(secondPage.items.map((item) => item.id)).toEqual(expectedOrder.slice(2, 4))
      expect(secondPage.nextCursor).toBe(expectedOrder[3])

      const lastPage = await adapter.listJobs(tenant.id, {
        limit: 2,
        cursor: secondPage.nextCursor ?? '',
      })
      expect(lastPage.items.map((item) => item.id)).toEqual(expectedOrder.slice(4))
      // Son sayfa → `nextCursor` `null` (opsiyonel alan DEĞİL, K5 kuralı 1).
      expect(lastPage.nextCursor).toBeNull()

      // Durum filtresi: beşinci iş `failed`, diğer dördü `queued`.
      const failedOnly = await adapter.listJobs(tenant.id, { limit: 10, status: ['failed'] })
      expect(failedOnly.items.map((item) => item.id)).toEqual([createdIds[4]])

      const queuedOnly = await adapter.listJobs(tenant.id, { limit: 10, status: ['queued'] })
      expect(queuedOnly.items).toHaveLength(4)

      // Boş durum filtresi GEÇERLİ ve "hiçbir durum" demektir.
      const noneMatch = await adapter.listJobs(tenant.id, { limit: 10, status: [] })
      expect(noneMatch.items).toEqual([])
      expect(noneMatch.nextCursor).toBeNull()
    } finally {
      await prismaService.db.tenant.delete({ where: { id: tenant.id } })
    }
  })

  it("job.list — var olmayan imleç job.get İLE AYNI JobNotFoundError FIRLATIR (imleç bir varlık oracle'ı DEĞİL)", async () => {
    const tenant = await createTenant('job-list-cursor')

    try {
      let caught: unknown
      try {
        await adapter.listJobs(tenant.id, {
          limit: 5,
          cursor: `job_${randomUUID().replaceAll('-', '')}`,
        })
        throw new Error('beklenen JobNotFoundError fırlatılmadı')
      } catch (error) {
        caught = error
      }

      if (!isAppError(caught)) {
        throw new Error(`beklenen AppError değil: ${String(caught)}`)
      }

      expect(caught.code).toBe('JOB_NOT_FOUND')
      expect(caught.httpStatus).toBe(404)
      expect(caught.publicDetails).toEqual({})
    } finally {
      await prismaService.db.tenant.delete({ where: { id: tenant.id } })
    }
  })

  // -------------------------------------------------------------------------
  // (D) `perf` İKAMESİ — ÖLÇÜM 1: sayfa boyutu üst sınırı SÖZLEŞMEDE
  // -------------------------------------------------------------------------

  describe("⚠ perf ikamesi · ÖLÇÜM 1 — job.list sayfa boyutu üst sınırı SÖZLEŞMEDE (architect devretti, perf gate'i koşmuyor)", () => {
    /** Çağrıldığını KAYDEDEN sahte port — "resolver'a hiç ulaşmadı" iddiasının kanıtı. */
    function createRecordingJobReadPort(): { port: JobReadPort; calls: string[] } {
      const calls: string[] = []

      return {
        calls,
        port: {
          findJob: (_tenantId, jobId) => {
            calls.push(`findJob:${jobId}`)
            return Promise.reject(new Error('bu port çağrılmamalıydı'))
          },
          listJobs: (_tenantId, query) => {
            calls.push(`listJobs:${String(query.limit)}`)
            return Promise.resolve({ items: [], nextCursor: null })
          },
        },
      }
    }

    function createProbeContext(jobRead: JobReadPort): TrpcContext {
      return {
        requestId: 'req_s8_limit_probe',
        logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
        auth: { kind: 'authenticated', userId: 'probe-user', sessionId: 'probe-session' },
        tenant: { kind: 'resolved', tenantId: 'probe-tenant', slug: 'probe', status: 'active' },
        ports: {
          tenantRead: { findSummary: () => Promise.reject(new Error('çağrılmamalı')) },
          storefrontTenantRead: {
            findPublicTenant: () => Promise.reject(new Error('çağrılmamalı')),
          },
          jobRead,
        },
        errors: {
          unauthenticated: () => {
            throw new Error('çağrılmamalı')
          },
          tenantContextRequired: () => {
            throw new Error('çağrılmamalı')
          },
        },
      }
    }

    async function callJobList(limit: number): Promise<{ status: number; body: unknown }> {
      const recording = createRecordingJobReadPort()
      const handler = createTrpcRequestHandler()
      const input = encodeURIComponent(JSON.stringify({ limit }))

      const response = await handler({
        req: new Request(`http://trpc-probe.test/trpc/job.list?input=${input}`),
        context: createProbeContext(recording.port),
      })

      return {
        status: response.status,
        body: { json: await response.json(), calls: recording.calls },
      }
    }

    it('limit: 51 REDDEDİLİR — yanıt hatadır ve port HİÇ ÇAĞRILMAZ (sınır iyi niyette değil, sözleşmede)', async () => {
      const envelope = z.object({
        json: z.object({ error: z.object({ data: z.object({ httpStatus: z.number() }) }) }),
        calls: z.array(z.string()),
      })

      const rejected = envelope.parse((await callJobList(51)).body)

      // Girdi doğrulaması tRPC sınırında başarısız olur → çerçeve kaynaklı
      // hata yolu (ADR-0010 §2): 400. Resolver'a — ve dolayısıyla porta —
      // HİÇ ULAŞILMADI.
      expect(rejected.json.error.data.httpStatus).toBe(400)
      expect(rejected.calls).toEqual([])

      // Şema düzeyinde de aynı ölçüm, ham hâliyle.
      const parsed = jobListInputSchema.safeParse({ limit: 51 })
      expect(parsed.success).toBe(false)
    })

    it('⚠ VACUOUS DEĞİL — limit: 50 AYNI yolda KABUL edilir ve porta ULAŞIR (her şey reddedilmiyor)', async () => {
      const envelope = z.object({
        json: z.object({ result: z.object({ data: z.unknown() }) }),
        calls: z.array(z.string()),
      })

      const accepted = envelope.parse((await callJobList(50)).body)

      expect(accepted.calls).toEqual(['listJobs:50'])
      expect(jobListInputSchema.safeParse({ limit: 50 }).success).toBe(true)
    })

    it('varsayılan sayfa boyutu 20 — limit verilmezse porta 20 ULAŞIR', () => {
      const parsed = jobListInputSchema.parse({})
      expect(parsed.limit).toBe(20)
    })
  })

  // -------------------------------------------------------------------------
  // (D) `perf` İKAMESİ — ÖLÇÜM 2: sorgu şekli ↔ indeks tanımı uyumu
  // -------------------------------------------------------------------------

  describe('⚠ perf ikamesi · ÖLÇÜM 2 — job.list sorgu şekli (tenant_id, status, created_at DESC) indeksiyle UYUMLU', () => {
    it('uygulanmış migration bileşik indeksi TAM OLARAK (tenant_id, status, created_at DESC) sırasıyla tanımlıyor', () => {
      const sql = readFileSync(JOB_MIGRATION_SQL_PATH, 'utf-8')

      expect(sql).toContain(
        'CREATE INDEX "job_tenant_id_status_created_at_idx" ON "job"("tenant_id", "status", "created_at" DESC);',
      )
    })

    it('adaptörün sıralaması indeksin sıralamasıyla eşleşiyor: created_at DESC, ardından id DESC (bağ çözücü)', () => {
      // ⚠ Beklenti LİTERAL yazılır, adaptörün sabitinden TÜRETİLMEZ
      // (totoloji karşıtı — `router-output.test-d.ts`'in aynı disiplini).
      expect(JOB_LIST_ORDER_BY).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    })

    it('argüman şekli: where yüklemleri yalnızca status ve keyset; tenant_id yüklemi YAZILMAZ (RLS ekler)', () => {
      const anchor = { id: 'job_anchor', createdAt: new Date('2026-11-03T10:00:00.000Z') }

      const withoutFilters = buildJobListQueryArgs({ limit: 20 }, [])
      expect(withoutFilters.where).toEqual({ AND: [] })
      expect(withoutFilters.take).toBe(21)

      const withStatus = buildJobListQueryArgs({ limit: 5, status: ['queued', 'running'] }, [])
      expect(withStatus.where).toEqual({ AND: [{ status: { in: ['queued', 'running'] } }] })
      expect(withStatus.take).toBe(6)

      const withCursor = buildJobListQueryArgs({ limit: 5, status: ['failed'] }, [anchor])
      expect(withCursor.where).toEqual({
        AND: [
          { status: { in: ['failed'] } },
          {
            OR: [
              { createdAt: { lt: anchor.createdAt } },
              { createdAt: anchor.createdAt, id: { lt: anchor.id } },
            ],
          },
        ],
      })

      // Hiçbir dalda `tenantId` yüklemi YOK — sahiplik yüklemini RLS ekler,
      // uygulama kodu kiracıyı satırla KARŞILAŞTIRMAZ (AC8'in yapısal yarısı).
      for (const args of [withoutFilters, withStatus, withCursor]) {
        expect(JSON.stringify(args.where)).not.toContain('tenantId')
      }
    })

    it('select tele çıkan dokuz kolonu okur; kuyruk girdisi kolonu ve tenant_id HİÇ OKUNMAZ', () => {
      expect(Object.keys(JOB_ROW_SELECT).sort()).toEqual([
        'completedAt',
        'createdAt',
        'error',
        'id',
        'progress',
        'startedAt',
        'status',
        'type',
        'updatedAt',
      ])
      // Bu dosya yasağın DENETLEYİCİSİ, öznesi değil — jeton burada ZORUNLU
      // (AGENT_BASELINE.md §5).
      expect(Object.keys(JOB_ROW_SELECT)).not.toContain('payload')
      expect(Object.keys(JOB_ROW_SELECT)).not.toContain('tenantId')
    })
  })
})
