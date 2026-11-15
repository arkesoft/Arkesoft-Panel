// @arkesoft/admin — `resolveShapeErrorMessage` testleri (ROADMAP v0.1.0,
// T-019 GATE TUR 1 düzeltmesi, docs/gates/T-019-solid-tur1.md).
// Saf fonksiyon — DOM/React GEREKMEZ (`vitest.config.ts`'in
// `environment: 'node'` kararıyla TUTARLI).
import { describe, expect, it } from 'vitest'

import {
  resolveShapeErrorMessage,
  type ShapeErrorFieldMessages,
} from '../resolve-shape-error-message.js'

/** `_auth.kayit.tsx`/`_auth.sign-in.tsx`'in e-posta alanı için verdiği mesaj kümesinin AYNISI. */
const emailMessages: ShapeErrorFieldMessages = {
  required: 'E-postanı gir.',
  invalidFormat: 'Geçerli bir e-posta adresi gir.',
  genericError: 'Bu alanda bir sorun var.',
}

/** `_auth.sign-in.tsx`'in şifre alanı için verdiği mesaj kümesi — `invalidFormat`/`custom` TANIMSIZ. */
const passwordMessages: ShapeErrorFieldMessages = {
  required: 'Şifreni gir.',
  genericError: 'Bu alanda bir sorun var.',
}

/** `_auth.kayit.tsx`'in şifre-tekrar alanı için verdiği mesaj kümesi — `custom` TANIMLI, `invalidFormat` TANIMSIZ. */
const passwordConfirmMessages: ShapeErrorFieldMessages = {
  required: 'Şifreni tekrar gir.',
  custom: 'Şifreler eşleşmiyor.',
  genericError: 'Bu alanda bir sorun var.',
}

describe('resolveShapeErrorMessage — T-019 GATE TUR 1 düzeltmesi', () => {
  it('`errorType` tanımsızsa `undefined` döner — `Input` hata GÖSTERMEZ', () => {
    expect(resolveShapeErrorMessage(undefined, emailMessages)).toBeUndefined()
  })

  // ⚠⚠ MUTASYON PROBU — Zod'un literallerinden BİRİNİ değiştirsen (ör.
  // fonksiyonun gövdesinde `'too_small'` → `'too_small_typo'`) AŞAĞIDAKİ
  // assertion'lardan en az biri KIRMIZI olur; bu testler `solid`'in negatif
  // kanıtını (export'suz + görünmez eşleme) KAPATIR.
  it('`too_small` → `required` (zorunlu alan boş) — HER ÜÇ alan kümesi için', () => {
    expect(resolveShapeErrorMessage('too_small', emailMessages)).toBe(emailMessages.required)
    expect(resolveShapeErrorMessage('too_small', passwordMessages)).toBe(passwordMessages.required)
    expect(resolveShapeErrorMessage('too_small', passwordConfirmMessages)).toBe(
      passwordConfirmMessages.required,
    )
  })

  it('`invalid_format` → `invalidFormat` TANIMLIYSA onu döner (e-posta biçimi)', () => {
    expect(resolveShapeErrorMessage('invalid_format', emailMessages)).toBe(
      emailMessages.invalidFormat,
    )
  })

  it('`invalid_format` → `invalidFormat` TANIMSIZSA `genericError`e düşer (şifre alanı)', () => {
    expect(resolveShapeErrorMessage('invalid_format', passwordMessages)).toBe(
      passwordMessages.genericError,
    )
  })

  it('`custom` → `custom` TANIMLIYSA onu döner (şifre eşleşmesi, `.refine()`)', () => {
    expect(resolveShapeErrorMessage('custom', passwordConfirmMessages)).toBe(
      passwordConfirmMessages.custom,
    )
  })

  it('`custom` → `custom` TANIMSIZSA `genericError`e düşer (e-posta/şifre alanı)', () => {
    expect(resolveShapeErrorMessage('custom', emailMessages)).toBe(emailMessages.genericError)
    expect(resolveShapeErrorMessage('custom', passwordMessages)).toBe(passwordMessages.genericError)
  })

  it('TANINMAYAN her kod `genericError`e düşer — FAIL-CLOSED (CLAUDE.md §10/16)', () => {
    expect(resolveShapeErrorMessage('too_big', emailMessages)).toBe(emailMessages.genericError)
    expect(resolveShapeErrorMessage('invalid_type', passwordMessages)).toBe(
      passwordMessages.genericError,
    )
    expect(resolveShapeErrorMessage('unrecognized_keys', passwordConfirmMessages)).toBe(
      passwordConfirmMessages.genericError,
    )
  })
})
