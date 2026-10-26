// Node tarafı paketler için ESLint preset'i (apps/api, packages/db, trpc, theme-sdk, integrations).

import globals from 'globals'

import { createBaseConfig } from './base.js'

/**
 * @param {string} tsconfigRootDir Paketin kök dizini (`import.meta.dirname`).
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function nodeConfig(tsconfigRootDir) {
  return createBaseConfig({
    tsconfigRootDir,
    globals: globals.nodeBuiltin,
    overrides: [
      {
        files: ['**/*.ts'],
        rules: {
          // Sunucu tarafında tarayıcı API'lerine erişim kazası olmasın.
          'no-restricted-globals': [
            'error',
            { name: 'window', message: 'Node tarafında window yok.' },
            { name: 'document', message: 'Node tarafında document yok.' },
          ],
        },
      },
    ],
  })
}

export default nodeConfig
