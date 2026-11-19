// @arkesoft/api — SameOriginGuard (FIX turu 1, madde 6 — F5, medium; FIX
// turu 2, madde 2 — security tur2 S-3, `medium`)
//
// Bu guard İKİ yerde kayıtlı — `SessionsController`'ın `/auth/sessions*`
// üçlüsü (`sessions.controller.ts:70`) VE `TrpcController`'ın
// `@All('trpc/*path')` yakalayıcısı (`trpc.controller.ts:205`) — yani
// kapsadığı yüzey `/auth/sessions*` İLE SINIRLI DEĞİL, TÜM `/trpc` panel
// trafiğini de içerir (ROADMAP v0.0.21.1, T-025/S3, `K6` madde ii —
// önceki yorum yalnızca ilk kayıt noktasını anlatıyordu, bayattı).
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
// düşülür (Better Auth'un AYNI sırası). **Metot farkındalığı — muafiyet
// YALNIZCA ÜÇÜNCÜ dalda** (`Origin` VE `Referer` İKİSİ DE YOK,
// `headers_absent`/`missing_origin_with_cookie`): bu dal **yalnızca
// GÜVENSİZ metotlarda** (`GET`/`HEAD`/`OPTIONS` DIŞI) uygulanır — modern
// tarayıcılar `Origin`'i SADECE çapraz-orijin GET isteklerinde veya
// GÜVENSİZ metotlarda ekler (Fetch spesifikasyonu); AYNI-orijin bir
// `GET /auth/sessions` çağrısı (admin panelinin kendi SPA'sı) `Origin`
// TAŞIMAYABİLİR ve bu NORMALDİR — bu dalı GÜVENSİZ metotlara sınırlamak,
// salt-okunur bir uca gerçek bir kullanım kırmadan FAIL-CLOSED semantiğini
// EKLER. ⚠ Birinci (`sec_fetch_site`) ve ikinci (`origin_header`/
// `referer_header`) dallarda metot muafiyeti YOKTUR — `Referer` dalı
// GÜVENLİ metotlarda DA SIKI kalır (K1 kararı, bu dosyada değişmez — altta).
// ⚠⚠ Bugün bu iddia TAM bir metot×dal matrisiyle PİNLENMEMİŞTİR (o matris
// `S4`'ün kapsamı, ROADMAP v0.0.21.1, T-025/S4) — `same-origin-guard.test.ts`'in
// "Origin/Sec-Fetch-Site YOK (mevcut davranış) → guard istek REDDETMEZ
// (önceki testlerin REGRESYON kontrolü)" ADLI testi (satır numarasıyla DEĞİL,
// test ADIYLA anılır — D29'un dersi, satır numarası bu Task ailesinde dört
// kez bayatladı) BİLEREK `GET` kullanır ve `Referer` GÖNDERMEZ; TEK bir
// nokta doğrular, matrisin TAMAMINI değil. (Bitişik not: aynı dosyadaki
// "Referer GÜVENİLİR" senaryosu `POST` kullanır — `GET` + üçüncü dal
// kombinasyonunu PİNLEMEZ; bu yüzden ESKİ atıf [`:118-125`] BAYATTI VE
// YANLIŞ TESTİ gösteriyordu, `po` ölçtü.)
//
// `useSecureCookies`/F4'ün AYNI "ApiEnv'den TÜRET, `process.env`'e
// GÜVENME" disiplini: güvenilir orijin(ler) `ApiEnv`'den türetilir — ikinci
// bir yapılandırma yüzeyi AÇILMAZ.
//
// GÜNCELLEME (ROADMAP v0.0.20, T-021/S6, ADR-0023 §4 "Üçüncü tarayıcı
// orijini") — güvenilir orijin artık TEK DEĞER DEĞİL, bir LİSTE. Türetme
// `./trusted-origins.js`'e TAŞINDI (`resolveTrustedOrigins`) — bu dosya
// ARTIK `env.AUTH_BASE_URL`'i DOĞRUDAN OKUMAZ, ADR-0011'in "iki orijin
// kontrolü TEK KAYNAKTAN beslenir" garantisi bu TEK fonksiyon üzerinden
// korunur (`auth-instance.ts`'in Better Auth `trustedOrigins` seçeneği AYNI
// fonksiyonu tüketir). `SUPERADMIN_BASE_URL` verilmediğinde liste TEK
// elemanlıdır ve bu dosyanın davranışı BUGÜNKÜYLE BAYT-BİREBİR AYNIDIR
// (ADR-0023 §4.5) — eski `detectSameOriginViolation` (TEK orijin, string
// parametre) GERİYE UYUMLU bırakıldı, mevcut testler bu imzayı DEĞİŞMEDEN
// tüketir; `canActivate` ARTIK yeni, LİSTE kabul eden
// `detectSameOriginViolationAgainstTrustedOrigins`'i çağırır.
//
// GÜNCELLEME (ROADMAP v0.0.21.1, T-025/S3):
//
// 1) `resolveTrustedOrigins(env)` ARTIK `canActivate` içinde HER İSTEKTE
//    çağrılmıyor — YAPICIYA taşındı (`this.trustedOrigins`, `readonly`).
//    Kazanç: istek yolunda `new URL()` ayrıştırması YOK; FIRLAYABİLEN bu
//    fonksiyon artık AÇILIŞ zamanında çalışır (fail-fast), istek yolunda
//    500 ÜRETMEZ (S1'in bıraktığı borç — bu turda KAPATILDI).
// 2) İç `detectViolationAgainstTrustedOrigins` artık `{ reason, branch }`
//    DETAY nesnesi döner (`SameOriginViolationDetail`). İKİ giriş noktası
//    BİLEREK ASİMETRİK kaldı: `detectSameOriginViolation` (TEK orijin,
//    GERİYE UYUMLU) dönüşünü `.reason`'a İNDİRİR — imzası VE davranışı
//    DEĞİŞMEDİ, mevcut 11 saf-fonksiyon testi tek satır değişmeden geçer.
//    `detectSameOriginViolationAgainstTrustedOrigins` (bu guard'ın TEK
//    üretim tüketicisi, SIFIR test tüketicisi) detay nesnesini DOĞRUDAN
//    döner — `branch` alanı guard'ın `warn` logunda teşhis amaçlı kullanılır.
// 3) ⚠⚠ `R13` SINIRI (`trusted-origins.ts`'in dosya başı yorumuyla AYNI):
//    `ADDITIONAL_TRUSTED_ORIGINS`'in virgül ayrıştırması YALNIZCA ortam
//    DEĞİŞKENİ DEĞERİNE uygulanır (`determineTrustedOriginSources`, bu
//    dosyada, SADECE log teşhisi için). İsteğin `Origin`/`Referer`
//    BAŞLIK değeri ASLA virgülden BÖLÜNMEZ — Node yinelenen `Origin`
//    başlıklarını virgülle BİRLEŞTİRİR ve bu `same-origin-guard-
//    measurements.qa.test.ts:77-82`'de ÖLÇÜLMÜŞ bir fail-closed davranıştır
//    ("iki ayrı `Origin:` satırı → 403 `origin_mismatch`"); `singleHeaderValue`
//    VE `detectViolationAgainstTrustedOrigins` başlık DEĞERİNİ hiçbir yerde
//    virgülden BÖLMEZ — bölmek BYPASS üretirdi.

