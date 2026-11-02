// @arkesoft/theme-sdk — `themeContractIssuesFromZodError` birim testleri
// (ROADMAP v0.0.9, T-010 düzeltme turu 1/3 · parti A, Q1: AC4'ün çok-anahtarlı
// genişlemesi (`unrecognized_keys` → N issue, `flatMap`) hiçbir testte
// tetiklenmiyordu — qa'nın mutasyonu (`issue.keys.map` → `issue.keys.
// slice(0,1).map`) 99/99 testi YEŞİL bırakıyordu. Bu dosya o boşluğu kapatır:
// TEK bir `safeParse` çağrısında BİRDEN FAZLA bilinmeyen anahtar üretir ve
// HER anahtarın KENDİ `ThemeContractIssue`'suna genişlediğini doğrular.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { themeContractIssuesFromZodError } from '../zod-issue-mapping.js'

describe('themeContractIssuesFromZodError — Q1: çok-anahtarlı unrecognized_keys genişlemesi', () => {
  it("TEK bir strictObject reddinde ÜÇ bilinmeyen anahtar varsa ÜÇ ayrı issue üretir, her biri kendi path'iyle", () => {
    const schema = z.strictObject({ templates: z.array(z.unknown()) })
    const parseResult = schema.safeParse({
      tempaltes: [],
      extra1: 1,
      extra2: 2,
    })

    expect(parseResult.success).toBe(false)
    if (parseResult.success) {
      throw new Error('beklenmeyen başarı')
    }

    const issues = themeContractIssuesFromZodError(parseResult.error, 'THEME_MANIFEST_INVALID')

    // ⚠ MUTASYON KANITI: `issue.keys.map(...)` → `issue.keys.slice(0,1).map(...)`
    // mutasyonu bu assertion'ı (length 3) 1'e düşürür — KIRMIZIYA döner.
    // `templates` alanı KENDİSİ eksik olduğu için `required`/`invalid_type`
    // türünde EK bir issue de üretilebilir; bu yüzden filtre `THEME_MANIFEST_
    // UNKNOWN_KEY` koduna göre yapılır (yalnızca unrecognized_keys genişlemesi
    // sayılır).
    const unknownKeyIssues = issues.filter((issue) => issue.code === 'THEME_MANIFEST_UNKNOWN_KEY')

    expect(unknownKeyIssues).toHaveLength(3)
    expect(unknownKeyIssues.map((issue) => issue.path).sort()).toEqual(
      ['extra1', 'extra2', 'tempaltes'].sort(),
    )
    for (const issue of unknownKeyIssues) {
      expect(issue.message).toBe('theme.json içinde sözleşmede tanımlı olmayan bir anahtar var.')
    }
  })

  it('tek bilinmeyen anahtarda TEK issue üretir (gerileme yok, mevcut davranış)', () => {
    const schema = z.strictObject({ id: z.string() })
    const parseResult = schema.safeParse({ id: 'x', extra: 1 })

    expect(parseResult.success).toBe(false)
    if (parseResult.success) {
      throw new Error('beklenmeyen başarı')
    }

    const issues = themeContractIssuesFromZodError(parseResult.error, 'THEME_MANIFEST_INVALID')
    const unknownKeyIssues = issues.filter((issue) => issue.code === 'THEME_MANIFEST_UNKNOWN_KEY')

    expect(unknownKeyIssues).toHaveLength(1)
    expect(unknownKeyIssues[0]?.path).toBe('extra')
  })
})
