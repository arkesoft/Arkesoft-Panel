// @arkesoft/db — tip pin'leri: `CreatePrismaClientOptions`'ın ADDITIVE sözleşmesi
// (ROADMAP v0.0.13, T-005/S3, architect K-E6/AC7)
//
// Bu dosya ÇALIŞMA ZAMANI testi DEĞİLDİR — `.test.ts` ile BİTMİYOR,
// `vitest.config.ts`'in `include: ['src/**/*.test.ts']` deseni bu dosyayı
// YAKALAMAZ (bilerek: pin'in TEK kanıtı derleme zamanıdır). Kanıt tamamen
// `pnpm typecheck`'in (`tsconfig.json` → `include: ["src/**/*", ...]`)
// derlemesinden gelir — bu dosyadaki herhangi bir satır DERLENMEZSE AC7
// ihlal edilmiş olur.
//
// `__tests__/` altında olduğu için S5'in AC4 mekanik grep'i (kapsam:
// `**/src/**/*.ts` eksi `__tests__/**`) bu dosyayı TARAMAZ — bu yüzden
// `TENANT_CONTEXT_SETTING` sabiti burada literal yazılmak yerine BİLEREK
// import edilir (tek kaynak ilkesi, K-E12'nin ruhunu test dosyasında da
// korumak için).

import type { CreatePrismaClientOptions } from '../../client.js'
import { TENANT_CONTEXT_SETTING } from '../../tenant-context.js'

/**
 * POZİTİF PİN 1 (AC7) — v0.0.3'ten gelen mevcut çağrı şekli (yalnızca
 * `databaseUrl`) bu sürümde DEĞİŞMEDEN derlenmelidir. `export` edilir ki
 * `@typescript-eslint/no-unused-vars` bu salt-derleme-zamanı değerlerini
 * "kullanılmamış" saymasın — dosyanın kendisi hiçbir yerden import edilmez.
 */
export const existingShape = {
  databaseUrl: 'postgresql://user:pass@localhost:5432/db',
} satisfies CreatePrismaClientOptions

/**
 * POZİTİF PİN 2 — `tenantContextSetting` ADDITIVE alanı aynı tipe EK olarak
 * kabul edilmelidir (K-E6).
 */
export const withTenantContext = {
  databaseUrl: 'postgresql://user:pass@localhost:5432/db',
  tenantContextSetting: TENANT_CONTEXT_SETTING,
} satisfies CreatePrismaClientOptions

/**
 * NEGATİF PİN — zorunlu `databaseUrl` alanı OLMADAN bu şekil
 * `CreatePrismaClientOptions`'ı KARŞILAMAMALIDIR. `@ts-expect-error` satırı
 * tip hatası GERÇEKTEN oluşmazsa (ör. `databaseUrl` yanlışlıkla opsiyonel
 * hale gelirse) `pnpm typecheck`'i KIRAR — pin'in asıl işi budur.
 */
// @ts-expect-error — "databaseUrl" eksik; CreatePrismaClientOptions'ı karşılamaz.
export const missingDatabaseUrl: CreatePrismaClientOptions = {
  tenantContextSetting: TENANT_CONTEXT_SETTING,
}
