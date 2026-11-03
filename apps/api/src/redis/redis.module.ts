// @arkesoft/api — RedisModule (ROADMAP v0.0.4, T-002/ST-6, architect K-A8;
// v0.0.11/T-013/S3 ile fabrikaya taşındı)
//
// `@Global()`: `RedisService`'i TÜM modüllere sağlar (`PrismaModule` ile aynı
// desen). AÇILIŞ Redis'E BAĞLI DEĞİLDİR: `ioredis` bağlantıyı arka planda
// dener, Nest `onApplicationBootstrap`'i bunu BEKLEMEZ — Redis kapalıysa
// süreç yine ayağa kalkar, `/health/ready` (ST-6'nın eklediği uç) 503 döner.
//
// ⚠ v0.0.11 (T-013/S3, architect K1.a): seçenekler ve ZORUNLU `'error'`
// dinleyicisi artık `create-redis-connection.ts`'in `'health'` profilinde —
// değerler BİREBİR korundu (R-A4: sıfır davranış değişikliği). BullMQ ayrı
// bir profil (`'queue'`) istiyor çünkü bloke eden komutlar kısa
// `commandTimeout` ile yaşayamaz; gerekçenin tamamı fabrika dosyasının
// başındadır. `REDIS_CLIENT` token'ı kuyruğa HİÇ verilmez — kuyruk kendi
// bağlantılarını kurar, böylece bu modülün yaşam döngüsü (`RedisService.
// onModuleDestroy`) kuyruğun yaşam döngüsüyle çakışmaz.

import { Global, Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'

import { API_ENV } from '../config/config.tokens.js'
import type { ApiEnv } from '../config/api-env.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { createRedisConnection } from './create-redis-connection.js'
import type { RedisConnectionLogger } from './create-redis-connection.js'
import { REDIS_CLIENT } from './redis.tokens.js'
import { RedisService } from './redis.service.js'

/**
 * `REDIS_CLIENT` provider'ının fabrikası. ADLANDIRILMIŞ ve DIŞA AÇIK olması
 * bilerek: profilin `'health'` OLDUĞU böylece Nest konteyneri ayağa
 * kaldırılmadan birim testinde doğrulanabiliyor (R-A4 pini — profil sessizce
 * `'queue'`a kayarsa `/health/ready` artık hızlı başarısız OLMAZ ve 503
 * yerine asılı kalır).
 *
 * `env` BİLEREK tüm `ApiEnv` değil, `Pick<…, 'REDIS_URL'>`: fabrikanın
 * okuduğu tek alan bu; test de tek alanlı bir nesneyle çağırabiliyor.
 */
export function createHealthRedisConnection(
  env: Pick<ApiEnv, 'REDIS_URL'>,
  logger: RedisConnectionLogger,
): Redis {
  return createRedisConnection({ url: env.REDIS_URL, profile: 'health', logger })
}

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (env: ApiEnv, logger: Logger): Redis => createHealthRedisConnection(env, logger),
  inject: [API_ENV, ROOT_LOGGER],
}

@Global()
@Module({
  providers: [redisClientProvider, RedisService],
  exports: [RedisService],
})
export class RedisModule {}
