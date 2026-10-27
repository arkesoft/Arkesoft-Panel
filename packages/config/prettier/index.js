// Arkesoft ortak Prettier yapılandırması.
// Kökteki prettier.config.mjs bunu yeniden dışa aktarır; tüm monorepo bu ayarları kullanır.

/** @type {import('prettier').Config} */
const config = {
  // Noktalı virgül kullanmıyoruz; ASI tuzakları ESLint tarafından yakalanır.
  semi: false,
  singleQuote: true,
  jsxSingleQuote: false,
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  trailingComma: 'all',
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  quoteProps: 'as-needed',
  // Markdown'da satır sonlarını koru (ROADMAP/CLAUDE tabloları bozulmasın).
  proseWrap: 'preserve',
  overrides: [
    {
      files: ['*.json', '*.jsonc'],
      options: { trailingComma: 'none' },
    },
  ],
}

export default config
