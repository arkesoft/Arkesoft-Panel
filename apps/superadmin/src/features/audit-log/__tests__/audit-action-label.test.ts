// @arkesoft/superadmin — resolveAuditActionLabel testleri (ROADMAP v0.0.20, T-021/S8)
import { describe, expect, it } from 'vitest'

import { resolveAuditActionLabel, type AuditActionLabels } from '../audit-action-label.js'

const labels: AuditActionLabels = {
  platform_admin_signed_in: 'Giriş yaptı',
  tenant_impersonation_started: 'Kiracı verisine erişti',
}

describe('resolveAuditActionLabel', () => {
  it('iki eylemin her biri için kataloğun kendi metnini döner', () => {
    expect(resolveAuditActionLabel('platform_admin_signed_in', labels)).toBe('Giriş yaptı')
    expect(resolveAuditActionLabel('tenant_impersonation_started', labels)).toBe(
      'Kiracı verisine erişti',
    )
  })
})
