// `@arkesoft/config/eslint/base` için AMBİENT MODÜL BİLDİRİMİ.
//
// `packages/config/eslint/base.js` saf JavaScript + JSDoc tipli bir dosya;
// `@arkesoft/config` paketi bu alt yol için yayımlanmış bir `.d.ts` taşımıyor
// (paket `dist`'e derlenmiyor, `eslint/base.js` doğrudan `exports` ile
// sunuluyor — `package.json:11`). `packages/i18n`'in `tsconfig.json`'ı
// `allowJs` AÇMADIĞI için (`@arkesoft/config/tsconfig/node.json` zinciri) bu
// alt yolun tipi TypeScript için `any`'e düşer ve
// `@typescript-eslint/no-unsafe-call` bunu yakalar.
//
// ⚠ `base.js`'e DOKUNULMADI (devops'un dosyası) — bu bildirim yalnızca bu
// paketin KENDİ `src/__tests__/` dizininde, `createBaseConfig`'in GERÇEK
// JSDoc imzasının (`base.js:337`, `tsconfigRootDir`/`globals`/`overrides`
// parametreleri ve `import('typescript-eslint').ConfigArray` dönüş tipi)
// `eslint`'in (zaten kurulu devDependency) `Linter.Config[]` karşılığıyla
// BİREBİR eşleşen, elle yazılmış bir ayna. `Linter.Config[]`, ESLint'in
// `ESLint` kurucusunun `baseConfig` seçeneğinin KABUL ETTİĞİ tiptir — bu
// yüzden `eslint-money-fixtures.test.ts` `as`/`as unknown as` TİP ZORLAMASI
// yapmadan `createBaseConfig(...)`'in sonucunu doğrudan kullanabilir
// (CLAUDE.md §4: "Tip zorlama yalnızca runtime doğrulamasından hemen sonra
// kabul edilir" — burada runtime doğrulaması YOK, bu yüzden `as` yerine
// doğru bir ambient tip tercih edildi).

declare module '@arkesoft/config/eslint/base' {
  import type { Linter } from 'eslint'

  /**
   * `base.js`'in JSDoc imzasının ayna karşılığı — bkz. `base.js:326-337`.
   */
  export function createBaseConfig(options: {
    readonly tsconfigRootDir: string
    readonly globals?: Record<string, boolean | 'readonly' | 'writable' | 'off'>
    readonly overrides?: readonly Linter.Config[]
  }): Linter.Config[]
}
