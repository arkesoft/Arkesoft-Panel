// @arkesoft/theme-sdk — `ThemeContractError` birim testleri (ROADMAP v0.0.9,
// T-010/S2)

import { describe, expect, it } from 'vitest'

import { ThemeContractError, type ThemeContractIssue } from '../errors.js'

describe('ThemeContractError', () => {
  it('tek issue için code@path: message biçiminde mesaj üretir', () => {
    const issues: readonly ThemeContractIssue[] = [
      { code: 'THEME_ID_INVALID', path: 'id', message: "Tema id'si geçersiz." },
    ]

    const error = new ThemeContractError(issues)

    expect(error.message).toBe("THEME_ID_INVALID@id: Tema id'si geçersiz.")
    expect(error.name).toBe('ThemeContractError')
    expect(error.issues).toBe(issues)
    expect(error).toBeInstanceOf(Error)
  })

  it('birden çok issue için mesajları "; " ile birleştirir', () => {
    const issues: readonly ThemeContractIssue[] = [
      { code: 'THEME_ID_INVALID', path: 'id', message: 'A' },
      { code: 'THEME_TEMPLATE_MISSING', path: 'templates', message: 'B' },
    ]

    const error = new ThemeContractError(issues)

    expect(error.message).toBe('THEME_ID_INVALID@id: A; THEME_TEMPLATE_MISSING@templates: B')
  })

  it('boş issue listesi için jenerik bir mesaj üretir', () => {
    const error = new ThemeContractError([])

    expect(error.message).toBe('theme-sdk: doğrulama başarısız (issue listesi boş)')
    expect(error.issues).toEqual([])
  })
})