import { Inject, Injectable } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'

import type { ApiEnv } from '../config/api-env.js'
import { splitAdditionalTrustedOrigins } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import { CrossSiteRequestRejectedError } from '../errors/domain/cross-site-request-rejected.error.js'
import type { HttpRequestHeaders, HttpRequestLike } from '../http/http-request.types.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'
import { resolveTrustedOrigins } from './trusted-origins.js'

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
 * Hangi dal ihlali ürettiğini belirtir (ROADMAP v0.0.21.1, T-025/S3, `K3`
 * teşhis alanı) — ayrık birleşim, `detectViolationAgainstTrustedOrigins`'in
 * HER `return` noktası kendi değerini döner. Yalnızca teşhis/log amaçlıdır;
 * HTTP yanıtına KONMAZ (yanıt tek kod, tek gövde kalır —
 * `CrossSiteRequestRejectedError`).
 */
export type SameOriginViolationBranch =
  'sec_fetch_site' | 'origin_header' | 'referer_header' | 'headers_absent'

/**
 * `detectViolationAgainstTrustedOrigins`'in DETAY dönüşü (ROADMAP v0.0.21.1,
 * T-025/S3, `K3`) — `detectSameOriginViolationAgainstTrustedOrigins`'in
 * (LİSTE girişi, bu guard'ın TEK tüketicisi) yükseltilmiş dönüş tipi.
 * `detectSameOriginViolation` (TEK orijin, GERİYE UYUMLU) bu nesneyi
 * DIŞA SIZDIRMAZ — `.reason`'a indirger.
 */
export type SameOriginViolationDetail = {
  readonly reason: SameOriginViolationReason
  readonly branch: SameOriginViolationBranch
}

/**
 * `rawUrl`'in orijininin `trustedOrigins` listesinden BİRİYLE eşleştiğini
 * doğrular. Ayrıştırma BAŞARISIZ olursa (bozuk/eksik bir `Referer`)
 * GÜVENİLMEZ sayılır (`false`) — bu bir sessiz yutma DEĞİL, bilinçli bir
 * fail-closed karardır: ayrıştırılamayan bir `Referer`'ın "güvenilir" kabul
 * edilmesi daha KÖTÜ olurdu.
 */
