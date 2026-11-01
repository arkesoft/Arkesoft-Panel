// @arkesoft/ui — Vitest yapılandırması (ROADMAP v0.0.7, T-008/S2)
//
// `environment: 'node'` BAĞLAYICI (architect, apps/admin K5 emsali): DOM
// YOK — bu paketin tüm testleri saf node'da koşar; bileşen davranışı
// (render, DOM) Playwright'ta (apps/admin/e2e) ölçülür, burada DEĞİL.
//
// Paket-yerel `fsModuleCachePath` — S1'in deseni (ROADMAP v0.0.7, borç 1442):
// Vitest'in varsayılanı paylaşılan çalışma alanı köküne göre çözülüyor ve
// eşzamanlı paket koşumlarında `ENOTEMPTY` yarışına yol açıyordu (bkz.
// packages/errors/vitest.config.ts'teki aynı gerekçe, tekrarlanmıyor).
// `cacheDir` DEĞİL — o alan Vite'ın bağımlılık ön-paketleme önbelleğidir,
// bu paylaşımla ilgisi yok (S1 ÖLÇTÜ ve çürüttü).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    fsModuleCachePath: 'node_modules/.vitest-cache',
  },
})
