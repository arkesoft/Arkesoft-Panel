// @arkesoft/theme-sdk — `validateThemeManifest`/`assertThemeManifest` birim
// testleri (ROADMAP v0.0.9, T-010/S5, AC3 + AC4 + AC11 + AC7/AC8 entegrasyonu)

import { describe, expect, it } from 'vitest'

import { ThemeContractError } from '../../errors.js'
import { THEME_MANIFEST_SCHEMA } from '../manifest.js'
import { assertThemeManifest, validateThemeManifest } from '../validate-manifest.js'

/** Geçerli, minimum bir manifest — testlerde çoğaltılmaması için tek üretim noktası. */
function validManifest(): Record<string, unknown> {
  return {
    id: 'corporate-base',
    name: 'Kurumsal Taban',
    version: '1.0.0',
    sdkRange: '^1.0.0',
    templates: [
      { type: 'home', slots: [] },
      { type: '404', slots: [] },
    ],
    settings: [],
    migrations: [],
  }
}

describe('validateThemeManifest — pozitif durum', () => {
  it('geçerli minimum bir manifest kabul edilir', () => {
    const result = validateThemeManifest(validManifest())

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }
    expect(result.manifest.id).toBe('corporate-base')
  })

  it('yedi şablonun TAMAMINI (home + 404 dahil) taşıyan bir manifest kabul edilir', () => {
    const manifest = {
      ...validManifest(),
      templates: [
        { type: '404', slots: [] },
        { type: 'home', slots: [] },
        {
          type: 'product',
          slots: [{ id: 'main', label: 'Ana alan', allowedSections: ['gallery', 'description'] }],
        },
        { type: 'collection', slots: [] },
        { type: 'cart', slots: [] },
        { type: 'page', slots: [] },
        { type: 'blog', slots: [] },
      ],
    }

    const result = validateThemeManifest(manifest)
    expect(result.ok).toBe(true)
  })
})

describe('validateThemeManifest — AC4: bilinmeyen anahtar REDDEDİLİR (soyulmaz)', () => {
  it('"tempaltes" yazım hatası THEME_MANIFEST_UNKNOWN_KEY ile reddedilir', () => {
    const manifest = validManifest()
    delete manifest['templates']
    manifest['tempaltes'] = [
      { type: 'home', slots: [] },
      { type: '404', slots: [] },
    ]

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    const unknownKeyIssue = result.issues.find(
      (issue) => issue.code === 'THEME_MANIFEST_UNKNOWN_KEY',
    )
    expect(unknownKeyIssue).toBeDefined()
    expect(unknownKeyIssue?.path).toBe('tempaltes')
  })
})

describe('validateThemeManifest — Q1: çok-anahtarlı unrecognized_keys genişlemesi (T-010 düzeltme turu 1/3 · parti A)', () => {
  it('"tempaltes" yazım hatası + İKİ ek bilinmeyen anahtar → ÜÇ ayrı THEME_MANIFEST_UNKNOWN_KEY issue', () => {
    const manifest = validManifest()
    delete manifest['templates']
    manifest['tempaltes'] = [
      { type: 'home', slots: [] },
      { type: '404', slots: [] },
    ]
    manifest['extra1'] = 1
    manifest['extra2'] = 2

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    const unknownKeyIssues = result.issues.filter(
      (issue) => issue.code === 'THEME_MANIFEST_UNKNOWN_KEY',
    )
    expect(unknownKeyIssues).toHaveLength(3)
    expect(unknownKeyIssues.map((issue) => issue.path).sort()).toEqual(
      ['extra1', 'extra2', 'tempaltes'].sort(),
    )
  })
})

