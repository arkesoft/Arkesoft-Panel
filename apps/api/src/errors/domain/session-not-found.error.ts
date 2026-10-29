// @arkesoft/api — SESSION_NOT_FOUND (ROADMAP v0.0.5, T-006/S6, architect
// "HATA SINIFLARI" bölümü, K5)
//
// `SessionsService.revokeOwnSession()`'ın fırlattığı TEK hata — hem "bu
// `sessionId` hiç yok" hem "bu `sessionId` var ama BAŞKASININ" durumu AYNI
// cevabı döner (CLAUDE.md §7/K5: "var olmayan vs. yetkisiz kaynak AYNI
// cevabı döner" — `tenant-not-found.error.ts`'in AYNI ilkesi, oturum
// sahipliği için). `context` BİLEREK `{}` — hangi `sessionId`'nin denendiği
// ya da kime ait olduğu NE TELE NE log bağlamına yazılır (ikisi de başka bir
// kullanıcının oturum kimliğini SIZDIRABİLİRDİ).

import { AppError } from '@arkesoft/errors'

export class SessionNotFoundError extends AppError {
  constructor() {
    super({
      code: 'SESSION_NOT_FOUND',
      httpStatus: 404,
      userMessageKey: 'errors.auth.sessionNotFound',
      isRetryable: false,
    })
  }
}
