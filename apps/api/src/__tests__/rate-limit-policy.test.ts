// @arkesoft/api — rate-limit.policy.ts birim testleri (ROADMAP v0.0.5,
// T-006/S8, architect K3/AC7, S8 handoff §1/§2)
//
// SAF modül — Redis/DB/HTTP YOK. Bu dosya ayrıca DoD §3'ün mekanik kanıtını
// (`process.env`/`ApiEnv` okunmuyor) BİRİM test seviyesinde DOLAYLI doğrular:
// modül HİÇ env'e dokunmadan, sabit eşiklerle İÇE AKTARILABİLİYOR.

import { describe, expect, it } from 'vitest'

import { resolveRateLimitPolicy } from '../auth/rate-limit/rate-limit.policy.js'

describe('resolveRateLimitPolicy — K3 eşikleri (MODÜL SABİTİ, env OKUNMAZ)', () => {
  it('POST /auth/sign-in/email → hesap 5 / IP 20, "login" penceresi, BAŞARILI girişte SIFIRLANIR', () => {
    const policy = resolveRateLimitPolicy('POST', '/auth/sign-in/email')
    expect(policy).toEqual({
      routeKey: 'POST /auth/sign-in/email',
      windowKind: 'login',
      accountLimit: 5,
      ipLimit: 20,
      resetAccountOnSuccess: true,
    })
  })

  it('POST /auth/request-password-reset → hesap 3 / IP 10, "reset" penceresi, SIFIRLANMAZ', () => {
    const policy = resolveRateLimitPolicy('POST', '/auth/request-password-reset')
    expect(policy).toEqual({
      routeKey: 'POST /auth/request-password-reset',
      windowKind: 'reset',
      accountLimit: 3,
      ipLimit: 10,
      resetAccountOnSuccess: false,
    })
  })

  it('POST /auth/sign-up/email → onaylı genişletme, hesap 3 / IP 10, SIFIRLANMAZ', () => {
    const policy = resolveRateLimitPolicy('POST', '/auth/sign-up/email')
    expect(policy).toEqual({
      routeKey: 'POST /auth/sign-up/email',
      windowKind: 'reset',
      accountLimit: 3,
      ipLimit: 10,
      resetAccountOnSuccess: false,
    })
  })

  it('POST /auth/send-verification-email → onaylı genişletme, hesap 3 / IP 10, SIFIRLANMAZ', () => {
    const policy = resolveRateLimitPolicy('POST', '/auth/send-verification-email')
    expect(policy).toEqual({
      routeKey: 'POST /auth/send-verification-email',
      windowKind: 'reset',
      accountLimit: 3,
      ipLimit: 10,
      resetAccountOnSuccess: false,
    })
  })

  it.each([
    ['GET', '/health'],
    ['POST', '/auth/sign-out'],
    ['GET', '/auth/verify-email'],
    ['POST', '/auth/reset-password'],
    ['POST', '/auth/sessions/revoke'],
    ['GET', '/auth/sign-in/email'],
  ])('oran sınırlı DÖRT rota DIŞINDAKİ her şey → undefined (%s %s)', (method, path) => {
    expect(resolveRateLimitPolicy(method, path)).toBeUndefined()
  })

  it('metot büyük/küçük harf DUYARSIZ eşleşir', () => {
    expect(resolveRateLimitPolicy('post', '/auth/sign-in/email')).toBeDefined()
  })

  it('sondaki "/" soyulur (tenant-exempt-paths.ts normalizasyonuyla AYNI)', () => {
    expect(resolveRateLimitPolicy('POST', '/auth/sign-in/email/')).toBeDefined()
  })

  it('sorgu dizesi/fragman karışmaz', () => {
    expect(resolveRateLimitPolicy('POST', '/auth/sign-in/email?foo=bar')).toBeDefined()
  })

  it('yol büyük/küçük harf DUYARLIDIR (fail-closed)', () => {
    expect(resolveRateLimitPolicy('POST', '/Auth/Sign-In/Email')).toBeUndefined()
  })
})
