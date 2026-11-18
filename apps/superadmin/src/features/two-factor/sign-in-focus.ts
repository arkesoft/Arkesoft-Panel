// @arkesoft/superadmin — sign-in odak anahtarı (ROADMAP v0.0.20, T-021/S8,
// `apps/admin/src/features/two-factor/sign-in-focus.ts`'in BİREBİR aynısı
// — cross-app import yasak olduğu için yerel kopya).
//
// SAF fonksiyon — `/giris` rotasının `headingRef`'i YENİDEN odaklamak için
// `useEffect` bağımlılık dizisine koyduğu "odak kimliği"ni üretir. TOTP ↔
// yedek kod MOD geçişi `step.kind`'ı DEĞİŞTİRMEZ (ikisi de
// `twoFactorMethod`), bu fonksiyon `mode`'u da kimliğe katar.
export type SignInFocusStep =
  | { readonly kind: 'credentials' }
  | { readonly kind: 'twoFactorMethod'; readonly mode: 'totp' | 'backup-code' }
  | { readonly kind: 'challengeEnded'; readonly message: string }

export function computeSignInFocusKey(step: SignInFocusStep): string {
  if (step.kind === 'twoFactorMethod') {
    return `${step.kind}:${step.mode}`
  }
  return step.kind
}
