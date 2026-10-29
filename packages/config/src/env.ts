// Ortam değişkeni şemaları — ROADMAP v0.0.2
//
// Dış dünyadan gelen her veri Zod ile parse edilir (CLAUDE.md §4). Ortam
// değişkenleri de dış veridir: uygulama açılışında doğrulanır, geçersizse
// süreç başlamaz. Böylece eksik yapılandırma, çalışma anında anlaşılmaz bir
// hata yerine açılışta okunur bir mesaj üretir.
//
// ÖNEMLİ: Hata mesajlarına değişken DEĞERLERİ asla yazılmaz — yalnızca
// değişken adı ve ihlal edilen kural. Burada parola ve API anahtarları var.

import { z } from 'zod'

/** Çalışma ortamı. */
export const nodeEnvSchema = z.enum(['development', 'test', 'production'])

export type NodeEnv = z.infer<typeof nodeEnvSchema>

/** Boş olmayan metin. */
const nonEmptyString = z.string().min(1, 'boş olamaz')

// NOT: Aşağıdaki yardımcıların dönüş tipleri bilinçli olarak çıkarıma
// bırakıldı. Zod'un iç tipleri (ZodPipe/ZodDefault) `.default()` sonrası girdi
// tipini `string | undefined` yapıyor; elle yazılan annotation bunu gizleyip
// yanlış sözleşme üretiyor. Bunlar dışa açılmıyor, modül içi kalıyor.

/** `"true"` / `"false"` metnini boolean'a çevirir. */
const envBoolean = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'], { message: "yalnızca 'true' veya 'false' olabilir" })
    .default(defaultValue)
    .transform((value) => value === 'true')

/** Port numarası: metinden tamsayıya çevirir ve geçerli aralığı doğrular. */
const envPort = z.coerce
  .number({ message: 'sayı olmalı' })
  .int('tamsayı olmalı')
  .min(1, '1-65535 aralığında olmalı')
  .max(65535, '1-65535 aralığında olmalı')

/** Belirli bir şema öneki taşıyan bağlantı adresi. */
const connectionUrl = (prefixes: readonly [string, ...string[]]) =>
  nonEmptyString.refine((value) => prefixes.some((prefix) => value.startsWith(prefix)), {
    message: `şu öneklerden biriyle başlamalı: ${prefixes.join(', ')}`,
  })

/**
 * S3 bucket adı kuralları (AWS ile uyumlu, R2 ve SeaweedFS de bunu kabul eder):
 * 3-63 karakter, küçük harf/rakam/nokta/tire, harf veya rakamla başlar ve biter.
 */
const s3BucketName = z
  .string()
  .min(3, '3-63 karakter olmalı')
  .max(63, '3-63 karakter olmalı')
  .regex(
    /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/,
    'yalnızca küçük harf, rakam, nokta ve tire içerebilir; harf veya rakamla başlayıp bitmeli',
  )

/**
 * Yerel altyapının (ROADMAP v0.0.2) gerektirdiği tüm değişkenler.
 *
 * Uygulamalar bunu `.extend()` ile genişletir; örneğin `apps/api` kendi
 * oturum sırlarını ekler (v0.0.5). Ortak alanlar burada kalır.
 */
export const infraEnvSchema = z.object({
  // --- Genel ---
  NODE_ENV: nodeEnvSchema.default('development'),
  APP_BASE_DOMAIN: nonEmptyString,

  // --- PostgreSQL ---
  DATABASE_URL: connectionUrl(['postgresql://', 'postgres://']),

  // --- Redis ---
  REDIS_URL: connectionUrl(['redis://', 'rediss://']),

  // --- Meilisearch ---
  MEILI_HOST: z.url('geçerli bir URL olmalı'),
  MEILI_MASTER_KEY: z
    .string()
    .min(16, 'en az 16 karakter olmalı (Meilisearch kısa anahtarları reddeder)'),

  // --- Nesne depolama (S3 uyumlu) ---
  S3_ENDPOINT: z.url('geçerli bir URL olmalı'),
  S3_REGION: nonEmptyString,
  S3_BUCKET: s3BucketName,
  S3_ACCESS_KEY_ID: nonEmptyString,
  S3_SECRET_ACCESS_KEY: nonEmptyString,
  S3_FORCE_PATH_STYLE: envBoolean('true'),

  // --- E-posta ---
  SMTP_HOST: nonEmptyString,
  SMTP_PORT: envPort,
  SMTP_SECURE: envBoolean('false'),
  MAIL_FROM_NAME: nonEmptyString,
  MAIL_FROM_ADDRESS: z.email('geçerli bir e-posta adresi olmalı'),
})

