// @arkesoft/admin — ActiveSessionsController + saf yardımcı testleri
// (ROADMAP v0.0.15.1, T-017/S11). Saf sınıf/fonksiyonlar — DOM/React
// GEREKMEZ (`vitest.config.ts` `environment: 'node'` kararıyla TUTARLI;
// `two-factor-manage-controller.test.ts`'in AYNI deseni).
import { describe, expect, it, vi } from 'vitest'

import type { ActiveSessionWire } from '@arkesoft/trpc'

import {
  ActiveSessionsController,
  DEVICE_BROWSER_LABEL_KEY_COUNT,
  DEVICE_BROWSER_WIRE_OPTION_COUNT,
  DEVICE_OS_LABEL_KEY_COUNT,
  DEVICE_OS_WIRE_OPTION_COUNT,
  composeStepUpBodySingle,
  composeTerminateSuccessNotice,
  formatLastSeen,
  orderActiveSessions,
  resolveDeviceLabel,
  resolveIpDisplayValue,
  resolveTerminateAccessibleName,
} from '../active-sessions-controller.js'

function makeRow(overrides: Partial<ActiveSessionWire> = {}): ActiveSessionWire {
  return {
    id: 'ses_1',
    isCurrent: false,
    browserFamily: 'chrome',
    osFamily: 'windows',
    ipAddress: '203.0.113.42',
    lastSeenAt: '2026-11-10T10:00:00.000Z',
    createdAt: '2026-11-01T10:00:00.000Z',
    expiresAt: '2026-11-17T10:00:00.000Z',
    ...overrides,
  }
}

describe('kapalı-dünya sözlük tamlığı (S4: .options üzerinden türetilir, elle SAYILMAZ)', () => {
  it('BROWSER_LABELS anahtar sayısı deviceBrowserSchema.options sayısıyla EŞİT (8)', () => {
    expect(DEVICE_BROWSER_LABEL_KEY_COUNT).toBe(DEVICE_BROWSER_WIRE_OPTION_COUNT)
  })

  it('OS_LABELS anahtar sayısı deviceOsSchema.options sayısıyla EŞİT (7)', () => {
    expect(DEVICE_OS_LABEL_KEY_COUNT).toBe(DEVICE_OS_WIRE_OPTION_COUNT)
  })
})

describe('resolveDeviceLabel', () => {
  it('bilinen aile → "Chrome · Windows" biçimi', () => {
    expect(resolveDeviceLabel('chrome', 'windows')).toBe('Chrome · Windows')
  })

  it('unknown/unknown (UA YOK) → "Bilinmeyen tarayıcı · Bilinmeyen işletim sistemi"', () => {
    expect(resolveDeviceLabel('unknown', 'unknown')).toBe(
      'Bilinmeyen tarayıcı · Bilinmeyen işletim sistemi',
    )
  })

  it('other (UA dolu, tanınmıyor) → unknown İLE AYNI Türkçe metin (ui planının KARARI)', () => {
    expect(resolveDeviceLabel('other', 'other')).toBe(resolveDeviceLabel('unknown', 'unknown'))
  })
})

describe('resolveIpDisplayValue', () => {
  it('gerçek IP → KENDİSİ, maskesiz', () => {
    expect(resolveIpDisplayValue('203.0.113.42')).toBe('203.0.113.42')
  })

  it('null → "Bilinmiyor"', () => {
    expect(resolveIpDisplayValue(null)).toBe('Bilinmiyor')
  })

  it('boş dize (eski satır sentinel\'i) → "Bilinmiyor" (null İLE AYNI)', () => {
    expect(resolveIpDisplayValue('')).toBe(resolveIpDisplayValue(null))
  })
})

describe('formatLastSeen', () => {
  const now = new Date('2026-11-10T12:00:00.000Z').getTime()

  it('5 dakikadan KISA fark → "Az önce"', () => {
    expect(formatLastSeen('2026-11-10T11:58:00.000Z', now)).toBe('Az önce')
  })

  it('dakika aralığı (5dk–1sa) → "{dakika} dakika önce"', () => {
    expect(formatLastSeen('2026-11-10T11:40:00.000Z', now)).toBe('20 dakika önce')
  })

  it('saat aralığı (1sa–1gün) → "{saat} saat önce"', () => {
    expect(formatLastSeen('2026-11-10T10:00:00.000Z', now)).toBe('2 saat önce')
  })

  it('gün aralığı (≥1gün) → "{gun} gün önce"', () => {
    expect(formatLastSeen('2026-11-07T12:00:00.000Z', now)).toBe('3 gün önce')
  })

  it('negatif fark (saat kayması) → NEGATİF dakika GÖSTERİLMEZ, "Az önce"ye SIFIRLANIR', () => {
    expect(formatLastSeen('2026-11-10T12:05:00.000Z', now)).toBe('Az önce')
  })
})

