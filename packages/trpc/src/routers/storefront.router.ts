// @arkesoft/trpc — storefront.currentTenant (ROADMAP v0.0.8, T-009/S5,
// architect K2, ADR-0012)
//
// AYRI DOSYA — `tenant.router.ts`'e EKLENMEZ. Gerekçe: o dosyanın başlığı
// `tenantProcedure`'ün değişmezlerini ("ctx.tenant.tenantId HER ZAMAN host
// çözümünden gelir", "girdi ALMAZ") DOSYA KAPSAMINDA beyan ediyor; iki güven
// seviyesini (kimlikli-tenant / anonim-tenant) aynı dosyaya koymak o
// başlığı YANLIŞ yapar ve inceleyeni PROSEDÜR BAŞINA builder kontrolüne
// zorlar. Dosya başına TEK güven seviyesi. Namespace `storefront` tüketiciyi
// (`apps/storefront`) adıyla duyurur.
//
// Resolver gövdesi TEK İFADE (ADR-0009 madde 4, bağlayıcı): `ctx.ports.*`
// üzerinde TEK çağrı, dallanma SIFIR. Girdi şeması (input) hiç BİLDİRİLMEZ
// (ADR-0009 madde 7, bağlayıcı): "`tenantId` ASLA prosedür girdisinden
// alınmaz; yalnızca host çözümünden gelen istek bağlamından okunur." Girdi
// olmaması aynı zamanda TAM YOL eşleşmesi mekanizmasının temel taşıdır: sorgu
// dizesi hiç doğmaz, `allowBatching: false` (ADR-0009 madde 8, DOKUNULMAZ)
// toplu yolun doğmasını engeller.
//
// HTTP yolu: `/trpc/storefront.currentTenant` — bu TAM yolun
// `AUTH_EXEMPT_PATHS`'e eklenmesi `apps/api`'nin işidir (ayrı alt görev, S7).

import { storefrontTenantSchema } from '../schemas/storefront-tenant.schema.js'
import { publicTenantProcedure, router } from '../trpc.js'

export const storefrontRouter = router({
  currentTenant: publicTenantProcedure
    .output(storefrontTenantSchema)
    .query(({ ctx }) => ctx.ports.storefrontTenantRead.findPublicTenant(ctx.tenant.tenantId)),
})
