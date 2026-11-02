// @arkesoft/api — AUTH_EXEMPT_PATHS testleri (ROADMAP v0.0.5, T-006/S6,
// architect "TENANT İZOLASYONU" → "İKİ KÜME AYRI KALIR", AC9; GÜNCELLEME
// ROADMAP v0.0.8, T-009/S7, ADR-0012: dokuz → on, dördüncü grup — BİR vitrin
// yolu)
//
// `tenant-exempt-paths.test.ts`'in (T-002/ST-5) AYNI deseni — kümenin TAM
// OLARAK on elemandan oluştuğunu assert eder (inceleme görünürlüğü kapısı).

import { describe, expect, it } from 'vitest'

import { AUTH_EXEMPT_PATHS, isAuthExemptPath } from '../auth/auth-exempt-paths.js'

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
  '/trpc/storefront.currentTenant',
] as const

describe('AUTH_EXEMPT_PATHS', () => {
  it('tam olarak on eleman taşır', () => {
    expect(AUTH_EXEMPT_PATHS.size).toBe(10)
  })

  it('küme TAM OLARAK beklenen on elemandır', () => {
    expect(new Set(AUTH_EXEMPT_PATHS)).toEqual(new Set(EXPECTED_EXEMPT_PATHS))
  })

  it('/trpc/storefront.currentTenant tam eşleşmeyle muaftır (ADR-0012 — tek vitrin yolu)', () => {
    expect(isAuthExemptPath('/trpc/storefront.currentTenant')).toBe(true)
  })

  it.each(EXPECTED_EXEMPT_PATHS)('%s tam eşleşmeyle muaftır', (path) => {
    expect(isAuthExemptPath(path)).toBe(true)
  })

  it('/auth/sessions MUAF DEĞİLDİR — kiracıdan muaf ama kimlikten muaf değil (AUTH_OWN_PATHS, iki küme ayrımı)', () => {
    expect(isAuthExemptPath('/auth/sessions')).toBe(false)
  })

  it('sondaki "/" soyulur — /health/ de muaftır', () => {
    expect(isAuthExemptPath('/health/')).toBe(true)
  })

  it('/HEALTH muaf DEĞİLDİR — büyük/küçük harf DUYARLI (fail-closed)', () => {
    expect(isAuthExemptPath('/HEALTH')).toBe(false)
  })

  it('prefix eşleşmesi YASAK — /health/x muaf değildir', () => {
    expect(isAuthExemptPath('/health/x')).toBe(false)
  })

  it('kök yol "/" muaf değildir', () => {
    expect(isAuthExemptPath('/')).toBe(false)
  })

  it('sorgu dizesi/fragman karşılaştırmaya karışmaz', () => {
    expect(isAuthExemptPath('/health?foo=bar')).toBe(true)
    expect(isAuthExemptPath('/auth/verify-email?token=abc')).toBe(true)
  })

  it('tamamen ilgisiz bir yol muaf değildir', () => {
    expect(isAuthExemptPath('/products')).toBe(false)
  })

  // ROADMAP v0.0.6, T-007/S6, architect riski 8 — muafiyet kümesi regresyonu:
  // `/trpc/*`'nin GERİ KALANI (v0.0.8'de yalnızca `/trpc/storefront.
  // currentTenant` HARİÇ) BİLİNÇLİ OLARAK bu kümede DEĞİL; kardinalite
  // assert'i (10) bu satırlarla DEĞİŞMEDİ.
  it('/trpc/session.me MUAF DEĞİLDİR — kimlik ZORUNLU prosedür, kiracı ekseni değil', () => {
    expect(isAuthExemptPath('/trpc/session.me')).toBe(false)
  })

  it('/trpc/tenant.current MUAF DEĞİLDİR — kimlik ZORUNLU prosedür (yalnızca TEK yol açıldığının kanıtı)', () => {
    expect(isAuthExemptPath('/trpc/tenant.current')).toBe(false)
  })
})
