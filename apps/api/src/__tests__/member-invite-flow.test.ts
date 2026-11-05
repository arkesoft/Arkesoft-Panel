// @arkesoft/api — AC2: davet akışının TAMAMI (davet → kabul → rol değiştir →
// çıkar) + `perf` ikamesinin İKİNCİ ölçümü (SMTP sırası)
// (ROADMAP v0.0.14, T-014/S5, architect K-A9, ADR-0016 madde 6)
//
// ⚠ E-POSTA GERÇEK MAILPIT'TEN OKUNUR — "belirteç üretildi" varsayımı KABUL
// EDİLMEZ (v0.0.5'in AC4(b) kuralının aynısı). Davet bağlantısı
// `infra/docker-compose.yml`'in açtığı Mailpit HTTP API'sinden alınır.
//
// ⚠⚠ BELİRTEÇ URL'İN FRAGMANINDADIR (architect K-A9, bağlayıcı: fragman
// sunucuya, erişim loglarına ve `Referer`'a HİÇ gitmez). Bu yüzden mevcut
// `extractQueryParam` yardımcısı BU akışta ÇALIŞMAZ ve bu dosya o olguyu
// VARSAYMAK yerine ÖLÇER (aşağıda `expect(...).toThrow()` ile) — sonra
// fragmandan okuyan yerel bir ayıklayıcı kullanır. Yardımcı dosyası
// (`helpers/mailpit-client.ts`) bu alt görevin dokunma listesinde DEĞİL;
// fragman ayıklaması bu dosyaya ÖZGÜ ve yereldir.
//
// ⚠ KABUL UCUNUN TOPOLOJİSİ (ADR-0016 madde 6): `member.acceptInvitation`
// kiracı bağlamından MUAF 14. yoldur → kiracı başlığı/host'u OLMADAN, panel
// orijininden çağrılır. Oturum ZORUNLUDUR (kimlik muafiyeti YOK). Diğer üç uç
// kiracı kapsamlıdır ve kiracı seçilerek çağrılır.

