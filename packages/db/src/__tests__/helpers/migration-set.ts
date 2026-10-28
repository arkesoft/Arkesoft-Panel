// @arkesoft/db — migration kümesi doğrulama mantığı (T-004 / T2-1 kapanışı, S1)
//
// `migration-sql.test.ts`'in eski biçimi yalnızca `_init` ile biten TEK dizini
// okuyordu (ROADMAP Teknik Borç, T2-1): ikinci bir migration geldiği anda onun
// `CREATE TABLE` ifadeleri hiç değerlendirilmiyordu ve taksonomiye eklenmeyi
// unutulan `tenant_id`'li bir tablo testi SESSİZCE yeşil bırakabiliyordu. Bu
// dosya migration KÜMESİNİN TAMAMINI (migration.sql içeren her dizin) okuyan ve
// kümülatif şema yüzeyini `packages/db` taksonomisiyle (PLATFORM_LEVEL_TABLES ∪
// TENANT_SCOPED_TABLES) iki yönlü karşılaştıran mekanik doğrulamayı taşır.
//
// K-C4 (bağlayıcı, architect): bu modül `vitest` import ETMEZ, `expect`
// KULLANMAZ — sade `throw new Error(...)`. Böylece v0.0.13'ün şema linter'ı bu
// modülü değiştirmeden `node` altında koşturabilir; promosyon saf `git mv` olur.
//
// R5 (bağlayıcı, PO): bu dosya veritabanına DOKUNMAZ — yalnızca `node:fs/path/url`.
//
// DÜZELTME TURU 1 (T-004, security gate bulgu 1/high + C1/C2/C4/C8): aşağıdaki
// değişiklikler bu turda eklendi, ayrıntı her bölümün başındaki yorumda:
//   - tablo ADI çıkarımı GÖVDE ayrıştırmasından ayrıldı (`extractCreatedTableNames`
//     ile `extractCreatedTableBodies`), yeni `UNPARSABLE_CREATE_TABLE` kuralı.
//   - yıkıcı ifade taraması harf/boşluk duyarsız hâle getirildi.
//   - `migration.sql` yolu artık URL birleştirmesi yerine dosya sistemi yolu
//     üzerinden kuruluyor (`#`/`?`/`%` içeren dizin adı artık atlanmıyor).
//   - `normalizedByMigration` Map'i kaldırıldı; erişilemez dallar yerine tek
//     geçişlik bir dizi kullanılıyor.
//
// DÜZELTME TURU 2 (T-004, qa/security/solid tur 2 — iki gate'in ORTAK `medium`'u):
//   - A: tablo ADI/GÖVDE desenleri artık harf, boşluk, `IF NOT EXISTS` ve şema
//     önekine duyarsız (`i` bayrağı + genişletilmiş desen). Ayrıca "ayna
//     bekçisi" eklendi: harf duyarsız `CREATE TABLE` JETON sayısı çıkarılan ad
//     sayısından fazlaysa (ör. tırnaksız ad — bu turda hâlâ ayrıştırılmıyor,
//     v0.0.13 borcu) `UNPARSABLE_CREATE_TABLE` üretir; sessizce geçmez.
//   - C: yıkıcı ifade taraması artık tek tırnaklı dize LİTERALLERİNİ maskeleyerek
//     çalışıyor (`maskSingleQuotedStringLiterals`) — `'Drop Shipping'` gibi bir
//     plan adı veya `DEFAULT 'set not null'` gibi bir sütun varsayılanı artık
//     yanlış pozitif ÜRETMİYOR. Bu, **`stripLineComments`'e dokunmuyor** — R-C4
//     (yorum temizliğinin dize sınırı kaçırması) kapsam dışı kalıyor, `architect`
//     v0.0.13'te ele alacak.
//   - D1: gövde deseninin tembel çapası ifade sınırında duracak şekilde
//     düzeltildi (`[^;]*?`) — tek satırlık bir `CREATE TABLE` artık onu izleyen
//     kanonik bir `CREATE TABLE`'ın gövdesini YUTMUYOR.
//
// DÜZELTME TURU 3 (T-004, security tur 3 bulgu high + solid tur 3, beş low):
//   - A (security tur3, HIGH — FAIL-OPEN): `maskSingleQuotedStringLiterals`
//     basit bir ÇİFT eşleştirmedir, tokenizer değil. Bir migration'da tek
//     sayıda tek tırnak karakteri varsa eşleştirme ifade sınırını AŞIP tırnak
//     DIŞINDAKİ gerçek bir `DROP COLUMN`/`SET NOT NULL` ifadesini yutabiliyordu
//     (dört ampirik yol: çift tırnaklı tanımlayıcı içindeki apostrof, `$$...$$`
//     gövdesindeki Türkçe blok yorum, `stripLineComments`'in bir literali
//     kesmesi, kapanmayan literal). `maskSingleQuotedStringLiteralsSafely`
//     eklendi: tek tırnak sayısı TEKSE maskeleme ATLANIR (ham metin taranır)
//     VE yeni `UNPARSABLE_SQL` kuralı üretilir (FAIL-CLOSED). Tam durum-tutan
//     tarayıcı (`$$`/blok yorum farkında) BU TURUN KAPSAMI DIŞINDA — R-C4 ile
//     aynı iş, `architect`, v0.0.13.
//   - C1 (solid tur3, low): "ayna bekçisi" artık MASKELENMİŞ metin üzerinde
//     sayıyor — `INSERT ... VALUES ('CREATE TABLE x')` gibi bir dize literali
//     içindeki sahte jeton artık `tokenCount`'u şişirmiyor (tüketici 1→2,
//     R-C6 engeli yok, yeni desen eklenmedi).
//   - C2 (security tur3, low): gövde deseninin `[^;]*?` çapası (D1) gerçek bir
//     `CREATE TABLE` gövdesinde geçen noktalı virgülü (`DEFAULT 'a;b'`,
//     `CHECK (... <> ';')`) artık YANLIŞ POZİTİF saymıyor — çapa `;` yasağı
//     yerine "gövde bir SONRAKİ `CREATE TABLE` jetonu İÇERMEDİĞİ sürece"
//     kuralına (negatif ileri-bakış) geçti; D1'in asıl amacı (bir SONRAKİ
//     kanonik tabloyu yutmama) korunuyor.
//   - C3 (security tur3, low — SEÇİM): `CREATE_TABLE_TOKEN_PATTERN` artık
//     `UNLOGGED`/`TEMP(ORARY)`/`GLOBAL`/`LOCAL` değiştiricilerini de tanıyor —
//     bu biçimler artık bekçiden KAÇMIYOR (en azından `UNPARSABLE_CREATE_TABLE`
//     ile fail-closed işaretleniyor). `CREATE/* yorum */TABLE` (blok yorumu
//     CREATE/TABLE arasında) kasıtlı olarak DIŞARIDA bırakıldı — bu, blok
//     yorumlarının hiç temizlenmemesiyle (R-C4'ün kardeşi) aynı sınır; ayrı bir
//     normalizasyon gerektirir ve egzotik senaryo için orantısız — ROADMAP
//     borcu olarak bırakıldı (`architect`, v0.0.13, R-C4 ile birlikte).
//
// DÜZELTME TURU 4 (T-004, security tur 4 bulgu high — tur 3'ün `high`'ı
// KAPANMADI, kullanıcı kararıyla tek kalem düzeltme): FIX 3'ün tek-sayı
// kontrolü fail-open'ın asıl mekanizmasını (sahipsiz tırnakların SIRAYLA
// ÇİFTLENMESİ) yalnızca TEK sayı vakasında kapatıyordu; ÇİFT sayıda sahipsiz
// tırnak (iki tanımlayıcı apostrofu, iki blok yorum/`$$` gövdesi,
// `stripLineComments`'in İKİ literali kesmesi) hâlâ fail-open'dı (yedi
// ampirik yol). Yapısal değişmez EKLENDİ (tek-sayı kontrolünün YANINDA, YERİNE
// DEĞİL): maskelenen her eşleşme `;` İÇERMEMELİDİR — içeriyorsa ifade sınırını
// aşmış demektir, maskeleme atlanır ve `UNPARSABLE_SQL` üretilir (fail-closed).
// Bilinçli yan etki: gerçek bir dize literali `;` taşıyorsa (`DEFAULT 'a;b'`)
// artık bu da `UNPARSABLE_SQL` üretir — gevşetme DEĞİL, muhafazakâr tercih.
// Tam durum-tutan tarayıcı (R-C4 ile aynı iş) HÂLÂ bu turun kapsamı DIŞINDA.
//
// DÜZELTME TURU 5 (T-004, security gate tur 5 bulgu high — turu 3/4'ün
// MASKELEME YAKLAŞIMI TAMAMEN GERİ ALINDI, kullanıcı kararı): tur 4
// düzeltmesi de yetmedi — ONDÖRT bağımsız kaçış yolu bulundu, üç sınıfta: (i)
// aynı ifadede iki sahipsiz apostrof, `;` hiç aşılmıyor; (ii) terminatör `;`
// maskelenen eşleşmenin DIŞINDA kalan blok yorumu/`$$` gövdesi; (iii) yıkıcı
// ifade dosyanın SON ifadesi, `;` hiç taşımıyor (bkz. security tur5 raporu).
// Üç turda üç sezgisel (harf duyarlılığını normalize et → tek-sayı kontrolü →
// `;` yasağı) denendi, üçü de bir sonraki turda atlatıldı: sorun EŞİKTE
// değil, basit ÇİFT-EŞLEŞTİRME MEKANİZMASINDA. Kullanıcı kararı: yıkıcı ifade
// taraması bu Task'ın (T2-1) mandası DEĞİLDİ — T2-1 "migration KÜMESİNİN
// TAMAMINI oku" demekti ve o kapandı (bkz. dosya başı); tarama HEAD'de zaten
// basit, harf duyarlı `includes('DROP ')` / `includes('SET NOT NULL')` idi,
// zinciri biz başlattık. Maskeleme makinesi TAMAMEN KALDIRILDI:
// `maskSingleQuotedStringLiterals`, `maskSingleQuotedStringLiteralsSafely`,
// `hasStringLiteralMatchSpanningStatementBoundary`,
// `SINGLE_QUOTED_STRING_LITERAL_PATTERN`, `countSingleQuoteCharacters` ve
// `UNPARSABLE_SQL` kuralı (yalnızca "maskeleme atlandı" sinyali için vardı,
// maskeleme gidince anlamsız) — kural sayısı dokuzdan sekize düştü. Yıkıcı
// tarama HEAD semantiğine döndü: `stripLineComments`'ten geçmiş metin
// üzerinde, BÜYÜK/küçük harfe NORMALİZE ETMEDEN `includes('DROP ')` /
// `includes('SET NOT NULL')` — turu 1'in C1 değişikliği (harf/boşluk
// duyarsızlığı, `\b…\s` regex'leri) de GERİ ALINIYOR. "Ayna bekçisi"
// (`CREATE_TABLE_TOKEN_PATTERN` sayacı) artık `maskedSql` değil,
// `stripLineComments` çıktısı (`sql`) üzerinde sayıyor — bu, turu 3'ün
// kapattığı `VALUES ('CREATE TABLE x')` yanlış pozitifini (security tur3
// bulgu low/C1) YENİDEN AÇAR: kabul edilebilir, çünkü bu FAIL-CLOSED
// (gürültülü kırmızı — insan incelemesi gerektiren sahte `UNPARSABLE_CREATE_TABLE`),
// FAIL-OPEN DEĞİL (sessizce yıkıcı ifade yutmak); ROADMAP borcu olarak
// kaydedilecek (`architect`, v0.0.13, durum-tutan tek geçişli tarayıcı — R-C4
// ile aynı iş, dört kalemi birden kapatacak). Bilinçli, PİNLENMİŞ yanlış
// pozitif: büyük harfle yazılmış bir dize literali içindeki "DROP "
// (`'DROP SHIPPING'`) artık yeniden `DESTRUCTIVE_STATEMENT` ÜRETİR — HEAD'in
// zaten taşıdığı davranış, fail-closed ve bilerek kabul edilmiş; aşağı/
// `migration-sql.test.ts`'teki yeni regresyon vakası bunu pinler ki gelecekte
// "düzeltme" diye maskeleme geri gelmesin.

