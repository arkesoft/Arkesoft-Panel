// @arkesoft/api — test uygulaması fabrikası (ROADMAP v0.0.4, T-002/ST-2)
//
// `Test.createTestingModule` sarmalayıcısı. SIRALI PAYLAŞIMLI DOSYA (PO dosya
// sahipliği): ST-6 → ST-5 → ST-7 bu imzaya SADECE EKLEME yapacak (additive
// opsiyon alanları) — mevcut alanlar KIRILMAZ.
//
// `stream`: AC9/AC10'un bellek `Writable`'ı — verilirse `ROOT_LOGGER`
// provider'ı override edilip `createRootLogger`'a enjekte edilir, test NDJSON
// log satırlarını parse edebilir.
// `apiEnv`: `API_ENV` provider'ının TAMAMINI override eder — gerçek
// `parseEnv(process.env)` çağrılmaz (global mutasyonsuz, K-A4/AC6 — `NODE_ENV`
// testte `process.env`'e dokunmadan değiştirilebilir).
// `healthChecks` (T-002/ST-6 EKLEMESİ, additive): `HEALTH_CHECKS` provider'ının
// TAMAMINI override eder — AC3'ün 503/zaman aşımı testleri gerçek DB/Redis'e
// dokunmadan sahte `HealthCheck` nesneleri (hata fırlatan veya hiç dönmeyen
// `check()`) enjekte edebilir.
// `smokeControllers` (T-002/ST-7 EKLEMESİ, additive): AC5/AC7/AC14'ün HTTP
// seviyesinde gözlemi için teste özel controller'lar. ÜRETİM KODUNA UÇ
// EKLENMEZ — ST-5'in kendi duman testinde DOĞRULADIĞI desen: `AppModule`'ü
// İTHAL EDEN geçici bir `SmokeTestModule` kurulur, `AppModule`'ün kendisi
// hiçbir satırda değiştirilmez. Middleware zinciri (`'*path'` ile TÜM
// yollara bağlı) ve `APP_GUARD`/`APP_FILTER`/`APP_INTERCEPTOR` global
// provider'ları `AppModule`'den geldiği için bu controller'lara da AYNEN
// uygulanır.
//
// T-006/S8 EKLEMESİ (additive, koşulsuz — hiçbir YENİ opsiyon alanı YOK):
// `app.init()` SONRASI `platform:auth:*` Redis anahtarları FLUSH edilir.
// GEREKÇE (ÖLÇÜLDÜ): `RateLimitGuard` artık GLOBAL (`APP_GUARD`,
// `AuthModule`) ve sayaçlar PAYLAŞILAN tek Redis'te PLATFORM kapsamlı
// (R1) — her `createTestApp()` çağrısı AYRI bir Nest örneği kursa da HEPSİ
// AYNI Redis'e, AYNI loopback IP'den bağlanır. S8 ÖNCESİ hiçbir test
// dosyası bu sayaçların VARLIĞINI bilmiyordu (henüz doğmamıştı); S8
// SONRASI, tek bir test dosyasının biriktirdiği sayaç bir SONRAKİ dosyanın
// `createAuthenticatedSession()`/`sign-up`/`sign-in` çağrılarını 429'a
// düşürüp 8 ÖNCEDEN YAZILMIŞ testi KIRDI (ÖLÇÜLDÜ, `pnpm test` çıktısı —
// `auth-flow`/`auth-guard`/`auth-sessions`/`auth-secret-leak`/
// `concurrency`/`log-correlation`). Bu flush HİÇBİR mevcut testin
// DAVRANIŞINI/ASSERT'İNİ değiştirmez (S8 öncesi bu anahtarlar hiç yoktu,
// hiçbir test onların KALICILIĞINA bağımlı DEĞİL) — yalnızca HER test
// uygulamasına, rate-limit sayaçları açısından TEMİZ bir başlangıç verir.
// `SCAN` kullanılır (`KEYS` DEĞİL — büyük anahtar uzayında bloklamaz,
// production-safe desen, burada gerekli olmasa da tutarlılık için).
//
// T-009/S8 EKLEMESİ — İKİ FAIL-CLOSED KAPI (security T-008 tur2 medium +
// solid tur2 low, ÖLÇÜLDÜ: bu dosyada `NODE_ENV` kontrolü YOKTU, Redis host
// allowlist'i YOKTU — `grep -c NODE_ENV` → 0). Senaryo: biri paylaşılan/canlı
// bir ortamı teşhis ederken `REDIS_URL`'i o ortama işaret eder HÂLDE zorunlu
// kapı komutu `pnpm test` koşulursa, 30 çağıran dosyanın HER `createTestApp()`'i
// `platform:auth:*` NAMESPACE'İNİ dakikalarca TEKRAR TEKRAR siler — sign-in
// (20/15dk), sign-up (10/saat), şifre sıfırlama sayaçları SÜREKLİ sıfırlanır
// → credential-stuffing botu PRATİKTE SINIRSIZ deneme kazanır. `solid`'in
// değerlendirmesi: "kabul edilebilir dev kolaylığı DEĞİL, test izolasyon
// defekti." Kapılar `flushRateLimitCounters`'ın İLK satırlarında, Redis'e
// HİÇBİR komut gitmeden önce çalışır:
//   (a) `process.env.NODE_ENV !== 'test'` → fırlat.
//   (b) çözülen Redis host'u (`new URL(apiEnv.REDIS_URL).hostname`) loopback
//       allowlist'inde (`127.0.0.1`/`::1`/`localhost`) DEĞİLSE → fırlat.
//
// `NODE_ENV` KAYNAĞI — `process.env` (ApiEnv DEĞİL), ÖLÇÜLEREK seçildi —
// İLK denemede `ApiEnv.NODE_ENV` kullanıldı (`tenant-resolver.service.ts:11-13`
// ve `auth-instance.ts:17-33`'ün AYNI kuralını taşıdığı düşünülerek: "NODE_ENV
// API_ENV PROVIDER'INDAN okunur") ve bu `pnpm --filter @arkesoft/api test`'i
// KIRDI: `auth-flow.test.ts`/`tenant-resolution.test.ts` gibi BAŞKA, İLGİSİZ
// davranışları (üretim çerez modu, dev-header baypas'ı, açık yönlendirme
// koruması) doğrulamak için `apiEnv: { ...BASE_ENV, NODE_ENV: 'development'
// }`/`'production'` OVERRIDE EDEN GERÇEK, ÖNCEDEN VAR OLAN testleri KIRDI —
// bu testler GERÇEKTEN vitest altında (`process.env.NODE_ENV` HER ZAMAN
// `'test'`) koşuyor, yalnızca DI'YA enjekte edilen `ApiEnv.NODE_ENV`'i KENDİ
// SENARYOLARI için override ediyorlar; bu flush kapısının AMACI (gerçekten
// test SÜRECİNDE miyiz?) ile bu testlerin AMACI (DI'ya başka bir `NODE_ENV`
// enjekte ETMEK) ÇAKIŞIYOR. Doğru kaynak `process.env.NODE_ENV` —
// vitest'in KENDİSİ bunu HER ZAMAN `'test'` kurar (bu dosyanın ÜSTÜNDEKİ
// `apiEnv` alanı yorumunun aksine, bu DEĞER testler tarafından DI üzerinden
// ASLA override EDİLEMEZ — tam olarak istenen özellik: kapı, hiçbir testin
// kendi senaryosu için enjekte ettiği `ApiEnv.NODE_ENV`'den ETKİLENMEZ). Bu
// aynı zamanda "helper DI'dan ÖNCE koşabilir" riskini YAPISAL olarak ortadan
// kaldırır — `process.env` DI GRAFİĞİNE bağımlı değildir, HER ZAMAN erişilir.
// `REDIS_URL` için AYNI risk YOK (hiçbir test `apiEnv.REDIS_URL`'i KENDİ
// senaryosu için override ETMİYOR, ÖLÇÜLDÜ — `rg REDIS_URL __tests__`); bu
// yüzden (b) `apiEnv.REDIS_URL`'den OKUMAYA devam eder (DI'dan gelen GERÇEK
// bağlantı hedefi, `RedisModule`'ün `REDIS_CLIENT` provider'ının AYNI
// değerden kurduğu istemciyle TUTARLI). Negatif testler (`create-test-app-
// fail-closed.test.ts`): (a) `process.env.NODE_ENV`'i GEÇİCİ olarak
// mutasyona uğratıp `finally`'de GERİ ALIR (fileParallelism:false — BAŞKA
// bir dosyayla eşzamanlı KOŞMAZ, sızıntı riski YOK); (b) `apiEnv.REDIS_URL`
// override'ı (global mutasyonsuz, K-A4/AC6 deseni). Allowlist MODÜL SABİTİ
// (env'den OKUNMAZ, K-A8 emsali — eşik gevşetilemez disiplini).

