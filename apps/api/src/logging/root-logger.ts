// @arkesoft/api — pino kök logger fabrikası (ROADMAP v0.0.4, T-002/ST-2,
// architect K-A7)
//
// pino ELLE bağlanır; `nestjs-pino`/`pino-http` EKLENMEZ (K-A7 gerekçesi):
// (a) bu sarmalayıcılar kendi transport/worker iş parçacığını açar →
// AC11'in "SIGTERM sonrası exit 0, açık handle yok" garantisini zorlaştırır
// ve kapanışta log kaybı riski doğurur; (b) bir bağımlılık daha.
//
// TRANSPORT/WORKER BİLİNÇLİ OLARAK YOK (`pino-pretty` dahil): varsayılan
// senkron `process.stdout` hedefi kayıpsız kapanış sağlar.
//
// `stream` parametresi ZORUNLU DEĞİL ama AC9/AC10'un test edilebilirliği buna
// dayanır — test bellek `Writable`'ı enjekte eder, NDJSON log satırlarını
// parse eder; `level`/`stream` imzası ST-4/ST-6/ST-7 tarafından TAŞINACAK,
// değiştirilmeyecek (SONRAKİ AJAN NOTU).

import { PINO_REDACT_PATHS } from '@arkesoft/errors'
import type { DestinationStream, Logger } from 'pino'
import { pino, stdTimeFunctions } from 'pino'

import { resolvePlatformVersion } from '../config/platform-version.js'

export type CreateRootLoggerOptions = {
  /** pino log seviyesi (`apiEnvSchema.LOG_LEVEL`). */
  readonly level: string
  /**
   * Log hedefi. Varsayılan `process.stdout`. Testler bellek `Writable`'ı
   * geçerek NDJSON çıktısını parse edebilir (AC9/AC10).
   */
  readonly stream?: DestinationStream
}

/**
 * CLAUDE.md §4 log formatını (yapılandırılmış JSON, `service`, `version`,
 * ISO zaman damgası, seviye adı, redaction) birebir karşılayan kök pino
 * örneğini kurar.
 */
export function createRootLogger(options: CreateRootLoggerOptions): Logger {
  const { level, stream } = options

  return pino(
    {
      level,
      base: { service: 'api', version: resolvePlatformVersion() },
      timestamp: stdTimeFunctions.isoTime,
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      redact: {
        paths: [...PINO_REDACT_PATHS],
        censor: '[redacted]',
      },
    },
    stream ?? process.stdout,
  )
}
