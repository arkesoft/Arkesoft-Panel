// @arkesoft/db — canlı katalog bulgularını değerlendiren SAF kural motoru
// (ROADMAP v0.0.13, T-005/S4, architect K-E5)
//
// SAFLIK (K-E5/K-C4 deseni, zorunlu): bu dosya DB'ye DOKUNMAZ (bağlantı
// açmaz, ham SQL sorgusu çalıştırmaz) ve test çalıştırma çerçevesini İMPORT
// ETMEZ. Girdisi
// `catalog-snapshot.ts`'in ürettiği, ZATEN Zod ile parse edilmiş
// `CatalogSnapshot` nesnesidir — bu dosya yalnızca "bu doğru mu?" sorusunu
// saf fonksiyonla yanıtlar; "ne var?" sorusunu `catalog-snapshot.ts` yanıtladı.
// Bu ayrım `__tests__/catalog-lint.test.ts`'in DB'siz, saf birim testi olarak
// koşmasını sağlar (fixture'larla kural kodlarının tamamı burada doğrulanır).
//
// TAKSONOMİ PARAMETREDİR, modülden import EDİLMEZ (AC9'un mekanizması):
// çağıran (`createTenantIsolationSuite()`/isolation testleri) `src/tenancy.ts`
// → `TENANT_SCOPED_TABLES`/`PLATFORM_LEVEL_TABLES`'ı okuyup `LintCatalogOptions.
// taxonomy` olarak GEÇİRİR. `TENANT_SCOPED_TABLES`'a ikinci tablo eklendiğinde
// BU DOSYANIN KAYNAK KODU DEĞİŞMEDEN linter onu zorlar (MISSING_TABLE/
// MISSING_TENANT_ID_COLUMN/… katalogda karşılığı yoksa düşer).
//
// GUC ADI LİTERAL YAZILMAZ (R-P3(c), AC4'ün yapısal ön koşulu): tenant
// context'in okuduğu Postgres ayarının adı bu dosyada literal YOKTUR —
// çağıran `tenant-context.ts`'in dışa açtığı sabiti `LintCatalogOptions.
// tenantContextSetting` olarak GEÇİRİR. `POLICY_USING_NOT_CANONICAL`/
// `POLICY_WITH_CHECK_NOT_CANONICAL` kuralları bu DEĞERDEN (sabitten, literal
// GUC adından DEĞİL) `buildCanonicalPolicyExpression()` ile beklenen TAM
// ifadeyi ÜRETİR ve politika ifadesiyle BİREBİR karşılaştırır.
//
// KURAL KODLARININ TEK DOĞRULUK KAYNAĞI `TENANT_ISOLATION_RULES`'TIR (ROADMAP
// v0.0.14.1, T-015/ST-C, R-PM7'nin yapısal çözümü): prose'ta artık hiçbir
// sabit sayı YOKTUR — dizinin eleman sayısı `TENANT_ISOLATION_RULES.length`
// ile, her kodun üretildiği en az bir fixture `__tests__/catalog-lint.test.ts`
// içinde MEKANİK olarak doğrulanır. Eskiden burada dört ayrı yerde elle
// yazılı bir sayı vardı (development.md kural (g)'nin tam konusu) — her yeni
// kural eklendiğinde dördü de BAYATLIYORDU; artık bayatlayacak bir sayı YOK.
//
// Kategoriler (kodun kendisi `TENANT_ISOLATION_RULES`'ta, bağlayıcı sıra
// DEĞİL — bu liste yalnızca OKUYUCU için gruplama):
//   taksonomi→katalog: MISSING_TABLE, MISSING_TENANT_ID_COLUMN,
//     NULLABLE_TENANT_ID_COLUMN, WRONG_TENANT_ID_TYPE,
//     MISSING_TENANT_ID_LEADING_INDEX, RLS_NOT_ENABLED, RLS_NOT_FORCED,
//     MISSING_TENANT_POLICY, POLICY_MISSING_WITH_CHECK,
//     POLICY_USING_NOT_CANONICAL, POLICY_WITH_CHECK_NOT_CANONICAL,
//     POLICY_RESTRICTED_TO_ROLE, APP_ROLE_MISSING_DML_PRIVILEGE
//   katalog→taksonomi: UNCLASSIFIED_TABLE, TENANT_ID_ON_PLATFORM_TABLE,
//     TENANT_ID_WITHOUT_TAXONOMY_ENTRY
//   rol (T-015/ST-C'de ÖZNESİ genişledi — iki çalışma zamanı rolü):
//     APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS, APP_ROLE_OWNS_TABLE,
//     ROLE_HAS_EXCESS_ATTRIBUTE (YENİ)
//   platform/ledger: APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE
//   auth rolü / sır taşıyan tablo yetkisi (T-015/ST-C, YENİ — ADR-0008 borcu):
//     APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE,
//     AUTH_ROLE_MISSING_COLUMN_PRIVILEGE,
//     AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE,
//     AUTH_ROLE_MISSING_TABLE_PRIVILEGE, AUTH_ROLE_EXCESS_TABLE_PRIVILEGE,
//     UNEXPECTED_COLUMN_LEVEL_GRANTEE, UNEXPECTED_TABLE_LEVEL_GRANTEE (FIX
//     turu 1, YENİ — security Tur 1 [medium] S-1 bulgusu, Kaynak C)
//   katalog bütünlüğü (FIX turu 2, YENİ — security Tur 2 [high] S-7 bulgusu,
//     Kaynak D): UNEXPECTED_RELATION_KIND
//   fonksiyon yürütme hakkı (FIX turu 2, YENİ — security Tur 2 [medium] S-8
//     bulgusu, Kaynak E — "hibe" ekseni): UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE
//   fonksiyon varlığı (FIX turu 3, YENİ — security Tur 3 [medium] S-15
//     bulgusu, Kaynak E — "varlık" ekseni, taksonomi-bağımsız, Kaynak D'nin
//     deseniyle): UNEXPECTED_SECURITY_DEFINER_FUNCTION
//   fail-closed: EMPTY_CATALOG_SNAPSHOT
//
// FIX turu 1 (security Tur 1 [medium] S-1 bulgusu — KAYNAK C): Kaynak A
// (`has_table_privilege`) sadece İKİ ADLANDIRILMIŞ rolü (`appRoleName`/
// `authRoleName`) sorguluyordu — ÜÇÜNCÜ, adlandırılmış bir role verilen
// TABLO SEVİYESİ bir hibe (örn. `GRANT SELECT ON public.account TO
// bi_reader`) hiçbir kural tarafından GÖRÜLMÜYORDU (Kaynak B/`attacl` de
// bunu YAKALAMAZ — tablo seviyesi hibe `pg_class.relacl`de yaşar, `attacl`de
// DEĞİL). `security`'nin M1 mutasyonu bunu ÖLÇTÜ: SURVIVED, linter 0 bulgu
// verdi. KAYNAK C (`pg_class.relacl` + `aclexplode`, `readTableGrants`)
// bu boşluğu kapatır — `UNEXPECTED_TABLE_LEVEL_GRANTEE`nin zemini.
//
// AMPİRİK ÖLÇÜLMÜŞ ASİMETRİ (BAĞLAYICI, Kaynak B/`attacl`'den FARKLI):
// `attacl`de tablo SAHİBİ `grantee` olarak GÖRÜNMEZ (ST-A0③, `owner_row_count
// = 0`); `relacl`de tablo SAHİBİ `grantee` olarak GÖRÜNÜR — canlı Postgres'te
// ölçüldü (`arkesoft_migrator` HER tabloda SEKİZ privilege_type'ın hepsiyle
// `grantee` olarak listelenir, bir GRANT/REVOKE DDL'i o tabloyu MATERYALİZE
// ettiği an). Bu yüzden `UNEXPECTED_TABLE_LEVEL_GRANTEE`'nin beklenen
// grantee kümesi `{appRoleName, authRoleName, table.tableOwner}`DİR —
// `table.tableOwner` LİTERAL DEĞİL, `snapshot.tables[].tableOwner`'dan
// OKUNUR (her tablo için AYRI, R-PO6'nın AYNI deseni — tahminle yazılsaydı
// kural KALICI yanlış pozitif verirdi). Bu kural, diğer beş auth-rolü
// kuralıyla AYNI `authRole` kapısının ARDINDADIR (yalnızca o alan
// geçirildiğinde değerlendirilir) — `authRoleName` YOKKEN beklenen küme
// `{appRoleName, table.tableOwner}`e düşerdi ve bugün canlı veritabanında
// ÜÇ sır taşıyan tabloda zaten VAR olan `arkesoft_auth` hibeleri (DELETE)
// YANLIŞ POZİTİF üretirdi — dondurulmuş beş çağrı noktası (hiçbiri `authRole`
// geçirmiyor) bu yüzden bu kuralı da HİÇ görmez, kalıcı yanlış pozitif
// riski YAPISAL olarak kapanır.
//
// FIX turu 2 (security Tur 2 [high] S-7 bulgusu — KAYNAK D,
// `UNEXPECTED_RELATION_KIND`): bu sürümün kurduğu sınır sıradan bir `CREATE
// VIEW`/`CREATE MATERIALIZED VIEW` ile ATLANABİLİYORDU. `ALTER DEFAULT
// PRIVILEGES … ON TABLES` (bootstrap-roles.sql bölüm 4) view/matview'ı DA
// kapsar — `account` üzerine bir view yazıldığı AN `arkesoft_app`'e HİÇBİR
// `GRANT` yazılmadan `arwd` hibe olur ve view SAHİBİNİN yetkisiyle çalıştığı
// için kolon bazlı kısıtlamayı BAYPAS eder. ÜÇ TASARIM SEÇENEĞİ ÖLÇÜLDÜ:
//   (A) Kaynak C'yi (`readTableGrants`) `relkind IN ('r','p','v','m','f')`'e
//       genişletmek + RLS/indeks/`tenant_id` kurallarını `relkind`'e göre
//       daraltmak — EN GENİŞ diff, üç kuralın yeniden sınanmasını gerektirir.
//   (B) `readTables()`'ı (Kaynak "tablo okuyucusu") körlemesine genişletmek
//       — REDDEDİLDİ: bu okuyucunun çıktısı RLS/indeks/`tenant_id`
//       kurallarını besliyor, view'da bunların HİÇBİRİ yapısal olarak
//       YOKTUR → üç YENİ yanlış pozitif açardı (ilk tepki kuralı GEVŞETMEK
//       olurdu, §10 md 6 ihlali).
//   (C) SEÇİLDİ — bağımsız, yeni bir okuyucu (Kaynak D) + yeni, taksonomiden
//       BAĞIMSIZ bir kural: `public`te `relkind IN ('v','m','f')` olan HER
//       nesne bulgu üretir. Bugün sayı SIFIR (ölçüldü) → yanlış pozitif
//       SIFIR, mesaj net, diff EN KÜÇÜK, mevcut üç kuralın (RLS/indeks/
//       tenant_id) davranışı DEĞİŞMEZ.
// `UNEXPECTED_TABLE_LEVEL_GRANTEE`'nin beklenen kümesi `{appRoleName,
// authRoleName, tableOwner}` OLDUĞU için Kaynak C'yi tek başına
// genişletmek YETMEZDİ — `arkesoft_app` KÜMEDE olduğundan kural
// ATEŞLENMEZ; bu yüzden (C) `UNCLASSIFIED_TABLE`in (katalog→taksonomi,
// Kaynak "tablo okuyucusu" temelli) GÖRMEDİĞİ boşluğu KENDİ bağımsız
// kaynağıyla kapatır, grantee SORUSU SORMAZ.
//
// GÜNCELLEME (ROADMAP v0.0.14.1, T-015/ST-C — ADR-0008'in v0.0.14'e vadeli
// borcu, architect "Bağlayıcı yetki beyanı" + kullanıcı kararı 2026-11-05):
// yedi yeni kural + üç özne genişletmesi eklendi. Beklenti verisi (hangi
// tablo sır taşıyor, hangi şekilde) `src/tenancy.ts`'te YAŞAR — bu dosyaya
// LİTERAL GİRMEZ (K-E5/AC9'un AYNI deseni, GUC adı için zaten kurulu): bu
// veri `LintCatalogOptions.authRole` üzerinden TEK, OPSİYONEL bir nesne
// olarak geçer.
//
// FIX turu 1 (qa Tur 1 [medium] QA-1 bulgusu): `authRole` eskiden ÜÇ AYRI
// opsiyonel alandı (`authRoleName?`, `authSecretBearingTables?`,
// `authRoleTablePrivilegeExpectations?`) — "hep ya da hiç" olması gereken üç
// alan BAĞIMSIZ opsiyoneldi. `qa` mutasyonla kanıtladı: `authRoleName`
// çıkarıldığında TypeScript hata VERMEDİ ve beş auth-rolü kuralı bozuk veri
// karşısında SESSİZCE `[]` döndürdü — yapısal koruma YOKTU. Çözüm: TEK İÇ
// İÇE opsiyonel alan (`authRole?: { roleName; secretBearingTables;
// tablePrivilegeExpectations }`) — "hep ya da hiç" artık TİPTE zorlanır: ya
// üçü BİRDEN geçirilir ya HİÇBİRİ (nesnenin kendisi opsiyonel, İÇİ değil).
// `lintCatalog`'un üçlü `undefined` kontrolü TEK kontrola indi (aşağıya bakın).
//
// OPSİYONEL OLMASININ GEREKÇESİ — TS TİPİ SEVİYESİNDE EXPAND/CONTRACT:
// `__tests__/catalog-lint-live.isolation.test.ts` (ST-B'nin dondurduğu,
// ST-E'nin yeni canlı kanıtlar yazdığı dosya) `lintCatalog()`'u BEŞ yerde
// `authRole` alanını HİÇ GEÇİRMEDEN çağırıyor — o dosyaya bu alt görevde
// DOKUNULMADI (handoff'un açık yasağı). Alan ZORUNLU olsaydı o dosya
// DERLENMEZDİ. Opsiyonel bırakmak "önce ekle" (expand) adımıdır; o beş çağrı
// noktasının `authRole`'u GEÇİRECEK hâle getirilmesi (tüket/contract) ileri
// bir alt görevin işi — o zamana kadar auth rolüne özgü kurallar (aşağıda)
// o çağrı noktası için SESSİZCE değerlendirilMEZ (yeni bulgu üretmez, eski
// davranışı DEĞİŞTİRMEZ).
//
// `lintAppRoleDmlPrivileges`'İN TADİLİ (ROADMAP madde 3, "mevcut tablo
// yetkisi kuralının üç tablo için kolon bazlı sorguya tadil edilmesi") BU
// OPSİYONEL alanlara BAĞLI DEĞİLDİR — yukarıdaki dondurulmuş çağrı noktası
// için de DOĞRU sonucu üretmesi GEREKİR (aksi hâlde ST-D'nin DDL'i uygulanır
// uygulanmaz o dosyanın "sağlıklı durum" testi APP_ROLE_MISSING_DML_PRIVILEGE
// ile KIRMIZIYA döner — gerçek bir regresyon, yeni kuralların "beklenen
// kırmızısı" DEĞİL). Çözüm SNAPSHOT VERİSİNİN KENDİSİNDEN: bir tabloda EN AZ
// BİR kolon seviyesi hibe (`columnGrants`, Kaynak B) VARSA o tablo artık
// "kolon rejimi"ne geçmiş sayılır ve `arkesoft_app`'in o tabloda TAM DML
// taşıması beklentisi ARTIK UYGULANMAZ (o tablonun `arkesoft_app` durumu
// `APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE`'ın öznesidir, bunun DEĞİL). Bu
// çıkarım hiçbir tablo/rol adı LİTERALİ gerektirmez (K-E5/AC9 korunur) ve
// ST-D'nin DDL'i uygulanmadan önce (`columnGrants` BOŞ, ST-B'nin ölçtüğü
// taban) eski davranışı DEĞİŞTİRMEZ — yalnızca DDL uygulandıktan SONRA
// devreye girer.
//
// FIX turu 3 (security Tur 3 [medium] S-15 bulgusu) — `UNEXPECTED_FUNCTION_
// EXECUTE_PRIVILEGE` (FIX turu 2) YALNIZCA "hibe" eksenini (PUBLIC'e EXECUTE
// verilmiş mi) soruyordu. ÖLÇÜLEN KAÇIŞ: `REVOKE EXECUTE ON FUNCTION … FROM
// PUBLIC` + `GRANT EXECUTE ON FUNCTION … TO arkesoft_app` iki satırı
// `hasPublicExecute`'u `false`'a düşürür ve bir `SECURITY DEFINER`
// fonksiyonu bu kuraldan TAMAMEN KAÇIRIR — canlı ölçüldü: `arkesoft_app`
// sıfır tablo yetkisiyle bu yoldan `account.password`'u OKUYABİLİYORDU.
// `solid`'in ölçülmüş tasarım reçetesi (D ve E'nin karıştığı iki eksen,
// E'nin İKİYE bölünmesi gerektiği) birebir uygulandı:
//   - Okuyucu TEK KALDI (`readFunctionPrivileges`, `catalog-snapshot.ts`):
//     `isSecurityDefiner` (`p.prosecdef`) ve `functionExecuteGrantees`
//     (`pg_proc.proacl` + `aclexplode`) EKLENDİ — "ne var" sorusu orada.
//   - İKİ AYRI KURAL KODU: mevcut `UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`
//     (hibe ekseni, DOKUNULMADI) + YENİ `UNEXPECTED_SECURITY_DEFINER_FUNCTION`
//     (varlık ekseni, Kaynak D'nin `lintUnexpectedRelationKinds`'ıyla
//     BİREBİR aynı taksonomi-bağımsız/koşulsuz desen — `authRole` kapısının
//     DIŞINDA). Tek kod altında birleştirmek, ileride meşru bir `SECURITY
//     DEFINER` için bir allowlist açıldığında İKİSİNİ BİRLİKTE sustururdu.
//   - `pg_class`/`pg_proc` okuyucuları (Kaynak D/E) BİRLEŞTİRİLMEDİ — farklı
//     sebeplerle değişen (relkind etiketi vs fonksiyon güvenlik niteliği) ve
//     farklı çözümü olan iki eksen; ortaklaştırılacak şey en fazla "satır
//     başına koşulsuz bulgu" deseni, bunun için yardımcı fonksiyon yazmak
//     ERKEN SOYUTLAMA olurdu (solid'in gerekçesi).

