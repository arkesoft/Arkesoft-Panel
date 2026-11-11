// @arkesoft/trpc — `member.*` ve izin kapısının DAVRANIŞ testleri (ROADMAP
// v0.0.14, T-014/S2, architect K-A5/K-A6/K-A9)
//
// ⚠ Bu dosya `permissionProcedure`'ü DOLAYLI olarak (gerçek `appRouter`
// üzerinden) koşturur; fabrikayı DOĞRUDAN çağırmaz — ama kayıt kirlenmesine
// karşı asıl koruma, tutarlılık assert'lerinin AYRI dosyada
// (`authz-consistency.test.ts`) yaşaması ve Vitest'in dosya başına ayrı modül
// grafiği kullanmasıdır (`../authz/permission-usage.ts` yorumu).
//
// ⚠ AC1'in TAM matrisi (`readonly` 403 / `owner` 2xx, her yazma ucu için)
// `apps/api` tarafında gerçek HTTP yüzeyi üzerinde AYRI bir alt görevde
// ölçülür; burada ölçülen şey SÖZLEŞME KATMANININ kendisidir: izin kapısı
// doğru kararı veriyor mu, hata gövdesi doğru şekilde mi, resolver porta
// doğru argümanları mı geçiyor.

import { isTRPCClientError } from '@trpc/client'
import { describe, expect, it } from 'vitest'

import {
  HARNESS_JOB_SUMMARY,
  HARNESS_MEMBER_INVITATION,
  HARNESS_TENANT_SUMMARY,
  HarnessInvitationInvalidError,
  createClientForContext,
  createFakeErrorFactoryPort,
  createFakeJobReadPort,
  createFakeMembershipReadPort,
  createFakeSessionListReadPort,
  createFakeSessionSecurityReadPort,
  createFakeStorefrontTenantReadPort,
  createFakeTenantReadPort,
  createFakeTenantSecurityWritePort,
  createHarness,
  createRecordingLogger,
} from './harness.js'
import { tenantRoleSchema } from '../schemas/member.schema.js'
import type { TrpcContext } from '../context/trpc-context.types.js'
import type { MemberWritePort } from '../ports/member-write.port.js'
import type { AppRouter } from '../routers/app.router.js'

/** `isTRPCClientError` daraltmasını tek yerde yapan yardımcı — her testte altı satır tekrarlanmaz. */
async function expectTrpcError(call: Promise<unknown>): Promise<{
  readonly code: string | undefined
  readonly httpStatus: number | undefined
  readonly appErrorCode: string | undefined
  readonly message: string | undefined
  readonly details: Record<string, unknown> | undefined
}> {
  let caught: unknown
  try {
    await call
    throw new Error('beklenen hata fırlatılmadı — çağrı BAŞARILI oldu')
  } catch (error) {
    caught = error
  }

  if (!isTRPCClientError<AppRouter>(caught)) {
    throw new Error(`beklenen TRPCClientError değil: ${String(caught)}`)
  }

  return {
    code: caught.data?.code,
    httpStatus: caught.data?.httpStatus,
    appErrorCode: caught.data?.appError.code,
    message: caught.data?.appError.message,
    details: caught.data?.appError.details,
  }
}

const VALID_INVITE = { email: 'yeni.uye@example.com', role: 'staff' } as const

describe('member.invite — permissionProcedure(member:write) başarı yolu', () => {
  it("port'un döndürdüğü daveti tele TAŞIR ve çıktı TAM OLARAK iki alandır", async () => {
    const harness = createHarness({ membershipRole: 'owner' })

    const result = await harness.client.member.invite.mutate(VALID_INVITE)

    expect(result).toEqual(HARNESS_MEMBER_INVITATION)
    // Küme eşitliği — e-posta ve BELİRTEÇ tele yazılmaz (K-A9).
    expect(Object.keys(result).sort()).toEqual(['expiresAt', 'invitationId'])
  })

  it('⚠ kiracı kimliği HOST ÇÖZÜMÜNDEN, aktör kimliği KİMLİK BAĞLAMINDAN porta geçer (girdiden DEĞİL)', async () => {
    const harness = createHarness({ membershipRole: 'admin' })

    await harness.client.member.invite.mutate(VALID_INVITE)

    expect(harness.memberWriteCalls).toEqual([
      {
        method: 'invite',
        tenantId: HARNESS_TENANT_SUMMARY.id,
        actorUserId: 'user_harness_01',
        input: VALID_INVITE,
      },
    ])
  })

  it('⚠ perf ikamesi (sözleşme tarafı) — izinli çağrı üyelik satırını TAM BİR KEZ okur', async () => {
    const harness = createHarness({ membershipRole: 'owner' })

    await harness.client.member.invite.mutate(VALID_INVITE)

    expect(harness.membershipReadCalls).toEqual([
      { tenantId: HARNESS_TENANT_SUMMARY.id, userId: 'user_harness_01' },
    ])
  })
})

