// @arkesoft/superadmin — platform-session-gate testleri (ROADMAP v0.0.20,
// T-021/S8, AC-4(a) — controller düzeyinde kanıt)
import { describe, expect, it } from 'vitest'

import { resolvePlatformSessionGateOutcome } from '../platform-session-gate.js'

describe('resolvePlatformSessionGateOutcome', () => {
  it('status "pending" ise kind: "pending" döner', () => {
    expect(
      resolvePlatformSessionGateOutcome({ status: 'pending', data: undefined, error: null }),
    ).toEqual({ kind: 'pending' })
  })

  it('status "success" ama data tanımsızsa (savunma) kind: "pending" döner', () => {
    expect(
      resolvePlatformSessionGateOutcome({ status: 'success', data: undefined, error: null }),
    ).toEqual({ kind: 'pending' })
  })

  it('status "error" + PLATFORM_NETWORK_NOT_ALLOWED → kind: "networkBlocked"', () => {
    expect(
      resolvePlatformSessionGateOutcome({
        status: 'error',
        data: undefined,
        error: { kind: 'known', code: 'PLATFORM_NETWORK_NOT_ALLOWED', requestId: null },
      }),
    ).toEqual({ kind: 'networkBlocked' })
  })

  it('status "error" + başka bir kod → kind: "error" (duvar GÖSTERİLMEZ, fail-closed)', () => {
    expect(
      resolvePlatformSessionGateOutcome({
        status: 'error',
        data: undefined,
        error: { kind: 'known', code: 'INTERNAL_ERROR', requestId: null },
      }),
    ).toEqual({ kind: 'error' })
  })

  it('status "error" + kind:"unknown" (gerçek ağ hatası) → kind: "error"', () => {
    expect(
      resolvePlatformSessionGateOutcome({
        status: 'error',
        data: undefined,
        error: { kind: 'unknown', requestId: null },
      }),
    ).toEqual({ kind: 'error' })
  })

  it('isPlatformAdmin: false → kind: "unauthorized" (2FA durumu bilinse de İLGİSİZ)', () => {
    expect(
      resolvePlatformSessionGateOutcome({
        status: 'success',
        data: { isPlatformAdmin: false, twoFactorEnabled: true },
        error: null,
      }),
    ).toEqual({ kind: 'unauthorized' })
  })

  // ⭐⭐ AC-4(a)'nın ANA kanıtı — 2FA'sız bir platform yöneticisi kuruluma
  // yönlendirilmeli (bu fonksiyonun kararı, `_app.tsx`/`iki-adimli-
  // dogrulama.tsx` bunu `redirect`/render kararına çevirir).
  it('AC-4(a): isPlatformAdmin:true + twoFactorEnabled:false → kind: "twoFactorSetupRequired"', () => {
    expect(
      resolvePlatformSessionGateOutcome({
        status: 'success',
        data: { isPlatformAdmin: true, twoFactorEnabled: false },
        error: null,
      }),
    ).toEqual({ kind: 'twoFactorSetupRequired' })
  })

  it('isPlatformAdmin:true + twoFactorEnabled:true → kind: "ready" + session verisini taşır', () => {
    const session = { isPlatformAdmin: true, twoFactorEnabled: true }
    expect(
      resolvePlatformSessionGateOutcome({ status: 'success', data: session, error: null }),
    ).toEqual({ kind: 'ready', session })
  })

  // ⚠⚠ MUTASYON PROBU — dallanma SIRASI: networkBlocked kontrolü unauthorized/
  // twoFactorSetupRequired'DAN ÖNCE gelmeli (ikisi "error" durumunda hiç
  // mevcut olamaz zaten, ama bu test sırayı KARIŞTIRAN bir refactor'u
  // yakalar — "error" dalı asla "success" dallarına sızmamalı).
  it('"error" durumunda data alanı hiç okunmaz — her zaman error/networkBlocked döner', () => {
    const outcome = resolvePlatformSessionGateOutcome({
      status: 'error',
      data: { isPlatformAdmin: true, twoFactorEnabled: true },
      error: { kind: 'known', code: 'PLATFORM_NETWORK_NOT_ALLOWED', requestId: null },
    })
    expect(outcome).toEqual({ kind: 'networkBlocked' })
  })
})
