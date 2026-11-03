// @arkesoft/api — kuyruk işi KİRACI KAPSAMI tip pinleri (ROADMAP v0.0.11,
// T-013/S6, architect K5 katman 1 ve 2)
//
// `trpc-wire-contract.pin.ts`'in (T-007/S6) AYNI idiomu: bu dosya ÇALIŞMA
// ZAMANI testi DEĞİLDİR (`.pin.ts` ile bitiyor; ne `vitest.config.ts`'in
// `include: ['src/**/*.test.ts']` ne `vitest.isolation.config.ts`'in
// `include: ['src/**/*.isolation.test.ts']` glob'u bunu yakalar) — kanıt
// tamamen `pnpm typecheck`'in derlemesinden gelir. Pin fonksiyonları hiçbir
// yerden ÇAĞRILMAZ; varlıklarının DERLENMESİ (ve `@ts-expect-error`
// satırlarının GERÇEKTEN bir hata bastırması) yeterlidir.
//
// Beş pin:
//   1. ⚠ K5 KATMAN 1 (tip düzeyi): `tenantId` TAŞIMAYAN bir payload tipiyle
//      `JobDefinition` yazmak DERLENMEZ.
//   2. ⚠ K5 KATMAN 1 (değer düzeyi): kiracısız bir ŞEMAYLA kurulmuş tanım
//      nesnesi `registerJobRunner`'a GEÇİRİLEMEZ.
//   3. `tenantId` taşıyan şema DERLENİR (pin 1/2'nin yanlış pozitif
//      olmadığının kanıtı — "her şey hata veriyor" durumunu dışlar).
//   4. ⚠ K5 KATMAN 1'in TÜKETİCİ yarısı: `registerJobRunner` tanım ile
//      handler'ın payload tipini KİLİTLER — uyuşmayan handler DERLENMEZ.
//   5. ⚠ K5 KATMAN 2: `JobContext.withTenantDb` kiracı parametresi KABUL
//      ETMEZ ("handler başka kiracıyı yazamaz, çünkü yazacak YER YOK").
//
// ⚠ `@ts-expect-error` (`@ts-ignore` DEĞİL): bastırdığı hata ORTADAN
// KALKARSA TypeScript `TS2578 Unused '@ts-expect-error' directive` ile
// KIRILIR — yani pin, koruduğu kapı kaybolduğunda SESSİZCE geçmez. Bu,
// `packages/db`'nin `auth-model-narrowing.pin.ts`'teki (T-006/S2, T-013/S2)
// negatif pin deseninin birebir aynısı.
//
// ⚠ Direktiflerin HANGİ satırda durduğu ÖLÇÜLEREK bulundu: `registerJobRunner`
// çağrılarında `P` handler'dan da çıkarıldığı için derleyici uyuşmazlığı
// TANIM argümanında raporluyor; `withTenantDb`'de ise fazla argüman
// (`TS2554`) İKİNCİ argümanın satırında raporlanıyor. Yanlış satıra konan
// direktif `TS2578` verir — yani bu yerleşim de pinin bir parçasıdır.

import { z } from 'zod'

import type { JobContext, JobDefinition, JobHandler } from '../../queue/job-definition.js'
import { jobPayloadBaseSchema } from '../../queue/job-payload.base.js'
import type { JobPayloadBase } from '../../queue/job-payload.base.js'
import { registerJobRunner } from '../../queue/job-runner.js'

// ---------------------------------------------------------------------------
// Kiracı TAŞIMAYAN şema/tip — pin 1 ve 2'nin öznesi
// ---------------------------------------------------------------------------

const tenantlessPayloadSchema = z.object({ themeId: z.string().min(1) })

type TenantlessPayload = Readonly<z.infer<typeof tenantlessPayloadSchema>>

// ---------------------------------------------------------------------------
// PİN 1 — `tenantId` taşımayan payload tipiyle iş tanımı DERLENMEZ
// ---------------------------------------------------------------------------

/**
 * ⚠ `JobDefinition<P extends JobPayloadBase>` kısıtı `TenantlessPayload`'ı
 * REDDEDER: `tenantId` alanı yok. Kısıt gevşetilirse (ör. `P extends object`)
 * bu satır `TS2578` ile KIRILIR.
 */
