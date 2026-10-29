// @arkesoft/api — RateLimitGuard (ROADMAP v0.0.5, T-006/S8, architect "S8
// satırı", PO "V-P2", riski 8)
//
// `APP_GUARD` olarak `AuthModule` İÇİNDE sağlanır (`TenancyModule`'ün
// `tenantGuardProvider` deseniyle AYNI — V-P2) — `app.module.ts`'E
// DOKUNULMAZ. Bu guard yalnızca `rate-limit.policy.ts`'in tanıdığı DÖRT
// rotada (sign-in/email, sign-up/email, send-verification-email,
// request-password-reset) devreye girer; diğer HER rota için `canActivate`
// anında `true` döner (hiçbir Redis çağrısı YAPILMAZ).
//
// ⚠ VARLIK-SIZDIRMAZLIK (architect, BAĞLAYICI): sayaç Better Auth'un KENDİ
// kullanıcı aramasına (controller'a) ULAŞMADAN ÖNCE, DB'ye HİÇ bakmadan
// artırılır — var olan/var olmayan e-posta AYNI sayma davranışından geçer.
// `Retry-After` pencerenin KALAN süresidir (TTL'den okunur), hangi sebepten
// (hesap mı IP mi) aşıldığı yalnızca `context`'e (log) yazılır, tele ASLA
// (CLAUDE.md §4/§7).
//
// ⚠ `Retry-After` — `instanceof` ZİNCİRİ YOK (PO riski 8): `RateLimitExceededError`
// kendi `httpHeaders` alanını doldurur, `mapErrorToResponse`'A HİÇ
// DOKUNULMADI (`error-mapping.ts`/`app-exception.filter.ts` değişmedi —
// `git diff` kanıtı raporda).
//
// ⚠ ANAHTAR UZAYI — `platform:auth:` (R1, TENANT DEĞİL): giriş anında
// kiracı bilinmiyor; sayaçlar PLATFORM kapsamlı (`rate-limit.service.ts`).
//
// "BAŞARILI GİRİŞ HESAP SAYACINI SIFIRLAR" (K3) — bu, bir `CanActivate`'in
// (pre-handler) TEK BAŞINA gözlemleyemeyeceği bir OLAYdır (handler'ın
// SONUCU gerekir). Bu yüzden bu dosya İKİNCİ bir sınıf da taşır:
// `RateLimitAccountResetInterceptor` (`APP_INTERCEPTOR`, AYNI dosya — "Yeni"
// dosya listesine YENİ bir dosya EKLENMEDİ, mevcut `rate-limit.guard.ts`
// dosyasının İKİNCİ exportu). Guard'ın pre-check/artırma davranışını
// DEĞİŞTİRMEZ — `next.handle()`'ın TAMAMLANMASINI (`response.on('finish')`,
// `request-logging.interceptor.ts`'in AYNI deseni — `@Res()` modunda yazım
// handler İÇİNDE olsa da, `'finish'` olayı adaptörden BAĞIMSIZ, güvenilir
// tamamlanma sinyalidir) gözlemler; 2xx + `resetAccountOnSuccess` İSE
// HESAP sayacını SIFIRLAR.
//
// ⚠ IP SAYACI BİLEREK SIFIRLANMAZ (FIX turu 1, madde 7 — solid M-6'nın
// değerlendirmesi, "düzeltilmedi" KAYDI): solid gate K3'ün metnini ("IP
// başına 20 BAŞARISIZ/15dk") birebir okuyarak bunun bir sapma olduğunu
// işaretledi — HAKLI bir gözlem, ama ÖNERİLEN düzeltme (başarıda IP sayacını
// da sıfırla) KENDİSİ bir güvenlik AÇIĞI doğurur: paylaşılan bir NAT/ofis
// IP'sinde SALDIRGAN, kurbanın hesabına 19 kez yanlış parola dener (IP
// sayacı eşiğe yaklaşır), SONRA KENDİ geçerli hesabıyla (aynı IP'den) BİR
// kez giriş yapar — bu BAŞARILI girişin IP sayacını SIFIRLAMASI, saldırgana
// kurbana karşı SINIRSIZ deneme hakkı verirdi (IP sınırının TÜM amacı —
// paylaşılan kaynaktan toplu deneme — bu şekilde TAMAMEN etkisizleşir).
// Hesap sayacının sıfırlanması bu riski TAŞIMAZ (sıfırlanan hesap zaten
// kimliği doğrulanmış sahibine ait). **Karar:** K3'ün metni DAHA GENEL
// yazılmış olabilir ama DAVRANIŞ bilinçli — IP sayacı yalnızca pencere
// dolunca sıfırlanır (kalıcı kilit YOK, K3/v0.0.15). Bu, `architect`'in
// K3 metnini netleştirmesi gereken bir ROADMAP borcu olarak kayda geçer;
// `rate-limit.test.ts`'e bu davranışı (başarılı girişin IP sayacını
// TÜKETTİĞİNİ) PİNLEYEN bir negatif test EKLENDİ (solid'in "eksik test"
// bulgusu KAPATILDI, davranışın KENDİSİ DEĞİŞTİRİLMEDİ).
//
// FIX turu 2, madde 3 (security/qa tur2 — architect'in BAĞLAYICI LOG DESENİ
// listesindeki `warn giriş başarısız (reason, failureCount)` olayı HİÇ
// ÜRETİLMİYORDU, ÖLÇÜLDÜ: `grep failureCount` repo genelinde 0 satır).
// `RateLimitAccountResetInterceptor` yanıt durumunu ZATEN `'finish'`'te
// GÖRÜYOR (K3'ün başarı dalı) — AYNI gözlem noktası başarısızlık dalına da
// GENİŞLETİLDİ: giriş rotasında (`resetAccountOnSuccess`, yalnızca
// sign-in/email'de `true`) yanıt 401 (yanlış kimlik bilgisi) veya 403
// (doğrulanmamış e-posta) İSE `warn` + `reason`/`failureCount`
// (`RateLimitService.peekCount()` — sayacı ARTIRMADAN okur, guard ZATEN
// artırmıştı) + `emailMasked` (`maskEmail()`, HAM e-posta ASLA). Guard'ın
// KENDİ 429'u BU dala hiç ULAŞMAZ — guard interceptor'dan ÖNCE koşar, eşik
// aşıldığında zincir interceptor'a hiç GİRMEZ (Nest'in guard→interceptor
// sırası) — ÇİFT LOGLAMA (bu olay + "oran sınırı aşıldı") YOK.
//
// FIX turu 2, madde 6 (solid tur2 M-2) — `getRequestContext().logger.error`
// çağrıları artık ortak `describeErrorCause()`'u (`AggregateError`-farkında)
// kullanır; naif `cause.message` okuması Redis bağlantı arızalarında
// `errorMessage: ""` üretirdi (ÖLÇÜLDÜ, security tur2 S-8).

