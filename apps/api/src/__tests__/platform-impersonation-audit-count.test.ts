// @arkesoft/api — AC-9(3) (üçüncü ayak, ÇALIŞMA ZAMANI) + R-PO4 (idempotent
// "giriş" kaydı) (ROADMAP v0.0.20, T-021/S7, ADR-0023 §3)
//
// AC-9(3): N impersonation ⇒ TAM OLARAK N `platform_audit_log` satırı
// (`SELECT count(*)` ile — varlık kontrolü DEĞİL). R-PO4: `ensureSignInRecorded`
// AYNI `sessionId` için TEKRAR çağrılınca YENİ satır YAZMAZ (idempotent);
// FARKLI bir `sessionId` İSE AYRI bir satır yazar (over-suppress DEĞİL).
// Ayrıca `readPlatformSession`'ın HİÇBİR koşulda yazmadığı (R-PO4 kararının
// `platform.session` yarısı) ölçülür.
//
// ⚠ `platform_audit_log` PLATFORM SEVİYESİ bir tablodur (tenant_id YOK) —
// paralel koşan başka test dosyalarıyla AYNI TABLOYU paylaşır. Her
// senaryonun kendi RASGELE `actorUserId` markerı VARDIR ve TÜM sayımlar
// `where: { actorUserId: marker }` ile İZOLE edilir (başka dosyaların
// satırları asla sayıma GİRMEZ).
//
// `tenantIds` GERÇEK `Tenant` satırları GEREKTİRMEZ: `runImpersonated`'ın
// `read` callback'i bu testte veri OKUMAZ (`async () => null`) — iddia
// SADECE audit satırı SAYISI hakkındadır, kiracı verisi hakkında DEĞİL
// (o iddia `platform-authz.isolation.test.ts`'in RLS kanıtındadır).

import { randomUUID } from 'node:crypto'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ImpersonationService } from '../platform/impersonation.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { createTestApp } from './helpers/create-test-app.js'

