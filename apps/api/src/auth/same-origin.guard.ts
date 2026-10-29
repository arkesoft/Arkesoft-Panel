// @arkesoft/api — SameOriginGuard (FIX turu 1, madde 6 — F5, medium; FIX
// turu 2, madde 2 — security tur2 S-3, `medium`)
//
// `/auth/sessions*` üçlüsünün (`SessionsController`) kendi CSRF savunması.
// ÖLÇÜLDÜ (security gate): geçerli çerez + `Origin: https://evil.example.com`
// → `POST /auth/sessions/revoke-all` → 200 (işlem GERÇEKLEŞTİ). `SameSite=Lax`
// yalnızca ÇAPRAZ-SİTE'yi engeller; `kiracı.arkesoft.app` → `panel.arkesoft.app`
// AYNI SİTEDİR (aynı kayıtlı alan adı, `crossSubDomainCookies`'in ZORUNLU
// sonucu, architect riski 3) — tarayıcı çerezi GÖNDERİR; `revoke-all` gövde
// OKUMADIĞI için düz bir HTML `<form>` preflight'SİZ tetiklenebilir.
//
// **FIX turu 2 ÖNCESİ "EŞDEĞERİ"/FAIL-OPEN iddiası security tur2'de KAYNAK
// OKUNARAK ÇÜRÜTÜLDÜ** — bu guard, taklit ettiğini söylediği korumadan
// (Better Auth'un `origin-check.mjs`) TAM OLARAK önemli olan dalda DAHA
// ZAYIFTI: `Origin`/`Sec-Fetch-Site`/`Referer` HİÇBİRİ gönderilmeden +
// `Cookie` VARKEN Better Auth `403 MISSING_OR_NULL_ORIGIN` ile REDDEDİYOR
// (fail-CLOSED, `Referer`'a da düşüyor) — bu dosyanın ÖNCEKİ hâli AYNI
// girdide `true` (fail-OPEN) dönüyordu, gerekçesi de bir SÜREÇ kısıtıydı
// ("mevcut test paketini KIRMAMAK için") — CLAUDE.md §10.6'nın yasakladığı
// yönün aynası (test gevşetmesi GÖRÜNÜR, kontrol gevşetmesi GÖRÜNMEZ).
//
// **SEÇİLEN DÜZELTME — fail-open'ı DARALT, KALDIRMA ZORUNLU DEĞİL:**
// `Origin`/`Sec-Fetch-Site`/`Referer` ÜÇÜ DE YOK **VE** istek `Cookie`
// TAŞIYORSA → `missing_origin_with_cookie` ihlali (Better Auth'un
// `useCookies` eşiğiyle AYNI). `Origin` yokken `Referer`'ın ORİJİNİNE
// düşülür (Better Auth'un AYNI sırası). **Yalnızca GÜVENSİZ metotlarda**
// (`GET`/`HEAD`/`OPTIONS` DIŞI) uygulanır — modern tarayıcılar `Origin`'i
// SADECE çapraz-orijin GET isteklerinde veya GÜVENSİZ metotlarda ekler
// (Fetch spesifikasyonu); AYNI-orijin bir `GET /auth/sessions` çağrısı
// (admin panelinin kendi SPA'sı) `Origin` TAŞIMAYABİLİR ve bu NORMALDİR —
// bu dalı GÜVENSİZ metotlara sınırlamak, salt-okunur bir uca gerçek bir
// kullanım kırmadan FAIL-CLOSED semantiğini EKLER.
// (`same-origin-guard.test.ts:118-125`'in "Origin/Sec-Fetch-Site YOK →
// REDDETMEZ" regresyon testi BİLEREK `GET` kullanıyor — bu testin kendisi
// metot-farkındalığının GEREKLİLİĞİNİ zaten PİNLİYOR.)
//
// `useSecureCookies`/F4'ün AYNI "ApiEnv'den TÜRET, `process.env`'e
// GÜVENME" disiplini: güvenilir orijin `env.AUTH_BASE_URL`'den (A1,
// panel host'u) türetilir — ikinci bir yapılandırma yüzeyi AÇILMAZ.

import { Inject, Injectable } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'

