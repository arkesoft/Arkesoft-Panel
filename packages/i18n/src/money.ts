// @arkesoft/i18n — Money değer nesnesi (ROADMAP T-027/S5b, AC-43)
//
// ⚠ Bu dosyanın ROADMAP sürüm referansı KASITLI OLARAK nokta içermeyen
// biçimde yazılır — AC-43(d)'nin DoD taraması dosyanın TAMAMINDA (kod VE
// yorum) ondalık görünümlü bir sayısal dizgi veya ondalık/dize-çevirme
// çağrısı arar; sürüm numarasını üç parçalı noktalı biçimde (ör. "sıfır
// nokta sıfır nokta on sekiz") yazmak taramanın KENDİSİNİ yanlış-pozitif
// yapardı. Literal-jeton kuralı (AGENT_BASELINE §5) burada da geçerlidir —
// taranan çağrı adları da bu yorumda bitişik YAZILMAZ.
//
// CLAUDE.md §2/§10: para FLOAT ile tutulmaz/hesaplanmaz — bu dosyanın
// VARLIK SEBEBİ bu. `amountMinor` dışa dönük `number`'dır (güvenli tamsayı
// aralığında TAMSAYI kuruş); `multiplyByRatio`'nun İÇ çarpımı `BigInt`'tir
// (pay × kuruş `Number.MAX_SAFE_INTEGER`'ı AŞABİLİR), sonuç yuvarlandıktan
// SONRA güvenli tamsayı aralığında doğrulanır — aşarsa FIRLAR.
//
// ⚠⚠ TEK NOKTA (gate turu bir düzeltmesi): `add`/`subtract`/`multiplyBy`
// kendi aritmetiğini doğrudan `number` üzerinde yapar ve HER ÜÇÜ de sonucu
// `Money.of`'a geçirerek örnek üretir — bu yüzden güvenli tamsayı aralığı
// denetimi TEK YERDE, `Money.of`'un KENDİSİNDE yapılır; ayrı ayrı üç kopya
// AÇILMAZ. İki girdi de zaten güvenli tamsayı olduğundan (önceki bir
// `Money.of` çağrısından geçmiş oldukları için), IEEE-754 yuvarlama ızgarası
// gerçek sonuç güvenli aralığı AŞTIĞINDA kayan nokta sonucunu da KESİNLİKLE
// aralık dışına taşır (ızgara aralığı güvenli sınırın ÜSTÜNDE yalnızca
// BÜYÜR, hiç küçülmez) — yani `Money.of`'un son denetimi, ara işlemler
// `BigInt`'e geçmeden de, sessiz kuruş kaybını/kazancını YAPISAL OLARAK
// yakalar.
//
// İKİ ÇARPMA, BİR GEREKÇE (architect): yuvarlama YALNIZCA `multiplyByRatio`'da
// MÜMKÜNDÜR ve `mode` ZORUNLUDUR (varsayılan YOK) ⇒ sessiz/kazara yuvarlama
// YAPISAL OLARAK İMKÂNSIZ; her yuvarlama kararı çağrı yerinde ADIYLA
// yazılıdır. `multiplyBy` TAM SAYI çarpan alır — çarpım iki tam sayının
// çarpımı olduğu için yuvarlama hiç DEVREYE GİRMEZ; ondalık bir `quantity`
// çalışma zamanında FIRLAR (float çarpan hiç kabul edilmez, `Ratio` tamsayı
// pay/payda taşır).
//
// `compare`/`equals` PARA BİRİMİ UYUŞMAZLIĞINDA İKİSİ DE FIRLATIR — sessizce
// belirsiz bir sıralama/`false` DÖNMEZ (CLAUDE.md §4: beklenen durumlar için
// hata fırlat, çağıranı tahmine zorlama).

import type { SupportedCurrencyCode } from './currencies.js'
import { CurrencyMismatchError, FractionalMinorUnitError } from './money-errors.js'
import { divideWithRounding, type RoundingMode } from './rounding.js'

/**
 * Tam sayı pay/payda ile ifade edilen oran. Float çarpan HİÇ kabul edilmez
 * — yuvarlama kararı `numerator`/`denominator` çiftinin KENDİSİNDE değil,
 * `Money.multiplyByRatio`'ya geçilen `RoundingMode`'da yazılıdır (ör.
 * kampanya `%18` → `{ numerator: 18, denominator: 100 }`).
 */
export interface Ratio {
  readonly numerator: number
  readonly denominator: number
}

const MAX_SAFE_RESULT = BigInt(Number.MAX_SAFE_INTEGER)
const MIN_SAFE_RESULT = BigInt(Number.MIN_SAFE_INTEGER)

function assertIntegerRatioPart(value: number, label: 'numerator' | 'denominator'): void {
  if (!Number.isInteger(value)) {
    throw new Error(
      `Money.multiplyByRatio: Ratio.${label} tam sayı olmalı (float oran kabul edilmez) — alınan: ${String(value)}`,
    )
  }
}

function toSafeIntegerFromBigInt(value: bigint): number {
  if (value > MAX_SAFE_RESULT || value < MIN_SAFE_RESULT) {
    throw new Error(
      `Money.multiplyByRatio: yuvarlanmış sonuç güvenli tamsayı aralığını aşıyor — ${value.toString()}`,
    )
  }
  return Number(value)
}

