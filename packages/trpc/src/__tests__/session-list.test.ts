// @arkesoft/trpc — `session.list` prosedür testleri (ROADMAP v0.0.15.1,
// T-017/S4, architect "TASARIM" bölümü)
//
// `session.list` `protectedProcedure`'dür — `tenantProcedure` DEĞİL
// (`Session`'da `tenantId` YOK, kiracı daraltması ANLAMSIZ), `permissionProcedure`
// DEĞİL (oturum KULLANICIYA ait, kiracı rolüne bağlı bir izin yok —
// `session.me`'nin birebir EMSALİ). Port TOTAL'dır (ADR-0009 madde 3) —
// FIRLATMAZ, boş dizi döner; bu yüzden bu dosyada "bulunamadı" hata testi
// YOKTUR (`job.get`/`tenant.current` port-totalliği testlerinin TERSİNE, o
// portlar FIRLAYABİLİR).
//
// ⚠ TENANT ÇAPRAZ ERİŞİM TESTİ BİLEREK YOK: `Session` tablosunda `tenant_id`
// kolonu YOK (po doğruladı, `schema.prisma:187-202`) — izolasyon ekseni bu
// kaynak için YAPISAL OLARAK UYGULANAMAZ, test etmek var olmayan bir kapıyı
// test ediyormuş gibi görünürdü. Kimlik bazlı izolasyon (kullanıcı X kullanıcı
// Y'nin oturumlarını GÖREMEZ) `apps/api`'nin adaptör testinin (S9) kapsamıdır
// — port burada sahte ve TOTAL'dır, sahiplik karşılaştırmasını simüle etmez
// (`createFakeJobReadPort`'un AYNI yazılı gerekçesi, `harness.ts`).

import { isTRPCClientError } from '@trpc/client'
import { describe, expect, it } from 'vitest'

import { createFakeSessionListReadPort, createHarness } from './harness.js'
import type { ActiveSessionWire } from '../schemas/session-summary.schema.js'
import type { AppRouter } from '../routers/app.router.js'

const SAMPLE_SESSION: ActiveSessionWire = {
  id: 'session_harness_01',
  isCurrent: true,
  browserFamily: 'chrome',
  osFamily: 'macos',
  ipAddress: null,
  lastSeenAt: '2026-11-03T09:00:00.000Z',
  createdAt: '2026-11-01T09:00:00.000Z',
  expiresAt: '2026-11-08T09:00:00.000Z',
}

describe('session.list (protectedProcedure) — ROADMAP v0.0.15.1, T-017/S4', () => {
  it("port'un döndürdüğü ActiveSessionWire dizisini tele TAŞIR (sıfır dallanma, tek ifade)", async () => {
    const harness = createHarness({
      sessionListRead: createFakeSessionListReadPort([SAMPLE_SESSION]),
    })

    const result = await harness.client.session.list.query()

    expect(result).toEqual([SAMPLE_SESSION])
    // ⚠ Küme eşitliği — `token`/ham `userAgent` tele YAZILMAZ (K5, bu dosya
    // yasağın DENETLEYİCİSİ, AGENT_BASELINE.md §5).
    expect(Object.keys(result[0] ?? {}).sort()).toEqual([
      'browserFamily',
      'createdAt',
      'expiresAt',
      'id',
      'ipAddress',
      'isCurrent',
      'lastSeenAt',
      'osFamily',
    ])
    expect(Object.keys(result[0] ?? {})).not.toContain('token')
  })

  it('port TOTAL — hiç aktif oturum yoksa boş dizi döner (FIRLATMAZ, vacuity karşıtı: port.ts dosyasının TOTAL iddiası burada ÖLÇÜLÜR)', async () => {
    const harness = createHarness({ sessionListRead: createFakeSessionListReadPort([]) })

    await expect(harness.client.session.list.query()).resolves.toEqual([])
  })

  it('ctx.auth.userId ve ctx.auth.sessionId OLDUĞU GİBİ porta geçer (girdi YOK — kimlik bağlamından, kimlikten DEĞİL)', async () => {
    const calls: { userId: string; currentSessionId: string }[] = []
    const harness = createHarness({
      auth: { kind: 'authenticated', userId: 'user_99', sessionId: 'session_99' },
      sessionListRead: {
        listOwnSessions(userId, currentSessionId) {
          calls.push({ userId, currentSessionId })
          return Promise.resolve([SAMPLE_SESSION])
        },
      },
    })

    await harness.client.session.list.query()

    expect(calls).toEqual([{ userId: 'user_99', currentSessionId: 'session_99' }])
  })

  it("anonim context'te 401 UNAUTHORIZED (protectedProcedure — tenant.current'ın TERSİNE, tenant context GEREKMEZ)", async () => {
    const harness = createHarness({ auth: { kind: 'anonymous' }, tenant: { kind: 'absent' } })

    let caught: unknown
    try {
      await harness.client.session.list.query()
      throw new Error("beklenen hata fırlatılmadı — session.list anonim context'te BAŞARILI oldu")
    } catch (error) {
      caught = error
    }

    if (!isTRPCClientError<AppRouter>(caught)) {
      throw new Error(`beklenen TRPCClientError değil: ${String(caught)}`)
    }

    expect(caught.data?.code).toBe('UNAUTHORIZED')
    expect(caught.data?.httpStatus).toBe(401)
    expect(caught.data?.appError.code).toBe('UNAUTHENTICATED')
  })

  it('izinsiz prosedür — üyelik portuna HİÇ dokunmaz (tenant.current/session.me ile AYNI sınıf, authz-consistency.test.ts ungated listesinin davranış kanıtı)', async () => {
    const harness = createHarness({ membershipRole: null })

    await harness.client.session.list.query()

    expect(harness.membershipReadCalls).toEqual([])
  })
})
