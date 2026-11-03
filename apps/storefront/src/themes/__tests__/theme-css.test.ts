// @arkesoft/storefront — `generateThemeCss()` birim testleri (ROADMAP
// v0.0.10, T-012/S7, AC3 düzeltmesi + architect K5 "Ayar → CSS değişkeni
// eşlemesi")
//
// Bu dosya, `../theme-css.ts`'in KENDİSİNİN taşıyamadığı gerçek anahtar
// literallerini (AC3 pin'i, `theme-css-no-literal-keys.test.ts`) ÖZGÜRCE
// kullanır — pin yalnızca ÜRETECİN kendi kaynağını kapsar, testlerini DEĞİL.
import { describe, expect, it } from 'vitest'

import { generateThemeCss, ThemeCssGenerationError } from '../theme-css.js'
import type { ThemeSettingDefinition } from '../theme-setting-definition.js'

/**
 * Sentetik bir `color` tanımı — gerçek bir temadan BAĞIMSIZ, sekiz ilkelin
 * her birini tek tek sınamak için. ⚠ DÖNÜŞ TİPİ BİLEREK `ThemeSettingDefinition`
 * DEĞİL (TypeScript'in LİTERAL nesneyi ÇIKARMASINA izin verilir) — `group`
 * testi bu değeri hem KÖK dizide (`ThemeSettingDefinition`) hem bir
 * `group.children` dizisinde (`ThemeSettingLeaf`, `group` HARİÇ 7'lik alt
 * birleşim) kullanır; geniş birleşime SABİTLENMİŞ bir dönüş tipi bu İKİNCİ
 * kullanımı (daha DAR birleşim) REDDEDERDİ.
 */
function colorSetting(key: string, hex: string) {
  return { key, label: key, type: 'color' as const, default: hex }
}

function fontSetting(key: string, value: string) {
  return { key, label: key, type: 'font' as const, default: value }
}

