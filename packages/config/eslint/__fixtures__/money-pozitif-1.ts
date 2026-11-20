// AC-47 pozitif fixture 1 (T-027/S4) — float para literali.
//
// Yakalaması gereken seçici:
//   VariableDeclarator[id.name=/<MONEY>/] > Literal[raw=/^[0-9]*\.[0-9]+$/]
//
// Bu dosya KASITLI olarak kuralı ihlal eder; `base.js`'in global `IGNORES`
// listesine (`eslint/__fixtures__/**`) girdiği için repo geneli `pnpm lint`
// bununla kırmızı OLMAZ. Doğrulama elle: `--no-ignore` ile tek dosya koşumu.
export const price = 19.99
