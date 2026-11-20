// @arkesoft/api — PLATFORM_ADMIN_REQUIRED (ROADMAP v0.0.20, T-021/S7,
// ADR-0023 Karar 1/2)
//
// `platformAdminProcedure`'ün (`@arkesoft/trpc`) iki adımlı kapısının İLK
// adımı: aktörün `platform_admin` kaydı YOK. Port (`PlatformAdminReadPort.
// requirePlatformAdmin`, TOTAL) bu sınıfı KENDİSİ fırlatır — middleware bu
// dalı KENDİ kodlamaz (`membershipRead.requireRole`'ün `TenantMembershipRequiredError`
// ile AYNI deseni).
//
// `httpStatus: 403` (401 DEĞİL) — kimlik `protectedProcedure`'de ZATEN
// kurulmuştur, eksik olan YETKİdir. ⚠ VARLIK ORACLE'I DEĞİL (CLAUDE.md §7
// madde 12): bu hata yalnızca ÇAĞIRANIN KENDİSİ hakkındadır — başka bir
// kullanıcının platform yöneticisi olup olmadığını SIZDIRMAZ.
//
// `context` YALNIZCA loglanır — `userId` opak cuid, PII DEĞİL
// (`TenantMembershipRequiredError`'ın AYNI gerekçesi).
//
// ⚠ `userId` OPSİYONEL: bu sınıfın TEK gerçek çağrı yeri
// `PlatformAdminReadPort.requirePlatformAdmin` (TOTAL) adaptörüdür ve o
// yerde `userId` HER ZAMAN verilir. `TrpcErrorsPortAdapter.
// platformAdminRequired()` (sözleşme tamlığı için var, ÜRETİMDE ÇAĞRILMAZ —
// `platform-admin-read.port.ts` dosya başı yorumu) sıfır argümanla
// çağırabilsin diye parametre `?` yapıldı — `TwoFactorRequiredError`'ın
// AYNI gerekçesi.

import { AppError, ERROR_MESSAGE_KEYS } from '@arkesoft/errors'

export class PlatformAdminRequiredError extends AppError {
  constructor(userId?: string) {
    super({
      code: 'PLATFORM_ADMIN_REQUIRED',
      httpStatus: 403,
      userMessageKey: ERROR_MESSAGE_KEYS.PLATFORM_ADMIN_REQUIRED,
      context: { userId },
      isRetryable: false,
    })
  }
}