import type { CatalogSnapshot } from './catalog-snapshot.js'

/**
 * Linter'ın üretebileceği TÜM bulgu kodları — TEK doğruluk kaynağı. Eleman
 * sayısı ve "her kod en az bir fixture'da üretiliyor mu" sorusu
 * `__tests__/catalog-lint.test.ts`'te MEKANİK olarak doğrulanır; burada
 * sabit bir sayı YAZILMAZ (R-PM7'nin yapısal çözümü).
 */
export const TENANT_ISOLATION_RULES = [
  'MISSING_TABLE',
  'MISSING_TENANT_ID_COLUMN',
  'NULLABLE_TENANT_ID_COLUMN',
  'WRONG_TENANT_ID_TYPE',
  'MISSING_TENANT_ID_LEADING_INDEX',
  'RLS_NOT_ENABLED',
  'RLS_NOT_FORCED',
  'MISSING_TENANT_POLICY',
  'POLICY_MISSING_WITH_CHECK',
  'POLICY_USING_NOT_CANONICAL',
  'POLICY_WITH_CHECK_NOT_CANONICAL',
  'POLICY_RESTRICTED_TO_ROLE',
  'APP_ROLE_MISSING_DML_PRIVILEGE',
  'UNCLASSIFIED_TABLE',
  'TENANT_ID_ON_PLATFORM_TABLE',
  'TENANT_ID_WITHOUT_TAXONOMY_ENTRY',
  'APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS',
  'APP_ROLE_OWNS_TABLE',
  'APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE',
  // T-015/ST-C — YENİ (ADR-0008 borcu, architect "Bağlayıcı yetki beyanı").
  'APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE',
  'AUTH_ROLE_MISSING_COLUMN_PRIVILEGE',
  'AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE',
  'AUTH_ROLE_MISSING_TABLE_PRIVILEGE',
  'AUTH_ROLE_EXCESS_TABLE_PRIVILEGE',
  'UNEXPECTED_COLUMN_LEVEL_GRANTEE',
  // FIX turu 1, YENİ — security Tur 1 [medium] S-1 bulgusu (Kaynak C).
  'UNEXPECTED_TABLE_LEVEL_GRANTEE',
  'ROLE_HAS_EXCESS_ATTRIBUTE',
  // FIX turu 2, YENİ — security Tur 2 [high] S-7 bulgusu (Kaynak D).
  'UNEXPECTED_RELATION_KIND',
  // FIX turu 2, YENİ — security Tur 2 [medium] S-8 bulgusu (Kaynak E).
  'UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE',
  // FIX turu 3, YENİ — security Tur 3 [medium] S-15 bulgusu (Kaynak E'nin
  // "varlık" ekseni, `prosecdef`). AYRI koddur, `UNEXPECTED_FUNCTION_
  // EXECUTE_PRIVILEGE`'in (hibe ekseni) GENİŞLETİLMİŞ hâli DEĞİL — solid'in
  // bağlayıcı gerekçesi: tek kod altında birleştirmek, ileride meşru bir
  // `SECURITY DEFINER` için allowlist açıldığında ikisini BİRLİKTE susturur.
  'UNEXPECTED_SECURITY_DEFINER_FUNCTION',
  'EMPTY_CATALOG_SNAPSHOT',
] as const

