// @arkesoft/api — TenantResolverService entegrasyon testleri (ROADMAP v0.0.4,
// T-002/ST-5, architect K-A4/K-A5, AC6)
//
// Gerçek Postgres'e bağlanır (`pnpm infra:up` + `pnpm db:seed` koşmuş olmalı —
// `packages/db`'nin `DEMO_SEED` fixture'ı, T-001/ST-3). SORGU BÜTÇESİ spy'ı
// `prismaService.db.tenant.findUnique` üzerinde kurulur.
//
// DÜRÜST NOT (ST-5 → sonraki ajanlara): DoD metni "11 çözümsüz sebebin HER
// BİRİNDE 0 çağrı" diyor; bu, resolve-host.ts'in SAF olarak ürettiği 8 sebep
// + `header_rejected_in_production` (toplam 9) için DOĞRU — ama `no_row` ve
// `soft_deleted` TANIM OLARAK bir Prisma okumasının SONUCUDUR (satırın
// olmadığını/silindiğini bir sorgu atmadan BİLMENİN yolu yok; K-A4'ün kendi
// metni de "satır yok VEYA deletedAt != null → çözümsüz" diyerek bunu
// POST-QUERY olarak tanımlıyor). Bu yüzden bu iki sebep AŞAĞIDA BİLEREK
// `callCount === 1` ile test ediliyor — bu bir test GEVŞETMESİ DEĞİL,
// algoritmanın kendisinin doğru bir sonucu. Diğer 9 sebep `callCount === 0`.

import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { parseEnv } from '@arkesoft/config/env'
import { DEMO_SEED } from '@arkesoft/db'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { apiEnvSchema } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'
import type { HttpRequestHeaders } from '../http/http-request.types.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { TenantResolverService } from '../tenancy/tenant-resolver.service.js'
import { createTestApp } from './helpers/create-test-app.js'

const BASE_ENV: ApiEnv = parseEnv(apiEnvSchema)

function developmentEnv(): ApiEnv {
  return { ...BASE_ENV, NODE_ENV: 'development' }
}

function productionEnv(): ApiEnv {
  return { ...BASE_ENV, NODE_ENV: 'production' }
}

function headers(partial: HttpRequestHeaders): HttpRequestHeaders {
  return partial
}

