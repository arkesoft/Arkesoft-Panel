// @arkesoft/db — DATABASE_URL/NODE_ENV doğrulaması, TEK nokta (ROADMAP v0.0.3,
// T-001 Gate Tur 1 düzeltmesi, architect K2)
//
// CLAUDE.md §4: dış dünyadan gelen her veri (env dahil) Zod ile parse edilir.
// Gate Tur 1'in L1 bulgusu: `DATABASE_URL` ÜÇ ayrı yerde (seed.ts,
// guard-local-database.ts, test-client.ts) Zod'suz `undefined`/`length===0`
// kontrolüyle `string`'e yükseltiliyordu; doğrulayıcı zaten `@arkesoft/config/env`
// altında vardı (`infraEnvSchema` + `parseEnv`) ama hiç kullanılmıyordu. Bu dosya
// o üç kopyayı TEK noktaya bağlar.
//
// BİLEREK `client.ts` İÇİNDE DEĞİL: `createPrismaClient` `process.env`'e hiçbir
// zaman dokunmaz, doğrulanmış bir dize alan saf bir fabrika olarak kalır —
// v0.0.4'ün NestJS `PrismaModule`'ü bağlantı URL'sini kendi `parseEnv`/
// ConfigService katmanından enjekte edecek; fabrika env okursa DI kırılır.
//
// Bu modül `src/index.ts`'ten dışa AÇILMAZ — paket içi (private) kalır.

import {
  databaseAdminEnvSchema,
  EnvValidationError,
  infraEnvSchema,
  parseEnv,
} from '@arkesoft/config/env'
import type { NodeEnv } from '@arkesoft/config/env'

/**
 * `src/guard-policy.ts`'in politika kararları ve `createPrismaClient`'a verilecek
 * bağlantı dizesi için gereken, doğrulanmış ortam alt kümesi.
 */
export type DatabaseEnv = {
  readonly databaseUrl: string
  readonly nodeEnv: NodeEnv
}

/**
 * `DATABASE_URL` ve `NODE_ENV`'i `@arkesoft/config`'in paylaşılan env şemasıyla
 * doğrular. Geçersizse `EnvValidationError` fırlatır — hata mesajı yalnızca
 * değişken adı ve ihlal edilen kuralı içerir, DEĞER asla sızdırılmaz.
 *
 * `NODE_ENV` burada şema üzerinden (`nodeEnvSchema.default('development')`)
 * geçtiği için çağıranın eline her zaman `'development' | 'test' | 'production'`
 * değerlerinden biri ulaşır — `staging` gibi yazım hataları/bilinmeyen değerler
 * BURADA (şemada) elenir; `production`'ın koşulsuz reddi ise politika katmanının
 * işidir (`guard-policy.ts`), tek bir `if (NODE_ENV === 'production')` dize
 * kontrolüyle değil.
 */
export function readDatabaseEnv(): DatabaseEnv {
  const env = parseEnv(infraEnvSchema.pick({ DATABASE_URL: true, NODE_ENV: true }))

  return {
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV,
  }
}

/**
 * `src/bootstrap-roles.ts`'in gerektirdiği, doğrulanmış ortam alt kümesi
 * (ROADMAP v0.0.13, T-005/S2, K-E8). `guard-policy.ts`'in `TargetDatabase`
 * daraltmasıyla yapısal olarak uyumlu (`databaseUrl`/`nodeEnv` alanlarını
 * taşır) — `evaluateTargetDatabase`'e doğrudan geçirilebilir.
 */
export type DatabaseBootstrapEnv = {
  readonly databaseUrl: string
  readonly nodeEnv: NodeEnv
}

/**
 * `DATABASE_BOOTSTRAP_URL` ve `NODE_ENV`'i doğrular. `databaseAdminEnvSchema`
 * bu alanı BİLİNÇLİ OLARAK opsiyonel bırakır (günlük geliştirme akışında
 * gerekmez) — burada ise `pnpm db:bootstrap`'in TEK girdisi olduğu için
 * tanımsızsa anlamlı bir hata ile `EnvValidationError` fırlatılır (A-E7/DoD 1,
 * "yoksa anlamlı hata").
 */
export function readDatabaseBootstrapEnv(): DatabaseBootstrapEnv {
  const env = parseEnv(
    infraEnvSchema
      .pick({ NODE_ENV: true })
      .extend({ DATABASE_BOOTSTRAP_URL: databaseAdminEnvSchema.shape.DATABASE_BOOTSTRAP_URL }),
  )

  if (env.DATABASE_BOOTSTRAP_URL === undefined) {
    throw new EnvValidationError([
      'DATABASE_BOOTSTRAP_URL: tanımlı olmalı — pnpm db:bootstrap bootstrap süper ' +
        'kullanıcısının bağlantı dizesini gerektirir (.env.example içindeki örneğe bakın).',
    ])
  }

  return {
    databaseUrl: env.DATABASE_BOOTSTRAP_URL,
    nodeEnv: env.NODE_ENV,
  }
}

/**
 * `src/run-guarded-prisma.ts`'in DDL/sahiplik gerektiren komutlar (`migrate
 * dev`, `migrate reset`, `db push`) için gerektirdiği, doğrulanmış ortam alt
 * kümesi (ORKESTRATÖR → S2 kapsam uzantısı, v0.0.13 sonrası gerileme
 * düzeltmesi). `DATABASE_MIGRATION_URL` `databaseAdminEnvSchema`'da ZORUNLU
 * (opsiyonel DEĞİL, `readDatabaseBootstrapEnv`'teki `DATABASE_BOOTSTRAP_URL`'in
 * aksine) — bu yüzden `undefined` kontrolü/ek hata mesajı GEREKMEZ, `parseEnv`
 * zaten eksikse `EnvValidationError` fırlatır.
 */
export type DatabaseMigrationEnv = {
  readonly databaseUrl: string
  readonly nodeEnv: NodeEnv
}

/** `DATABASE_MIGRATION_URL` ve `NODE_ENV`'i doğrular. */
export function readDatabaseMigrationEnv(): DatabaseMigrationEnv {
  const env = parseEnv(
    infraEnvSchema
      .pick({ NODE_ENV: true })
      .extend({ DATABASE_MIGRATION_URL: databaseAdminEnvSchema.shape.DATABASE_MIGRATION_URL }),
  )

  return {
    databaseUrl: env.DATABASE_MIGRATION_URL,
    nodeEnv: env.NODE_ENV,
  }
}
