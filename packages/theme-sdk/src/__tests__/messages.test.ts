// @arkesoft/theme-sdk — `THEME_CONTRACT_MESSAGES` kapsam testleri (ROADMAP
// v0.0.9, T-010/S2)
//
// `satisfies Record<ThemeContractErrorCode, string>` derleme zamanı
// güvencesinin (messages.ts dosya başı yorumu) çalışma zamanı karşılığı:
// bu test tablonun 15 kararlı koddan OLUŞTUĞUNU ve her mesajın BOŞ
// OLMADIĞINI pinler. Kasıtlı bozma kanıtı (bir mesaj satırının silinmesinin
// `pnpm typecheck`'i kırdığı) handoff paketinde ham çıktı olarak taşınır —
// bu dosyada TEKRAR üretilmez (geri alınan bir bozulma kod tabanında iz
// bırakmaz).

import { describe, expect, it } from 'vitest'

import type { ThemeContractErrorCode } from '../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'

const EXPECTED_CODES: readonly ThemeContractErrorCode[] = [
  'THEME_MANIFEST_UNKNOWN_KEY',
  'THEME_MANIFEST_INVALID',
  'THEME_ID_INVALID',
  'THEME_SDK_RANGE_INVALID',
  'THEME_TEMPLATE_UNKNOWN',
  'THEME_TEMPLATE_MISSING',
  'THEME_TEMPLATE_DUPLICATE',
  'THEME_SETTING_KEY_UNSAFE',
  'THEME_SETTING_INVALID',
  'THEME_ASSET_REF_INVALID',
  'THEME_MIGRATION_MISSING',
  'THEME_MIGRATION_GAP',
  'THEME_MIGRATION_DUPLICATE',
  'THEME_MIGRATION_CYCLE',
  'THEME_MIGRATION_RESULT_INVALID',
]

describe('THEME_CONTRACT_MESSAGES', () => {
  it('tam olarak 15 kararlı kodu kapsar, ne eksik ne fazla', () => {
    const actualCodes = Object.keys(THEME_CONTRACT_MESSAGES).sort()
    const expectedSorted = [...EXPECTED_CODES].sort()

    expect(actualCodes).toEqual(expectedSorted)
    expect(actualCodes).toHaveLength(15)
  })

  it('her mesaj boş olmayan bir Türkçe geliştirici metni taşır', () => {
    for (const code of EXPECTED_CODES) {
      expect(THEME_CONTRACT_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })
})
