// @arkesoft/api — SameOriginGuard birim + entegrasyon testleri (FIX turu 1,
// madde 6 — F5, medium; FIX turu 2, madde 2 — security tur2 S-3, `medium`)
//
// `security` gate'in ÖLÇTÜĞÜ PoC: geçerli çerez + `Origin:
// https://evil.example.com` → `POST /auth/sessions/revoke-all` → 200 (işlem
// GERÇEKLEŞTİ). Bu dosya İKİ seviyede pinler: (1) saf fonksiyon
// (`detectSameOriginViolation`) — DI'sız, hızlı; (2) gerçek HTTP — PoC'un
// AYNISI artık 403 ve oturum GERÇEKTEN HAYATTA kalıyor (revoke-all
// ÇALIŞMADI, sahte-403 DEĞİL).
//
// FIX turu 2 EKLEMESİ — `detectSameOriginViolation` artık `method` parametresi
// alıyor (fail-closed dalı yalnızca GÜVENSİZ metotlarda uygulanır) ve
// `Referer` fallback'i + `missing_origin_with_cookie` dalı test ediliyor.
// `.set('Origin', TRUSTED_BASE_URL)` — ÇEREZ GÖNDEREN POST çağrılarına
// EKLENDİ (tarayıcının zaten yaptığı şey, security tur2 S-3'ün önerisi).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { detectSameOriginViolation } from '../auth/same-origin.guard.js'
import { createAuthenticatedSession } from './helpers/auth-fixture.js'
import { createTestApp } from './helpers/create-test-app.js'

const TRUSTED_BASE_URL = 'http://panel.arkesoft.localhost:3000'

describe('detectSameOriginViolation — saf fonksiyon', () => {
  it('başlık YOK + GÜVENLİ metot (GET) → ihlal YOK (supertest/araçların varsayılan davranışını KIRMAZ)', () => {
    expect(detectSameOriginViolation({}, 'GET', TRUSTED_BASE_URL)).toBeUndefined()
  })

  it("başlık YOK + GÜVENSİZ metot (POST), Cookie YOK → ihlal YOK (CSRF'in ÖN KOŞULU — çerez taşınmıyor)", () => {
    expect(detectSameOriginViolation({}, 'POST', TRUSTED_BASE_URL)).toBeUndefined()
  })

  it(
    'FIX turu 2, madde 2 — Origin/Sec-Fetch-Site/Referer HİÇBİRİ YOK + Cookie VAR + ' +
      'GÜVENSİZ metot (POST) → missing_origin_with_cookie (ÖNCESİ fail-OPEN döndüğü vaka)',
    () => {
      expect(
        detectSameOriginViolation({ cookie: 'session_token=abc' }, 'POST', TRUSTED_BASE_URL),
      ).toBe('missing_origin_with_cookie')
    },
  )

  it('AYNI başlıksız + Cookie VAR ama GÜVENLİ metot (GET) → ihlal YOK (salt-okunur uç, regresyon kapısı)', () => {
    expect(
      detectSameOriginViolation({ cookie: 'session_token=abc' }, 'GET', TRUSTED_BASE_URL),
    ).toBeUndefined()
  })

  it('Origin GÜVENİLİR orijinle TAM eşleşiyor → ihlal YOK', () => {
    expect(
      detectSameOriginViolation(
        { origin: 'http://panel.arkesoft.localhost:3000' },
        'POST',
        TRUSTED_BASE_URL,
      ),
    ).toBeUndefined()
  })

  it('Origin BAŞKA bir orijin (ör. AYNI SİTE farklı alt alan adı) → origin_mismatch', () => {
    expect(
      detectSameOriginViolation(
        { origin: 'https://kiraci.arkesoft.app' },
        'POST',
        TRUSTED_BASE_URL,
      ),
    ).toBe('origin_mismatch')
  })

  it('Sec-Fetch-Site: cross-site → cross_site_fetch_metadata (Origin UYUMLU olsa BİLE)', () => {
    expect(
      detectSameOriginViolation(
        {
          origin: 'http://panel.arkesoft.localhost:3000',
          'sec-fetch-site': 'cross-site',
        },
        'POST',
        TRUSTED_BASE_URL,
      ),
    ).toBe('cross_site_fetch_metadata')
  })

  it('Sec-Fetch-Site: same-site/same-origin → ihlal YOK (yalnızca "cross-site" reddedilir)', () => {
    expect(
      detectSameOriginViolation({ 'sec-fetch-site': 'same-site' }, 'POST', TRUSTED_BASE_URL),
    ).toBeUndefined()
    expect(
      detectSameOriginViolation({ 'sec-fetch-site': 'same-origin' }, 'POST', TRUSTED_BASE_URL),
    ).toBeUndefined()
  })

  it(
    'FIX turu 2, madde 2 — Origin YOK, Referer GÜVENİLİR orijinle EŞLEŞİYOR → ihlal YOK ' +
      "(Better Auth'un AYNI fallback sırası)",
    () => {
      expect(
        detectSameOriginViolation(
          { cookie: 'session_token=abc', referer: 'http://panel.arkesoft.localhost:3000/sessions' },
          'POST',
          TRUSTED_BASE_URL,
        ),
      ).toBeUndefined()
    },
  )

  it("Origin YOK, Referer BAŞKA bir orijin → origin_mismatch (Referer fallback'i de doğrular)", () => {
    expect(
      detectSameOriginViolation(
        { cookie: 'session_token=abc', referer: 'https://evil.example.com/form' },
        'POST',
        TRUSTED_BASE_URL,
      ),
    ).toBe('origin_mismatch')
  })

  it('Origin YOK, Referer AYRIŞTIRILAMAZ (bozuk URL) + Cookie VAR → fail-CLOSED (origin_mismatch)', () => {
    expect(
      detectSameOriginViolation(
        { cookie: 'session_token=abc', referer: 'not a url' },
        'POST',
        TRUSTED_BASE_URL,
      ),
    ).toBe('origin_mismatch')
  })
})

