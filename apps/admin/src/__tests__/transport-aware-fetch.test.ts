// @arkesoft/admin — transportAwareFetch testleri (ROADMAP v0.0.7, T-008/S4,
// AC7). Global `fetch` TAMAMEN sahtelenir — AĞ ÇAĞRISI 0.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { transportAwareFetch } from '../api/transport-aware-fetch.js'

const sampleAppErrorBody = {
  code: 'TENANT_NOT_FOUND',
  message: 'errors.tenant.notFound',
  details: {},
  requestId: 'req_probe',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('transportAwareFetch — response.ok → gövdeye DOKUNMAZ', () => {
  it('başarılı yanıtı OLDUĞU GİBİ (aynı referans) döner, json() ÇAĞIRMAZ', async () => {
    const jsonSpy = vi.fn()
    const okResponse = { ok: true, json: jsonSpy }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse))

    const result = await transportAwareFetch('https://example.invalid/trpc/session.me')

    expect(result).toBe(okResponse)
    expect(jsonSpy).not.toHaveBeenCalled()
  })
})

describe('transportAwareFetch — !response.ok ve gövde appErrorBodySchema (probe 1)', () => {
  it('AppErrorBody şeklini FIRLATIR — {body} sarmalayıcısıyla, bir Error örneği olarak', async () => {
    const notOkResponse = { ok: false, json: vi.fn().mockResolvedValue(sampleAppErrorBody) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notOkResponse))

    await expect(transportAwareFetch('https://example.invalid/trpc/x')).rejects.toSatisfy(
      (thrown: unknown) => {
        expect(thrown).toBeInstanceOf(Error)
        expect((thrown as { body: unknown }).body).toEqual(sampleAppErrorBody)
        return true
      },
    )
  })
})

describe('transportAwareFetch — !response.ok ve gövde appErrorBodySchema DEĞİL (probe 2 yolu)', () => {
  it("tRPC'nin KENDİ hata şeklini (ör. {error:{...}}) OLDUĞU GİBİ (içerik korunarak) geçirir", async () => {
    const trpcOwnErrorBody = { error: { message: 'NOT_FOUND', code: -32004 } }
    const notOkResponse = { ok: false, json: vi.fn().mockResolvedValue(trpcOwnErrorBody) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notOkResponse))

    const passthrough = await transportAwareFetch('https://example.invalid/trpc/x')

    expect(passthrough.ok).toBe(false)
    await expect(passthrough.json()).resolves.toEqual(trpcOwnErrorBody)
  })
})

describe('transportAwareFetch — !response.ok ve gövde JSON DEĞİL (ör. HTML hata sayfası)', () => {
  it('FIRLATMADAN, içeriksiz bir passthrough yanıtı döner', async () => {
    const notOkResponse = {
      ok: false,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notOkResponse))

    const passthrough = await transportAwareFetch('https://example.invalid/trpc/x')

    expect(passthrough.ok).toBe(false)
    await expect(passthrough.json()).resolves.toBeUndefined()
  })
})