describe('member.invite — girdi doğrulaması resolver ÖNCESİ durdurur', () => {
  it("role: 'owner' YAPISAL olarak reddedilir ve port HİÇ çağrılmaz (K-A4)", async () => {
    const harness = createHarness({ membershipRole: 'owner' })

    await expect(
      // @ts-expect-error — `'owner'` davet edilebilir rol birleşiminde YOK:
      // bu satır AYNI ANDA tip düzeyinde de kanıt (girdi tipi daraltılmış).
      harness.client.member.invite.mutate({ email: 'a@example.com', role: 'owner' }),
    ).rejects.toThrow()

    expect(harness.memberWriteCalls).toEqual([])
  })

  it('geçersiz e-posta reddedilir ve port HİÇ çağrılmaz', async () => {
    const harness = createHarness({ membershipRole: 'owner' })

    await expect(
      harness.client.member.invite.mutate({ email: 'bu-bir-eposta-degil', role: 'staff' }),
    ).rejects.toThrow()

    expect(harness.memberWriteCalls).toEqual([])
  })

  it('geçerli e-posta KABUL edilir (yukarıdaki red VACUOUS değil — şema her şeyi reddetmiyor)', async () => {
    const harness = createHarness({ membershipRole: 'owner' })

    await expect(harness.client.member.invite.mutate(VALID_INVITE)).resolves.toEqual(
      HARNESS_MEMBER_INVITATION,
    )
  })
})

describe('AC1 (sözleşme tarafı) — member:write taşımayan ÜÇ rol, ÜÇ yazma ucunda 403', () => {
  const rolesWithoutMemberWrite = ['staff', 'support', 'readonly'] as const

  for (const role of rolesWithoutMemberWrite) {
    it(`${role} → member.invite 403 PERMISSION_DENIED`, async () => {
      const harness = createHarness({ membershipRole: role })

      const error = await expectTrpcError(harness.client.member.invite.mutate(VALID_INVITE))

      expect(error.code).toBe('FORBIDDEN')
      expect(error.httpStatus).toBe(403)
      expect(error.appErrorCode).toBe('PERMISSION_DENIED')
      // ⚠ Gövde şekli üyelik hatasıyla BİREBİR: i18n ANAHTARI (ham metin
      // değil) + BOŞ `details`. İzin adı ve rol tele GİRMEZ (K-A6).
      expect(error.message).toBe('errors.authz.permissionDenied')
      expect(error.details).toEqual({})
      // ⚠ Kapı porta HİÇ ULAŞMADAN durdurdu — yetki kontrolü iş mantığından
      // ÖNCE koşuyor (yazma yan etkisi doğmuyor).
      expect(harness.memberWriteCalls).toEqual([])
    })

    it(`${role} → member.updateRole ve member.remove de 403`, async () => {
      const harness = createHarness({ membershipRole: role })

      const updateError = await expectTrpcError(
        harness.client.member.updateRole.mutate({ userId: 'user_target', role: 'admin' }),
      )
      const removeError = await expectTrpcError(
        harness.client.member.remove.mutate({ userId: 'user_target' }),
      )

      expect(updateError.appErrorCode).toBe('PERMISSION_DENIED')
      expect(updateError.httpStatus).toBe(403)
      expect(removeError.appErrorCode).toBe('PERMISSION_DENIED')
      expect(removeError.httpStatus).toBe(403)
      expect(harness.memberWriteCalls).toEqual([])
    })
  }

  it("owner ve admin ÜÇ ucun ÜÇÜNDE DE 2xx alır (403'ler VACUOUS değil — kapı herkesi reddetmiyor)", async () => {
    for (const role of ['owner', 'admin'] as const) {
      const harness = createHarness({ membershipRole: role })

      await expect(harness.client.member.invite.mutate(VALID_INVITE)).resolves.toEqual(
        HARNESS_MEMBER_INVITATION,
      )
      await expect(
        harness.client.member.updateRole.mutate({ userId: 'user_target', role: 'support' }),
      ).resolves.toEqual({ userId: 'user_target', role: 'support' })
      await expect(harness.client.member.remove.mutate({ userId: 'user_target' })).resolves.toEqual(
        { userId: 'user_target' },
      )
    }
  })
})