function isTrustedOrigin(rawUrl: string, trustedOrigins: readonly string[]): boolean {
  try {
    return trustedOrigins.includes(new URL(rawUrl).origin)
  } catch {
    return false
  }
}

/**
 * `headers`'ın `trustedOrigins` listesindeki bir orijinden geldiğini
 * doğrular. İhlal YOKSA `undefined`, VARSA `{ reason, branch }` DETAYINI
 * döner (ROADMAP v0.0.21.1, T-025/S3, `K3` — önceki sürüm yalnızca `reason`
 * dönüyordu). Çekirdek mantık — `detectSameOriginViolation` (TEK orijin,
 * GERİYE UYUMLU, `.reason`'a indirger) VE
 * `detectSameOriginViolationAgainstTrustedOrigins` (LİSTE, `SameOriginGuard`'ın
 * tükettiği, ROADMAP v0.0.20/T-021/S6) bu fonksiyonu PAYLAŞIR — ikinci bir
 * doğrulama mantığı İCAT EDİLMEZ. KARAR MANTIĞI (dört dal, `SAFE_METHODS`)
 * DEĞİŞMEDİ — yalnızca dönüş biçimi detaylandırıldı.
 */
function detectViolationAgainstTrustedOrigins(
  headers: HttpRequestHeaders,
  method: string,
  trustedOrigins: readonly string[],
): SameOriginViolationDetail | undefined {
  const secFetchSite = singleHeaderValue(headers, 'sec-fetch-site')
  if (secFetchSite === 'cross-site') {
    return { reason: 'cross_site_fetch_metadata', branch: 'sec_fetch_site' }
  }

  const origin = singleHeaderValue(headers, 'origin')

  if (origin !== undefined) {
    return trustedOrigins.includes(origin)
      ? undefined
      : { reason: 'origin_mismatch', branch: 'origin_header' }
  }

  // `Origin` YOK — Better Auth'un AYNI sırasıyla `Referer`'a düş.
  const referer = singleHeaderValue(headers, 'referer')
  if (referer !== undefined) {
    return isTrustedOrigin(referer, trustedOrigins)
      ? undefined
      : { reason: 'origin_mismatch', branch: 'referer_header' }
  }

  // `Origin` VE `Referer` İKİSİ DE YOK. GÜVENLİ metotlar (`GET`/`HEAD`/
  // `OPTIONS`) için bu NORMALDİR (dosya başı yorumu) — eksik başlık saldırı
  // KANITI DEĞİL. Yalnızca GÜVENSİZ bir metotla gelen VE `Cookie` TAŞIYAN
  // istek REDDEDİLİR (Better Auth'un `useCookies` eşiğiyle AYNI).
  const isUnsafeMethod = !SAFE_METHODS.has(method.toUpperCase())
  const hasCookie = singleHeaderValue(headers, 'cookie') !== undefined
  if (isUnsafeMethod && hasCookie) {
    return { reason: 'missing_origin_with_cookie', branch: 'headers_absent' }
  }

  return undefined
}

/**
 * `headers`'ın güvenilir orijinden (`trustedBaseUrl`) geldiğini doğrular.
 * ⚠ GERİYE UYUMLU İMZA VE DÖNÜŞ TİPİ — TEK orijin (string) kabul eder,
 * `SameOriginViolationReason | undefined` DÖNER (DEĞİŞMEDİ); mevcut testler
 * (`same-origin-guard.test.ts` ve iki `qa` eşi) bu fonksiyonu DEĞİŞMEDEN
 * tüketir (ROADMAP v0.0.20/T-021/S6, ADR-0023 §4.5'in bayt-birebir kanıtı).
 * ⚠⚠ ASİMETRİ BİLİNÇLİ (ROADMAP v0.0.21.1, T-025/S3, `K3`): iç fonksiyon
 * artık DETAY nesnesi dönüyor, bu sarmalayıcı `.reason`'a İNDİRİR — SIFIR
 * tüketicisi olan `detectSameOriginViolationAgainstTrustedOrigins`'in
 * aksine bu giriş noktasının 11 saf-fonksiyon test tüketicisi VAR, dönüş
 * tipini yükseltmek onları KIRARDI. `SameOriginGuard.canActivate` bu
 * fonksiyonu ARTIK ÇAĞIRMAZ — bkz. `detectSameOriginViolationAgainstTrustedOrigins`.
 * Saf fonksiyon — Nest DI'sız birim testi için.
 */
export function detectSameOriginViolation(
  headers: HttpRequestHeaders,
  method: string,
  trustedBaseUrl: string,
): SameOriginViolationReason | undefined {
  return detectViolationAgainstTrustedOrigins(headers, method, [new URL(trustedBaseUrl).origin])
    ?.reason
}

