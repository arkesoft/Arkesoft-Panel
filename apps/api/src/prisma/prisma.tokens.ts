// @arkesoft/api — Prisma DI token'ları (ROADMAP v0.0.4, T-002/ST-6, architect K-A3)
//
// DI KURALI (bağlayıcı, architect R2): her enjekte edilen parametre açık
// `@Inject(TOKEN)` taşır — token `Symbol()` olarak tanımlanır (dize eşitliği
// değil, referans eşitliği — iki token'ın yanlışlıkla çakışması derleme
// zamanında bile mümkün değildir).

/** Ham `PrismaDatabase` örneğini sağlayan provider'ın token'ı. */
export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT')
