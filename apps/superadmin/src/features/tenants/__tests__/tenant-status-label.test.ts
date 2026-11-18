// @arkesoft/superadmin — resolveTenantStatusLabel testleri (ROADMAP v0.0.20,
// T-021/S8, WCAG 1.4.1)
import { describe, expect, it } from 'vitest'

import {
  resolveTenantStatusDotClassName,
  resolveTenantStatusLabel,
  type TenantStatusLabels,
} from '../tenant-status-label.js'

const labels: TenantStatusLabels = {
  pending: 'Beklemede',
  provisioning: 'Kuruluyor',
  active: 'Aktif',
  suspended: 'Askıya alınmış',
}

describe('resolveTenantStatusLabel', () => {
  it('dört durumun her biri için kataloğun kendi metnini döner', () => {
    expect(resolveTenantStatusLabel('pending', labels)).toBe('Beklemede')
    expect(resolveTenantStatusLabel('provisioning', labels)).toBe('Kuruluyor')
    expect(resolveTenantStatusLabel('active', labels)).toBe('Aktif')
    expect(resolveTenantStatusLabel('suspended', labels)).toBe('Askıya alınmış')
  })
})

describe('resolveTenantStatusDotClassName — WCAG 1.4.1 (dekoratif, tek başına bilgi taşımaz)', () => {
  it('active → success tonu', () => {
    expect(resolveTenantStatusDotClassName('active')).toContain('success')
  })

  it('suspended → danger tonu', () => {
    expect(resolveTenantStatusDotClassName('suspended')).toContain('danger')
  })

  it('pending/provisioning → nötr ton (uydurma "warning" tonu YOK)', () => {
    expect(resolveTenantStatusDotClassName('pending')).toContain('text-secondary')
    expect(resolveTenantStatusDotClassName('provisioning')).toContain('text-secondary')
  })
})
