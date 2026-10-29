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
//
// FIX turu 1 (T-005 qa/security Tur 1, KRİTİK): `migrate deploy` artık BURADAKİ
// allowlist'e de GİRER (aşağıdaki `COMMANDS`) — K-E8'den sonra `DATABASE_URL`
// en az yetkili `arkesoft_app` rolünü taşıdığı için `deploy`'un DA doğru role
// (`arkesoft_migrator`) yönlenmesi gerekir. AMA `deploy` yıkıcı bir komut
// DEĞİLDİR (ileri yönlü, idempotent) ve ÜRETİMDE/CI'da çalışmak ZORUNDADIR —
// bu dosyadaki `evaluateTargetDatabase`'in koşulsuz `NODE_ENV=production`
// reddi ve localhost-allowlist'i ona UYGULANMAZ.
//
// FIX turu 2 (B2, solid Tur 2 [medium] M1 — BAĞIMSIZ olarak `qa` da aynı
// boşluğu bulmuştu): `['migrate','deploy']` jeton çifti eskiden ÜÇ ayrı
// yerde tanımlıydı — BURADAKİ `COMMANDS` allowlist'i (kanonik kaynak) +
// `run-guarded-prisma.ts`'teki `resolveDatabaseRole` (rol çözümlemesi) +
// `run-guarded-prisma.ts`'teki `requiresDestructiveTargetGuard` (koruma
// muafiyeti). Yedinci bir komut eklemek BİR sebep, ÜÇ dosya noktası
// gerektiriyordu — DRY/tek-doğruluk-kaynağı İHLALİ. Artık `CommandSpec`
// (aşağıda) `role`/`requiresTargetGuard` alanlarını TAŞIR; `resolvePrismaCommand`
// bu kararı `CommandDecision.allow`'un İÇİNDE döner — `run-guarded-prisma.ts`
// bu alanları OKUR, kendi başına İKİNCİ bir eşleme TANIMLAMAZ.
// `resolveDatabaseRole`/`requiresDestructiveTargetGuard` TAMAMEN SİLİNDİ.
// Bu dosyanın rolü artık yalnızca "hangi argümanlar/bayraklar izinli" DEĞİL,
// "hangi komut hangi role gider, hangi komut üretim/host korumasından muaf"
// sorularını da yanıtlar — ikisi de AYNI `COMMANDS` tanımının içinde, tek
// satırda yaşar.

import type { NodeEnv } from '@arkesoft/config/env'

/**
 * `evaluateTargetDatabase`'in gerektirdiği, YAPISAL ALT KÜME tip (architect
 * riski 9, ROADMAP v0.0.13/T-005 S2). `./env.js`'teki `DatabaseEnv`'i
 * DOĞRUDAN kullanmaz — bilinçli daraltma: `databaseAdminEnvSchema`'nın
 * eklediği yeni ayrıcalıklı ortam alanları (K-E8) `DatabaseEnv`'i genişletse
 * bile bu fonksiyonun imzası değişmez; `DatabaseEnv` **ve** yeni
 * `DatabaseBootstrapEnv` (`src/env.ts`, `bootstrap-roles.ts`'in girdisi)
 * ikisi de bu şekle YAPISAL OLARAK uyar, ayrı bir dönüştürme/adaptör
 * gerekmez. `guard-policy.test.ts`'in 35+ fixture'ı `DatabaseEnv` üzerinden
 * nesne kurduğu için bu daraltma onları KIRMAZ (daha genel bir parametre
 * tipi, daha özel bir değeri her zaman kabul eder).
 */
export type TargetDatabase = {
  readonly databaseUrl: string
  readonly nodeEnv: NodeEnv
}

/** `evaluateTargetDatabase`'in kararı. `reject` dalı SÜREÇ SONLANDIRMAZ. */
export type TargetDecision =
  { readonly kind: 'allow' } | { readonly kind: 'reject'; readonly message: string }

/**
 * Bir komutun hangi veritabanı rolüyle çalışması gerektiği (FIX turu 2, B2 —
 * eskiden `run-guarded-prisma.ts`'te tanımlıydı, BURAYA taşındı: `COMMANDS`
 * her komutun rolünü KENDİ TANIMININ YANINDA taşır, ayrı bir paralel
 * eşleme YOKTUR).
 */
export type DatabaseRole = 'migrator' | 'app'

/**
 * `resolvePrismaCommand`'in kararı. `allow` dalı spawn edilecek argüman
 * dizisini VE (FIX turu 2, B2) o komutun `CommandSpec`'inden gelen
 * `role`/`requiresTargetGuard` kararını taşır — çağıran (`run-guarded-prisma.ts`)
 * bunları KENDİSİ yeniden TÜRETMEZ.
 */
export type CommandDecision =
  | {
      readonly kind: 'allow'
      readonly spawnArgs: readonly string[]
      readonly role: DatabaseRole
      readonly requiresTargetGuard: boolean
    }
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
  env: TargetDatabase,
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

