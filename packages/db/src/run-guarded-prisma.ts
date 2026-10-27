// @arkesoft/db — yıkıcı Prisma komutları için TEK CLI girdi noktası
// (ROADMAP v0.0.3, T-001 Gate Tur 1 düzeltmesi, architect K1)
//
// `db:push`, `db:reset`, `db:migrate`(→`migrate dev`), `db:seed`, `db:studio`
// script'leri bu dosyayı şu desenle çağırır (K1.6, BAĞLAYICI SIRA):
//     pnpm run build && node dist/run-guarded-prisma.js <komut>
// Sarmalayıcı çağrısı zincirin SON segmentidir, arkasına hiçbir komut
// eklenmez — `pnpm` kullanıcı argümanlarını (`pnpm db:push --url=...` gibi)
// zincirin SON komutuna ekler; bu yüzden kullanıcı argümanları her zaman
// `process.argv`'de BU dosyaya ulaşır, eski tasarımdaki gibi ayrı bir ön-kontrol
// sürecini atlayıp doğrudan `prisma`ya sızamaz (Gate Tur 1 — S1).
//
// SARMALANAN KOMUTLAR — allowlist, jenerik `prisma` vekili DEĞİL (K1.2):
//   `db push`, `migrate reset` (`--force` sarmalayıcı tarafından sabit eklenir),
//   `migrate dev`, `db seed`, `studio`. Karar mantığı `./guard-policy.js`'te.
//
// HARİÇ TUTULANLAR (bilerek sarmalanmaz):
//   - `migrate deploy` — üretimde çalışmak ZORUNDA (v0.0.12 CI); `deploy`
//     script'i ayrı ve AYNEN kalır.
//   - `generate` — DB'ye bağlanmaz VE turbo `build.dependsOn:["generate"]`
//     olduğu için sarmalanması döngü üretir (sarmalayıcı `build` çıktısıdır).
//   - `verify` — salt okunur VE kendi bayraklarına ihtiyacı var
//     (`--from-config-datasource`, `--to-schema`, `--exit-code`).
//   - `db execute`, `migrate resolve`, `migrate status`, `db pull` — script
//     yüzeyinde yok, eklenmedi.
//
// Prisma'nın KENDİ AI-ajan güvenlik kapısını (ortam değişkenleri `CLAUDECODE`
// ve `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`) bu sarmalayıcı ASLA
// silmez, yeniden adlandırmaz, kendisi üretmez — `env` bloğunda
// `...process.env` ile OLDUĞU GİBİ çocuk sürece geçer. Bu kapıyı atlatmak
// AÇIKÇA YASAKTIR; allowlist'e o kapıyı kapatan hiçbir bayrak girmez.
//
// CLI girdi noktası: `console.*` yasağı bilerek burada da geçerli;
// `process.stderr.write` kullanılır (pino v0.0.4'te gelecek, R-A7).

import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readDatabaseEnv } from './env.js'
import { evaluateTargetDatabase, resolvePrismaCommand } from './guard-policy.js'

process.loadEnvFile(new URL('../../../.env', import.meta.url))

// Bu dosya derlendiğinde `dist/run-guarded-prisma.js` olarak paket kökünün İKİ
// değil ÜÇ dizin altında durur (`dist/` ekstra bir kat) — `guard-local-database.ts`
// ile aynı desen. `spawnSync`'in `cwd`'si `process.cwd()` DEĞİL, buradan türetilir
// (K1.4) — çağıran hangi dizinden `pnpm`'i tetiklerse tetiklesin Prisma CLI'si
// her zaman `packages/db` kökünde çalışır.
const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Hatayı Türkçe mesajla stderr'e yazar ve exit 1 ile süreci sonlandırır. */
function fail(message: string): never {
  process.stderr.write(`[run-guarded-prisma] ${message}\n`)
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
 * B yolu (yedek): `prisma` ikilisi `PATH`'te bulunamazsa (A yolu `ENOENT`
 * verirse) `prisma` paketinin KENDİ manifestindeki `bin` alanından CLI
 * script'inin gerçek yolunu çıkarır. `require.resolve` zaten paket çözümleme
 * kurallarını (workspace + pnpm) uyguladığı için ayrı bir arama algoritması
 * YAZILMAZ.
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

/** `spawnSync`'in sonucunu K1.4'teki üç dala göre yorumlar ve süreci sonlandırır. */
function handleSpawnResult(result: SpawnSyncReturns<Buffer>): never {
  if (result.error !== undefined) {
    return fail(`Prisma CLI çalıştırılamadı: ${result.error.message}`)
  }

  if (typeof result.status === 'number') {
    return process.exit(result.status)
  }

  // `status === null` → çocuk süreç bir sinyalle sonlandırıldı (örn. SIGINT/
  // SIGTERM). `stdio: 'inherit'` sayesinde sinyal zaten aynı terminale/süreç
  // grubuna ulaşmıştı; burada yalnızca adını bildirip sıfır dışı çıkış veriyoruz.
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
 * Doğrulanmış `spawnArgs`'ı Prisma CLI'sine `spawnSync` ile iletir.
 *
 * Spawn sözleşmesi (K1.4): `shell: false` ve `stdio: 'inherit'` AÇIKÇA
 * yazılır (varsayılan olsalar da incelemede görünür olmalı). `stdio:'inherit'`
 * çocuğu aynı TTY/süreç grubunda tutar → SIGINT/SIGTERM doğrudan ulaşır, ayrı
 * bir sinyal köprüsü gerekmez. `env`'e `DATABASE_URL` DOĞRULANMIŞ dizeye
 * SABİTLENİR — doğrulanan değer = kullanılan değer, TOCTOU penceresi yapısal
 * olarak kapanır. Diğer tüm ortam değişkenleri (`CLAUDECODE`,
 * `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` dahil) OLDUĞU GİBİ geçer.
 *
 * Prisma ikilisi — A yolu (birincil, bu repoda doğrulandı): `spawnSync('prisma', ...)`;
 * pnpm `run` script'leri `node_modules/.bin`'i `PATH`'e ekler. B yolu (yedek):
 * `prisma` `PATH`'te bulunamazsa (`ENOENT`) `resolvePrismaCliPath()` ile
 * manifestten çözülen mutlak yol `process.execPath` ile çalıştırılır.
 */
function runPrisma(spawnArgs: readonly string[], databaseUrl: string): never {
  const childEnv = { ...process.env, DATABASE_URL: databaseUrl }
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
  let env: ReturnType<typeof readDatabaseEnv>
  try {
    env = readDatabaseEnv()
  } catch (error: unknown) {
    fail(error instanceof Error ? error.message : 'Bilinmeyen ortam doğrulama hatası.')
  }

  const targetDecision = evaluateTargetDatabase(env, process.env['ARKESOFT_CONFIRM_DESTRUCTIVE'])
  if (targetDecision.kind === 'reject') {
    fail(targetDecision.message)
  }

  const commandDecision = resolvePrismaCommand(process.argv.slice(2))
  if (commandDecision.kind === 'reject') {
    fail(commandDecision.message)
  }

  runPrisma(commandDecision.spawnArgs, env.databaseUrl)
}

main()
