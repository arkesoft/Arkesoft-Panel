// @arkesoft/superadmin — resolveShapeErrorMessage (ROADMAP v0.0.20,
// T-021/S8, `apps/admin/src/errors/resolve-shape-error-message.ts`'in
// AYNI deseni — cross-app import yasak olduğu için yerel kopya).
//
// SAF fonksiyon — react-hook-form'un `error.type`'ını (= Zod'un
// `issue.code`'u) alana özel bir Türkçe mesaja eşler. `/giris` rotasının
// e-posta/parola alanları bunu kullanır.
export interface ShapeErrorFieldMessages {
  readonly required: string
  // Her alan `'invalid_format'`/`'custom'`'u ANLAMLI BULMAZ (ör. şifre
  // alanı `'invalid_format'` üretmez) — bu yüzden İKİSİ DE OPSİYONEL;
  // tanımsızsa `genericError`'a düşülür.
  readonly invalidFormat?: string
  readonly custom?: string
  readonly genericError: string
}

/**
 * FAIL-CLOSED: tanınmayan HER kod — dahil `invalidFormat`/`custom` o alan
 * için TANIMLI DEĞİLSE — `genericError`'a düşer; alan hatası SESSİZCE
 * kaybolmaz (CLAUDE.md §10/16).
 */
export function resolveShapeErrorMessage(
  errorType: string | undefined,
  messages: ShapeErrorFieldMessages,
): string | undefined {
  if (errorType === undefined) {
    return undefined
  }
  if (errorType === 'too_small') {
    return messages.required
  }
  if (errorType === 'invalid_format' && messages.invalidFormat !== undefined) {
    return messages.invalidFormat
  }
  if (errorType === 'custom' && messages.custom !== undefined) {
    return messages.custom
  }
  return messages.genericError
}
