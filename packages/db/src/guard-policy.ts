// @arkesoft/db — yıkıcı Prisma komutları için SAF karar motoru (ROADMAP v0.0.3,
// T-001 Gate Tur 1 düzeltmesi, architect K1)
//
// Bu dosya BİLEREK `process`'e, `exit`'e veya herhangi bir I/O'ya DOKUNMAZ —
// yalnızca girdi alır, karar döndürür. Çağıran (`src/run-guarded-prisma.ts`,
// `src/seed.ts`, `src/__tests__/helpers/test-client.ts`) kararı yorumlayıp
// süreç sonlandırma/hata fırlatma işini kendisi yapar. Bu ayrım `__tests__/
// guard-policy.test.ts`'in DB'ye bağlanmadan, saf birim testi olarak koşmasını
// sağlar.
//
// `src/index.ts`'ten dışa AÇILMAZ — paket içi kalır.
//
// Gate Tur 1 bulguları (S1/S2/S5) burada kapatılıyor:
//   - S1: eski `guard-local-database.ts` bir ÖN-KONTROLDÜ — ayrı bir süreçti,
//     kullanıcının `pnpm db:push --url=... --force-reset` gibi EK bayrakları
//     guard'ı değil doğrudan `prisma`'yı görüyordu (pnpm kullanıcı argümanlarını
//     zincirin SON komutuna ekler). Çözüm: guard artık SARMALAYICI —
//     `resolvePrismaCommand` yalnızca beş sabit komut dizisini ve komut başına
//     allowlist'lenmiş bayrakları kabul eder, Prisma'yı KENDİSİ spawn eder
//     (`run-guarded-prisma.ts`). Jenerik `prisma` vekili DEĞİLDİR.
//   - S2: host allowlist'inden `postgres` ÇIKARILDI (hiçbir yerde bu adla
//     bağlanılmıyor; k8s/compose'da üretim Postgres'inin en yaygın adı).
//     `NODE_ENV` artık varsayılan-REDDET: izinli küme yalnızca
//     `'development' | 'test'`; `production` KOŞULSUZ reddedilir, kaçış kapısı
//     bunu AŞMAZ. (`staging` gibi bilinmeyen değerler zaten `env.ts`teki Zod
//     şemasında düşer — buraya hiç ulaşmaz.)
//   - S5: bu politika artık `run-guarded-prisma.ts` ÜZERİNDEN `migrate dev` ve
//     `db seed`'e de uygulanıyor (yalnızca `db push`/`migrate reset` değil).

import type { DatabaseEnv } from './env.js'

/** `evaluateTargetDatabase`'in kararı. `reject` dalı SÜREÇ SONLANDIRMAZ. */
export type TargetDecision =
  { readonly kind: 'allow' } | { readonly kind: 'reject'; readonly message: string }

/** `resolvePrismaCommand`'in kararı. `allow` dalı spawn edilecek argüman dizisini taşır. */
export type CommandDecision =
  | { readonly kind: 'allow'; readonly spawnArgs: readonly string[] }
  | { readonly kind: 'reject'; readonly message: string }

/**
 * `db:push`/`db:reset`/`db:seed`/`migrate dev`/`studio`'nun kısıtlamasız
 * çalışmasına izin verilen host adları (normalizasyondan SONRA karşılaştırılır).
 * `postgres` BİLEREK burada DEĞİL — bkz. dosya başlığı S2.
 */
const ALLOWED_LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1'])

/**
 * `URL#hostname`'i küçük harfe çevirir ve IPv6 köşeli parantezlerini soyar.
 * Böylece `LOCALHOST` yanlışlıkla reddedilmez ve `[::1]` (Node'un IPv6
 * literalleri için ürettiği biçim) allowlist'teki `::1` ile eşleşir. Küme
 * üyeliği TAM EŞLEŞME olduğu için `LOCALHOST.attacker.com` hâlâ reddedilir —
 * normalizasyon sahtekarlık (spoofing) kapısı AÇMAZ.
 */
