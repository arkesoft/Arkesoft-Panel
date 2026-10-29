// @arkesoft/db — rol ayrımı provisioning koşturucusu (ROADMAP v0.0.13,
// T-005/S2, PO V-P2 / architect A-E7)
//
// `pnpm --filter @arkesoft/db run db:bootstrap` → bu dosya (derlenmiş,
// `dist/bootstrap-roles.js`) `prisma db execute --file sql/bootstrap-roles.sql`
// çağırır, `DATABASE_BOOTSTRAP_URL` ile (bootstrap süper kullanıcısı).
//
// BEŞİNCİ YAZMA YOLU (PO V-P2): `run-guarded-prisma.ts`'in allowlist'i `db
// execute`'u TAŞIMAZ (o dosyanın başlığı: "`db execute` ... script yüzeyinde
// yok, eklenmedi") — bu yüzden bu koşturucu `evaluateTargetDatabase()`'i
// KENDİSİ uygular (`seed.ts`/`__tests__/helpers/test-client.ts` deseniyle
// aynı: dördüncü ve ikinci yazma yolları da bunu kendi başına yapıyor).
// `guard-policy.ts`'teki host allowlist'i (A-V21, yalnızca localhost/127.0.0.1/
// ::1) burada da KORUNUR — ayrı bir allowlist YAZILMAZ.
//
// A-E7 TASARIMLA MOOT EDİLDİ: `psql` CI runner'ında garanti değil VE `pg`/
// `pg-pool`/`@prisma/adapter-pg` import'u K-E12 lint kuralıyla YASAK — yol
// Node tabanlı, Prisma CLI'sinin kendi `db execute --file` komutu.
//
// `prisma db execute` bir `--url` BAYRAĞI TAŞIMAZ (`prisma db execute --help`
// ile doğrulandı, A-E7) — bağlantı URL'si HER ZAMAN `prisma.config.ts`'teki
// `datasource.url` (`env('DATABASE_URL')`) üzerinden okunur. Çözüm
// `run-guarded-prisma.ts`'teki AYNI desen: doğrulanmış `DATABASE_BOOTSTRAP_URL`
// çocuk sürecin `DATABASE_URL` değişkenine YALNIZCA spawn anında, bellekte
// (childEnv nesnesinde) atanır — SQL DOSYASINA YAZILMAZ, dize birleştirmeyle
// enjekte EDİLMEZ, shell'e GEÇMEZ (`shell: false`). Doğrulanan değer =
// kullanılan değer; TOCTOU penceresi yapısal olarak kapalı. Parolalar
// `sql/bootstrap-roles.sql` içinde LİTERAL (V-P3, dev-only) — bu dosya onları
// hiçbir yerde taşımaz, loglamaz, birleştirmez.
//
// CLI girdi noktası: `console.*` yasağı burada da geçerli; `process.stderr/
// stdout.write` kullanılır (pino v0.0.4'te geldi ama CLI script'leri bu
// desenle kalıyor, bkz. `run-guarded-prisma.ts`/`seed.ts`).

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readDatabaseBootstrapEnv } from './env.js'
import { evaluateTargetDatabase } from './guard-policy.js'

// DÜZELTME (prisma.config.ts/vitest.config.ts deseniyle aynı sebep): CI
// runner'ında kök `.env` yok (git izlemiyor); `existsSync` korumasız
// `loadEnvFile` CI'da `ENOENT` ile fırlar. `run-guarded-prisma.ts`'in
// BİLEREK korumasız çağrısından BİLİNÇLİ OLARAK sapılıyor — bu dosya
// `prepare-db` CI adımından (S5) tetiklenecek ve orada kök `.env` olmayacak.
const rootEnvUrl = new URL('../../../.env', import.meta.url)
if (existsSync(rootEnvUrl)) {
  process.loadEnvFile(rootEnvUrl)
}

// Bu dosya derlendiğinde `dist/bootstrap-roles.js` olarak paket kökünün İKİ
// değil ÜÇ dizin altında durur (`dist/` ekstra bir kat) — `run-guarded-prisma.ts`
// ile aynı desen. `spawnSync`'in `cwd`'si buradan türetilir; çağıran hangi
// dizinden `pnpm`'i tetiklerse tetiklesin Prisma CLI'si her zaman
// `packages/db` kökünde çalışır (ve `--file` yolu da buna göre çözülür).
const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))
const BOOTSTRAP_SQL_PATH = join(PACKAGE_ROOT, 'sql', 'bootstrap-roles.sql')

/** Hatayı Türkçe mesajla stderr'e yazar ve exit 1 ile süreci sonlandırır. */
function fail(message: string): never {
  process.stderr.write(`[bootstrap-roles] ${message}\n`)
  return process.exit(1)
}