/** {@link TENANT_ISOLATION_RULES} elemanlarının birleşim tipi. */
export type TenantIsolationRule = (typeof TENANT_ISOLATION_RULES)[number]

/**
 * Tek bir bulgu. `tableName` tablo bazlı olmayan kurallarda
 * (`EMPTY_CATALOG_SNAPSHOT`, rol kuralları) YOKTUR.
 *
 * ⚠ AD/İÇERİK SAPMASI (solid Tur 3 [low] SD-10 bulgusu, BORÇ — bkz. handoff
 * raporu "SD-10" bölümü, maliyeti ÖLÇÜLDÜ ve BU TURDA yeniden adlandırma
 * YAPILMADI): alan adı `tableName` olsa da FIX turu 2'den (S-7/S-8) ve FIX
 * turu 3'ten (S-15) itibaren bu alan tablo DIŞI nesne adları da taşır — VIEW/
 * MATERIALIZED VIEW/FOREIGN TABLE (`UNEXPECTED_RELATION_KIND`) ve FONKSİYON
 * adı (`UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`,
 * `UNEXPECTED_SECURITY_DEFINER_FUNCTION`). Davranış hatası YOK — yalnızca ad,
 * taşıdığı veriyi artık tam yansıtmıyor.
 */
export type LintFinding = {
  readonly rule: TenantIsolationRule
  readonly tableName?: string
  readonly message: string
}

/**
 * `lintCatalog`'un taksonomi girdisi. `src/tenancy.ts`'teki
 * `TENANT_SCOPED_TABLES`/`PLATFORM_LEVEL_TABLES` dizileriyle YAPISAL OLARAK
 * uyumludur (çağıran onları buraya kopyalar) — bu dosya o modülü import ETMEZ.
 *
 * FIX turu 2 (solid Tur 2 [low] bulgusu, B4): `export` KALDIRILDI — hiçbir
 * dosya bu tipi dışarıdan İTHAL ETMİYOR, çağıranlar yapısal uyumla (structural
 * typing) `LintCatalogOptions.taxonomy` alanına nesne geçiriyor; dışa açık
 * tutmak yanlışlıkla "bunu ithal etmen gerekiyor" izlenimi verirdi.
 */
type TenantIsolationTaxonomy = {
  readonly tenantScopedTables: readonly string[]
  readonly platformLevelTables: readonly string[]
}

/**
 * T-015/ST-C — `src/tenancy.ts`'teki `AuthRoleTablePrivilegeExpectation`
 * ile YAPISAL OLARAK uyumlu (import EDİLMEZ, `TenantIsolationTaxonomy`'nin
 * AYNI deseni — K-E5/AC9).
 */
type AuthRoleTablePrivilegeExpectationLike = {
  readonly tableName: string
  readonly columnLevel: boolean
  readonly expectsTableDelete: boolean
}

/**
 * T-015/ST-C, FIX turu 1 (qa Tur 1 [medium] QA-1 bulgusu) — auth rolüne özgü
 * ÜÇ girdi artık BAĞIMSIZ opsiyonel ALANLAR değil, TEK bir opsiyonel İÇ İÇE
 * nesnenin ÜYELERİ. "Hep ya da hiç" kısıtı böylece TİP SEVİYESİNDE zorlanır:
 * nesnenin KENDİSİ opsiyoneldir (geçirilmeyebilir — dondurulmuş eski çağrı
 * noktası için), ama geçirildiğinde ÜÇ alanın HEPSİ zorunludur (içindeki HİÇBİR
 * alan opsiyonel DEĞİL) — bir alanı unutup diğerlerini geçirmek artık
 * DERLENMEZ (aşağıdaki VACUITY kanıtına bakın, handoff raporunda tekrarlanır).
 */
type AuthRoleLintInput = {
  readonly roleName: string
  readonly secretBearingTables: readonly string[]
  readonly tablePrivilegeExpectations: readonly AuthRoleTablePrivilegeExpectationLike[]
}

/** `lintCatalog`'un tüm girdileri (anlık görüntü hariç). */
export type LintCatalogOptions = {
  readonly taxonomy: TenantIsolationTaxonomy
  /** `tenant-context.ts`'in `TENANT_CONTEXT_SETTING` sabiti — BURADA literal YAZILMAZ. */
  readonly tenantContextSetting: string
  readonly appRoleName: string
  /**
   * T-015/ST-C, FIX turu 1 — auth rolüne özgü ÜÇ girdi (rol adı, sır taşıyan
   * tablolar, tablo yetkisi beklentileri) TEK bir opsiyonel nesnede. OPSİYONEL
   * OLMASININ GEREKÇESİ: dosya başı notuna bakın — dondurulmuş eski çağrı
   * noktası bu alanı henüz geçirmiyor, aşağıdaki altı kural o çağrı noktası
   * için bu alan YOKKEN hiç değerlendirilMEZ (TS tipi seviyesinde
   * expand/contract).
   */
  readonly authRole?: AuthRoleLintInput
}

const EXPECTED_TENANT_ID_TYPE = 'text'

/**
 * Prisma'nın kendi migration defteri — taksonomiden (K-E2) BİLEREK MUAF,
 * ayrıca (FIX turu 2, B3) `lintMigrationsLedgerPrivilege`in TEK öznesi.
 */
const MIGRATIONS_LEDGER_TABLE = '_prisma_migrations'
const EXEMPT_TABLES: ReadonlySet<string> = new Set([MIGRATIONS_LEDGER_TABLE])

/**
 * RLS politika yüklemlerinin (`USING`/`WITH CHECK`) karşılaştırıldığı tenant
 * kolonu. Modül sabiti (K-E5 madde 1) — `LintCatalogOptions`'tan GEÇİRİLMEZ,
 * çünkü taksonomideki HER tenant tablosu aynı kolon adını (`tenant_id`)
 * kullanır (K1, ROADMAP).
 */
const TENANT_ID_COLUMN = 'tenant_id'

/**
 * K-E5 REVİZYONU (FIX turu 2): bir RLS politika yükleminin TEK kabul edilen
 * biçimini `settingName`'den ÜRETİR — sabit yazılmaz (K-E5 madde 2). Burada
 * literal bir GUC adı YOKTUR (R-P3(c)/AC4) — `settingName` çağırandan
 * (`LintCatalogOptions.tenantContextSetting`) gelir.
 *
 * Çıktı, canlı Postgres'in `pg_policies.qual`/`with_check` için ÜRETTİĞİ
 * deparse biçimiyle AYNIDIR (A-F1 ölçümü — `tenant_membership` üzerinde
 * ampirik doğrulandı, bkz. handoff raporu).
 */
function buildCanonicalPolicyExpression(settingName: string): string {
  return `(${TENANT_ID_COLUMN} = current_setting('${settingName}'::text, true))`
}

/**
 * K-E5 REVİZYONU (FIX turu 2, solid Tur 2 [medium] bulgusunu KAPATIR — "tur
 * 1 high'ının SINIFI kapanmadı"): verilen ifadenin `buildCanonicalPolicyExpression()`'ın
 * ürettiği dizeyle TAM (byte-birebir) eşleştiğini doğrular. Alt dize, kalıp,
 * boşluk/harf normalizasyonu veya "şunu da kabul et" istisnası YOK (K-E5
 * madde 3) — bu, eski `expressionReferencesSetting`'in (yalnızca
 * `current_setting('<ayar>'` alt dizesini arayan, hangi kolonun
 * karşılaştırıldığını hiç iddia etmeyen) BİLEREK SİLİNMİŞ yerine geçer.
 * `security`'nin ölçtüğü altı atlatma (yanlış kolon, `OR true`, `<>`,
 * `IS NOT NULL`, başka GUC + yorumda doğru GUC) VE kalıp-tabanlı bir ara
 * çözümün de atlatılabileceğini gösteren iki ek vaka (`NOT (…)`,
 * `(…) IS NOT TRUE`) bu TAM EŞİTLİK karşılaştırmasıyla hepsi KAPANIR —
 * `__tests__/catalog-lint.test.ts`'te sekizi de fixture olarak pinlenir.
 *
 * `expression === null` → `false`: eksik/NULL ifade kanonik SAYILMAZ, ama bu
 * durum zaten `POLICY_MISSING_WITH_CHECK` tarafından (WITH CHECK için) ayrı
 * bir soru olarak ele alınır — çağıran bu ayrımı `hasWithCheck` ile korur.
 */
function isCanonicalPolicyExpression(expression: string | null, settingName: string): boolean {
  return expression !== null && expression === buildCanonicalPolicyExpression(settingName)
}

