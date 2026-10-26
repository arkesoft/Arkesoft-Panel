// @arkesoft/errors — tel sözleşmesi (ROADMAP v0.0.4, T-002/ST-3b, architect K4/K-A2)
//
// `appErrorBodySchema`/`AppErrorBody` HTTP yanıtına yazılan hata gövdesinin TEK
// tanımıdır. v0.0.6 tRPC istemci factory'si ve v0.0.22 public API sözleşme
// snapshot'ı bu şemayı doğrudan tüketecek — burada yapılacak bir alan değişikliği
// public API sözleşmesini değiştirir (CLAUDE.md §9).
//
// VARSAYIM(A-V24, architect K4): `message` alanı v0.0.18'e (i18n kataloğu) kadar
// HAM METİN değil, `userMessageKey`'İ taşır. Böylece hem CLAUDE.md §4/§17'nin
// "kullanıcıya dönük metni kodda sabit yazma" yasağı ihlal edilmez hem de bu tel
// sözleşmesi i18n çözümlemesi eklendiğinde DEĞİŞMEZ.
//
// VARSAYIM(A-V25, architect K4): `details` serileşen TEK alandır. `AppError.context`
// iç bilgi taşır (PII olabilir, yalnızca log'a gider) ve ASLA bu gövdeye yazılmaz —
// bu yüzden `toErrorBody` imzasında `error.context` okunmaz, kullanılmaz.

import { z } from 'zod'

import type { AppError } from './app-error.js'

/**
 * HTTP/tRPC hata gövdesinin tel şeması. Tam olarak dört alan — CLAUDE.md §4 ve
 * ROADMAP v0.0.4 K4'ün uzlaştırdığı sözleşme. Daha fazla/az alan public API
 * sözleşmesini (v0.0.22 snapshot) kırar.
 */
export const appErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
  requestId: z.string(),
})

export type AppErrorBody = z.infer<typeof appErrorBodySchema>

/**
 * `AppError`'ı tel sözleşmesine çevirir.
 *
 * - `message` → `error.userMessageKey` (A-V24 — i18n anahtarı, ham metin değil).
 * - `details` → verilmezse `{}` (AC8 sızdırmazlığı: her zaman aynı şekil).
 * - `error.context` → ASLA bu çıktıya girmez (A-V25); yalnızca logger okur.
 */
export function toErrorBody(
  error: AppError,
  requestId: string,
  details?: Record<string, unknown>,
): AppErrorBody {
  return {
    code: error.code,
    message: error.userMessageKey,
    details: details ?? {},
    requestId,
  }
}
