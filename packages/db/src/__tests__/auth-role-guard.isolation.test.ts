// @arkesoft/db — `assertAuthRoleIsRestricted()`'ın canlı, İKİ YÖNLÜ kanıtı
// (ROADMAP v0.0.14.1, T-015 FIX turu 1 — security Tur 1 [medium] S-2(b)
// bulgusu).
//
// İKİ YÖN (handoff'un bağlayıcı kısıtı — "kısıtlı rol → geçer, geniş yetkili
// rol → düşer"):
//   (1) `arkesoft_auth` (GERÇEKTEN kısıtlı) — prob BAŞARIYLA tamamlanır
//       (hata FIRLATMAZ). Bu, AC1(d)'nin ("auth → tenant: 42501") AYNI
//       canlı olgusuna dayanır, ama FARKLI bir mekanizma sorar: AC1(d) bir
//       GERÇEK SELECT'in reddedildiğini sınar; bu test `has_table_privilege`
//       İLE yapılan bir YETKİ SORUSUNUN (SELECT yapmadan) `false` döndüğünü
//       sınar — ikisi AYRI sorgu yollarıdır, biri DİĞERİNİ KANITLAMAZ (bu
//       yüzden AYRI bir test gerekir).
//   (2) `arkesoft_app` (GENİŞ yetkili — "DATABASE_AUTH_URL sessizce
//       DATABASE_URL'e düşmüş" senaryosunun BİREBİR simülasyonu) — prob
//       `AuthRoleNotRestrictedError` İLE FIRLAR (fail-closed, sessizce
//       geçmez).

import { describe, expect, it } from 'vitest'

import { AuthRoleNotRestrictedError, assertAuthRoleIsRestricted } from '../auth-role-guard.js'
import { getTestAuthPrisma, testAppPrisma } from './helpers/test-client.js'

describe('assertAuthRoleIsRestricted — negatif yetenek probu (T-015 FIX turu 1, S-2(b))', () => {
  it('(1) arkesoft_auth (kısıtlı rol) → probe BAŞARIYLA biter, hata FIRLATMAZ', async () => {
    await expect(assertAuthRoleIsRestricted(getTestAuthPrisma())).resolves.toBeUndefined()
  })

  it('(2) arkesoft_app (geniş yetkili rol — "DATABASE_AUTH_URL → DATABASE_URL" düşüşünün simülasyonu) → AuthRoleNotRestrictedError İLE DÜŞER', async () => {
    await expect(assertAuthRoleIsRestricted(testAppPrisma)).rejects.toBeInstanceOf(
      AuthRoleNotRestrictedError,
    )
  })

  it('AuthRoleNotRestrictedError mesajı prob tablosunun adını TAŞIR (boş hata mesajı DEĞİL)', async () => {
    await expect(assertAuthRoleIsRestricted(testAppPrisma)).rejects.toThrow(/tenant/)
  })
})