describe('TenantResolverService', () => {
  let app: INestApplication<Server> | undefined
  let prismaService: PrismaService
  let resolver: TenantResolverService

  beforeAll(async () => {
    const testApp = await createTestApp({ apiEnv: developmentEnv() })
    app = testApp.app
    prismaService = app.get(PrismaService)
    resolver = app.get(TenantResolverService)
  })

  afterAll(async () => {
    if (app !== undefined) {
      await app.close()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('çözümlenen istek TAM OLARAK 1 findUnique çağrısı yapar (slug dalı, DEMO_SEED)', async () => {
    const spy = vi.spyOn(prismaService.db.tenant, 'findUnique')

    const resolution = await resolver.resolve(
      headers({ host: `${DEMO_SEED.tenant.slug}.arkesoft.localhost` }),
    )

    expect(spy).toHaveBeenCalledTimes(1)
    expect(resolution.kind).toBe('resolved')
    if (resolution.kind === 'resolved') {
      expect(resolution.tenant.slug).toBe(DEMO_SEED.tenant.slug)
      expect(resolution.tenant.source).toBe('subdomain')
    }
  })

  // --- 9 sebep — SORGU YOK (resolve-host.ts'in saf reddi + üretim başlık reddi) ---
  const zeroQueryReasonCases: readonly {
    readonly reason: string
    readonly requestHeaders: HttpRequestHeaders
  }[] = [
    { reason: 'missing_host', requestHeaders: headers({}) },
    {
      reason: 'multiple_host_headers',
      requestHeaders: headers({ host: ['a.arkesoft.localhost', 'b.arkesoft.localhost'] }),
    },
    {
      reason: 'unparsable_host',
      requestHeaders: headers({ host: 'demo magaza.arkesoft.localhost' }),
    },
    { reason: 'base_domain_mismatch', requestHeaders: headers({ host: '.arkesoft.localhost' }) },
    { reason: 'bare_base_domain', requestHeaders: headers({ host: 'arkesoft.localhost' }) },
    {
      reason: 'nested_subdomain',
      requestHeaders: headers({ host: 'a.demo-magaza.arkesoft.localhost' }),
    },
    { reason: 'reserved_subdomain', requestHeaders: headers({ host: 'www.arkesoft.localhost' }) },
    {
      reason: 'invalid_slug_format',
      requestHeaders: headers({ host: 'demo_magaza.arkesoft.localhost' }),
    },
  ]

  it.each(zeroQueryReasonCases.map((c) => [c.reason, c] as const))(
    '%s → unresolved, 0 findUnique çağrısı',
    async (_label, testCase) => {
      const spy = vi.spyOn(prismaService.db.tenant, 'findUnique')

      const resolution = await resolver.resolve(testCase.requestHeaders)

      expect(resolution).toEqual({ kind: 'unresolved', reason: testCase.reason })
      expect(spy).toHaveBeenCalledTimes(0)
    },
  )

  it("header_rejected_in_production → unresolved, 0 findUnique çağrısı (host'a GERİ DÜŞÜLMEZ)", async () => {
    const productionTestApp = await createTestApp({ apiEnv: productionEnv() })
    try {
      const productionResolver = productionTestApp.app.get(TenantResolverService)
      const productionPrisma = productionTestApp.app.get(PrismaService)
      const spy = vi.spyOn(productionPrisma.db.tenant, 'findUnique')

      const resolution = await productionResolver.resolve(
        headers({
          host: 'bilinmeyen-host.arkesoft.localhost',
          'x-arkesoft-tenant': DEMO_SEED.tenant.slug,
        }),
      )

      expect(resolution).toEqual({ kind: 'unresolved', reason: 'header_rejected_in_production' })
      expect(spy).toHaveBeenCalledTimes(0)
    } finally {
      await productionTestApp.app.close()
    }
  })

  // --- 2 sebep — TANIM OLARAK 1 sorgu gerektirir (post-query) ---------------
  it('no_row → unresolved, TAM 1 findUnique çağrısı (geçerli slug biçimi ama satır yok)', async () => {
    const spy = vi.spyOn(prismaService.db.tenant, 'findUnique')

    const resolution = await resolver.resolve(
      headers({ host: 'no-such-tenant-xyz.arkesoft.localhost' }),
    )

    expect(resolution).toEqual({ kind: 'unresolved', reason: 'no_row' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("soft_deleted → unresolved, TAM 1 findUnique çağrısı (kendi fixture'ı — DEMO_SEED'e dokunulmaz, R-P6)", async () => {
    const slug = `t-${randomUUID().slice(0, 12)}`

    await prismaService.db.tenant.create({
      data: { slug, name: 'ST-5 soft-delete fixture', deletedAt: new Date() },
    })

    try {
      const spy = vi.spyOn(prismaService.db.tenant, 'findUnique')

      const resolution = await resolver.resolve(headers({ host: `${slug}.arkesoft.localhost` }))

      expect(resolution).toEqual({ kind: 'unresolved', reason: 'soft_deleted' })
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      await prismaService.db.tenant.delete({ where: { slug } })
    }
  })

  // --- primaryDomain dalı (R-P6: kendi fixture'ı, seed'e satır EKLENMEZ) -----
  it('özel alan adı (primaryDomain) dalı → TAM 1 findUnique çağrısı, resolved, source=custom-domain', async () => {
    const slug = `t-${randomUUID().slice(0, 12)}`
    const primaryDomain = `${slug}.ozel-musteri-alani.test`

    await prismaService.db.tenant.create({
      data: { slug, name: 'ST-5 primaryDomain fixture', primaryDomain },
    })

    try {
      const spy = vi.spyOn(prismaService.db.tenant, 'findUnique')

      const resolution = await resolver.resolve(headers({ host: primaryDomain }))

      expect(spy).toHaveBeenCalledTimes(1)
      expect(resolution.kind).toBe('resolved')
      if (resolution.kind === 'resolved') {
        expect(resolution.tenant.slug).toBe(slug)
        expect(resolution.tenant.source).toBe('custom-domain')
      }
    } finally {
      await prismaService.db.tenant.delete({ where: { slug } })
    }
  })

  // --- AC6 — iki ayrı test (K1) ------------------------------------------------
  describe('AC6 — x-arkesoft-tenant yalnızca NODE_ENV !== production iken kabul edilir', () => {
    it('production + bilinmeyen host + x-arkesoft-tenant → REDDEDİLİR (header_rejected_in_production)', async () => {
      const productionTestApp = await createTestApp({ apiEnv: productionEnv() })
      try {
        const productionResolver = productionTestApp.app.get(TenantResolverService)

        const resolution = await productionResolver.resolve(
          headers({
            host: 'bilinmeyen-host.arkesoft.localhost',
            'x-arkesoft-tenant': DEMO_SEED.tenant.slug,
          }),
        )

        expect(resolution).toEqual({ kind: 'unresolved', reason: 'header_rejected_in_production' })
      } finally {
        await productionTestApp.app.close()
      }
    })

    it("development + aynı başlık + bilinmeyen host → ÇÖZÜLÜR (dev-header host'u BAYPAS eder)", async () => {
      const developmentTestApp = await createTestApp({ apiEnv: developmentEnv() })
      try {
        const developmentResolver = developmentTestApp.app.get(TenantResolverService)

        const resolution = await developmentResolver.resolve(
          headers({
            host: 'bilinmeyen-host.arkesoft.localhost',
            'x-arkesoft-tenant': DEMO_SEED.tenant.slug,
          }),
        )

        expect(resolution.kind).toBe('resolved')
        if (resolution.kind === 'resolved') {
          expect(resolution.tenant.slug).toBe(DEMO_SEED.tenant.slug)
          expect(resolution.tenant.source).toBe('dev-header')
        }
      } finally {
        await developmentTestApp.app.close()
      }
    })
  })

  // --- Bonus: dev-header dizi (çoklu x-arkesoft-tenant) de multiple_host_headers üretir ---
  it('development + ÇOKLU x-arkesoft-tenant başlığı → unresolved(multiple_host_headers), 0 çağrı', async () => {
    const spy = vi.spyOn(prismaService.db.tenant, 'findUnique')

    const resolution = await resolver.resolve(
      headers({
        host: 'bilinmeyen-host.arkesoft.localhost',
        'x-arkesoft-tenant': [DEMO_SEED.tenant.slug, 'baska-slug'],
      }),
    )

    expect(resolution).toEqual({ kind: 'unresolved', reason: 'multiple_host_headers' })
    expect(spy).toHaveBeenCalledTimes(0)
  })
})
