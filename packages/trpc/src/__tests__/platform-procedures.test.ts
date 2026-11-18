// @arkesoft/trpc — `platform.*` ve `platformAdminProcedure`'ün DAVRANIŞ
// testleri (ROADMAP v0.0.20, T-021/S5, architect "tRPC — yeni `platform`
// router'ı" bölümü, ADR-0023 Karar 1/2)
//
// ⚠ Bu dosya `member-procedures.test.ts`'in AYNI desenini izler: tutarlılık
// (beyan ↔ gerçek yüzey) assert'leri AYRI dosyada (`authz-consistency.test.ts`)
// yaşar; burada ölçülen şey SÖZLEŞME KATMANININ DAVRANIŞIdır — kapı doğru
// kararı veriyor mu, hata kodu doğru mu, resolver porta/porttan doğru veriyi
// taşıyor mu.
//
// ⭐⭐ "ÇAPRAZ EKSEN İZOLASYONU" (CLAUDE.md §7'nin `createTenantIsolationSuite()`
// gerekliliğinin bu sürümdeki KARŞILIĞI): architect "yeni kiracı tablosu
// olmadığı için prob eklenmez" dedi (`platform_admin`/`platform_audit_log`
// PLATFORM seviyesi, `TENANT_SCOPED_TABLES` DEĞİŞMEDİ) — DB seviyeli çapraz
// kiracı testi `apps/api`/S7'nin (gerçek Postgres+RLS) işidir. Bu dosyanın
// hermetik katmanda kanıtlayabileceği ve kanıtladığı şey farklı bir eksendir:
// platform yetkisi KİRACI ÜYELİK SİSTEMİNE SIFIR BAĞIMLI (üyelik portu HİÇ
// okunmaz, kiracı bağlamı HİÇ gerekmez) — ADR-0023 Karar 1'in "platform
// yöneticisi olmak TEK BAŞINA sıfır kiracı verisi erişimi verir" iddiasının
// TERSİNİ de ölçer: kiracı durumunun (üye/değil, çözülmüş/absent) platform
// erişimine HİÇBİR etkisi yok.

import { isTRPCClientError } from '@trpc/client'
import { describe, expect, it } from 'vitest'

import {
  HARNESS_PLATFORM_AUDIT_ENTRY,
  HARNESS_PLATFORM_TENANT_SUMMARY,
  createFakePlatformAdminReadPort,
  createFakePlatformReadPort,
  createHarness,
} from './harness.js'
import type { AppRouter } from '../routers/app.router.js'

/** `member-procedures.test.ts`'teki `expectTrpcError`'ın BİREBİR aynısı — iki dosya aynı yardımcıyı AYRI tutar (po R-P2'nin AYNI gerekçesi: paylaşılan bir yardımcı, harness'in zorunlu alan adlarıyla çakışma riski taşımaz ama test dosyaları arasında ekstra bir ortak modül İCAT ETMEMEK tercih edildi). */
async function expectTrpcError(call: Promise<unknown>): Promise<{
  readonly code: string | undefined
  readonly httpStatus: number | undefined
  readonly appErrorCode: string | undefined
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
  }
}

describe('platform.session — protectedProcedure, platformAdminProcedure KAPISININ DIŞINDA', () => {
  it('yönetici DEĞİL ve 2FA YOK → 403 FIRLAMAZ, {false,false} döner (AC-4(a) ön koşulu)', async () => {
    const harness = createHarness({
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: false,
        twoFactorEnabled: false,
      }),
    })

    const result = await harness.client.platform.session.query()

    expect(result).toEqual({ isPlatformAdmin: false, twoFactorEnabled: false })
  })

  it('yönetici AMA 2FA YOK → yine FIRLAMAZ, {true,false} döner (kuruluma yönlendirme sinyali)', async () => {
    const harness = createHarness({
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: false,
      }),
    })

    const result = await harness.client.platform.session.query()

    expect(result).toEqual({ isPlatformAdmin: true, twoFactorEnabled: false })
  })

  it('yönetici VE 2FA VAR → {true,true} döner', async () => {
    const harness = createHarness({
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: true,
      }),
    })

    const result = await harness.client.platform.session.query()

    expect(result).toEqual({ isPlatformAdmin: true, twoFactorEnabled: true })
  })

  it('çıktı TAM OLARAK iki alandır (sızdırmazlık — `.output()` YAPISI)', async () => {
    const harness = createHarness()

    const result = await harness.client.platform.session.query()

    expect(Object.keys(result).sort()).toEqual(['isPlatformAdmin', 'twoFactorEnabled'])
  })

  it('kimliksiz çağrı 401 UNAUTHENTICATED (protectedProcedure — platform yetkisi YOKSAYILMAZ, önce KİMLİK gerekir)', async () => {
    const harness = createHarness({ auth: { kind: 'anonymous' }, tenant: { kind: 'absent' } })

    const error = await expectTrpcError(harness.client.platform.session.query())

    expect(error.code).toBe('UNAUTHORIZED')
    expect(error.httpStatus).toBe(401)
  })

  it("kiracı bağlamı ABSENT olsa da ÇALIŞIR (süper admin host'u rezerve alt alan adı — `ctx.tenant` HİÇ okunmaz)", async () => {
    const harness = createHarness({
      tenant: { kind: 'absent' },
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: true,
      }),
    })

    const result = await harness.client.platform.session.query()

    expect(result).toEqual({ isPlatformAdmin: true, twoFactorEnabled: true })
  })
})

