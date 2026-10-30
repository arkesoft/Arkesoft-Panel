// @arkesoft/api — TenantReadPort adaptörü (ROADMAP v0.0.6, T-007/S5, architect
// K1/K4, V3 DOĞRULANDI)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/tenant-read.port.ts`), burada
// UYGULANIR. Port TOTAL'dır (ADR-0009 madde 3) — "bulunamadı" durumu çağırana
// `null` olarak GEÇMEZ, bu adaptör `AppError` (mevcut `TenantNotFoundError`)
// fırlatır; `tenant.router.ts`'teki resolver bu yüzden `null` kontrolü YAPMAZ.

import { Inject, Injectable } from '@nestjs/common'
import type { TenantSummary } from '@arkesoft/trpc'
import type { TenantReadPort } from '@arkesoft/trpc/server'

import { TenantNotFoundError } from '../../errors/domain/tenant-not-found.error.js'
import { PrismaService } from '../../prisma/prisma.service.js'

@Injectable()
export class TenantReadPortAdapter implements TenantReadPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findSummary(tenantId: string): Promise<TenantSummary> {
    // Ham `PrismaService.db.tenant` çağrısı CLAUDE.md §4 gereği gerekçe ister
    // — `withTenant()` bu tablo için YAPISAL olarak kullanılamaz
    // (`TenantTransactionClient = Pick<TransactionClient, 'tenantMembership'>`,
    // ADR-0008). Üç madde (architect V3/K4):
    // (a) `tenant` PLATFORM SEVİYESİ tablodur — kiracıya BAĞLI değil,
    //     kiracının KENDİSİDİR.
    // (b) erişim YETKİSİ bu adaptörden gelmez — `AuthGuard`'ın (HTTP yolunda
    //     bu isteğe ÖNCE koşan) üyelik kontrolünden gelir.
    // (c) `tenantId` GİRDİDEN değil, host çözümünden gelen
    //     `TrpcTenantState.tenantId` değeridir (CLAUDE.md §7) — çağıran
    //     (`tenant.router.ts`) bunu asla prosedür girdisinden ALMAZ.
    const row = await this.prisma.db.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, slug: true, name: true, status: true, primaryDomain: true },
    })

    if (row === null) {
      throw new TenantNotFoundError()
    }

    return row
  }
}
