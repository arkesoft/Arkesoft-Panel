// @arkesoft/api — Vitest yapılandırması (ROADMAP v0.0.4, T-002/ST-2)
//
// Vitest, Prisma CLI'nin aksine kök `.env`'i otomatik yüklemez; `packages/db`
// ile aynı desen kullanılır (Node yerleşik `loadEnvFile`, `dotenv` eklenmez).
//
// FARK — ÇAĞRI BİLEREK IMPORT'LARIN ALTINDA: `packages/db/vitest.config.ts` ve
// `packages/db/prisma.config.ts`'te `process.loadEnvFile(...)` çağrısı import
// bildiriminden ÖNCE duruyor; `solid` gate'i T-001'de bunu (kod yan etkisinin
// modül başında, import'lardan önce çalışması) düşük önem dereceli bir
// sıralama bulgusu olarak işaretledi. `packages/db` bu alt görevin kapsamı
// dışında olduğu için geriye dönük düzeltilmiyor (dosya sahipliği, T-002/ST-3);
// bu dosya ise DOĞRU deseni (import → yan etki) baştan uygular.
//
// DÜZELTME (ROADMAP v0.0.12, T2-K6/1): CI runner'ında kök `.env` yok (git
// izlemiyor, ortam değişkenleri doğrudan runner/iş akışı tarafından enjekte
// ediliyor) — koşulsuz `loadEnvFile` çağrısı `ENOENT` ile fırlatıp Vitest'in
// başlamadan çökmesine yol açıyordu. `existsSync` ile dosya varsa yükle, yoksa
// sessizce atla; ortamda zaten tanımlı değişkenler bu durumda tek kaynak olur.
import { existsSync } from 'node:fs'

import { configDefaults, defineConfig } from 'vitest/config'

const rootEnvUrl = new URL('../../.env', import.meta.url)
if (existsSync(rootEnvUrl)) {
  process.loadEnvFile(rootEnvUrl)
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // ROADMAP v0.0.5, T-006/S7 (packages/db'deki K-E9 deseninin BİREBİR
    // ikizi): `*.isolation.test.ts` BU hattın değil, `pnpm test:isolation`'ın
    // (`vitest.isolation.config.ts`) sorumluluğunda. `include` deseni
    // `.test.ts` ile bittiği için bunları da yakalardı — bu `exclude` olmadan
    // aynı test İKİ KEZ koşar (V4 çakışması, PO V-P1). `configDefaults.
    // exclude` (`node_modules`/`.git`) ÜZERİNE eklenir — `exclude`'u SIFIRDAN
    // yazmak Vitest'in varsayılan hariç tutmalarını SİLER ve `node_modules`
    // taranmaya başlar.
    exclude: [...configDefaults.exclude, '**/*.isolation.test.ts'],
    globals: false,
    // ST-6/ST-7'nin ekleyeceği entegrasyon testleri TEK paylaşılan yerel
    // Postgres/Redis'e bağlanacak (packages/db V6/A-V14 ile aynı gerekçe);
    // paralel koşum veri yarışına yol açar. Bu dosya ST-2'nin SOLE sahipliğinde
    // olduğundan (PO dosya sahipliği tablosu) ihtiyaç şimdiden karşılanıyor.
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
})
