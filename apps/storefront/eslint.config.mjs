// @arkesoft/storefront — ESLint flat config (ROADMAP v0.0.8, T-009/S3, devops K14)
//
// R-P1 TUZAĞI (BAĞLAYICI — `apps/admin/eslint.config.mjs:1-9` deseni birebir
// devralındı): flat config'te aynı dosyaya uygulanan İKİNCİ
// `no-restricted-imports`, `base.js`'in seçeneklerini TAMAMEN DEĞİŞTİRİR —
// React sınıf bileşeni yasağı ve Prisma yasağı SESSİZCE kaybolur (grep
// yakalamaz, lint yakalamaz). Telafi: `restrictedImportsOptions` `base.js`'ten
// İMPORT EDİLİP burada BİRLEŞTİRİLİR (`mergeRestrictions`), kopyalanmaz.
import { restrictedImportsOptions } from '@arkesoft/config/eslint/base'
import { reactConfig } from '@arkesoft/config/eslint/react'

/**
 * `@arkesoft/trpc/server` sunucu-taraflı resolver/port/handler grafiğini
 * taşır (ADR-0009 §6); AC11'in "allowBatching:false atlanmaz, HTTP + guard
 * zinciri her zaman devrede" garantisinin lint tarafı. Storefront yalnızca
 * kök alt yoldan (`@arkesoft/trpc`) import eder.
 */
const trpcServerRestriction = {
  paths: [
    {
      name: '@arkesoft/trpc/server',
      message:
        'Sunucu alt yolu storefront grafiğine girmez (ADR-0009 §6). Yalnızca kök alt yoldan (@arkesoft/trpc) import et.',
    },
  ],
  patterns: [
    {
      group: ['@arkesoft/trpc/server/*'],
      message:
        'Sunucu alt yolu storefront grafiğine girmez (ADR-0009 §6). Yalnızca kök alt yoldan (@arkesoft/trpc) import et.',
    },
  ],
}

/**
 * AC10'un ikinci savunma hattı: `@arkesoft/db` storefront koduna hiç girmez
 * (yapısal garanti zaten `package.json`'da — bu paket ne `dependencies`'te
 * ne `devDependencies`'te; ithal etmek `pnpm` çözümlemesinde kırılır).
 * `@prisma/client` yasağı `restrictedImportsOptions` (base.js) içinde ZATEN
 * VAR — burada TEKRAR eklenmez: `no-restricted-imports`'un şeması
 * `paths`/`patterns` dizilerinde `uniqueItems: true` ister, aynı
 * {name,message} çiftini ikinci kez eklemek ESLint'i konfigürasyon
 * doğrulama hatasıyla (anyOf şema uyuşmazlığı) ÇÖKERTİR — ölçüldü (kasıtlı
 * ihlal denemesinde yakalandı). `mergeRestrictions` zaten `base.js`'in
 * tam listesini taşıyor; burada SADECE storefront'a özgü EK girdi eklenir.
 */
const dbRestriction = {
  paths: [
    {
      name: '@arkesoft/db',
      message:
        'Storefront veritabanına doğrudan dokunmaz (AC10); kiracı verisi yalnızca sunucu-taraflı tRPC çağrısıyla gelir.',
    },
  ],
  patterns: [
    {
      group: ['@arkesoft/db/*'],
      message: 'Storefront veritabanına doğrudan dokunmaz (AC10); CLAUDE.md §3.',
    },
  ],
}

/**
 * K14'ün ada ithal kısıtı: `src/components/**` (React adaları, tarayıcıda
 * koşar) `storefront-env`/`api-client`'ı (sunucu-taraflı modüller) ITHAL
 * EDEMEZ. Yalnızca GÖRELİ yol (`.js` uzantılı/uzantısız, her derinlikten
 * `../lib/...`) kapsanır — bu paket `@arkesoft/*` takma adı (path alias)
 * TANIMLAMIYOR (`tsconfig.json`'da yok), paket-adı ithali bu modüllere zaten
 * mümkün değil. `**` glob'u (ignore/minimatch) sıfır-veya-daha-fazla yol
 * bileşenini kapsar; aşağıda PROB'LA (geçici ada, bkz. handoff kanıtı)
 * DOĞRULANDI.
 */
