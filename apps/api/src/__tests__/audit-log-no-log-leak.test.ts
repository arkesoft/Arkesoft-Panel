// @arkesoft/api — AC6 (ikinci yarı): denetim kaydının İSTEMCİ ALANLARI ve
// `diff`i YAPILANDIRILMIŞ LOGA GEÇMEZ (ROADMAP v0.0.14, T-014/S5,
// architect K-A14 madde 13, CLAUDE.md §4)
//
// ⚠⚠ İDDİANIN İKİ YARISI VAR ve bu dosya İKİNCİSİNİ ölçer. Yapısal yarı:
// denetim yazma kapısı hiçbir logger'ı import etmez/almaz (mekanik kontrolü
// `production-write-path-grep.qa.test.ts`'te). Çalışma zamanı yarısı: GERÇEK
// bir istek zinciri koşarken üretilen NDJSON kayıtlarının HİÇBİRİNDE `ip`,
// `userAgent` veya `diff` YOKTUR — oysa AYNI isteğin yazdığı denetim satırı
// bu alanları TAŞIR.
//
// ⚠ "SAKLANIR, LOGLANMAZ" ayrımı bu dosyanın VARLIK SEBEBİDİR: `ip` ve
// `userAgent` kişisel veri sınıfındadır ama denetim kaydının varlık
// sebebidir; §4'ün "asla loglanmaz" listesindedir, "asla saklanmaz"
// listesinde DEĞİL. Bu yüzden testin her olumsuz assert'inin yanında, AYNI
// değerin veri katmanında GERÇEKTEN bulunduğunu gösteren bir olumlu assert
// duruyor — aksi hâlde "sızmadı" iddiası boş küme üzerinde yeşil yanardı.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { AUDIT_USER_AGENT_MAX_LENGTH } from '../audit/audit-log.writer.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin

/**
 * Loga SIZMASI YASAK olan denetim kaydı alan adları. `ip`/`userAgent`
 * istemci kimlikleri, `diff` ise yetki değişikliğinin içeriğidir.
 */
const FORBIDDEN_LOG_FIELDS = ['ip', 'userAgent', 'diff'] as const

function createMemoryLogStream(): {
  readonly stream: Writable
  readonly getRecords: () => Record<string, unknown>[]
} {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })

  return {
    stream,
    getRecords: () =>
      Buffer.concat(chunks)
        .toString('utf-8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => z.record(z.string(), z.unknown()).parse(JSON.parse(line))),
  }
}

