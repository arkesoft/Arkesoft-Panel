// @arkesoft/trpc — tenant.current tel sözleşmesi (ROADMAP v0.0.6, T-007/ST-2,
// architect K5)
//
// ADR-0009 madde 5 ("TenantStatus neden @arkesoft/db'den import edilmiyor"):
// `packages/trpc` tarayıcı tüketicisi olan bir pakettir; `@arkesoft/db`'ye
// bağımlılık Prisma tiplerini admin SPA'sının grafiğine sokar. Bu yüzden
// kiracı durumu sözlüğü BURADA YEREL OLARAK bildirilir — `@prisma/client`'ın
// `TenantStatus` enum'u İMPORT EDİLMEZ. Sapma riski `apps/api`'deki bir tip +
// çalışma zamanı pini (`apps/api/src/__tests__/type-pins/trpc-wire-contract.pin.ts`,
// S6) ile yakalanır; bu paketin görevi değildir, yalnızca o pinin
// karşılaştırdığı "gerçeğin" kaynağıdır.
//
// K5 bağlayıcı kurallar (ADR-0009 madde 7):
//   1. Opsiyonel alan YOK — yokluk `null` ile ifade edilir (`primaryDomain`).
//   2. Yalnızca JSON ilkelleri — `Date` yok, transformer gerekmiyor.
//   3. Çıktı şeması iş kuralı TAŞIMAZ (`.min(1)` yok) — amacı şekil ve
//      sızdırmazlık kontrolü, girdi doğrulaması değil.
//
// Alan seçimi (architect K5, PM kullanıcı kararı #1 — `planId`/`deletedAt`
// BİLİNÇLİ OLARAK dışarıda):
//   id             — sorgu anahtarı
//   slug           — panel "siteniz" gösterimi (host'tan zaten biliniyor)
//   name           — v0.0.7 panel başlığının TEK ihtiyacı; ALS TenantContext'te
//                    bilerek yok, bu port bu alan YÜZÜNDEN var
//   status         — panel pending/suspended'da UI'yi kapatmak zorunda
//   primaryDomain  — "sitem hangi adreste" paneldeki en sık soru; null ise
//                    henüz atanmamış (opsiyonel DEĞİL, yokluk null)

import { z } from 'zod'

/**
 * Kiracı durumu sözlüğü — `@arkesoft/db`'nin Prisma `TenantStatus` enum'unun
 * YEREL, tele-özgü karşılığı (ADR-0009 madde 5). Değer kümesi değişirse
 * `apps/api`'deki çalışma zamanı pini kırılır; bu dosya SESSİZCE sapamaz.
 */
export const tenantStatusSchema = z.enum(['pending', 'provisioning', 'active', 'suspended'])

/** {@link tenantStatusSchema}'nın çıkarılan tip karşılığı. */
export type TenantStatusWire = z.infer<typeof tenantStatusSchema>

/**
 * `tenant.current` prosedürünün çıktı şeması — ayrı bir tel sözleşmesi tipi
 * (PM kullanıcı kararı #1). `Tenant` Prisma modeliyle BİREBİR AYNI DEĞİL;
 * `planId` ve `deletedAt` kasıtlı olarak yok.
 */
export const tenantSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: tenantStatusSchema,
  primaryDomain: z.string().nullable(),
})

/** {@link tenantSummarySchema}'nın çıkarılan tip karşılığı. */
export type TenantSummary = z.infer<typeof tenantSummarySchema>
