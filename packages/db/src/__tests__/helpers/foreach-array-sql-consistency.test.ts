// @arkesoft/db — `expectForeachArrayMatchesDeclaredSet` meta-testi
// (ROADMAP v0.0.20.2, T-023 FIX turu 2 — `security`'nin [low] bulgusu).
//
// GEREKÇE: `append-only-tables-sql-consistency.test.ts` (2 çağrı) ve
// `auth-secret-tables-sql-consistency.test.ts` (2 çağrı) — TOPLAM DÖRT yer —
// bu paylaşılan yardımcıyı ÇAĞIRIR ama HİÇBİRİ yardımcının KENDİSİNİ test
// ETMİYORDU. `security`'nin canlı mutasyonla ölçtüğü vaka: fonksiyonun
// GÖVDESİNE üç satırlık bir "erken `return`" eklendiğinde dört çağıran test
// de DEĞİŞMEDEN YEŞİL kaldı — `eslint` VE `tsc` İKİSİ DE sessiz (fonksiyon
// imzası/dönüş tipi değişmedi, yalnızca gövde içi bir kontrol akışı
// kısaltması). Hiçbir çağıran test "bu fonksiyon UYUŞMAZLIK durumunda
// GERÇEKTEN fırlatıyor mu" sorusunu sormuyordu — yalnızca "çağrı fırlamadı"
// (dolaylı, pozitif) sinyaline güveniyordu.
//
// Bu dosya o boşluğu kapatır: yardımcıyı doğrudan, KASITLI olarak UYUŞMAYAN
// iki küme ile çağırır ve fırlamasını (`.toThrow()`) assert eder — "erken
// return" sınıfındaki HER mutasyon (fonksiyonun gövdesi hiçbir `expect`'e
// ulaşmadan dönerse) bu testleri KIRMIZI yapmak ZORUNDADIR.

import { describe, expect, it } from 'vitest'

import { expectForeachArrayMatchesDeclaredSet } from './foreach-array-sql-consistency.js'

describe('expectForeachArrayMatchesDeclaredSet — meta-test (yardımcının KENDİSİ test ediliyor)', () => {
  it('SQL dizisinde beyanda OLMAYAN FAZLA bir tablo varsa fırlar', () => {
    expect(() => {
      expectForeachArrayMatchesDeclaredSet('etiket', 'BEYAN', ['a', 'b'], ['a'])
    }).toThrow()
  })

  it("SQL dizisinde beyanda OLAN ama SQL'de EKSİK bir tablo varsa fırlar", () => {
    expect(() => {
      expectForeachArrayMatchesDeclaredSet('etiket', 'BEYAN', ['a'], ['a', 'b'])
    }).toThrow()
  })

  it('SQL dizisi tamamen BOŞ döndüyse (ayrıştırma bozulmuş olabilir) fırlar — anti-vacuity', () => {
    expect(() => {
      expectForeachArrayMatchesDeclaredSet('etiket', 'BEYAN', [], ['a'])
    }).toThrow()
  })

  // DÜZELTME (T-023 SON TEMİZLİK, `security` tur 3 [⚠ ölçülmüş boşluk]
  // bulgusu): yukarıdaki ÜÇ negatif vaka (2v1, 1v2, 0v1) TAMAMI uzunluğu
  // FARKLI diziler kullanıyordu — "uzunluk eşitliği kısayolu" sınıfındaki
  // fail-open mutasyon (gövdeye `if (sqlTables.length ===
  // declaredTableNames.length) { return }` eklenmesi) bu meta-testten
  // KAÇIYORDU: SQL ve TS listeleri AYNI SAYIDA ama FARKLI içerikte olduğunda
  // (örn. bir tablo adında yazım hatası) sürüklenme sessizce geçerdi. Bu
  // vaka AYNI uzunluk / FARKLI içerik ile fırlamayı doğrudan sınar.
  it('SQL ve BEYAN dizileri AYNI UZUNLUKTA ama FARKLI içerikteyse fırlar — uzunluk kısayolu karşıtı', () => {
    expect(() => {
      expectForeachArrayMatchesDeclaredSet('etiket', 'BEYAN', ['a', 'b'], ['a', 'c'])
    }).toThrow()
  })

  // Pozitif kontrol (sıra ÖNEMSİZ) — yanlış pozitif ÜRETMEDİĞİNİN kanıtı:
  // bu testin YOKLUĞUNDA yukarıdaki üç test "her zaman fırlayan" bozuk bir
  // implementasyonla da (örn. gövde her çağrıda koşulsuz fırlıyorsa) YEŞİL
  // kalırdı.
  it('kümeler BİREBİR aynıysa (sıra farklı olsa da) FIRLAMAZ', () => {
    expect(() => {
      expectForeachArrayMatchesDeclaredSet('etiket', 'BEYAN', ['a', 'b'], ['b', 'a'])
    }).not.toThrow()
  })
})
