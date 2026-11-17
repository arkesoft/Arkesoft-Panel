// @arkesoft/superadmin — mesaj kataloğu testleri (ROADMAP v0.0.20, T-021/S8)
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
      expect(resolveErrorMessage(code).length).toBeGreaterThan(0)
    }
  })

  it('bilinmeyen kod için jenerik Türkçe mesaja düşer, kodu basmaz', () => {
    const message = resolveErrorMessage('TOTALLY_UNKNOWN_CODE_XYZ')

    expect(message).toBe('Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.')
    expect(message).not.toContain('TOTALLY_UNKNOWN_CODE_XYZ')
  })

  it('INVALID_EMAIL_OR_PASSWORD metni kullanıcı sayımını (enumeration) sızdırmaz', () => {
    const message = resolveErrorMessage('INVALID_EMAIL_OR_PASSWORD')

    expect(message).toBe('E-posta veya parola hatalı.')
    expect(message.toLowerCase()).not.toContain('böyle bir kullanıcı')
    expect(message.toLowerCase()).not.toContain('kullanıcı yok')
  })

  it('kapalı dünya: her kodun tam olarak bir mesajı var (tuple/kayıt eşleşmesi)', () => {
    expect(ERROR_MESSAGES_KEY_COUNT).toBe(PANEL_ERROR_CODES.length)
  })
})

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

    expect(message).not.toContain('TOTALLY_UNKNOWN_CODE_XYZ')
  })

  it('kind: "unknown" ise (kodsuz — gerçek ağ hatası) MESSAGES.errors.network döner', () => {
    expect(resolvePanelErrorMessage({ kind: 'unknown', requestId: null })).toBe(
      MESSAGES.errors.network,
    )
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

// AC-11 pini (negatif kapsam) — bu katalogda impersonation'ın kullanıcıya
// dönük yüzeyine ait hiçbir anahtar (gerekçe/süre sınırı/uyarı bandı) yok.
describe('MESSAGES — AC-11 negatif kapsam pini', () => {
  it('impersonation gerekçe/süre sınırı/uyarı bandına ait anahtar YOK', () => {
    const serialized = JSON.stringify(MESSAGES)
    expect(serialized).not.toMatch(/gerekçe/i)
    expect(serialized).not.toMatch(/süre sınırı/i)
  })
})

// ROADMAP v0.0.20.1 (T-022/S4, ADR-0024 Karar 5/AC-3) — `setupResumedNotice`
// KAPALI dünyayı (ERROR_MESSAGES/PanelErrorCode) BÜYÜTMEZ: `TOTP_NOT_ENABLED`
// içeride tüketilir, kullanıcıya hiçbir ekranda doğrudan gösterilmez. Bu
// bloğun TEK işi `MESSAGES.auth.twoFactor` altındaki bilgilendirme metnini
// doğrulamak.
describe('MESSAGES.auth.twoFactor.setupResumedNotice — ADR-0024 Karar 5', () => {
  it('anahtar VAR ve boş değil', () => {
    expect(MESSAGES.auth.twoFactor.setupResumedNotice.length).toBeGreaterThan(0)
  })

  it('metin yedek kodların bu ekranda tekrar gösterilemeyeceği SINIRINI içerir', () => {
    expect(MESSAGES.auth.twoFactor.setupResumedNotice).toContain('yedek kodlar')
    expect(MESSAGES.auth.twoFactor.setupResumedNotice).toContain('tekrar gösterilemez')
  })
})
