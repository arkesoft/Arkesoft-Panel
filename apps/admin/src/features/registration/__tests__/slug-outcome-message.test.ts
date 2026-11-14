// @arkesoft/admin — slug-outcome-message testleri (ROADMAP v0.1.0, T-019/S10).
import { describe, expect, it } from 'vitest'

import {
  buildSlugPreviewAddress,
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
