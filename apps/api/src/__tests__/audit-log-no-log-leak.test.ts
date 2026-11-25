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

/**
 * `value` içinde (üst seviyede VEYA herhangi bir derinlikte iç içe, nesne/dizi
 * farketmeksizin) `forbiddenFields`'teki bir alan adıyla eşleşen İLK yolu
 * bulur; bulamazsa `undefined` döner (ROADMAP v0.0.17, T-028/S9, borç
 * :3961/L-12).
 *
 * ⚠⚠ DEVİR: bu taramanın ÖNCEKİ hâli yalnızca ÜST SEVİYEYİ (`Object.hasOwn(
 * record, …)`) görüyordu — bir `AppError.context`'in İÇİNE nestelenmiş bir
 * `diff`/`ip`/`userAgent` alanı bu taramayı SESSİZCE ATLATIRDI. Artık her
 * nesne/dizi özyinelemeli gezilir.
 *
 * ⚠ Sonsuz özyinelemeye karşı derinlik sınırı/devirli referans koruması
 * BİLEREK YOK (`@arkesoft/errors`'un `redactDeep`'inin AKSİNE): bu fonksiyonun
 * girdisi her zaman `JSON.parse(NDJSON satırı)`'nın çıktısıdır — JSON'da
 * devirli referans YAPISAL OLARAK İMKÂNSIZDIR (serileştirme anında zaten
 * fırlardı), bu yüzden burada taşınmayan bir koruma eksik DEĞİL, gereksizdir.
 */
function findForbiddenFieldDeep(
  value: unknown,
  forbiddenFields: readonly string[],
  path = '$',
): string | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findForbiddenFieldDeep(item, forbiddenFields, `${path}[${index.toString()}]`)
      if (found !== undefined) {
        return found
      }
    }
    return undefined
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenFields.includes(key)) {
      return `${path}.${key}`
    }
    const found = findForbiddenFieldDeep(nestedValue, forbiddenFields, `${path}.${key}`)
    if (found !== undefined) {
      return found
    }
  }

  return undefined
}

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

      // ⚠⚠ Alan ADI taraması TÜM kayıtlar üzerinde, DERİNLEMESİNE (L-12):
      // yalnızca üst seviye değil, her kaydın İÇİNE nestelenmiş HER alan da
      // taranır — üç alanın hiçbiri hiçbir log satırında, hiçbir derinlikte
      // alan olarak GÖRÜNMÜYOR.
      for (const record of records) {
        const forbiddenPath = findForbiddenFieldDeep(record, FORBIDDEN_LOG_FIELDS)
        expect(
          forbiddenPath,
          `log kaydında yasaklı alan var (derinlemesine, yol: ${String(forbiddenPath)}): ${JSON.stringify(record)}`,
        ).toBeUndefined()
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

// ROADMAP v0.0.17, T-028/S9, borç :3961/L-12 — `findForbiddenFieldDeep`'in
// KENDİSİNİN doğruluğu. İKİ YÖNLÜ MUTASYON KANITI (handoff raporunda
// koşturularak doğrulandı, bu dosyada KALICI OLARAK TUTULMAZ):
// `findForbiddenFieldDeep`'in özyinelemeli dalı (`Array.isArray` dalından
// SONRAKİ `for...of` döngüsünün ikinci `findForbiddenFieldDeep` çağrısı)
// GEÇİCİ olarak kaldırılıp yalnızca ÜST SEVİYE anahtarlara bakacak hâle
// getirildi → aşağıdaki "iç içe" testi KIRMIZI göründü (nestelenmiş `diff`
// YAKALANAMADI) → `Edit` ile geri alındı → yeşile döndü. Vacuity kanıtı
// budur; derinlemesine tarama GERÇEKTEN çalışıyor, üst seviye tarama ile
// AYNI sonucu VERMİYOR.
describe('findForbiddenFieldDeep — L-12 derinlemesine tarayıcının kendi doğruluğu', () => {
  it('üst seviyedeki yasaklı alanı yakalar (eski davranışla UYUMLU — regresyon yok)', () => {
    expect(
      findForbiddenFieldDeep({ diff: { before: 'a', after: 'b' } }, FORBIDDEN_LOG_FIELDS),
    ).toBe('$.diff')
  })

  it(
    'İÇ İÇE (nested) bir yasaklı alanı yakalar — ÜST SEVİYE tarama bunu ' +
      'KAÇIRIRDI (L-12nin varlık sebebi)',
    () => {
      const nestedLeak = {
        msg: 'örnek kayıt',
        requestId: 'req-l12-proof',
        context: { nested: { diff: { before: 'a', after: 'b' } } },
      }

      expect(findForbiddenFieldDeep(nestedLeak, FORBIDDEN_LOG_FIELDS)).toBe('$.context.nested.diff')
    },
  )

  it('dizi içindeki nesnelerin iç içe yasaklı alanlarını da yakalar', () => {
    const nestedInArray = {
      items: [{ safe: 'x' }, { context: { ip: '203.0.113.5' } }],
    }

    expect(findForbiddenFieldDeep(nestedInArray, FORBIDDEN_LOG_FIELDS)).toBe(
      '$.items[1].context.ip',
    )
  })

  it('yasaklı alan YOKSA undefined döner (pozitif kontrol — vakumla her şeyi bulgu saymaz)', () => {
    const clean = {
      msg: 'örnek kayıt',
      requestId: 'req-l12-clean',
      context: { nested: { safeField: 'x', again: { stillSafe: true } } },
    }

    expect(findForbiddenFieldDeep(clean, FORBIDDEN_LOG_FIELDS)).toBeUndefined()
  })

  it('birincil tipleri (string/number/boolean/null/undefined) gezmeden undefined döner', () => {
    expect(findForbiddenFieldDeep('diff', FORBIDDEN_LOG_FIELDS)).toBeUndefined()
    expect(findForbiddenFieldDeep(42, FORBIDDEN_LOG_FIELDS)).toBeUndefined()
    expect(findForbiddenFieldDeep(null, FORBIDDEN_LOG_FIELDS)).toBeUndefined()
    expect(findForbiddenFieldDeep(undefined, FORBIDDEN_LOG_FIELDS)).toBeUndefined()
  })
})
