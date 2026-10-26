// @arkesoft/api — TENANT_RESOLUTION_FAILED (ROADMAP v0.0.4, T-002/ST-4, architect K-A5)
//
// `TenantResolution.kind === 'failed'` durumunun karşılığı: DB erişilemezken
// (bağlantı hatası vb.) tenant çözümü BEKLENMEDİK şekilde başarısız olur —
// bu, "tenant yok" (TenantNotFoundError, 404) ile KARIŞTIRILMAZ. 500 +
// `isRetryable: true`: kuyruk/çağıran bunu yeniden deneyebilir bir durum
// olarak ele alır (CLAUDE.md §4).

import { AppError } from '@arkesoft/errors'

export class TenantResolutionFailedError extends AppError {
  constructor(cause: unknown) {
    super({
      code: 'TENANT_RESOLUTION_FAILED',
      httpStatus: 500,
      userMessageKey: 'errors.tenant.resolutionFailed',
      isRetryable: true,
      cause,
    })
  }
}
