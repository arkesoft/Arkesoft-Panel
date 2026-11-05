// @arkesoft/db — Makine okunur tenant taksonomisi (ROADMAP v0.0.3, T-001/ST-3)
//
// V4 / AC8 gerekçesi: `Tenant` (`tenant`) ve `User` (`app_user`) PLATFORM
// SEVİYESİ tablolardır — `tenant_id` kolonu taşımazlar, bu tablolar kiracı
// kimliğinin kaynağıdır. Tenant'a bağlı tabloların KANONİK LİSTESİ aşağıdaki
// `TENANT_SCOPED_TABLES` dizisidir (v0.0.3'te tek üyeliydi: `TenantMembership`;
// v0.0.11'de `Job`, v0.0.14'te `AuditLog` ve `TenantInvitation` eklendi →
// BUGÜN DÖRT ÜYE) — her üyenin `tenant_id` kolonu `text`, NOT NULL ve
// `tenant_id` öncü bir bileşik benzersizlik kısıtının ilk kolonudur.
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
// O GÜNCELLEMEYLE DEĞİŞMEDİ (üç tablo da platform seviyesi) — yeni prob
// gerekmedi, prob tamlığı kapısı (`MISSING_TENANT_SCOPED_TABLE`) kırılmadı.

// GENİŞLETME (ROADMAP v0.0.11, T-013/S2, architect K3): `job` EKLENDİ —
// `TENANT_SCOPED_TABLES`'ın İKİNCİ üyesi, kiracıya bağlı arka plan işi kaydı
// (dizinin BUGÜNKÜ uzunluğu DÖRT — bkz. aşağıdaki v0.0.14 notu; "ikinci"
// eklenme sırasıdır, dizi uzunluğu DEĞİL).
// Bu tek satırlık değişiklik DÖRT mekanizmayı birden devreye sokar ve hiçbiri
// bu dosyanın dışındaki linter kaynak kodunu DEĞİŞTİRMEYİ gerektirmez:
//   1. Canlı katalog linter'ı (`catalog-lint.ts` — kural kodlarının TEK
//      doğruluk kaynağı `TENANT_ISOLATION_RULES`'tır, BURADA sabit bir sayı
//      YAZILMAZ; FIX turu 1, solid Tur 1 [low] SD-3 bulgusu: bu satırdaki
//      bayat kural SAYISI R-PM7'nin kapattığı SINIFIN TAM KENDİSİYDİ, ironik
//      biçimde ST-C'nin kendi dosyasında) — `job` için
//      `tenant_id` kolonu/tipi/NOT NULL'ı, RLS `ENABLE`+`FORCE`'u, kanonik
//      `USING`/`WITH CHECK` politikasını ve `arkesoft_app` DML yetkisini arar.
//   2. Migration kümesi linter'ı (`__tests__/helpers/migration-set.ts`) —
//      `"tenant_id" TEXT NOT NULL` kolonunu ve `tenant_id` ÖNCÜ kolonlu bir
//      `CREATE UNIQUE INDEX`'i (`@@unique([tenantId, id])`) arar.
//   3. Prob tamlığı kapısı (`__tests__/helpers/tenant-isolation-suite.ts`) —
//      `job` için bir `TenantScopedProbe` yazılmasını ZORLAR (eksikse `skip`
//      değil, gerçek bir `expect` başarısızlığı).
//   4. Yedi zorunlu izolasyon senaryosu — prob kaydedildiği an `job` için de
//      koşar (çapraz okuma + `WITH CHECK` INSERT reddi + "bulunamadı"
//      semantiği + varlık/yetki oracle'ı + hata gövdesi + havuz sızıntısı).
// ⚠ Prob KAYDI TEK YERDEDİR: `__tests__/tenant-membership.isolation.test.ts`
// (repoda `createTenantIsolationSuite`'in TEK çağrı noktası). İkinci bir çağrı
// noktası açmak İKİ dosyayı da kırar — her çağrı kendi taksonomisini kendi
// problarıyla karşılaştırır.

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

// GENİŞLETME (ROADMAP v0.0.14, T-014/S1, architect K-A0/K-A1): `audit_log`
// (ÜÇÜNCÜ üye, kiracıya bağlı denetim kaydı — append-only) ve
// `tenant_invitation` (DÖRDÜNCÜ üye, henüz kabul edilmemiş üyelik daveti)
// EKLENDİ → dizi İKİ üyeden DÖRT üyeye çıktı. `tenant_invitation`'ın AYRI bir
// tablo olması bir kapsam genişletmesi DEĞİL, onaylanmış davet akışının veri
// modeli sonucudur: kabul anında kullanıcı henüz var olmayabilir, dolayısıyla
// üyelik satırını "beklemede" olarak önceden yazmak imkânsızdır.
// Bu iki satırlık değişiklik yukarıdaki DÖRT mekanizmayı iki tablo için birden
// devreye sokar; üçü BU alt görevde (S1) ölçüldü, dördüncüsü — prob tamlığı
// kapısı — BİLEREK kırmızı bırakıldı ve prob yazımını S3'te zorlar (kabul
// kriteri o başarısızlığın GÖZLENMESİNİ istiyor, bu yüzden şema ve prob AYNI
// oturumda yazılmadı).
// ⚠ Prob KAYDI HÂLÂ TEK YERDEDİR (`__tests__/tenant-membership.isolation.test.ts`)
// — iki yeni tablo için İKİNCİ bir `createTenantIsolationSuite()` çağrı
// noktası AÇILMAZ.

