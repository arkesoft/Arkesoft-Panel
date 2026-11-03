// @arkesoft/theme-sdk — AC12 bayatlık testi (ROADMAP v0.0.9, T-010/S7)
//
// Şemayı BELLEKTE yeniden üretir (`../json-schema.js`'ten — `src/`'ten,
// `dist/`'ten DEĞİL) ve generator'ın (`../../scripts/generate-contract-
// schema.ts`) kullandığı AYNI serileştiriciyi (`../../scripts/serialize-
// schema.js`'ten STATİK olarak) çağırıp diskteki `docs/theme-contract.
// schema.json` ile BAYT-BİREBİR karşılaştırır.
//
// ⚠ Bu testin `scripts/`'ten STATİK import etmesi MEŞRU — saflık pininin
// kapsamı `src/**` EKSİ `src/__tests__/**`'tir (purity.test.ts'in kendi
// taraması `src/` KÖKÜNDEN başlar ve bu dosyanın bulunduğu `__tests__/`
// dizinini DIŞLAR). Bu import bir `.js` uzantılı belirteçtir (`./serialize-
// schema.js`), gerçek dosya `./serialize-schema.ts`'tir — NodeNext'in
// standart "bildirim uzantısı ikamesi" kuralıyla `tsc` bunu ÇÖZER (paketin
// HER YERİNDE kullanılan desen) VE `vitest`'in Vite tabanlı çözümleyicisi bu
// eşlemeyi ÇALIŞMA ZAMANINDA şeffafça halleder — generator'ın `scripts/
// generate-contract-schema.ts`'inin AKSİNE, bu test PLAIN `node` İLE
// ÇALIŞTIRILMAZ (vitest çalıştırır), bu yüzden generator'ın dinamik+
// hesaplanmış ithalat tekniğine (V-PO1) hiç GEREK YOK.
//
// ⚠ Bu test `../json-schema.js`'i (src'ten, DERLENMEMİŞ) kullandığı için
// `packages/theme-sdk/dist/`'in VAR OLUP OLMAMASI bu testi ETKİLEMEZ — temiz
// bir ağaçta (`rm -rf dist`) BİLE yeşil kalır (V-PO1'in ispat şartı, S7 DoD).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { buildThemeContractJsonSchema } from '../json-schema.js'
import { ASSET_PATH_FORMAT_PATTERN } from '../manifest/asset-ref.js'
import { THEME_SDK_RANGE_FORMAT_PATTERN } from '../manifest/manifest.js'
import { MAX_SETTING_KEY_LENGTH, SETTING_KEY_FORMAT_PATTERN } from '../settings/keys.js'
import { serializeThemeContractJsonSchema } from '../../scripts/serialize-schema.js'

const DOCS_SCHEMA_PATH = fileURLToPath(
  new URL('../../../../docs/theme-contract.schema.json', import.meta.url),
)

