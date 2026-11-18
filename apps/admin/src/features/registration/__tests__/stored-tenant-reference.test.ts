// @arkesoft/admin — stored-tenant-reference testleri (ROADMAP v0.1.0,
// T-019/S10). `localStorage` ENJEKTE EDİLİR — node ortamında gerçek
// `localStorage` YOK, bu yüzden sahte bir depo kullanılır (dosya başı
// yorumunun bağlayıcı gerekçesi).
import { describe, expect, it } from 'vitest'

import {
  createTenantSlugReferenceStore,
  resolveHomeRedirectTarget,
  TENANT_SLUG_REFERENCE_STORAGE_KEY,
} from '../stored-tenant-reference.js'

function createFakeStorage(): {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  backingMap: Map<string, string>
} {
  const backingMap = new Map<string, string>()
  return {
    backingMap,
    getItem: (key) => backingMap.get(key) ?? null,
    setItem: (key, value) => {
      backingMap.set(key, value)
    },
    removeItem: (key) => {
      backingMap.delete(key)
    },
  }
}

describe('createTenantSlugReferenceStore', () => {
  it('hiç yazılmadıysa read() null döner', () => {
    const store = createTenantSlugReferenceStore(createFakeStorage())
    expect(store.read()).toBeNull()
  })

  it("write() sonrası read() AYNI slug'ı döner", () => {
    const storage = createFakeStorage()
    const store = createTenantSlugReferenceStore(storage)

    store.write('deniz-taki-atolyesi')

    expect(store.read()).toBe('deniz-taki-atolyesi')
    expect(storage.backingMap.get(TENANT_SLUG_REFERENCE_STORAGE_KEY)).toBe('deniz-taki-atolyesi')
  })

  it('clear() sonrası read() null döner (saklı referans sıfırlanır)', () => {
    const store = createTenantSlugReferenceStore(createFakeStorage())
    store.write('deniz-taki-atolyesi')

    store.clear()

    expect(store.read()).toBeNull()
  })
})

describe('resolveHomeRedirectTarget', () => {
  it('null → "stay" (mağaza yok ekranı render edilir)', () => {
    expect(resolveHomeRedirectTarget(null)).toEqual({ kind: 'stay' })
  })

  it('boş dize → "stay" (savunma amaçlı, fail-closed)', () => {
    expect(resolveHomeRedirectTarget('')).toEqual({ kind: 'stay' })
    expect(resolveHomeRedirectTarget('   ')).toEqual({ kind: 'stay' })
  })

  it('geçerli bir slug → "redirect" + o slug', () => {
    expect(resolveHomeRedirectTarget('deniz-taki-atolyesi')).toEqual({
      kind: 'redirect',
      slug: 'deniz-taki-atolyesi',
    })
  })
})
