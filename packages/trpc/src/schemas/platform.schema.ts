// @arkesoft/trpc — `platform.*` tel sözleşmesi (ROADMAP v0.0.20, T-021/S5,
// architect "tRPC — yeni `platform` router'ı" bölümü, ADR-0023 Karar 1/3)
//
// ADR-0009 madde 5 EMSALİ (`tenant-summary.schema.ts`/`job-summary.schema.ts`
// ile BİREBİR aynı mekanizma): bu paket TARAYICI tüketicisi olan bir pakettir
// (süper admin SPA'sı, v0.0.20); `@arkesoft/db`'ye bağımlılık Prisma'nın
// ürettiği `PlatformAuditAction` enum'unu admin/süper admin SPA'sının modül
// grafiğine sokardı. Bu yüzden {@link platformAuditActionSchema} BURADA
// YEREL olarak bildirilir — değer kümesi veritabanı paketinden ne TİP ne
// DEĞER olarak import EDİLİR. ⚠⚠ Sapma riski `apps/api`'deki bir TİP PİNİ +
// ÇALIŞMA ZAMANI pini ile yakalanır (`trpc-wire-contract.pin.ts`'in mevcut
// pin'lerinin — `TenantStatusWire` PİN 1, `JobStatusWire` PİN 5 — AYNI
// deseni); bu dosyanın görevi yalnızca o pinin karşılaştırdığı "gerçeğin"
// kaynağı olmaktır (S7/apps/api'nin kapsamı).
//
// K5 bağlayıcı kurallar (ADR-0009 madde 7, diğer tüm tel şemalarıyla AYNI):
//   1. Opsiyonel ÇIKTI alanı YOK — yokluk `null` ile ifade edilir (`planId`/
//      `planName` bu kuralın örneğidir, aşağıda).
//   2. Yalnızca JSON ilkelleri — `Date` YOK, transformer gerekmiyor. Zaman
//      alanları ISO-8601 dizesidir (`z.iso.datetime()`, `z.string().datetime()`
//      DEĞİL — zod 4.6.7'de ikincisi `@deprecated` ve bu repoda
//      `@typescript-eslint/no-deprecated` onu LİNT HATASI yapıyor).
//   3. Çıktı şeması İŞ KURALI taşımaz.
//
// ⚠⚠ TELE ÇIKMAYAN İKİ ŞEY (architect "tRPC" bölümü, BAĞLAYICI):
//   (1) `PlatformAuditLog.detail` (JSON) — kiracı kimlik listesini
//       (`detail.tenantIds`) ve PII değerlendirmesini genişletirdi; AC-8
//       denetim SATIRINI SAYAR, içeriği OKUMAZ. Bu dosyada o alanın adı HİÇ
//       GEÇMEZ (literal-jeton kuralı — AGENT_BASELINE.md §5).
//   (2) Aktör e-postası/adı — yalnızca `actorUserId` (opak kullanıcı kimliği)
//       tele çıkar; maskeleme tartışması bu yüzden DOĞMAZ.
//
// `planId`/`planName` NULLABLE (K5 kuralı 1, OPSİYONEL DEĞİL): bu iki alan
// `platformRead.listTenants` adaptöründe (apps/api, S7) kiracı kapsamlı
// `Subscription`/`Plan` okumasından gelir (ADR-0023 Karar 1 — R1'in dördüncü
// yolu: liste kolonlarının platform seviyesi ÜÇÜ GUC'suz, `plan` BAĞI
// `runImpersonated()` ile okunur). Bugünkü kayıt akışı HER kiracı için TEK
// bir transaction'da `Subscription` üretir (ADR-0021 §4) ama bu port o
// garantiyi VARSAYMAZ — `Subscription` satırı yoksa adaptör `null` döner,
// bu şema bunu OPSİYONEL bir alan yerine `null` ile ifade eder.

import { z } from 'zod'

import { tenantStatusSchema } from './tenant-summary.schema.js'

// ---------------------------------------------------------------------------
// `platform.session` — kapı DIŞINDA, yalnızca çağıranın KENDİSİ hakkında
// ---------------------------------------------------------------------------

/**
 * `platform.session`'ın çıktısı. ⚠⚠ Bu prosedür BİLEREK `platformAdminProcedure`
 * KAPISININ DIŞINDADIR (architect "tRPC" bölümü madde 1) — AC-4(a)'nın ön
 * koşulu: 2FA'sı olmayan bir platform yöneticisinin istemcisi "yöneticiyim
 * ama 2FA'm yok" durumunu OKUYABİLMELİDİR (aksi hâlde kuruluma yönlendirme
 * imkânsız olurdu). Çıktı SIFIR kiracı verisi taşır — bu yüzden AC-4(b)'nin
 * "veri ucu" tanımına GİRMEZ ve kapı dışında olması bir güvenlik açığı
 * DEĞİLDİR.
 */
export const platformSessionSchema = z.object({
  isPlatformAdmin: z.boolean(),
  twoFactorEnabled: z.boolean(),
})

/** {@link platformSessionSchema}'nın çıkarılan tip karşılığı. */
export type PlatformSession = z.infer<typeof platformSessionSchema>

// ---------------------------------------------------------------------------
// `platform.tenantList`
// ---------------------------------------------------------------------------

/**
 * Sayfa boyutu ÜST SINIRI (`job-summary.schema.ts`'in AYNI deseni — R-A5):
 * `platform.tenantList` yapısal olarak 1+N transaction üretir (platform
 * seviyesi liste okuması + her kiracı için AYRI `withTenant()`), bu yüzden
 * sınır SÖZLEŞMEDEDİR, adaptörün iyi niyetinde değil.
 */
