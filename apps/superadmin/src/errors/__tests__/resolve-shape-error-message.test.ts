// @arkesoft/superadmin — `resolveShapeErrorMessage` testleri (ROADMAP
// v0.0.20, T-021/S8). Saf fonksiyon — DOM/React GEREKMEZ.
import { describe, expect, it } from 'vitest'

import {
  resolveShapeErrorMessage,
  type ShapeErrorFieldMessages,
} from '../resolve-shape-error-message.js'

const emailMessages: ShapeErrorFieldMessages = {
  required: 'E-postanı gir.',
  invalidFormat: 'Geçerli bir e-posta adresi gir.',
  genericError: 'Bu alanda bir sorun var.',
}

const passwordMessages: ShapeErrorFieldMessages = {
  required: 'Şifreni gir.',
  genericError: 'Bu alanda bir sorun var.',
}

describe('resolveShapeErrorMessage', () => {
  it('`errorType` tanımsızsa `undefined` döner — `Input` hata GÖSTERMEZ', () => {
    expect(resolveShapeErrorMessage(undefined, emailMessages)).toBeUndefined()
  })

  it('"too_small" → required mesajı', () => {
    expect(resolveShapeErrorMessage('too_small', emailMessages)).toBe('E-postanı gir.')
  })

  it('"invalid_format" + tanımlıysa → invalidFormat mesajı', () => {
    expect(resolveShapeErrorMessage('invalid_format', emailMessages)).toBe(
      'Geçerli bir e-posta adresi gir.',
    )
  })

  it('"invalid_format" ama TANIMSIZSA (şifre alanı) → genericError (fail-closed)', () => {
    expect(resolveShapeErrorMessage('invalid_format', passwordMessages)).toBe(
      'Bu alanda bir sorun var.',
    )
  })

  it('tanınmayan bir issue.code → genericError (fail-closed, sessizce kaybolmaz)', () => {
    expect(resolveShapeErrorMessage('some_future_zod_code', emailMessages)).toBe(
      'Bu alanda bir sorun var.',
    )
  })
})
