// @arkesoft/theme-sdk — `assertNever` birim testi (ROADMAP v0.0.9, T-010/S2)

import { describe, expect, it } from 'vitest'

import { assertNever } from '../assert-never.js'

describe('assertNever', () => {
  it('context ve JSON serileştirilmiş değerle hata fırlatır', () => {
    // `never` sözleşmesini test içinde kasıtlı olarak kırmak için `as never`
    // kullanılıyor — bu paketteki tek runtime-kaçışlı test senaryosu, çünkü
    // `assertNever`'ın VAROLUŞ SEBEBİ tam olarak bu teorik-imkânsız dalı
    // sınamaktır.
    const value = 'unexpected-value' as never

    expect(() => assertNever(value, 'assert-never.test.ts: fixture')).toThrow(
      'assert-never.test.ts: fixture: beklenmeyen değer — "unexpected-value"',
    )
  })
})
