// @arkesoft/db — rol ayrımı GERİ ALMA koşturucusu, kademe 3 + kademe 4
// (ROADMAP v0.0.13 kademe 3 borcu + v0.0.14.1 kademe 4, T-015/ST-G,
// architect KARAR A1)
//
// `pnpm db:rollback-roles` → bu dosya (derlenmiş, `dist/rollback-roles.js`)
// `--target roles` ile `sql/rollback-roles.sql`'i çalıştırır (KADEME 3 — V0.0.13'ten
// yazılı borç, semantiği bu alt görevde DEĞİŞMEDİ).
// `pnpm db:rollback-auth-role` → AYNI dosya `--target auth-role` ile
// `sql/rollback-auth-role.sql`'i çalıştırır (KADEME 4 — v0.0.14.1'in deltasını
// tersler).
//
// TASARIM KARARI (A1-b, bağlayıcı): "ayrı dosya, ayrı script" — bu koşturucu
// TEK TypeScript dosyasıdır ama İKİ SQL dosyasını ASLA AYNI ÇAĞRIDA
// BİRLEŞTİRMEZ; hangi dosyanın koşturulacağı CLI argümanıyla (`roles` |
// `auth-role`) SEÇİLİR, DDL'ler kendi aralarında BİRLEŞTİRİLMEZ. Gerekçe:
// kademe 3 ve kademe 4 FARKLI yıkıcılık sınıflarındadır (A1-a) — tek script
// ikisini birleştirse operatör "yalnızca v0.0.14.1'in deltasını geri al"
// isterken geliştirme veritabanını KADEME 3'ÜN kill-switch'ine sokardı. Tek
// dosyada tutmanın gerekçesi SAF KOD TEKRARINI önlemektir (spawn/guard/env
// iskeleti `bootstrap-roles.ts` ile BİREBİR aynı) — SQL seçimi dışında hiçbir
// DAVRANIŞ paylaşılmaz; iki ayrı `.ts` dosyası yazmak bu iskeleti ikiye
// katlardı.
//
// EMSAL: `src/bootstrap-roles.ts` BİREBİR izlendi — aşağıdaki üç şart
// (architect, ST-G handoff'u) o dosyadan DEĞİŞMEDEN taşındı:
//   1. `DATABASE_BOOTSTRAP_URL` (okuyucu: `readDatabaseBootstrapEnv()`)
//      çocuk sürecin `DATABASE_URL`'ine YALNIZCA spawn anında, bellekte
//      (childEnv nesnesinde) atanır — SQL dosyasına yazılmaz, shell'e geçmez.
//   2. `spawnSync(..., { shell: false, ... })` — dize birleştirmeyle
//      enjeksiyon YOK.
//   3. `evaluateTargetDatabase()` (guard-policy.ts) koruması — yıkıcı bir
//      DDL'in yerel olmayan/üretim bir veritabanına karşı KAZARA
//      koşturulmasını önler. `run-guarded-prisma.ts`'in allowlist'i
//      `db execute`'u TAŞIMAZ (BEŞİNCİ yazma yolu, `bootstrap-roles.ts`'in
//      BİREBİR gerekçesi) — bu koşturucu guard'ı KENDİSİ uygular.
//
// `prisma db execute` bir `--url` BAYRAĞI TAŞIMAZ (`bootstrap-roles.ts:20-26`
// ampirik ölçümü, BURADA TEKRARLANMAZ) — bağlantı `prisma.config.ts`'in
// `datasource.url`'ü (`env('DATABASE_URL')`) üzerinden okunur.
//
// CLI girdi noktası: `console.*` yasağı burada da geçerli — `process.stderr/
// stdout.write` kullanılır (`bootstrap-roles.ts`/`run-guarded-prisma.ts`/
// `seed.ts` ile aynı desen).
//
// KÜÇÜK YARDIMCI FONKSİYONLARIN YİNELENMESİ BİLİNÇLİ: `bootstrap-roles.ts`
// ile paylaşılan bir modül ÇIKARILMADI — bu alt görevin dosya listesi o
// dosyayı İÇERMİYOR, kapsam dışına çıkmamak için `resolvePrismaCliPath`/
// `handleSpawnResult`/`isEnoent` burada KENDİ kopyası olarak yinelendi
// (`bootstrap-roles.ts`'in kendi dosya başı notunun AYNI gerekçesi).

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readDatabaseBootstrapEnv } from './env.js'
import { evaluateTargetDatabase } from './guard-policy.js'

