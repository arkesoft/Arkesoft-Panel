// @arkesoft/api — `pnpm test:isolation` Vitest yapılandırması (ROADMAP v0.0.5,
// T-006/S7, PO V-P4)
//
// `packages/db/vitest.isolation.config.ts`'in (T-005/S4) BİREBİR İKİZİ — aynı
// env yükleme deseni (Node yerleşik `loadEnvFile`, CI'da kök `.env` yok →
// `existsSync` koruması), aynı seri koşum gerekçesi (TEK paylaşılan
// Postgres/Redis, V6/A-V14; bu paket ayrıca gerçek HTTP sunucusu açıyor). Tek
// fark `include`: yalnızca `*.isolation.test.ts` dosyalarını toplar.
//
// V4 ÇAKIŞMASI BURADA DA KESİLİR: `vitest.config.ts`'in `include: ['src/**/*.
// test.ts']` deseni `*.isolation.test.ts`'i de eşleştirirdi (`.test.ts` ile
// bitiyor) — bu yüzden `vitest.config.ts`'e KARŞILIK GELEN bir `exclude`
// eklendi (bkz. o dosyadaki düzenleme). Aynı test dosyası İKİ kez KOŞMAZ.
//
// PO V-P1 (T-006): `apps/api/src/__tests__/auth-cross-tenant.isolation.test.ts`
// (S6) S6→S7 arası `pnpm test` içinde koştu (V-P1'in beklediği geçiş durumu);
// bu dosyanın eklenmesiyle ayrılır — artık YALNIZCA `pnpm test:isolation`
// içinde koşar.

import { existsSync } from 'node:fs'

const rootEnvUrl = new URL('../../.env', import.meta.url)
if (existsSync(rootEnvUrl)) {
  process.loadEnvFile(rootEnvUrl)
}

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.isolation.test.ts'],
    globals: false,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
})