export const PLATFORM_TENANT_LIST_MAX_LIMIT = 50

/** Girdide `limit` verilmediğinde kullanılan sayfa boyutu. */
export const PLATFORM_TENANT_LIST_DEFAULT_LIMIT = 20

/** `platform.tenantList` girdisi — kiracı kimliği TAŞIMAZ (host'tan DEĞİL, platform seviyesi bir liste). */
export const platformTenantListInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(PLATFORM_TENANT_LIST_MAX_LIMIT)
    .default(PLATFORM_TENANT_LIST_DEFAULT_LIMIT),
})

/** {@link platformTenantListInputSchema}'nın çıkarılan tip karşılığı. */
export type PlatformTenantListInput = z.infer<typeof platformTenantListInputSchema>

/**
 * `platform.tenantList`'in öğe şekli. `status` {@link tenantStatusSchema} —
 * `tenant-summary.schema.ts`'teki YEREL sözlüğün YENİDEN kullanımı (ikinci bir
 * tele-özgü durum sözlüğü İCAT EDİLMEDİ).
 */
export const platformTenantSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: tenantStatusSchema,
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

/** {@link platformTenantSummarySchema}'nın çıkarılan tip karşılığı. */
export type PlatformTenantSummary = z.infer<typeof platformTenantSummarySchema>

/** `platform.tenantList` çıktısı — tek alan, dizi SARMALANMIŞ (sayfalama imleci YOK, architect tasarımı). */
export const platformTenantListOutputSchema = z.object({
  tenants: z.array(platformTenantSummarySchema),
})

/** {@link platformTenantListOutputSchema}'nın çıkarılan tip karşılığı. */
export type PlatformTenantListOutput = z.infer<typeof platformTenantListOutputSchema>

// ---------------------------------------------------------------------------
// `platform.auditLog`
// ---------------------------------------------------------------------------

/**
 * Platform denetim eylemi sözlüğü — `@arkesoft/db`'nin Prisma
 * `PlatformAuditAction` enum'unun YEREL, tele-özgü karşılığı (dosya başı
 * yorumu). ⚠ İKİ DEĞER DE bu sürümde TÜKETİLİR — "ölü sözlük, ölü iznin
 * kardeşidir" kuralı İHLAL EDİLMEZ.
 * ⚠⚠ DÜZELTME (`docs`, T-021 gate fazı — `solid` tur 1/tur 2 bulgusu): bu blok
 * önceden "`platform.session`'ın girişi `platform_admin_signed_in` yazar"
 * diyordu, YANLIŞTI. R-PO4 kararıyla `platform.session` HİÇBİR satır yazmaz
 * (saf okuma, `impersonation.service.ts` → `readPlatformSession`); satır
 * `platformAdminProcedure` kapısından İLK geçişte idempotent yazılır
 * (`platform-admin-read.port.adapter.ts`). `tenantList`'in `plan` okuması
 * `tenant_impersonation_started` yazar — bu yarı doğruydu.
 */
export const platformAuditActionSchema = z.enum([
  'platform_admin_signed_in',
  'tenant_impersonation_started',
])

/** {@link platformAuditActionSchema}'nın çıkarılan tip karşılığı. */
export type PlatformAuditActionWire = z.infer<typeof platformAuditActionSchema>

/** Sayfa boyutu ÜST SINIRI — `PLATFORM_TENANT_LIST_MAX_LIMIT`'in AYNI gerekçesi, farklı bütçe (R-A5). */
export const PLATFORM_AUDIT_LOG_MAX_LIMIT = 100

/** Girdide `limit` verilmediğinde kullanılan sayfa boyutu. */
export const PLATFORM_AUDIT_LOG_DEFAULT_LIMIT = 50

/** `platform.auditLog` girdisi — kiracı kimliği TAŞIMAZ (platform seviyesi bir liste). */
export const platformAuditLogInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(PLATFORM_AUDIT_LOG_MAX_LIMIT)
    .default(PLATFORM_AUDIT_LOG_DEFAULT_LIMIT),
})

/** {@link platformAuditLogInputSchema}'nın çıkarılan tip karşılığı. */
export type PlatformAuditLogInput = z.infer<typeof platformAuditLogInputSchema>

/**
 * `platform.auditLog`'un öğe şekli — dosya başı yorumunun (1)/(2) maddeleri:
 * `detail` JSON'ı ve aktör e-postası/adı BU ŞEMADA YOKTUR ve EKLENMEZ.
 */
export const platformAuditEntrySchema = z.object({
  id: z.string(),
  actorUserId: z.string(),
  action: platformAuditActionSchema,
  subject: z.string(),
  createdAt: z.iso.datetime(),
})

/** {@link platformAuditEntrySchema}'nın çıkarılan tip karşılığı. */
export type PlatformAuditEntry = z.infer<typeof platformAuditEntrySchema>

/** `platform.auditLog` çıktısı — `platformTenantListOutputSchema` ile AYNI sarmalama deseni. */
export const platformAuditLogOutputSchema = z.object({
  entries: z.array(platformAuditEntrySchema),
})

/** {@link platformAuditLogOutputSchema}'nın çıkarılan tip karşılığı. */
export type PlatformAuditLogOutput = z.infer<typeof platformAuditLogOutputSchema>
