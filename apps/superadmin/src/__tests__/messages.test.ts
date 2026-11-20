// @arkesoft/superadmin — mesaj kataloğu testleri (ROADMAP v0.0.20, T-021/S8;
// ROADMAP v0.0.18, T-027/S7 — ÇÖZÜMLEME MERDİVENİ testleri EKLENDİ)
import { ERROR_MESSAGE_KEYS } from '@arkesoft/errors'
import { TR_TR_ERROR_MESSAGES } from '@arkesoft/i18n'
import { describe, expect, it } from 'vitest'

import {
  ERROR_MESSAGES_KEY_COUNT,
  formatSupportCodeLine,
  MESSAGES,
  PANEL_ERROR_CODES,
  resolveErrorMessage,
  resolvePanelErrorMessage,
} from '../messages/messages.js'

// ⚠⚠ DoD pini — platform ailesi kaldırıldıktan sonra `PANEL_ERROR_CODES`
// YALNIZCA Better Auth ailesini (8 kod — bu panel e-posta doğrulama akışını
// hiç çalıştırmadığı için `EMAIL_NOT_VERIFIED` admin'den FARKLI olarak YOK)
// taşır. Bu pin `grep -c "PERMISSION_DENIED\|UNAUTHENTICATED"` ölçümünün 0
// olduğunu KOD SEVİYESİNDE de doğrular (T-027/S7 DoD).
describe('PANEL_ERROR_CODES — YALNIZCA Better Auth ailesi (platform ailesi KALKTI)', () => {
  it('tam olarak Better Auth ailesinin 8 kodunu taşır', () => {
    expect(PANEL_ERROR_CODES).toEqual([
      'INVALID_ORIGIN',
      'INVALID_EMAIL_OR_PASSWORD',
      'INVALID_CODE',
      'INVALID_BACKUP_CODE',
      'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
      'ACCOUNT_TEMPORARILY_LOCKED',
      'INVALID_TWO_FACTOR_COOKIE',
      'INVALID_PASSWORD',
    ])
  })

  it('UNAUTHENTICATED/PERMISSION_DENIED (platform ailesi) BURADA YOK', () => {
    expect(PANEL_ERROR_CODES).not.toContain('UNAUTHENTICATED')
    expect(PANEL_ERROR_CODES).not.toContain('PERMISSION_DENIED')
  })
})

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

// ROADMAP v0.0.18, T-027/S7 (architect R-1 KARARI) — ÇÖZÜMLEME MERDİVENİ'nin
// BEŞ basamağı burada AYRI AYRI pinlenir (3. basamak dahil — "ölü değil").
// `apps/admin`'in AYNI desenindeki test bloğunun kardeşi.
describe('resolvePanelErrorMessage — ÇÖZÜMLEME MERDİVENİ (T-027/S7)', () => {
  it('basamak 1 — kind: "unknown" (kodsuz, gerçek ağ hatası) → MESSAGES.errors.network', () => {
    expect(resolvePanelErrorMessage({ kind: 'unknown', requestId: null })).toBe(
      MESSAGES.errors.network,
    )
  })

  it('basamak 2 — messageKey TELDEN gelirse, code NE OLURSA OLSUN o anahtarın metni döner', () => {
    const message = resolvePanelErrorMessage({
      kind: 'known',
      code: 'BU_KOD_HİÇBİR_TABLODA_YOK',
      requestId: null,
      messageKey: 'errors.platform.adminRequired',
    })

    expect(message).toBe(TR_TR_ERROR_MESSAGES['errors.platform.adminRequired'])
  })

  // ⚠⚠ BU TEST M7'NİN ASIL KAPANIŞI: `PLATFORM_ADMIN_REQUIRED`/
  // `PLATFORM_NETWORK_NOT_ALLOWED` bu panelin "kendi en alakalı iki hatası"
  // olduğu HALDE `PANEL_ERROR_CODES`'A HİÇ EKLENMEDİ — messageKey `null` olsa
  // DAHİ metin `packages/errors`'ın defterinden (3. basamak) MEKANİK olarak
  // çözülür. 3. basamak ÖLÜ DEĞİL.
  it('basamak 3 — PLATFORM_ADMIN_REQUIRED, messageKey null, PANEL_ERROR_CODESta YOK → defterden çözülür (M7 KAPANDI)', () => {
    const message = resolvePanelErrorMessage({
      kind: 'known',
      code: 'PLATFORM_ADMIN_REQUIRED',
      requestId: null,
      messageKey: null,
    })

    expect(message).toBe(TR_TR_ERROR_MESSAGES['errors.platform.adminRequired'])
    expect(message).not.toBe('Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.')
  })

  it('basamak 3 — PLATFORM_NETWORK_NOT_ALLOWED, messageKey null → defterden çözülür (M7 KAPANDI)', () => {
    const message = resolvePanelErrorMessage({
      kind: 'known',
      code: 'PLATFORM_NETWORK_NOT_ALLOWED',
      requestId: null,
      messageKey: null,
    })

    expect(message).toBe(TR_TR_ERROR_MESSAGES['errors.platform.networkNotAllowed'])
  })

  it('basamak 4 — messageKey null, code packages/errors defterinde YOK ama Better Auth tablosunda VAR', () => {
    const message = resolvePanelErrorMessage({
      kind: 'known',
      code: 'INVALID_EMAIL_OR_PASSWORD',
      requestId: null,
      messageKey: null,
    })

    expect(message).toBe(resolveErrorMessage('INVALID_EMAIL_OR_PASSWORD'))
    expect(message).toBe('E-posta veya parola hatalı.')
  })

  it('basamak 5 — messageKey null, code HİÇBİR tabloda YOK → jenerik mesaja düşer (fail-closed)', () => {
    const message = resolvePanelErrorMessage({
      kind: 'known',
      code: 'TOTALLY_UNKNOWN_CODE_XYZ',
      requestId: null,
      messageKey: null,
    })

    expect(message).not.toContain('TOTALLY_UNKNOWN_CODE_XYZ')
    expect(message).toBe('Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.')
  })
})

