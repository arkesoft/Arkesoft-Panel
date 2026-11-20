// @arkesoft/i18n — sayı biçimlendirici (ROADMAP v0.0.18, T-027/S5a,
// AC-50'nin yarısı)
//
// `Intl.NumberFormat` YERLEŞİKTİR (yeni bağımlılık DEĞİL). ⚠ Bu modül PARA
// biçimlendirmesi DEĞİLDİR — `formatMoney` (S5b, `packages/i18n/src/
// format-money.ts`) kuruş tamsayısını ve para birimi kodunu bilerek
// çalışır; bu fonksiyon jenerik bir `number` alır, para birimi kavramı
// YOKTUR (AC-47'nin float-para ESLint seçicilerini tetikleyecek
// `price`/`amount`/`total` gibi parametre adları KASITLI OLARAK
// kullanılmadı).

import { DEFAULT_LOCALE, type Locale } from './locale.js'

export interface FormatNumberOptions {
  readonly locale?: Locale
  readonly minimumFractionDigits?: number
  readonly maximumFractionDigits?: number
}

/** `value`'yu `Intl.NumberFormat` üzerinden biçimler — varsayılan locale `tr-TR`. */
export function formatNumber(value: number, options: FormatNumberOptions = {}): string {
  const { locale = DEFAULT_LOCALE, ...numberFormatOptions } = options

  return new Intl.NumberFormat(locale, numberFormatOptions).format(value)
}
