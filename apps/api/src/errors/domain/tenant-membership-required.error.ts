// @arkesoft/api — TENANT_MEMBERSHIP_REQUIRED (ROADMAP v0.0.5, T-006/S6,
// architect "HATA SINIFLARI" bölümü, R2/K4 madde 3)
//
// `AuthGuard`'ın R2 üyelik kontrolünün fırlattığı hata — kimliği
// doğrulanmış (geçerli oturumu olan) bir kullanıcının BU kiracıya üye
// OLMADIĞI durum. `httpStatus: 403` (401 DEĞİL — kullanıcı kim olduğunu
// KANITLADI, sadece bu kaynağa erişimi YOK; K4(3)'ün ayrımı).
//
// `context: {userId, tenantId}` — YALNIZCA loglanır (`toErrorBody` asla
// serileştirmez, CLAUDE.md §4/§7 "kullanıcı varlığı sızdırılmaz" ilkesinin
// burada karşılığı YOK — kiracının varlığı vitrin host'u üzerinden ZATEN
// herkese açık, K4(3) gerekçesi). İki alan da opak cuid, PII DEĞİL.

import { AppError } from '@arkesoft/errors'

export class TenantMembershipRequiredError extends AppError {
  constructor(userId: string, tenantId: string) {
    super({
      code: 'TENANT_MEMBERSHIP_REQUIRED',
      httpStatus: 403,
      userMessageKey: 'errors.auth.tenantMembershipRequired',
      context: { userId, tenantId },
      isRetryable: false,
    })
  }
}