import type { Server } from 'node:http'
import type { Writable } from 'node:stream'

import { Module } from '@nestjs/common'
import type { INestApplication, Type } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Logger } from 'pino'
import { z } from 'zod'

import { AppModule } from '../../app.module.js'
import type { ApiEnv } from '../../config/api-env.js'
import { API_ENV } from '../../config/config.tokens.js'
import type { HealthCheck } from '../../health/health-check.types.js'
import { HEALTH_CHECKS } from '../../health/health.tokens.js'
import { ArkesoftNestLogger } from '../../logging/arkesoft-nest-logger.js'
import { ROOT_LOGGER } from '../../logging/logging.tokens.js'
import { createRootLogger } from '../../logging/root-logger.js'
import { RedisService } from '../../redis/redis.service.js'

/** `platform:auth:*` anahtarları `redisService.client.scanStream`'den TOPLU `del`'e geçer — `KEYS` KULLANILMAZ. */
const RATE_LIMIT_KEY_SCAN_PATTERN = 'platform:auth:*'

/** `scanStream` TÜM Node `Readable`'lar gibi tip bilgisi TAŞIMAZ — her grup Zod ile doğrulanır, `as` KULLANILMAZ. */
const scanBatchSchema = z.array(z.string())

/**
 * T-009/S8 EKLEMESİ — FAIL-CLOSED allowlist, MODÜL SABİTİ (env'den OKUNMAZ,
 * dosya başı yorumu). `flushRateLimitCounters` yalnızca bu üç loopback
 * hostname'inden birine çözülen `REDIS_URL` için çalışır.
 */