import { Inject, Injectable } from '@nestjs/common'
import type { CallHandler, CanActivate, ExecutionContext, NestInterceptor } from '@nestjs/common'
import { maskEmail } from '@arkesoft/errors'
import type { Observable } from 'rxjs'
import { z } from 'zod'

import type { ApiEnv } from '../../config/api-env.js'
import { API_ENV } from '../../config/config.tokens.js'
import { assertNever } from '../../errors/assert-never.js'
import { describeErrorCause } from '../../errors/describe-error-cause.js'
import { RateLimitExceededError } from '../../errors/domain/rate-limit-exceeded.error.js'
import type { RateLimitScope } from '../../errors/domain/rate-limit-exceeded.error.js'
import type { HttpRequestLike, HttpResponseWithLifecycle } from '../../http/http-request.types.js'
import { getRequestContext } from '../../request-context/request-context.accessors.js'
import { resolveClientIp } from './client-ip.js'
import type { RateLimitWindowKind } from './rate-limit.policy.js'
import { resolveRateLimitPolicy } from './rate-limit.policy.js'
import { RateLimitService } from './rate-limit.service.js'
import type { RateLimitScopeKey } from './rate-limit.service.js'

/**
 * `@Req()`'in beklediği ek alanlar — `HttpRequestLike`'a (paylaşılan dosya,
 * BU alt görevde DOKUNULMADI) eklenmedi, `auth.controller.ts`'in
 * `AuthDelegationRequest` deseniyle AYNI yerel genişletme.
 */
