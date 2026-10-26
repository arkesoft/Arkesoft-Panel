// @arkesoft/errors — redaction ilkelleri (ROADMAP v0.0.4, T-002/ST-3b, architect K-A2/K-A7)
//
// İKİ TÜKETİCİSİ var: apps/api'nin pino yapılandırması (ST-2/ST-4, `RequestLoggingInterceptor`
// ve `createRootLogger`) ve packages/db/src/seed.ts:95 (Kullanıcı Onayı #2 — seed çıktısındaki
// tam e-posta maskelenecek). Ortak pakette durmasının sebebi bu: iki ayrı paket aynı maskeleme
// desenini kopyalamasın, tek yerden bakım edilsin.

/**
 * Bir e-posta adresini log/konsol çıktısı için maskeler.
 * Örn. `ahmet@example.com` → `a***@example.com`.
 *
 * Kenar durumlarda (`@` yok, yerel kısım tek karakter, boş dize, birden çok `@`)
 * HİÇBİR ZAMAN ham e-postayı geri döndürmez — biçim belirsizse tamamen maskeler
 * (`***`).
 */
export function maskEmail(value: string): string {
  if (value.length === 0) {
    return '***'
  }

  const firstAt = value.indexOf('@')
  const lastAt = value.lastIndexOf('@')

  // `@` yok veya birden çok `@` var → biçim belirsiz, ham veriyi sızdırmamak için
  // tamamen maskele.
  if (firstAt === -1 || firstAt !== lastAt) {
    return '***'
  }

  const localPart = value.slice(0, firstAt)
  const domainPart = value.slice(firstAt + 1)

  if (localPart.length === 0 || domainPart.length === 0) {
    return '***'
  }

  const firstChar = localPart.charAt(0)
  return `${firstChar}***@${domainPart}`
}

/**
 * pino `redact.paths` için ortak liste. CLAUDE.md §4 "asla loglanmaz" maddesinin
 * (çerez, token, parola, API anahtarı) pino seviyesindeki karşılığı — AC10'un
 * İKİNCİ savunma katmanı (birincisi: başlıkların loggera hiç verilmemesi, bkz.
 * architect K-A7 — `RequestLoggingInterceptor` ham başlıkları hiç okumaz).
 */
export const PINO_REDACT_PATHS: readonly string[] = [
  'cookie',
  'authorization',
  'set-cookie',
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["set-cookie"]',
  'res.headers.cookie',
  'res.headers.authorization',
  'res.headers["set-cookie"]',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  '*.password',
  '*.token',
] as const
