// @arkesoft/api — liveness ucu (ROADMAP v0.0.4, T-002/ST-2, architect K-A8)
//
// `GET /health` — I/O YOK (Prisma/Redis bağımlılığı yok, PO A-P5): bu sürümde
// `/health/ready` henüz eklenmedi (ST-6 ekleyecek, additive).
//
// SIRALI PAYLAŞIMLI DOSYA (PO dosya sahipliği): bu dosyanın gövdesi —
// `status`/`service`/`version`/`uptimeSeconds` alanları — ST-6 tarafından
// DEĞİŞTİRİLMEYECEK; `/health/ready` AYRI bir handler olarak eklenecek.
//
// `/health`, `TENANT_EXEMPT_PATHS`'in (ST-5, K5) tenant gerektirmeyen
// allowlist'indeki İKİ yoldan biridir — tam eşleşme, prefix değil.

import { Controller, Get, Inject } from '@nestjs/common'

import { PLATFORM_VERSION } from '../config/config.tokens.js'
import { DependencyUnavailableError } from '../errors/domain/dependency-unavailable.error.js'
import type { DependencyCheckStatus } from '../errors/domain/dependency-unavailable.error.js'
import type { HealthCheck } from './health-check.types.js'
import { HEALTH_CHECKS } from './health.tokens.js'
import { READINESS_CHECK_TIMEOUT_MS, withTimeout } from './with-timeout.js'

type HealthResponse = {
  readonly status: 'ok'
  readonly service: 'api'
  readonly version: string
  readonly uptimeSeconds: number
}

// T-002/ST-6 EKLEMESİ: readiness yanıt tipi. Liveness'ın (`HealthResponse`,
// yukarıda, ST-2) aksine bu uç I/O yapar (DB + Redis).
type ReadinessResponse = {
  readonly status: 'ok'
  readonly checks: Record<string, DependencyCheckStatus>
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PLATFORM_VERSION) private readonly platformVersion: string,
    @Inject(HEALTH_CHECKS) private readonly healthChecks: HealthCheck[],
  ) {}

  @Get()
  getLiveness(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      version: this.platformVersion,
      uptimeSeconds: Math.floor(process.uptime()),
    }
  }

  /**
   * `GET /health/ready` (T-002/ST-6, architect K-A8) — `TENANT_EXEMPT_PATHS`'in
   * (ST-5, K5) İKİNCİ elemanı. Her kontrol `Promise.allSettled` ile PARALEL
   * çalışır ve `withTimeout(check(), READINESS_CHECK_TIMEOUT_MS)` ile
   * sınırlanır — asılı bir bağımlılık ~2 sn'de düşer, beklemede KALMAZ.
   * Hepsi `up` → 200. Biri `down` → `DependencyUnavailableError` fırlatılır;
   * `AppExceptionFilter` bunu 503'e ve `details.checks`'e çevirir
   * (bkz. `errors/error-mapping.ts`). Çekirdek sağlayıcı adına göre
   * DALLANMAZ — `this.healthChecks` yalnızca `HealthCheck` arayüzü üzerinden
   * okunur.
   */
  @Get('ready')
  async getReadiness(): Promise<ReadinessResponse> {
    const checkEntries = this.healthChecks.map((check) => ({
      name: check.name,
      result: withTimeout(check.check(), READINESS_CHECK_TIMEOUT_MS),
    }))

    const settled = await Promise.allSettled(checkEntries.map((entry) => entry.result))

    const checks: Record<string, DependencyCheckStatus> = {}

    checkEntries.forEach((entry, index) => {
      const outcome = settled[index]
      checks[entry.name] = outcome?.status === 'fulfilled' ? 'up' : 'down'
    })

    // Kapanış içindeki bir `boolean` atamasına güvenmek yerine nihai `checks`
    // sözlüğünden türetiyoruz — TypeScript'in kapanış sınırları üzerinden akış
    // analizi yapmaması (`no-unnecessary-condition`'ı hatalı biçimde tetikleme
    // riski) ve okunabilirlik için.
    const hasFailure = Object.values(checks).includes('down')

    if (hasFailure) {
      throw new DependencyUnavailableError(checks)
    }

    return { status: 'ok', checks }
  }
}
