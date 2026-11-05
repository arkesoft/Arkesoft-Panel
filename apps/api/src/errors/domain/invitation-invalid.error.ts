// @arkesoft/api — INVITATION_INVALID (ROADMAP v0.0.14, T-014/S4, architect
// K-A9, ADR-0016 madde 6 KOŞUL D)
//
// ⚠⚠ `member.acceptInvitation`'ın TÜM başarısızlık modları BU TEK SINIFA
// indirgenir. YEDİ ayrı olgu, tel üstünde AYIRT EDİLEMEZ:
//   (a) belirtecin biçimi bozuk (ayırıcı yok / kiracı yarısı boş),
//   (b) belirteç hiçbir davete karşılık gelmiyor,
//   (c) davet VAR ama süresi geçmiş,
//   (d) davet VAR ama oturum e-postası davet adresiyle eşleşmiyor,
//   (e) belirteç DAHA ÖNCE kullanıldı (satır silindi — tek kullanımlık),
//   (f) belirteçteki kiracı kimliği var olmayan/erişilemeyen bir kiracıya
//       işaret ediyor (kiracı kapsamlı sorgu SIFIR satır döner),
//   (g) ⚠ belirtecin kiracı yarısı KİMLİK KARAKTER SINIFININ DIŞINDA bir bayt
//       taşıyor (NUL, boşluk, büyük harf, simge).
//
// ⚠⚠ (g) T-014 DÜZELTME TURU 1'DE EKLENDİ ve bu sayım o turda GÜNCELLENDİ
// (`security` medium #2): bu dosya "ALTI mod" diyordu ve YEDİNCİSİ VARDI —
// NUL baytı (U+0000) hem `trim()` kapısından hem veri katmanının boşluk
// kapısından geçiyor, PostgreSQL ise onu `22021`le reddediyordu → tek 404
// yerine jenerik bir HTTP 500 + `error` seviyeli HAM kayıt. Yani KOŞUL D
// gözlemsel olarak DELİKTİ. Kapı artık `invitation-token.ts`'in
// `TENANT_ID_PATTERN`'indedir ve (a) ile (g) AYNI satırda kesilir; sayım
// burada tutulur çünkü "hepsi aynı 404" iddiasının sahibi BU sınıftır.
//
// BU, ADR-0016 madde 6'nın DÖRDÜNCÜ KOŞULUDUR ve koşulun varlık sebebi
// mekanik: bu prosedür kiracı bağlamını HOST'TAN DEĞİL bir YETENEK
// BELİRTECİNDEN türetiyor, yani kiracı-muaf bir YAZMA ucudur. Hata sınıfları
// ayrılsaydı belirteç bir ORACLE'a dönüşürdü — "bu kiracı var ama davet
// yok" ile "böyle bir kiracı yok" ayrımı, kaba kuvvetle kiracı ve davet
// varlığı taramasına izin verirdi.
//
// `404`: CLAUDE.md §7 madde 12'nin "var olmayan vs. yetkisiz ayrımı
// YAPILMIYOR → her ikisi de 404" kuralı. `JobNotFoundError`/
// `TenantNotFoundError` ile aynı sınıf.
//
// ⚠ `publicDetails` OVERRIDE EDİLMEZ → tele `details: {}`. ⚠ `context` DE
// BİLEREK BOŞ BIRAKILIR (parametre YOK): hangi olgunun gerçekleştiğini LOGA
// yazmak bile istenmez, çünkü kiracı kimliği belirteçten geliyor ve onu log
// bağlamına koymak "geçersiz bir belirteç hangi kiracıyı hedefliyordu"
// bilgisini üretir — oysa o kiracı bağlamı HİÇ DOĞRULANMADI. Teşhis için
// gereken tek şey (`requestId` + hangi prosedür) istek logunda zaten var.

import { AppError } from '@arkesoft/errors'

export class InvitationInvalidError extends AppError {
  constructor() {
    super({
      code: 'INVITATION_INVALID',
      httpStatus: 404,
      userMessageKey: 'errors.member.invitationInvalid',
      isRetryable: false,
    })
  }
}
