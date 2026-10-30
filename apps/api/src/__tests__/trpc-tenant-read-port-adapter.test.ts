// @arkesoft/api — `TenantReadPortAdapter.findSummary()` soft-delete yarışı
// (ROADMAP v0.0.6, T-007, qa tur 1 — EKSİK TEST BULGUSU)
//
// GEREKÇE: architect'in K-tasarımı `tenant.current`'ın okuduğu sorguya
// `deletedAt: null` koşulunu AÇIKÇA "çözümden SONRA soft-delete yarışı" için
// yazdığını belgeliyor (Teknik Tasarım → "Veri modeli / migration"). Bu
// koşulun KENDİSİ — `/trpc` yolunun TAMAMINDA — hiçbir testte GÖZLENMİYORDU:
//
//   - `TenantResolverService` seviyesinde (`tenant-resolver.test.ts`,
//     v0.0.4) `soft_deleted` zaten test ediliyor AMA bu `TenantGuard`'ın
//     HOST ÇÖZÜMLEME adımı — `TenantReadPortAdapter.findSummary()`'nin KENDİ
//     sorgusu değil.
//   - `packages/trpc`'nin hermetik testleri (`procedures.test.ts`) sahte bir
//     `TenantReadPort` kullanıyor — gerçek Prisma sorgusunu HİÇ koşturmuyor.
//   - `trpc-http.test.ts`'in AC9(b)/AC10 fixture'ı DA test-kapsamlı bir port
//     (`ProbeDetailsError` fırlatan) kullanıyor — gerçek `TenantReadPortAdapter`
//     asla çağrılmıyor.
//
// Gerçek HTTP yoluyla bu yarışı TETİKLEMEK mümkün değil: `TenantContextMiddleware`
// HER istekte `TenantResolverService` ile kiracıyı YENİDEN çözer ve AYNI
// `deletedAt != null` koşulunu TenantController'a ulaşmadan ÖNCE uygular —
// bu yüzden soft-delete edilmiş bir kiracı `/trpc`'ye asla ULAŞAMAZ (guard
// bunu zaten 404'e düşürür). Bu test bu yüzden adaptörü DOĞRUDAN çağırır
// (gerçek DI-kurulu `TenantReadPortAdapter`, gerçek Postgres) — tam HTTP
// turu olmadan, tek başına doğru sorgu koşulunu doğrular.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { TenantStatus } from '@arkesoft/db'
import { isAppError } from '@arkesoft/errors'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PrismaService } from '../prisma/prisma.service.js'
import { TenantReadPortAdapter } from '../trpc/ports/tenant-read.port.adapter.js'
import { createTestApp } from './helpers/create-test-app.js'

function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

describe('TenantReadPortAdapter.findSummary() — soft-delete yarışı (ROADMAP v0.0.6, K-tasarım notu)', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let adapter: TenantReadPortAdapter

  beforeAll(async () => {
    const testApp = await createTestApp()
    app = testApp.app
    prismaService = app.get(PrismaService)
    adapter = app.get(TenantReadPortAdapter)
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  it('aktif kiracı için TenantSummary döner (temel davranış, sanity)', async () => {
    const slug = uniqueSlug('soft-del-sanity')
    const tenant = await prismaService.db.tenant.create({
      data: { slug, name: 'Soft Delete Sanity', status: TenantStatus.active },
    })

    try {
      const summary = await adapter.findSummary(tenant.id)
      expect(summary.id).toBe(tenant.id)
      expect(summary.slug).toBe(slug)
    } finally {
      await prismaService.db.tenant.delete({ where: { id: tenant.id } })
    }
  })

  it(
    'çözümden SONRA soft-delete edilen kiracı için TenantNotFoundError fırlatır ' +
      '(null kontrolü DEĞİL — gerçek Prisma sorgusunun deletedAt:null koşulu)',
    async () => {
      const slug = uniqueSlug('soft-del-race')
      const tenant = await prismaService.db.tenant.create({
        data: { slug, name: 'Soft Delete Race', status: TenantStatus.active },
      })

      try {
        // Host çözümlemesi (TenantGuard) bu isteği ZATEN kabul etmiş
        // OLSAYDI (guard'ın kendi okuması bu satırdan ÖNCE geldi) — yarışı
        // simüle etmek için kiracı burada, port çağrısından HEMEN ÖNCE
        // soft-delete edilir.
        await prismaService.db.tenant.update({
          where: { id: tenant.id },
          data: { deletedAt: new Date() },
        })

        let caught: unknown
        try {
          await adapter.findSummary(tenant.id)
          throw new Error('beklenen TenantNotFoundError fırlatılmadı')
        } catch (error) {
          caught = error
        }

        if (!isAppError(caught)) {
          throw new Error(`beklenen AppError değil: ${String(caught)}`)
        }

        expect(caught.code).toBe('TENANT_NOT_FOUND')
        expect(caught.httpStatus).toBe(404)
        // Sızdırmazlık: §7 madde 12 — hata tenant'a dair hiçbir tanımlayıcı
        // taşımaz (TenantNotFoundError'ın kendi yapıcısı buna izin vermiyor).
        expect(caught.publicDetails).toEqual({})
      } finally {
        await prismaService.db.tenant.delete({ where: { id: tenant.id } })
      }
    },
  )
})