import { readdirSync, readFileSync, existsSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** `prisma/migrations/<dizin>/migration.sql` dosyasının okunmuş içeriği. */
export type MigrationFile = {
  readonly directoryName: string
  readonly sql: string
}

/**
 * `packages/db` tenant taksonomisi (bkz. `tenancy.ts`). Gerçek süit gerçek
 * taksonomiyi geçirir, prob süiti kendi taksonomisini (K-C2) — ikisi de aynı
 * `TenantTaxonomy` şekline uyar, yardımcı hangisini aldığını bilmez.
 */
export type TenantTaxonomy = {
  readonly platformLevelTables: readonly string[]
  readonly tenantScopedTables: readonly string[]
}

/**
 * Kümülatif şema yüzeyi ile taksonominin çakışmadığı SEKİZ durum (K-C3).
 * `UNPARSABLE_CREATE_TABLE`'ın İKİ üretim yolu var: (1) ad deseninin TANIDIĞI
 * ama gövde deseninin AYRIŞTIRAMADIĞI bir tablo (düzeltme turu 1 — security
 * gate T-004 tur 1, bulgu 1/high: ad çıkarımı gevşek desenle tabloyu görse de
 * gövdesi KATI desenle ayrıştırılamıyorsa gövde gerektiren iki kural
 * (`MISSING_TENANT_ID_COLUMN`, `TENANT_ID_ON_PLATFORM_TABLE`) artık sessizce
 * geçmez, bu kuralı üretir); (2) "ayna bekçisi" — harf duyarsız `CREATE TABLE`
 * JETON sayısı (`UNLOGGED`/`TEMP`/`GLOBAL`/`LOCAL` değiştiricileri dahil)
 * çıkarılan ad sayısından fazlaysa (ör. tırnaksız ad), `tableName: undefined`
 * ile üretilir (düzeltme turu 2 — solid gate T-004 tur 2, solid tur 3 bulgu
 * low/C5-ii bu ikinci yolun doc'ta anılmamasını işaretledi, burada giderildi).
 * DÜZELTME TURU 5 (security gate T-004 tur 5, bulgu high — kullanıcı kararı):
 * `UNPARSABLE_SQL` kuralı KALDIRILDI (dokuzdan sekize) — turu 3'te eklenip
 * turu 4'te genişletilen bu kural yalnızca turu 3/4'ün maskeleme makinesinin
 * "maskeleme atlandı" sinyali için vardı; maskeleme TAMAMEN geri alınınca
 * anlamsız kaldı (bkz. dosya başı "DÜZELTME TURU 5"). Ayna bekçisi artık
 * `stripLineComments` çıktısı üzerinde sayıyor (maskelenmemiş metin) — bu,
 * dize literali içindeki sahte "CREATE TABLE" jetonu için yanlış pozitif
 * riskini YENİDEN AÇAR (kabul edilebilir — fail-closed; ROADMAP borcu,
 * `architect`, v0.0.13).
 */
export type MigrationSetRule =
  | 'EMPTY_MIGRATION_SET'
  | 'UNCLASSIFIED_TABLE'
  | 'UNPARSABLE_CREATE_TABLE'
  | 'MISSING_TENANT_SCOPED_TABLE'
  | 'MISSING_TENANT_ID_COLUMN'
  | 'TENANT_ID_ON_PLATFORM_TABLE'
  | 'MISSING_TENANT_ID_LEADING_UNIQUE_INDEX'
  | 'DESTRUCTIVE_STATEMENT'

/**
 * Tek bir ihlal. `migrationDirectoryName`/`tableName` kuralın doğasına göre
 * `undefined` olabilir (örn. `EMPTY_MIGRATION_SET`'in suçlu bir dizini yok) —
 * bu yüzden alan hep VAR ama değeri `undefined` olabilir (`exactOptionalPropertyTypes`
 * nedeniyle `?:` DEĞİL, `: T | undefined`).
 */
export type MigrationSetViolation = {
  readonly rule: MigrationSetRule
  readonly migrationDirectoryName: string | undefined
  readonly tableName: string | undefined
  readonly message: string
}

/** Prisma'nın migration geçmişi tablosu — taksonomi dışında, hiçbir seviyeye girmez. */
const PRISMA_INTERNAL_TABLE = '_prisma_migrations'

/**
 * Verilen URL'in sonunda `/` bulunmasını garanti eder. Prisma'nın `import.meta.url`
 * tabanlı dizin URL'leri her zaman `/` ile biter; prob tarafından üretilen
 * `mkdtemp` kökü de K-C10 gereği `/` ile üretilir — bu, iki kaynağın da aynı
 * savunmacı normalizasyondan geçmesini sağlar.
 */
function withTrailingSlash(url: URL): URL {
  return url.href.endsWith('/') ? url : new URL(`${url.href}/`)
}

/**
 * `-- yorum` satırlarını atar; blok yorumu (slash-star...star-slash) Prisma
 * emit etmediği için ele alınmaz (R-C4, kabul edilen sınır). K-C7: yıkıcı ifade taraması ve tablo
 * çıkarımı bu NORMALİZE metin üzerinde koşar — `-- CreateTable` gibi bir
 * yorumun içinde yanlışlıkla `DROP ` geçmesi kalıcı yanlış pozitif üretmez.
 * Büyük/küçük harf duyarlılığı bu fonksiyon için bilinçli olarak KORUNUR
 * (yorum sınırı `--` değişmez bir jeton; harf duyarlılığı kararı yalnızca YORUM
 * temizliği içindir, aşağıdaki yıkıcı ifade taraması için ayrıca normalize edilir).
 */
function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const commentIndex = line.indexOf('--')
      return commentIndex === -1 ? line : line.slice(0, commentIndex)
    })
    .join('\n')
}

