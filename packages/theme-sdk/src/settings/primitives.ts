// @arkesoft/theme-sdk — sekiz ayar ilkeli (ROADMAP v0.0.9, T-010/S3,
// architect "Ayar şeması ilkelleri" + V5 "group derinlik-1" kararı,
// ADR-0013 taslağı)
//
// ⚠ GRUP DERİNLİK-1 (V5, BAĞLAYICI) — gerekçe ölçülmüş, architect'in Teknik
// Tasarım bölümünden: özyinelemeli bir `group` tanımı (`group` içinde
// `group`) Zod şemasını `z.lazy()` ile kurmaya zorlardı. `z.lazy()` bir
// döngü referansı (`seen.cycle`) doğurur; `z.toJSONSchema()` (S7'nin işi)
// bu döngüyü çözmek için şemayı `$defs`'e çıkarıp OTOMATİK `__schemaN`
// adları üretir — bu da AC12'nin BAYT KARŞILAŞTIRMASINI (generator ve
// bayatlık testinin AYNI Prettier-uyumlu çıktıyı üretmesi gerekliliği)
// kırılgan hâle getirir (otomatik ad üretimi çalıştırma sırasına
// duyarlıdır, deterministik GARANTİ DEĞİLDİR). Bu yüzden `group`'un
// çocukları YALNIZCA "yaprak" (leaf — `group` OLMAYAN) ilkelleri kabul
// eder. Bu kısıt tip SEVİYESİNDE derleyici tarafından ZORLANIR
// ({@link THEME_SETTING_LEAF_SCHEMA} `group`'u İÇERMEZ), yalnızca çalışma
// zamanında DEĞİL. İç içe grup desteği ileride **minor** bir genişlemedir
// (yeni bir ilkel eklemek gibi kapsam, kırıcı değil).
//
// ⚠ Başka ilkelde `group?: string` alanı YOK — bir ayarın bir gruba AİT
// OLMASI yalnızca `group.children` dizisinde YER ALMASIYLA ifade edilir.
// İki yoldan aynı ilişkiyi kurmak (hem çocuğun kendi `group: 'x'` alanıyla
// hem de ebeveynin `children` dizisiyle) CLAUDE.md §4'ün "boolean bayrak
// yığını kurma" ruhuna aykırı bir tutarsızlık kapısı açardı (ikisi
// çakışırsa hangisi doğru?). Tek kaynak: `children`.
//
// ⚠ `ThemeAssetRef` KARARI (image ilkeli için) — S3 anında bu dosya
// `../manifest/asset-ref.js`'i İTHAL EDEMİYORDU (po'nun sıralaması S5'i bu
// alt görevin ARDINDAN çalıştırıyordu, `src/manifest/` henüz YOKTU) ve bir
// YER TUTUCU modül kullanılmıştı (adı, bu dosyanın kendi grep taramasına
// yanlışlıkla yakalanmaması için burada bilerek TEKRARLANMIYOR — bkz.
// AGENT_BASELINE "literal-jeton kuralı"). S5 bu dosyayı KALICI tanıma
// YÖNLENDİRDİ (import aşağıda `../manifest/asset-ref.js`) ve yer tutucu
// modülü SİLDİ (S5 handoff'ta `rg` ham çıktısı taşır).

import { z } from 'zod'

import type { ThemeContractErrorCode } from '../errors.js'
import { THEME_ASSET_REF_SCHEMA } from '../manifest/asset-ref.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'
import { findDuplicateSettingKeyEntries } from './duplicate-key-check.js'
import { SETTING_KEY_SCHEMA } from './keys.js'

const THEME_SETTING_INVALID_CODE: ThemeContractErrorCode = 'THEME_SETTING_INVALID'

/**
 * Sekiz ilkelin TAMAMININ paylaştığı sunum üstverisi (architect'in bağlayıcı
 * kararı) — ileride `packages/ui`'nin şema→form motoru bu alanları
 * theme-sdk'nın MAJORU OLMADAN tüketebilsin (v0.0.21). `label` zorunlu (bir
 * form alanının en az bir görünür adı olmak zorunda); `description`/`order`
 * opsiyonel.
 */
const settingMetaShape = {
  key: SETTING_KEY_SCHEMA,
  label: z.string(),
  description: z.string().optional(),
  order: z.number().optional(),
}

/** `color` ilkelinin `default` biçimi: `#rrggbb` veya `#rrggbbaa`. `schema-from-definitions.ts` ile PAYLAŞILIR (tek doğrulama kaynağı). */
export const THEME_COLOR_HEX_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

/** 1/8 — `color`. */
export const THEME_COLOR_SETTING_SCHEMA = z.strictObject({
  ...settingMetaShape,
  type: z.literal('color'),
  default: z.string().regex(THEME_COLOR_HEX_PATTERN),
})

