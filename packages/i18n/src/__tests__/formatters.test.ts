// @arkesoft/i18n — format-date.ts + format-number.ts testleri (ROADMAP
// v0.0.18, T-027/S5a, AC-50'nin yarısı)

import { describe, expect, it } from 'vitest'

import { formatDate } from '../format-date.js'
import { formatNumber } from '../format-number.js'

describe('formatDate', () => {
  it('varsayılan locale (tr-TR) + varsayılan stil ile biçimlendirir', () => {
    const isoDateTime = '2026-01-15T10:30:00.000Z'

    expect(formatDate(isoDateTime)).toBe(
      new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(isoDateTime),
      ),
    )
  })

  it('⭐ AC-50 — apps/superadmin/src/lib/format-platform-date.ts çağrısıyla (hiçbir seçenek geçmeden) BİREBİR aynı çıktıyı üretir', () => {
    const isoDateTime = '2026-06-01T08:00:00.000Z'
    const legacyEquivalent = new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(isoDateTime))

    expect(formatDate(isoDateTime)).toBe(legacyEquivalent)
  })

  it('açık locale ile çağrılabilir (jenerik locale desteği)', () => {
    const isoDateTime = '2026-06-01T08:00:00.000Z'

    expect(formatDate(isoDateTime, { locale: 'en-US' })).toBe(
      new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(isoDateTime),
      ),
    )
  })

  it('dateStyle/timeStyle override edilebilir', () => {
    const isoDateTime = '2026-06-01T08:00:00.000Z'

    expect(formatDate(isoDateTime, { dateStyle: 'short', timeStyle: 'short' })).toBe(
      new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(isoDateTime),
      ),
    )
  })
})

describe('formatNumber', () => {
  it('varsayılan locale (tr-TR) ile biçimlendirir', () => {
    expect(formatNumber(1234.5)).toBe(new Intl.NumberFormat('tr-TR').format(1234.5))
  })

  it('açık locale ile çağrılabilir', () => {
    expect(formatNumber(1234.5, { locale: 'en-US' })).toBe(
      new Intl.NumberFormat('en-US').format(1234.5),
    )
  })

  it('ondalık basamak seçenekleri iletilir', () => {
    expect(formatNumber(1, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
      new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(1),
    )
  })
})
