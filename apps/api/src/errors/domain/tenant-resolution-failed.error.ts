// @arkesoft/api — TENANT_RESOLUTION_FAILED (ROADMAP v0.0.4, T-002/ST-4, architect K-A5)
//
// `TenantResolution.kind === 'failed'` durumunun karşılığı: DB erişilemezken
// (bağlantı hatası vb.) tenant çözümü BEKLENMEDİK şekilde başarısız olur —
// bu, "tenant yok" (TenantNotFoundError, 404) ile KARIŞTIRILMAZ. 500 +
// `isRetryable: true`: kuyruk/çağıran bunu yeniden deneyebilir bir durum
// olarak ele alır (CLAUDE.md §4).
//
// `logLevel: 'error'` (ROADMAP v0.0.17, T-028/S9, R-PO3 devrinin bulduğu
// davranış kayması — ⭐ `architect`/S8'in GÖZDEN KAÇIRDIĞI, ama depo İÇİNDE
// ZATEN YAZILI olan bir sınıflandırma): `rate-limit-store-unavailable.
// error.ts`'in kendi dosya başı yorumu bu sınıfı AÇIKÇA
// `DependencyUnavailableError`/`RateLimitStoreUnavailableError` İLE AYNI
// sınıfa ("geçici bağımlılık arızası") KOYUYOR — ikisi de `logLevel: 'error'`
// taşıyor. Bu satırın yukarıdaki "DB erişilemezken ... BEKLENMEDİK" tanımı da
// zaten "tenant yok" (404, beklenen) ile BİLEREK AYRIŞTIRILMIŞ; `httpStatus:
// 500` olup aynı dosyanın `503` olan akrabalarıyla seviyede TUTARSIZ kalması
// bu devirden ÖNCE `httpStatus >= 500` eşiği sayesinde GÖRÜNMEZDİ — artık
// AÇIKÇA beyan edilmezse varsayılan `'warn'`a düşer ve bu üç kardeş sınıf
// arasında AÇIKLANAMAZ bir seviye farkı doğar.

import { AppError, ERROR_MESSAGE_KEYS } from '@arkesoft/errors'

export class TenantResolutionFailedError extends AppError {
  constructor(cause: unknown) {
    super({
      code: 'TENANT_RESOLUTION_FAILED',
      httpStatus: 500,
      userMessageKey: ERROR_MESSAGE_KEYS.TENANT_RESOLUTION_FAILED,
      isRetryable: true,
      cause,
      logLevel: 'error',
    })
  }
}