import { createHash, randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { parseEnv } from '@arkesoft/config/env'
import { TenantRole, TenantStatus } from '@arkesoft/db'
import { isAppError } from '@arkesoft/errors'
import {
  memberInvitationAcceptedSchema,
  memberInvitationSchema,
  trpcErrorDataSchema,
} from '@arkesoft/trpc'
import type { Logger } from 'pino'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { AppModule } from '../app.module.js'
import { MAIL_TRANSPORT } from '../auth/mail/mail-transport.types.js'
import type { MailEnvelope, MailTransport } from '../auth/mail/mail-transport.types.js'
import { SmtpMailTransport } from '../auth/mail/smtp-mail-transport.js'
import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import { MailDeliveryFailedError } from '../errors/domain/mail-delivery-failed.error.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { createRootLogger } from '../logging/root-logger.js'
import {
  INVITATION_ACCEPT_PATH,
  INVITATION_RESEND_COOLDOWN_MS,
  INVITATION_TTL_MS,
} from '../member/member.constants.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { RedisService } from '../redis/redis.service.js'
import { MemberWritePortAdapter } from '../trpc/ports/member-write.port.adapter.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'
import {
  deleteAllMailpitMessages,
  extractFirstUrl,
  extractQueryParam,
  findLatestMailpitMessageTo,
} from './helpers/mailpit-client.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)
const TRUSTED_ORIGIN = new URL(BASE_ENV.AUTH_BASE_URL).origin

/** Davet edilen hesabın kurulumunda kullanılan şifre — fixture'ınkiyle AYNI sınıf, bu dosyaya özgü. */
const INVITEE_PASSWORD = 'arkesoft-s5-invitee-password-123'

/** `platform:auth:*` sayaçlarını temizleyen yerel kopya (paylaşılan dosyaya DOKUNULMAZ — `trpc-full-chain-domain-error.test.ts` emsali). */
const scanBatchSchema = z.array(z.string())

const signInBodySchema = z.object({ user: z.object({ id: z.string() }) })
const setCookieHeaderSchema = z.array(z.string()).min(1)
const trpcErrorEnvelopeSchema = z.object({ error: z.object({ data: trpcErrorDataSchema }) })

/** `member_invited` denetim satırının `diff` şekli — dış veri (JSONB okuması), Zod ile parse edilir. */
const invitedDiffSchema = z.object({ role: z.string() })
/** `member_invitation_accepted` denetim satırının `diff` şekli. */
const acceptedDiffSchema = z.object({ role: z.string(), invitationId: z.string() })

type MailpitSession = {
  readonly cookieHeader: string
  readonly userId: string
}

/**
 * Mailpit gövdesindeki davet bağlantısının FRAGMANINDAN belirteci ayıklar.
 *
 * ⚠ Bu dosyaya ÖZGÜ ve yereldir: paylaşılan Mailpit yardımcısı yalnızca SORGU
 * parametresi okuyabiliyor (`extractQueryParam`) ve davet belirteci bilinçli
 * olarak fragmanda taşınıyor. Yardımcı dosyası başka bir alt görevin
 * sahipliğinde olduğu için büyütülmedi.
 */
function extractFragmentToken(url: string, paramName: string): string {
  const hash = new URL(url).hash
  const prefix = `#${paramName}=`

  if (!hash.startsWith(prefix)) {
    throw new Error(`davet bağlantısının fragmanında '${paramName}' bulunamadı: ${hash}`)
  }

  return decodeURIComponent(hash.slice(prefix.length))
}

/** Bellek içi NDJSON log akışı (`trpc-cross-tenant.isolation.test.ts`'in aynı yerel yardımcısı). */
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

/**
 * BELİRLİ bir e-posta adresi için oturum kurar (kayıt → Mailpit'ten doğrulama
 * belirteci → doğrulama → giriş).
 *
 * ⚠ Paylaşılan `createAuthenticatedSession` KULLANILAMIYOR: o yardımcı adresi
 * KENDİSİ üretir ve çağırana DÖNDÜRMEZ — oysa kabul akışı oturum e-postasının
 * davet adresiyle EŞLEŞMESİNİ şart koşar (normalize edilmiş karşılaştırma).
 * Yardımcı dosyası bu alt görevin dokunma listesinde değil, bu yüzden adres
 * alan ikizi burada, yerel olarak duruyor.
 */
async function createSessionForEmail(httpServer: Server, email: string): Promise<MailpitSession> {
  await request(httpServer)
    .post('/auth/sign-up/email')
    .send({ name: 'AC2 Davet Edilen', email, password: INVITEE_PASSWORD })

  const delivered = await findLatestMailpitMessageTo(email)
  const verificationToken = extractQueryParam(extractFirstUrl(delivered.Text), 'token')
  await request(httpServer).get(`/auth/verify-email?token=${encodeURIComponent(verificationToken)}`)

  const signInResponse = await request(httpServer)
    .post('/auth/sign-in/email')
    .send({ email, password: INVITEE_PASSWORD })

  const cookies = setCookieHeaderSchema.parse(signInResponse.headers['set-cookie'])

  return {
    cookieHeader: cookies.join('; '),
    userId: signInBodySchema.parse(signInResponse.body).user.id,
  }
}

async function flushAuthRateLimitCounters(redisService: RedisService): Promise<void> {
  const stream = redisService.client.scanStream({ match: 'platform:auth:*', count: 100 })
  for await (const batch of stream) {
    const keys = scanBatchSchema.parse(batch)
    if (keys.length > 0) {
      await redisService.client.del(...keys)
    }
  }
}

describe('AC2 — davet akışının tamamı, e-posta Mailpit üzerinden okunur', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let tenantId: string
  let tenantSlug: string
  let ownerCookie: string

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)

    tenantSlug = `ac2-${randomUUID().slice(0, 12)}`
    const tenant = await prismaService.db.tenant.create({
      data: { slug: tenantSlug, name: 'AC2 Davet Akışı Kiracısı', status: TenantStatus.active },
    })
    tenantId = tenant.id

    const owner = await createAuthenticatedSession(app.getHttpServer())
    ownerCookie = owner.cookieHeader

    await prismaService.withTenant(tenantId, (tx) =>
      tx.tenantMembership.create({
        data: { tenantId, userId: owner.userId, role: TenantRole.owner },
      }),
    )
  }, 90_000)

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

  it(
    'davet → (Mailpit, FRAGMAN) → kabul → rol değiştir → çıkar: dördü de yeşil; ' +
      'denetim izi dört satırı ZİNCİRLİYOR ve e-posta HİÇBİR satırda yok',
    async () => {
      await deleteAllMailpitMessages()

      // ⚠ BÜYÜK/KÜÇÜK HARF KARIŞIK adres bilinçli: normalizasyon (A-DB2'nin
      // zorlayıcısı) hem gönderim adresinde hem davet satırında hem de kabul
      // karşılaştırmasında ölçülür.
      const mixedCaseEmail = `AC2-MiXeD-${randomUUID().slice(0, 10)}@Arkesoft.TEST`
      const normalizedEmail = mixedCaseEmail.toLowerCase()
      const invitedAt = Date.now()

      // --- 1) DAVET -------------------------------------------------------
      const inviteResponse = await request(httpServer())
        .post('/trpc/member.invite')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ email: mixedCaseEmail, role: 'support' })

      expect(inviteResponse.status).toBe(200)
      const invite = z
        .object({ result: z.object({ data: memberInvitationSchema }) })
        .parse(inviteResponse.body).result.data

      // TTL sabiti KOPYALANMAZ, import edilir.
      const ttlMs = new Date(invite.expiresAt).getTime() - invitedAt
      expect(ttlMs).toBeGreaterThan(INVITATION_TTL_MS - 60_000)
      expect(ttlMs).toBeLessThanOrEqual(INVITATION_TTL_MS + 60_000)

      // --- 2) MAILPIT: alıcı NORMALİZE, belirteç FRAGMANDA ----------------
      const delivered = await findLatestMailpitMessageTo(normalizedEmail)
      expect(delivered.To.map((address) => address.Address)).toEqual([normalizedEmail])

      const inviteUrl = extractFirstUrl(delivered.Text)
      expect(
        inviteUrl.startsWith(`${BASE_ENV.AUTH_BASE_URL}${INVITATION_ACCEPT_PATH}#token=`),
      ).toBe(true)

      // ⚠ ÖLÇÜLDÜ, VARSAYILMADI: belirteç SORGU dizesinde DEĞİL → paylaşılan
      // `extractQueryParam` bu akışta FIRLATIR. Fragman seçiminin yük taşıyan
      // kanıtı budur.
      expect(new URL(inviteUrl).search).toBe('')
      expect(() => extractQueryParam(inviteUrl, 'token')).toThrow()

      const invitationToken = extractFragmentToken(inviteUrl, 'token')
      expect(invitationToken.startsWith(`${tenantId}.`)).toBe(true)

      // Davet satırı: adres NORMALİZE yazıldı, HAM belirteç SAKLANMADI.
      const invitationRow = await prismaService.withTenant(tenantId, (tx) =>
        tx.tenantInvitation.findUniqueOrThrow({
          where: { tenantId_email: { tenantId, email: normalizedEmail } },
          select: { id: true, email: true, role: true, tokenHash: true },
        }),
      )
      expect(invitationRow.id).toBe(invite.invitationId)
      expect(invitationRow.email).toBe(normalizedEmail)
      expect(invitationRow.role).toBe('support')
      expect(invitationRow.tokenHash).not.toBe(invitationToken)
      expect(invitationRow.tokenHash).toBe(
        createHash('sha256').update(invitationToken, 'utf8').digest('hex'),
      )

      // --- 3) KABUL: 14. muaf yol, kiracı başlığı YOK, oturum ZORUNLU ------
      const invitee = await createSessionForEmail(httpServer(), normalizedEmail)

      const unauthenticatedAccept = await request(httpServer())
        .post('/trpc/member.acceptInvitation')
        .set('Origin', TRUSTED_ORIGIN)
        .send({ token: invitationToken })
      expect(unauthenticatedAccept.status).toBe(401)

      const acceptResponse = await request(httpServer())
        .post('/trpc/member.acceptInvitation')
        .set('Cookie', invitee.cookieHeader)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ token: invitationToken })

      expect(acceptResponse.status).toBe(200)
      const accepted = z
        .object({ result: z.object({ data: memberInvitationAcceptedSchema }) })
        .parse(acceptResponse.body).result.data
      expect(accepted).toEqual({ accepted: true })

      // ⚠ ADR-0016 madde 6 koşul C: çıktıda kiracıya ait HİÇBİR alan yok.
      const acceptBodyText = JSON.stringify(acceptResponse.body)
      expect(acceptBodyText).not.toContain(tenantId)
      expect(acceptBodyText).not.toContain(tenantSlug)

      // Belirteç TEK KULLANIMLIK: ikinci kabul AYNI tek hatayı alır.
      const secondAccept = await request(httpServer())
        .post('/trpc/member.acceptInvitation')
        .set('Cookie', invitee.cookieHeader)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ token: invitationToken })
      expect(secondAccept.status).toBe(404)
      expect(trpcErrorEnvelopeSchema.parse(secondAccept.body).error.data.appError.code).toBe(
        'INVITATION_INVALID',
      )

      const afterAccept = await prismaService.withTenant(tenantId, async (tx) => ({
        membership: await tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId, userId: invitee.userId } },
          select: { role: true },
        }),
        pendingInvitations: await tx.tenantInvitation.count(),
      }))
      expect(afterAccept.membership).toEqual({ role: 'support' })
      expect(afterAccept.pendingInvitations).toBe(0)

      // --- 4) ROL DEĞİŞTİR -------------------------------------------------
      const updateResponse = await request(httpServer())
        .post('/trpc/member.updateRole')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ userId: invitee.userId, role: 'admin' })
      expect(updateResponse.status).toBe(200)

      // --- 5) ÇIKAR --------------------------------------------------------
      const removeResponse = await request(httpServer())
        .post('/trpc/member.remove')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ userId: invitee.userId })
      expect(removeResponse.status).toBe(200)

      const afterRemove = await prismaService.withTenant(tenantId, (tx) =>
        tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId, userId: invitee.userId } },
          select: { role: true },
        }),
      )
      expect(afterRemove).toBeNull()

      // --- 6) DENETİM İZİ: dört satır, ZİNCİRLİ, e-posta YOK ---------------
      const auditRows = await prismaService.withTenant(tenantId, (tx) =>
        tx.auditLog.findMany({
          orderBy: { createdAt: 'asc' },
          select: { action: true, actorUserId: true, subject: true, diff: true },
        }),
      )

      expect(auditRows.map((row) => row.action)).toEqual([
        'member_invited',
        'member_invitation_accepted',
        'member_role_changed',
        'member_removed',
      ])

      const [invited, acceptedRow, roleChanged, removed] = auditRows
      if (
        invited === undefined ||
        acceptedRow === undefined ||
        roleChanged === undefined ||
        removed === undefined
      ) {
        throw new Error('denetim izi dört satır beklerken eksik döndü')
      }

      // `member_invited` → `subject` DAVET kimliğidir (A-DB1).
      expect(invited.subject).toBe(invite.invitationId)
      expect(invitedDiffSchema.parse(invited.diff)).toEqual({ role: 'support' })

      // ⚠ ZİNCİR: kabul satırı daveti `diff.invitationId` üzerinden gösterir ve
      // `subject` artık ÜYE OLAN kullanıcıdır (eylem başına farklı anlam).
      expect(acceptedRow.subject).toBe(invitee.userId)
      expect(acceptedDiffSchema.parse(acceptedRow.diff)).toEqual({
        role: 'support',
        invitationId: invited.subject,
      })
      expect(acceptedRow.actorUserId).toBe(invitee.userId)

      expect(roleChanged.subject).toBe(invitee.userId)
      expect(roleChanged.diff).toEqual({ from: 'support', to: 'admin' })
      expect(removed.subject).toBe(invitee.userId)
      expect(removed.diff).toEqual({ role: 'admin' })

      // ⚠ E-POSTA DENETİM KAYDINA HİÇ GİRMEZ (veri modelinin yazılı kararı):
      // dört satırın TAMAMI taranır, hem karışık hem normalize biçim aranır.
      const auditText = JSON.stringify(auditRows)
      expect(auditText).not.toContain(normalizedEmail)
      expect(auditText).not.toContain(mixedCaseEmail)
      expect(auditText).not.toContain(invitationToken)
    },
    180_000,
  )
})

