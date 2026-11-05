// `pnpm env:check` — .env dosyasını şemaya göre doğrular ve özet basar.
//
// Çalıştırma (repo kökünden):
//   node --env-file=.env packages/config/dist/check-env.js
//
// Sır içeren değerler maskelenir; terminale veya CI loguna parola düşmez.

import {
  EnvValidationError,
  databaseAdminEnvSchema,
  databaseAuthEnvSchema,
  infraEnvSchema,
  parseEnv,
  storefrontEnvCheckSchema,
} from './env.js'

/** Adı bu desenlerden birine uyan değişkenin değeri tamamen maskelenir. */
const SECRET_KEY_PATTERN = /(PASSWORD|SECRET|_KEY|TOKEN)/

/**
 * `DATABASE_*_URL` adıyla eşleşen HER değişken, değerinin BİÇİMİNE
 * bakılmaksızın tamamen maskelenir (security bulgusu S-3 düzeltmesi — ad
 * bazlı maske, biçim bazlı değil).
 *
 * Gerekçe: bu ailedeki her bağlantı dizesi parola hash'i/oturum/doğrulama
 * belirteci taşıyan tablolara erişen bir kimlik bilgisi taşır —
 * `DATABASE_AUTH_URL` en hassası (ADR-0008 borcu, T-015). Biçime güvenen bir
 * regex, parolada ham `/` karakteri taşıyan veya kimlik bilgisini `?password=`
 * sorgu parametresi biçiminde taşıyan GEÇERLİ adresleri atlayabilir
 * (ölçülmüş: eski `URL_CREDENTIALS_PATTERN` ikisini de maskelemiyordu). Ad
 * bazlı maske bu riski değerin biçimine bakmadan ortadan kaldırır.
 */
const DATABASE_URL_KEY_PATTERN = /^DATABASE(_[A-Z0-9]+)?_URL$/

