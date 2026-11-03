// @arkesoft/storefront — dispatcher ↔ kayıt defteri TUTARLILIĞI, MEKANİK
// drift-pin testi (ROADMAP v0.0.10, T-012/S7; T-012 düzeltme turu 1, `solid`
// gate M3 — bağlayıcı düzeltme)
//
// `ThemeTemplate.astro`'nun frontmatter'ı `pnpm typecheck`in GÖRMEDİĞİ bir
// yüzeydir (`tsc` `.astro` dosyalarını derlemez) — bu yüzden `.astro`
// TARAFI için grep KAÇINILMAZDIR (dosya başı yorumu, ThemeTemplate.astro).
//
// DÜZELTME (solid M3, bağlayıcı): önceki tur `registry.ts` TARAFINI DA grep
// ile okuyordu — yani registry'nin KENDİ anahtar biçimini (`'id@version':
// buildRegistryEntry(...)`) İKİNCİ kez, bir regex'le, UYGULUYORDU. Bu md 1
// ihlaliydi (T-011'in kendi reçetesi: "tek uygulama") VE bir arıza yolu
// AÇIKTI: `length > 0` kontrolü BOŞ kümeyi yakalar ama KISMİ bir kümeyi
// (iki taraf da doluysa ama ikinci bir registry girdisi regex'in
// YAKALAYAMADIĞI bir biçimde yazılırsa) YAKALAMAZ — test YEŞİL kalır,
// kiracı runtime'da 500 alır. Düzeltme: registry TARAFI artık GERÇEK
// modülden import edilir (`THEME_REGISTRY_KEYS`, `registry.ts`'in TEK
// doğruluk kaynağı) — ikinci bir uygulama YOK. Karşılaştırma `toEqual` ile
// TAM KÜME EŞİTLİĞİDİR (`length > 0` tek başına YETERLİ DEĞİL).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { THEME_REGISTRY_KEYS } from '../registry.js'

const THEMES_DIR = join(import.meta.dirname, '..')

/** `ThemeTemplate.astro`'nun dispatch karşılaştırmalarındaki (`currentThemeKey === '...'`) anahtar literallerini yakalar. */
const DISPATCH_KEY_COMPARISON_PATTERN = /currentThemeKey === '([^']+)'/g

function uniqueSortedKeysOf(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort()
}

function dispatcherKeys(): readonly string[] {
  const source = readFileSync(join(THEMES_DIR, 'ThemeTemplate.astro'), 'utf-8')
  const keys = [...source.matchAll(DISPATCH_KEY_COMPARISON_PATTERN)].map((match) => match[1])

  return uniqueSortedKeysOf(keys.filter((key): key is string => key !== undefined))
}

function registryKeys(): readonly string[] {
  return uniqueSortedKeysOf(THEME_REGISTRY_KEYS)
}

describe('ThemeTemplate.astro ↔ registry.ts — dispatcher drift-pin', () => {
  it('registry.ts THEME_REGISTRY_KEYS (GERÇEK modül) > 0 VE ThemeTemplate.astro dispatch anahtar kümesiyle TAM EŞİT', () => {
    const fromRegistry = registryKeys()
    const fromDispatcher = dispatcherKeys()

    expect(fromRegistry.length).toBeGreaterThan(0)
    expect(fromDispatcher.length).toBeGreaterThan(0)
    expect(fromDispatcher).toEqual(fromRegistry)
  })
})
