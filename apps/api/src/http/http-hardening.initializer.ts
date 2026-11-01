// @arkesoft/api — HttpHardeningInitializer (ROADMAP v0.0.7, T-008/S3,
// architect K6 madde 7 — tercih (B), A-A4)
//
// `ETag`/`X-Powered-By`'ı KAPATIR. GEREKÇE (K6/AC19): `ETag` tek başına
// gizli bir sızıntı taşımaz ama `no-store` ile BİRLİKTE anlamsızdır (RFC
// 9111 §5.2.2.5 — `no-store` bulunan bir yanıt HİÇBİR önbellek tarafından
// SAKLANAMAZ, dolayısıyla `ETag`'in koşullu doğrulama için kullanılması
// yapısal olarak imkansızlaşır; `AC19`'un "ETag yok" ölçümü bu YÜZDEN
// pinlenir — `NoStoreHeadersMiddleware`'in politikasıyla TUTARLI tek bir
// "hiçbir şey saklanmaz" hikâyesi). `X-Powered-By` çerçeve parmak izini
// (fingerprinting) azaltan bağımsız bir sertleştirme adımı.
//
// `OnApplicationBootstrap` — Nest modül grafiği TAMAMEN kurulduktan SONRA,
// `app.listen()`'den ÖNCE koşar; `main.ts` VE `createTestApp()` İKİSİNDE DE
// `AppModule`'ü import ettiği için OTOMATİK etkin (ek kablolama YOK).
//
// `httpAdapter.getInstance<T>()` — `same-origin.guard.ts`'in
// `getRequest<HttpRequestLike>()` deseniyle AYNI jenerik-metot kalıbı; `as`/
// `any` YOK. `typeof instance.set === 'function'` kontrolünden SONRA
// çağrılır — fastify'da `set` yüzeyi YOK, bu dal sessiz no-op'tur (K-A1
// adaptör-nötrlüğü: fastify'a geçişte bu dosya DEĞİŞMEZ). `express` importu
// YOK (K-A1, eslint `no-restricted-imports` zorluyor).

import { Inject, Injectable } from '@nestjs/common'
import type { OnApplicationBootstrap } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'

/**
 * Express'in `app.set(name, value)` yüzeyiyle yapısal olarak uyumlu —
 * fastify'ın altındaki instance bu yüzeyi TAŞIMAZ (`typeof === 'function'`
 * kontrolü bunu ayırt eder).
 */
type HttpServerSettingsLike = {
  set?: (name: string, value: unknown) => unknown
}

@Injectable()
export class HttpHardeningInitializer implements OnApplicationBootstrap {
  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  onApplicationBootstrap(): void {
    const instance = this.adapterHost.httpAdapter.getInstance<HttpServerSettingsLike>()

    if (typeof instance.set === 'function') {
      instance.set('etag', false)
      instance.set('x-powered-by', false)
    }
  }
}
