// @arkesoft/api — TWO_FACTOR_SETUP_REQUIRED (ROADMAP v0.0.15, T-016/S7,
// architect md 2 — "kendini kilitlememe" değişmezinin AYAK (a) yarısı,
// ADR-0018)
//
// Owner, kiracının 2FA zorunluluğunu KAPALIDAN AÇIĞA çevirmeye çalışıyor
// (`tenant.updateSecurityPolicy({ requireTwoFactorForOwner: true })`) AMA
// KENDİSİ henüz 2FA kurmamış. Fırlatılmazsa çağıran kendini kiracıdan
// kilitlerdi — `AuthGuard`'ın zorlama kapısı (`case 'resolved'`, S6) bu
// ayarı AÇIK gördüğü anda 2FA'sız owner'ı 403 ile keser; bu hata o duruma
// düşmeden ÖNCE reddeder.
//
// `409` (çakışma) seçildi, `403` DEĞİL: istek biçimsel olarak geçerli ve
// aktör `security:write` iznine SAHİP; reddin sebebi aktörün KENDİ
// GÜVENLİK DURUMUdur — bir yetki reddi değil (`OwnerMembershipProtectedError`'ın
// AYNI gerekçesi, `already-member.error.ts`/`owner-membership-protected.error.ts`
// emsali).
//
// ⚠⚠ YALNIZCA ÇAĞIRAN denetlenir — `context` PII/başka kullanıcı bilgisi
// TAŞIMAZ (kiracının BAŞKA owner'larının 2FA durumu bu hatanın KONUSU
// DEĞİLDİR; architect gerekçesi port dosyasında yazılı).

import { AppError } from '@arkesoft/errors'

export class TwoFactorSetupRequiredError extends AppError {
  constructor() {
    super({
      code: 'TWO_FACTOR_SETUP_REQUIRED',
      httpStatus: 409,
      userMessageKey: 'errors.twoFactor.setupRequiredBeforeEnforcement',
      isRetryable: false,
    })
  }
}
