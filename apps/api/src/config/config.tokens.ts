// @arkesoft/api — yapılandırma DI token'ları (ROADMAP v0.0.4, T-002/ST-2)
//
// DI KURALI (bağlayıcı, architect R2): enjekte edilen HER yapıcı parametresi
// açık `@Inject(TOKEN)` taşır — tip çıkarımına dayanan DI YASAK (repo lint'i
// `consistent-type-imports`, packages/config/eslint/base.js, salt tip
// pozisyonunda kullanılan sınıfı `import type`'a çevirip metadata'yı
// boşaltır — B1). Token'lar `Symbol()` olarak tanımlanır; iki token'ın
// yanlışlıkla çakışması derleme zamanında bile mümkün değildir (referans
// eşitliği, dize eşitliği değil).

/** Doğrulanmış `ApiEnv` nesnesini sağlayan provider'ın token'ı. */
export const API_ENV = Symbol('API_ENV')

/** `apps/api/package.json`'dan okunan platform semver'ini sağlayan provider'ın token'ı. */
export const PLATFORM_VERSION = Symbol('PLATFORM_VERSION')
