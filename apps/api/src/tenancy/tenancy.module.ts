// @arkesoft/api — TenancyModule (ROADMAP v0.0.4, T-002/ST-5, architect
// "Modül grafiği")
//
// `@Global()` DEĞİL — bu modülün `exports: [TenantResolverService]`'i
// YETERLİ: `TenantContextMiddleware`, `AppModule.configure()`'da
// `consumer.apply()` ile kaydedildiği için Nest onu `AppModule`'ün DI
// bağlamında kurar (bkz. altta); `AppModule` `TenancyModule`'ü DOĞRUDAN
// `imports`'una aldığı için `TenantResolverService`'i bu export üzerinden
// GÖRÜR — `@Global()` GEREKMEZ (`@nestjs/core/middleware/resolver.js`
// kaynağı okunarak doğrulandı: middleware DI çözümü `moduleRef`'in — burada
// `AppModule`'ün — kendi enjektörü üzerinden yapılır, bu enjektör modülün
// KENDİ providerları + DOĞRUDAN import ettiği modüllerin `export`ları +
// `@Global()` modüllerin export'larını görür).
//
// `TenantContextMiddleware` BU DİZİDE BİLEREK YOK — `RequestContextMiddleware`
// (ST-4) örüntüsüyle BİREBİR aynı: NestJS, `MiddlewareConsumer.apply()`'a
// verilen sınıfı middleware'i KAYDEDEN modülün (burada `AppModule`) DI
// bağlamında KENDİSİ enjekte eder; ayrıca bir `providers` girdisi GEREKMEZ
// (ST-4 bunu zaten kanıtladı — `RequestContextMiddleware` hiçbir modülün
// `providers`'ında DEĞİL).
//
// `APP_GUARD`: Nest'in global guard token'ı — `TenancyModule`'ün `@Global()`
// OLMAMASI bunu ETKİLEMEZ (`LoggingModule`'deki `APP_FILTER`/`APP_INTERCEPTOR`
// ile AYNI mekanizma: bu token'lar modülün global'liğinden BAĞIMSIZ olarak
// `ApplicationConfig`'e kaydolur).

import { Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'

import { TenantGuard } from './tenant.guard.js'
import { TenantResolverService } from './tenant-resolver.service.js'

const tenantGuardProvider: Provider = {
  provide: APP_GUARD,
  useClass: TenantGuard,
}

@Module({
  providers: [TenantResolverService, tenantGuardProvider],
  exports: [TenantResolverService],
})
export class TenancyModule {}
