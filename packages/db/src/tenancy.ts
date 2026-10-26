// @arkesoft/db — Makine okunur tenant taksonomisi (ROADMAP v0.0.3, T-001/ST-3)
//
// V4 / AC8 gerekçesi: `Tenant` (`tenant`) ve `User` (`app_user`) PLATFORM
// SEVİYESİ tablolardır — `tenant_id` kolonu taşımazlar, bu tablolar kiracı
// kimliğinin kaynağıdır. Tenant'a bağlı TEK tablo `TenantMembership`
// (`tenant_membership`): `tenant_id` kolonu `text`, NOT NULL ve
// `(tenant_id, user_id)` bileşik benzersizlik kısıtının öncü kolonu.
//
// Bu sürümde `tenant_membership` için RLS politikası BİLİNÇLİ OLARAK yok
// (CLAUDE.md §7/§10 kontrol listesiyle çatışma kayıt altında — ADR-0003 ve
// Teknik Borç tablosu, vade v0.0.13). v0.0.13'teki şema linter'ı bu iki diziyi
// **allowlist** olarak tüketecek: `TENANT_SCOPED_TABLES`'taki her tablonun
// RLS politikası var mı diye mekanik olarak doğrulayacak.
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
//   3. `CreatePrismaClientOptions`'a transaction başına
//      `SET LOCAL app.tenant_id` kancası (bu sürümde `CreatePrismaClientOptions`
//      BİLEREK DEĞİŞMEDİ — ileri uyumlu opsiyon eklenmedi, mekanizma henüz
//      kararlaştırılmadı).

/**
 * `tenant_id` kolonu TAŞIMAYAN platform seviyesi tablolar. Kiracı kimliğinin
 * kendisi bu tablolardadır; RLS politikası gerektirmez.
 */
export const PLATFORM_LEVEL_TABLES = ['tenant', 'app_user'] as const

/**
 * `tenant_id` kolonu taşıyan, kiracıya bağlı tablolar. v0.0.13'te her biri için
 * `ENABLE ROW LEVEL SECURITY` + `USING (tenant_id = current_setting('app.tenant_id')::text)`
 * politikası eklenecek — bu sürümde henüz eklenmedi (teknik borç, AC8).
 */
export const TENANT_SCOPED_TABLES = ['tenant_membership'] as const
