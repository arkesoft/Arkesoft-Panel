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
//
// PO RİSKİ 8 (ROADMAP v0.0.5, T-006/S3): `AppError.httpHeaders` (Retry-After
// taşıyıcısı, AC7) AYNI gerekçeyle bu gövdeye YAZILMAZ — `toErrorBody`
// imzasında `error.httpHeaders` da OKUNMAZ. Mekanik garanti: dört alanlık
// dönüş nesnesi (`code`/`message`/`details`/`requestId`) ELLE yazılır,
// `error`'dan spread edilmez — `httpHeaders` eklenecek bir gün BURADA
// unutulup sızsa bile bu fonksiyon onu OKUMADIĞI için sızamaz.
//
// ROADMAP v0.0.6, T-007/ST-1, architect K3 (ADR-0010 §1/§2): `details`'in TEK
// kaynağı artık `error.publicDetails`'tir — harici üçüncü parametre
// KALDIRILDI. "Bu hatanın tel üstündeki detayı nedir" bilgisi `apps/api`'deki
// merkezi bir `instanceof` zincirinde değil, hatanın KENDİSİNDE durur; yeni
// bir hata sınıfı artık bu dosyayı DÜZENLEMEZ. Fail-closed: `isAppError`'ın
// yapısal yedek yolundan `true` dönen bir nesnede `publicDetails` getter'ı
// OLMAYABİLİR (paket çoğalması) — okunan değer şema ile doğrulanır,
// doğrulama başarısız olursa `{}` kullanılır (körü körüne yazılmaz).

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
 * `appErrorShapeSchema`'nın tel-gövdesi karşılığı — `error.publicDetails`
 * okunurken fail-closed doğrulama için kullanılır. `appErrorShapeSchema`
 * (app-error.ts) BÜYÜTÜLMEZ; bu, ondan BAĞIMSIZ, yalnızca `details` alanının
 * şeklini doğrulayan ayrı bir şemadır.
 */
const publicDetailsShapeSchema = z.record(z.string(), z.unknown())

/**
 * `AppError`'ı tel sözleşmesine çevirir.
 *
 * - `message` → `error.userMessageKey` (A-V24 — i18n anahtarı, ham metin değil).
 * - `details` → YALNIZCA `error.publicDetails`'ten gelir (ADR-0010 §1, K3).
 *   İkinci bir doğruluk kaynağı (harici parametre) YOK.
 * - **Fail-closed (paket çoğalması):** `isAppError`'ın yapısal yedek yolundan
 *   `true` dönen bir nesnede `publicDetails` getter'ı OLMAYABİLİR. Okunan
 *   değer `publicDetailsShapeSchema` ile doğrulanır; doğrulama BAŞARISIZ
 *   olursa `{}` kullanılır — körü körüne yazmak YASAK.
 * - `error.context` → ASLA bu çıktıya girmez (A-V25); yalnızca logger okur.
 */
export function toErrorBody(error: AppError, requestId: string): AppErrorBody {
  const parsedDetails = publicDetailsShapeSchema.safeParse(error.publicDetails)

  return {
    code: error.code,
    message: error.userMessageKey,
    details: parsedDetails.success ? parsedDetails.data : {},
    requestId,
  }
}

/**
 * Çerçeve kaynaklı (platformun `AppError` hiyerarşisinden GELMEYEN) hatalar
 * için jenerik tel gövdesi fabrikası (ADR-0010 §2, ROADMAP v0.0.6 T-007/ST-1).
 * `apps/api`'nin HTTP yolu VE v0.0.6'nın `packages/trpc`'si AYNI fonksiyonu
 * çağırır — literal kopyası yok; "iki yüzey birebir aynı gövde" şartı test
 * değil YAPI ile sağlanır (AC10).
 */
export function genericTransportErrorBody(requestId: string): AppErrorBody {
  return {
    code: 'HTTP_EXCEPTION',
    message: 'errors.http.generic',
    details: {},
    requestId,
  }
}

/**
 * Sınıflandırılamayan (bilinmeyen) her hata için jenerik tel gövdesi
 * fabrikası (ADR-0010 §2, ROADMAP v0.0.6 T-007/ST-1). Ham mesaj/yığın izi bu
 * gövdeye ASLA girmez — yalnızca çağıranın `logContext`'ine gider.
 */
export function unknownErrorBody(requestId: string): AppErrorBody {
  return {
    code: 'INTERNAL_ERROR',
    message: 'errors.internal.unknown',
    details: {},
    requestId,
  }
}
