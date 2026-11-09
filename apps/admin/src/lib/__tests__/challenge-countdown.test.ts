// @arkesoft/admin — challenge-countdown.ts saf yardımcı testleri (ROADMAP
// v0.0.15, T-016/S10, WCAG 4.1.3 gürültü yasağı).
import { describe, expect, it } from 'vitest'

import { formatRemainingTime, shouldAnnounceRemainingSeconds } from '../challenge-countdown.js'

describe('formatRemainingTime', () => {
  it('600 → "10:00"', () => {
    expect(formatRemainingTime(600)).toBe('10:00')
  })

  it('65 → "1:05" (saniye iki haneye tamamlanır)', () => {
    expect(formatRemainingTime(65)).toBe('1:05')
  })

  it('0 → "0:00"', () => {
    expect(formatRemainingTime(0)).toBe('0:00')
  })

  it('negatif girdi 0a KIRPILIR (savunma)', () => {
    expect(formatRemainingTime(-5)).toBe('0:00')
  })
})

describe('shouldAnnounceRemainingSeconds — WCAG 4.1.3 gürültü yasağı', () => {
  it('60 saniyede true', () => {
    expect(shouldAnnounceRemainingSeconds(60)).toBe(true)
  })

  it('0 saniyede true', () => {
    expect(shouldAnnounceRemainingSeconds(0)).toBe(true)
  })

  it('aradaki HER saniyede false (ör. 599, 300, 61, 1)', () => {
    expect(shouldAnnounceRemainingSeconds(599)).toBe(false)
    expect(shouldAnnounceRemainingSeconds(300)).toBe(false)
    expect(shouldAnnounceRemainingSeconds(61)).toBe(false)
    expect(shouldAnnounceRemainingSeconds(1)).toBe(false)
  })
})