const RATE_LIMIT_FLUSH_ALLOWED_REDIS_HOSTS: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  'localhost',
])

/**
 * T-006/S8 EKLEMESİ, T-009/S8'de İKİ FAIL-CLOSED KAPI eklendi — dosya başı
 * yorumu. Kapılar Redis'e HİÇBİR komut gitmeden ÖNCE, fonksiyonun İLK
 * satırlarında çalışır.
 */
async function flushRateLimitCounters(apiEnv: ApiEnv, redisService: RedisService): Promise<void> {
  // Dosya başı yorumu — KASITLI OLARAK `process.env.NODE_ENV` (ApiEnv DEĞİL):
  // testler KENDİ senaryoları için `apiEnv.NODE_ENV`'i override EDEBİLİR
  // (ör. üretim çerez modu testleri) — bu kapı o override'dan ETKİLENMEMELİ.
  const realNodeEnv = process.env['NODE_ENV']
  if (realNodeEnv !== 'test') {
    throw new Error(
      `flushRateLimitCounters yalnızca NODE_ENV=test ortamında koşabilir — fail-closed kapı tetiklendi (ölçülen process.env.NODE_ENV: ${String(realNodeEnv)})`,
    )
  }

  const redisHost = new URL(apiEnv.REDIS_URL).hostname

  if (!RATE_LIMIT_FLUSH_ALLOWED_REDIS_HOSTS.has(redisHost)) {
    throw new Error(
      `flushRateLimitCounters yalnızca loopback Redis'e (127.0.0.1/::1/localhost) karşı koşabilir — fail-closed kapı tetiklendi (çözülen host: ${redisHost})`,
    )
  }

  const stream = redisService.client.scanStream({ match: RATE_LIMIT_KEY_SCAN_PATTERN, count: 100 })

  for await (const batch of stream) {
    const keys = scanBatchSchema.parse(batch)
    if (keys.length > 0) {
      await redisService.client.del(...keys)
    }
  }
}

