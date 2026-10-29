// @arkesoft/api — veritabanı sağlık kontrolü (ROADMAP v0.0.4, T-002/ST-6,
// architect K-A3/K-A8; erişim yüzeyi ROADMAP v0.0.5, T-006 "son temizlik",
// `security` tur4 S4-1'de daraltıldı)
//
// `HealthCheck` arayüzünün veritabanı implementasyonu. `checkDatabaseConnection`
// (`@arkesoft/db`, T-002/ST-3) çağrılır — ham SQL (`SELECT 1`) BİLEREK
// `packages/db` içinde kalır, bu dosya `$queryRaw`/`$executeRaw` ÇAĞIRMAZ
// (CLAUDE.md §3 paket sınırı). `PrismaService.db` (`AppPrismaDatabase`)
// artık `$queryRaw` TAŞIMADIĞI için bu kontrol `PrismaService.connectionProbe`'u
// (`Pick<PrismaDatabase, '$queryRaw'>`, TEK tüketicisi bu dosya) kullanır —
// `.db` getter'ını gören diğer servislerin ham SQL'e erişimi YOKTUR (ALTINCI
// KAPI kapatıldı). Zaman aşımı sarmalaması BURADA DEĞİL —
// `health.controller.ts` her kontrolü `withTimeout(check(), 2000)` ile sarar.

import { Inject, Injectable } from '@nestjs/common'
import { checkDatabaseConnection } from '@arkesoft/db'

import { PrismaService } from '../../prisma/prisma.service.js'
import type { HealthCheck } from '../health-check.types.js'

@Injectable()
export class DatabaseHealthCheck implements HealthCheck {
  readonly name = 'database' as const

  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async check(): Promise<void> {
    await checkDatabaseConnection(this.prismaService.connectionProbe)
  }
}
