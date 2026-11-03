// @arkesoft/api — worker sürecinin KÖK modülü (ROADMAP v0.0.11, T-013/S6,
// architect K1.e + MODÜL YERLEŞİMİ)
//
// ⚠ `AppModule`'ÜN BİR KOPYASI DEĞİL, KASITLI OLARAK DAHA KÜÇÜK BİR GRAFİK.
// Worker HTTP portu AÇMAZ (`createApplicationContext`), dolayısıyla HTTP'ye
// bağlı her şey BİLEREK DIŞARIDA:
//
//   `TenancyModule`  → host→kiracı çözümü ve `TenantGuard` bir İSTEK
//                      kavramıdır; worker'ın kiracısı PAYLOAD'DAN gelir
//                      (CLAUDE.md §7 md 7).
//   `AuthModule`     → oturum/çerez/rate-limit yüzeyi yok; ayrıca `APP_GUARD`
//                      kaydeden bir modülü HTTP'siz bir bağlama sokmak
//                      anlamsız handle ve zamanlayıcı açar.
//   `HealthModule`   → `/health` uçları HTTP'dir (worker'ın hazır-olma
//                      sinyali NDJSON log satırıdır — K1.d).
//   `TrpcModule`     → controller.
//   `HttpHardening*` / `NoStoreHeaders*` → HTTP başlıkları.
//
// Gerekçe tek cümle: EN KÜÇÜK YÜZEY = EN AZ AÇIK HANDLE, bu da AC9'un
// ("SIGTERM sonrası exit 0, açık handle yok") ön koşulu.
//
// İÇERİDE OLANLAR ve nedenleri:
//   `ConfigModule`      → `API_ENV` (`REDIS_URL`, `DATABASE_URL`, `LOG_LEVEL`),
//                         `parseEnv` TEK noktadan geçer (K-A3).
//   `LoggingModule`     → `ROOT_LOGGER` TEK kaynak. ⚠ Worker'ın kendi pino
//                         örneğini kurması bu reponun tekrarlayan kusur
//                         sınıfı olurdu (kopya kayıt birbirinden ayrı
//                         evriliyor); log gövdesindeki `service`/`version`
//                         alanları da böylece API ile BİREBİR aynı kalır.
//   `PrismaModule`      → `PrismaService.withTenant()`; `onModuleDestroy`
//                         `$disconnect()` yapar (AC9'un `pg_stat_activity`
//                         ölçümü buna dayanıyor).
//   `QueueWorkerModule` → `Worker` örnekleri; kendisi `QueueModule`'ü import
//                         ettiği için `QUEUE_CONNECTION` +
//                         `JOB_QUEUE_REGISTRY` (DLQ dahil) + kapanış
//                         sözleşmesi (`QueueLifecycleService`) bu grafikte
//                         DE vardır.

import { Module } from '@nestjs/common'

import { ConfigModule } from './config/config.module.js'
import { LoggingModule } from './logging/logging.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { QueueWorkerModule } from './queue/queue-worker.module.js'

@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, QueueWorkerModule],
})
export class WorkerModule {}