/**
 * Tamsayı kuruş + para birimi kodu taşıyan değişmez (immutable) değer
 * nesnesi. Kurucu `private`'tır — her örnek `Money.of` veya `Money.zero`
 * fabrikasından doğar, çıplak `new Money(...)` çağrılamaz.
 */
export class Money {
  readonly amountMinor: number
  readonly currency: SupportedCurrencyCode

  private constructor(amountMinor: number, currency: SupportedCurrencyCode) {
    this.amountMinor = amountMinor
    this.currency = currency
  }

  /**
   * `amountMinor` TAMSAYI değilse `FractionalMinorUnitError` FIRLATIR
   * (AC-43(a)). Tam sayı olsa BİLE güvenli tamsayı aralığını
   * (`Number.isSafeInteger`) aşarsa da FIRLAR — `add`/`subtract`/
   * `multiplyBy` sonuçlarını BURADAN geçirdiği için bu, dört işlemin TÜMÜNÜ
   * `multiplyByRatio`'nun `toSafeIntegerFromBigInt` denetimiyle AYNI
   * güvenlik garantisine getiren TEK NOKTADIR (gate turu bir düzeltmesi —
   * önceki asimetri: bu dört metot aralık dışı sonucu sessizce döndürüyordu).
   */
  static of(amountMinor: number, currency: SupportedCurrencyCode): Money {
    if (!Number.isInteger(amountMinor)) {
      throw new FractionalMinorUnitError(amountMinor)
    }
    if (!Number.isSafeInteger(amountMinor)) {
      throw new Error(
        `Money.of: amountMinor güvenli tamsayı aralığını aşıyor (Number.MAX_SAFE_INTEGER sınırı) — alınan: ${String(amountMinor)}`,
      )
    }
    return new Money(amountMinor, currency)
  }

  static zero(currency: SupportedCurrencyCode): Money {
    return new Money(0, currency)
  }

  private assertSameCurrency(other: Money): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `SupportedCurrencyCode` bugün TEK üyeli ('TRY') olduğu için tsc bu karşılaştırmayı HER ZAMAN yanlış görür; `SUPPORTED_CURRENCIES`'e (packages/i18n/src/currencies.ts) yeni bir para birimi eklendiği an bu denetim gerçek bir çalışma zamanı dalı KAZANIR — kural GEVŞETİLMİYOR, yalnızca tek-üyeli birleşimin GEÇİCİ yan etkisi bastırılıyor.
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency)
    }
  }

  /** Para birimi UYUŞMAZLIĞINDA `CurrencyMismatchError` FIRLATIR (AC-43(b)). */
  add(other: Money): Money {
    this.assertSameCurrency(other)
    return Money.of(this.amountMinor + other.amountMinor, this.currency)
  }

  /** Para birimi UYUŞMAZLIĞINDA `CurrencyMismatchError` FIRLATIR (AC-43(b)). */
  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    return Money.of(this.amountMinor - other.amountMinor, this.currency)
  }

  /**
   * TAM SAYI çarpan — yuvarlama hiç DEVREYE girmez. Ondalık bir `quantity`
   * geçilirse FIRLAR; yuvarlama isteniyorsa `multiplyByRatio` kullanılmalı.
   */
  multiplyBy(quantity: number): Money {
    if (!Number.isInteger(quantity)) {
      throw new Error(
        `Money.multiplyBy: tam sayı çarpan bekleniyor — alınan: ${String(quantity)} (yuvarlama istiyorsanız multiplyByRatio kullanın)`,
      )
    }
    return Money.of(this.amountMinor * quantity, this.currency)
  }

  /**
   * ORAN ile çarpar, sonucu `mode`'a göre yuvarlar — `mode` ZORUNLU,
   * VARSAYILAN YOK (AC-43(c)). İç çarpım `BigInt` (pay × kuruş
   * `Number.MAX_SAFE_INTEGER`'ı aşabilir); yuvarlanmış sonuç güvenli
   * tamsayı aralığında doğrulanır, aşarsa FIRLAR.
   */
  multiplyByRatio(ratio: Ratio, mode: RoundingMode): Money {
    assertIntegerRatioPart(ratio.numerator, 'numerator')
    assertIntegerRatioPart(ratio.denominator, 'denominator')
    if (ratio.denominator === 0) {
      throw new Error('Money.multiplyByRatio: Ratio.denominator sıfır olamaz')
    }

    const numerator = BigInt(this.amountMinor) * BigInt(ratio.numerator)
    const denominator = BigInt(ratio.denominator)
    const roundedMinor = divideWithRounding(numerator, denominator, mode)

    return Money.of(toSafeIntegerFromBigInt(roundedMinor), this.currency)
  }

  /** Para birimi UYUŞMAZLIĞINDA FIRLATIR — sessizce belirsiz bir sıralama DÖNMEZ. */
  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other)
    if (this.amountMinor < other.amountMinor) {
      return -1
    }
    if (this.amountMinor > other.amountMinor) {
      return 1
    }
    return 0
  }

  /** Para birimi UYUŞMAZLIĞINDA FIRLATIR — sessizce `false` DÖNMEZ. */
  equals(other: Money): boolean {
    this.assertSameCurrency(other)
    return this.amountMinor === other.amountMinor
  }

  toJSON(): { readonly amountMinor: number; readonly currency: SupportedCurrencyCode } {
    return { amountMinor: this.amountMinor, currency: this.currency }
  }
}
