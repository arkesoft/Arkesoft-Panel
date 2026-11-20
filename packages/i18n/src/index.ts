// @arkesoft/i18n — tek giriş noktası.
//
// S5a (katalog + çözümleyici yarısı, ROADMAP v0.0.18, T-027) burayı
// DOLDURDU. S5b (`Money` yarısı) buraya `money.ts`/`currencies.ts`/
// `rounding.ts`/`format-money.ts`'in export'larını TOPLAMSAL olarak
// EKLEYECEK — aşağıdaki satırlar DEĞİŞMEYECEK. Tüketiciler iç dosya yoluna
// girmez, her şey buradan ithal edilir.

export { DEFAULT_LOCALE, localeSchema } from './locale.js'
export type { Locale } from './locale.js'

export type { CatalogBundle, MessageCatalog } from './catalog-types.js'

export { diffCatalogAgainstKeys } from './catalog-diff.js'
export type { CatalogDiffResult } from './catalog-diff.js'

export { formatMessage } from './interpolate.js'

export { createMessageResolver } from './message-resolver.js'
export type { MessageResolver } from './message-resolver.js'

export { TR_TR_ERROR_MESSAGES } from './tr-tr-errors.js'

export { formatDate } from './format-date.js'
export type { FormatDateOptions } from './format-date.js'

export { formatNumber } from './format-number.js'
export type { FormatNumberOptions } from './format-number.js'

// S5b BURAYA EKLEYECEK (money.ts / currencies.ts / rounding.ts /
// format-money.ts export'ları) — toplamsal, yukarısı dokunulmaz.

export { getMinorUnit, SUPPORTED_CURRENCIES, supportedCurrencyCodeSchema } from './currencies.js'
export type { SupportedCurrency, SupportedCurrencyCode } from './currencies.js'

export { divideWithRounding } from './rounding.js'
export type { RoundingMode } from './rounding.js'

export { CurrencyMismatchError, FractionalMinorUnitError } from './money-errors.js'

export { Money } from './money.js'
export type { Ratio } from './money.js'

export { formatMoney } from './format-money.js'
export type { FormatMoneyOptions } from './format-money.js'
