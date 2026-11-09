// @arkesoft/api — `extractTwoFactorVerifyAccountScope` birim testleri
// (ROADMAP v0.0.15, T-016 FIX turu 1, madde 1/F1, `high`; FIX turu 3,
// madde ①/(a), `medium` — öncelik tersine çevrildi)
//
// SAF fonksiyon — Redis/DB/HTTP YOK.

import { describe, expect, it } from 'vitest'

import { extractTwoFactorVerifyAccountScope } from '../auth/rate-limit/two-factor-scope-cookie.js'

describe('extractTwoFactorVerifyAccountScope', () => {
  // FIX turu 3, madde ①/(a) — ÖNCEKİ davranış (challenge ÖNCE) `security`'nin
  // zehirlenme bulgusuydu: saldırgan ÇALINTI oturum çerezinin YANINA HER
  // istekte rastgele bir `two_factor` çerezi EKLEYEREK hesap sayacını HER
  // SEFERİNDE TAZE bir kovaya düşürebiliyordu. ARTIK `session_token` VARSA
  // (iki çerez de olsa) HER ZAMAN KAZANIR — `two-factor-scope-cookie.ts`
  // dosya başı GÜNCELLEME yorumu.
  it('İKİSİ de VARSA → session_token KAZANIR (saldırganın keyfi two_factor değeri İGNORE edilir)', () => {
    const value = extractTwoFactorVerifyAccountScope(
      'other=1; better-auth.two_factor=challenge-abc; better-auth.session_token=session-xyz',
      { NODE_ENV: 'test' },
    )
    expect(value).toBe('session-xyz')
  })

  it('session_token YOK ama two_factor VAR (ÖN-GİRİŞ modu) → two_factor değeri döner', () => {
    const value = extractTwoFactorVerifyAccountScope('better-auth.two_factor=challenge-abc', {
      NODE_ENV: 'test',
    })
    expect(value).toBe('challenge-abc')
  })

  it('two_factor YOK ama session_token VAR (2FA kurulum onayı modu) → session_token değeri döner', () => {
    const value = extractTwoFactorVerifyAccountScope('better-auth.session_token=session-xyz', {
      NODE_ENV: 'test',
    })
    expect(value).toBe('session-xyz')
  })

  it('HİÇ çerez YOK → undefined (hesap kapsamı ATLANIR)', () => {
    expect(extractTwoFactorVerifyAccountScope(undefined, { NODE_ENV: 'test' })).toBeUndefined()
    expect(extractTwoFactorVerifyAccountScope('unrelated=1', { NODE_ENV: 'test' })).toBeUndefined()
  })

  it('NODE_ENV=production → __Secure- ÖNEKLİ cookie adları aranır (useSecureCookies ile AYNI türetme)', () => {
    const value = extractTwoFactorVerifyAccountScope(
      '__Secure-better-auth.two_factor=prod-challenge',
      { NODE_ENV: 'production' },
    )
    expect(value).toBe('prod-challenge')

    // production'da ÖNEKSİZ isim ARANMAZ — iki ortamın anahtar uzayı karışmaz.
    expect(
      extractTwoFactorVerifyAccountScope('better-auth.two_factor=dev-challenge', {
        NODE_ENV: 'production',
      }),
    ).toBeUndefined()
  })

  it('dizi hâlinde Cookie başlığı (bazı adaptörler) da ayrıştırılır', () => {
    const value = extractTwoFactorVerifyAccountScope(
      ['foo=1', 'better-auth.two_factor=from-array'],
      { NODE_ENV: 'test' },
    )
    expect(value).toBe('from-array')
  })

  it("challenge değeri BOŞ dize İSE session_token'a DÜŞER (boş opak değer anlamsız)", () => {
    const value = extractTwoFactorVerifyAccountScope(
      'better-auth.two_factor=; better-auth.session_token=session-xyz',
      { NODE_ENV: 'test' },
    )
    expect(value).toBe('session-xyz')
  })

  it("session_token değeri BOŞ dize İSE two_factor'A DÜŞER (boş opak değer anlamsız, YENİ öncelik sırasında da geçerli)", () => {
    const value = extractTwoFactorVerifyAccountScope(
      'better-auth.session_token=; better-auth.two_factor=challenge-abc',
      { NODE_ENV: 'test' },
    )
    expect(value).toBe('challenge-abc')
  })
})
