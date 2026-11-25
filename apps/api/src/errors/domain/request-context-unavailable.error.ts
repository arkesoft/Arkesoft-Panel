// @arkesoft/api — REQUEST_CONTEXT_UNAVAILABLE (ROADMAP v0.0.4, T-002/ST-4, architect K-A5)
//
// PROGRAMLAMA HATASI — kullanıcı girdisinin sonucu DEĞİL. İki durumda fırlar:
// (1) `getRequestContext()` ALS deposu boşken çağrılmış (middleware zinciri
//     dışında bir kod yolu — olmaması gerekir), (2) `getTenantContext()`
//     tenant `'resolved'` DEĞİLKEN çağrılmış. İkincisi R4 telafisinin kalbi:
//     RLS yokluğunda (v0.0.13'e kadar) "yanlışlıkla `undefined`/uydurma
//     tenantId ile sorgu" sınıfını YAPISAL olarak imkansız kılan mekanizma
//     budur — bir geliştirici `TenantGuard`'ı atlayıp doğrudan `getTenantContext()`
//     çağırırsa sessizce `undefined` almaz, 500 alır ve hata hemen görünür olur.
//
// `logLevel: 'error'` (ROADMAP v0.0.17, T-028/S9, R-PO3 devrinin bulduğu
// davranış kayması — `architect`/S8 bu sınıfı DEĞERLENDİRMEMİŞTİ): bu dosyanın
// KENDİ dosya başı yorumu bunu zaten "PROGRAMLAMA HATASI" diye adlandırıyor —
// varsayılan `'warn'`ın "beklenen ama anormal" tanımına hiç UYMUYOR, CLAUDE.md
// §4'ün "müdahale gerekir" (`error`) tanımının birebir karşılığı.

import { AppError, ERROR_MESSAGE_KEYS } from '@arkesoft/errors'

export class RequestContextUnavailableError extends AppError {
  constructor(context?: Record<string, unknown>) {
    super({
      code: 'REQUEST_CONTEXT_UNAVAILABLE',
      httpStatus: 500,
      userMessageKey: ERROR_MESSAGE_KEYS.REQUEST_CONTEXT_UNAVAILABLE,
      // `exactOptionalPropertyTypes`: bkz. tenant-not-found.error.ts'teki aynı yorum.
      ...(context !== undefined ? { context } : {}),
      isRetryable: false,
      logLevel: 'error',
    })
  }
}
