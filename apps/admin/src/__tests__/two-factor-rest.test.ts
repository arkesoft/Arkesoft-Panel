// @arkesoft/admin — two-factor-rest.ts testleri (ROADMAP v0.0.15, T-016/S10).
// Global `fetch` SAHTELENİR — AĞ ÇAĞRISI 0 (`transport-aware-fetch.test.ts`'in
// AYNI deseni). Her fonksiyon için normal/hata durumu kapsanır (component
// render testi DEĞİL — `vitest.config.ts`'in `environment: 'node'`
// BAĞLAYICI kararı, bkz. dosya başı yorumları).
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  disableTwoFactor,
  enableTwoFactor,
  generateBackupCodes,
  getTotpUri,
  verifyBackupCode,
  verifyTotp,
} from '../api/two-factor-rest.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function okResponse(
  body: unknown,
  headers: Record<string, string> = {},
): {
  ok: true
  json: () => Promise<unknown>
  headers: Headers
} {
  return { ok: true, json: vi.fn().mockResolvedValue(body), headers: new Headers(headers) }
}

function errorResponse(
  body: unknown,
  headers: Record<string, string> = {},
): { ok: false; json: () => Promise<unknown>; headers: Headers } {
  return { ok: false, json: vi.fn().mockResolvedValue(body), headers: new Headers(headers) }
}

describe('enableTwoFactor', () => {
  it('200 + {totpURI, backupCodes} → kind "enabled"', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(okResponse({ totpURI: 'otpauth://totp/x', backupCodes: ['AAAA-1111'] })),
    )

    const result = await enableTwoFactor('sifre')

    expect(result).toEqual({
      kind: 'enabled',
      totpURI: 'otpauth://totp/x',
      backupCodes: ['AAAA-1111'],
    })
  })

  it('400 INVALID_PASSWORD → kind "error"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse({ code: 'INVALID_PASSWORD' })))

    const result = await enableTwoFactor('yanlis')

    expect(result).toMatchObject({
      kind: 'error',
      error: { kind: 'known', code: 'INVALID_PASSWORD' },
    })
  })
})

describe('getTotpUri', () => {
  it('200 + {totpURI} → kind "retrieved" (enable TEKRAR ÇAĞRILMADAN tekrar gösterim)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ totpURI: 'otpauth://totp/y' })))

    const result = await getTotpUri('sifre')

    expect(result).toEqual({ kind: 'retrieved', totpURI: 'otpauth://totp/y' })
  })
})

describe('verifyTotp', () => {
  it('200 → kind "verified"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ token: 't', user: {} })))

    const result = await verifyTotp('123456')

    expect(result).toEqual({ kind: 'verified' })
  })

  it('401 INVALID_CODE → kind "error", retryAfterSeconds null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse({ code: 'INVALID_CODE' })))

    const result = await verifyTotp('000000')

    expect(result).toMatchObject({
      kind: 'error',
      error: { code: 'INVALID_CODE' },
      retryAfterSeconds: null,
    })
  })

  it('429 ACCOUNT_TEMPORARILY_LOCKED + Retry-After → retryAfterSeconds GERÇEK başlıktan okunur (sabit "900" UYDURULMAZ)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          errorResponse({ code: 'ACCOUNT_TEMPORARILY_LOCKED' }, { 'Retry-After': '842' }),
        ),
    )

    const result = await verifyTotp('000000')

    expect(result).toMatchObject({
      kind: 'error',
      error: { code: 'ACCOUNT_TEMPORARILY_LOCKED' },
      retryAfterSeconds: 842,
    })
  })

  it('Retry-After başlığı YOKSA retryAfterSeconds null (uydurma YOK)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(errorResponse({ code: 'ACCOUNT_TEMPORARILY_LOCKED' })),
    )

    const result = await verifyTotp('000000')

    expect(result).toMatchObject({ retryAfterSeconds: null })
  })
})

describe('verifyBackupCode', () => {
  it('401 INVALID_BACKUP_CODE → kind "error"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(errorResponse({ code: 'INVALID_BACKUP_CODE' })),
    )

    const result = await verifyBackupCode('XXXX-0000')

    expect(result).toMatchObject({ kind: 'error', error: { code: 'INVALID_BACKUP_CODE' } })
  })
})

describe('disableTwoFactor', () => {
  it('200 → kind "disabled"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ status: true })))

    const result = await disableTwoFactor('sifre')

    expect(result).toEqual({ kind: 'disabled' })
  })
})

describe('generateBackupCodes', () => {
  it('200 + {backupCodes} → kind "generated"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ status: true, backupCodes: ['CCCC-3333'] })),
    )

    const result = await generateBackupCodes('sifre')

    expect(result).toEqual({ kind: 'generated', backupCodes: ['CCCC-3333'] })
  })
})
