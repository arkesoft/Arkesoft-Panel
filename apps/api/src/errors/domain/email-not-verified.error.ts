// @arkesoft/api — EMAIL_NOT_VERIFIED (ROADMAP v0.0.5, T-006/S6, architect
// "HATA SINIFLARI" bölümü, K4 madde 2)
//
// ⚠ DÜRÜST NOT (rapor standardı, S1-S5 emsali): bu alt görevin ÜRETİM kod
// yollarından HİÇBİRİ bu sınıfı FIRLATMAZ. K4(2)'nin ("doğrulanmamış hesabın
// giriş denemesi → 403 EMAIL_NOT_VERIFIED") gerçek HTTP karşılığı Better
// Auth'un KENDİ ürettiği, `/auth/sign-in/email` delege yolunda OLDUĞU GİBİ
// forward edilen hata gövdesidir (`AuthController`, S5 — bkz. `auth-flow.test.ts`
// `betterAuthErrorBodySchema` kanıtı, `code: 'EMAIL_NOT_VERIFIED'`); bu bizim
// `AppError` hiyerarşimiz DEĞİL, Better Auth'un KENDİ tel şeklidir ve
// `AuthController` delege yolundaki yanıtların İÇERİĞİNE KARIŞMAZ (bkz.
// `auth.controller.ts` dosya başı yorumu).
//
// Bu sınıf architect'in "HATA SINIFLARI" tablosunu (code/httpStatus/context/
// retryable beşlisi) TAMAMLAMAK için SCAFFOLD olarak var — tabloda `code:
// EMAIL_NOT_VERIFIED, httpStatus: 403, context: {userId}` birebir yazılı.
// `getSession()`'ın döndürdüğü kullanıcı zaten doğrulanmış olmak ZORUNDADIR
// (Better Auth doğrulanmamış hesaba oturum ÇERE Zİ VERMEZ, K4(1)) — bu yüzden
// BUGÜN erişilebilir bir kod yolu YOK. İleride (ör. bir admin elle
// `emailVerified`'ı `false`'a çeken bir işlem EKLERSE, v0.0.14+) `AuthGuard`
// VEYA `AuthContextMiddleware` bu sınıfı tüketebilir — o güne kadar
// KULLANILMAYAN ama hiyerarşiyi eksiksiz tutan bir sınıf.

import { AppError } from '@arkesoft/errors'

export class EmailNotVerifiedError extends AppError {
  constructor(userId: string) {
    super({
      code: 'EMAIL_NOT_VERIFIED',
      httpStatus: 403,
      userMessageKey: 'errors.auth.emailNotVerified',
      context: { userId },
      isRetryable: false,
    })
  }
}
