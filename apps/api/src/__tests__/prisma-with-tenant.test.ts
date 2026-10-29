// @arkesoft/api — PrismaService.withTenant() delegasyon testleri (ROADMAP
// v0.0.13, T-005/S6, architect K-E7)
//
// Gerçek Postgres'e bağlanır (`pnpm infra:up` + `pnpm db:deploy` + `pnpm
// db:seed` koşmuş olmalı — `DEMO_SEED` fixture'ı, T-001/ST-3).
// `prisma.module.ts` bu sürümde `createPrismaClient`'a ADDITIVE
// `tenantContextSetting: TENANT_CONTEXT_SETTING` seçeneğini geçer — bu
// KAYIT OLMADAN `PrismaService.withTenant()` bu istemci üzerinde HER ZAMAN
// fail-closed `throw` ederdi (bkz. `@arkesoft/db` `tenant-context.ts`,
// `registerTenantContextSetting`/`WeakMap`).
//
// Vaka 2 architect riski 4'ü PİNLER: `tenant_membership` artık
// `FORCE ROW LEVEL SECURITY` altında — context KURULMADAN `service.db` ile
// doğrudan okuma HATA DEĞİL, 0 satır döner (varsayılan ret, SIZINTI DEĞİL).
// Bu "sessizce 0 satır" davranışı bir DOĞRULUK HATASI SINIFIdır (v0.0.14 lint
// borcu, architect riski 4) — burada yalnızca DAVRANIŞ pinlenir, borç
// genişletilmez.
//
// Vaka 3 ÇALIŞMA ZAMANI testi DEĞİL — asıl kanıt derleme zamanından gelir
// (`apps/api/tsconfig.json`'ın `include: ["src/**/*", ...]` deseni testleri
// BİLEREK kapsar, A-P3). `it()` gövdesi içine konan `expect` çağrıları, tip
// pin'lerinin TAMAMEN ölü kod sayılıp testin "assertion yok" uyarısı
// vermemesi içindir.

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { DEMO_SEED } from '@arkesoft/db'
import type { PrismaDatabase } from '@arkesoft/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PrismaService } from '../prisma/prisma.service.js'
import { createTestApp } from './helpers/create-test-app.js'

describe('PrismaService.withTenant() — additive delegasyon (T-005/S6)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  it('Vaka 1 — withTenant delegasyonu çalışıyor: tenant context içinde tenant_membership okunabiliyor', async () => {
    const tenant = await prismaService.db.tenant.findUnique({
      where: { slug: DEMO_SEED.tenant.slug },
    })
    expect(tenant).not.toBeNull()
    if (tenant === null) {
      return
    }

    const memberships = await prismaService.withTenant(tenant.id, (tx) =>
      tx.tenantMembership.findMany({ where: { tenantId: tenant.id } }),
    )

    expect(memberships.length).toBeGreaterThan(0)
    expect(memberships.every((membership) => membership.tenantId === tenant.id)).toBe(true)
  })

  it(
    'Vaka 2 — context kurulmadan `service.db` ile doğrudan sorgu 0 satır döner ' +
      '(sızıntı DEĞİL, fail-closed; architect riski 4)',
    async () => {
      const rows = await prismaService.db.tenantMembership.findMany()

      expect(rows).toEqual([])
    },
  )

  it('Vaka 3 — `.db` getter imzası DEĞİŞMEDİ (derleme zamanı tip testi)', () => {
    // POZİTİF PİN — `.db` hâlâ `PrismaDatabase` döner; `satisfies` tip
    // uyumunu derleme zamanında zorlar (değeri GENİŞLETMEZ).
    const dbPin = prismaService.db satisfies PrismaDatabase
    expect(dbPin).toBeDefined()

    // NEGATİF PİN — `.db`'nin döndürdüğü tip, UYUMSUZ bir şekle doğrudan
    // atanamaz. Bu satır GERÇEK bir tip hatası ÜRETMEZSE (ör. `.db` `any`'ye
    // genişlerse) `@ts-expect-error` "kullanılmayan direktif" olarak
    // `pnpm typecheck`'i KIRAR — pin'in asıl işi budur.
    // @ts-expect-error — PrismaDatabase bu uyumsuz şekle doğrudan atanamaz.
    const wrongShape: { readonly thisFieldDoesNotExistOnPrismaDatabase: true } = prismaService.db
    expect(wrongShape).toBeDefined()
  })
})
