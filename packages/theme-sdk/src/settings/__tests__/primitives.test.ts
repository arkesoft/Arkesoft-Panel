// @arkesoft/theme-sdk — sekiz ayar ilkeli + güvenli anahtar + varsayılan
// türetimi birim testleri (ROADMAP v0.0.9, T-010/S3)

import { describe, expect, it } from 'vitest'

import { ThemeContractError } from '../../errors.js'
import { deriveDefaultSettings } from '../defaults.js'
import { isUnsafeSettingKey } from '../keys.js'
import {
  THEME_COLOR_SETTING_SCHEMA,
  THEME_FONT_SETTING_SCHEMA,
  THEME_GROUP_SETTING_SCHEMA,
  THEME_IMAGE_SETTING_SCHEMA,
  THEME_NUMBER_SETTING_SCHEMA,
  THEME_SELECT_SETTING_SCHEMA,
  THEME_SETTING_DEFINITION_SCHEMA,
  THEME_TEXT_SETTING_SCHEMA,
  THEME_TOGGLE_SETTING_SCHEMA,
} from '../primitives.js'
import { schemaFromDefinitions } from '../schema-from-definitions.js'

describe('sekiz ayar ilkeli — temel kabul', () => {
  it('color: #rrggbb ve #rrggbbaa kabul edilir', () => {
    expect(
      THEME_COLOR_SETTING_SCHEMA.safeParse({
        key: 'primary',
        type: 'color',
        label: 'Ana renk',
        default: '#ff00aa',
      }).success,
    ).toBe(true)

    expect(
      THEME_COLOR_SETTING_SCHEMA.safeParse({
        key: 'primary',
        type: 'color',
        label: 'Ana renk',
        default: '#ff00aa80',
      }).success,
    ).toBe(true)
  })

  it('color: geçersiz hex reddedilir', () => {
    expect(
      THEME_COLOR_SETTING_SCHEMA.safeParse({
        key: 'primary',
        type: 'color',
        label: 'Ana renk',
        default: 'kirmizi',
      }).success,
    ).toBe(false)
  })

  it('font: options opsiyoneldir', () => {
    const result = THEME_FONT_SETTING_SCHEMA.safeParse({
      key: 'heading-font',
      type: 'font',
      label: 'Başlık fontu',
      default: 'Inter',
    })
    expect(result.success).toBe(true)
  })

  it('toggle: boolean default', () => {
    expect(
      THEME_TOGGLE_SETTING_SCHEMA.safeParse({
        key: 'show-banner',
        type: 'toggle',
        label: 'Banner göster',
        default: true,
      }).success,
    ).toBe(true)
  })

  it('image: default opsiyoneldir (eksik olması geçerli)', () => {
    expect(
      THEME_IMAGE_SETTING_SCHEMA.safeParse({
        key: 'hero-image',
        type: 'image',
        label: 'Kahraman görseli',
      }).success,
    ).toBe(true)
  })

  it('text: maxLength/isMultiline opsiyoneldir', () => {
    expect(
      THEME_TEXT_SETTING_SCHEMA.safeParse({
        key: 'slogan',
        type: 'text',
        label: 'Slogan',
        default: 'merhaba',
        maxLength: 10,
        isMultiline: false,
      }).success,
    ).toBe(true)
  })

  it('number: min/max/step opsiyoneldir', () => {
    expect(
      THEME_NUMBER_SETTING_SCHEMA.safeParse({
        key: 'column-count',
        type: 'number',
        label: 'Sütun sayısı',
        default: 3,
        min: 1,
        max: 6,
        step: 1,
      }).success,
    ).toBe(true)
  })

  it('strictObject: bilinmeyen alan reddedilir (ör. color üzerinde "foo")', () => {
    expect(
      THEME_COLOR_SETTING_SCHEMA.safeParse({
        key: 'primary',
        type: 'color',
        label: 'Ana renk',
        default: '#ffffff',
        foo: 'bar',
      }).success,
    ).toBe(false)
  })
})