const islandEnvAccessRestriction = {
  patterns: [
    {
      group: ['**/storefront-env', '**/storefront-env.js'],
      message:
        'Adalar (src/components/**) storefront-env ithal edemez (K14, CLAUDE.md §4): env okuma SUNUCUYA özgüdür (K17) — ada veriyi PROP olarak alır.',
    },
    {
      group: ['**/api-client', '**/api-client.js'],
      message:
        'Adalar (src/components/**) api-client ithal edemez (K14, CLAUDE.md §4): veri çekme SUNUCU TARAFINDA (middleware/sayfa) yapılır — ada veriyi PROP olarak alır.',
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

  // Birleştirilmiş `no-restricted-imports` (base.js'in Prisma/React sınıf
  // bileşeni yasağı + trpc/server yasağı + db yasağı, R-P1 telafisi) —
  // TÜM `src/**` için geçerli. K14'ün ada kısıtı BURADA YOK (bilerek) —
  // `src/lib/storefront-env.ts` ve `src/middleware.ts` bu modülleri
  // okumaya HAKLI (K17); kısıt aşağıdaki `src/components/**` bloğunda.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(restrictedImportsOptions, trpcServerRestriction, dbRestriction),
      ],
    },
  },

  // K14 + R-P1 TUZAĞI: flat config'te aynı dosyaya uygulanan İKİNCİ
  // `no-restricted-imports`, öncekini BİRLEŞTİRMEZ, TAMAMEN DEĞİŞTİRİR —
  // bu blok `src/components/**` için yukarıdaki bloğun YERİNE geçer. Bu
  // yüzden burada SADECE `islandEnvAccessRestriction` değil, Prisma/trpc/db
  // kısıtlarının TAMAMI da (`mergeRestrictions` ile) TEKRAR birleştirilir —
  // aksi halde adalarda `@prisma/client`/`@arkesoft/trpc/server`/
  // `@arkesoft/db` ithali SESSİZCE serbest kalırdı (ölçüldü: bkz. handoff
  // "R-P1 KANITI").
  //
  // `no-restricted-globals` YALNIZCA `src/components/**` — storefront bir
  // SUNUCUDUR (`apps/admin`'in `src/**` kapsamı burada YANLIŞ OLURDU):
  // `src/lib/storefront-env.ts` (K17) `process.env`'i okumak ZORUNDADIR.
  // Kapsamı React adalarına daraltmak, AC11'in "dist/client sır 0"
  // garantisinin YAPISAL karşılığıdır — tarayıcıya giden kod `process`/
  // `Buffer`/`__dirname`/`__filename` kullanamaz.
  //
  // İKİ KURAL, İKİ FARKLI ŞEY YAKALAR: `no-restricted-imports` (bu blok)
  // `storefront-env`/`api-client` MODÜL İTHALİNİ yakalar (K14) — ithal edip
  // hiç kullanmasa da hata verir. `no-restricted-globals` ise `process` vb.
  // DOĞRUDAN KULLANIMINI yakalar — ikisi birbirinin yedeği değil, ikisi de
  // gerekli (ör. üçüncü bir modül `process.env`'i sarıp adaya export etseydi,
  // yalnızca import kısıtı onu yakalardı; globals kısıtı o modülün
  // KENDİSİNDE devrede olurdu, adada değil).
  {
    files: ['src/components/**/*.ts', 'src/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        mergeRestrictions(
          restrictedImportsOptions,
          trpcServerRestriction,
          dbRestriction,
          islandEnvAccessRestriction,
        ),
      ],
      'no-restricted-globals': ['error', 'process', 'Buffer', '__dirname', '__filename'],
    },
  },

  // Storefront bu sürümde uygulama logu üretmez (K11; borç vade v0.0.10) —
  // `console.*` tüm kaynak ağacında yasak.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-console': 'error',
    },
  },
]
