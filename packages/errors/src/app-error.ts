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
//
// `httpHeaders` (ROADMAP v0.0.5, T-006/S3, architect "HATA SINIFLARI" bölümü):
// ADDITIVE altıncı alan. Gerekçe: `RateLimitExceededError`'ın `Retry-After`
// başlığını tele taşıması gerekiyor (AC7) ama bu `instanceof` ZİNCİRİ ile
// (ör. `if (error instanceof RateLimitExceededError) { ... }`
// `mapErrorToResponse`'ta) YAPILMAYACAK — architect bunu açıkça yasakladı,
// v0.0.6'nın borcunu büyütmemek için (alt sınıfa özgü dallanma, CLAUDE.md
// §10.12'nin "çekirdek koda sağlayıcıya özgü dallanma yazılmaz" ruhunun
// hata sınıfları için genişletilmiş hâli). Jenerik, adaptör-nötr:
// `mapErrorToResponse` bunu OLDUĞU GİBİ taşır, `AppExceptionFilter`
// `httpAdapter.setHeader()` ile yazar (`x-request-id` deseniyle aynı).
// `context` gibi BU ALAN DA `toErrorBody` çıktısına GİRMEZ — `error-body.ts`
// yalnızca dört sabit alanı (`code`/`message`/`details`/`requestId`) üretir,
// `httpHeaders`'ı hiç OKUMAZ (PO riski 8'in mekanik garantisi: yeni bir alan
// hiçbir zaman tele sızamaz çünkü `toErrorBody`'nin imzası `error.httpHeaders`
// erişimi İÇERMİYOR).

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
  /**
   * HTTP yanıtına yazılacak ek başlıklar (ör. `Retry-After`). ADDITIVE,
   * jenerik — `AppExceptionFilter` bunu adaptör-nötr `setHeader()` ile yazar.
   * **`toErrorBody` çıktısına GİRMEZ** (`context` gibi yalnızca taşıyıcı
   * katmanın işi); sır İÇERMEMELİDİR, çünkü HTTP yanıt başlığı olarak
   * doğrudan istemciye gider (CLAUDE.md §4/§10 — PO riski 8).
   */
  readonly httpHeaders?: Readonly<Record<string, string>>
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
  /**
   * `?` DEĞİL — açıkça `| undefined` birleşimi. `exactOptionalPropertyTypes`
   * altında `options.httpHeaders`'ın okuma tipi zaten `T | undefined`'dır
   * (opsiyonel alan erişimi); alan `?` ile tanımlansaydı bu değeri doğrudan
   * atamak "undefined'ı opsiyonel-ama-undefined-olmayan bir alana atama"
   * hatası verirdi (bkz. `context`/`isRetryable`'ın `??` ile varsayılan
   * ATADIĞI desen — burada varsayılan YOK, `httpHeaders` gerçekten
   * tanımsız KALABİLİR, bu yüzden aynı deseni TEKRARLAMADIK).
   */
  readonly httpHeaders: Readonly<Record<string, string>> | undefined

  /**
   * Tele yazılacak (public) ek detay — ROADMAP v0.0.6, T-007/ST-1, architect K3
   * (ADR-0010 §1). VARSAYILAN BOŞ NESNE: bir alt sınıf tele bir şey taşımak
   * istiyorsa bunu AÇIKÇA `override` ETMEK ZORUNDADIR — `noImplicitOverride:
   * true` olduğu için `override` anahtar sözcüğü eksikse DERLEME HATASI verir
   * (yazım hatasına karşı mekanik koruma, ADR-0008'in "fail-closed" dersinin
   * hata alanındaki karşılığı).
   *
   * **Yön ayrımı — İKİSİ DE BAĞLAYICI, security gate kontrol listesine girer
   * (architect riski 9):**
   * - `context` (yukarıda) → YALNIZCA LOGLANIR. PII içerebilir. Tel
   *   sözleşmesine (`error-body.ts` → `toErrorBody`) ASLA serileşmez.
   * - `publicDetails` (burada) → YALNIZCA TELE YAZILIR (`toErrorBody` →
   *   `details`). PII/sır İÇEREMEZ — istemcinin doğrudan göreceği veridir.
   *
   * Bir alt sınıf hangi bilgiyi hangi alana koyacağını AÇIKÇA seçmek
   * zorundadır; PII'yi `publicDetails`'e koymak bilinçli bir yanlış kullanım
   * olur ve mekanizma bunu tek başına engelleyemez (ADR-0010 "olumsuz ve
   * kabul edilen maliyetler").
   */
  get publicDetails(): Readonly<Record<string, unknown>> {
    return {}
  }

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
    this.httpHeaders = options.httpHeaders

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
