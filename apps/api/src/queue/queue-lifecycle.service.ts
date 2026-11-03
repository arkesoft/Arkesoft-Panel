// @arkesoft/api — kuyruk kapanış sözleşmesi (ROADMAP v0.0.11, T-013/S5,
// architect K1.b) — AC9'un ölçeceği zincirin ÜRETİCİ tarafı
//
// ⚠⚠ KENDİ BAĞLANTISINI KENDİSİ KAPATIR — `RedisService`'in `quit()`'ine
// GÜVENİLMEZ (T-013/S3'ün bağlayıcı notu). Gerekçe ölçülmüş: `RedisService`
// `REDIS_CLIENT`'ı (`'health'` profili) kapatır, KUYRUĞUNKİNİ (`'queue'`
// profili, AYRI örnek) kapatmaz. Bu ikisini karıştırmak AC9'u YANLIŞ YEŞİLE
// düşürür: ölçüm `CLIENT LIST`'te 0 bağlantı GÖRMEZ, süreç açık handle ile
// kalır ve `exit 0` garantisi sessizce kaybolur.
//
// SIRA (architect K1.b):
//   1. her iş türünün `queue.close()` + `dlqQueue.close()`
//   2. `connection.quit()` → `QUEUE_QUIT_TIMEOUT_MS` içinde dönmezse
//      `connection.disconnect()`
//
// `withTimeout` HER adımda: `redis.service.ts:36-55`'in AYNI deseni, AYNI
// gerekçesi — AC9/AC11'in "SIGTERM sonrası açık handle kalmaz" garantisi
// için sınırsız beklemek `exit 0`'ı riske atar. Bir `Queue.close()` Redis
// erişilemezken dönmeyebilir; o durumda bağlantıyı sert kapatmak, süreci
// asılı bırakmaktan iyidir.
//
// ⚠ HATA YUTULMAZ (CLAUDE.md §10 md 16): her başarısız adım `warn` ile
// loglanır ve zincir DEVAM EDER. Burada yukarı fırlatmak Nest'in kalan
// `onModuleDestroy` kancalarını (Prisma `$disconnect` dahil) ATLATIRDI —
// yani bir açık handle'ı başkasıyla takas etmek olurdu.
//
// ⚠ `Queue.close()` BİZİM verdiğimiz `ioredis` örneğini KAPATMAZ (BullMQ
// yalnızca KENDİ kurduğu bağlantıları kapatır) — bağlantıyı bu yüzden
// AÇIKÇA kendimiz `quit()` ediyoruz.

import { Inject, Injectable } from '@nestjs/common'
import type { OnModuleDestroy } from '@nestjs/common'
import type { Redis } from 'ioredis'

import { describeErrorCause } from '../errors/describe-error-cause.js'
import { withTimeout } from '../health/with-timeout.js'
import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { QUEUE_CLOSE_TIMEOUT_MS, QUEUE_QUIT_TIMEOUT_MS } from './queue-constants.js'
import { QUEUE_CLOSED_LOG_EVENT, QUEUE_SHUTDOWN_DEGRADED_LOG_EVENT } from './queue-log-events.js'
import type { JobQueueRegistry, QueueLogger } from './queue.service.js'
import { JOB_QUEUE_REGISTRY, QUEUE_CONNECTION } from './queue.tokens.js'

@Injectable()
export class QueueLifecycleService implements OnModuleDestroy {
  constructor(
    @Inject(JOB_QUEUE_REGISTRY) private readonly registry: JobQueueRegistry,
    @Inject(QUEUE_CONNECTION) private readonly connection: Redis,
    @Inject(ROOT_LOGGER) private readonly logger: QueueLogger,
  ) {}

  async onModuleDestroy(): Promise<void> {
    const startedAt = Date.now()

    // ADIM 1 — tüm `Queue` örnekleri. İş türüne özgü dallanma YOK: kayıt
    // defteri geziliyor.
    for (const [jobName, entry] of this.registry) {
      await this.#closeQueue(entry.queue, jobName)
      await this.#closeQueue(entry.dlqQueue, `${jobName} (DLQ)`)
    }

    // ADIM 2 — kuyruğun KENDİ Redis bağlantısı (`'queue'` profili).
    const quitSucceeded = await withTimeout(this.connection.quit(), QUEUE_QUIT_TIMEOUT_MS)
      .then(() => true)
      .catch((error: unknown) => {
        this.logger.warn(describeErrorCause(error), QUEUE_SHUTDOWN_DEGRADED_LOG_EVENT)
        return false
      })

    if (!quitSucceeded) {
      this.connection.disconnect()
    }

    this.logger.info(
      { queueCount: this.registry.size, durationMs: Date.now() - startedAt },
      QUEUE_CLOSED_LOG_EVENT,
    )
  }

  /**
   * Tek bir kuyruğu zaman aşımı bütçesiyle kapatır. Başarısızlık YUTULMAZ:
   * loglanır ve zincir devam eder (dosya başı yorumu).
   */
  async #closeQueue(queue: { close: () => Promise<void> }, label: string): Promise<void> {
    try {
      await withTimeout(queue.close(), QUEUE_CLOSE_TIMEOUT_MS)
    } catch (error: unknown) {
      this.logger.warn(
        { ...describeErrorCause(error), queueLabel: label },
        QUEUE_SHUTDOWN_DEGRADED_LOG_EVENT,
      )
    }
  }
}
