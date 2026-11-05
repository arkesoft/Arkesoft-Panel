// @arkesoft/api — ALREADY_MEMBER (ROADMAP v0.0.14, T-014/S4, architect K-A9)
//
// İKİ yol bu hatayı üretir ve ikisi de AYNI olguyu anlatır:
//   (a) `member.invite` — davet edilen e-posta adresi BU kiracıda zaten bir
//       üyeliğe karşılık geliyor (davet anlamsız),
//   (b) `member.acceptInvitation` — kabul transaction'ı `(tenant_id, user_id)`
//       benzersizlik kısıtına çarptı (`P2002`); yani iki eşzamanlı kabul
//       yarışının KAYBEDEN tarafı veya kullanıcı araya başka bir yolla üye
//       olmuş.
//
// `409` (çakışma) seçildi, `403`/`404` DEĞİL: istek biçimsel olarak geçerli ve
// aktör yetkili; reddin sebebi kaynağın MEVCUT DURUMU. Yeniden denemek aynı
// sonucu verir → `isRetryable: false`.
//
// ⚠ `context` E-POSTA TAŞIMAZ (CLAUDE.md §4 "tam e-posta loglanmaz"): davet
// edilen adresin kendisi hiçbir log satırına girmez. Taşınan tek alan
// `userId`'dir ve o yalnızca (b) yolunda bilinir — (a) yolunda hedef kullanıcı
// kimliği henüz BİLİNMEZ (üyelik e-posta üzerinden eşleşti), bu yüzden
// parametre opsiyoneldir.

import { AppError } from '@arkesoft/errors'

export class AlreadyMemberError extends AppError {
  constructor(context?: Record<string, unknown>) {
    super({
      code: 'ALREADY_MEMBER',
      httpStatus: 409,
      userMessageKey: 'errors.member.alreadyMember',
      // `exactOptionalPropertyTypes` (CLAUDE.md §4): `context: undefined`
      // yazmak opsiyonel alanı açıkça `undefined`'a eşitler ve derleme
      // hatası verir — `JobNotFoundError`'ın birebir aynı deseni.
      ...(context !== undefined ? { context } : {}),
      isRetryable: false,
    })
  }
}