import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import { CrossSiteRequestRejectedError } from '../errors/domain/cross-site-request-rejected.error.js'
import type { HttpRequestHeaders, HttpRequestLike } from '../http/http-request.types.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'

/** `IncomingHttpHeaders`'ın dizi/`undefined` biçimlerini TEK bir değere indirger — çoğul başlık GEÇERSİZDİR (ilk değer okunur, solid tur2 L-4). */
function singleHeaderValue(headers: HttpRequestHeaders, name: string): string | undefined {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

/** Tarayıcıların `Origin` eklemediği, mutasyonsuz metotlar (Fetch spesifikasyonu). */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

export type SameOriginViolationReason =
  'cross_site_fetch_metadata' | 'origin_mismatch' | 'missing_origin_with_cookie'

/**
 * `rawUrl`'in orijininin `trustedOrigin` İLE eşleştiğini doğrular. Ayrıştırma
 * BAŞARISIZ olursa (bozuk/eksik bir `Referer`) GÜVENİLMEZ sayılır (`false`) —
 * bu bir sessiz yutma DEĞİL, bilinçli bir fail-closed karardır: ayrıştırılamayan
 * bir `Referer`'ın "güvenilir" kabul edilmesi daha KÖTÜ olurdu.
 */
function isSameOrigin(rawUrl: string, trustedOrigin: string): boolean {
  try {
    return new URL(rawUrl).origin === trustedOrigin
  } catch {
    return false
  }
}

/**
 * `headers`'ın güvenilir orijinden (`trustedBaseUrl`) geldiğini doğrular.
 * İhlal YOKSA `undefined`, VARSA sebebini döner — çağıran (guard) bunu
 * `warn` logu + `CrossSiteRequestRejectedError`'a çevirir. Saf fonksiyon —
 * Nest DI'sız birim testi için.
 */
export function detectSameOriginViolation(
  headers: HttpRequestHeaders,
  method: string,
  trustedBaseUrl: string,
): SameOriginViolationReason | undefined {
  const secFetchSite = singleHeaderValue(headers, 'sec-fetch-site')
  if (secFetchSite === 'cross-site') {
    return 'cross_site_fetch_metadata'
  }

  const trustedOrigin = new URL(trustedBaseUrl).origin
  const origin = singleHeaderValue(headers, 'origin')

  if (origin !== undefined) {
    return origin === trustedOrigin ? undefined : 'origin_mismatch'
  }

  // `Origin` YOK — Better Auth'un AYNI sırasıyla `Referer`'a düş.
  const referer = singleHeaderValue(headers, 'referer')
  if (referer !== undefined) {
    return isSameOrigin(referer, trustedOrigin) ? undefined : 'origin_mismatch'
  }

  // `Origin` VE `Referer` İKİSİ DE YOK. GÜVENLİ metotlar (`GET`/`HEAD`/
  // `OPTIONS`) için bu NORMALDİR (dosya başı yorumu) — eksik başlık saldırı
  // KANITI DEĞİL. Yalnızca GÜVENSİZ bir metotla gelen VE `Cookie` TAŞIYAN
  // istek REDDEDİLİR (Better Auth'un `useCookies` eşiğiyle AYNI).
  const isUnsafeMethod = !SAFE_METHODS.has(method.toUpperCase())
  const hasCookie = singleHeaderValue(headers, 'cookie') !== undefined
  if (isUnsafeMethod && hasCookie) {
    return 'missing_origin_with_cookie'
  }

  return undefined
}

@Injectable()
export class SameOriginGuard implements CanActivate {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<HttpRequestLike>()
    const violation = detectSameOriginViolation(req.headers, req.method, this.env.AUTH_BASE_URL)

    if (violation === undefined) {
      return true
    }

    // Saldırganın hedef `Origin`/`Sec-Fetch-Site`/`Referer` DEĞERİ
    // `context`'e BİLEREK KONMAZ (CrossSiteRequestRejectedError'ın dosya
    // başı yorumu — kimlik avı/hedef alan adı sızıntısı riski); yalnızca
    // İHLAL SINIFI loglanır.
    getRequestContext().logger.warn({ reason: violation }, 'aynı-orijin olmayan istek reddedildi')

    throw new CrossSiteRequestRejectedError()
  }
}
