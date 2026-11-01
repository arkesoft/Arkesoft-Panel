// Tarayıcı/React tarafı paketler için ESLint preset'i
// (apps/admin, apps/superadmin, apps/storefront, packages/ui).
//
// GÜNCELLEME (ROADMAP v0.0.7, T-008/S1 — kullanıcı onayı 2026-10-31): bu
// dosyanın önceki hâlindeki "v0.0.7'de eklenecek" taahhüdü GERÇEKLEŞTİ.
// React'e özgü eklentiler React bağımlılığıyla birlikte eklendi:
//   - eslint-plugin-react-hooks: typecheck'in GÖREMEDİĞİ bir hata sınıfını
//     yakalar (bayat closure, koşullu hook çağrısı, eksik bağımlılık dizisi).
//   - eslint-plugin-jsx-a11y: ilk React kodu yazılırken mekanik erişilebilirlik
//     kapsamı verir; `wcag` gate'i ilk kez bu sürümde koşuyor — lint zamanında
//     yakalamak gate turunda yakalamaktan ucuz (PO kararı, T-008).
// İKİSİ DE AC10–AC13'ün DAYANAĞI DEĞİL (o kriterler bağımlılıksız ölçülebilir
// yazıldı) — bu eklentiler EK güvence, tek savunma hattı değiller.
//
// Her ikisinin de resmî flat-config (ESLint 9+) ihracı kullanılıyor —
// eskiye dönük (eslintrc) "extends" dizisi DEĞİL:
//   - react-hooks: `configs.flat['recommended-latest']` (plugins + rules,
//     flat-config şekilli; eskiye dönük `configs.recommended` STRING dizili
//     `plugins` taşıyor — flat config'te GEÇERSİZ).
//   - jsx-a11y: `flatConfigs.recommended` (plugins + rules + languageOptions;
//     eskiye dönük `configs.recommended` da aynı sebeple kullanılmadı).
// `languageOptions.parserOptions` burada eklenen `ecmaFeatures.jsx` ile
// base.js'in TS_FILES bloğundaki `projectService`/`tsconfigRootDir` AYNI
// dosya kümesinde eşleşiyor — ESLint flat config bunları SİLMEZ, anahtar
// bazında BİRLEŞTİRİR (documented merge behavior), ikisi çakışmıyor.
//
// BİLİNEN UYARI (devops raporunda ayrıntı, bkz. pnpm-workspace.yaml):
// eslint-plugin-jsx-a11y@6.10.2 (2024'ten beri güncellenmedi) peer'ında
// ESLint 10'u listelemiyor (`^3...^9`) — `pnpm install` bunu YALNIZCA UYARI
// olarak raporluyor (strict-peer-dependencies kurulumu DURDURMUYOR), preset
// gerçekten ÇALIŞIYOR (`pnpm lint` ile ölçüldü).
//
// NEDEN `require` (ESM statik `import` DEĞİL): bu paket "type: module" olsa
// da iki eklenti `checkJs` altında (`tsconfig.json`) tip hatası üretiyordu —
// `eslint-plugin-jsx-a11y` HİÇ `.d.ts` taşımıyor (TS7016, resmî `@types/*`
// paketi yok) ve `eslint-plugin-react-hooks`'un KENDİ `.d.ts`'i flat config
// `plugins` alanını YANLIŞ anahtarla tipliyor (`{ react: any }`; gerçek
// çalışma zamanı şekli `{ 'react-hooks': ... }` — ÖLÇÜLDÜ, upstream hata).
// `any`/`@ts-ignore` ile SUSTURULMUYOR (CLAUDE.md §2/§10): `createRequire`
// ile yükleme `NodeRequire`'ın kendi `any` dönüşünü kullanır, ama
// `asFlatPluginConfig` o değeri RUNTIME'DA doğrulayıp (plugins/rules
// alanlarının varlığı) ANCAK doğrulamadan SONRA somut tipe daraltır
// (CLAUDE.md §4: "tip zorlama yalnızca runtime doğrulamasından hemen sonra").
import { createRequire } from 'node:module'

import globals from 'globals'

import { createBaseConfig, TS_FILES } from './base.js'

