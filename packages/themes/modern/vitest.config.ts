// @arkesoft/themes-modern — Vitest yapılandırması (ROADMAP v0.0.10, T-012/S5)
//
// `@arkesoft/theme-sdk/vitest.config.ts` emsali: bu paket DB/Redis'e
// bağlanmaz, tek test saf bir manifest doğrulama birim testidir.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    fsModuleCachePath: 'node_modules/.vitest-cache',
  },
})
