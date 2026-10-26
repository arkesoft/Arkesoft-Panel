// Tarayıcı/React tarafı paketler için ESLint preset'i
// (apps/admin, apps/superadmin, apps/storefront, packages/ui).
//
// NOT: React'e özgü eklentiler (eslint-plugin-react-hooks, jsx-a11y) React
// bağımlılığıyla birlikte v0.0.7'de eklenecek. Şu an yalnızca tarayıcı globalleri
// ve ortak katı kurallar geçerlidir.

import globals from 'globals'

import { createBaseConfig } from './base.js'

/**
 * @param {string} tsconfigRootDir Paketin kök dizini (`import.meta.dirname`).
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function reactConfig(tsconfigRootDir) {
  return createBaseConfig({
    tsconfigRootDir,
    globals: { ...globals.browser, ...globals.es2023 },
  })
}

export default reactConfig