describe('SameOriginGuard — gerçek HTTP (F5 PoC regresyon kapısı)', () => {
  let app: INestApplication<Server> | undefined

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  function httpServer(): Server {
    if (app === undefined) {
      throw new Error('test uygulaması henüz kurulmadı')
    }
    return app.getHttpServer()
  }

  it('güvenilmeyen Origin ile revoke-all → 403 CROSS_SITE_REQUEST_REJECTED, oturum HAYATTA kalır', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const revokeAllResponse = await request(httpServer())
      .post('/auth/sessions/revoke-all')
      .set('Cookie', cookieHeader)
      .set('Origin', 'https://evil.example.com')

    expect(revokeAllResponse.status).toBe(403)
    expect(revokeAllResponse.body).toMatchObject({ code: 'CROSS_SITE_REQUEST_REJECTED' })

    // PoC'un ASIL iddiası: işlem GERÇEKTEN GERÇEKLEŞMEDİ — AYNI çerez HÂLÂ geçerli.
    const sessionsResponse = await request(httpServer())
      .get('/auth/sessions')
      .set('Cookie', cookieHeader)
    expect(sessionsResponse.status).toBe(200)
  })

  it('Sec-Fetch-Site: cross-site ile revoke → 403, Origin UYUMLU OLSA BİLE', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const revokeResponse = await request(httpServer())
      .post('/auth/sessions/revoke')
      .set('Cookie', cookieHeader)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ sessionId: randomUUID() })

    expect(revokeResponse.status).toBe(403)
    expect(revokeResponse.body).toMatchObject({ code: 'CROSS_SITE_REQUEST_REJECTED' })
  })

  it('Origin/Sec-Fetch-Site YOK (mevcut davranış) → guard istek REDDETMEZ (önceki testlerin REGRESYON kontrolü)', async () => {
    const { cookieHeader } = await createAuthenticatedSession(httpServer())

    const sessionsResponse = await request(httpServer())
      .get('/auth/sessions')
      .set('Cookie', cookieHeader)
    expect(sessionsResponse.status).toBe(200)
  })

  // FIX turu 2, madde 2 (security tur2 S-3, `high`→`medium`-de düzeltilen
  // FAIL-OPEN) — security'nin ve qa'nın ÖLÇTÜĞÜ TAM senaryo: `Origin`/
  // `Sec-Fetch-Site`/`Referer` HİÇBİRİ gönderilmeden + geçerli `Cookie` İLE
  // `POST /auth/sessions/revoke-all`. ÖNCESİ: 200 + mutasyon GERÇEKTEN
  // gerçekleşiyordu (qa'nın `same-origin-guard-fail-open.qa.test.ts`'i bunu
  // kanıtlamıştı — o dosya bu FIX'ten SONRA KASITLI OLARAK kırmızıya düşer,
  // bu BEKLENEN ve İSTENENDİR: kanıtladığı açık artık KAPALI).
  it(
    'Origin/Sec-Fetch-Site/Referer HİÇBİRİ YOK + Cookie VAR → revoke-all 403 ' +
      'missing_origin_with_cookie, oturum HAYATTA kalır (ÖNCESİ fail-OPEN döndüğü vaka)',
    async () => {
      const { cookieHeader } = await createAuthenticatedSession(httpServer())

      const revokeAllResponse = await request(httpServer())
        .post('/auth/sessions/revoke-all')
        .set('Cookie', cookieHeader)

      expect(revokeAllResponse.status).toBe(403)
      expect(revokeAllResponse.body).toMatchObject({ code: 'CROSS_SITE_REQUEST_REJECTED' })

      // PoC'un ASIL iddiası: mutasyon GERÇEKTEN gerçekleşmedi — AYNI çerez HÂLÂ geçerli.
      const sessionsResponse = await request(httpServer())
        .get('/auth/sessions')
        .set('Cookie', cookieHeader)
      expect(sessionsResponse.status).toBe(200)
    },
  )

  it(
    'Origin YOK ama Referer GÜVENİLİR orijinle EŞLEŞİYOR + Cookie VAR → revoke-all İZİN VERİLİR ' +
      '(Referer fallback — gerçek HTTP)',
    async () => {
      const { cookieHeader } = await createAuthenticatedSession(httpServer())

      const revokeAllResponse = await request(httpServer())
        .post('/auth/sessions/revoke-all')
        .set('Cookie', cookieHeader)
        .set('Referer', `${TRUSTED_BASE_URL}/sessions`)

      expect(revokeAllResponse.status).toBe(200)
    },
  )
})
