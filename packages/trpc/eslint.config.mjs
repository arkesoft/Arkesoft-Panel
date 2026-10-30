import { nodeConfig } from '@arkesoft/config/eslint/node'
import { restrictedImportsOptions } from '@arkesoft/config/eslint/base'

// R-P1 emsali (apps/api/eslint.config.mjs): ESLint flat config'te aynı dosyaya
// uygulanan birden çok blok aynı kural anahtarını ayarlarsa SEÇENEKLER
// BİRLEŞTİRİLMEZ — sonraki blok ÖNCEKİNİ TAMAMEN DEĞİŞTİRİR. Bu yüzden
// `base.js`'in dışa açtığı `restrictedImportsOptions`'ı (Prisma/pg yasağı)
// BURADA TEKRAR BEYAN ediyoruz (`mergeRestrictions`), üstüne ADR-0009 madde
// 5'in KAPALI bağımlılık listesini (`@arkesoft/db`, `@prisma/client`,
// `@arkesoft/api`, `apps/**`) ekliyoruz — aksi hâlde taban yasak SESSİZCE
// kaybolur.
//
// ADR-0009 madde 5 (bağlayıcı): `packages/trpc`'nin bağımlılık listesi
// KAPALIDIR — yalnızca `zod`, `@trpc/server`, `@trpc/client`, `@arkesoft/errors`.
// `@arkesoft/db` (tarayıcı tüketicisinin grafiğine Prisma tiplerini sokar),
// `@prisma/client` (zaten base'te yasak, burada ADR gerekçesiyle YENİDEN
// beyan), `@arkesoft/api` ve `apps/**` (bağımlılık yönü `apps/*` → `packages/*`,
// CLAUDE.md §3 — ters yön YASAK) içeri giremez.
const trpcDependencyDirectionRestriction = {
  paths: [
    {
      name: '@arkesoft/db',
      message:
        "packages/trpc tarayıcı tüketicisi olan bir pakettir; @arkesoft/db bağımlılığı Prisma tiplerini admin SPA'sının grafiğine sokar (ADR-0009 madde 5). Veri modeli sözlüğü yerel olarak bildirilir.",
    },
    {
      name: '@arkesoft/api',
      message:
        'Bağımlılık yönü apps/* → packages/* (CLAUDE.md §3); ters yön yasak (ADR-0009 madde 5). İş mantığı context üzerinden enjekte edilen port arayüzlerinin arkasındadır.',
    },
  ],
  patterns: [
    {
      group: ['@arkesoft/api/*'],
      message:
        'Bağımlılık yönü apps/* → packages/* (CLAUDE.md §3); ters yön yasak (ADR-0009 madde 5).',
    },
    {
      group: ['**/apps/*', '**/apps/**'],
      message:
        'apps/** içeriği packages/trpc içine import edilemez (ADR-0009 madde 5, bağımlılık yönü apps/* → packages/*).',
    },
  ],
}

/** Birden çok kısıtlama nesnesini TEK `no-restricted-imports` seçenek kümesine birleştirir. */
function mergeRestrictions(...restrictions) {
  return {
    paths: restrictions.flatMap((restriction) => restriction.paths ?? []),
    patterns: restrictions.flatMap((restriction) => restriction.patterns ?? []),
  }
}

export default [
  ...nodeConfig(import.meta.dirname),

  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(restrictedImportsOptions, trpcDependencyDirectionRestriction),
      ],
    },
  },
]
