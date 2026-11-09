// @arkesoft/admin — `resolveFieldErrorMessage` testleri (ROADMAP v0.0.15,
// T-016 FIX turu 4/M-W1). Saf fonksiyon — DOM/React GEREKMEZ
// (`vitest.config.ts`'in `environment: 'node'` kararıyla TUTARLI).
import { describe, expect, it } from 'vitest'

import { resolveFieldErrorMessage } from '../field-error-message.js'

describe('resolveFieldErrorMessage — wcag FIX turu 4/M-W1', () => {
  it('sunucu hatası VARSA onu döner (öncelikli) — şekil hatası yok sayılır', () => {
    expect(resolveFieldErrorMessage('Şifreniz doğrulanamadı.', '6 haneli kodu girin.')).toBe(
      'Şifreniz doğrulanamadı.',
    )
  })

  it('sunucu hatası YOKSA şekil hatasını döner', () => {
    expect(resolveFieldErrorMessage(null, '6 haneli kodu girin.')).toBe('6 haneli kodu girin.')
  })

  it('ikisi de YOKSA `undefined` döner — `Input` hata GÖSTERMEZ', () => {
    expect(resolveFieldErrorMessage(null, undefined)).toBeUndefined()
  })

  // MUTASYON PROBU — önceliği TERS çevirirsek (şekil hatası sunucu hatasını
  // EZERSE) bu test KIRMIZI olur ve "öncelik sırası bozuldu" sorununu
  // adlandırır. Aşağıdaki satır MANUEL olarak ters çevrilip (`shapeError
  // Message ?? serverErrorMessage`) test koşturuldu, KIRMIZI çıktı
  // raporda belgelendi, GERİ ALINDI.
  it('vacuity: öncelik ters çevrilirse (şekil > sunucu) bu assertion KIRMIZI verir', () => {
    const reversedPriority = (
      serverErrorMessage: string | null,
      shapeErrorMessage: string | undefined,
    ): string | undefined => shapeErrorMessage ?? serverErrorMessage ?? undefined

    expect(reversedPriority('Şifreniz doğrulanamadı.', '6 haneli kodu girin.')).not.toBe(
      resolveFieldErrorMessage('Şifreniz doğrulanamadı.', '6 haneli kodu girin.'),
    )
  })
})
