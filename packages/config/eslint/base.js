// Arkesoft ortak ESLint tabanı (flat config).
//
// Tip bilgisine dayalı (type-aware) katı kurallar açıktır; CLAUDE.md §4'teki
// standartları makine tarafından zorlar. Yeni kural eklerken gerekçesini yoruma yaz.

import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier/flat'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** TypeScript kaynak dosyası desenleri. */
const TS_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts']

/** Yapılandırma dosyaları — tip bilgisi olmadan lint edilir. */
const CONFIG_FILES = ['**/*.js', '**/*.mjs', '**/*.cjs']

/** Her pakette yoksayılan yollar. */
const IGNORES = [
  'dist/**',
  'build/**',
  '.turbo/**',
  '.astro/**',
  'coverage/**',
  'playwright-report/**',
  'test-results/**',
  '**/*.tsbuildinfo',
  // T-027/S4 (AC-47): AC-47 fixture'ları KASITLI olarak ihlal içerir (≥3
  // pozitif örnek `no-restricted-syntax`'ın float-para seçicilerini
  // yakalamak için var) — repo geneli `pnpm lint` bunlarla kırmızı olmasın.
  // Doğrulama elle yapılır: `eslint --no-ignore --config eslint.config.mjs
  // packages/config/eslint/__fixtures__/<dosya>.ts` (bu IGNORES'u atlar).
  'eslint/__fixtures__/**',
]

/**
 * `userMessageKey`/float-para AST seçicilerinin UYGULANMADIĞI dosya deseni —
 * yalnızca `__tests__` altı (T-027/S4, Seçenek (c)).
 *
 * KARAR (devops, ölçülmüş): `apps/api/src apps/storefront/src` DIŞINDA
 * `__tests__` dizinlerinde literal `userMessageKey: '...'` kullanımı **5
 * satırla sınırlı DEĞİL** — ölçüm: `packages/errors/src/__tests__/*`,
 * `packages/trpc/src/__tests__/harness.ts` ve `apps/api/src/__tests__/*`
 * toplam **27+ satır** AppError'ı doğrudan literal anahtarla kuruyor (gerçek
 * katalog anahtarlarını YENİDEN KULLANAN testler dahil — `AppErrorOptions.
 * userMessageKey` tipi kasıtlı olarak `string` (bkz. `app-error.ts:52`), kapalı
 * kümeye (`ErrorMessageKey`) bağlanmamış, çünkü test harness'ı rastgele kod/
 * anahtar kombinasyonlarını izole test etmek için literal yazmak ZORUNDA).
 * Seçenek (b) (5 satıra `eslint-disable-next-line`) bu yüzden ELENDİ: gerçek
 * sayı 5 değil, ve dokunulacak dosyalar (`packages/errors`, `packages/trpc`)
 * bu alt görevin dosya listesinde YOK.
 *
 * Seçilen Seçenek (c): kural yalnızca üretim yollarına uygulanır. Güvenlik
 * ağı zaten kurulu — ölçüldü: `grep -rln "userMessageKey: '" apps packages`
 * (dist ve `__tests__` hariç) → **0 eşleşme** (S3 sonrası). `errors.probe.*` /
 * `errors.test.*` / `errors.sample.*` gibi sentetik test anahtarlarının kapalı
 * 35'lik kümede OLMADIĞI `errorMessageKeySchema.safeParse(...)` ile zaten
 * ispatlı (S2) — bir test dosyasına gizlenmiş GERÇEK üretim literali bu yüzden
 * anlamsız: kullanıcıya hiçbir zaman ulaşmaz (test kodu üretime derlenmez) ve
 * katalog drift testi (AC-45) gerçek anahtarları zaten korur.
 */
const PRODUCTION_ONLY_IGNORES = ['**/__tests__/**']

/**
 * `no-restricted-imports` kuralının seçenek nesnesi. Ayrı bir sabit olarak
 * dışa açılır ki `packages/db/eslint.config.mjs`'teki K-E12 dosya kapsamlı
 * istisnası (`src/client.ts`) bu listeyi **kopyalamadan** filtreleyerek
 * yeniden kullanabilsin (yalnızca `@prisma/adapter-pg` girdisi çıkarılır,
 * `@prisma/client`/`.prisma/client` yasağı o dosyada da yürürlükte kalır).
 * Liste burada değişirse istisna otomatik senkron kalır — iki kopya elle
 * eşitlenmez.
 */
