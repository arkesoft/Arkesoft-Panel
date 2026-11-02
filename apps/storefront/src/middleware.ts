// @arkesoft/storefront — tek yetki noktası: host → kiracı çözümü, önbellek
// politikası, 404/503 eşlemesi (ROADMAP v0.0.8, T-009/S6, architect K21)
//
// UYARI 1 (bağlayıcı, ölçülerek doğrulandı): Astro 7.4.2'de `context.url.
// host`/`.hostname` gelen `Host` başlığını TAMAMEN YOK SAYAR ve HER İSTEKTE
// `localhost:<port>`'a düşer (`astro/dist/core/app/node.js:41-45`,
// `server.allowedHosts` ayarlanmadıkça `validateHost` her zaman `undefined`
// döner). Kiracı host'u bu yüzden YALNIZCA `context.request.headers.
// get('host')`'tan okunur — `server.allowedHosts` de AYARLANMAZ (ikinci bir
// allowlist = ikinci doğruluk kaynağı olurdu); doğrulama zinciri tamamen
// `resolveHost` + `RESERVED_SUBDOMAINS` + (ileride) `TenantGuard`'a devredilir.
//
// UYARI 3 / I-404 (bağlayıcı): `applyStorefrontCachePolicy` HER dönüş
// yolunda, KOŞULSUZ çağrılır — 404 ve 503 dalları DAHİL (v0.0.7'nin 0/5
// dersi: önbellek başlığı yalnızca başarılı yanıtlara yazılırsa guard reddi
// yanıtları bunu kaçırır). HTTP durumu TEK bu dosyada damgalanır
// (`withStatus`) — hiçbir sayfa/endpoint `Astro.response.status` AYARLAMAZ.
//
// AC8 (bağlayıcı): `resolveHost`'un 8 çözümsüz sebebinin TAMAMI aynı
// `resolved.kind === 'unresolved'` dalından tek jenerik 404'e düşer; `.reason`
// alanına BURADA DA erişilmez — sebep kodu bu dosyadan DIŞARI ÇIKMAZ.
//
// Hata eşlemesi (bağlayıcı, architect gerekçesi — DÜZELTME TURU 2 İLE
// GÜNCELLENDİ): tRPC çağrısı fırlarsa hata `src/lib/map-api-error.ts`'in
// `mapApiError`'ına verilir. Bu fonksiyon İKİ taşıma zarfını tanır —
// `storefront-server-fetch.ts`'in ponyfill'inin fırlattığı `{status, body}`
// taşıma reddi (A-A6'nın ölçtüğü GERÇEK şekil) VE tRPC'nin kendi istemci
// hata zarfı (bugün üretimde tetiklenmiyor, `map-api-error.ts`'in dosya başı
// yorumunda gerekçeli) — şekle GÜVENİLMEZ, `instanceof` YOK. Sonuç `kind:
// 'not-found'` → 404 sayfası (kiracı yok/soft-delete), `kind: 'unavailable'`
// → 503 sayfası. API kesintisini 404'e eşlemek her kiracının TÜM
// sayfalarını arama motorlarına "silinmiş" bildirirdi — haftalarla ölçülen
// SEO zararı. (Probe'ların şema tanımları ve yapısal doğrulama çağrıları
// artık YALNIZCA `map-api-error.ts`'te yaşar; bu dosya bir Zod ayrıştırma
// aracına veya şema adına doğrudan referans VERMEZ — kabul: bu dosyada o
// dosyaya-özgü tesisata ait bir isim SIFIR eşleşme üretir.)
//
// DÜZELTME (T-009, düzeltme turu 1, qa'nın bulgusu — bağlayıcı, kaynakta
// doğrulandı): `context.rewrite('/404')`/`context.rewrite('/503')` Astro'nun
// middleware zincirini (bu `onRequest`'in KENDİSİNİ) rewrite HEDEFİ için de
// YENİDEN ÇALIŞTIRIR (`astro/dist/core/middleware/astro-middleware.js`
// `handleMiddleware`'in `state.counter`'ı + `rewrites/handler.js`
// `applyRewriteToState`'in `state.url`'i rewrite PATH'ine çevirmesi).
// `skipMiddleware` burada TRUE OLMAZ — o AYRI bir kontrol, yalnızca Astro'nun
// KENDİ dahili 404 akışında devreye girer. Çözümsüz bir `Host` değişmediği
// için ikinci (üçüncü, dördüncü...) geçiş AYNI 404/503 kararına döner →
// `state.counter === 4`'te Astro "Loop Detected" (508, düz metin) döndürür;
// bu yanıt yukarıdaki `withStatus`/`applyStorefrontCachePolicy` katmanlarından
// GEÇER ve kullanıcıya KAZARA 404 (gövdesi "Loop Detected") veya 503 olarak
// SIZAR (ölçüldü, 3/3 deterministik). Düzeltme: rewrite HEDEFİNİN kendisini
// (`/404`/`/503`) `onRequest`'in EN BAŞINDA `context.url.pathname`'den tanıyıp
// kiracı çözümünü (host okuma, `resolveHost`, tRPC çağrısı) TAMAMEN ATLA —
// döngü hiç BAŞLAMAZ (`renderNotFound`/`renderUnavailable` içindeki
// `context.rewrite` çağrısı en fazla BİR kez middleware'i yeniden tetikler;
// ikinci geçişte erken çıkış devreye girer, `state.counter` asla 3'ün
// üzerine ÇIKMAZ).
//
// Değerlendirilip REDDEDİLEN alternatifler:
// - `context.rewrite('/404')` yerine `next('/404')`'e rewrite PAYLOAD'ı
//   vermek: `next` burada Astro'nun middleware `next` fonksiyonu, `context.
//   rewrite` DEĞİL — aynı re-entrancy mekanizmasını (`handleMiddleware`'in
//   `next` sarmalayıcısı) paylaşıyor, SORUNU ÇÖZMEZ, yalnızca giriş noktasını
//   değiştirir.
// - Doğrudan `new Response(...)` döndürüp 404/503 sayfasının HTML'ini elle
//   render etmek: `404.astro`/`503.astro`'nun Astro'nun KENDİ render
//   boru hattından (layout, `<meta>`, derleme zamanı statik optimizasyon)
//   GEÇMESİNİ engeller; iki render yolu (middleware'in elle ürettiği HTML'i
//   VE Astro'nun derlediği sayfa) birbirinden SAPABİLİR — I-404'ün "tek
//   yetki noktası" ilkesiyle ÇELİŞİR.
// - `Astro.rewrite` yerine `Response.redirect` (3xx) ile `/404`'e
//   YÖNLENDİRMEK: HTTP durumunu kullanıcıya YANLIŞ bildirir (arama motoru
//   302/404'ü "geçici taşınma" sanır), AC8'in "durum tam 404" şartını İHLAL
//   eder.
//
// Güvenlik sorusu (qa'nın sorduğu, bağlayıcı — ölçüldü): erken çıkış kiracı
// çözümünü ATLADIĞI için GEÇERLİ bir kiracı host'unda `/404`/`/503`'ü
// DOĞRUDAN isteyen bir ziyaretçi de bu daldan geçer. Bu GÜVENLİ: `src/pages/
// 404.astro` ve `503.astro` `Astro.locals.tenant`'ı HİÇ OKUMAZ,
// `requireResolvedTenant`'ı HİÇ ÇAĞIRMAZ (ikisinin de dosya başı yorumu,
// AC6) — kiracıya özgü hiçbir bayt sızdırılmaz, ikisi de HER ziyarette
// BAYT BAYT AYNI statik sayfayı render eder. `rg -n "locals\.tenant|
// requireResolvedTenant" src/pages/404.astro src/pages/503.astro` → 0 eşleşme
// (bu değişmezlik İŞ 1'in kabulü için ÖLÇÜLDÜ, handoff'ta tekrarlanıyor).