/**
 * `POLICY_USING_NOT_CANONICAL`/`POLICY_WITH_CHECK_NOT_CANONICAL` bulgu
 * mesajını üretir. K-E5 madde 5 (BAĞLAYICI): BEKLENEN ve GERÇEK ifadeyi
 * birebir taşır, Postgres sürüm sapması hipotezini AÇIKÇA yazar (sapmayı
 * ayrı bir kural koduyla sınıflandırmak YASAK — ayrım mekanik olarak
 * yapılamaz). Tenant id/satır verisi TAŞIMAZ — yalnızca şema seviyesi
 * (tablo/politika adı + SQL ifadesi metni).
 */
function buildNotCanonicalMessage(
  tableName: string,
  policyName: string,
  clause: 'USING' | 'WITH CHECK',
  expected: string,
  actual: string | null,
  isSinglePolicy: boolean,
): string {
  const actualText = actual ?? 'NULL'
  const multiplicityNote = isSinglePolicy
    ? ''
    : ' Not (K-E5 madde 6): bu tabloda birden fazla politika satırı var — "tam olarak bir ' +
      'politika" kısıtına göre ifade kendi başına kanonikle eşleşse bile bulgu üretildi.'
  return (
    `"${tableName}.${policyName}" ${clause} ifadesi beklenen kanonik biçimle BİREBİR eşleşmiyor. ` +
    `Beklenen: ${expected} — Gerçek: ${actualText}. ` +
    'Not: bu kontrol TAM dize eşitliği yapar; bir Postgres sürüm sapması (deparse biçiminin ' +
    'değişmesi, örn. cast söz dizimi) bu bulguyu da üretebilir — o durumda şablonu güncelleyin, ' +
    'karşılaştırmayı GEVŞETMEYİN.' +
    multiplicityNote
  )
}

/** `policy.roles`'ın `TO` yan tümcesi YAZILMAMIŞ (yalnızca PUBLIC) anlamına geldiğini doğrular. */
function isPublicPolicy(roles: readonly string[]): boolean {
  return roles.length === 1 && roles[0] === 'public'
}

function lintTenantScopedTable(
  tableName: string,
  snapshot: CatalogSnapshot,
  tenantContextSetting: string,
): LintFinding[] {
  const findings: LintFinding[] = []

  const table = snapshot.tables.find((candidate) => candidate.tableName === tableName)
  if (table === undefined) {
    findings.push({
      rule: 'MISSING_TABLE',
      tableName,
      message: `Taksonomide "tenantScopedTables" altında listelenen tablo katalogda yok: "${tableName}".`,
    })
    return findings
  }

  const column = snapshot.columns.find(
    (candidate) => candidate.tableName === tableName && candidate.columnName === 'tenant_id',
  )
  if (column === undefined) {
    findings.push({
      rule: 'MISSING_TENANT_ID_COLUMN',
      tableName,
      message: `"${tableName}" tablosunda "tenant_id" kolonu yok.`,
    })
  } else {
    if (column.isNullable) {
      findings.push({
        rule: 'NULLABLE_TENANT_ID_COLUMN',
        tableName,
        message: `"${tableName}.tenant_id" NULL kabul ediyor (NOT NULL olmalı).`,
      })
    }
    if (column.dataType !== EXPECTED_TENANT_ID_TYPE) {
      findings.push({
        rule: 'WRONG_TENANT_ID_TYPE',
        tableName,
        message: `"${tableName}.tenant_id" tipi "${column.dataType}", beklenen "${EXPECTED_TENANT_ID_TYPE}".`,
      })
    }
  }

  const hasLeadingIndex = snapshot.indexes.some(
    (index) => index.tableName === tableName && index.columns[0] === 'tenant_id',
  )
  if (!hasLeadingIndex) {
    findings.push({
      rule: 'MISSING_TENANT_ID_LEADING_INDEX',
      tableName,
      message: `"${tableName}" üzerinde "tenant_id" öncü kolonlu bir indeks yok.`,
    })
  }

  const rowSecurity = snapshot.rowSecurity.find((candidate) => candidate.tableName === tableName)
  if (!rowSecurity?.isRowSecurityEnabled) {
    findings.push({
      rule: 'RLS_NOT_ENABLED',
      tableName,
      message: `"${tableName}" üzerinde satır seviyesi güvenlik (RLS) etkin değil.`,
    })
  } else if (!rowSecurity.isRowSecurityForced) {
    findings.push({
      rule: 'RLS_NOT_FORCED',
      tableName,
      message: `"${tableName}" üzerinde RLS etkin ama FORCE edilmemiş — tablo sahibi rolü politikayı atlar.`,
    })
  }

  const policies = snapshot.policies.filter((candidate) => candidate.tableName === tableName)
  if (policies.length === 0) {
    findings.push({
      rule: 'MISSING_TENANT_POLICY',
      tableName,
      message: `"${tableName}" için tenant izolasyon politikası yok.`,
    })
  } else {
    // K-E5 REVİZYONU (FIX turu 2, madde 6 — bilinçli daraltma): tenant
    // tablosu TAM OLARAK BİR politika taşımalı ve o politika kanonik
    // olmalıdır. `isSinglePolicy === false` ise İKİNCİ (ve sonraki) PERMISSIVE
    // politika, komut bazlı bölünmüş politika (`FOR SELECT`/`FOR INSERT`) veya
    // `AS RESTRICTIVE` eki — HER satır, kendi ifadesi kanonikle byte-birebir
    // eşleşse BİLE — `POLICY_USING_NOT_CANONICAL`/`POLICY_WITH_CHECK_NOT_CANONICAL`
    // üretir.
    const isSinglePolicy = policies.length === 1
    const expectedExpression = buildCanonicalPolicyExpression(tenantContextSetting)

    for (const policy of policies) {
      const hasWithCheck =
        policy.withCheckExpression !== null && policy.withCheckExpression.trim().length > 0

      if (!hasWithCheck) {
        findings.push({
          rule: 'POLICY_MISSING_WITH_CHECK',
          tableName,
          message: `"${tableName}.${policy.policyName}" WITH CHECK ifadesi taşımıyor.`,
        })
      }

      // K-E5 REVİZYONU (FIX turu 2, solid Tur 2 [medium] bulgusunu KAPATIR):
      // USING ve WITH CHECK AYRI AYRI, TAM EŞİTLİKLE değerlendirilir — eski
      // alt dize kontrolü (`expressionReferencesSetting`, SİLİNDİ) `USING
      // ("owner_id" = current_setting(doğru GUC))` (yanlış KOLON) ve
      // `WITH CHECK (… OR true)` (üst seviye OR) gibi vakaları tüm kuralların
      // TAMAMINDAN temiz geçiriyordu — bkz. dosya başı GÜNCELLEME notu.
      const isUsingCanonical = isCanonicalPolicyExpression(
        policy.usingExpression,
        tenantContextSetting,
      )
      if (!isSinglePolicy || !isUsingCanonical) {
        findings.push({
          rule: 'POLICY_USING_NOT_CANONICAL',
          tableName,
          message: buildNotCanonicalMessage(
            tableName,
            policy.policyName,
            'USING',
            expectedExpression,
            policy.usingExpression,
            isSinglePolicy,
          ),
        })
      }

      // `hasWithCheck` ile KORUMALI: WITH CHECK zaten eksikse (yukarıda
      // POLICY_MISSING_WITH_CHECK düştü) burada İKİNCİ, gürültülü bir bulgu
      // üretmek yanlış — "eksik" ile "kanonik değil" AYRI sorular (K-E5
      // madde 4, BAĞLAYICI).
      if (hasWithCheck) {
        const isWithCheckCanonical = isCanonicalPolicyExpression(
          policy.withCheckExpression,
          tenantContextSetting,
        )
        if (!isSinglePolicy || !isWithCheckCanonical) {
          findings.push({
            rule: 'POLICY_WITH_CHECK_NOT_CANONICAL',
            tableName,
            message: buildNotCanonicalMessage(
              tableName,
              policy.policyName,
              'WITH CHECK',
              expectedExpression,
              policy.withCheckExpression,
              isSinglePolicy,
            ),
          })
        }
      }

      // FIX turu 1 ([medium], solid bulgu): `policies.roles` artık TÜKETİLİYOR
      // — architect K-E2.1'in bağlayıcı kararı: politikada `TO` yan tümcesi
      // OLMAMALI (yalnızca PUBLIC). `TO arkesoft_app` yazılırsa sahip rol
      // (`arkesoft_migrator`, FORCE RLS'e tabi) için uygulanabilir politika
      // kalmaz → varsayılan ret → `db:seed` kırılır (migration.sql:10-13).
      if (!isPublicPolicy(policy.roles)) {
        findings.push({
          rule: 'POLICY_RESTRICTED_TO_ROLE',
          tableName,
          message: `"${tableName}.${policy.policyName}" belirli role kısıtlanmış (${policy.roles.join(', ')}) — K-E2.1 "TO yok" kararına aykırı.`,
        })
      }
    }
  }

  return findings
}

/**
 * T-015/ST-C — `AUTH_SECRET_BEARING_TABLES`/benzer bir listeye KOLON
 * SEVİYESİ hibe VEREN tabloların adlarını, Kaynak B'den (`columnGrants`)
 * türetir. Bu kümede olan bir tablo artık "kolon rejimi"ne geçmiş sayılır —
 * bkz. dosya başı "`lintAppRoleDmlPrivileges`'İN TADİLİ" notu.
 */
function tablesWithColumnLevelGrants(snapshot: CatalogSnapshot): ReadonlySet<string> {
  return new Set(snapshot.columnGrants.map((grant) => grant.tableName))
}

