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

import type { Server } from 'node:http'
import type { Writable } from 'node:stream'

import { Module } from '@nestjs/common'
import type { INestApplication, Type } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Logger } from 'pino'

import { AppModule } from '../../app.module.js'
import type { ApiEnv } from '../../config/api-env.js'
import { API_ENV } from '../../config/config.tokens.js'
import type { HealthCheck } from '../../health/health-check.types.js'
import { HEALTH_CHECKS } from '../../health/health.tokens.js'
import { ArkesoftNestLogger } from '../../logging/arkesoft-nest-logger.js'
import { ROOT_LOGGER } from '../../logging/logging.tokens.js'
import { createRootLogger } from '../../logging/root-logger.js'

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

  return { app }
}