/** 2/8 — `font`: serbest metin varsayılan + opsiyonel seçenek listesi (UI öneri amaçlı — değer bu listeye ZORLANMAZ, `select`'ten farkı budur). */
export const THEME_FONT_SETTING_SCHEMA = z.strictObject({
  ...settingMetaShape,
  type: z.literal('font'),
  default: z.string(),
  options: z.array(z.string()).readonly().optional(),
})

/** Bir `select` ilkelinin tek seçeneği. */
const THEME_SELECT_OPTION_SCHEMA = z.strictObject({
  value: z.string(),
  label: z.string(),
})

/**
 * 3/8 — `select`: `default` değeri `options` listesindeki bir `value`'ya AİT
 * OLMAK ZORUNDA. Tekil alan şemaları (`default`, `options`) bunu TEK BAŞINA
 * ifade edemez — iki alanı BİRLİKTE gören bir nesne seviyesi `.check()`
 * gerekir. İhlal `THEME_SETTING_INVALID` olarak raporlanır (15 kodun
 * en genel-geçeri — bu ihlal için AYRI bir kod AÇILMADI, kapsam
 * genişlemesi olurdu).
 */
export const THEME_SELECT_SETTING_SCHEMA = z
  .strictObject({
    ...settingMetaShape,
    type: z.literal('select'),
    options: z.array(THEME_SELECT_OPTION_SCHEMA).readonly(),
    default: z.string(),
  })
  .check((payload) => {
    const isKnownOption = payload.value.options.some(
      (option) => option.value === payload.value.default,
    )

    if (!isKnownOption) {
      payload.issues.push({
        code: 'custom',
        input: payload.value.default,
        path: ['default'],
        message: `select ayarının varsayılan değeri ("${payload.value.default}") options listesinde yok.`,
        params: { themeContractErrorCode: 'THEME_SETTING_INVALID' },
      })
    }
  })

/** 4/8 — `toggle`. */
export const THEME_TOGGLE_SETTING_SCHEMA = z.strictObject({
  ...settingMetaShape,
  type: z.literal('toggle'),
  default: z.boolean(),
})

/**
 * 5/8 — `image`: `default` OPSİYONEL — bir temanın her görsel ayarı için
 * varsayılan bir görsel sağlaması ZORUNLU DEĞİL (diğer yedi ilkelden farkı
 * budur; onlarda `default` ZORUNLUDUR). Bkz. dosya başı "ThemeAssetRef
 * KARARI" notu — S5'in KALICI `src/manifest/asset-ref.ts` tanımı (yol
 * doğrulamasıyla birlikte).
 */
export const THEME_IMAGE_SETTING_SCHEMA = z.strictObject({
  ...settingMetaShape,
  type: z.literal('image'),
  default: THEME_ASSET_REF_SCHEMA.optional(),
})

/** 6/8 — `text`: serbest metin + opsiyonel uzunluk/çok satırlılık üstverisi. */
export const THEME_TEXT_SETTING_SCHEMA = z.strictObject({
  ...settingMetaShape,
  type: z.literal('text'),
  default: z.string(),
  maxLength: z.number().int().positive().optional(),
  isMultiline: z.boolean().optional(),
})

/** 7/8 — `number`: sayısal varsayılan + opsiyonel min/max/step üstverisi. */
export const THEME_NUMBER_SETTING_SCHEMA = z.strictObject({
  ...settingMetaShape,
  type: z.literal('number'),
  default: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
})

/**
 * Yedi "yaprak" (leaf) ilkelin ayrımlı birleşimi — `group` İÇERMEZ. Bu,
 * `group.children`'ın tip düzeyinde `group`'u KABUL ETMEMESİNİN mekanizması
 * (derinlik-1 kısıtı derleyici tarafından ZORLANIR, dosya başı yorumu).
 */
export const THEME_SETTING_LEAF_SCHEMA = z.discriminatedUnion('type', [
  THEME_COLOR_SETTING_SCHEMA,
  THEME_FONT_SETTING_SCHEMA,
  THEME_SELECT_SETTING_SCHEMA,
  THEME_TOGGLE_SETTING_SCHEMA,
  THEME_IMAGE_SETTING_SCHEMA,
  THEME_TEXT_SETTING_SCHEMA,
  THEME_NUMBER_SETTING_SCHEMA,
])

/** Tek bir "yaprak" ayar tanımının çıkarılmış TypeScript tipi. */
export type ThemeSettingLeaf = z.infer<typeof THEME_SETTING_LEAF_SCHEMA>

