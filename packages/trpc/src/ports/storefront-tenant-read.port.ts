// @arkesoft/trpc — StorefrontTenantReadPort (ROADMAP v0.0.8, T-009/S5,
// architect K1/K4, ADR-0012)
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR (ayrı alt görev, S7).
// ADR-0009 madde 3'ün AYNISI: port TOTAL'dır — "bulunamadı" durumu çağırana
// `null` olarak GEÇMEZ, port `AppError` fırlatır (`apps/api`'nin kendi hata
// sınıfı, `TenantNotFoundError`). Sözleşme katmanı yokluğun ne anlama
// geldiğine ASLA karar vermez — bu yüzden `storefront.router.ts`'teki
// resolver `null` kontrolü YAPMAZ, sıfır dallanma.
//
// `tenant-read.port.ts`'ten (`TenantReadPort`) BİLEREK AYRI port — dönüş
// tipi {@link StorefrontTenant}, `TenantSummary` DEĞİL. İki portun KASITLI
// olarak farklı dönüş tipi taşıması sızdırmazlığın TEK garantisidir
// (architect K3 — Zod 4'ün `z.object()` soyma davranışına güvenilmez, bkz.
// `../schemas/storefront-tenant.schema.ts`).

import type { StorefrontTenant } from '../schemas/storefront-tenant.schema.js'

export interface StorefrontTenantReadPort {
  /**
   * `tenantId` HER ZAMAN host çözümünden gelen `TrpcTenantState.tenantId`
   * değeridir — girdiden (prosedür input'undan) ASLA gelmez (CLAUDE.md §7,
   * ADR-0009 madde 7). Satır bulunamazsa port `AppError` fırlatır; bu
   * fonksiyon `null`/`undefined` DÖNMEZ.
   */
  findPublicTenant(tenantId: string): Promise<StorefrontTenant>
}
