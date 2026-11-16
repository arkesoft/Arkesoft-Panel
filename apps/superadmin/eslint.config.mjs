// @arkesoft/superadmin — ESLint flat config (ROADMAP v0.0.20, T-021/S8,
// `apps/admin`'in T-008/S4 emsali — birebir aynı R-P1 tuzağı telafisi)
//
// R-P1 TUZAĞI (BAĞLAYICI — `apps/admin/eslint.config.mjs`'in aynı deseni):
// flat config'te aynı dosyaya uygulanan İKİNCİ `no-restricted-imports`,
// `base.js`'in seçeneklerini TAMAMEN DEĞİŞTİRİR — React sınıf bileşeni yasağı
// SESSİZCE kaybolur. Telafi: `restrictedImportsOptions` `base.js`'ten
// İMPORT EDİLİP burada BİRLEŞTİRİLİR (`mergeRestrictions`), kopyalanmaz.
import { restrictedImportsOptions } from '@arkesoft/config/eslint/base'
import { reactConfig } from '@arkesoft/config/eslint/react'

/**
 * `@arkesoft/trpc/server` tarayıcı grafiğine ASLA girmez (ADR-0009 §6) —
 * sunucu tarafı resolver/port/handler kodu. Tarayıcı tüketicisi (bu paket)
 * YALNIZCA kök alt yoldan (`@arkesoft/trpc`) import eder.
 */
const trpcServerRestriction = {
  paths: [
    {
      name: '@arkesoft/trpc/server',
      message:
        'Sunucu alt yolu tarayıcı grafiğine girmez (ADR-0009 §6). Yalnızca kök alt yoldan (@arkesoft/trpc) import et.',
    },
  ],
  patterns: [
    {
      group: ['@arkesoft/trpc/server/*'],
      message:
        'Sunucu alt yolu tarayıcı grafiğine girmez (ADR-0009 §6). Yalnızca kök alt yoldan (@arkesoft/trpc) import et.',
    },
  ],
}

/** Birden çok kısıtlama nesnesini TEK `no-restricted-imports` seçenek kümesine birleştirir (R-P1 telafisi). */
function mergeRestrictions(...restrictions) {
  return {
    paths: restrictions.flatMap((restriction) => restriction.paths ?? []),
    patterns: restrictions.flatMap((restriction) => restriction.patterns ?? []),
  }
}

export default [
  ...reactConfig(import.meta.dirname),

  // TanStack Router'ın file-based modunun ÜRETTİĞİ dosya — elle düzenlenmez, lint edilmez.
  { ignores: ['src/routeTree.gen.ts'] },

  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(restrictedImportsOptions, trpcServerRestriction),
      ],
      'no-restricted-globals': ['error', 'process', 'Buffer', '__dirname', '__filename'],
    },
  },

  // scripts/**: derleme/bakım script'leri doğrudan stdout'a yazar — enjekte
  // edilen logger yok, bu dizinde `no-console` KAPALI (CLAUDE.md §4'ün
  // `console.log` yasağı uygulama kodu içindir, CLI script'i değil).
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]
