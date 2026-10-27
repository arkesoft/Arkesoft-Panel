// `pnpm env:check` — .env dosyasını şemaya göre doğrular ve özet basar.
//
// Çalıştırma (repo kökünden):
//   node --env-file=.env packages/config/dist/check-env.js
//
// Sır içeren değerler maskelenir; terminale veya CI loguna parola düşmez.

import { EnvValidationError, infraEnvSchema, parseEnv } from './env.js'

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

function main(): number {
  try {
    const env = parseEnv(infraEnvSchema)
    const entries = Object.entries(env)
    const width = Math.max(...entries.map(([key]) => key.length))

    write('Ortam değişkenleri doğrulandı:\n')
    for (const [key, value] of entries) {
      write(`  ${key.padEnd(width)}  ${presentValue(key, value)}`)
    }
    write(`\n✓ ${String(entries.length)} değişken geçerli.`)
    return 0
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`${error.message}\n`)
      return 1
    }
    throw error
  }
}

process.exitCode = main()
