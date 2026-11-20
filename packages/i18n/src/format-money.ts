// @arkesoft/i18n — para biçimlendirici (ROADMAP v0.0.18, T-027/S5b, AC-50'nin
// yarısı)
//
// `Intl.NumberFormat(locale, { style: 'currency', ... })` YERLEŞİKTİR (yeni
// bağımlılık DEĞİL, M14/mimari karar). Bu dosya SUNUM/GÖRÜNTÜLEME
// sınırındadır — `Money`'nin kendisi (`money.ts`) hiçbir float ARİTMETİĞİ
// içermez (CLAUDE.md §2/§10, AC-43(d)); burada yapılan bölme İŞLEMİ
// yalnızca `Intl.NumberFormat`'a vermek için kuruşu ana birime çevirir,
// sonucu GERİ bir `Money`'e YAZMAZ/saklamaz/hesaplamaz — tek tüketicisi
// `Intl.NumberFormat.format()`'ın ürettiği GÖSTERİM dizesidir. Ondalık
// basamak sayısı `getMinorUnit` üzerinden para biriminin KENDİSİNDEN gelir
// (TRY → 2) — sabit `2` varsayılmaz.

import { getMinorUnit } from './currencies.js'
import { DEFAULT_LOCALE, type Locale } from './locale.js'
import type { Money } from './money.js'

export interface FormatMoneyOptions {
  readonly locale?: Locale
}

/** `money`'yi `Intl.NumberFormat` üzerinden para birimi biçiminde dizeye çevirir — varsayılan locale `tr-TR`. */
export function formatMoney(money: Money, options: FormatMoneyOptions = {}): string {
  const { locale = DEFAULT_LOCALE } = options
  const minorUnit = getMinorUnit(money.currency)
  const majorUnitDisplayValue = money.amountMinor / 10 ** minorUnit

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: minorUnit,
    maximumFractionDigits: minorUnit,
  }).format(majorUnitDisplayValue)
}