/**
 * Yıkıcı ifade taraması (DÜZELTME TURU 5, security gate T-004 tur 5, bulgu
 * high — kullanıcı kararı: HEAD semantiğine dönüş). `stripLineComments`'ten
 * geçmiş metin üzerinde, BÜYÜK/küçük harfe NORMALİZE ETMEDEN, basit
 * `includes('DROP ')` / `includes('SET NOT NULL')` — turu 1'in harf/boşluk
 * duyarsızlığı (C1, `\bDROP\s` / `\bSET\s+NOT\s+NULL\b` regex'leri) ve
 * turu 2/3/4'ün tek tırnaklı dize literali maskeleme zinciri TAMAMEN GERİ
 * ALINDI (bkz. dosya başı "DÜZELTME TURU 5" — üç turda üç sezgisel denendi,
 * üçü de bir sonraki turda atlatıldı; mekanizma yanlıştı, eşik değil).
 * Bilinen, KASITLI yanlış pozitif: büyük harfle yazılmış bir dize literali
 * içindeki "DROP " (`'DROP SHIPPING'`) de yakalanır — HEAD'in zaten taşıdığı
 * davranış, fail-closed ve `migration-sql.test.ts`'te regresyon vakasıyla
 * PİNLENMİŞ (gelecekte "düzeltme" diye maskeleme geri gelmesin).
 */