describe('resolveTerminateAccessibleName / composeStepUpBodySingle / composeTerminateSuccessNotice', () => {
  const now = new Date('2026-11-10T14:00:00.000Z').getTime()
  const row = makeRow({ lastSeenAt: '2026-11-10T12:00:00.000Z' })

  it('erişilebilir ad {cihaz}/{ip}/{süre} alanlarını BİRLEŞTİRİR', () => {
    expect(resolveTerminateAccessibleName(row, now)).toBe(
      'Chrome · Windows oturumunu sonlandır (IP 203.0.113.42, son görülme 2 saat önce)',
    )
  })

  it('step-up gövdesi HANGİ oturumun kapatılacağını TEKRAR eder', () => {
    expect(composeStepUpBodySingle(row, now)).toBe(
      'Chrome · Windows · IP 203.0.113.42 · son görülme 2 saat önce oturumunu sonlandırmak üzeresiniz. Devam etmek için şifrenizi girin.',
    )
  })

  it('başarı bildirimi {cihaz} alanını BİRLEŞTİRİR', () => {
    expect(composeTerminateSuccessNotice(row)).toBe('Chrome · Windows oturumu sonlandırıldı.')
  })
})

describe('orderActiveSessions', () => {
  it('"Bu cihaz" ÜSTTE sabit, diğerleri lastSeenAt AZALAN sıralanır', () => {
    const current = makeRow({ id: 'cur', isCurrent: true, lastSeenAt: '2026-11-01T00:00:00.000Z' })
    const older = makeRow({ id: 'old', lastSeenAt: '2026-11-05T00:00:00.000Z' })
    const newer = makeRow({ id: 'new', lastSeenAt: '2026-11-09T00:00:00.000Z' })

    // Sunucu sırası (createdAt azalan) BİLEREK farklı bir dizilişte verildi —
    // istemci yeniden sıralamasının bağımsız çalıştığını KANITLAR.
    const result = orderActiveSessions([older, current, newer])

    expect(result.map((row) => row.id)).toEqual(['cur', 'new', 'old'])
  })

  it('"Bu cihaz" satırı YOKSA (yapısal olarak beklenmez) ÇÖKMEZ, kalanı sıralar', () => {
    const a = makeRow({ id: 'a', lastSeenAt: '2026-11-01T00:00:00.000Z' })
    const b = makeRow({ id: 'b', lastSeenAt: '2026-11-05T00:00:00.000Z' })

    expect(orderActiveSessions([a, b]).map((row) => row.id)).toEqual(['b', 'a'])
  })
})

function knownError(code: string): { kind: 'known'; code: string; requestId: null } {
  return { kind: 'known', code, requestId: null }
}

describe('ActiveSessionsController — diyalog yaşam döngüsü', () => {
  it("openSingleDialog hedef sessionId'yi taşır, şifre/hatayı SIFIRLAR", () => {
    const controller = new ActiveSessionsController(
      { revokeSession: vi.fn(), revokeAllSessions: vi.fn() },
      () => 'hata',
      vi.fn(),
    )

    controller.openSingleDialog('ses_1')
    controller.setPassword('kalinti')
    controller.closeDialog()
    controller.openSingleDialog('ses_2')

    expect(controller.getState()).toEqual({
      dialogKind: 'single',
      targetSessionId: 'ses_2',
      password: '',
      isMutating: false,
      fieldError: null,
      dialogError: null,
    })
  })
})

