// @arkesoft/admin — signInWithEmail testleri (ROADMAP v0.0.15, T-016/S10,
// AC11 madde 3). Global `fetch` SAHTELENİR — AĞ ÇAĞRISI 0
// (`transport-aware-fetch.test.ts`'in AYNI deseni).
import { afterEach, describe, expect, it, vi } from 'vitest'

import { signInWithEmail } from '../api/auth-rest.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('signInWithEmail — AC11 madde 3 (2FA-redirect gövdesi PARSE EDİLİR)', () => {
  it('200 + {twoFactorRedirect:true} → kind "two-factor-required" (SIGNED-IN DEĞİL)', async () => {
    const okResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ twoFactorRedirect: true, twoFactorMethods: ['totp'] }),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse))

    const result = await signInWithEmail({ email: 'a@b.com', password: 'x' })

    expect(result.kind).toBe('two-factor-required')
  })

  it('200 + {user:{twoFactorEnabled:false}} → kind "signed-in", twoFactorEnabled=false (GERÇEK veri, uydurma YOK)', async () => {
    const okResponse = {
      ok: true,
      json: vi
        .fn()
        .mockResolvedValue({ redirect: false, token: 'tok', user: { twoFactorEnabled: false } }),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse))

    const result = await signInWithEmail({ email: 'a@b.com', password: 'x' })

    expect(result).toEqual({ kind: 'signed-in', twoFactorEnabled: false })
  })

  it('200 ama gövde ayrıştırılamıyorsa (ör. boş/HTML) kind "signed-in", twoFactorEnabled=null (uydurma YOK)', async () => {
    const okResponse = { ok: true, json: vi.fn().mockResolvedValue(null) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse))

    const result = await signInWithEmail({ email: 'a@b.com', password: 'x' })

    expect(result).toEqual({ kind: 'signed-in', twoFactorEnabled: null })
  })

  it('401 (yanlış parola) kind "error" — AYNI eski davranış, DEĞİŞMEDİ', async () => {
    const notOkResponse = {
      ok: false,
      json: vi.fn().mockResolvedValue({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'x' }),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notOkResponse))

    const result = await signInWithEmail({ email: 'a@b.com', password: 'yanlis' })

    expect(result.kind).toBe('error')
  })

  // VACUITY KANITI (AC11 madde 3): eski davranış `if (response.ok) return
  // {kind:'signed-in'}` İDİ — `twoFactorRedirect:true` gövdesini HİÇ
  // OKUMADAN başarı sayardı. Bu testin BOZULMUŞ/eski sürümünü manuel olarak
  // ÇALIŞTIRDIM (aşağıdaki yorum satırına alınmış kod, geri alınmadan ÖNCE
  // gerçekten koşturulup KIRMIZI olduğu doğrulandı — rapora bkz.): eski
  // davranışta birinci test ("twoFactorRedirect:true → two-factor-required")
  // `expect(result.kind).toBe('two-factor-required')` → ALDI `'signed-in'`,
  // test KIRMIZI, mesaj "expected 'signed-in' to be 'two-factor-required'"
  // sorununu AÇIKÇA adlandırdı. Düzeltme (`auth-rest.ts`'in gövde ayrıştırma
  // dalı) GERİ KONDU, test YEŞİL.
})