/**
 * 8/8 — `group`: çocukları YALNIZCA {@link THEME_SETTING_LEAF_SCHEMA} —
 * derinlik-1 kısıtı (dosya başı yorumu, V5).
 *
 * ⚠ H2 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti A, security'nin bulgusu)
 * — `children` dizisinde yinelenen `key` kontrol EDİLMİYORDU;
 * `deriveDefaultSettings`/`schemaFromDefinitions`'ın `Object.fromEntries`
 * kullanımı yüzünden SON tanım ÖNCEKİNİ sessizce gölgeliyordu (ör. bir
 * `image` tanımı bir `text` tanımıyla AYNI `key`'i paylaşırsa, `image`'ın
 * yol doğrulaması — H1 — HİÇ ÇALIŞMAZ). `../manifest/templates.ts`'teki
 * `THEME_TEMPLATES_SCHEMA`'nın dizi seviyesi `.check()` deseni BİREBİR
 * tekrarlanır (`./duplicate-key-check.js`'in paylaşılan tarayıcısıyla) —
 * özel bir hata kodu AÇILMADI, genel-geçer `THEME_SETTING_INVALID`
 * kullanılır.
 */
export const THEME_GROUP_SETTING_SCHEMA = z.strictObject({
  ...settingMetaShape,
  type: z.literal('group'),
  children: z
    .array(THEME_SETTING_LEAF_SCHEMA)
    .readonly()
    .check((payload) => {
      for (const duplicate of findDuplicateSettingKeyEntries(payload.value)) {
        payload.issues.push({
          code: 'custom',
          input: duplicate.key,
          path: [duplicate.index, 'key'],
          message: THEME_CONTRACT_MESSAGES.THEME_SETTING_INVALID,
          params: { themeContractErrorCode: THEME_SETTING_INVALID_CODE },
        })
      }
    }),
})

/** Sekiz ilkelin TAMAMININ ayrımlı birleşimi — bir tema `settings` listesinin TEK eleman şeması. */
export const THEME_SETTING_DEFINITION_SCHEMA = z.discriminatedUnion('type', [
  THEME_COLOR_SETTING_SCHEMA,
  THEME_FONT_SETTING_SCHEMA,
  THEME_SELECT_SETTING_SCHEMA,
  THEME_TOGGLE_SETTING_SCHEMA,
  THEME_IMAGE_SETTING_SCHEMA,
  THEME_TEXT_SETTING_SCHEMA,
  THEME_NUMBER_SETTING_SCHEMA,
  THEME_GROUP_SETTING_SCHEMA,
])

/** Tek bir ayar tanımının (sekiz ilkelden biri) çıkarılmış TypeScript tipi. */
export type ThemeSettingDefinition = z.infer<typeof THEME_SETTING_DEFINITION_SCHEMA>

/**
 * ⚠ B1 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti B, A'nın bildirdiği
 * YAPISAL KALINTI) — KÖK `settings` dizisi İÇİN, {@link
 * THEME_GROUP_SETTING_SCHEMA}'nın `children`'ındaki (YUKARIDA, H2
 * DÜZELTMESİ) İLE BİREBİR AYNI yinelenen-`key` `.check()`'i. Mevcut
 * davranış (sekiz ilkelin ayrımlı birleşimi, `THEME_SETTING_DEFINITION_
 * SCHEMA`) DEĞİŞTİRİLMEDİ — bu SADECE o şemanın üstüne, dizi SEVİYESİNDE
 * ek bir kontrol EKLEYEN YENİ bir export'tur (primitives.ts'in var olan
 * hiçbir mantığı değişmedi, davranışı bozulmadı).
 *
 * GEREKÇE — `manifest/manifest.ts`'in KÖK `settings` alanı önceki düzeltme
 * turunda (Parti A) bu dosyaya (Parti B'ye kilitli `manifest.ts`'e
 * DOKUNAMADIĞI için) şema SEVİYESİNDE kapatılamamıştı; koruma yalnızca
 * `manifest/validate-manifest.ts`'in ORKESTRASYON seviyesindeki ayrı bir
 * çağrısındaydı — bu, `THEME_MANIFEST_SCHEMA.safeParse()`'ı
 * `validate-manifest.ts`'İ ATLAYARAK DOĞRUDAN çağıran bir tüketici için
 * korumasız bir YÜZEY bırakıyordu (savunma şemada DEĞİL, orkestrasyonda —
 * daha ZAYIF bir konum). `manifest.ts` artık (Parti B'nin dosyası) bu
 * export'u `settings` alanı için KULLANIR — iki yüzey (kök `settings`,
 * `group.children`) artık AYNI doğrulama kaynağını (`./duplicate-key-
 * check.ts`) PAYLAŞIR, davranışları TUTARLI.
 */
export const THEME_SETTINGS_LIST_SCHEMA = z
  .array(THEME_SETTING_DEFINITION_SCHEMA)
  .readonly()
  .check((payload) => {
    for (const duplicate of findDuplicateSettingKeyEntries(payload.value)) {
      payload.issues.push({
        code: 'custom',
        input: duplicate.key,
        path: [duplicate.index, 'key'],
        message: THEME_CONTRACT_MESSAGES.THEME_SETTING_INVALID,
        params: { themeContractErrorCode: THEME_SETTING_INVALID_CODE },
      })
    }
  })