describe('platformAdminProcedure — kapı ADIM (a): platform_admin kaydı YOK', () => {
  it('403 PLATFORM_ADMIN_REQUIRED — 2FA DURUMU HİÇ OKUNMAZ (ilk adım durdurur)', async () => {
    const harness = createHarness({
      tenant: { kind: 'absent' },
      platformAdminRead: createFakePlatformAdminReadPort({ isPlatformAdmin: false }),
    })

    const error = await expectTrpcError(harness.client.platform.tenantList.query({}))

    expect(error.code).toBe('FORBIDDEN')
    expect(error.httpStatus).toBe(403)
    expect(error.appErrorCode).toBe('PLATFORM_ADMIN_REQUIRED')
  })

  it('auditLog İÇİN DE AYNI kapı — yol bağımsız, builder bağımlı', async () => {
    const harness = createHarness({
      tenant: { kind: 'absent' },
      platformAdminRead: createFakePlatformAdminReadPort({ isPlatformAdmin: false }),
    })

    const error = await expectTrpcError(harness.client.platform.auditLog.query({}))

    expect(error.appErrorCode).toBe('PLATFORM_ADMIN_REQUIRED')
  })
})

describe('platformAdminProcedure — kapı ADIM (b): kayıt VAR, 2FA YOK', () => {
  it('403 TWO_FACTOR_REQUIRED (401 DEĞİL — kimlik+yönetici kurulu, eksik olan 2FA)', async () => {
    const harness = createHarness({
      tenant: { kind: 'absent' },
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: false,
      }),
    })

    const error = await expectTrpcError(harness.client.platform.tenantList.query({}))

    expect(error.code).toBe('FORBIDDEN')
    expect(error.httpStatus).toBe(403)
    expect(error.appErrorCode).toBe('TWO_FACTOR_REQUIRED')
  })
})

describe('platform.tenantList — platformAdminProcedure başarı yolu', () => {
  it("port'un döndürdüğü diziyi `{tenants}` ile SARMALAR (sıfır dallanma)", async () => {
    const harness = createHarness({
      tenant: { kind: 'absent' },
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: true,
      }),
      platformRead: createFakePlatformReadPort([HARNESS_PLATFORM_TENANT_SUMMARY], []),
    })

    const result = await harness.client.platform.tenantList.query({})

    expect(result).toEqual({ tenants: [HARNESS_PLATFORM_TENANT_SUMMARY] })
  })

  it("`limit` üst sınırı ŞEMA SEVİYESİNDE zorlanır — 51 resolver'a HİÇ ULAŞMAZ", async () => {
    const harness = createHarness({
      tenant: { kind: 'absent' },
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: true,
      }),
    })

    await expect(harness.client.platform.tenantList.query({ limit: 51 })).rejects.toThrow()
  })

  it('`limit` verilmezse VARSAYILAN (20) uygulanır', async () => {
    const calls: number[] = []
    const harness = createHarness({
      tenant: { kind: 'absent' },
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: true,
      }),
      platformRead: {
        listTenants(input) {
          calls.push(input.limit)
          return Promise.resolve([])
        },
        listAuditEntries() {
          return Promise.resolve([])
        },
      },
    })

    await harness.client.platform.tenantList.query({})

    expect(calls).toEqual([20])
  })

  it('⭐⭐ ÇAPRAZ EKSEN İZOLASYONU — üyelik portu HİÇ okunmaz (platform yetkisi kiracı üyeliğinden BAĞIMSIZ)', async () => {
    const harness = createHarness({
      tenant: { kind: 'absent' },
      membershipRole: null,
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: true,
      }),
    })

    await harness.client.platform.tenantList.query({})

    expect(harness.membershipReadCalls).toEqual([])
  })
})

describe('platform.auditLog — platformAdminProcedure başarı yolu', () => {
  it("port'un döndürdüğü diziyi `{entries}` ile SARMALAR; `detail`/e-posta tele ÇIKMAZ", async () => {
    const harness = createHarness({
      tenant: { kind: 'absent' },
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: true,
      }),
      platformRead: createFakePlatformReadPort([], [HARNESS_PLATFORM_AUDIT_ENTRY]),
    })

    const result = await harness.client.platform.auditLog.query({})

    expect(result).toEqual({ entries: [HARNESS_PLATFORM_AUDIT_ENTRY] })
    expect(Object.keys(result.entries[0] ?? {}).sort()).toEqual([
      'action',
      'actorUserId',
      'createdAt',
      'id',
      'subject',
    ])
  })

  it('`limit` üst sınırı (100) ŞEMA SEVİYESİNDE zorlanır', async () => {
    const harness = createHarness({
      tenant: { kind: 'absent' },
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: true,
      }),
    })

    await expect(harness.client.platform.auditLog.query({ limit: 101 })).rejects.toThrow()
  })

  it('`limit` verilmezse VARSAYILAN (50) uygulanır', async () => {
    const calls: number[] = []
    const harness = createHarness({
      tenant: { kind: 'absent' },
      platformAdminRead: createFakePlatformAdminReadPort({
        isPlatformAdmin: true,
        twoFactorEnabled: true,
      }),
      platformRead: {
        listTenants() {
          return Promise.resolve([])
        },
        listAuditEntries(input) {
          calls.push(input.limit)
          return Promise.resolve([])
        },
      },
    })

    await harness.client.platform.auditLog.query({})

    expect(calls).toEqual([50])
  })
})
