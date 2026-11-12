// @arkesoft/theme-sdk — `sdkRange` biçim grameri ile `@arkesoft/versioning`'in
// aralık ayrıştırıcısının DAVRANIŞSAL eşdeğerlik testi (ROADMAP v0.0.21,
// T-018/S3, ADR-0020 Karar 2/B)
//
// ⚠ NEDEN BU TEST BURADA (`packages/versioning`'de DEĞİL) — desen
// (`THEME_SDK_RANGE_FORMAT_PATTERN`) `manifest/manifest.ts`'te, yani
// theme-sdk'da yaşıyor; `packages/versioning` theme-sdk'ya bağımlı OLAMAZ
// (TERS bağımlılık doğardı, ADR-0020 Karar 2'nin katman gerekçesi). KARAR
// 2/B zaten bu kenarı (theme-sdk → versioning) AÇTIĞI için test SAHİP OLAN
// TARAFA (theme-sdk) düşer.
//
// ⚠ NE KANITLAR — bu test, `manifest.ts`'in `sdkRange` BİÇİM denetiminin
// (`THEME_SDK_RANGE_FORMAT_PATTERN`, yalnızca BİÇİM) ve `@arkesoft/
// versioning`'in `parseRange`'inin (BİÇİM + semantik ayrıştırma) AYNI
// girdi kümesinde AYNI kabul/red sonucunu ürettiğini doğrular. İkisi de
// AYNI çekirdek kaynaktan (`SEMVER_CORE_PATTERN_SOURCE`) ve AYNI operatör
// kümesinden (`^ ~ >= <= > < =`) beslendiği için eşdeğerlik BEKLENİR —
// architect'in ölçtüğü "gerçek zarar" (iki desenin AYRIŞMASI, `"1.0.0-01"`
// sınıfı) burada davranışsal olarak KAPIYA bağlanır: desenler ileride
// bağımsız evrilirse (ör. biri operatör kümesini genişletir, diğeri
// genişletmez) bu test KIRMIZIYA döner.
//
// ⚠ NE KANITLAMAZ — bu test iki implementasyonun "doğru" olduğunu
// KANITLAMAZ, yalnızca birbirleriyle TUTARLI olduklarını kanıtlar. Biçimin
// semver.org'a UYUMLULUĞU `@arkesoft/versioning`'in kendi birim testlerinin
// (`range.test.ts`, `semver.test.ts`) işidir — tekrarlanmaz.
//
// ⚠ AC-8'in "tanım sayısı 1" iddiası için MEKANİK bir kapı BURADA
// İCAT EDİLMEDİ (R-PO2, po'nun dürüstlük notu) — `rg` ile kendi jetonunu
// arayan naif bir test, `AGENT_BASELINE §5`'in literal-jeton kuralı
// gereği kendi metninde o jetonu bitişik yazamayacağı için kendini
// YAKALARDI (kalıcı yanlış pozitif). Bu dosya onun yerine DAVRANIŞSAL bir
// kapı sağlar; `rg` ham çıktısı handoff paketinde bir denetim kaydı olarak
// (test DEĞİL) taşınır.

import { parseRange } from '@arkesoft/versioning'
import { describe, expect, it } from 'vitest'

import { THEME_SDK_RANGE_FORMAT_PATTERN } from '../manifest/manifest.js'

/**
 * Zorunlu girdi kümesi (po'nun handoff'unda birebir belirtildi):
 * - İlk ikisi B4 sapma sınıfı (`"1.0.0-01"` türü) — platformun grameri bu
 *   sınıfı YAPISAL OLARAK reddeder, iki taraf da REDDETMELİDİR.
 * - Sonraki ikisi geçerli, günlük kullanımdaki `sdkRange` biçimleri — iki
 *   taraf da KABUL ETMELİDİR.
 * - Son üçü gramerin YAPISAL OLARAK reddettiği biçimler (`||` ayrık
 *   birleşim, `x`/`*` joker, tire aralığı) — iki taraf da REDDETMELİDİR.
 */
const RANGE_GRAMMAR_FIXTURES: readonly {
  readonly input: string
  readonly expectedAccepted: boolean
}[] = [
  { input: '1.0.0-01', expectedAccepted: false },
  { input: '1.0.0-alpha.01', expectedAccepted: false },
  { input: '^0.1.0', expectedAccepted: true },
  { input: '>=0.1.0 <1.0.0', expectedAccepted: true },
  { input: '1.2.3 || 2.0.0', expectedAccepted: false },
  { input: '1.x', expectedAccepted: false },
  { input: '1.0.0 - 2.0.0', expectedAccepted: false },
]

describe('sdkRange grameri ⟺ @arkesoft/versioning parseRange — davranışsal eşdeğerlik (ADR-0020 Karar 2/B)', () => {
  it.each(RANGE_GRAMMAR_FIXTURES)(
    '"$input" → THEME_SDK_RANGE_FORMAT_PATTERN ve parseRange AYNI sonucu verir (beklenen kabul: $expectedAccepted)',
    ({ input, expectedAccepted }) => {
      const patternAccepts = THEME_SDK_RANGE_FORMAT_PATTERN.test(input)
      const parseRangeAccepts = parseRange(input) !== undefined

      // (1) Eşdeğerlik — iki taraf ANLAŞMALI (bu testin asıl iddiası, dosya
      // başı yorumu). Desenler bağımsız evrilirse bu satır KIRMIZIYA döner.
      expect(patternAccepts).toBe(parseRangeAccepts)

      // (2) Beklenen sonuç — eşdeğerlik tek başına yeterli bir kapı
      // DEĞİLDİR (iki implementasyon da AYNI YANLIŞ sonuca anlaşabilir);
      // bu satır her girdinin BEKLENEN kabul/red yönünü de pinler.
      expect(patternAccepts).toBe(expectedAccepted)
    },
  )
})