function lintAppRoleDmlPrivileges(
  classifiedTables: readonly string[],
  snapshot: CatalogSnapshot,
  appRoleName: string,
): LintFinding[] {
  const findings: LintFinding[] = []
  const columnGoverned = tablesWithColumnLevelGrants(snapshot)

  for (const tableName of classifiedTables) {
    // T-015/ST-C TADİLİ (ROADMAP madde 3): bir tablo kolon seviyesi hibe
    // taşıyorsa (Kaynak B'nin kanıtladığı "kolon rejimi") `appRoleName`in o
    // tabloda TAM DML taşıması beklentisi burada ARTIK UYGULANMAZ — o
    // tablonun `appRoleName` durumu `APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE`'ın
    // öznesidir, bunun DEĞİL. DDL (ST-D) uygulanmadan önce `columnGrants`
    // BOŞTUR (ST-B'nin ölçtüğü taban) — bu dal o ana kadar HİÇ tetiklenmez,
    // eski davranış DEĞİŞMEZ.
    if (columnGoverned.has(tableName)) {
      continue
    }
    const privilege = snapshot.privileges.find(
      (candidate) => candidate.roleName === appRoleName && candidate.tableName === tableName,
    )
    if (privilege === undefined) {
      // Tablo katalogda hiç yoksa bu artık GERÇEKTEN `MISSING_TABLE`
      // tarafından yakalanır (T-015/ST-C: `MISSING_TABLE`'ın öznesi
      // `platformLevelTables`'ı da kapsayacak şekilde genişletildi, bkz.
      // `lintPlatformLevelTableExistence`) — bu `continue` artık GERÇEKTEN
      // gereksiz (eski yorum, "platform tabloları için YANLIŞ" olduğu
      // architect tarafından ÖLÇÜLMÜŞTÜ; bu genişletmeden SONRA doğru).
      continue
    }
    if (
      !privilege.canSelect ||
      !privilege.canInsert ||
      !privilege.canUpdate ||
      !privilege.canDelete
    ) {
      findings.push({
        rule: 'APP_ROLE_MISSING_DML_PRIVILEGE',
        tableName,
        message: `"${appRoleName}" rolü "${tableName}" üzerinde SELECT/INSERT/UPDATE/DELETE yetkilerinin tamamına sahip değil.`,
      })
    }
  }

  return findings
}

/**
 * T-015/ST-C — `MISSING_TABLE`'ın özne genişletmesi (architect bulgusu:
 * `lintAppRoleDmlPrivileges`'in sessiz `continue`'unun savunduğu "bu zaten
 * yakalanır" iddiası platform seviyesi tablolar için YANLIŞTI —
 * `MISSING_TABLE` eskiden YALNIZCA `lintTenantScopedTable` içinde üretiliyordu;
 * bir platform tablosu katalogdan tamamen kaybolsa HİÇBİR kural görmüyordu).
 * Bu fonksiyon o boşluğu kapatır: her platform seviyesi tablonun katalogda
 * VAR OLDUĞUNU doğrular — kanıt fixture'ı: taksonomiden bir platform tablosu
 * (örn. sır taşıyan bir tablo) katalogdan silinirse artık MISSING_TABLE düşer.
 */
function lintPlatformLevelTableExistence(
  platformLevelTables: readonly string[],
  snapshot: CatalogSnapshot,
): LintFinding[] {
  const findings: LintFinding[] = []

  for (const tableName of platformLevelTables) {
    const table = snapshot.tables.find((candidate) => candidate.tableName === tableName)
    if (table === undefined) {
      findings.push({
        rule: 'MISSING_TABLE',
        tableName,
        message: `Taksonomide "platformLevelTables" altında listelenen tablo katalogda yok: "${tableName}".`,
      })
    }
  }

  return findings
}

function lintCatalogToTaxonomy(
  snapshot: CatalogSnapshot,
  taxonomy: TenantIsolationTaxonomy,
): LintFinding[] {
  const findings: LintFinding[] = []

  for (const table of snapshot.tables) {
    const { tableName } = table
    if (EXEMPT_TABLES.has(tableName)) {
      continue
    }

    const isTenantScoped = taxonomy.tenantScopedTables.includes(tableName)
    const isPlatformLevel = taxonomy.platformLevelTables.includes(tableName)

    if (!isTenantScoped && !isPlatformLevel) {
      findings.push({
        rule: 'UNCLASSIFIED_TABLE',
        tableName,
        message: `"${tableName}" taksonomide sınıflandırılmamış (ne "tenantScopedTables" ne "platformLevelTables").`,
      })
    }

    const hasTenantIdColumn = snapshot.columns.some(
      (column) => column.tableName === tableName && column.columnName === 'tenant_id',
    )

    if (isPlatformLevel && hasTenantIdColumn) {
      findings.push({
        rule: 'TENANT_ID_ON_PLATFORM_TABLE',
        tableName,
        message: `"${tableName}" platform seviyesi olarak sınıflandırılmış ama "tenant_id" kolonu taşıyor.`,
      })
    }

    if (hasTenantIdColumn && !isTenantScoped) {
      findings.push({
        rule: 'TENANT_ID_WITHOUT_TAXONOMY_ENTRY',
        tableName,
        message: `"${tableName}" "tenant_id" kolonu taşıyor ama taksonominin "tenantScopedTables" listesinde yok (kolon nasıl geldiğinden bağımsız — R-C2).`,
      })
    }
  }

  return findings
}

/**
 * `_prisma_migrations` (Prisma'nın kendi migration defteri) üzerinde
 * `appRoleName`in SELECT DIŞINDA bir DML yetkisi (INSERT/UPDATE/DELETE)
 * TAŞIMADIĞINI doğrular (FIX turu 2, B3 — qa/solid Tur 2 [low] BAĞIMSIZ
 * bulgu). `bootstrap-roles.sql`'in blanket `GRANT`/`ALTER DEFAULT
 * PRIVILEGES`'i (K-E2 §4) tablo adına göre FİLTRELENEMEDİĞİ için bu deftere
 * de otomatik DML veriyordu; `_prisma_migrations` taksonomide MUAF
 * (`EXEMPT_TABLES`) olduğu için `lintAppRoleDmlPrivileges` (YETERSİZ yetki
 * sorusu) ve `lintCatalogToTaxonomy` (sınıflandırma sorusu) bu tabloyu HİÇ
 * GÖRMÜYORDU — "fazla yetki" sorusunu soran HİÇBİR kural yoktu.
 *
 * Tablo katalogda henüz yoksa (örn. `migrate deploy` öncesi bootstrap-only
 * bir anlık görüntü) sessizce atlanır — bu durum zaten `EMPTY_CATALOG_SNAPSHOT`
 * veya ayrı bir yaşam döngüsü sorunudur, bu kuralın öznesi DEĞİLDİR.
 */
function lintMigrationsLedgerPrivilege(
  snapshot: CatalogSnapshot,
  appRoleName: string,
): LintFinding[] {
  const privilege = snapshot.privileges.find(
    (candidate) =>
      candidate.roleName === appRoleName && candidate.tableName === MIGRATIONS_LEDGER_TABLE,
  )
  if (privilege === undefined) {
    return []
  }

  if (privilege.canInsert || privilege.canUpdate || privilege.canDelete) {
    return [
      {
        rule: 'APP_ROLE_EXCESS_MIGRATIONS_LEDGER_PRIVILEGE',
        tableName: MIGRATIONS_LEDGER_TABLE,
        message:
          `"${appRoleName}" rolü "${MIGRATIONS_LEDGER_TABLE}" (Prisma migration defteri) ` +
          `üzerinde INSERT/UPDATE/DELETE yetkisine sahip (canInsert=${String(privilege.canInsert)}, ` +
          `canUpdate=${String(privilege.canUpdate)}, canDelete=${String(privilege.canDelete)}) — ` +
          'en az yetki ihlali, yalnızca SELECT beklenir.',
      },
    ]
  }

  return []
}

/**
 * T-015/ST-C — `APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS` (özne genişletildi: artık
 * `snapshot.roles`'taki HER rolü değerlendirir, eskiden yalnızca TEK BİR
 * alanı okuyordu — bkz. dosya başı "GENİŞLET/TÜKET" notu, `catalog-
 * snapshot.ts`'in devrettiği contract adımı) ve YENİ
 * `ROLE_HAS_EXCESS_ATTRIBUTE` (öznesi İKİ ÇALIŞMA ZAMANI ROLÜ —
 * `arkesoft_migrator` DEĞİL, onun `CREATEDB`'si meşru). İsim bazlı literal
 * YOK — rol adı mesaja `role.roleName`'den gelir.
 */
function lintRoleAttributes(snapshot: CatalogSnapshot): LintFinding[] {
  const findings: LintFinding[] = []

  for (const role of snapshot.roles) {
    if (role.isSuperuser || role.canBypassRls) {
      findings.push({
        rule: 'APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS',
        message: `"${role.roleName}" rolü süper kullanıcı veya BYPASSRLS taşıyor — RLS'i tamamen atlar.`,
      })
    }
    if (role.canCreateDb) {
      findings.push({
        rule: 'ROLE_HAS_EXCESS_ATTRIBUTE',
        message: `"${role.roleName}" rolü CREATEDB niteliğini taşıyor — çalışma zamanı rolleri bu niteliğe sahip OLMAMALI (migrator rolünün CREATEDB'si meşru, bu rol değerlendirmenin öznesi DEĞİL).`,
      })
    }
  }

  return findings
}

/**
 * T-015/ST-C — `APP_ROLE_OWNS_TABLE` (özne genişletildi: artık
 * `snapshot.roles`'taki HER rol — eskiden tek bir `appRoleName` parametresi
 * alıyordu). İsim bazlı literal YOK — rol kümesi `snapshot.roles`'tan gelir.
 */
function lintRoleOwnsTable(snapshot: CatalogSnapshot): LintFinding[] {
  const findings: LintFinding[] = []
  const runtimeRoleNames = new Set(snapshot.roles.map((role) => role.roleName))

  for (const table of snapshot.tables) {
    if (runtimeRoleNames.has(table.tableOwner)) {
      findings.push({
        rule: 'APP_ROLE_OWNS_TABLE',
        tableName: table.tableName,
        message: `"${table.tableOwner}" "${table.tableName}" tablosunun sahibi — FORCE RLS sahibi de kapsasa bile çalışma zamanı rolü tablo SAHİBİ OLMAMALI.`,
      })
    }
  }

  return findings
}

/**
 * T-015/ST-C, YENİ — `APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE`: `appRoleName`
 * sır taşıyan (`authSecretBearingTables`) bir tabloda HÂLÂ en az bir DML
 * yetkisine sahipse düşer. Bu, ROADMAP madde 4'ün ("üç sır taşıyan tabloya
 * tablo bazlı REVOKE") canlı kanıtının YARISIDIR — `arkesoft_app`'in payı.
 */
