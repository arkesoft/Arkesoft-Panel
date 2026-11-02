// @arkesoft/theme-sdk — `defineTheme()` birim testleri (ROADMAP v0.0.9,
// T-010/S8, AC10 + AC6 KATMAN 1)
//
// ⚠ AC10'UN ZORUNLU ŞARTI (po'nun DoD'u, handoff'ta birebir): elle yazılmış
// TEK bir vaka YETERSİZ — test SEKİZ İLKELİN HEPSİNİ gezmeli VE ilkel
// adlarının KÜMESİ üzerinde bir assertion taşımalı, böylece eksik bir
// ilkel (ör. bir gelecekteki refactor `image`'ı yanlışlıkla silerse) test
// dosyasından SESSİZCE ATLANAMAZ — `toEqual(new Set(ALL_EIGHT))` küme
// karşılaştırması, beklenen kümeden SAPAN her türetilmiş küme için kırmızı
// döner (hem eksik hem FAZLADAN bir ilkel için).

import { describe, expect, it } from 'vitest'

import { ThemeContractError } from '../errors.js'
import { defineTheme } from '../define-theme.js'
import { validateThemeSettings } from '../settings/validate-settings.js'
import type { ThemeSettingDefinition } from '../settings/primitives.js'

/** Sekiz ayar ilkelinin TAMAMININ `type` değerleri — tek kaynak, testin KENDİSİ bu kümeyi kopyalamaz. */
const ALL_EIGHT_PRIMITIVE_TYPES = [
  'color',
  'font',
  'select',
  'toggle',
  'image',
  'text',
  'number',
  'group',
] as const

/**
 * Sekiz ilkelin HEPSİNİ bir arada taşıyan tek bir ayar tanımı listesi —
 * `group`'un çocuğu `number` ilkelini TEKRAR kullanır (derinlik-1 kısıtı,
 * `primitives.ts` V5) ki `group`'un KENDİSİ de "yaprak taşıyan" gerçekçi bir
 * biçimde test edilsin.
 */
function allEightPrimitiveSettingDefinitions(): readonly ThemeSettingDefinition[] {
  return [
    { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#112233' },
    { key: 'headingFont', type: 'font', label: 'Başlık fontu', default: 'Inter' },
    {
      key: 'layout',
      type: 'select',
      label: 'Düzen',
      options: [{ value: 'grid', label: 'Izgara' }],
      default: 'grid',
    },
    { key: 'isDarkMode', type: 'toggle', label: 'Karanlık mod', default: false },
    { key: 'heroImage', type: 'image', label: 'Kahraman görseli' },
    { key: 'footerText', type: 'text', label: 'Alt bilgi metni', default: 'Tüm hakları saklıdır.' },
    { key: 'columnCount', type: 'number', label: 'Sütun sayısı', default: 3, min: 1, max: 6 },
    {
      key: 'advanced',
      type: 'group',
      label: 'Gelişmiş',
      children: [{ key: 'borderRadius', type: 'number', label: 'Kenar yarıçapı', default: 4 }],
    },
  ]
}

/** Geçerli, minimum bir manifest girdisi — `settings` dışındaki alanlar sabit tutulur. */
function validManifestInputWithSettings(
  settings: readonly ThemeSettingDefinition[],
): Record<string, unknown> {
  return {
    id: 'corporate-base',
    name: 'Kurumsal Taban',
    version: '1.0.0',
    sdkRange: '^1.0.0',
    templates: [
      { type: 'home', slots: [] },
      { type: '404', slots: [] },
    ],
    settings,
    migrations: [],
  }
}

describe('defineTheme — AC10: türetilen varsayılanlar validateThemeSettings()ten geçer (sekiz ilkelin TAMAMI)', () => {
  it('sekiz ilkelin tamamını taşıyan bir manifestin türettiği varsayılanlar validateThemeSettingsten BAŞARIYLA geçer', () => {
    const definitions = allEightPrimitiveSettingDefinitions()

    // ⚠ ZORUNLU KÜME ASSERTION'I — eksik bir ilkel burada SESSİZCE
    // ATLANAMAZ: `definitions` kümesi `ALL_EIGHT_PRIMITIVE_TYPES`den
    // SAPARSA (bir ilkel eksikse veya fazlaysa) bu satır kırmızıya döner.
    expect(new Set(definitions.map((definition) => definition.type))).toEqual(
      new Set(ALL_EIGHT_PRIMITIVE_TYPES),
    )

    const definition = defineTheme(validManifestInputWithSettings(definitions))

    const validation = validateThemeSettings(
      definition.manifest.settings,
      definition.defaultSettings,
    )

    expect(validation.ok).toBe(true)
    if (!validation.ok) {
      throw new Error('beklenmeyen başarısızlık — türetilen varsayılanlar KENDİ şemasından GEÇMELİ')
    }
    expect(validation.unknownKeys).toEqual([])
    expect(validation.value).toEqual(definition.defaultSettings)
  })

  it('türetilen varsayılanlar beklenen değerleri taşır (image ilkelinin opsiyonel defaultı dahil)', () => {
    const definitions = allEightPrimitiveSettingDefinitions()
    const definition = defineTheme(validManifestInputWithSettings(definitions))

    expect(definition.defaultSettings).toEqual({
      primaryColor: '#112233',
      headingFont: 'Inter',
      layout: 'grid',
      isDarkMode: false,
      heroImage: undefined,
      footerText: 'Tüm hakları saklıdır.',
      columnCount: 3,
      advanced: { borderRadius: 4 },
    })
  })
})

describe('defineTheme — AC6 KATMAN 1: güvensiz ayar anahtarı defineTheme() yolunda da ÇALIŞIR', () => {
  it('bir ayar tanımının key alanı "__proto__" ise ThemeContractError (THEME_SETTING_KEY_UNSAFE) FIRLATILIR', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      { key: '__proto__', type: 'color', label: 'Güvensiz anahtar', default: '#000000' },
    ]

    expect(() => defineTheme(validManifestInputWithSettings(definitions))).toThrow(
      ThemeContractError,
    )

    try {
      defineTheme(validManifestInputWithSettings(definitions))
      throw new Error('beklenmeyen başarı — defineTheme() güvensiz anahtarı KABUL ETMEMELİYDİ')
    } catch (error) {
      if (!(error instanceof ThemeContractError)) {
        throw error
      }
      const unsafeKeyIssue = error.issues.find((issue) => issue.code === 'THEME_SETTING_KEY_UNSAFE')
      expect(unsafeKeyIssue).toBeDefined()
    }
  })
})

describe('defineTheme — negatif: geçersiz manifest girdisi FIRLATIR, sessizce yutmaz', () => {
  it('eksik zorunlu alanlar taşıyan bir girdi ThemeContractError fırlatır', () => {
    expect(() => defineTheme({})).toThrow(ThemeContractError)
  })
})

describe('defineTheme — pozitif: manifest alanı doğrulanmış ThemeManifesti birebir taşır', () => {
  it('geçerli bir girdi için manifest.id ve defaultSettings birlikte dönülür', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#ffffff' },
    ]

    const definition = defineTheme(validManifestInputWithSettings(definitions))

    expect(definition.manifest.id).toBe('corporate-base')
    expect(definition.defaultSettings).toEqual({ primaryColor: '#ffffff' })
  })
})
