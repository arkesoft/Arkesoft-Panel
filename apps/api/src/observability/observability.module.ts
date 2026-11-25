// @arkesoft/api — ObservabilityModule: Katman 2'nin Nest grafiğine bağlanması
// (ROADMAP v0.0.17, T-028/S6, architect K-A28-2/K-A28-3)
//
// ⚠⚠ BU MODÜL BİR MIDDLEWARE DEĞİL — `app.module.ts`/`worker.module.ts`'in
// `imports` dizisine EKLENEN sıradan bir Nest modülüdür (po R-PO2, bağlayıcı).
// `app.module.ts`'in `configure()`'undaki `consumer.apply(...)` zinciri bu
// modülün eklenmesiyle HİÇ DEĞİŞMEZ (middleware göreli sırası —
// `NoStoreHeaders` → `RequestContext` → `Tenant` → `Auth` — AYNI kalır).
//
// İKİ SORUMLULUK:
//   1. `SentryBootstrapInitializer` — `OnModuleInit`, açılışta BİR KEZ
//      `startSentry({ dsn: env.SENTRY_DSN })` çağırır. ⚠⚠ `transport` ALANI
//      ASLA VERİLMEZ (S5'in şartı — gerçek HTTP taşıyıcısı devre dışı
//      kalmasın). DSN tanımsız/boşsa `startSentry()` NO-OP'tur (AC-57).
//   2. `ObservabilityShutdownService` — `OnApplicationShutdown`, K-A28-3'ün
//      sırasını uygular (ayrı dosya, gerekçesi orada).
//
// Bu modül HTTP (`app.module.ts`) VE worker (`worker.module.ts`) grafiklerine
// AYNI ŞEKİLDE eklenir — Sentry/OTel kapanışı iki süreçte de GEÇERLİ olmalı
// (AC-57'nin DoD'ü: "HTTP ve worker AYRI" ölçülür, ikisi de sıfır zarf/soket
// vermelidir).
//
// ⚠ `@sentry/node` BU DOSYADA IMPORT EDİLMEZ — yalnızca `startSentry()`
// çağrılır (`observability/sentry.ts`'in yapısal import sınırlaması, K-A28-2).

import { Inject, Injectable, Module } from '@nestjs/common'
import type { OnModuleInit } from '@nestjs/common'

import { API_ENV } from '../config/config.tokens.js'
import type { ApiEnv } from '../config/api-env.js'
import { ObservabilityShutdownService } from './observability-shutdown.service.js'
import { startSentry } from './sentry.js'

@Injectable()
export class SentryBootstrapInitializer implements OnModuleInit {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  /**
   * Nest modül grafiği kurulurken BİR KEZ koşar. `env.SENTRY_DSN` ZATEN Zod
   * ile doğrulanmış (`apiEnvSchema`) — bu sınıf `process.env`'i KENDİSİ
   * OKUMAZ (CLAUDE.md §4). `transport` alanı BİLİNÇLİ OLARAK verilmez
   * (test-only seam, S5'in şartı).
   */
  onModuleInit(): void {
    startSentry({ dsn: this.env.SENTRY_DSN })
  }
}

@Module({
  providers: [SentryBootstrapInitializer, ObservabilityShutdownService],
})
export class ObservabilityModule {}