import { defineMiddleware } from 'astro/middleware'

import { normalizeHostname, resolveHost } from '@arkesoft/tenancy'

import { createStorefrontTrpcClient } from './lib/api-client.js'
import { applyStorefrontCachePolicy } from './lib/cache-policy.js'
import { mapApiError } from './lib/map-api-error.js'
import { resolveRequestOrigin } from './lib/request-origin.js'
import { storefrontEnv } from './lib/storefront-env.js'

/** `APP_BASE_DOMAIN` açılışta AYNI normalizasyondan geçer (K21 adım 2, `tenant-resolver.service.ts:115-126`'nın BİREBİR deseni). */
function resolveNormalizedBaseDomain(rawBaseDomain: string): string {
  const normalized = normalizeHostname(rawBaseDomain)

  if (normalized === undefined) {
    throw new Error(`middleware.ts: APP_BASE_DOMAIN ("${rawBaseDomain}") normalize edilemedi.`)
  }

  return normalized
}

/** Modül yüklenirken BİR KEZ hesaplanır; normalize edilemezse süreç AÇILIŞTA fırlar. */
const NORMALIZED_BASE_DOMAIN = resolveNormalizedBaseDomain(storefrontEnv.APP_BASE_DOMAIN)

/**
 * `StorefrontApiFailure.kind`'ın EXHAUSTIVE `switch`'inde `default` dalında
 * çağrılır (CLAUDE.md §4) — `apps/admin/src/errors/assert-never.ts`'in AYNI
 * deseni, YEREL kopya (`apps/*` → `apps/*` import YASAK, CLAUDE.md §3).
 */
function assertNever(value: never, context: string): never {
  throw new Error(`${context}: beklenmeyen değer — ${JSON.stringify(value)}`)
}

/** `response`'un GÖVDE/BAŞLIKLARINI koruyarak yeni bir durum koduyla sarar — `Response.status` salt okunur olduğu için YENİ bir nesne gerekir. */
function withStatus(response: Response, status: number): Response {
  return new Response(response.body, { status, headers: response.headers })
}

