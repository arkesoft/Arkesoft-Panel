// @arkesoft/theme-sdk — `validateThemeSettings` birim testleri (ROADMAP
// v0.0.9, T-010/S3, AC5 + AC6 İKİNCİ KATMAN + AC3)

import { describe, expect, it } from 'vitest'

import type { ThemeSettingDefinition } from '../primitives.js'
import { validateThemeSettings } from '../validate-settings.js'

describe('validateThemeSettings — AC5: SOY ama RAPORLA (tema v2 → v1 rollback senaryosu)', () => {
  it('tema v1 şeması, tema v2 nin yazdığı ek anahtarı taşıyan bir ayar nesnesini HATASIZ kabul eder ve unknownKeys ile raporlar', () => {
    // Tema v1'in bildirdiği tanım kümesi — yalnızca "primaryColor".
    const themeV1Definitions: readonly ThemeSettingDefinition[] = [
      { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#000000' },
    ]

    // Tema v2'nin GERÇEKTEN YAZDIĞI ayar nesnesi — v1'in bilmediği "secondaryColor" eklenmiş.
    // Bir rollback senaryosunda (v2 → v1) bu nesne v1 şemasıyla OKUNMAK ZORUNDADIR.
    const themeV2WrittenSettings: unknown = {
      primaryColor: '#123456',
      secondaryColor: '#abcdef',
    }

    const result = validateThemeSettings(themeV1Definitions, themeV2WrittenSettings)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık — rollback senaryosu HATA ÜRETMEMELİ')
    }
    expect(result.value).toEqual({ primaryColor: '#123456' })
    expect(result.unknownKeys).toEqual(['secondaryColor'])
  })

  it('bilinmeyen anahtar yoksa unknownKeys boş dizi döner', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#000000' },
    ]

    const result = validateThemeSettings(definitions, { primaryColor: '#111111' })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }
    expect(result.unknownKeys).toEqual([])
  })
})

describe('validateThemeSettings — AC6 İKİNCİ KATMAN: parse ÇIKTISI döner, ham girdi ASLA', () => {
  it('prototip kirliliği denemesi (1) __proto__ yoluyla Object.prototype KİRLENMEZ VE (2) dönen değer ham girdiyle REFERANS EŞİT DEĞİLDİR', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#000000' },
    ]

    // JSON.parse, `__proto__`'yu Object.prototype'a YAZMAZ — [[DefineOwnProperty]]
    // ile ÖZ (own) bir veri özelliği olarak kurar. Bu, prototip kirliliği
    // denemesinin gerçekçi taşıyıcısıdır (ham bir obje literaliyle `{ __proto__:
    // ... }` yazmak YALNIZCA prototipi değiştirir, öz anahtar ÜRETMEZ — bu
    // yüzden JSON.parse kullanılıyor, testin KENDİSİ yanlış senaryoyu
    // sınamasın).
    const rawInput: unknown = JSON.parse(
      '{"primaryColor": "#111111", "__proto__": {"polluted": "evil"}}',
    )

    const result = validateThemeSettings(definitions, rawInput)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }

    // (1) Object.prototype GERÇEKTEN kirlenmemiş.
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()

    // (2) ⚠ BUNUN OLMADAN (1) YANLIŞ NEDENLE geçebilirdi — dönen değerin ham
    // girdiyle REFERANS EŞİT OLMADIĞINI doğrular (Zod'un parse ÇIKTISI
    // döndürüldüğünü, ham girdinin İLERİ TAŞINMADIĞINI kanıtlar).
    expect(result.value).not.toBe(rawInput)
    expect(result.value).toEqual({ primaryColor: '#111111' })
  })
})

describe('validateThemeSettings — AC3: geçersiz ayar değeri path ve code taşır, mesaj Türkçe', () => {
  it('number ayarının max sınırını aşan değeri THEME_SETTING_INVALID ile reddedilir, path "columnCount"tur', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      { key: 'columnCount', type: 'number', label: 'Sütun sayısı', default: 3, min: 1, max: 6 },
    ]

    const result = validateThemeSettings(definitions, { columnCount: 999 })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.path).toBe('columnCount')
    expect(result.issues[0]?.code).toBe('THEME_SETTING_INVALID')
    expect(result.issues[0]?.message).toBe('Ayar tanımı kendi ilkel tipinin şemasıyla eşleşmiyor.')
  })

  it('select ayarının options dışı bir değeri THEME_SETTING_INVALID ile reddedilir', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      {
        key: 'layout',
        type: 'select',
        label: 'Düzen',
        options: [{ value: 'grid', label: 'Izgara' }],
        default: 'grid',
      },
    ]

    const result = validateThemeSettings(definitions, { layout: 'carousel' })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues[0]?.path).toBe('layout')
    expect(result.issues[0]?.code).toBe('THEME_SETTING_INVALID')
  })

  it('ayar değeri nesne değilse (ör. dizi) THEME_SETTING_INVALID ile reddedilir', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#000000' },
    ]

    const result = validateThemeSettings(definitions, ['bu bir nesne değil'])

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues[0]?.code).toBe('THEME_SETTING_INVALID')
  })
})

