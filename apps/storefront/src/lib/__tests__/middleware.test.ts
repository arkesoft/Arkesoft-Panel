// @arkesoft/storefront — middleware.ts testleri (ROADMAP v0.0.8, T-009/S6,
// DoD "middleware'in yedi adımı ve 404/503 eşlemesi")
//
// `../api-client.js` VE `../storefront-env.js` MOCKLANIR: bu dosya gerçek
// bir ağ bağlantısı KURMAZ, `process.env`'e dokunmaz (ikisi de `vi.mock`
// ile değiştirildiği için `../../middleware.js` STATİK import edilebilir —
// `vi.mock` çağrıları Vitest tarafından dosyanın EN başına HOISTED edilir).
//
// `context`/`next` gerçek Astro çalışma zamanı tiplerinin (`APIContext`/
// `MiddlewareNext`) KARMAŞIK üçüncü taraf şekilleri olduğu için test
// içinde SAHTE (fake) nesnelerle `as unknown as <tip>` ile oluşturulur —
// `apps/api/src/__tests__/tenant-guard.test.ts:55`'in (`{} as unknown as
// ExecutionContext`) AYNI, önceden kabul edilmiş test-dosyası deseni
// (CLAUDE.md §4'ün "yalnızca runtime doğrulamasından hemen sonra" kuralı
// ÜRETİM kodu için; bu dosyada tip zorlaması yalnızca test fixture'ı
// kurmak için kullanılıyor, davranış DOĞRULAMASI `expect`'lerde).
import { afterEach, describe, expect, it, vi } from 'vitest'

// `vi.mock` çağrıları dosyanın EN BAŞINA hoisted edilir — fabrikanın
// kapattığı (closure) `queryMock`/`createStorefrontTrpcClientMock`
// normal `const` ile tanımlanırsa hoisting SIRASINDA henüz İLKLENMEMİŞ
// olurlar (`ReferenceError`, ÖLÇÜLDÜ). `vi.hoisted` bu ikisini AYNI
// hoisting aşamasına taşır.
const { queryMock, createStorefrontTrpcClientMock } = vi.hoisted(() => {
  const hoistedQueryMock = vi.fn()
  const hoistedCreateStorefrontTrpcClientMock = vi.fn(() => ({
    storefront: { currentTenant: { query: hoistedQueryMock } },
  }))
  return {
    queryMock: hoistedQueryMock,
    createStorefrontTrpcClientMock: hoistedCreateStorefrontTrpcClientMock,
  }
})

vi.mock('../api-client.js', () => ({
  createStorefrontTrpcClient: createStorefrontTrpcClientMock,
}))

vi.mock('../storefront-env.js', () => ({
  storefrontEnv: {
    APP_BASE_DOMAIN: 'arkesoft.localhost',
    STOREFRONT_API_BASE_URL: 'http://127.0.0.1:3000',
  },
}))

import { onRequest } from '../../middleware.js'
import { requireResolvedTenant } from '../storefront-tenant-context.js'

type OnRequestContext = Parameters<typeof onRequest>[0]
type OnRequestNext = Parameters<typeof onRequest>[1]

