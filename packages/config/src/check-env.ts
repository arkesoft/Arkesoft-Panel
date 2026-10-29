// `pnpm env:check` — .env dosyasını şemaya göre doğrular ve özet basar.
//
// Çalıştırma (repo kökünden):
//   node --env-file=.env packages/config/dist/check-env.js
//
// Sır içeren değerler maskelenir; terminale veya CI loguna parola düşmez.

import { EnvValidationError, databaseAdminEnvSchema, infraEnvSchema, parseEnv } from './env.js'

/** Adı bu desenlerden birine uyan değişkenin değeri maskelenir. */
const SECRET_KEY_PATTERN = /(PASSWORD|SECRET|_KEY|TOKEN)/

/** Bağlantı adresindeki kimlik bilgisi kısmı. */
const URL_CREDENTIALS_PATTERN = /\/\/[^@/]+@/

function maskSecret(value: string): string {
  if (value.length <= 4) {
    return '****'
  }
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 12))}${value.slice(-2)}`
}

/** Değeri terminalde gösterilebilir hale getirir. */
function presentValue(key: string, value: unknown): string {
  if (typeof value !== 'string') {
    return String(value)
  }
  if (SECRET_KEY_PATTERN.test(key)) {
    return maskSecret(value)
  }
  // DATABASE_URL / REDIS_URL gibi adreslerde parola gömülü olabilir.
  return value.replace(URL_CREDENTIALS_PATTERN, '//***:***@')
}

function write(line: string): void {
  process.stdout.write(`${line}\n`)
}

/** Doğrulanmış şemayı okunabilir biçimde yazdırır. */
function printEntries(title: string, entries: readonly (readonly [string, unknown])[]): void {
  if (entries.length === 0) {
    write(`${title}\n  (tanımlı değişken yok)`)
    return
  }
  const width = Math.max(...entries.map(([key]) => key.length))
  write(`${title}\n`)
  for (const [key, value] of entries) {
    write(`  ${key.padEnd(width)}  ${presentValue(key, value)}`)
  }
}

/**
 * v0.0.13 rol ayrımına özgü eyleme dönük hata metni (PM riski #5, V-P4).
 *
 * `databaseAdminEnvSchema` eksik/geçersizse kullanıcıya YALNIZCA değişken adı
 * ve kuralı değil, hangi dosyadan hangi satırları kopyalaması gerektiğini de
 * söyler — ayrıcalık sınırının `.env`'de bir kez kırmızı vermesi bilinçli
 * (K-E8), ama sebebi anlaşılmaz olmamalı.
 */
function describeDatabaseAdminGuidance(issues: readonly string[]): string {
  return [
    'Veritabanı yönetici bağlantıları geçersiz (v0.0.13 rol ayrımı — K-E8):',
    ...issues.map((issue) => `  - ${issue}`),
    '',
    '`DATABASE_URL` artık en az yetkili çalışma zamanı rolünü (`arkesoft_app`) temsil ediyor;',
    'migration ve bootstrap için AYRI bağlantı dizeleri gerekiyor:',
    '  - `DATABASE_MIGRATION_URL` — `arkesoft_migrator` rolü (zorunlu)',
    '  - `DATABASE_BOOTSTRAP_URL` — bootstrap süper kullanıcısı (opsiyonel, yalnızca `pnpm db:bootstrap`)',
    '',
    "`.env.example`'daki bu iki satırı `.env`'inize kopyalayın",
    "(`pnpm env:init` var olan `.env`'i EZMEZ, yalnızca yoksa oluşturur).",
    'Ayrıntı: `docs/development.md`.',
  ].join('\n')
}

function main(): number {
  let exitCode = 0

  try {
    const env = parseEnv(infraEnvSchema)
    printEntries('Temel ortam değişkenleri doğrulandı:', Object.entries(env))
  } catch (error) {
    if (!(error instanceof EnvValidationError)) {
      throw error
    }
    process.stderr.write(`${error.message}\n`)
    exitCode = 1
  }

  write('')

  try {
    const adminEnv = parseEnv(databaseAdminEnvSchema)
    printEntries('Veritabanı yönetici bağlantıları doğrulandı:', Object.entries(adminEnv))
  } catch (error) {
    if (!(error instanceof EnvValidationError)) {
      throw error
    }
    process.stderr.write(`${describeDatabaseAdminGuidance(error.issues)}\n`)
    exitCode = 1
  }

  if (exitCode === 0) {
    write('\n✓ Tüm ortam değişkenleri geçerli.')
  }

  return exitCode
}

process.exitCode = main()
