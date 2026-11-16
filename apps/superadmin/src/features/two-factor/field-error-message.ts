// @arkesoft/superadmin — alan hatası mesaj önceliği (ROADMAP v0.0.20,
// T-021/S8, `apps/admin/src/features/two-factor/field-error-message.ts`'in
// BİREBİR aynısı — cross-app import yasak olduğu için yerel kopya).
//
// SAF fonksiyon — sunucu kaynaklı alan hatasını ile react-hook-form'un
// ŞEKİL hatasını TEK bir `Input.error` değerine birleştirir. Sunucu hatası
// ÖNCELİKLİDİR.
export function resolveFieldErrorMessage(
  serverErrorMessage: string | null,
  shapeErrorMessage: string | undefined,
): string | undefined {
  return serverErrorMessage ?? shapeErrorMessage
}
