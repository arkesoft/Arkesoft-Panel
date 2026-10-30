// @arkesoft/trpc — Vitest yapılandırması (ROADMAP v0.0.6, T-007/ST-3 (S4),
// architect "Test yapılandırması" bölümü)
//
// Bu paket herhangi bir dış kaynağa (DB, Redis) bağlanmaz — tüm testler
// hermetiktir (AC11): `packages/errors`'ın deseninin aynısı (bkz. o paketin
// `vitest.config.ts`'i), `packages/db`'nin seri koşum kısıtının burada
// karşılığı yok.
//
// `typecheck.enabled: true` BAĞLAYICI (AC2/AC4): `src/**/*.test-d.ts` içindeki
// `expectTypeOf` assert'leri gerçek `tsc` denetiminden GEÇMEDEN sessizce
// geçebilir — bu seçenek kapalıyken AC4 Mutasyon B bunu kanıtlar (handoff
// raporu). `ignoreSourceErrors: false` — üretim kodundaki bir tip hatası da
// koşumu KIRMIZIYA döndürür (gevşetme yok).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
      ignoreSourceErrors: false,
    },
  },
})
