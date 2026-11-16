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

  // ROADMAP v0.1.0, T-019/S9a (architect F15, ADR-0021 §2 koşul E) — ÜÇÜNCÜSÜ
  // (`onboardingChecklist`) T-019 gate tur1 düzeltmesi (security, medium):
  // ÖNCEDEN oran sınırına BAĞLANMAMIŞTI (yanlış "numaralandırma yüzeyi
  // DEĞİL" gerekçesiyle — `trpc-rate-limited-paths.ts`'in dosya başı
  // yorumuna bkz). ÜÇÜ de AYNI eşik/kapsam ailesini (`LOGIN_ACCOUNT_LIMIT`/
  // `LOGIN_IP_LIMIT`, `sessionUserId`) PAYLAŞIR — bu test ÜÇÜNÜN DE
  // `RATE_LIMITED_ROUTES`'a GERÇEKTEN kayıtlı olduğunu (modül yüklenirken
  // `buildPolicy`'nin yazım-hatası guard'ından GEÇTİĞİNİ VE
  // `resolveRateLimitPolicy`'nin onları ÇÖZEBİLDİĞİNİ) doğrular.
  it.each([
    'GET /trpc/registration.checkSlugAvailability',
    'POST /trpc/registration.createTenant',
    'GET /trpc/registration.onboardingChecklist',
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

  // T-021 FIX turu 1, madde F2 (security tur1, `high`'ın AYNI kök nedeni) —
  // NEGATİF REGRESYON: `/trpc/registration%2EcreateTenant` ÖNCEDEN HİÇBİR
  // politikaya eşleşmiyordu (`undefined` — sınırsız deneme) çünkü
  // `normalizeRequestPath` yüzde-kodlamayı ÇÖZMÜYORDU; tRPC AYNI isteği
  // `registration.createTenant` olarak ÇÖZÜP ÇALIŞTIRIYORDU. Düzeltmeden
  // SONRA `%2E`/`%2e` ARTIK aynı politikaya (ortak normalizer'ın decode'u
  // SAYESİNDE) eşleşmelidir.
  it.each([
    ['POST', '/trpc/registration%2EcreateTenant'],
    ['POST', '/trpc/registration%2ecreateTenant'],
    ['GET', '/trpc/registration%2EcheckSlugAvailability'],
  ])('%s %s → ARTIK tanımlı bir politikaya eşleşir (F2 regresyonu)', (method, path) => {
    expect(resolveRateLimitPolicy(method, path)).toBeDefined()
  })

  // T-021 FIX turu 3 (security tur2, F2-TUR2, `medium`) — NEGATİF REGRESYON,
  // İKİ AYRI ekseni kapsar (dosya başı GÜNCELLEME yorumu):
  //
  // (a) `/trpc` MOUNT öneki — `TRPC_RATE_LIMITED_PATHS` rotaları. ÖNCEDEN
  //     `resolveRateLimitPolicy('POST', '/TRPC/registration.createTenant')`
  //     → `undefined` dönüyordu (sınırsız deneme) ÇÜNKÜ Express'in
  //     `@All('trpc/*path')`'i mount önekini büyük/küçük harf DUYARSIZ
  //     eşleştirip prosedürü GERÇEKTEN çalıştırıyordu — kanıt
  //     `docs/gates/T-021-security-tur2.md` §2(b).
  it.each([
    ['POST', '/TRPC/registration.createTenant'],
    ['GET', '/Trpc/registration.checkSlugAvailability'],
    ['GET', '/tRpC/registration.onboardingChecklist'],
  ])(
    '%s %s → ARTIK tanımlı bir politikaya eşleşir (F2-TUR2 regresyonu, mount öneki)',
    (method, path) => {
      expect(resolveRateLimitPolicy(method, path)).toBeDefined()
    },
  )

  // (b) `AUTH_OWN_PATHS` — `sessions.controller.ts`'in TAMAMEN statik üç
  //     rotası. Express'in `@Post('auth/sessions/revoke')` gibi statik
  //     dekoratörleri SADECE mount önekini DEĞİL, TÜM segmentleri büyük/
  //     küçük harf DUYARSIZ eşleştirir — CANLI kanıtlandı (security tur2
  //     §2(b)): üç birebir aynı POST, biri `/auth/...`, biri `/AUTH/...`,
  //     biri `/Auth/Sessions/Revoke`, ÜÇÜ DE gerçek işleyiciye ULAŞTI ama
  //     Redis sayacı 1'de KALDI (ikisi tamamen ÖLÇÜLMEDİ).
  it.each([
    ['POST', '/AUTH/sessions/revoke'],
    ['POST', '/Auth/Sessions/Revoke'],
    ['POST', '/auth/SESSIONS/revoke-all'],
  ])(
    '%s %s → ARTIK tanımlı bir politikaya eşleşir (F2-TUR2 regresyonu, AUTH_OWN_PATHS)',
    (method, path) => {
      expect(resolveRateLimitPolicy(method, path)).toBeDefined()
    },
  )

  // Vacuous DEĞİL — `AUTH_OWN_PATHS` fallback'i KEYFİ bir büyük/küçük harf
  // varyantını DEĞİL, yalnızca o ÜÇ KAPALI KÜME literalini tanır. Better
  // Auth'un delege yüzeyi (`AUTH_DELEGATED_PATHS`) bu fallback'e DAHİL
  // DEĞİLDİR — `/Auth/Sign-In/Email` hâlâ `undefined` dönmeli (security tur2
  // §2(c)'nin "SAĞLAM" bulduğu yüzeye BİLEREK dokunulmadı).
  it('/Auth/Sign-In/Email (AUTH_DELEGATED_PATHS, own-path DEĞİL) hâlâ tanımsız kalır (vacuous değil)', () => {
    expect(resolveRateLimitPolicy('POST', '/Auth/Sign-In/Email')).toBeUndefined()
  })
})
