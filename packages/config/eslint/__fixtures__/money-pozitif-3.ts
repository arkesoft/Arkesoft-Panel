// AC-47 pozitif fixture 3 (T-027/S4) — para alanında .toFixed() çağrısı.
//
// Yakalaması gereken seçici:
//   CallExpression[callee.property.name='toFixed'][callee.object.name=/<MONEY>/]
//
// Bu dosya KASITLI olarak kuralı ihlal eder; `base.js`'in global `IGNORES`
// listesine (`eslint/__fixtures__/**`) girdiği için repo geneli `pnpm lint`
// bununla kırmızı OLMAZ. Doğrulama elle: `--no-ignore` ile tek dosya koşumu.
export function formatPrice(price: number): string {
  return price.toFixed(2)
}