// ⚠⚠ qa gate, T-027 tur 1 — PROTOTİP ZİNCİRİ negatif kanıtı (security'nin
// bulgusu, "qa'ya atandı"): basamak 3'ün `isRegisteredPlatformCode`'u
// (`messages.ts` → `Object.hasOwn(ERROR_MESSAGE_KEYS, code)`) BUGÜN güvenli —
// `Object.hasOwn` prototip zincirine BAKMAZ (`in` operatöründen veya
// `ERROR_MESSAGE_KEYS[code] !== undefined`'dan FARKLI). Ama bu seçim hiçbir
// testle PİNLİ değildi; regresyon (ör. `Object.hasOwn` yerine `in` kullanımı)
// sessizce geçerdi ve `code: '__proto__'`/`'constructor'` gibi bir değer
// `Object.prototype`'ın bir metodunu (`function` değerini) `t()`'ye akıtabilirdi.
// Bu blok seçimi MEKANİK olarak pinler — `apps/admin`'in AYNI bloğunun kardeşi.
describe('resolvePanelErrorMessage — prototip zinciri jetonları (qa, T-027 tur 1, negatif kanıt)', () => {
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'])(
    'code=%s → jenerik mesaja düşer, prototip zincirinden bir metin/fonksiyon SIZDIRMAZ',
    (prototypeChainToken) => {
      const message = resolvePanelErrorMessage({
        kind: 'known',
        code: prototypeChainToken,
        requestId: null,
        messageKey: null,
      })

      expect(typeof message).toBe('string')
      expect(message).toBe('Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.')
      expect(message).not.toContain('function')
      expect(message).not.toContain('[object')
    },
  )
})

// ⚠⚠ qa gate, T-027 tur 1 — MEKANİK PİN (solid tur 1'in bulgusu, qa'ya
// devredildi): `ERROR_MESSAGES` (bu panelin Better Auth ailesi, basamak 4) VE
// `TR_TR_ERROR_MESSAGES` (defterin basamak 3 kaynağı, `@arkesoft/i18n`) İKİ
// kod için AYNI metni İKİ AYRI yerde ELLE taşıyor (ACCOUNT_TEMPORARILY_LOCKED,
// INVALID_PASSWORD — bu panelin `messages.ts` dosya başı yorumunun kayıtlı
// ettiği KASITLI çift kaynak). Bu iki yerin BİREBİR eşit tutulduğunu zorlayan
// MEKANİK bir kapı (`tsc`/ESLint/guards) YOK — bu test o boşluğu kapatır: biri
// drift ederse burada KIRMIZI olur. ⚠ Üretim kodu bu turda DEĞİŞMEDİ (qa
// rolü) — düzeltme gereken bir drift bulunursa sorumlu ajan `frontend`dir.
describe('ERROR_MESSAGES ↔ TR_TR_ERROR_MESSAGES — iki aile aynı metni taşıyan kodlar (qa mekanik pin)', () => {
  it.each(['ACCOUNT_TEMPORARILY_LOCKED', 'INVALID_PASSWORD'] as const)(
    '%s — panelin Better Auth metni, defter anahtarının tr-TR karşılığıyla BİREBİR eşit',
    (code) => {
      const registryKey = ERROR_MESSAGE_KEYS[code]
      expect(resolveErrorMessage(code)).toBe(TR_TR_ERROR_MESSAGES[registryKey])
    },
  )
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
