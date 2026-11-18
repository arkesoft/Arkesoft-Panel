// @arkesoft/db — "SQL ≡ TS" birebir küme assert'i: EKLE-SAL (append-only)
// tablo kümesi (ROADMAP v0.0.20.2, T-023/S6, architect DDL bölümü + po
// "append-only-tables-sql-consistency.test.ts" — emsal:
// `auth-secret-tables-sql-consistency.test.ts`, M-5'in BİREBİR aynı sınıfı).
//
// GEREKÇE: EKLE-SAL sertleştirmesi kümesi ÜÇ yerde yazılıdır — `tenancy.ts`'in
// `APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`'ı (TypeScript, mekanik olarak
// `catalog-lint.ts`'in iki yeni kuralı ile kapalı — DB'ye dokunmadan
// `catalog-lint.test.ts`'in AC-12 testleri bunu doğrular), `sql/
// bootstrap-roles.sql`'in §9'undaki `FOREACH append_only_table_name IN
// ARRAY ARRAY[...]` dizisi ve `sql/rollback-audit-append-only.sql`'in AYNI
// dizinin ikinci kopyası. KALAN İKİ yer (iki SQL dosyası) BUGÜNE KADAR
// KORUMASIZDI — `auth-secret-tables-sql-consistency.test.ts`'in M-5'te
// kapattığı tam sınıf: biri güncellenip diğeri unutulursa TİP SİSTEMİ
// SESSİZ kalır (SQL metni düz string literal taşır, derleme zamanı pin
// YOKTUR).
//
// ⚠⚠ CLAUDE.md §7 "dört liste" tuzağının KARDEŞİ (D11, ROADMAP borcu): bu
// sürüm beyan + 2 SQL dizisi olmak üzere ÜÇ yer yaratıyor. Bu test üçünü
// BİRBİRİNE bağlar ama "hiçbirine eklememek" senaryosunu YAKALAMAZ (üçü de
// aynı anda eksik kalırsa üçü de birbiriyle TUTARLI görünür) — bu sınıf
// CLAUDE.md §7'nin kendisinde YAZILI (D11, bu task'ın kapsamı DIŞINDA,
// `docs` borç satırına yazacak).
//
// Bu dosya `.isolation.test.ts` DEĞİLDİR — DB'ye dokunmaz, `vitest.config.ts`'in
// `include: ['src/**/*.test.ts']` deseniyle normal `pnpm --filter @arkesoft/db
// test` hattında koşar.
//
// FIX turu 1 (M3, `solid` [medium] bulgusu): `extractForeachAppendOnlyTableArray`/
// `expectSqlArrayMatchesDeclaredExpectations` BURADAN ÇIKARILDI —
// `auth-secret-tables-sql-consistency.test.ts`'in BİREBİR aynı deseni (döngü
// değişkeni adı ve karşılaştırılan küme DIŞINDA) taşıyordu. İkisi de
// `helpers/foreach-array-sql-consistency.ts`'teki PARAMETRELEŞTİRİLMİŞ ortak
// yardımcıyı kullanır.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS } from '../tenancy.js'
import {
  expectForeachArrayMatchesDeclaredSet,
  extractForeachLiteralArray,
} from './helpers/foreach-array-sql-consistency.js'

const BOOTSTRAP_SQL_PATH = fileURLToPath(new URL('../../sql/bootstrap-roles.sql', import.meta.url))
const ROLLBACK_SQL_PATH = fileURLToPath(
  new URL('../../sql/rollback-audit-append-only.sql', import.meta.url),
)

/** `tenancy.ts`'teki gerçek beyanın tablo adları — SQL dizileriyle karşılaştırılacak KAYNAK. */
const APP_ROLE_TABLE_PRIVILEGE_EXPECTATION_TABLE_NAMES: readonly string[] =
  APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS.map((expectation) => expectation.tableName)

