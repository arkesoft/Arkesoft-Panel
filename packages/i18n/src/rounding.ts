// @arkesoft/i18n — yuvarlama modları (ROADMAP v0.0.18, T-027/S5b, AC-43(c))
//
// İki mod, architect kararı (A-T27-3): `half-up` (yarım nokta SIFIRDAN
// UZAĞA yuvarlanır — negatifte de) ve `half-even` (bankacı yuvarlaması:
// yarım nokta en yakın ÇİFT tam sayıya yuvarlanır). Bu modüle `money.ts`
// DIŞINDA erişen yok — yuvarlama yalnızca `Money.multiplyByRatio`'da,
// `mode` ZORUNLU parametresiyle, mümkündür; sessiz/kazara yuvarlama
// YAPISAL OLARAK İMKÂNSIZDIR.
//
// İç aritmetik `BigInt`'tir (pay × kuruş `Number.MAX_SAFE_INTEGER`'ı
// aşabilir); bu dosya SAF BigInt bölme + yuvarlama uygular — güvenli
// tamsayı doğrulaması ÇAĞIRANDA (`money.ts`) yapılır, burada değil.

export type RoundingMode = 'half-up' | 'half-even'

/**
 * EXHAUSTIVE `switch`'in `default` dalında çağrılır — `RoundingMode`'a
 * yeni bir üye eklenip bir dal UNUTULURSA `mode`'un tipi `never` OLMAZ ve
 * `pnpm typecheck` KIRILIR (precedent: `packages/theme-sdk/src/assert-never.ts`).
 * Paylaşılan bir pakete terfi BİLİNÇLİ OLARAK yapılmadı — platformda zaten
 * beşten fazla paket-yerel kopya var, bu altıncısı aynı idiomu izler.
 */
function assertNeverRoundingMode(mode: never): never {
  throw new Error(`rounding.ts: beklenmeyen yuvarlama modu — ${JSON.stringify(mode)}`)
}

/**
 * `numerator / denominator`'ı `mode`'a göre en yakın tam sayıya yuvarlar.
 * İkisi de `BigInt`; `denominator` sıfır OLAMAZ (çağıran, `money.ts`,
 * bunu zaten önceden doğrular — burada da savunma amaçlı tekrar edilir).
 * Sonucun işaretini `numerator`/`denominator`'ın işaretlerinin XOR'u
 * belirler; yuvarlama mutlak değer üzerinde hesaplanır, işaret sonda
 * uygulanır (negatif tarafta `half-up`'ın "sıfırdan uzağa" davranışının
 * doğru çalışması için).
 */
export function divideWithRounding(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode,
): bigint {
  if (denominator === 0n) {
    throw new Error('rounding.ts: denominator (payda) sıfır olamaz')
  }

  const isResultNegative = numerator < 0n !== denominator < 0n
  const absNumerator = numerator < 0n ? -numerator : numerator
  const absDenominator = denominator < 0n ? -denominator : denominator

  const truncatedQuotient = absNumerator / absDenominator
  const remainder = absNumerator % absDenominator
  const doubledRemainder = remainder * 2n

  let roundedAbsQuotient: bigint

  if (doubledRemainder < absDenominator) {
    roundedAbsQuotient = truncatedQuotient
  } else if (doubledRemainder > absDenominator) {
    roundedAbsQuotient = truncatedQuotient + 1n
  } else {
    // Tam yarım nokta — mod burada devreye girer.
    switch (mode) {
      case 'half-up':
        roundedAbsQuotient = truncatedQuotient + 1n
        break
      case 'half-even':
        roundedAbsQuotient =
          truncatedQuotient % 2n === 0n ? truncatedQuotient : truncatedQuotient + 1n
        break
      default:
        return assertNeverRoundingMode(mode)
    }
  }

  return isResultNegative ? -roundedAbsQuotient : roundedAbsQuotient
}
