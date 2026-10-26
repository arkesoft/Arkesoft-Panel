// @arkesoft/errors — Vitest yapılandırması (ROADMAP v0.0.4, T-002/ST-3b)
//
// Bu paket herhangi bir dış kaynağa (DB, Redis) bağlanmaz — tüm testler saf
// fonksiyon/sınıf birim testidir. packages/db'deki seri koşum kısıtının (V6/A-V14)
// burada karşılığı yok; varsayılan Vitest paralellik davranışı yeterli.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
})