describe('AC6 — ip/userAgent/diff yapılandırılmış loga GEÇMEZ (gerçek istek zinciri)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let getRecords: () => Record<string, unknown>[]
  let tenantId: string
  let tenantSlug: string
  let ownerCookie: string
  let ownerUserId: string
  let targetUserId: string

  beforeAll(async () => {
    const { stream, getRecords: readRecords } = createMemoryLogStream()
    getRecords = readRecords

    const testApp = await createTestApp({ stream })
    app = testApp.app
    prismaService = app.get(PrismaService)

    tenantSlug = `ac6log-${randomUUID().slice(0, 12)}`
    const tenant = await prismaService.db.tenant.create({
      data: { slug: tenantSlug, name: 'AC6 Log Hijyeni Kiracısı', status: TenantStatus.active },
    })
    tenantId = tenant.id

    const owner = await createAuthenticatedSession(app.getHttpServer())
    const target = await createAuthenticatedSession(app.getHttpServer())
    ownerCookie = owner.cookieHeader
    ownerUserId = owner.userId
    targetUserId = target.userId

    await prismaService.withTenant(tenantId, async (tx) => {
      await tx.tenantMembership.create({
        data: { tenantId, userId: owner.userId, role: TenantRole.owner },
      })
      await tx.tenantMembership.create({
        data: { tenantId, userId: target.userId, role: TenantRole.staff },
      })
    })
  }, 90_000)

  afterAll(async () => {
    if (app !== undefined) {
      await prismaService.db.tenant.delete({ where: { id: tenantId } })
      await app.close()
    }
  })

  it(
    'üç yazma ucu koşar: denetim satırları ip/userAgent/diff TAŞIR, ' +
      'log kayıtlarının HİÇBİRİNDE bu üç alan ve istemci tanıtıcısı YOK',
    async () => {
      if (app === undefined) {
        throw new Error('test uygulaması henüz kurulmadı')
      }

      const marker = randomUUID().replaceAll('-', '')
      const clientMarker = `ac6-ua-${marker}`
      const invitedEmail = `ac6-log-${marker.slice(0, 10)}@arkesoft.test`
      const inviteRequestId = `ac6log-inv-${marker.slice(0, 12)}`
      const updateRequestId = `ac6log-upd-${marker.slice(0, 12)}`
      const removeRequestId = `ac6log-rm-${marker.slice(0, 12)}`

      // ⚠ İstemci tanıtıcısı SINIRDAN UZUN seçildi: kayıt satırında kırpılmış
      // hâli saklanacak, logda ise HİÇBİR biçimi (ne tam ne kırpılmış)
      // bulunmayacak.
      const longUserAgent = `${clientMarker}-${'x'.repeat(AUDIT_USER_AGENT_MAX_LENGTH)}`

      const invite = await request(app.getHttpServer())
        .post('/trpc/member.invite')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('x-request-id', inviteRequestId)
        .set('Origin', TRUSTED_ORIGIN)
        .set('User-Agent', longUserAgent)
        .send({ email: invitedEmail, role: 'staff' })
      expect(invite.status).toBe(200)

      const update = await request(app.getHttpServer())
        .post('/trpc/member.updateRole')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('x-request-id', updateRequestId)
        .set('Origin', TRUSTED_ORIGIN)
        .set('User-Agent', longUserAgent)
        .send({ userId: targetUserId, role: 'admin' })
      expect(update.status).toBe(200)

      const remove = await request(app.getHttpServer())
        .post('/trpc/member.remove')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('x-request-id', removeRequestId)
        .set('Origin', TRUSTED_ORIGIN)
        .set('User-Agent', longUserAgent)
        .send({ userId: targetUserId })
      expect(remove.status).toBe(200)

      // --- OLUMLU YARI: değerler GERÇEKTEN saklandı ------------------------
      const auditRows = await prismaService.withTenant(tenantId, (tx) =>
        tx.auditLog.findMany({
          orderBy: { createdAt: 'asc' },
          select: { action: true, ip: true, userAgent: true, diff: true },
        }),
      )

      expect(auditRows.map((row) => row.action)).toEqual([
        'member_invited',
        'member_role_changed',
        'member_removed',
      ])
      for (const row of auditRows) {
        // İstemci alanları DOLU — "sızmadı" iddiası boş küme üzerinde değil.
        expect(row.ip).not.toBeNull()
        expect(row.userAgent).toBe(longUserAgent.slice(0, AUDIT_USER_AGENT_MAX_LENGTH))
        expect(row.diff).not.toEqual({})
      }

      const storedIps = new Set(auditRows.map((row) => row.ip))
      expect(storedIps.size).toBe(1)

      // --- OLUMSUZ YARI: loglarda YOK --------------------------------------
      const records = getRecords()
      const requestIds = new Set([inviteRequestId, updateRequestId, removeRequestId])
      const requestRecords = records.filter((record) => {
        const recordRequestId = record['requestId']
        return typeof recordRequestId === 'string' && requestIds.has(recordRequestId)
      })

      // Yakalama GERÇEK: üç isteğin de kaydı var ve iş olayı loglanmış.
      expect(requestRecords.length).toBeGreaterThanOrEqual(3)
      expect(requestRecords.some((record) => record['msg'] === 'üye daveti gönderildi')).toBe(true)
      expect(requestRecords.some((record) => record['msg'] === 'üye rolü güncellendi')).toBe(true)
      expect(requestRecords.some((record) => record['msg'] === 'üye kiracıdan çıkarıldı')).toBe(
        true,
      )
      // CLAUDE.md §7 madde 13: kiracı kimliği log kayıtlarında VAR.
      expect(requestRecords.every((record) => record['tenantId'] === tenantId)).toBe(true)

      // ⚠ Alan ADI taraması TÜM kayıtlar üzerinde (yalnızca istek kapsamlı
      // olanlar değil): üç alanın hiçbiri hiçbir log satırında alan olarak
      // görünmüyor.
      for (const record of records) {
        for (const forbiddenField of FORBIDDEN_LOG_FIELDS) {
          expect(
            Object.hasOwn(record, forbiddenField),
            `log kaydında yasaklı alan var: ${forbiddenField} (${JSON.stringify(record)})`,
          ).toBe(false)
        }
      }

      // Alan adı taraması tek başına yetmez — DEĞER de hiçbir yere, hiçbir
      // başka alan adı altında yazılmamalı.
      const fullLogText = JSON.stringify(records)
      expect(fullLogText).not.toContain(clientMarker)
      expect(fullLogText).not.toContain(invitedEmail)
      // Aktörün kimliği loglanır (beklenen); hedef üyenin kimliği de opak bir
      // cuid'dir ve iş olayında geçer — bunlar PII DEĞİL, bu yüzden assert
      // EDİLMEZ. Burada ölçülen şey yalnızca istemci alanları ve `diff`.
      expect(fullLogText).toContain(ownerUserId)
    },
    120_000,
  )
})