describe('validateThemeManifest — H2: KÖK settings dizisinde yinelenen key reddedilir (T-010 düzeltme turu 1/3 · parti A)', () => {
  it('iki ayar tanımı AYNI key taşırsa (image + text, "hero") THEME_SETTING_INVALID ile reddedilir', () => {
    const manifest = {
      ...validManifest(),
      settings: [
        { key: 'hero', type: 'image', label: 'Kahraman görseli' },
        { key: 'hero', type: 'text', label: 'Kahraman metni', default: '' },
      ],
    }

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı — yinelenen key hâlâ kabul ediliyor')
    }
    const duplicateIssue = result.issues.find((issue) => issue.code === 'THEME_SETTING_INVALID')
    expect(duplicateIssue).toBeDefined()
    expect(duplicateIssue?.path).toBe('settings[1].key')
  })

  it('bir group.children İÇİNDEKİ yinelenen key de (şema seviyesinde) reddedilir', () => {
    const manifest = {
      ...validManifest(),
      settings: [
        {
          key: 'typography',
          type: 'group',
          label: 'Tipografi',
          children: [
            { key: 'heading-font', type: 'font', label: 'Başlık fontu', default: 'Inter' },
            { key: 'heading-font', type: 'toggle', label: 'Yinelenen', default: false },
          ],
        },
      ],
    }

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı — group.children yinelenen key hâlâ kabul ediliyor')
    }
    expect(result.issues.some((issue) => issue.code === 'THEME_SETTING_INVALID')).toBe(true)
  })

  it('yinelenmeyen settings kabul edilir (gerileme yok)', () => {
    const manifest = {
      ...validManifest(),
      settings: [
        { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#000000' },
        { key: 'secondaryColor', type: 'color', label: 'İkincil renk', default: '#ffffff' },
      ],
    }

    const result = validateThemeManifest(manifest)
    expect(result.ok).toBe(true)
  })
})

describe('validateThemeManifest — AC3: hata path VE code taşır, mesaj Türkçe', () => {
  it('templates[2].slots[0].id boşsa path VE code bu konumu BİREBİR gösterir', () => {
    const manifest = {
      ...validManifest(),
      templates: [
        { type: 'home', slots: [] },
        { type: '404', slots: [] },
        {
          type: 'product',
          slots: [{ id: '', label: 'Ana alan', allowedSections: [] }],
        },
      ],
    }

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    const idIssue = result.issues.find((issue) => issue.path === 'templates[2].slots[0].id')
    expect(idIssue).toBeDefined()
    expect(idIssue?.code).toBe('THEME_MANIFEST_INVALID')
    expect(idIssue?.message.length).toBeGreaterThan(0)
    // Türkçe geliştirici metni — Latin-dışı/İngilizce bir Zod iç metni DEĞİL.
    expect(idIssue?.message).toBe('theme.json şemayla eşleşmiyor.')
  })
})

describe('validateThemeManifest — id biçimi (THEME_ID_INVALID)', () => {
  it('büyük harf içeren bir id reddedilir', () => {
    const result = validateThemeManifest({ ...validManifest(), id: 'Corporate-Base' })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues.some((issue) => issue.code === 'THEME_ID_INVALID')).toBe(true)
  })

  it('geçerli bir slug kabul edilir', () => {
    const result = validateThemeManifest({ ...validManifest(), id: 'corporate-base-2' })
    expect(result.ok).toBe(true)
  })
})

describe('validateThemeManifest — sdkRange biçimi (THEME_SDK_RANGE_INVALID)', () => {
  it('biçimsiz bir sdkRange reddedilir', () => {
    const result = validateThemeManifest({ ...validManifest(), sdkRange: 'latest' })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues.some((issue) => issue.code === 'THEME_SDK_RANGE_INVALID')).toBe(true)
  })

  it('çok parçalı bir aralık biçimi (">=1.0.0 <2.0.0") kabul edilir — KARŞILAŞTIRMA yapılmaz, yalnızca biçim', () => {
    const result = validateThemeManifest({ ...validManifest(), sdkRange: '>=1.0.0 <2.0.0' })
    expect(result.ok).toBe(true)
  })
})

describe('validateThemeManifest — version biçimi (fallback THEME_MANIFEST_INVALID)', () => {
  it('biçimsiz bir version reddedilir, özel bir kod YOK (fallback genel-geçer)', () => {
    const result = validateThemeManifest({ ...validManifest(), version: 'v1' })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues.some((issue) => issue.code === 'THEME_MANIFEST_INVALID')).toBe(true)
  })
})

