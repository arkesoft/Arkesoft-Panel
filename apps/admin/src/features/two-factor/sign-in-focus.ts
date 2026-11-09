// @arkesoft/admin — sign-in odak anahtarı (ROADMAP v0.0.15, T-016 FIX turu
// 4/M-W2, docs/ux/T-016-iki-faktorlu-dogrulama.md:432-433 "her adım/ekran
// geçişinde odak yeni başlığa taşınır")
//
// SAF fonksiyon — `_auth.sign-in.tsx`'in `headingRef`'i YENİDEN odaklamak
// için `useEffect` bağımlılık dizisine koyduğu "odak kimliği"ni üretir.
//
// Kök neden (wcag FIX turu 4/M-W2): TOTP ↔ yedek kod MOD geçişi
// (`step.kind === 'twoFactorMethod'` sabit kalır, SADECE `step.mode`
// değişir) ESKİDEN `useEffect`'in `[step.kind]` bağımlılığını TETİKLEMİYORDU
// — `TwoFactorChallengeForm` `key={step.mode}` ile TAM REMOUNT oluyordu
// (farklı etiket/alan: 6 haneli TOTP ↔ 8 karakterli yedek kod) ama
// ekran okuyucu/klavye kullanıcısı için odak HİÇBİR YERE taşınmıyordu.
//
// Bu fonksiyon `mode`'u da kimliğe katar — `twoFactorMethod` adımında
// `kind:mode` birleşik anahtarı üretilir, böylece mod geçişi de bir "yeni
// adım" gibi algılanır ve `useEffect` yeniden tetiklenir. React'ten/DOM'dan
// bağımsız — `vitest.config.ts`'in `environment: 'node'` kararıyla test
// edilebilir.
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