export type InfraEnv = z.infer<typeof infraEnvSchema>

/**
 * Ayrıcalıklı veritabanı bağlantıları (ROADMAP v0.0.13, K-E8).
 *
 * BAĞLAYICI GÜVENLİK KARARI — bu şema `infraEnvSchema`'dan BİLİNÇLİ OLARAK
 * AYRI tutulur: `DATABASE_MIGRATION_URL` / `DATABASE_BOOTSTRAP_URL` gibi
 * ayrıcalıklı (migrator/süper kullanıcı) bağlantılar `infraEnvSchema`'ya
 * girerse, onu tüketen her `apps/*` süreci açılışta bu kimlik bilgisini
 * zorunlu kılar ve kendi `ApiEnv` tipinde taşır — v0.0.13'ün kapattığı
 * ayrıcalık deliğini (rol ayrımı) sessizce geri açar.
 *
 * Bu şema YALNIZCA `packages/db` tarafından tüketilir (rol provisioning'i ve
 * canlı katalog linter'ı için). `apps/*` bu şemayı import ETMEZ —
 * `apps/api/src/config/api-env.ts` `infraEnvSchema`'yı genişletir ve
 * `DATABASE_URL` üzerinden yalnızca en az yetkili `arkesoft_app` rolünü görür.
 */
export const databaseAdminEnvSchema = z.object({
  /**
   * `arkesoft_migrator` rolü — `CREATEDB` (shadow DB için), migration'ları
   * çalıştırır. Tabloların sahibi. Zorunlu: rol ayrımı olmadan hiçbir
   * migration/katalog işlemi yapılamaz.
   */
  DATABASE_MIGRATION_URL: connectionUrl(['postgresql://', 'postgres://']),

  /**
   * Bootstrap süper kullanıcısı — rol oluşturma, sahiplik devri, `GRANT` /
   * `ALTER DEFAULT PRIVILEGES` gibi küme seviyesi DDL'i çalıştırır
   * (`pnpm db:bootstrap`). Opsiyonel: yalnızca bootstrap koşusunda gerekir,
   * günlük geliştirme akışında (migrate/seed/çalışma zamanı) kullanılmaz.
   */
  DATABASE_BOOTSTRAP_URL: connectionUrl(['postgresql://', 'postgres://']).optional(),
})

export type DatabaseAdminEnv = z.infer<typeof databaseAdminEnvSchema>

/** Ortam değişkeni doğrulaması başarısız olduğunda fırlatılır. */
export class EnvValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(
      [
        'Ortam değişkenleri geçersiz:',
        ...issues.map((issue) => `  - ${issue}`),
        '',
        '`.env.example` dosyasını referans alın. Eksikse: pnpm env:init',
      ].join('\n'),
    )
    this.name = 'EnvValidationError'
    this.issues = issues
  }
}

/**
 * Verilen şemaya göre ortam değişkenlerini doğrular ve tipli nesne döner.
 *
 * Hata durumunda {@link EnvValidationError} fırlatır. Hata mesajı yalnızca
 * değişken adlarını ve ihlal edilen kuralı içerir; değerler sızdırılmaz.
 *
 * @param schema Doğrulanacak şema.
 * @param source Okunacak kaynak. Varsayılan: `process.env`.
 */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: Record<string, string | undefined> = process.env,
): z.output<TSchema> {
  const result = schema.safeParse(source)

  if (result.success) {
    return result.data
  }

  const issues = result.error.issues.map((issue) => {
    const key = issue.path.map(String).join('.')
    return key.length > 0 ? `${key}: ${issue.message}` : issue.message
  })

  throw new EnvValidationError(issues)
}
