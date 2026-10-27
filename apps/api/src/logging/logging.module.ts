// @arkesoft/api — logging modülü (ROADMAP v0.0.4, T-002/ST-2, architect K-A7)
//
// `@Global()`: `ROOT_LOGGER` + `ArkesoftNestLogger`'ı TÜM modüllere sağlar.
//
// SIRALI PAYLAŞIMLI DOSYA (PO dosya sahipliği tablosu): ST-4 buraya
// `APP_FILTER` (`AppExceptionFilter`) ve `APP_INTERCEPTOR`
// (`RequestLoggingInterceptor`) EKLEYECEK. KURAL: yalnızca EKLE, bu sürümün
// yazdığı satırları silme/yeniden düzenleme.
//
// T-002/ST-4 EKLEMESİ: `APP_FILTER`/`APP_INTERCEPTOR` global provider'ları.
// İkisi de `ROOT_LOGGER`'a bağımlı olduğu için bu modülde tanımlanmaları
// doğaldır (ayrıca `AppExceptionFilter`'ın `@Catch()` global filtre olması
// Nest'in `APP_FILTER` DI token'ı üzerinden HER modülden bağımsız şekilde
// kurulmasını gerektirir — `AppModule`'da değil, `@Global()` bu modülde).

import { Global, Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import type { Logger } from 'pino'

import { API_ENV } from '../config/config.tokens.js'
import type { ApiEnv } from '../config/api-env.js'
import { AppExceptionFilter } from '../errors/app-exception.filter.js'
import { ArkesoftNestLogger } from './arkesoft-nest-logger.js'
import { ROOT_LOGGER } from './logging.tokens.js'
import { RequestLoggingInterceptor } from './request-logging.interceptor.js'
import { createRootLogger } from './root-logger.js'

const rootLoggerProvider: Provider = {
  provide: ROOT_LOGGER,
  useFactory: (env: ApiEnv): Logger => createRootLogger({ level: env.LOG_LEVEL }),
  inject: [API_ENV],
}

const appFilterProvider: Provider = {
  provide: APP_FILTER,
  useClass: AppExceptionFilter,
}

const appInterceptorProvider: Provider = {
  provide: APP_INTERCEPTOR,
  useClass: RequestLoggingInterceptor,
}

@Global()
@Module({
  providers: [rootLoggerProvider, ArkesoftNestLogger, appFilterProvider, appInterceptorProvider],
  exports: [ROOT_LOGGER, ArkesoftNestLogger],
})
export class LoggingModule {}
