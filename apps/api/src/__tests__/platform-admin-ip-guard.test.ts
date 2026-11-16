// @arkesoft/api — PlatformAdminIpGuard birim testleri (ROADMAP v0.0.20,
// T-021/S7, ADR-0023 §5)
//
// Saf fonksiyonlar (`parseSuperadminIpAllowlist`/`isPlatformAdminGuardedPath`)
// + guard'ın `canActivate`'i sahte `ExecutionContext` ile. Gerçek HTTP/DB
// gerektirmez — `RateLimitGuard`'ın birim test deseniyle AYNI seviyede.
//
// ÜÇ FAIL-CLOSED DAL (ADR-0023 §5) + "birincil yetkilendirme DEĞİL" sınırının
// kapsam dışı kalması (`platform.*` DIŞI yollarda guard anında `true`
// döner) + allowlist İÇERİĞİNİN hata gövdesine SIZMADIĞI (A-PO21-2).

import { parseEnv } from '@arkesoft/config/env'
import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import { PlatformNetworkNotAllowedError } from '../errors/domain/platform-network-not-allowed.error.js'
import {
  isPlatformAdminGuardedPath,
  parseSuperadminIpAllowlist,
  PlatformAdminIpGuard,
} from '../platform/platform-admin-ip.guard.js'

/**
 * `auth-sessions.test.ts`'in AYNI deseni (`BASE_ENV`): GERÇEK test ortamını
 * (`process.env`, `.env.test`) okuyup YALNIZCA bu dosyanın ihtiyacı olan
 * alanları override eder — tüm zorunlu alanları elle doldurma İHTİYACI
 * YOKTUR.
 */
const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

function buildApiEnv(overrides: Partial<ApiEnv>): ApiEnv {
  return { ...BASE_ENV, ...overrides }
}

type FakeRequest = {
  readonly headers: Record<string, string | string[] | undefined>
  readonly method: string
  readonly url: string
  readonly socket?: { readonly remoteAddress?: string }
}

function buildExecutionContext(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext
}

describe('isPlatformAdminGuardedPath — yol eşleşmesi', () => {
  it.each([
    '/trpc/platform.session',
    '/trpc/platform.tenantList',
    '/trpc/platform.auditLog',
    '/trpc/platform.session?input=%7B%7D',
  ])('%s KAPSAMDADIR', (url) => {
    expect(isPlatformAdminGuardedPath(url)).toBe(true)
  })

  it.each(['/trpc/tenant.current', '/trpc/session.me', '/health', '/trpc/platformX.foo'])(
    '%s KAPSAM DIŞIDIR',
    (url) => {
      expect(isPlatformAdminGuardedPath(url)).toBe(false)
    },
  )

  // T-021 FIX turu 1, madde F1 (security tur1, `high`) — NEGATİF REGRESYON:
  // `%2E`/`%2e` yüzde-kodlaması ÖNCEDEN bu önek testini atlatıyordu (`new
  // URL().pathname` kodlamayı ÇÖZMÜYORDU) ama tRPC AYNI isteği
  // `decodeURIComponent` ile çözüp çalıştırıyordu — kanıt zinciri
  // `docs/gates/T-021-security-tur1.md` §1(a)/(b). Düzeltmeden SONRA üçü de
  // KAPSAMDA sayılmalı: büyük/küçük harf kodlaması VE bozuk kodlama
  // (`%ZZ`, "kapsamda say" — security tur1'in AÇIK şartı).
  it.each([
    '/trpc/platform%2EtenantList',
    '/trpc/platform%2etenantList',
    '/trpc/platform%ZZtenantList',
  ])("%s KAPSAMDADIR (F1 regresyonu — yüzde-kodlama guard'ı ATLATAMAZ)", (url) => {
    expect(isPlatformAdminGuardedPath(url)).toBe(true)
  })

  // Vacuous DEĞİL: kapsam DIŞI bir namespace'in yüzde-kodlanmış hâli de
  // kapsam DIŞI kalmalı (önek testi GENİŞLEMEDİ, sadece doğru kanonikleşti).
  it('/trpc/platformX%2Efoo KAPSAM DIŞIDIR (önek genişlemedi)', () => {
    expect(isPlatformAdminGuardedPath('/trpc/platformX%2Efoo')).toBe(false)
  })

  // T-021 FIX turu 3 (security tur2, F1-TUR2, `high`) — NEGATİF REGRESYON:
  // `/trpc` MOUNT segmenti Express'in `case sensitive routing` ayarı KAPALI
  // olduğu için `@All('trpc/*path')` rotasına büyük/küçük harf DUYARSIZ
  // düşüyordu (tRPC `platform.tenantList` prosedürünü GERÇEKTEN çalıştırıyordu,
  // CANLI kanıt `docs/gates/T-021-security-tur2.md` §1(d)) ama bu önek testi
  // ÖNCEDEN `false` dönüyordu — guard ANINDA `true`, üç fail-closed dalın
  // HİÇBİRİ değerlendirilmiyordu. Düzeltmeden SONRA üçü de KAPSAMDA.
  it.each(['/TRPC/platform.tenantList', '/Trpc/platform.tenantList', '/tRpC/platform.tenantList'])(
    "%s KAPSAMDADIR (F1-TUR2 regresyonu — mount önekinin büyük/küçük harfi guard'ı ATLATAMAZ)",
    (url) => {
      expect(isPlatformAdminGuardedPath(url)).toBe(true)
    },
  )
})