function htmlResponse(body: string): Response {
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function buildContext(options: {
  readonly host?: string
  /** Varsayılan `'/'` — erken çıkış testleri (bulgu 2) `/404`/`/503`'ü doğrudan ister. */
  readonly pathname?: string
  readonly rewrite: (path: string) => Response
}): OnRequestContext {
  const headers = new Headers()
  if (options.host !== undefined) {
    headers.set('host', options.host)
  }

  return {
    request: new Request('http://ignored.internal/', { headers }),
    // UYARI 1'in ÖLÇÜLMÜŞ gerçeği: Astro 7.4.2'de `context.url` gelen Host'u
    // YOK SAYIP `localhost:<port>`'a düşer — bu sahte nesne BİLEREK o
    // kırık gerçeği taklit ediyor: middleware'in `context.url.host`'u
    // DEĞİL, yalnızca `.protocol`/`.port`'u okuduğu bu testle kanıtlanıyor.
    url: new URL(`http://localhost:4321${options.pathname ?? '/'}`),
    locals: {},
    rewrite: vi.fn(options.rewrite),
  } as unknown as OnRequestContext
}

/** `value`'nun GERÇEKTEN bir `Response` olduğunu runtime'da doğrular ve TypeScript'e bunu daraltır (CLAUDE.md §4: "unknown + narrowing", "as yalnızca runtime doğrulamasından hemen sonra"). */
function expectResponse(value: unknown): Response {
  if (!(value instanceof Response)) {
    throw new Error('middleware beklenmedik şekilde Response döndürmedi')
  }
  return value
}

afterEach(() => {
  queryMock.mockReset()
  createStorefrontTrpcClientMock.mockClear()
})

describe('onRequest — adım 1-3: host çözümü (UYARI 1, AC8)', () => {
  it("Host başlığı YOKSA API'ye hiç çağrı yapmadan 404 döner, cache-control uygulanır", async () => {
    const rewrite = vi.fn((path: string) => htmlResponse(`rewrite:${path}`))
    const context = buildContext({ rewrite })
    const next = vi.fn(() => htmlResponse('unreached')) as unknown as OnRequestNext

    const response = expectResponse(await onRequest(context, next))

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(context.rewrite).toHaveBeenCalledWith('/404')
    expect(createStorefrontTrpcClientMock).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it("rezerve bir alt alan adı (8 sebepten biri) AYNI jenerik 404'e düşer — sebep kodu hiçbir yere SIZMAZ", async () => {
    const rewrite = vi.fn((path: string) => htmlResponse(`rewrite:${path}`))
    const context = buildContext({ host: 'www.arkesoft.localhost', rewrite })
    const next = vi.fn() as unknown as OnRequestNext

    const response = expectResponse(await onRequest(context, next))

    expect(response.status).toBe(404)
    expect(context.rewrite).toHaveBeenCalledWith('/404')
    expect(createStorefrontTrpcClientMock).not.toHaveBeenCalled()
  })
})

describe('onRequest — adım 4-6: başarılı çözümleme', () => {
  it("subdomain host'u için trpc istemcisini TAM normalize edilmiş host ile kurar, locals.tenant'ı yazar, next() çağırır", async () => {
    queryMock.mockResolvedValueOnce({ name: 'Demo Mağaza' })
    const context = buildContext({
      host: 'demo.arkesoft.localhost',
      rewrite: (path: string) => htmlResponse(path),
    })
    const next = vi.fn(() => htmlResponse('<h1>Demo Mağaza</h1>')) as unknown as OnRequestNext

    const response = expectResponse(await onRequest(context, next))

    expect(createStorefrontTrpcClientMock).toHaveBeenCalledWith('demo.arkesoft.localhost')
    expect(context.locals.tenant).toEqual({
      kind: 'resolved',
      tenant: { name: 'Demo Mağaza' },
      // `url.host` ('localhost:4321') DEĞİL — normalizedHost + url.protocol/.port.
      origin: 'http://demo.arkesoft.localhost:4321',
    })
    expect(next).toHaveBeenCalledTimes(1)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it("özel alan adı (custom-domain) host'u OLDUĞU GİBİ (subdomain birleştirmesi YAPILMADAN) kullanılır", async () => {
    queryMock.mockResolvedValueOnce({ name: 'Müşteri Mağazası' })
    const context = buildContext({
      host: 'musteri-magazasi.com',
      rewrite: (path: string) => htmlResponse(path),
    })
    const next = vi.fn(() => htmlResponse('<h1>Müşteri Mağazası</h1>')) as unknown as OnRequestNext

    await onRequest(context, next)

    expect(createStorefrontTrpcClientMock).toHaveBeenCalledWith('musteri-magazasi.com')
    expect(context.locals.tenant).toEqual({
      kind: 'resolved',
      tenant: { name: 'Müşteri Mağazası' },
      origin: 'http://musteri-magazasi.com:4321',
    })
  })

  it('başarılı dönüşte cache-control, içerik türünden (robots.txt/sitemap.xml sınıfları dahil) BAĞIMSIZ KOŞULSUZ uygulanır', async () => {
    queryMock.mockResolvedValueOnce({ name: 'Demo Mağaza' })
    const context = buildContext({
      host: 'demo.arkesoft.localhost',
      rewrite: (path: string) => htmlResponse(path),
    })
    const next = vi.fn(
      () =>
        new Response('User-agent: *', {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
    ) as unknown as OnRequestNext

    const response = expectResponse(await onRequest(context, next))

    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('onRequest — adım 5: tRPC hata eşlemesi (404 vs 503)', () => {
  it('data.httpStatus === 404 olan bir tRPC hatası → 404 (soft-delete/yok kiracı)', async () => {
    queryMock.mockRejectedValueOnce({
      data: {
        code: 'NOT_FOUND',
        httpStatus: 404,
        appError: {
          code: 'TENANT_NOT_FOUND',
          message: 'errors.tenant.notFound',
          details: {},
          requestId: 'req_test',
        },
      },
    })
    const rewrite = vi.fn((path: string) => htmlResponse(path))
    const context = buildContext({ host: 'demo.arkesoft.localhost', rewrite })
    const next = vi.fn() as unknown as OnRequestNext

    const response = expectResponse(await onRequest(context, next))

    expect(response.status).toBe(404)
    expect(context.rewrite).toHaveBeenCalledWith('/404')
    expect(next).not.toHaveBeenCalled()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it("data.httpStatus !== 404 olan bir tRPC hatası (ör. 500) → 503, 404'E DÜŞMEZ", async () => {
    queryMock.mockRejectedValueOnce({
      data: {
        code: 'INTERNAL_SERVER_ERROR',
        httpStatus: 500,
        appError: {
          code: 'INTERNAL_ERROR',
          message: 'errors.internal',
          details: {},
          requestId: 'req_test',
        },
      },
    })
    const rewrite = vi.fn((path: string) => htmlResponse(path))
    const context = buildContext({ host: 'demo.arkesoft.localhost', rewrite })
    const next = vi.fn() as unknown as OnRequestNext

    const response = expectResponse(await onRequest(context, next))

    expect(response.status).toBe(503)
    expect(context.rewrite).toHaveBeenCalledWith('/503')
  })

  it('yapısı tanınmayan bir hata (bağlantı reddi/zaman aşımı benzetimi) → 503 — boş catch YOK, fail-closed', async () => {
    queryMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const rewrite = vi.fn((path: string) => htmlResponse(path))
    const context = buildContext({ host: 'demo.arkesoft.localhost', rewrite })
    const next = vi.fn() as unknown as OnRequestNext

    const response = expectResponse(await onRequest(context, next))

    expect(response.status).toBe(503)
    expect(context.rewrite).toHaveBeenCalledWith('/503')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('onRequest — re-entrancy (T-009 düzeltme turu 1: "Loop Detected" regresyonu)', () => {
  // Yukarıdaki `buildContext`'in `rewrite` sahtesi DÜZ bir `vi.fn` —
  // `context.rewrite(path)` çağrıldığında `onRequest`'i GERÇEKTEN yeniden
  // çalıştırmıyor, bu yüzden Astro'nun GERÇEK re-entrancy davranışını
  // (bulgunun kök nedeni) TAKLİT EDEMİYOR ve bu sınıftaki regresyonu
  // YAKALAYAMIYOR (orkestratörün bulgusu — ölçüldü, bu 41 test hiç
  // kırmızıya düşmedi). Bu describe bloğu `context.rewrite`'ı GERÇEĞE
  // yaklaştıran bir sarmalayıcıyla değiştiriyor: `rewrite(path)` çağrıldığında
  // `url.pathname`'i `path`'e çevrilmiş YENİ bir context ile `onRequest`'i
  // YENİDEN çağırıyor — `astro/dist/core/middleware/astro-middleware.js`
  // `handleMiddleware`'in `state.counter`'ının KÜÇÜLTÜLMÜŞ bir modeli
  // (4. girişte, gerçek Astro'nun yaptığı gibi, `onRequest`'i BİR DAHA
  // ÇAĞIRMADAN düz metin "Loop Detected" döner).
  //
  // (a) seçildi, (b) değil: e2e (`e2e/storefront-host.spec.ts`) CI'a
  // bağlanamıyor (R6, vade v0.0.19) — bu sınıfı yakalayan TEK bekçi yerel
  // bir koşuma kalırsa gerileme SESSİZCE geri gelebilir. Aşağıdaki sarmalayıcı
  // gerçek Astro re-entrancy'sini davranışsal olarak YETERİNCE taklit
  // edebildiği (kanıt: mutasyon testi, bu dosyanın altındaki rapor notu)
  // için (a) burada MEŞRU VE YETERLİ.
  function createLoopSimulatingHarness(): {
    readonly run: (context: OnRequestContext, next: OnRequestNext) => Promise<Response>
    readonly invocationCount: () => number
  } {
    let counter = 0

    const run = async (context: OnRequestContext, next: OnRequestNext): Promise<Response> => {
      counter += 1
      // Astro'nun GERÇEK eşiği: 4. girişte `onRequest`'i BİR DAHA ÇAĞIRMADAN
      // "Loop Detected" döner (kaynakta doğrulandı, dosya başı DÜZELTME
      // yorumu).
      if (counter === 4) {
        return new Response('Loop Detected', { status: 508 })
      }
      // `onRequest`'in tipi (`MiddlewareHandler`) teorik olarak `void`
      // dönüşüne de izin verir (Astro'nun middleware SÖZLEŞMESİ); bu
      // `onRequest` HER yolda `Response` döndürdüğü için (üretim koduna
      // güvenilir) `expectResponse` runtime'da DOĞRULAYIP daraltıyor (CLAUDE.
      // md §4: "unknown + narrowing", `as` yalnızca doğrulamadan SONRA).
      return expectResponse(await onRequest(context, next))
    }

    return { run, invocationCount: () => counter }
  }

  /** `path` için GERÇEK bir rewrite hedefinin url'ini (host SABİT kalır — Host başlığı rewrite'ta DEĞİŞMEZ) taklit eden context üretir. */
  function buildReentrantContext(options: {
    readonly host?: string
    readonly run: (context: OnRequestContext, next: OnRequestNext) => Promise<Response>
    readonly renderedPageResponse: Response
  }): OnRequestContext {
    const makeContext = (pathname: string): OnRequestContext => {
      const headers = new Headers()
      if (options.host !== undefined) {
        headers.set('host', options.host)
      }

      return {
        request: new Request('http://ignored.internal/', { headers }),
        url: new URL(`http://localhost:4321${pathname}`),
        locals: {},
        rewrite: vi.fn(async (rewritePath: string) => {
          const rewrittenContext = makeContext(rewritePath)
          const rewrittenNext = vi.fn(
            () => options.renderedPageResponse,
          ) as unknown as OnRequestNext
          return options.run(rewrittenContext, rewrittenNext)
        }),
      } as unknown as OnRequestContext
    }

    return makeContext('/')
  }

  it('çözümsüz host → gerçek re-entrancy taklit edilince middleware TAM 2 kez çalışır, "Loop Detected" ASLA üretilmez', async () => {
    const { run, invocationCount } = createLoopSimulatingHarness()
    const renderedPageResponse = htmlResponse('<h1>Mağaza bulunamadı</h1>')
    const context = buildReentrantContext({ run, renderedPageResponse }) // host YOK → unresolved
    const initialNext = vi.fn(() => htmlResponse('unreached')) as unknown as OnRequestNext

    const response = expectResponse(await run(context, initialNext))

    // Erken çıkış SAYESİNDE: 1. giriş (çözümsüz host, rewrite('/404') çağırır)
    // + 2. giriş (pathname === '/404', erken çıkış devreye girer, next()
    // çağırır, rewrite'ı BİR DAHA ÇAĞIRMAZ) = 2. Asla 4'e ULAŞMAZ.
    expect(invocationCount()).toBe(2)
    expect(response.status).toBe(404)
    expect(await response.clone().text()).not.toContain('Loop Detected')
    expect(createStorefrontTrpcClientMock).not.toHaveBeenCalled()
  })

  it('API erişilemez (503) → gerçek re-entrancy taklit edilince middleware TAM 2 kez çalışır, "Loop Detected" ASLA üretilmez (solid bulgu 2: "/503" kolu MUTASYONLA ölçülüyor)', async () => {
    queryMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const { run, invocationCount } = createLoopSimulatingHarness()
    const renderedPageResponse = htmlResponse('<h1>Mağaza şu anda yanıt vermiyor</h1>')
    const context = buildReentrantContext({
      host: 'demo.arkesoft.localhost',
      run,
      renderedPageResponse,
    })
    const initialNext = vi.fn(() => htmlResponse('unreached')) as unknown as OnRequestNext

    const response = expectResponse(await run(context, initialNext))

    // Erken çıkış SAYESİNDE: 1. giriş (host çözülür, API 503'e eşlenir,
    // rewrite('/503') çağırır) + 2. giriş (pathname === '/503', erken çıkış
    // devreye girer, next() çağırır, kiracı çözümünü BİR DAHA ÇALIŞTIRMAZ,
    // rewrite'ı BİR DAHA ÇAĞIRMAZ) = 2. Asla 4'e ULAŞMAZ. Koşuldan "/503"
    // çıkarılırsa 2. giriş tam kiracı çözümüne düşer, `createStorefrontTrpcClientMock`
    // ikinci kez çağrılır, döngü 4'e ULAŞIR ve "Loop Detected" SIZAR (bu test
    // o durumda KIRMIZIYA döner — orkestratörün mutasyon kanıtı).
    expect(invocationCount()).toBe(2)
    expect(response.status).toBe(503)
    expect(await response.clone().text()).not.toContain('Loop Detected')
    expect(createStorefrontTrpcClientMock).toHaveBeenCalledTimes(1)
  })
})

describe('onRequest — erken çıkış: locals.tenant yazılır (T-009 düzeltme turu 1, solid bulgu 1)', () => {
  it(
    "pathname '/404' İSE `locals.tenant = { kind: 'unresolved' }` yazılır; " +
      'requireResolvedTenant bu bağlamla çağrılırsa TASARLANMIŞ Türkçe hatayı fırlatır (TypeError DEĞİL)',
    async () => {
      const context = buildContext({
        pathname: '/404',
        rewrite: (path: string) => htmlResponse(`rewrite:${path}`),
      })
      const next = vi.fn(() =>
        htmlResponse('<h1>Mağaza bulunamadı</h1>'),
      ) as unknown as OnRequestNext

      await onRequest(context, next)

      // `env.d.ts`'teki `tenant` alanı ZORUNLU kaldı (opsiyonele çevrilmedi) —
      // bu yüzden `.tenant`'ın GERÇEKTEN yazıldığını (undefined KALMADIĞINI)
      // doğrulamak tipin yalan söylemediğini kanıtlıyor.
      expect(context.locals.tenant).toEqual({ kind: 'unresolved' })

      // Bu satır KALDIRILIRSA `context.locals.tenant` `undefined` kalır ve
      // aşağıdaki çağrı `requireResolvedTenant`'ın İÇİNDE `context.kind`
      // okurken `TypeError` fırlatır (tasarlanmış hata YERİNE) — mutasyon
      // kanıtı handoff'ta.
      expect(() => requireResolvedTenant(context.locals.tenant)).toThrow(
        'storefront: unresolved tenant bağlamıyla bir sayfa/endpoint render edilmeye çalışıldı (middleware.ts K21 adım 3 garantisi ihlal edildi).',
      )
    },
  )
})

describe('onRequest — erken çıkış: doğrudan GET /404, GET /503 (T-009 düzeltme turu 1, solid bulgu 2)', () => {
  it("doğrudan GET /404 isteğinde kiracı çözümü TAMAMEN ATLANIR — istemci mock'u ÇAĞRILMAZ, durum 404 damgalanır, cache-control uygulanır", async () => {
    const context = buildContext({
      pathname: '/404',
      rewrite: (path: string) => htmlResponse(`rewrite:${path}`),
    })
    const next = vi.fn(() => htmlResponse('<h1>Mağaza bulunamadı</h1>')) as unknown as OnRequestNext

    const response = expectResponse(await onRequest(context, next))

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(next).toHaveBeenCalledTimes(1)
    // Güvenlik iddiası (dosya başı yorumu, middleware.ts:75-83): erken çıkış
    // kiracı çözümünü TAMAMEN atlar — API istemcisi HİÇ KURULMAZ/ÇAĞRILMAZ.
    expect(createStorefrontTrpcClientMock).not.toHaveBeenCalled()
    expect(queryMock).not.toHaveBeenCalled()
    expect(context.rewrite).not.toHaveBeenCalled()
  })

  it("doğrudan GET /503 isteğinde kiracı çözümü TAMAMEN ATLANIR — istemci mock'u ÇAĞRILMAZ, durum 503 damgalanır, cache-control uygulanır", async () => {
    const context = buildContext({
      pathname: '/503',
      rewrite: (path: string) => htmlResponse(`rewrite:${path}`),
    })
    const next = vi.fn(() =>
      htmlResponse('<h1>Mağaza şu anda yanıt vermiyor</h1>'),
    ) as unknown as OnRequestNext

    const response = expectResponse(await onRequest(context, next))

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(next).toHaveBeenCalledTimes(1)
    expect(createStorefrontTrpcClientMock).not.toHaveBeenCalled()
    expect(queryMock).not.toHaveBeenCalled()
    expect(context.rewrite).not.toHaveBeenCalled()
  })
})
