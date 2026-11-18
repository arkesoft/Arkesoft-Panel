// @arkesoft/api — PlatformReadPort adaptörü (ROADMAP v0.0.20, T-021/S7,
// ADR-0023 Karar 1/3)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/platform-read.port.ts`), burada
// UYGULANIR. ⚠⚠ DI'DAN YALNIZCA `ImpersonationService` ALINIR —
// `PrismaService` BU DOSYADA ENJEKTE EDİLMEZ; mekanik kapı
// `platform-impersonation-write-gate.test.ts`'te.
//
// ⚠⚠ `listTenants` ADR-0023 Karar 1'İN ("R1 ÇÖZÜLDÜ") UYGULAMA YERİDİR:
// listenin DÖRT kolonundan ÜÇÜ (`slug`/`status`/`createdAt`, + `id`/`name`)
// `ImpersonationService.listTenantsBasic` ile GUC'SUZ okunur; `plan` BAĞI
// (`planId`/`planName`) `ImpersonationService.runImpersonated()`'IN TEK
// çağrı yeri BURADADIR — bu TEK okuma operasyonu `platform_audit_log`'a
// BİR satır yazar (`tenant_impersonation_started`, `detail.tenantIds`
// erişilen kümenin TAMAMI). Bu YAN ETKİ `PlatformReadPort` arayüzünde
// GÖRÜNMEZ (`platform-read.port.ts` dosya başı yorumu) — `packages/trpc`
// denetim yazma mekanizmasını hiç BİLMEZ.
//
// ⚠ `listAuditEntries` kiracı verisine ERİŞMEZ, impersonation GEREKTİRMEZ
// (platform seviyesi tablo okur) — `runImpersonated()` BURADA ÇAĞRILMAZ.

import { Inject, Injectable } from '@nestjs/common'
import type {
  PlatformAuditEntry as PlatformAuditEntryWire,
  PlatformAuditLogInput,
  PlatformTenantListInput,
  PlatformTenantSummary,
} from '@arkesoft/trpc'
import type { PlatformReadPort } from '@arkesoft/trpc/server'

import { ImpersonationService } from './impersonation.service.js'
import { requirePlatformActorContext } from './platform-request-context.js'

@Injectable()
export class PlatformReadPortAdapter implements PlatformReadPort {
  constructor(@Inject(ImpersonationService) private readonly impersonation: ImpersonationService) {}

  async listTenants(input: PlatformTenantListInput): Promise<readonly PlatformTenantSummary[]> {
    const basics = await this.impersonation.listTenantsBasic(input.limit)

    if (basics.length === 0) {
      return []
    }

    const actor = requirePlatformActorContext()
    const tenantIds = basics.map((tenant) => tenant.id)

    // ⚠⚠ TEK çağrı yeri (AC-9, grep kapısıyla kanıtlı) — bu operasyonun
    // TEK denetim satırını üretir, ardından her kiracı için AYRI
    // `withTenant()` açar (ADR-0023 §3).
    const subscriptionByTenantId = await this.impersonation.runImpersonated(
      { actorUserId: actor.userId, ip: actor.ip, userAgent: actor.userAgent },
      tenantIds,
      (tx, tenantId) =>
        tx.subscription.findUnique({
          where: { tenantId },
          select: { planId: true },
        }),
    )

    const planIds = [...subscriptionByTenantId.values()]
      .map((row) => row?.planId)
      .filter((planId): planId is string => typeof planId === 'string')
    const planNameById = await this.impersonation.resolvePlanNames(planIds)

    return basics.map((tenant) => {
      const planId = subscriptionByTenantId.get(tenant.id)?.planId ?? null

      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        planId,
        planName: planId === null ? null : (planNameById.get(planId) ?? null),
        createdAt: tenant.createdAt.toISOString(),
      }
    })
  }

  async listAuditEntries(input: PlatformAuditLogInput): Promise<readonly PlatformAuditEntryWire[]> {
    const rows = await this.impersonation.listAuditEntries(input.limit)

    return rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      action: row.action,
      subject: row.subject,
      createdAt: row.createdAt.toISOString(),
    }))
  }
}
