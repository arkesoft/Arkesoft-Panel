// @arkesoft/api — `StorefrontTenantReadPortAdapter.findPublicTenant()` birim
// testi (ROADMAP v0.0.8, T-009/S7, architect VERİ MODELİ kararı, ADR-0012)
//
// `trpc-tenant-read-port-adapter.test.ts`'in (T-007) AYNI deseni — gerçek
// DI-kurulu adaptörü, gerçek Postgres üzerinde DOĞRUDAN çağırır (tam HTTP
// turu olmadan): (1) aktif kiracı için `{name, themeId, themeVersion}`
// döner, (2) soft-delete edilmiş kiracı için `null` DÖNMEZ, `TenantNotFoundError`
// FIRLATIR (port TOTAL'dır — `storefront-tenant-read.port.ts`'in bağlayıcı
// kararı).
//
// GÜNCELLEME (ROADMAP v0.0.10, T-012/S4): `themeId`/`themeVersion` EKLENDİ.
// Test kiracıları bu alanları AÇIKÇA VERMEDEN oluşturulur (DB seviyesinde
// `DEFAULT` yok, ADR-0002 Karar 5) → beklenen değer `null`'dur; adaptör
// coalesce ETMEZ (varsayılanı uygulayan VİTRİN).

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { TenantStatus } from '@arkesoft/db'
import { isAppError } from '@arkesoft/errors'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PrismaService } from '../prisma/prisma.service.js'
import { StorefrontTenantReadPortAdapter } from '../trpc/ports/storefront-tenant-read.port.adapter.js'
import { createTestApp } from './helpers/create-test-app.js'

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

describe('StorefrontTenantReadPortAdapter.findPublicTenant() (ROADMAP v0.0.8, T-009/S7)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let adapter: StorefrontTenantReadPortAdapter

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    adapter = app.get(StorefrontTenantReadPortAdapter)
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  it('aktif kiracı için YALNIZCA {name, themeId, themeVersion} döner (tel sözleşmesinin alan kısıtı)', async () => {
    const slug = uniqueSlug('storefront-sanity')
    const tenant = await prismaService.db.tenant.create({
      data: { slug, name: 'Vitrin Sanity Kiracısı', status: TenantStatus.active },
    })

    try {
      const result = await adapter.findPublicTenant(tenant.id)
      expect(result).toEqual({ name: 'Vitrin Sanity Kiracısı', themeId: null, themeVersion: null })
    } finally {
      await prismaService.db.tenant.delete({ where: { id: tenant.id } })
    }
  })

  it(
    'soft-delete edilmiş kiracı için TenantNotFoundError FIRLATIR ' +
      '(null DÖNMEZ — port TOTAL, deletedAt:null koşulu ikinci savunma hattı, AC6)',
    async () => {
      const slug = uniqueSlug('storefront-soft-del')
      const tenant = await prismaService.db.tenant.create({
        data: { slug, name: 'Vitrin Soft Delete Kiracısı', status: TenantStatus.active },
      })

      try {
        await prismaService.db.tenant.update({
          where: { id: tenant.id },
          data: { deletedAt: new Date() },
        })

        let caught: unknown
        try {
          await adapter.findPublicTenant(tenant.id)
          throw new Error('beklenen TenantNotFoundError fırlatılmadı')
        } catch (error) {
          caught = error
        }

        if (!isAppError(caught)) {
          throw new Error(`beklenen AppError değil: ${String(caught)}`)
        }

        expect(caught.code).toBe('TENANT_NOT_FOUND')
        expect(caught.httpStatus).toBe(404)
        // Sızdırmazlık: §7 madde 12 — var olmayan vs. soft-delete edilmiş
        // AYNI cevabı döner, hata tenant'a dair hiçbir tanımlayıcı taşımaz.
        expect(caught.publicDetails).toEqual({})
      } finally {
        await prismaService.db.tenant.delete({ where: { id: tenant.id } })
      }
    },
  )

  it('var olmayan tenantId için de AYNI TenantNotFoundError FIRLATIR (varlık sızdırmama)', async () => {
    let caught: unknown
    try {
      await adapter.findPublicTenant(randomUUID())
      throw new Error('beklenen TenantNotFoundError fırlatılmadı')
    } catch (error) {
      caught = error
    }

    if (!isAppError(caught)) {
      throw new Error(`beklenen AppError değil: ${String(caught)}`)
    }

    expect(caught.code).toBe('TENANT_NOT_FOUND')
    expect(caught.httpStatus).toBe(404)
  })
})
