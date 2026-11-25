// @arkesoft/api — Nest LoggerService → pino köprüsü (ROADMAP v0.0.4, T-002/ST-2,
// architect K-A7)
//
// `NestFactory.create(AppModule, { bufferLogs: true })` + `app.useLogger(...)`
// ile Nest'in kendi açılış logları ve DI/guard/interceptor katmanının
// `Logger` enjeksiyonu da pino'ya gider — süreçte `console.*` kalmaz
// (CLAUDE.md §4/§10).

import { Inject, Injectable } from '@nestjs/common'
import type { LoggerService } from '@nestjs/common'
import type { Logger } from 'pino'

import { ROOT_LOGGER } from './logging.tokens.js'

@Injectable()
export class ArkesoftNestLogger implements LoggerService {
  constructor(@Inject(ROOT_LOGGER) private readonly logger: Logger) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(this.buildMeta(optionalParams), this.toMessage(message))
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error(this.buildMeta(optionalParams), this.toMessage(message))
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn(this.buildMeta(optionalParams), this.toMessage(message))
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(this.buildMeta(optionalParams), this.toMessage(message))
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.trace(this.buildMeta(optionalParams), this.toMessage(message))
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.fatal(this.buildMeta(optionalParams), this.toMessage(message))
  }

  /** Nest'in `message` parametresi her zaman dize değildir (nesne de gelebilir). */
  private toMessage(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message)
  }

  /**
   * Nest'in ek parametrelerini (çoğunlukla `context` dizesi) pino alanına
   * çevirir.
   *
   * ⚠⚠ BORÇ `:4514` KAPANDI (ROADMAP v0.0.17, T-028/S4): bu alan eskiden
   * `context` adını taşıyordu — `AppError.context` da (`app-exception.filter.ts`'in
   * loglama dalı) AYNI anahtarı FARKLI bir anlamla (domain hatasının PII
   * içermeyen bağlamı) kullanıyordu, yani TEK log alanı İKİ anlam taşıyordu.
   * Nest tarafı artık `nestParams` — iki üretici artık ÇARPIŞMIYOR.
   */
  private buildMeta(optionalParams: readonly unknown[]): Record<string, unknown> {
    return optionalParams.length > 0 ? { nestParams: optionalParams } : {}
  }
}
