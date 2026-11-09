// @arkesoft/trpc — `tenant.updateSecurityPolicy` tel sözleşmesi (ROADMAP
// v0.0.15, T-016/S7, architect md 2 — owner 2FA zorunluluğu)
//
// ⚠ GİRDİ VE ÇIKTI AYNI ŞEKİL AMA AYRI ŞEMADIR (`tenant-summary.schema.ts`'in
// girdi/çıktı ayrımı EMSALİ): girdi çağıranın İSTEDİĞİ değeri taşır, çıktı
// yazmadan SONRAKİ GERÇEK durumu taşır. Bugün ikisi de tek bir boolean olduğu
// için şekilleri birebir aynı görünür, ama port TOTAL olduğu için (ADR-0009
// madde 3) çıktı her zaman port'un FİİLEN yazdığı değerdir — girdinin kendisi
// DEĞİL (idempotent no-op yolunda ikisi aynı değeri taşır, ama bu bir
// TESADÜFTÜR, şema seviyesinde zorlanan bir eşitlik DEĞİLDİR).
//
// ⚠ `tenantId` BU ŞEMALARDA YOKTUR VE OLMAYACAKTIR (CLAUDE.md §7, ADR-0009
// madde 7): kiracı kimliği HER ZAMAN `ctx.tenant.tenantId`'den gelir, girdiden
// ASLA okunmaz — `tenant.router.ts`'teki resolver bunu zorlar.

import { z } from 'zod'

/** `tenant.updateSecurityPolicy`'nin girdi şeması. */
export const tenantSecurityPolicyUpdateInputSchema = z.object({
  requireTwoFactorForOwner: z.boolean(),
})

/** {@link tenantSecurityPolicyUpdateInputSchema}'nın çıkarılan tip karşılığı. */
export type TenantSecurityPolicyUpdateInput = z.infer<typeof tenantSecurityPolicyUpdateInputSchema>

/** `tenant.updateSecurityPolicy`'nin çıktı şeması — yazmadan SONRAKİ gerçek durum. */
export const tenantSecurityPolicySchema = z.object({
  requireTwoFactorForOwner: z.boolean(),
})

/** {@link tenantSecurityPolicySchema}'nın çıkarılan tip karşılığı. */
export type TenantSecurityPolicy = z.infer<typeof tenantSecurityPolicySchema>