describe('ActiveSessionsController — tekil sonlandırma', () => {
  it('BAŞARILI `revokeSession` sonrası `{kind:"revoked", sessionId}` DÖNER, diyalog kapanır', async () => {
    const revokeSession = vi.fn().mockResolvedValue({ kind: 'revoked' })
    const controller = new ActiveSessionsController(
      { revokeSession, revokeAllSessions: vi.fn() },
      () => 'hata',
      vi.fn(),
    )

    controller.openSingleDialog('ses_42')
    controller.setPassword('sifre-123')
    const outcome = await controller.confirmSingle()

    expect(revokeSession).toHaveBeenCalledWith('ses_42', 'sifre-123')
    expect(outcome).toEqual({ kind: 'revoked', sessionId: 'ses_42' })
    expect(controller.getState()).toMatchObject({ dialogKind: 'none', isMutating: false })
  })

  it('400 INVALID_PASSWORD → `fieldError` YAZILIR, diyalog AÇIK kalır, `{kind:"none"}` DÖNER', async () => {
    const revokeSession = vi
      .fn()
      .mockResolvedValue({ kind: 'error', error: knownError('INVALID_PASSWORD') })
    const controller = new ActiveSessionsController(
      { revokeSession, revokeAllSessions: vi.fn() },
      () => 'Şifreniz doğrulanamadı. Tekrar deneyin.',
      vi.fn(),
    )

    controller.openSingleDialog('ses_1')
    const outcome = await controller.confirmSingle()

    expect(outcome).toEqual({ kind: 'none' })
    expect(controller.getState()).toMatchObject({
      dialogKind: 'single',
      isMutating: false,
      fieldError: 'Şifreniz doğrulanamadı. Tekrar deneyin.',
      dialogError: null,
    })
  })

  it('404 SESSION_NOT_FOUND → diyalog OTOMATİK kapanır, `{kind:"sessionGone"}` DÖNER (KARAR ③/(c))', async () => {
    const revokeSession = vi
      .fn()
      .mockResolvedValue({ kind: 'error', error: knownError('SESSION_NOT_FOUND') })
    const controller = new ActiveSessionsController(
      { revokeSession, revokeAllSessions: vi.fn() },
      () => 'hata',
      vi.fn(),
    )

    controller.openSingleDialog('ses_gitmis')
    const outcome = await controller.confirmSingle()

    expect(outcome).toEqual({ kind: 'sessionGone' })
    expect(controller.getState()).toMatchObject({
      dialogKind: 'none',
      fieldError: null,
      dialogError: null,
    })
  })

  it('401 UNAUTHENTICATED → diyalog kapanır, `{kind:"unauthenticated"}` DÖNER (GÖRÜNÜR mesaj YOK)', async () => {
    const revokeSession = vi
      .fn()
      .mockResolvedValue({ kind: 'error', error: knownError('UNAUTHENTICATED') })
    const controller = new ActiveSessionsController(
      { revokeSession, revokeAllSessions: vi.fn() },
      () => 'hata',
      vi.fn(),
    )

    controller.openSingleDialog('ses_1')
    const outcome = await controller.confirmSingle()

    expect(outcome).toEqual({ kind: 'unauthenticated' })
    expect(controller.getState()).toMatchObject({
      dialogKind: 'none',
      fieldError: null,
      dialogError: null,
    })
  })

  it('429 RATE_LIMIT_EXCEEDED → `dialogError` YAZILIR (field İLE İLGİSİZ), diyalog AÇIK kalır', async () => {
    const revokeSession = vi
      .fn()
      .mockResolvedValue({ kind: 'error', error: knownError('RATE_LIMIT_EXCEEDED') })
    const controller = new ActiveSessionsController(
      { revokeSession, revokeAllSessions: vi.fn() },
      () => 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
      vi.fn(),
    )

    controller.openSingleDialog('ses_1')
    const outcome = await controller.confirmSingle()

    expect(outcome).toEqual({ kind: 'none' })
    expect(controller.getState()).toMatchObject({
      dialogKind: 'single',
      isMutating: false,
      fieldError: null,
      dialogError: 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
    })
  })

  it('`revokeSession` KENDİSİ FIRLATIRSA (gerçek ağ hatası) → `dialogError` YAZILIR, FIRLATMAZ', async () => {
    const revokeSession = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const controller = new ActiveSessionsController(
      { revokeSession, revokeAllSessions: vi.fn() },
      (error) => (error.kind === 'unknown' ? 'Bağlantı kurulamadı.' : 'hata'),
      vi.fn(),
    )

    controller.openSingleDialog('ses_1')
    await expect(controller.confirmSingle()).resolves.toEqual({ kind: 'none' })

    expect(controller.getState()).toMatchObject({
      dialogKind: 'single',
      dialogError: 'Bağlantı kurulamadı.',
    })
  })

  it('diyalog "single" İÇİN AÇIK DEĞİLKEN no-op — `revokeSession` ÇAĞRILMAZ, `{kind:"none"}` DÖNER', async () => {
    const revokeSession = vi.fn()
    const controller = new ActiveSessionsController(
      { revokeSession, revokeAllSessions: vi.fn() },
      () => 'hata',
      vi.fn(),
    )

    const outcome = await controller.confirmSingle()

    expect(outcome).toEqual({ kind: 'none' })
    expect(revokeSession).not.toHaveBeenCalled()
  })

  // VACUITY KANITI (`solid`'in T-016/M-3'teki AYNI disiplini) — bu dosyaya
  // GÖMÜLÜ bir test DEĞİL: `confirmSingle`'ın İÇİNDEKİ başarı dalının
  // `return { kind: 'revoked', sessionId: targetSessionId }` satırı GERÇEKTEN
  // `return { kind: 'none' }`'a DEĞİŞTİRİLİP yukarıdaki "BAŞARILI
  // `revokeSession` sonrası..." testinin KIRMIZI verdiği (beklenen
  // `{kind:'revoked', sessionId:'ses_42'}`, alınan `{kind:'none'}`) ELLE
  // doğrulandı, SONRA satır geri kondu — ham çıktı handoff raporunda.
})

