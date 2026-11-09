// @arkesoft/trpc — tenant.current, tenant.updateSecurityPolicy (ROADMAP
// v0.0.6, T-007/ST-2, architect "tRPC sözleşmesi", K1/K5; v0.0.15, T-016/S7,
// architect md 2)
//
// Resolver gövdesi TEK İFADE (ADR-0009 madde 4, bağlayıcı): `ctx.ports.*`
// üzerinde TEK çağrı. Portlar TOTAL'dır (`TenantReadPort.findSummary`,
// `TenantSecurityWritePort.updateSecurityPolicy`) — "bulunamadı"/"kendini
// kilitleme" gibi durumlar BURAYA `null`/boolean olarak GELMEZ, port
// `AppError` fırlatır; bu resolver'lar `null` kontrolü YAPMAZ, dallanma
// SIFIR. `ctx.tenant.tenantId` HER ZAMAN host çözümünden gelir
// (`requireTenant`'ın daralttığı `'resolved'` varyant), GİRDİDEN DEĞİL —
// hiçbir girdi şeması `tenantId` TAŞIMAZ (CLAUDE.md §7, ADR-0009 madde 7).

import { permissionProcedure } from '../authz/permission-procedure.js'
import {
  tenantSecurityPolicySchema,
  tenantSecurityPolicyUpdateInputSchema,
} from '../schemas/tenant-security.schema.js'
import { tenantSummarySchema } from '../schemas/tenant-summary.schema.js'
import { router, tenantProcedure } from '../trpc.js'

export const tenantRouter = router({
  current: tenantProcedure
    .output(tenantSummarySchema)
    .query(({ ctx }) => ctx.ports.tenantRead.findSummary(ctx.tenant.tenantId)),

  /**
   * `permissionProcedure('security:write')` — YALNIZCA `owner` (platformun
   * ilk owner-münhasır izni, `authz/permissions.ts`); `admin` DAHİL diğer
   * dört rol 403 alır.
   */
  updateSecurityPolicy: permissionProcedure('security:write')
    .input(tenantSecurityPolicyUpdateInputSchema)
    .output(tenantSecurityPolicySchema)
    .mutation(({ ctx, input }) =>
      ctx.ports.tenantSecurityWrite.updateSecurityPolicy(
        ctx.tenant.tenantId,
        ctx.auth.userId,
        input,
      ),
    ),
})
