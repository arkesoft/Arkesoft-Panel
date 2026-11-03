// @arkesoft/storefront — `assertNever` birim testi (ROADMAP v0.0.10, T-012/S7)
//
// `@arkesoft/theme-sdk/src/__tests__/assert-never.test.ts` ile AYNI desen
// (farklı paket, aynı sözleşme) — bu paketin KENDİ yerel kopyasını sınar.
import { describe, expect, it } from 'vitest'

import { assertNever } from '../assert-never.js'

describe('assertNever', () => {
  it('context ve JSON serileştirilmiş değerle hata fırlatır', () => {
    // `never` sözleşmesini test içinde kasıtlı olarak kırmak için `as never`
    // kullanılıyor — `assertNever`'ın VAROLUŞ SEBEBİ tam olarak bu teorik-
    // imkânsız dalı sınamaktır.
    const value = 'unexpected-value' as never

    expect(() => assertNever(value, 'assert-never.test.ts: fixture')).toThrow(
      'assert-never.test.ts: fixture: beklenmeyen değer — "unexpected-value"',
    )
  })
})
