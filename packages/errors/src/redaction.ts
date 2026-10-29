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
// EKLEME (ROADMAP v0.0.5, T-006/S3, architect "LOG DESENİ" bölümü): altı yeni
// yol — `sessionToken`/`verificationToken`/`resetToken`/`passwordHash` ve
// bunların `*.` joker ön ekli ikisi (`*.sessionToken`/`*.passwordHash`).
// Better Auth bu alan adlarıyla çalışıyor (v0.0.5 kapsamı); CLAUDE.md §4/§10.7
// "şifre, token, oturum kimliği asla loglanmaz" maddesinin pino seviyesindeki
// karşılığı. `'*.value'` BİLEREK EKLENMEDİ (architect kararı, bağlayıcı) —
// `verification.value` alanı YAPISAL olarak logger nesnesine HİÇ GİRMİYOR
// (Better Auth'un ham belirteç alanı bu isimle taşınıyor ama hiçbir
// `logger.info/warn/error` çağrısına argüman olarak VERİLMİYOR); `'*.value'`
// eklemek MEŞRU alanları da (herhangi bir nesnenin `value` adlı alanını)
// silen fazla geniş bir joker olurdu — redaction'a değil YAPIYA güveniyoruz.
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
  'sessionToken',
  'verificationToken',
  'resetToken',
  'passwordHash',
  '*.sessionToken',
  '*.passwordHash',
] as const
