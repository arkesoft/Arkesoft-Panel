// @arkesoft/api — TENANT_NOT_FOUND (ROADMAP v0.0.4, T-002/ST-4, architect K-A4/K4)
//
// Hem "satır yok" hem "soft-delete edilmiş tenant" hem de "üretimde reddedilen
// dev başlığı" bu SINIRI hatayı üretir — CLAUDE.md §4/§12 "var olmayan vs.
// yetkisiz kaynak aynı cevabı döner" kuralının HTTP karşılığı (AC8). Bu yüzden
// yapıcı tenant'a dair HİÇBİR tanımlayıcı bilgi ALMAZ: sızdırılabilecek bir
// `tenantId`/`slug`/`host` parametresi yoktur, yalnızca TEŞHİS amaçlı
// (PII içermeyen) isteğe bağlı bir log bağlamı alınabilir.

import { AppError } from '@arkesoft/errors'

export class TenantNotFoundError extends AppError {
  constructor(context?: Record<string, unknown>) {
    super({
      code: 'TENANT_NOT_FOUND',
      httpStatus: 404,
      userMessageKey: 'errors.tenant.notFound',
      // `exactOptionalPropertyTypes` (CLAUDE.md §4): `context` yalnızca
      // GERÇEKTEN verildiğinde eklenir — `context: undefined` yazmak optional
      // alanı açıkça `undefined`'a eşitler, bu derleme hatası verir.
      ...(context !== undefined ? { context } : {}),
      isRetryable: false,
    })
  }
}
