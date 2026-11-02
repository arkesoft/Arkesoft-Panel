// @arkesoft/storefront — `storefrontServerFetch` testleri (ROADMAP v0.0.8,
// T-009/S4, architect K18).
//
// ZORUNLU ÖLÇÜM (ADR-0011 "v0.0.8" + handoff K18 bölümü): "giden Host URL
// yetkisinden kesin kurulur" mekanizmasının TEK kanıtı bu dosyadaki ilk
// testtir. Tek kullanımlık bir `node:http` sunucusu ayağa kaldırılır,
// `storefrontServerFetch` ile bir çağrı yapılır, sunucunun GÖRDÜĞÜ
// `req.headers.host` kiracı host'uyla BİREBİR karşılaştırılır. Mutasyon
// kanıtı (`resolveOutgoingHeaders`'ın `headers.host = requestUrl.host`
// satırı kaldırıldığında bu testin KIRMIZIYA döndüğü) handoff raporunda
// HAM ÇIKTI olarak kayıtlıdır.
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTrpcClient } from '@arkesoft/trpc'

import { mapApiError } from '../map-api-error.js'
import { createStorefrontServerFetch } from '../storefront-server-fetch.js'

interface CapturedRequest {
  readonly host: string | undefined
  readonly method: string | undefined
  readonly path: string | undefined
}

/** Gelen isteğin başlıklarını yakalayıp sabit bir JSON gövdesiyle yanıtlayan tek kullanımlık sunucu. */
function createCapturingServer(): { server: Server; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = []

  const server = createServer((req, res) => {
    requests.push({ host: req.headers.host, method: req.method, path: req.url })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })

  return { server, requests }
}

function listenOnLoopback(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        throw new Error('test_server_address_resolution_failed')
      }
      // `address === null || typeof address === 'string'` dalı yukarıda
      // FIRLATTI — buraya ulaşıldığında TypeScript `address`'i zaten
      // `AddressInfo`'ya DARALTIR; tip zorlama GEREKMEZ.
      resolve(address.port)
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve()
    })
  })
}

describe('storefrontServerFetch', () => {
  let capturing: ReturnType<typeof createCapturingServer>
  let apiPort: number

  beforeEach(async () => {
    capturing = createCapturingServer()
    apiPort = await listenOnLoopback(capturing.server)
  })

  afterEach(async () => {
    await closeServer(capturing.server)
  })

  it('giden Host başlığını URL yetkisinden BİREBİR kurar (K18 — ZORUNLU ölçüm)', async () => {
    const storefrontServerFetch = createStorefrontServerFetch({ host: '127.0.0.1', port: apiPort })

    const response = await storefrontServerFetch(
      'http://demo-magaza.arkesoft.localhost/trpc/tenant.current',
      undefined,
    )
    const body = await response.json()

    expect(capturing.requests).toHaveLength(1)
    expect(capturing.requests[0]?.host).toBe('demo-magaza.arkesoft.localhost')
    expect(response.ok).toBe(true)
    expect(body).toEqual({ ok: true })
  })

  it('bağlantı hedefi (TCP soketi) `target`tır; URL yetkisi DEĞİLDİR', async () => {
    const storefrontServerFetch = createStorefrontServerFetch({ host: '127.0.0.1', port: apiPort })

    // `demo-magaza.arkesoft.localhost` DNS'te ÇÖZÜLMEZ olsa bile istek
    // BAŞARILI OLUR — çünkü TCP bağlantısı `target`e (127.0.0.1:apiPort)
    // gider, URL yetkisi yalnızca `Host` başlığına yazılır.
    const response = await storefrontServerFetch(
      'http://baska-bir-magaza.arkesoft.invalid-tld-asla-cozulmez/trpc/tenant.current',
    )

    expect(response.ok).toBe(true)
    expect(capturing.requests[0]?.host).toBe('baska-bir-magaza.arkesoft.invalid-tld-asla-cozulmez')
  })

  it('metodu ve yolu (path + query) olduğu gibi iletir', async () => {
    const storefrontServerFetch = createStorefrontServerFetch({ host: '127.0.0.1', port: apiPort })

    await storefrontServerFetch(
      'http://demo-magaza.arkesoft.localhost/trpc/session.me?input=%7B%7D',
      {
        method: 'POST',
        body: '{"input":1}',
      },
    )

    expect(capturing.requests[0]?.method).toBe('POST')
    expect(capturing.requests[0]?.path).toBe('/trpc/session.me?input=%7B%7D')
  })

  it('çağıranın sinyali İSTEK GÖNDERİLMEDEN önce abort edilmişse isteği REDDEDER (zaman aşımı birleştirme dalı)', async () => {
    const storefrontServerFetch = createStorefrontServerFetch({ host: '127.0.0.1', port: apiPort })
    const controller = new AbortController()
    controller.abort()

    await expect(
      storefrontServerFetch('http://demo-magaza.arkesoft.localhost/trpc/tenant.current', {
        signal: controller.signal,
      }),
    ).rejects.toBeDefined()
  })

  it('desteklenmeyen bir gövde tipi (string/null DIŞI) verilirse fail-closed FIRLATIR', async () => {
    const storefrontServerFetch = createStorefrontServerFetch({ host: '127.0.0.1', port: apiPort })

    await expect(
      storefrontServerFetch('http://demo-magaza.arkesoft.localhost/trpc/tenant.current', {
        method: 'POST',
        body: new FormData(),
      }),
    ).rejects.toThrow('storefront_server_fetch_unsupported_body_type')
  })
})