describe('member.updateRole — sahiplik DEVRİ ayrı bir uç DEĞİL (K-A11)', () => {
  it("role: 'owner' GEÇERLİDİR ve porta OLDUĞU GİBİ geçer (devir = updateRole)", async () => {
    const harness = createHarness({ membershipRole: 'owner' })

    const result = await harness.client.member.updateRole.mutate({
      userId: 'user_yeni_sahip',
      role: 'owner',
    })

    expect(result).toEqual({ userId: 'user_yeni_sahip', role: 'owner' })
    expect(harness.memberWriteCalls).toEqual([
      {
        method: 'updateRole',
        tenantId: HARNESS_TENANT_SUMMARY.id,
        actorUserId: 'user_harness_01',
        input: { userId: 'user_yeni_sahip', role: 'owner' },
      },
    ])
  })

  it('boş userId girdi doğrulamasında REDDEDİLİR', async () => {
    const harness = createHarness({ membershipRole: 'owner' })

    await expect(
      harness.client.member.updateRole.mutate({ userId: '', role: 'admin' }),
    ).rejects.toThrow()
    expect(harness.memberWriteCalls).toEqual([])
  })
})

describe('member.acceptInvitation — protectedProcedure, KİRACIDAN MUAF (ADR-0016 madde 6)', () => {
  it("tenant context YOKKEN BAŞARIYLA çalışır (kiracı bağlamı YETENEKTEN türetilir, host'tan DEĞİL)", async () => {
    const harness = createHarness({ tenant: { kind: 'absent' } })

    const result = await harness.client.member.acceptInvitation.mutate({ token: 'tnt_01.s3cr3t' })

    expect(result).toEqual({ accepted: true })
    // ⚠ Koşul C: çıktı kiracıya ait HİÇBİR alan taşımaz — küme eşitliği.
    expect(Object.keys(result)).toEqual(['accepted'])
  })

  it('üyelik portuna HİÇ dokunmaz (izin kapısı zincirde YOK — kabul eden kişi tanım gereği üye değil)', async () => {
    const harness = createHarness({ tenant: { kind: 'absent' }, membershipRole: null })

    await harness.client.member.acceptInvitation.mutate({ token: 'tnt_01.s3cr3t' })

    // ⚠ `membershipRole: null` olmasına rağmen çağrı BAŞARILI: kapı zincirde
    // olsaydı `TENANT_MEMBERSHIP_REQUIRED` ile düşerdi. Sayım da sıfır.
    expect(harness.membershipReadCalls).toEqual([])
  })

  it("port'a YALNIZCA kimlik ve belirteç geçer (kiracı kimliği imzada YOK)", async () => {
    const harness = createHarness({ tenant: { kind: 'absent' } })

    await harness.client.member.acceptInvitation.mutate({ token: 'tnt_01.s3cr3t' })

    expect(harness.memberWriteCalls).toEqual([
      {
        method: 'acceptInvitation',
        userId: 'user_harness_01',
        input: { token: 'tnt_01.s3cr3t' },
      },
    ])
  })

  it('anonim context\'te 401 UNAUTHENTICATED (kimlik ZORUNLU — "kiracıdan muaf" ≠ "kimlikten muaf")', async () => {
    const harness = createHarness({ auth: { kind: 'anonymous' }, tenant: { kind: 'absent' } })

    const error = await expectTrpcError(
      harness.client.member.acceptInvitation.mutate({ token: 'tnt_01.s3cr3t' }),
    )

    expect(error.code).toBe('UNAUTHORIZED')
    expect(error.httpStatus).toBe(401)
    expect(error.appErrorCode).toBe('UNAUTHENTICATED')
    expect(harness.memberWriteCalls).toEqual([])
  })

  it("boş belirteç girdi doğrulamasında REDDEDİLİR (resolver'a ulaşmaz)", async () => {
    const harness = createHarness({ tenant: { kind: 'absent' } })

    await expect(harness.client.member.acceptInvitation.mutate({ token: '' })).rejects.toThrow()
    expect(harness.memberWriteCalls).toEqual([])
  })
})

