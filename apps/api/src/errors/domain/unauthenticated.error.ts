// @arkesoft/api — UNAUTHENTICATED (ROADMAP v0.0.5, T-006/S6, architect
// "HATA SINIFLARI" bölümü, AC5)
//
// `AuthGuard`'ın fırlattığı, "bu istekte geçerli bir kullanıcı YOK" sınıfı.
// Üç kök sebebi AYNI cevaba indirir (context BİLEREK `{}` — hangi sebepten
// kaynaklandığı asla tele veya varsayılan log bağlamına YAZILMAZ):
//   (1) oturum çerezi YOK/geçersiz/süresi geçmiş,
//   (2) oturum geçerli ama `user-eligibility.ts` kriterini KARŞILAMIYOR
//       (soft-delete/suspended — hesap durumu İSTEMCİYE SIZDIRILMAZ),
//   (3) `current-user.decorator.ts`'in savunma amaçlı (defense-in-depth)
//       ikinci kontrolü — `AuthGuard` zaten engellemiş olmalı, bu yol normal
//       akışta TETİKLENMEZ.
// `httpStatus: 401` — ROADMAP'in kendi AC'sinin ("doğrulanmamış kullanıcı
// korumalı uca 401 alır") birebir karşılığı.

import { AppError } from '@arkesoft/errors'

export class UnauthenticatedError extends AppError {
  constructor() {
    super({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
      userMessageKey: 'errors.auth.unauthenticated',
      isRetryable: false,
    })
  }
}
