// AC-47 pozitif fixture 2 (T-027/S4) — nesne özelliğinde float para literali.
//
// Yakalaması gereken seçici:
//   Property[key.name=/<MONEY>/] > Literal[raw=/^[0-9]*\.[0-9]+$/]
//
// Bu dosya KASITLI olarak kuralı ihlal eder; `base.js`'in global `IGNORES`
// listesine (`eslint/__fixtures__/**`) girdiği için repo geneli `pnpm lint`
// bununla kırmızı OLMAZ. Doğrulama elle: `--no-ignore` ile tek dosya koşumu.
export const payload = { totalAmount: 19.99 }
