// @arkesoft/admin — `fetch` yanıt gövdesini GÜVENLİ JSON ayrıştırma
// (ROADMAP v0.0.15, T-016 FIX turu 2/M-6, `solid` bulgusu "bonus, low" —
// `auth-rest.ts` ve `two-factor-rest.ts` BİREBİR AYNI yardımcıyı iki kopya
// olarak taşıyordu; ikinci dosyanın kendi başlık yorumu bu terfiyi önceden
// işaret ediyordu: "ikinci bir tüketici doğduğunda ortak bir http/
// yardımcısına terfi edebilir" — o an budur).
//
// Yanıt gövdesi JSON DEĞİLSE (ör. boş gövde, HTML hata sayfası) `null`
// döner — FIRLATMAZ; çağıran taraf `normalizePanelError(null)` ile
// `kind: 'unknown'` dalına fail-closed düşer.
export async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}