/** `manifest` nesnesinin okunabilir bir `bin` alanı taşıdığını (unknown üzerinden) daraltır. */
function hasBinField(manifest: unknown): manifest is { readonly bin: unknown } {
  return typeof manifest === 'object' && manifest !== null && 'bin' in manifest
}

/** `bin` değerinin `{ prisma: <yol> }` biçiminde bir nesne olduğunu daraltır. */
function hasPrismaBinEntry(bin: unknown): bin is { readonly prisma: unknown } {
  return typeof bin === 'object' && bin !== null && 'prisma' in bin
}

/**
 * B yolu (yedek): `prisma` ikilisi `PATH`'te bulunamazsa `prisma` paketinin
 * KENDİ manifestindeki `bin` alanından CLI script'inin gerçek yolunu çıkarır.
 * `run-guarded-prisma.ts`'teki aynı mantık — iki dosya arasında paylaşılan
 * bir modül çıkarılmadı (bu alt görevin dosya listesi `run-guarded-prisma.ts`'i
 * İÇERMİYOR, kapsam dışına çıkmamak için küçük yardımcı burada yinelendi).
 */
function resolvePrismaCliPath(): string {
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve('prisma/package.json')
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))

  if (!hasBinField(manifest)) {
    throw new Error('prisma/package.json içinde "bin" alanı bulunamadı.')
  }

  const bin = manifest.bin
  const relativeBinPath =
    typeof bin === 'string'
      ? bin
      : hasPrismaBinEntry(bin) && typeof bin.prisma === 'string'
        ? bin.prisma
        : undefined

  if (relativeBinPath === undefined) {
    throw new Error('prisma/package.json "bin" alanı beklenen biçimde değil.')
  }

  return join(dirname(manifestPath), relativeBinPath)
}

/** `spawnSync`'in sonucunu `run-guarded-prisma.ts`'teki üç dala göre yorumlar ve süreci sonlandırır. */
function handleSpawnResult(result: SpawnSyncReturns<Buffer>): never {
  if (result.error !== undefined) {
    return fail(`Prisma CLI çalıştırılamadı: ${result.error.message}`)
  }

  if (typeof result.status === 'number') {
    return process.exit(result.status)
  }

  return fail(`Prisma CLI bir sinyalle sonlandırıldı: ${result.signal ?? 'bilinmeyen'}.`)
}

/** `error`'ın Node'un `code` alanı taşıyan hata biçimine uyduğunu (unknown üzerinden) daraltır. */
function hasErrorCode(error: Error): error is Error & { readonly code: unknown } {
  return 'code' in error
}

/** `error`'ın "komut bulunamadı" (`ENOENT`) olup olmadığını daraltır. */
function isEnoent(error: Error): boolean {
  return hasErrorCode(error) && error.code === 'ENOENT'
}

/**
 * `prisma db execute --file <BOOTSTRAP_SQL_PATH>`'i, `DATABASE_URL`'i
 * doğrulanmış `bootstrapUrl`'e GEÇİCİ OLARAK (yalnızca çocuk sürecin ortamında)
 * sabitleyerek çalıştırır. `shell: false` + `stdio: 'inherit'` açıkça yazılır.
 */
function runPrismaDbExecute(bootstrapUrl: string): never {
  const childEnv = { ...process.env, DATABASE_URL: bootstrapUrl }
  const spawnArgs = ['db', 'execute', '--file', BOOTSTRAP_SQL_PATH]
  const spawnOptions = {
    shell: false,
    stdio: 'inherit',
    cwd: PACKAGE_ROOT,
    env: childEnv,
  } as const

  const primary = spawnSync('prisma', spawnArgs, spawnOptions)

  if (primary.error !== undefined && isEnoent(primary.error)) {
    const fallback = spawnSync(
      process.execPath,
      [resolvePrismaCliPath(), ...spawnArgs],
      spawnOptions,
    )
    return handleSpawnResult(fallback)
  }

  return handleSpawnResult(primary)
}

function main(): void {
  let env: ReturnType<typeof readDatabaseBootstrapEnv>
  try {
    env = readDatabaseBootstrapEnv()
  } catch (error: unknown) {
    fail(error instanceof Error ? error.message : 'Bilinmeyen ortam doğrulama hatası.')
  }

  const targetDecision = evaluateTargetDatabase(env, process.env['ARKESOFT_CONFIRM_DESTRUCTIVE'])
  if (targetDecision.kind === 'reject') {
    fail(targetDecision.message)
  }

  runPrismaDbExecute(env.databaseUrl)
}

main()
