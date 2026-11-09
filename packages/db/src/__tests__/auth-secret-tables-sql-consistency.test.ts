// @arkesoft/db — "SQL ≡ TS" birebir küme assert'i: sır taşıyan tablo kümesi
// (ROADMAP v0.0.15, T-016/S2 FIX turu 1, `solid` [medium] M-5 bulgusu).
//
// GEREKÇE (M-5): sır taşıyan tablo kümesi altı yerde yazılıdır. Üçü mekanik
// olarak kapalıdır (`tenancy.ts`'in `AUTH_SECRET_BEARING_TABLES`'ı,
// `client.ts`'in `AUTH_SECRET_BEARING_MODELS`'ı ve ikisini birbirine bağlayan
// `__tests__/type-pins/auth-secret-tables.pin.ts`'in üç yollu derleme zamanı
// pin'i) — yedinci bir sır taşıyan model/tablo eklenip bu üçten biri
// güncellenmezse `pnpm typecheck` KIRMIZI olur. KALAN ÜÇ yer BUGÜNE KADAR
// KORUMASIZDI: `sql/bootstrap-roles.sql`'in dış `FOREACH` LİTERAL dizisi,
// `sql/rollback-auth-role.sql`'in AYNI dizinin ikinci kopyası ve
// `tenancy.ts`'in `AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`'ı — bunlardan
// birine yeni tablo eklenmezse TİP SİSTEMİ SESSİZ kalır (üçü de düz `string`/
// `readonly string[]` taşır, kapalı dünya `Exclude<>` pin'i YOKTUR) ve
// yedinci tablo `arkesoft_auth`'ta yetkisiz doğar — belirtisi "2FA kodu kabul
// edilmiyor" olan, kök sebebi SQL'de olan bir YANLIŞ TEŞHİS sınıfı (S2/S3b'de
// GERÇEKTEN yaşandı: `rollback-auth-role.isolation.test.ts`'in elle yazılmış
// DDL taklidi güncellenmeyince `test:isolation` "expected 34 to be 45" ile
// kırmızıya döndü).
//
// KARAR (A/B seçimi, bu alt görev `db`): YOL (B) seçildi — SQL dizilerini
// `tenancy.ts`'ten ÜRETMEK (YOL A) `bootstrap-roles.ts`/`rollback-roles.ts`'in
// `prisma db execute --file <path>` ÇAĞRISINI (statik dosya yolu, şablonlama
// YOK) değiştirmeyi gerektirirdi — bu, bugün İYİ test edilmiş bootstrap/
// rollback akışını (idempotency, iki geçişli CI sırası, kill-switch
// kademeleri) DAHA RİSKLİ bir yüzeye taşır. YOL (B) — bu dosya — SADECE
// doğrulama ekler, hiçbir çalışma zamanı/CI akışını DEĞİŞTİRMEZ. Her iki
// SQL dosyası da `tenancy.ts`'teki GERÇEK `AUTH_SECRET_BEARING_TABLES`'a
// KARŞI (birbirlerine karşı DEĞİL — TEK KAYNAK `tenancy.ts`) ayrıştırılıp
// karşılaştırılır; bu dosya KENDİSİ dördüncü bir LİTERAL dizi YAZMAZ, SQL
// metnini `fs` ile PARSE eder (emsal: `apps/api/src/__tests__/
// auth-path-sets.test.ts:210-243`'ün "tenancy auth'tan import etmez" mekanik
// kanıtı — HAM metin taraması, ikinci bir elle yazılmış liste DEĞİL).
//
// Bu dosya `.isolation.test.ts` DEĞİLDİR — DB'ye dokunmaz, `vitest.config.ts`'in
// `include: ['src/**/*.test.ts']` deseniyle normal `pnpm --filter @arkesoft/db
// test` hattında koşar.
//
// DÜZELTME (FIX turu 3, `solid` [low] bulgusu): `extractForeachSecretTableArray`
// ESKİDEN `.exec()` kullanıyordu — bu, dosya başına yalnızca İLK
// `FOREACH secret_table_name IN ARRAY ARRAY[...]` dizisini yakalar. `solid`'in
// gözlemi: bootstrap/rollback akışları çok kademeli olabilir (bkz. bu dosyanın
// zaten belgelediği iki geçişli CI sırası) — SQL dosyasına İKİNCİ bir
// `FOREACH secret_table_name` döngüsü eklenirse (örn. ayrı bir tablo grubu için)
// o ikinci dizi bu testin GÖRÜŞ ALANI DIŞINDA kalır ve M-5'in kapattığı sessiz
// sapma oradan GERİ DÖNER — ikinci dizi `AUTH_SECRET_BEARING_TABLES`'tan
// sapsa bile hiçbir test bunu yakalamaz.
//
// KARAR (YOL A seçildi, YOL B'ye KARŞI): `matchAll` + "dosya başına TAM 1 eşleşme"
// assert'i. YOL B (tüm dizilerin BİRLEŞİMİNİ doğrulamak) ikinci bir döngüyü
// OTOMATİK kapsardı ama "beklenmeyen ikinci döngü var" SİNYALİNİ kaybederdi —
// biri mevcut dörtlü kümeyle TUTARLI yeni bir FOREACH eklese bile bu testin
// amacı (SQL'deki TÜM sır-tablosu dizilerinin TEK, bilinen, denetlenmiş bir
// kaynaktan geldiğini garanti etmek) sessizce GENİŞLERDİ. YOL A fail-closed'tur
// — projenin genel deseniyle TUTARLI (bkz. CLAUDE.md §10 madde 6 "testi
// gevşetme yasağı" ruhu): ikinci döngü eklendiğinde test KIRMIZI olur, hangi
// dosyada kaç eşleşme bulunduğunu adlandırır, ve geliştirici bu testi (ve
// karşılaştırma mantığını) BİLİNÇLİ olarak güncellemeye ZORLANIR — "neden
// ikinci bir döngü var, hangi tabloları kapsıyor, tenancy.ts'in TEK kaynak
// olma garantisini nasıl etkiliyor" sorusu ELLE cevaplanmadan CI yeşile
// dönmez.
//
// Bu değişiklik `:90-93`'teki anti-vacuity bekçisiyle ÇELİŞMEZ — o bekçi
// "regex eşleşti AMA içi boş [...] döndü" senaryosunu (ayrıştırma bozuldu mu?)
// kapatır, YOL A'nın yeni kontrolü ise "regex hiç eşleşmedi" (0) VEYA "birden
// fazla eşleşti" (>1) senaryolarını kapatır — üçü de AYRI, İSİMLENDİRİLMİŞ
// hatalar üretir, birbirinin yerini TUTMAZ.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS, AUTH_SECRET_BEARING_TABLES } from '../tenancy.js'