export type PinTenantlessJobDefinitionDoesNotCompile =
  // @ts-expect-error -- K5 katman 1: tenantId taşımayan payload tipi JobDefinition'ın kısıtını karşılamaz
  JobDefinition<TenantlessPayload>

/** Kiracısız payload tipinin `JobPayloadBase`'e ATANAMADIĞININ ikinci pini. */
export type PinTenantlessPayloadIsNotAssignable = TenantlessPayload extends JobPayloadBase
  ? ['KİRACISIZ PAYLOAD JobPayloadBase OLARAK KABUL EDİLDİ — K5 katman 1 kayboldu']
  : true

// ---------------------------------------------------------------------------
// PİN 3 — `tenantId` taşıyan şema DERLENİR (yanlış pozitif değil)
// ---------------------------------------------------------------------------

const tenantScopedPayloadSchema = jobPayloadBaseSchema.extend({ themeId: z.string().min(1) })

type TenantScopedPayload = Readonly<z.infer<typeof tenantScopedPayloadSchema>>

export type PinTenantScopedJobDefinitionCompiles = JobDefinition<TenantScopedPayload>

const tenantScopedDefinition: JobDefinition<TenantScopedPayload> = {
  name: 'test.pin-tenant-scoped',
  payloadSchema: tenantScopedPayloadSchema,
  concurrency: 1,
  attempts: 1,
}

/** Payload şemasıyla UYUŞAN handler (yan etkisi yok; pin yalnızca derlenir). */
const matchingHandler: JobHandler<TenantScopedPayload> = async (): Promise<void> => {
  await Promise.resolve()
}

/** Payload şemasının GARANTİ ETMEDİĞİ bir alanı (`planId`) bekleyen handler. */
const mismatchedHandler: JobHandler<
  Readonly<{ tenantId: string; planId: string }>
> = async (): Promise<void> => {
  await Promise.resolve()
}

export function pinRegisterJobRunnerAcceptsMatchingHandler(): void {
  registerJobRunner(tenantScopedDefinition, matchingHandler)
}

// ---------------------------------------------------------------------------
// PİN 2 — kiracısız ŞEMAYLA kurulmuş tanım kaydedilemez (değer düzeyi)
// ---------------------------------------------------------------------------

export function pinTenantlessDefinitionCannotBeRegistered(): void {
  registerJobRunner(
    {
      name: 'test.pin-tenantless',
      // @ts-expect-error -- K5 katman 1: bu şemanın ÜRETTİĞİ payload tenantId taşımıyor
      payloadSchema: tenantlessPayloadSchema,
      concurrency: 1,
      attempts: 1,
    },
    matchingHandler,
  )
}

// ---------------------------------------------------------------------------
// PİN 4 — tanım ↔ handler payload tipi KİLİTLİ (K5 katman 1, tüketici yarısı)
// ---------------------------------------------------------------------------

export function pinRegisterJobRunnerRejectsMismatchedHandler(): void {
  registerJobRunner(
    // @ts-expect-error -- handler'ın beklediği payload (planId) iş tanımının şemasının ÜRETTİĞİ payload değil
    tenantScopedDefinition,
    mismatchedHandler,
  )
}

// ---------------------------------------------------------------------------
// PİN 5 — `withTenantDb` kiracı parametresi KABUL ETMEZ (K5 katman 2)
// ---------------------------------------------------------------------------

/**
 * Handler'ın elindeki tek veritabanı yolu `ctx.withTenantDb(cb)`'dir. Buraya
 * bir kiracı kimliği GEÇİRİLEMEZ — geçirilebilseydi handler "hangi kiracı
 * adına yazıyorum" sorusunun cevabını KENDİSİ seçebilirdi.
 */
export async function pinWithTenantDbRejectsTenantArgument(ctx: JobContext): Promise<void> {
  await ctx.withTenantDb(
    'tnt_baska_kiraci',
    // @ts-expect-error -- withTenantDb'nin TEK parametresi callback'tir; fazla argüman TS2554 veriyor
    () => Promise.resolve(undefined),
  )
}