const DESTRUCTIVE_DROP_TOKEN = 'DROP '
const DESTRUCTIVE_SET_NOT_NULL_TOKEN = 'SET NOT NULL'

/**
 * "Ayna bekçisi" (solid gate T-004 tur 2, medium önerisi): tablo ADI
 * deseninin (`extractCreatedTableNames`) TANIMADIĞI bir `CREATE TABLE`
 * biçimi (ör. tırnaksız ad — bu turda ayrıştırılmıyor, v0.0.13 borcu)
 * sessizce geçmesin. Harf/boşluk DUYARSIZ, YAKALAMA GRUBU YOK — bu bir
 * ÇIKARIM deseni değil, SAYAÇ; R-C6'nın yasakladığı "ikinci ad/gövde
 * deseni" bu DEĞİL. `UNLOGGED`/`TEMP(ORARY)`/`GLOBAL`/`LOCAL` değiştiricileri
 * düzeltme turu 3'te eklendi (security gate T-004 tur 3, bulgu low/C3 —
 * seçim): bu biçimler önceden hem ad deseninden HEM bekçiden kaçıyordu
 * (TAM fail-open); artık en azından bekçi onları görüyor ve
 * `UNPARSABLE_CREATE_TABLE` ile işaretliyor (fail-closed). `CREATE` ile
 * `TABLE` jetonları arasına blok yorumu (slash-star...star-slash) konan
 * biçim KASITLI OLARAK dışarıda bırakıldı — blok yorumlarının hiç
 * temizlenmemesiyle aynı sınır (R-C4'ün kardeşi), ayrı bir normalizasyon
 * gerektirir ve somut senaryo kurmak için fazla egzotik; ROADMAP borcu
 * (`architect`, v0.0.13, R-C4 ile birlikte).
 * DÜZELTME TURU 5 (security gate T-004 tur 5, bulgu high — kullanıcı
 * kararı): maskeleme makinesi TAMAMEN KALDIRILDIĞI için bekçi artık yeniden
 * `stripLineComments` çıktısı (`sql`, maskelenmemiş) üzerinde sayıyor.
 * Turu 3'ün kapattığı yanlış pozitif (`INSERT ... VALUES ('CREATE TABLE x')`
 * gibi bir dize literali içindeki sahte jetonun `tokenCount`'u şişirmesi)
 * BİLEREK YENİDEN AÇILDI — kabul edilebilir, çünkü bu FAIL-CLOSED (gürültülü
 * kırmızı — insan incelemesi gerektiren sahte `UNPARSABLE_CREATE_TABLE`),
 * yıkıcı ifade taramasının FAIL-OPEN'ı (sessizce veri kaybına yol açan bir
 * `DROP`'u yutmak) kadar tehlikeli DEĞİL. ROADMAP borcu olarak kaydedildi
 * (`architect`, v0.0.13, durum-tutan tek geçişli tarayıcıyla birlikte).
 */
const CREATE_TABLE_TOKEN_PATTERN =
  /CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+|GLOBAL\s+|LOCAL\s+)*TABLE\b/gi

type CreatedTableBody = {
  readonly tableName: string
  readonly body: string
}

