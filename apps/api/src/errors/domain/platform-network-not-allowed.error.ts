// @arkesoft/api — PLATFORM_NETWORK_NOT_ALLOWED (ROADMAP v0.0.20, T-021/S7,
// ADR-0023 §5)
//
// `PlatformAdminIpGuard`'ın (`../../platform/platform-admin-ip.guard.ts`)
// KENDİ `AppError` sınıfı — `SameOriginGuard` ↔ `CrossSiteRequestRejectedError`
// emsalinin (A-PO21-2) aynı deseni: bir Nest guard kendi hata sınıfını
// taşır, tRPC `TrpcErrorFactoryPort` fabrikasını KULLANMAZ (bu port tRPC
// resolver zincirinin işi, guard HTTP katmanında ÇALIŞIR).
//
// ⚠⚠ `httpStatus: 403` — ADR-0023 §5'in bağlayıcı sınırı: bu kapı BİRİNCİL
// yetkilendirme DEĞİLDİR (oturum + `platform_admin` kaydı + 2FA birincildir),
// IP allowlist'i SAVUNMA DERİNLİĞİNİN ÜÇÜNCÜ katmanıdır.
//
// ⚠⚠ `context`/`publicDetails` ALLOWLIST'İN İÇERİĞİNİ TAŞIMAZ (po A-PO21-2,
// bağlayıcı): `reason` üç kapalı değerden biridir
// (`empty_allowlist`/`unknown_ip`/`ip_not_allowed`) — ne allowlist'in
// elemanları ne çözülen istemci IP'si burada görünür. `publicDetails`
// OVERRIDE EDİLMEZ (`AppError`'ın varsayılan boş nesnesi kalır) — tel
// gövdesi bu üç sebepten HİÇBİRİNİ taşımaz, istemci "ağ reddi" dışında
// hiçbir şey öğrenmez.

import { AppError } from '@arkesoft/errors'

/** Reddin kapalı sebep sözlüğü — yalnızca LOGLANIR, tele hiçbiri sızmaz. */
export type PlatformNetworkDenialReason = 'empty_allowlist' | 'unknown_ip' | 'ip_not_allowed'

export class PlatformNetworkNotAllowedError extends AppError {
  constructor(reason: PlatformNetworkDenialReason) {
    super({
      code: 'PLATFORM_NETWORK_NOT_ALLOWED',
      httpStatus: 403,
      userMessageKey: 'errors.platform.networkNotAllowed',
      context: { reason },
      isRetryable: false,
    })
  }
}