/**
 * EKLE-SAL `DO $do_audit_append_only$ ... $do_audit_append_only$;` (veya
 * geri alma karşılığı `$do_rollback_audit_append_only$`) bloğunun METNİNİ
 * çıkarır — TAM 1 eşleşme BEKLENİR. `expectDoBodyHasIfExistsGuard`
 * **ve** `extractExactlyOneQuotedVerbList`'in PAYLAŞTIĞI tek ayrıştırma
 * noktası (FIX turu 2, M2 — fiil listesi regex'i dosyanın TAMAMINA karşı
 * koşarsa §7'nin (`REVOKE ALL ... FROM arkesoft_app`) satırıyla da eşleşip
 * "2 eşleşme" hatası verir; kapsam bu bloğa DARALTILIR).
 */
function extractAuditAppendOnlyDoBlock(filePath: string): string {
  const sqlText = readFileSync(filePath, 'utf-8')
  const doBlockPattern =
    /\$do_(?:audit_append_only|rollback_audit_append_only)\$[\s\S]*?\$do_(?:audit_append_only|rollback_audit_append_only)\$;/
  const doBlockMatch = doBlockPattern.exec(sqlText)
  expect(doBlockMatch, `"${filePath}": $do_...$ EKLE-SAL bloğu BULUNAMADI`).not.toBeNull()
  return doBlockMatch?.[0] ?? ''
}

/** `DO` gövdesinin `IF EXISTS` + `pg_tables` koruması taşıdığını doğrular — R3/F-NEW-3'ün yapısal garantisi. */
function expectDoBodyHasIfExistsGuard(filePath: string): void {
  const doBlockText = extractAuditAppendOnlyDoBlock(filePath)
  expect(
    doBlockText.includes('IF EXISTS'),
    `"${filePath}": EKLE-SAL DO bloğu "IF EXISTS" KORUMASI TAŞIMIYOR — taze veritabanında ` +
      '"relation does not exist" ile PATLAR (R3/F-NEW-3).',
  ).toBe(true)
  expect(
    doBlockText.includes('pg_tables'),
    `"${filePath}": EKLE-SAL DO bloğu "pg_tables" ÜZERİNDEN VARLIK KONTROLÜ YAPMIYOR.`,
  ).toBe(true)
}

/**
 * EKLE-SAL `DO` bloğunun İÇİNDEKİ `format(...)`'in İLK (sabit, bağlı
 * parametre taşımayan) dize argümanından `keyword` sonrası,
 * `' ON public.%I ' + direction + ' arkesoft_app'`den ÖNCE gelen fiil
 * listesini çıkarır. Blok içinde TAM 1 eşleşme BEKLENİR —
 * `extractForeachLiteralArray`'in BİREBİR aynı "sessizce ilkini alma"
 * karşıtı deseni (FIX turu 2, M2 — `solid` [medium] bulgusu: bu assert'ten
 * ÖNCE bu fiil listesi HİÇBİR testin görüş alanında DEĞİLDİ — SQL'e
 * `, TRUNCATE` sessizce eklenip/çıkarılabilirdi, hiçbir test kırılmazdı).
 */
function extractExactlyOneQuotedVerbList(
  filePath: string,
  keyword: 'REVOKE' | 'GRANT',
  direction: 'FROM' | 'TO',
): readonly string[] {
  const doBlockText = extractAuditAppendOnlyDoBlock(filePath)
  const pattern = new RegExp(`'${keyword} ([^']*) ON public\\.%I ${direction} arkesoft_app'`, 'g')
  const matches = [...doBlockText.matchAll(pattern)]
  if (matches.length !== 1) {
    const matchCount = String(matches.length)
    throw new Error(
      `"${filePath}" içindeki EKLE-SAL DO bloğunda "'${keyword} ... ON public.%I ${direction} ` +
        `arkesoft_app'" deseni ${matchCount} KEZ bulundu (TAM 1 eşleşme bekleniyordu) — SQL metni ` +
        "değişti mi? Bu testin regex'i de BİLİNÇLİ olarak gözden geçirilip güncellenmeli.",
    )
  }
  const verbListText = matches[0]?.[1] ?? ''
  return verbListText.split(',').map((verb) => verb.trim())
}

