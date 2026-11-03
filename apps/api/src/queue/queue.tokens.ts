// @arkesoft/api — kuyruk DI token'ları (ROADMAP v0.0.11, T-013/S5)
//
// DI KURALI (bağlayıcı, architect R2 — `config.tokens.ts` ile aynı gerekçe):
// enjekte edilen HER yapıcı parametresi açık `@Inject(TOKEN)` taşır; tip
// çıkarımına dayanan DI yasak (repo lint'inin `consistent-type-imports`
// kuralı salt tip pozisyonundaki sınıfı `import type`'a çevirip Nest
// metadata'sını boşaltır). Token'lar `Symbol()` — iki token'ın yanlışlıkla
// çakışması referans eşitliği yüzünden imkânsızdır.

/**
 * Kuyruğun KENDİ `ioredis` bağlantısı (`'queue'` profili). ⚠ `REDIS_CLIENT`
 * (`'health'` profili) kuyruğa HİÇ VERİLMEZ: `RedisService.onModuleDestroy`
 * onu `quit()` ile kapatır ve kuyruğun altından bağlantıyı çeker; ayrıca
 * `'health'` profilinin `commandTimeout: 1500` değeri BullMQ'nun bloke eden
 * komutlarını sistematik olarak düşürür (bkz. `create-redis-connection.ts`).
 */
export const QUEUE_CONNECTION = Symbol('QUEUE_CONNECTION')

/**
 * İş adı → (`Queue`, DLQ `Queue`, tanım) eşlemesi. `JOB_DEFINITIONS`
 * gezilerek kurulur; iş türüne özgü dallanma içermez.
 */
export const JOB_QUEUE_REGISTRY = Symbol('JOB_QUEUE_REGISTRY')

/**
 * `queued` durumundaki `Job` satırını KİRACI KAPSAMLI yazan port. Adaptörü
 * `queue.module.ts`'te `PrismaService.withTenant()` üzerinden kurulur —
 * `QueueService` Prisma'yı HİÇ GÖRMEZ (test ikizi tek fonksiyonluk).
 */
export const QUEUED_JOB_WRITER = Symbol('QUEUED_JOB_WRITER')
