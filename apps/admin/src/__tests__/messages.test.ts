// @arkesoft/admin — mesaj kataloğu testleri (ROADMAP v0.0.7, T-008/S4, AC8;
// ROADMAP v0.0.18, T-027/S7 — ÇÖZÜMLEME MERDİVENİ testleri EKLENDİ)
import { ERROR_MESSAGE_KEYS } from '@arkesoft/errors'
import { TR_TR_ERROR_MESSAGES } from '@arkesoft/i18n'
import { describe, expect, it } from 'vitest'

import {
  ERROR_MESSAGES_KEY_COUNT,
  formatSupportCodeLine,
  MESSAGES,
  PANEL_ERROR_CODES,
  REGISTRATION_FIELD_ERROR_KEYS,
  resolveErrorMessage,
  resolvePanelErrorMessage,
  resolveRegistrationFieldErrorMessage,
} from '../messages/messages.js'

// ⚠⚠ DoD pini — platform ailesi kaldırıldıktan sonra `PANEL_ERROR_CODES`
// YALNIZCA Better Auth ailesini (9 kod) taşır. Bu pin `grep -c
// "PERMISSION_DENIED\|UNAUTHENTICATED"` ölçümünün 0 olduğunu KOD SEVİYESİNDE
// de doğrular (T-027/S7 DoD).
describe('PANEL_ERROR_CODES — YALNIZCA Better Auth ailesi (platform ailesi KALKTI)', () => {
  it('tam olarak Better Auth ailesinin 9 kodunu taşır', () => {
    expect(PANEL_ERROR_CODES).toEqual([
      'EMAIL_NOT_VERIFIED',
      'INVALID_EMAIL_OR_PASSWORD',
      'INVALID_ORIGIN',
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
//
// ROADMAP v0.0.18, T-027/S7 (architect R-1 KARARI) — ÇÖZÜMLEME MERDİVENİ'nin
// BEŞ basamağı burada AYRI AYRI pinlenir (3. basamak dahil — "ölü değil").
describe('resolvePanelErrorMessage — ÇÖZÜMLEME MERDİVENİ (T-027/S7)', () => {
  it('basamak 1 — kind: "unknown" (kodsuz, gerçek ağ hatası) → MESSAGES.errors.network', () => {
    const message = resolvePanelErrorMessage({ kind: 'unknown', requestId: null })

    expect(message).toBe(MESSAGES.errors.network)
  })

  it('basamak 2 — messageKey TELDEN gelirse, code NE OLURSA OLSUN o anahtarın metni döner', () => {
    const message = resolvePanelErrorMessage({
      kind: 'known',
      code: 'BU_KOD_HİÇBİR_TABLODA_YOK',
      requestId: null,
      messageKey: 'errors.tenant.notFound',
      fields: null,
    })

    expect(message).toBe(TR_TR_ERROR_MESSAGES['errors.tenant.notFound'])
  })

  // ⚠⚠ BU TEST R-1'İN ASIL KAPANIŞI: `TENANT_NOT_FOUND` artık `PANEL_ERROR_CODES`'TA
  // (Better Auth ailesi) YOK — messageKey `null` olsa DAHİ metin `packages/errors`'ın
  // defterinden (3. basamak) MEKANİK olarak çözülür. 3. basamak ÖLÜ DEĞİL.
  it('basamak 3 — messageKey null, code packages/errors defterinde KAYITLI → defterden çözülür (ÖLÜ DEĞİL)', () => {
    const message = resolvePanelErrorMessage({
      kind: 'known',
      code: 'TENANT_NOT_FOUND',
      requestId: null,
      messageKey: null,
      fields: null,
    })

    expect(message).toBe(TR_TR_ERROR_MESSAGES['errors.tenant.notFound'])
    expect(message).not.toBe('Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.')
  })

  it('basamak 4 — messageKey null, code packages/errors defterinde YOK ama Better Auth tablosunda VAR', () => {
    const message = resolvePanelErrorMessage({
      kind: 'known',
      code: 'INVALID_EMAIL_OR_PASSWORD',
      requestId: null,
      messageKey: null,
      fields: null,
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
      fields: null,
    })

    expect(message).toBe(resolveErrorMessage('TOTALLY_UNKNOWN_CODE_XYZ'))
    expect(message).not.toContain('TOTALLY_UNKNOWN_CODE_XYZ')
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
// Bu blok seçimi MEKANİK olarak pinler.
describe('resolvePanelErrorMessage — prototip zinciri jetonları (qa, T-027 tur 1, negatif kanıt)', () => {
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'])(
    'code=%s → jenerik mesaja düşer, prototip zincirinden bir metin/fonksiyon SIZDIRMAZ',
    (prototypeChainToken) => {
      const message = resolvePanelErrorMessage({
        kind: 'known',
        code: prototypeChainToken,
        requestId: null,
        messageKey: null,
        fields: null,
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
// `TR_TR_ERROR_MESSAGES` (defterin basamak 3 kaynağı, `@arkesoft/i18n`) ÜÇ
// kod için AYNI metni İKİ AYRI yerde ELLE taşıyor (EMAIL_NOT_VERIFIED,
// ACCOUNT_TEMPORARILY_LOCKED, INVALID_PASSWORD — `messages.ts:39-43`'ün dosya
// başı yorumunun kayıtlı ettiği KASITLI çift kaynak: ikisi de GERÇEK uca
// vurularak ayrı ayrı ölçüldüğü için panelin KENDİ listesinde KALDI). Bu iki
// yerin BİREBİR eşit tutulduğunu zorlayan MEKANİK bir kapı (`tsc`/ESLint/
// guards) YOK — bu test o boşluğu kapatır: biri drift ederse burada KIRMIZI
// olur. ⚠ Üretim kodu bu turda DEĞİŞMEDİ (qa rolü) — düzeltme gereken bir
// drift bulunursa sorumlu ajan `frontend`dir (bu dosyanın BİRİNCİL yazıcısı).
describe('ERROR_MESSAGES ↔ TR_TR_ERROR_MESSAGES — iki aile aynı metni taşıyan kodlar (qa mekanik pin)', () => {
  it.each(['EMAIL_NOT_VERIFIED', 'ACCOUNT_TEMPORARILY_LOCKED', 'INVALID_PASSWORD'] as const)(
    '%s — panelin Better Auth metni, defter anahtarının tr-TR karşılığıyla BİREBİR eşit',
    (code) => {
      const registryKey = ERROR_MESSAGE_KEYS[code]
      expect(resolveErrorMessage(code)).toBe(TR_TR_ERROR_MESSAGES[registryKey])
    },
  )
})

// T-019/S8 (F13, AC-5) — `fields` kanalının mesaj çözücüsü. `resolveErrorMessage`
// ile AYNI desen: KAPALI dünya + AÇIK (`string`) imza + güvenli jenerik geri düşüş.
describe('resolveRegistrationFieldErrorMessage', () => {
  it('kümedeki her alan hatası anahtarı için kataloğun kendi metnini döner', () => {
    for (const key of REGISTRATION_FIELD_ERROR_KEYS) {
      const message = resolveRegistrationFieldErrorMessage(key)
      expect(message.length).toBeGreaterThan(0)
    }
  })

  it('bilinmeyen/uydurma anahtar için jenerik Türkçe mesaja düşer, anahtarı basmaz', () => {
    const message = resolveRegistrationFieldErrorMessage('errors.uydurma.kod')

    expect(message).toBe('Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.')
    expect(message).not.toContain('errors.uydurma.kod')
  })

  // ⚠⚠ NEGATİF TEST 1 (en önemlisi, brief) — SAVUNMA DERİNLİĞİ: bu fonksiyon
  // `normalizePanelError`'ın allowlist filtresinden BAĞIMSIZ olarak, kendisine
  // DOĞRUDAN ham bir sunucu metni verilse DAHİ o metni ASLA döndürmez —
  // jenerik mesaja düşer. Ham metin çıktıda 0 eşleşme.
  it('NEGATİF TEST 1 — ham Türkçe metin doğrudan verilse DAHİ ASLA ekrana basılmaz', () => {
    const rawServerText = 'Bu alan adı sistem yöneticisi tarafından elle reddedildi.'

    const message = resolveRegistrationFieldErrorMessage(rawServerText)

    expect(message).toBe('Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.')
    expect(message.includes(rawServerText)).toBe(false)
  })

  it('hiçbir mesaj i18n anahtarı biçiminde (errors.xxx) DEĞİL', () => {
    for (const key of REGISTRATION_FIELD_ERROR_KEYS) {
      expect(resolveRegistrationFieldErrorMessage(key)).not.toMatch(/\berrors\.[a-z]/)
    }
  })

  it('kapalı dünya: REGISTRATION_FIELD_ERROR_KEYS @arkesoft/trpc şemasından türetilmiş, elle çoğaltılmamış (4 üye)', () => {
    expect(REGISTRATION_FIELD_ERROR_KEYS).toEqual([
      'errors.slug.taken',
      'errors.slug.reserved',
      'errors.slug.invalidFormat',
      'errors.slug.unreachable',
    ])
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
