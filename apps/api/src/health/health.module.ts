// @arkesoft/api — health modülü (ROADMAP v0.0.4, T-002/ST-2 → ST-6)
//
// SIRALI PAYLAŞIMLI DOSYA (PO dosya sahipliği): ST-2 (bu sürüm — yalnızca
// liveness) → ST-6 (`/health/ready`, `HEALTH_CHECKS` sağlayıcı dizisi,
// `HealthModule`'ün `imports`'una Prisma/Redis modülleri EKLENECEK). Bu
// modül BİLİNÇLİ OLARAK bugün hiçbir bağımlılık almıyor (liveness I/O'suz).

import { Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'

import { DatabaseHealthCheck } from './checks/database.health-check.js'
import { RedisHealthCheck } from './checks/redis.health-check.js'
import type { HealthCheck } from './health-check.types.js'
import { HealthController } from './health.controller.js'
import { HEALTH_CHECKS } from './health.tokens.js'

// T-002/ST-6 EKLEMESİ: `/health/ready`'nin (ST-2'nin liveness'ına EK) ihtiyaç
// duyduğu sağlayıcı dizisi. v0.0.11 `queue` kontrolünü BURAYA additive ekler
// (üçüncü `HealthCheck` implementasyonu + `inject` dizisine üçüncü parametre
// — mevcut ikisi KIRILMAZ).
const healthChecksProvider: Provider = {
  provide: HEALTH_CHECKS,
  useFactory: (database: DatabaseHealthCheck, redis: RedisHealthCheck): HealthCheck[] => [
    database,
    redis,
  ],
  inject: [DatabaseHealthCheck, RedisHealthCheck],
}

@Module({
  controllers: [HealthController],
  providers: [DatabaseHealthCheck, RedisHealthCheck, healthChecksProvider],
})
export class HealthModule {}