describe('SQL ≡ TS — EKLE-SAL (append-only) denetim tablosu kümesi (ROADMAP v0.0.20.2, T-023/S6)', () => {
  it('sql/bootstrap-roles.sql §9 FOREACH dizisi APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS ile BİREBİR aynı kümedir', () => {
    expectForeachArrayMatchesDeclaredSet(
      'sql/bootstrap-roles.sql §9 (FOREACH append_only_table_name IN ARRAY ...)',
      'APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS',
      extractForeachLiteralArray(BOOTSTRAP_SQL_PATH, 'append_only_table_name'),
      APP_ROLE_TABLE_PRIVILEGE_EXPECTATION_TABLE_NAMES,
    )
  })

  it('sql/rollback-audit-append-only.sql FOREACH dizisi APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS ile BİREBİR aynı kümedir', () => {
    expectForeachArrayMatchesDeclaredSet(
      'sql/rollback-audit-append-only.sql (FOREACH append_only_table_name IN ARRAY ...)',
      'APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS',
      extractForeachLiteralArray(ROLLBACK_SQL_PATH, 'append_only_table_name'),
      APP_ROLE_TABLE_PRIVILEGE_EXPECTATION_TABLE_NAMES,
    )
  })

  // DÜZELTME (FIX turu 1, `solid` [low] bulgusu — yol üstünde kapatıldı):
  // eski üçüncü `it` ("TAM 1 kez geçer") TOTOLOJİKTİ — yukarıdaki iki `it`
  // ZATEN `extractForeachLiteralArray`'i çağırıyor; fırlatmadan tamamlanmaları
  // (yani >1 eşleşme OLMADIĞI) o iki testin KENDİSİ tarafından zaten ispatlı.
  // Ayrı bir `.not.toThrow()` testi hiçbir EK garanti eklemiyordu.

  it('her iki SQL dosyasının DO gövdesi IF EXISTS + pg_tables koruması taşır', () => {
    expectDoBodyHasIfExistsGuard(BOOTSTRAP_SQL_PATH)
    expectDoBodyHasIfExistsGuard(ROLLBACK_SQL_PATH)
  })

  // FIX turu 2 (M2, `solid` [medium] bulgusu — "kapatılan high'ın mekanik
  // bekçisi yok"): yukarıdaki testler yalnızca TABLO ADLARINI (FOREACH
  // dizisi) ve IF EXISTS korumasını okur — FİİL LİSTESİNİ (REVOKE/GRANT'in
  // HANGİ yetkileri taşıdığını) HİÇ okumuyordu. AC-15 testi
  // (`rollback-audit-append-only.isolation.test.ts`) bu semantiği DB'ye karşı
  // DOĞRULAR ama SQL dosyasını KOŞTURMAZ — bu dosyadaki iki `it` ise SQL
  // METNİNİ koşturmadan, STATİK olarak pinler; ikisi BİRLİKTE "dosyaya
  // sessizce bir fiil eklenirse/çıkarılırsa HİÇBİR test kırılmaz" boşluğunu
  // kapatır.
  it('sql/bootstrap-roles.sql §9 REVOKE fiil listesi TAM OLARAK "UPDATE, DELETE, TRUNCATE"tır (üç fiil, pinli)', () => {
    const verbs = extractExactlyOneQuotedVerbList(BOOTSTRAP_SQL_PATH, 'REVOKE', 'FROM')
    expect(verbs).toEqual(['UPDATE', 'DELETE', 'TRUNCATE'])
  })

  it('sql/rollback-audit-append-only.sql GRANT fiil listesi TAM OLARAK "UPDATE, DELETE"tir — TRUNCATE jetonu YOK (pinli)', () => {
    const verbs = extractExactlyOneQuotedVerbList(ROLLBACK_SQL_PATH, 'GRANT', 'TO')
    expect(verbs).toEqual(['UPDATE', 'DELETE'])
    // Anti-vacuity: `toEqual` zaten fazlalığı yakalar ama TRUNCATE'in NEDEN
    // burada OLMAMASI gerektiğini (rollback-audit-append-only.sql:51-67'nin
    // FIX turu 1 H1/F1 düzeltmesi — TRUNCATE hiçbir zaman verilmediği için
    // geri VERİLMEZ) adlandırarak tekrar eder.
    expect(verbs).not.toContain('TRUNCATE')
  })
})
