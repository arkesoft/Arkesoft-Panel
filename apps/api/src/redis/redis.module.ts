// @arkesoft/api — RedisModule (ROADMAP v0.0.4, T-002/ST-6, architect K-A8)
//
// `@Global()`: `RedisService`'i TÜM modüllere sağlar (`PrismaModule` ile aynı
// desen). AÇILIŞ Redis'E BAĞLI DEĞİLDİR: `ioredis` bağlantıyı arka planda
// dener, Nest `onApplicationBootstrap`'i bunu BEKLEMEZ — Redis kapalıysa
// süreç yine ayağa kalkar, `/health/ready` (ST-6'nın eklediği uç) 503 döner.
//
// 'error' DİNLEYİCİSİ ZORUNLU, ATLANAMAZ: Node'un varsayılan davranışı,
// dinleyicisi OLMAYAN bir `EventEmitter`'da `'error'` olayı fırlatıldığında
// istisnayı YUKARI FIRLATIP SÜRECİ DÜŞÜRMEKTİR. Dinleyici eklenmezse Redis
// kapalıyken TEK bağlantı hatası API sürecini çökertir — "Redis kapalıyken
// API yaşar, `/health/ready` 503 der" kararı sessizce iptal olur. Log seli
// olmaması için `warn` THROTTLE'lıdır (en az `ERROR_LOG_THROTTLE_MS` arayla).

import { Global, Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'
import { Redis } from 'ioredis'
import type { Logger } from 'pino'

import { API_ENV } from '../config/config.tokens.js'
import type { ApiEnv } from '../config/api-env.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { REDIS_CLIENT } from './redis.tokens.js'
import { RedisService } from './redis.service.js'

/** Log selini önlemek için `'error'` olayının en az bu kadar ms arayla loglanması. */
const ERROR_LOG_THROTTLE_MS = 10_000

/**
 * Üst SINIRLI (en fazla 2000ms) backoff — sınırsız artan bekleme YOK.
 * `ioredis`'in `retryStrategy`'si: dönen sayı bir sonraki denemeden önce
 * beklenecek ms; `null`/`undefined` dönerse istemci yeniden denemeyi durdurur
 * (bilerek kullanılmıyor — Redis kapalıyken sonsuz deneme, bağlantı geri
 * geldiğinde otomatik iyileşme ister, K-A8).
 */
function redisRetryStrategy(attempt: number): number {
  return Math.min(attempt * 200, 2000)
}

const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (env: ApiEnv, logger: Logger): Redis => {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      commandTimeout: 1500,
      connectTimeout: 2000,
      retryStrategy: redisRetryStrategy,
    })

    let lastLoggedAt = 0

    // ZORUNLU dinleyici (bkz. dosya başı yorumu) — throttle'lı `warn`. Sağlayıcıya
    // özgü dallanma YOK; bu modül yalnızca bağlantı YÖNETİMİYLE ilgilenir.
    client.on('error', (error: Error) => {
      const now = Date.now()
      if (now - lastLoggedAt < ERROR_LOG_THROTTLE_MS) {
        return
      }
      lastLoggedAt = now
      logger.warn({ errorMessage: error.message }, 'redis bağlantı hatası')
    })

    return client
  },
  inject: [API_ENV, ROOT_LOGGER],
}

@Global()
@Module({
  providers: [redisClientProvider, RedisService],
  exports: [RedisService],
})
export class RedisModule {}
