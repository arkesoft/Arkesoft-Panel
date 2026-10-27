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

import { AppError } from '@arkesoft/errors'

export class RequestContextUnavailableError extends AppError {
  constructor(context?: Record<string, unknown>) {
    super({
      code: 'REQUEST_CONTEXT_UNAVAILABLE',
      httpStatus: 500,
      userMessageKey: 'errors.requestContext.unavailable',
      // `exactOptionalPropertyTypes`: bkz. tenant-not-found.error.ts'teki aynı yorum.
      ...(context !== undefined ? { context } : {}),
      isRetryable: false,
    })
  }
}
