// @arkesoft/api — AUTH_EXEMPT_PATHS testleri (ROADMAP v0.0.5, T-006/S6,
// architect "TENANT İZOLASYONU" → "İKİ KÜME AYRI KALIR", AC9)
//
// `tenant-exempt-paths.test.ts`'in (T-002/ST-5) AYNI deseni — kümenin TAM
// OLARAK dokuz elemandan oluştuğunu assert eder (inceleme görünürlüğü kapısı).

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
] as const

describe('AUTH_EXEMPT_PATHS', () => {
  it('tam olarak dokuz eleman taşır', () => {
    expect(AUTH_EXEMPT_PATHS.size).toBe(9)
  })

  it('küme TAM OLARAK beklenen dokuz elemandır', () => {
    expect(new Set(AUTH_EXEMPT_PATHS)).toEqual(new Set(EXPECTED_EXEMPT_PATHS))
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
  // `/trpc/*` BİLİNÇLİ OLARAK bu kümede DEĞİL (v0.0.6'da erişilebilir
  // publicProcedure yok); kardinalite assert'i (9) bu satırla DEĞİŞMEDİ.
  it("/trpc/session.me MUAF DEĞİLDİR — v0.0.6'da tRPC yüzeyi kimlikten muaf değil", () => {
    expect(isAuthExemptPath('/trpc/session.me')).toBe(false)
  })
})