type RateLimitedRequest = HttpRequestLike & {
  readonly body: unknown
  readonly socket?: { readonly remoteAddress?: string }
}

/**
 * `body`'nin `email` alanını güvenle okur — dış veri, tip VERİLMEDEN
 * GÜVENİLMEZ (CLAUDE.md §4). `.loose()`: diğer alanlar (parola, ad) BU
 * dosyanın İLGİSİ DEĞİL, yalnızca `email` okunur.
 */
const accountScopeBodySchema = z.object({ email: z.string().trim().min(1) }).loose()

/** `undefined` → gövdede kullanılabilir bir `email` YOK (hesap kapsamı ATLANIR, IP kapsamı YİNE uygulanır). */
function extractAccountScopeValue(body: unknown): string | undefined {
  const parsed = accountScopeBodySchema.safeParse(body)
  return parsed.success ? parsed.data.email : undefined
}

function resolveWindowSeconds(windowKind: RateLimitWindowKind, env: ApiEnv): number {
  switch (windowKind) {
    case 'login':
      return env.AUTH_LOGIN_RATE_WINDOW_SECONDS
    case 'reset':
      return env.AUTH_RESET_RATE_WINDOW_SECONDS
    default:
      return assertNever(windowKind, 'rate-limit.guard.ts: RateLimitWindowKind')
  }
}

type ExceededCandidate = {
  readonly scope: RateLimitScope
  readonly retryAfterSeconds: number
  readonly counterKeyPrefix: string
}

/** architect LOG DESENİ'nin `reason` alanı — yalnızca giriş rotasının İKİ bilinen başarısızlık durumu. */
type LoginFailureReason = 'invalid_credentials' | 'email_not_verified'

/**
 * `undefined` → bu durum kodu "giriş başarısız" olayı AÇISINDAN İLGİSİZ
 * (429 guard'dan hiç ulaşmaz; 2xx ayrı dalda ele alınır; 400 gibi doğrulama
 * hataları "başarısız giriş DENEMESİ" DEĞİL, malformed istektir — K4'ün
 * tanımladığı İKİ bilinen durum DIŞINDA hiçbir şey UYDURULMAZ).
 */
function resolveLoginFailureReason(statusCode: number): LoginFailureReason | undefined {
  if (statusCode === 401) {
    return 'invalid_credentials'
  }
  if (statusCode === 403) {
    return 'email_not_verified'
  }
  return undefined
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RateLimitService) private readonly rateLimitService: RateLimitService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RateLimitedRequest>()
    const policy = resolveRateLimitPolicy(req.method, req.url)

    if (policy === undefined) {
      return true
    }

    const windowSeconds = resolveWindowSeconds(policy.windowKind, this.env)
    const clientIp = resolveClientIp(req, this.env.AUTH_TRUSTED_PROXY_COUNT)

    const ipScopeKey = this.rateLimitService.buildScopeKey(policy.routeKey, 'ip', clientIp)
    const ipResult = await this.rateLimitService.checkAndIncrement(
      ipScopeKey,
      policy.ipLimit,
      windowSeconds,
    )

    const accountValue = extractAccountScopeValue(req.body)
    const accountScopeKey: RateLimitScopeKey | undefined =
      accountValue === undefined
        ? undefined
        : this.rateLimitService.buildScopeKey(policy.routeKey, 'account', accountValue)
    const accountResult =
      accountScopeKey === undefined
        ? undefined
        : await this.rateLimitService.checkAndIncrement(
            accountScopeKey,
            policy.accountLimit,
            windowSeconds,
          )

    const candidates: ExceededCandidate[] = []

    if (accountResult !== undefined && accountScopeKey !== undefined && accountResult.exceeded) {
      candidates.push({
        scope: 'account',
        retryAfterSeconds: accountResult.retryAfterSeconds,
        counterKeyPrefix: accountScopeKey.counterKeyPrefix,
      })
    }

    if (ipResult.exceeded) {
      candidates.push({
        scope: 'ip',
        retryAfterSeconds: ipResult.retryAfterSeconds,
        counterKeyPrefix: ipScopeKey.counterKeyPrefix,
      })
    }

    if (candidates.length === 0) {
      return true
    }

    // "Katı olan kazanır" — İKİSİ birden aşıldıysa istemci her iki pencere
    // temizlenene kadar beklemeli (MAX), hangi sebep raporlandığı yalnızca
    // logu ETKİLER (tele ASLA yazılmaz, varlık-sızdırmazlık).
    const retryAfterSeconds = candidates.reduce(
      (max, candidate) => Math.max(max, candidate.retryAfterSeconds),
      0,
    )
    const reportedScope: RateLimitScope = candidates.some(
      (candidate) => candidate.scope === 'account',
    )
      ? 'account'
      : 'ip'
    const reportedPrefix =
      candidates.find((candidate) => candidate.scope === reportedScope)?.counterKeyPrefix ??
      ipScopeKey.counterKeyPrefix

    getRequestContext().logger.warn(
      { scope: reportedScope, retryAfterSeconds, counterKeyPrefix: reportedPrefix },
      'oran sınırı aşıldı',
    )

    throw new RateLimitExceededError(reportedScope, retryAfterSeconds)
  }
}

