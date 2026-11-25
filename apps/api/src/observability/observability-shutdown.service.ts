// @arkesoft/api — Nest kapanış kancası: OTel → Sentry sırası (ROADMAP v0.0.17,
// T-028/S6, architect K-A28-3)
//
// ⚠⚠ KAPANIŞ SIRASI YAPIDAN GELİR, KAYIT SIRASINDAN DEĞİL (K-A28-3,
// bağlayıcı — R3'ün cevabı). OTel/Sentry kapanışı `process.on('SIGTERM')`'e
// EKLENMEZ (bu, hangi `process.on` dinleyicisinin önce koştuğuna bağlı bir
// YARIŞ olurdu). Yerine Nest'in yaşam döngüsü kullanılır:
//
//   SIGTERM
//    → (Nest) HTTP sunucu kapanır                [main.ts: `enableShutdownHooks`]
//    → (Nest) onModuleDestroy                    : Prisma `$disconnect` ·
//                                                   `QueueLifecycleService`
//    → (Nest) onApplicationShutdown               : BU SERVİS
//                                                     1) `shutdownObservability()` (OTel)
//                                                     2) `shutdownSentry()`   (Sentry)
//    → event loop boşalır → exit 0
//
// Nest, `onApplicationShutdown` kancalarını `onModuleDestroy` kancalarından
// SONRA koşturur (`@nestjs/core/nest-application-context.js`'in
// `runShutdownSequence`'ı: `callDestroyHook()` → ... → `callShutdownHook()`)
// — bu sıra Nest'in İÇ YAPISINDAN gelir, bu servisin KAYIT SIRASINDAN değil.
// `main.ts`'in watchdog'u (`.unref()` ile event loop'u canlı tutmayan
// `setTimeout`) DEĞİŞMEDİ — ikinci savunma hattı olarak kalır.
//
// ⚠ WORKER AYRI (K1.b bağlayıcı, `main.worker.ts` dosya başı yorumu):
// `main.worker.ts` `enableShutdownHooks()` KULLANMAZ, ama `shutdown()`
// fonksiyonu `await app.close()` çağırır (ADIM 3) — Nest'in `close()`'u
// `onModuleDestroy`/`onApplicationShutdown` kancalarını `enableShutdownHooks`
// çağrılıp çağrılmadığından BAĞIMSIZ olarak koşturur (`nest-application-
// context.js`'in `close()` → `shutdown()` → `runShutdownSequence()` zinciri).
// Bu servis `WorkerModule`'e de kayıtlı olduğu için AYNI sıra worker
// sürecinde de GEÇERLİDİR.
//
// ⚠ ARİTMETİK (K-A28-3'ün worker bütçesi): `WORKER_CLOSE_TIMEOUT_MS` (5000,
// `queue-worker.module.ts`) + `SENTRY_FLUSH_TIMEOUT_MS` (2000,
// `observability/sentry.ts`) + OTel `shutdown()` (soket YOK, senkron bir
// `Promise.all` — gerçek I/O beklemez, `sdk.js:shutdown()` yalnızca
// kurulmuş provider'lar varsa onları bekler; bu sürümde `_tracerProvider`/
// `_loggerProvider`/`_meterProvider` ÜÇÜ DE `undefined` kalır çünkü üçü de
// boş dizi/okuyucu ile verildi — `shutdownObservability()` pratikte ANINDA
// döner) = **en çok ~7000ms** < `WORKER_SHUTDOWN_WATCHDOG_MS` (10_000,
// `queue-worker.module.ts`). Watchdog normal yolda TETİKLENMEZ.

import { Injectable } from '@nestjs/common'
import type { OnApplicationShutdown } from '@nestjs/common'

import { shutdownObservability } from './instrumentation.js'
import { shutdownSentry } from './sentry.js'

@Injectable()
export class ObservabilityShutdownService implements OnApplicationShutdown {
  /**
   * Nest'in `onApplicationShutdown` kancası — `onModuleDestroy`'un TAMAMI
   * koştuktan SONRA, süreç gerçekten kapanmadan ÖNCE çağrılır (dosya başı
   * yorumu). `signal` parametresi bilerek kullanılmaz: bu servisin davranışı
   * hangi sinyalle tetiklendiğine göre DALLANMAZ.
   */
  async onApplicationShutdown(): Promise<void> {
    // ADIM 1 — OTel ÖNCE (K-A28-3'ün bağlayıcı sırası).
    await shutdownObservability()

    // ADIM 2 — Sentry SONRA. Hiç başlatılmadıysa (`SENTRY_DSN` tanımsız)
    // `shutdownSentry()` NO-OP'tur (AC-57).
    await shutdownSentry()
  }
}