describe('THEME_MANIFEST_SCHEMA.safeParse — B1: KÖK settings yinelenen key ŞEMA SEVİYESİNDE reddedilir (T-010 düzeltme turu 1/3 · parti B)', () => {
  it('validateThemeManifest ATLANARAK (orkestrasyon KATMANINA hiç girilmeden) DOĞRUDAN çağrıldığında dahi yinelenen kök key reddedilir', () => {
    const manifest = {
      ...validManifest(),
      settings: [
        { key: 'hero', type: 'image', label: 'Kahraman görseli' },
        { key: 'hero', type: 'text', label: 'Kahraman metni', default: '' },
      ],
    }

    const result = THEME_MANIFEST_SCHEMA.safeParse(manifest)

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error(
        'beklenmeyen başarı — THEME_MANIFEST_SCHEMA doğrudan çağrıldığında yinelenen key korumasız',
      )
    }
    const duplicateIssue = result.error.issues.find((issue) => {
      const code: unknown =
        issue.code === 'custom' ? issue.params?.['themeContractErrorCode'] : undefined
      return code === 'THEME_SETTING_INVALID'
    })
    expect(duplicateIssue).toBeDefined()
    expect(duplicateIssue?.path).toEqual(['settings', 1, 'key'])
  })

  it('yinelenmeyen kök settings DOĞRUDAN çağrıda da kabul edilir (gerileme yok)', () => {
    const manifest = {
      ...validManifest(),
      settings: [
        { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#000000' },
        { key: 'secondaryColor', type: 'color', label: 'İkincil renk', default: '#ffffff' },
      ],
    }

    const result = THEME_MANIFEST_SCHEMA.safeParse(manifest)
    expect(result.success).toBe(true)
  })

  it('AYNI kusur için ÇİFT raporlama YOK — validateThemeManifest üzerinden TEK bir THEME_SETTING_INVALID issue döner', () => {
    const manifest = {
      ...validManifest(),
      settings: [
        { key: 'hero', type: 'image', label: 'Kahraman görseli' },
        { key: 'hero', type: 'text', label: 'Kahraman metni', default: '' },
      ],
    }

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    const duplicateIssues = result.issues.filter((issue) => issue.code === 'THEME_SETTING_INVALID')
    expect(duplicateIssues).toHaveLength(1)
  })
})

describe('validateThemeManifest — B4: "1.0.0-01" TEK tutarlı sonuç verir (T-010 düzeltme turu 1/3 · parti B)', () => {
  it('version "1.0.0-01" reddedilir — ÖNCEDEN manifest biçim kontrolünden GEÇİP migration kontrolünde İKİNCİ bir bulgu üretiyordu (semver çekirdek deseni artık TEK kaynak, ../semver-format.ts)', () => {
    const result = validateThemeManifest({ ...validManifest(), version: '1.0.0-01' })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı — "1.0.0-01" hâlâ kabul ediliyor')
    }
    // ⚠ Tek bir bulgu: `version`'ın KENDİ biçim kontrolü reddeder — zincir
    // boş olduğu için `validateMigrationChain`'e (major 1, migration
    // beklenmez) hiç ULAŞILMAZ, bu yüzden İKİNCİ bir `THEME_MIGRATION_
    // MISSING`/`THEME_MANIFEST_INVALID` bulgusu OLUŞMAZ (eski sapmanın
    // belirtisi tam olarak bu İKİNCİ bulguydu).
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.code).toBe('THEME_MANIFEST_INVALID')
  })
})

