import { nodeConfig } from '@arkesoft/config/eslint/node'

// R-P1 (PO, KRİTİK — bu bloğu değiştirirken yeniden oku): ESLint flat config'te
// aynı dosyaya uygulanan birden çok blok aynı kural anahtarını (`rules` içindeki
// bir anahtarı) ayarlarsa, kuralın seçenekleri BİRLEŞTİRİLMEZ — sonraki blok
// ÖNCEKİNİ TAMAMEN DEĞİŞTİRİR. `packages/config/eslint/base.js:48-70`'teki
// `no-restricted-imports` zaten Prisma yasağını (ve React sınıf bileşeni
// yasağını) tanımlıyor; bu dosyadaki her `no-restricted-imports` bloğu bu
// yüzden Prisma yasağını KENDİ İÇİNDE YENİDEN BEYAN EDER. Aksi hâlde AC13'ün
// lint zorlaması `apps/api` için sessizce kaybolur (grep onu yakalar, lint
// yakalamaz — asıl zarar budur).
//
// Çözüm: üç dosya kümesi TAM AYRIK tutulur (`files`/`ignores` ile), her biri
// `no-restricted-imports` için KENDİ TAM seçenek kümesini taşır. Bir dosya asla
// birden fazla bloğa aynı anda düşmez — bu yüzden "sonraki blok öncekini
// değiştirir" riski hiçbir dosya için gerçekleşmez:
//   (1) genel kural: her şey (prisma + Body/Query/Param + express yasağı)
//   (2) src/main.ts: express yasağı MUAF (K-A1 — adaptörün adı geçen TEK dosya)
//   (3) src/validation/**: Body/Query/Param yasağı MUAF (K-A6 — henüz yok,
//       ST-4'te doğacak; muafiyeti şimdiden tanımlamak sorunsuz)

/** Prisma istemcisini doğrudan import etmeyi yasaklar (base.js:48-70 — YENİDEN BEYAN, R-P1). */
const prismaRestriction = {
  paths: [
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
}

/**
 * `@nestjs/common`'dan ham `Body`/`Query`/`Param` importunu yasaklar (K-A6):
 * doğrulanmamış girdi okumak makine tarafından engellenir. `src/validation/**`
 * (ST-4) bu sarmalayıcıları KURAN tek dizin olduğu için muaf.
 */
const bodyQueryParamRestriction = {
  paths: [
    {
      name: '@nestjs/common',
      importNames: ['Body', 'Query', 'Param'],
      message:
        'Ham Body/Query/Param yasak (K-A6). ValidatedBody/ValidatedQuery/ValidatedParams (src/validation/**) kullan.',
    },
  ],
}

/**
 * HTTP adaptörünü (`express`/`@nestjs/platform-express`) kaynak koddan import
 * etmeyi yasaklar (K-A1 — adaptör kenarda tutulur, fastify'a geçiş tek dosya
 * olsun). `src/main.ts` adaptörün adının geçtiği TEK dosya olduğu için muaf.
 */
const expressRestriction = {
  paths: [
    {
      name: 'express',
      message: 'HTTP adaptörü kaynak koddan import edilmez (K-A1); yalnızca src/main.ts muaf.',
    },
    {
      name: '@nestjs/platform-express',
      message: 'HTTP adaptörü kaynak koddan import edilmez (K-A1); yalnızca src/main.ts muaf.',
    },
    {
      name: '@types/express',
      message: 'HTTP adaptörü kaynak koddan import edilmez (K-A1); yalnızca src/main.ts muaf.',
    },
  ],
  patterns: [
    {
      group: ['express/*', '@nestjs/platform-express/*', '@types/express/*'],
      message: 'HTTP adaptörü kaynak koddan import edilmez (K-A1); yalnızca src/main.ts muaf.',
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

  // Boş Nest modülü (`export class XModule {}`) `no-extraneous-class`'ı
  // tetikler; Nest'in modül deseni DI konteynerini kurmak için bundan ibarettir.
  {
    files: ['src/**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // Nest DI'nin açık token'lı boş yapıcıları
  // (`constructor(@Inject(TOKEN) private readonly x: T) {}` gövdesiz kalabilir)
  // ve dekoratörlü boş yaşam döngüsü kancaları `no-empty-function`'ı kırar.
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-empty-function': [
        'error',
        { allow: ['constructors', 'decoratedFunctions'] },
      ],
    },
  },

  // (1) Genel kural: main.ts ve src/validation/** HARİÇ her şey.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/main.ts', 'src/validation/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(prismaRestriction, bodyQueryParamRestriction, expressRestriction),
      ],
    },
  },
  // (2) src/main.ts: express yasağı MUAF, Prisma ve Body/Query/Param yasağı geçerli.
  {
    files: ['src/main.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(prismaRestriction, bodyQueryParamRestriction),
      ],
    },
  },
  // (3) src/validation/**: Body/Query/Param yasağı MUAF, Prisma ve express yasağı geçerli.
  {
    files: ['src/validation/**'],
    rules: {
      'no-restricted-imports': ['error', mergeRestrictions(prismaRestriction, expressRestriction)],
    },
  },
]
