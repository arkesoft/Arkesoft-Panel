// @arkesoft/theme-sdk — tek giriş noktası (ROADMAP v0.0.9, T-010/S8,
// `packages/errors/src/index.ts` / `packages/tenancy/src/index.ts`
// deseninin devamı)
//
// Tüketiciler (bugün HİÇBİR paket/app yok — v0.1'in ilk sürümü, bkz. po'nun
// R-A riski; ileride `apps/*` ve `packages/themes/*`) HER ZAMAN bu dosyadan
// import eder, iç dosya yoluna (`./manifest/manifest.js`,
// `./settings/primitives.js` vb.) GİRMEZ. Paket manifestinin `exports`
// alanı da yalnızca `"."` tanımlar (`package.json`).
//
// ⚠ BU DOSYA TEK SAHİPLİDİR (S8) — S2–S7 her biri kendi modülünü yazdı ama
// barrel'a SATIR EKLEMEDİ (po'nun ataması: paylaşılsa ya aynı-dosya
// çakışması ya "henüz var olmayan modülü export eden kırık typecheck"
// doğardı). Aşağıdaki liste BİLİNÇLİ bir seçimdir — bu paketin genel
// (public) yüzeyi README'nin "Yapar" sütunuyla AYNI KAPSAMDADIR:
//   (1) sözleşme tipleri (ThemeManifest, sekiz ilkelin birleşimi,
//       şablon/slot, varlık referansı, migration tanımı)
//   (2) doğrulama fonksiyonları + ayrımlı birleşim sonuç tipleri
//       (validateThemeManifest/assertThemeManifest,
//       validateThemeSettings, validateMigrationChain, migrateThemeSettings)
//   (3) `defineTheme()` yazar yardımcısı
//   (4) hata/mesaj/yol sözleşmesi (ThemeContractError, mesaj tablosu,
//       path biçimlendirici) — tüketicinin `catch`/`result.issues` ile
//       etkileşimi için ZORUNLU
//
// ⚠ BİLİNÇLİ OLARAK DIŞARIDA BIRAKILANLAR (ölü export DEĞİL, sınır kararı):
//   - Ham Zod şemaları (`THEME_MANIFEST_SCHEMA`, `THEME_SETTING_DEFINITION_
//     SCHEMA`, `THEME_TEMPLATES_SCHEMA`, `THEME_ASSET_REF_SCHEMA`,
//     `schemaFromDefinitions()` vb.) — README'nin "Yapar" sütunu "Zod ile
//     DOĞRULAMA" der, "Zod şemasını DIŞA AÇMA" demez; bir Zod şema nesnesini
//     dışa açmak tüketiciyi bu paketin `zod` sürümüne/API'sine DOĞRUDAN
//     bağlar ve paketin KENDİ doğrulama fonksiyonlarını (validateThemeManifest
//     vb.) ATLAYIP şemayı KENDİ başına kullanmasına (ör. kendi `.parse()`
//     çağrısıyla farklı hata biçimi üretmesine) kapı açardı.
//   - `isUnsafeSettingKey`/`SETTING_KEY_SCHEMA` (settings/keys.ts) — AC6
//     katman 1'in iç uygulaması; tüketici bu kontrolle DOĞRUDAN
//     etkileşmez, `validateThemeManifest`/`defineTheme()` zinciri üzerinden
//     DOLAYLI olarak sonucunu (`THEME_SETTING_KEY_UNSAFE` issue'su) görür.
//   - `assertNever` (assert-never.ts) — paket-YEREL yardımcı (dosya başı
//     yorumu: beşinci kopya, platforma TERFİ bilinçli REDDEDİLDİ); dışa
//     açmak onu paketler-arası bir sözleşmeye çevirirdi, bu KARARA aykırı.
//   - `buildThemeContractJsonSchema` (json-schema.ts) — AŞAĞIDA ayrı başlıkta
//     gerekçelendirildi (bu turun kararı, eklenmedi).
//
// ⚠ `buildThemeContractJsonSchema` BARREL KARARI (bu turun gerekçesi,
// S7'nin notuna yanıt): EKLENMEDİ. İki tüketicisi de (`scripts/generate-
// contract-schema.ts`, `src/__tests__/contract-schema.test.ts`) BUGÜN ZATEN
// `../json-schema.js`'e GÖRELİ yoldan erişiyor ve bu KASITLI —
// `scripts/generate-contract-schema.ts` düz `node` ile (derlenmiş `dist/`
// olmadan) çalışır (V-PO1), `contract-schema.test.ts` ise AC12'nin "temiz
// ağaçta BİLE yeşil kalır" şartı için BİLEREK `src/`'ten (barrel/`dist/`
// ÜZERİNDEN DEĞİL) okur. Barrel'a eklemek bu iki çağrı sitesinden HİÇBİRİNİ
// değiştirmez (`dist/index.js` üzerinden erişime ihtiyaçları YOK) — yalnızca
// JSON Schema üretimini bu paketin ÇALIŞMA ZAMANI genel API'sinin bir
// parçası GİBİ göstererek platformun genel API semver yüzeyini (CLAUDE.md
// §9) erken BÜYÜTÜRDÜ. JSON Schema üretimi bugün bir BUILD-TIME/CI aracı
// kaygısıdır (bkz. `scripts/`'in "TEK I/O NOKTASI" rolü), tema
// yazarının/platformun ÇALIŞMA ZAMANI akışının bir parçası DEĞİLDİR — ileride
// bir tüketici (ör. `packages/ui`'nin şema→form motoru) gerçek bir çalışma
// zamanı ihtiyacıyla doğarsa barrel'a eklemek **additive**/minor bir
// genişlemedir, bugünden eklemek YOK.

