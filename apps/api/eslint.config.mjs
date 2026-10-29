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
// Çözüm: dört dosya kümesi TAM AYRIK tutulur (`files`/`ignores` ile), her biri
// `no-restricted-imports` için KENDİ TAM seçenek kümesini taşır. Bir dosya asla
// birden fazla bloğa aynı anda düşmez — bu yüzden "sonraki blok öncekini
// değiştirir" riski hiçbir dosya için gerçekleşmez:
//   (1) genel kural: her şey (prisma + Body/Query/Param + express + pg +
//       Prisma istemci yüzeyi yasağı — R-1 katman 2, aşağıya bkz.)
//   (2) src/main.ts: express yasağı MUAF (K-A1 — adaptörün adı geçen TEK dosya)
//   (3) src/validation/**: Body/Query/Param yasağı MUAF (K-A6 — henüz yok,
//       ST-4'te doğacak; muafiyeti şimdiden tanımlamak sorunsuz)
//   (4) src/prisma/**, src/auth/**, src/__tests__/**: Prisma istemci yüzeyi
//       yasağı MUAF — (4a) `prisma`/`auth` R-1'in kendi erişim noktası
//       (henüz `auth` yok, S5 oluşturacak); (4b) `__tests__` ÜRETİM YOLU
//       DEĞİL (T-006/S1, PO riski 3, seçenek (a) — tercih edilen). Gerekçe:
//       `PrismaDatabase`'in test dosyalarında doğrudan import edilmesi derleme
//       zamanı garantisini (R-1 katman 1 — `AppPrismaDatabase`/
//       `TenantTransactionClient` daraltması, S2/S3) atlatmaz; yanıt ve log
//       yüzeyi zaten AC6 (açık `select`) + AC8 (log yakalama testi) ile kapalı.
//       Bu dosyaları düzenleme yetkisi bu alt görevde YOK (`shutdown.test.ts`,
//       `prisma-with-tenant.test.ts` — S1 sahipliği dışı); muafiyet onları
//       KIRMADAN R-1'in ikinci katmanını geri kalan tüm `apps/api/src/**`
//       yüzeyine uygular.

/**
 * R-1 katman 2 (ADR-0008 taslağı, T-006 "MADDE 2 — R-1 KARARI"): tam Prisma
 * istemci yüzeyini (sır taşıyan modellere erişimi AÇAN tipler) taşıyan
 * import'ları `@arkesoft/db`'den yasaklar. Derleme zamanı garantisi (katman 1
 * — `AppPrismaDatabase`/`AuthPrismaDatabase` daraltması) henüz YOK; `S2` bu
 * tipleri üretene kadar `AuthPrismaDatabase`/`AUTH_SECRET_BEARING_MODELS`
 * jetonları eşleşmez (bugün lint'i KIRMAZ) ve tipler gelince otomatik etkin
 * olur. `PrismaDatabase` bugün zaten var ve ban'a dahil — `src/prisma/**` ve
 * `src/auth/**` dışında hiçbir yerde kullanılmamalı (K-E12 dosya kapsamlı
 * istisna deseni, R-1 madde 2).
 */
const prismaClientSurfaceRestriction = {
  paths: [
    {
      name: '@arkesoft/db',
      importNames: [
        'PrismaDatabase',
        'AuthPrismaDatabase',
        'AUTH_SECRET_BEARING_MODELS',
        'createPrismaClient',
      ],
      message:
        'Tam Prisma istemci yüzeyi yalnızca src/{prisma,auth}/** içinde kullanılabilir (R-1 katman 2, ADR-0008).',
    },
  ],
}

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

/**
 * Ham Postgres bağlantı havuzunu (`pg`, `pg-pool`, `pg-native`) veya sürücü
 * adaptörünü (`@prisma/adapter-pg`) doğrudan import etmeyi yasaklar
 * (base.js — K-E12, YENİDEN BEYAN, R-P1). `apps/*` içinde kurulan ham bir
 * `pg.Pool`, `@arkesoft/db`'nin tek istemci fabrikasını (`src/client.ts`)
 * ve onun kurduğu `withTenant()` tenant bağlamını tamamen atlar — RLS/rol
 * ayrımı o bağlantı için hiç devreye girmez (ROADMAP v0.0.13).
 */
const pgRestriction = {
  paths: [
    {
      name: 'pg',
      message:
        'Ham bağlantı havuzu kuran bir apps/* dosyası withTenant() çağrısını tamamen atlar; Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3).',
    },
    {
      name: 'pg-pool',
      message:
        'Ham bağlantı havuzu kuran bir apps/* dosyası withTenant() çağrısını tamamen atlar; Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3).',
    },
    {
      name: 'pg-native',
      message:
        'Ham bağlantı havuzu kuran bir apps/* dosyası withTenant() çağrısını tamamen atlar; Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3).',
    },
    {
      name: '@prisma/adapter-pg',
      message:
        'Ham bağlantı havuzu kuran bir apps/* dosyası withTenant() çağrısını tamamen atlar; sürücü adaptörü yalnızca @arkesoft/db/src/client.ts içinde kurulur (CLAUDE.md §3).',
    },
  ],
  patterns: [
    {
      group: ['pg/*'],
      message:
        'Ham bağlantı havuzu kuran bir apps/* dosyası withTenant() çağrısını tamamen atlar; Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3).',
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

  // (1) Genel kural: main.ts, src/validation/**, src/prisma/**, src/auth/**
  // ve src/__tests__/** HARİÇ her şey. Prisma istemci yüzeyi yasağı (R-1
  // katman 2) burada geçerli.
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/main.ts',
      'src/validation/**',
      'src/prisma/**',
      'src/auth/**',
      'src/__tests__/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(
          prismaRestriction,
          bodyQueryParamRestriction,
          expressRestriction,
          pgRestriction,
          prismaClientSurfaceRestriction,
        ),
      ],
    },
  },
  // (2) src/main.ts: express yasağı MUAF, geri kalanı (Prisma istemci yüzeyi
  // yasağı dahil) geçerli.
  {
    files: ['src/main.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(
          prismaRestriction,
          bodyQueryParamRestriction,
          pgRestriction,
          prismaClientSurfaceRestriction,
        ),
      ],
    },
  },
  // (3) src/validation/**: Body/Query/Param yasağı MUAF, geri kalanı (Prisma
  // istemci yüzeyi yasağı dahil) geçerli.
  {
    files: ['src/validation/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(
          prismaRestriction,
          expressRestriction,
          pgRestriction,
          prismaClientSurfaceRestriction,
        ),
      ],
    },
  },
  // (4) src/prisma/**, src/auth/**, src/__tests__/**: Prisma istemci yüzeyi
  // yasağı (R-1 katman 2) MUAF — (a) prisma/auth R-1'in kendi erişim noktası;
  // (b) __tests__ üretim yolu değil (T-006/S1, PO riski 3, seçenek (a)).
  // Diğer üç yasak (prisma ham import + Body/Query/Param + express + pg)
  // burada da geçerli.
  {
    files: ['src/prisma/**', 'src/auth/**', 'src/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(
          prismaRestriction,
          bodyQueryParamRestriction,
          expressRestriction,
          pgRestriction,
        ),
      ],
    },
  },
]