describe('ActiveSessionsController — toplu sonlandırma', () => {
  it('BAŞARILI `revokeAllSessions` sonrası `{kind:"allRevoked"}` DÖNER, diyalog kapanır', async () => {
    const revokeAllSessions = vi.fn().mockResolvedValue({ kind: 'revoked' })
    const controller = new ActiveSessionsController(
      { revokeSession: vi.fn(), revokeAllSessions },
      () => 'hata',
      vi.fn(),
    )

    controller.openAllDialog()
    controller.setPassword('sifre-123')
    const outcome = await controller.confirmAll()

    expect(revokeAllSessions).toHaveBeenCalledWith('sifre-123')
    expect(outcome).toEqual({ kind: 'allRevoked' })
    expect(controller.getState()).toMatchObject({ dialogKind: 'none' })
  })

  it('400 INVALID_PASSWORD → `fieldError` YAZILIR, diyalog AÇIK kalır', async () => {
    const revokeAllSessions = vi
      .fn()
      .mockResolvedValue({ kind: 'error', error: knownError('INVALID_PASSWORD') })
    const controller = new ActiveSessionsController(
      { revokeSession: vi.fn(), revokeAllSessions },
      () => 'Şifreniz doğrulanamadı. Tekrar deneyin.',
      vi.fn(),
    )

    controller.openAllDialog()
    const outcome = await controller.confirmAll()

    expect(outcome).toEqual({ kind: 'none' })
    expect(controller.getState()).toMatchObject({
      dialogKind: 'all',
      fieldError: 'Şifreniz doğrulanamadı. Tekrar deneyin.',
    })
  })

  it('SESSION_NOT_FOUND (bu uçta OLUŞMAZ ama ÖLÇÜLÜRSE) → "gone" DALINA GİRMEZ, genel diyalog hatasına düşer', async () => {
    const revokeAllSessions = vi
      .fn()
      .mockResolvedValue({ kind: 'error', error: knownError('SESSION_NOT_FOUND') })
    const controller = new ActiveSessionsController(
      { revokeSession: vi.fn(), revokeAllSessions },
      () => 'Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.',
      vi.fn(),
    )

    controller.openAllDialog()
    const outcome = await controller.confirmAll()

    expect(outcome).toEqual({ kind: 'none' })
    expect(controller.getState()).toMatchObject({
      dialogKind: 'all',
      dialogError: 'Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.',
    })
  })

  it('diyalog "all" İÇİN AÇIK DEĞİLKEN no-op — `revokeAllSessions` ÇAĞRILMAZ, `{kind:"none"}` DÖNER', async () => {
    const revokeAllSessions = vi.fn()
    const controller = new ActiveSessionsController(
      { revokeSession: vi.fn(), revokeAllSessions },
      () => 'hata',
      vi.fn(),
    )

    const outcome = await controller.confirmAll()

    expect(outcome).toEqual({ kind: 'none' })
    expect(revokeAllSessions).not.toHaveBeenCalled()
  })
})
