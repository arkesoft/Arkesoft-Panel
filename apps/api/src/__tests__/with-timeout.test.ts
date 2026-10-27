// @arkesoft/api — withTimeout testleri (ROADMAP v0.0.4, T-002/ST-6,
// architect K-A8)

import { describe, expect, it, vi } from 'vitest'

import { withTimeout } from '../health/with-timeout.js'

describe('withTimeout', () => {
  it('promise zamanında çözülürse değeri döner', async () => {
    const result = await withTimeout(Promise.resolve('tamam'), 50)
    expect(result).toBe('tamam')
  })

  it('promise zamanında reddedilirse hatayı olduğu gibi iletir', async () => {
    const error = new Error('iç hata')
    await expect(withTimeout(Promise.reject(error), 50)).rejects.toBe(error)
  })

  it('asılı (hiç dönmeyen) promise zaman aşımına düşer', async () => {
    const hanging = new Promise<never>(() => {
      // kasıtlı: hiçbir zaman resolve/reject etmez
    })

    await expect(withTimeout(hanging, 20)).rejects.toThrow(/zaman aşımı/)
  })

  it('zaman aşımından sonra sarkan zamanlayıcı kalmaz (clearTimeout finally’de çağrılır)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const hanging = new Promise<never>(() => {
      // kasıtlı: hiçbir zaman resolve/reject etmez
    })

    await expect(withTimeout(hanging, 10)).rejects.toThrow()

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('erken çözülen promise için de clearTimeout çağrılır (sarkan zamanlayıcı kalmaz)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    await withTimeout(Promise.resolve('hızlı'), 5000)

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
