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
//
// GÜNCELLEME (ROADMAP v0.0.13, T-005/S3): İKİ istemci dışa açılır.
//   - `testAppPrisma`: `DATABASE_URL` (`arkesoft_app`, RLS'e tabi), FORCE RLS
//     altında `tenant_membership`'e dokunan her test (`membership.test.ts`)
//     bunu `withTenant()` ile kullanır (`tenantContextSetting` kaydı bu
//     yüzden burada yapılır — kayıtsız istemci `withTenant`'ı fail-closed
//     reddeder, bkz. `tenant-context.ts`).
//   - `testMigrationPrisma`: `DATABASE_MIGRATION_URL` (`arkesoft_migrator`,
//     tabloların SAHİBİ). FIX turu 2 (solid Tur 2 [low] B4 bulgusu — YORUM
//     DÜZELTMESİ): bu bağlantının "RLS'e tabi DEĞİL" olduğu iddiası
//     YANLIŞTI — `FORCE ROW LEVEL SECURITY` tablo SAHİBİNİ DE RLS'e tabi
//     kılar (`security` Tur 1 ampirik ölçümü: context'siz `arkesoft_migrator`
//     → 0 satır). `withTenant` kaydının burada BİLEREK yapılmaması RLS
//     muafiyetinden değil, bu bağlantının test süitinde yalnızca ŞEMA/
//     katalog introspection'ı için kullanılmasından (tenant VERİSİNE
//     dokunmaz). v0.0.13'ün
//     canlı katalog linter'ı (S4, K-E5: "katalog okuması `DATABASE_MIGRATION_URL`
//     ile") ve AC3'ün geçici tablo probu bu bağlantıyı kullanır.
//   `packages/db/src/env.ts`'in `readDatabaseMigrationEnv()` okuyucusu TAM
//   OLARAK bu ikinci URL'i taşır (ORKESTRATÖR → S2 kapsam uzantısı, v0.0.13
//   sonrası gerileme düzeltmesi — `run-guarded-prisma.ts` da bunu kullanır).
//   FIX turu 1 (solid/qa bulgusu): bu yorum `readDatabaseMigrationEnv()`
//   EKLENMEDEN ÖNCE yazılmıştı ve güncellenmeden kalmıştı — aşağıdaki kod
//   artık `env.ts`'in desenini TEKRARLAMAK yerine o fonksiyonu ÇAĞIRIR.

import { evaluateTargetDatabase } from '../../guard-policy.js'
import { readDatabaseEnv, readDatabaseMigrationEnv } from '../../env.js'
import { createPrismaClient } from '../../client.js'
import type { PrismaDatabase } from '../../client.js'
import { TENANT_CONTEXT_SETTING } from '../../tenant-context.js'

const appEnv = readDatabaseEnv()

const appDecision = evaluateTargetDatabase(appEnv, process.env['ARKESOFT_CONFIRM_DESTRUCTIVE'])
if (appDecision.kind === 'reject') {
  throw new Error(appDecision.message)
}

/**
 * `arkesoft_app` (çalışma zamanı rolü) bağlantısı. `tenantContextSetting`
 * kaydı sayesinde `withTenant(testAppPrisma, …)` çağrılabilir.
 */
export const testAppPrisma: PrismaDatabase = createPrismaClient({
  databaseUrl: appEnv.databaseUrl,
  tenantContextSetting: TENANT_CONTEXT_SETTING,
})

/**
 * `testAppPrisma`'nın ESKİ adı — architect riski 3'ün ölçtüğü gibi
 * `tenant_membership`'e dokunmayan testler (`tenant.test.ts`, `health.test.ts`)
 * BU İSİMLE import ediyor; bu iki dosya S3'ün dosya kapsamı DIŞINDA
 * (dosya sahipliği tablosu) ve DEĞİŞTİRİLMEDİ — bu takma ad onların
 * değiştirilmeden derlenmesini/koşmasını sağlar. Yeni testler
 * `testAppPrisma`'yı kullanmalı.
 */
export const testPrisma: PrismaDatabase = testAppPrisma

const migrationEnv = readDatabaseMigrationEnv()

const migrationDecision = evaluateTargetDatabase(
  migrationEnv,
  process.env['ARKESOFT_CONFIRM_DESTRUCTIVE'],
)
if (migrationDecision.kind === 'reject') {
  throw new Error(migrationDecision.message)
}

/**
 * `arkesoft_migrator` (tabloların sahibi) bağlantısı. FIX turu 2 (solid Tur 2
 * [low] B4 bulgusu — YORUM DÜZELTMESİ): bu bağlantının "RLS'e tabi DEĞİL"
 * olduğu VE "sahip rolü zaten her satırı görür" iddiaları YANLIŞTI —
 * `FORCE ROW LEVEL SECURITY` sahip rolünü DE kapsar (`security` Tur 1
 * ampirik ölçümü: context'siz `arkesoft_migrator` → 0 satır). `withTenant`
 * kaydı burada BİLEREK YAPILMAZ — gerekçe RLS muafiyeti DEĞİL, bu
 * bağlantının test süitinde yalnızca ŞEMA/katalog introspection'ı için
 * kullanılması (tenant VERİSİNE dokunmaz, bkz.
 * `catalog-lint-live.isolation.test.ts`).
 */
export const testMigrationPrisma: PrismaDatabase = createPrismaClient({
  databaseUrl: migrationEnv.databaseUrl,
})
