// @arkesoft/admin — mesaj kataloğu testleri (ROADMAP v0.0.7, T-008/S4, AC8)
import { describe, expect, it } from 'vitest'

import {
  ERROR_MESSAGES_KEY_COUNT,
  formatSupportCodeLine,
  MESSAGES,
  PANEL_ERROR_CODES,
  resolveErrorMessage,
  resolvePanelErrorMessage,
} from '../messages/messages.js'

describe('resolveErrorMessage', () => {
  it('bilinen her kod için kataloğun kendi metnini döner', () => {
    for (const code of PANEL_ERROR_CODES) {
      const message = resolveErrorMessage(code)
      expect(message.length).toBeGreaterThan(0)
    }
  })

  it('bilinmeyen kod için jenerik Türkçe mesaja düşer, kodu basmaz', () => {
    const message = resolveErrorMessage('TOTALLY_UNKNOWN_CODE_XYZ')

    expect(message).toBe('Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.')
    expect(message).not.toContain('TOTALLY_UNKNOWN_CODE_XYZ')
  })

  it('bozuk/boş girdi için de fırlatmadan jenerik mesaja düşer', () => {
    expect(resolveErrorMessage('')).toBe(resolveErrorMessage('TOTALLY_UNKNOWN_CODE_XYZ'))
  })

  it('hiçbir mesaj i18n anahtarı biçiminde (errors.xxx) DEĞİL (AC8)', () => {
    for (const code of PANEL_ERROR_CODES) {
      expect(resolveErrorMessage(code)).not.toMatch(/\berrors\.[a-z]/)
    }
    expect(resolveErrorMessage('bilinmeyen')).not.toMatch(/\berrors\.[a-z]/)
  })

  it('INVALID_EMAIL_OR_PASSWORD metni kullanıcı sayımını (enumeration) sızdırmaz', () => {
    const message = resolveErrorMessage('INVALID_EMAIL_OR_PASSWORD')

    expect(message).toBe('E-posta veya parola hatalı.')
    expect(message.toLowerCase()).not.toContain('böyle bir kullanıcı')
    expect(message.toLowerCase()).not.toContain('kullanıcı yok')
    expect(message.toLowerCase()).not.toContain('bulunamadı')
  })

  it("Better Auth'un ham İngilizce mesajını İÇERMİYOR (AC8)", () => {
    const message = resolveErrorMessage('INVALID_EMAIL_OR_PASSWORD')

    expect(message.toLowerCase()).not.toContain('invalid email or password')
  })

  it('kapalı dünya: her kodun tam olarak bir mesajı var (tuple/kayıt eşleşmesi)', () => {
    expect(ERROR_MESSAGES_KEY_COUNT).toBe(PANEL_ERROR_CODES.length)
  })
})

// DÜZELTME TURU 1 (`solid` M5): `_app.tsx` ve `_auth.sign-in.tsx`'teki
// birebir iki kopyanın BİRLEŞTİĞİ tek doğruluk kaynağı — `resolveErrorMessage`
// ve `MESSAGES.errors.network` ile AYNI davranışı AYRI bir "known"/"unknown"
// çözücü ÜZERİNDEN de doğru dallıyor mu, burada pinleniyor.
describe('resolvePanelErrorMessage', () => {
  it('kind: "known" ise resolveErrorMessage ile AYNI metni döner', () => {
    const message = resolvePanelErrorMessage({
      kind: 'known',
      code: 'UNAUTHENTICATED',
      requestId: null,
    })

    expect(message).toBe(resolveErrorMessage('UNAUTHENTICATED'))
  })

  it('kind: "known" ama kod kataloğa KAYITLI DEĞİLSE jenerik mesaja düşer (fail-closed)', () => {
    const message = resolvePanelErrorMessage({
      kind: 'known',
      code: 'TOTALLY_UNKNOWN_CODE_XYZ',
      requestId: null,
    })

    expect(message).toBe(resolveErrorMessage('TOTALLY_UNKNOWN_CODE_XYZ'))
    expect(message).not.toContain('TOTALLY_UNKNOWN_CODE_XYZ')
  })

  it('kind: "unknown" ise (kodsuz — gerçek ağ hatası) MESSAGES.errors.network döner', () => {
    const message = resolvePanelErrorMessage({ kind: 'unknown', requestId: null })

    expect(message).toBe(MESSAGES.errors.network)
  })
})

describe('formatSupportCodeLine', () => {
  it('requestId varsa "Destek kodu: …" satırı üretir', () => {
    expect(formatSupportCodeLine('req_01J000000000000000000000')).toBe(
      'Destek kodu: req_01J000000000000000000000',
    )
  })

  it('requestId yoksa (null) hiçbir satır üretmez — uydurmaz', () => {
    expect(formatSupportCodeLine(null)).toBeNull()
  })
})