const restrictedImportsOptions = {
  paths: [
    {
      name: 'react',
      importNames: ['Component', 'PureComponent'],
      message:
        'Sınıf tabanlı React bileşeni yasak (CLAUDE.md §2). Fonksiyon bileşeni + hook kullan.',
    },
    {
      name: '@prisma/client',
      message: 'Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3).',
    },
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
      group: ['@prisma/client/*', '.prisma/client', '.prisma/client/*'],
      message: 'Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3).',
    },
    {
      group: ['pg/*'],
      message:
        'Ham bağlantı havuzu kuran bir apps/* dosyası withTenant() çağrısını tamamen atlar; Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3).',
    },
  ],
}

/**
 * `$executeRawUnsafe` / `$queryRawUnsafe` yasağının AST seçicileri (K-E12,
 * T-005). TÜM TS dosyalarında geçerli — test dosyaları da ham SQL kaçışını
 * kullanmamalı, bu yüzden `PRODUCTION_ONLY_IGNORES` kapsamı DIŞINDA tutulur
 * (bkz. `arkesoftRules['no-restricted-syntax']`).
 *
 * @type {{selector: string, message: string}[]}
 */
const rawSqlRestrictedSyntaxSelectors = [
  {
    selector: 'MemberExpression[property.name=/^\\$(execute|query)RawUnsafe$/]',
    message:
      '$executeRawUnsafe / $queryRawUnsafe yasak (CLAUDE.md §2, K-E12): dize birleştirmeye açık, tenant izolasyonunu atlatabilir. Etiketli şablon ($queryRaw) veya parametreli set_config kullan.',
  },
  {
    selector: 'MemberExpression[computed=true][property.value=/^\\$(execute|query)RawUnsafe$/]',
    message:
      '$executeRawUnsafe / $queryRawUnsafe yasak (CLAUDE.md §2, K-E12): hesaplanmış (computed) erişimle de çağrılamaz — dize birleştirmeye açık, tenant izolasyonunu atlatabilir. Etiketli şablon ($queryRaw) veya parametreli set_config kullan.',
  },
]

/**
 * `userMessageKey` literal yasağı (ROADMAP v0.0.18, T-027/S4). Üretim kodu
 * artık `ERROR_MESSAGE_KEYS.<KOD>` (`@arkesoft/errors`) kayıt defterinden
 * okur (S2/S3) — bir `Property` düğümünün DOĞRUDAN bir `Literal` çocuğu
 * olması, defter atlanıp ham dize yazıldığı anlamına gelir.
 *
 * ⚠ AST SEÇİCİSİ, GREP DEĞİL (T-026'nın kayıtlı `low` bulgusu): bu seçici
 * `Property` düğüm TÜRÜNÜ ve çocuğunun `Literal` TÜRÜNÜ denetler, dosya
 * metninde "userMessageKey" alt dizesini aramaz — bu yüzden bu seçicinin
 * KENDİSİ (bu dosyadaki `selector` alanı) veya bir yorum/dokümantasyon
 * jetonu bitişik yazsa bile kendi kendine yanlış-pozitif üretmez
 * (AGENT_BASELINE §5 literal-jeton kuralı `grep`/`find` temelli tarayıcılar
 * için bağlayıcı; bu kontrol AST temelli olduğu için o sınıfa girmiyor).
 *
 * @type {{selector: string, message: string}}
 */
const userMessageKeyLiteralSelector = {
  selector: "Property[key.name='userMessageKey'] > Literal",
  message:
    'userMessageKey literal yazımı yasak (CLAUDE.md §4, ROADMAP v0.0.18): ERROR_MESSAGE_KEYS.<KOD> (@arkesoft/errors) kayıt defterinden oku. Literal yazım defterle senkron kalmaz ve katalog drift testini (AC-45) atlar.',
}

