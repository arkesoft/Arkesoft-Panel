// @arkesoft/api — M-1 + M-2: tRPC hata sınırının TEK yapılandırılmış kaydı,
// `targetUserId` ayrımı ve NUL baytının tek-hata değişmezine indirgenmesi
// (ROADMAP v0.0.14, T-014 düzeltme turu 1 — `solid` M-1 + `security` medium
// #1/#2; iki gate BAĞIMSIZ olarak aynı kusuru buldu)
//
// ⚠⚠ M-1'İN KUSURU NEYDİ: `PERMISSION_DENIED`'ın tel gövdesine izin adını ve
// rolü KOYMAMA kararının yazılı TEK gerekçesi "bu iki alan yalnızca
// `AppError.context`'e girer ve hata SINIRI onu LOGLAR"dı. Ölçüldü: dört
// halkanın HİÇBİRİ loglamıyordu (`appErrorBoundary` sessiz ·
// `errorFormatter`'ın parse-EDİLEBİLİR dalı sessiz · `onError` parse
// edilebilirse ERKEN DÖNÜYOR · `AppExceptionFilter` ise `fetchRequestHandler`
// her hatayı `Response`'a çevirdiği için HİÇ tetiklenmiyor). Sonuç: yeni RBAC
// yüzeyinde BAŞARI denetim kaydına yazılıyor, RED tamamen görünmezdi
// (OWASP A09). Bu dosya kaydın GERÇEKTEN yazıldığını ve TEL GÖVDESİNİN
// DEĞİŞMEDİĞİNİ birlikte ölçer.
//
// ⚠⚠ M-1'İN ZORUNLU İKİNCİ YARISI (`security`): `member.service.ts`'in
// "hedef bu kiracının üyesi değil" reddi HEDEFİN kimliğini `context.userId`'ye
// koyuyordu, oysa istek child logger'ı `userId`'yi AKTÖRE bağlıyor
// (`auth-context.middleware.ts`). Log eklendiği an aynı anahtar İKİ DEĞERLE
// yazılır ve denetim izi aktörü YANLIŞ ATFEDERDİ. Bu yüzden hedef alanı
// `targetUserId`'dir ve AKTÖRÜN alanıyla ÇAKIŞMAZ — aşağıda ikisi birlikte,
// AYNI kayıt üzerinde ölçülüyor.
//
// ⚠⚠ M-2'NİN KUSURU NEYDİ: ADR-0016 madde 6 koşul D "kabul akışının TÜM
// başarısızlık modları TEK hata sınıfına indirgenir" diyor. NUL baytı (U+0000)
// bu değişmezi deliyordu: Zod'un uzunluk sınırı NUL'u GEÇİRİR ·
// `parseInvitationToken`'ın boşluk kapısı GEÇİRİR (U+0000 boşluk DEĞİLDİR,
// `trim()` onu SOYMAZ) · kiracı bağlamı kuran katmanın boşluk kapısı GEÇİRİR ·
// `set_config`'in bağlı parametresi PostgreSQL'de REDDEDİLİR (`22021 invalid
// byte sequence for encoding "UTF8": 0x00`). Sonuç `AppError` DEĞİL, jenerik
// bir 500 + istek başına bir `error` seviyeli ham kayıt. Bu dosya 404'ü ve
// `error` seviyeli kaydın YOKLUĞUNU birlikte ölçer.
//
// ⚠ ÖLÇÜLMÜŞ ERİŞİLEBİLİRLİK: kabul ucu için kiracı ÜYELİĞİ GEREKMEZ (kiracı
// bağlamından muaf yol) — oturumu olan HERHANGİ biri tek istekle o 500'ü
// üretebiliyordu. Aynı zincire `member.remove`/`member.updateRole`'ün
// `userId` girdisinden de ULAŞILIYORDU; ikisi de aşağıda ölçülüyor.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { appErrorBodySchema } from '@arkesoft/errors'
import { trpcErrorDataSchema } from '@arkesoft/trpc'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

/** `SameOriginGuard`'ın güvenilir orijini — guard ile AYNI tek kaynaktan türetilir. */
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin

