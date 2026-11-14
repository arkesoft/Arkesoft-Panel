// @arkesoft/api — `deriveTenantLifecycleState()` birim testi (ROADMAP v0.1.0,
// T-019/S9a, architect KARAR 2, kullanıcı kararı #2 — AC-14)
//
// SAF fonksiyon, I/O YOK — `createTestApp()`/gerçek Postgres GEREKMEZ. Sekiz
// vaka: DÖRT `TenantStatus` değeri × `deletedAt` (`null`/dolu) — `deletedAt`
// dolu İSE sonuç HER ZAMAN `'deleted'`dir, `status`'un değeri SONUCU
// DEĞİŞTİRMEZ (A-V8'in derleyici-zorunlu olmayan ama mekanik olarak test
// edilen karşılığı).

import { TenantStatus } from '@arkesoft/db'
import { describe, expect, it } from 'vitest'

import { deriveTenantLifecycleState } from '../tenancy/tenant-lifecycle-state.js'

const ALL_TENANT_STATUSES = [
  TenantStatus.pending,
  TenantStatus.provisioning,
  TenantStatus.active,
  TenantStatus.suspended,
] as const

describe('deriveTenantLifecycleState() (ROADMAP v0.1.0, T-019/S9a, AC-14)', () => {
  it.each(ALL_TENANT_STATUSES)(
    'deletedAt NULL İKEN status (%s) DEĞİŞTİRİLMEDEN döner',
    (status) => {
      expect(deriveTenantLifecycleState(status, null)).toBe(status)
    },
  )

  it.each(ALL_TENANT_STATUSES)(
    'deletedAt DOLU İKEN status (%s) ne olursa olsun sonuç HER ZAMAN "deleted"tir',
    (status) => {
      expect(deriveTenantLifecycleState(status, new Date())).toBe('deleted')
    },
  )

  it('sekiz vakanın TAMAMI koştu (4 durum × deletedAt null/dolu)', () => {
    expect(ALL_TENANT_STATUSES.length * 2).toBe(8)
  })
})
