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
//
// GÜNCELLEME (ROADMAP v0.0.5, T-006/S3, PO riski 1 — ÖLÇÜLDÜ, bağlayıcı):
// Vaka 3'ün eski pozitif pin'i (`prismaService.db satisfies PrismaDatabase`)
// "MADDE 2 — R-1 KARARI" daraltmasıyla (`.db` artık `AppPrismaDatabase`
// döner) bu BİÇİMDE DERLENMEZ — `AppPrismaDatabase`, `account`/`session`/
// `verification` delegelerini EKSİK bıraktığı için `PrismaDatabase`'e
// (tam yüzey) UYUMLU DEĞİLDİR. Bu bir GEVŞETME DEĞİL — pin GÜÇLENDİRİLDİ:
// pozitif pin artık `AppPrismaDatabase`'e karşı (daraltılmış tipin kendisi
// değişmeden kaldığını ölçer) VE yeni bir NEGATİF pin eklendi
// (`@ts-expect-error` + `.db.account` erişimi) — bu ikincisi R-1'in derleme
// zamanı iddiasının (`tx.account.findMany()` artık derlenmiyor, PM riski 1)
// BU SARMALAYICI üzerindeki mekanik kanıtıdır. `PrismaDatabase` import'u
// artık GEREKSİZ — `AppPrismaDatabase`'e DARALTILDI (sadece gerçekten
// kullanılan tip import edilir).

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { DEMO_SEED } from '@arkesoft/db'
import type { AppPrismaDatabase } from '@arkesoft/db'
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

  it('Vaka 3 — `.db` getter imzası `AppPrismaDatabase`e DARALTILDI (derleme zamanı tip testi, PO riski 1)', () => {
    // POZİTİF PİN (GÜÇLENDİRİLDİ) — `.db` artık `AppPrismaDatabase` döner
    // (sır taşıyan üç model delegesi `Omit<>` ile düşürülmüş); `satisfies`
    // tip uyumunu derleme zamanında zorlar (değeri GENİŞLETMEZ).
    const dbPin = prismaService.db satisfies AppPrismaDatabase
    expect(dbPin).toBeDefined()

    // NEGATİF PİN (YENİ — PO riski 1'in asıl mekanik kanıtı, "MADDE 2 — R-1
    // KARARI" katman 1): `.db` üzerinden `account` delegesine erişim artık
    // DERLENMEZ. Bu satır GERÇEK bir tip hatası ÜRETMEZSE (ör. `Omit<>`
    // daraltması bir gün yanlışlıkla kaldırılırsa) `@ts-expect-error`
    // "kullanılmayan direktif" olarak `pnpm typecheck`'i KIRAR — PM riski
    // 1'in tarif ettiği `tx.account.findMany()` senaryosunun (tüm parola
    // hash'lerinin dökülmesi) bu sarmalayıcı üzerinden artık DERLENMEDİĞİNİN
    // kanıtı.
    // `unknown` ANNOTASYONU BİLEREK: `account` tipi derleme hatası yüzünden
    // `any`'e DÜŞER — açık `unknown` anotasyonu olmadan eslint
    // `no-unsafe-assignment` ile KIRILIR (S2'nin `auth-model-narrowing.pin.ts`
    // deseniyle AYNI çözüm: dönüş tipini `unknown` TUTMAK, `any`'İ YAYMAMAK).
    // @ts-expect-error — "account" AUTH_SECRET_BEARING_MODELS'te, AppPrismaDatabase'de (.db'nin tipi) YOK.
    const account: unknown = prismaService.db.account
    expect(account).toBeDefined()
  })
})