const BOOTSTRAP_SQL_PATH = fileURLToPath(new URL('../../sql/bootstrap-roles.sql', import.meta.url))
const ROLLBACK_SQL_PATH = fileURLToPath(
  new URL('../../sql/rollback-auth-role.sql', import.meta.url),
)

/**
 * `sql/bootstrap-roles.sql` ve `sql/rollback-auth-role.sql`'in paylaştığı
 * `FOREACH secret_table_name IN ARRAY ARRAY[...]` LİTERAL dizisini çıkarır.
 * Bağlı parametre YOKTUR (DDL betiği, `CREATE/ALTER ROLE ... $1` PostgreSQL'de
 * geçersiz — dosya başı yorumları) — bu yüzden METİN ayrıştırması meşru tek
 * yoldur; `pg`/`@prisma/adapter-pg` İLE GERÇEKTEN PARSE ETMEK bu testi bir DB
 * bağlantısına bağımlı kılardı (K-E9'un izolasyon ayrımını BOZAR).
 *
 * Dosya başına TAM 1 eşleşme BEKLENİR (FIX turu 3, YOL A — bkz. dosya başı
 * yorum): `matchAll` KULLANILIR ama sonuç `.exec()`'teki gibi sessizce İLKİ
 * alınmaz — eşleşme sayısı 0 veya >1 ise AYRI, isimlendirilmiş bir hata
 * fırlatılır. Böylece dosyaya SONRADAN eklenecek ikinci bir
 * `FOREACH secret_table_name` döngüsü bu fonksiyonun GÖRÜŞ ALANI DIŞINDA
 * sessizce kalamaz.
 *
 * Desen hiç BULUNAMAZSA (dosya yeniden yazıldı, söz dizimi değişti) SESSİZCE
 * boş dizi DÖNMEZ — fırlatır. Vacuity riskinin KENDİSİ burada kapatılır:
 * aşağıdaki `it()`'ler bu fonksiyonun ürettiği diziyi KULLANMAK ZORUNDA, boş
 * bir dizi `AUTH_SECRET_BEARING_TABLES` (4 üye) ile asla eşleşmez — ama "neden
 * boş" sorusuna AYRI ve isimlendirilmiş bir hata ile cevap vermek için
 * fırlatma tercih edildi (regex uyuşmazlığını tablo uyuşmazlığından AYIRT
 * ETMEK için). Çoklu eşleşme (>1) durumu da aynı gerekçeyle AYRI bir hata
 * taşır — "regex hiç eşleşmedi" ile "regex birden fazla eşleşti" birbirine
 * KARIŞTIRILMAZ, ikisi de kendi adını taşıyan mesajla fırlatılır.
 */