// ---------------------------------------------------------------------------
// `perf` İKAMESİ — ÖLÇÜM 2: SMTP transaction DIŞINDA **ve COMMIT'TEN SONRA**
// ---------------------------------------------------------------------------
//
// ⚠⚠ AYRIMI VEREN ASSERT: gönderim BAŞARISIZ olduğunda davet satırı VERİ
// TABANINDA KALIR. Ters sıra (gönder → commit) seçilmiş olsaydı satır HİÇ
// OLMAZDI — yani bu tek assert iki tasarımı birbirinden ayırır ve "commit'ten
// sonra gönderiliyor" iddiasını DAVRANIŞLA kanıtlar (yorum okuyarak değil).
//
// ⚠ TAŞIYICI İKİZİ SEÇİCİDİR ve bu ölçülerek seçildi: taşıyıcının TAMAMI
// fırlatacak olsaydı test aslının OTURUMU bile kurulamazdı (kayıt akışı
// e-posta doğrulama mesajını Mailpit'ten okuyor). İkiz yalnızca davet mesaj
// anahtarında fırlatır, diğer anahtarları GERÇEK SMTP taşıyıcısına delege eder.
describe('perf ikamesi ölçüm 2 — SMTP commit SONRASINDA çağrılır (sıra testi)', () => {
  let app: INestApplication<Server> | undefined
  let realTransport: SmtpMailTransport | undefined
  let prismaService: PrismaService
  let tenantId: string
  let tenantSlug: string
  let ownerCookie: string
  let getRecords: () => Record<string, unknown>[]

  beforeAll(async () => {
    const { stream, getRecords: readRecords } = createMemoryLogStream()
    getRecords = readRecords

    const transport = new SmtpMailTransport({
      host: BASE_ENV.SMTP_HOST,
      port: BASE_ENV.SMTP_PORT,
      secure: BASE_ENV.SMTP_SECURE,
      fromName: BASE_ENV.MAIL_FROM_NAME,
      fromAddress: BASE_ENV.MAIL_FROM_ADDRESS,
    })
    realTransport = transport

    const invitationFailingTwin: MailTransport = {
      send: (envelope: MailEnvelope): Promise<void> =>
        envelope.messageKey === 'tenant.memberInvitation'
          ? Promise.reject(new MailDeliveryFailedError(envelope.messageKey, null))
          : transport.send(envelope),
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(invitationFailingTwin)
      .overrideProvider(ROOT_LOGGER)
      .useFactory({
        factory: (env: ApiEnv): Logger => createRootLogger({ level: env.LOG_LEVEL, stream }),
        inject: [API_ENV],
      })
      .compile()

    const createdApp = moduleRef.createNestApplication<INestApplication<Server>>()
    await createdApp.init()
    app = createdApp

    await flushAuthRateLimitCounters(createdApp.get(RedisService))

    prismaService = createdApp.get(PrismaService)
    tenantSlug = `perf2-${randomUUID().slice(0, 12)}`
    const tenant = await prismaService.db.tenant.create({
      data: { slug: tenantSlug, name: 'perf ikamesi ölçüm 2', status: TenantStatus.active },
    })
    tenantId = tenant.id

    const owner = await createAuthenticatedSession(createdApp.getHttpServer())
    ownerCookie = owner.cookieHeader

    await prismaService.withTenant(tenantId, (tx) =>
      tx.tenantMembership.create({
        data: { tenantId, userId: owner.userId, role: TenantRole.owner },
      }),
    )
  }, 90_000)

  afterAll(async () => {
    if (app !== undefined) {
      await prismaService.db.tenant.delete({ where: { id: tenantId } })
      await app.close()
    }
    realTransport?.close()
  })

  it(
    'gönderim fırlatsa bile davet satırı COMMIT EDİLMİŞ hâlde DURUR; hata isRetryable:true ile yukarı gider; ' +
      'tekrar davet AYNI satırı görür (ikinci satır AÇILMAZ)',
    async () => {
      if (app === undefined) {
        throw new Error('test uygulaması henüz kurulmadı')
      }

      const email = `perf2-${randomUUID().slice(0, 10)}@arkesoft.test`

      // Yazma portunun SINIRINDA fırlatılan hatayı yakalar (gerekçe aşağıda).
      // ⚠ Orijinal metot sarmalamadan ÖNCE bağlanır; `mock.results` okumak
      // yerine bu yol seçildi çünkü oradaki değer tipsizdir ve testin
      // daraltma disiplinini (`unknown` + Zod/koruyucu) bozardı.
      const writeAdapter = app.get(MemberWritePortAdapter)
      const originalInvite = writeAdapter.invite.bind(writeAdapter)
      let portRejection: unknown
      const inviteSpy = vi.spyOn(writeAdapter, 'invite')
      inviteSpy.mockImplementation(async (tenantIdArg, actorUserIdArg, inputArg) => {
        try {
          return await originalInvite(tenantIdArg, actorUserIdArg, inputArg)
        } catch (error: unknown) {
          portRejection = error
          throw error
        }
      })

      const response = await request(app.getHttpServer())
        .post('/trpc/member.invite')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ email, role: 'staff' })

      expect(response.status).toBe(503)
      const envelope = trpcErrorEnvelopeSchema.parse(response.body)
      expect(envelope.error.data.appError.code).toBe('MAIL_DELIVERY_FAILED')

      // ⚠⚠ AYRIMI VEREN ASSERT — ters sırada bu satır OLMAZDI.
      const afterFailure = await prismaService.withTenant(tenantId, async (tx) => ({
        invitations: await tx.tenantInvitation.findMany({
          select: { id: true, email: true, role: true },
        }),
        auditCount: await tx.auditLog.count(),
      }))
      expect(afterFailure.invitations).toHaveLength(1)
      const [pendingInvitation] = afterFailure.invitations
      expect(pendingInvitation?.email).toBe(email)
      expect(pendingInvitation?.role).toBe('staff')
      expect(pendingInvitation?.id.length).toBeGreaterThan(0)
      // Denetim kaydı da AYNI transaction'da commit edildi.
      expect(afterFailure.auditCount).toBe(1)

      // ⚠ `isRetryable` TEL GÖVDESİNDE TAŞINMAZ (platformun yazılı tel
      // sözleşmesi dört alandır). "Hata isRetryable:true ile YUKARI GİDİYOR"
      // iddiası yazma portunun SINIRINDA ölçülür: port'un döndürdüğü
      // promise'in reddi yakalanır ve sınıflandırması okunur. Bu aynı zamanda
      // "servis hatayı yutmadı/yeniden sınıflandırmadı" iddiasının da
      // kanıtıdır.
      expect(inviteSpy.mock.calls.length).toBe(1)

      if (!isAppError(portRejection)) {
        throw new Error('davet portunun reddi bir AppError değil')
      }
      expect(portRejection.code).toBe('MAIL_DELIVERY_FAILED')
      expect(portRejection.isRetryable).toBe(true)

      // Tel gövdesi bu bayrağı TAŞIMAZ.
      expect(JSON.stringify(response.body)).not.toContain('isRetryable')

      // ⚠⚠ BU ASSERT T-014 DÜZELTME TURU 1'DE GERÇEĞE ÇEKİLDİ, GEVŞETİLMEDİ
      // (`solid` M-1 + `security` medium #1). ESKİ hâli "MAIL_DELIVERY_FAILED
      // içeren HİÇBİR log kaydı YOK" diyordu ve o olgu, raporlanan kusurun ta
      // kendisiydi: sözleşme katmanının hata sınırı tanıdığı `AppError`'lar
      // için HİÇ log yazmıyordu, yani tRPC yolundaki her domain hatası
      // (yetki reddi dahil) görünmezdi. Sınır artık SINIRDA TEK bir
      // yapılandırılmış kayıt yazıyor; assert "yokluk" yerine "TAM OLARAK BİR
      // kayıt + doğru seviye + doğru alanlar" ölçüyor — bu bir SIKILAŞTIRMADIR.
      const mailFailureRecords = getRecords().filter(
        (record) => record['code'] === 'MAIL_DELIVERY_FAILED',
      )
      expect(mailFailureRecords).toHaveLength(1)
      const [mailFailureRecord] = mailFailureRecords
      if (mailFailureRecord === undefined) {
        throw new Error('MAIL_DELIVERY_FAILED için hata sınırı kaydı bulunamadı')
      }
      // 503 bir 5xx → seviye `error` (CLAUDE.md §4 "müdahale gerekir").
      expect(mailFailureRecord['level']).toBe('error')
      expect(mailFailureRecord['msg']).toBe('trpc.error-boundary.app-error')
      expect(mailFailureRecord['httpStatus']).toBe(503)
      // ⚠ `isRetryable` ARTIK LOGDA GÖRÜNÜR (tel gövdesinde hâlâ YOK):
      // kuyruk davranışını kodlayan bayrak operatör için gözlemlenebilir.
      expect(mailFailureRecord['isRetryable']).toBe(true)
      // ⚠ E-POSTA HİÇBİR KAYITTA YOK — log hijyeni bu eklemeyle BOZULMADI.
      expect(JSON.stringify(getRecords())).not.toContain(email)

      // ⚠ TEKRAR DAVET: satır CANLI olduğu için adres bazlı bekleme süresi
      // devreye girer (`upsert` İKİNCİ bir satır açmaz). Bu, satırın
      // uygulama yolundan da gözlenebildiğinin kanıtıdır — doğrudan veri
      // katmanı okumasının BAĞIMSIZ ikinci tanığı.
      const retry = await request(app.getHttpServer())
        .post('/trpc/member.invite')
        .set('Cookie', ownerCookie)
        .set('x-arkesoft-tenant', tenantSlug)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ email, role: 'staff' })

      expect(retry.status).toBe(409)
      expect(trpcErrorEnvelopeSchema.parse(retry.body).error.data.appError.code).toBe(
        'INVITATION_RESEND_TOO_SOON',
      )
      // Bekleme süresi sabiti KOPYALANMAZ — bu testin anlamlı olması için
      // pozitif olması yeterlidir ve değeri kaynaktan okunur.
      expect(INVITATION_RESEND_COOLDOWN_MS).toBeGreaterThan(0)

      const afterRetry = await prismaService.withTenant(tenantId, (tx) =>
        tx.tenantInvitation.count(),
      )
      expect(afterRetry).toBe(1)
    },
    120_000,
  )
})
