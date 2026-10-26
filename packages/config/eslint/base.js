// Arkesoft ortak ESLint tabanı (flat config).
//
// Tip bilgisine dayalı (type-aware) katı kurallar açıktır; CLAUDE.md §4'teki
// standartları makine tarafından zorlar. Yeni kural eklerken gerekçesini yoruma yaz.

import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier/flat'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** TypeScript kaynak dosyası desenleri. */
const TS_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts']

/** Yapılandırma dosyaları — tip bilgisi olmadan lint edilir. */
const CONFIG_FILES = ['**/*.js', '**/*.mjs', '**/*.cjs']

/** Her pakette yoksayılan yollar. */
const IGNORES = [
  'dist/**',
  'build/**',
  '.turbo/**',
  '.astro/**',
  'coverage/**',
  'playwright-report/**',
  'test-results/**',
  '**/*.tsbuildinfo',
]

/**
 * Arkesoft'a özgü kurallar. Tüm paketlerde geçerlidir.
 *
 * @satisfies {import('eslint').Linter.RulesRecord}
 */
const arkesoftRules = {
  // --- Yasaklar (CLAUDE.md §2) ---
  // `any` yasak. Kaçınılmazsa satır bazlı disable + gerekçe yorumu zorunlu.
  '@typescript-eslint/no-explicit-any': 'error',
  // Tip zorlama yalnızca runtime doğrulamasından sonra; gereksizini yakala.
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  // console.* yerine enjekte edilen logger kullanılır.
  'no-console': 'error',
  // Sınıf tabanlı React bileşeni yasak; React.Component'a erişimi kes.
  // Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3,
  // T-001/AC4) — apps/* ve diğer packages/* doğrudan @prisma/client import
  // edemez; @arkesoft/db kendi iç #prisma subpath dolaylamasıyla muaf tutulur
  // (bu kural eslint "no-restricted-imports" kapsamında istisna tanımlamaz,
  // @arkesoft/db @prisma/client'ı hiç import etmez — #prisma kullanır).
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'react',
          importNames: ['Component', 'PureComponent'],
          message:
            'Sınıf tabanlı React bileşeni yasak (CLAUDE.md §2). Fonksiyon bileşeni + hook kullan.',
        },
        {
          name: '@prisma/client',
          message: 'Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3).',
        },
      ],
      patterns: [
        {
          group: ['@prisma/client/*', '.prisma/client', '.prisma/client/*'],
          message: 'Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3).',
        },
      ],
    },
  ],

  // --- Dışa açılan yüzey (CLAUDE.md §4: dönüş tipleri açık yazılır) ---
  '@typescript-eslint/explicit-module-boundary-types': 'error',

  // --- Hata yönetimi (CLAUDE.md §4) ---
  // Hata yutmak yasak: boş blok, boş catch.
  'no-empty': ['error', { allowEmptyCatch: false }],
  // Beklenmeyen hata sessizce kaybolmasın.
  '@typescript-eslint/only-throw-error': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',

  // --- Exhaustive switch (CLAUDE.md §4: discriminated union + assertNever) ---
  '@typescript-eslint/switch-exhaustiveness-check': [
    'error',
    { considerDefaultExhaustiveForUnions: true },
  ],

  // --- Genel hijyen ---
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      args: 'all',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'all',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    },
  ],
  // import type / export type ayrımı net olsun (verbatimModuleSyntax ile uyumlu).
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],

  // --- Projeye uymayan stil varsayılanlarını kapat ---
  // CLAUDE.md `type` ve `interface`'i amaca göre serbest bırakıyor.
  '@typescript-eslint/consistent-type-definitions': 'off',
}

/**
 * CLAUDE.md §4'teki isimlendirme tablosunu zorlayan kurallar.
 *
 * @satisfies {import('eslint').Linter.RulesRecord}
 */
const namingRules = {
  '@typescript-eslint/naming-convention': [
    'error',
    // Tip, arayüz, sınıf, enum: PascalCase
    { selector: 'typeLike', format: ['PascalCase'] },
    // Sabit ve değişken: camelCase, SCREAMING_SNAKE_CASE veya PascalCase (React bileşeni)
    {
      selector: 'variable',
      format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
      leadingUnderscore: 'allow',
    },
    // Fonksiyon: camelCase veya PascalCase (React bileşeni)
    { selector: 'function', format: ['camelCase', 'PascalCase'] },
    // Parametre: camelCase, kullanılmayan için _ öneki
    { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
    // Dış sistemlerden gelen nesne anahtarları (snake_case, header adları) serbest.
    { selector: 'objectLiteralProperty', format: null },
    { selector: 'typeProperty', format: null },
  ],
}

/**
 * Bir paket için ESLint flat config dizisi üretir.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir Paketin kök dizini (`import.meta.dirname`).
 * @param {Record<string, boolean | 'readonly' | 'writable' | 'off'>} [options.globals]
 *   Ek global tanımları (Node, tarayıcı vb.).
 * @param {import('typescript-eslint').ConfigWithExtends[]} [options.overrides]
 *   Pakete özgü ek config blokları.
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createBaseConfig({ tsconfigRootDir, globals: extraGlobals = {}, overrides = [] }) {
  return tseslint.config(
    { ignores: IGNORES },

    // --- TypeScript kaynakları: tip bilgisine dayalı katı kurallar ---
    {
      files: TS_FILES,
      extends: [
        js.configs.recommended,
        tseslint.configs.strictTypeChecked,
        tseslint.configs.stylisticTypeChecked,
      ],
      languageOptions: {
        parserOptions: {
          // Her dosya için en yakın tsconfig.json otomatik bulunur.
          projectService: true,
          tsconfigRootDir,
        },
        globals: extraGlobals,
      },
      rules: { ...arkesoftRules, ...namingRules },
    },

    // --- Yapılandırma dosyaları (.mjs): tip bilgisi olmadan ---
    {
      files: CONFIG_FILES,
      extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
      languageOptions: {
        globals: globals.nodeBuiltin,
      },
      rules: {
        'no-console': 'off',
      },
    },

    // Prettier ile çakışan biçimlendirme kuralları en sonda kapatılır.
    prettierConfig,

    ...overrides,
  )
}

export { IGNORES, TS_FILES, CONFIG_FILES }