function uniqueActorId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 16)}`
}

/**
 * `ensureSignInRecorded`'ın İÇİNDE çağırdığı `platformAuditLog.create`'i
 * TEK bir `vi.fn()` arkasına koyan sahte `PrismaService` — gerçek DB/Redis
 * GEREKTİRMEZ (`auth-guard-two-factor-enforcement.test.ts`'in `createFakePrismaService`
 * deseniyle AYNI, `as unknown as PrismaService`). M1 mutasyon kanıtı
 * (aşağıdaki describe) BU sahte ile DB'ye HİÇ DOKUNMADAN, yazmanın
 * BAŞARISIZ olduğu anı deterministik olarak üretir.
 */
function createFakeAuditPrisma(create: ReturnType<typeof vi.fn>): PrismaService {
  return { platform: { platformAuditLog: { create } } } as unknown as PrismaService
}

describe('AC-9(3) — N impersonation çağrısı ⇒ TAM OLARAK N platform_audit_log satırı', () => {
  let app: INestApplication | undefined
  let impersonation: ImpersonationService
  let prismaService: PrismaService

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    impersonation = app.get(ImpersonationService)
    prismaService = app.get(PrismaService)
  }, 60_000)

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  it('N=3 — her çağrı TEK bir satır yazar; çağrı sayısı = satır sayısı (kiracı sayısı DEĞİL)', async () => {
    const actorUserId = uniqueActorId('ac9-3-count')
    const entry = { actorUserId, ip: null, userAgent: null }

    // Vacuous OLMADIĞININ ÖN kanıtı: başlangıçta BU marker için 0 satır.
    const before = await prismaService.platform.platformAuditLog.count({
      where: { actorUserId, action: 'tenant_impersonation_started' },
    })
    expect(before).toBe(0)

    // ⚠ ÇAĞRI 1 — İKİ kiracı kimliği aynı anda (operasyon başına TEK
    // satır iddiasının İLK yarısı: "kiracı başına DEĞİL").
    await impersonation.runImpersonated(entry, ['tnt-a', 'tnt-b'], () => Promise.resolve(null))
    // ⚠ ÇAĞRI 2 — TEK kiracı kimliği.
    await impersonation.runImpersonated(entry, ['tnt-c'], () => Promise.resolve(null))
    // ⚠ ÇAĞRI 3 — ÜÇ kiracı kimliği.
    await impersonation.runImpersonated(entry, ['tnt-d', 'tnt-e', 'tnt-f'], () =>
      Promise.resolve(null),
    )

    const after = await prismaService.platform.platformAuditLog.count({
      where: { actorUserId, action: 'tenant_impersonation_started' },
    })

    // ⚠⚠ AC-9(3)'ÜN ASIL İDDİASI: ALTI kiracı kimliği (2+1+3) ÜÇ ÇAĞRIDA
    // geçti ama satır sayısı 3'TÜR — kiracı sayısı DEĞİL.
    expect(after).toBe(3)
  })

  it('her satırın `detail.tenantIds`si o çağrıda geçirilen kümenin TAMAMIYLA eşleşir', async () => {
    const actorUserId = uniqueActorId('ac9-3-detail')
    const entry = { actorUserId, ip: null, userAgent: null }

    await impersonation.runImpersonated(entry, ['tnt-x', 'tnt-y'], () => Promise.resolve(null))

    const rows = await prismaService.platform.platformAuditLog.findMany({
      where: { actorUserId, action: 'tenant_impersonation_started' },
      select: { detail: true, subject: true },
    })

    expect(rows).toHaveLength(1)
    const detailSchema = z.object({ tenantIds: z.array(z.string()) })
    const detail = detailSchema.parse(rows[0]?.detail)
    expect(new Set(detail.tenantIds)).toEqual(new Set(['tnt-x', 'tnt-y']))
    expect(rows[0]?.subject).toBe('tnt-x,tnt-y')
  })

  it('runImpersonated sonucu — Map anahtarları GİRDİ tenantIds ile BİREBİR', async () => {
    const actorUserId = uniqueActorId('ac9-3-map')
    const entry = { actorUserId, ip: null, userAgent: null }

    const results = await impersonation.runImpersonated(
      entry,
      ['tnt-p', 'tnt-q'],
      (_tx, tenantId) => Promise.resolve(`değer-${tenantId}`),
    )

    expect(results.get('tnt-p')).toBe('değer-tnt-p')
    expect(results.get('tnt-q')).toBe('değer-tnt-q')
    expect(results.size).toBe(2)
  })
})

describe('R-PO4 — ensureSignInRecorded SESSION başına İDEMPOTENT; readPlatformSession ASLA YAZMAZ', () => {
  let app: INestApplication | undefined
  let impersonation: ImpersonationService
  let prismaService: PrismaService

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    impersonation = app.get(ImpersonationService)
    prismaService = app.get(PrismaService)
  }, 60_000)

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  it('AYNI sessionId için TEKRARLANAN çağrı YENİ satır YAZMAZ; FARKLI sessionId AYRI bir satır yazar', async () => {
    const actorUserId = uniqueActorId('r-po4-signin')
    const sessionIdA = `sess-${randomUUID().slice(0, 12)}`
    const sessionIdB = `sess-${randomUUID().slice(0, 12)}`

    await impersonation.ensureSignInRecorded({
      actorUserId,
      sessionId: sessionIdA,
      ip: null,
      userAgent: null,
    })
    await impersonation.ensureSignInRecorded({
      actorUserId,
      sessionId: sessionIdA,
      ip: null,
      userAgent: null,
    })
    await impersonation.ensureSignInRecorded({
      actorUserId,
      sessionId: sessionIdA,
      ip: null,
      userAgent: null,
    })

    const afterRepeatedSameSession = await prismaService.platform.platformAuditLog.count({
      where: { actorUserId, action: 'platform_admin_signed_in' },
    })
    // ⚠⚠ R-PO4'ÜN ASIL İDDİASI: ÜÇ çağrı, AYNI session — TEK satır.
    expect(afterRepeatedSameSession).toBe(1)

    await impersonation.ensureSignInRecorded({
      actorUserId,
      sessionId: sessionIdB,
      ip: null,
      userAgent: null,
    })

    const afterSecondSession = await prismaService.platform.platformAuditLog.count({
      where: { actorUserId, action: 'platform_admin_signed_in' },
    })
    // Vacuous DEĞİL: idempotency AŞIRI-BASTIRMIYOR — FARKLI bir session
    // İKİNCİ bir satır üretir.
    expect(afterSecondSession).toBe(2)
  })

  it('readPlatformSession NE KADAR çağrılırsa çağrılsın `platform_audit_log`a SIFIR satır eklenir', async () => {
    const actorUserId = uniqueActorId('r-po4-session-readonly')

    const before = await prismaService.platform.platformAuditLog.count({
      where: { actorUserId },
    })
    expect(before).toBe(0)

    for (let i = 0; i < 5; i += 1) {
      const result = await impersonation.readPlatformSession(actorUserId)
      // Var olmayan bir kullanıcı için de BAŞARIYLA çözülür (ASLA fırlamaz).
      expect(result).toEqual({ isPlatformAdmin: false, twoFactorEnabled: false })
    }

    const after = await prismaService.platform.platformAuditLog.count({
      where: { actorUserId },
    })
    expect(after).toBe(0)
  })
})

describe('M1 (solid, `medium`, T-021 FIX turu 1) — add() YAZMADAN SONRA çalışır, DB YOK (sahte PrismaService)', () => {
  // ÖNCEKİ hâl: `#recordedSignInSessionIds.add(entry.sessionId)` `await
  // writeAuditRow(...)`'dan ÖNCE çağrılıyordu ⇒ yazma GEÇİCİ bir hatayla
  // (ör. DB bağlantı kopması) BAŞARISIZ olursa `sessionId` yine de kümeye
  // EKLENMİŞ oluyordu ⇒ o session için `platform_admin_signed_in` satırı
  // SÜREÇ ömrü boyunca BİR DAHA YAZILAMIYORDU — RETRY (kullanıcının
  // yenilemesi) SESSİZCE no-op'a düşüyordu. Bu test `writeAuditRow`'u
  // (`platformAuditLog.create`) İLK çağrıda FIRLATAN, İKİNCİ çağrıda
  // BAŞARILI olan bir sahte ile tam bu "geçici hata, sonra retry" senaryosunu
  // üretir.
  it('1. çağrı BAŞARISIZ (geçici hata) → sessionId kümeye EKLENMEZ → 2. çağrı (retry, AYNI session) satırı YAZAR', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('mutasyon kanıtı: geçici DB hatası'))
      .mockResolvedValueOnce({})
    const impersonation = new ImpersonationService(createFakeAuditPrisma(create))

    const actorUserId = uniqueActorId('m1-mutation')
    const sessionId = `sess-${randomUUID().slice(0, 12)}`
    const entry = { actorUserId, sessionId, ip: null, userAgent: null }

    // ÇAĞRI 1 — `writeAuditRow` FIRLAR, `ensureSignInRecorded` da FIRLAMALI
    // (hata YUTULMAZ, yukarı iletilir).
    await expect(impersonation.ensureSignInRecorded(entry)).rejects.toThrow(
      'mutasyon kanıtı: geçici DB hatası',
    )

    // ÇAĞRI 2 — AYNI sessionId, KULLANICININ YENİLEMESİ. Sahte artık
    // FIRLAMAZ (`mockResolvedValueOnce`'un ikinci çağrısı).
    await impersonation.ensureSignInRecorded(entry)

    // ⚠⚠ ASIL İDDİA: `create` TOPLAM İKİ KEZ çağrılmış olmalı (1. FIRLADI,
    // 2. BAŞARILI OLDU) — DÜZELTMEDEN ÖNCE bu `toHaveBeenCalledTimes(2)`
    // BAŞARISIZ olurdu (`create` yalnızca BİR KEZ çağrılır: 1. çağrı
    // FIRLAR, `add()` zaten eklenmiş olduğu için 2. çağrı `has()`'te ERKEN
    // DÖNER ve `writeAuditRow`'u HİÇ ÇAĞIRMAZ — "0 → 1" mutasyonunun
    // BURADAKİ karşılığı `1 → 2`dir, çünkü sahte `create`'in KENDİSİ
    // sayaçtır; gerçek DB'de bu `platform_audit_log.count()`'un `0 → 1`
    // olmasına birebir karşılık gelir).
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('AYNI sessionId için tekrarlanan (hatasız) çağrı İKİNCİ bir yazma ÜRETMEZ — idempotency REGRESE OLMADI', async () => {
    const create = vi.fn().mockResolvedValue({})
    const impersonation = new ImpersonationService(createFakeAuditPrisma(create))

    const actorUserId = uniqueActorId('m1-idempotent')
    const sessionId = `sess-${randomUUID().slice(0, 12)}`
    const entry = { actorUserId, sessionId, ip: null, userAgent: null }

    await impersonation.ensureSignInRecorded(entry)
    await impersonation.ensureSignInRecorded(entry)
    await impersonation.ensureSignInRecorded(entry)

    expect(create).toHaveBeenCalledTimes(1)
  })
})