describe('parseSuperadminIpAllowlist — ayrıştırma', () => {
  it('boş dize → boş dizi', () => {
    expect(parseSuperadminIpAllowlist('')).toEqual([])
  })

  it('virgülle ayrılmış değerler trim edilir, boş parçalar düşürülür', () => {
    expect(parseSuperadminIpAllowlist(' 203.0.113.5 ,, 198.51.100.9 ,')).toEqual([
      '203.0.113.5',
      '198.51.100.9',
    ])
  })

  it('yalnızca boşluk/virgül → boş dizi (vacuous değil — önceki test POZİTİF sonuç üretti)', () => {
    expect(parseSuperadminIpAllowlist('   ,  ,')).toEqual([])
  })
})

describe('PlatformAdminIpGuard — platform.* DIŞI yol: ANINDA true, allowlist OKUNMAZ', () => {
  it('boş allowlist İLE DAHİ platform DIŞI yol geçer', () => {
    const guard = new PlatformAdminIpGuard(buildApiEnv({ SUPERADMIN_IP_ALLOWLIST: '' }))
    const context = buildExecutionContext({
      headers: {},
      method: 'GET',
      url: '/trpc/tenant.current',
      socket: { remoteAddress: '203.0.113.5' },
    })

    expect(guard.canActivate(context)).toBe(true)
  })
})

describe('PlatformAdminIpGuard — ÜÇ FAIL-CLOSED DAL (ADR-0023 §5)', () => {
  it('DAL 1 — allowlist BOŞ → 403 (yapılandırılmamış = kapalı)', () => {
    const guard = new PlatformAdminIpGuard(buildApiEnv({ SUPERADMIN_IP_ALLOWLIST: '' }))
    const context = buildExecutionContext({
      headers: {},
      method: 'GET',
      url: '/trpc/platform.tenantList',
      socket: { remoteAddress: '203.0.113.5' },
    })

    expect(() => guard.canActivate(context)).toThrow(PlatformNetworkNotAllowedError)
  })

  it('DAL 2 — çözülen IP allowlist’TE YOK → 403', () => {
    const guard = new PlatformAdminIpGuard(buildApiEnv({ SUPERADMIN_IP_ALLOWLIST: '203.0.113.9' }))
    const context = buildExecutionContext({
      headers: {},
      method: 'GET',
      url: '/trpc/platform.tenantList',
      socket: { remoteAddress: '203.0.113.5' },
    })

    expect(() => guard.canActivate(context)).toThrow(PlatformNetworkNotAllowedError)
  })

  it('DAL 3 — çözülen IP UNKNOWN_IP sentinel’i (soket adresi YOK, güvenilir vekil 0) → 403', () => {
    const guard = new PlatformAdminIpGuard(
      buildApiEnv({ SUPERADMIN_IP_ALLOWLIST: '203.0.113.9', AUTH_TRUSTED_PROXY_COUNT: 0 }),
    )
    const context = buildExecutionContext({
      headers: {},
      method: 'GET',
      url: '/trpc/platform.tenantList',
      // ⚠ `socket` BİLEREK YOK — `resolveClientIp` bu durumda UNKNOWN_IP
      // sentinel'ine düşer (`client-ip.ts`).
    })

    expect(() => guard.canActivate(context)).toThrow(PlatformNetworkNotAllowedError)
  })

  it('allowlist’TE OLAN bir IP → geçer (vacuous değil — üç DAL da başarıyla reddediyordu, bu KABUL yolu da ÇALIŞIR)', () => {
    const guard = new PlatformAdminIpGuard(
      buildApiEnv({ SUPERADMIN_IP_ALLOWLIST: '203.0.113.5, 198.51.100.9' }),
    )
    const context = buildExecutionContext({
      headers: {},
      method: 'GET',
      url: '/trpc/platform.tenantList',
      socket: { remoteAddress: '203.0.113.5' },
    })

    expect(guard.canActivate(context)).toBe(true)
  })
})

describe('PlatformAdminIpGuard — hata gövdesi allowlist İÇERİĞİNİ SIZDIRMAZ (A-PO21-2)', () => {
  it('üç reddin HİÇBİRİ allowlist elemanlarını veya çözülen IP’yi publicDetails’e TAŞIMAZ', () => {
    const guard = new PlatformAdminIpGuard(buildApiEnv({ SUPERADMIN_IP_ALLOWLIST: '203.0.113.9' }))
    const context = buildExecutionContext({
      headers: {},
      method: 'GET',
      url: '/trpc/platform.tenantList',
      socket: { remoteAddress: '203.0.113.5' },
    })

    try {
      guard.canActivate(context)
      expect.fail('PlatformNetworkNotAllowedError BEKLENİYORDU')
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformNetworkNotAllowedError)
      const typed = error as PlatformNetworkNotAllowedError
      expect(typed.httpStatus).toBe(403)
      expect(typed.publicDetails).toEqual({})
      // ⚠ `context` YALNIZCA LOGLANIR (`toErrorBody` ASLA serileştirmez) —
      // burada doğrudan okunabilse de allowlist'in KENDİSİNİ TAŞIMAZ,
      // yalnızca kapalı üç sebepten birini.
      expect(JSON.stringify(typed.context)).not.toContain('203.0.113.9')
      expect(JSON.stringify(typed.context)).not.toContain('203.0.113.5')
    }
  })
})
