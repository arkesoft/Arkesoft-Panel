// @arkesoft/api — RedisService yaşam döngüsü (ROADMAP v0.0.4, T-002/ST-6,
// architect K-A8)
//
// `OnModuleDestroy`: `quit()` ile GRACEFUL kapanış dener (bekleyen komutları
// tamamlayıp bağlantıyı kapatır). `QUIT_TIMEOUT_MS` (1 sn) içinde dönmezse
// (veya `quit()` reddederse) `disconnect()` (sert kapanış) ile devam eder —
// AC11'in "SIGTERM sonrası açık handle kalmaz" garantisi için sınırsız
// beklemek exit 0'ı tehlikeye atar. `with-timeout.ts` (bu alt görevin kendi
// dosyası) burada YENİDEN KULLANILIR — sarkan zamanlayıcı bırakmama garantisi
// aynı disiplinle korunur.

import { Inject, Injectable } from '@nestjs/common'
import type { OnModuleDestroy } from '@nestjs/common'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'

import { withTimeout } from '../health/with-timeout.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { REDIS_CLIENT } from './redis.tokens.js'

const QUIT_TIMEOUT_MS = 1000

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(ROOT_LOGGER) private readonly logger: Logger,
  ) {}

  /** Ham istemci. `RedisHealthCheck` ve v0.0.11 BullMQ için erişim noktası. */
  get client(): Redis {
    return this.redis
  }

  async onModuleDestroy(): Promise<void> {
    const quitSucceeded = await withTimeout(this.redis.quit(), QUIT_TIMEOUT_MS)
      .then(() => true)
      .catch((error: unknown) => {
        this.logger.warn(
          { errorMessage: error instanceof Error ? error.message : String(error) },
          'redis quit zaman aşımına uğradı veya başarısız oldu, sert kapanış uygulanıyor',
        )
        return false
      })

    if (!quitSucceeded) {
      this.redis.disconnect()
    }
  }
}
