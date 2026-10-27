// @arkesoft/api — TenantContextMiddleware (ROADMAP v0.0.4, T-002/ST-5,
// architect K-A4/K-A5)
//
// ALS SÖZLEŞMESİNİN "ÇÖZEN" tarafının İKİNCİ (ve son) parçası — "zorlayan"
// taraf `TenantGuard`'dır (aşağıda). Bu middleware, `RequestContextMiddleware`
// (ST-4) ile AYNI gerekçeyle ASLA FIRLATMAZ: NestJS'te middleware içinde
// fırlatılan hata global exception filter'a ULAŞMAZ (platformun kendi hata
// yoluna düşer, AC4'ün istediği birebir JSON yerine 500 HTML üretir). Bu
// yüzden `TenantResolverService.resolve()`'un fırlatabileceği HER beklenmedik
// hata (ör. DB erişilemez) burada YAKALANIR ve `{ kind: 'failed', cause }`
// olarak store'a yazılır — `TenantGuard` bunu okuyup FIRLATIR.
//
// SIRA (K-A5, bağlayıcı, `app.module.ts`): `RequestContextMiddleware`
// HER ZAMAN bu middleware'DEN ÖNCE koşar — ALS depo nesnesi orada kurulur,
// burada SADECE `tenant`/`logger` alanları MUTE EDİLİR (TEK yazıcı — bu
// middleware `logger` alanına İKİNCİ ve SON kez yazan yerdir).

import { Inject, Injectable } from '@nestjs/common'
import type { NestMiddleware } from '@nestjs/common'

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
      context.logger.error(
        { errorMessage: cause instanceof Error ? cause.message : String(cause) },
        'tenant çözümü beklenmedik şekilde başarısız oldu',
      )
    }

    next()
  }
}
