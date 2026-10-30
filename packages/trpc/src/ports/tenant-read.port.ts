// @arkesoft/trpc — TenantReadPort (ROADMAP v0.0.6, T-007/ST-2, architect K1)
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR
// (`apps/api/src/trpc/ports/tenant-read.port.adapter.ts`, S5). ADR-0009
// madde 3: port TOTAL'dır — "bulunamadı" durumu çağırana `null` olarak
// GEÇMEZ, port `AppError` fırlatır (`apps/api`'nin kendi hata sınıfı, ör.
// `TenantNotFoundError`). Sözleşme katmanı yokluğun ne anlama geldiğine
// ASLA karar vermez — bu yüzden `tenant.router.ts`'teki resolver `null`
// kontrolü YAPMAZ, sıfır dallanma.

import type { TenantSummary } from '../schemas/tenant-summary.schema.js'

export interface TenantReadPort {
  /**
   * `tenantId` HER ZAMAN host çözümünden gelen `TrpcTenantState.tenantId`
   * değeridir — girdiden (prosedür input'undan) ASLA gelmez (CLAUDE.md §7,
   * ADR-0009 madde 7). Satır bulunamazsa port `AppError` fırlatır; bu
   * fonksiyon `null`/`undefined` DÖNMEZ.
   */
  findSummary(tenantId: string): Promise<TenantSummary>
}
