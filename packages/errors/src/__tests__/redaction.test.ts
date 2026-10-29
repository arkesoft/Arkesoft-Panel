// @arkesoft/errors — redaction birim testleri (ROADMAP v0.0.4, T-002/ST-3b, architect K-A7)

import { describe, expect, it } from 'vitest'

import { maskEmail, PINO_REDACT_PATHS } from '../redaction.js'

describe('maskEmail', () => {
  it('standart bir e-postayı maskeler', () => {
    expect(maskEmail('ahmet@example.com')).toBe('a***@example.com')
  })

  it.each([
    ['boş dize', ''],
    ['@ yok', 'ahmetexamplecom'],
    ['birden çok @', 'ahmet@example@com'],
    ['yerel kısım boş (@ ile başlıyor)', '@example.com'],
    ['alan adı boş (@ ile bitiyor)', 'ahmet@'],
    ['yalnızca @', '@'],
  ])('%s → tamamen maskelenir', (_label, value) => {
    expect(maskEmail(value)).toBe('***')
  })

  it('yerel kısım tek karakter olsa da ilk karakteri korur, gerisini maskeler', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com')
  })

  it('hiçbir kenar durumda ham e-postayı geri döndürmez', () => {
    const inputs = [
      'ahmet@example.com',
      'ahmetexamplecom',
      'ahmet@example@com',
      '@example.com',
      'ahmet@',
      'a@example.com',
    ]

    for (const input of inputs) {
      expect(maskEmail(input)).not.toBe(input)
    }
  })
})

describe('PINO_REDACT_PATHS', () => {
  it('cookie, authorization ve set-cookie içerir', () => {
    expect(PINO_REDACT_PATHS).toContain('cookie')
    expect(PINO_REDACT_PATHS).toContain('authorization')
    expect(PINO_REDACT_PATHS).toContain('set-cookie')
  })

  it('sır alanlarını (password, token, apiKey, secret) içerir', () => {
    expect(PINO_REDACT_PATHS).toContain('password')
    expect(PINO_REDACT_PATHS).toContain('token')
    expect(PINO_REDACT_PATHS).toContain('apiKey')
    expect(PINO_REDACT_PATHS).toContain('secret')
  })

  it('req/res başlık karşılıklarını içerir', () => {
    expect(PINO_REDACT_PATHS).toContain('req.headers.cookie')
    expect(PINO_REDACT_PATHS).toContain('req.headers.authorization')
    expect(PINO_REDACT_PATHS).toContain('res.headers.cookie')
  })

  // ROADMAP v0.0.5, T-006/S3, architect "LOG DESENİ" — Better Auth'un sır
  // taşıyan altı alanı (CLAUDE.md §4/§10.7: şifre, token, oturum kimliği
  // asla loglanmaz).
  it('Better Auth sır alanlarını (sessionToken/verificationToken/resetToken/passwordHash) içerir', () => {
    expect(PINO_REDACT_PATHS).toContain('sessionToken')
    expect(PINO_REDACT_PATHS).toContain('verificationToken')
    expect(PINO_REDACT_PATHS).toContain('resetToken')
    expect(PINO_REDACT_PATHS).toContain('passwordHash')
  })

  it('Better Auth sır alanlarının joker ön ekli (*.sessionToken/*.passwordHash) karşılıklarını içerir', () => {
    expect(PINO_REDACT_PATHS).toContain('*.sessionToken')
    expect(PINO_REDACT_PATHS).toContain('*.passwordHash')
  })

  it("'*.value' İÇERMEZ (architect kararı — fazla geniş joker, meşru alanları siler)", () => {
    expect(PINO_REDACT_PATHS).not.toContain('*.value')
  })
})
