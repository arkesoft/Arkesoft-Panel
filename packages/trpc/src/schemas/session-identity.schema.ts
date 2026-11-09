// @arkesoft/trpc — session.me tel sözleşmesi (ROADMAP v0.0.6, T-007/ST-2,
// architect K5; v0.0.15, T-016 FIX turu 2/M-4 — `twoFactorEnabled` EKLENDİ)
//
// `userId`/`sessionId` — `apps/api/src/auth/auth-resolution.types.ts`'teki
// `CurrentUserIdentity` ile AYNI iki alan — bu BİLİNÇLİ: ALS'teki daraltma
// (v0.0.5, security tur2 S-6) tekrar kullanılır, bu İKİ alan için `session.me`
// yolunda HİÇBİR DB okuması yoktur (K5).
//
// ⚠ GÜNCELLEME (M-4) — `twoFactorEnabled: boolean` EKLENDİ. Bu alan
// `CurrentUserIdentity`'nin PARÇASI DEĞİLDİR; `SessionSecurityReadPort.
// isTwoFactorEnabled(userId)` (`apps/api/src/trpc/ports/
// session-security-read.port.adapter.ts`) üzerinden AYRI bir DB okumasıyla
// doldurulur — "`session.me` yolunda HİÇBİR DB okuması yok" iddiası bu TEK
// alan için artık GEÇERLİ DEĞİL; istisna tip pini 3'te AÇIKÇA işaretlenir
// (`apps/api/src/__tests__/type-pins/trpc-wire-contract.pin.ts`).
// `twoFactorEnabled` KULLANICI seviyesi bir bayraktır (`app_user.
// two_factor_enabled`), KİRACIYA BAĞLI DEĞİLDİR — kiracı politikası
// (`requireTwoFactorForOwner`/`setup_required` sinyali) BU ALANDA YOKTUR,
// BİLEREK kapsam dışı bırakıldı (v0.0.15.1 borcu).
//
// `email`/`name` BİLEREK yok — ALS onları taşımıyor, tüketici yok; gerektiğinde
// additive eklenir (alan eklemek minor, kaldırmak major). `twoFactorEnabled`
// eklemek de AYNI şekilde MINOR'dır (CLAUDE.md §9) — zorunlu ama KATKISAL.
//
// Ad çakışması bilinçli önlendi: `apps/api`'nin `SessionSummary`'si (oturum
// listesi satırı) BAŞKA bir şekildir — bu tip onunla KARIŞTIRILMAZ.
//
// K5 bağlayıcı kurallar (ADR-0009 madde 7): opsiyonel alan yok, yalnızca JSON
// ilkelleri, iş kuralı taşımaz. `twoFactorEnabled` bu kurala UYAR — zorunlu,
// ham JSON ilkeli (boolean), politika hesaplaması TAŞIMAZ (yalnızca
// `app_user`'ın KENDİ bayrağının echo'su).

import { z } from 'zod'

export const sessionIdentitySchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  twoFactorEnabled: z.boolean(),
})

/** {@link sessionIdentitySchema}'nın çıkarılan tip karşılığı. */
export type SessionIdentity = z.infer<typeof sessionIdentitySchema>
