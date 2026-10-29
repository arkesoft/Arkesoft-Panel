// @arkesoft/api — kök modül (ROADMAP v0.0.4, T-002/ST-2, architect "Modül grafiği")
//
// SIRALI PAYLAŞIMLI DOSYA (PO dosya sahipliği + R-P3 — KURAL BAĞLAYICI):
// ST-4 → ST-6 → ST-5 bu dosyaya SIRAYLA EKLEME yapacak (middleware importları,
// `PrismaModule`/`RedisModule`/`TenancyModule`, `configure()` içindeki
// middleware zinciri). HER YAZICI YALNIZCA EKLER; mevcut satırları
// silmez/yeniden düzenlemez. Middleware SIRASI bağlayıcı (K-A5):
// `RequestContextMiddleware` → `TenantContextMiddleware`.
//
// `NestModule.configure()` kancası BU SÜRÜMDE hazırlanıyor ama middleware
// bağlama SONRAKİ alt görevlere bırakılıyor — `/health` (bu sürümün tek ucu)
// middleware gerektirmiyor (I/O'suz liveness, PO A-P5).

import { Module, RequestMethod } from '@nestjs/common'
import type { MiddlewareConsumer, NestModule } from '@nestjs/common'

// T-006/S5 EKLEMESİ: `AuthModule` — `TenancyModule`'den SONRA, `HealthModule`'den
// ÖNCE (PO dosya sahipliği, "app.module.ts SIRALI PAYLAŞIMLI DOSYA" R-P3, S5
// `imports`'a YALNIZCA EKLER). `configure()`'a DOKUNULMADI — o S6'nın işi.
// T-006/S6 EKLEMESİ: `AuthContextMiddleware` — `configure()`'da
// `TenantContextMiddleware`'den SONRA zincire eklenir (PO dosya sahipliği,
// "app.module.ts SIRALI PAYLAŞIMLI DOSYA" R-P3; bu alt görev yalnızca
// `configure()`'u değiştirir, `imports` S5'in).
import { AuthContextMiddleware } from './auth/auth-context.middleware.js'
import { AuthModule } from './auth/auth.module.js'
import { ConfigModule } from './config/config.module.js'
import { HealthModule } from './health/health.module.js'
import { LoggingModule } from './logging/logging.module.js'
// T-002/ST-6 EKLEMESİ: `PrismaModule`/`RedisModule` (ikisi de `@Global`) —
// `/health/ready`'nin ihtiyaç duyduğu `PrismaService`/`RedisService`'i TÜM
// modüllere sağlar. `HealthModule`'den ÖNCE listelenir (architect "Modül
// grafiği" sırası); `configure()` kancasına DOKUNULMADI (ST-5'in işi, R-P3).
import { PrismaModule } from './prisma/prisma.module.js'
import { RedisModule } from './redis/redis.module.js'
import { RequestContextMiddleware } from './request-context/request-context.middleware.js'
// T-002/ST-5 EKLEMESİ: `TenancyModule` (`TenantResolverService` +
// `APP_GUARD: TenantGuard`) — `HealthModule`'den SONRA listelenir (architect
// "Modül grafiği" sırası: Config/Logging/Prisma/Redis/Tenancy/Health).
// `configure()` kancasına `TenantContextMiddleware` EKLENDİ (R-P3 — bu
// sürümün SON yazıcısı, satır SİLİNMEDİ/yeniden DÜZENLENMEDİ).
import { TenancyModule } from './tenancy/tenancy.module.js'
import { TenantContextMiddleware } from './tenancy/tenant-context.middleware.js'

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    RedisModule,
    TenancyModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  // ST-4 (`RequestContextMiddleware`) ve ST-5 (`TenantContextMiddleware`) bu
  // kancaya `consumer.apply(...).forRoutes(...)` ÇAĞRISINI EKLEYECEK/EKLEDİ.
  //
  // T-002/ST-4 EKLEMESİ: `RequestContextMiddleware` TÜM yollara bağlanır
  // (K5 "fail-closed allowlist" `/health` dahil HER isteğin ALS context'e
  // sahip olmasını gerektirir — allowlist istisnası TENANT çözümü içindir,
  // ALS depo kurulumu için değil). ST-5'in `TenantContextMiddleware`'i
  // BUNDAN SONRA `.apply(RequestContextMiddleware, TenantContextMiddleware)`
  // şeklinde AYNI zincire EKLENECEK — sıra bağlayıcı (K-A5).
  //
  // R-P4 (PO tuzağı, ÇÖZÜLDÜ): Express 5 / path-to-regexp 8'de `forRoutes('*')`
  // sözdizimi KIRILDI (`TypeError: Missing parameter name`); `'*path'` adlı
  // parametreli joker karakter kullanılır — tüm yollarla eşleşir ve
  // `req.params.path` olarak erişilebilir bir segment adı verir. Bu desen
  // ST-5 tarafından da (`TenantContextMiddleware` için) KULLANILACAK.
  configure(consumer: MiddlewareConsumer): void {
    // T-002/ST-5 EKLEMESİ: `TenantContextMiddleware` AYNI zincire,
    // `RequestContextMiddleware`'DEN SONRA eklenir (K-A5, bağlayıcı sıra) —
    // ST-4'ün bulduğu R-P4 çözümüyle (`'*path'`) AYNI desen kullanılır.
    //
    // T-006/S6 EKLEMESİ: `AuthContextMiddleware` ZİNCİRİN SONUNA,
    // `TenantContextMiddleware`'DEN SONRA eklenir — `AuthGuard`'ın R2 üyelik
    // kontrolü, bu middleware'in yazdığı `auth` alanının YANINDA
    // `TenantContextMiddleware`'in ÇÖZDÜĞÜ `tenant` alanına da ihtiyaç duyar;
    // üçü de AYNI zincirde, tek `consumer.apply()` çağrısında kalır (SATIR
    // SİLİNMEDİ/yeniden DÜZENLENMEDİ, yalnızca EKLENDİ).
    consumer
      .apply(RequestContextMiddleware, TenantContextMiddleware, AuthContextMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL })
  }
}