/** Rewrite hedefinin damgalayacağı durum kodu — `/404`/`/503` DIŞINDA bir yol bu eşlemede YOKTUR. */
function statusForRewriteTarget(pathname: '/404' | '/503'): 404 | 503 {
  switch (pathname) {
    case '/404':
      return 404
    case '/503':
      return 503
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  // Adım 0 — ERKEN ÇIKIŞ (dosya başı "DÜZELTME" yorumu, bağlayıcı): bu
  // çağrı `context.rewrite('/404')`/`context.rewrite('/503')`'ün YENİDEN
  // tetiklediği geçiştir. Kiracı çözümü burada bir kez daha çalışsa AYNI
  // sonuca (çözümsüz/hata) varıp `context.rewrite`'ı TEKRAR çağırır —
  // re-entrancy zinciri Astro'nun `state.counter === 4` eşiğine doğru
  // büyür ("Loop Detected"). Pathname `/404`/`/503` İSE kiracı çözümünü
  // TAMAMEN ATLA; durumu burada damgala, `next()`'i DOĞRUDAN çağırıp
  // `404.astro`/`503.astro`'nun kendi render çıktısını al.
  if (context.url.pathname === '/404' || context.url.pathname === '/503') {
    // DÜZELTME (T-009, düzeltme turu 1, solid bulgu 1 — bağlayıcı): bu dal
    // `next()`'i kiracı çözümü hiç çalışmadan çağırıyor, ama `App.Locals.
    // tenant` (`env.d.ts`) ZORUNLU bildirilmiş — yazmazsak tip burada
    // YALAN söyler ve `requireResolvedTenant`'ı çağıran bir sayfa `TypeError`
    // alır (tasarlanmış Türkçe hata YERİNE). `unresolved` dalı zaten ayrık
    // birleşimin ULAŞILABİLİR üyesi (`storefront-tenant-context.ts`) —
    // burada yazılması onu üretim kodunda da GERÇEK kılıyor.
    context.locals.tenant = { kind: 'unresolved' }
    const pageResponse = await next()
    const status = statusForRewriteTarget(context.url.pathname)
    const stampedResponse = withStatus(pageResponse, status)
    applyStorefrontCachePolicy(stampedResponse.headers)
    return stampedResponse
  }

  const renderNotFound = async (): Promise<Response> =>
    withStatus(await context.rewrite('/404'), 404)
  const renderUnavailable = async (): Promise<Response> =>
    withStatus(await context.rewrite('/503'), 503)

  // Adım 1 — kiracı host'u YALNIZCA `Host` başlığından (UYARI 1).
  const rawHostHeader = context.request.headers.get('host') ?? undefined

  // Adım 2-3 — saf çözümleme; `unresolved` → API'ye ÇAĞRI YAPILMAZ, doğrudan 404.
  const resolved = resolveHost(rawHostHeader, NORMALIZED_BASE_DOMAIN)

  if (resolved.kind === 'unresolved') {
    const notFoundResponse = await renderNotFound()
    applyStorefrontCachePolicy(notFoundResponse.headers)
    return notFoundResponse
  }

  // Adım 4 — `resolved` burada `subdomain`/`custom-domain`'e DARALTILDI
  // (TypeScript kontrol akışı narrowing'i); exhaustive switch, default YOK.
  let normalizedHost: string
  switch (resolved.kind) {
    case 'subdomain':
      normalizedHost = `${resolved.slug}.${NORMALIZED_BASE_DOMAIN}`
      break
    case 'custom-domain':
      normalizedHost = resolved.host
      break
  }

  let tenantName: string
  try {
    const client = createStorefrontTrpcClient(normalizedHost)
    const result = await client.storefront.currentTenant.query()
    tenantName = result.name
  } catch (error) {
    // Adım 5 — hata eşlemesi (bağlayıcı, dosya başı yorumu);
    // `mapApiError`'ın döndürdüğü `kind` üzerinde EXHAUSTIVE `switch`.
    const failure = mapApiError(error)

    let failureResponse: Response
    switch (failure.kind) {
      case 'not-found':
        failureResponse = await renderNotFound()
        break
      case 'unavailable':
        failureResponse = await renderUnavailable()
        break
      default:
        assertNever(failure, 'middleware.ts: StorefrontApiFailure.kind')
    }

    applyStorefrontCachePolicy(failureResponse.headers)
    return failureResponse
  }

  // Adım 6 — `locals.tenant` yazılır, `next()` çağrılır.
  const origin = resolveRequestOrigin(context.url, normalizedHost)
  context.locals.tenant = { kind: 'resolved', tenant: { name: tenantName }, origin }

  const response = await next()

  // Adım 7 — KOŞULSUZ, her başarılı dönüş yolunda da (UYARI 3).
  applyStorefrontCachePolicy(response.headers)
  return response
})
