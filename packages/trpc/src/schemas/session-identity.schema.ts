// @arkesoft/trpc — session.me tel sözleşmesi (ROADMAP v0.0.6, T-007/ST-2,
// architect K5)
//
// `apps/api/src/auth/auth-resolution.types.ts`'teki `CurrentUserIdentity` ile
// AYNI iki alan — bu BİLİNÇLİ: ALS'teki daraltma (v0.0.5, security tur2 S-6)
// tekrar kullanılır, `session.me` yolunda HİÇBİR DB okuması yoktur (K5).
// `email`/`name` BİLEREK yok — ALS onları taşımıyor, tüketici yok; gerektiğinde
// additive eklenir (alan eklemek minor, kaldırmak major).
//
// Ad çakışması bilinçli önlendi: `apps/api`'nin `SessionSummary`'si (oturum
// listesi satırı) BAŞKA bir şekildir — bu tip onunla KARIŞTIRILMAZ.
//
// K5 bağlayıcı kurallar (ADR-0009 madde 7): opsiyonel alan yok, yalnızca JSON
// ilkelleri, iş kuralı taşımaz.

import { z } from 'zod'

export const sessionIdentitySchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
})

/** {@link sessionIdentitySchema}'nın çıkarılan tip karşılığı. */
export type SessionIdentity = z.infer<typeof sessionIdentitySchema>