/**
 * `headers`'ın `trustedOrigins` LİSTESİNDEKİ bir orijinden geldiğini
 * doğrular (ROADMAP v0.0.20, T-021/S6, ADR-0023 §4) — `SameOriginGuard`'ın
 * tükettiği YENİ giriş noktası. ⚠⚠ Dönüş tipi `SameOriginViolationDetail`'E
 * YÜKSELTİLDİ (ROADMAP v0.0.21.1, T-025/S3, `K3`) — ÖLÇÜLDÜ: SIFIR test
 * tüketicisi, TEK üretim tüketicisi (`SameOriginGuard.canActivate`), bu
 * yüzden yükseltme GERİYE UYUMLULUK gerektirmez. Saf fonksiyon — Nest
 * DI'sız birim testi için.
 */
export function detectSameOriginViolationAgainstTrustedOrigins(
  headers: HttpRequestHeaders,
  method: string,
  trustedOrigins: readonly string[],
): SameOriginViolationDetail | undefined {
  return detectViolationAgainstTrustedOrigins(headers, method, trustedOrigins)
}

/**
 * Güvenilir orijin listesine KATKIDA BULUNAN ortam değişkeni ADLARINI
 * türetir — teşhis loglaması için (ROADMAP v0.0.21.1, T-025/S3, `K3`).
 * `resolveTrustedOrigins`'in İMZASI DEĞİŞMEDİ (`trusted-origins.ts` bu
 * Task'ta DOKUNULMAYAN dosya) ve kaynak ADLARINI döndürmez; bu yüzden
 * katkı burada, AYNI üç alanın VAR OLMA/BOŞ OLMAMA koşuluyla BAĞIMSIZ
 * olarak türetilir — `resolveTrustedOrigins`'in kendi normalize/kiracı-
 * reddi mantığı burada TEKRARLANMAZ (yalnızca "bu alan BOŞ MU" sorusu
 * sorulur), ikinci bir doğrulama mantığı İCAT EDİLMEZ. `AUTH_BASE_URL`
 * ZORUNLU alan olduğu için her zaman katkıda bulunur ve dizinin İLK
 * elemanıdır.
 */
function determineTrustedOriginSources(env: ApiEnv): readonly string[] {
  const sources: string[] = ['AUTH_BASE_URL']

  if (env.SUPERADMIN_BASE_URL !== undefined) {
    sources.push('SUPERADMIN_BASE_URL')
  }

  if (splitAdditionalTrustedOrigins(env.ADDITIONAL_TRUSTED_ORIGINS).length > 0) {
    sources.push('ADDITIONAL_TRUSTED_ORIGINS')
  }

  return sources
}

@Injectable()
export class SameOriginGuard implements CanActivate {
  /**
   * AÇILIŞ zamanında BİR KEZ türetilir (ROADMAP v0.0.21.1, T-025/S3) —
   * `resolveTrustedOrigins` FIRLAYABİLDİĞİ için (kiracı-alt-alan-adı reddi,
   * `trusted-origins.ts`'in dosya başı yorumu) bu türetmenin yapıcıda
   * olması fail-fast'i AÇILIŞA çeker; istek yolunda ARTIK `new URL()`
   * ayrıştırması YOK ve istek başına fırlama riski YOK.
   */
  private readonly trustedOrigins: readonly string[]

  /** Teşhis loglaması için — bkz. {@link determineTrustedOriginSources}. */
  private readonly trustedOriginSources: readonly string[]

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.trustedOrigins = resolveTrustedOrigins(env)
    this.trustedOriginSources = determineTrustedOriginSources(env)
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<HttpRequestLike>()
    const violation = detectSameOriginViolationAgainstTrustedOrigins(
      req.headers,
      req.method,
      this.trustedOrigins,
    )

    if (violation === undefined) {
      return true
    }

    // Saldırganın hedef `Origin`/`Sec-Fetch-Site`/`Referer` DEĞERİ (veya
    // onun hostname'i/herhangi bir parçası) `context`'e BİLEREK KONMAZ
    // (CrossSiteRequestRejectedError'ın dosya başı yorumu — kimlik avı/
    // hedef alan adı sızıntısı riski); yalnızca İHLAL SINIFI, HANGİ dalın
    // reddettiği ve güvenilir orijin listesinin BÜYÜKLÜĞÜ/KAYNAĞI loglanır
    // (ROADMAP v0.0.21.1, T-025/S3, `K3` — dördü de PII/sır TAŞIMAZ).
    getRequestContext().logger.warn(
      {
        reason: violation.reason,
        branch: violation.branch,
        trustedOriginCount: this.trustedOrigins.length,
        trustedOriginSources: this.trustedOriginSources,
      },
      'aynı-orijin olmayan istek reddedildi',
    )

    throw new CrossSiteRequestRejectedError()
  }
}