describe('select: default ∈ options refine', () => {
  it('default options içindeyse kabul edilir', () => {
    const result = THEME_SELECT_SETTING_SCHEMA.safeParse({
      key: 'layout',
      type: 'select',
      label: 'Düzen',
      options: [
        { value: 'grid', label: 'Izgara' },
        { value: 'list', label: 'Liste' },
      ],
      default: 'grid',
    })
    expect(result.success).toBe(true)
  })

  it('default options dışındaysa THEME_SETTING_INVALID ile reddedilir, path "default"tır', () => {
    const result = THEME_SELECT_SETTING_SCHEMA.safeParse({
      key: 'layout',
      type: 'select',
      label: 'Düzen',
      options: [{ value: 'grid', label: 'Izgara' }],
      default: 'carousel',
    })

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.error.issues).toHaveLength(1)
    const issue = result.error.issues[0]
    if (issue?.code !== 'custom') {
      throw new Error('beklenmeyen issue biçimi')
    }
    expect(issue.path).toEqual(['default'])
    expect(issue.params).toEqual({ themeContractErrorCode: 'THEME_SETTING_INVALID' })
  })
})

describe('AC6 katman 1 — güvensiz anahtar şema tanımı anında reddedilir', () => {
  it.each(['__proto__', 'constructor', 'prototype'])(
    'key: "%s" için THEME_SETTING_KEY_UNSAFE',
    (key) => {
      expect(isUnsafeSettingKey(key)).toBe(true)

      const result = THEME_TOGGLE_SETTING_SCHEMA.safeParse({
        key,
        type: 'toggle',
        label: 'Güvensiz',
        default: true,
      })

      expect(result.success).toBe(false)
      if (result.success) {
        throw new Error('beklenmeyen başarı')
      }
      const issue = result.error.issues[0]
      if (issue?.code !== 'custom') {
        throw new Error('beklenmeyen issue biçimi')
      }
      expect(issue.params).toEqual({
        themeContractErrorCode: 'THEME_SETTING_KEY_UNSAFE',
      })
    },
  )

  it('güvenli bir anahtar (ör. "primaryColor") reddedilmez', () => {
    expect(isUnsafeSettingKey('primaryColor')).toBe(false)
  })
})