function lintAppRoleSecretTablePrivileges(
  snapshot: CatalogSnapshot,
  appRoleName: string,
  authSecretBearingTables: readonly string[],
): LintFinding[] {
  const findings: LintFinding[] = []

  for (const tableName of authSecretBearingTables) {
    const privilege = snapshot.privileges.find(
      (candidate) => candidate.roleName === appRoleName && candidate.tableName === tableName,
    )
    if (privilege === undefined) {
      continue
    }
    if (privilege.canSelect || privilege.canInsert || privilege.canUpdate || privilege.canDelete) {
      findings.push({
        rule: 'APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE',
        tableName,
        message:
          `"${appRoleName}" rolü sır taşıyan "${tableName}" tablosunda hâlâ en az bir DML ` +
          `yetkisine sahip (canSelect=${String(privilege.canSelect)}, canInsert=${String(privilege.canInsert)}, ` +
          `canUpdate=${String(privilege.canUpdate)}, canDelete=${String(privilege.canDelete)}) — bu ` +
          `tabloda "${appRoleName}" için HİÇBİR yetki beklenmiyor (REVOKE uygulanmamış olabilir).`,
      })
    }
  }

  return findings
}

type ColumnPrivilegeRow = CatalogSnapshot['columnPrivileges'][number]

/**
 * T-015/ST-C, YENİ — iki kural birden üretir (α/β/δ senaryolarının öznesi):
 *   - `AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE`: bir sütunun TABLO
 *     seviyesi SELECT/INSERT/UPDATE'i varsa (α — anti-vacuity bekçisi, tasarım
 *     yalnızca KOLON seviyesi bekliyor) — tablo başına TEK bulgu (kolon
 *     sayısı kadar TEKRARLANMAZ).
 *   - `AUTH_ROLE_MISSING_COLUMN_PRIVILEGE`: tablo seviyesi yoksa ve
 *     SELECT/INSERT/UPDATE'in TAMAMI kolon seviyesinde de yoksa (δ — üç
 *     kolondan biri eksik), mesaj tablo VE kolon adını taşır.
 *   - Tablo seviyesi YOKKEN kolon seviyesi SELECT/INSERT/UPDATE'in ÜÇÜ de
 *     VARSA (β — sağlıklı, `isFullyColumnGranted`) hiçbir bulgu ÜRETMEZ.
 *     FIX turu 2 (solid Tur 1 [low] SD-5r bulgusu — SD-5'in ARTIĞI): bu
 *     JSDoc eskiden `columnOnly` adlı bir SATIR ALANINA atıfta bulunuyordu —
 *     `CatalogSnapshot['columnPrivileges']` (Kaynak A) öyle bir alan HİÇ
 *     TAŞIMAZ (`catalog-snapshot.ts`'in dosya başı + `readColumnPrivilegesForRole`
 *     doc'u: bu türetme BİLEREK okuyucuda YAPILMAZ, K-E5). Gerçek davranış
 *     aşağıdaki `isFullyColumnGranted` yerel değişkenidir — beyan/gerçeklik
 *     boşluğu burada KAPANDI.
 */
function lintAuthRoleSecretTableColumnPrivileges(
  snapshot: CatalogSnapshot,
  authRoleName: string,
  authSecretBearingTables: readonly string[],
): LintFinding[] {
  const findings: LintFinding[] = []

  for (const tableName of authSecretBearingTables) {
    const columnsOfTable = snapshot.columns.filter((column) => column.tableName === tableName)
    let tableLevelFindingEmitted = false

    for (const column of columnsOfTable) {
      const privilege: ColumnPrivilegeRow | undefined = snapshot.columnPrivileges.find(
        (candidate) =>
          candidate.roleName === authRoleName &&
          candidate.tableName === tableName &&
          candidate.columnName === column.columnName,
      )
      const hasTableSelect = privilege?.hasTableSelect ?? false
      const hasTableInsert = privilege?.hasTableInsert ?? false
      const hasTableUpdate = privilege?.hasTableUpdate ?? false
      const isTableLevel = hasTableSelect || hasTableInsert || hasTableUpdate

      if (isTableLevel) {
        if (!tableLevelFindingEmitted) {
          findings.push({
            rule: 'AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE',
            tableName,
            message:
              `"${authRoleName}" rolü sır taşıyan "${tableName}" tablosunda TABLO bazlı bir ` +
              'SELECT/INSERT/UPDATE yetkisine sahip — tasarım yalnızca KOLON bazlı yetki ' +
              "bekliyor (anti-vacuity: tablo yetkisi varken has_column_privilege'in de true " +
              'dönmesi beklenen bir yan etkidir, bu yüzden tablo seviyesi yetki KENDİSİ sorunun kaynağıdır).',
          })
          tableLevelFindingEmitted = true
        }
        continue
      }

      const hasColumnSelect = privilege?.hasColumnSelect ?? false
      const hasColumnInsert = privilege?.hasColumnInsert ?? false
      const hasColumnUpdate = privilege?.hasColumnUpdate ?? false
      // FIX turu 1 (solid Tur 1 [low] SD-5 bulgusu — `isColumnOnlyPrivilege`
      // dejenere veri alanı): bu noktaya ulaşıldığında `isTableLevel` YUKARIDA
      // (satır 801) `false` olarak elendi — yani `hasTableSelect`/
      // `hasTableInsert`/`hasTableUpdate`in ÜÇÜ de BU dalda GARANTİ false'tur.
      // Genel-amaçlı `hasColumn && !hasTable` (ST-A0①'in anti-vacuity
      // çıkarımı) bu çağrı noktasında `hasTable` HER ZAMAN false OLDUĞU için
      // `hasColumn`a DEJENERE olurdu — eski `isColumnOnlyPrivilege()`
      // yardımcısı bunu SAKLIYORDU ve JSDoc'u genel çıkarımı anlatırken
      // GERÇEK davranışı (identity) YANSITMIYORDU. Yardımcı KALDIRILDI;
      // doğrudan `hasColumnX` kullanılır — davranış DEĞİŞMEDİ, yalnızca
      // beyan/gerçeklik boşluğu kapandı.
      const isFullyColumnGranted = hasColumnSelect && hasColumnInsert && hasColumnUpdate

      if (!isFullyColumnGranted) {
        findings.push({
          rule: 'AUTH_ROLE_MISSING_COLUMN_PRIVILEGE',
          tableName,
          message:
            `"${authRoleName}" rolü "${tableName}.${column.columnName}" kolonunda SELECT/INSERT/UPDATE ` +
            `yetkisinin tamamına sahip değil (hasColumnSelect=${String(hasColumnSelect)}, ` +
            `hasColumnInsert=${String(hasColumnInsert)}, hasColumnUpdate=${String(hasColumnUpdate)}).`,
        })
      }
    }
  }

  return findings
}

/**
 * T-015/ST-C, YENİ — `AUTH_ROLE_MISSING_TABLE_PRIVILEGE` / `AUTH_ROLE_EXCESS_
 * TABLE_PRIVILEGE`: `authRoleTablePrivilegeExpectations`teki HER giriş için
 * tablo bazlı yetkiyi beklentiyle karşılaştırır.
 *   - `columnLevel === false` (örn. `app_user`): tablo bazlı SELECT/INSERT/
 *     UPDATE'in TAMAMI beklenir — eksikse MISSING.
 *   - `expectsTableDelete`: tablo bazlı DELETE beklenip beklenmediğini
 *     belirler (PostgreSQL'de DELETE kolon bazlı TANIMLI DEĞİL) — beklenirken
 *     yoksa MISSING, beklenMEZken varsa EXCESS (en az yetki ihlali, örn.
 *     `app_user` için DELETE verilmemesi gerekir — A-N1).
 */
function lintAuthRoleTablePrivilegeExpectations(
  snapshot: CatalogSnapshot,
  authRoleName: string,
  expectations: readonly AuthRoleTablePrivilegeExpectationLike[],
): LintFinding[] {
  const findings: LintFinding[] = []

  for (const expectation of expectations) {
    const { tableName, columnLevel, expectsTableDelete } = expectation
    const privilege = snapshot.privileges.find(
      (candidate) => candidate.roleName === authRoleName && candidate.tableName === tableName,
    )
    if (privilege === undefined) {
      continue
    }

    if (!columnLevel && (!privilege.canSelect || !privilege.canInsert || !privilege.canUpdate)) {
      findings.push({
        rule: 'AUTH_ROLE_MISSING_TABLE_PRIVILEGE',
        tableName,
        message:
          `"${authRoleName}" rolü "${tableName}" üzerinde TABLO bazlı SELECT/INSERT/UPDATE ` +
          `yetkilerinin tamamına sahip değil (canSelect=${String(privilege.canSelect)}, ` +
          `canInsert=${String(privilege.canInsert)}, canUpdate=${String(privilege.canUpdate)}).`,
      })
    }

    if (expectsTableDelete && !privilege.canDelete) {
      findings.push({
        rule: 'AUTH_ROLE_MISSING_TABLE_PRIVILEGE',
        tableName,
        message: `"${authRoleName}" rolü "${tableName}" üzerinde beklenen TABLO bazlı DELETE yetkisine sahip değil.`,
      })
    }

    if (!expectsTableDelete && privilege.canDelete) {
      findings.push({
        rule: 'AUTH_ROLE_EXCESS_TABLE_PRIVILEGE',
        tableName,
        message: `"${authRoleName}" rolü "${tableName}" üzerinde beklenmeyen TABLO bazlı DELETE yetkisine sahip (en az yetki ihlali).`,
      })
    }
  }

  return findings
}

/**
 * T-015/ST-C, YENİ — `AUTH_ROLE_EXCESS_TABLE_PRIVILEGE`'in ikinci kaynağı:
 * beklenti listesinde (`authRoleTablePrivilegeExpectations`) HİÇ YER ALMAYAN
 * bir tabloda `authRoleName`in herhangi bir DML yetkisi varsa düşer — "diğer
 * tüm tablolar: hiçbir yetki yok" beyanının genel (catch-all) kapanışı.
 * `_prisma_migrations` (`EXEMPT_TABLES`) BİLEREK hariç — o tablonun kendi
 * kuralı (`lintMigrationsLedgerPrivilege`) var.
 */
