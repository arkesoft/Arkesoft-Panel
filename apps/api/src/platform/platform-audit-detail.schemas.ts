// @arkesoft/api — platform_audit_log `detail` JSONB yazma kapısı (ROADMAP
// v0.0.20, T-021/S7, ADR-0023 Karar 3 · `audit/audit-diff.schemas.ts`'in
// AYNI deseni: JSONB kolonuna yazmanın TEK yolu bir Zod kapısından geçer)
//
// `AUDIT_DIFF_SCHEMA_BY_ACTION`'ın (kiracı denetim kaydı) platform seviyesi
// ikizi — ⚠ İKİ eylem sözlüğü AYRI KALIR (birleştirilmez): kiracı denetim
// kaydının `diff`i İŞ alanı değişimini anlatır, platform denetim kaydının
// `detail`i ERİŞİM OPERASYONUNUN kapsamını (`tenantIds`) anlatır — ikisi
// farklı bir şeyi kanıtlıyor.
//
// ⚠⚠ `detail.tenantIds` TELE ÇIKMAZ (architect "tRPC" bölümü madde 4,
// `packages/trpc/src/schemas/platform.schema.ts` dosya başı yorumu) — bu
// şema SADECE veri katmanına yazılan JSONB'nin ŞEKLİNİ kapatır, tel
// sözleşmesiyle hiçbir ilişkisi yoktur.
//
// `.strict()`: her iki eylemin `detail`i KAPALI ve KÜÇÜKTÜR — serbest JSON
// YOKTUR (CLAUDE.md §4, JSONB okuma/yazma Zod'dan geçer).

import type { PlatformAuditAction } from '@arkesoft/db'
import { z } from 'zod'

/**
 * `platform_admin_signed_in` — detay TAŞIMAZ (eylemin kendisi "kim, ne
 * zaman" sorusunu `actor_user_id`/`created_at` kolonlarıyla ZATEN
 * cevaplıyor, ikinci bir alan İCAT EDİLMEZ).
 */
const platformAdminSignedInDetailSchema = z.object({}).strict()

/**
 * `tenant_impersonation_started` — TEK alan: `tenantIds`, erişilen kiracı
 * kümesinin TAMAMI (ADR-0023 §3, "denetim birimi = erişim OPERASYONU").
 * `.min(1)`: boş bir kiracı kümesiyle impersonation ÇAĞRILAMAZ — bu şema
 * o garantiyi YAZMA kapısında da zorlar (çağıranın `tenantIds.length === 0`
 * ihtimalini KENDİSİ engellemesine GÜVENİLMEZ).
 */
const tenantImpersonationStartedDetailSchema = z
  .object({ tenantIds: z.array(z.string().min(1)).min(1) })
  .strict()

/**
 * Eylem → `detail` şeması. `satisfies Record<PlatformAuditAction, …>` TAM
 * olduğu için `PlatformAuditAction` enum'una (Prisma, migration ile) bir
 * değer eklemek bu tabloya satır eklenene kadar `typecheck`'i KIRAR —
 * "yeni eylemin detay şemasının yazılmaması" İMKÂNSIZDIR
 * (`audit-diff.schemas.ts`'in AYNI mekanik garantisi).
 */
export const PLATFORM_AUDIT_DETAIL_SCHEMA_BY_ACTION = {
  platform_admin_signed_in: platformAdminSignedInDetailSchema,
  tenant_impersonation_started: tenantImpersonationStartedDetailSchema,
} as const satisfies Record<PlatformAuditAction, z.ZodType>

/** `platform_audit_log.user_agent` kolonuna yazılacak azami karakter sayısı — `AUDIT_USER_AGENT_MAX_LENGTH`'in AYNI değeri/gerekçesi. */
export const PLATFORM_AUDIT_USER_AGENT_MAX_LENGTH = 512
