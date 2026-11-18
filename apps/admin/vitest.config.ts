// @arkesoft/admin — Vitest yapılandırması (ROADMAP v0.0.7, T-008/S4)
//
// `environment: 'node'` BAĞLAYICI (architect): DOM YOK — bu paketin tüm
// birim testleri saf node'da koşar; bileşen davranışı (render, DOM) S5'in
// Playwright spec'inde ölçülür, burada DEĞİL.
//
// Paket-yerel `fsModuleCachePath` — S1'in deseni (ROADMAP v0.0.7, borç 1442):
// Vitest'in varsayılanı paylaşılan çalışma alanı köküne göre çözülüyor ve
// eşzamanlı paket koşumlarında `ENOTEMPTY` yarışına yol açıyordu (bkz.
// packages/errors/trpc/vitest.config.ts'teki aynı gerekçe, tekrarlanmıyor).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // DÜZELTME TURU 2 (T-008/S5, `solid` L-N5): `scripts/**` eklendi —
    // `check-bundle-budget.ts`'in artık dışa açık, saf fail-closed
    // assertion'larının (`assertDeclaredPrefixesExist`/
    // `assertEveryDynamicEntryIsAccountedFor`) birim testi burada yaşar.
    //
    // ⚠⚠ T-020/S5 EKLEMESİ (`po`'nun `R-C` bulgusu, Orkestratör doğruladı):
    // `e2e/**` EKLENDİ — eski liste `e2e/__tests__/auth-budget.test.ts`'i
    // (Playwright `*.spec.ts` DEĞİL, saf Vitest `*.test.ts`) KAPSAMIYORDU ⇒
    // `AC-4`'ün fail-closed bütçe değişmezi `pnpm test` YEŞİLKEN HİÇ
    // KOŞMAZDI (sessiz sahte yeşil). Desen `*.test.ts` İLE SINIRLI —
    // Playwright'ın `*.spec.ts` dosyaları bu `include`'a UYMAZ, ikisi
    // çakışmaz.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'e2e/**/*.test.ts'],
    fsModuleCachePath: 'node_modules/.vitest-cache',
  },
})
