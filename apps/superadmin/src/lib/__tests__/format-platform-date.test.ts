// @arkesoft/superadmin — formatPlatformDate testleri (ROADMAP v0.0.20, T-021/S8)
import { describe, expect, it } from 'vitest'

import { formatPlatformDate } from '../format-platform-date.js'

describe('formatPlatformDate', () => {
  it('ISO-8601 dizesini boş olmayan bir Türkçe metne çevirir', () => {
    const formatted = formatPlatformDate('2026-01-15T10:30:00.000Z')
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('farklı iki tarih farklı metinler üretir (sabit değer DÖNDÜRMEZ)', () => {
    const first = formatPlatformDate('2026-01-15T10:30:00.000Z')
    const second = formatPlatformDate('2027-06-20T08:00:00.000Z')
    expect(first).not.toBe(second)
  })
})