function extractForeachSecretTableArray(filePath: string): readonly string[] {
  const sqlText = readFileSync(filePath, 'utf-8')
  const matches = [...sqlText.matchAll(/FOREACH secret_table_name IN ARRAY ARRAY\[([^\]]*)\]/g)]
  if (matches.length === 0) {
    throw new Error(
      `"${filePath}" içinde "FOREACH secret_table_name IN ARRAY ARRAY[...]" deseni BULUNAMADI ` +
        "— SQL dosyasının söz dizimi değişti mi? Bu testin regex'i de güncellenmeli.",
    )
  }
  if (matches.length > 1) {
    const matchCount = String(matches.length)
    throw new Error(
      `"${filePath}" içinde "FOREACH secret_table_name IN ARRAY ARRAY[...]" deseni ` +
        `${matchCount} KEZ bulundu (TAM 1 eşleşme bekleniyordu) — dosyaya YENİ bir ` +
        'FOREACH döngüsü mü eklendi? Bu testin karşılaştırma mantığı (ek dizinin hangi ' +
        'tabloları kapsadığı, tenancy.ts ile nasıl ilişkilendirileceği) BİLİNÇLİ olarak ' +
        'gözden geçirilip güncellenmeli (bkz. dosya başı yorum, FIX turu 3 YOL A/B kararı) ' +
        '— sessizce yalnızca ilk eşleşmeyi almak bu testin amacını BOŞALTIR.',
    )
  }
  const arrayLiteralBody = matches[0]?.[1] ?? ''
  return [...arrayLiteralBody.matchAll(/'([^']*)'/g)].map((entry) => entry[1] ?? '')
}

/**
 * `sqlTables` ile `AUTH_SECRET_BEARING_TABLES`'ı İKİ YÖNLÜ karşılaştırır ve
 * uyuşmazlık varsa `label`'ı (çağıranın belirttiği `dosya:satır` kimliği)
 * TAŞIYAN, HANGİ tablonun HANGİ yönde eksik/fazla olduğunu adlandıran bir
 * hata fırlatır. İki ayrı `expect` çağrısı (eksik/fazla) — tek bir
 * `toEqual(new Set(...))` yerine — ÇÜNKÜ `toEqual` başarısızlık mesajı tüm
 * kümeyi basar, "hangi TABLO" sorusunu okuyucuya BIRAKIR; buradaki mesaj
 * doğrudan tablo adını taşır (DoD madde 2 — "mesaj hangi yerin eksik olduğunu
 * adlandırmalı").
 */
