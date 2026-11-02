// @arkesoft/theme-sdk — Vitest yapılandırması (ROADMAP v0.0.9, T-010/S1)
//
// Bu paket herhangi bir dış kaynağa (DB, Redis) bağlanmaz — tüm testler saf
// fonksiyon/sabit birim testidir (manifest/ayar/migration doğrulaması).
// packages/db'deki seri koşum kısıtının (V6/A-V14) burada karşılığı yok;
// varsayılan Vitest paralellik davranışı yeterli.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    // ROADMAP v0.0.7 (T-008/S1, borç 1442) emsali — paket-yerel
    // `fsModuleCachePath`. Doğru alan adı budur, `cacheDir` DEĞİL
    // (bkz. packages/tenancy/vitest.config.ts, packages/errors/vitest.config.ts).
    fsModuleCachePath: 'node_modules/.vitest-cache',
  },
})
