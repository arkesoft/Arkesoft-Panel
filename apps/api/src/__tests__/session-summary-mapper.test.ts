// @arkesoft/api — toSessionSummary() birim testi (ROADMAP v0.0.15.1, T-017/
// FIX turu 1, solid gate M-2 bulgusu)
//
// solid gate'in M-2 bulgusu BİREBİR: `sessions.service.ts:129`'daki `'' →
// null` sentinel eşlemesi HİÇBİR testle pinli DEĞİLDİ — onu pinliyormuş gibi
// duran `session-list-read-port-adapter.test.ts:113`'teki assert TOTOLOJİdi
// (`row.ipAddress === null || typeof row.ipAddress === 'string'` tip zaten
// bunu garanti eder, hiçbir girdi için kırmızı VEREMEZ).
//
// BEŞ vaka, SAF fonksiyon üzerinde, I/O YOK:
//   1. `'' → null`   — eski satır sentinel'i (S6 öncesi).
//   2. `null → null` — yeni satır, IP tespit edilemedi.
//   3. gerçek IP → KENDİSİ — eşleme GERÇEK bir değeri BOZMAZ.
//   4. `isCurrent` — `row.id === currentSessionId` KARŞILAŞTIRMASINDAN türetilir.
//   5. ham `userAgent` tele/çıktıya SIZMAZ — bu vaka ÖZELLİKLE değerli:
//      `{...row}` yayma varyantı `tsc --noEmit --strict` altında exit 0
//      verir (derleyici sızıntıyı YAKALAMAZ), mutant testte ise bu vaka
//      KIRMIZI verir — sızmaya karşı TEK mekanik bekçi budur.
//
// VACUITY KANITI (Task raporunda tekrarlanır): `toSessionSummary()`'deki
// `row.ipAddress === '' ? null : row.ipAddress` ifadesi `row.ipAddress`'e
// SADELEŞTİRİLİRSE vaka 1 (`'' → null`) KIRMIZI verir — bu testin KENDİSİ
// solid'in "bu düzenleme tek test kırmazdı" bulgusunu TERS ÇEVİRİR.

import { describe, expect, it } from 'vitest'

import { toSessionSummary } from '../auth/session-summary.mapper.js'
import type { SessionSummaryRow } from '../auth/session-summary.mapper.js'

const CURRENT_SESSION_ID = 'session-current-01'

function buildRow(overrides: Partial<SessionSummaryRow> = {}): SessionSummaryRow {
  return {
    id: 'session-01',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    ipAddress: null,
    userAgent: null,
    ...overrides,
  }
}

describe('toSessionSummary() — ipAddress sentinel eşlemesi (M-2 düzeltmesi)', () => {
  it("vaka 1 — boş dize sentinel'i ('') → null", () => {
    const row = buildRow({ ipAddress: '' })

    const summary = toSessionSummary(row, CURRENT_SESSION_ID)

    expect(summary.ipAddress).toBeNull()
  })

  it('vaka 2 — null (IP tespit edilemedi) → null', () => {
    const row = buildRow({ ipAddress: null })

    const summary = toSessionSummary(row, CURRENT_SESSION_ID)

    expect(summary.ipAddress).toBeNull()
  })

  it('vaka 3 — gerçek IP → KENDİSİ (eşleme gerçek bir değeri BOZMAZ)', () => {
    const row = buildRow({ ipAddress: '198.51.100.77' })

    const summary = toSessionSummary(row, CURRENT_SESSION_ID)

    expect(summary.ipAddress).toBe('198.51.100.77')
  })

  it('isCurrent — row.id === currentSessionId KARŞILAŞTIRMASINDAN türetilir', () => {
    const matchingRow = buildRow({ id: CURRENT_SESSION_ID })
    const otherRow = buildRow({ id: 'session-99' })

    expect(toSessionSummary(matchingRow, CURRENT_SESSION_ID).isCurrent).toBe(true)
    expect(toSessionSummary(otherRow, CURRENT_SESSION_ID).isCurrent).toBe(false)
  })

  it('ham userAgent tele/çıktıya SIZMAZ — SessionSummary alan olarak taşımaz', () => {
    const row = buildRow({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0' })

    const summary = toSessionSummary(row, CURRENT_SESSION_ID)

    expect(summary).not.toHaveProperty('userAgent')
    expect(JSON.stringify(summary)).not.toContain('Mozilla')
  })
})
