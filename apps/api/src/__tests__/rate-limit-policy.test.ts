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
      accountScopeSource: 'emailBody',
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
      accountScopeSource: 'emailBody',
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
      accountScopeSource: 'emailBody',
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
      accountScopeSource: 'emailBody',
    })
  })

  // T-016 FIX turu 1, madde 1/F1 (`high`) — altı yeni 2FA rotası. DÖRDÜ
  // `sessionUserId` kapsamı (parola oracle'ı), İKİSİ
  // `twoFactorChallengeOrSession` (kod/yedek kod tahmini).
  it.each([
    'POST /auth/two-factor/enable',
    'POST /auth/two-factor/disable',
    'POST /auth/two-factor/get-totp-uri',
    'POST /auth/two-factor/generate-backup-codes',
  ])(
    '%s → hesap 5 / IP 20, "login" penceresi, `sessionUserId` kapsamı, SIFIRLANMAZ',
    (routeKey) => {
      const [method, path] = routeKey.split(' ', 2) as [string, string]
      const policy = resolveRateLimitPolicy(method, path)
      expect(policy).toEqual({
        routeKey,
        windowKind: 'login',
        accountLimit: 5,
        ipLimit: 20,
        resetAccountOnSuccess: false,
        accountScopeSource: 'sessionUserId',
      })
    },
  )

  it.each(['POST /auth/two-factor/verify-totp', 'POST /auth/two-factor/verify-backup-code'])(
    '%s → hesap 5 / IP 20, "login" penceresi, `twoFactorChallengeOrSession` kapsamı, SIFIRLANMAZ',
    (routeKey) => {
      const [method, path] = routeKey.split(' ', 2) as [string, string]
      const policy = resolveRateLimitPolicy(method, path)
      expect(policy).toEqual({
        routeKey,
        windowKind: 'login',
        accountLimit: 5,
        ipLimit: 20,
        resetAccountOnSuccess: false,
        accountScopeSource: 'twoFactorChallengeOrSession',
      })
    },
  )

  // ROADMAP v0.0.15.1, T-017/S1, K1 — `AUTH_OWN_PATHS`'teki iki rota
  // (Better Auth'a delege EDİLMEYEN kendi oturum uçlarımız). ESKİDEN bu
  // satırlardan biri (`POST /auth/sessions/revoke`) aşağıdaki "ON rota
  // DIŞINDAKİ her şey → undefined" listesinde NEGATİF pinliydi; o pin artık
  // YANLIŞ bir gerçeği sabitliyordu (rota artık tanımlı) — testi GEVŞETMEK
  // DEĞİL, eskiyen bir beklentiyi gerçeğe uydurmak için buradaki İKİ pozitif
  // case'le DEĞİŞTİRİLDİ (CLAUDE.md §10 md 6).
  it.each(['POST /auth/sessions/revoke', 'POST /auth/sessions/revoke-all'])(
    '%s → hesap 5 / IP 20, "login" penceresi, `sessionUserId` kapsamı, SIFIRLANMAZ',
    (routeKey) => {
      const [method, path] = routeKey.split(' ', 2) as [string, string]
      const policy = resolveRateLimitPolicy(method, path)
      expect(policy).toEqual({
        routeKey,
        windowKind: 'login',
        accountLimit: 5,
        ipLimit: 20,
        resetAccountOnSuccess: false,
        accountScopeSource: 'sessionUserId',
      })
    },
  )

  it.each([
    ['GET', '/health'],
    ['POST', '/auth/sign-out'],
    ['GET', '/auth/verify-email'],
    ['POST', '/auth/reset-password'],
    ['GET', '/auth/sessions/revoke'],
    ['GET', '/auth/sign-in/email'],
    ['POST', '/auth/two-factor/send-otp'],
    ['POST', '/auth/two-factor/verify-otp'],
  ])('oran sınırlı ON İKİ rota DIŞINDAKİ her şey → undefined (%s %s)', (method, path) => {
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
