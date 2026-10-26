// @arkesoft/api — TENANT_EXEMPT_PATHS testleri (ROADMAP v0.0.4, T-002/ST-5,
// architect K-A4/K5, R4 telafisi #2)
//
// Kümenin TAM OLARAK iki elemandan oluştuğunu assert eder — listeyi
// büyütmek bu testi DEĞİŞTİRMEYİ (inceleme görünürlüğünü) ZORUNLU kılar.

import { describe, expect, it } from 'vitest'

import { isTenantExemptPath, TENANT_EXEMPT_PATHS } from '../tenancy/tenant-exempt-paths.js'

describe('TENANT_EXEMPT_PATHS', () => {
  it('tam olarak iki eleman taşır', () => {
    expect(TENANT_EXEMPT_PATHS.size).toBe(2)
  })

  it('küme TAM OLARAK {"/health", "/health/ready"}\'tir', () => {
    expect(new Set(TENANT_EXEMPT_PATHS)).toEqual(new Set(['/health', '/health/ready']))
  })

  it.each(['/health', '/health/ready'])('%s tam eşleşmeyle muaftır', (path) => {
    expect(isTenantExemptPath(path)).toBe(true)
  })

  it('sondaki "/" soyulur — /health/ de muaftır', () => {
    expect(isTenantExemptPath('/health/')).toBe(true)
  })

  it('/HEALTH muaf DEĞİLDİR — büyük/küçük harf DUYARLI (fail-closed)', () => {
    expect(isTenantExemptPath('/HEALTH')).toBe(false)
  })

  it('prefix eşleşmesi YASAK — /health/x muaf değildir', () => {
    expect(isTenantExemptPath('/health/x')).toBe(false)
  })

  it('kök yol "/" muaf değildir', () => {
    expect(isTenantExemptPath('/')).toBe(false)
  })

  it('sorgu dizesi/fragman karşılaştırmaya karışmaz', () => {
    expect(isTenantExemptPath('/health?foo=bar')).toBe(true)
    expect(isTenantExemptPath('/health/ready?x=1')).toBe(true)
  })

  it('tamamen ilgisiz bir yol muaf değildir', () => {
    expect(isTenantExemptPath('/products')).toBe(false)
  })
})