// `PACKAGE_NAME`/`PackageName` — S1'in iskelet çıktısı (ROADMAP v0.0.1),
// bu turda TAŞINMADI/DEĞİŞTİRİLMEDİ, yalnızca barrel'ın GERİ KALANIYLA
// aynı dosyada KALDI (zaten tek satırlık bir sabitti, ayrı bir modüle
// çıkarmak bu boyutta bir SABİT için gereksiz dolaylama olurdu).

/** Paketin workspace içindeki adı. Sürüm bilgisi package.json'dan okunur. */
export const PACKAGE_NAME = '@arkesoft/theme-sdk'

/** {@link PACKAGE_NAME} değerinin literal tipi. */
export type PackageName = typeof PACKAGE_NAME

export {
  ThemeContractError,
  type ThemeContractErrorCode,
  type ThemeContractFailure,
  type ThemeContractIssue,
  type ThemeContractResult,
  type ThemeContractSuccess,
} from './errors.js'

export { THEME_CONTRACT_MESSAGES } from './messages.js'

export { formatThemeContractPath, type ThemeContractPathSegment } from './paths.js'

export { defineTheme, type ThemeDefinition } from './define-theme.js'

export { type ThemeManifest } from './manifest/manifest.js'

export {
  REQUIRED_THEME_TEMPLATE_TYPES,
  THEME_TEMPLATE_TYPES,
  type ThemeSlot,
  type ThemeTemplate,
  type ThemeTemplateType,
} from './manifest/templates.js'

export { type ThemeAssetRef } from './manifest/asset-ref.js'

export {
  assertThemeManifest,
  validateThemeManifest,
  type ThemeManifestValidationResult,
  type ThemeManifestValidationSuccess,
} from './manifest/validate-manifest.js'

export { type ThemeSettingDefinition, type ThemeSettingLeaf } from './settings/primitives.js'

export { type ThemeSettingsValue } from './settings/schema-from-definitions.js'

export { deriveDefaultSettings } from './settings/defaults.js'

export {
  validateThemeSettings,
  type ThemeSettingsValidationResult,
  type ThemeSettingsValidationSuccess,
} from './settings/validate-settings.js'

export { validateMigrationChain, type ThemeSettingsMigration } from './migrations/chain.js'

export { migrateThemeSettings } from './migrations/run.js'
