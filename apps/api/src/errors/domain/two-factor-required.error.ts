// @arkesoft/api — TWO_FACTOR_REQUIRED (ROADMAP v0.0.15, T-016/S6, architect
// md 2 — owner 2FA zorunluluğu ZORLAMASI, ADR-0018)
//
// `AuthGuard`'ın R2 üyelik kontrolünün (S6, bu dosya) İKİNCİ zorlama kapısı —
// üyelik VAR ama aktör `owner`, kiracı `requireTwoFactorForOwner` AÇIK ve
// aktörün KENDİ `app_user.twoFactorEnabled`'ı `false`. `httpStatus: 403`
// (401 DEĞİL — `TenantMembershipRequiredError`'ın AYNI gerekçesi: kullanıcı
// kim olduğunu ZATEN KANITLADI, sadece bu kaynağa erişim koşulunu
// KARŞILAMIYOR).
//
// ⚠⚠ `TwoFactorSetupRequiredError`'DAN (409, `tenant/two-factor-setup-
// required.error.ts`, S7) KASITLI OLARAK AYRI BİR SINIF — İKİSİ FARKLI
// OLAYI ANLATIR:
//   · `TwoFactorSetupRequiredError` (409) → owner POLİTİKAYI KAPALIDAN
//     AÇIĞA ÇEVİRMEYE ÇALIŞIYOR ama kendi 2FA'sı yok — "kendini
//     kilitlememe" ÖN KONTROLÜ, politika HENÜZ değişmedi.
//   · `TwoFactorRequiredError` (BU SINIF, 403) → politika ZATEN açık, owner
//     korumalı bir KAYNAĞA erişmeye çalışıyor — erişim REDDİ, politika
//     değişikliğiyle İLGİSİZ.
// Aynı sınıfı iki statüyle (409/403) kullanmak `AppError`'ın "code HTTP
// durumuna sabit eşlenir" beklentisini (tüketici tarafında `instanceof`
// kontrolü tek bir statü BEKLER) BOZARDI — bu yüzden ayrı sınıf.
//
// ⚠ `context` YALNIZCA LOGLANIR (CLAUDE.md §4/§7) — `userId`/`tenantId`
// opak cuid, PII DEĞİL; `TenantMembershipRequiredError`'ın (AuthGuard'ın
// R2 kontrolünün BİR ÖNCEKİ kapısı) AYNI desenine BİREBİR UYAR (ikisi de
// AuthGuard'ın aktörü reddettiği dallardır — "actor" öznesi sabit, ikinci
// bir özne YOK: bu sınıfın tek çağrı yeri AuthGuard'ın KENDİ aktörünü
// reddetmesidir, `MemberService`'in hedef/aktör ayrımı BURADA GEÇERLİ
// DEĞİLDİR).

import { AppError } from '@arkesoft/errors'

export class TwoFactorRequiredError extends AppError {
  constructor(userId: string, tenantId: string) {
    super({
      code: 'TWO_FACTOR_REQUIRED',
      httpStatus: 403,
      userMessageKey: 'errors.auth.twoFactorRequiredForOwner',
      context: { userId, tenantId },
      isRetryable: false,
    })
  }
}
