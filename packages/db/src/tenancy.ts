// @arkesoft/db — Makine okunur tenant taksonomisi (ROADMAP v0.0.3, T-001/ST-3)
//
// V4 / AC8 gerekçesi: `Tenant` (`tenant`) ve `User` (`app_user`) PLATFORM
// SEVİYESİ tablolardır — `tenant_id` kolonu taşımazlar, bu tablolar kiracı
// kimliğinin kaynağıdır. Tenant'a bağlı tabloların KANONİK LİSTESİ aşağıdaki
// `TENANT_SCOPED_TABLES` dizisidir (v0.0.3'te tek üyeliydi: `TenantMembership`;
// v0.0.11'de `Job`, v0.0.14'te `AuditLog` ve `TenantInvitation`, v0.0.21'de
// `TenantVersionState` ve `TenantUpdateHistory` eklendi — dizinin BUGÜNKÜ
// uzunluğu aşağıdaki dizinin KENDİSİNDEN okunur, burada bir SAYI
// SABİTLENMEZ, R-PM7'nin kapattığı bayatlama sınıfı) — her üyenin
// `tenant_id` kolonu `text`, NOT NULL ve `tenant_id` öncü bir bileşik
// benzersizlik kısıtının ilk kolonudur.
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
// GENİŞLETME (ROADMAP v0.0.15, T-016/S1+S2, architect "Veri modeli +
// migration" + "T-015 listeleri" tablosu): `two_factor` (ALTINCI üye)
// EKLENDİ. İkinci faktör (TOTP sırrı + yedek kodlar) KULLANICIYA aittir,
// kiracıya değil — `session`/`account`/`verification`'ın gerekçesiyle
// BİREBİR aynı ("bir hesap → birden fazla mağaza"). `TwoFactor.userId`
// `@unique` (bkz. `prisma/schema.prisma`), `tenant_id` kolonu TAŞIMAZ.
//
// GENİŞLETME (ROADMAP v0.0.21, T-018/S2, architect VERİ MODELİ + ADR-0020
// Karar): `platform_release` (YEDİNCİ üye), `theme` (SEKİZİNCİ üye) ve
// `theme_release` (DOKUZUNCU üye) EKLENDİ → dizi ALTIDAN DOKUZA çıktı.
// Sınıflandırma ekseni ADR-0020'de yazılı: "olgu KİME aittir" — bir platform
// sürümü, bir tema veya bir tema sürümü PLATFORMUN KENDİSİNE aittir, kiracıya
// değil. §4'ün kademeli dağıtımı bile KİRACIYI sürüme atar, sürümü kiracıya
// değil; `platform_release`'e `tenant_id` eklemek "aynı platform sürümü
// kiracı başına ayrı yayınlanmış" demek olurdu. `theme.id` DOĞAL ANAHTARDIR
// (`cuid(2)` DEĞİL, bkz. `prisma/schema.prisma` → `Theme` model doc'u,
// ADR-0020 Karar 3) — bu TAKSONOMİ KARARINI ETKİLEMEZ, üçü de BU dizide
// kalır. ⚠ `arkesoft_app`'in bu üç tabloya `ALTER DEFAULT PRIVILEGES` ile
// kazandığı blanket DML yetkisi BU sürümde DARALTILMADI (ADR-0020 Sonuçlar,
// `security` gate'ine bırakıldı).
// GENİŞLETME (ROADMAP v0.1.0, T-019/S1, architect VERİ MODELİ): `plan`
// (ONUNCU üye) EKLENDİ → dizi DOKUZDAN ONA çıktı. Bir plan ŞABLONU
// platformun kendisine aittir, kiracıya değil — `theme`/`theme_release`'in
// BİREBİR aynı sınıflandırma ekseni ("olgu KİME aittir", ADR-0020). `id`
// DOĞAL ANAHTARDIR (`theme.id` emsali) — bu TAKSONOMİ KARARINI ETKİLEMEZ.
// ⚠ `arkesoft_app`'in `plan`'da taşıdığı blanket DML yetkisi bu sürümde
// DARALTILMADI (`theme`/`theme_release`/`platform_release`'in BİREBİR aynı
// ertelemesi, ADR-0021 Sonuçlar) — `security` gate'ine bırakıldı.
//
// GENİŞLETME (ROADMAP v0.0.20, T-021/S3, architect VERİ MODELİ + ADR-0023
// Karar 1/3): `platform_admin` (ON BİRİNCİ üye) ve `platform_audit_log`
// (ON İKİNCİ üye) EKLENDİ → dizi ONDAN ON İKİYE çıktı. Platform yetkisi
// kaydı ve platform yöneticisi eylem denetimi PLATFORMUN KENDİSİNE aittir,
// kiracıya değil — `theme`/`plan`'ın BİREBİR aynı sınıflandırma ekseni
// ("olgu KİME aittir"). ⭐ `TENANT_SCOPED_TABLES` (aşağıda) BU GENİŞLEMEYLE
// DEĞİŞMEDİ — yeni bir kiracı tablosu YOK, prob tamlığı kapısı
// (`tenant-isolation-suite.ts`) KIRMIZIYA DÖNMEDİ (v0.0.21/v0.1.0'ın BİREBİR
// TERSİ). İki tablo da RLS politikası TAŞIMAZ (migration linter'ının
// `TENANT_ID_ON_PLATFORM_TABLE` kuralı). ⚠ `arkesoft_app`'in bu iki tabloda
// taşıdığı blanket DML yetkisi (`ALTER DEFAULT PRIVILEGES`) `theme`/`plan`
// ile BİREBİR aynı ertelemeyle DARALTILMADI — kayıtlı borç (ROADMAP:3106),
// bu sürümde BÜYÜTÜLDÜ (vade v0.0.20.1, kullanıcı kararı). ⚠⚠ CLAUDE.md §7
// "dört liste" (`AUTH_SECRET_BEARING_TABLES` vb.) BU İKİSİNE DOKUNMAZ — ikisi
// de parola özeti/token/TOTP sırrı/kurtarma kodu TAŞIMAZ (ölçülmüş karar,
// architect T-021).
//
// GENİŞLETME (ROADMAP v0.0.18, T-027/S6, architect VERİ MODELİ — AC-48/
// AC-49): `currency` (ON ÜÇÜNCÜ üye) EKLENDİ → dizi ON İKİDEN ON ÜÇE çıktı.
// Bir para birimi tanımı (ISO 4217 kodu + ondalık basamak) PLATFORMUN
// KENDİSİNE aittir, kiracıya değil — `theme`/`plan`/`platform_admin`'in
// BİREBİR aynı sınıflandırma ekseni. RLS politikası TAŞIMAZ (migration
// linter'ının `TENANT_ID_ON_PLATFORM_TABLE` kuralı). ⭐ `TENANT_SCOPED_TABLES`
// BU GENİŞLEMEYLE DEĞİŞMEDİ — yeni bir kiracı tablosu YOK, prob tamlığı
// kapısı KIRMIZIYA DÖNMEDİ. ⚠⚠ `currency` BİLEREK ÜÇ listeye EKLENMEDİ
// (`APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`, `AUTH_SECRET_BEARING_TABLES` +
// üç kardeşi, yetki DDL'i — gerekçe her listenin kendi yorumunda/
// `prisma/schema.prisma` → `Currency` model doc'unda): bu tablo sır
// TAŞIMAZ ve `arkesoft_app`'in bu tabloda taşıdığı blanket DML yetkisi
// `theme`/`plan`/`platform_admin` ile BİREBİR aynı ertelemeyle
// DARALTILMADI — borç `[low]` bu satırda, vade v0.4.0 (ilk para kolonu FK
// verdiğinde §9 fiil kümesi genelleştirilerek daraltılmalı, sorumlu `db`).
// ⭐ TEK DOĞRULUK KAYNAĞI BU DİZİ DEĞİL — `currency` tablosunun satırlarının
// doğruluğu `packages/i18n`'in `SUPPORTED_CURRENCIES`'ine karşı
// `src/__tests__/currency-i18n-consistency.test.ts`'in iki yönlü drift
// testiyle doğrulanır; bu dizi yalnızca TAKSONOMİ (platform mi/kiracı mı)
// sorusuna cevap verir.
export const PLATFORM_LEVEL_TABLES = [
  'tenant',
  'app_user',
  'session',
  'account',
  'verification',
  'two_factor',
  'platform_release',
  'theme',
  'theme_release',
  'plan',
  'platform_admin',
  'platform_audit_log',
  'currency',
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
// GENİŞLETME (ROADMAP v0.0.21, T-018/S2, architect VERİ MODELİ + ADR-0020
// Karar 1): `tenant_version_state` (BEŞİNCİ üye) ve `tenant_update_history`
// (ALTINCI üye) EKLENDİ → dizi DÖRTTEN ALTIYA çıktı. `tenant_version_state`
// kiracının BUGÜNKÜ sürüm bileşiminin TEK yazılabilir doğruluk kaynağıdır
// (ADR-0020 Karar 1 — `Tenant.themeId`/`themeVersion` bu sürümden itibaren
// DEPRECATED ayna kolondur, DDL değişmedi). İki tablo da `tenant_membership`/
// `job`/`audit_log`/`tenant_invitation`'ın taşıdığı tüm değişmezleri
// (CLAUDE.md §7 md 1-3) taşır. ⚠⚠ Bu iki satırlık değişiklik K7/K8 AYRI alt
// görevlerde kapatıldı (po, bağlayıcı): bu alt görev (S2) yalnızca TAKSONOMİ
// kaydını ve migration SQL'ini yazar; `TenantScopedProbe` kaydı AYRI bir alt
// görevin (S4) işidir ve BİLEREK bu oturumda YAZILMADI — kabul kriteri prob
// tamlığı kapısının (`tenant-isolation-suite.ts`) bu ikisi için GERÇEK bir
// `expect` başarısızlığı üretmesini (T-014/S1 emsali, `skip` DEĞİL) GÖZLEMEK
// istiyor. ⚠ Prob KAYDI HÂLÂ TEK YERDEDİR
// (`__tests__/tenant-membership.isolation.test.ts`) — İKİNCİ bir çağrı
// noktası AÇILMAZ.
// GENİŞLETME (ROADMAP v0.1.0, T-019/S1, architect VERİ MODELİ — ADR-0021):
// `subscription` (YEDİNCİ üye) EKLENDİ → dizi ALTIDAN YEDİYE çıktı. En yakın
// emsal `tenant_version_state`: `tenant_id` `text` NOT NULL, RLS
// `ENABLE`+`FORCE`, kanonik `USING`/`WITH CHECK` politikası ve `tenant_id`
// öncü bileşik indeksler — tam detay `prisma/schema.prisma` → `Subscription`
// model doc'u. ⚠⚠ Bu satır TEK BAŞINA prob tamlığı kapısını (K-E10,
// `tenant-isolation-suite.ts`) KIRMIZIYA döndürür — BİLEREK, `job`/
// `audit_log`+`tenant_invitation` emsali (yukarıdaki v0.0.11/v0.0.14
// notları): kabul kriteri o başarısızlığın GÖZLENMESİNİ istiyor, prob kaydı
// AYRI bir alt görevin (S5) işi ve BİLEREK bu oturumda YAZILMADI. ⚠ Prob
// KAYDI HÂLÂ TEK YERDEDİR (`__tests__/tenant-membership.isolation.test.ts`)
// — İKİNCİ bir çağrı noktası AÇILMAZ.
export const TENANT_SCOPED_TABLES = [
  'tenant_membership',
  'job',
  'audit_log',
  'tenant_invitation',
  'tenant_version_state',
  'tenant_update_history',
  'subscription',
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
// ettiği ROADMAP madde 4): tablo bazlı `REVOKE` yalnızca BU tablolara
// uygulanır — `tenant`/`app_user` KAPSAM DIŞI (ADR-0008:53'ün ölçtüğü canlı
// kullanım `tenant` 32, `user` 5, `tenantMembership` 1 — literal daraltma
// uygulamayı kırardı).
//
// GENİŞLETME (ROADMAP v0.0.15, T-016/S2, architect "T-015 listeleri"
// tablosu/K-A5 DÜZELTME 1): `two_factor` EKLENDİ — `secret` ve
// `backupCodes` kolonları (ikisi de uygulama seviyesinde şifreli) TOTP
// sırrı/yedek kod taşır. ⚠ DÜZELTME 1 (task dosyasının ÇÜRÜTÜLEN ilk iddiası,
// `bootstrap-roles.sql` doc'una bakın): dış `FOREACH` döngüsü SABİT LİTERAL
// bir dizidir, kolon döngüsü İÇTEDİR — yeni tablo bu diziye ELLE eklenmeden
// hiç ziyaret edilmez ve `arkesoft_app`'in `two_factor`'daki yetkisi
// `ALTER DEFAULT PRIVILEGES` ile OTOMATİK gelip REVOKE EDİLMEZ.
export const AUTH_SECRET_BEARING_TABLES = [
  'account',
  'session',
  'verification',
  'two_factor',
] as const

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
// GENİŞLETME (ROADMAP v0.0.15, T-016/S2, architect "T-015 listeleri"
// tablosu — BAĞLAYICI NOT): `two_factor` kaydı `account`/`session`/
// `verification` EMSALİNİ izler (`columnLevel: true, expectsTableDelete:
// true`) — `app_user` EMSALİ (`columnLevel: false`) DEĞİL. Gerekçe:
// `two_factor` da sır taşıyan bir tablodur (`secret`, `backupCodes`), tablo
// bazlı yetki değil kolon bazlı yetki + ayrı tablo seviyesi `DELETE`
// beklenir — tam `AUTH_SECRET_BEARING_TABLES`'ın üçüncü üyesiyle aynı şekil.
export const AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS: readonly AuthRoleTablePrivilegeExpectation[] =
  [
    { tableName: 'account', columnLevel: true, expectsTableDelete: true },
    { tableName: 'session', columnLevel: true, expectsTableDelete: true },
    { tableName: 'verification', columnLevel: true, expectsTableDelete: true },
    { tableName: 'two_factor', columnLevel: true, expectsTableDelete: true },
    { tableName: 'app_user', columnLevel: false, expectsTableDelete: false },
  ] as const

// GENİŞLETME (ROADMAP v0.0.20.2, T-023/S2, architect "Veri modeli — beyan
// VERİ" + K-A17 adım ①, kullanıcı kararı 2026-11-17): `arkesoft_app`'in bir
// tablo üzerindeki BEKLENEN yetkisinin KAPALI küme beyanı — `AuthRoleTable
// PrivilegeExpectation`'ın EMSALİ (v0.0.14.1, T-015/ST-C) ama AYRI BİR TİP
// (farklı rol, farklı semantik: beş fiil birebir karşılaştırılır, "en az"
// YOK — `columnLevel`'ı iki anlamda kullanmaya zorlamamak için tek tipe
// SIKIŞTIRILMADI).
//
// TARİHSEL NOT (K-A17 SIRASI — adım ①, S2'de GEÇİCİ olarak BOŞ bırakılmıştı):
// architect'in ölçtüğü "her iki yönde kırmızı pencere" sorununun çözümü —
// beyan DDL'den ÖNCE eklenirse `APP_ROLE_UNEXPECTED_PRIVILEGE` (katalog
// henüz REVOKE edilmedi), DDL'den SONRA eklenirse eski
// `APP_ROLE_MISSING_DML_PRIVILEGE` ateşlenir (yeni kuralın `continue`u henüz
// YOK). Boş beyanla AC-11(a)'nın kanıt mekanizması kuruldu: o adımda canlı
// bulgu kümesi BAYT-BİREBİR bugünküyle AYNI kaldı. İki satır
// (`audit_log`/`platform_audit_log`, `{canSelect: true, canInsert: true,
// canUpdate: false, canDelete: false, canTruncate: false}`) S6'da (K-A17
// adım ③, AŞAĞIDA) DDL'le (§9) AYNI OTURUMDA eklendi — dizi artık BOŞ DEĞİL.
export type AppRoleTablePrivilegeExpectation = {
  readonly tableName: string
  readonly canSelect: boolean
  readonly canInsert: boolean
  readonly canUpdate: boolean
  readonly canDelete: boolean
  readonly canTruncate: boolean
}

// GENİŞLETME (ROADMAP v0.0.20.2, T-023/S6, architect K-A17 adım ③, kullanıcı
// kararı 2026-11-17): dizi artık BOŞ DEĞİL — `audit_log` ve `platform_audit_log`
// için KAPALI küme beyanı eklendi (`{SELECT, INSERT}` var, `{UPDATE, DELETE,
// TRUNCATE}` yok). Bu iki satır `sql/bootstrap-roles.sql`'in YENİ §9'uyla
// (`REVOKE UPDATE, DELETE, TRUNCATE ON audit_log/platform_audit_log FROM
// arkesoft_app`) AYNI OTURUMDA eklendi — K-A17'nin "her iki yönde kırmızı
// pencere" riskini önleyen BAĞLAYICI sıra (①②③④⑤) burada ③'ü tamamlıyor.
// ⚠⚠ Bu iki satır DDL'den (§9) AYRI bir commit'e/oturuma BÖLÜNEMEZ — beyan
// DDL'den önce tek başına eklenirse `APP_ROLE_UNEXPECTED_PRIVILEGE` (katalog
// henüz REVOKE edilmedi), DDL'den sonra tek başına uygulanırsa (beyansız)
// eski `APP_ROLE_MISSING_DML_PRIVILEGE` ateşlenir — ikisi de CI'ı kırıp
// "beyanı geri al / linteri gevşet" baskısı doğurur (R-PO4, CLAUDE.md §10.6).
// İKİ SQL DİZİSİYLE (bootstrap §9 + rollback-audit-append-only.sql) İKİ
// YÖNLÜ tutarlılığı `__tests__/append-only-tables-sql-consistency.test.ts`
// mekanik olarak doğrular — bu üçlünün (beyan + 2 SQL dizisi) CLAUDE.md §7
// "dört liste" tuzağının KARDEŞİ olduğu `D11` borcuna (ROADMAP) not düşüldü.
//
// `as const satisfies` TERCİH EDİLDİ (açık tip bildirimi DEĞİL) — S3'ün
// ampirik ölçtüğü sınıf: açık `: readonly AppRoleTablePrivilegeExpectation[]`
// bildirimi `tableName`'i `string`'e GENİŞLETİR ve bu modülün DIŞINA taşan
// her `Exclude<>` pin'ini (bu dosyadaki `AppRoleTablePrivilegeExpectation`
// gibi bir tip üzerinden) KALICI OLARAK KIRMIZI yapardı (S3'ün pin dosyası
// bu yüzden bir AYNA kullanmak zorunda kalmıştı, `V-S3-2`). `as const
// satisfies` LİTERAL tipleri KORUR ve şekli yine DOĞRULAR — pin artık
// aynaya değil GERÇEK sabite bağlanabilir (bkz.
// `__tests__/type-pins/app-role-privilege-expectations.pin.ts`).
export const APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS = [
  {
    tableName: 'audit_log',
    canSelect: true,
    canInsert: true,
    canUpdate: false,
    canDelete: false,
    canTruncate: false,
  },
  {
    tableName: 'platform_audit_log',
    canSelect: true,
    canInsert: true,
    canUpdate: false,
    canDelete: false,
    canTruncate: false,
  },
] as const satisfies readonly AppRoleTablePrivilegeExpectation[]