// DÜZELTME TURU 2 (T-009, architect yerleşim kararı) — `res.on('end')`'in ÜÇ
// yolu. Her test TEK kullanımlık bir `node:http` sunucusu ile kendi
// durum/gövdesini üretir (yukarıdaki `createCapturingServer`'ın sabit 200
// yanıtından BAĞIMSIZ).
function createRespondingServer(handler: (req: IncomingMessage, res: ServerResponse) => void): {
  server: Server
} {
  return { server: createServer(handler) }
}

describe('storefrontServerFetch — üç yollu hata sınıflandırması (düzeltme turu 2)', () => {
  let server: Server

  afterEach(async () => {
    await closeServer(server)
  })

  it('yol 1 — 2xx: başarı gövdesine HİÇ DOKUNULMAZ, olduğu gibi döner', async () => {
    const tenantBody = { name: 'Demo Mağaza' }
    server = createRespondingServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(tenantBody))
    }).server
    const port = await listenOnLoopback(server)
    const storefrontServerFetch = createStorefrontServerFetch({ host: '127.0.0.1', port })

    const response = await storefrontServerFetch('http://demo.arkesoft.localhost/trpc/x', undefined)

    expect(response.ok).toBe(true)
    expect(await response.json()).toEqual(tenantBody)
  })

  it('yol 2 — non-2xx + appErrorBodySchema UYUYOR: reject({body, status}), mesaj literali "transport_rejection" panelle BİREBİR', async () => {
    const appErrorBody = {
      code: 'TENANT_NOT_FOUND',
      message: 'errors.tenant.notFound',
      details: {},
      requestId: 'req_1',
    }
    server = createRespondingServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify(appErrorBody))
    }).server
    const port = await listenOnLoopback(server)
    const storefrontServerFetch = createStorefrontServerFetch({ host: '127.0.0.1', port })

    let caught: unknown
    try {
      await storefrontServerFetch('http://demo.arkesoft.localhost/trpc/x', undefined)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('transport_rejection')
    expect((caught as { body: unknown }).body).toEqual(appErrorBody)
    expect((caught as { status: unknown }).status).toBe(404)
    // Fırlatılan nesne `body`/`status` DIŞINDA HİÇBİR ŞEY taşımaz (ham gövde
    // dizesi, başlıklar, URL YOK) — `Error`'ın standart (enumerable olmayan)
    // `message`/`stack` alanları DIŞINDAKİ kendi (own) enumerable anahtarları
    // tam olarak `body` ve `status`tır.
    expect(Object.keys(caught as object).sort()).toEqual(['body', 'status'])
  })

  it("yol 3 — non-2xx + gövde JSON DEĞİL (ör. ters vekilin HTML hata sayfası): OLDUĞU GİBİ tRPC'ye geçer", async () => {
    const htmlBody = '<html><body>502 Bad Gateway</body></html>'
    server = createRespondingServer((_req, res) => {
      res.writeHead(502, { 'content-type': 'text/html' })
      res.end(htmlBody)
    }).server
    const port = await listenOnLoopback(server)
    const storefrontServerFetch = createStorefrontServerFetch({ host: '127.0.0.1', port })

    const response = await storefrontServerFetch('http://demo.arkesoft.localhost/trpc/x', undefined)

    expect(response.ok).toBe(false)
    // `json()` artık SENKRON fırlamaz — bozuk JSON (burada: HTML) için
    // REDDEDİLMİŞ bir Promise döner (düzeltme turu 2'nin DoD şartı).
    await expect(response.json()).rejects.toBeInstanceOf(Error)
  })

  it("yol 3 — non-2xx + gövde JSON AMA appErrorBodySchema'ya UYMUYOR (ör. tRPC'nin KENDİ JSON-RPC hata zarfı): OLDUĞU GİBİ tRPC'ye geçer", async () => {
    const trpcOwnErrorShape = { error: { code: -32600, message: 'Bad Request' } }
    server = createRespondingServer((_req, res) => {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify(trpcOwnErrorShape))
    }).server
    const port = await listenOnLoopback(server)
    const storefrontServerFetch = createStorefrontServerFetch({ host: '127.0.0.1', port })

    const response = await storefrontServerFetch('http://demo.arkesoft.localhost/trpc/x', undefined)

    expect(response.ok).toBe(false)
    expect(await response.json()).toEqual(trpcOwnErrorShape)
  })

  it("yol 3 — boş non-2xx gövde: OLDUĞU GİBİ tRPC'ye geçer, json() undefined döner", async () => {
    server = createRespondingServer((_req, res) => {
      res.writeHead(503, { 'content-type': 'application/json' })
      res.end()
    }).server
    const port = await listenOnLoopback(server)
    const storefrontServerFetch = createStorefrontServerFetch({ host: '127.0.0.1', port })

    const response = await storefrontServerFetch('http://demo.arkesoft.localhost/trpc/x', undefined)

    expect(response.ok).toBe(false)
    expect(await response.json()).toBeUndefined()
  })
})

