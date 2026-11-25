// @arkesoft/api — traceId kaynağı: Katman 1 korelasyon (ROADMAP v0.0.17, T-028/S4,
// architect K-A28-1)
//
// ⚠⚠ Bu dosya SADECE Katman 1'in (koşulsuz, ağsız) traceId kaynağını taşır.
// `observability/` dizinindeki DİĞER dosyalar (Katman 2 — `NodeSDK` kurulumu,
// Sentry, span attribute, kapanış sırası) S5/S6'nın; bu alt görev onlara
// DOKUNMAZ.
//
// ⭐ KAYNAK SIRASI (bağlayıcı, K-A28-1):
//   1. OTel AKTİF SPAN bağlamı — GEÇERLİYSE (`isSpanContextValid`) kullanılır.
//      Katman 2 (S6) açıldığında bu dal devreye girer ve log kaydındaki
//      `traceId`, OTel'in ürettiği trace id'yle BİREBİR aynı olur — korelasyon
//      tek bir kimlikte birleşir.
//   2. Aktif span YOKSA (Katman 2 kapalı veya istek OTel tarafından
//      enstrümante edilmemiş) → YEREL üretim: 16 bayt rastgele hex (32 karakter),
//      `request-id.ts`'in `generateRequestId()`'ı ile AYNI desenin (node:crypto,
//      yeni bağımlılık yok) trace kimliği karşılığı — OTel'in trace id biçimiyle
//      (32 hex karakter / 16 bayt) UYUMLU, böylece iki kaynak aynı alanı paylaşabilir.
//
// ⚠⚠ GELEN `traceparent` BAŞLIĞI KABUL EDİLMEZ (bağlayıcı). Üç ölçülmüş gerekçe:
//   (1) güvenilir ingress YOK (`AUTH_TRUSTED_PROXY_COUNT` varsayılanı 0,
//       `config/api-env.ts`);
//   (2) kabul etmek HER istemciye log korelasyonumuzu ZEHİRLEME yetkisi verir
//       (istemci kendi seçtiği bir traceId'yi dayatabilir);
//   (3) Katman 2 açıkken W3C `traceparent` sürekliliğini `instrumentation-http`
//       KENDİ standart kurallarıyla zaten sağlar — bu dosyanın tekrar etmesine
//       gerek yok.
// Yeniden açma noktası: v0.18.0 (güvenilir ingress geldiğinde).
//
// ⭐ Bu modülün TEK dışa açık yüzeyi `getCurrentTraceId()` — üretici aileler
// (S4/S6/S7/S9) ve tüketiciler (S8'in `app-exception.filter.ts`'i) BURADAN
// import eder; traceId üretim mantığının İKİNCİ bir kopyası açılmaz.

import { randomBytes } from 'node:crypto'

import { context, trace } from '@opentelemetry/api'

/** OTel trace id biçimiyle uyumlu: 16 bayt → 32 hex karakter. */
const LOCAL_TRACE_ID_BYTE_LENGTH = 16

/**
 * Aktif OTel span bağlamı yoksa (veya geçersizse) kullanılan yerel üretim.
 * `request-id.ts`'in `generateRequestId()`'ı ile AYNI araçla (node:crypto),
 * ama OTel'in beklediği ham hex biçiminde (önek YOK — `req_` öneki `requestId`
 * alanına özgüdür, `traceId` OTel'in kendi biçimini taşır).
 */
function generateLocalTraceId(): string {
  return randomBytes(LOCAL_TRACE_ID_BYTE_LENGTH).toString('hex')
}

/**
 * Bu isteğin `traceId`'sini döner — ASLA `undefined`/boş dönmez.
 *
 * Katman 2 (S6'nın `NodeSDK` kurulumu) aktifse ve bu çağrı bir aktif span'in
 * içinde yapılıyorsa, dönen değer OTel'in ürettiği GERÇEK trace id'dir — log
 * kaydı ve trace backend'i (varsa) AYNI kimliği taşır. Katman 2 kapalıyken
 * (veya aktif span yokken) her çağrı kendi yerel kimliğini üretir; bu durumda
 * AYNI isteğin iki farklı log satırı FARKLI `traceId` taşıyabilir — bu,
 * Katman 1'in bilinen sınırıdır (K-A28-1), Katman 2 bunu kapatır.
 */
export function getCurrentTraceId(): string {
  const activeSpanContext = trace.getSpanContext(context.active())

  if (activeSpanContext !== undefined && trace.isSpanContextValid(activeSpanContext)) {
    return activeSpanContext.traceId
  }

  return generateLocalTraceId()
}