/**
 * Hata sınırının yazdığı TEK kaydın olay adı. ⚠ Üretim sabitinden KOPYADIR ve
 * bu bilinçli: bir log olayının adı tel sözleşmesi DEĞİLDİR, `@arkesoft/trpc`'nin
 * public yüzeyine bir sabit eklemek onu semver olayına çevirirdi. Platformun
 * yerleşik deseni de bu (`'istek hata ile sonuçlandı'`, `'üye daveti
 * gönderildi'` aynı biçimde testlerde literal yaşıyor).
 */
const BOUNDARY_LOG_EVENT = 'trpc.error-boundary.app-error'

/** `onError`'ın SINIFLANDIRILAMAYAN hata dalının olay adı — M-2'de YOKLUĞU ölçülür. */
const UNCLASSIFIED_LOG_EVENT = 'trpc.request-handler.unclassified-error'

/**
 * Seviye ETİKETLERİ — ÖLÇÜLDÜ, varsayılmadı: kök logger `formatters.level`
 * ile seviyeyi SAYI yerine ETİKET olarak yazıyor (`root-logger.ts`), bu yüzden
 * NDJSON satırında `"level":"warn"` görünür.
 */
const WARN_LEVEL_LABEL = 'warn'
const ERROR_LEVEL_LABEL = 'error'

/**
 * NUL baytı — PostgreSQL'in `text` parametresinde REDDETTİĞİ tek bayt
 * (`22021 invalid byte sequence for encoding "UTF8": 0x00`).
 *
 * ⚠ KAÇIŞ DİZİSİYLE yazılır, HAM bayt olarak DEĞİL: ham bir NUL kaynak
 * dosyasında GÖRÜNMEZ olur ve bir sonraki okuyucu testin NE ölçtüğünü anlayamaz.
 * ⚠ U+0000 bir BOŞLUK KARAKTERİ DEĞİLDİR — `trim()` onu SOYMAZ; M-2'nin
 * zincirindeki iki boşluk kapısı bu yüzden onu geçiriyordu.
 */
const NUL_BYTE = '\u0000'

const trpcErrorEnvelopeSchema = z.object({ error: z.object({ data: trpcErrorDataSchema }) })
const logRecordSchema = z.record(z.string(), z.unknown())

/**
 * Hata sınırı kaydının ÖLÇÜLEN şekli — dört iş alanı + enjekte edilen
 * logger'ın bağladıkları.
 *
 * ⚠ `z.looseObject` KULLANILIR, `z.object` DEĞİL ve bu ÖLÇÜLMÜŞ bir
 * düzeltmedir: `z.object` BİLİNMEYEN ANAHTARLARI DÜŞÜRÜR, dolayısıyla
 * ayrıştırılmış nesne üzerinden `tenantId` aramak (logger'ın BAĞLADIĞI alan,
 * şemada adı geçmeyen) KAÇINILMAZ OLARAK `undefined` döner — yani §4'ün alan
 * listesini doğrulayan assert VACUOUS olurdu (ilk denememde tam bu oldu).
 */
const boundaryRecordSchema = z.looseObject({
  level: z.string(),
  msg: z.literal(BOUNDARY_LOG_EVENT),
  requestId: z.string(),
  userId: z.string(),
  code: z.string(),
  httpStatus: z.number(),
  isRetryable: z.boolean(),
  context: z.record(z.string(), z.unknown()),
})

type BoundaryRecord = z.infer<typeof boundaryRecordSchema>

/** Bellek içi NDJSON log akışı (`member-invite-flow.test.ts`'in aynı yerel yardımcısı). */
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
        .map((line) => logRecordSchema.parse(JSON.parse(line))),
  }
}