/**
 * `CREATE TABLE "<ad>" (...);` bloklarını (ad, gövde) çiftleri olarak çıkarır.
 * Yardımcıdaki TEK `CREATE TABLE` GÖVDE deseni budur (R-C6) — Prisma'nın
 * kanonik emit şekline (kapanışın kendi satırında `\n);` olması) bağlıdır.
 * Bu desenle UYUŞMAYAN (tek satırlık, girintili kapanış vb.) bir `CREATE TABLE`
 * burada GÖRÜNMEZ — çağıran taraf bunu `extractCreatedTableNames`'in gevşek
 * sonucuyla karşılaştırarak `UNPARSABLE_CREATE_TABLE` üretir, sessizce geçmez.
 *
 * DÜZELTME TURU 2 (security tur2 medium, solid tur2 medium + low/D1):
 *   - `i` bayrağı + `CREATE\s+TABLE` + opsiyonel `IF NOT EXISTS` + opsiyonel
 *     (tırnaklı veya tırnaksız) şema öneki eklendi — `create table "x" (...)`,
 *     `CREATE TABLE IF NOT EXISTS "x"`, `CREATE TABLE public."x"` artık
 *     yakalanıyor (önceden tamamen GÖRÜNMEZDİ).
 *   - gövde çapası `([\s\S]*?)\n\);`'ten `([^;]*?)\n\);`'e daraltıldı (D1):
 *     eski çapa İFADE SINIRINI aşıp bir SONRAKİ kanonik `CREATE TABLE`'ın
 *     gövdesini yutabiliyordu (tek satırlık bir tablo onu izleyen kanonik
 *     tabloyu "UNPARSABLE_CREATE_TABLE" olarak YANLIŞ etiketliyordu).
 *
 * DÜZELTME TURU 3 (security tur3, bulgu low/C2): D1'in `[^;]*?` çapası
 * YENİ bir yanlış pozitif doğurmuştu — gövdesinde noktalı virgül taşıyan
 * KANONİK bir tablo (`DEFAULT 'a;b'`, `CHECK ("id" <> ';')`) artık
 * ayrıştırılamıyordu. Çapa `;` yasağı yerine negatif ileri-bakışa geçti:
 * gövde SERBESTÇE herhangi bir karakter (noktalı virgül dahil) içerebilir,
 * TEK şart bir SONRAKİ `CREATE TABLE` jetonunu İÇERMEMESİ — D1'in asıl amacı
 * ("bir sonraki kanonik tabloyu yutmama") bu şekilde korunur, ama `;` artık
 * gövdenin içinde serbestçe geçebilir.
 */
function extractCreatedTableBodies(normalizedSql: string): readonly CreatedTableBody[] {
  const pattern =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|\w+)\.)?"([^"]+)"\s*\(((?:(?!CREATE\s+TABLE)[\s\S])*?)\n\);/gi
  const tables: CreatedTableBody[] = []

  for (const match of normalizedSql.matchAll(pattern)) {
    const tableName = match[1]
    const body = match[2]
    if (tableName === undefined || body === undefined) {
      continue
    }
    tables.push({ tableName, body })
  }

  return tables
}

/**
 * `CREATE TABLE "<ad>"` ifadelerinin SADECE adını çıkarır — yardımcıdaki TEK
 * `CREATE TABLE` AD deseni budur (R-C6). Prisma'nın tam emit biçimine bağlı
 * DEĞİLDİR: tek satırlık veya kapanışı girintili bir `CREATE TABLE` de
 * yakalanır. `UNCLASSIFIED_TABLE` ve "tablo migration kümesinde hiç yaratıldı
 * mı" soruları SADECE bu deseni kullanır — gövde gerekmez.
 *
 * Eklenme nedeni (security gate T-004 tur 1, bulgu 1/high): bu gevşek ad
 * deseni ilk yazımda KALDIRILMIŞTI; sonuç, kanonik biçime uymayan bir
 * `CREATE TABLE` ifadesinin hem `UNCLASSIFIED_TABLE` hem `TENANT_ID_ON_PLATFORM_TABLE`
 * kuralına TAMAMEN görünmez olmasıydı. v0.0.13'te elle yazılacak SQL
 * migration'ları (RLS politikaları, rol ayrımı) bu biçimi taşıyabilir.
 *
 * DÜZELTME TURU 2 (security tur2 + solid tur2, ORTAK medium): bu desen
 * kanonik GÖVDE sınırına bağlı değildi ama HÂLÂ harf duyarlıydı ve
 * `CREATE TABLE` jetonuna bitişikti — `create table "x" (...)`,
 * `Create Table`, `CREATE  TABLE` (çift boşluk), `CREATE TABLE IF NOT EXISTS`,
 * `CREATE TABLE public."x"`, `CREATE\nTABLE` HİÇBİRİ eşleşmiyordu (ampirik,
 * security tur2 bulgu 1). `i` bayrağı + `\s+` + opsiyonel `IF NOT EXISTS` +
 * opsiyonel şema öneki eklendi; tırnaksız ad (`CREATE TABLE invoice (...)`)
 * bu desenin KAPSAMI DIŞINDA kalıyor (v0.0.13 borcu) — ama
 * `CREATE_TABLE_TOKEN_PATTERN` ile karşılaştırılan "ayna bekçisi" (aşağıda,
 * `collectMigrationSetViolations`) o biçimi de SESSİZCE geçirmez.
 */
function extractCreatedTableNames(normalizedSql: string): readonly string[] {
  const pattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|\w+)\.)?"([^"]+)"/gi
  const names: string[] = []

  for (const match of normalizedSql.matchAll(pattern)) {
    const name = match[1]
    if (name === undefined) {
      continue
    }
    names.push(name)
  }

  return names
}

/**
 * `prisma/migrations/` altında `migration.sql` İÇEREN her dizini okur (AC1).
 * `migration_lock.toml`'u VEYA `migration.sql` taşımayan dizinleri (V3)
 * sessizce dışlar; kök seviyesinde dizin OLMAYAN bir girdi (örn. kökteki
 * `migration_lock.toml`) `entry.isDirectory()` kontrolüyle baştan elenir.
 * Dönen dizi dizin adına göre LEKSİKOGRAFİK sıradadır.
 *
 * VARSAYIM(V1): migration dizin adlarının leksikografik sırası (Prisma'nın
 * `<YYYYMMDDHHMMSS>_<ad>` biçimi) kronolojik sıraya eşittir. `localeCompare`
 * KASITLI OLARAK kullanılmaz — yerel ayara bağlı sıralama sapması riskini önler
 * (K-C6).
 */
