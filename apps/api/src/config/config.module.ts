// @arkesoft/api — kök yapılandırma modülü (ROADMAP v0.0.4, T-002/ST-2,
// architect K-A3/K-A8)
//
// `@Global()`: `API_ENV` ve `PLATFORM_VERSION` token'larını TÜM modüllere
// sağlar. `parseEnv` BURADA çağrılır — `createPrismaClient` (packages/db,
// v0.0.13'ten itibaren bu modülün tüketeceği fabrika) ASLA `process.env`'e
// dokunmaz (K-A3); port/host/log seviyesi gibi TÜM ortam okuması bu TEK
// noktadan geçer.
//
// DI KURALI: bu modülün yapıcı parametresi yok (yalnızca provider
// fabrikaları); fabrikaların kendisi de parametre almıyor, ileride parametre
// alırlarsa `inject` dizisi açık token taşımak ZORUNDA (property injection
// veya tip çıkarımına dayanan DI yasak).

import { Global, Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'

import { apiEnvSchema } from './api-env.js'
import type { ApiEnv } from './api-env.js'
import { API_ENV, PLATFORM_VERSION } from './config.tokens.js'
import { resolvePlatformVersion } from './platform-version.js'

const apiEnvProvider: Provider = {
  provide: API_ENV,
  useFactory: (): ApiEnv => parseEnv(apiEnvSchema),
}

const platformVersionProvider: Provider = {
  provide: PLATFORM_VERSION,
  useFactory: (): string => resolvePlatformVersion(),
}

@Global()
@Module({
  providers: [apiEnvProvider, platformVersionProvider],
  exports: [API_ENV, PLATFORM_VERSION],
})
export class ConfigModule {}