describe('MemberWritePort totalliği — port hatası tele YANSIR (resolver null kontrolü YAPMAZ)', () => {
  it('port AppError fırlatınca 404 + INVITATION_INVALID', async () => {
    // ⚠ Bu test port düzeyinde FARKLI bir davranış istiyor; harness'te port
    // override alanı BİLEREK yok (po R-P2 — alan adı zorunlu üyenin adıyla
    // çakışırsa grep kapısı kalıcı yanlış pozitif verir), bu yüzden
    // `procedures.test.ts`'teki YAZILI kaçış yolu kullanılır: çağıran kendi
    // `TrpcContext`'ini kurar.
    const throwingMemberWrite: MemberWritePort = {
      invite: () => Promise.reject(new HarnessInvitationInvalidError()),
      acceptInvitation: () => Promise.reject(new HarnessInvitationInvalidError()),
      updateRole: () => Promise.reject(new HarnessInvitationInvalidError()),
      remove: () => Promise.reject(new HarnessInvitationInvalidError()),
    }

    const context: TrpcContext = {
      requestId: 'req_member_port_totality',
      logger: createRecordingLogger(),
      auth: { kind: 'authenticated', userId: 'user_42', sessionId: 'session_42' },
      tenant: {
        kind: 'resolved',
        tenantId: HARNESS_TENANT_SUMMARY.id,
        slug: HARNESS_TENANT_SUMMARY.slug,
        status: HARNESS_TENANT_SUMMARY.status,
      },
      ports: {
        tenantRead: createFakeTenantReadPort(HARNESS_TENANT_SUMMARY),
        tenantSecurityWrite: createFakeTenantSecurityWritePort(),
        storefrontTenantRead: createFakeStorefrontTenantReadPort(HARNESS_TENANT_SUMMARY),
        jobRead: createFakeJobReadPort(HARNESS_JOB_SUMMARY),
        membershipRead: createFakeMembershipReadPort('owner'),
        memberWrite: throwingMemberWrite,
        sessionSecurityRead: createFakeSessionSecurityReadPort(),
        // ROADMAP v0.0.15.1, T-017/S4 — ZORUNLU üye; bu test `session.list`
        // ÇAĞIRMAZ, stub yalnızca sözleşmeyi doldurur.
        sessionListRead: createFakeSessionListReadPort(),
      },
      errors: createFakeErrorFactoryPort(),
    }

    const client = createClientForContext(context)

    const error = await expectTrpcError(client.member.acceptInvitation.mutate({ token: 'tnt.x' }))

    expect(error.code).toBe('NOT_FOUND')
    expect(error.httpStatus).toBe(404)
    expect(error.appErrorCode).toBe('INVITATION_INVALID')
    expect(error.details).toEqual({})
  })
})

describe("job.* izinli builder'a taşındı — DAVRANIŞ BİREBİR KORUNDU (K-A13, S5 teyidi)", () => {
  it('BEŞ ROLÜN BEŞİ DE job.get çağırabilir (hiçbir yetenek kaldırılmadı)', async () => {
    // ⚠ Katalog verisini ölçen assert `permissions-catalog.test.ts`'te; bu
    // test aynı şeyi UÇTAN UCA, gerçek istemci üzerinden ölçer — katalog
    // doğru ama kapı yanlış kurulmuş olabilirdi.
    for (const role of tenantRoleSchema.options) {
      const harness = createHarness({ membershipRole: role })

      await expect(
        harness.client.job.get.query({ jobId: HARNESS_JOB_SUMMARY.id }),
      ).resolves.toEqual(HARNESS_JOB_SUMMARY)
      await expect(harness.client.job.list.query({})).resolves.toEqual({
        items: [HARNESS_JOB_SUMMARY],
        nextCursor: null,
      })
    }

    expect(tenantRoleSchema.options.length).toBe(5)
  })

  it('izinli çağrı üyelik satırını TAM BİR KEZ okur (job.get için de — perf ikamesi)', async () => {
    const harness = createHarness({ membershipRole: 'readonly' })

    await harness.client.job.get.query({ jobId: HARNESS_JOB_SUMMARY.id })

    expect(harness.membershipReadCalls).toEqual([
      { tenantId: HARNESS_TENANT_SUMMARY.id, userId: 'user_harness_01' },
    ])
  })

  it('üyelik satırı YOKSA izin kapısı üyelik hatasını YUKARI TAŞIR (port TOTAL — ikinci savunma hattı)', async () => {
    const harness = createHarness({ membershipRole: null })

    const error = await expectTrpcError(
      harness.client.job.get.query({ jobId: HARNESS_JOB_SUMMARY.id }),
    )

    expect(error.code).toBe('FORBIDDEN')
    expect(error.httpStatus).toBe(403)
    expect(error.appErrorCode).toBe('TENANT_MEMBERSHIP_REQUIRED')
  })

  it('izinSİZ prosedürler üyelik portuna HİÇ dokunmaz (tenant.current / session.me)', async () => {
    const harness = createHarness({ membershipRole: null })

    await harness.client.session.me.query()
    await harness.client.tenant.current.query()

    // ⚠ `membershipRole: null` olmasına rağmen ikisi de BAŞARILI: üçüncü bir
    // okuma yok, izin kapısı yalnızca izinli builder'ın zincirinde.
    expect(harness.membershipReadCalls).toEqual([])
  })
})
