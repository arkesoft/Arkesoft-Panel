// @arkesoft/admin — resolveShapeErrorMessage (ROADMAP v0.1.0, T-019 GATE TUR
// 1 düzeltmesi, docs/gates/T-019-solid-tur1.md, `solid` M-bulgusu).
//
// `/sign-in` (`_auth.sign-in.tsx`) ve `/kayit` (`_auth.kayit.tsx`) rotaları
// react-hook-form'un `error.type`'ını (= Zod'un `issue.code`'u — `'too_small'`
// / `'invalid_format'` / `'custom'`) AYNI dallanma şekliyle alana özel bir
// Türkçe mesaja eşliyordu — iki rotada ÜÇ AYRI yerel fonksiyon (`resolveEmail
// FieldErrorMessage`/`resolvePasswordFieldErrorMessage`/`resolvePassword
// ConfirmFieldErrorMessage`), birebir aynı `if` zinciri, sadece mesaj kaynağı
// (`MESSAGES.auth.signIn.*` / `MESSAGES.auth.signUp.*`) farklı.
//
// ⚠⚠ ÖLÇÜLMÜŞ NEGATİF KANIT (bulguyu taşıyan şey BU, kopya olması DEĞİL):
// üç tanım da `export` DEĞİLDİ ve `vitest.config.ts`'in `include`'ı
// (`src/**/*.test.ts`) rota dosyalarını (`.tsx`) GÖRMÜYOR ⇒ Zod'un
// `'invalid_format'` literalini `'invalid_string'` yapsan TEK TEST KIRILMAZDI
// ve kullanıcı sessizce jenerik mesaja düşerdi. Ortak değişme sebebi Zod'un
// KENDİ sözlüğü (sürüm yükseltmesinde literaller değişir) — bu GERÇEK bir
// tekrardı, kozmetik değil. Tek eve taşındı (`packages/db`/`apps/api`
// emsali DEĞİL — `normalize-panel-error.ts`/`panel-error.ts`'in bulunduğu
// AYNI `errors/` dizini, panel içi "hata çözümleme" evi) ve `export`'landı.
export type ShapeErrorFieldMessages = {
  readonly required: string
  // Her alan `'invalid_format'`/`'custom'`'u ANLAMLI BULMAZ (ör. şifre
  // alanı `'invalid_format'` üretmez) — bu yüzden İKİSİ DE OPSİYONEL;
  // tanımsızsa `genericError`'a düşülür (aşağıdaki fail-closed davranış).
  readonly invalidFormat?: string
  readonly custom?: string
  readonly genericError: string
}

/**
 * react-hook-form'un alan hatası `type`'ını (= Zod'un `issue.code`'u) alana
 * özel bir mesaja eşler.
 *
 * FAIL-CLOSED (DÜZELTME TURU 1, `solid` M5 ║ `wcag` M3'ün AYNI disiplini —
 * `_auth.sign-in.tsx`/`_auth.kayit.tsx` dosya başı yorumları): tanınmayan HER
 * kod — dahil `invalidFormat`/`custom` o alan için TANIMLI DEĞİLSE —
 * `genericError`'a düşer; alan hatası SESSİZCE kaybolmaz (CLAUDE.md §10/16,
 * hatayı `null`'a çevirip sessizce devam etmek yasak).
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