export function readMigrationSet(migrationsDir: URL): readonly MigrationFile[] {
  const normalizedBase = withTrailingSlash(migrationsDir)

  let entries: readonly Dirent[]
  try {
    entries = readdirSync(normalizedBase, { withFileTypes: true })
  } catch (cause) {
    throw new Error(`migration dizini okunamadı: ${normalizedBase.href}`, { cause })
  }

  const baseDirectoryPath = fileURLToPath(normalizedBase)

  const migrations: MigrationFile[] = []
  for (const entry of entries) {
    // Gerçek Prisma düzeninde `!entry.isDirectory()` yalnızca normal DOSYALARI
    // (ör. kök seviyesindeki `migration_lock.toml`) eler; bu özel girdi için
    // aşağıdaki `existsSync` kontrolü de AYNI sonuca varır (bir dosyanın
    // "alt yolu" hiçbir zaman var olamaz) — iki kontrol bu girdi sınıfı için
    // REDUNDANT (qa gate T-004 tur 2, mutasyon testiyle ölçüldü). Bu dalın
    // GERÇEKTEN ayrıştığı tek girdi sınıfı: `migration.sql` İÇEREN bir dizine
    // işaret eden bir SEMBOLİK BAĞ (`Dirent.isDirectory()` symlink için
    // `false` döner, `existsSync` ise bağlantıyı İZLER ve `true` döner) —
    // `migration-sql.test.ts`'teki symlink vakası bu dalı GERÇEKTEN pinler.
    if (!entry.isDirectory()) {
      continue
    }
    // C2 (security tur1 bulgu3, low): eski hâl `new URL(`${entry.name}/migration.sql`,
    // normalizedBase)` kuruyordu — bu, dizin adını URL-kodlamıyordu; `#`/`?`/`%`
    // içeren bir ad için `existsSync` sessizce `false` döner, dizin AC1'in
    // "her dizin okunur" sözleşmesini sessizce ihlal ederek atlanırdı. Dosya
    // sistemi yolu üzerinden gidip sonra `pathToFileURL` ile URL'e çevirmek bu
    // sınıfı kapatır (Prisma dizin adını slug'ladığı için bugün ulaşılamaz,
    // ama devralınan kusuru düzeltmek maliyetsiz).
    const sqlUrl = pathToFileURL(join(baseDirectoryPath, entry.name, 'migration.sql'))
    if (!existsSync(sqlUrl)) {
      // V3: yalnızca `migration_lock.toml` taşıyan (veya boş) dizin dışlanır.
      // Bu kontrol `migration.sql` İÇERMEYEN bir dizin için existsSync
      // yarısını kanıtlar (düzeltme turu 3, solid gate T-004 tur 3 bulgu
      // low/C5-iii — önceki atıf YANLIŞ tesisi gösteriyordu: gerçek kanıt
      // "kök seviyesindeki migration_lock.toml" vakası DEĞİL, o girdi bir
      // satır önceki `isDirectory()` kontrolüyle elenip bu dala hiç GELMEZ.
      // Bu dalı gerçekten koşturan, `migration-sql.test.ts`'teki
      // `buildPrimaryProbDirectories`'in "..._fixture_lock_only" dizinidir,
      // AC1 vakası). `isDirectory()` dalının GERÇEKTEN pinlendiği
      // (`existsSync`'ten ayrıştığı) tek vaka symlink vakasıdır — yukarıdaki
      // yorum.
      continue
    }
    migrations.push({ directoryName: entry.name, sql: readFileSync(sqlUrl, 'utf8') })
  }

  return [...migrations].sort((a, b) => {
    if (a.directoryName < b.directoryName) {
      return -1
    }
    if (a.directoryName > b.directoryName) {
      return 1
    }
    return 0
  })
}

/**
 * Migration kümesinin TAMAMINDAN türetilen kümülatif şema yüzeyini taksonomiyle
 * iki yönlü karşılaştırır; tüm ihlalleri (tek seferde, ilk ihlalde durmadan)
 * döndürür. `validateMigrationSet` bunun ince bir fırlatma sarmalayıcısıdır
 * (K-C3) — muafiyet mekanizması (R1/K-C8) ileride bu fonksiyonun ÇIKTISINI
 * filtreleyerek eklenir, bugün hiçbir parametre eklenmez.
 *
 * NOT (solid gate T-004 tur 1, low bulgu — kayıtlı teknik borç, DOKUNULMADI):
 * bu fonksiyon `MigrationSetRule`'daki kuralların TAMAMINI tek gövdede
 * barındırıyor (gerçek satır sayısı yorumda SABİTLENMEZ — solid gate T-004
 * tur 3, bulgu low/C5-i: bu sayı art arda üç turda bayatladı; ROADMAP borç
 * defterinde S2(c) olarak kayıtlı, çift kayıt yapılmaz); v0.0.13'te canlı
 * şema kuralları eklenmeden ÖNCE kural başına saf yardımcılara bölünmesi
 * öneriliyor. Bu düzeltme turunda da BİLEREK bölünmedi — R-C6 (tek ad
 * deseni + tek gövde deseni) riskini en aza indirmek için.
 */