/**
 * K3 — "başarılı giriş hesap sayacını SIFIRLAR". `APP_INTERCEPTOR` olarak
 * `AuthModule` İÇİNDE sağlanır (AYNI modül-lokal-ama-global mekanizma,
 * `tenancy.module.ts` dosya başı yorumunun belirttiği gibi `APP_GUARD`/
 * `APP_FILTER`/`APP_INTERCEPTOR` token'ları modülün global'liğinden
 * BAĞIMSIZ kaydolur).
 */
@Injectable()
export class RateLimitAccountResetInterceptor implements NestInterceptor {
  constructor(@Inject(RateLimitService) private readonly rateLimitService: RateLimitService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RateLimitedRequest>()
    const policy = resolveRateLimitPolicy(req.method, req.url)

    if (!policy?.resetAccountOnSuccess) {
      return next.handle()
    }

    const accountValue = extractAccountScopeValue(req.body)
    if (accountValue === undefined) {
      return next.handle()
    }

    const response = context.switchToHttp().getResponse<HttpResponseWithLifecycle>()
    const accountScopeKey = this.rateLimitService.buildScopeKey(
      policy.routeKey,
      'account',
      accountValue,
    )

    // `'finish'` — `request-logging.interceptor.ts`'in AYNI deseni: adaptör-
    // nötr, yanıt GERÇEKTEN gönderildiğinde tetiklenir (bu noktada istemci
    // zaten yanıtı almıştır; sıfırlama/loglama BAŞARISIZ olsa bile isteğin
    // SONUCU değişmez — yalnızca loglanır, hata YUTULMAZ).
    response.on('finish', () => {
      const statusCode = response.statusCode

      if (statusCode >= 200 && statusCode < 300) {
        void this.rateLimitService.resetCounter(accountScopeKey).catch((cause: unknown) => {
          getRequestContext().logger.error(
            describeErrorCause(cause),
            'oran sınırlama hesap sayacı sıfırlama başarısız oldu',
          )
        })
        return
      }

      // FIX turu 2, madde 3 (security/qa tur2 — dosya başı yorumu) —
      // "giriş başarısız" olayı. Yalnızca BİLİNEN iki durumda (401/403);
      // guard'ın KENDİ 429'u bu dala hiç ULAŞMAZ (guard interceptor'dan
      // ÖNCE koşar).
      const reason = resolveLoginFailureReason(statusCode)
      if (reason === undefined) {
        return
      }

      void this.rateLimitService
        .peekCount(accountScopeKey)
        .then((failureCount) => {
          getRequestContext().logger.warn(
            { reason, failureCount, emailMasked: maskEmail(accountValue) },
            'giriş başarısız',
          )
        })
        .catch((cause: unknown) => {
          getRequestContext().logger.error(
            describeErrorCause(cause),
            'giriş başarısız olayı loglanamadı',
          )
        })
    })

    return next.handle()
  }
}
