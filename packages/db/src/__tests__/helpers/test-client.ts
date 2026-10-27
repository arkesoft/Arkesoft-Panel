// @arkesoft/db — paylaşılan entegrasyon test istemcisi (ROADMAP v0.0.3, T-001/ST-4)
//
// Testler SERİ koşuyor ve TEK Postgres'i paylaşıyor (V6/A-V14, `vitest.config.ts`)
// → tek bir Prisma istemcisi burada modül seviyesinde kurulup tüm test
// dosyalarınca import edilir. Bu, `createPrismaClient`'ın kendisinin singleton
// OLMAMASI kararıyla (src/client.ts, ST-3) çatışmaz: üretim fabrikası tekil
// kalır, bu dosya yalnızca TEST YARDIMCISIDIR ve pakette dışa açılmaz.
//
// DÖRDÜNCÜ YAZMA YOLU (Gate Tur 1, S5/K2.3): test süiti satır yazıp siliyor —
// `run-guarded-prisma.ts`/`seed.ts` ile aynı guard politikası burada da
// uygulanır, yoksa staging/üretim `DATABASE_URL`'i tanımlı bir kabukta
// `pnpm --filter @arkesoft/db test` demo verisini okuyup yazabilir. `readDatabaseEnv()`
// bilerek try/catch İÇİNDE DEĞİL — geçersiz env zaten `EnvValidationError` ile
// (test dosyası modülü hiç yüklenmeden) net bir hata üretir.

import { evaluateTargetDatabase } from '../../guard-policy.js'
import { readDatabaseEnv } from '../../env.js'
import { createPrismaClient } from '../../client.js'
import type { PrismaDatabase } from '../../client.js'

const env = readDatabaseEnv()

const decision = evaluateTargetDatabase(env, process.env['ARKESOFT_CONFIRM_DESTRUCTIVE'])
if (decision.kind === 'reject') {
  throw new Error(decision.message)
}

/** Tüm `@arkesoft/db` entegrasyon testlerinin paylaştığı tek Prisma istemcisi. */
export const testPrisma: PrismaDatabase = createPrismaClient({
  databaseUrl: env.databaseUrl,
})