describe('docs/theme-contract.schema.json bayatlık (AC12)', () => {
  it('bellekte yeniden üretilen şema, diskteki dosyayla bayt-birebir eşleşir', async () => {
    const schema = buildThemeContractJsonSchema()
    const expectedContents = await serializeThemeContractJsonSchema(schema, DOCS_SCHEMA_PATH)
    const actualContents = readFileSync(DOCS_SCHEMA_PATH, 'utf8')

    expect(actualContents).toBe(expectedContents)
  })

  it('üretilen şemada "migrations" alanı YOK (fonksiyon değeri JSON Schema ile temsil edilemez, bkz. json-schema.ts dosya başı yorumu)', () => {
    const schema = buildThemeContractJsonSchema()

    expect(schema.properties?.['migrations']).toBeUndefined()
    expect(schema.required).not.toContain('migrations')
  })

  it("templates[].type bilinen yedi şablon türünün enum'udur (transform nedeniyle boş şemaya düşmez)", () => {
    const schema = buildThemeContractJsonSchema()
    const templatesSchema = schema.properties?.['templates']

    if (
      templatesSchema === undefined ||
      typeof templatesSchema === 'boolean' ||
      templatesSchema.items === undefined ||
      typeof templatesSchema.items === 'boolean' ||
      Array.isArray(templatesSchema.items) ||
      templatesSchema.items.properties === undefined
    ) {
      throw new Error('templates şeması beklenen biçimde değil.')
    }

    const typeSchema = templatesSchema.items.properties['type']
    expect(typeSchema).toEqual({
      type: 'string',
      enum: ['404', 'home', 'product', 'collection', 'cart', 'page', 'blog'],
    })
  })

  // ⚠ B5 ZORUNLU KANIT (T-010 düzeltme turu 1/3 · parti B) — `id`/`sdkRange`/
  // `ThemeAssetRef.path` ÖNCEDEN çıplak `{"type":"string"}` olarak
  // düşüyordu (pattern YOK) — bu testler düşen/yeniden kazandırılan kuralı
  // PİNLER ki aynı sessizleşme TEKRAR olmasın.
  it('B5: "id" alanı artık redlerini TAŞIYAN bir pattern içerir (ÖNCEDEN çıplak {"type":"string"})', () => {
    const schema = buildThemeContractJsonSchema()
    const idSchema = schema.properties?.['id']

    if (idSchema === undefined || typeof idSchema === 'boolean') {
      throw new Error('id şeması beklenen biçimde değil.')
    }

    expect(idSchema.type).toBe('string')
    expect(typeof idSchema.pattern).toBe('string')
    expect(idSchema.pattern).toBe('^[a-z][a-z0-9]*(-[a-z0-9]+)*$')
  })

  it('B5: "sdkRange" alanı artık redlerini TAŞIYAN bir pattern içerir (ÖNCEDEN çıplak {"type":"string"})', () => {
    const schema = buildThemeContractJsonSchema()
    const sdkRangeSchema = schema.properties?.['sdkRange']

    if (sdkRangeSchema === undefined || typeof sdkRangeSchema === 'boolean') {
      throw new Error('sdkRange şeması beklenen biçimde değil.')
    }

    expect(sdkRangeSchema.type).toBe('string')
    // ⚠ F6 ZORUNLU KANIT (T-010 düzeltme turu 2/3, qa'nın bulgusu) — ÖNCEDEN
    // bu test yalnızca `pattern`'ın VAR OLDUĞUNU (`typeof === 'string'')
    // kontrol ediyordu, DEĞERİNİ DEĞİL — komşu `id` testiyle (B5: `idSchema.
    // pattern).toBe(...)`) ASİMETRİKTİ. Artık değer `manifest.ts`'in
    // EXPORT ettiği TEK kaynakla (`THEME_SDK_RANGE_FORMAT_PATTERN`)
    // BİREBİR karşılaştırılır.
    expect(sdkRangeSchema.pattern).toBe(THEME_SDK_RANGE_FORMAT_PATTERN.source)
  })

  // ⚠ F4 ZORUNLU KANIT (T-010 düzeltme turu 2/3, security'nin bulgusu S4) —
  // `settings[].key` ÖNCEDEN çıplak `{"type":"string"}` idi (B5'in KAPATTIĞI
  // AYNI boşluk, `id`/`sdkRange`/`ThemeAssetRef.path` İÇİN). Artık `pattern`
  // + `maxLength` + "zayıf izdüşüm" notu TAŞIR (isim kara listesi VE
  // yinelenen-key reddi JSON Schema `pattern`/`maxLength` İLE TAM ifade
  // EDİLEMEZ, dosya başı notu `json-schema.ts`'te).
  it('F4: "settings[].key" (color ilkeli) artık redlerini TAŞIYAN bir pattern + maxLength + zayıf-izdüşüm notu içerir (ÖNCEDEN çıplak {"type":"string"})', () => {
    const schema = buildThemeContractJsonSchema()
    const settingsSchema = schema.properties?.['settings']

    if (
      settingsSchema === undefined ||
      typeof settingsSchema === 'boolean' ||
      settingsSchema.items === undefined ||
      typeof settingsSchema.items === 'boolean' ||
      Array.isArray(settingsSchema.items) ||
      settingsSchema.items.oneOf === undefined
    ) {
      throw new Error('settings şeması beklenen biçimde değil.')
    }

    // 1. üye (index 0) `color` ilkelidir (color,font,select,toggle,image,…).
    const colorSchema = settingsSchema.items.oneOf[0]
    if (
      colorSchema === undefined ||
      typeof colorSchema === 'boolean' ||
      colorSchema.properties === undefined
    ) {
      throw new Error('color ayar şeması beklenen biçimde değil.')
    }

    const keySchema = colorSchema.properties['key']
    if (keySchema === undefined || typeof keySchema === 'boolean') {
      throw new Error('key şeması beklenen biçimde değil.')
    }

    expect(keySchema.type).toBe('string')
    expect(keySchema.pattern).toBe(SETTING_KEY_FORMAT_PATTERN.source)
    expect(keySchema.maxLength).toBe(MAX_SETTING_KEY_LENGTH)
    expect(typeof keySchema.description).toBe('string')
    expect(keySchema.description).toContain('zayıf izdüşüm')
  })

  it('F4: "group.children[].key" (settings[].oneOf içindeki group variant) İÇİNDE de AYNI pattern/maxLength taşır (iki bağımsız konum, suffix eşleşmesi)', () => {
    const schema = buildThemeContractJsonSchema()
    const settingsSchema = schema.properties?.['settings']

    if (
      settingsSchema === undefined ||
      typeof settingsSchema === 'boolean' ||
      settingsSchema.items === undefined ||
      typeof settingsSchema.items === 'boolean' ||
      Array.isArray(settingsSchema.items) ||
      settingsSchema.items.oneOf === undefined
    ) {
      throw new Error('settings şeması beklenen biçimde değil.')
    }

    // 8. üye (index 7) `group` ilkelidir (color,font,select,toggle,image,text,number,group).
    const groupSchema = settingsSchema.items.oneOf[7]
    if (
      groupSchema === undefined ||
      typeof groupSchema === 'boolean' ||
      groupSchema.properties === undefined
    ) {
      throw new Error('group ayar şeması beklenen biçimde değil.')
    }

    const childrenSchema = groupSchema.properties['children']
    if (
      childrenSchema === undefined ||
      typeof childrenSchema === 'boolean' ||
      childrenSchema.items === undefined ||
      typeof childrenSchema.items === 'boolean' ||
      Array.isArray(childrenSchema.items) ||
      childrenSchema.items.oneOf === undefined
    ) {
      throw new Error('group.children şeması beklenen biçimde değil.')
    }

    const childLeafSchema = childrenSchema.items.oneOf[0]
    if (
      childLeafSchema === undefined ||
      typeof childLeafSchema === 'boolean' ||
      childLeafSchema.properties === undefined
    ) {
      throw new Error('group.children[0] (color) şeması beklenen biçimde değil.')
    }

    const childKeySchema = childLeafSchema.properties['key']
    if (childKeySchema === undefined || typeof childKeySchema === 'boolean') {
      throw new Error('group.children[].key şeması beklenen biçimde değil.')
    }

    expect(childKeySchema.pattern).toBe(SETTING_KEY_FORMAT_PATTERN.source)
    expect(childKeySchema.maxLength).toBe(MAX_SETTING_KEY_LENGTH)
  })

  it('B5: "ThemeAssetRef.path" (image ayarının default.path\'i) pattern + maxLength + zayıf-izdüşüm notu taşır', () => {
    const schema = buildThemeContractJsonSchema()
    const settingsSchema = schema.properties?.['settings']

    if (
      settingsSchema === undefined ||
      typeof settingsSchema === 'boolean' ||
      settingsSchema.items === undefined ||
      typeof settingsSchema.items === 'boolean' ||
      Array.isArray(settingsSchema.items) ||
      settingsSchema.items.oneOf === undefined
    ) {
      throw new Error('settings şeması beklenen biçimde değil.')
    }

    // 5. üye (index 4) `image` ilkelidir (color,font,select,toggle,image,…).
    const imageSchema = settingsSchema.items.oneOf[4]
    if (
      imageSchema === undefined ||
      typeof imageSchema === 'boolean' ||
      imageSchema.properties === undefined
    ) {
      throw new Error('image ayar şeması beklenen biçimde değil.')
    }

    const defaultSchema = imageSchema.properties['default']
    if (
      defaultSchema === undefined ||
      typeof defaultSchema === 'boolean' ||
      defaultSchema.properties === undefined
    ) {
      throw new Error('image.default (ThemeAssetRef) şeması beklenen biçimde değil.')
    }

    const pathSchema = defaultSchema.properties['path']
    if (pathSchema === undefined || typeof pathSchema === 'boolean') {
      throw new Error('ThemeAssetRef.path şeması beklenen biçimde değil.')
    }

    expect(pathSchema.type).toBe('string')
    // ⚠ DEĞER PİNİ (T-012/S3, `po`'nun bulduğu fırsat) — ÖNCEDEN bu test
    // yalnızca `pattern`'ın VAR OLDUĞUNU (`typeof === 'string'`) kontrol
    // ediyordu, DEĞERİNİ DEĞİL — komşu `sdkRange` testiyle (F6 zorunlu kanıt,
    // yukarıda) ASİMETRİKTİ: desen SEC-5a ile yanlış üretilse bile bu test
    // YEŞİL kalırdı (mutasyon kanıtı: handoff'ta `shasum`/`cmp` ile
    // belgelendi). Artık değer `asset-ref.ts`'in EXPORT ettiği TEK kaynakla
    // (`ASSET_PATH_FORMAT_PATTERN`) BİREBİR karşılaştırılır.
    expect(pathSchema.pattern).toBe(ASSET_PATH_FORMAT_PATTERN.source)
    expect(pathSchema.maxLength).toBe(512)
    // Zayıf izdüşüm notu — ".." SEGMENT reddi bu JSON Schema'da TAM ifade
    // edilemez (dosya başı yorumu, json-schema.ts) — bu, SESSİZCE
    // kaybolmasın diye description alanına YAZILMIŞ bir uyarıdır.
    expect(typeof pathSchema.description).toBe('string')
    expect(pathSchema.description).toContain('zayıf izdüşüm')
  })
})