describe('group — derinlik-1 kısıtı', () => {
  it('yaprak ilkellerden oluşan bir group kabul edilir', () => {
    const result = THEME_GROUP_SETTING_SCHEMA.safeParse({
      key: 'typography',
      type: 'group',
      label: 'Tipografi',
      children: [
        { key: 'heading-font', type: 'font', label: 'Başlık fontu', default: 'Inter' },
        { key: 'show-underline', type: 'toggle', label: 'Alt çizgi', default: false },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('bir group çocuğunda group OLAMAZ — reddedilir (derinlik-1, V5)', () => {
    const result = THEME_GROUP_SETTING_SCHEMA.safeParse({
      key: 'outer',
      type: 'group',
      label: 'Dış grup',
      children: [
        {
          key: 'inner',
          type: 'group',
          label: 'İç grup (yasak)',
          children: [{ key: 'leaf', type: 'toggle', label: 'Yaprak', default: true }],
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('THEME_SETTING_DEFINITION_SCHEMA üst seviyede group kabul eder', () => {
    const result = THEME_SETTING_DEFINITION_SCHEMA.safeParse({
      key: 'typography',
      type: 'group',
      label: 'Tipografi',
      children: [{ key: 'heading-font', type: 'font', label: 'Başlık fontu', default: 'Inter' }],
    })
    expect(result.success).toBe(true)
  })
})

describe('deriveDefaultSettings', () => {
  it('yedi yaprak ilkelin varsayılanlarını doğru türetir', () => {
    const defaults = deriveDefaultSettings([
      { key: 'primary', type: 'color', label: 'Ana renk', default: '#ffffff' },
      { key: 'heading-font', type: 'font', label: 'Başlık fontu', default: 'Inter' },
      {
        key: 'layout',
        type: 'select',
        label: 'Düzen',
        options: [{ value: 'grid', label: 'Izgara' }],
        default: 'grid',
      },
      { key: 'show-banner', type: 'toggle', label: 'Banner göster', default: true },
      { key: 'hero-image', type: 'image', label: 'Kahraman görseli' },
      { key: 'slogan', type: 'text', label: 'Slogan', default: 'merhaba' },
      { key: 'column-count', type: 'number', label: 'Sütun sayısı', default: 3 },
    ])

    expect(defaults).toEqual({
      primary: '#ffffff',
      'heading-font': 'Inter',
      layout: 'grid',
      'show-banner': true,
      'hero-image': undefined,
      slogan: 'merhaba',
      'column-count': 3,
    })
  })

  it('group için çocukların varsayılanlarını İÇ İÇE üretir', () => {
    const defaults = deriveDefaultSettings([
      {
        key: 'typography',
        type: 'group',
        label: 'Tipografi',
        children: [
          { key: 'heading-font', type: 'font', label: 'Başlık fontu', default: 'Inter' },
          { key: 'show-underline', type: 'toggle', label: 'Alt çizgi', default: false },
        ],
      },
    ])

    expect(defaults).toEqual({
      typography: { 'heading-font': 'Inter', 'show-underline': false },
    })
  })
})

describe('schemaFromDefinitions — değer şeması strip davranışı', () => {
  it('bilinmeyen anahtar bu düzeyde SESSİZCE soyulur (strict DEĞİL) — raporlama validateThemeSettings işi', () => {
    const schema = schemaFromDefinitions([
      { key: 'show-banner', type: 'toggle', label: 'Banner göster', default: true },
    ])

    const result = schema.safeParse({ 'show-banner': false, extraneous: 'x' })
    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error('beklenmeyen başarısızlık')
    }
    expect(result.data).toEqual({ 'show-banner': false })
  })
})

describe('H2 — group.children: yinelenen key reddedilir (T-010 düzeltme turu 1/3 · parti A)', () => {
  it('bir group içinde iki çocuk AYNI key taşırsa THEME_SETTING_INVALID ile reddedilir', () => {
    const result = THEME_GROUP_SETTING_SCHEMA.safeParse({
      key: 'typography',
      type: 'group',
      label: 'Tipografi',
      children: [
        { key: 'hero', type: 'font', label: 'Başlık fontu', default: 'Inter' },
        { key: 'hero', type: 'toggle', label: 'Yinelenen', default: false },
      ],
    })

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('beklenmeyen başarı')
    }
    const issue = result.error.issues[0]
    if (issue?.code !== 'custom') {
      throw new Error('beklenmeyen issue biçimi')
    }
    expect(issue.params).toEqual({ themeContractErrorCode: 'THEME_SETTING_INVALID' })
    expect(issue.path).toEqual(['children', 1, 'key'])
  })

  it('yinelenmeyen anahtarlar taşıyan bir group kabul edilir (gerileme yok)', () => {
    const result = THEME_GROUP_SETTING_SCHEMA.safeParse({
      key: 'typography',
      type: 'group',
      label: 'Tipografi',
      children: [
        { key: 'heading-font', type: 'font', label: 'Başlık fontu', default: 'Inter' },
        { key: 'show-underline', type: 'toggle', label: 'Alt çizgi', default: false },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('M2 — deriveDefaultSettings/schemaFromDefinitions: güvensiz key SAVUNMACI ön kontrolden geçer (T-010 düzeltme turu 1/3 · parti A)', () => {
  it('deriveDefaultSettings([{key:"__proto__", …}]) ThemeContractError FIRLATIR (önceden sessizce ÖZ "__proto__" anahtarı üretiyordu)', () => {
    expect(() =>
      deriveDefaultSettings([
        { key: '__proto__', type: 'toggle', label: 'Güvensiz', default: true },
      ]),
    ).toThrow(ThemeContractError)

    try {
      deriveDefaultSettings([
        { key: '__proto__', type: 'toggle', label: 'Güvensiz', default: true },
      ])
      throw new Error('beklenmeyen başarı — fırlatmadı')
    } catch (error) {
      if (!(error instanceof ThemeContractError)) {
        throw error
      }
      expect(error.issues.some((issue) => issue.code === 'THEME_SETTING_KEY_UNSAFE')).toBe(true)
    }
  })

  it('schemaFromDefinitions([{key:"__proto__", …}]) ThemeContractError FIRLATIR', () => {
    expect(() =>
      schemaFromDefinitions([
        { key: '__proto__', type: 'toggle', label: 'Güvensiz', default: true },
      ]),
    ).toThrow(ThemeContractError)
  })

  it('güvensiz anahtar group.children İÇİNDE de yakalanır (özyineleme)', () => {
    expect(() =>
      deriveDefaultSettings([
        {
          key: 'outer',
          type: 'group',
          label: 'Dış grup',
          children: [{ key: '__proto__', type: 'toggle', label: 'Güvensiz', default: true }],
        },
      ]),
    ).toThrow(ThemeContractError)
  })
})
