// @arkesoft/trpc — tenant.current (ROADMAP v0.0.6, T-007/ST-2, architect "tRPC
// sözleşmesi", K1/K5)
//
// Resolver gövdesi TEK İFADE (ADR-0009 madde 4, bağlayıcı): `ctx.ports.*`
// üzerinde TEK çağrı. Port TOTAL'dır (`TenantReadPort.findSummary` —
// `ports/tenant-read.port.ts`) — "bulunamadı" durumu BURAYA `null` olarak
// GELMEZ, port `AppError` fırlatır; bu resolver `null` kontrolü YAPMAZ,
// dallanma SIFIR. `ctx.tenant.tenantId` HER ZAMAN host çözümünden gelir
// (`requireTenant`'ın daralttığı `'resolved'` varyant), GİRDİDEN DEĞİL —
// `tenant.current` girdi ALMAZ (CLAUDE.md §7).

import { tenantSummarySchema } from '../schemas/tenant-summary.schema.js'
import { router, tenantProcedure } from '../trpc.js'

export const tenantRouter = router({
  current: tenantProcedure
    .output(tenantSummarySchema)
    .query(({ ctx }) => ctx.ports.tenantRead.findSummary(ctx.tenant.tenantId)),
})
