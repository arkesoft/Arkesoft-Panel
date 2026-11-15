// @arkesoft/admin — slug-outcome-message testleri (ROADMAP v0.1.0, T-019/S10).
import { describe, expect, it } from 'vitest'

import {
  buildSlugPreviewAddress,
  resolveSlugCheckDisplayMessages,
  resolveSlugFieldErrorMessage,
  resolveSlugLiveStatusMessage,
  SLUG_LIVE_STATUS_MESSAGE_KEY_COUNT,
} from '../slug-outcome-message.js'

describe('resolveSlugLiveStatusMessage', () => {
  it('"idle" için null döner (henüz hiçbir kontrol tetiklenmedi)', () => {
    expect(resolveSlugLiveStatusMessage('idle')).toBeNull()
  })

  it('"checking" için "Kontrol ediliyor…" döner', () => {
    expect(resolveSlugLiveStatusMessage('checking')).toBe('Kontrol ediliyor…')
  })

  it("kapalı dünya: beş outcome'un (available dahil) HER biri için görünür bir metin var", () => {
    expect(SLUG_LIVE_STATUS_MESSAGE_KEY_COUNT).toBe(5)
    for (const outcome of [
      'available',
      'taken',
      'reserved',
      'invalidFormat',
      'unreachable',
    ] as const) {
      const message = resolveSlugLiveStatusMessage(outcome)
      expect(message).not.toBeNull()
      expect(message?.length).toBeGreaterThan(0)
    }
  })

  it('"available" metni olumlu/kullanılabilir anlamı taşır', () => {
    expect(resolveSlugLiveStatusMessage('available')).toBe('Bu adres kullanılabilir.')
  })
})

describe('resolveSlugCheckDisplayMessages', () => {
  // wcag tur 1 `W-1` (ÖLÇÜLDÜ): `'checking'` HER tuş vuruşunda SENKRON
  // yazılıyordu ve TEK bir aria-live öğesi bunu da taşıyordu ⇒ yavaş/
  // karakter-karakter yazan AT kullanıcısında her harfte "Kontrol
  // ediliyor…" + ~400ms sonra sonuç ÇİFT anonsu. Bu test takımı "checking"in
  // canlı bölgeye ARTIK düşmediğini, sonucun ise düştüğünü pinler.
  it('"idle" + hata yok: ikisi de null (henüz gösterilecek bir şey yok)', () => {
    expect(resolveSlugCheckDisplayMessages('idle', null)).toEqual({
      visualCheckingMessage: null,
      liveStatusMessage: null,
    })
  })

  it('"checking": görsel göstergede metin VAR, canlı bölgede YOK (wcag tur 1 W-1 düzeltmesi — mutasyon testi: biri `liveStatusMessage` için tekrar `resolveSlugLiveStatusMessage(status)` yazarsa bu assert kırılır)', () => {
    const result = resolveSlugCheckDisplayMessages('checking', null)
    expect(result.visualCheckingMessage).toBe('Kontrol ediliyor…')
    expect(result.liveStatusMessage).toBeNull()
  })

  it.each(['available', 'taken', 'reserved', 'invalidFormat', 'unreachable'] as const)(
    'sonuç ("%s"): canlı bölgede metin VAR, görsel göstergede YOK',
    (outcome) => {
      const result = resolveSlugCheckDisplayMessages(outcome, null)
      expect(result.liveStatusMessage).toBe(resolveSlugLiveStatusMessage(outcome))
      expect(result.visualCheckingMessage).toBeNull()
    },
  )

  it('taşıma (transport) hatası VARSA: durum ne olursa olsun canlı bölgeye gider, görsel gösterge gösterilmez', () => {
    const result = resolveSlugCheckDisplayMessages('checking', 'Bağlantı hatası.')
    expect(result.liveStatusMessage).toBe('Bağlantı hatası.')
    expect(result.visualCheckingMessage).toBeNull()
  })
})

describe('resolveSlugFieldErrorMessage', () => {
  it("her dört hatalı outcome, S8'in FIELD_ERROR_MESSAGES katalogundaki AYNI metni döner (ikinci kopya YOK)", () => {
    expect(resolveSlugFieldErrorMessage('taken')).toBe(
      'Bu mağaza adresi başka bir mağaza tarafından kullanılıyor. Başka bir adres dene.',
    )
    expect(resolveSlugFieldErrorMessage('reserved')).toBe(
      'Bu adres platform tarafından kullanıldığı için seçilemez. Başka bir adres dene.',
    )
    expect(resolveSlugFieldErrorMessage('invalidFormat')).toBe(
      'Bu adreste yalnızca küçük harf, rakam ve tire kullanılabilir; tire ile başlayıp bitemez.',
    )
    expect(resolveSlugFieldErrorMessage('unreachable')).toBe(
      'Bu mağaza adresi şu an kullanılamıyor çünkü tam adresi çok uzun oluyor. Daha kısa bir adres dene.',
    )
  })
})

describe('buildSlugPreviewAddress', () => {
  it('slug + alan adını birleştirir', () => {
    expect(buildSlugPreviewAddress('deniz-taki-atolyesi')).toBe('deniz-taki-atolyesi.arkesoft.app')
  })

  it('boş slug için de FIRLAMAZ (öneri henüz yokken boş gösterilir)', () => {
    expect(buildSlugPreviewAddress('')).toBe('.arkesoft.app')
  })
})
