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
    // DÜZELTME (ROADMAP v0.0.20.3, T-024 fix turu 2, `qa` tur1 ÖLÇTÜ, D3 —
    // medium) — ayrıntılı gerekçe: `apps/api/vitest.isolation.config.ts`'in
    // BİREBİR İKİZİ (dosya başı yorumun kuralı burada da geçerli). Özet: bu
    // dosya `fsModuleCachePath`'i hiç vermiyordu, Vitest VARSAYILANI ise
    // monorepo ÇALIŞMA ALANI KÖKÜNDEKİ `node_modules/.vitest-cache`'e
    // çözülüyor (ÖLÇÜLDÜ, `vitest/dist/chunks/cli-api.*.js`); bu dosya
    // `apps/api`'nin AYNI isimdeki config'iyle AYNI dizini PAYLAŞIYORDU.
    // `turbo.json`'daki `test:isolation` görevi `@arkesoft/api#test:
    // isolation` ile `@arkesoft/db#test:isolation` arasına bağımlılık kenarı
    // koymuyor ve `--concurrency=1` taşımıyor — turbo ikisini VARSAYILAN
    // PARALEL çalıştırır; ikisi AYNI paylaşılan dizini eşzamanlı silip/
    // oluşturunca `qa`'nın ölçtüğü `ENOTEMPTY` doğar. `vitest.config.ts`
    // (`pnpm test`) bu SINIFI T-008/borç 1442'de paket-yerel yol vererek
    // KAPATTI; bu dosya o düzeltmeyi hiç ALMAMIŞTI. Aynı deseni uygula.
    fsModuleCachePath: 'node_modules/.vitest-cache',
  },
})