// DÜZELTME (prisma.config.ts/vitest.config.ts/bootstrap-roles.ts deseniyle
// AYNI sebep): CI runner'ında kök `.env` yok (git izlemiyor); `existsSync`
// korumasız `loadEnvFile` CI'da `ENOENT` ile fırlar.
const rootEnvUrl = new URL('../../../.env', import.meta.url)
if (existsSync(rootEnvUrl)) {
  process.loadEnvFile(rootEnvUrl)
}

// `bootstrap-roles.ts`'teki AYNI gerekçe: derlendiğinde `dist/rollback-roles.js`
// paket kökünün İKİ değil ÜÇ dizin altında durur.
const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Kademe 3/4'ün hedef SQL dosyasını seçen CLI argümanı. */
type RollbackTarget = 'roles' | 'auth-role'

/**
 * `RollbackTarget` → `sql/*.sql` yolu. İKİ ayrı DOSYA (A1-b) — bu nesne
 * yalnızca BİR isim seçer, DDL'leri birleştirmez.
 */
const SQL_PATHS: Readonly<Record<RollbackTarget, string>> = {
  roles: join(PACKAGE_ROOT, 'sql', 'rollback-roles.sql'),
  'auth-role': join(PACKAGE_ROOT, 'sql', 'rollback-auth-role.sql'),
}

/** Hatayı Türkçe mesajla stderr'e yazar ve exit 1 ile süreci sonlandırır. */
function fail(message: string): never {
  process.stderr.write(`[rollback-roles] ${message}\n`)
  return process.exit(1)
}

/**
 * `process.argv.slice(2)`'nin ilk elemanını `RollbackTarget`'a daraltır.
 * Bilinmeyen/boş argüman → anlamlı hatayla `exit 1` (A-E7 DoD'unun aynı
 * deseni: "yoksa anlamlı hata").
 */
function resolveTarget(argv: readonly string[]): RollbackTarget {
  const [target] = argv
  if (target === 'roles' || target === 'auth-role') {
    return target
  }
  return fail(
    `İlk argüman "roles" (kademe 3, sql/rollback-roles.sql) veya "auth-role" ` +
      `(kademe 4, sql/rollback-auth-role.sql) olmalı — alınan: "${target ?? '(boş)'}".`,
  )
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
 * KENDİ manifestindeki `bin` alanından CLI script'inin gerçek yolunu çıkarır
 * (`bootstrap-roles.ts`'in BİREBİR yinelenen yardımcısı, dosya başı notu).
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

/** `spawnSync`'in sonucunu `bootstrap-roles.ts`'teki üç dala göre yorumlar ve süreci sonlandırır. */
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
 * `prisma db execute --file <sqlPath>`'i, `DATABASE_URL`'i doğrulanmış
 * `bootstrapUrl`'e GEÇİCİ OLARAK (yalnızca çocuk sürecin ortamında)
 * sabitleyerek çalıştırır. `shell: false` + `stdio: 'inherit'` açıkça yazılır
 * (`bootstrap-roles.ts`'in BİREBİR deseni).
 */
function runPrismaDbExecute(bootstrapUrl: string, sqlPath: string): never {
  const childEnv = { ...process.env, DATABASE_URL: bootstrapUrl }
  const spawnArgs = ['db', 'execute', '--file', sqlPath]
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
  const target = resolveTarget(process.argv.slice(2))

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

  runPrismaDbExecute(env.databaseUrl, SQL_PATHS[target])
}

main()