/**
 * `tenant_id` kolonu taşıyan, kiracıya bağlı tablolar. v0.0.13'ten itibaren
 * her biri için `ENABLE` + `FORCE ROW LEVEL SECURITY` ve `tenant-context.ts`'in
 * `TENANT_CONTEXT_SETTING` sabitinde tanımlı GUC'u okuyan bir `USING`/
 * `WITH CHECK` politikası taşır (bkz. ilgili migration dosyası).
 */
export const TENANT_SCOPED_TABLES = [
  'tenant_membership',
  'job',
  'audit_log',
  'tenant_invitation',
] as const

// GENİŞLETME (ROADMAP v0.0.14.1, T-015/ST-C, architect "Bağlayıcı yetki
// beyanı" + kullanıcı kararı 2026-11-05): `arkesoft_auth` rolünün üç
// hash/belirteç taşıyan platform tablosuna (`PLATFORM_LEVEL_TABLES`'ın alt
// kümesi) hangi yetkiyi taşıması gerektiğinin VERİ beyanı. Bu dosyanın
// İMPORTSUZ kalması (dosya başı kuralı — bkz. `catalog-lint.ts` AC9/K-E5)
// burada da KORUNUR: aşağıdaki iki sabit `catalog-lint.ts`'in saf kural
// motoruna `LintCatalogOptions` ÜZERİNDEN PARAMETRE olarak geçer, modülden
// import EDİLMEZ — `TENANT_SCOPED_TABLES`/`PLATFORM_LEVEL_TABLES`'ın ZATEN
// kurulu deseniyle BİREBİR aynı.
//
// Tip seviyesi PİN: bu dizinin üyeleri `client.ts:68`'teki
// `AUTH_SECRET_BEARING_MODELS` ile BİREBİR aynı olmak ZORUNDADIR — ikisi
// AYRI dosyalarda, AYRI amaçlarla (biri çalışma zamanı tip daraltması, biri
// katalog linter'ı girdisi) yaşar ama AYNI üç modeli adlandırır. Pin:
// `__tests__/type-pins/auth-secret-tables.pin.ts` (derleme zamanı, kapalı
// dünya — iki yönlü `Exclude<>`).
//
// Kapsam DARALTILDI (kullanıcı kararı 2026-11-05, R-PM6 — po'nun revize
// ettiği ROADMAP madde 4): tablo bazlı `REVOKE` yalnızca BU ÜÇ tabloya
// uygulanır — `tenant`/`app_user` KAPSAM DIŞI (ADR-0008:53'ün ölçtüğü canlı
// kullanım `tenant` 32, `user` 5, `tenantMembership` 1 — literal daraltma
// uygulamayı kırardı).
export const AUTH_SECRET_BEARING_TABLES = ['account', 'session', 'verification'] as const

/**
 * `arkesoft_auth`ın bir tablo üzerindeki BEKLENEN yetki şekli. `columnLevel`
 * `true` ise SELECT/INSERT/UPDATE KOLON bazlı (TÜM kolonlar) beklenir ve
 * TABLO bazlı SELECT/INSERT/UPDATE BEKLENMEZ (anti-vacuity — R-PM3);
 * `columnLevel` `false` ise bu üçü TABLO bazlı beklenir (DELETE PostgreSQL'de
 * kolon bazlı TANIMLI DEĞİL, bu yüzden `expectsTableDelete` AYRI bir alan).
 */
export type AuthRoleTablePrivilegeExpectation = {
  readonly tableName: string
  readonly columnLevel: boolean
  readonly expectsTableDelete: boolean
}

// Kullanıcı kararı 2026-11-05 (ikinci kapı, architect'in `app_user` ölçümü
// üzerine): `app_user` ZORUNLU olarak dahil — Better Auth'un
// `findUserByEmail`'i ona bakar (`internal-adapter.mjs:585`) ve Better Auth
// TEK Prisma istemcisi kullandığı için bu erişim başka bir role
// DEVREDİLEMEZ. `app_user` için DELETE BEKLENMİYOR (A-N1: `user.deleteUser`
// ucu `auth-instance.ts`'te AÇILMAMIŞ — en az yetki; açılırsa bu satır
// güncellenir ve hata GÜRÜLTÜLÜ olur, sessiz değil).
export const AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS: readonly AuthRoleTablePrivilegeExpectation[] =
  [
    { tableName: 'account', columnLevel: true, expectsTableDelete: true },
    { tableName: 'session', columnLevel: true, expectsTableDelete: true },
    { tableName: 'verification', columnLevel: true, expectsTableDelete: true },
    { tableName: 'app_user', columnLevel: false, expectsTableDelete: false },
  ] as const
