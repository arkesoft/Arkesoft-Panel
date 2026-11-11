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
// EKLEME (ROADMAP v0.0.15, T-016/S8, architect K-A3 — "sır/URI/yedek kod
// hiçbir log satırında yok" kriterinin log yarısı): `totpURI` ve
// `backupCodes` Better Auth'un `two-factor` eklentisinin `enable`/
// `get-totp-uri` yanıtlarında KASTEN tele çıkan sırrın KENDİSİNİ taşır
// (kullanıcı QR'ı/anahtarı görmek zorunda) — tele çıkması bilinçli, LOGLANMASI
// değil. `*.secret` düz `secret` anahtarının (satır ~73) KAPSAMADIĞI, iç içe
// nesnede (`{ twoFactor: { secret: ... } }` gibi) taşınan sır için eklendi.
//
// EKLEME (ROADMAP v0.0.15.1, T-017/S6, kullanıcı kararı 2026-11-09 — ÜÇ KEZ
// onaylandı): `ipAddress`/`*.ipAddress`. ⚠ BU İKİNCİL bir savunmadır — BİRİNCİL
// savunma hiçbir kod yolunun bu değeri bir log çağrısına GEÇİRMEMESİdir
// (`apps/api`'nin `request-context.middleware.ts`/`auth-instance.ts`'in
// `session.create.before`'u, "bu alanı HİÇ loglamaz" yazılı disiplini). Bu
// yol EKLENİR çünkü IP KARARI (CLAUDE.md §4/§10.7'nin "sır" listesinde
// YOKTUR ama KVKK kapsamında kişisel veridir) ikinci bir güvenlik ağı
// hak eder — Better Auth'un KENDİ nesneleri (`session`, `user.sessions`)
// İLERİDE bir hata/uyarı logunun gövdesine YANLIŞLIKLA sızarsa (ör. bir
// gelecekteki `logger.error({ session }, …)` çağrısı) bu yol onu redakte
// EDER. ⚠ YOL TABANLI — serbest metin İÇİNDEKİ bir IP'yi YAKALAMAZ
// (`auth-instance.ts`'in `*.secret` dersiyle AYNI sınır, security bunu
// AYRICA doğrular).
// ⛔ `'code'` BİLEREK EKLENMEDİ (architect kararı, bağlayıcı): `AppError.code`
// bu projenin TÜM hata ayıklama zincirinin dayandığı teşhis alanı
// (`INVALID_CODE`, `ACCOUNT_TEMPORARILY_LOCKED` — bunlar SIR DEĞİL, teşhis).
// `'code'` eklemek `AppError.code`'u HER YERDE redakte eder ve teşhisi öldürür.
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
  'totpURI',
  'backupCodes',
  '*.secret',
  'ipAddress',
  '*.ipAddress',
] as const
