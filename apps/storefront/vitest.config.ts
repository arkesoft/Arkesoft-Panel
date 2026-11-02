// @arkesoft/storefront — Vitest yapılandırması (ROADMAP v0.0.8, T-009/S3)
//
// `environment: 'node'` — storefront bir SUNUCUDUR (Astro SSR, Node
// adapter); DOM yok. React adası davranışı (hidrasyon) S5'in Playwright
// spec'inde ölçülür, burada DEĞİL.
//
// Paket-yerel `fsModuleCachePath` (`apps/admin/vitest.config.ts` emsali,
// borç 1442): Vitest'in varsayılanı paylaşılan çalışma alanı köküne göre
// çözülüyor ve eşzamanlı paket koşumlarında `ENOTEMPTY` yarışına yol
// açıyordu. ⚠ Alan adı `fsModuleCachePath` — `cacheDir` DEĞİL (T-008'de
// ölçülerek çürütüldü).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    fsModuleCachePath: 'node_modules/.vitest-cache',
  },
})
