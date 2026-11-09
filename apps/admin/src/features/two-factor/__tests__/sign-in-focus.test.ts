// @arkesoft/admin — `computeSignInFocusKey` testleri (ROADMAP v0.0.15,
// T-016 FIX turu 4/M-W2). Saf fonksiyon — DOM/React GEREKMEZ
// (`vitest.config.ts`'in `environment: 'node'` kararıyla TUTARLI).
import { describe, expect, it } from 'vitest'

import { computeSignInFocusKey } from '../sign-in-focus.js'

describe('computeSignInFocusKey — wcag FIX turu 4/M-W2', () => {
  it('credentials ve challengeEnded için `step.kind`i döner', () => {
    expect(computeSignInFocusKey({ kind: 'credentials' })).toBe('credentials')
    expect(computeSignInFocusKey({ kind: 'challengeEnded', message: 'Kod süresi doldu.' })).toBe(
      'challengeEnded',
    )
  })

  it('twoFactorMethod adımında `mode` anahtara DAHİL edilir', () => {
    expect(computeSignInFocusKey({ kind: 'twoFactorMethod', mode: 'totp' })).toBe(
      'twoFactorMethod:totp',
    )
    expect(computeSignInFocusKey({ kind: 'twoFactorMethod', mode: 'backup-code' })).toBe(
      'twoFactorMethod:backup-code',
    )
  })

  // M-W2'nin KÖKÜ — TOTP ↔ yedek kod geçişi `step.kind`'ı DEĞİŞTİRMEZ,
  // SADECE `mode` değişir. Bu test ESKİ davranışı (SADECE `step.kind`
  // kullanan bir anahtar fonksiyonu) taklit eden yerel bir karşılaştırmayla
  // KANITLAR: eski anahtar totp/backup-code için AYNI değeri üretirdi
  // (`useEffect` TETİKLENMEZDİ), yeni anahtar FARKLI değer üretir
  // (`useEffect` TETİKLENİR).
  it('vacuity: SADECE `step.kind` kullanan eski anahtar mod geçişini KAÇIRIRDI — yeni anahtar KAÇIRMAZ', () => {
    const legacyKeyOnlyUsingKind = (step: { readonly kind: string }): string => step.kind

    const legacyTotpKey = legacyKeyOnlyUsingKind({ kind: 'twoFactorMethod' })
    const legacyBackupKey = legacyKeyOnlyUsingKind({ kind: 'twoFactorMethod' })
    // Eski davranış: totp ve backup-code AYNI anahtarı üretir (KIRMIZI
    // senaryonun kanıtı — `useEffect` bu ikisi arasında TETİKLENMEZDİ).
    expect(legacyTotpKey).toBe(legacyBackupKey)

    const newTotpKey = computeSignInFocusKey({ kind: 'twoFactorMethod', mode: 'totp' })
    const newBackupKey = computeSignInFocusKey({ kind: 'twoFactorMethod', mode: 'backup-code' })
    // Yeni davranış: FARKLI anahtar üretir — `useEffect` tetiklenir, odak
    // taşınır (M-W2 kapandı).
    expect(newTotpKey).not.toBe(newBackupKey)
  })
})
