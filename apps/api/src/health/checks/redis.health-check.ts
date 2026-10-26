// @arkesoft/api — Redis sağlık kontrolü (ROADMAP v0.0.4, T-002/ST-6,
// architect K-A8)
//
// `HealthCheck` arayüzünün Redis implementasyonu. `RedisService.client.ping()`
// çağırır; bağlantı canlı değilse `ioredis` reddeder, `health.controller.ts`
// bunu `withTimeout(check(), 2000)` ile sınırlayıp `'down'` olarak işaretler.

import { Inject, Injectable } from '@nestjs/common'

import { RedisService } from '../../redis/redis.service.js'
import type { HealthCheck } from '../health-check.types.js'

@Injectable()
export class RedisHealthCheck implements HealthCheck {
  readonly name = 'redis' as const

  constructor(@Inject(RedisService) private readonly redisService: RedisService) {}

  async check(): Promise<void> {
    await this.redisService.client.ping()
  }
}
