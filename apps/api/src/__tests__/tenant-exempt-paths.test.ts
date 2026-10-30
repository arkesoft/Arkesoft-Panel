// @arkesoft/api — TENANT_EXEMPT_PATHS testleri (ROADMAP v0.0.4, T-002/ST-5,
// architect K-A4/K5, R4 telafisi #2)
//
// Kümenin TAM OLARAK on iki elemandan oluştuğunu assert eder — listeyi
// büyütmek bu testi DEĞİŞTİRMEYİ (inceleme görünürlüğünü) ZORUNLU kılar.
//
// GÜNCELLEME (ROADMAP v0.0.5, T-006/S5): 2 → 12 (gerekçe `tenant-exempt-
// paths.ts` dosya başı yorumunda — panel host'u rezerve alt alan adı,
// muafiyet olmadan hiçbir auth ucuna erişilemez).

import { describe, expect, it } from 'vitest'

import { isTenantExemptPath, TENANT_EXEMPT_PATHS } from '../tenancy/tenant-exempt-paths.js'

const EXPECTED_EXEMPT_PATHS = [
  '/health',
  '/health/ready',
  '/auth/sign-up/email',
  '/auth/sign-in/email',
  '/auth/sign-out',
  '/auth/verify-email',
  '/auth/send-verification-email',
  '/auth/request-password-reset',
  '/auth/reset-password',
  '/auth/sessions',
  '/auth/sessions/revoke',
  '/auth/sessions/revoke-all',
] as const

describe('TENANT_EXEMPT_PATHS', () => {
  it('tam olarak on iki eleman taşır', () => {
    expect(TENANT_EXEMPT_PATHS.size).toBe(12)
  })

  it('küme TAM OLARAK beklenen on iki elemandır', () => {
    expect(new Set(TENANT_EXEMPT_PATHS)).toEqual(new Set(EXPECTED_EXEMPT_PATHS))
  })

  it.each(EXPECTED_EXEMPT_PATHS)('%s tam eşleşmeyle muaftır', (path) => {
    expect(isTenantExemptPath(path)).toBe(true)
  })

  it('sondaki "/" soyulur — /health/ de muaftır', () => {
    expect(isTenantExemptPath('/health/')).toBe(true)
  })

  it('/HEALTH muaf DEĞİLDİR — büyük/küçük harf DUYARLI (fail-closed)', () => {
    expect(isTenantExemptPath('/HEALTH')).toBe(false)
  })

  it('prefix eşleşmesi YASAK — /health/x muaf değildir', () => {
    expect(isTenantExemptPath('/health/x')).toBe(false)
  })

  it('kök yol "/" muaf değildir', () => {
    expect(isTenantExemptPath('/')).toBe(false)
  })

  it('sorgu dizesi/fragman karşılaştırmaya karışmaz', () => {
    expect(isTenantExemptPath('/health?foo=bar')).toBe(true)
    expect(isTenantExemptPath('/health/ready?x=1')).toBe(true)
  })

  it('tamamen ilgisiz bir yol muaf değildir', () => {
    expect(isTenantExemptPath('/products')).toBe(false)
  })

  // ROADMAP v0.0.6, T-007/S6, architect riski 8 — muafiyet kümesi regresyonu:
  // `/trpc/*` BİLİNÇLİ OLARAK bu kümede DEĞİL (v0.0.6'da erişilebilir
  // publicProcedure yok); kardinalite assert'i (12) bu satırla DEĞİŞMEDİ.
  it("/trpc/tenant.current MUAF DEĞİLDİR — v0.0.6'da tRPC yüzeyi kiracı bağlamından muaf değil", () => {
    expect(isTenantExemptPath('/trpc/tenant.current')).toBe(false)
  })
})