describe('generateThemeCss', () => {
  it('color ve font ayarlarından `:root{--ad:değer;}` biçiminde CSS üretir', () => {
    const css = generateThemeCss([
      colorSetting('brand-accent', '#112233'),
      fontSetting('brand-font', 'Arial, sans-serif'),
    ])

    expect(css).toBe(':root{--brand-accent:#112233;--brand-font:Arial, sans-serif;}')
  })

  it('8 karakterli hex (#rrggbbaa) alfa kanalını da kabul eder', () => {
    const css = generateThemeCss([colorSetting('brand-accent', '#11223344')])

    expect(css).toBe(':root{--brand-accent:#11223344;}')
  })

  it('`group` derinlik-1 çocuklarına İNER ve onların color/font ayarlarını yayar', () => {
    const group: ThemeSettingDefinition = {
      key: 'brand-group',
      label: 'Marka',
      type: 'group',
      children: [colorSetting('brand-child-color', '#abcdef')],
    }

    const css = generateThemeCss([group])

    expect(css).toBe(':root{--brand-child-color:#abcdef;}')
  })

  const NON_SPREAD_DEFINITIONS_BY_TYPE: Record<
    'select' | 'toggle' | 'image' | 'text' | 'number',
    ThemeSettingDefinition
  > = {
    select: {
      key: 'brand-select',
      label: 'x',
      type: 'select',
      default: 'a',
      options: [{ value: 'a', label: 'A' }],
    },
    toggle: { key: 'brand-toggle', label: 'x', type: 'toggle', default: true },
    image: { key: 'brand-image', label: 'x', type: 'image' },
    text: { key: 'brand-text', label: 'x', type: 'text', default: 'serbest metin' },
    number: { key: 'brand-number', label: 'x', type: 'number', default: 42 },
  }

  it.each(['select', 'toggle', 'image', 'text', 'number'] as const)(
    '"%s" ilkeli YAYILMAZ (CSS çıktısı boş kalır)',
    (type) => {
      const css = generateThemeCss([NON_SPREAD_DEFINITIONS_BY_TYPE[type]])

      expect(css).toBe(':root{}')
    },
  )

  it('boş liste için boş `:root{}` döner', () => {
    expect(generateThemeCss([])).toBe(':root{}')
  })

  it("CSS değişken adı izin listesine uymayan bir `key` için ThemeCssGenerationError FIRLATIR (büyük harf, SDK'da geçerli)", () => {
    // `Brand-Accent` SDK'nın `SETTING_KEY_FORMAT_PATTERN`'ine (A-Za-z0-9_-) uyar
    // ama bu üretecin KENDİ (daha sıkı, küçük-harf-only) izin listesine UYMAZ —
    // devralmanın YAPISAL OLARAK yapılamadığının kanıtı.
    expect(() => generateThemeCss([colorSetting('Brand-Accent', '#112233')])).toThrow(
      ThemeCssGenerationError,
    )
  })

  it('geçersiz hex değeri için ThemeCssGenerationError FIRLATIR (sessizce atlamaz)', () => {
    expect(() => generateThemeCss([colorSetting('brand-accent', 'kirmizi')])).toThrow(
      ThemeCssGenerationError,
    )
  })

  it('5/7 karakterli (yanlış uzunlukta) bir hex REDDEDİLİR', () => {
    expect(() => generateThemeCss([colorSetting('brand-accent', '#1234567')])).toThrow(
      ThemeCssGenerationError,
    )
  })

  it('font DEĞERİ izin listesi dışı bir karakter (`;`) taşırsa FIRLATIR — enjeksiyon savunması', () => {
    expect(() =>
      generateThemeCss([fontSetting('brand-font', 'Arial; } body { color: red')]),
    ).toThrow(ThemeCssGenerationError)
  })

  it('font DEĞERİ `<script>` benzeri bir dize taşırsa FIRLATIR', () => {
    expect(() =>
      generateThemeCss([fontSetting('brand-font', '<script>alert(1)</script>')]),
    ).toThrow(ThemeCssGenerationError)
  })

  it(
    'font DEĞERİ İZİN LİSTESİNDEKİ belirteçleri (çıplak/tek-çift tırnaklı, tire, boşluk) KABUL eder — ' +
      'ÇIKIŞ tırnaklaması ÜRETEÇ tarafından KARAR VERİLİR, girdiden KOPYALANMAZ (F4 düzeltmesi: ' +
      'çıplak tek-tırnaklı "Custom Font" çift tırnağa NORMALİZE edilir, gereksiz tırnak düşürülür)',
    () => {
      const value = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", \'Custom Font\''
      const css = generateThemeCss([fontSetting('brand-font', value)])

      expect(css).toBe(
        ':root{--brand-font:ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Custom Font";}',
      )
    },
  )

  describe('F4 — dengesiz/tek karakterlik tırnak MUTASYON KANITLI reddedilir (security gate medium)', () => {
    it.each([
      ['Arial"', 'kapanmayan çift tırnak'],
      ["Arial'", 'kapanmayan tek tırnak'],
      ['"', 'tek başına bir tırnak karakteri'],
      ['Arial" ,x', 'ikinci belirteçte gizlenmiş kapanmayan tırnak'],
    ] as const)('"%s" (%s) → ThemeCssGenerationError FIRLATIR, CSS ÜRETİLMEZ', (value, _reason) => {
      expect(() => generateThemeCss([fontSetting('brand-font', value)])).toThrow(
        ThemeCssGenerationError,
      )
    })

    it('meşru sistem font yığını (tam SYSTEM_FONT_STACK biçimi) dengeli tırnaklarla KABUL edilir', () => {
      const legitimateStack =
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, ' +
        '"Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'

      expect(() => generateThemeCss([fontSetting('brand-font', legitimateStack)])).not.toThrow()
    })
  })
})