// A-A6'NIN STOREFRONT YOLU İÇİN YENİDEN ÖLÇÜMÜ (ZORUNLU — düzeltme turu 2
// spesifikasyonu). Gerçek `@trpc/client` (`createTrpcClient`) + gerçek
// `createStorefrontServerFetch` ponyfill'i + tek kullanımlık `node:http`
// sunucusu: sunucu HTTP 404 + DÜZ (sarılmamış) `appErrorBody` döner —
// ponyfill'in yol 2'si bunu `{body, status}` taşıma reddine ÇEVİRİR,
// `@trpc/client` bunu `TRPCClientError`'a sarar, `mapApiError` sonucu
// `{kind: 'not-found'}`'a İNDİRGER.
//
// ÖLÇÜLEN `cause` DERİNLİĞİ (ham çıktı handoff'ta): `TRPCClientError.cause`
// ponyfill'in fırlattığı `Error`'ı (`{message: 'transport_rejection', body,
// status}`) DOĞRUDAN taşıyor — panelde ölçülen derinlikle (doğrudan + 1
// seviye `cause`) BİREBİR AYNI, DAHA DERİN DEĞİL. `mapApiError`'ın "azami 1
// seviye aşağı" sınırı bu ölçüm için YETERLİ — sessizce artırılmadı.
describe('A-A6 — storefront yolu için gerçek istemci ölçümü', () => {
  let server: Server

  afterEach(async () => {
    await closeServer(server)
  })

  it('gerçek createTrpcClient + gerçek ponyfill + node:http 404 → mapApiError {kind: "not-found"}', async () => {
    const appErrorBody = {
      code: 'TENANT_NOT_FOUND',
      message: 'errors.tenant.notFound',
      details: {},
      requestId: 'req_a_a6',
    }
    server = createRespondingServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify(appErrorBody))
    }).server
    const port = await listenOnLoopback(server)

    const client = createTrpcClient({
      url: 'http://demo-magaza.arkesoft.localhost/trpc',
      fetch: createStorefrontServerFetch({ host: '127.0.0.1', port }),
    })

    let caught: unknown
    try {
      await client.storefront.currentTenant.query()
    } catch (error) {
      caught = error
    }

    expect(mapApiError(caught)).toEqual({ kind: 'not-found' })

    // ÖLÇÜLEN GERÇEK ŞEKİL — `cause` derinliğinin kanıtı (yukarıdaki yorumun
    // ham ölçümü): `TRPCClientError.cause` DOĞRUDAN ponyfill'in Error'ı.
    expect(caught).toBeInstanceOf(Error)
    const cause = (caught as { cause: unknown }).cause
    expect(cause).toBeInstanceOf(Error)
    expect((cause as { body: unknown }).body).toEqual(appErrorBody)
    expect((cause as { status: unknown }).status).toBe(404)
  })
})