export type CreateTestAppOptions = {
  /** Bellek stream'i — verilirse pino buraya yazar (AC9/AC10 NDJSON parse). */
  readonly stream?: Writable
  /** `API_ENV` provider'ının TAMAMINI override eder — `parseEnv` çağrılmaz. */
  readonly apiEnv?: ApiEnv
  /** `HEALTH_CHECKS` provider'ının TAMAMINI override eder (T-002/ST-6, AC3). */
  readonly healthChecks?: readonly HealthCheck[]
  /**
   * T-002/ST-7 EKLEMESİ (additive): teste özel controller'lar (bkz. dosya başı
   * yorumu). Verilmezse (varsayılan) davranış ÖNCEKİ sürümle BİREBİR aynıdır —
   * `AppModule` doğrudan kök modül olarak kullanılır.
   */
  readonly smokeControllers?: readonly Type<unknown>[]
}

export type TestApp = {
  /** `TServer` açıkça `http.Server` — `supertest`'in `App` tipiyle `any` kullanmadan eşleşir. */
  readonly app: INestApplication<Server>
}

/**
 * `AppModule`'ü İTHAL EDEN, verilen controller'ları TAŞIYAN geçici bir test
 * kökü üretir. `AppModule`'ün kendisi hiçbir satırda değiştirilmez/devralınmaz
 * — yalnızca SARILIR (ST-5'in kendi duman testinde doğruladığı desen).
 */
function buildSmokeTestModule(smokeControllers: readonly Type<unknown>[]): Type<unknown> {
  class SmokeTestModule {
    /** `no-extraneous-class`'ı atlatmak İÇİN DEĞİL — bu sınıfın tek amacını
     * (AppModule'ü değiştirmeden sarmak) teşhis edilebilir kılan, okunabilir
     * bir işaretleyici. */
    readonly purpose = 'T-002/ST-7 teste özel kök modül — AppModule değişmeden controller ekler'
  }

  Module({ imports: [AppModule], controllers: [...smokeControllers] })(SmokeTestModule)

  return SmokeTestModule
}

/**
 * `AppModule` grafiğini `Test.createTestingModule` ile kurar, gerekli
 * override'ları uygular ve `app.init()` çağırır. Çağıran, dönen `app`'i
 * testin sonunda `app.close()` ile kapatmalıdır.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  const rootModule =
    options.smokeControllers !== undefined && options.smokeControllers.length > 0
      ? buildSmokeTestModule(options.smokeControllers)
      : AppModule

  const moduleBuilder = Test.createTestingModule({
    imports: [rootModule],
  })

  if (options.apiEnv !== undefined) {
    moduleBuilder.overrideProvider(API_ENV).useValue(options.apiEnv)
  }

  if (options.stream !== undefined) {
    const stream = options.stream
    moduleBuilder.overrideProvider(ROOT_LOGGER).useFactory({
      factory: (env: ApiEnv): Logger => createRootLogger({ level: env.LOG_LEVEL, stream }),
      inject: [API_ENV],
    })
  }

  if (options.healthChecks !== undefined) {
    moduleBuilder.overrideProvider(HEALTH_CHECKS).useValue(options.healthChecks)
  }

  const moduleRef = await moduleBuilder.compile()
  const app: INestApplication<Server> = moduleRef.createNestApplication()

  app.useLogger(app.get(ArkesoftNestLogger))

  await app.init()

  // T-006/S8 EKLEMESİ — dosya başı yorumu: HER test uygulaması rate-limit
  // sayaçları açısından TEMİZ başlar (çapraz dosya birikimi, ÖLÇÜLDÜ).
  // T-009/S8: `apiEnv` DI'DAN (override edilmiş olabilir, K-A4/AC6) okunur —
  // iki fail-closed kapı bu değere göre karar verir. Kapı fırlatırsa (negatif
  // testler, `create-test-app-fail-closed.test.ts`) `app` ZATEN `init()`
  // edilmiş olur — KAPATILMADAN fırlatmak DB/Redis bağlantısını SIZDIRIR;
  // bu yüzden hata burada YAKALANIR, `app.close()` ile temizlenir, SONRA
  // orijinal hata (sarmalanmadan, `catch {}` DEĞİL) yeniden fırlatılır.
  try {
    await flushRateLimitCounters(app.get<ApiEnv>(API_ENV), app.get(RedisService))
  } catch (error) {
    await app.close()
    throw error
  }

  return { app }
}