function maskSecret(value: string): string {
  if (value.length <= 4) {
    return '****'
  }
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 12))}${value.slice(-2)}`
}

/**
 * Bir URL'in kimlik bilgisi kısmını (ve sır taşıyan sorgu parametrelerini)
 * gerçek `URL` ayrıştırıcısıyla parçalayıp maskeleyerek yeniden kurar —
 * biçime güvenen regex değil (eski `URL_CREDENTIALS_PATTERN`'in yakalayamadığı
 * `?password=` sorgu parametresi biçimi burada `URLSearchParams` üzerinden
 * yakalanır).
 *
 * Ayrıştırılamayan (RFC 3986'ya uymayan, örn. parolasında ham `/` veya `+`
 * taşıyan) değerler **tamamen maskelenir** (security bulgusu S-10 düzeltmesi —
 * `catch` yolu FAIL-OPEN'dı, ham değeri birebir geri döndürüyordu). Yapıyı
 * (host/port) ayrıştırılamayan bir değer için göstermek mümkün değil — `URL`
 * ayrıştırıcısı parçalayamadığında hangi kısmın kimlik bilgisi olduğunu
 * BİLEMEYİZ, dolayısıyla güvenli tek seçenek değerin tamamını maskelemektir.
 * Bu, `DATABASE_*_URL` ailesi için pratikte risk doğurmaz — o aile yukarıdaki
 * ad bazlı kuralla biçimden bağımsız olarak zaten tamamen maskelenir; bu
 * fonksiyon yalnızca `REDIS_URL`, `MEILI_HOST`, `S3_ENDPOINT` gibi daha düşük
 * hassasiyetli adresler için çağrılır ama onlarda da kimlik bilgisi taşınabilir
 * (yönetilen Redis base64 parolası `/`/`+` içerebilir — ölçülmüş senaryo).
 */
function maskUrlCredentials(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return maskSecret(value)
  }

  if (url.username.length > 0 || url.password.length > 0) {
    url.username = '***'
    url.password = '***'
  }

  for (const paramKey of url.searchParams.keys()) {
    if (SECRET_KEY_PATTERN.test(paramKey.toUpperCase())) {
      url.searchParams.set(paramKey, '***')
    }
  }

  return url.toString()
}

/** Değeri terminalde gösterilebilir hale getirir. */
function presentValue(key: string, value: unknown): string {
  if (typeof value !== 'string') {
    return String(value)
  }
  if (SECRET_KEY_PATTERN.test(key) || DATABASE_URL_KEY_PATTERN.test(key)) {
    return maskSecret(value)
  }
  // REDIS_URL / MEILI_HOST / S3_ENDPOINT gibi adreslerde parola gömülü olabilir.
  return maskUrlCredentials(value)
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

/**
 * v0.0.14.1 rol ayrımına özgü eyleme dönük hata metni (ROADMAP T-015/ST-A,
 * ADR-0008 borcu).
 *
 * `databaseAuthEnvSchema` eksik/geçersizse operatöre YALNIZCA değişken adı ve
 * kuralı değil, bu değişkenin ne için zorunlu olduğunu ve `DATABASE_URL`'e
 * geri düşmenin NEDEN yasak olduğunu da söyler — `describeDatabaseAdminGuidance`
 * ile aynı desen (bkz. yukarı).
 */
function describeDatabaseAuthGuidance(issues: readonly string[]): string {
  return [
    'Kimlik doğrulama rolü bağlantısı geçersiz (v0.0.14.1 — ADR-0008 borcu):',
    ...issues.map((issue) => `  - ${issue}`),
    '',
    "`DATABASE_AUTH_URL` `arkesoft_auth` rolünü taşır: parola hash'i/oturum",
    'belirteci/doğrulama belirteci taşıyan üç tabloyu (kolon bazlı) ve',
    "`app_user`'ı (tablo bazlı, DELETE hariç) okur/yazar — başka hiçbir tabloya",
    "erişemez. Koşulsuz zorunludur; `DATABASE_URL`'e (en az yetkili çalışma",
    'zamanı rolü) geri düşmek YASAKTIR — kimlik akışı kısıtlı yerine süper',
    'yetkili rolle sessizce çalışmaya devam ederdi.',
    '',
    "`.env.example`'daki `DATABASE_AUTH_URL` satırını `.env`'inize kopyalayın",
    "(`pnpm env:init` var olan `.env`'i EZMEZ, yalnızca yoksa oluşturur); sonra",
    "`pnpm db:bootstrap`'i YENİDEN koşturun. Ayrıntı: `docs/development.md`.",
  ].join('\n')
}

/**
 * Storefront geçirgenlik (turbo `env`) sözleşmesine özgü eyleme dönük hata
 * metni (ROADMAP T-011/S1, AC7). `describeDatabaseAdminGuidance` emsalinde:
 * yalnızca değişken adını değil, eksik anahtarı `.env` dosyasıyla adıyla
 * anıp operatöre tam olarak ne yapması gerektiğini söyler.
 */
function describeStorefrontEnvGuidance(issues: readonly string[]): string {
  return [
    'Storefront geçirgenlik değişkenleri geçersiz (ROADMAP T-011/S1):',
    ...issues.map((issue) => `  - ${issue}`),
    '',
    "`apps/storefront` bu değişkenleri `turbo.json`'da bildirilen `env`",
    'listesi üzerinden kabuktan alır; eksikse `astro dev`/`astro build`',
    'açılışta fail-closed hata verir (tasarlanmış davranış).',
    '',
    '`.env` dosyanızda şu satırların VAR ve DOLU olduğunu doğrulayın:',
    '  - `APP_BASE_DOMAIN`         (`.env.example:14`)',
    '  - `STOREFRONT_API_BASE_URL` (`.env.example:130`)',
    "Eksikse `.env.example`'dan kopyalayın; `.env` git'e girmez, yalnızca",
    'yerel geliştirme kopyanızda olur.',
  ].join('\n')
}

/**
 * Dört doğrulama bloğunun (ve eklenecek her yeninin) ORTAK `catch` gövdesi
 * (T-015 FIX turu 1, madde 5 — solid SD-8: "dördüncü birebir try/catch
 * bloğu, beşinci şema yine kopyalatır"). Beklenmeyen (Zod dışı) bir hatayı
 * YUTMAZ — yukarı fırlatır; yalnızca {@link EnvValidationError}'ı okunabilir
 * rehberliğe çevirir. `exitCode`'u BURADAN döndürmez — çağıran (her bloğun
 * KENDİ `parseEnv`/`printEntries` çağrısı, tip çıkarımı BOZULMADAN) belirler.
 */
function reportEnvValidationFailure(
  error: unknown,
  describeGuidance: (issues: readonly string[]) => string,
): void {
  if (!(error instanceof EnvValidationError)) {
    throw error
  }
  process.stderr.write(`${describeGuidance(error.issues)}\n`)
}

function main(): number {
  let exitCode = 0

  try {
    const env = parseEnv(infraEnvSchema)
    printEntries('Temel ortam değişkenleri doğrulandı:', Object.entries(env))
  } catch (error) {
    reportEnvValidationFailure(error, (issues) => new EnvValidationError(issues).message)
    exitCode = 1
  }

  write('')

  try {
    const adminEnv = parseEnv(databaseAdminEnvSchema)
    printEntries('Veritabanı yönetici bağlantıları doğrulandı:', Object.entries(adminEnv))
  } catch (error) {
    reportEnvValidationFailure(error, describeDatabaseAdminGuidance)
    exitCode = 1
  }

  write('')

  // Üçüncü blok (ROADMAP T-011/S1, AC7) — storefront'un turbo `env`
  // geçirgenliğiyle kabuktan aldığı alt küme. Bilinçli olarak AYRI
  // doğrulanır (bkz. `storefrontEnvCheckSchema` yorumu, env.ts); bu yüzden
  // `infraEnvSchema`'nın başarısı bu bloğu ATLAMAZ — ikisi bağımsızdır.
  try {
    const storefrontEnv = parseEnv(storefrontEnvCheckSchema)
    printEntries('Storefront geçirgenlik değişkenleri doğrulandı:', Object.entries(storefrontEnv))
  } catch (error) {
    reportEnvValidationFailure(error, describeStorefrontEnvGuidance)
    exitCode = 1
  }

  write('')

  // Dördüncü blok (ROADMAP v0.0.14.1, T-015/ST-A, Orkestratör A-PO4 kararı) —
  // `databaseAuthEnvSchema` BİLİNÇLİ OLARAK AYRI doğrulanır (bkz.
  // `databaseAuthEnvSchema` yorumu, env.ts); `infraEnvSchema`'nın başarısı bu
  // bloğu ATLAMAZ. Bu değişken yerel `.env`'lerin BÜYÜK kısmında henüz YOK —
  // bu blok eklendiği anda `pnpm env:check` o kurulumlarda KIRMIZIYA döner.
  // Bu bir regresyon DEĞİL: CHANGELOG.md:161'in v0.0.13'te verdiği
  // "eksikse env:check kırmızıya düşer" sözünün bu değişken için de
  // karşılanması, ve operatörün hatayı açılışta değil burada ERKEN öğrenmesi.
  try {
    const authEnv = parseEnv(databaseAuthEnvSchema)
    printEntries('Kimlik doğrulama rolü bağlantısı doğrulandı:', Object.entries(authEnv))
  } catch (error) {
    reportEnvValidationFailure(error, describeDatabaseAuthGuidance)
    exitCode = 1
  }

  if (exitCode === 0) {
    write('\n✓ Tüm ortam değişkenleri geçerli.')
  }

  return exitCode
}

process.exitCode = main()