function normalizeHostname(hostname: string): string {
  const lowered = hostname.toLowerCase()
  const hasBrackets = lowered.startsWith('[') && lowered.endsWith(']')
  return hasBrackets ? lowered.slice(1, -1) : lowered
}

/**
 * `URL#pathname` öndeki `/` ile gelir (`/arkesoft` → `arkesoft`); sorgu dizesi
 * (`?schema=public`) `URL` tarafından zaten ayrıştırıldığı için burada görünmez.
 */
function extractDatabaseName(url: URL): string {
  return url.pathname.replace(/^\//, '')
}

/**
 * Hedef veritabanının yıkıcı bir komuta izin verip vermeyeceğine karar verir.
 * Sıra BAĞLAYICIDIR:
 *   1. `DATABASE_URL` ayrıştırılamıyorsa reddedilir (fail-closed).
 *   2. `NODE_ENV === 'production'` KOŞULSUZ reddedilir — `confirmation` bu
 *      kontrolü ASLA aşmaz.
 *   3. Veritabanı adı boşsa DOĞRUDAN reddedilir — hedefi kanıtlayamadığımız
 *      bir veritabanına yıkıcı iş yapılmaz (kaçış kapısının boş dizeyle
 *      eşleşmesini de böylece önler: `confirmation === ''` hiçbir zaman bu
 *      noktaya ulaşmadan elenir).
 *   4. Host normalize edilmiş allowlist'te ise izin verilir.
 *   5. Kaçış kapısı: `confirmation` TANIMLI, BOŞ OLMAYAN ve veritabanı adına
 *      BİREBİR eşit ise izin verilir (bayrağa değil ADA eşitlik — kabuk
 *      profiline körlemesine yazılmış bir değerin her komutu onaylamasını
 *      engeller).
 *   6. Aksi halde reddedilir. Mesaj YALNIZCA host + veritabanı adı içerir;
 *      `DATABASE_URL`'in tamamı veya parola ASLA yazılmaz.
 */
export function evaluateTargetDatabase(
  env: DatabaseEnv,
  confirmation: string | undefined,
): TargetDecision {
  let url: URL
  try {
    url = new URL(env.databaseUrl)
  } catch {
    return { kind: 'reject', message: 'DATABASE_URL geçerli bir bağlantı adresi değil.' }
  }

  const hostname = normalizeHostname(url.hostname)
  const databaseName = extractDatabaseName(url)

  if (env.nodeEnv === 'production') {
    return {
      kind: 'reject',
      message: `Üretim ortamında (NODE_ENV=production) çalıştırılamaz. Host: "${hostname}", veritabanı: "${databaseName}".`,
    }
  }

  if (databaseName.length === 0) {
    return {
      kind: 'reject',
      message: `Veritabanı adı boş; hedef kanıtlanamıyor. Host: "${hostname}".`,
    }
  }

  if (ALLOWED_LOCAL_HOSTNAMES.has(hostname)) {
    return { kind: 'allow' }
  }

  if (confirmation !== undefined && confirmation.length > 0 && confirmation === databaseName) {
    return { kind: 'allow' }
  }

  return {
    kind: 'reject',
    message:
      `Yerel olmayan bir veritabanına (host: "${hostname}", veritabanı: "${databaseName}") karşı ` +
      `çalıştırılamaz. Kasıtlıysa ARKESOFT_CONFIRM_DESTRUCTIVE="${databaseName}" ile tekrar deneyin.`,
  }
}

/** Değer alan bayrağın tanımı: adı + değer doğrulayıcısı. */
type ValueFlagSpec = {
  readonly kind: 'value'
  readonly name: string
  readonly validate: (value: string) => boolean
}

/** Değer almayan (boolean) bayrağın tanımı. */
type BooleanFlagSpec = {
  readonly kind: 'boolean'
  readonly name: string
}

type FlagSpec = ValueFlagSpec | BooleanFlagSpec

/** Sarmalanan bir komutun tanımı: eşleşecek token'lar + spawn'a verilecek sabit argümanlar + izinli ek bayraklar. */
type CommandSpec = {
  readonly tokens: readonly string[]
  readonly spawnArgs: readonly string[]
  readonly allowedFlags: readonly FlagSpec[]
}

const MIGRATION_NAME_PATTERN = /^[a-z0-9_]{1,64}$/
const PORT_PATTERN = /^\d{1,5}$/

function isValidMigrationName(value: string): boolean {
  return MIGRATION_NAME_PATTERN.test(value)
}

function isValidPort(value: string): boolean {
  if (!PORT_PATTERN.test(value)) {
    return false
  }
  const port = Number.parseInt(value, 10)
  return port >= 1 && port <= 65535
}

// K1.3 DOĞRULAMA ŞARTI yerine getirildi: `--skip-seed`, `--skip-generate` ve
// `--create-only`/`--port` Prisma 7.10.1'de GERÇEKTEN var mı diye
// `prisma migrate dev --help` / `prisma migrate reset --help` /
// `prisma studio --help` ile (ve ayrıca fiilen çalıştırarak) teyit edildi:
//   - `migrate dev --help`  → `--config`, `--schema`, `--url`, `-n/--name`,
//     `--create-only`. `--skip-seed`/`--skip-generate` YOK — fiilen çalıştırınca
//     "unknown or unexpected option: --skip-seed/--skip-generate" hatası verdi.
//   - `migrate reset --help` → `--config`, `--schema`, `-f/--force`.
//     `--skip-seed`/`--skip-generate` YOK (aynı hata).
//   - `studio --help` → `-p/--port`, `-b/--browser`, `--config`, `--url` — `--port` VAR.
// Sonuç: `--skip-seed`/`--skip-generate` allowlist'e UYDURULMADI, listeden
// ÇIKARILDI (raporlandı). `migrate reset` bu nedenle kullanıcıya hiçbir ek
// bayrak tanımıyor (`--force` sarmalayıcı tarafından sabit eklenir, kullanıcı
// VEREMEZ — allowlist'te olmadığı için kullanıcı girdisinde görülürse reddedilir).
const COMMANDS: readonly CommandSpec[] = [
  { tokens: ['db', 'push'], spawnArgs: ['db', 'push'], allowedFlags: [] },
  {
    tokens: ['migrate', 'reset'],
    spawnArgs: ['migrate', 'reset', '--force'],
    allowedFlags: [],
  },
  {
    tokens: ['migrate', 'dev'],
    spawnArgs: ['migrate', 'dev'],
    allowedFlags: [
      { kind: 'value', name: '--name', validate: isValidMigrationName },
      { kind: 'boolean', name: '--create-only' },
    ],
  },
  { tokens: ['db', 'seed'], spawnArgs: ['db', 'seed'], allowedFlags: [] },
  {
    tokens: ['studio'],
    spawnArgs: ['studio'],
    allowedFlags: [{ kind: 'value', name: '--port', validate: isValidPort }],
  },
]

function matchCommand(argv: readonly string[]): CommandSpec | undefined {
  return COMMANDS.find(
    (spec) =>
      argv.length >= spec.tokens.length &&
      spec.tokens.every((token, index) => argv[index] === token),
  )
}

/**
 * Komut sözlüğünün eşleştirdiği kalan token'ları (`db push` sonrası gelen her
 * şey) o komutun allowlist'lenmiş bayraklarına göre ayrıştırır. Kurallar
 * (K1.3, BAĞLAYICI):
 *   1. TAM DİZE eşleşmesi — `startsWith`/prefix/regex-ile-bayrak-tanıma YASAK.
 *   2. Değer alan bayraklarda hem `--ad=değer` hem `--ad değer`; ikincisinde
 *      sonraki token `-` ile başlıyorsa REDDEDİLİR (bayrak kaçırma).
 *   3. Değer, bayrağın kendi doğrulayıcısından geçmek ZORUNDADIR.
 *   4. Diğer her şey (bilinmeyen bayrak, çıplak pozisyonel, `--`, boş dize,
 *      bilinmeyen `=` anahtarı, aynı bayrağın tekrarı) REDDEDİLİR.
 *   5. Ret mesajı YALNIZCA bayrağın ADINI içerir — değerini ASLA.
 */
function resolveExtraArgs(
  extra: readonly string[],
  allowedFlags: readonly FlagSpec[],
):
  | { readonly kind: 'allow'; readonly args: readonly string[] }
  | { readonly kind: 'reject'; readonly message: string } {
  const seenFlagNames = new Set<string>()
  const resolvedArgs: string[] = []
  let index = 0

  while (index < extra.length) {
    const token = extra[index]

    if (token === undefined || token.length === 0 || !token.startsWith('--')) {
      return { kind: 'reject', message: `İzin verilmeyen argüman: "${token ?? ''}".` }
    }

    const equalsIndex = token.indexOf('=')
    const flagName = equalsIndex === -1 ? token : token.slice(0, equalsIndex)
    const inlineValue = equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1)

    const flagSpec = allowedFlags.find((candidate) => candidate.name === flagName)
    if (flagSpec === undefined) {
      return { kind: 'reject', message: `İzin verilmeyen argüman: "${flagName}".` }
    }
    if (seenFlagNames.has(flagSpec.name)) {
      return { kind: 'reject', message: `İzin verilmeyen argüman: "${flagSpec.name}" (tekrar).` }
    }
    seenFlagNames.add(flagSpec.name)

    if (flagSpec.kind === 'boolean') {
      if (inlineValue !== undefined) {
        return { kind: 'reject', message: `İzin verilmeyen argüman: "${flagName}".` }
      }
      resolvedArgs.push(flagSpec.name)
      index += 1
      continue
    }

    if (inlineValue !== undefined) {
      if (!flagSpec.validate(inlineValue)) {
        return { kind: 'reject', message: `İzin verilmeyen argüman: "${flagSpec.name}".` }
      }
      resolvedArgs.push(`${flagSpec.name}=${inlineValue}`)
      index += 1
      continue
    }

    const value = extra[index + 1]
    if (value === undefined || value.startsWith('-')) {
      return { kind: 'reject', message: `İzin verilmeyen argüman: "${flagSpec.name}".` }
    }
    if (!flagSpec.validate(value)) {
      return { kind: 'reject', message: `İzin verilmeyen argüman: "${flagSpec.name}".` }
    }
    resolvedArgs.push(flagSpec.name, value)
    index += 2
  }

  return { kind: 'allow', args: resolvedArgs }
}

/**
 * Kullanıcıdan gelen CLI argümanlarını (`process.argv.slice(2)`) beş sabit
 * komuttan birine ve o komutun allowlist'lenmiş bayraklarına göre çözer.
 * `migrate deploy`, `db execute`, `migrate resolve`, `migrate status`,
 * `db pull`, boş argv, bilinmeyen komut → reddedilir (gerekçeler dosya
 * başlığında ve `run-guarded-prisma.ts`'te).
 */
export function resolvePrismaCommand(argv: readonly string[]): CommandDecision {
  const spec = matchCommand(argv)
  if (spec === undefined) {
    const attempted = argv.length > 0 ? argv.join(' ') : '(boş)'
    return { kind: 'reject', message: `İzin verilmeyen komut: "${attempted}".` }
  }

  const extra = argv.slice(spec.tokens.length)
  const parsed = resolveExtraArgs(extra, spec.allowedFlags)
  if (parsed.kind === 'reject') {
    return parsed
  }

  return { kind: 'allow', spawnArgs: [...spec.spawnArgs, ...parsed.args] }
}
