// @arkesoft/errors — AppError taban sınıfı (ROADMAP v0.0.4, T-002/ST-3b, architect K-A2)
//
// CLAUDE.md §4 "Tek hiyerarşi: AppError" kararının somutlaştığı yer. Platformdaki HER
// domain hatası (apps/api/src/errors/domain/**, v0.6.x packages/integrations'ın
// IntegrationError'ı dahil) bu sınıftan türer. `apps/*` → `packages/*` bağımlılık
// yönü (CLAUDE.md §3) AppError'ın bir uygulama içinde doğmasını yapısal olarak
// engeller — bu yüzden ayrı bir iç paket (architect K-A2, Kullanıcı Onayı #4).
//
// Beş alan asgari yüzeydir (architect K2):
//   code           — makine tarafından okunur, kararlı, SCREAMING_SNAKE_CASE
//   httpStatus     — HTTP eşlemesi
//   userMessageKey — kullanıcıya gösterilecek i18n anahtarı (ham metin DEĞİL;
//                    bkz. error-body.ts → toErrorBody, A-V24)
//   context        — yalnızca LOGLANIR, tel sözleşmesine ASLA serileşmez (bkz.
//                    error-body.ts, A-V25); PII ve sır içermez (CLAUDE.md §4/§10)
//   isRetryable    — kuyruk (BullMQ, v0.0.11) bu bayrağa göre retry/DLQ kararı verir
//
// VARSAYIM(A-V27 teyidi, architect K-A2): günlük seviyesi eşlemesi için ayrı bir
// alan BİLİNÇLİ OLARAK burada YOK (grep probu: bu dosyada o alanın adı hiç
// geçmez). v0.0.17'de OpenTelemetry/Sentry eşlemesiyle birlikte additive
// eklenecek — bugün eklemek hangi seviyeye eşleneceğini henüz tasarlanmamışken
// dayatır.

import { z } from 'zod'

/**
 * `AppError` yapıcısına verilen tek seçenek nesnesi. CLAUDE.md §4'teki
 * `super({ code, httpStatus, userMessageKey, context })` deseninin tip karşılığı.
 */
export interface AppErrorOptions {
  /** Makine tarafından okunan, kararlı hata kodu. Örn. `TENANT_NOT_FOUND`. */
  readonly code: string
  /** HTTP durum kodu eşlemesi. */
  readonly httpStatus: number
  /** Kullanıcıya gösterilecek metnin i18n anahtarı (ham metin değil, A-V24). */
  readonly userMessageKey: string
  /**
   * Yalnızca loglanacak ek bağlam. PII/sır İÇERMEZ. Tel sözleşmesine
   * (bkz. error-body.ts → toErrorBody) ASLA yazılmaz — A-V25.
   */
  readonly context?: Record<string, unknown>
  /** Kuyruk bu bayrağa göre yeniden deneme/DLQ kararı verir. Varsayılan `false`. */
  readonly isRetryable?: boolean
  /** Yakalanan orijinal hata — zincirleme için `Error.cause`'a yazılır. */
  readonly cause?: unknown
}

/**
 * Platformun tek hata hiyerarşisinin tabanı (CLAUDE.md §4). Somut her domain
 * hatası (`apps/api/src/errors/domain/**`, v0.6.x `IntegrationError`) bu sınıftan
 * türer.
 *
 * `abstract` olması bilinçli: çağıran kod asla çıplak `AppError` fırlatamaz, her
 * zaman anlamlı bir alt sınıf seçmek zorunda kalır.
 */
export abstract class AppError extends Error {
  readonly code: string
  readonly httpStatus: number
  readonly userMessageKey: string
  readonly context: Record<string, unknown>
  readonly isRetryable: boolean

  protected constructor(options: AppErrorOptions) {
    super(
      options.userMessageKey,
      options.cause === undefined ? undefined : { cause: options.cause },
    )
    this.name = this.constructor.name
    this.code = options.code
    this.httpStatus = options.httpStatus
    this.userMessageKey = options.userMessageKey
    this.context = options.context ?? {}
    this.isRetryable = options.isRetryable ?? false

    // Node/V8'de yığın izini bu sınıftan (ve üstündeki çağrı çerçevesinden)
    // başlatır. Tarayıcı hedefi yok (apps/api yalnızca Node'da çalışır) ama
    // çağrı öncesi varlık kontrolüyle her ortamda güvenli.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

/**
 * `AppError`'ın yapısal karşılığı — paket çoğalması (iki bağımsız kopya
 * `@arkesoft/errors` yüklenmesi, örn. hatalı workspace linki) durumunda bile
 * `instanceof` çalışmayabilir. Bu şema o yedek yoldur.
 */
const appErrorShapeSchema = z.object({
  code: z.string(),
  httpStatus: z.number(),
  userMessageKey: z.string(),
})

/**
 * Bir değerin `AppError` olup olmadığını denetler. Önce `instanceof` dener,
 * başarısız olursa `code`/`httpStatus`/`userMessageKey` alanlarının varlığını ve
 * tipini yapısal olarak doğrular — paket çoğalmasına dayanıklı yedek yol.
 */
export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) {
    return true
  }

  return appErrorShapeSchema.safeParse(error).success
}
