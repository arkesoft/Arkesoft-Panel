// @arkesoft/storefront — `resolveTheme()` / kayıt defteri testleri (ROADMAP
// v0.0.10, T-012/S7, AC2 + architect K5 "Bir kez, SÜREÇ BAŞINA")
import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME_SELECTION, resolveTheme, ThemeResolutionError } from '../registry.js'

describe('resolveTheme (AC2 — üç test, hiçbirinde toBeNull YOK)', () => {
  it('("modern","0.1.0") → BİLİNEN modüle (ThemeRegistryEntry) çözülür', () => {
    const { entry } = resolveTheme({ themeId: 'modern', themeVersion: '0.1.0' })

    expect(entry.definition.manifest.id).toBe('modern')
    expect(entry.definition.manifest.version).toBe('0.1.0')
    expect(typeof entry.styleText).toBe('string')
    expect(entry.styleText.length).toBeGreaterThan(0)
  })

  it(
    'DÜZELTME (T-012/F2, solid M2/K-C): dönen `key` kayıt defterinin BİLİNEN anahtarıdır — ' +
      'çağıran "{themeId}@{themeVersion}"ı İKİNCİ bir yerde YENİDEN İNŞA ETMEZ',
    () => {
      const { key } = resolveTheme({ themeId: 'modern', themeVersion: '0.1.0' })

      expect(key).toBe('modern@0.1.0')
    },
  )

  it('bilinmeyen themeId → ThemeResolutionError FIRLATIR (null DÖNMEZ)', () => {
    expect(() => resolveTheme({ themeId: 'bilinmeyen-tema', themeVersion: '0.1.0' })).toThrow(
      ThemeResolutionError,
    )
  })

  it('bilinmeyen themeVersion (bilinen id) → ThemeResolutionError FIRLATIR (null DÖNMEZ)', () => {
    expect(() => resolveTheme({ themeId: 'modern', themeVersion: '9.9.9' })).toThrow(
      ThemeResolutionError,
    )
  })

  it('aralık/major çözümlemesi YAPILMAZ — "0.1" (kısmi) TAM EŞLEŞMEZ, FIRLATIR', () => {
    expect(() => resolveTheme({ themeId: 'modern', themeVersion: '0.1' })).toThrow(
      ThemeResolutionError,
    )
  })

  it("fırlatılan hatanın context'i themeId/themeVersion taşır (PII DEĞİL)", () => {
    try {
      resolveTheme({ themeId: 'yok', themeVersion: '1.0.0' })
      throw new Error('resolveTheme beklenen hatayı fırlatmadı')
    } catch (error) {
      expect(error).toBeInstanceOf(ThemeResolutionError)
      const resolutionError = error as ThemeResolutionError
      expect(resolutionError.context).toEqual({ themeId: 'yok', themeVersion: '1.0.0' })
    }
  })
})

describe('SÜREÇ BAŞINA BİR KEZ (K5) — kimlik testi', () => {
  it('aynı seçimle İKİ çağrı AYNI styleText dize REFERANSINI döndürür (toBe)', () => {
    const first = resolveTheme({ themeId: 'modern', themeVersion: '0.1.0' })
    const second = resolveTheme({ themeId: 'modern', themeVersion: '0.1.0' })

    expect(first.entry.styleText).toBe(second.entry.styleText)
  })
})

describe('DEFAULT_THEME_SELECTION (ADR-0002 Karar 5)', () => {
  it('kayıt defterindeki GERÇEK bir girdiyi işaret eder — resolveTheme ile çözülebilir', () => {
    const { entry } = resolveTheme(DEFAULT_THEME_SELECTION)

    expect(entry.definition.manifest.id).toBe(DEFAULT_THEME_SELECTION.themeId)
    expect(entry.definition.manifest.version).toBe(DEFAULT_THEME_SELECTION.themeVersion)
  })
})