/**
 * Float para yasağının isim deseni — TEK DOĞRULUK KAYNAĞI (T-027/S4,
 * architect kararı). Üç AST seçicisi bu sabitten ŞABLON DİZESİYLE üretilir;
 * üç ayrı kopya üç ayrı drift kaynağı olurdu (bkz. `MONEY_NAME_SOURCE`
 * referanslarının `grep -rn` ile tekliği — DoD'de doğrulanır).
 *
 * ⚠ DÜRÜST SINIR (yazılı kalacak, saklanmayacak — architect): bu yalnızca bir
 * İSİM SEZGİSİDİR. `const price: number = someFloatVar` YAKALANMAZ (ifade
 * bir `Literal` değil, bir `Identifier`) — bu BİLİNÇLİ: deseni `number`
 * TİPİNE genişletmek yanlış-pozitifleri patlatırdı (`totalCount`,
 * `discountPercent` gibi parasal OLMAYAN `number` alanları). Para
 * SAKLAMA ekseni (şema/DB kolonu) bu seçicinin kapsamı DIŞINDA — AC-48
 * (S6, `packages/db` şema taraması) o ekseni kapatıyor; bugün para kolonu
 * sıfır. İsim deseni ayrıca iki yönlü risk taşır (R-3, `po`): hem
 * yanlış-pozitif (ör. parasal olmayan ama "Fee" içeren bir alan) hem
 * yanlış-negatif (para anlamına gelen ama bu desene uymayan bir isim,
 * ör. `unitPriceInCents` zaten "Price" içerdiği için yakalanır ama tamamen
 * farklı adlandırılmış bir para alanı yakalanmaz) mümkündür.
 */
const MONEY_NAME_SOURCE =
  '(?:[Pp]rice|[Aa]mount|[Cc]ost|[Ff]ee|[Tt]otal|[Bb]alance|[Ss]alary|[Pp]ayment)'

/**
 * Float para yasağının üç AST seçicisi (T-027/S4, architect'in verdiği üç
 * seçici lafzı birebir — AC-47). `MONEY_NAME_SOURCE`'tan şablon diziyle
 * üretilir, elle kopyalanmaz.
 *
 * @type {{selector: string, message: string}[]}
 */
const moneyRestrictedSyntaxSelectors = [
  {
    selector: `VariableDeclarator[id.name=/${MONEY_NAME_SOURCE}/] > Literal[raw=/^[0-9]*\\.[0-9]+$/]`,
    message:
      'Float para literali yasak (CLAUDE.md §2/§10: para tamsayı kuruş + Money değer nesnesi). Tamsayı kuruş + @arkesoft/i18n Money.of(...) kullan.',
  },
  {
    selector: `Property[key.name=/${MONEY_NAME_SOURCE}/] > Literal[raw=/^[0-9]*\\.[0-9]+$/]`,
    message:
      'Float para literali yasak (CLAUDE.md §2/§10: para tamsayı kuruş + Money değer nesnesi). Tamsayı kuruş + @arkesoft/i18n Money.of(...) kullan.',
  },
  {
    selector: `CallExpression[callee.property.name='toFixed'][callee.object.name=/${MONEY_NAME_SOURCE}/]`,
    message:
      'Para alanında .toFixed() yasak (CLAUDE.md §2/§10: float ile para hesaplanmaz). Biçimlendirme için @arkesoft/i18n formatMoney(...) kullan.',
  },
]

/**
 * Arkesoft'a özgü kurallar. Tüm paketlerde geçerlidir.
 *
 * @satisfies {import('eslint').Linter.RulesRecord}
 */
