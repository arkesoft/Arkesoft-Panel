// @arkesoft/storefront — api-client.ts testleri (ROADMAP v0.0.8, T-009/S6,
// DoD "api-client'ın URL yetkisi")
//
// `@arkesoft/trpc`'nin `createTrpcClient`'ı VE `storefront-server-fetch.js`'in
// `createStorefrontServerFetch`'i MOCKLANIR — bu dosya gerçek bir ağ
// bağlantısı KURMAZ, yalnızca HANGİ argümanlarla çağrıldıklarını ölçer.
//
// ⚠ Bu modül `storefront-env.ts`'i (ve onun üzerinden `process.env`'i)
// TRANSITIF olarak import ettiği için STATİK `import` KULLANILMAZ —
// `storefront-env.test.ts`'in dosya başı yorumundaki AYNI gerekçe: her test
// geçerli bir `process.env` kurduktan SONRA `vi.resetModules()` + dinamik
// `import()` ile modülü YENİDEN yükler.
import { afterEach, describe, expect, it, vi } from 'vitest'

const createTrpcClientMock = vi.fn(() => ({ mocked: 'trpc-client' }))
const createStorefrontServerFetchMock = vi.fn(() => vi.fn())

vi.mock('@arkesoft/trpc', () => ({
  createTrpcClient: createTrpcClientMock,
}))

vi.mock('../storefront-server-fetch.js', () => ({
  createStorefrontServerFetch: createStorefrontServerFetchMock,
}))

const ORIGINAL_ENV = { ...process.env }

function setValidEnv(apiBaseUrl: string): void {
  process.env['APP_BASE_DOMAIN'] = 'arkesoft.localhost'
  process.env['STOREFRONT_API_BASE_URL'] = apiBaseUrl
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.resetModules()
  createTrpcClientMock.mockClear()
  createStorefrontServerFetchMock.mockClear()
})

describe('createStorefrontTrpcClient', () => {
  it('URL yetkisini (authority) tenantHost ile kurar — Host başlığı bundan türer', async () => {
    setValidEnv('http://127.0.0.1:3000')
    vi.resetModules()
    const { createStorefrontTrpcClient } = await import('../api-client.js')

    createStorefrontTrpcClient('demo.arkesoft.localhost')

    expect(createTrpcClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://demo.arkesoft.localhost/trpc' }),
    )
  })

  it('bağlantı HEDEFİNİ (host/port) STOREFRONT_API_BASE_URL üzerinden, modül yüklenirken BİR KEZ çözer', async () => {
    setValidEnv('http://127.0.0.1:3000')
    vi.resetModules()
    const { createStorefrontTrpcClient } = await import('../api-client.js')

    createStorefrontTrpcClient('demo.arkesoft.localhost')

    expect(createStorefrontServerFetchMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 3000 })
  })

  it("port belirtilmemiş bir API taban URL'inde şemaya göre varsayılana düşer (http → 80)", async () => {
    setValidEnv('http://api.internal')
    vi.resetModules()
    const { createStorefrontTrpcClient } = await import('../api-client.js')

    createStorefrontTrpcClient('demo.arkesoft.localhost')

    expect(createStorefrontServerFetchMock).toHaveBeenCalledWith({ host: 'api.internal', port: 80 })
  })

  it("iki farklı tenantHost için İKİ FARKLI URL yetkisi üretir (sabit bir host'a düşmez)", async () => {
    setValidEnv('http://127.0.0.1:3000')
    vi.resetModules()
    const { createStorefrontTrpcClient } = await import('../api-client.js')

    createStorefrontTrpcClient('demo.arkesoft.localhost')
    createStorefrontTrpcClient('musteri.com')

    expect(createTrpcClientMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ url: 'http://demo.arkesoft.localhost/trpc' }),
    )
    expect(createTrpcClientMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ url: 'http://musteri.com/trpc' }),
    )
  })

  it("httpBatchLink'e DEĞİL, @arkesoft/trpc'nin kök createTrpcClient'ına dayanır (döndürülen değer mock'un çıktısıdır)", async () => {
    setValidEnv('http://127.0.0.1:3000')
    vi.resetModules()
    const { createStorefrontTrpcClient } = await import('../api-client.js')

    const client = createStorefrontTrpcClient('demo.arkesoft.localhost')

    expect(client).toEqual({ mocked: 'trpc-client' })
  })

  it('DÜZELTME TURU 1 (security bulgu 2, derinlemesine savunma): BOŞ tenantHost fail-closed FIRLATIR — createTrpcClient hiç ÇAĞRILMAZ', async () => {
    setValidEnv('http://127.0.0.1:3000')
    vi.resetModules()
    const { createStorefrontTrpcClient } = await import('../api-client.js')

    expect(() => createStorefrontTrpcClient('')).toThrow('storefront_trpc_client_empty_tenant_host')
    expect(createTrpcClientMock).not.toHaveBeenCalled()
  })
})