export function collectMigrationSetViolations(
  migrations: readonly MigrationFile[],
  taxonomy: TenantTaxonomy,
): readonly MigrationSetViolation[] {
  const violations: MigrationSetViolation[] = []

  if (migrations.length === 0) {
    violations.push({
      rule: 'EMPTY_MIGRATION_SET',
      migrationDirectoryName: undefined,
      tableName: undefined,
      message:
        'migration kümesi boş: en az bir "migration.sql" içeren dizin bekleniyor (sahte-yeşil kapısı, AC6).',
    })
    return violations
  }

  const platformTables = new Set(taxonomy.platformLevelTables)
  const tenantTables = new Set(taxonomy.tenantScopedTables)

  // C4 (solid tur1, low): önceki hâl `Map<directoryName, string>` kurup
  // `.get()` ile geri okuyordu; Map AYNI `migrations` dizisinden dolduğu için
  // `.get()` HİÇBİR ZAMAN `undefined` dönemiyordu — üç `continue` dalı ve bir
  // `?? ''` ERİŞİLEMEZ kalıyordu. Tek geçişlik bir dizi bu dört ölü dalı ortadan
  // kaldırır ve aynı `directoryName`'in iki kez geçilmesi durumunda oluşacak
  // sessiz "son yazan kazanır" çakışmasını da (Map anahtarlaması) kapatır.
  //
  // DÜZELTME TURU 5 (security gate T-004 tur 5, bulgu high — kullanıcı
  // kararı): `maskedSql`/`maskingSkipped` KALDIRILDI — maskeleme makinesi
  // tamamen geri alındı (bkz. dosya başı "DÜZELTME TURU 5"). Tek bir `sql`
  // (yalnızca yorum temizlenmiş, MASKELENMEMİŞ) hem ad/gövde çıkarımı HEM
  // yıkıcı ifade taraması HEM ayna bekçisi için kullanılır.
  const normalizedMigrations: readonly {
    readonly migration: MigrationFile
    readonly sql: string
  }[] = migrations.map((migration) => {
    const sql = stripLineComments(migration.sql)
    return { migration, sql }
  })

  // Yıkıcı ifade taraması — her migration kendi içinde değerlendirilir (AC7c).
  // DÜZELTME TURU 5 (security gate T-004 tur 5, bulgu high — kullanıcı
  // kararı): turu 1'in harfe normalize etmesi (C1) ve turu 2/3/4'ün tek
  // tırnaklı dize literali maskeleme zinciri (ve onun ürettiği `UNPARSABLE_SQL`
  // kuralı) TAMAMEN GERİ ALINDI. Tarama artık HEAD semantiğinde: büyük/küçük
  // harfe DUYARLI, basit `includes('DROP ')` / `includes('SET NOT NULL')`,
  // `stripLineComments`'ten geçmiş (ama maskelenmemiş) metin üzerinde.
  for (const { migration, sql } of normalizedMigrations) {
    if (sql.includes(DESTRUCTIVE_DROP_TOKEN) || sql.includes(DESTRUCTIVE_SET_NOT_NULL_TOKEN)) {
      violations.push({
        rule: 'DESTRUCTIVE_STATEMENT',
        migrationDirectoryName: migration.directoryName,
        tableName: undefined,
        message: `${migration.directoryName}: migration.sql içinde yıkıcı ifade (DROP veya SET NOT NULL) bulundu — expand/contract politikası ihlali.`,
      })
    }
  }

  // "Ayna bekçisi" (solid gate T-004 tur 2, medium önerisi) — her migration
  // kendi içinde: harf duyarsız `CREATE TABLE` JETON sayısı, AD deseninin
  // çıkardığı ad sayısından FAZLAYSA (ör. tırnaksız tablo adı gibi tanınmayan
  // bir biçim), sessizce geçmek yerine `UNPARSABLE_CREATE_TABLE` üretir.
  // Tırnaksız adın KENDİSİ bu turda ayrıştırılmıyor (v0.0.13 borcu) — bekçi
  // yalnızca "bir şey kaçtı" sinyalini verir.
  // DÜZELTME TURU 5 (security gate T-004 tur 5, bulgu high — kullanıcı
  // kararı): maskeleme makinesi KALDIRILDIĞI için bekçi artık yeniden `sql`
  // (stripLineComments çıktısı, MASKELENMEMİŞ) üzerinde sayıyor — turu 3'ün
  // kapattığı `INSERT ... VALUES ('CREATE TABLE x')` yanlış pozitifi (bkz.
  // yukarıdaki fonksiyon doc'u) BİLEREK YENİDEN AÇILDI, ROADMAP borcu.
  for (const { migration, sql } of normalizedMigrations) {
    const tokenCount = [...sql.matchAll(CREATE_TABLE_TOKEN_PATTERN)].length
    const nameCount = extractCreatedTableNames(sql).length
    if (tokenCount > nameCount) {
      violations.push({
        rule: 'UNPARSABLE_CREATE_TABLE',
        migrationDirectoryName: migration.directoryName,
        tableName: undefined,
        message: `${migration.directoryName}: migration.sql içinde ${tokenCount.toString()} "CREATE TABLE" ifadesi bulundu ama yalnızca ${nameCount.toString()} tanesi tırnaklı ad deseniyle eşleşti — tanınmayan bir biçim (ör. tırnaksız tablo adı) olabilir.`,
      })
    }
  }

  // Ad çıkarımı (GEVŞEK desen) — her tablonun İLK göründüğü dizin (K-C6:
  // "ilk yaratım kazanır"). Gövdeye bakmaz, dolayısıyla biçim sapmasından
  // etkilenmez.
  const firstNameOccurrenceByTable = new Map<string, string>()
  for (const { migration, sql } of normalizedMigrations) {
    for (const tableName of extractCreatedTableNames(sql)) {
      if (tableName === PRISMA_INTERNAL_TABLE) {
        continue
      }
      if (!firstNameOccurrenceByTable.has(tableName)) {
        firstNameOccurrenceByTable.set(tableName, migration.directoryName)
      }
    }
  }

  // Gövde çıkarımı (KATI desen) — her tablonun İLK ayrıştırılabilir gövdesi.
  // Bir tablo adı yukarıda görünüp burada görünmüyorsa, o tablonun İLK
  // yaratımı kanonik biçime uymuyordur → `UNPARSABLE_CREATE_TABLE`.
  const firstBodyByTable = new Map<
    string,
    { readonly directoryName: string; readonly body: string }
  >()
  for (const { migration, sql } of normalizedMigrations) {
    for (const table of extractCreatedTableBodies(sql)) {
      if (table.tableName === PRISMA_INTERNAL_TABLE) {
        continue
      }
      if (!firstBodyByTable.has(table.tableName)) {
        firstBodyByTable.set(table.tableName, {
          directoryName: migration.directoryName,
          body: table.body,
        })
      }
    }
  }

  for (const [tableName, directoryName] of firstNameOccurrenceByTable) {
    const isPlatformTable = platformTables.has(tableName)
    const isTenantTable = tenantTables.has(tableName)

    if (!isPlatformTable && !isTenantTable) {
      violations.push({
        rule: 'UNCLASSIFIED_TABLE',
        migrationDirectoryName: directoryName,
        tableName,
        message: `${directoryName}: "${tableName}" tablosu PLATFORM_LEVEL_TABLES veya TENANT_SCOPED_TABLES taksonomisinde sınıflandırılmamış.`,
      })
      continue
    }

    // Gövde gerektiren iki kural (`TENANT_ID_ON_PLATFORM_TABLE`,
    // `MISSING_TENANT_ID_COLUMN`) ayrıştırılamayan bir gövdeyi SESSİZCE
    // GEÇMEZ (security gate T-004 tur 1, bulgu 1/high) — bunun yerine
    // `UNPARSABLE_CREATE_TABLE` üretir.
    const bodyRecord = firstBodyByTable.get(tableName)
    if (bodyRecord === undefined) {
      violations.push({
        rule: 'UNPARSABLE_CREATE_TABLE',
        migrationDirectoryName: directoryName,
        tableName,
        message: `${directoryName}: "${tableName}" tablosunun CREATE TABLE gövdesi ayrıştırılamadı (Prisma'nın kanonik emit biçimine uymuyor) — "tenant_id" kontrolü yapılamadı.`,
      })
      continue
    }

    if (isPlatformTable && bodyRecord.body.includes('"tenant_id"')) {
      violations.push({
        rule: 'TENANT_ID_ON_PLATFORM_TABLE',
        migrationDirectoryName: bodyRecord.directoryName,
        tableName,
        message: `${bodyRecord.directoryName}: "${tableName}" PLATFORM_LEVEL_TABLES'ta olduğu halde "tenant_id" kolonu taşıyor.`,
      })
    }

    if (isTenantTable && !bodyRecord.body.includes('"tenant_id" TEXT NOT NULL')) {
      violations.push({
        rule: 'MISSING_TENANT_ID_COLUMN',
        migrationDirectoryName: bodyRecord.directoryName,
        tableName,
        message: `${bodyRecord.directoryName}: "${tableName}" TENANT_SCOPED_TABLES'ta olduğu halde "tenant_id" TEXT NOT NULL kolonu taşımıyor.`,
      })
    }
  }

  const cumulativeNormalizedSql = normalizedMigrations.map((entry) => entry.sql).join('\n')

  for (const tableName of tenantTables) {
    const directoryName = firstNameOccurrenceByTable.get(tableName)
    if (directoryName === undefined) {
      violations.push({
        rule: 'MISSING_TENANT_SCOPED_TABLE',
        migrationDirectoryName: undefined,
        tableName,
        message: `TENANT_SCOPED_TABLES'taki "${tableName}" tablosu migration kümesinin HİÇBİRİNDE yaratılmamış.`,
      })
      continue
    }

    // C8 (solid tur1, low) — KASITLI: CLAUDE.md §7 tenant_id öncü KOLONLU
    // (tenant_id, <sorgulanan kolon>) BİLEŞİK indeks şartı. Sondaki virgül
    // ("tenant_id",) indeksin EN AZ İKİ kolonlu olmasını zorunlu kılar; tek
    // kolonlu `ON "t"("tenant_id")` kuralın adını ("öncü kolonlu") taşısa da
    // kasıtlı olarak ihlal sayılır. Pinned test: migration-sql.test.ts —
    // "tek kolonlu tenant_id UNIQUE INDEX bileşik şartı karşılamaz" vakası
    // (solid gate T-004 tur 1, bulgu C8).
    const uniqueIndexPattern = new RegExp(
      `CREATE UNIQUE INDEX "[^"]+" ON "${tableName}"\\("tenant_id",`,
    )
    if (!uniqueIndexPattern.test(cumulativeNormalizedSql)) {
      violations.push({
        rule: 'MISSING_TENANT_ID_LEADING_UNIQUE_INDEX',
        migrationDirectoryName: directoryName,
        tableName,
        message: `"${tableName}" için "tenant_id" öncü kolonlu bir CREATE UNIQUE INDEX bulunamadı.`,
      })
    }
  }

  return violations
}

/**
 * {@link collectMigrationSetViolations}'ın ince fırlatma sarmalayıcısı.
 * İhlal yoksa sessizce döner; varsa TEK bir `Error` fırlatır ve mesajı HER
 * ihlali satır satır içerir (K-C3).
 */
export function validateMigrationSet(
  migrations: readonly MigrationFile[],
  taxonomy: TenantTaxonomy,
): void {
  const violations = collectMigrationSetViolations(migrations, taxonomy)
  if (violations.length === 0) {
    return
  }

  const lines = violations.map((violation) => `- [${violation.rule}] ${violation.message}`)
  throw new Error(
    `migration kümesi doğrulaması başarısız (${violations.length.toString()} ihlal):\n${lines.join('\n')}`,
  )
}
