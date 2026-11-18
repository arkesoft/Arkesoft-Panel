// @arkesoft/superadmin — Vitest yapılandırması (ROADMAP v0.0.20, T-021/S8)
//
// `environment: 'node'` (`apps/admin/vitest.config.ts`'in AYNI kararı): DOM
// YOK — bu paketin tüm birim testleri saf node'da koşar; bileşen davranışı
// (render, DOM) Playwright spec'inde ölçülür, burada DEĞİL.
//
// GÜNCELLEME (ROADMAP v0.0.20, T-021/S10): `include`'a `e2e/**/*.test.ts`
// EKLENDİ — `auth-budget.test.ts`'in (fail-closed bütçe değişmezleri)
// `pnpm test` ALTINDA KOŞMASI için (`apps/admin/vitest.config.ts`'in T-020/S5
// eklemesinin AYNI gerekçesi, R-C dersi: bu ekleme ATLANIRSA bütçe testi
// SESSİZCE koşmaz). `e2e/*.spec.ts` (Playwright) bu desenle EŞLEŞMEZ
// (`.spec.ts` ≠ `.test.ts`), ikisi KESİŞMEZ.
//
// Paket-yerel `fsModuleCachePath`: Vitest'in varsayılanı paylaşılan
// çalışma alanı köküne göre çözülüyor ve eşzamanlı paket koşumlarında
// `ENOTEMPTY` yarışına yol açıyordu (`apps/admin`'in aynı notu).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'e2e/**/*.test.ts'],
    fsModuleCachePath: 'node_modules/.vitest-cache',
  },
})