function lintAuthRoleUnexpectedTablePrivileges(
  snapshot: CatalogSnapshot,
  authRoleName: string,
  expectations: readonly AuthRoleTablePrivilegeExpectationLike[],
): LintFinding[] {
  const findings: LintFinding[] = []
  const expectedTableNames = new Set(expectations.map((expectation) => expectation.tableName))

  for (const privilege of snapshot.privileges) {
    if (
      privilege.roleName !== authRoleName ||
      expectedTableNames.has(privilege.tableName) ||
      EXEMPT_TABLES.has(privilege.tableName)
    ) {
      continue
    }
    if (privilege.canSelect || privilege.canInsert || privilege.canUpdate || privilege.canDelete) {
      findings.push({
        rule: 'AUTH_ROLE_EXCESS_TABLE_PRIVILEGE',
        tableName: privilege.tableName,
        message:
          `"${authRoleName}" rolü beklenti tablosunda yer almayan "${privilege.tableName}" ` +
          'tablosunda en az bir DML yetkisine sahip — bu role bu tabloda HİÇBİR yetki beklenmiyor.',
      })
    }
  }

  return findings
}

/**
 * T-015/ST-C, YENİ — `UNEXPECTED_COLUMN_LEVEL_GRANTEE`: Kaynak B'nin
 * (`columnGrants`) HER satırı için alıcının (`grantee`) `authRoleName`
 * OLDUĞUNU doğrular. Beklenen küme `{authRoleName}` TEKİL — ST-A0③'ün ölçtüğü
 * ampirik olgu: tablo SAHİBİ `grantee` olarak ASLA görünmez (yalnızca
 * `grantor`), bu yüzden beklenen kümeye tablo sahibi EKLENMEZ (eklenseydi
 * kural KALICI yanlış pozitif verirdi, R-PO6). PUBLIC hibesi `grantee`
 * alanında `-` (tire) olarak gelir — birebir string eşitlik onu OTOMATİK
 * "beklenmeyen" sayar, bu İSTENEN davranıştır. Bu kural şemanın HER YERİNDEKİ
 * kolon hibelerini görür (taksonomi parametresi YOK, K-E5'in `columnGrants`
 * için zaten kurulu deseni).
 *
 * FIX turu 1 (solid Tur 1 [low] S-4 bulgusu — `isGrantable` ölü veri alanı):
 * `catalog-snapshot.ts` bu alanı parse edip taşıyordu ama HİÇBİR kural
 * OKUMUYORDU (`security`'nin M4 mutasyonu — `WITH GRANT OPTION` — SURVIVED,
 * 0 bulgu). Alıcı DOĞRU (`authRoleName`) olsa BİLE `WITH GRANT OPTION`
 * taşıyan bir hibe KENDİSİ bir bulgu üretir — `authRoleName`in bu sır
 * taşıyan kolonu BAŞKA bir role yeniden hibeleyebilmesi, en az yetki
 * ilkesinin DOLAYLI bir ihlalidir (tasarım `authRoleName`in kendisinin bile
 * yeniden hibeleme YETKİSİ taşımamasını bekler). İki koşul AYRI mesajla,
 * AYNI kural kodunda birleştirilir (yeni bir kural kodu AÇMAK yerine —
 * ikisi de "bu kolon hibesi beklenenden SAPIYOR" sorusunun bir biçimi).
 */
function lintColumnGrantGrantees(snapshot: CatalogSnapshot, authRoleName: string): LintFinding[] {
  const findings: LintFinding[] = []

  for (const grant of snapshot.columnGrants) {
    const isUnexpectedGrantee = grant.grantee !== authRoleName
    if (isUnexpectedGrantee) {
      findings.push({
        rule: 'UNEXPECTED_COLUMN_LEVEL_GRANTEE',
        tableName: grant.tableName,
        message:
          `"${grant.tableName}.${grant.columnName}" kolonunda "${grant.privilegeType}" yetkisi ` +
          `beklenmeyen bir alıcıya ("${grant.grantee}") verilmiş — beklenen tek alıcı "${authRoleName}".`,
      })
    } else if (grant.isGrantable) {
      findings.push({
        rule: 'UNEXPECTED_COLUMN_LEVEL_GRANTEE',
        tableName: grant.tableName,
        message:
          `"${grant.tableName}.${grant.columnName}" kolonunda "${grant.privilegeType}" yetkisi ` +
          `"${authRoleName}"a WITH GRANT OPTION ile verilmiş — alıcı DOĞRU ama yeniden hibeleme ` +
          'yetkisi (is_grantable=true) beklenmiyor (en az yetki ihlali).',
      })
    }
  }

  return findings
}

/**
 * T-015/ST-C, FIX turu 1, YENİ — `UNEXPECTED_TABLE_LEVEL_GRANTEE`: Kaynak
 * C'nin (`tableGrants`, `pg_class.relacl`) HER satırı için alıcının
 * `{appRoleName, authRoleName, table.tableOwner}` kümesinde OLDUĞUNU
 * doğrular (security Tur 1 [medium] S-1 bulgusu — `lintColumnGrantGrantees`in
 * SİMETRİĞİ, ama beklenen küme AYNI DEĞİL). AMPİRİK ÖLÇÜLMÜŞ ASİMETRİ
 * (dosya başı notu): `relacl`de tablo SAHİBİ `grantee` olarak GÖRÜNÜR
 * (`attacl`in tersine) — bu yüzden beklenen kümeye `table.tableOwner`
 * EKLENİR, ve bu değer LİTERAL değil `snapshot.tables[].tableOwner`'dan
 * okunur (tahmin edilseydi kural KALICI yanlış pozitif verirdi, S-1'in
 * bağlayıcı kısıtı). Tablo katalogda bulunamazsa (olağan dışı, zaten
 * `MISSING_TABLE`in öznesi) beklenen küme sahipsiz kalır — bu kuralın
 * öznesi DEĞİL, savunma amaçlı.
 *
 * `isGrantable` (S-4, `lintColumnGrantGrantees`in AYNI deseni): alıcı
 * BEKLENEN kümede OLSA BİLE `WITH GRANT OPTION` taşıyan bir tablo hibesi
 * kendisi bir bulgu üretir.
 */
function lintTableGrantGrantees(
  snapshot: CatalogSnapshot,
  appRoleName: string,
  authRoleName: string,
): LintFinding[] {
  const findings: LintFinding[] = []

  for (const grant of snapshot.tableGrants) {
    const table = snapshot.tables.find((candidate) => candidate.tableName === grant.tableName)
    const expectedGrantees = new Set<string>([appRoleName, authRoleName])
    if (table !== undefined) {
      expectedGrantees.add(table.tableOwner)
    }

    const isUnexpectedGrantee = !expectedGrantees.has(grant.grantee)
    if (isUnexpectedGrantee) {
      findings.push({
        rule: 'UNEXPECTED_TABLE_LEVEL_GRANTEE',
        tableName: grant.tableName,
        message:
          `"${grant.tableName}" tablosunda "${grant.privilegeType}" yetkisi beklenmeyen bir ` +
          `alıcıya ("${grant.grantee}") verilmiş — beklenen alıcılar: ${[...expectedGrantees].map((name) => `"${name}"`).join(', ')}.`,
      })
    } else if (grant.isGrantable) {
      findings.push({
        rule: 'UNEXPECTED_TABLE_LEVEL_GRANTEE',
        tableName: grant.tableName,
        message:
          `"${grant.tableName}" tablosunda "${grant.privilegeType}" yetkisi "${grant.grantee}"a ` +
          'WITH GRANT OPTION ile verilmiş — alıcı DOĞRU ama yeniden hibeleme yetkisi ' +
          '(is_grantable=true) beklenmiyor (en az yetki ihlali).',
      })
    }
  }

  return findings
}

const RELATION_KIND_LABELS: Readonly<Record<'v' | 'm' | 'f', string>> = {
  v: 'VIEW',
  m: 'MATERIALIZED VIEW',
  f: 'FOREIGN TABLE',
}

/**
 * FIX turu 2, YENİ — `UNEXPECTED_RELATION_KIND` (security Tur 2 [high] S-7
 * bulgusu, Kaynak D): `snapshot.unexpectedRelations`'ın (`public`te
 * `relkind IN ('v','m','f')`) HER satırı için KOŞULSUZ bulgu üretir —
 * taksonomi/grantee SORUSU SORMAZ (dosya başı notu, Tasarım Seçeneği C).
 * Bugün `public`te bu kindlerden SIFIR nesne var (ölçüldü) — bu kuralın
 * sağlıklı tabanda bulgu üretmemesi YAPISAL değil, EMPİRİK bir olgudur;
 * ileride meşru bir view gerekirse (örn. raporlama) doğru hamle bu kuralı
 * GEVŞETMEK değil, `src/tenancy.ts`'te bir allowlist EKLEMEKTİR (henüz
 * böyle bir ihtiyaç YOK, bu yüzden allowlist bu turda AÇILMADI).
 *
 * `authRole` kapısının ARDINDA DEĞİLDİR — görünür nesne bir view/matview/
 * foreign table olduğu sürece auth rolü yapılandırılmış olsun ya da olmasın
 * değerlendirilir (bu, hangi rolün hibeyi aldığından BAĞIMSIZ bir katalog
 * bütünlüğü sorusu, auth-rolüne-özgü bir soru DEĞİL).
 */
function lintUnexpectedRelationKinds(snapshot: CatalogSnapshot): LintFinding[] {
  return snapshot.unexpectedRelations.map((relation) => ({
    rule: 'UNEXPECTED_RELATION_KIND',
    tableName: relation.relationName,
    message:
      `"${relation.relationName}" "public" şemasında bir ${RELATION_KIND_LABELS[relation.relationKind]} ` +
      '— bu nesne tablo bazlı sınıflandırma/RLS/indeks kurallarının HİÇBİRİ tarafından görülmez ' +
      '(`readTables()` yalnızca sıradan/bölümlenmiş tabloları okur) ve varsayılan yetki ' +
      'mekanizması (`ALTER DEFAULT PRIVILEGES … ON TABLES`) onu da kapsayabilir — ELLE ' +
      'incelenip ya taksonomiye (bir allowlist üzerinden) eklenmeli ya da kaldırılmalıdır.',
  }))
}

