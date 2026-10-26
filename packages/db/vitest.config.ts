// @arkesoft/db — Vitest yapılandırması (ROADMAP v0.0.3, T-001/ST-4)
//
// Testler TEK paylaşılan yerel Postgres'e bağlanıyor (V6/A-V14); ayrı bir test
// veritabanı izolasyonu bu sürümde zorunlu değil. Bu yüzden `fileParallelism`
// ve `sequence.concurrent` BİLİNÇLİ OLARAK kapalı — paralel koşum, aynı demo
// tenant/kullanıcı satırlarını okuyan/yazan dosyalar arasında veri yarışına yol
// açar.
//
// Prisma CLI'nin aksine Vitest kök `.env`'i otomatik yüklemez; `prisma.config.ts`
// ile aynı desen kullanılır (Node yerleşik `loadEnvFile`, `dotenv` eklenmez).
process.loadEnvFile(new URL('../../.env', import.meta.url))

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
})
