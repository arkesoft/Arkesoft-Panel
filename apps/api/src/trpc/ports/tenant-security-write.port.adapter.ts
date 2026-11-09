// @arkesoft/api — TenantSecurityWritePort adaptörü (ROADMAP v0.0.15,
// T-016/S7, architect md 2)
//
// Port `packages/trpc`'de BİLDİRİLİR (`ports/tenant-security-write.port.ts`),
// burada UYGULANIR. `MemberWritePortAdapter`'ın (T-014/S4) AYNI deseni — bu
// dosya İŞ MANTIĞI TAŞIMAZ, TEK metot TEK delegasyondur; iş mantığının
// TAMAMI `tenant/tenant-security.service.ts`'te yaşar.

import { Inject, Injectable } from '@nestjs/common'
import type { TenantSecurityPolicy, TenantSecurityPolicyUpdateInput } from '@arkesoft/trpc'
import type { TenantSecurityWritePort } from '@arkesoft/trpc/server'

import { TenantSecurityService } from '../../tenant/tenant-security.service.js'

@Injectable()
export class TenantSecurityWritePortAdapter implements TenantSecurityWritePort {
  constructor(
    @Inject(TenantSecurityService) private readonly tenantSecurity: TenantSecurityService,
  ) {}

  updateSecurityPolicy(
    tenantId: string,
    actorUserId: string,
    input: TenantSecurityPolicyUpdateInput,
  ): Promise<TenantSecurityPolicy> {
    return this.tenantSecurity.updateSecurityPolicy(tenantId, actorUserId, input)
  }
}
