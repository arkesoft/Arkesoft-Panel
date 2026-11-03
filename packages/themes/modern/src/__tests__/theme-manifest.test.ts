// @arkesoft/themes-modern — manifest doğrulama testi (ROADMAP v0.0.10,
// T-012/S5, AC1)
//
// ⚠ Test adı ÖLÇTÜĞÜ ŞEYİ doğru tarif etmek zorunda (po'nun uyarısı, İş 5
// — bu projede bir test başlığının "üç adlı kara liste" dediği liste
// gerçekte DOKUZA çıkmıştı). Burada iki şey ayrı ayrı ve açıkça ölçülüyor:
// (1) `validateThemeManifest()`'in BAŞARI dalı döndüğü, (2) `home` VE
// `404`'ün İKİSİNİN BİRDEN `templates` dizisinde beyan edildiği.
import { describe, expect, it } from 'vitest'

import { validateThemeManifest } from '@arkesoft/theme-sdk'

import { modernTheme } from '../theme.config.js'

describe('modern@0.1.0 teması — manifest doğrulaması (AC1)', () => {
  it('validateThemeManifest() manifesti kabul eder (ok: true)', () => {
    const result = validateThemeManifest(modernTheme.manifest)

    expect(result.ok).toBe(true)
  })

  it('validateThemeManifest() başarı dalında id/version/sdkRange beklenen değerleri taşır', () => {
    const result = validateThemeManifest(modernTheme.manifest)

    if (!result.ok) {
      throw new Error('Beklenmeyen doğrulama hatası: ' + JSON.stringify(result.issues))
    }

    expect(result.manifest.id).toBe('modern')
    expect(result.manifest.version).toBe('0.1.0')
    expect(result.manifest.sdkRange).toBe('>=0.1.0 <1.0.0')
  })

  it('templates dizisi home VE 404 şablonlarının İKİSİNİ BİRDEN beyan eder', () => {
    const declaredTypes = modernTheme.manifest.templates.map((template) => template.type)

    expect(declaredTypes).toContain('home')
    expect(declaredTypes).toContain('404')
    expect(declaredTypes).toHaveLength(2)
  })

  it('settings listesinde image tipinde bir ayar YOK (BN-1/SEC-5 sıralama kısıtı)', () => {
    const settingTypes = modernTheme.manifest.settings.map((setting) => setting.type)

    expect(settingTypes).not.toContain('image')
  })

  it('settings listesi color-primary anahtarını taşır (AC3/AC4)', () => {
    const colorPrimarySetting = modernTheme.manifest.settings.find(
      (setting) => setting.key === 'color-primary',
    )

    expect(colorPrimarySetting).toBeDefined()
    expect(colorPrimarySetting?.type).toBe('color')
  })
})
