// @arkesoft/db — "SQL ≡ TS" birebir küme karşılaştırması için PAYLAŞILAN
// yardımcı (FIX turu 1, M3 — `solid` [medium] bulgusu).
//
// GEREKÇE: `auth-secret-tables-sql-consistency.test.ts` (ROADMAP v0.0.15,
// T-016/S2 FIX turu 1) ve `append-only-tables-sql-consistency.test.ts`
// (ROADMAP v0.0.20.2, T-023/S6) AYNI deseni — bir SQL dosyasındaki
// `FOREACH <döngü değişkeni> IN ARRAY ARRAY[...]` LİTERAL dizisini çıkarıp
// `tenancy.ts`'teki bir TypeScript beyanıyla İKİ YÖNLÜ karşılaştırmak —
// BAYT DÜZEYİNDE kopyalıyordu (yalnızca döngü değişkeni adı ve karşılaştırılan
// küme farklıydı). `security`/`solid`'in ölçtüğü gibi iki kopya AYNI sebeple
// (Postgres `FOREACH … IN ARRAY ARRAY[...]` söz dizimini metin olarak
// ayrıştırma ihtiyacı) değişir — `F-NEW-3`'ün "farklı döngü değişkeni adı"
// kısıtı bu PARAMETRELEŞTİRMEYİ engellemiyordu (`loopVariableName` parametresi
// yeterliydi), bu yüzden ayrı dosya yerine TEK ortak yardımcıya taşındı.
//
// Bu dosya `.isolation.test.ts` DEĞİLDİR, DB'ye dokunmaz — her iki çağıran
// test dosyasıyla AYNI sınıf, saf metin ayrıştırması.

import { readFileSync } from 'node:fs'

import { expect } from 'vitest'

/**
 * Verilen SQL dosyasındaki `FOREACH <loopVariableName> IN ARRAY ARRAY[...]`
 * LİTERAL dizisini çıkarır. Dosya başına TAM 1 eşleşme BEKLENİR (FIX turu 3,
 * YOL A — `auth-secret-tables-sql-consistency.test.ts`'in orijinal kararı):
 * `matchAll` kullanılır ama sonuç sessizce İLKİ alınmaz — eşleşme sayısı 0
 * veya >1 ise AYRI, isimlendirilmiş bir hata fırlatılır. Böylece dosyaya
 * SONRADAN eklenecek ikinci bir aynı-adlı `FOREACH` döngüsü bu fonksiyonun
 * GÖRÜŞ ALANI DIŞINDA sessizce kalamaz.
 *
 * Bağlı parametre YOKTUR (DDL betiği, `CREATE/ALTER ROLE ... $1` PostgreSQL'de
 * geçersiz) — bu yüzden METİN ayrıştırması meşru tek yoldur; gerçek bir SQL
 * ayrıştırıcıyla parse etmek bu testi bir DB bağlantısına bağımlı kılardı.
 */
export function extractForeachLiteralArray(
  filePath: string,
  loopVariableName: string,
): readonly string[] {
  const sqlText = readFileSync(filePath, 'utf-8')
  const pattern = new RegExp(`FOREACH ${loopVariableName} IN ARRAY ARRAY\\[([^\\]]*)\\]`, 'g')
  const matches = [...sqlText.matchAll(pattern)]
  if (matches.length === 0) {
    throw new Error(
      `"${filePath}" içinde "FOREACH ${loopVariableName} IN ARRAY ARRAY[...]" deseni ` +
        "BULUNAMADI — SQL dosyasının söz dizimi değişti mi? Bu testin regex'i de güncellenmeli.",
    )
  }
  if (matches.length > 1) {
    const matchCount = String(matches.length)
    throw new Error(
      `"${filePath}" içinde "FOREACH ${loopVariableName} IN ARRAY ARRAY[...]" deseni ` +
        `${matchCount} KEZ bulundu (TAM 1 eşleşme bekleniyordu) — dosyaya YENİ bir ` +
        'FOREACH döngüsü mü eklendi? Bu testin karşılaştırma mantığı BİLİNÇLİ olarak gözden ' +
        'geçirilip güncellenmeli — sessizce yalnızca ilk eşleşmeyi almak bu testin amacını BOŞALTIR.',
    )
  }
  const arrayLiteralBody = matches[0]?.[1] ?? ''
  return [...arrayLiteralBody.matchAll(/'([^']*)'/g)].map((entry) => entry[1] ?? '')
}

/**
 * `sqlTables` ile `declaredTableNames`'i (çağıranın `tenancy.ts`'ten okuduğu
 * GERÇEK beyan) İKİ YÖNLÜ karşılaştırır ve uyuşmazlık varsa `label`'ı
 * (çağıranın belirttiği dosya kimliği) VE `declaredSetLabel`'ı (beyanın adı,
 * örn. `"AUTH_SECRET_BEARING_TABLES"`) TAŞIYAN, HANGİ tablonun HANGİ yönde
 * eksik/fazla olduğunu adlandıran bir hata fırlatır.
 */
export function expectForeachArrayMatchesDeclaredSet(
  label: string,
  declaredSetLabel: string,
  sqlTables: readonly string[],
  declaredTableNames: readonly string[],
): void {
  expect(
    sqlTables.length,
    `${label}: FOREACH ARRAY deseni eşleşti ama İÇİ BOŞ döndü — ayrıştırma mı bozuldu?`,
  ).toBeGreaterThan(0)

  const sqlSet = new Set<string>(sqlTables)
  const declaredSet = new Set<string>(declaredTableNames)

  const missingFromSql = [...declaredSet].filter((tableName) => !sqlSet.has(tableName))
  const extraInSql = [...sqlSet].filter((tableName) => !declaredSet.has(tableName))

  expect(
    missingFromSql,
    `${label}: tenancy.ts'in ${declaredSetLabel}'INDA OLUP bu SQL dosyasının FOREACH ` +
      `dizisinde EKSİK olan tablo(lar): [${missingFromSql.join(', ')}]`,
  ).toEqual([])
  expect(
    extraInSql,
    `${label}: bu SQL dosyasının FOREACH dizisinde OLUP tenancy.ts'in ${declaredSetLabel}'INDA ` +
      `OLMAYAN (FAZLA) tablo(lar): [${extraInSql.join(', ')}]`,
  ).toEqual([])
}
