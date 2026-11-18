// @arkesoft/api — `pnpm test:isolation` Vitest yapılandırması (ROADMAP v0.0.5,
// T-006/S7, PO V-P4)
//
// `packages/db/vitest.isolation.config.ts`'in (T-005/S4) BİREBİR İKİZİ — aynı
// env yükleme deseni (Node yerleşik `loadEnvFile`, CI'da kök `.env` yok →
// `existsSync` koruması), aynı seri koşum gerekçesi (TEK paylaşılan
// Postgres/Redis, V6/A-V14; bu paket ayrıca gerçek HTTP sunucusu açıyor). Tek
// fark `include`: yalnızca `*.isolation.test.ts` dosyalarını toplar.
//
// V4 ÇAKIŞMASI BURADA DA KESİLİR: `vitest.config.ts`'in `include: ['src/**/*.
// test.ts']` deseni `*.isolation.test.ts`'i de eşleştirirdi (`.test.ts` ile
// bitiyor) — bu yüzden `vitest.config.ts`'e KARŞILIK GELEN bir `exclude`
// eklendi (bkz. o dosyadaki düzenleme). Aynı test dosyası İKİ kez KOŞMAZ.
//
// PO V-P1 (T-006): `apps/api/src/__tests__/auth-cross-tenant.isolation.test.ts`
// (S6) S6→S7 arası `pnpm test` içinde koştu (V-P1'in beklediği geçiş durumu);
// bu dosyanın eklenmesiyle ayrılır — artık YALNIZCA `pnpm test:isolation`
// içinde koşar.

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
    // medium) — `packages/errors/vitest.config.ts`'teki T-008/borç 1442
    // AÇIKLAMASIYLA AYNI kök neden, bu dosyada hiç KAPATILMAMIŞTI: Vitest'in
    // `fsModuleCachePath` VARSAYILANI paketin KENDİ dizinine göre değil,
    // otomatik algılanan MONOREPO ÇALIŞMA ALANI KÖKÜNE göre çözülüyor
    // (ÖLÇÜLDÜ, kaynak: `vitest/dist/chunks/cli-api.*.js`: `this.rootCache =
    // vitest.config.fsModuleCachePath || join(searchForWorkspaceRoot(...),
    // "node_modules", ".vitest-cache")`). `vitest.config.ts` (`pnpm test`)
    // bu paylaşımı T-008'de paket-yerel bir `fsModuleCachePath` vererek
    // KAPATTI — ama bu dosya (`pnpm test:isolation`) o düzeltmeyi hiç
    // ALMADI, yani KÖK `node_modules/.vitest-cache`'i HÂLÂ `packages/db`'nin
    // AYNI adlı isolation config'iyle PAYLAŞIYORDU. `turbo.json`'daki
    // `test:isolation` görevi `test:e2e`'nin aksine `--concurrency=1`
    // TAŞIMIYOR ve `@arkesoft/api#test:isolation` ile `@arkesoft/db#
    // test:isolation` arasında bağımlılık kenarı YOK — turbo bu ikisini
    // VARSAYILAN olarak PARALEL çalıştırıyor; iki Vitest süreci AYNI
    // paylaşılan dizini EŞZAMANLI silip/oluşturunca `qa`'nın ölçtüğü
    // `ENOTEMPTY: directory not empty, rmdir '…/node_modules/.vitest-cache'`
    // doğuyor (ÖLÇÜLDÜ: ikinci koşum AYNI komutla yeşil — klasik dosya
    // sistemi yarışı imzası). Çözüm: `vitest.config.ts`'teki AYNI deseni
    // uygula — paket-yerel yol, paylaşılan dizin tamamen ortadan kalkar.
    fsModuleCachePath: 'node_modules/.vitest-cache',
  },
})
