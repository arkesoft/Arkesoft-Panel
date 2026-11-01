// @arkesoft/ui — ESLint flat config (ROADMAP v0.0.7, T-008/S2, architect "Paket yüzeyi — packages/ui")
//
// R-P1 TUZAĞI (BAĞLAYICI — bkz. `apps/api/eslint.config.mjs:162-168` deseni,
// `apps/admin/eslint.config.mjs`'teki aynı telafi, architect riski 7): flat
// config'te aynı dosyaya uygulanan İKİNCİ `no-restricted-imports`,
// `base.js`'in seçeneklerini TAMAMEN DEĞİŞTİRİR — React sınıf bileşeni
// yasağı ve Prisma yasağı SESSİZCE kaybolur (grep yakalamaz, lint
// yakalamaz). Telafi: `restrictedImportsOptions` `base.js`'ten İMPORT
// EDİLİP burada BİRLEŞTİRİLİR (`mergeRestrictions`), kopyalanmaz.
import { restrictedImportsOptions } from '@arkesoft/config/eslint/base'
import { reactConfig } from '@arkesoft/config/eslint/react'

/**
 * `packages/ui` veri çekmez, hiçbir backend/tRPC paketine bağımlı değildir
 * (CLAUDE.md §3, AC14) — Button/Input/Card/Toast/DataTable yalnızca sunum.
 */
const uiBoundaryRestriction = {
  paths: [
    {
      name: '@arkesoft/trpc',
      message: "packages/ui veri çekmez, tRPC'ye bağımlı değildir (CLAUDE.md §3, AC14).",
    },
    {
      name: '@arkesoft/trpc/server',
      message: "packages/ui veri çekmez, tRPC'ye bağımlı değildir (CLAUDE.md §3, AC14).",
    },
    {
      name: '@arkesoft/api',
      message: "packages/ui apps/api'ye bağımlı olamaz (CLAUDE.md §3, AC14).",
    },
    {
      name: '@arkesoft/db',
      message: "packages/ui veritabanına/Prisma'ya bağımlı değildir (CLAUDE.md §3, AC14).",
    },
  ],
  patterns: [
    {
      group: [
        '@arkesoft/trpc/*',
        '@arkesoft/api/*',
        '@arkesoft/db/*',
        '@tanstack/*',
        '@tanstack/**',
      ],
      message:
        'packages/ui veri çekmez; tRPC/API/DB/@tanstack bağımlılığı AC14 tarafından yasaklı (CLAUDE.md §3).',
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

  // `vitest.config.ts` paketin KÖKÜNDE (`tsconfig.json`'ın `include`'ı
  // (`src/**/*`) DIŞINDA) — `base.js`'in TS_FILES bloğu `projectService: true`
  // ile EN YAKIN tsconfig'i arıyor ama bu dosya hiçbirinin `include`'ında
  // değil. `tsconfig.json`'ın `include`'ını genişletmek TERCİH EDİLMEDİ:
  // `rootDir: "src"` + `build` script'i (`tsc --declaration`) AYNI tsconfig'i
  // kullanıyor, kök düzeyi bir dosyayı dahil etmek derleme emisyonunu kırar
  // (TS6059 — dosya `rootDir` dışında).
  //
  // ÖLÇÜLDÜ (`DEBUG="typescript-eslint:typescript-estree:*"` ile): tek dosya
  // lint edilirken `parserOptions.projectService.allowDefaultProject` çalışıyor
  // ("Default project allowed path: true"), AMA `src/**` altındaki GERÇEK
  // tsconfig projesi AÇILDIKTAN SONRA (ör. `tokens.ts` ile birlikte lint
  // edilince) project service bu dosyayı o projeye ait SANIYOR ve
  // `allowDefaultProject`'i reddediyor ("Default project allowed path: false,
  // based on config file: tsconfig.json") — `pnpm lint` (paketin TÜMÜNÜ
  // tarıyor) bu ikinci yolu alıyor, tek-dosya denemesi YANILTICI. Telafi: bu
  // TEK, trivial config dosyası (tip bilgisi gerektirmeyen `defineConfig`
  // çağrısı) lint kapsamı DIŞINA alınır — `base.js`'in CONFIG_FILES
  // (`.mjs`/`.cjs`) için zaten uyguladığı "trivial kök config dosyası tip
  // bilgisine dayalı lint'ten muaf" ilkesinin aynısı; yeni bağımlılık
  // (`typescript-eslint` paketinin kendisi, `package.json` S1'in) veya
  // `tsconfig.json`'a dokunmadan çözülüyor.
  { ignores: ['vitest.config.ts'] },

  // Birleştirilmiş `no-restricted-imports` (base.js'in Prisma/React sınıf
  // bileşeni yasağı + AC14'ün paket sınırı, R-P1 telafisi) + `src` kapsamlı
  // ağ API'si yasağı: `packages/ui` veri çekmez (CLAUDE.md §3) — `fetch`/
  // `XMLHttpRequest` bu pakette hiç çağrılmaz.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(restrictedImportsOptions, uiBoundaryRestriction),
      ],
      'no-restricted-globals': ['error', 'fetch', 'XMLHttpRequest'],
    },
  },
]
