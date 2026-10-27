// Prisma CLI yapılandırması (ROADMAP v0.0.3, T-001).
//
// Prisma CLI `.env`'i yalnızca cwd ve şema dizininde arar; kökteki `.env`'i
// bulamaz. `packages/db/.env` kopyası bilerek YARATILMAZ (sır çoğaltma riski) —
// yerine Node'un yerleşik `loadEnvFile`'ı ile kök `.env` okunur (`dotenv` paketi
// eklenmez). Ortamda zaten tanımlı değişkenler dosyadakini ezer; bu sayede CI'nin
// enjekte ettiği değerler bozulmaz.
//
// DÜZELTME (ROADMAP v0.0.12, T2-K6/1): CI runner'ında kök `.env` yok (git
// izlemiyor, ortam değişkenleri doğrudan runner'dan geliyor) — koşulsuz
// `loadEnvFile` çağrısı `ENOENT` ile fırlayıp her `prisma` komutunu CI'da
// başlamadan öldürüyordu. `existsSync` ile dosya varsa yükle, yoksa atla.
import { existsSync } from 'node:fs'

const rootEnvUrl = new URL('../../.env', import.meta.url)
if (existsSync(rootEnvUrl)) {
  process.loadEnvFile(rootEnvUrl)
}

import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // Prisma 7: bağlantı URL'si `datasource.url` ile şema dışında, burada verilir
  // (Migrate/Studio bunu kullanır). Çalışma zamanı istemcisi `@prisma/adapter-pg`
  // üzerinden kendi `pg.Pool`'unu kurar (src/client.ts, ST-3) — bu alan yalnızca
  // CLI içindir.
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    // DÜZELTME (ST-4 bulgusu, T-001): Prisma 7.10.1 bu alanı bir shell'den
    // GEÇİRMİYOR — ham dizeyi boşluktan bölüp argv[0]'ı doğrudan `spawn` ediyor
    // (`shell: false`). `&&` bir shell operatörüdür; shell olmadan `pnpm run build`
    // komutuna düz metin argüman olarak yapışıyordu ve `prisma db seed` bu yüzden
    // patlıyordu. Çözüm: burada **tek** komut — `node` + iki düz argüman
    // (`--env-file-if-exists=...`, `dist/seed.js`) — zaten boşlukla ayrılmış token'lar olduğu
    // için shell'siz `spawn` ile de doğru çalışır, `&&` zinciri yok.
    //
    // Derlenmiş kodun bayatlama riski: `build` adımı artık burada değil, çağrı
    // zincirinin bir üst katmanında garanti ediliyor — `packages/db/package.json`
    // → `"seed": "pnpm run build && prisma db seed"`. O script pnpm/sh üzerinden
    // çalıştığı için `&&` orada sorunsuz çalışır; önce derler, sonra `prisma db
    // seed`'i tetikler ve bu da (shell'siz, tek komut olarak) güncel `dist/seed.js`'i
    // çalıştırır. `migrate dev`/`migrate reset`'in otomatik seed kancası bu
    // garantiyi KAPSAMAZ (onlar `prisma.config.ts`'teki bu alanı doğrudan, pnpm
    // script'i katmanından geçmeden tetikler) — bkz. docs/development.md notu.
    //
    // DÜZELTME (ROADMAP v0.0.12, T2-K6/1): `--env-file=` dosya yoksa hata verip
    // komutu durdurur; CI'da kök `.env` olmadığı için bu hard-fail oluyordu.
    // `--env-file-if-exists=` Node'da dosya yoksa sessizce atlar, komutun geri
    // kalanı (tek komut, `&&` yok — Prisma bunu shell'siz `spawn` ediyor) aynı kalır.
    seed: 'node --env-file-if-exists=../../.env dist/seed.js',
  },
})
