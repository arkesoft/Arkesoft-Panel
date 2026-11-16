// @arkesoft/superadmin — `fetch` yanıt gövdesini GÜVENLİ JSON ayrıştırma
// (ROADMAP v0.0.20, T-021/S8, `apps/admin/src/api/http/parse-json-safely.ts`
// ile BİREBİR aynı — cross-app import yasak olduğu için yerel kopya).
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