describe('validateThemeSettings — H1+H2 BİRLİKTE (T-010 düzeltme turu 1/3 · parti A, ZORUNLU KANIT #3)', () => {
  it('yinelenen "hero" key (image + text) + yol geçişi değeri artık GEÇMİYOR — iki high birlikte kapandı', () => {
    const definitionsWithDuplicateKey: readonly ThemeSettingDefinition[] = [
      { key: 'hero', type: 'image', label: 'Kahraman görseli' },
      { key: 'hero', type: 'text', label: 'Kahraman metni', default: '' },
    ]

    const result = validateThemeSettings(definitionsWithDuplicateKey, {
      hero: '../../etc/passwd',
    })

    // ⚠ DÜZELTME ÖNCESİ: H2 (yinelenen key kontrolü YOK) → şema 'hero'yu
    // SON tanımın (text, serbest metin) şemasıyla kurar → H1'in
    // THEME_ASSET_REF_SCHEMA'sı (image tanımının şeması) HİÇ ÇALIŞMAZ →
    // `ok: true, value: { hero: '../../etc/passwd' }` dönerdi.
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı — H1+H2 zinciri hâlâ açık')
    }
    expect(result.issues.some((issue) => issue.code === 'THEME_SETTING_INVALID')).toBe(true)
  })
})

describe('validateThemeSettings — H2: yinelenen key SAVUNMACI ön kontrolden geçer (T-010 düzeltme turu 1/3 · parti A)', () => {
  it('KÖK seviyede yinelenen key THEME_SETTING_INVALID ile reddedilir', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#000000' },
      { key: 'primaryColor', type: 'text', label: 'Yinelenen', default: '' },
    ]

    const result = validateThemeSettings(definitions, { primaryColor: '#111111' })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues[0]?.code).toBe('THEME_SETTING_INVALID')
  })

  it('group.children İÇİNDE yinelenen key de REDDEDİLİR (doğrudan çağrı, şemadan GEÇMEMİŞ girdi)', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      {
        key: 'typography',
        type: 'group',
        label: 'Tipografi',
        children: [
          { key: 'heading-font', type: 'font', label: 'Başlık fontu', default: 'Inter' },
          { key: 'heading-font', type: 'toggle', label: 'Yinelenen', default: false },
        ],
      },
    ]

    const result = validateThemeSettings(definitions, {
      typography: { 'heading-font': 'Inter' },
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues[0]?.code).toBe('THEME_SETTING_INVALID')
  })
})

describe('validateThemeSettings — M2: güvensiz key SAVUNMACI ön kontrolden geçer (T-010 düzeltme turu 1/3 · parti A)', () => {
  it('"__proto__" key taşıyan bir tanım {ok:false} döner (defineTheme() ATLANIP doğrudan çağrılan senaryo)', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      { key: '__proto__', type: 'toggle', label: 'Güvensiz', default: true },
    ]

    const result = validateThemeSettings(definitions, { __proto__: true })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues[0]?.code).toBe('THEME_SETTING_KEY_UNSAFE')
  })
})

describe('validateThemeSettings — M3: iç içe (group) unknownKeys TUTAR (T-010 düzeltme turu 1/3 · parti A)', () => {
  it('bir group değer nesnesindeki bilinmeyen anahtar unknownKeys\'e "advanced.ghost" olarak GİRER (önceden SESSİZCE kayboluyordu)', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      {
        key: 'advanced',
        type: 'group',
        label: 'Gelişmiş',
        children: [{ key: 'borderRadius', type: 'number', label: 'Kenar yarıçapı', default: 4 }],
      },
    ]

    const result = validateThemeSettings(definitions, {
      advanced: { borderRadius: 4, ghost: 'x' },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }
    // ⚠ Strip davranışı DEĞİŞMEDİ — `ghost` değerde YOK, yalnızca raporlanıyor.
    expect(result.value).toEqual({ advanced: { borderRadius: 4 } })
    expect(result.unknownKeys).toEqual(['advanced.ghost'])
  })

  it('iç içe bilinmeyen anahtar YOKSA unknownKeys boş kalır (negatif test, gerileme yok)', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      {
        key: 'advanced',
        type: 'group',
        label: 'Gelişmiş',
        children: [{ key: 'borderRadius', type: 'number', label: 'Kenar yarıçapı', default: 4 }],
      },
    ]

    const result = validateThemeSettings(definitions, { advanced: { borderRadius: 4 } })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }
    expect(result.unknownKeys).toEqual([])
  })
})