describe('M-1/M-2 — tRPC hata sınırı: TEK yapılandırılmış kayıt, doğru atıf, tek-hata değişmezi', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let getRecords: () => Record<string, unknown>[]
  let tenantId: string
  let tenantSlug: string
  let ownerCookie: string
  let ownerUserId: string
  let readonlyCookie: string
  let readonlyUserId: string
  let outsiderUserId: string

  beforeAll(async () => {
    const { stream, getRecords: readRecords } = createMemoryLogStream()
    getRecords = readRecords

    const testApp = await createTestApp({ stream })
    app = testApp.app
    prismaService = app.get(PrismaService)

    tenantSlug = `fix1-${randomUUID().slice(0, 12)}`
    const tenant = await prismaService.db.tenant.create({
      data: { slug: tenantSlug, name: 'FIX 1 Hata Sınırı Kiracısı', status: TenantStatus.active },
    })
    tenantId = tenant.id

    const owner = await createAuthenticatedSession(app.getHttpServer())
    ownerCookie = owner.cookieHeader
    ownerUserId = owner.userId

    const readonlyMember = await createAuthenticatedSession(app.getHttpServer())
    readonlyCookie = readonlyMember.cookieHeader
    readonlyUserId = readonlyMember.userId

    // ⚠ ÜÇÜNCÜ hesap kiracının ÜYESİ DEĞİL: `targetUserId` ayrımının ölçülmesi
    // için "var olan ama bu kiracıya üye olmayan" bir hedef gerekiyor.
    const outsider = await createAuthenticatedSession(app.getHttpServer())
    outsiderUserId = outsider.userId

    await prismaService.withTenant(tenantId, async (tx) => {
      await tx.tenantMembership.create({
        data: { tenantId, userId: ownerUserId, role: TenantRole.owner },
      })
      await tx.tenantMembership.create({
        data: { tenantId, userId: readonlyUserId, role: TenantRole.readonly },
      })
    })
  }, 120_000)

  afterAll(async () => {
    if (app !== undefined) {
      await prismaService.db.tenant.delete({ where: { id: tenantId } })
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  /** Verilen `requestId` için hata sınırı kayıtlarını (yalnızca onları) döndürür. */
  function boundaryRecordsFor(requestId: string): BoundaryRecord[] {
    return getRecords()
      .filter((record) => record['requestId'] === requestId && record['msg'] === BOUNDARY_LOG_EVENT)
      .map((record) => boundaryRecordSchema.parse(record))
  }

  /** Verilen `requestId` için SINIFLANDIRILAMAYAN hata kayıtlarının sayısı. */
  function unclassifiedRecordCountFor(requestId: string): number {
    return getRecords().filter(
      (record) => record['requestId'] === requestId && record['msg'] === UNCLASSIFIED_LOG_EVENT,
    ).length
  }

  /** Verilen `requestId` için TÜM kayıtları döndürür (ham metin taramaları için). */
  function allRecordsFor(requestId: string): Record<string, unknown>[] {
    return getRecords().filter((record) => record['requestId'] === requestId)
  }

  it(
    'M-1 — `readonly` rolünün yetki reddi SINIRDA TEK `warn` kaydı üretir; izin adı ve rol ' +
      'KAYITTA var, TEL GÖVDESİNDE yok',
    async () => {
      const requestId = `req-fix1-permission-${randomUUID().slice(0, 8)}`

      const response = await request(httpServer())
        .post('/trpc/member.remove')
        .set('Cookie', readonlyCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('Origin', TRUSTED_ORIGIN)
        .set('x-request-id', requestId)
        .send({ userId: outsiderUserId })

      // --- TEL YARISI: K-A6'nın gövde şekli BİREBİR KORUNDU ---------------
      expect(response.status).toBe(403)
      const envelope = trpcErrorEnvelopeSchema.parse(response.body)
      const appError = appErrorBodySchema.parse(envelope.error.data.appError)
      expect(appError.code).toBe('PERMISSION_DENIED')
      // ⚠ `details` BOŞ KALDI: izin adı ve rol tele GİRMEDİ (varlık oracle'ının
      // tek savunması). Tel gövdesine HİÇBİR ŞEY EKLENMEDİ.
      expect(appError.details).toEqual({})
      expect(Object.keys(appError).sort()).toEqual(['code', 'details', 'message', 'requestId'])
      const bodyText = JSON.stringify(response.body)
      expect(bodyText).not.toContain('member:write')
      expect(bodyText).not.toContain('readonly')
      expect(bodyText).not.toContain('isRetryable')

      // --- LOG YARISI: M-1'in kapanışı ------------------------------------
      const records = boundaryRecordsFor(requestId)
      // ⚠ TEK kayıt: `onError`'ın erken dönüşü ikinci bir satır üretmiyor.
      expect(records).toHaveLength(1)
      const [record] = records
      if (record === undefined) {
        throw new Error('hata sınırı kaydı bulunamadı')
      }

      // 4xx → `warn` (CLAUDE.md §4: "beklenen ama anormal").
      expect(record.level).toBe(WARN_LEVEL_LABEL)
      expect(record.code).toBe('PERMISSION_DENIED')
      expect(record.httpStatus).toBe(403)
      expect(record.isRetryable).toBe(false)
      // İzin adı ve rol GERÇEKTEN loglandı — "loga gider" iddiası artık DOĞRU.
      expect(record.context).toEqual({ permission: 'member:write', role: 'readonly' })
      // CLAUDE.md §4 alan listesi: `userId` AKTÖRÜ gösteriyor, `tenantId` dolu.
      expect(record.userId).toBe(readonlyUserId)
      expect(record['tenantId']).toBe(tenantId)
      // Sır/yığın izi YOK.
      expect(Object.hasOwn(record, 'stack')).toBe(false)
      expect(unclassifiedRecordCountFor(requestId)).toBe(0)
    },
    60_000,
  )

  it(
    'M-1 (ikinci yarı) — hedefin kimliği `targetUserId` alanına yazılır; `userId` AKTÖRÜ ' +
      'gösterir, aynı anahtar İKİ DEĞERLE yazılmaz',
    async () => {
      const requestId = `req-fix1-target-${randomUUID().slice(0, 8)}`

      const response = await request(httpServer())
        .post('/trpc/member.remove')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('Origin', TRUSTED_ORIGIN)
        .set('x-request-id', requestId)
        .send({ userId: outsiderUserId })

      expect(response.status).toBe(403)
      const envelope = trpcErrorEnvelopeSchema.parse(response.body)
      expect(envelope.error.data.appError.code).toBe('TENANT_MEMBERSHIP_REQUIRED')
      // Varlık oracle'ı kapalı: hedefin kimliği TELE yazılmıyor.
      expect(JSON.stringify(response.body)).not.toContain(outsiderUserId)

      const records = boundaryRecordsFor(requestId)
      expect(records).toHaveLength(1)
      const [record] = records
      if (record === undefined) {
        throw new Error('hata sınırı kaydı bulunamadı')
      }

      // ⚠⚠ AYRIMI VEREN ASSERT: hedef `targetUserId`'de, aktör üst seviye
      // `userId`'de ve İKİSİ FARKLI DEĞERLER. `context.userId` alanı ARTIK YOK
      // — olsaydı NDJSON satırında `userId` İKİ KEZ görünür ve denetim izi
      // aktörü yanlış atfederdi.
      expect(record.context['targetUserId']).toBe(outsiderUserId)
      expect(Object.hasOwn(record.context, 'userId')).toBe(false)
      expect(record.userId).toBe(ownerUserId)
      expect(record.userId).not.toBe(outsiderUserId)
      expect(record.context['tenantId']).toBe(tenantId)
      expect(record.level).toBe(WARN_LEVEL_LABEL)
    },
    60_000,
  )

  it(
    "M-2 — kabul belirtecinin kiracı yarısındaki NUL baytı AYNI 404 `INVITATION_INVALID`'i " +
      'verir; `error` seviyeli ham kayıt ÜRETİLMEZ',
    async () => {
      const requestId = `req-fix1-nul-token-${randomUUID().slice(0, 8)}`

      // ⚠ Kiracı yarısı GEÇERLİ bir kiracının kimliğiyle BAŞLIYOR ve araya NUL
      // sokuluyor: zincirin "kiracı bulunamadı" dalına değil, VERİ KATMANINA
      // ulaşan yola girmesi için. Belirteç oturum sahibinin ELİNDE olabilecek
      // her şeyden bağımsız — kiracı ÜYELİĞİ de gerekmiyor.
      const poisonedToken = `${tenantId}${NUL_BYTE}.harness-secret-half`

      const response = await request(httpServer())
        .post('/trpc/member.acceptInvitation')
        .set('Cookie', ownerCookie)
        .set('Origin', TRUSTED_ORIGIN)
        .set('x-request-id', requestId)
        .send({ token: poisonedToken })

      expect(response.status).toBe(404)
      const envelope = trpcErrorEnvelopeSchema.parse(response.body)
      expect(envelope.error.data.appError.code).toBe('INVITATION_INVALID')
      expect(envelope.error.data.appError.details).toEqual({})

      // ⚠ ZİNCİRİN KAPANDIĞININ KANITI: sınıflandırılamayan hata kaydı YOK
      // (düzeltmeden ÖNCE burada ham mesaj + yığın izi taşıyan bir `error`
      // kaydı vardı) ve hiçbir kayıt yığın izi taşımıyor.
      expect(unclassifiedRecordCountFor(requestId)).toBe(0)
      for (const record of allRecordsFor(requestId)) {
        expect(Object.hasOwn(record, 'stack')).toBe(false)
      }

      const records = boundaryRecordsFor(requestId)
      expect(records).toHaveLength(1)
      const [record] = records
      if (record === undefined) {
        throw new Error('hata sınırı kaydı bulunamadı')
      }
      expect(record.code).toBe('INVITATION_INVALID')
      expect(record.httpStatus).toBe(404)
      expect(record.level).toBe(WARN_LEVEL_LABEL)
      // Kabul akışının hatası PARAMETRESİZDİR — belirteçten türeyen,
      // DOĞRULANMAMIŞ kiracı kimliği loga da GİRMEZ.
      expect(record.context).toEqual({})
      expect(JSON.stringify(allRecordsFor(requestId))).not.toContain(tenantId)
    },
    60_000,
  )

  it(
    "M-2 (ikinci erişim yolu) — `member.remove`'un `userId` girdisindeki NUL baytı 500 DEĞİL, " +
      '"üye değil" reddinin AYNI 403\'ünü verir',
    async () => {
      const requestId = `req-fix1-nul-userid-${randomUUID().slice(0, 8)}`

      const response = await request(httpServer())
        .post('/trpc/member.remove')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('Origin', TRUSTED_ORIGIN)
        .set('x-request-id', requestId)
        .send({ userId: `${outsiderUserId}${NUL_BYTE}` })

      expect(response.status).toBe(403)
      const envelope = trpcErrorEnvelopeSchema.parse(response.body)
      expect(envelope.error.data.appError.code).toBe('TENANT_MEMBERSHIP_REQUIRED')

      expect(unclassifiedRecordCountFor(requestId)).toBe(0)
      const records = boundaryRecordsFor(requestId)
      expect(records).toHaveLength(1)
      const [record] = records
      if (record === undefined) {
        throw new Error('hata sınırı kaydı bulunamadı')
      }
      expect(record.level).toBe(WARN_LEVEL_LABEL)
      expect(record.httpStatus).toBe(403)
      // ⚠ Kayıt kaçışlanmış JSON dizesidir — ham bayt NDJSON satırını BOZMAZ.
      expect(typeof record.context['targetUserId']).toBe('string')
      expect(Object.hasOwn(record.context, 'userId')).toBe(false)
    },
    60_000,
  )

  it(
    'L6 (yolu üstünde) — `userId` girdisinin ÜST SINIRI var: sınırı aşan girdi veri katmanına ' +
      'HİÇ ULAŞMAZ',
    async () => {
      const requestId = `req-fix1-userid-max-${randomUUID().slice(0, 8)}`

      const response = await request(httpServer())
        .post('/trpc/member.remove')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('Origin', TRUSTED_ORIGIN)
        .set('x-request-id', requestId)
        .send({ userId: 'u'.repeat(4096) })

      // Girdi doğrulaması sözleşme katmanında reddediyor → 400; prosedür
      // gövdesi HİÇ KOŞMUYOR, dolayısıyla hata sınırı kaydı da YOK.
      expect(response.status).toBe(400)
      expect(boundaryRecordsFor(requestId)).toHaveLength(0)
    },
    60_000,
  )

  it('vacuous DEĞİL — BAŞARILI bir istek hata sınırı kaydı ÜRETMEZ', async () => {
    const requestId = `req-fix1-success-${randomUUID().slice(0, 8)}`

    const response = await request(httpServer())
      .get('/trpc/tenant.current')
      .set('Cookie', ownerCookie)
      .set('x-arkesoft-tenant', tenantSlug)
      .set('x-request-id', requestId)

    expect(response.status).toBe(200)
    // Filtre "her şeyi" yakalamıyor: başarılı yolda SIFIR kayıt.
    expect(boundaryRecordsFor(requestId)).toHaveLength(0)
    expect(unclassifiedRecordCountFor(requestId)).toBe(0)
    // Seviye sabitleri gerçekten FARKLI iki değer (assert'in anlamı var).
    expect(WARN_LEVEL_LABEL).not.toBe(ERROR_LEVEL_LABEL)
  })
})
