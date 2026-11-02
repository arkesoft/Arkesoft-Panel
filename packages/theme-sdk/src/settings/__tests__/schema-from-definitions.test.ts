// @arkesoft/theme-sdk — F1 KÖK ÇÖZÜMÜ zorunlu kanıt testleri (ROADMAP v0.0.9,
// T-010 düzeltme turu 2/3, security'nin S1 bulgusu + solid'in M2 bulgusu)
//
// Bu dosya ÜÇ giriş noktasının (`schemaFromDefinitions`, `deriveDefaultSettings`,
// `migrateThemeSettings`) TEK ortak ön kontrolden (`schema-from-definitions.ts`
// → `assertDefinitionsAreAcceptable`) geçtiğini kanıtlar — `validateThemeSettings`
// için AYNI kanıt ZATEN `./validate-settings.test.ts`'te mevcuttur (H1+H2, M2
// describe blokları, tur 1/3'ten) — burada TEKRARLANMAZ.
//
// ⚠ F1 MUTASYON KANITI (handoff'un ZORUNLU KANIT #2'si) — bu dosyadaki TÜM
// testler `schema-from-definitions.ts`'teki `assertDefinitionsAreAcceptable`
// çağrısı `schemaFromDefinitions`'ın İÇİNDEN kaldırıldığında (geçici olarak
// yorum satırına alınıp `pnpm --filter @arkesoft/theme-sdk test` koşturularak)
// KIRMIZIYA düşer — bu, "tek nokta üçünü de kapsıyor" iddiasının GERÇEK
// mutasyonla doğrulandığının kanıtıdır (handoff'un KARARLAR/ÖLÇÜMLER alanında
// ham çıktı olarak taşınır, bu dosyaya KALICI bir mutasyon testi EKLENMEZ —
// bu paket bir mutation-testing çatısı TAŞIMAZ, CLAUDE.md §6'nın `test.skip`
// yasağı gerekçesiyle AYNI ruh: kalıcı, atlanan bir test YAZILMAZ).
//
// ⚠ M (T-010 düzeltme turu 3/3, solid'in bulgusu — bağımsız doğrulandı) —
// `migrateThemeSettings` için ÖNCEKİ hâl (tur 2/3) altı girdiyi `{}` (BOŞ)
// nesnesine karşı test ediyordu. `assertDefinitionsAreAcceptable` KALDIRILSA
// BİLE `safeParse({})` zorunlu `toggle` alanı EKSİK olduğu için zaten
// `ok:false` döner — test AYIRT EDİCİ DEĞİLDİ (ön kontrolden BAĞIMSIZ olarak
// yeşildi/kırmızıydı). Düzeltme: her girdi KENDİ anahtarını SAĞLAR
// (`{ [key]: true }`) — ön kontrol kaldırılınca `z.object({[key]:
// z.boolean()})` bu girdiyi KABUL EDER (herhangi bir dize geçerli bir JS
// nesne özelliği adıdır; biçim/uzunluk/isim kısıtı YALNIZCA bu paketin
// KENDİ güvenlik kuralıdır) — böylece `ok:false` SONUCU gerçekten
// `assertDefinitionsAreAcceptable`'a bağlıdır. Ayrıca `issues[0].code`/
// `.path`/`.message` artık TAM eşleşmeyle doğrulanır (`expect.any(String)`
// KULLANILMAZ, CLAUDE.md §2/§4 ve S4'ün `no-unsafe-assignment` dersiyle
// AYNI gerekçe) — bu, `../../migrations/run.ts:296-306`'nın genel-geçer
// (fallback) dalının YANLIŞLIKLA alınmasını da yakalar: `issues` taşımak
// yerine sabit bir kod döndüren bir mutasyon bu assertion'ı KIRMIZIYA
// düşürür (handoff'un ZORUNLU KANIT #2'si).

import { describe, expect, it } from 'vitest'

import { ThemeContractError } from '../../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../../messages.js'
import type { ThemeSettingsMigration } from '../../migrations/chain.js'
import { migrateThemeSettings } from '../../migrations/run.js'
import { deriveDefaultSettings } from '../defaults.js'
import type { ThemeSettingDefinition } from '../primitives.js'
import { schemaFromDefinitions } from '../schema-from-definitions.js'

/**
 * `keys.test.ts`'in M1 ZORUNLU KANIT listesiyle (`SETTING_KEY_SCHEMA`,
 * manifest yolu) BİREBİR AYNI altı girdi — F1'in iddiası: bu altısı artık
 * manifest yolu DIŞINDAKİ üç DOĞRUDAN giriş noktasında da reddedilir
 * (solid'in M2 bulgusu, "iki farklı güç" sapmasının kapanışı).
 */
const SIX_REJECTED_KEYS: readonly (readonly [string, string])[] = [
  ['boş dize', ''],
  ['yalnızca boşluk', ' '],
  ['yol geçişi benzeri', '../x'],
  ['satır sonu içeren', 'a\nb'],
  ['HTML benzeri işaret', '<script>'],
  ['5000 karakter', 'a'.repeat(5000)],
]

describe('F1 — schemaFromDefinitions: altı girdi REDDEDİLİR (ÖNCEDEN yalnızca kara liste kontrol edilirdi)', () => {
  it.each(SIX_REJECTED_KEYS)('"%s" ThemeContractError FIRLATIR', (_label, key) => {
    expect(() =>
      schemaFromDefinitions([{ key, type: 'toggle', label: 'x', default: true }]),
    ).toThrow(ThemeContractError)
  })
})

