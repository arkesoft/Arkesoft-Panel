// @arkesoft/admin — alan hatası mesaj önceliği (ROADMAP v0.0.15, T-016 FIX
// turu 4/M-W1, docs/ui/T-016-iki-faktorlu-dogrulama.md:213)
//
// SAF fonksiyon — sunucu kaynaklı alan hatasını (controller'ın `errorMessage`
// alanı) ile react-hook-form'un ŞEKİL hatasını (zorunlu alan/biçim) TEK bir
// `Input.error` değerine birleştirir. Sunucu hatası ÖNCELİKLİDİR —
// `TwoFactorChallengeForm.tsx:109-115`'in AYNI önceliği
// (`fieldErrorMessage ?? shapeErrorMessage`), bu FIX turunun DOĞRU EMSALİ.
//
// `TwoFactorSetupWizard`'ın ESKİ davranışı sunucu hatasını AYRI bir
// `role="alert"` kutusunda gösteriyordu (kopuk, `aria-describedby` YOK) —
// docs/ui:213 "Field-level hata = Input'un error prop'u, başka bir şey
// DEĞİL… ÇİFT duyuru üretir" şartını ihlal ediyordu (wcag FIX turu 4/M-W1).
// Bu fonksiyon o birleştirmeyi React'ten/DOM'dan bağımsız, test edilebilir
// kılar (`vitest.config.ts`'in `environment: 'node'` kararıyla UYUMLU).
export function resolveFieldErrorMessage(
  serverErrorMessage: string | null,
  shapeErrorMessage: string | undefined,
): string | undefined {
  return serverErrorMessage ?? shapeErrorMessage
}
