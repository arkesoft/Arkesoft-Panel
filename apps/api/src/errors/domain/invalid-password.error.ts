// @arkesoft/api — INVALID_PASSWORD (ROADMAP v0.0.15.1, T-017/S5, ADR-0019 §Karar 4/5)
//
// Dört Better Auth ucu (2FA kurulum/kapatma/TOTP URI alma/yedek kod üretimi)
// ZATEN parolayı gövdede zorunlu kılıyor ve başarısızlıkta kendi
// `BASE_ERROR_CODES.INVALID_PASSWORD`'ünü (400) döndürüyor — bu sınıf İKİNCİ
// bir ad İCAT ETMEZ, AYNI kodu/durumu platformun KENDİ hata hiyerarşisinde
// BENİMSER (ADR-0019 §Karar 5: "ikinci bir ad ikinci bir ayna üretirdi" —
// ADR-0018 Ek'teki "altı ayna, dördü korumasız" dersinin tekrarlanmaması).
//
// `StepUpService.assertVerified()`'in fırlattığı TEK hata — "parola eksik"
// ile "parola yanlış" durumları BİLİNÇLİ OLARAK AYIRT EDİLMEZ (ADR-0019
// §Karar 5, değerlendirilen alternatif 5: "ayrımın hiçbir tüketicisi yok").
//
// `context` BİLEREK `{}` — ne denenen parola ne hangi kullanıcı/hangi işlem
// için denendiği NE TELE NE log bağlamına yazılır (CLAUDE.md §4/§10.7: kart
// verisi/parola/token loglanmaz/saklanmaz; `session-not-found.error.ts`'in
// AYNI disiplini).

import { AppError } from '@arkesoft/errors'

export class InvalidPasswordError extends AppError {
  constructor() {
    super({
      code: 'INVALID_PASSWORD',
      httpStatus: 400,
      userMessageKey: 'errors.auth.invalidPassword',
      isRetryable: false,
    })
  }
}