const arkesoftRules = {
  // --- Yasaklar (CLAUDE.md §2) ---
  // `any` yasak. Kaçınılmazsa satır bazlı disable + gerekçe yorumu zorunlu.
  '@typescript-eslint/no-explicit-any': 'error',
  // Tip zorlama yalnızca runtime doğrulamasından sonra; gereksizini yakala.
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  // console.* yerine enjekte edilen logger kullanılır.
  'no-console': 'error',
  // Sınıf tabanlı React bileşeni yasak; React.Component'a erişimi kes.
  // Prisma istemcisi yalnızca @arkesoft/db üzerinden tüketilir (CLAUDE.md §3,
  // T-001/AC4) — apps/* ve diğer packages/* doğrudan @prisma/client import
  // edemez; @arkesoft/db kendi iç #prisma subpath dolaylamasıyla muaf tutulur
  // (bu kural eslint "no-restricted-imports" kapsamında istisna tanımlamaz,
  // @arkesoft/db @prisma/client'ı hiç import etmez — #prisma kullanır).
  //
  // K-E12 (T-005, v0.0.13): ham Postgres bağlantı havuzu (`pg`, `pg-pool`,
  // `pg-native`) veya sürücü adaptörü (`@prisma/adapter-pg`) kuran bir
  // `apps/*` dosyası `withTenant()`'ı TAMAMEN atlar — RLS/rol ayrımı o
  // bağlantı için hiç devreye girmez. Bu dört paket yalnızca
  // `packages/db/src/client.ts` içinde MEŞRU (dosya kapsamlı istisna orada
  // tanımlı, bkz. packages/db/eslint.config.mjs).
  'no-restricted-imports': ['error', restrictedImportsOptions],

  // K-E12 (T-005, v0.0.13): `$executeRawUnsafe` / `$queryRawUnsafe` dize
  // birleştirmeye/şablon literaline açık — GUC yazımı ve tenant kapsamlı
  // sorgular yalnızca etiketli şablon (`$queryRaw`) veya parametreli
  // `set_config` ile yapılır (A-E4, K-E7).
  //
  // FIX turu 1 (T-005 security gate, S1): yalnızca NOKTA erişimini
  // (`client.$queryRawUnsafe(...)`) yakalayan tek seçici, HESAPLANMIŞ erişimle
  // (`client['$queryRawUnsafe'](...)`) atlatılabiliyordu — o biçimde
  // `property.name` YOK (`property.value` var), ilk seçici eşleşmiyor. İkinci
  // seçici `computed=true` + `property.value` ile aynı yasağı hesaplanmış
  // erişimde de zorlar; ilk seçici DEĞİŞMEDİ (gerileme yok, mevcut nokta
  // erişimi yakalaması korunuyor).
  //
  // Bu iki seçici `rawSqlRestrictedSyntaxSelectors` sabitine taşındı (T-027/S4)
  // ki TÜM TS dosyalarında (test dahil) geçerli kalsın — aşağıdaki
  // `userMessageKey`/float-para seçicileri ise yalnızca üretim yollarında
  // (`PRODUCTION_ONLY_IGNORES` dışındaki dosyalarda) uygulanır, bkz.
  // `createBaseConfig` içindeki ikinci TS_FILES bloğu.
  'no-restricted-syntax': ['error', ...rawSqlRestrictedSyntaxSelectors],

  // --- Dışa açılan yüzey (CLAUDE.md §4: dönüş tipleri açık yazılır) ---
  '@typescript-eslint/explicit-module-boundary-types': 'error',

  // --- Hata yönetimi (CLAUDE.md §4) ---
  // Hata yutmak yasak: boş blok, boş catch.
  'no-empty': ['error', { allowEmptyCatch: false }],
  // Beklenmeyen hata sessizce kaybolmasın.
  '@typescript-eslint/only-throw-error': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',

  // --- Exhaustive switch (CLAUDE.md §4: discriminated union + assertNever) ---
  '@typescript-eslint/switch-exhaustiveness-check': [
    'error',
    { considerDefaultExhaustiveForUnions: true },
  ],

  // --- Genel hijyen ---
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
  'prefer-const': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      args: 'all',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'all',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    },
  ],
  // import type / export type ayrımı net olsun (verbatimModuleSyntax ile uyumlu).
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],

  // --- Projeye uymayan stil varsayılanlarını kapat ---
  // CLAUDE.md `type` ve `interface`'i amaca göre serbest bırakıyor.
  '@typescript-eslint/consistent-type-definitions': 'off',
}

/**
 * CLAUDE.md §4'teki isimlendirme tablosunu zorlayan kurallar.
 *
 * @satisfies {import('eslint').Linter.RulesRecord}
 */
