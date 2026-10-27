// @arkesoft/api — PrismaService yaşam döngüsü (ROADMAP v0.0.4, T-002/ST-6,
// architect K-A3)
//
// `PrismaClient` yapıcısı dışa açılmadığı için `class PrismaService extends
// PrismaClient` deseni İMKANSIZ (packages/db yalnızca `createPrismaClient`
// fabrikasını dışa açar) → sarmalayıcı sınıf + `.db` getter. v0.0.13
// `withTenant()`'ı AYNI sınıfa ADDITIVE ekleyecek — tek sınıf, tek erişim
// noktası (`.db` ham erişim o sürümde lint ile kısıtlanabilir, architect notu).
//
// `onModuleDestroy`: `$disconnect()` YETERLİ (B3+B4 kanıtı, architect K-A3) —
// adaptörün (`@prisma/adapter-pg`) kendi `pg.Pool`'unu
// `$disconnect()` → engine `disconnect()` → `adapter.dispose()` → `pool.end()`
// zinciriyle serbest bırakır; `packages/db`'ye ek teardown yüzeyi GEREKMEZ.
//
// EAGER `$connect()` YOK — bu dosyada hiçbir yerde çağrılmaz: DB kapalıyken
// süreç yine ayağa kalkar, `/health/ready` (ST-6'nın bu sürümde eklediği uç)
// 503 döner (v0.18.0 Kubernetes readiness semantiğinin temeli). SONUÇ:
// `$connect()` hiç çağrılmadıysa `$disconnect()` NO-OP'tur — AC11 testinin
// (ST-7'nin işi) SIGTERM'DEN ÖNCE DB'ye giden en az bir istek atması bu
// yüzden ZORUNLUDUR (yoksa disconnect süre ölçümü anlamsızlaşır).

import { Inject, Injectable } from '@nestjs/common'
import type { OnModuleDestroy } from '@nestjs/common'
import type { PrismaDatabase } from '@arkesoft/db'
import type { Logger } from 'pino'

import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { PRISMA_CLIENT } from './prisma.tokens.js'

@Injectable()
export class PrismaService implements OnModuleDestroy {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly client: PrismaDatabase,
    @Inject(ROOT_LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Ham Prisma erişimi. `checks/database.health-check.ts` ve v0.0.13'ün
   * `withTenant()`'ı bu getter üzerinden çalışacak — tek erişim noktası.
   */
  get db(): PrismaDatabase {
    return this.client
  }

  async onModuleDestroy(): Promise<void> {
    const startedAt = Date.now()
    await this.client.$disconnect()
    this.logger.info({ durationMs: Date.now() - startedAt }, 'prisma bağlantısı kapatıldı')
  }
}