function expectSqlArrayMatchesTenancySource(label: string, sqlTables: readonly string[]): void {
  expect(
    sqlTables.length,
    `${label}: FOREACH ARRAY deseni eşleşti ama İÇİ BOŞ döndü — ayrıştırma mı bozuldu?`,
  ).toBeGreaterThan(0)

  const sqlSet = new Set<string>(sqlTables)
  const tsSet = new Set<string>(AUTH_SECRET_BEARING_TABLES)

  const missingFromSql = [...tsSet].filter((tableName) => !sqlSet.has(tableName))
  const extraInSql = [...sqlSet].filter((tableName) => !tsSet.has(tableName))

  expect(
    missingFromSql,
    `${label}: tenancy.ts'in AUTH_SECRET_BEARING_TABLES'INDA OLUP bu SQL dosyasının FOREACH ` +
      `dizisinde EKSİK olan tablo(lar): [${missingFromSql.join(', ')}]`,
  ).toEqual([])
  expect(
    extraInSql,
    `${label}: bu SQL dosyasının FOREACH dizisinde OLUP tenancy.ts'in ` +
      `AUTH_SECRET_BEARING_TABLES'INDA OLMAYAN (FAZLA) tablo(lar): [${extraInSql.join(', ')}]`,
  ).toEqual([])
}

describe('SQL ≡ TS — sır taşıyan tablo kümesi (M-5, korumasız yer 1/3 ve 2/3)', () => {
  it('sql/bootstrap-roles.sql:291 FOREACH dizisi AUTH_SECRET_BEARING_TABLES ile BİREBİR aynı kümedir', () => {
    expectSqlArrayMatchesTenancySource(
      'sql/bootstrap-roles.sql (FOREACH secret_table_name IN ARRAY ...)',
      extractForeachSecretTableArray(BOOTSTRAP_SQL_PATH),
    )
  })

  it('sql/rollback-auth-role.sql:70 FOREACH dizisi AUTH_SECRET_BEARING_TABLES ile BİREBİR aynı kümedir', () => {
    expectSqlArrayMatchesTenancySource(
      'sql/rollback-auth-role.sql (FOREACH secret_table_name IN ARRAY ...)',
      extractForeachSecretTableArray(ROLLBACK_SQL_PATH),
    )
  })
})

// --- Korumasız yer 3/3: AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS (S3'ün bulduğu
// boşluk — handoff'un "Orkestratör'ün ilk listesinde bu yoktu" notu) ---
//
// `lintAuthRoleUnexpectedTablePrivileges` (catalog-lint.ts) KATALOG güdümlüdür
// — listeden DÜŞEN bir tabloyu canlı DB'ye karşı yakalar (ters yön zaten
// kapalı). AMA bu TS seviyesinde: `AUTH_SECRET_BEARING_TABLES`'a eklenip
// `AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`'a hiç EKLENMEYEN bir tablo —
// SQL dizileri de güncellenmediyse (yukarıdaki iki testin tam yakaladığı
// senaryo) — katalogda HİÇ İZ bırakmaz, dolayısıyla canlı linter de bunu
// SESSİZCE atlar. Bu test o boşluğu DERLEME/BİRİM seviyesinde, DB'ye hiç
// dokunmadan kapatır.
describe('AUTH_SECRET_BEARING_TABLES ⊆ AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS, columnLevel: true (M-5, korumasız yer 3/3)', () => {
  it("AUTH_SECRET_BEARING_TABLES'teki HER tablo, AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS'ta columnLevel: true ile YER ALIR", () => {
    const expectationByTableName = new Map(
      AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS.map((expectation) => [
        expectation.tableName,
        expectation,
      ]),
    )

    const missingFromExpectations: string[] = []
    const wrongColumnLevel: string[] = []

    for (const tableName of AUTH_SECRET_BEARING_TABLES) {
      const expectation = expectationByTableName.get(tableName)
      if (expectation === undefined) {
        missingFromExpectations.push(tableName)
        continue
      }
      if (!expectation.columnLevel) {
        wrongColumnLevel.push(tableName)
      }
    }

    expect(
      missingFromExpectations,
      "AUTH_SECRET_BEARING_TABLES'te OLUP AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS'ta HİÇ YER " +
        `ALMAYAN tablo(lar): [${missingFromExpectations.join(', ')}] — tenancy.ts:192`,
    ).toEqual([])
    expect(
      wrongColumnLevel,
      "AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS'ta columnLevel: true OLMASI GEREKİRKEN false/eksik " +
        `olan tablo(lar): [${wrongColumnLevel.join(', ')}] — tenancy.ts:192`,
    ).toEqual([])
  })
})