/**
 * FIX turu 2, YENİ — `UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE` (security
 * Tur 2 [medium] S-8 bulgusu, Kaynak E): `snapshot.functionPrivileges`'ın
 * `hasPublicExecute === true` olan HER satırı için bulgu üretir.
 * `sql/bootstrap-roles.sql` bölüm 8'in BAĞLAYICI notu: bu sorunun veritabanı
 * seviyesinde KAPATILMASI (gelecekteki fonksiyonlar için) bu Postgres
 * sürümünde `ALTER DEFAULT PRIVILEGES` ile YAPISAL OLARAK mümkün değildir
 * — bu kural o yüzden kapatma değil TESPİT (bir tripwire) rolünü üstlenir.
 * Bugün `public`te SIFIR fonksiyon var (ölçüldü) — bu kuralın sağlıklı
 * tabanda bulgu üretmemesi YAPISAL değil, EMPİRİK bir olgudur.
 *
 * `authRole` kapısının ARDINDA DEĞİLDİR — `lintUnexpectedRelationKinds`'ın
 * AYNI gerekçesi (auth-rolüne-özgü bir soru DEĞİL).
 */
function lintUnexpectedFunctionExecuteGrantees(snapshot: CatalogSnapshot): LintFinding[] {
  return snapshot.functionPrivileges
    .filter((privilege) => privilege.hasPublicExecute)
    .map((privilege) => ({
      rule: 'UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE',
      tableName: privilege.functionName,
      message:
        `"${privilege.functionName}" fonksiyonunu PUBLIC (dolayısıyla "arkesoft_app"/"arkesoft_auth" ` +
        'dahil HERKES) yürütebilir — `SECURITY DEFINER` bir fonksiyonda bu, tablo sahibinin ' +
        'yetkisiyle kolon/RLS kısıtlamasını baypas etmenin bir yolu olabilir. Bu fonksiyona ' +
        'açıkça "REVOKE EXECUTE … FROM PUBLIC" uygulanmalı ve gereken rollere elle "GRANT EXECUTE" yazılmalı.',
    }))
}

/**
 * FIX turu 3, YENİ — `UNEXPECTED_SECURITY_DEFINER_FUNCTION` (security Tur 3
 * [medium] S-15 bulgusu, Kaynak E'nin "varlık" ekseni): `snapshot.
 * functionPrivileges`'ın `isSecurityDefiner === true` olan HER satırı için
 * KOŞULSUZ bulgu üretir — `hasPublicExecute`'tan BAĞIMSIZDIR (bu, S-15'in
 * tam ÖLÇTÜĞÜ kaçış: `REVOKE EXECUTE … FROM PUBLIC` sonrası `hasPublicExecute
 * = false` olsa BİLE bu kural düşer). `lintUnexpectedRelationKinds`'ın
 * (Kaynak D) BİREBİR taksonomi-bağımsız deseni: grantee/hibe SORUSU SORMAZ,
 * `authRole` kapısının ARDINDA DEĞİLDİR.
 *
 * Mesaj, `snapshot.functionExecuteGrantees`'ten (Kaynak E'nin hibe ekseni,
 * `aclexplode(proacl)`) o fonksiyona VERİLMİŞ adlandırılmış hibeleri
 * TEŞHİS AMAÇLI listeler — bu BİR KARAR DEĞİL (ateşlenme koşulu yalnızca
 * `isSecurityDefiner`dır), yalnızca operatöre "kime verilmiş" bilgisini taşır.
 *
 * AYRI kod, `UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`'in GENİŞLETİLMİŞ hâli
 * DEĞİL (solid'in bağlayıcı gerekçesi, dosya başı FIX turu 3 notu): tek kod
 * altında birleştirmek, ileride meşru bir `SECURITY DEFINER` için bir
 * allowlist açıldığında İKİSİNİ BİRLİKTE susturur.
 */
function lintUnexpectedSecurityDefinerFunctions(snapshot: CatalogSnapshot): LintFinding[] {
  return snapshot.functionPrivileges
    .filter((privilege) => privilege.isSecurityDefiner)
    .map((privilege) => {
      const grantees = snapshot.functionExecuteGrantees.filter(
        (grant) => grant.functionName === privilege.functionName,
      )
      const granteeList =
        grantees.length > 0
          ? grantees.map((grant) => `"${grant.grantee}" (${grant.privilegeType})`).join(', ')
          : '(açık bir EXECUTE hibesi yok — varsayılan PUBLIC geçerli)'

      return {
        rule: 'UNEXPECTED_SECURITY_DEFINER_FUNCTION' as const,
        tableName: privilege.functionName,
        message:
          `"${privilege.functionName}" SECURITY DEFINER olarak tanımlı — tablo sahibinin yetkisiyle ` +
          'çalışır ve bu, PUBLIC EXECUTE hibesinden BAĞIMSIZ olarak kolon/RLS kısıtlamasını ' +
          'baypas etmenin bir yolu olabilir ("REVOKE EXECUTE … FROM PUBLIC" TEK BAŞINA bu riski ' +
          `KAPATMAZ — bkz. "UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE" ile birlikte değerlendirin). ` +
          `Şu anki adlandırılmış EXECUTE hibeleri: ${granteeList}. ELLE incelenip ya ` +
          'gerekçelendirilip taksonomiye eklenmeli ya da SECURITY INVOKER olarak yeniden yazılmalıdır.',
      }
    })
}

/**
 * Canlı katalog anlık görüntüsünü taksonomiye karşı doğrular ve bulgu
 * listesini döner. Boş dizi = "canlı şema taksonomiyle tutarlı" (sağlıklı
 * durum). SAF fonksiyon — DB'ye dokunmaz, yan etkisi yoktur.
 */
export function lintCatalog(
  snapshot: CatalogSnapshot,
  options: LintCatalogOptions,
): readonly LintFinding[] {
  if (snapshot.tables.length === 0) {
    return [
      {
        rule: 'EMPTY_CATALOG_SNAPSHOT',
        message:
          'Katalog anlık görüntüsü boş (hiç tablo okunamadı) — bağlantı/şema hedefi şüpheli, fail-closed: sağlıklı kabul edilmiyor.',
      },
    ]
  }

  const findings: LintFinding[] = []

  for (const tableName of options.taxonomy.tenantScopedTables) {
    findings.push(...lintTenantScopedTable(tableName, snapshot, options.tenantContextSetting))
  }

  // T-015/ST-C: MISSING_TABLE'ın öznesi artık platform seviyesi tabloları da
  // kapsar (architect bulgusu — bkz. fonksiyonun kendi doc'u).
  findings.push(...lintPlatformLevelTableExistence(options.taxonomy.platformLevelTables, snapshot))

  const classifiedTables = [
    ...options.taxonomy.tenantScopedTables,
    ...options.taxonomy.platformLevelTables,
  ]
  findings.push(...lintAppRoleDmlPrivileges(classifiedTables, snapshot, options.appRoleName))

  findings.push(...lintCatalogToTaxonomy(snapshot, options.taxonomy))

  findings.push(...lintRoleAttributes(snapshot))
  findings.push(...lintRoleOwnsTable(snapshot))

  findings.push(...lintMigrationsLedgerPrivilege(snapshot, options.appRoleName))

  // FIX turu 2, YENİ — security Tur 2 [high] S-7 bulgusu (Kaynak D). `authRole`
  // kapısının DIŞINDA/ÖNCESİNDE — dondurulmuş eski çağrı noktası (bu alanı
  // HİÇ geçirmeyen) DAHİL her çağrıda değerlendirilir (auth-rolüne-özgü bir
  // soru DEĞİL, bkz. fonksiyonun kendi doc'u).
  findings.push(...lintUnexpectedRelationKinds(snapshot))

  // FIX turu 2, YENİ — security Tur 2 [medium] S-8 bulgusu (Kaynak E). AYNI
  // gerekçeyle `authRole` kapısının DIŞINDA.
  findings.push(...lintUnexpectedFunctionExecuteGrantees(snapshot))

  // FIX turu 3, YENİ — security Tur 3 [medium] S-15 bulgusu (Kaynak E'nin
  // varlık ekseni). AYNI gerekçeyle `authRole` kapısının DIŞINDA, `hasPublicExecute`'tan
  // BAĞIMSIZ (dosya başı FIX turu 3 notu).
  findings.push(...lintUnexpectedSecurityDefinerFunctions(snapshot))

  // T-015/ST-C, FIX turu 1 (QA-1) — auth rolüne özgü kurallar (kod sayısı
  // `TENANT_ISOLATION_RULES`te — R-PM7 dersi: burada SABİT bir sayı
  // YAZILMAZ): dosya başı "OPSİYONEL OLMASININ GEREKÇESİ" notu. `authRole`
  // TEK bir nesne olarak geçirildiğinde (ST-E'nin yeni canlı dosyası ve bu
  // paketin fixture testleri) değerlendirilir; dondurulmuş eski çağrı
  // noktası bu alanı HİÇ geçirmediği için bu blok onun için SESSİZCE
  // atlanır — üçlü `undefined` kontrolü artık TEK kontrol (vacuity riski
  // kapandı: nesnenin bir üyesini unutup diğerlerini geçirmek DERLENMEZ).
  if (options.authRole !== undefined) {
    const {
      roleName: authRoleName,
      secretBearingTables,
      tablePrivilegeExpectations,
    } = options.authRole

    findings.push(
      ...lintAppRoleSecretTablePrivileges(snapshot, options.appRoleName, secretBearingTables),
    )
    findings.push(
      ...lintAuthRoleSecretTableColumnPrivileges(snapshot, authRoleName, secretBearingTables),
    )
    findings.push(
      ...lintAuthRoleTablePrivilegeExpectations(snapshot, authRoleName, tablePrivilegeExpectations),
    )
    findings.push(
      ...lintAuthRoleUnexpectedTablePrivileges(snapshot, authRoleName, tablePrivilegeExpectations),
    )
    findings.push(...lintColumnGrantGrantees(snapshot, authRoleName))
    // FIX turu 1, YENİ — security Tur 1 [medium] S-1 bulgusu (Kaynak C).
    findings.push(...lintTableGrantGrantees(snapshot, options.appRoleName, authRoleName))
  }

  return findings
}