describe('F1 — deriveDefaultSettings: altı girdi REDDEDİLİR (ÖNCEDEN yalnızca kara liste kontrol edilirdi)', () => {
  it.each(SIX_REJECTED_KEYS)('"%s" ThemeContractError FIRLATIR', (_label, key) => {
    expect(() =>
      deriveDefaultSettings([{ key, type: 'toggle', label: 'x', default: true }]),
    ).toThrow(ThemeContractError)
  })
})

describe('F1 — migrateThemeSettings: GİRDİ KENDİ anahtarını SAĞLASA BİLE altı girdi {ok:false} döner, code/path TAM THEME_SETTING_KEY_UNSAFE/"[0].key" (ÖNCEDEN ön kontrol HİÇ YOKTU)', () => {
  it.each(SIX_REJECTED_KEYS)(
    '"%s" — girdi `{ [key]: true }` (ön kontrol OLMASA şema bu girdiyi KABUL EDERDİ) hâlâ ok:false döner, issues[0] TAM eşleşir',
    (_label, key) => {
      const migrations: readonly ThemeSettingsMigration[] = []
      const targetDefinitions: readonly ThemeSettingDefinition[] = [
        { key, type: 'toggle', label: 'x', default: true },
      ]

      const result = migrateThemeSettings(migrations, '1.0.0', targetDefinitions, {
        [key]: true,
      })

      expect(result.ok).toBe(false)
      if (result.ok) {
        throw new Error('beklenmeyen başarı — ön kontrol atlanmış olabilir')
      }
      expect(result.issues[0]).toMatchObject({
        code: 'THEME_SETTING_KEY_UNSAFE',
        path: '[0].key',
        message: THEME_CONTRACT_MESSAGES.THEME_SETTING_KEY_UNSAFE,
      })
    },
  )
})

describe('F1 — ÖLÇÜLMÜŞ EXPLOIT #1: migrateThemeSettings yinelenen "hero" (image sonra text) + migrate() → yol geçişi değeri', () => {
  it('ÖNCEDEN ok:true dönerdi (yinelenen key kontrolü YOK, text şeması kazanırdı) — ARTIK ok:false döner, issues[0] TAM THEME_SETTING_INVALID/"[1].key" (İKİNCİ occurrence raporlanır)', () => {
    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '2.0.0',
        migrate: () => ({ hero: '../../etc/passwd' }),
      },
    ]
    const targetDefinitionsWithDuplicateKey: readonly ThemeSettingDefinition[] = [
      { key: 'hero', type: 'image', label: 'Kahraman görseli' },
      { key: 'hero', type: 'text', label: 'Kahraman metni', default: '' },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', targetDefinitionsWithDuplicateKey, {})

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı — yinelenen key kontrolü atlanmış olabilir')
    }
    expect(result.issues[0]).toMatchObject({
      code: 'THEME_SETTING_INVALID',
      path: '[1].key',
      message: THEME_CONTRACT_MESSAGES.THEME_SETTING_INVALID,
    })
  })

  it('gerileme yok — yinelenmeyen key taşıyan AYNI zincir hâlâ ok:true döner', () => {
    // ⚠ Fixture `ThemeAssetRef` şemasının (`../manifest/asset-ref.ts`)
    // TAM şeklini taşımak ZORUNDADIR — `source: 'theme-asset'` ZORUNLU bir
    // alandır (S5'in önceden var olan, bu düzeltmeyle İLGİSİZ kısıtı);
    // yalnızca `path` vermek `THEME_ASSET_REF_INVALID` DEĞİL, strictObject'in
    // `source` alanı EKSİK olduğu için bir ŞEMA hatası üretirdi — bu
    // regresyon testinin KENDİSİNİN hatasıydı, F1/F2'nin ürettiği bir
    // regresyon DEĞİLDİ (ölçüldü: `source` eklenince test yeşile döner).
    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '2.0.0',
        migrate: () => ({ hero: { source: 'theme-asset', path: 'images/hero.png' } }),
      },
    ]
    const targetDefinitions: readonly ThemeSettingDefinition[] = [
      { key: 'hero', type: 'image', label: 'Kahraman görseli' },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', targetDefinitions, {})

    expect(result.ok).toBe(true)
  })
})

describe('F1 — ÖLÇÜLMÜŞ EXPLOIT #2: deriveDefaultSettings yinelenen key sessizce gölgelenen varsayılan ÜRETMEZ', () => {
  it('ÖNCEDEN {"hero":"x"} (text varsayılanı, image sessizce gölgelenirdi) SESSİZCE dönerdi — ARTIK ThemeContractError FIRLAR', () => {
    const definitionsWithDuplicateKey: readonly ThemeSettingDefinition[] = [
      { key: 'hero', type: 'image', label: 'Kahraman görseli' },
      { key: 'hero', type: 'text', label: 'Kahraman metni', default: 'x' },
    ]

    expect(() => deriveDefaultSettings(definitionsWithDuplicateKey)).toThrow(ThemeContractError)

    try {
      deriveDefaultSettings(definitionsWithDuplicateKey)
      throw new Error('beklenmeyen başarı — fırlatmadı')
    } catch (error) {
      if (!(error instanceof ThemeContractError)) {
        throw error
      }
      expect(error.issues.some((issue) => issue.code === 'THEME_SETTING_INVALID')).toBe(true)
    }
  })

  it('gerileme yok — yinelenmeyen key taşıyan bir liste hâlâ doğru varsayılanı üretir', () => {
    const defaults = deriveDefaultSettings([
      { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#ffffff' },
    ])

    expect(defaults).toEqual({ primaryColor: '#ffffff' })
  })
})
