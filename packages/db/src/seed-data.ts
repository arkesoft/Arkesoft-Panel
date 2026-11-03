// @arkesoft/db — Seed fixture sabiti (ROADMAP v0.0.3, T-001/ST-3)
//
// `src/seed.ts` (ST-4) ve v0.0.4/v0.0.8 entegrasyon testleri bu sabiti import
// eder; değerleri kodda tekrar yazmaz. Hiçbir sır/parola/token/API anahtarı
// İÇERMEZ — kimlik doğrulama (Better Auth) v0.0.5'te gelecek, bu sürümde
// yalnızca platform kayıt defteri (Tenant/User/TenantMembership) demo verisi var.
//
// `slug` KASITLI OLARAK yalnızca küçük harf (R-A11): tekillik harf duyarlı ve
// DB seviyesinde normalize edilmiyor (`citext` eklenmedi — A yolu tercihleri
// dışında ek bağımlılık). Türkçe karakterler slug'a GİRMEZ (alt alan adı/URL
// güvenliği); görünen ad (`name`) Türkçe kalabilir.

/**
 * Demo tenant ve demo owner kullanıcısının sabit fixture verisi. `as const` ile
 * değişmez — testler ve seed script'i bu değerleri referans alır, tekrar
 * yazmaz.
 */
export const DEMO_SEED = {
  tenant: {
    /** Küresel tekil (AC7); yalnızca küçük harf, rakam ve tire. */
    slug: 'demo-magaza',
    name: 'Demo Mağaza',
    /**
     * ROADMAP v0.0.10, T-012/S2 (AC9): demo kiracının tema seçimi AÇIKÇA
     * yazılır — migration'ın backfill'i (`modern`/`0.1.0`) donmuş tarihsel bir
     * olgudur, bu fixture'ın KENDİSİ canlı doğruluk kaynağıdır (ADR-0002
     * Karar 5). Platform varsayılan temasıyla AYNI değer olması TESADÜF
     * DEĞİL — bu sürümde tek tema/tek sürüm var (K2 Karar 3).
     */
    themeId: 'modern',
    themeVersion: '0.1.0',
  },
  owner: {
    /** Küresel tekil (AC7); karşılığı yok — RFC 2606 ayrılmış test alan adı. */
    email: 'demo-yonetici@arkesoft.test',
    name: 'Demo Yönetici',
  },
} as const