/**
 * Sarmalanan bir komutun TAM tanımı: eşleşecek token'lar + spawn'a verilecek
 * sabit argümanlar + izinli ek bayraklar + (FIX turu 2, B2 — tek doğruluk
 * kaynağı) hangi veritabanı rolüyle çalışacağı + yıkıcı hedef korumasına
 * (`evaluateTargetDatabase`) tabi olup olmadığı. Her komutun BEŞ özelliği de
 * BURADA, AYNI SATIRDA tanımlanır — ikinci bir paralel eşleme (ayrı bir
 * `if/else` zinciri) YAZILMAZ.
 */
type CommandSpec = {
  readonly tokens: readonly string[]
  readonly spawnArgs: readonly string[]
  readonly allowedFlags: readonly FlagSpec[]
  readonly role: DatabaseRole
  readonly requiresTargetGuard: boolean
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
// AYRICALIK SINIRI + YIKICI HEDEF KORUMASI — her satırın `role`/
// `requiresTargetGuard` gerekçesi (FIX turu 2, B2 — eskiden
// `run-guarded-prisma.ts`'te AYRI bir tabloydu, BURAYA taşındı):
//   `db push`        → `migrator` · guard'lı  — doğrudan şema DDL'i, sahiplik ister
//   `migrate reset`  → `migrator` · guard'lı  — şemayı düşürüp yeniden kurar
//   `migrate dev`    → `migrator` · guard'lı  — shadow DB + sahiplik ister (A-E2)
//   `db seed`        → `app`      · guard'lı  — yalnızca DML (K-E2: BİLİNÇLİ)
//   `studio`         → `app`      · guard'lı  — DDL YAPMAZ, en az yetki
//   `migrate deploy` → `migrator` · MUAF      — RLS/politika DDL'i uygular
//     (FIX turu 1, KRİTİK) AMA yıkıcı DEĞİLDİR (ileri yönlü, idempotent) ve
//     üretimde/CI'da çalışmak ZORUNDADIR — `evaluateTargetDatabase`'in
//     koşulsuz `NODE_ENV=production` reddi ve localhost-allowlist'i ona
//     UYGULANMAZ.
const COMMANDS: readonly CommandSpec[] = [
  {
    tokens: ['db', 'push'],
    spawnArgs: ['db', 'push'],
    allowedFlags: [],
    role: 'migrator',
    requiresTargetGuard: true,
  },
  {
    tokens: ['migrate', 'reset'],
    spawnArgs: ['migrate', 'reset', '--force'],
    allowedFlags: [],
    role: 'migrator',
    requiresTargetGuard: true,
  },
  {
    tokens: ['migrate', 'dev'],
    spawnArgs: ['migrate', 'dev'],
    allowedFlags: [
      { kind: 'value', name: '--name', validate: isValidMigrationName },
      { kind: 'boolean', name: '--create-only' },
    ],
    role: 'migrator',
    requiresTargetGuard: true,
  },
  {
    tokens: ['db', 'seed'],
    spawnArgs: ['db', 'seed'],
    allowedFlags: [],
    role: 'app',
    requiresTargetGuard: true,
  },
  {
    tokens: ['studio'],
    spawnArgs: ['studio'],
    allowedFlags: [{ kind: 'value', name: '--port', validate: isValidPort }],
    role: 'app',
    requiresTargetGuard: true,
  },
  // FIX turu 1 (KRİTİK) — `migrate deploy` artık allowlist'te: CI'nin
  // `services: postgres`'i HER ZAMAN sıfırdan başlar, `db:deploy` o konteynerde
  // şimdiye kadar sarmalanmamış `DATABASE_URL`'i (en az yetkili `arkesoft_app`)
  // okuyordu ve RLS migration'ının DDL'ini (`ENABLE/FORCE ROW LEVEL SECURITY`,
  // `CREATE POLICY`) uygulayamıyordu (`permission denied for schema public`).
  // CI'da çalışan tek sahip rol `arkesoft_migrator` olduğu için `deploy` de
  // DİĞER DDL komutları gibi o role yönlendirilir, ama yıkıcı DEĞİLDİR —
  // `requiresTargetGuard: false` bu komutu `evaluateTargetDatabase`'den MUAF
  // tutar (üretimde/CI'da çalışması gerekir).
  {
    tokens: ['migrate', 'deploy'],
    spawnArgs: ['migrate', 'deploy'],
    allowedFlags: [],
    role: 'migrator',
    requiresTargetGuard: false,
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
 * Kullanıcıdan gelen CLI argümanlarını (`process.argv.slice(2)`) ALTI sabit
 * komuttan birine (FIX turu 1: `migrate deploy` eklendi) ve o komutun
 * allowlist'lenmiş bayraklarına göre çözer. `db execute`, `migrate resolve`,
 * `migrate status`, `db pull`, boş argv, bilinmeyen komut → reddedilir
 * (gerekçeler dosya başlığında ve `run-guarded-prisma.ts`'te).
 *
 * FIX turu 2 (B2 — tek doğruluk kaynağı): `allow` dalı artık eşleşen
 * `CommandSpec`'in `role`/`requiresTargetGuard` alanlarını da TAŞIR —
 * `run-guarded-prisma.ts` bu kararı KENDİSİ yeniden TÜRETMEZ, burada
 * ZATEN eşleşmiş `spec`'ten OKUR.
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

  return {
    kind: 'allow',
    spawnArgs: [...spec.spawnArgs, ...parsed.args],
    role: spec.role,
    requiresTargetGuard: spec.requiresTargetGuard,
  }
}
