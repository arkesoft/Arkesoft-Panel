// @arkesoft/admin — ESLint flat config (ROADMAP v0.0.7, T-008/S4, architect K5)
//
// R-P1 TUZAĞI (BAĞLAYICI — bkz. `apps/api/eslint.config.mjs:162-168` deseni,
// AGENT_BASELINE'ın tekrarladığı kural): flat config'te aynı dosyaya
// uygulanan İKİNCİ `no-restricted-imports`, `base.js`'in seçeneklerini
// TAMAMEN DEĞİŞTİRİR — React sınıf bileşeni yasağı SESSİZCE kaybolur (grep
// yakalamaz, lint yakalamaz). Telafi: `restrictedImportsOptions`
// `base.js`'ten İMPORT EDİLİP burada BİRLEŞTİRİLİR (`mergeRestrictions`),
// kopyalanmaz.
import { restrictedImportsOptions } from '@arkesoft/config/eslint/base'
import { reactConfig } from '@arkesoft/config/eslint/react'

/**
 * `@arkesoft/trpc/server` tarayıcı grafiğine ASLA girmez (ADR-0009 §6, PM'in
 * architect'e notu #6) — sunucu tarafı resolver/port/handler kodu. Tarayıcı
 * tüketicisi (bu paket) YALNIZCA kök alt yoldan (`@arkesoft/trpc`) import
 * eder.
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

  // TanStack Router'ın file-based modunun ÜRETTİĞİ dosya (S5) — elle
  // düzenlenmez, lint edilmez.
  { ignores: ['src/routeTree.gen.ts'] },

  // Birleştirilmiş `no-restricted-imports` (base.js'in Prisma/React sınıf
  // bileşeni yasağı + trpc/server yasağı, R-P1 telafisi) + `src` kapsamlı
  // Node global yasağı: tarayıcı kodu `process`/`Buffer`/`__dirname`/
  // `__filename` kullanmaz — bu dört global TypeScript'i KIRMAZ (@types/node
  // ambient olarak tipli) ama bu projede YANLIŞLIKLA sızmış bir Node API'sine
  // işaret eder; bedel burada lint ile kapatılır (architect K5).
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
  // edilen logger yok, bu dizinde `no-console` KAPALI (gerekçe: CLAUDE.md
  // §4'ün `console.log` yasağı uygulama kodu içindir, CLI script'i değil).
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]
