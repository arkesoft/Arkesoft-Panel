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
// T-008/S3 EKLEMESİ (ROADMAP v0.0.7, architect K6 madde 7, A-A4):
// `HttpHardeningInitializer` — `providers`'a EKLENDİ, `OnApplicationBootstrap`
// Nest modül grafiği kurulduktan SONRA koşar; `main.ts`/`createTestApp()`
// İKİSİNDE DE `AppModule` üzerinden OTOMATİK etkin.
import { HttpHardeningInitializer } from './http/http-hardening.initializer.js'
// T-008/S3 EKLEMESİ (ROADMAP v0.0.7, architect K6, borç 1440+1441+1453):
// `NoStoreHeadersMiddleware` — `configure()` zincirinin BAŞINA eklenir
// (K-A5'in bağladığı `RequestContext → Tenant → Auth` GÖRELİ sırası
// KORUNUR, bu middleware o üçlünün ÖNÜNE eklenir, aralarına GİRMEZ).
import { NoStoreHeadersMiddleware } from './http/no-store-headers.middleware.js'
import { LoggingModule } from './logging/logging.module.js'
// T-002/ST-6 EKLEMESİ: `PrismaModule`/`RedisModule` (ikisi de `@Global`) —
// `/health/ready`'nin ihtiyaç duyduğu `PrismaService`/`RedisService`'i TÜM
// modüllere sağlar. `HealthModule`'den ÖNCE listelenir (architect "Modül
// grafiği" sırası); `configure()` kancasına DOKUNULMADI (ST-5'in işi, R-P3).
import { PrismaModule } from './prisma/prisma.module.js'
// T-013/S5 EKLEMESİ (ROADMAP v0.0.11, architect K4): `QueueModule` —
// YALNIZCA ÜRETİCİ tarafı (`Queue` + DLQ `Queue` + `QueueService.enqueue` +
// kapanış sözleşmesi). ⚠ TÜKETİCİ (`Worker`) BU MODÜLDE DE, BU DOSYADA DA
// YOK: worker AYRI bir süreçtir (`main.worker.ts`, T-013/S6) ve kendi modül
// grafiğini kurar. HTTP sürecinde `Worker` ayağa kaldırmak bloke eden Redis
// bağlantıları + stalled-checker zamanlayıcıları açar, yani v0.0.4'ün AC11
// garantisini (SIGTERM → exit 0, açık handle yok) HTTP tarafında da riske
// atardı. `imports` dizisine YALNIZCA EKLENDİ — satır SİLİNMEDİ/yeniden
// DÜZENLENMEDİ (R-P3; kanıt: `git diff --numstat` → silinen satır 0).
import { QueueModule } from './queue/queue.module.js'
import { RedisModule } from './redis/redis.module.js'
import { RequestContextMiddleware } from './request-context/request-context.middleware.js'
// T-002/ST-5 EKLEMESİ: `TenancyModule` (`TenantResolverService` +
// `APP_GUARD: TenantGuard`) — `HealthModule`'den SONRA listelenir (architect
// "Modül grafiği" sırası: Config/Logging/Prisma/Redis/Tenancy/Health).
// `configure()` kancasına `TenantContextMiddleware` EKLENDİ (R-P3 — bu
// sürümün SON yazıcısı, satır SİLİNMEDİ/yeniden DÜZENLENMEDİ).
import { TenancyModule } from './tenancy/tenancy.module.js'
import { TenantContextMiddleware } from './tenancy/tenant-context.middleware.js'
// T-007/S5 EKLEMESİ: `TrpcModule` — `@All('trpc/*path')` controller'ı
// (`imports` dizisinin SONUNA eklendi, PO dosya sahipliği R-P3; `configure()`
// kancasına DOKUNULMADI — zincir zaten `'*path'` ile TÜM yolları kapsıyor,
// bu modül hiçbir global enhancer kaydetmediği için mevcut guard sırası
// DEĞİŞMEDİ, architect "Modül yerleşimi" bölümü).
import { TrpcModule } from './trpc/trpc.module.js'

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    RedisModule,
    TenancyModule,
    AuthModule,
    HealthModule,
    TrpcModule,
    // T-013/S5 EKLEMESİ: `QueueModule` dizinin SONUNA eklendi (mevcut sıra
    // DEĞİŞMEDİ). `ConfigModule`/`LoggingModule`/`PrismaModule` `@Global()`
    // olduğu için bağımlılıkları (`API_ENV`, `ROOT_LOGGER`, `PrismaService`)
    // sıradan bağımsız çözülür.
    QueueModule,
  ],
  // T-008/S3 EKLEMESİ (architect K6 madde 7): `HttpHardeningInitializer` —
  // `OnApplicationBootstrap` kancası ile ETag/X-Powered-By'ı kapatır.
  providers: [HttpHardeningInitializer],
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
    // T-008/S3 EKLEMESİ (architect K6): `NoStoreHeadersMiddleware` AYRI bir
    // `consumer.apply().forRoutes()` çağrısıyla, mevcut satırdan ÖNCE
    // eklendi — SATIR SİLİNMEDİ/değiştirilmedi (`git diff --numstat` kanıtı
    // raporda), yalnızca EKLENDİ. NestJS `configure()` içindeki ardışık
    // `apply().forRoutes()` çağrılarını KAYIT SIRASINA göre bağlar (Express'in
    // ara yazılım yığınıyla AYNI sıralama garantisi) — bu yüzden bu çağrı
    // ALTTAKİ üçlüden ÖNCE koşar: yazdığı `cache-control`/`vary` başlıkları
    // guard reddi (401/403/404) yanıtları DAHİL HER yanıtta bulunur (AC19).
    // Üçlünün KENDİ ARALARINDAKİ sıra (K-A5) DEĞİŞMEDİ.
    consumer.apply(NoStoreHeadersMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL })

    consumer
      .apply(RequestContextMiddleware, TenantContextMiddleware, AuthContextMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL })
  }
}
