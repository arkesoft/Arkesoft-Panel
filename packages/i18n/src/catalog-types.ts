// @arkesoft/i18n — katalog tipleri (ROADMAP v0.0.18, T-027/S5a)
//
// `MessageCatalog`, 35 anahtarlık KAPALI kümenin (`ErrorMessageKey`,
// `@arkesoft/errors`) TAM eşlemesidir — bu tipi sağlayan bir nesnede
// (bkz. `tr-tr-errors.ts`, `satisfies Record<ErrorMessageKey, string>`)
// eksik VEYA fazla anahtar `tsc --noEmit`'i kırar; `Record<ErrorMessageKey,
// string>` sonlu bir birleşimin eşlemesidir, `{[key: string]: string}`
// İNDEKS İMZASI DEĞİLDİR — bu yüzden bu tipten bir değeri bilinen bir
// `ErrorMessageKey` ile indekslemek `noUncheckedIndexedAccess` altında da
// her zaman `string` döner (`| undefined` EKLENMEZ).
//
// `CatalogBundle<L>` locale → katalog eşlemesidir ve KISMİDİR (`Partial`) —
// her locale'in bir kataloğu OLMAK ZORUNDA DEĞİLDİR. `createMessageResolver`
// (`message-resolver.ts`) bundle'da karşılığı olmayan bir locale'i
// varsayılana GERİ DÜŞÜRÜR (AC-44) — bu, `en-US` içeriği olmadan formatın
// locale'de JENERİK kalabilmesinin (R1) yapısal temelidir.

import type { ErrorMessageKey } from '@arkesoft/errors'

export type MessageCatalog = Readonly<Record<ErrorMessageKey, string>>

export type CatalogBundle<L extends string> = Readonly<Partial<Record<L, MessageCatalog>>>
