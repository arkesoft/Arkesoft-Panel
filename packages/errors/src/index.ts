// @arkesoft/errors — tek giriş noktası (ROADMAP v0.0.4, T-002/ST-3b, architect K-A2)
//
// Paket manifestinin `exports` alanı yalnızca "." tanımlar; tüketiciler (apps/api,
// packages/db — yalnızca maskEmail, v0.0.6 packages/trpc, v0.6.x packages/integrations)
// HER ZAMAN bu dosyadan import eder, iç dosya yoluna (`./app-error.js` vb.) girmez.

export { AppError, isAppError } from './app-error.js'
export type { AppErrorOptions } from './app-error.js'

export {
  appErrorBodySchema,
  genericTransportErrorBody,
  toErrorBody,
  unknownErrorBody,
} from './error-body.js'
export type { AppErrorBody } from './error-body.js'

export { maskEmail, PINO_REDACT_PATHS } from './redaction.js'