describe('validateThemeManifest — migrations alanı: migrate GERÇEKTEN bir fonksiyon olmalı', () => {
  it('migrate alanı fonksiyon değilse (ör. string) reddedilir — fallback kod VE path (B6 düzeltmesi, T-010 düzeltme turu 1/3 · parti B, low bulgu)', () => {
    const manifest = {
      ...validManifest(),
      version: '2.0.0',
      migrations: [{ from: '1.0.0', to: '2.0.0', migrate: 'not-a-function' }],
    }

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    // ⚠ B6 ZORUNLU KANIT — ÖNCEDEN bu test yalnızca `result.ok === false`'u
    // ölçüyordu, FALLBACK kodu (`THEME_MANIFEST_INVALID`) PİNLEMİYORDU; bir
    // mutasyon (ör. fallback kodun başka bir koda değişmesi) BU TESTİ
    // KIRMAZDI. Artık `code` VE `path` (AC3 deseni) BİRLİKTE ölçülür.
    expect(result.issues.some((issue) => issue.code === 'THEME_MANIFEST_INVALID')).toBe(true)
    expect(result.issues.some((issue) => issue.path === 'migrations[0].migrate')).toBe(true)
  })
})

describe('validateThemeManifest — S4 entegrasyonu: validateMigrationChain(migrations, version) doğru sırayla çağrılır', () => {
  it('major 2ye yükselmiş ama migration zinciri bunu karşılamıyorsa THEME_MIGRATION_MISSING döner', () => {
    const manifest = { ...validManifest(), version: '2.0.0', migrations: [] }

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toEqual([
      {
        code: 'THEME_MIGRATION_MISSING',
        path: 'migrations',
        message: 'Sürümler arası geçiş için gerekli migration tanımı eksik.',
      },
    ])
  })

  it('zincir hedef majora ulaşıyorsa manifest kabul edilir', () => {
    const manifest = {
      ...validManifest(),
      version: '2.0.0',
      migrations: [{ from: '1.0.0', to: '2.0.0', migrate: (settings: unknown) => settings }],
    }

    const result = validateThemeManifest(manifest)
    expect(result.ok).toBe(true)
  })
})

describe('validateThemeManifest — şema seviyesindeki template kuralları manifest üzerinden de tetiklenir', () => {
  it('home VE 404 İKİSİ DE eksikse THEME_TEMPLATE_MISSING döner', () => {
    const manifest = { ...validManifest(), templates: [{ type: 'product', slots: [] }] }

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues.some((issue) => issue.code === 'THEME_TEMPLATE_MISSING')).toBe(true)
  })

  it('bilinmeyen bir şablon türü THEME_TEMPLATE_UNKNOWN döner', () => {
    const manifest = {
      ...validManifest(),
      templates: [
        { type: 'home', slots: [] },
        { type: '404', slots: [] },
        { type: 'unknown-template', slots: [] },
      ],
    }

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues.some((issue) => issue.code === 'THEME_TEMPLATE_UNKNOWN')).toBe(true)
  })

  it('aynı şablon türü iki kez tanımlanırsa THEME_TEMPLATE_DUPLICATE döner', () => {
    const manifest = {
      ...validManifest(),
      templates: [
        { type: 'home', slots: [] },
        { type: '404', slots: [] },
        { type: 'home', slots: [] },
      ],
    }

    const result = validateThemeManifest(manifest)

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues.some((issue) => issue.code === 'THEME_TEMPLATE_DUPLICATE')).toBe(true)
  })
})

describe('assertThemeManifest — fırlatan ikiz', () => {
  it('geçerli bir manifest için doğrudan ThemeManifest döner', () => {
    const manifest = assertThemeManifest(validManifest())
    expect(manifest.id).toBe('corporate-base')
  })

  it('geçersiz bir manifest için ThemeContractError fırlatır', () => {
    expect(() => assertThemeManifest({ ...validManifest(), id: 'INVALID' })).toThrow(
      ThemeContractError,
    )
  })

  it('fırlatılan ThemeContractError issue listesini taşır', () => {
    try {
      assertThemeManifest({ ...validManifest(), id: 'INVALID' })
      throw new Error('beklenmeyen başarı — assertThemeManifest fırlatmadı')
    } catch (error) {
      if (!(error instanceof ThemeContractError)) {
        throw error
      }
      expect(error.issues.some((issue) => issue.code === 'THEME_ID_INVALID')).toBe(true)
    }
  })
})
