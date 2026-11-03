// @arkesoft/api — StorefrontTenantReadPort adaptörü (ROADMAP v0.0.8, T-009/S7,
// architect VERİ MODELİ kararı, ADR-0012)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/storefront-tenant-read.port.ts`),
// burada UYGULANIR. Port TOTAL'dır (ADR-0009 madde 3'ün AYNISI) — "bulunamadı"
// durumu çağırana `null` olarak GEÇMEZ, bu adaptör `AppError` (mevcut
// `TenantNotFoundError`) fırlatır; `storefront.router.ts`'teki resolver bu
// yüzden `null` kontrolü YAPMAZ (sıfır dallanma, tek ifade).
//
// ⚠ `TenantResolverService`'in okuduğu satırı (`TENANT_SELECT`,
// `tenant-resolver.service.ts:57`) YENİDEN KULLANMAZ — o seçim `name`'i
// BİLEREK ALMIYOR (`tenant-resolver.service.ts:24`, "`select` MİNİMAL: `name`
// ALINMAZ"). `TENANT_SELECT`'e `name` eklemek istek başına okumayı 2'den 1'e
// düşürürdü ama İKİ dosyanın AÇIKÇA YAZILI kararını geri alırdı — ölçülmüş bir
// perf bütçesi (v0.20.0) OLMADAN YAPILMAZ (architect R2). Bu yüzden BURADA
// AYRI, İKİNCİ bir okuma yazılır — istek başına toplam 2 indeksli okuma
// BİLEREK kabul edilir.

import { Inject, Injectable } from '@nestjs/common'
import type { StorefrontTenant } from '@arkesoft/trpc'
import type { StorefrontTenantReadPort } from '@arkesoft/trpc/server'

import { TenantNotFoundError } from '../../errors/domain/tenant-not-found.error.js'
import { PrismaService } from '../../prisma/prisma.service.js'

@Injectable()
export class StorefrontTenantReadPortAdapter implements StorefrontTenantReadPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPublicTenant(tenantId: string): Promise<StorefrontTenant> {
    // Ham `PrismaService.db.tenant` çağrısı CLAUDE.md §4/§7 madde 5 gereği
    // gerekçe ister — `withTenant()` bu tablo için YAPISAL olarak kullanılamaz
    // (`TenantTransactionClient = Pick<TransactionClient, 'tenantMembership'>`,
    // ADR-0008). Dört madde (`tenant-read.port.adapter.ts:21-31`'in üçü +
    // dördüncüsü YENİ):
    // (a) `tenant` PLATFORM SEVİYESİ tablodur — kiracıya BAĞLI değil,
    //     kiracının KENDİSİDİR.
    // (b) erişim YETKİSİ bu adaptörden gelmez.
    // (c) `tenantId` GİRDİDEN değil, host çözümünden gelen
    //     `TrpcTenantState.tenantId` değeridir (CLAUDE.md §7) — çağıran
    //     (`storefront.router.ts`) bunu asla prosedür girdisinden ALMAZ (bu
    //     prosedürün girdi şeması zaten YOK).
    // (d) YENİ: erişim yetkisi `AuthGuard`'dan DEĞİL `TenantGuard`'ın host
    //     çözümünden gelir — BU YÜZEY ANONİMDİR (`AUTH_EXEMPT_PATHS`'e
    //     eklenen tek yol, `auth-exempt-paths.ts`) ve bu fark `TenantReadPort
    //     Adapter`'dan (kimlikli yüzey) AYRIKA burada açıkça yazılıdır.
    const row = await this.prisma.db.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { name: true, themeId: true, themeVersion: true },
    })

    if (row === null) {
      throw new TenantNotFoundError()
    }

    return row
  }
}
