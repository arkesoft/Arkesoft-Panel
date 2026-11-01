// @arkesoft/ui — tokens birim testleri (ROADMAP v0.0.7, T-008/S2)
//
// AC13: her bildirilmiş metin/zemin çifti için WCAG 2.1 kontrast oranı
// hesaplanıp eşikle (≥4.5:1 normal metin, ≥3:1 büyük metin/UI sınırı/odak)
// karşılaştırılır. Totoloji karşıtı fixture, `CONTRAST_PAIRS`'ten BAĞIMSIZ:
// beklenen oranlar ELLE hesaplanıp burada yazılı — `calculateContrastRatio`
// fonksiyonunun çıktısından TÜREMİYOR.
//
// AC13 ikinci yarısı: `theme.css`'teki `@theme` renk hex'leri `tokens.ts`'teki
// `COLOR_TOKENS` ile BİREBİR eşleşiyor mu (ADR-0009 madde 5 deseni,
// `node:fs` ile pinli).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { calculateContrastRatio, COLOR_TOKENS, CONTRAST_PAIRS } from '../tokens'

const currentDir = dirname(fileURLToPath(import.meta.url))
const themeCssPath = join(currentDir, '..', 'theme.css')

/**
 * `theme.css`'teki `@theme` bloğundan `--color-*: #hex;` satırlarını ayrıştırır.
 * Yalnızca `node:fs` + düzenli ifade kullanılır — CSS ayrıştırıcı bağımlılığı eklenmez.
 */
function parseColorTokensFromCss(cssSource: string): Record<string, string> {
  const colorDeclarationPattern = /(--color-[\w-]+):\s*(#[0-9a-fA-F]{6});/g
  const parsed: Record<string, string> = {}
  for (const match of cssSource.matchAll(colorDeclarationPattern)) {
    const name = match[1]
    const hex = match[2]
    if (name !== undefined && hex !== undefined) {
      parsed[name] = hex
    }
  }
  return parsed
}

describe('CONTRAST_PAIRS — AC13 (eşik uyumu)', () => {
  it.each(CONTRAST_PAIRS)('$label eşiği karşılıyor (≥$threshold:1)', (pair) => {
    const ratio = calculateContrastRatio(pair.textHex, pair.backgroundHex)
    expect(ratio).toBeGreaterThanOrEqual(pair.threshold)
  })
})

describe('calculateContrastRatio — totoloji karşıtı fixture (AC13)', () => {
  // Referans 1: #000000 / #FFFFFF. Elle hesaplanmış: L_siyah=0, L_beyaz=1 →
  // (1+0.05)/(0+0.05) = 21. Fonksiyonun çıktısından TÜRETİLMEDİ.
  it('#000000 / #FFFFFF → 21:1 (geçer)', () => {
    const ratio = calculateContrastRatio('#000000', '#FFFFFF')
    expect(ratio).toBeCloseTo(21, 1)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  // Referans 2 (bilinçli başarısız): #94A3B8 / #FFFFFF. `ui`'nin
  // `--color-border` adayı olarak denediği ve WCAG 2.1 formülüyle ELLE
  // hesaplanarak REDDETTİĞİ değer (2.56:1, 3:1'i karşılamıyor) — bu başarısız
  // sayı icat edilmiş değil, gerçek bir ölçüm. Fonksiyonun çıktısından
  // TÜRETİLMEDİ: aşağıdaki `2.56` elle hesaplanıp yazıldı, sonra
  // `calculateContrastRatio` çalıştırılıp karşılaştırıldı.
  it('#94A3B8 / #FFFFFF → ~2.56:1 (3:1 VE 4.5:1 eşiğini kırmızı verir)', () => {
    const ratio = calculateContrastRatio('#94A3B8', '#FFFFFF')
    expect(ratio).toBeCloseTo(2.56, 1)
    expect(ratio).toBeLessThan(3)
    expect(ratio).toBeLessThan(4.5)
  })
})

/**
 * Hex değerlerini büyük harfe normalize eder. `prettier --write` CSS hex
 * literallerini küçük harfe çevirir (`theme.css`'in kendi biçimlendirme
 * kuralı) — `tokens.ts`'in doğruluk kaynağı büyük harf hex taşır; pin testi
 * harf durumundan BAĞIMSIZ, değerin KENDİSİNİ karşılaştırır.
 */
function normalizeHexCasing(colorTokens: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(colorTokens).map(([name, hex]) => [name, hex.toUpperCase()]),
  )
}

describe('theme.css ↔ tokens.ts — pin testi (ADR-0009 madde 5 deseni)', () => {
  it("theme.css renk hex'leri COLOR_TOKENS ile birebir eşleşiyor", () => {
    const cssSource = readFileSync(themeCssPath, 'utf-8')
    const cssColorTokens = parseColorTokensFromCss(cssSource)
    expect(normalizeHexCasing(cssColorTokens)).toStrictEqual(normalizeHexCasing(COLOR_TOKENS))
  })
})