// DEĞİŞKEN ADI BİLEREK "require" DEĞİL: TypeScript "module: NodeNext"
// altında metinsel olarak "require(...)" çağrısını (değişken adı HERHANGİ
// bir bağlamda olsa) ÖZEL bir CJS-interop sözdizimi olarak ele alıp GERÇEK
// modül çözümlemesi deniyor — tam da kaçınmak istediğimiz TS7016/upstream
// tip hatasını YENİDEN üretiyordu (ÖLÇÜLDÜ). Farklı bir ad bu özel sözdizimi
// algısını devre dışı bırakıyor; çalışma zamanı davranışı AYNI
// (`createRequire`'ın döndürdüğü gerçek CJS `require` fonksiyonu).
const loadCjsModule = createRequire(import.meta.url)

/**
 * @typedef {{
 *   plugins: Record<string, import('eslint').ESLint.Plugin>
 *   rules: import('eslint').Linter.RulesRecord
 *   languageOptions?: import('eslint').Linter.LanguageOptions
 * }} FlatPluginConfig
 */

/**
 * @param {unknown} value
 * @returns {FlatPluginConfig}
 */
function asFlatPluginConfig(value) {
  if (typeof value !== 'object' || value === null || !('plugins' in value) || !('rules' in value)) {
    throw new Error(
      'Beklenmeyen ESLint eklenti flat-config şekli (packages/config/eslint/react.js)',
    )
  }
  return /** @type {FlatPluginConfig} */ (value)
}

/**
 * `noUncheckedIndexedAccess` altında `Record<string, T>` erişimi `T |
 * undefined` döner — `!` ile susturmak yerine burada da RUNTIME kontrolü
 * yapılıp ancak eklenti gerçekten bulunduğunda tipe daraltılıyor.
 *
 * @param {Record<string, import('eslint').ESLint.Plugin>} plugins
 * @param {string} key
 * @returns {import('eslint').ESLint.Plugin}
 */
function requirePlugin(plugins, key) {
  const plugin = plugins[key]
  if (!plugin) {
    throw new Error(`ESLint eklentisi bulunamadı: "${key}" (packages/config/eslint/react.js)`)
  }
  return plugin
}

/**
 * `exactOptionalPropertyTypes` altında isteğe bağlı bir alana `undefined`
 * DEĞERİNİ açıkça atamak (anahtarın HİÇ olmamasından farklı) tip hatası
 * üretir — burada da aynı "runtime kontrol → daraltma" deseni: jsx-a11y'nin
 * `flatConfigs.recommended`'ı HER ZAMAN `languageOptions` taşıyor (ÖLÇÜLDÜ),
 * bu fonksiyon bunu doğrulayıp kesin (non-undefined) tipe daraltıyor.
 *
 * @param {FlatPluginConfig} config
 * @returns {import('eslint').Linter.LanguageOptions}
 */
function requireLanguageOptions(config) {
  if (!config.languageOptions) {
    throw new Error('Beklenen languageOptions bulunamadı (packages/config/eslint/react.js)')
  }
  return config.languageOptions
}

const reactHooksModule = loadCjsModule('eslint-plugin-react-hooks')
const jsxA11yModule = loadCjsModule('eslint-plugin-jsx-a11y')

const reactHooksFlatConfig = asFlatPluginConfig(reactHooksModule.configs.flat['recommended-latest'])
const jsxA11yFlatConfig = asFlatPluginConfig(jsxA11yModule.flatConfigs.recommended)

/**
 * @param {string} tsconfigRootDir Paketin kök dizini (`import.meta.dirname`).
 * @returns {import('typescript-eslint').ConfigArray}
 */
export function reactConfig(tsconfigRootDir) {
  return createBaseConfig({
    tsconfigRootDir,
    globals: { ...globals.browser, ...globals.es2023 },
    overrides: [
      {
        files: TS_FILES,
        plugins: {
          'react-hooks': requirePlugin(reactHooksFlatConfig.plugins, 'react-hooks'),
          'jsx-a11y': requirePlugin(jsxA11yFlatConfig.plugins, 'jsx-a11y'),
        },
        languageOptions: requireLanguageOptions(jsxA11yFlatConfig),
        rules: {
          ...reactHooksFlatConfig.rules,
          ...jsxA11yFlatConfig.rules,
        },
      },
    ],
  })
}

export default reactConfig
