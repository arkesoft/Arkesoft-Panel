// @arkesoft/db — Makine okunur tenant taksonomisi (ROADMAP v0.0.3, T-001/ST-3)
//
// V4 / AC8 gerekçesi: `Tenant` (`tenant`) ve `User` (`app_user`) PLATFORM
// SEVİYESİ tablolardır — `tenant_id` kolonu taşımazlar, bu tablolar kiracı
// kimliğinin kaynağıdır. Tenant'a bağlı TEK tablo `TenantMembership`
// (`tenant_membership`): `tenant_id` kolonu `text`, NOT NULL ve
// `(tenant_id, user_id)` bileşik benzersizlik kısıtının öncü kolonu.
//
// GÜNCELLEME (ROADMAP v0.0.13, T-005/S3): `tenant_membership` için RLS
// politikası artık VAR — bkz. `prisma/migrations/<ts>_rls_tenant_isolation/
// migration.sql`. v0.0.13'ün canlı katalog linter'ı (`catalog-lint.ts`, S4)
// bu iki diziyi **allowlist** olarak tüketir: `TENANT_SCOPED_TABLES`'taki her
// tablonun RLS politikası var mı diye mekanik olarak doğrular.
//
// GENİŞLETME (Gate Tur 1, S3, architect K3): borç yalnızca "politika yok"tan
// İBARET DEĞİL. Bugünkü uygulama veritabanı rolü SÜPER KULLANICI + `BYPASSRLS`
// taşıyor, ayrıca üç tablonun da SAHİBİ. Postgres'te süper kullanıcı RLS'i
// tamamen atlar; tablo sahibi de `ALTER TABLE … FORCE ROW LEVEL SECURITY`
// olmadan atlar. Yani v0.0.13'te politikalar TEK BAŞINA yazılsa bile hiçbir
// satırı filtrelemez — rol ayrımı ve `FORCE ROW LEVEL SECURITY` de EKSİK.
// v0.0.13'ün kapsaması gereken ÜÇ kalem (vade v0.0.13, bugün sömürülebilir
// değil: hiçbir `apps/*` dosyası `@arkesoft/db`'yi henüz tüketmiyor):
//   1. `BYPASSRLS`'siz, süper olmayan, tablo SAHİBİ OLMAYAN `arkesoft_app` rolü
//      (uygulama bu rolle bağlanır; migration'lar ayrı, sahip rolle çalışır).
//   2. Her tenant tablosunda `ALTER TABLE … FORCE ROW LEVEL SECURITY`.
//   3. `CreatePrismaClientOptions`'a transaction başına, `tenant-context.ts`'in
//      `TENANT_CONTEXT_SETTING` sabitinde tanımlı GUC'u yazan bir kanca —
//      BU KALEM AŞAĞIDAKİ GÜNCELLEME NOTUNDA KAPANDI (bkz. `tenant-context.ts`),
//      bu yüzden "mekanizma henüz kararlaştırılmadı" iddiası BURADA tekrar
//      edilmiyor (FIX turu 1, solid [low] bulgusu: eski yorum okuyucuyu önce
//      yanlış bilgilendiriyordu).
//
// GÜNCELLEME (ROADMAP v0.0.13, T-005/S3, PO riski 3/R-P3(a)): yukarıdaki üç
// kalem bu sürümde KAPANDI — bkz. `src/tenant-context.ts`
// (`TENANT_CONTEXT_SETTING` + `withTenant()`) ve
// `prisma/migrations/<ts>_rls_tenant_isolation/migration.sql`. Bu dosyadaki
// GUC adı atıfları BİLEREK literal yazılmaz (yalnızca `tenant-context.ts`
// içinde literal geçer, K-E12) — S5'in AC4 mekanik grep'i (`guards`) bu
// dosyayı kalıcı yanlış pozitif kaynağı OLARAK GÖRMESİN diye.

// GÜNCELLEME (ROADMAP v0.0.5, T-006/S2, architect VERİ MODELİ): `session`,
// `account`, `verification` (Better Auth tabloları) EKLENDİ — üçü de
// PLATFORM SEVİYESİ, `tenant_id` TAŞIMAZ. Gerekçe: oturum/kimlik bilgisi/
// doğrulama belirteci KULLANICIYA bağlıdır, kiracıya değil ("bir hesap →
// birden fazla mağaza" vaadi bunu zorunlu kılar); kiracı üyeliği kontrolü
// istek anında `tenant_membership` üzerinden yapılır (R2). `TENANT_SCOPED_TABLES`
// bu güncellemeyle DEĞİŞMEDİ (hâlâ tek eleman) — yeni prob gerekmez, prob
// tamlığı kapısı (`MISSING_TENANT_SCOPED_TABLE`) kırılmaz.

/**
 * `tenant_id` kolonu TAŞIMAYAN platform seviyesi tablolar. Kiracı kimliğinin
 * kendisi bu tablolardadır; RLS politikası gerektirmez.
 */
export const PLATFORM_LEVEL_TABLES = [
  'tenant',
  'app_user',
  'session',
  'account',
  'verification',
] as const

/**
 * `tenant_id` kolonu taşıyan, kiracıya bağlı tablolar. v0.0.13'ten itibaren
 * her biri için `ENABLE` + `FORCE ROW LEVEL SECURITY` ve `tenant-context.ts`'in
 * `TENANT_CONTEXT_SETTING` sabitinde tanımlı GUC'u okuyan bir `USING`/
 * `WITH CHECK` politikası taşır (bkz. ilgili migration dosyası).
 */
export const TENANT_SCOPED_TABLES = ['tenant_membership'] as const