const namingRules = {
  '@typescript-eslint/naming-convention': [
    'error',
    // Tip, arayüz, sınıf, enum: PascalCase
    { selector: 'typeLike', format: ['PascalCase'] },
    // Sabit ve değişken: camelCase, SCREAMING_SNAKE_CASE veya PascalCase (React bileşeni)
    {
      selector: 'variable',
      format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
      leadingUnderscore: 'allow',
    },
    // Fonksiyon: camelCase veya PascalCase (React bileşeni)
    { selector: 'function', format: ['camelCase', 'PascalCase'] },
    // Parametre: camelCase, kullanılmayan için _ öneki
    { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
    // Dış sistemlerden gelen nesne anahtarları (snake_case, header adları) serbest.
    { selector: 'objectLiteralProperty', format: null },
    { selector: 'typeProperty', format: null },
  ],
}

/**
 * Bir paket için ESLint flat config dizisi üretir.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir Paketin kök dizini (`import.meta.dirname`).
 * @param {Record<string, boolean | 'readonly' | 'writable' | 'off'>} [options.globals]
 *   Ek global tanımları (Node, tarayıcı vb.).
 * @param {import('typescript-eslint').ConfigWithExtends[]} [options.overrides]
 *   Pakete özgü ek config blokları.
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function createBaseConfig({ tsconfigRootDir, globals: extraGlobals = {}, overrides = [] }) {
  return tseslint.config(
    { ignores: IGNORES },

    // --- TypeScript kaynakları: tip bilgisine dayalı katı kurallar ---
    {
      files: TS_FILES,
      extends: [
        js.configs.recommended,
        tseslint.configs.strictTypeChecked,
        tseslint.configs.stylisticTypeChecked,
      ],
      languageOptions: {
        parserOptions: {
          // Her dosya için en yakın tsconfig.json otomatik bulunur.
          //
          // `allowDefaultProject` (T-027/S4): `eslint/__fixtures__/*.ts`
          // (AC-47'nin pozitif/negatif float-para fikstürleri) hiçbir
          // `tsconfig.json`'ın `include`'unda değil — bu glob olmadan
          // `--no-ignore` ile elle koşturulduklarında "was not found by the
          // project service" parse hatası verirler. Desen GÖRECELİ
          // (`tsconfigRootDir`'e göre); `packages/config` dışındaki hiçbir
          // paket bu dizine sahip olmadığı için başka paketi etkilemez.
          projectService: { allowDefaultProject: ['eslint/__fixtures__/*.ts'] },
          tsconfigRootDir,
        },
        globals: extraGlobals,
      },
      rules: { ...arkesoftRules, ...namingRules },
    },

    // --- `userMessageKey` literal + float-para yasağı: YALNIZCA üretim
    // yolları (T-027/S4, Seçenek (c)) ---
    // `__tests__` altı HARİÇ tutulur: AppError/float para test fikstürleri
    // bu dizinlerde literal yazmak ZORUNDA (bkz. `PRODUCTION_ONLY_IGNORES`
    // başı yorumu — ölçülmüş gerekçe). `files`/`ignores` kombinasyonu bu
    // bloğun sadece eşleşen-ve-ignore-edilmeyen TS dosyalarına uygulanmasını
    // sağlar; ESLint flat config'te aynı kural adı için SONRAKİ blok ÖNCEKİNİ
    // TAMAMEN GEÇERSİZ KILAR (merge değil) — bu yüzden `rawSqlRestrictedSyntaxSelectors`
    // burada TEKRAR dahil edilir, yoksa üretim dosyalarında ham SQL yasağı
    // kaybolurdu.
    {
      files: TS_FILES,
      ignores: PRODUCTION_ONLY_IGNORES,
      rules: {
        'no-restricted-syntax': [
          'error',
          ...rawSqlRestrictedSyntaxSelectors,
          userMessageKeyLiteralSelector,
          ...moneyRestrictedSyntaxSelectors,
        ],
      },
    },

    // --- Yapılandırma dosyaları (.mjs): tip bilgisi olmadan ---
    {
      files: CONFIG_FILES,
      extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
      languageOptions: {
        globals: globals.nodeBuiltin,
      },
      rules: {
        'no-console': 'off',
      },
    },

    // Prettier ile çakışan biçimlendirme kuralları en sonda kapatılır.
    prettierConfig,

    ...overrides,
  )
}

export { IGNORES, TS_FILES, CONFIG_FILES, restrictedImportsOptions }
