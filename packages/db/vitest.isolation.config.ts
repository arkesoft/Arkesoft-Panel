// @arkesoft/db — `pnpm test:isolation` Vitest yapılandırması (ROADMAP v0.0.13,
// T-005/S4, architect K-E9)
//
// `vitest.config.ts`'in İKİZİ — aynı env yükleme deseni (Node yerleşik
// `loadEnvFile`, CI'da kök `.env` yok → `existsSync` koruması), aynı seri
// koşum gerekçesi (TEK paylaşılan Postgres, V6/A-V14). Tek fark `include`:
// yalnızca `*.isolation.test.ts` dosyalarını toplar.
//
// V4 ÇAKIŞMASI BURADA KESİLİR: `vitest.config.ts`'in `include: ['src/**/*.
// test.ts']` deseni `*.isolation.test.ts`'i de eşleştirirdi (`.test.ts` ile
// bitiyor) — bu yüzden `vitest.config.ts`'e KARŞILIK GELEN bir `exclude`
// eklendi (bkz. o dosyadaki düzenleme). Aynı test dosyası İKİ kez KOŞMAZ.

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
