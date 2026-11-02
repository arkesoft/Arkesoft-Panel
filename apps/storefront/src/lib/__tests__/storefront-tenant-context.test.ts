// @arkesoft/storefront — storefront-tenant-context.ts testleri (ROADMAP
// v0.0.8, T-009/S6, DoD "bağlam ayrık birleşimi")
//
// Bu modül `process.env` OKUMAZ — statik `import` güvenlidir.
import { describe, expect, it } from 'vitest'

import { requireResolvedTenant } from '../storefront-tenant-context.js'
import type { StorefrontTenantContext } from '../storefront-tenant-context.js'

describe('requireResolvedTenant', () => {
  it('kind: "resolved" bağlamını AYNEN döner', () => {
    const resolved: StorefrontTenantContext = {
      kind: 'resolved',
      tenant: { name: 'Demo Mağaza' },
      origin: 'http://demo.arkesoft.localhost:4321',
    }

    expect(requireResolvedTenant(resolved)).toBe(resolved)
  })

  it('kind: "unresolved" bağlamı GEÇİRİLİRSE fırlar (yapısal olarak ulaşılmaması gereken dal)', () => {
    const unresolved: StorefrontTenantContext = { kind: 'unresolved' }

    expect(() => requireResolvedTenant(unresolved)).toThrow()
  })

  it('"unresolved" bağlamının SEBEP KODU TAŞIMADIĞI tip düzeyinde doğrulanır (AC8)', () => {
    const unresolved: StorefrontTenantContext = { kind: 'unresolved' }

    expect(Object.keys(unresolved)).toEqual(['kind'])
  })
})
