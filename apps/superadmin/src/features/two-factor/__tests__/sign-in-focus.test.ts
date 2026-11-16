// @arkesoft/superadmin — computeSignInFocusKey testleri (ROADMAP v0.0.20, T-021/S8)
import { describe, expect, it } from 'vitest'

import { computeSignInFocusKey } from '../sign-in-focus.js'

describe('computeSignInFocusKey', () => {
  it('"credentials" → "credentials"', () => {
    expect(computeSignInFocusKey({ kind: 'credentials' })).toBe('credentials')
  })

  it('"twoFactorMethod" + mode "totp" → "twoFactorMethod:totp"', () => {
    expect(computeSignInFocusKey({ kind: 'twoFactorMethod', mode: 'totp' })).toBe(
      'twoFactorMethod:totp',
    )
  })

  it('"twoFactorMethod" + mode "backup-code" → farklı bir anahtar üretir (mod geçişi odağı tetikler)', () => {
    const totpKey = computeSignInFocusKey({ kind: 'twoFactorMethod', mode: 'totp' })
    const backupKey = computeSignInFocusKey({ kind: 'twoFactorMethod', mode: 'backup-code' })
    expect(backupKey).not.toBe(totpKey)
  })

  it('"challengeEnded" → "challengeEnded"', () => {
    expect(computeSignInFocusKey({ kind: 'challengeEnded', message: 'x' })).toBe('challengeEnded')
  })
})
