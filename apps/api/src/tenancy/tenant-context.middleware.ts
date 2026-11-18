// @arkesoft/api — TenantContextMiddleware (ROADMAP v0.0.4, T-002/ST-5,
// architect K-A4/K-A5)
//
// ALS SÖZLEŞMESİNİN "ÇÖZEN" tarafının İKİNCİ (ve son) parçası — "zorlayan"
// taraf `TenantGuard`'dır (aşağıda). Bu middleware, `RequestContextMiddleware`
// (ST-4) ile AYNI gerekçeyle normal akışta FIRLATMAZ — AMA bu, ÖNCEDEN
// yazılan "global exception filter'a ULAŞMAZ" iddiasından DEĞİL (DÜZELTME,
// T-022/S2 adım②/⑧, A-A22-2): ÖLÇÜLDÜ — Nest 12'de `RequestMethod.ALL` ile
// bağlanan middleware `RouterProxy.createProxy` tarafından sarmalanır
// (`@nestjs/core/router/router-proxy.js`) ve middleware'den fırlayan/reddeden
// HER istisna `ExceptionsHandler.next()` üzerinden, controller'larla AYNI
// şekilde, non-scoped global filtrelere (`APP_FILTER`, `AppExceptionFilter`)
// ULAŞIR (`RouterExceptionFilters`'ın KENDİ uyarı metni bunu AÇIKÇA söylüyor:
// yalnızca REQUEST/TRANSIENT KAPSAMLI global filtreler İSTİSNA). Bağımsız
// HTTP kanıtı: `GET //` isteğinde (`normalize-request-path-double-slash-
// http.test.ts`, fix ÖNCESİ koşum) bu middleware'den senkron fırlayan bir
// `TypeError` 500 ÜRETTİ AMA gövde `AppExceptionFilter`'ın TEMİZ JSON tel
// sözleşmesiydi (`{ code: 'INTERNAL_ERROR', requestId }`), Nest'in ham HTML
// hata sayfası DEĞİL — ÖNCEKİ yorumun öngördüğü "500 HTML" SENARYOSU
// GERÇEKLEŞMEDİ. Bu middleware'in BURADA fırlatmamasının asıl nedeni filter
// ERİŞİLEMEZLİĞİ değil, hatayı `TenantGuard`'a TAŞIYIP orada DOĞRU, TİPLİ bir
// `AppError`'a (`TenantResolutionFailedError`, `isRetryable: true`) ÇEVİRME
// İSTEĞİDİR — burada fırlasa `mapUnknownError`'ın genel `INTERNAL_ERROR`'una
// düşer, zengin/retryable hata sınıfı KAYBOLURDU. Bu yüzden
// `TenantResolverService.resolve()`'un fırlatabileceği HER beklenmedik hata
// (ör. DB erişilemez) burada YAKALANIR ve `{ kind: 'failed', cause }` olarak
// store'a yazılır — `TenantGuard` bunu okuyup DOĞRU TİPLE FIRLATIR.
//
// SIRA (K-A5, bağlayıcı, `app.module.ts`): `RequestContextMiddleware`
// HER ZAMAN bu middleware'DEN ÖNCE koşar — ALS depo nesnesi orada kurulur,
// burada SADECE `tenant`/`logger` alanları MUTE EDİLİR (TEK yazıcı — bu
// middleware `logger` alanına İKİNCİ ve SON kez yazan yerdir).

import { Inject, Injectable } from '@nestjs/common'
import type { NestMiddleware } from '@nestjs/common'

import { describeErrorCause } from '../errors/describe-error-cause.js'
import type { HttpRequestLike, HttpResponseLike } from '../http/http-request.types.js'
import { getRequestContext } from '../request-context/request-context.accessors.js'
import { isTenantExemptPath } from './tenant-exempt-paths.js'
import { TenantResolverService } from './tenant-resolver.service.js'

@Injectable()
export class TenantContextMiddleware implements NestMiddleware<HttpRequestLike, HttpResponseLike> {
  constructor(
    @Inject(TenantResolverService) private readonly tenantResolver: TenantResolverService,
  ) {}

  async use(req: HttpRequestLike, _res: HttpResponseLike, next: () => void): Promise<void> {
    // `RequestContextMiddleware` HER ZAMAN BİZDEN ÖNCE koştuğu için ALS
    // deposu burada ZATEN kurulu — `getRequestContext()`'in fail-closed
    // `throw`'u (ALS boşsa) bir PROGRAMLAMA hatasına (sıralama ihlali) işaret
    // eder, sessizce `undefined` ile devam ETMEZ.
    const context = getRequestContext()

    if (isTenantExemptPath(req.url)) {
      context.tenant = { kind: 'exempt' }
      next()
      return
    }

    try {
      const resolution = await this.tenantResolver.resolve(req.headers)
      context.tenant = resolution

      if (resolution.kind === 'resolved') {
        // TEK yazıcı (K-A7): `tenantId` bağlamalı child logger'a BURADA
        // geçilir — `RequestContextMiddleware`'in yazdığı `requestId`
        // bağlamalı ilk değerin ÜZERİNE.
        context.logger = context.logger.child({ tenantId: resolution.tenant.id })
      } else {
        // R4 telafisi #7: HER çözümsüz denemeye `warn` + `reason` — tarama
        // girişimleri (bilinmeyen host, rezerve slug denemesi, üretimde
        // geliştirici başlığı denemesi vb.) gözlemlenebilir olsun.
        context.logger.warn({ reason: resolution.reason }, 'tenant çözümü başarısız')
      }
    } catch (cause) {
      // Beklenmedik hata (ör. DB erişilemez) — `isRetryable: true` taşıyan
      // `TenantResolutionFailedError`'a `TenantGuard` tarafından çevrilecek.
      // Bu seviye `error` (CLAUDE.md §4 "müdahale gerekir") — `unresolved`
      // dalının `warn`'ından (beklenen ama anormal) BİLİNÇLİ OLARAK ayrı.
      context.tenant = { kind: 'failed', cause }
      // FIX turu 2 (T-006, solid tur2 M-2, bağlam dışı ama additive kapanış) —
      // ortak `describeErrorCause()` (`AggregateError`-farkında); naif
      // `cause.message` okuması DB bağlantı arızalarında (happy-eyeballs
      // `AggregateError`) `errorMessage: ""` üretirdi (ÖLÇÜLDÜ, security
      // tur2 S-8).
      context.logger.error(
        describeErrorCause(cause),
        'tenant çözümü beklenmedik şekilde başarısız oldu',
      )
    }

    next()
  }
}
