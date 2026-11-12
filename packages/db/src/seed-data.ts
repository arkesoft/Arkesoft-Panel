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
//
// GÜNCELLEME (ROADMAP v0.0.21, T-018/S5, ADR-0020 Karar 1 — ÇİFT DOĞRULUK
// KAYNAĞI KAPATILDI): `themeId`/`themeVersion` alanları BU SABİTTEN
// KALDIRILDI. v0.0.10/T-012'de buraya yazılmış olan tema kimliği/sürümü
// literal fixture'ı (ADR-0002 Karar 5'in "canlı doğruluk kaynağı" ilanı)
// ADR-0020 Karar 1 ile GEÇERSİZLEŞTİ: kiracının tema seçiminin tek yazılabilir
// doğruluk kaynağı artık `TenantVersionState`'tir (`src/version-registry-seed.ts`),
// ve `seed.ts` `Tenant.themeId`/`themeVersion` (deprecated ayna kolon) ile
// `TenantVersionState.themeId`/`themeVersion`'ı AYNI tek kaynak sabitten
// (`resolveVersionRegistrySeedValues()`, `@arkesoft/themes-modern`'in
// manifestinden türetilmiş) yazar — bkz. AC-11 sapma testi. Bu alanları BURADA
// (ikinci bir sabit olarak) TUTMAK tam olarak bu Task'ın kapattığı çift
// doğruluk kaynağı sınıfını tekrarlardı. Hiçbir tüketici bu iki alana
// erişmiyordu (ölçüldü: `rg "DEMO_SEED\.tenant\.theme"` → sıfır eşleşme,
// `apps/*`/`packages/db/src/__tests__/**` dahil).

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
  },
  owner: {
    /** Küresel tekil (AC7); karşılığı yok — RFC 2606 ayrılmış test alan adı. */
    email: 'demo-yonetici@arkesoft.test',
    name: 'Demo Yönetici',
  },
} as const
