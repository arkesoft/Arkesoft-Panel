// @arkesoft/admin — sessions-rest.ts testleri (ROADMAP v0.0.15.1, T-017/S11).
// Global `fetch` SAHTELENİR — AĞ ÇAĞRISI 0 (`two-factor-rest.test.ts`'in AYNI
// deseni). Component render testi DEĞİL (`vitest.config.ts`'in
// `environment: 'node'` BAĞLAYICI kararı).
import { afterEach, describe, expect, it, vi } from 'vitest'

import { revokeAllSessions, revokeSession } from '../api/sessions-rest.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function okResponse(body: unknown): { ok: true; json: () => Promise<unknown> } {
  return { ok: true, json: vi.fn().mockResolvedValue(body) }
}

function errorResponse(body: unknown): { ok: false; json: () => Promise<unknown> } {
  return { ok: false, json: vi.fn().mockResolvedValue(body) }
}

describe('revokeSession', () => {
  it('200 {status:true} → kind "revoked"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ status: true })))

    const result = await revokeSession('ses_1', 'sifre-123')

    expect(result).toEqual({ kind: 'revoked' })
  })

  it('gövde {sessionId, password} olarak BİREBİR JSON gönderilir', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ status: true }))
    vi.stubGlobal('fetch', fetchMock)

    await revokeSession('ses_42', 'sifre-xyz')

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/sessions/revoke',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ sessionId: 'ses_42', password: 'sifre-xyz' }),
      }),
    )
  })

  it('400 INVALID_PASSWORD → kind "error"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse({ code: 'INVALID_PASSWORD' })))

    const result = await revokeSession('ses_1', 'yanlis')

    expect(result).toMatchObject({
      kind: 'error',
      error: { kind: 'known', code: 'INVALID_PASSWORD' },
    })
  })

  it('404 SESSION_NOT_FOUND → kind "error" (var olmayan İLE başkasının oturumu AYNI cevap)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse({ code: 'SESSION_NOT_FOUND' })))

    const result = await revokeSession('ses_baskasinin', 'sifre-123')

    expect(result).toMatchObject({
      kind: 'error',
      error: { kind: 'known', code: 'SESSION_NOT_FOUND' },
    })
  })

  it('429 RATE_LIMIT_EXCEEDED → kind "error"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(errorResponse({ code: 'RATE_LIMIT_EXCEEDED' })),
    )

    const result = await revokeSession('ses_1', 'sifre-123')

    expect(result).toMatchObject({
      kind: 'error',
      error: { kind: 'known', code: 'RATE_LIMIT_EXCEEDED' },
    })
  })
})

describe('revokeAllSessions', () => {
  it('200 {status:true} → kind "revoked"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ status: true })))

    const result = await revokeAllSessions('sifre-123')

    expect(result).toEqual({ kind: 'revoked' })
  })

  it('gövde {password} olarak BİREBİR JSON gönderilir — `sessionId` YOK (sahiplik kavramı burada yok)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ status: true }))
    vi.stubGlobal('fetch', fetchMock)

    await revokeAllSessions('sifre-xyz')

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/sessions/revoke-all',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ password: 'sifre-xyz' }),
      }),
    )
  })

  it('400 INVALID_PASSWORD → kind "error"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse({ code: 'INVALID_PASSWORD' })))

    const result = await revokeAllSessions('yanlis')

    expect(result).toMatchObject({
      kind: 'error',
      error: { kind: 'known', code: 'INVALID_PASSWORD' },
    })
  })
})
